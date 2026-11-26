import crypto from 'crypto';
import { globalEventBus } from './eventBus.js';

/**
 * Enterprise Alert Rules & Notification Center Engine
 */
export class AlertEngine {
  constructor(options = {}) {
    this.rules = new Map();
    this.activeAlerts = []; // in-memory recent alerts list (capped at 500)
    this.incidentTimeline = []; // incidents generated from alerts
    this.seenCountries = new Set(['US', 'CA', 'GB', 'DE', 'FR', 'NL', 'IN', 'JP', 'AU']);

    // Rolling metrics window for rule evaluations
    this.metricsWindow = {
      windowMs: 60000, // 1 minute window
      totalRequests: 0,
      errorCount: 0,
      latencies: [],
      totalBytes: 0,
      lastReset: Date.now()
    };

    this.initDefaultRules();
    this.startMetricsEvaluationLoop();
  }

  initDefaultRules() {
    const defaultRules = [
      {
        id: 'rule_err_rate',
        name: 'High Error Rate (> 5%)',
        conditionType: 'error_rate',
        operator: '>',
        threshold: 5,
        severity: 'critical',
        cooldownMinutes: 15,
        quietHoursStart: null,
        quietHoursEnd: null,
        channels: ['in_app', 'webhook'],
        enabled: true,
        lastTriggeredAt: null
      },
      {
        id: 'rule_p95_lat',
        name: 'High P95 Latency (> 800ms)',
        conditionType: 'p95_latency',
        operator: '>',
        threshold: 800,
        severity: 'warning',
        cooldownMinutes: 10,
        quietHoursStart: null,
        quietHoursEnd: null,
        channels: ['in_app'],
        enabled: true,
        lastTriggeredAt: null
      },
      {
        id: 'rule_bandwidth_spike',
        name: 'Bandwidth Spike (> 50 MB/s)',
        conditionType: 'bandwidth_spike',
        operator: '>',
        threshold: 50,
        severity: 'warning',
        cooldownMinutes: 20,
        quietHoursStart: null,
        quietHoursEnd: null,
        channels: ['in_app'],
        enabled: true,
        lastTriggeredAt: null
      },
      {
        id: 'rule_new_country',
        name: 'Traffic from New / Unusual Country',
        conditionType: 'new_country',
        operator: '!=',
        threshold: 0,
        severity: 'info',
        cooldownMinutes: 60,
        quietHoursStart: null,
        quietHoursEnd: null,
        channels: ['in_app'],
        enabled: true,
        lastTriggeredAt: null
      },
      {
        id: 'rule_admin_login',
        name: 'New Admin Login Detected',
        conditionType: 'new_admin_login',
        operator: '==',
        threshold: 1,
        severity: 'warning',
        cooldownMinutes: 0,
        quietHoursStart: null,
        quietHoursEnd: null,
        channels: ['in_app', 'email'],
        enabled: true,
        lastTriggeredAt: null
      },
      {
        id: 'rule_third_party_fail',
        name: '3rd-Party API Provider Failure',
        conditionType: 'third_party_failing',
        operator: '==',
        threshold: 1,
        severity: 'critical',
        cooldownMinutes: 15,
        quietHoursStart: null,
        quietHoursEnd: null,
        channels: ['in_app', 'webhook', 'discord'],
        enabled: true,
        lastTriggeredAt: null
      },
      {
        id: 'rule_infra_down',
        name: 'Database or Redis Cache Down',
        conditionType: 'infra_down',
        operator: '==',
        threshold: 1,
        severity: 'critical',
        cooldownMinutes: 5,
        quietHoursStart: null,
        quietHoursEnd: null,
        channels: ['in_app', 'webhook'],
        enabled: true,
        lastTriggeredAt: null
      }
    ];

    for (const r of defaultRules) {
      this.rules.set(r.id, r);
    }
  }

  /**
   * Check if current time falls within quiet hours (e.g. "23:00" to "07:00")
   */
  isQuietHours(start, end) {
    if (!start || !end) return false;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    if (startMin <= endMin) {
      return currentMin >= startMin && currentMin <= endMin;
    } else {
      // Overnight (e.g. 23:00 to 07:00)
      return currentMin >= startMin || currentMin <= endMin;
    }
  }

  /**
   * Record traffic metrics to evaluate sliding window rules
   */
  recordMetric({ statusCode = 200, latencyMs = 20, bytes = 0, countryCode = null }) {
    this.metricsWindow.totalRequests++;
    if (statusCode >= 400) {
      this.metricsWindow.errorCount++;
    }
    this.metricsWindow.latencies.push(latencyMs);
    this.metricsWindow.totalBytes += bytes;

    if (countryCode && !this.seenCountries.has(countryCode.toUpperCase())) {
      this.seenCountries.add(countryCode.toUpperCase());
      this.evaluateRule('rule_new_country', {
        countryCode,
        title: `New Country Traffic: ${countryCode}`,
        message: `Inbound visitor detected from previously unseen country code [${countryCode}].`
      });
    }
  }

