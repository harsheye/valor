import crypto from 'crypto';
import { globalEventBus } from './eventBus.js';
import { auditLogger } from './auditLogger.js';

/**
 * Enterprise Security & Access Control Manager
 */
export class SecurityManager {
  constructor(options = {}) {
    this.blockList = new Map(); // id -> item
    this.adminSessions = new Map(); // token -> session
    this.autoBlockSuggestions = new Map(); // key -> suggestion
    this.ipRequestCounts = new Map(); // ip -> { count, windowStart }
    this.rateLimitPerMin = 180; // default 180 req/min per IP
    this.adminIpAllowlistEnabled = false;
    this.adminIpAllowlist = new Set(['127.0.0.1', '::1', 'localhost']);
    this.dataStore = null;

    this.initSampleAdminSessions();
  }

  setDataStore(ds) {
    this.dataStore = ds;
    this.syncBlockListFromDb();
  }

  syncBlockListFromDb() {
    if (!this.dataStore) return;
    try {
      if (this.dataStore.sqliteDb) {
        const rows = this.dataStore.sqliteDb.prepare(`SELECT * FROM blocked_ips`).all();
        if (Array.isArray(rows)) {
          for (const r of rows) {
            const id = `blk_ip_${r.ip.replace(/[^a-zA-Z0-9]/g, '_')}`;
            if (!this.blockList.has(id)) {
              this.blockList.set(id, {
                id,
                type: 'ip',
                value: r.ip,
                reason: r.reason || 'Blocked by administrator',
                expiresAt: null,
                createdBy: 'admin',
                createdAt: r.created_at || new Date().toISOString()
              });
            }
          }
        }
      }
    } catch {}
  }

  initDefaultBlockList() {
    // Start with a clean, unpolluted real blocklist
  }

  initSampleAdminSessions() {
    this.adminSessions.set('val_admin_session_primary', {
      id: 'sess_admin_primary',
      token: 'val_admin_session_primary',
      username: 'admin',
      role: 'owner',
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/133.0',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      isCurrent: true
    });
  }

