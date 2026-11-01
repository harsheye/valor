import crypto from 'crypto';
import { globalEventBus } from './eventBus.js';

/**
 * Enterprise Playback Quality, Content Insights, Geo & Infra Analytics Manager
 */
export class AnalyticsAndAdminManager {
  constructor(options = {}) {
    this.playbackSessions = new Map(); // sessionId -> stream info
    this.errorGroups = new Map(); // fingerprint -> error group
    this.maintenanceConfig = {
      enabled: false,
      message: 'Valor is currently undergoing scheduled platform maintenance. We will be back online shortly.',
      estimatedEndTime: null,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system'
    };
    this.announcements = [
      {
        id: 'ann_welcome',
        title: 'Valor v2.0 Real-Time Event Portal',
        message: 'Welcome to the newly upgraded high-performance event-driven admin dashboard.',
        audience: 'all', // all, guests, logged_in
        dismissible: 'daily', // once, daily, never
        startsAt: new Date(Date.now() - 3600000).toISOString(),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        enabled: true
      }
    ];
    this.dataRetentionConfig = {
      rawLogsRetentionDays: 30,
      aggregatesRetentionDays: 365,
      autoPruneEnabled: true,
      estimatedStorageMb: 142.8
    };

    this.initSampleErrors();
    this.initSampleSessions();
  }

  initSampleSessions() {
    const samples = [
      {
        sessionId: 'sess_live_101',
        userId: 'usr_sarah',
        profileName: 'Sarah K.',
        device: 'MacBook Pro',
        browser: 'Chrome 133',
        os: 'macOS',
        ip: '73.189.44.12',
        country: 'United States',
        countryCode: 'US',
        city: 'San Francisco',
        title: 'Arcane: League of Legends - S02E06',
        positionSeconds: 1420,
        durationSeconds: 2400,
        quality: '4K HDR (2160p)',
        bitrateKbps: 18500,
        startupTimeMs: 420,
        bufferingRatioPct: 0.1,
        status: 'streaming',
        startedAt: new Date(Date.now() - 1420000).toISOString()
      },
      {
        sessionId: 'sess_live_102',
        userId: 'usr_marcus',
        profileName: 'Marcus Chen',
        device: 'LG OLED Smart TV',
        browser: 'WebOS Browser',
        os: 'LG webOS',
        ip: '88.132.90.15',
        country: 'Germany',
        countryCode: 'DE',
        city: 'Frankfurt',
        title: 'Dune: Part Two (2024)',
        positionSeconds: 5820,
        durationSeconds: 9960,
        quality: '1080p Full HD',
        bitrateKbps: 6800,
        startupTimeMs: 680,
        bufferingRatioPct: 0.4,
        status: 'streaming',
        startedAt: new Date(Date.now() - 5820000).toISOString()
      },
      {
        sessionId: 'sess_live_103',
        userId: 'usr_elena',
        profileName: 'Elena Rostova',
        device: 'iPhone 16 Pro',
        browser: 'Mobile Safari',
        os: 'iOS',
        ip: '178.62.204.81',
        country: 'United Kingdom',
        countryCode: 'GB',
        city: 'London',
        title: 'Severance - S02E01',
        positionSeconds: 840,
        durationSeconds: 3120,
        quality: '1080p',
        bitrateKbps: 4500,
        startupTimeMs: 310,
        bufferingRatioPct: 0.05,
        status: 'streaming',
        startedAt: new Date(Date.now() - 840000).toISOString()
      }
    ];

    for (const s of samples) {
      this.playbackSessions.set(s.sessionId, s);
    }
  }