  /**
   * Periodic evaluation of error rate, p95 latency, bandwidth
   */
  startMetricsEvaluationLoop() {
    setInterval(() => {
      const now = Date.now();
      const { totalRequests, errorCount, latencies, totalBytes } = this.metricsWindow;

      // Evaluate Error Rate
      if (totalRequests >= 5) {
        const errorRate = (errorCount / totalRequests) * 100;
        const errRule = this.rules.get('rule_err_rate');
        if (errRule && errRule.enabled && errorRate > errRule.threshold) {
          this.triggerAlert({
            ruleId: errRule.id,
            ruleName: errRule.name,
            severity: errRule.severity,
            title: `Error Rate Alert (${errorRate.toFixed(1)}%)`,
            message: `Current 1-minute window error rate is ${errorRate.toFixed(1)}% (${errorCount}/${totalRequests} requests failed). Threshold: ${errRule.threshold}%.`,
            data: { errorRate, errorCount, totalRequests }
          });
        }
      }

      // Evaluate P95 Latency
      if (latencies.length >= 5) {
        const sorted = [...latencies].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);
        const p95 = sorted[p95Index] || 0;
        const latRule = this.rules.get('rule_p95_lat');
        if (latRule && latRule.enabled && p95 > latRule.threshold) {
          this.triggerAlert({
            ruleId: latRule.id,
            ruleName: latRule.name,
            severity: latRule.severity,
            title: `High P95 Latency (${p95}ms)`,
            message: `P95 response latency reached ${p95}ms in the last minute. Threshold: ${latRule.threshold}ms.`,
            data: { p95Latency: p95, samples: latencies.length }
          });
        }
      }

      // Reset window every 60s
      this.metricsWindow = {
        windowMs: 60000,
        totalRequests: 0,
        errorCount: 0,
        latencies: [],
        totalBytes: 0,
        lastReset: now
      };
    }, 15000); // Check every 15s
  }

  evaluateRule(ruleId, details) {
    const rule = this.rules.get(ruleId);
    if (!rule || !rule.enabled) return;

    this.triggerAlert({
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      title: details.title || rule.name,
      message: details.message || 'Alert condition satisfied',
      data: details.data || details
    });
  }

  /**
   * Trigger an alert with cooldown & quiet hour enforcement
   */
  triggerAlert({ ruleId, ruleName, severity = 'warning', title, message, data = {} }) {
    const rule = ruleId ? this.rules.get(ruleId) : null;
    const now = Date.now();

    if (rule) {
      // Cooldown check
      if (rule.lastTriggeredAt) {
        const elapsedMin = (now - new Date(rule.lastTriggeredAt).getTime()) / 60000;
        if (elapsedMin < (rule.cooldownMinutes || 10)) {
          return null; // In cooldown
        }
      }

      // Quiet hours check
      if (this.isQuietHours(rule.quietHoursStart, rule.quietHoursEnd)) {
        return null; // Suppressed during quiet hours
      }

      rule.lastTriggeredAt = new Date().toISOString();
    }

    const alertId = `alt_${now}_${crypto.randomBytes(3).toString('hex')}`;
    const alert = {
      id: alertId,
      ruleId: ruleId || 'manual',
      ruleName: ruleName || 'Manual Alert',
      severity,
      title,
      message,
      data,
      status: 'active', // active, acknowledged, snoozed, resolved
      snoozedUntil: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
      createdAt: new Date().toISOString()
    };

    this.activeAlerts.unshift(alert);
    if (this.activeAlerts.length > 300) this.activeAlerts.pop();

    // Auto-create incident timeline entry if critical or warning
    if (severity === 'critical' || severity === 'warning') {
      this.incidentTimeline.unshift({
        id: `inc_${Date.now()}`,
        alertId,
        title,
        severity,
        status: 'open',
        description: message,
        timestamp: new Date().toISOString()
      });
      if (this.incidentTimeline.length > 50) this.incidentTimeline.pop();
    }

    // Publish to server event bus
    globalEventBus.publish({
      type: 'alert.triggered',
      actor: 'system:alert_engine',
      subject: `rule:${ruleId || 'system'}`,
      data: alert
    });

    return alert;
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId, username = 'admin') {
    const alert = this.activeAlerts.find(a => a.id === alertId);
    if (!alert) return null;

    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = username;

    globalEventBus.publish({
      type: 'alert.acknowledged',
      actor: `admin:${username}`,
      subject: `alert:${alertId}`,
      data: alert
    });

    return alert;
  }

  /**
   * Snooze alert for duration
   */
  snoozeAlert(alertId, minutes = 60, username = 'admin') {
    const alert = this.activeAlerts.find(a => a.id === alertId);
    if (!alert) return null;

    alert.status = 'snoozed';
    alert.snoozedUntil = new Date(Date.now() + minutes * 60000).toISOString();

    globalEventBus.publish({
      type: 'alert.snoozed',
      actor: `admin:${username}`,
      subject: `alert:${alertId}`,
      data: alert
    });

    return alert;
  }

  /**
   * Mark all active alerts as read / acknowledged
   */
  markAllAsRead(username = 'admin') {
    const now = new Date().toISOString();
    for (const alert of this.activeAlerts) {
      if (alert.status === 'active') {
        alert.status = 'acknowledged';
        alert.acknowledgedAt = now;
        alert.acknowledgedBy = username;
      }
    }
    return { success: true };
  }

  getUnreadCount() {
    return this.activeAlerts.filter(a => a.status === 'active').length;
  }

  getAlerts(limit = 100) {
    return this.activeAlerts.slice(0, limit);
  }

  getRules() {
    return Array.from(this.rules.values());
  }

  saveRule(rule) {
    const id = rule.id || `rule_${Date.now()}`;
    const ruleObj = {
      ...rule,
      id,
      enabled: rule.enabled !== undefined ? rule.enabled : true,
      channels: Array.isArray(rule.channels) ? rule.channels : ['in_app']
    };
    this.rules.set(id, ruleObj);
    return ruleObj;
  }

  deleteRule(id) {
    return this.rules.delete(id);
  }

  getIncidentTimeline() {
    return this.incidentTimeline;
  }
}

export const alertEngine = new AlertEngine();
