import crypto from 'crypto';

/**
 * Enterprise Server-Side Event Bus for Valor Real-Time Portal
 * 
 * Envelope specification:
 * {
 *   id: string,       // Monotonic, sortable ID (e.g. 1762000000000-0000001)
 *   type: string,     // Event type (e.g. 'request.logged', 'alert.triggered')
 *   ts: string,       // ISO-8601 UTC timestamp
 *   actor: string,    // Originating actor ('system', 'admin:alice', 'client:<ip>', 'external:trakt')
 *   subject: string,  // Target subject identifier (e.g. 'ip:192.168.1.1', 'session:sess_123', 'rule:cpu_high')
 *   data: object,     // Detailed event payload
 *   v: 1              // Schema version
 * }
 */
export class EventBus {
  constructor(options = {}) {
    this.ringBufferMaxAgeMs = options.ringBufferMaxAgeMs || 10 * 60 * 1000; // 10 minutes ring buffer
    this.ringBufferMaxSize = options.ringBufferMaxSize || 10000;
    this.ringBuffer = []; // Sorted chronologically

    this.seq = 0;
    this.lastTs = 0;
    this.subscribers = new Set(); // SSE / WS client handles

    // Batching buffer for high-volume events (250ms frames)
    this.batchIntervalMs = 250;
    this.pendingBatch = [];
    this.batchTimer = null;

    // Rate tracking and backpressure
    this.rateWindowStart = Date.now();
    this.eventsInWindow = 0;
    this.maxRatePerSec = options.maxRatePerSec || 500;
    this.currentSamplingRatio = 1; // 1 = 100%, 2 = 50%, etc.

    // Topic map cache
    this.typeToTopics = {
      'request.logged': ['traffic'],
      'traffic.logged': ['traffic'],
      'visitor.seen': ['visitors'],
      'device.updated': ['visitors'],
      'session.opened': ['sessions'],
      'session.closed': ['sessions'],
      'session.message': ['sessions'],
      'playback.started': ['playback', 'sessions'],
      'playback.stopped': ['playback', 'sessions'],
      'playback.buffering': ['playback'],
      'playback.quality': ['playback'],
      'error.logged': ['alerts', 'traffic'],
      'thirdparty.call': ['infra', 'traffic'],
      'account.created': ['security'],
      'account.updated': ['security'],
      'account.deleted': ['security'],
      'ip.blocked': ['security', 'alerts'],
      'ip.unblocked': ['security'],
      'config.changed': ['infra', 'security'],
      'alert.triggered': ['alerts'],
      'alert.acknowledged': ['alerts'],
      'alert.snoozed': ['alerts'],
      'webhook.delivery': ['webhooks'],
      'webhook.endpoint_status': ['webhooks', 'alerts'],
      'infra.metric': ['infra'],
      'maintenance.changed': ['infra', 'security'],
      'announcement.updated': ['infra']
    };

    this.startBatchLoop();
    this.startHeartbeatLoop();
  }

  /**
   * Generates monotonic, sortable event ID
   */
  generateMonotonicId() {
    const now = Date.now();
    if (now > this.lastTs) {
      this.lastTs = now;
      this.seq = 0;
    } else {
      this.seq += 1;
    }
    const seqStr = String(this.seq).padStart(6, '0');
    return `${this.lastTs}-${seqStr}`;
  }

  /**
   * Map event type to subscription topics
   */
  getTopicsForType(type) {
    if (this.typeToTopics[type]) return this.typeToTopics[type];
    const prefix = type.split('.')[0];
    if (prefix === 'traffic' || prefix === 'request') return ['traffic'];
    if (prefix === 'visitor' || prefix === 'device') return ['visitors'];
    if (prefix === 'session') return ['sessions'];
    if (prefix === 'playback') return ['playback'];
    if (prefix === 'alert' || prefix === 'error') return ['alerts'];
    if (prefix === 'infra' || prefix === 'thirdparty') return ['infra'];
    if (prefix === 'security' || prefix === 'ip' || prefix === 'account') return ['security'];
    if (prefix === 'webhook') return ['webhooks'];
    return ['general'];
  }

  /**
   * Publish an event into the bus
   */
  publish({ type, actor = 'system', subject = 'system', data = {}, ts = null }) {
    // Rate check & sampling
    const now = Date.now();
    if (now - this.rateWindowStart >= 1000) {
      const rate = this.eventsInWindow;
      this.eventsInWindow = 0;
      this.rateWindowStart = now;
      if (rate > this.maxRatePerSec) {
        this.currentSamplingRatio = Math.ceil(rate / this.maxRatePerSec);
      } else {
        this.currentSamplingRatio = 1;
      }
    }
    this.eventsInWindow++;

    // High volume traffic sampling when saturated
    const isHighVolume = type === 'request.logged' || type === 'traffic.logged';
    if (isHighVolume && this.currentSamplingRatio > 1) {
      if (Math.random() > 1 / this.currentSamplingRatio) {
        return null; // Sampled out under heavy load
      }
      data._sampled = true;
      data._sampleRatio = this.currentSamplingRatio;
    }

    const envelope = {
      id: this.generateMonotonicId(),
      type,
      ts: ts || new Date().toISOString(),
      actor,
      subject,
      data,
      v: 1
    };

    // Append to ring buffer
    this.ringBuffer.push(envelope);
    this.pruneRingBuffer();

    // Route event:
    // High-volume traffic events go to pending batch
    // Critical / low-volume events are broadcast immediately
    if (isHighVolume) {
      this.pendingBatch.push(envelope);
    } else {
      this.broadcastSingle(envelope);
    }

    // Call listeners / webhooks / alert evaluate callbacks
    if (this.onEventHook) {
      try {
        this.onEventHook(envelope);
      } catch (err) {
        console.error('[EventBus Hook Error]', err);
      }
    }

    return envelope;
  }