  initSampleErrors() {
    const errors = [
      {
        fingerprint: 'ERR_HLS_MANIFEST_TIMEOUT',
        errorName: 'HLSManifestTimeoutError',
        message: 'Upstream remote manifest fetch timed out after 5000ms',
        count: 48,
        firstSeen: new Date(Date.now() - 86400000 * 2).toISOString(),
        lastSeen: new Date(Date.now() - 600000).toISOString(),
        affectedUsers: 14,
        status: 'active',
        sampleRequest: {
          method: 'GET',
          url: '/api/vlr/live/stream.m3u8?id=29481',
          clientIp: '192.0.2.14',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      {
        fingerprint: 'ERR_SUBTITLE_SRT_MALFORMED',
        errorName: 'SubtitleParserError',
        message: 'Invalid timing header timestamp format in external SRT stream',
        count: 19,
        firstSeen: new Date(Date.now() - 86400000 * 3).toISOString(),
        lastSeen: new Date(Date.now() - 3600000).toISOString(),
        affectedUsers: 7,
        status: 'resolved',
        sampleRequest: {
          method: 'GET',
          url: '/api/proxy?url=https://subtitles.org/download/eng.srt',
          clientIp: '198.51.100.8',
          userAgent: 'ExoPlayerLib/2.18.1'
        }
      },
      {
        fingerprint: 'ERR_TMDB_RATE_LIMIT_429',
        errorName: 'ProviderRateLimitError',
        message: 'TMDB metadata API response 429 Too Many Requests',
        count: 12,
        firstSeen: new Date(Date.now() - 1200000).toISOString(),
        lastSeen: new Date(Date.now() - 300000).toISOString(),
        affectedUsers: 9,
        status: 'active',
        sampleRequest: {
          method: 'GET',
          url: '/api/tmdb-proxy/movie/popular',
          clientIp: '127.0.0.1',
          userAgent: 'Valor-Internal/2.0'
        }
      }
    ];

    for (const err of errors) {
      this.errorGroups.set(err.fingerprint, err);
    }
  }

  /**
   * Log an error and group by fingerprint
   */
  recordError({ errorName, message, stack, request = null, clientIp = '127.0.0.1', userId = null }) {
    const fingerprint = `${errorName || 'Error'}_${(message || '').slice(0, 40).replace(/[^a-zA-Z0-9]/g, '_')}`;
    let group = this.errorGroups.get(fingerprint);

    if (group) {
      group.count++;
      group.lastSeen = new Date().toISOString();
      if (group.status === 'resolved') group.status = 'active'; // Reopen
      if (userId && !group.affectedUserIds?.includes(userId)) {
        if (!group.affectedUserIds) group.affectedUserIds = [];
        group.affectedUserIds.push(userId);
        group.affectedUsers = group.affectedUserIds.length;
      }
    } else {
      group = {
        fingerprint,
        errorName: errorName || 'GeneralError',
        message: message || 'Unknown error occurred',
        count: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        affectedUsers: 1,
        affectedUserIds: userId ? [userId] : [],
        status: 'active',
        sampleRequest: request || {
          method: 'UNKNOWN',
          url: '/unknown',
          clientIp,
          userAgent: ''
        }
      };
      this.errorGroups.set(fingerprint, group);
    }

    // Publish to event bus
    globalEventBus.publish({
      type: 'error.logged',
      actor: `client:${clientIp}`,
      subject: `error:${fingerprint}`,
      data: group
    });

    return group;
  }

  resolveError(fingerprint) {
    const group = this.errorGroups.get(fingerprint);
    if (!group) return null;
    group.status = 'resolved';
    return group;
  }

  getErrorGroups() {
    return Array.from(this.errorGroups.values()).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  }

  /**
   * Playback Quality breakdown statistics
   */
  getPlaybackQualityMetrics() {
    return {
      summary: {
        avgStartupTimeMs: 445,
        avgBufferingRatioPct: 0.18,
        avgBitrateKbps: 9420,
        playbackErrorRatePct: 0.65,
        totalSessionsTracked: 12480
      },
      byTitle: [
        { title: 'Arcane: League of Legends', startupMs: 380, bufferingPct: 0.08, bitrateKbps: 14200, errorRate: 0.2, views: 3410, isWorst: false },
        { title: 'Dune: Part Two', startupMs: 490, bufferingPct: 0.22, bitrateKbps: 18500, errorRate: 0.4, views: 2890, isWorst: false },
        { title: 'Shogun (2024)', startupMs: 410, bufferingPct: 0.12, bitrateKbps: 11000, errorRate: 0.3, views: 2450, isWorst: false },
        { title: 'The Penguin', startupMs: 890, bufferingPct: 0.78, bitrateKbps: 16000, errorRate: 2.8, views: 1820, isWorst: true }, // Worst offender
        { title: 'Severance', startupMs: 340, bufferingPct: 0.09, bitrateKbps: 8900, errorRate: 0.1, views: 1910, isWorst: false }
      ],
      byDevice: [
        { device: 'Desktop / Chrome', startupMs: 360, bufferingPct: 0.09, errorRate: 0.2, share: 46 },
        { device: 'Smart TV (WebOS / Tizen)', startupMs: 650, bufferingPct: 0.42, errorRate: 1.4, share: 28, isWorst: true },
        { device: 'Apple TV / Fire TV', startupMs: 410, bufferingPct: 0.11, errorRate: 0.3, share: 14 },
        { device: 'Mobile / Tablet', startupMs: 510, bufferingPct: 0.28, errorRate: 0.8, share: 12 }
      ],
      byRegion: [
        { region: 'North America (US/CA)', startupMs: 320, bufferingPct: 0.08, bitrateKbps: 12800, errorRate: 0.2 },
        { region: 'Europe (EU/UK)', startupMs: 390, bufferingPct: 0.14, bitrateKbps: 10400, errorRate: 0.4 },
        { region: 'Asia Pacific (JP/IN/AU)', startupMs: 620, bufferingPct: 0.45, bitrateKbps: 7600, errorRate: 1.6, isWorst: true },
        { region: 'Latin America', startupMs: 580, bufferingPct: 0.38, bitrateKbps: 8100, errorRate: 1.2 }
      ]
    };
  }

  /**
   * Content Insights
   */
  getContentInsights() {
    return {
      topTitles: [
        { title: 'Arcane: League of Legends', watchTimeHours: 14820, completionRatePct: 88, uniqueViewers: 4210 },
        { title: 'Dune: Part Two', watchTimeHours: 11950, completionRatePct: 91, uniqueViewers: 3640 },
        { title: 'Shogun (2024)', watchTimeHours: 9840, completionRatePct: 84, uniqueViewers: 2980 },
        { title: 'The Penguin', watchTimeHours: 8420, completionRatePct: 79, uniqueViewers: 2610 },
        { title: 'Severance', watchTimeHours: 7650, completionRatePct: 86, uniqueViewers: 2450 }
      ],
      topEpisodes: [
        { title: 'Arcane - S02E06 "The Message"', completionRatePct: 94, totalPlays: 3820 },
        { title: 'Shogun - S01E09 "Crimson Sky"', completionRatePct: 92, totalPlays: 3110 },
        { title: 'The Penguin - S01E04 "Cent\'Anni"', completionRatePct: 89, totalPlays: 2790 },
        { title: 'Severance - S01E09 "The We We Are"', completionRatePct: 96, totalPlays: 2540 }
      ],
      audienceBreakdown: {
        newVisitorsPct: 34,
        returningVisitorsPct: 66,
        avgDailyWatchTimeMinutes: 72
      },
      retentionCohorts: [
        { cohort: 'Week 1', d0: 100, d1: 64, d3: 48, d7: 39, d14: 31, d30: 26 },
        { cohort: 'Week 2', d0: 100, d1: 68, d3: 52, d7: 42, d14: 34, d30: 29 },
        { cohort: 'Week 3', d0: 100, d1: 71, d3: 55, d7: 46, d14: 37, d30: null },
        { cohort: 'Week 4', d0: 100, d1: 74, d3: 58, d7: 49, d14: null, d30: null }
      ]
    };
  }

  /**
   * Geographic insights (with Visitors vs Bandwidth toggle)
   */
  getGeoStats() {
    return {
      countries: [
        { country: 'United States', code: 'US', visitors: 14280, bandwidthGb: 8450.2, sharePct: 42.4 },
        { country: 'Germany', code: 'DE', visitors: 5820, bandwidthGb: 3210.8, sharePct: 17.2 },
        { country: 'United Kingdom', code: 'GB', visitors: 4910, bandwidthGb: 2890.4, sharePct: 14.5 },
        { country: 'Canada', code: 'CA', visitors: 3150, bandwidthGb: 1980.1, sharePct: 9.3 },
        { country: 'France', code: 'FR', visitors: 2640, bandwidthGb: 1640.5, sharePct: 7.8 },
        { country: 'India', code: 'IN', visitors: 2190, bandwidthGb: 1120.0, sharePct: 6.5 },
        { country: 'Japan', code: 'JP', visitors: 1840, bandwidthGb: 980.7, sharePct: 5.4 }
      ],
      cities: [
        { city: 'San Francisco', country: 'United States', visitors: 3420, bandwidthGb: 2100.5 },
        { city: 'London', country: 'United Kingdom', visitors: 2810, bandwidthGb: 1780.2 },
        { city: 'Frankfurt', country: 'Germany', visitors: 2450, bandwidthGb: 1540.0 },
        { city: 'New York', country: 'United States', visitors: 2190, bandwidthGb: 1390.8 },
        { city: 'Toronto', country: 'Canada', visitors: 1640, bandwidthGb: 1080.4 },
        { city: 'Berlin', country: 'Germany', visitors: 1410, bandwidthGb: 920.1 }
      ]
    };
  }

  /**
   * Infrastructure status and 24h history
   */
  getInfraStatus() {
    return {
      postgres: {
        status: 'healthy',
        latencyMs: 1.4,
        connections: 18,
        maxConnections: 100,
        databaseSizeMb: 384.2,
        history24h: Array(24).fill(1) // 1 = 100% up
      },
      redis: {
        status: 'healthy',
        latencyMs: 0.6,
        memoryUsedMb: 68.4,
        memoryPeakMb: 92.1,
        hitRatioPct: 94.6,
        totalKeys: 14290,
        history24h: Array(24).fill(1)
      },
      reverseProxy: {
        status: 'healthy',
        activeSockets: 42,
        requestsPerSec: 18.4,
        history24h: Array(24).fill(1)
      },
      system: {
        cpuUsagePct: 14.2,
        memoryUsageMb: 486,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform
      }
    };
  }

  /**
   * Session control: Send in-stream message to viewer
   */
  sendMessageToSession(sessionId, message, sender = 'admin') {
    const session = this.playbackSessions.get(sessionId);
    globalEventBus.publish({
      type: 'session.message',
      actor: `admin:${sender}`,
      subject: `session:${sessionId}`,
      data: {
        sessionId,
        message,
        timestamp: new Date().toISOString()
      }
    });
    return { success: true, sessionId, message };
  }

  /**
   * Terminate stream session
   */
  terminateSession(sessionId, reason = 'Administrative termination', sender = 'admin') {
    const session = this.playbackSessions.get(sessionId);
    this.playbackSessions.delete(sessionId);

    globalEventBus.publish({
      type: 'session.closed',
      actor: `admin:${sender}`,
      subject: `session:${sessionId}`,
      data: {
        sessionId,
        reason,
        closedAt: new Date().toISOString()
      }
    });

    return { success: true, sessionId, reason };
  }

  getOpenSessions() {
    return Array.from(this.playbackSessions.values());
  }

  /**
   * Maintenance Mode Toggle
   */
  setMaintenanceMode({ enabled, message = null, estimatedEndTime = null, actor = 'admin' }) {
    this.maintenanceConfig.enabled = Boolean(enabled);
    if (message) this.maintenanceConfig.message = message;
    this.maintenanceConfig.estimatedEndTime = estimatedEndTime;
    this.maintenanceConfig.updatedAt = new Date().toISOString();
    this.maintenanceConfig.updatedBy = actor;

    globalEventBus.publish({
      type: 'maintenance.changed',
      actor,
      subject: 'system:maintenance',
      data: this.maintenanceConfig
    });

    return this.maintenanceConfig;
  }

  getMaintenanceConfig() {
    return this.maintenanceConfig;
  }

  /**
   * Announcements
   */
  getAnnouncements() {
    return this.announcements;
  }

  saveAnnouncement(announcement, actor = 'admin') {
    const id = announcement.id || `ann_${Date.now()}`;
    const ann = {
      ...announcement,
      id,
      enabled: announcement.enabled !== undefined ? announcement.enabled : true
    };
    const idx = this.announcements.findIndex(a => a.id === id);
    if (idx >= 0) {
      this.announcements[idx] = ann;
    } else {
      this.announcements.unshift(ann);
    }

    globalEventBus.publish({
      type: 'announcement.updated',
      actor,
      subject: `announcement:${id}`,
      data: ann
    });

    return ann;
  }

  deleteAnnouncement(id) {
    this.announcements = this.announcements.filter(a => a.id !== id);
    return { success: true, id };
  }

  /**
   * Data Retention
   */
  getDataRetentionConfig() {
    return this.dataRetentionConfig;
  }

  updateDataRetentionConfig(config, actor = 'admin') {
    if (config.rawLogsRetentionDays !== undefined) this.dataRetentionConfig.rawLogsRetentionDays = Number(config.rawLogsRetentionDays);
    if (config.aggregatesRetentionDays !== undefined) this.dataRetentionConfig.aggregatesRetentionDays = Number(config.aggregatesRetentionDays);
    if (config.autoPruneEnabled !== undefined) this.dataRetentionConfig.autoPruneEnabled = Boolean(config.autoPruneEnabled);

    // Calculate approximate storage
    this.dataRetentionConfig.estimatedStorageMb = Number((this.dataRetentionConfig.rawLogsRetentionDays * 4.2 + this.dataRetentionConfig.aggregatesRetentionDays * 0.15).toFixed(1));

    globalEventBus.publish({
      type: 'config.changed',
      actor,
      subject: 'config:data_retention',
      data: this.dataRetentionConfig
    });

    return this.dataRetentionConfig;
  }
}

export const analyticsAndAdminManager = new AnalyticsAndAdminManager();
