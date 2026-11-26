import crypto from 'crypto';
import { globalEventBus } from './eventBus.js';

/**
 * Outbound Webhooks Delivery Engine
 * 
 * Features:
 * - Exponential backoff with jitter (up to 8 attempts)
 * - 10s request timeout
 * - HMAC-SHA256 signature in X-Valor-Signature
 * - Secrets redaction in request/response delivery logs
 * - Auto-disable endpoint after 5 consecutive failures
 * - Formats: generic JSON, Discord webhook, Slack webhook
 * - In-memory and persistent delivery logs
 */
export class OutboundWebhookManager {
  constructor(options = {}) {
    this.endpoints = new Map(); // id -> endpoint object
    this.deliveries = []; // recent deliveries (capped at 500)
    this.retryQueue = []; // active retry timers
    this.maxAttempts = 8;
    this.requestTimeoutMs = 10000; // 10s
    this.dataStore = null;

    // Listen to all events from the event bus
    globalEventBus.onEventHook = (envelope) => {
      this.dispatchForEvent(envelope);
    };
  }

  setDataStore(ds) {
    this.dataStore = ds;
    this.loadEndpointsFromStore();
  }

  async loadEndpointsFromStore() {
    if (!this.dataStore) return;
    try {
      const stored = await this.dataStore.getWebhooks();
      if (Array.isArray(stored)) {
        for (const ep of stored) {
          this.endpoints.set(ep.id, {
            ...ep,
            consecutiveFailures: ep.consecutiveFailures || 0,
            autoDisabled: ep.autoDisabled || false,
            format: ep.format || 'json',
            customHeaders: ep.customHeaders || {}
          });
        }
      }
    } catch (e) {
      console.warn('[OutboundWebhooks] Failed loading endpoints from store:', e.message);
    }
  }

  /**
   * Generates a secure random 32-byte hex secret
   */
  generateSecret() {
    return `whsec_${crypto.randomBytes(24).toString('hex')}`;
  }

