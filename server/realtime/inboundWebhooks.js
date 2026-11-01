import crypto from 'crypto';
import { globalEventBus } from './eventBus.js';

/**
 * Inbound Webhooks Manager
 * 
 * Verifies HMAC-SHA256 signatures, checks 5-minute timestamp tolerance,
 * ensures idempotency by event_id, validates payload schema, and emits
 * verified events to the server-side event bus.
 */
export class InboundWebhooksManager {
  constructor(options = {}) {
    this.defaultSecret = options.defaultSecret || process.env.INBOUND_WEBHOOK_SECRET || 'valor_inbound_secret_2026_demo';
    this.timestampToleranceMs = options.timestampToleranceMs || 5 * 60 * 1000; // 5 minutes
    this.processedEventIds = new Map(); // eventId -> processedTimestamp (TTL cache)
    this.allowedEventTypes = new Set([
      'trakt.scrobble',
      'trakt.sync',
      'trakt.history',
      'payment.succeeded',
      'payment.failed',
      'payment.refunded',
      'subscription.created',
      'subscription.canceled',
      'uptime.probe',
      'uptime.incident',
      'uptime.recovered',
      'external.alert'
    ]);

    // Cleanup processed event IDs every 10 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [id, ts] of this.processedEventIds.entries()) {
        if (now - ts > 24 * 60 * 60 * 1000) { // Keep 24h for deduplication
          this.processedEventIds.delete(id);
        }
      }
    }, 10 * 60 * 1000);
  }

  /**
   * Verify HMAC-SHA256 signature
   * Supports: 'sha256=<hex>' or raw hex string
   */
  verifySignature(rawBody, signatureHeader, timestamp, secret = null) {
    if (!signatureHeader) return false;
    const signingSecret = secret || this.defaultSecret;

    // Standard GitHub/Stripe style: signed payload is `${timestamp}.${rawBody}` or rawBody
    // We check both for maximum external service compatibility
    const cleanedSig = signatureHeader.replace(/^sha256=/, '').trim().toLowerCase();

    // Strategy 1: HMAC over timestamp + "." + rawBody
    const hmac1 = crypto.createHmac('sha256', signingSecret);
    hmac1.update(`${timestamp}.${rawBody}`);
    const digest1 = hmac1.digest('hex').toLowerCase();

    // Strategy 2: HMAC directly over rawBody
    const hmac2 = crypto.createHmac('sha256', signingSecret);
    hmac2.update(rawBody);
    const digest2 = hmac2.digest('hex').toLowerCase();

    const bufSig = Buffer.from(cleanedSig);
    const bufDigest1 = Buffer.from(digest1);
    const bufDigest2 = Buffer.from(digest2);

    const match1 = bufSig.length === bufDigest1.length && crypto.timingSafeEqual(bufSig, bufDigest1);
    const match2 = bufSig.length === bufDigest2.length && crypto.timingSafeEqual(bufSig, bufDigest2);

    return match1 || match2;
  }

  /**
   * Process incoming webhook request
   */
  async handleWebhookRequest(rawBody, headers, clientIp = '127.0.0.1') {
    // 1. Signature Header Check
    const signatureHeader = headers['x-valor-signature'] || 
                            headers['x-hub-signature-256'] || 
                            headers['x-signature-sha256'] || 
                            headers['stripe-signature'];

    if (!signatureHeader) {
      return {
        status: 401,
        body: { error: 'Missing webhook signature header (expected X-Valor-Signature or X-Hub-Signature-256)' }
      };
    }

    // 2. Timestamp Tolerance Check (5 minutes)
    const timestampHeader = headers['x-valor-timestamp'] || headers['x-timestamp'] || Date.now().toString();
    const parsedTs = parseInt(timestampHeader, 10);
    const webhookTime = isNaN(parsedTs) ? new Date(timestampHeader).getTime() : (parsedTs < 1e11 ? parsedTs * 1000 : parsedTs);
    const now = Date.now();

    if (isNaN(webhookTime) || Math.abs(now - webhookTime) > this.timestampToleranceMs) {
      return {
        status: 400,
        body: {
          error: 'Webhook timestamp tolerance exceeded (must be within 5 minutes of server time)',
          serverTime: new Date(now).toISOString(),
          headerTime: new Date(webhookTime || 0).toISOString()
        }
      };
    }

    // 3. Signature Verification
    const isValid = this.verifySignature(rawBody, signatureHeader, timestampHeader);
    if (!isValid) {
      return {
        status: 401,
        body: { error: 'Invalid HMAC-SHA256 signature' }
      };
    }

    // 4. JSON Payload Parsing
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (err) {
      return {
        status: 400,
        body: { error: 'Malformed JSON payload' }
      };
    }

    // 5. Schema Validation
    const eventId = payload.event_id || payload.id;
    const eventType = payload.event_type || payload.type;
    const data = payload.data || payload.payload || {};

    if (!eventId || typeof eventId !== 'string') {
      return {
        status: 400,
        body: { error: "Payload schema validation failed: missing required string 'event_id'" }
      };
    }

    if (!eventType || typeof eventType !== 'string') {
      return {
        status: 400,
        body: { error: "Payload schema validation failed: missing required string 'event_type'" }
      };
    }

    if (!this.allowedEventTypes.has(eventType)) {
      return {
        status: 400,
        body: {
          error: `Unknown event_type '${eventType}'. Supported types: ${Array.from(this.allowedEventTypes).join(', ')}`
        }
      };
    }

    // 6. Idempotency Check
    if (this.processedEventIds.has(eventId)) {
      return {
        status: 200,
        body: {
          success: true,
          idempotent: true,
          message: `Event '${eventId}' was previously processed`,
          eventId
        }
      };
    }

    // Mark as processed
    this.processedEventIds.set(eventId, Date.now());

    // 7. Emit into Server Event Bus
    const provider = eventType.split('.')[0];
    const emitted = globalEventBus.publish({
      type: eventType,
      actor: `external:${provider}`,
      subject: payload.subject || `event:${eventId}`,
      data: {
        ...data,
        inboundEventId: eventId,
        inboundClientIp: clientIp,
        receivedAt: new Date().toISOString()
      }
    });

    return {
      status: 200,
      body: {
        success: true,
        eventId,
        busEventId: emitted ? emitted.id : null,
        processedAt: new Date().toISOString()
      }
    };
  }
}

export const inboundWebhooksManager = new InboundWebhooksManager();