  /**
   * Check if IP or CIDR matches
   */
  matchesCidr(ip, cidr) {
    try {
      if (!cidr.includes('/')) return ip === cidr;
      const [range, bits] = cidr.split('/');
      const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
      const ipNum = ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
      const rangeNum = range.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
      return (ipNum & mask) === (rangeNum & mask);
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if request should be blocked
   */
  isBlocked({ ip, deviceId, countryCode }) {
    const now = Date.now();
    for (const item of this.blockList.values()) {
      // Check expiry
      if (item.expiresAt && new Date(item.expiresAt).getTime() < now) {
        continue; // expired
      }

      if (item.type === 'ip' && ip && item.value === ip) {
        return { blocked: true, reason: item.reason, type: 'ip', value: item.value };
      }
      if (item.type === 'cidr' && ip && this.matchesCidr(ip, item.value)) {
        return { blocked: true, reason: item.reason, type: 'cidr', value: item.value };
      }
      if (item.type === 'device_id' && deviceId && item.value === deviceId) {
        return { blocked: true, reason: item.reason, type: 'device_id', value: item.value };
      }
      if (item.type === 'country' && countryCode && item.value.toUpperCase() === countryCode.toUpperCase()) {
        return { blocked: true, reason: item.reason, type: 'country', value: item.value };
      }
    }
    return { blocked: false };
  }

  /**
   * Add entry to block list
   */
  blockTarget({ type, value, reason = 'Administrative block', durationHours = null, actor = 'admin', ip = '127.0.0.1' }) {
    const id = `blk_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const expiresAt = durationHours ? new Date(Date.now() + durationHours * 3600000).toISOString() : null;

    const entry = {
      id,
      type: ['ip', 'cidr', 'device_id', 'country'].includes(type) ? type : 'ip',
      value: value.trim(),
      reason,
      expiresAt,
      createdBy: actor,
      createdAt: new Date().toISOString()
    };

    this.blockList.set(id, entry);

    // Remove from auto-block suggestions if present
    this.autoBlockSuggestions.delete(value.trim());

    // Audit log
    auditLogger.logAction({
      actor,
      action: 'BLOCK_TARGET',
      subjectType: type,
      subjectId: value,
      newValues: { reason, expiresAt },
      ip
    });

    // Broadcast
    globalEventBus.publish({
      type: 'ip.blocked',
      actor,
      subject: `${type}:${value}`,
      data: entry
    });

    return entry;
  }

  /**
   * Unblock target
   */
  unblockTarget(id, actor = 'admin', clientIp = '127.0.0.1') {
    const entry = this.blockList.get(id);
    if (!entry) return false;

    this.blockList.delete(id);

    auditLogger.logAction({
      actor,
      action: 'UNBLOCK_TARGET',
      subjectType: entry.type,
      subjectId: entry.value,
      oldValues: { reason: entry.reason },
      ip: clientIp
    });

    globalEventBus.publish({
      type: 'ip.unblocked',
      actor,
      subject: `${entry.type}:${entry.value}`,
      data: entry
    });

    return true;
  }

  /**
   * Rate limit check per IP
   */
  checkRateLimit(ip) {
    if (!ip) return { allowed: true };
    const now = Date.now();
    let record = this.ipRequestCounts.get(ip);

    if (!record || now - record.windowStart >= 60000) {
      record = { count: 1, windowStart: now };
      this.ipRequestCounts.set(ip, record);
      return { allowed: true, remaining: this.rateLimitPerMin - 1 };
    }

    record.count++;
    if (record.count > this.rateLimitPerMin) {
      // Suggest auto-block for abusive IP
      this.recordSuspiciousActivity({
        ip,
        reason: `Exceeded rate limit (${record.count} req/min > ${this.rateLimitPerMin})`,
        severity: 'high'
      });
      return { allowed: false, remaining: 0, resetInSeconds: Math.ceil((60000 - (now - record.windowStart)) / 1000) };
    }

    return { allowed: true, remaining: this.rateLimitPerMin - record.count };
  }

  /**
   * Track suspicious behavior and generate auto-block suggestions
   */
  recordSuspiciousActivity({ ip, deviceId = null, reason, severity = 'medium' }) {
    if (!ip || ['127.0.0.1', '::1', 'localhost'].includes(ip)) return;

    const existing = this.autoBlockSuggestions.get(ip);
    if (existing) {
      existing.count++;
      existing.lastSeen = new Date().toISOString();
      existing.reasons.push(reason);
    } else {
      this.autoBlockSuggestions.set(ip, {
        ip,
        deviceId,
        count: 1,
        severity,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        reasons: [reason],
        suggestedType: 'ip'
      });
    }
  }

  getAutoBlockSuggestions() {
    return Array.from(this.autoBlockSuggestions.values()).filter(s => s.count >= 3);
  }

  dismissSuggestion(ip) {
    return this.autoBlockSuggestions.delete(ip);
  }

  getBlockList() {
    return Array.from(this.blockList.values());
  }

  getAdminSessions(currentSessionToken = null) {
    return Array.from(this.adminSessions.values()).map(s => ({
      ...s,
      token: undefined, // do not leak full tokens
      isCurrent: s.token === currentSessionToken || s.isCurrent
    }));
  }

  registerAdminSession({ token, username, role = 'admin', ip, userAgent }) {
    const id = `sess_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const session = {
      id,
      token,
      username,
      role,
      ip,
      userAgent,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    };
    this.adminSessions.set(token, session);
    return session;
  }

  signOutEverywhere(actor = 'admin', ip = '127.0.0.1') {
    const count = this.adminSessions.size;
    this.adminSessions.clear();

    auditLogger.logAction({
      actor,
      action: 'SIGN_OUT_EVERYWHERE',
      subjectType: 'admin_sessions',
      subjectId: 'all',
      newValues: { revokedSessions: count },
      ip
    });

    globalEventBus.publish({
      type: 'admin.sessions_revoked',
      actor,
      subject: 'admin_sessions:all',
      data: { revokedCount: count }
    });

    return { success: true, revokedCount: count };
  }
}

export const securityManager = new SecurityManager();
