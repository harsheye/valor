import crypto from 'crypto';
import { globalEventBus } from './eventBus.js';

/**
 * Enterprise Audit Logger for Valor Admin Console
 * Tracks who did what, when, subject, old and new values.
 */
export class AuditLogger {
  constructor(options = {}) {
    this.logs = []; // in-memory audit logs (capped at 2000)
    this.dataStore = null;
  }

  setDataStore(ds) {
    this.dataStore = ds;
  }

  /**
   * Log an administrative action
   */
  logAction({ actor = 'admin', action, subjectType, subjectId, oldValues = null, newValues = null, ip = '127.0.0.1', userAgent = '' }) {
    const logId = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const entry = {
      id: logId,
      actor,
      action,
      subjectType,
      subjectId: String(subjectId || ''),
      oldValues: oldValues ? (typeof oldValues === 'object' ? oldValues : { value: oldValues }) : null,
      newValues: newValues ? (typeof newValues === 'object' ? newValues : { value: newValues }) : null,
      ip,
      userAgent: userAgent ? userAgent.slice(0, 150) : '',
      createdAt: new Date().toISOString()
    };

    this.logs.unshift(entry);
    if (this.logs.length > 2000) this.logs.pop();

    // Broadcast audit event to bus
    globalEventBus.publish({
      type: 'security.audit',
      actor,
      subject: `${subjectType}:${subjectId}`,
      data: entry
    });

    // Write to dataStore if available
    if (this.dataStore && this.dataStore.saveAuditLog) {
      this.dataStore.saveAuditLog(entry).catch(() => {});
    }

    return entry;
  }

  getLogs({ actor = null, action = null, search = null, limit = 100 } = {}) {
    let result = this.logs;
    if (actor) {
      result = result.filter(l => l.actor.toLowerCase().includes(actor.toLowerCase()));
    }
    if (action) {
      result = result.filter(l => l.action.toLowerCase().includes(action.toLowerCase()));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l => 
        l.actor.toLowerCase().includes(q) || 
        l.action.toLowerCase().includes(q) || 
        l.subjectId.toLowerCase().includes(q) || 
        (l.ip && l.ip.includes(q))
      );
    }
    return result.slice(0, limit);
  }

  exportCsv() {
    const headers = ['ID', 'Timestamp', 'Actor', 'Action', 'Subject Type', 'Subject ID', 'Old Values', 'New Values', 'IP'];
    const rows = this.logs.map(l => [
      l.id,
      l.createdAt,
      l.actor,
      l.action,
      l.subjectType,
      `"${(l.subjectId || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(l.oldValues || {}).replace(/"/g, '""')}"`,
      `"${JSON.stringify(l.newValues || {}).replace(/"/g, '""')}"`,
      l.ip
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

export const auditLogger = new AuditLogger();