  /**
   * Redacts sensitive fields (passwords, tokens, secrets, authorization)
   */
  redactSecrets(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      return obj.replace(/(authorization|token|secret|password|key)\s*[:=]\s*["']?([a-zA-Z0-9_\-\.]{6,})["']?/gi, '$1="***REDACTED***"');
    }
    if (typeof obj !== 'object') return obj;

    const copy = Array.isArray(obj) ? [...obj] : { ...obj };
    const sensitiveKeys = ['authorization', 'secret', 'password', 'token', 'apikey', 'api_key', 'cookie'];

    for (const key of Object.keys(copy)) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        copy[key] = '***REDACTED***';
      } else if (typeof copy[key] === 'object' && copy[key] !== null) {
        copy[key] = this.redactSecrets(copy[key]);
      }
    }
    return copy;
  }

  /**
   * Create new webhook endpoint
   */
  async createEndpoint({ name, url, events = ['*'], format = 'json', customHeaders = {}, secret = null }) {
    const id = `wh_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const generatedSecret = secret || this.generateSecret();
    const ep = {
      id,
      name: name || 'Webhook Endpoint',
      url,
      secret: generatedSecret,
      events: Array.isArray(events) ? events : [events],
      format: ['discord', 'slack', 'json'].includes(format) ? format : 'json',
      customHeaders: typeof customHeaders === 'object' ? customHeaders : {},
      enabled: true,
      consecutiveFailures: 0,
      autoDisabled: false,
      createdAt: new Date().toISOString(),
      lastTriggered: null,
      totalDeliveries: 0,
      failedDeliveries: 0,
      healthSparkline: [1, 1, 1, 1, 1] // 1 = success, 0 = fail
    };

    this.endpoints.set(id, ep);

    if (this.dataStore) {
      await this.dataStore.createWebhook(ep).catch(e => console.error(e));
    }

    // Return full secret only upon creation
    return { ...ep, secretShownOnce: generatedSecret };
  }

  /**
   * Rotate endpoint signing secret
   */
  async rotateSecret(id) {
    const ep = this.endpoints.get(id);
    if (!ep) throw new Error('Endpoint not found');
    const newSecret = this.generateSecret();
    ep.secret = newSecret;
    if (this.dataStore) {
      await this.dataStore.updateWebhook(id, { secret: newSecret });
    }
    return { id, newSecret };
  }

  /**
   * Update endpoint
   */
  async updateEndpoint(id, updates) {
    const ep = this.endpoints.get(id);
    if (!ep) throw new Error('Endpoint not found');

    if (updates.name !== undefined) ep.name = updates.name;
    if (updates.url !== undefined) ep.url = updates.url;
    if (updates.events !== undefined) ep.events = updates.events;
    if (updates.format !== undefined) ep.format = updates.format;
    if (updates.customHeaders !== undefined) ep.customHeaders = updates.customHeaders;
    if (updates.enabled !== undefined) {
      ep.enabled = updates.enabled;
      if (updates.enabled) {
        ep.autoDisabled = false;
        ep.consecutiveFailures = 0;
      }
    }

    if (this.dataStore) {
      await this.dataStore.updateWebhook(id, ep).catch(e => console.error(e));
    }
    return ep;
  }

  /**
   * Delete endpoint
   */
  async deleteEndpoint(id) {
    const ep = this.endpoints.get(id);
    if (!ep) return false;
    this.endpoints.delete(id);
    if (this.dataStore) {
      await this.dataStore.deleteWebhook(id).catch(e => console.error(e));
    }
    return true;
  }

  /**
   * Transform standard event envelope into target format (JSON, Discord, Slack)
   */
  formatPayload(ep, envelope) {
    if (ep.format === 'discord') {
      const colorMap = {
        'alerts': 0xe74c3c,    // Red
        'security': 0xf39c12,  // Amber
        'playback': 0x3498db,  // Blue
        'traffic': 0x2ecc71    // Green
      };
      const topics = globalEventBus.getTopicsForType(envelope.type);
      const color = colorMap[topics[0]] || 0x7289da;

      return {
        username: 'Valor Alerts & Monitor',
        embeds: [{
          title: `[Valor Event] ${envelope.type}`,
          description: `**Subject:** \`${envelope.subject}\`\n**Actor:** \`${envelope.actor}\``,
          color,
          fields: [
            { name: 'Event ID', value: envelope.id, inline: true },
            { name: 'Timestamp', value: envelope.ts, inline: true },
            { name: 'Payload Data', value: `\`\`\`json\n${JSON.stringify(envelope.data, null, 2).slice(0, 1000)}\n\`\`\`` }
          ],
          footer: { text: 'Valor Real-Time Admin Event Engine' }
        }]
      };
    }

    if (ep.format === 'slack') {
      return {
        text: `*Valor Event Alert: ${envelope.type}*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Event:* \`${envelope.type}\`\n*Subject:* \`${envelope.subject}\`\n*Actor:* \`${envelope.actor}\`\n*Time:* ${envelope.ts}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `\`\`\`${JSON.stringify(envelope.data, null, 2).slice(0, 1000)}\`\`\``
            }
          }
        ]
      };
    }

    // Default generic JSON format
    return envelope;
  }

  /**
   * Dispatch events matching endpoint filters
   */
  async dispatchForEvent(envelope) {
    if (this.endpoints.size === 0) return;
    const eventTopics = globalEventBus.getTopicsForType(envelope.type);

    for (const ep of this.endpoints.values()) {
      if (!ep.enabled || ep.autoDisabled) continue;

      // Check if endpoint matches envelope type or topics
      const matches = ep.events.includes('*') || 
                      ep.events.includes(envelope.type) ||
                      eventTopics.some(t => ep.events.includes(t));

      if (matches) {
        this.queueDelivery({
          endpointId: ep.id,
          envelope,
          attempt: 1
        });
      }
    }
  }

  /**
   * Calculate exponential backoff delay with random jitter
   * e.g. base = 1500ms, attempt 1 = ~1.5s, 2 = ~3.7s, 3 = ~9.3s, 4 = ~23s...
   */
  calculateBackoff(attempt) {
    const baseMs = 1500;
    const factor = Math.pow(2.2, attempt - 1);
    const delay = baseMs * factor;
    // Add ±20% random jitter
    const jitter = (Math.random() * 0.4 - 0.2) * delay;
    return Math.min(Math.round(delay + jitter), 60 * 60 * 1000); // Capped at 1h
  }

  /**
   * Queue or execute delivery with backoff
   */
  queueDelivery({ endpointId, envelope, attempt }) {
    if (attempt === 1) {
      this.executeDelivery({ endpointId, envelope, attempt });
    } else {
      const delayMs = this.calculateBackoff(attempt);
      const timer = setTimeout(() => {
        this.executeDelivery({ endpointId, envelope, attempt });
      }, delayMs);
      this.retryQueue.push(timer);
    }
  }

  /**
   * Send HTTP request to external webhook endpoint
   */
  async executeDelivery({ endpointId, envelope, attempt }) {
    const ep = this.endpoints.get(endpointId);
    if (!ep || !ep.enabled || ep.autoDisabled) return;

    const deliveryId = `del_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const payloadObj = this.formatPayload(ep, envelope);
    const payloadRaw = JSON.stringify(payloadObj);

    // Compute HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', ep.secret || 'valor_default_secret');
    hmac.update(payloadRaw);
    const signature = `sha256=${hmac.digest('hex')}`;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Valor-Webhooks/2.0',
      'X-Valor-Event': envelope.type,
      'X-Valor-Event-Id': envelope.id,
      'X-Valor-Delivery-Id': deliveryId,
      'X-Valor-Attempt': String(attempt),
      'X-Valor-Signature': signature,
      'X-Valor-Timestamp': String(Date.now()),
      ...(ep.customHeaders || {})
    };

    const t0 = Date.now();
    let status = 'failed';
    let statusCode = 0;
    let responseBody = '';
    let errorMessage = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      const res = await fetch(ep.url, {
        method: 'POST',
        headers,
        body: payloadRaw,
        signal: controller.signal
      });

      clearTimeout(timeout);
      statusCode = res.status;
      const text = await res.text();
      responseBody = text.slice(0, 2000); // Cap response body

      if (res.ok) {
        status = 'success';
      } else {
        errorMessage = `HTTP status ${statusCode}`;
      }
    } catch (err) {
      status = 'failed';
      errorMessage = err.name === 'AbortError' ? 'Request timed out (10s)' : err.message;
    }

    const latencyMs = Date.now() - t0;

    // Record delivery record (with secrets redacted)
    const deliveryRecord = {
      id: deliveryId,
      webhookId: ep.id,
      webhookName: ep.name,
      event: envelope.type,
      status,
      statusCode,
      latencyMs,
      attemptNumber: attempt,
      maxAttempts: this.maxAttempts,
      payload: JSON.stringify(this.redactSecrets(payloadObj)),
      requestHeaders: JSON.stringify(this.redactSecrets(headers)),
      responseBody: this.redactSecrets(responseBody),
      errorMessage,
      createdAt: new Date().toISOString()
    };

    this.deliveries.unshift(deliveryRecord);
    if (this.deliveries.length > 500) this.deliveries.pop();

    // Update endpoint stats
    ep.lastTriggered = new Date().toISOString();
    ep.totalDeliveries++;
    if (!ep.healthSparkline) ep.healthSparkline = [];
    ep.healthSparkline.push(status === 'success' ? 1 : 0);
    if (ep.healthSparkline.length > 20) ep.healthSparkline.shift();

    if (status === 'success') {
      ep.consecutiveFailures = 0;
    } else {
      ep.failedDeliveries++;
      ep.consecutiveFailures++;

      // Retry mechanism if attempts remain
      if (attempt < this.maxAttempts) {
        this.queueDelivery({
          endpointId: ep.id,
          envelope,
          attempt: attempt + 1
        });
      } else {
        // Exceeded max attempts: check for auto-disable
        if (ep.consecutiveFailures >= 5) {
          ep.autoDisabled = true;
          ep.enabled = false;

          // Emit alert event to bus!
          globalEventBus.publish({
            type: 'alert.triggered',
            actor: 'system:webhooks',
            subject: `webhook:${ep.id}`,
            data: {
              severity: 'critical',
              title: `Webhook '${ep.name}' Auto-Disabled`,
              message: `Endpoint ${ep.url} failed ${ep.consecutiveFailures} consecutive times after 8 retry attempts. Endpoint has been automatically disabled.`,
              endpointId: ep.id,
              url: ep.url
            }
          });
        }
      }
    }

    // Persist delivery to dataStore
    if (this.dataStore && this.dataStore.saveWebhookDelivery) {
      this.dataStore.saveWebhookDelivery(deliveryRecord).catch(() => {});
    }

    // Broadcast delivery event to webhooks tab subscribers
    globalEventBus.publish({
      type: 'webhook.delivery',
      actor: 'system:webhooks',
      subject: `webhook:${ep.id}`,
      data: deliveryRecord
    });

    return deliveryRecord;
  }

  /**
   * Replay a previous delivery attempt immediately
   */
  async replayDelivery(deliveryId) {
    const delivery = this.deliveries.find(d => d.id === deliveryId);
    if (!delivery) throw new Error('Delivery not found');

    const ep = this.endpoints.get(delivery.webhookId);
    if (!ep) throw new Error('Associated webhook endpoint no longer exists');

    let envelope;
    try {
      envelope = JSON.parse(delivery.payload);
    } catch (e) {
      envelope = {
        id: globalEventBus.generateMonotonicId(),
        type: delivery.event,
        ts: new Date().toISOString(),
        actor: 'admin:replay',
        subject: `replay:${delivery.id}`,
        data: { replayedDeliveryId: delivery.id }
      };
    }

    return await this.executeDelivery({
      endpointId: ep.id,
      envelope,
      attempt: 1
    });
  }

  /**
   * Send an immediate test event
   */
  async sendTestEvent(endpointId) {
    const ep = this.endpoints.get(endpointId);
    if (!ep) throw new Error('Endpoint not found');

    const testEnvelope = {
      id: globalEventBus.generateMonotonicId(),
      type: 'webhook.test_ping',
      ts: new Date().toISOString(),
      actor: 'admin:console',
      subject: `webhook:${ep.id}`,
      data: {
        message: 'Hello from Valor Real-Time Webhooks Engine! Test event delivered successfully.',
        endpointName: ep.name,
        targetUrl: ep.url,
        format: ep.format,
        testTimestamp: Date.now()
      },
      v: 1
    };

    return await this.executeDelivery({
      endpointId: ep.id,
      envelope: testEnvelope,
      attempt: 1
    });
  }

  /**
   * Get all endpoints with success rates and sparklines
   */
  getEndpointsSummary() {
    return Array.from(this.endpoints.values()).map(ep => {
      const spark = ep.healthSparkline || [1];
      const successCount = spark.filter(x => x === 1).length;
      const successRate = spark.length > 0 ? Math.round((successCount / spark.length) * 100) : 100;
      return {
        ...ep,
        secret: ep.secret ? `${ep.secret.slice(0, 8)}...${ep.secret.slice(-4)}` : undefined, // mask secret
        successRate,
        sparkline: spark
      };
    });
  }

  getRecentDeliveries(limit = 100, webhookId = null) {
    let list = this.deliveries;
    if (webhookId) {
      list = list.filter(d => d.webhookId === webhookId);
    }
    return list.slice(0, limit);
  }
}

export const outboundWebhookManager = new OutboundWebhookManager();