  /**
   * Prune ring buffer by age (10m) and size
   */
  pruneRingBuffer() {
    const cutoff = Date.now() - this.ringBufferMaxAgeMs;
    while (this.ringBuffer.length > 0 && new Date(this.ringBuffer[0].ts).getTime() < cutoff) {
      this.ringBuffer.shift();
    }
    if (this.ringBuffer.length > this.ringBufferMaxSize) {
      this.ringBuffer.splice(0, this.ringBuffer.length - this.ringBufferMaxSize);
    }
  }

  /**
   * Query events from ring buffer after a given event ID (Resume with Last-Event-ID)
   */
  getEventsSince(lastEventId, filterTopics = null) {
    if (!lastEventId) return [];
    const index = this.ringBuffer.findIndex(ev => ev.id === lastEventId);
    let slice = [];
    if (index >= 0) {
      slice = this.ringBuffer.slice(index + 1);
    } else {
      // If lastEventId is older than ring buffer cutoff or formatted as timestamp
      slice = this.ringBuffer.filter(ev => ev.id > lastEventId);
    }

    if (!filterTopics || filterTopics.has('*') || filterTopics.size === 0) {
      return slice;
    }

    return slice.filter(ev => {
      const topics = this.getTopicsForType(ev.type);
      return topics.some(t => filterTopics.has(t));
    });
  }

  /**
   * Add a subscriber (SSE client)
   */
  addSubscriber({ id, res, topics = new Set(['*']), lastEventId = null }) {
    const sub = {
      id,
      res,
      topics,
      connectedAt: Date.now()
    };
    this.subscribers.add(sub);

    // If Last-Event-ID provided, replay missed events
    if (lastEventId) {
      const missed = this.getEventsSince(lastEventId, topics);
      if (missed.length > 0) {
        for (const ev of missed) {
          this.writeSSE(res, ev);
        }
        // Write replay summary event
        this.writeSSERaw(res, 'sync', {
          replayedCount: missed.length,
          lastReplayedId: missed[missed.length - 1].id,
          timestamp: Date.now()
        });
      }
    }

    return sub;
  }

  removeSubscriber(sub) {
    this.subscribers.delete(sub);
  }

  writeSSE(res, envelope) {
    try {
      res.write(`id: ${envelope.id}\nevent: ${envelope.type}\ndata: ${JSON.stringify(envelope)}\n\n`);
    } catch (err) {
      // Broken pipe or closed connection
    }
  }

  writeSSERaw(res, eventName, data, id = null) {
    try {
      let str = '';
      if (id) str += `id: ${id}\n`;
      str += `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
      res.write(str);
    } catch (err) {}
  }

  /**
   * Immediate dispatch for critical/low-volume events
   */
  broadcastSingle(envelope) {
    if (this.subscribers.size === 0) return;
    const eventTopics = this.getTopicsForType(envelope.type);

    for (const sub of this.subscribers) {
      if (this.matchesTopics(sub.topics, eventTopics)) {
        this.writeSSE(sub.res, envelope);
      }
    }
  }

  /**
   * Flush pending high-volume batches (250ms window)
   */
  startBatchLoop() {
    this.batchTimer = setInterval(() => {
      if (this.pendingBatch.length === 0 || this.subscribers.size === 0) {
        this.pendingBatch = [];
        return;
      }

      const batch = this.pendingBatch;
      this.pendingBatch = [];

      for (const sub of this.subscribers) {
        if (!sub.topics.has('*') && !sub.topics.has('traffic')) {
          continue;
        }

        // Send batched frame
        try {
          if (batch.length === 1) {
            this.writeSSE(sub.res, batch[0]);
          } else {
            const lastId = batch[batch.length - 1].id;
            sub.res.write(`id: ${lastId}\nevent: frame.batch\ndata: ${JSON.stringify({
              frameTs: Date.now(),
              count: batch.length,
              events: batch
            })}\n\n`);
          }
        } catch (e) {
          this.subscribers.delete(sub);
        }
      }
    }, this.batchIntervalMs);
  }

  /**
   * Heartbeat keepalive every 15s
   */
  startHeartbeatLoop() {
    setInterval(() => {
      if (this.subscribers.size === 0) return;
      const hbData = JSON.stringify({
        ts: Date.now(),
        clients: this.subscribers.size,
        bufferSize: this.ringBuffer.length
      });
      for (const sub of this.subscribers) {
        try {
          sub.res.write(`: keepalive\nevent: heartbeat\ndata: ${hbData}\n\n`);
        } catch (e) {
          this.subscribers.delete(sub);
        }
      }
    }, 15000);
  }

  matchesTopics(subscribedTopics, eventTopics) {
    if (!subscribedTopics || subscribedTopics.has('*')) return true;
    for (const t of eventTopics) {
      if (subscribedTopics.has(t)) return true;
    }
    return false;
  }
}

export const globalEventBus = new EventBus();
