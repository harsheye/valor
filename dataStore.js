// ==============================================================================
// Valor Enterprise Data Store (PostgreSQL + Redis Lazy Loading Cache + Fallback)
// ==============================================================================

import pg from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';
import { lookupIpIntelligence, getFlagEmoji } from './geoLookup.js';

const { Pool } = pg;

export class DataStore {
  constructor(options = {}) {
    this.pgUrl = options.pgUrl || process.env.DATABASE_URL || 'postgresql://valor_user:ValorPass2026!@localhost:5432/valor';
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || 'redis://app_user:AppPass2026!@localhost:6379';
    this.sqliteDb = options.sqliteDb || null;

    this.pgPool = null;
    this.redis = null;
    this.isPgConnected = false;
    this.isRedisConnected = false;

    this.CACHE_TTL = {
      PROFILES: 300,        // 5 minutes
      PROFILE_DATA: 3600,   // 1 hour
      SETTINGS: 3600,       // 1 hour
      SESSION: 86400,       // 24 hours
      ACCOUNT: 1800         // 30 minutes
    };
  }

  async initialize() {
    // 1. Initialize PostgreSQL
    try {
      this.pgPool = new Pool({
        connectionString: this.pgUrl,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
      });

      const client = await this.pgPool.connect();
      const res = await client.query('SELECT NOW() AS now, current_database() AS db;');
      client.release();
      this.isPgConnected = true;
      console.log(`\x1b[32m[PostgreSQL]\x1b[0m Connected to Docker PostgreSQL database "${res.rows[0].db}" at localhost:5432`);
    } catch (err) {
      this.isPgConnected = false;
      console.warn(`\x1b[33m[PostgreSQL Warning]\x1b[0m Could not connect to Docker Postgres (${err.message}). Using local storage fallback.`);
    }

    // 2. Initialize Redis (Lazy Loading Cache)
    try {
      this.redis = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 2,
        connectTimeout: 3000,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
      });

      this.redis.on('error', (err) => {
        if (!this.isRedisConnected) {
          // Suppress noise on initial failed connection
        }
      });

      const ping = await this.redis.ping();
      if (ping === 'PONG') {
        this.isRedisConnected = true;
        console.log(`\x1b[32m[Redis Cache]\x1b[0m Connected to Docker Redis server at localhost:6379 (Lazy Loading enabled)`);
      }
    } catch (err) {
      this.isRedisConnected = false;
      console.warn(`\x1b[33m[Redis Warning]\x1b[0m Could not connect to Docker Redis (${err.message}). Lazy caching disabled.`);
    }

    // Run table verification for both PostgreSQL and SQLite
    await this.ensureTables();

    // Run background geo intelligence backfill
    this.backfillGeoIntelligence().catch(err => {
      console.warn('[Geo Intelligence Backfill]', err.message);
    });
  }

  async ensureTables() {
    if (this.isPgConnected && this.pgPool) {
      const initSql = `
      CREATE TABLE IF NOT EXISTS profiles (
          user_id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          username VARCHAR(255),
          password VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS accounts (
          username VARCHAR(255) PRIMARY KEY,
          password VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
          user_id VARCHAR(64) PRIMARY KEY,
          settings_json JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS history (
          user_id VARCHAR(64) NOT NULL,
          video_id VARCHAR(255) NOT NULL,
          title TEXT NOT NULL,
          url TEXT,
          type VARCHAR(64) DEFAULT 'local',
          file_name TEXT,
          duration DOUBLE PRECISION,
          "currentTime" DOUBLE PRECISION DEFAULT 0,
          last_played_date TIMESTAMP WITH TIME ZONE,
          total_time_watched DOUBLE PRECISION DEFAULT 0,
          rating INTEGER,
          time_to_finish DOUBLE PRECISION,
          sessions JSONB DEFAULT '[]'::jsonb,
          local_file_path TEXT,
          played_dates JSONB DEFAULT '[]'::jsonb,
          format VARCHAR(64),
          streams JSONB DEFAULT '[]'::jsonb,
          audio_tracks JSONB DEFAULT '[]'::jsonb,
          subtitle_tracks JSONB DEFAULT '[]'::jsonb,
          episode INTEGER,
          season INTEGER,
          color VARCHAR(32),
          tmdb_id INTEGER,
          has_scrobbled_trakt BOOLEAN DEFAULT FALSE,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, video_id)
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
          user_id VARCHAR(64) NOT NULL,
          video_id VARCHAR(255) NOT NULL,
          id VARCHAR(128) NOT NULL,
          time DOUBLE PRECISION NOT NULL,
          end_time DOUBLE PRECISION,
          label TEXT NOT NULL,
          is_intro BOOLEAN DEFAULT FALSE,
          is_outro BOOLEAN DEFAULT FALSE,
          skip_enabled BOOLEAN DEFAULT FALSE,
          title TEXT,
          description TEXT,
          category VARCHAR(64),
          start_time DOUBLE PRECISION,
          thumbnail TEXT,
          favorite BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          episode INTEGER,
          season INTEGER,
          color VARCHAR(32),
          tmdb_id INTEGER,
          user_name VARCHAR(255),
          user_time TEXT,
          media_name TEXT,
          created_by VARCHAR(64) DEFAULT 'manual',
          PRIMARY KEY (user_id, video_id, id)
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
          username VARCHAR(255) PRIMARY KEY,
          attempts INTEGER DEFAULT 0,
          locked_until TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
          token VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          username VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analytics_sessions (
          session_id VARCHAR(128) PRIMARY KEY,
          ip VARCHAR(64),
          user_agent TEXT,
          browser VARCHAR(64),
          os VARCHAR(64),
          device VARCHAR(64),
          user_id VARCHAR(64),
          profile_name VARCHAR(255),
          first_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          total_duration_seconds INT DEFAULT 0,
          total_requests INT DEFAULT 0,
          bytes_transferred BIGINT DEFAULT 0,
          current_path TEXT
      );

      CREATE TABLE IF NOT EXISTS analytics_devices (
          device_id VARCHAR(128) PRIMARY KEY,
          first_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          visit_count INT DEFAULT 1,
          total_duration_seconds INT DEFAULT 0,
          total_requests INT DEFAULT 1,
          bytes_transferred BIGINT DEFAULT 0,
          last_ip VARCHAR(64),
          ips JSONB DEFAULT '[]'::jsonb,
          user_agent TEXT,
          browser VARCHAR(64),
          os VARCHAR(64),
          device VARCHAR(64) DEFAULT 'Desktop',
          user_id VARCHAR(64),
          profile_name VARCHAR(255),
          embed_calls_count INT DEFAULT 0,
          embed_referers JSONB DEFAULT '[]'::jsonb,
          last_path TEXT
      );

      CREATE TABLE IF NOT EXISTS analytics_traffic_logs (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(128),
          ip VARCHAR(64),
          method VARCHAR(16),
          path TEXT,
          status_code INT,
          latency_ms INT,
          bytes_transferred BIGINT DEFAULT 0,
          user_agent TEXT,
          browser VARCHAR(64),
          os VARCHAR(64),
          user_id VARCHAR(64),
          device VARCHAR(64) DEFAULT 'Desktop',
          device_id VARCHAR(128),
          referer TEXT,
          is_embed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_traffic_created ON analytics_traffic_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_analytics_devices_last_seen ON analytics_devices(last_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_analytics_devices_visits ON analytics_devices(visit_count DESC);
      CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen ON analytics_sessions(last_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_tmdb ON bookmarks(tmdb_id, season, episode);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_video_id ON bookmarks(video_id);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_created_by ON bookmarks(created_by);
        CREATE TABLE IF NOT EXISTS webhooks (
            id VARCHAR(128) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            url TEXT NOT NULL,
            secret TEXT,
            events JSONB DEFAULT '["*"]'::jsonb,
            enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            last_triggered TIMESTAMP WITH TIME ZONE,
            total_deliveries INT DEFAULT 0,
            failed_deliveries INT DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS webhook_deliveries (
            id VARCHAR(128) PRIMARY KEY,
            webhook_id VARCHAR(128),
            webhook_name VARCHAR(255),
            event VARCHAR(64),
            status VARCHAR(32),
            status_code INT,
            latency_ms INT,
            payload TEXT,
            response_body TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS blocked_ips (
            ip VARCHAR(64) PRIMARY KEY,
            reason TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;
      try {
        await this.pgPool.query(initSql);
        await this.pgPool.query(`ALTER TABLE analytics_traffic_logs ADD COLUMN IF NOT EXISTS device VARCHAR(64) DEFAULT 'Desktop';`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_traffic_logs ADD COLUMN IF NOT EXISTS device_id VARCHAR(128);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_traffic_logs ADD COLUMN IF NOT EXISTS referer TEXT;`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_traffic_logs ADD COLUMN IF NOT EXISTS is_embed BOOLEAN DEFAULT FALSE;`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_traffic_logs ADD COLUMN IF NOT EXISTS country VARCHAR(64);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_traffic_logs ADD COLUMN IF NOT EXISTS country_code VARCHAR(8);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_traffic_logs ADD COLUMN IF NOT EXISTS city VARCHAR(128);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_traffic_logs ADD COLUMN IF NOT EXISTS region VARCHAR(128);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_traffic_logs ADD COLUMN IF NOT EXISTS isp VARCHAR(255);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_traffic_logs ADD COLUMN IF NOT EXISTS reverse_dns TEXT;`).catch(() => {});

        await this.pgPool.query(`ALTER TABLE analytics_devices ADD COLUMN IF NOT EXISTS country VARCHAR(64);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_devices ADD COLUMN IF NOT EXISTS country_code VARCHAR(8);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_devices ADD COLUMN IF NOT EXISTS city VARCHAR(128);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_devices ADD COLUMN IF NOT EXISTS region VARCHAR(128);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_devices ADD COLUMN IF NOT EXISTS isp VARCHAR(255);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_devices ADD COLUMN IF NOT EXISTS org VARCHAR(255);`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_devices ADD COLUMN IF NOT EXISTS lat NUMERIC;`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_devices ADD COLUMN IF NOT EXISTS lon NUMERIC;`).catch(() => {});
        await this.pgPool.query(`ALTER TABLE analytics_devices ADD COLUMN IF NOT EXISTS reverse_dns TEXT;`).catch(() => {});
        await this.pgPool.query(`CREATE INDEX IF NOT EXISTS idx_analytics_traffic_device_id ON analytics_traffic_logs(device_id);`).catch(() => {});
        await this.pgPool.query(`CREATE INDEX IF NOT EXISTS idx_bookmarks_tmdb ON bookmarks(tmdb_id, season, episode);`).catch(() => {});
        await this.pgPool.query(`CREATE INDEX IF NOT EXISTS idx_bookmarks_video_id ON bookmarks(video_id);`).catch(() => {});
        await this.pgPool.query(`CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category);`).catch(() => {});
        await this.pgPool.query(`CREATE INDEX IF NOT EXISTS idx_bookmarks_created_by ON bookmarks(created_by);`).catch(() => {});
      } catch (e) {
        console.error('[PostgreSQL] Failed ensuring tables:', e.message);
      }
    }

    if (this.sqliteDb) {
      try {
        this.sqliteDb.exec(`
          CREATE TABLE IF NOT EXISTS blocked_ips (
            ip TEXT PRIMARY KEY,
            reason TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS analytics_sessions (
            session_id TEXT PRIMARY KEY,
            ip TEXT,
            user_agent TEXT,
            browser TEXT,
            os TEXT,
            device TEXT DEFAULT 'Desktop',
            user_id TEXT,
            profile_name TEXT,
            first_seen TEXT DEFAULT (datetime('now')),
            last_seen TEXT DEFAULT (datetime('now')),
            total_duration_seconds INTEGER DEFAULT 0,
            total_requests INTEGER DEFAULT 1,
            bytes_transferred INTEGER DEFAULT 0,
            current_path TEXT,
            country TEXT,
            country_code TEXT,
            city TEXT,
            region TEXT,
            isp TEXT,
            reverse_dns TEXT
          );

          CREATE TABLE IF NOT EXISTS analytics_devices (
            device_id TEXT PRIMARY KEY,
            first_seen TEXT DEFAULT (datetime('now')),
            last_seen TEXT DEFAULT (datetime('now')),
            visit_count INTEGER DEFAULT 1,
            total_duration_seconds INTEGER DEFAULT 0,
            total_requests INTEGER DEFAULT 1,
            bytes_transferred INTEGER DEFAULT 0,
            last_ip TEXT,
            ips TEXT DEFAULT '[]',
            user_agent TEXT,
            browser TEXT,
            os TEXT,
            device TEXT DEFAULT 'Desktop',
            user_id TEXT,
            profile_name TEXT,
            embed_calls_count INTEGER DEFAULT 0,
            embed_referers TEXT DEFAULT '[]',
            last_path TEXT,
            country TEXT,
            country_code TEXT,
            city TEXT,
            region TEXT,
            isp TEXT,
            org TEXT,
            lat REAL,
            lon REAL,
            reverse_dns TEXT
          );

          CREATE TABLE IF NOT EXISTS analytics_traffic_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            ip TEXT,
            method TEXT,
            path TEXT,
            status_code INTEGER,
            latency_ms INTEGER,
            bytes_transferred INTEGER DEFAULT 0,
            user_agent TEXT,
            browser TEXT,
            os TEXT,
            user_id TEXT,
            device TEXT DEFAULT 'Desktop',
            device_id TEXT,
            referer TEXT,
            is_embed INTEGER DEFAULT 0,
            country TEXT,
            country_code TEXT,
            city TEXT,
            region TEXT,
            isp TEXT,
            reverse_dns TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS webhooks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            secret TEXT,
            events TEXT DEFAULT '["*"]',
            enabled INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            last_triggered TEXT,
            total_deliveries INTEGER DEFAULT 0,
            failed_deliveries INTEGER DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS webhook_deliveries (
            id TEXT PRIMARY KEY,
            webhook_id TEXT,
            webhook_name TEXT,
            event TEXT,
            status TEXT,
            status_code INTEGER,
            latency_ms INTEGER,
            payload TEXT,
            response_body TEXT,
            created_at TEXT DEFAULT (datetime('now'))
          );
        `);

        // Migration columns
        const sqliteAlterColumns = [
          "ALTER TABLE analytics_devices ADD COLUMN country TEXT",
          "ALTER TABLE analytics_devices ADD COLUMN country_code TEXT",
          "ALTER TABLE analytics_devices ADD COLUMN city TEXT",
          "ALTER TABLE analytics_devices ADD COLUMN region TEXT",
          "ALTER TABLE analytics_devices ADD COLUMN isp TEXT",
          "ALTER TABLE analytics_devices ADD COLUMN org TEXT",
          "ALTER TABLE analytics_devices ADD COLUMN lat REAL",
          "ALTER TABLE analytics_devices ADD COLUMN lon REAL",
          "ALTER TABLE analytics_devices ADD COLUMN reverse_dns TEXT",
          "ALTER TABLE analytics_sessions ADD COLUMN country TEXT",
          "ALTER TABLE analytics_sessions ADD COLUMN country_code TEXT",
          "ALTER TABLE analytics_sessions ADD COLUMN city TEXT",
          "ALTER TABLE analytics_sessions ADD COLUMN region TEXT",
          "ALTER TABLE analytics_sessions ADD COLUMN isp TEXT",
          "ALTER TABLE analytics_sessions ADD COLUMN reverse_dns TEXT",
          "ALTER TABLE analytics_traffic_logs ADD COLUMN country TEXT",
          "ALTER TABLE analytics_traffic_logs ADD COLUMN country_code TEXT",
          "ALTER TABLE analytics_traffic_logs ADD COLUMN city TEXT",
          "ALTER TABLE analytics_traffic_logs ADD COLUMN region TEXT",
          "ALTER TABLE analytics_traffic_logs ADD COLUMN isp TEXT",
          "ALTER TABLE analytics_traffic_logs ADD COLUMN reverse_dns TEXT",
          "ALTER TABLE analytics_traffic_logs ADD COLUMN device TEXT DEFAULT 'Desktop'",
          "ALTER TABLE analytics_traffic_logs ADD COLUMN device_id TEXT",
          "ALTER TABLE analytics_traffic_logs ADD COLUMN referer TEXT",
          "ALTER TABLE analytics_traffic_logs ADD COLUMN is_embed INTEGER DEFAULT 0",
          "ALTER TABLE bookmarks ADD COLUMN createdBy TEXT DEFAULT 'manual'",
          "CREATE INDEX IF NOT EXISTS idx_bookmarks_tmdb ON bookmarks(tmdbId, season, episode)",
          "CREATE INDEX IF NOT EXISTS idx_bookmarks_videoId ON bookmarks(videoId)",
          "CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category)"
        ];
        for (const alterSql of sqliteAlterColumns) {
          try { this.sqliteDb.exec(alterSql); } catch (e) {}
        }
      } catch (e) {
        console.error('[SQLite] Failed ensuring tables:', e.message);
      }
    }

    // Prime in-memory cache of blocked IPs
    try {
      await this.isIpBlocked('0.0.0.0');
    } catch (e) {}
  }

  async backfillGeoIntelligence() {
    if (this.sqliteDb) {
      try {
        const devs = this.sqliteDb.prepare("SELECT device_id, last_ip FROM analytics_devices WHERE country IS NULL OR country = ''").all();
        for (const dev of devs) {
          if (dev.last_ip) {
            const geo = await lookupIpIntelligence(dev.last_ip);
            this.sqliteDb.prepare(`
              UPDATE analytics_devices SET
                country = ?, country_code = ?, city = ?, region = ?, isp = ?, org = ?, lat = ?, lon = ?, reverse_dns = ?
              WHERE device_id = ?
            `).run(geo.country, geo.countryCode, geo.city, geo.region, geo.isp, geo.org, geo.lat, geo.lon, geo.reverseDns, dev.device_id);
          }
        }

        const logs = this.sqliteDb.prepare("SELECT DISTINCT ip FROM analytics_traffic_logs WHERE (country IS NULL OR country = '') AND ip IS NOT NULL LIMIT 50").all();
        for (const log of logs) {
          if (log.ip) {
            const geo = await lookupIpIntelligence(log.ip);
            this.sqliteDb.prepare(`
              UPDATE analytics_traffic_logs SET
                country = ?, country_code = ?, city = ?, region = ?, isp = ?, reverse_dns = ?
              WHERE ip = ?
            `).run(geo.country, geo.countryCode, geo.city, geo.region, geo.isp, geo.reverseDns, log.ip);
          }
        }
      } catch (e) {}
    }
  }

  // --------------------------------------------------------------------------
  // Redis Lazy Cache Helpers
  // --------------------------------------------------------------------------
  async cacheGet(key) {
    if (!this.isRedisConnected || !this.redis) return null;
    try {
      const data = await this.redis.get(key);
      if (data) {
        // Increment hit counter asynchronously
        this.redis.incr('valor:stats:cache_hits').catch(() => {});
        return JSON.parse(data);
      }
      this.redis.incr('valor:stats:cache_misses').catch(() => {});
      return null;
    } catch (e) {
      return null;
    }
  }

  async cacheSet(key, value, ttlSeconds = 3600) {
    if (!this.isRedisConnected || !this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (e) {
      // Ignore cache write error
    }
  }

  async cacheDel(patternOrKey) {
    if (!this.isRedisConnected || !this.redis) return;
    try {
      if (patternOrKey.includes('*')) {
        const keys = await this.redis.keys(patternOrKey);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } else {
        await this.redis.del(patternOrKey);
      }
    } catch (e) {}
  }

  // --------------------------------------------------------------------------
  // Profile Management (with Lazy Loading)
  // --------------------------------------------------------------------------
  async getProfiles(username = null) {
    const cacheKey = username ? `valor:cache:profiles:u_${username}` : 'valor:cache:profiles:all';
    
    // 1. Check Redis Cache
    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Query Postgres
    if (this.isPgConnected) {
      try {
        let query = 'SELECT user_id AS "userId", name, username, (password IS NOT NULL AND password != \'\') AS "hasPassword", created_at AS "createdAt" FROM profiles';
        let params = [];
        if (username) {
          query += ' WHERE username = $1';
          params.push(username);
        }
        query += ' ORDER BY created_at ASC';
        
        const res = await this.pgPool.query(query, params);
        const profiles = res.rows;

        // 3. Lazy Load into Redis Cache
        await this.cacheSet(cacheKey, profiles, this.CACHE_TTL.PROFILES);
        return profiles;
      } catch (err) {
        console.error('[PostgreSQL] getProfiles error:', err.message);
      }
    }

    // Fallback to SQLite
    if (this.sqliteDb) {
      try {
        if (username) {
          return this.sqliteDb.prepare("SELECT userId, name, username, (password IS NOT NULL AND password != '') AS hasPassword, createdAt FROM profiles WHERE username = ?").all(username);
        } else {
          return this.sqliteDb.prepare("SELECT userId, name, username, (password IS NOT NULL AND password != '') AS hasPassword, createdAt FROM profiles").all();
        }
      } catch (e) {
        return [];
      }
    }

    return [];
  }

  async createProfile(userId, name, username = null, password = null) {
    if (this.isPgConnected) {
      try {
        await this.pgPool.query(
          `INSERT INTO profiles (user_id, name, username, password) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, username = EXCLUDED.username, password = EXCLUDED.password`,
          [userId, name, username, password]
        );
        // Invalidate Redis profile caches
        await this.cacheDel('valor:cache:profiles:*');
        await this.cacheDel(`valor:cache:profile_data:${userId}`);
        return { userId, name, username };
      } catch (e) {
        console.error('[PostgreSQL] createProfile error:', e.message);
      }
    }

    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('INSERT OR REPLACE INTO profiles (userId, name, username, password) VALUES (?, ?, ?, ?)').run(userId, name, username, password);
      } catch (e) {}
    }

    return { userId, name, username };
  }

  // --------------------------------------------------------------------------
  // User Profile Data & Playback History (with Lazy Loading)
  // --------------------------------------------------------------------------
  async getProfileData(userId) {
    const cacheKey = `valor:cache:profile_data:${userId}`;

    // 1. Check Redis Cache
    const cached = await this.cacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Query Postgres
    if (this.isPgConnected) {
      try {
        // Fetch Settings
        const settingsRes = await this.pgPool.query('SELECT settings_json FROM settings WHERE user_id = $1', [userId]);
        const settings = settingsRes.rows.length > 0 ? settingsRes.rows[0].settings_json : {};

        // Fetch History
        const historyRes = await this.pgPool.query('SELECT * FROM history WHERE user_id = $1 ORDER BY last_played_date DESC NULLS LAST', [userId]);
        
        // Fetch Bookmarks
        const bookmarksRes = await this.pgPool.query('SELECT * FROM bookmarks WHERE user_id = $1', [userId]);
        const bookmarksRows = bookmarksRes.rows;

        const videos = historyRes.rows.map(row => {
          const videoBookmarks = bookmarksRows
            .filter(bm => bm.video_id === row.video_id)
            .map(bm => ({
              id: bm.id,
              time: bm.time,
              endTime: bm.end_time,
              label: bm.label,
              isIntro: bm.is_intro,
              isOutro: bm.is_outro,
              skipEnabled: bm.skip_enabled,
              title: bm.title,
              description: bm.description,
              category: bm.category,
              thumbnail: bm.thumbnail,
              favorite: bm.favorite,
              createdAt: bm.created_at,
              updatedAt: bm.updated_at,
              userName: bm.user_name,
              userTime: bm.user_time,
              mediaName: bm.media_name,
              tmdbId: bm.tmdb_id,
              episode: bm.episode,
              season: bm.season,
              color: bm.color,
              userId: bm.user_id,
              createdBy: bm.created_by || 'manual'
            }));

          return {
            id: row.video_id,
            title: row.title,
            url: row.url || '',
            type: row.type || 'local',
            fileName: row.file_name || '',
            duration: row.duration,
            currentTime: row.currentTime || row.current_time || 0,
            lastPlayedDate: row.last_played_date,
            totalTimeWatched: row.total_time_watched,
            rating: row.rating,
            timeToFinish: row.time_to_finish,
            sessions: row.sessions || [],
            localFilePath: row.local_file_path,
            playedDates: row.played_dates || [],
            format: row.format || null,
            streams: row.streams || [],
            audioTracks: row.audio_tracks || [],
            subtitleTracks: row.subtitle_tracks || [],
            episode: row.episode,
            season: row.season,
            color: row.color,
            tmdbId: row.tmdb_id,
            hasScrobbledTrakt: row.has_scrobbled_trakt,
            bookmarks: videoBookmarks
          };
        });

        const result = { settings, history: videos };

        // 3. Lazy Load into Redis Cache
        await this.cacheSet(cacheKey, result, this.CACHE_TTL.PROFILE_DATA);
        return result;
      } catch (err) {
        console.error('[PostgreSQL] getProfileData error:', err.message);
      }
    }

    // Fallback to SQLite
    if (this.sqliteDb) {
      try {
        const settingsRow = this.sqliteDb.prepare('SELECT settingsJson FROM settings WHERE userId = ?').get(userId);
        const settings = settingsRow ? JSON.parse(settingsRow.settingsJson) : {};
        const historyRows = this.sqliteDb.prepare('SELECT * FROM history WHERE userId = ?').all(userId);
        const bookmarksRows = this.sqliteDb.prepare('SELECT * FROM bookmarks WHERE userId = ?').all(userId);

        const videos = historyRows.map(row => ({
          id: row.videoId,
          title: row.title,
          url: row.url || '',
          type: row.type || 'local',
          fileName: row.fileName || '',
          duration: row.duration,
          currentTime: row.currentTime,
          lastPlayedDate: row.lastPlayedDate,
          totalTimeWatched: row.totalTimeWatched,
          rating: row.rating,
          timeToFinish: row.timeToFinish,
          sessions: row.sessions ? JSON.parse(row.sessions) : [],
          localFilePath: row.localFilePath,
          playedDates: row.playedDates ? JSON.parse(row.playedDates) : [],
          format: row.format || null,
          streams: row.streams ? JSON.parse(row.streams) : [],
          audioTracks: row.audioTracks ? JSON.parse(row.audioTracks) : [],
          subtitleTracks: row.subtitleTracks ? JSON.parse(row.subtitleTracks) : [],
          episode: row.episode,
          season: row.season,
          color: row.color,
          tmdbId: row.tmdbId,
          hasScrobbledTrakt: row.hasScrobbledTrakt === 1,
          bookmarks: bookmarksRows.filter(bm => bm.videoId === row.videoId)
        }));

        return { settings, history: videos };
      } catch (e) {
        return { settings: {}, history: [] };
      }
    }

    return { settings: {}, history: [] };
  }

  async saveSettings(userId, settings) {
    if (!userId || userId === 'local' || userId.startsWith('local_')) return;

    if (this.isPgConnected) {
      try {
        await this.pgPool.query(
          `INSERT INTO settings (user_id, settings_json, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE SET settings_json = EXCLUDED.settings_json, updated_at = NOW()`,
          [userId, JSON.stringify(settings)]
        );
        // Invalidate Redis profile data cache
        await this.cacheDel(`valor:cache:profile_data:${userId}`);
        await this.cacheDel(`valor:cache:settings:${userId}`);
      } catch (e) {
        console.error('[PostgreSQL] saveSettings error:', e.message);
      }
    }

    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('INSERT OR REPLACE INTO settings (userId, settingsJson) VALUES (?, ?)').run(userId, JSON.stringify(settings));
      } catch (e) {}
    }
  }

  async saveHistory(userId, history) {
    if (!userId || userId === 'local' || userId.startsWith('local_')) return;

    if (this.isPgConnected) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM history WHERE user_id = $1', [userId]);

        const insertQuery = `
          INSERT INTO history (
            user_id, video_id, title, url, type, file_name, duration, "currentTime",
            last_played_date, total_time_watched, rating, time_to_finish, sessions,
            local_file_path, played_dates, format, streams, audio_tracks, subtitle_tracks,
            episode, season, color, tmdb_id, has_scrobbled_trakt
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24
          )
        `;

        for (const v of history) {
          await client.query(insertQuery, [
            userId,
            v.id,
            v.title || '',
            v.url || '',
            v.type || 'local',
            v.fileName || '',
            v.duration || 0,
            v.currentTime || 0,
            v.lastPlayedDate ? new Date(v.lastPlayedDate) : new Date(),
            v.totalTimeWatched || 0,
            v.rating || null,
            v.timeToFinish || null,
            JSON.stringify(v.sessions || []),
            v.localFilePath || null,
            JSON.stringify(v.playedDates || []),
            v.format || null,
            JSON.stringify(v.streams || []),
            JSON.stringify(v.audioTracks || []),
            JSON.stringify(v.subtitleTracks || []),
            v.episode || null,
            v.season || null,
            v.color || null,
            v.tmdbId || null,
            Boolean(v.hasScrobbledTrakt)
          ]);

          // Persist video bookmarks to PostgreSQL if present
          if (Array.isArray(v.bookmarks) && v.bookmarks.length > 0) {
            const upsertBookmarkPg = `
              INSERT INTO bookmarks (
                user_id, video_id, id, time, end_time, label, is_intro, is_outro, skip_enabled,
                title, description, category, start_time, thumbnail, favorite,
                updated_at, episode, season, color, tmdb_id, user_name, user_time, media_name, created_by
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, $16, $17, $18, $19, $20, $21, $22, $23)
              ON CONFLICT (user_id, video_id, id) DO UPDATE SET
                time = EXCLUDED.time, end_time = EXCLUDED.end_time, label = EXCLUDED.label,
                is_intro = EXCLUDED.is_intro, is_outro = EXCLUDED.is_outro, skip_enabled = EXCLUDED.skip_enabled,
                title = EXCLUDED.title, description = EXCLUDED.description, category = EXCLUDED.category,
                start_time = EXCLUDED.start_time, thumbnail = EXCLUDED.thumbnail, favorite = EXCLUDED.favorite,
                updated_at = CURRENT_TIMESTAMP, episode = EXCLUDED.episode, season = EXCLUDED.season,
                color = EXCLUDED.color, tmdb_id = EXCLUDED.tmdb_id, user_name = EXCLUDED.user_name,
                user_time = EXCLUDED.user_time, media_name = EXCLUDED.media_name, created_by = EXCLUDED.created_by
            `;
            for (const bm of v.bookmarks) {
              await client.query(upsertBookmarkPg, [
                userId, v.id, bm.id, Number(bm.time) || 0,
                bm.endTime !== undefined && bm.endTime !== null ? Number(bm.endTime) : null,
                bm.label || '', Boolean(bm.isIntro), Boolean(bm.isOutro), Boolean(bm.skipEnabled),
                bm.title || null, bm.description || null, bm.category || null,
                bm.startTime !== undefined && bm.startTime !== null ? Number(bm.startTime) : null,
                bm.thumbnail || null, Boolean(bm.favorite),
                v.episode || null, v.season || null, bm.color || null, v.tmdbId || null,
                bm.userName || null, bm.userTime || null, v.title || null, bm.createdBy || 'manual'
              ]).catch(() => {});
            }
          }
        }

        await client.query('COMMIT');
        // Invalidate Redis profile data cache
        await this.cacheDel(`valor:cache:profile_data:${userId}`);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('[PostgreSQL] saveHistory error:', e.message);
      } finally {
        client.release();
      }
    }

    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('DELETE FROM history WHERE userId = ?').run(userId);
        const insertHistory = this.sqliteDb.prepare(`
          INSERT INTO history (
            userId, videoId, title, url, type, fileName, duration, currentTime,
            lastPlayedDate, totalTimeWatched, rating, timeToFinish, sessions,
            localFilePath, playedDates, format, streams, audioTracks, subtitleTracks,
            episode, season, color, tmdbId, hasScrobbledTrakt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const v of history) {
          insertHistory.run(
            userId, v.id, v.title || '', v.url || '', v.type || 'local', v.fileName || '',
            v.duration || 0, v.currentTime || 0, v.lastPlayedDate || new Date().toISOString(),
            v.totalTimeWatched || 0, v.rating || null, v.timeToFinish || null,
            JSON.stringify(v.sessions || []), v.localFilePath || null, JSON.stringify(v.playedDates || []),
            v.format || null, JSON.stringify(v.streams || []), JSON.stringify(v.audioTracks || []),
            JSON.stringify(v.subtitleTracks || []), v.episode || null, v.season || null,
            v.color || null, v.tmdbId || null, v.hasScrobbledTrakt ? 1 : 0
          );

          if (Array.isArray(v.bookmarks) && v.bookmarks.length > 0) {
            const upsertStmt = this.sqliteDb.prepare(`
              INSERT OR REPLACE INTO bookmarks (
                userId, videoId, id, time, endTime, label, isIntro, isOutro, skipEnabled,
                title, description, category, startTime, thumbnail, favorite,
                createdAt, updatedAt, episode, season, color, tmdbId,
                userName, userTime, mediaName, createdBy
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const bm of v.bookmarks) {
              try {
                upsertStmt.run(
                  userId, v.id, bm.id, Number(bm.time) || 0,
                  bm.endTime !== undefined && bm.endTime !== null ? Number(bm.endTime) : null,
                  bm.label || '', bm.isIntro ? 1 : 0, bm.isOutro ? 1 : 0, bm.skipEnabled ? 1 : 0,
                  bm.title || null, bm.description || null, bm.category || null,
                  bm.startTime !== undefined && bm.startTime !== null ? Number(bm.startTime) : null,
                  bm.thumbnail || null, bm.favorite ? 1 : 0,
                  v.episode || null, v.season || null, bm.color || null, v.tmdbId || null,
                  bm.userName || null, bm.userTime || null, v.title || null, bm.createdBy || 'manual'
                );
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    }
  }

  // --------------------------------------------------------------------------
  // User Authentication & Account Management (with Redis Cached Sessions)
  // --------------------------------------------------------------------------
  async authenticateUser(username, password) {
    if (this.isPgConnected) {
      try {
        const res = await this.pgPool.query('SELECT * FROM accounts WHERE username = $1', [username]);
        if (res.rows.length === 0) {
          return { error: 'Account not found', status: 400 };
        }
        const account = res.rows[0];
        if (account.password !== password) {
          return { error: 'Incorrect username or password', status: 401 };
        }

        // Fetch or create profile
        let profileRes = await this.pgPool.query('SELECT * FROM profiles WHERE username = $1 ORDER BY created_at ASC', [username]);
        let profile = profileRes.rows[0];
        if (!profile) {
          const fallbackId = `u_${crypto.randomBytes(6).toString('hex')}`;
          await this.pgPool.query('INSERT INTO profiles (user_id, name, username, password) VALUES ($1, $2, $3, NULL)', [fallbackId, username, username]);
          profile = { user_id: fallbackId, name: username, username };
        }

        // Generate session token
        const token = `val_${crypto.randomBytes(24).toString('hex')}`;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Store session in Postgres
        await this.pgPool.query(
          'INSERT INTO user_sessions (token, user_id, username, expires_at) VALUES ($1, $2, $3, $4)',
          [token, profile.user_id, username, expiresAt]
        );

        // Cache session in Redis for instant validation
        await this.cacheSet(`valor:session:${token}`, {
          token,
          userId: profile.user_id,
          username,
          expiresAt: expiresAt.toISOString()
        }, this.CACHE_TTL.SESSION);

        return {
          success: true,
          token,
          profile: {
            userId: profile.user_id,
            name: profile.name,
            username: profile.username
          }
        };
      } catch (err) {
        console.error('[PostgreSQL] authenticateUser error:', err.message);
      }
    }

    // Fallback to SQLite
    if (this.sqliteDb) {
      try {
        const account = this.sqliteDb.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
        if (!account) return { error: 'Account not found', status: 400 };
        if (account.password !== password) return { error: 'Incorrect username or password', status: 401 };
        let profile = this.sqliteDb.prepare('SELECT * FROM profiles WHERE username = ? ORDER BY createdAt ASC').get(username);
        if (!profile) {
          const fallbackId = `u_${Math.random().toString(36).substring(2, 11)}`;
          this.sqliteDb.prepare('INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, null)').run(fallbackId, username, username);
          profile = { userId: fallbackId, name: username, username };
        }
        return {
          success: true,
          token: `val_local_${Date.now()}`,
          profile: {
            userId: profile.userId,
            name: profile.name,
            username: profile.username
          }
        };
      } catch (e) {
        return { error: 'Database error', status: 500 };
      }
    }

    return { error: 'Database service unavailable', status: 500 };
  }

  async registerAccount(username, password, email = null) {
    if (this.isPgConnected) {
      try {
        const existing = await this.pgPool.query('SELECT username FROM accounts WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
          return { error: 'Username already exists', status: 409 };
        }

        await this.pgPool.query(
          'INSERT INTO accounts (username, password, email) VALUES ($1, $2, $3)',
          [username, password, email]
        );

        const newUserId = `u_${crypto.randomBytes(6).toString('hex')}`;
        await this.createProfile(newUserId, username, username, null);

        return { success: true, username, userId: newUserId };
      } catch (err) {
        return { error: err.message, status: 500 };
      }
    }

    if (this.sqliteDb) {
      try {
        const existing = this.sqliteDb.prepare('SELECT username FROM accounts WHERE username = ?').get(username);
        if (existing) return { error: 'Username already exists', status: 409 };
        this.sqliteDb.prepare('INSERT INTO accounts (username, password) VALUES (?, ?)').run(username, password);
        const newUserId = `u_${Math.random().toString(36).substring(2, 11)}`;
        this.sqliteDb.prepare('INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, null)').run(newUserId, username, username);
        return { success: true, username, userId: newUserId };
      } catch (e) {
        return { error: e.message, status: 500 };
      }
    }

    return { error: 'Database service unavailable', status: 500 };
  }

  // --------------------------------------------------------------------------
  // Diagnostics & Telemetry
  // --------------------------------------------------------------------------
  async getStatus() {
    let pgStatus = { connected: this.isPgConnected, profilesCount: 0, historyCount: 0 };
    let redisStatus = { connected: this.isRedisConnected, hits: 0, misses: 0, keys: 0 };

    if (this.isPgConnected) {
      try {
        const pCount = await this.pgPool.query('SELECT count(*) FROM profiles;');
        const hCount = await this.pgPool.query('SELECT count(*) FROM history;');
        pgStatus.profilesCount = parseInt(pCount.rows[0].count, 10);
        pgStatus.historyCount = parseInt(hCount.rows[0].count, 10);
      } catch (e) {}
    }

    if (this.isRedisConnected && this.redis) {
      try {
        const hits = await this.redis.get('valor:stats:cache_hits') || '0';
        const misses = await this.redis.get('valor:stats:cache_misses') || '0';
        const keys = await this.redis.keys('valor:*');
        redisStatus.hits = parseInt(hits, 10);
        redisStatus.misses = parseInt(misses, 10);
        redisStatus.keys = keys.length;
      } catch (e) {}
    }

    return {
      storageMode: this.isPgConnected ? 'server' : 'local',
      postgres: pgStatus,
      redis: redisStatus,
      sqlite: { ready: Boolean(this.sqliteDb) }
    };
  }

  // --------------------------------------------------------------------------
  // Analytics & Real-Time Visitor Telemetry Engine
  // --------------------------------------------------------------------------

  async recordRequest(event) {
    const {
      sessionId,
      deviceId = 'dev_unknown',
      ip,
      userAgent,
      browser,
      os,
      device = 'Desktop',
      path,
      method,
      statusCode,
      bytesTransferred = 0,
      latencyMs = 0,
      userId = null,
      profileName = null,
      referer = '',
      isEmbed = false
    } = event;

    const now = Date.now();
    const dateStr = new Date().toISOString().slice(0, 10);
    const hourStr = new Date().getHours().toString();

    // Resolve GeoIP & Reverse DNS intelligence asynchronously
    const geo = await lookupIpIntelligence(ip).catch(() => ({
      country: 'Unknown',
      countryCode: 'UN',
      flag: '🌐',
      city: 'Unknown',
      region: 'Unknown',
      isp: 'Unknown ISP',
      org: 'Unknown Org',
      lat: 0,
      lon: 0,
      reverseDns: ip || 'Unknown'
    }));

    // 1. Write to Redis (High Speed Memory Tier)
    if (this.isRedisConnected && this.redis) {
      try {
        const pipeline = this.redis.pipeline();

        // Global counters
        pipeline.incr('valor:stats:total_requests');
        if (bytesTransferred > 0) {
          pipeline.incrby('valor:stats:total_bytes', bytesTransferred);
        }
        pipeline.pfadd('valor:stats:unique_visitors', sessionId);
        pipeline.pfadd('valor:stats:unique_devices', deviceId);

        // Active Session presence in sorted set (score = timestamp)
        pipeline.zadd('valor:active_sessions', now, sessionId);
        pipeline.zadd('valor:active_devices', now, deviceId);

        // Session hash metadata
        const sessionKey = `valor:session:${sessionId}`;
        pipeline.hset(sessionKey, {
          sessionId,
          deviceId,
          ip: ip || '127.0.0.1',
          reverseDns: geo.reverseDns || ip || 'Unknown',
          country: geo.country || 'Unknown',
          countryCode: geo.countryCode || 'UN',
          city: geo.city || 'Unknown',
          region: geo.region || 'Unknown',
          isp: geo.isp || 'Unknown',
          browser: browser || 'Unknown',
          os: os || 'Unknown',
          device: device || 'Desktop',
          userAgent: (userAgent || '').slice(0, 300),
          lastSeen: now,
          currentPath: path || '/',
          ...(userId ? { userId } : {}),
          ...(profileName ? { profileName } : {})
        });
        pipeline.hsetnx(sessionKey, 'firstSeen', now);
        pipeline.hincrby(sessionKey, 'totalRequests', 1);
        if (bytesTransferred > 0) {
          pipeline.hincrby(sessionKey, 'bytesTransferred', bytesTransferred);
        }
        pipeline.expire(sessionKey, 86400); // 24 hours retention

        // Analytics breakdowns
        if (browser && browser !== 'Unknown') pipeline.hincrby('valor:analytics:browsers', browser, 1);
        if (os && os !== 'Unknown') pipeline.hincrby('valor:analytics:os', os, 1);
        if (device) pipeline.hincrby('valor:analytics:devices', device, 1);
        if (path) pipeline.zincrby('valor:analytics:paths', 1, path);

        // Hourly tracking
        pipeline.hincrby(`valor:analytics:hourly_requests:${dateStr}`, hourStr, 1);
        if (bytesTransferred > 0) {
          pipeline.hincrby(`valor:analytics:hourly_bytes:${dateStr}`, hourStr, bytesTransferred);
        }

        // Recent traffic log (capped at 300 entries for live reverse-proxy stream)
        const logEntry = JSON.stringify({
          id: `req_${crypto.randomBytes(4).toString('hex')}`,
          timestamp: now,
          ip: ip || '127.0.0.1',
          reverseDns: geo.reverseDns || ip,
          country: geo.country,
          countryCode: geo.countryCode,
          city: geo.city,
          method: method || 'GET',
          path: path || '/',
          statusCode: statusCode || 200,
          latencyMs: latencyMs || 0,
          bytes: bytesTransferred || 0,
          browser: browser || 'Unknown',
          os: os || 'Unknown',
          device: device || 'Desktop',
          deviceId,
          referer: referer || '',
          isEmbed: Boolean(isEmbed),
          userId: userId || 'Guest'
        });
        pipeline.lpush('valor:recent_traffic_log', logEntry);
        pipeline.ltrim('valor:recent_traffic_log', 0, 299);

        await pipeline.exec();
      } catch (err) {
        console.error('[Redis Telemetry Error]', err.message);
      }
    }

    // 2. Write to PostgreSQL (Persistent Tier - Non-blocking)
    if (this.isPgConnected && this.pgPool) {
      try {
        this.pgPool.query(
          `INSERT INTO analytics_traffic_logs (session_id, ip, method, path, status_code, latency_ms, bytes_transferred, user_agent, browser, os, user_id, device, device_id, referer, is_embed, country, country_code, city, region, isp, reverse_dns)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
          [sessionId, ip, method, path, statusCode, latencyMs, bytesTransferred, (userAgent || '').slice(0, 500), browser, os, userId, device || 'Desktop', deviceId, referer || '', Boolean(isEmbed), geo.country, geo.countryCode, geo.city, geo.region, geo.isp, geo.reverseDns]
        ).catch(() => {});

        this.pgPool.query(
          `INSERT INTO analytics_sessions (session_id, device_id, ip, user_agent, browser, os, device, user_id, profile_name, last_seen, total_requests, bytes_transferred, current_path, country, country_code, city, region, isp, reverse_dns)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 1, $10, $11, $12, $13, $14, $15, $16, $17)
           ON CONFLICT (session_id) DO UPDATE SET
             device_id = COALESCE($2, analytics_sessions.device_id),
             last_seen = NOW(),
             total_requests = analytics_sessions.total_requests + 1,
             bytes_transferred = analytics_sessions.bytes_transferred + $10,
             current_path = $11,
             user_id = COALESCE($8, analytics_sessions.user_id),
             profile_name = COALESCE($9, analytics_sessions.profile_name),
             country = COALESCE($12, analytics_sessions.country),
             city = COALESCE($14, analytics_sessions.city),
             reverse_dns = COALESCE($17, analytics_sessions.reverse_dns)`,
          [sessionId, deviceId, ip, (userAgent || '').slice(0, 500), browser, os, device, userId, profileName, bytesTransferred, path, geo.country, geo.countryCode, geo.city, geo.region, geo.isp, geo.reverseDns]
        ).catch(() => {});

        // Visitor Devices Intelligence Upsert
        const embedCountIncr = isEmbed ? 1 : 0;
        const cleanIp = ip || '127.0.0.1';
        const cleanReferer = referer || '';
        const ipJsonStr = JSON.stringify([cleanIp]);
        const refererJsonStr = cleanReferer ? JSON.stringify([cleanReferer]) : '[]';

        this.pgPool.query(
          `INSERT INTO analytics_devices (
             device_id, first_seen, last_seen, visit_count, total_duration_seconds, total_requests,
             bytes_transferred, last_ip, ips, user_agent, browser, os, device, user_id, profile_name,
             embed_calls_count, embed_referers, last_path, country, country_code, city, region, isp, org, lat, lon, reverse_dns
           )
           VALUES (
             $1, NOW(), NOW(), 1, 0, 1,
             $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10,
             $11, $12::jsonb, $14,
             $15, $16, $17, $18, $19, $20, $21, $22, $23
           )
           ON CONFLICT (device_id) DO UPDATE SET
             visit_count = CASE 
               WHEN analytics_devices.last_seen < NOW() - INTERVAL '30 minutes' THEN analytics_devices.visit_count + 1 
               ELSE analytics_devices.visit_count 
             END,
             total_duration_seconds = CASE
               WHEN analytics_devices.last_seen >= NOW() - INTERVAL '30 minutes' 
                 THEN analytics_devices.total_duration_seconds + LEAST(60, GREATEST(1, EXTRACT(EPOCH FROM (NOW() - analytics_devices.last_seen))::int))
               ELSE analytics_devices.total_duration_seconds
             END,
             last_seen = NOW(),
             total_requests = analytics_devices.total_requests + 1,
             bytes_transferred = analytics_devices.bytes_transferred + $2,
             last_ip = $3,
             ips = CASE 
               WHEN NOT (analytics_devices.ips ? $3) THEN analytics_devices.ips || $4::jsonb
               ELSE analytics_devices.ips
             END,
             user_agent = COALESCE($5, analytics_devices.user_agent),
             browser = COALESCE($6, analytics_devices.browser),
             os = COALESCE($7, analytics_devices.os),
             device = COALESCE($8, analytics_devices.device),
             user_id = COALESCE($9, analytics_devices.user_id),
             profile_name = COALESCE($10, analytics_devices.profile_name),
             embed_calls_count = analytics_devices.embed_calls_count + $11,
             embed_referers = CASE
               WHEN $13 != '' AND NOT (analytics_devices.embed_referers ? $13) THEN analytics_devices.embed_referers || $12::jsonb
               ELSE analytics_devices.embed_referers
             END,
             last_path = $14,
             country = COALESCE($15, analytics_devices.country),
             country_code = COALESCE($16, analytics_devices.country_code),
             city = COALESCE($17, analytics_devices.city),
             region = COALESCE($18, analytics_devices.region),
             isp = COALESCE($19, analytics_devices.isp),
             org = COALESCE($20, analytics_devices.org),
             lat = COALESCE($21, analytics_devices.lat),
             lon = COALESCE($22, analytics_devices.lon),
             reverse_dns = COALESCE($23, analytics_devices.reverse_dns)`,
          [
            deviceId, bytesTransferred, cleanIp, ipJsonStr, (userAgent || '').slice(0, 500),
            browser, os, device || 'Desktop', userId, profileName,
            embedCountIncr, refererJsonStr, cleanReferer, path,
            geo.country, geo.countryCode, geo.city, geo.region, geo.isp, geo.org, geo.lat, geo.lon, geo.reverseDns
          ]
        ).catch(err => {
          console.error('[Postgres analytics_devices error]', err.message);
        });
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare(
          `INSERT INTO analytics_traffic_logs (session_id, ip, method, path, status_code, latency_ms, bytes_transferred, user_agent, browser, os, user_id, device, device_id, referer, is_embed, country, country_code, city, region, isp, reverse_dns)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          sessionId, ip, method, path, statusCode, latencyMs, bytesTransferred, (userAgent || '').slice(0, 500),
          browser, os, userId, device || 'Desktop', deviceId, referer || '', isEmbed ? 1 : 0,
          geo.country, geo.countryCode, geo.city, geo.region, geo.isp, geo.reverseDns
        );

        const existing = this.sqliteDb.prepare('SELECT session_id, total_requests, bytes_transferred FROM analytics_sessions WHERE session_id = ?').get(sessionId);
        if (existing) {
          this.sqliteDb.prepare(
            `UPDATE analytics_sessions SET 
               device_id = COALESCE(?, device_id),
               last_seen = datetime('now'),
               total_requests = total_requests + 1,
               bytes_transferred = bytes_transferred + ?,
               current_path = ?,
               user_id = COALESCE(?, user_id),
               profile_name = COALESCE(?, profile_name),
               country = COALESCE(?, country),
               city = COALESCE(?, city),
               reverse_dns = COALESCE(?, reverse_dns)
             WHERE session_id = ?`
          ).run(deviceId, bytesTransferred, path, userId, profileName, geo.country, geo.city, geo.reverseDns, sessionId);
        } else {
          this.sqliteDb.prepare(
            `INSERT INTO analytics_sessions (session_id, device_id, ip, user_agent, browser, os, device, user_id, profile_name, total_requests, bytes_transferred, current_path, country, country_code, city, region, isp, reverse_dns)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(sessionId, deviceId, ip, (userAgent || '').slice(0, 500), browser, os, device, userId, profileName, bytesTransferred, path, geo.country, geo.countryCode, geo.city, geo.region, geo.isp, geo.reverseDns);

          // Dispatch session start webhook
          this.dispatchWebhook('visitor.session_start', {
            sessionId,
            deviceId,
            ip,
            country: geo.country,
            city: geo.city,
            browser,
            os,
            device,
            currentPath: path,
            timestamp: new Date().toISOString()
          }).catch(() => {});
        }

        // SQLite devices upsert
        const devExist = this.sqliteDb.prepare('SELECT device_id, last_seen, visit_count, total_duration_seconds, total_requests, bytes_transferred, embed_calls_count, embed_referers, ips FROM analytics_devices WHERE device_id = ?').get(deviceId);
        if (devExist) {
          let embedRefs = [];
          try { embedRefs = JSON.parse(devExist.embed_referers || '[]'); } catch(e){}
          if (referer && !embedRefs.includes(referer)) embedRefs.push(referer);

          let ipList = [];
          try { ipList = JSON.parse(devExist.ips || '[]'); } catch(e){}
          if (ip && !ipList.includes(ip)) ipList.push(ip);

          let visitCount = devExist.visit_count || 1;
          let totalDuration = devExist.total_duration_seconds || 0;
          if (devExist.last_seen) {
            const lastSeenTime = new Date(devExist.last_seen + (devExist.last_seen.endsWith('Z') ? '' : 'Z')).getTime() || new Date(devExist.last_seen).getTime();
            const elapsedSec = Math.floor((Date.now() - lastSeenTime) / 1000);
            if (elapsedSec > 1800) {
              visitCount += 1;
            } else if (elapsedSec >= 1 && elapsedSec < 1800) {
              totalDuration += Math.min(60, elapsedSec);
            }
          }

          this.sqliteDb.prepare(
            `UPDATE analytics_devices SET
               last_seen = datetime('now'),
               visit_count = ?,
               total_duration_seconds = ?,
               total_requests = total_requests + 1,
               bytes_transferred = bytes_transferred + ?,
               last_ip = ?,
               ips = ?,
               user_agent = COALESCE(?, user_agent),
               browser = COALESCE(?, browser),
               os = COALESCE(?, os),
               device = COALESCE(?, device),
               user_id = COALESCE(?, user_id),
               profile_name = COALESCE(?, profile_name),
               embed_calls_count = embed_calls_count + ?,
               embed_referers = ?,
               last_path = ?,
               country = COALESCE(?, country),
               country_code = COALESCE(?, country_code),
               city = COALESCE(?, city),
               region = COALESCE(?, region),
               isp = COALESCE(?, isp),
               org = COALESCE(?, org),
               lat = COALESCE(?, lat),
               lon = COALESCE(?, lon),
               reverse_dns = COALESCE(?, reverse_dns)
             WHERE device_id = ?`
          ).run(
            visitCount, totalDuration, bytesTransferred, ip, JSON.stringify(ipList),
            (userAgent || '').slice(0, 500), browser, os, device, userId, profileName,
            isEmbed ? 1 : 0, JSON.stringify(embedRefs), path,
            geo.country, geo.countryCode, geo.city, geo.region, geo.isp, geo.org, geo.lat, geo.lon, geo.reverseDns,
            deviceId
          );
        } else {
          const embedRefs = referer ? [referer] : [];
          this.sqliteDb.prepare(
            `INSERT INTO analytics_devices (
               device_id, first_seen, last_seen, visit_count, total_duration_seconds, total_requests,
               bytes_transferred, last_ip, ips, user_agent, browser, os, device, user_id, profile_name,
               embed_calls_count, embed_referers, last_path, country, country_code, city, region, isp, org, lat, lon, reverse_dns
             )
             VALUES (?, datetime('now'), datetime('now'), 1, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            deviceId, bytesTransferred, ip, JSON.stringify([ip]), (userAgent || '').slice(0, 500),
            browser, os, device, userId, profileName, isEmbed ? 1 : 0, JSON.stringify(embedRefs), path,
            geo.country, geo.countryCode, geo.city, geo.region, geo.isp, geo.org, geo.lat, geo.lon, geo.reverseDns
          );

          // Dispatch new visitor webhook
          this.dispatchWebhook('visitor.new', {
            deviceId,
            ip,
            reverseDns: geo.reverseDns,
            country: geo.country,
            city: geo.city,
            flag: geo.flag,
            browser,
            os,
            device,
            firstSeen: new Date().toISOString()
          }).catch(() => {});
        }
      } catch (e) {
        console.error('[SQLite recordRequest error]', e.message);
      }
    }

    // Real-Time Event Broadcasting to Dashboard (SSE / Live Webhook Push)
    if (typeof global.broadcastAdminEvent === 'function') {
      try {
        global.broadcastAdminEvent('traffic_log', {
          id: `req_${now}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp: now,
          ip: ip || '127.0.0.1',
          reverseDns: geo.reverseDns || ip,
          country: geo.country,
          countryCode: geo.countryCode,
          flag: geo.flag,
          city: geo.city,
          region: geo.region,
          isp: geo.isp,
          method: method || 'GET',
          path: path || '/',
          statusCode: statusCode || 200,
          latencyMs: latencyMs || 0,
          bytes: bytesTransferred || 0,
          browser: browser || 'Unknown',
          os: os || 'Unknown',
          device: device || 'Desktop',
          deviceId,
          referer: referer || '',
          isEmbed: Boolean(isEmbed),
          userId: userId || 'Guest'
        });

        global.broadcastAdminEvent('session_update', {
          sessionId,
          deviceId,
          ip: ip || '127.0.0.1',
          reverseDns: geo.reverseDns || ip,
          country: geo.country,
          countryCode: geo.countryCode,
          flag: geo.flag,
          city: geo.city,
          region: geo.region,
          isp: geo.isp,
          browser: browser || 'Unknown',
          os: os || 'Unknown',
          device: device || 'Desktop',
          userId: userId || 'Guest',
          profileName: profileName || 'Guest User',
          currentPath: path || '/',
          status: isEmbed || path.includes('/stream') ? 'streaming' : 'online',
          durationSeconds: 1,
          bytesTransferred,
          totalRequests: 1,
          lastSeen: new Date().toISOString()
        });

        global.broadcastAdminEvent('device_update', {
          deviceId,
          ip,
          lastIp: ip,
          country: geo.country,
          countryCode: geo.countryCode,
          flag: geo.flag,
          city: geo.city,
          region: geo.region,
          isp: geo.isp,
          org: geo.org,
          reverseDns: geo.reverseDns,
          browser,
          os,
          device,
          lastSeen: new Date().toISOString()
        });
      } catch (err) {}
    }

    // Webhook for server errors or traffic alerts
    if (statusCode >= 500) {
      this.dispatchWebhook('traffic.alert', {
        type: 'http_error_5xx',
        statusCode,
        method,
        path,
        ip,
        latencyMs,
        timestamp: new Date().toISOString()
      }).catch(() => {});
    }

    // Webhook for embed stream start
    if (isEmbed && (path.includes('/stream') || path.includes('/video') || path.includes('/embed') || path.includes('/api/proxy'))) {
      this.dispatchWebhook('embed.stream_started', {
        deviceId,
        ip,
        referer,
        path,
        country: geo.country,
        city: geo.city,
        timestamp: new Date().toISOString()
      }).catch(() => {});
    }
  }

  async recordHeartbeat(data) {
    const {
      sessionId,
      userId = null,
      profileName = null,
      currentPath = '/',
      timeSpentSeconds = 0,
      ip = '127.0.0.1',
      browser = 'Unknown',
      os = 'Unknown',
      device = 'Desktop'
    } = data;

    const now = Date.now();

    if (this.isRedisConnected && this.redis) {
      try {
        const sessionKey = `valor:session:${sessionId}`;
        const pipeline = this.redis.pipeline();
        pipeline.zadd('valor:active_sessions', now, sessionId);
        pipeline.hset(sessionKey, {
          sessionId,
          lastSeen: now,
          currentPath,
          totalDurationSeconds: timeSpentSeconds,
          ip: ip || '127.0.0.1',
          browser: browser || 'Unknown',
          os: os || 'Unknown',
          device: device || 'Desktop',
          ...(userId ? { userId } : {}),
          ...(profileName ? { profileName } : {})
        });
        pipeline.hsetnx(sessionKey, 'firstSeen', now);
        pipeline.expire(sessionKey, 86400);
        await pipeline.exec();
      } catch (e) {}
    }

    if (this.isPgConnected && this.pgPool) {
      this.pgPool.query(
        `UPDATE analytics_sessions SET 
           last_seen = NOW(), 
           total_duration_seconds = GREATEST(total_duration_seconds, $1),
           current_path = $2,
           user_id = COALESCE($3, user_id),
           profile_name = COALESCE($4, profile_name)
         WHERE session_id = $5`,
        [timeSpentSeconds, currentPath, userId, profileName, sessionId]
      ).catch(() => {});
    } else if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare(
          `UPDATE analytics_sessions SET 
             last_seen = datetime('now'),
             total_duration_seconds = MAX(total_duration_seconds, ?),
             current_path = ?,
             user_id = COALESCE(?, user_id),
             profile_name = COALESCE(?, profile_name)
           WHERE session_id = ?`
        ).run(timeSpentSeconds, currentPath, userId, profileName, sessionId);
      } catch (e) {}
    }

    return { success: true };
  }

  async getActiveUsers(windowSeconds = 180) {
    const now = Date.now();
    const threshold = now - (windowSeconds * 1000);

    if (this.isRedisConnected && this.redis) {
      try {
        this.redis.zremrangebyscore('valor:active_sessions', '-inf', now - (86400 * 1000)).catch(() => {});
        const sessionIds = await this.redis.zrevrangebyscore('valor:active_sessions', '+inf', threshold);

        const activeUsers = [];
        for (const sId of sessionIds) {
          const raw = await this.redis.hgetall(`valor:session:${sId}`);
          if (raw && raw.sessionId) {
            const lastSeenTs = parseInt(raw.lastSeen, 10) || now;
            const firstSeenTs = parseInt(raw.firstSeen, 10) || lastSeenTs;
            const diffSeconds = Math.max(0, Math.floor((now - firstSeenTs) / 1000));
            const durationSec = parseInt(raw.totalDurationSeconds, 10) || diffSeconds;
            const bytes = parseInt(raw.bytesTransferred, 10) || 0;
            const isIdle = (now - lastSeenTs) > 60000;

            activeUsers.push({
              sessionId: raw.sessionId,
              ip: raw.ip || '127.0.0.1',
              browser: raw.browser || 'Unknown',
              os: raw.os || 'Unknown',
              device: raw.device || 'Desktop',
              userId: raw.userId || 'local',
              profileName: raw.profileName || 'Guest Viewer',
              currentPath: raw.currentPath || '/',
              firstSeen: new Date(firstSeenTs).toISOString(),
              lastSeen: new Date(lastSeenTs).toISOString(),
              durationSeconds: durationSec,
              bytesTransferred: bytes,
              totalRequests: parseInt(raw.totalRequests, 10) || 1,
              status: isIdle ? 'idle' : 'online'
            });
          }
        }
        return activeUsers;
      } catch (err) {
        console.error('[Redis getActiveUsers Error]', err.message);
      }
    }

    if (this.isPgConnected && this.pgPool) {
      try {
        const res = await this.pgPool.query(
          `SELECT session_id, ip, browser, os, device, user_id, profile_name, current_path, first_seen, last_seen, total_duration_seconds, total_requests, bytes_transferred
           FROM analytics_sessions
           WHERE last_seen >= NOW() - INTERVAL '3 minutes'
           ORDER BY last_seen DESC`
        );
        return res.rows.map(r => ({
          sessionId: r.session_id,
          ip: r.ip || '127.0.0.1',
          browser: r.browser || 'Unknown',
          os: r.os || 'Unknown',
          device: r.device || 'Desktop',
          userId: r.user_id || 'local',
          profileName: r.profile_name || 'Guest Viewer',
          currentPath: r.current_path || '/',
          firstSeen: r.first_seen,
          lastSeen: r.last_seen,
          durationSeconds: r.total_duration_seconds || 0,
          bytesTransferred: parseInt(r.bytes_transferred, 10) || 0,
          totalRequests: r.total_requests || 1,
          status: 'online'
        }));
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        const rows = this.sqliteDb.prepare(
          `SELECT session_id, ip, browser, os, device, user_id, profile_name, current_path, first_seen, last_seen, total_duration_seconds, total_requests, bytes_transferred
           FROM analytics_sessions
           WHERE datetime(last_seen) >= datetime('now', '-3 minutes')
           ORDER BY last_seen DESC`
        ).all();
        return rows.map(r => ({
          sessionId: r.session_id,
          ip: r.ip || '127.0.0.1',
          browser: r.browser || 'Unknown',
          os: r.os || 'Unknown',
          device: r.device || 'Desktop',
          userId: r.user_id || 'local',
          profileName: r.profile_name || 'Guest Viewer',
          currentPath: r.current_path || '/',
          firstSeen: r.first_seen,
          lastSeen: r.last_seen,
          durationSeconds: r.total_duration_seconds || 0,
          bytesTransferred: r.bytes_transferred || 0,
          totalRequests: r.total_requests || 1,
          status: 'online'
        }));
      } catch (e) {}
    }

    return [];
  }

  async getAdminOverview() {
    const activeUsers = await this.getActiveUsers(180);
    let totalBytes = 0;
    let totalRequests = 0;
    let uniqueVisitors = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    if (this.isRedisConnected && this.redis) {
      try {
        const b = await this.redis.get('valor:stats:total_bytes');
        const r = await this.redis.get('valor:stats:total_requests');
        const u = await this.redis.pfcount('valor:stats:unique_visitors');
        const h = await this.redis.get('valor:stats:cache_hits');
        const m = await this.redis.get('valor:stats:cache_misses');

        totalBytes = parseInt(b, 10) || 0;
        totalRequests = parseInt(r, 10) || 0;
        uniqueVisitors = parseInt(u, 10) || 0;
        cacheHits = parseInt(h, 10) || 0;
        cacheMisses = parseInt(m, 10) || 0;
      } catch (e) {}
    }

    if (totalRequests === 0) {
      if (this.isPgConnected && this.pgPool) {
        try {
          const countRes = await this.pgPool.query('SELECT count(*) as reqs, coalesce(sum(bytes_transferred), 0) as bytes, count(distinct session_id) as visitors FROM analytics_traffic_logs');
          totalRequests = parseInt(countRes.rows[0].reqs, 10) || 0;
          totalBytes = parseInt(countRes.rows[0].bytes, 10) || 0;
          uniqueVisitors = parseInt(countRes.rows[0].visitors, 10) || 0;
        } catch (e) {}
      } else if (this.sqliteDb) {
        try {
          const row = this.sqliteDb.prepare('SELECT count(*) as reqs, coalesce(sum(bytes_transferred), 0) as bytes, count(distinct session_id) as visitors FROM analytics_traffic_logs').get();
          if (row) {
            totalRequests = row.reqs || 0;
            totalBytes = row.bytes || 0;
            uniqueVisitors = row.visitors || 0;
          }
        } catch (e) {}
      }
    }

    let avgDurationSeconds = 0;
    if (activeUsers.length > 0) {
      const totalDur = activeUsers.reduce((sum, u) => sum + (u.durationSeconds || 0), 0);
      avgDurationSeconds = Math.round(totalDur / activeUsers.length);
    }

    return {
      activeUsersCount: activeUsers.length,
      activeUsers,
      totalVisitors: Math.max(uniqueVisitors, activeUsers.length),
      totalRequests,
      totalBytes,
      avgDurationSeconds,
      redis: {
        connected: this.isRedisConnected,
        cacheHits,
        cacheMisses,
        hitRatio: (cacheHits + cacheMisses) > 0 ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(1) + '%' : '100%'
      },
      postgres: {
        connected: this.isPgConnected
      }
    };
  }

  async getDetailedAnalytics(options = {}) {
    const timeframe = options.timeframe || 'day'; // 'day', 'custom_day', 'week', 'month', 'year', 'months'
    const today = new Date().toISOString().slice(0, 10);
    const targetDate = options.targetDate || options.date || today;
    const targetMonth = options.targetMonth || options.month || today.slice(0, 7);

    let activityData = [];
    let hourlyData = [];
    let availableDates = [];
    let thirdPartyStats = {
      totalRequests: 0,
      totalBytes: 0,
      avgLatencyMs: 0,
      services: [],
      endpoints: []
    };

    // 1. Fetch available activity dates
    if (this.isPgConnected && this.pgPool) {
      try {
        const datesRes = await this.pgPool.query(
          `SELECT to_char(created_at, 'YYYY-MM-DD') as day, count(*)::int as count,
                  count(case when path like '/api/vlr%' or path like '/api/trakt%' or path like '/api/tmdb%' or path like '%subtitles%' then 1 end)::int as third_party_count
           FROM analytics_traffic_logs
           GROUP BY day
           ORDER BY day DESC
           LIMIT 60`
        );
        availableDates = datesRes.rows;
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        availableDates = this.sqliteDb.prepare(
          `SELECT strftime('%Y-%m-%d', created_at) as day, count(*) as count,
                  count(case when path like '/api/vlr%' or path like '/api/trakt%' or path like '/api/tmdb%' or path like '%subtitles%' then 1 end) as third_party_count
           FROM analytics_traffic_logs
           GROUP BY day
           ORDER BY day DESC
           LIMIT 60`
        ).all();
      } catch (e) {}
    }

    if (availableDates.length === 0) {
      availableDates = [{ day: today, count: 0, third_party_count: 0 }];
    }

    // 2. Fetch Third-Party API Stats (VLR, Trakt, TMDB, OpenSubtitles)
    if (this.isPgConnected && this.pgPool) {
      try {
        const tpRes = await this.pgPool.query(
          `SELECT 
             CASE 
               WHEN path LIKE '/api/vlr%' THEN 'VLR.gg'
               WHEN path LIKE '/api/trakt%' THEN 'Trakt.tv'
               WHEN path LIKE '/api/tmdb%' THEN 'TMDB'
               WHEN path LIKE '%subtitles%' THEN 'OpenSubtitles'
               ELSE 'Other 3rd Party'
             END as service,
             path,
             count(*)::int as count,
             coalesce(sum(bytes_transferred), 0)::bigint as total_bytes,
             round(avg(latency_ms))::int as avg_latency,
             max(created_at) as last_called,
             count(case when status_code >= 400 then 1 end)::int as error_count
           FROM analytics_traffic_logs
           WHERE path LIKE '/api/vlr%' OR path LIKE '/api/trakt%' OR path LIKE '/api/tmdb%' OR path LIKE '%subtitles%'
           GROUP BY service, path
           ORDER BY count DESC`
        );

        let totalTpReqs = 0;
        let totalTpBytes = 0;
        let weightedLatency = 0;
        const serviceMap = {};

        tpRes.rows.forEach(r => {
          const reqs = parseInt(r.count, 10) || 0;
          const bytes = parseInt(r.total_bytes, 10) || 0;
          const lat = parseInt(r.avg_latency, 10) || 0;
          const errs = parseInt(r.error_count, 10) || 0;

          totalTpReqs += reqs;
          totalTpBytes += bytes;
          weightedLatency += (lat * reqs);

          if (!serviceMap[r.service]) {
            serviceMap[r.service] = {
              name: r.service,
              requests: 0,
              bytes: 0,
              avgLatencyMs: 0,
              errorCount: 0,
              lastCalled: r.last_called,
              status: 'operational'
            };
          }
          serviceMap[r.service].requests += reqs;
          serviceMap[r.service].bytes += bytes;
          serviceMap[r.service].errorCount += errs;
          if (r.last_called && (!serviceMap[r.service].lastCalled || new Date(r.last_called) > new Date(serviceMap[r.service].lastCalled))) {
            serviceMap[r.service].lastCalled = r.last_called;
          }
        });

        Object.values(serviceMap).forEach(s => {
          const matchingRows = tpRes.rows.filter(r => r.service === s.name);
          const totalLat = matchingRows.reduce((sum, r) => sum + (parseInt(r.avg_latency, 10) * parseInt(r.count, 10)), 0);
          s.avgLatencyMs = s.requests > 0 ? Math.round(totalLat / s.requests) : 0;
        });

        ['VLR.gg', 'Trakt.tv', 'TMDB', 'OpenSubtitles'].forEach(svc => {
          if (!serviceMap[svc]) {
            serviceMap[svc] = {
              name: svc,
              requests: 0,
              bytes: 0,
              avgLatencyMs: 0,
              errorCount: 0,
              lastCalled: null,
              status: 'operational'
            };
          }
        });

        thirdPartyStats = {
          totalRequests: totalTpReqs,
          totalBytes: totalTpBytes,
          avgLatencyMs: totalTpReqs > 0 ? Math.round(weightedLatency / totalTpReqs) : 0,
          services: Object.values(serviceMap),
          endpoints: tpRes.rows.map(r => ({
            service: r.service,
            path: r.path,
            requests: parseInt(r.count, 10) || 0,
            bytes: parseInt(r.total_bytes, 10) || 0,
            avgLatencyMs: parseInt(r.avg_latency, 10) || 0,
            errorCount: parseInt(r.error_count, 10) || 0,
            lastCalled: r.last_called
          }))
        };
      } catch (e) {}
    }

    // 3. Activity Generation based on timeframe
    if (timeframe === 'day' || timeframe === 'custom_day') {
      const dayToQuery = (timeframe === 'custom_day' ? targetDate : today);
      const hourMap = {};

      if (this.isPgConnected && this.pgPool) {
        try {
          const res = await this.pgPool.query(
            `SELECT extract(hour from created_at)::int as hour_num,
                    to_char(created_at, 'HH24:00') as hour_label,
                    count(*)::int as requests,
                    coalesce(sum(bytes_transferred), 0)::bigint as bytes,
                    count(distinct session_id)::int as visitors,
                    count(case when path like '/api/vlr%' or path like '/api/trakt%' or path like '/api/tmdb%' or path like '%subtitles%' then 1 end)::int as third_party_requests
             FROM analytics_traffic_logs
             WHERE created_at >= $1::date AND created_at < ($1::date + interval '1 day')
             GROUP BY hour_num, hour_label
             ORDER BY hour_num ASC`,
            [dayToQuery]
          );
          res.rows.forEach(r => {
            hourMap[r.hour_num] = {
              requests: parseInt(r.requests, 10) || 0,
              bytes: parseInt(r.bytes, 10) || 0,
              visitors: parseInt(r.visitors, 10) || 0,
              thirdPartyRequests: parseInt(r.third_party_requests, 10) || 0
            };
          });
        } catch (e) {}
      } else if (this.sqliteDb) {
        try {
          const rows = this.sqliteDb.prepare(
            `SELECT cast(strftime('%H', created_at) as integer) as hour_num,
                    strftime('%H:00', created_at) as hour_label,
                    count(*) as requests,
                    coalesce(sum(bytes_transferred), 0) as bytes,
                    count(distinct session_id) as visitors,
                    count(case when path like '/api/vlr%' or path like '/api/trakt%' or path like '/api/tmdb%' or path like '%subtitles%' then 1 end) as third_party_requests
             FROM analytics_traffic_logs
             WHERE date(created_at) = date(?)
             GROUP BY hour_num
             ORDER BY hour_num ASC`
          ).all(dayToQuery);
          rows.forEach(r => {
            hourMap[r.hour_num] = {
              requests: r.requests || 0,
              bytes: r.bytes || 0,
              visitors: r.visitors || 0,
              thirdPartyRequests: r.third_party_requests || 0
            };
          });
        } catch (e) {}
      }

      for (let h = 0; h < 24; h++) {
        const hLabel = `${h.toString().padStart(2, '0')}:00`;
        const data = hourMap[h] || { requests: 0, bytes: 0, visitors: 0, thirdPartyRequests: 0 };
        activityData.push({
          label: hLabel,
          sublabel: dayToQuery,
          date: dayToQuery,
          hour: hLabel,
          requests: data.requests,
          bytes: data.bytes,
          activeUsers: data.visitors > 0 ? data.visitors : (data.requests > 0 ? 1 : 0),
          thirdPartyRequests: data.thirdPartyRequests
        });
      }
      hourlyData = activityData;

    } else if (timeframe === 'week') {
      const days = [];
      const baseDate = new Date(targetDate + 'T12:00:00Z');
      for (let i = 6; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() - i);
        days.push(d.toISOString().slice(0, 10));
      }

      const dayMap = {};
      if (this.isPgConnected && this.pgPool) {
        try {
          const res = await this.pgPool.query(
            `SELECT to_char(created_at, 'YYYY-MM-DD') as day_key,
                    to_char(created_at, 'Mon DD') as day_label,
                    to_char(created_at, 'Dy') as weekday,
                    count(*)::int as requests,
                    coalesce(sum(bytes_transferred), 0)::bigint as bytes,
                    count(distinct session_id)::int as visitors,
                    count(case when path like '/api/vlr%' or path like '/api/trakt%' or path like '/api/tmdb%' or path like '%subtitles%' then 1 end)::int as third_party_requests
             FROM analytics_traffic_logs
             WHERE created_at >= ($1::date - interval '6 days') AND created_at < ($1::date + interval '1 day')
             GROUP BY day_key, day_label, weekday
             ORDER BY day_key ASC`,
            [targetDate]
          );
          res.rows.forEach(r => {
            dayMap[r.day_key] = {
              requests: parseInt(r.requests, 10) || 0,
              bytes: parseInt(r.bytes, 10) || 0,
              visitors: parseInt(r.visitors, 10) || 0,
              thirdPartyRequests: parseInt(r.third_party_requests, 10) || 0
            };
          });
        } catch (e) {}
      }

      activityData = days.map(dStr => {
        const dObj = new Date(dStr + 'T12:00:00Z');
        const monthDay = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        const weekday = dObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
        const data = dayMap[dStr] || { requests: 0, bytes: 0, visitors: 0, thirdPartyRequests: 0 };
        return {
          label: monthDay,
          sublabel: weekday,
          date: dStr,
          hour: monthDay,
          requests: data.requests,
          bytes: data.bytes,
          activeUsers: data.visitors,
          thirdPartyRequests: data.thirdPartyRequests
        };
      });
      hourlyData = activityData;

    } else if (timeframe === 'month') {
      const days = [];
      const baseDate = new Date(targetDate + 'T12:00:00Z');
      for (let i = 29; i >= 0; i--) {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() - i);
        days.push(d.toISOString().slice(0, 10));
      }

      const dayMap = {};
      if (this.isPgConnected && this.pgPool) {
        try {
          const res = await this.pgPool.query(
            `SELECT to_char(created_at, 'YYYY-MM-DD') as day_key,
                    count(*)::int as requests,
                    coalesce(sum(bytes_transferred), 0)::bigint as bytes,
                    count(distinct session_id)::int as visitors,
                    count(case when path like '/api/vlr%' or path like '/api/trakt%' or path like '/api/tmdb%' or path like '%subtitles%' then 1 end)::int as third_party_requests
             FROM analytics_traffic_logs
             WHERE created_at >= ($1::date - interval '29 days') AND created_at < ($1::date + interval '1 day')
             GROUP BY day_key
             ORDER BY day_key ASC`,
            [targetDate]
          );
          res.rows.forEach(r => {
            dayMap[r.day_key] = {
              requests: parseInt(r.requests, 10) || 0,
              bytes: parseInt(r.bytes, 10) || 0,
              visitors: parseInt(r.visitors, 10) || 0,
              thirdPartyRequests: parseInt(r.third_party_requests, 10) || 0
            };
          });
        } catch (e) {}
      }

      activityData = days.map(dStr => {
        const dObj = new Date(dStr + 'T12:00:00Z');
        const monthDay = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        const data = dayMap[dStr] || { requests: 0, bytes: 0, visitors: 0, thirdPartyRequests: 0 };
        return {
          label: monthDay,
          sublabel: dStr,
          date: dStr,
          hour: monthDay,
          requests: data.requests,
          bytes: data.bytes,
          activeUsers: data.visitors,
          thirdPartyRequests: data.thirdPartyRequests
        };
      });
      hourlyData = activityData;

    } else if (timeframe === 'year' || timeframe === 'months') {
      const months = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mKey = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        const mLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        months.push({ key: mKey, label: mLabel });
      }

      const monthMap = {};
      if (this.isPgConnected && this.pgPool) {
        try {
          const res = await this.pgPool.query(
            `SELECT to_char(created_at, 'YYYY-MM') as month_key,
                    count(*)::int as requests,
                    coalesce(sum(bytes_transferred), 0)::bigint as bytes,
                    count(distinct session_id)::int as visitors,
                    count(case when path like '/api/vlr%' or path like '/api/trakt%' or path like '/api/tmdb%' or path like '%subtitles%' then 1 end)::int as third_party_requests
             FROM analytics_traffic_logs
             WHERE created_at >= (date_trunc('month', CURRENT_DATE) - interval '11 months')
             GROUP BY month_key
             ORDER BY month_key ASC`
          );
          res.rows.forEach(r => {
            monthMap[r.month_key] = {
              requests: parseInt(r.requests, 10) || 0,
              bytes: parseInt(r.bytes, 10) || 0,
              visitors: parseInt(r.visitors, 10) || 0,
              thirdPartyRequests: parseInt(r.third_party_requests, 10) || 0
            };
          });
        } catch (e) {}
      }

      activityData = months.map(m => {
        const data = monthMap[m.key] || { requests: 0, bytes: 0, visitors: 0, thirdPartyRequests: 0 };
        return {
          label: m.label,
          sublabel: m.key,
          date: m.key,
          hour: m.label,
          requests: data.requests,
          bytes: data.bytes,
          activeUsers: data.visitors,
          thirdPartyRequests: data.thirdPartyRequests
        };
      });
      hourlyData = activityData;
    }

    // Period summary
    let totalPeriodRequests = 0;
    let totalPeriodBytes = 0;
    let totalPeriodVisitors = 0;
    let totalPeriodThirdParty = 0;
    let peakActivity = { label: 'None', requests: 0 };

    activityData.forEach(item => {
      totalPeriodRequests += (item.requests || 0);
      totalPeriodBytes += (item.bytes || 0);
      totalPeriodVisitors += (item.activeUsers || 0);
      totalPeriodThirdParty += (item.thirdPartyRequests || 0);
      if (item.requests > peakActivity.requests) {
        peakActivity = { label: item.label, requests: item.requests };
      }
    });

    const timeframeSummary = {
      timeframe,
      targetDate,
      totalRequests: totalPeriodRequests,
      totalBytes: totalPeriodBytes,
      totalVisitors: totalPeriodVisitors,
      thirdPartyRequests: totalPeriodThirdParty,
      thirdPartyRatio: totalPeriodRequests > 0 ? ((totalPeriodThirdParty / totalPeriodRequests) * 100).toFixed(1) + '%' : '0%',
      peakActivity
    };

    // Breakdowns
    let browsers = {};
    let osList = {};
    let devices = {};
    let topPathsRaw = [];

    if (this.isPgConnected && this.pgPool) {
      try {
        const bRes = await this.pgPool.query(`SELECT browser as name, count(*)::int as count FROM analytics_traffic_logs WHERE browser IS NOT NULL AND browser != 'Unknown' GROUP BY browser ORDER BY count DESC LIMIT 8`);
        bRes.rows.forEach(r => { browsers[r.name] = r.count; });

        const oRes = await this.pgPool.query(`SELECT os as name, count(*)::int as count FROM analytics_traffic_logs WHERE os IS NOT NULL AND os != 'Unknown' GROUP BY os ORDER BY count DESC LIMIT 8`);
        oRes.rows.forEach(r => { osList[r.name] = r.count; });

        const dRes = await this.pgPool.query(`SELECT COALESCE(device, 'Desktop') as name, count(*)::int as count FROM analytics_traffic_logs GROUP BY name ORDER BY count DESC LIMIT 8`);
        dRes.rows.forEach(r => { devices[r.name] = r.count; });

        const pRes = await this.pgPool.query(`SELECT path, count(*)::int as count FROM analytics_traffic_logs GROUP BY path ORDER BY count DESC LIMIT 10`);
        topPathsRaw = pRes.rows;
      } catch (e) {}
    }

    if (Object.keys(browsers).length === 0 && this.isRedisConnected && this.redis) {
      try {
        browsers = await this.redis.hgetall('valor:analytics:browsers') || {};
        osList = await this.redis.hgetall('valor:analytics:os') || {};
        devices = await this.redis.hgetall('valor:analytics:devices') || {};
      } catch (e) {}
    }

    if (Object.keys(browsers).length === 0) browsers = { Chrome: 1, Brave: 1 };
    if (Object.keys(osList).length === 0) osList = { macOS: 1, Windows: 1 };
    if (Object.keys(devices).length === 0) devices = { Desktop: 1 };

    const browserTotal = Object.values(browsers).reduce((sum, v) => sum + parseInt(v, 10), 0) || 1;
    const browserBreakdown = Object.entries(browsers).map(([name, count]) => {
      const num = parseInt(count, 10);
      return { name, count: num, percentage: Math.round((num / browserTotal) * 100) };
    }).sort((a, b) => b.count - a.count);

    const osTotal = Object.values(osList).reduce((sum, v) => sum + parseInt(v, 10), 0) || 1;
    const osBreakdown = Object.entries(osList).map(([name, count]) => {
      const num = parseInt(count, 10);
      return { name, count: num, percentage: Math.round((num / osTotal) * 100) };
    }).sort((a, b) => b.count - a.count);

    const deviceTotal = Object.values(devices).reduce((sum, v) => sum + parseInt(v, 10), 0) || 1;
    const deviceBreakdown = Object.entries(devices).map(([name, count]) => {
      const num = parseInt(count, 10);
      return { name, count: num, percentage: Math.round((num / deviceTotal) * 100) };
    }).sort((a, b) => b.count - a.count);

    const topPaths = topPathsRaw.length > 0 ? topPathsRaw.map(r => ({ path: r.path, count: parseInt(r.count, 10) })) : [];

    const timeSpentBuckets = [
      { label: '< 1 min', count: 0, range: '0 - 60s' },
      { label: '1 - 5 mins', count: 0, range: '60s - 300s' },
      { label: '5 - 15 mins', count: 0, range: '300s - 900s' },
      { label: '15 - 30 mins', count: 0, range: '900s - 1800s' },
      { label: '30 - 60 mins', count: 0, range: '1800s - 3600s' },
      { label: '> 1 hour', count: 0, range: '3600s+' }
    ];

    const active = await this.getActiveUsers(3600);
    active.forEach(u => {
      const dur = u.durationSeconds || 0;
      if (dur < 60) timeSpentBuckets[0].count++;
      else if (dur < 300) timeSpentBuckets[1].count++;
      else if (dur < 900) timeSpentBuckets[2].count++;
      else if (dur < 1800) timeSpentBuckets[3].count++;
      else if (dur < 3600) timeSpentBuckets[4].count++;
      else timeSpentBuckets[5].count++;
    });

    return {
      timeframe,
      targetDate,
      activityData,
      hourlyData,
      timeframeSummary,
      availableDates,
      thirdPartyStats,
      browserBreakdown,
      osBreakdown,
      deviceBreakdown,
      topPaths,
      timeSpentBuckets
    };
  }

  async getTrafficLogs(options = {}) {
    const limit = typeof options === 'number' ? options : (parseInt(options.limit, 10) || 150);
    const date = typeof options === 'object' ? (options.date || null) : null;
    const category = typeof options === 'object' ? (options.category || null) : null;
    const provider = typeof options === 'object' ? (options.provider || null) : null;
    const statusCode = typeof options === 'object' ? (options.statusCode || null) : null;
    const search = typeof options === 'object' ? (options.search || null) : null;
    const deviceId = typeof options === 'object' ? (options.deviceId || null) : null;
    const embedOnly = typeof options === 'object' ? Boolean(options.embedOnly) : false;
    const referer = typeof options === 'object' ? (options.referer || null) : null;

    if (this.isPgConnected && this.pgPool) {
      try {
        let whereClauses = [];
        let params = [];
        let idx = 1;

        if (date) {
          whereClauses.push(`created_at >= $${idx}::date AND created_at < ($${idx}::date + interval '1 day')`);
          params.push(date);
          idx++;
        }

        if (deviceId) {
          whereClauses.push(`device_id = $${idx}`);
          params.push(deviceId);
          idx++;
        }

        if (embedOnly) {
          whereClauses.push(`(is_embed = TRUE OR path LIKE '/embed%' OR path LIKE '/api/embed%')`);
        }

        if (referer) {
          whereClauses.push(`referer ILIKE $${idx}`);
          params.push(`%${referer}%`);
          idx++;
        }

        if (category === '3rdparty') {
          whereClauses.push(`(path LIKE '/api/vlr%' OR path LIKE '/api/trakt%' OR path LIKE '/api/tmdb%' OR path LIKE '%subtitles%')`);
        } else if (category === 'api') {
          whereClauses.push(`path LIKE '/api/%' AND NOT (path LIKE '/api/vlr%' OR path LIKE '/api/trakt%' OR path LIKE '/api/tmdb%' OR path LIKE '%subtitles%')`);
        } else if (category === 'stream') {
          whereClauses.push(`(path LIKE '%.mp4%' OR path LIKE '%.m3u8%' OR path LIKE '%.ts%' OR path LIKE '%/stream%' OR path LIKE '%/local-video-stream%')`);
        } else if (category === 'static') {
          whereClauses.push(`(path LIKE '/assets/%' OR path LIKE '/node_modules/%' OR path LIKE '%.js%' OR path LIKE '%.css%' OR path LIKE '%.png%' OR path LIKE '%.svg%')`);
        }

        if (provider) {
          const p = provider.toLowerCase();
          if (p === 'vlr') whereClauses.push(`path LIKE '/api/vlr%'`);
          else if (p === 'trakt') whereClauses.push(`path LIKE '/api/trakt%'`);
          else if (p === 'tmdb') whereClauses.push(`path LIKE '/api/tmdb%'`);
          else if (p === 'opensubtitles' || p === 'subtitles') whereClauses.push(`path LIKE '%subtitles%'`);
        }

        if (statusCode) {
          whereClauses.push(`status_code = $${idx}`);
          params.push(parseInt(statusCode, 10));
          idx++;
        }

        if (search) {
          whereClauses.push(`(path ILIKE $${idx} OR ip ILIKE $${idx} OR browser ILIKE $${idx} OR device_id ILIKE $${idx} OR referer ILIKE $${idx})`);
          params.push(`%${search}%`);
          idx++;
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        params.push(limit);

        const res = await this.pgPool.query(
          `SELECT id, created_at as timestamp, ip, method, path, status_code as "statusCode",
                  latency_ms as "latencyMs", bytes_transferred as bytes, browser, os,
                  COALESCE(device, 'Desktop') as device, user_id as "userId",
                  device_id as "deviceId", referer, is_embed as "isEmbed"
           FROM analytics_traffic_logs
           ${whereSql}
           ORDER BY created_at DESC
           LIMIT $${idx}`,
          params
        );
        return res.rows.map(r => ({
          ...r,
          bytes: parseInt(r.bytes, 10) || 0,
          timestamp: new Date(r.timestamp).getTime()
        }));
      } catch (e) {
        console.error('[PostgreSQL getTrafficLogs error]', e.message);
      }
    }

    if (this.isRedisConnected && this.redis && !date && !provider && !category && !deviceId && !embedOnly && !referer) {
      try {
        const rawLogs = await this.redis.lrange('valor:recent_traffic_log', 0, limit - 1);
        if (rawLogs && rawLogs.length > 0) {
          return rawLogs.map(str => {
            try { return JSON.parse(str); } catch { return null; }
          }).filter(Boolean);
        }
      } catch (e) {}
    }

    if (this.sqliteDb) {
      try {
        let whereClauses = [];
        let params = [];
        if (deviceId) { whereClauses.push('device_id = ?'); params.push(deviceId); }
        if (embedOnly) { whereClauses.push('(is_embed = 1 OR path LIKE \'/embed%\')'); }
        if (search) { whereClauses.push('(path LIKE ? OR ip LIKE ? OR browser LIKE ? OR device_id LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        params.push(limit);

        const rows = this.sqliteDb.prepare(
          `SELECT id, created_at as timestamp, ip, method, path, status_code as statusCode,
                  latency_ms as latencyMs, bytes_transferred as bytes, browser, os,
                  COALESCE(device, 'Desktop') as device, user_id as userId,
                  device_id as deviceId, referer, is_embed as isEmbed
           FROM analytics_traffic_logs
           ${whereSql}
           ORDER BY id DESC
           LIMIT ?`
        ).all(...params);
        return rows;
      } catch (e) {}
    }

    return [];
  }

  async getVisitorDevices(options = {}) {
    const limit = parseInt(options.limit, 10) || 50;
    const search = options.search || null;
    const sortBy = options.sortBy || 'last_seen';
    const filter = options.filter || 'all';

    let devices = [];
    let totalDevicesCount = 0;
    let totalEmbedCallsCount = 0;
    let topEmbedReferrers = [];

    if (this.isPgConnected && this.pgPool) {
      try {
        let whereClauses = [];
        let params = [];
        let idx = 1;

        if (search) {
          whereClauses.push(`(device_id ILIKE $${idx} OR last_ip ILIKE $${idx} OR browser ILIKE $${idx} OR os ILIKE $${idx} OR user_agent ILIKE $${idx} OR profile_name ILIKE $${idx} OR country ILIKE $${idx} OR city ILIKE $${idx} OR reverse_dns ILIKE $${idx} OR isp ILIKE $${idx})`);
          params.push(`%${search}%`);
          idx++;
        }

        if (filter === 'embeds_only') {
          whereClauses.push(`embed_calls_count > 0`);
        } else if (filter === 'mobile') {
          whereClauses.push(`device = 'Mobile'`);
        } else if (filter === 'desktop') {
          whereClauses.push(`device = 'Desktop'`);
        } else if (filter === 'tablet') {
          whereClauses.push(`device = 'Tablet'`);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        let orderCol = 'last_seen DESC';
        if (sortBy === 'visits') orderCol = 'visit_count DESC, last_seen DESC';
        else if (sortBy === 'duration') orderCol = 'total_duration_seconds DESC, last_seen DESC';
        else if (sortBy === 'requests') orderCol = 'total_requests DESC, last_seen DESC';
        else if (sortBy === 'bytes') orderCol = 'bytes_transferred DESC, last_seen DESC';
        else if (sortBy === 'embeds') orderCol = 'embed_calls_count DESC, last_seen DESC';

        // Count totals
        const statsRes = await this.pgPool.query(
          `SELECT count(*)::int as total_devices,
                  COALESCE(sum(embed_calls_count), 0)::int as total_embed_calls
           FROM analytics_devices`
        ).catch(() => ({ rows: [{ total_devices: 0, total_embed_calls: 0 }] }));
        if (statsRes.rows[0]) {
          totalDevicesCount = statsRes.rows[0].total_devices || 0;
          totalEmbedCallsCount = statsRes.rows[0].total_embed_calls || 0;
        }

        // Top embed referrers from traffic logs
        const refRes = await this.pgPool.query(
          `SELECT referer, count(*)::int as count, max(created_at) as last_seen
           FROM analytics_traffic_logs
           WHERE referer IS NOT NULL AND referer != '' AND referer NOT LIKE '%localhost%' AND referer NOT LIKE '%127.0.0.1%'
           GROUP BY referer
           ORDER BY count DESC
           LIMIT 10`
        ).catch(() => ({ rows: [] }));
        topEmbedReferrers = refRes.rows;

        params.push(limit);
        const rowsRes = await this.pgPool.query(
          `SELECT device_id as "deviceId", first_seen as "firstSeen", last_seen as "lastSeen",
                  visit_count as "visitCount", total_duration_seconds as "totalDurationSeconds",
                  total_requests as "totalRequests", bytes_transferred as "bytesTransferred",
                  last_ip as "lastIp", ips, user_agent as "userAgent", browser, os,
                  COALESCE(device, 'Desktop') as device, user_id as "userId", profile_name as "profileName",
                  embed_calls_count as "embedCallsCount", embed_referers as "embedReferers", last_path as "lastPath",
                  country, country_code as "countryCode", city, region, isp, org, lat, lon, reverse_dns as "reverseDns"
           FROM analytics_devices
           ${whereSql}
           ORDER BY ${orderCol}
           LIMIT $${idx}`,
          params
        );

        const adminIp = (options.adminIp || '').replace(/^::ffff:/, '').trim();
        const isLocalAdmin = !adminIp || ['127.0.0.1', '::1', 'localhost'].includes(adminIp);

        devices = rowsRes.rows.map(r => {
          const lastIpClean = (r.lastIp || '').replace(/^::ffff:/, '').trim();
          const ipsArray = Array.isArray(r.ips) ? r.ips : (typeof r.ips === 'string' ? JSON.parse(r.ips || '[]') : []);
          const isMyDev = Boolean(
            adminIp && (
              lastIpClean === adminIp ||
              ipsArray.some(ip => String(ip).replace(/^::ffff:/, '').trim() === adminIp) ||
              (isLocalAdmin && ['127.0.0.1', '::1', 'localhost'].includes(lastIpClean))
            )
          );
          return {
            ...r,
            isMyDevice: isMyDev,
            bytesTransferred: parseInt(r.bytesTransferred, 10) || 0,
            totalDurationSeconds: parseInt(r.totalDurationSeconds, 10) || 0,
            visitCount: parseInt(r.visitCount, 10) || 1,
            totalRequests: parseInt(r.totalRequests, 10) || 0,
            embedCallsCount: parseInt(r.embedCallsCount, 10) || 0,
            ips: ipsArray,
            embedReferers: Array.isArray(r.embedReferers) ? r.embedReferers : (typeof r.embedReferers === 'string' ? JSON.parse(r.embedReferers || '[]') : []),
            flag: getFlagEmoji(r.countryCode)
          };
        });
        if (filter === 'my_device') {
          devices = devices.filter(d => d.isMyDevice);
        } else if (filter === 'external_only') {
          devices = devices.filter(d => !d.isMyDevice);
        }
      } catch (err) {
        console.error('[PostgreSQL getVisitorDevices error]', err.message);
      }
    } else if (this.sqliteDb) {
      try {
        let whereClauses = [];
        let params = [];

        if (search) {
          whereClauses.push('(device_id LIKE ? OR last_ip LIKE ? OR browser LIKE ? OR os LIKE ? OR user_agent LIKE ? OR profile_name LIKE ? OR country LIKE ? OR city LIKE ? OR reverse_dns LIKE ? OR isp LIKE ?)');
          params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (filter === 'embeds_only') {
          whereClauses.push('embed_calls_count > 0');
        } else if (filter === 'mobile') {
          whereClauses.push("device = 'Mobile'");
        } else if (filter === 'desktop') {
          whereClauses.push("device = 'Desktop'");
        } else if (filter === 'tablet') {
          whereClauses.push("device = 'Tablet'");
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        let orderCol = 'last_seen DESC';
        if (sortBy === 'visits') orderCol = 'visit_count DESC, last_seen DESC';
        else if (sortBy === 'duration') orderCol = 'total_duration_seconds DESC, last_seen DESC';
        else if (sortBy === 'requests') orderCol = 'total_requests DESC, last_seen DESC';
        else if (sortBy === 'bytes') orderCol = 'bytes_transferred DESC, last_seen DESC';
        else if (sortBy === 'embeds') orderCol = 'embed_calls_count DESC, last_seen DESC';

        try {
          const stats = this.sqliteDb.prepare('SELECT count(*) as total_devices, COALESCE(sum(embed_calls_count), 0) as total_embed_calls FROM analytics_devices').get();
          if (stats) {
            totalDevicesCount = stats.total_devices || 0;
            totalEmbedCallsCount = stats.total_embed_calls || 0;
          }
        } catch (e) {}

        try {
          const refRows = this.sqliteDb.prepare(
            `SELECT referer, count(*) as count, max(created_at) as last_seen
             FROM analytics_traffic_logs
             WHERE referer IS NOT NULL AND referer != '' AND referer NOT LIKE '%localhost%' AND referer NOT LIKE '%127.0.0.1%'
             GROUP BY referer
             ORDER BY count DESC
             LIMIT 10`
          ).all();
          topEmbedReferrers = refRows;
        } catch (e) {}

        params.push(limit);
        const rows = this.sqliteDb.prepare(
          `SELECT device_id as deviceId, first_seen as firstSeen, last_seen as lastSeen,
                  visit_count as visitCount, total_duration_seconds as totalDurationSeconds,
                  total_requests as totalRequests, bytes_transferred as bytesTransferred,
                  last_ip as lastIp, ips, user_agent as userAgent, browser, os,
                  COALESCE(device, 'Desktop') as device, user_id as userId, profile_name as profileName,
                  embed_calls_count as embedCallsCount, embed_referers as embedReferers, last_path as lastPath,
                  country, country_code as countryCode, city, region, isp, org, lat, lon, reverse_dns as reverseDns
           FROM analytics_devices
           ${whereSql}
           ORDER BY ${orderCol}
           LIMIT ?`
        ).all(...params);

        const adminIp = (options.adminIp || '').replace(/^::ffff:/, '').trim();
        const isLocalAdmin = !adminIp || ['127.0.0.1', '::1', 'localhost'].includes(adminIp);

        devices = rows.map(r => {
          const lastIpClean = (r.lastIp || '').replace(/^::ffff:/, '').trim();
          const ipsArray = typeof r.ips === 'string' ? JSON.parse(r.ips || '[]') : (r.ips || []);
          const isMyDev = Boolean(
            adminIp && (
              lastIpClean === adminIp ||
              ipsArray.some(ip => String(ip).replace(/^::ffff:/, '').trim() === adminIp) ||
              (isLocalAdmin && ['127.0.0.1', '::1', 'localhost'].includes(lastIpClean))
            )
          );
          return {
            ...r,
            isMyDevice: isMyDev,
            bytesTransferred: parseInt(r.bytesTransferred, 10) || 0,
            totalDurationSeconds: parseInt(r.totalDurationSeconds, 10) || 0,
            visitCount: parseInt(r.visitCount, 10) || 1,
            totalRequests: parseInt(r.totalRequests, 10) || 0,
            embedCallsCount: parseInt(r.embedCallsCount, 10) || 0,
            ips: ipsArray,
            embedReferers: typeof r.embedReferers === 'string' ? JSON.parse(r.embedReferers || '[]') : (r.embedReferers || []),
            flag: getFlagEmoji(r.countryCode)
          };
        });
        if (filter === 'my_device') {
          devices = devices.filter(d => d.isMyDevice);
        } else if (filter === 'external_only') {
          devices = devices.filter(d => !d.isMyDevice);
        }
        if (!search && filter === 'all') {
          totalDevicesCount = Math.max(totalDevicesCount, devices.length);
        }
      } catch (e) {
        console.error('[SQLite getVisitorDevices error]', e.message);
      }
    }

    return {
      devices,
      totalDevicesCount,
      totalEmbedCallsCount,
      topEmbedReferrers
    };
  }

  async getDeviceDetail(deviceId) {
    if (!deviceId) return null;
    let device = null;
    let logs = [];

    if (this.isPgConnected && this.pgPool) {
      try {
        const dRes = await this.pgPool.query(
          `SELECT device_id as "deviceId", first_seen as "firstSeen", last_seen as "lastSeen",
                  visit_count as "visitCount", total_duration_seconds as "totalDurationSeconds",
                  total_requests as "totalRequests", bytes_transferred as "bytesTransferred",
                  last_ip as "lastIp", ips, user_agent as "userAgent", browser, os,
                  COALESCE(device, 'Desktop') as device, user_id as "userId", profile_name as "profileName",
                  embed_calls_count as "embedCallsCount", embed_referers as "embedReferers", last_path as "lastPath",
                  country, country_code as "countryCode", city, region, isp, org, lat, lon, reverse_dns as "reverseDns"
           FROM analytics_devices
           WHERE device_id = $1`,
          [deviceId]
        );
        if (dRes.rows[0]) {
          const r = dRes.rows[0];
          device = {
            ...r,
            ips: Array.isArray(r.ips) ? r.ips : (typeof r.ips === 'string' ? JSON.parse(r.ips || '[]') : []),
            embedReferers: Array.isArray(r.embedReferers) ? r.embedReferers : (typeof r.embedReferers === 'string' ? JSON.parse(r.embedReferers || '[]') : []),
            flag: getFlagEmoji(r.countryCode)
          };
        }

        const lRes = await this.pgPool.query(
          `SELECT id, created_at as timestamp, ip, method, path, status_code as "statusCode",
                  latency_ms as "latencyMs", bytes_transferred as bytes, browser, os,
                  COALESCE(device, 'Desktop') as device, user_id as "userId",
                  device_id as "deviceId", referer, is_embed as "isEmbed",
                  country, city, reverse_dns as "reverseDns"
           FROM analytics_traffic_logs
           WHERE device_id = $1
           ORDER BY created_at DESC
           LIMIT 50`,
          [deviceId]
        );
        logs = lRes.rows.map(r => ({
          ...r,
          bytes: parseInt(r.bytes, 10) || 0,
          timestamp: new Date(r.timestamp).getTime()
        }));
      } catch (e) {
        console.error('[PostgreSQL getDeviceDetail error]', e.message);
      }
    } else if (this.sqliteDb) {
      try {
        const dRow = this.sqliteDb.prepare(
          `SELECT device_id as deviceId, first_seen as firstSeen, last_seen as lastSeen,
                  visit_count as visitCount, total_duration_seconds as totalDurationSeconds,
                  total_requests as totalRequests, bytes_transferred as bytesTransferred,
                  last_ip as lastIp, ips, user_agent as userAgent, browser, os,
                  COALESCE(device, 'Desktop') as device, user_id as userId, profile_name as profileName,
                  embed_calls_count as embedCallsCount, embed_referers as embedReferers, last_path as lastPath,
                  country, country_code as countryCode, city, region, isp, org, lat, lon, reverse_dns as reverseDns
           FROM analytics_devices
           WHERE device_id = ?`
        ).get(deviceId);
        if (dRow) {
          device = {
            ...dRow,
            bytesTransferred: parseInt(dRow.bytesTransferred, 10) || 0,
            totalDurationSeconds: parseInt(dRow.totalDurationSeconds, 10) || 0,
            visitCount: parseInt(dRow.visitCount, 10) || 1,
            totalRequests: parseInt(dRow.totalRequests, 10) || 0,
            embedCallsCount: parseInt(dRow.embedCallsCount, 10) || 0,
            ips: typeof dRow.ips === 'string' ? JSON.parse(dRow.ips || '[]') : (dRow.ips || []),
            embedReferers: typeof dRow.embedReferers === 'string' ? JSON.parse(dRow.embedReferers || '[]') : (dRow.embedReferers || []),
            flag: getFlagEmoji(dRow.countryCode)
          };
        }

        const lRows = this.sqliteDb.prepare(
          `SELECT id, created_at as timestamp, ip, method, path, status_code as statusCode,
                  latency_ms as latencyMs, bytes_transferred as bytes, browser, os,
                  COALESCE(device, 'Desktop') as device, user_id as userId,
                  device_id as deviceId, referer, is_embed as isEmbed,
                  country, city, reverse_dns as reverseDns
           FROM analytics_traffic_logs
           WHERE device_id = ?
           ORDER BY id DESC
           LIMIT 50`
        ).all(deviceId);
        logs = lRows.map(r => ({
          ...r,
          bytes: parseInt(r.bytes, 10) || 0,
          timestamp: new Date(r.timestamp).getTime()
        }));
      } catch (e) {
        console.error('[SQLite getDeviceDetail error]', e.message);
      }
    }

    return { device, logs };
  }

  async terminateSession(sessionId) {
    if (!sessionId) return { success: false };
    if (this.isRedisConnected && this.redis) {
      try {
        await this.redis.zrem('valor:active_sessions', sessionId);
        await this.redis.del(`valor:session:${sessionId}`);
      } catch (e) {}
    }
    if (this.isPgConnected && this.pgPool) {
      try {
        await this.pgPool.query(`DELETE FROM analytics_sessions WHERE session_id = $1`, [sessionId]);
      } catch (e) {}
    }
    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare(`DELETE FROM analytics_sessions WHERE session_id = ?`).run(sessionId);
      } catch (e) {}
    }
    return { success: true, sessionId };
  }

  async isIpBlocked(ip) {
    if (!ip) return false;
    if (this._blockedIpsCache && this._blockedIpsCache.has(ip)) return true;
    if (!this._blockedIpsCache) {
      this._blockedIpsCache = new Set();
      try {
        if (this.isPgConnected && this.pgPool) {
          const res = await this.pgPool.query(`SELECT ip FROM blocked_ips`);
          res.rows.forEach(r => this._blockedIpsCache.add(r.ip));
        } else if (this.sqliteDb) {
          const rows = this.sqliteDb.prepare(`SELECT ip FROM blocked_ips`).all();
          rows.forEach(r => this._blockedIpsCache.add(r.ip));
        }
      } catch (e) {}
    }
    return this._blockedIpsCache.has(ip);
  }

  async blockIp(ip, reason = 'Administrative action') {
    if (!ip) return { success: false };
    if (!this._blockedIpsCache) this._blockedIpsCache = new Set();
    this._blockedIpsCache.add(ip);
    const now = new Date().toISOString();
    if (this.isPgConnected && this.pgPool) {
      try {
        await this.pgPool.query(`INSERT INTO blocked_ips (ip, reason, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (ip) DO NOTHING`, [ip, reason]);
      } catch (e) {}
    }
    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare(`INSERT OR IGNORE INTO blocked_ips (ip, reason, created_at) VALUES (?, ?, ?)`).run(ip, reason, now);
      } catch (e) {}
    }
    this.dispatchWebhook('security.ip_blocked', { ip, reason, timestamp: now }).catch(() => {});
    return { success: true, ip, reason };
  }

  async unblockIp(ip) {
    if (!ip) return { success: false };
    if (this._blockedIpsCache) this._blockedIpsCache.delete(ip);
    if (this.isPgConnected && this.pgPool) {
      try {
        await this.pgPool.query(`DELETE FROM blocked_ips WHERE ip = $1`, [ip]);
      } catch (e) {}
    }
    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare(`DELETE FROM blocked_ips WHERE ip = ?`).run(ip);
      } catch (e) {}
    }
    return { success: true, ip };
  }

  // --------------------------------------------------------------------------
  // Webhooks Management & Dispatcher
  // --------------------------------------------------------------------------

  async getWebhooks() {
    let list = [];
    if (this.isPgConnected && this.pgPool) {
      try {
        const res = await this.pgPool.query(`SELECT id, name, url, secret, events, enabled, created_at as "createdAt", last_triggered as "lastTriggered", total_deliveries as "totalDeliveries", failed_deliveries as "failedDeliveries" FROM webhooks ORDER BY created_at DESC`);
        list = res.rows.map(r => ({
          ...r,
          events: Array.isArray(r.events) ? r.events : (typeof r.events === 'string' ? JSON.parse(r.events || '["*"]') : ['*']),
          enabled: Boolean(r.enabled)
        }));
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        const rows = this.sqliteDb.prepare(`SELECT id, name, url, secret, events, enabled, created_at as createdAt, last_triggered as lastTriggered, total_deliveries as totalDeliveries, failed_deliveries as failedDeliveries FROM webhooks ORDER BY created_at DESC`).all();
        list = rows.map(r => ({
          ...r,
          events: typeof r.events === 'string' ? JSON.parse(r.events || '["*"]') : (r.events || ['*']),
          enabled: Boolean(r.enabled)
        }));
      } catch (e) {}
    }
    return list;
  }

  async createWebhook(data) {
    const id = `wh_${crypto.randomBytes(8).toString('hex')}`;
    const name = data.name || 'Webhook Endpoint';
    const url = data.url;
    const secret = data.secret || null;
    const events = Array.isArray(data.events) ? data.events : ['*'];
    const enabled = data.enabled !== false ? 1 : 0;
    const now = new Date().toISOString();

    if (this.isPgConnected && this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO webhooks (id, name, url, secret, events, enabled, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, name, url, secret, JSON.stringify(events), Boolean(enabled), now]
        );
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare(
          `INSERT INTO webhooks (id, name, url, secret, events, enabled, created_at, total_deliveries, failed_deliveries) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`
        ).run(id, name, url, secret, JSON.stringify(events), enabled, now);
      } catch (e) {}
    }

    return { id, name, url, secret, events, enabled: Boolean(enabled), createdAt: now };
  }

  async updateWebhook(id, data) {
    const events = Array.isArray(data.events) ? JSON.stringify(data.events) : (typeof data.events === 'string' ? data.events : '["*"]');
    const enabled = data.enabled !== false ? 1 : 0;

    if (this.isPgConnected && this.pgPool) {
      try {
        await this.pgPool.query(
          `UPDATE webhooks SET name = COALESCE($1, name), url = COALESCE($2, url), secret = COALESCE($3, secret), events = $4, enabled = $5 WHERE id = $6`,
          [data.name, data.url, data.secret, events, Boolean(enabled), id]
        );
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare(
          `UPDATE webhooks SET name = COALESCE(?, name), url = COALESCE(?, url), secret = COALESCE(?, secret), events = ?, enabled = ? WHERE id = ?`
        ).run(data.name, data.url, data.secret, events, enabled, id);
      } catch (e) {}
    }
    return { success: true };
  }

  async deleteWebhook(id) {
    if (this.isPgConnected && this.pgPool) {
      try {
        await this.pgPool.query('DELETE FROM webhook_deliveries WHERE webhook_id = $1', [id]);
        await this.pgPool.query('DELETE FROM webhooks WHERE id = $1', [id]);
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('DELETE FROM webhook_deliveries WHERE webhook_id = ?').run(id);
        this.sqliteDb.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
      } catch (e) {}
    }
    return { success: true };
  }

  async getWebhookDeliveries(limit = 50) {
    let list = [];
    if (this.isPgConnected && this.pgPool) {
      try {
        const res = await this.pgPool.query(`SELECT id, webhook_id as "webhookId", webhook_name as "webhookName", event, status, status_code as "statusCode", latency_ms as "latencyMs", payload, response_body as "responseBody", created_at as "createdAt" FROM webhook_deliveries ORDER BY created_at DESC LIMIT $1`, [limit]);
        list = res.rows;
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        const rows = this.sqliteDb.prepare(`SELECT id, webhook_id as webhookId, webhook_name as webhookName, event, status, status_code as statusCode, latency_ms as latencyMs, payload, response_body as responseBody, created_at as createdAt FROM webhook_deliveries ORDER BY created_at DESC LIMIT ?`).all(limit);
        list = rows;
      } catch (e) {}
    }
    return list;
  }

  async testWebhook(id) {
    const webhooks = await this.getWebhooks();
    const wh = webhooks.find(w => w.id === id);
    if (!wh) throw new Error('Webhook not found');

    const testPayload = {
      event: 'system.ping',
      message: 'Test ping from Valor SaaS Admin Dashboard',
      timestamp: new Date().toISOString(),
      webhookId: wh.id,
      webhookName: wh.name
    };

    return await this.sendWebhookDelivery(wh, 'system.ping', testPayload);
  }

  async dispatchWebhook(event, payload) {
    try {
      const webhooks = await this.getWebhooks();
      const eligible = webhooks.filter(wh => wh.enabled && (wh.events.includes('*') || wh.events.includes(event)));
      if (!eligible.length) return;

      for (const wh of eligible) {
        this.sendWebhookDelivery(wh, event, payload).catch(() => {});
      }
    } catch (e) {}
  }

  async sendWebhookDelivery(wh, event, payload) {
    const deliveryId = `del_${crypto.randomBytes(6).toString('hex')}`;
    const payloadStr = JSON.stringify({
      id: deliveryId,
      event,
      timestamp: new Date().toISOString(),
      data: payload
    });

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Valor-SaaS-Admin-Webhook/2.0',
      'X-Valor-Delivery': deliveryId,
      'X-Valor-Event': event,
      'X-Valor-Timestamp': new Date().toISOString()
    };

    if (wh.secret) {
      const hmac = crypto.createHmac('sha256', wh.secret).update(payloadStr).digest('hex');
      headers['X-Valor-Signature'] = `sha256=${hmac}`;
    }

    const t0 = Date.now();
    let status = 'failed';
    let statusCode = 0;
    let responseBody = '';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(wh.url, {
        method: 'POST',
        headers,
        body: payloadStr,
        signal: controller.signal
      });
      clearTimeout(timer);
      statusCode = res.status;
      const text = await res.text();
      responseBody = text.slice(0, 1000);
      status = (res.status >= 200 && res.status < 300) ? 'success' : 'failed';
    } catch (err) {
      responseBody = err.message || 'Request failed';
      statusCode = 0;
      status = 'failed';
    }

    const latencyMs = Date.now() - t0;
    const now = new Date().toISOString();

    // Record delivery
    if (this.isPgConnected && this.pgPool) {
      try {
        await this.pgPool.query(
          `INSERT INTO webhook_deliveries (id, webhook_id, webhook_name, event, status, status_code, latency_ms, payload, response_body, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [deliveryId, wh.id, wh.name, event, status, statusCode, latencyMs, payloadStr, responseBody, now]
        );
        const failIncr = status === 'failed' ? 1 : 0;
        await this.pgPool.query(
          `UPDATE webhooks SET total_deliveries = total_deliveries + 1, failed_deliveries = failed_deliveries + $1, last_triggered = $2 WHERE id = $3`,
          [failIncr, now, wh.id]
        );
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare(
          `INSERT INTO webhook_deliveries (id, webhook_id, webhook_name, event, status, status_code, latency_ms, payload, response_body, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(deliveryId, wh.id, wh.name, event, status, statusCode, latencyMs, payloadStr, responseBody, now);
        const failIncr = status === 'failed' ? 1 : 0;
        this.sqliteDb.prepare(
          `UPDATE webhooks SET total_deliveries = total_deliveries + 1, failed_deliveries = failed_deliveries + ?, last_triggered = ? WHERE id = ?`
        ).run(failIncr, now, wh.id);
      } catch (e) {}
    }

    return { deliveryId, status, statusCode, latencyMs, responseBody };
  }

  async getRegisteredUsersList() {
    const list = [];
    if (this.isPgConnected && this.pgPool) {
      try {
        const res = await this.pgPool.query(
          `SELECT p.user_id, p.name, p.username, p.created_at,
                  count(distinct h.video_id) as history_count,
                  count(distinct b.id) as bookmarks_count
           FROM profiles p
           LEFT JOIN history h ON p.user_id = h.user_id
           LEFT JOIN bookmarks b ON p.user_id = b.user_id
           GROUP BY p.user_id, p.name, p.username, p.created_at
           ORDER BY p.created_at DESC`
        );
        for (const row of res.rows) {
          list.push({
            userId: row.user_id,
            name: row.name,
            username: row.username,
            createdAt: row.created_at,
            storageMode: 'Cloud (Docker PostgreSQL + Redis)',
            historyCount: parseInt(row.history_count, 10) || 0,
            bookmarksCount: parseInt(row.bookmarks_count, 10) || 0
          });
        }
      } catch (e) {}
    }

    if (this.sqliteDb) {
      try {
        const rows = this.sqliteDb.prepare(
          `SELECT p.userId as user_id, p.name, p.username, p.createdAt as created_at
           FROM profiles p`
        ).all();
        for (const row of rows) {
          if (!list.some(item => item.userId === row.user_id)) {
            list.push({
              userId: row.user_id,
              name: row.name,
              username: row.username,
              createdAt: row.created_at,
              storageMode: row.user_id.startsWith('local_') ? 'Local Storage (IndexedDB)' : 'SQLite / Fallback',
              historyCount: 0,
              bookmarksCount: 0
            });
          }
        }
      } catch (e) {}
    }

    return list;
  }

  // ==============================================================================
  // Enterprise Media Timestamp & Bookmark Store (PostgreSQL + Redis + SQLite)
  // Supports: Intro, Outro, Preview/Recap, Nudity, Sex, Gore, and Custom Bookmarks
  // ==============================================================================

  /**
   * Fetch bookmarks for a given media by tmdbId (and season/episode) or videoId.
   * Lazy-loads from Redis cache, then PostgreSQL, falling back to SQLite.
   */
  async getBookmarks({ tmdbId = null, season = null, episode = null, videoId = null, userId = null } = {}) {
    const s = (season !== undefined && season !== null && season !== '') ? parseInt(season, 10) : null;
    const ep = (episode !== undefined && episode !== null && episode !== '') ? parseInt(episode, 10) : null;
    const tId = tmdbId ? parseInt(tmdbId, 10) : null;

    const cacheKey = tId
      ? `valor:cache:bookmarks:tmdb:${tId}:${s || 0}:${ep || 0}`
      : `valor:cache:bookmarks:vid:${videoId || 'all'}`;

    // 1. Check Redis Lazy Cache
    try {
      const cached = await this.cacheGet(cacheKey);
      if (cached && Array.isArray(cached)) {
        return cached;
      }
    } catch (e) {}

    let rows = [];

    // 2. Query PostgreSQL
    if (this.isPgConnected && this.pgPool) {
      try {
        let query;
        let params;
        if (tId) {
          if (s !== null && ep !== null && s !== 0) {
            query = `SELECT * FROM bookmarks WHERE tmdb_id = $1 AND season = $2 AND episode = $3 ORDER BY time ASC`;
            params = [tId, s, ep];
          } else {
            query = `SELECT * FROM bookmarks WHERE tmdb_id = $1 AND (season IS NULL OR season = 0) ORDER BY time ASC`;
            params = [tId];
          }
        } else if (videoId) {
          query = `SELECT * FROM bookmarks WHERE video_id = $1 ORDER BY time ASC`;
          params = [videoId];
        } else if (userId) {
          query = `SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY time ASC`;
          params = [userId];
        } else {
          query = `SELECT * FROM bookmarks ORDER BY created_at DESC LIMIT 200`;
          params = [];
        }

        const res = await this.pgPool.query(query, params);
        rows = res.rows.map(bm => ({
          id: bm.id,
          time: bm.time,
          endTime: bm.end_time !== null ? bm.end_time : undefined,
          label: bm.label,
          isIntro: Boolean(bm.is_intro),
          isOutro: Boolean(bm.is_outro),
          skipEnabled: Boolean(bm.skip_enabled),
          title: bm.title || '',
          description: bm.description || '',
          category: bm.category || (bm.is_intro ? 'Intro' : bm.is_outro ? 'Outro' : 'Custom'),
          startTime: bm.start_time !== null ? bm.start_time : bm.time,
          thumbnail: bm.thumbnail || '',
          favorite: Boolean(bm.favorite),
          createdAt: bm.created_at,
          updatedAt: bm.updated_at,
          userName: bm.user_name || '',
          userTime: bm.user_time || '',
          mediaName: bm.media_name || '',
          tmdbId: bm.tmdb_id,
          episode: bm.episode,
          season: bm.season,
          color: bm.color || '',
          userId: bm.user_id,
          videoId: bm.video_id,
          createdBy: bm.created_by || 'manual'
        }));
      } catch (err) {
        console.error('[PostgreSQL] getBookmarks error:', err.message);
      }
    }

    // 3. Fallback or merge from SQLite if PostgreSQL has no results or failed
    if (rows.length === 0 && this.sqliteDb) {
      try {
        let sqliteRows = [];
        if (tId) {
          if (s !== null && ep !== null && s !== 0) {
            sqliteRows = this.sqliteDb.prepare('SELECT * FROM bookmarks WHERE tmdbId = ? AND season = ? AND episode = ? ORDER BY time ASC').all(tId, s, ep);
          } else {
            sqliteRows = this.sqliteDb.prepare('SELECT * FROM bookmarks WHERE tmdbId = ? AND (season IS NULL OR season = 0 OR season = "") ORDER BY time ASC').all(tId);
          }
        } else if (videoId) {
          sqliteRows = this.sqliteDb.prepare('SELECT * FROM bookmarks WHERE videoId = ? ORDER BY time ASC').all(videoId);
        } else if (userId) {
          sqliteRows = this.sqliteDb.prepare('SELECT * FROM bookmarks WHERE userId = ? ORDER BY time ASC').all(userId);
        } else {
          sqliteRows = this.sqliteDb.prepare('SELECT * FROM bookmarks ORDER BY time ASC LIMIT 200').all();
        }

        rows = sqliteRows.map(bm => ({
          id: bm.id,
          time: bm.time,
          endTime: bm.endTime !== null ? bm.endTime : undefined,
          label: bm.label,
          isIntro: bm.isIntro === 1,
          isOutro: bm.isOutro === 1,
          skipEnabled: bm.skipEnabled === 1,
          title: bm.title || '',
          description: bm.description || '',
          category: bm.category || (bm.isIntro ? 'Intro' : bm.isOutro ? 'Outro' : 'Custom'),
          startTime: bm.startTime !== null ? bm.startTime : bm.time,
          thumbnail: bm.thumbnail || '',
          favorite: bm.favorite === 1,
          createdAt: bm.createdAt,
          updatedAt: bm.updatedAt,
          userName: bm.userName || '',
          userTime: bm.userTime || '',
          mediaName: bm.mediaName || '',
          tmdbId: bm.tmdbId,
          episode: bm.episode,
          season: bm.season,
          color: bm.color || '',
          userId: bm.userId,
          videoId: bm.videoId,
          createdBy: bm.createdBy || 'manual'
        }));
      } catch (err) {
        console.error('[SQLite] getBookmarks error:', err.message);
      }
    }

    // 4. Cache in Redis (1 hour TTL)
    if (rows.length > 0) {
      try {
        await this.cacheSet(cacheKey, rows, 3600);
      } catch (e) {}
    }

    return rows;
  }

  /**
   * Save an array of bookmarks/timestamps into PostgreSQL and SQLite with cache invalidation.
   */
  async saveBookmarks(bookmarks, { tmdbId = null, season = null, episode = null, videoId = null, userId = null } = {}) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return { success: true, count: 0 };
    }

    const tId = tmdbId ? parseInt(tmdbId, 10) : null;
    const s = (season !== undefined && season !== null && season !== '') ? parseInt(season, 10) : null;
    const ep = (episode !== undefined && episode !== null && episode !== '') ? parseInt(episode, 10) : null;
    const activeUserId = userId || 'theintrodb';
    const activeVideoId = videoId || (tId ? `tmdb-${tId}-${s || 0}-${ep || 0}` : 'default-video');

    // 1. Persist to PostgreSQL
    if (this.isPgConnected && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        const upsertQuery = `
          INSERT INTO bookmarks (
            user_id, video_id, id, time, end_time, label, is_intro, is_outro, skip_enabled,
            title, description, category, start_time, thumbnail, favorite,
            created_at, updated_at, episode, season, color, tmdb_id,
            user_name, user_time, media_name, created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $16, $17, $18, $19,
            $20, $21, $22, $23
          )
          ON CONFLICT (user_id, video_id, id) DO UPDATE SET
            time = EXCLUDED.time,
            end_time = EXCLUDED.end_time,
            label = EXCLUDED.label,
            is_intro = EXCLUDED.is_intro,
            is_outro = EXCLUDED.is_outro,
            skip_enabled = EXCLUDED.skip_enabled,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            start_time = EXCLUDED.start_time,
            thumbnail = EXCLUDED.thumbnail,
            favorite = EXCLUDED.favorite,
            updated_at = CURRENT_TIMESTAMP,
            episode = EXCLUDED.episode,
            season = EXCLUDED.season,
            color = EXCLUDED.color,
            tmdb_id = EXCLUDED.tmdb_id,
            user_name = EXCLUDED.user_name,
            user_time = EXCLUDED.user_time,
            media_name = EXCLUDED.media_name,
            created_by = EXCLUDED.created_by
        `;

        for (const bm of bookmarks) {
          const bmUserId = bm.userId || activeUserId;
          const bmVideoId = bm.videoId || activeVideoId;
          const bmTmdbId = bm.tmdbId !== undefined && bm.tmdbId !== null ? parseInt(bm.tmdbId, 10) : tId;
          const bmSeason = bm.season !== undefined && bm.season !== null ? parseInt(bm.season, 10) : s;
          const bmEpisode = bm.episode !== undefined && bm.episode !== null ? parseInt(bm.episode, 10) : ep;

          await client.query(upsertQuery, [
            bmUserId,
            bmVideoId,
            bm.id,
            Number(bm.time) || 0,
            bm.endTime !== undefined && bm.endTime !== null ? Number(bm.endTime) : null,
            bm.label || '',
            Boolean(bm.isIntro),
            Boolean(bm.isOutro),
            Boolean(bm.skipEnabled),
            bm.title || bm.label || '',
            bm.description || null,
            bm.category || (bm.isIntro ? 'Intro' : bm.isOutro ? 'Outro' : 'Custom'),
            bm.startTime !== undefined && bm.startTime !== null ? Number(bm.startTime) : (Number(bm.time) || 0),
            bm.thumbnail || null,
            Boolean(bm.favorite),
            bmEpisode,
            bmSeason,
            bm.color || null,
            bmTmdbId,
            bm.userName || null,
            bm.userTime || null,
            bm.mediaName || null,
            bm.createdBy || 'manual'
          ]);
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[PostgreSQL] saveBookmarks error:', err.message);
      } finally {
        client.release();
      }
    }

    // 2. Persist to SQLite
    if (this.sqliteDb) {
      try {
        const insertStmt = this.sqliteDb.prepare(`
          INSERT OR REPLACE INTO bookmarks (
            userId, videoId, id, time, endTime, label, isIntro, isOutro, skipEnabled,
            title, description, category, startTime, thumbnail, favorite,
            createdAt, updatedAt, episode, season, color, tmdbId,
            userName, userTime, mediaName, createdBy
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            datetime('now'), datetime('now'), ?, ?, ?, ?,
            ?, ?, ?, ?
          )
        `);

        for (const bm of bookmarks) {
          const bmUserId = bm.userId || activeUserId;
          const bmVideoId = bm.videoId || activeVideoId;
          const bmTmdbId = bm.tmdbId !== undefined && bm.tmdbId !== null ? parseInt(bm.tmdbId, 10) : tId;
          const bmSeason = bm.season !== undefined && bm.season !== null ? parseInt(bm.season, 10) : s;
          const bmEpisode = bm.episode !== undefined && bm.episode !== null ? parseInt(bm.episode, 10) : ep;

          insertStmt.run(
            bmUserId,
            bmVideoId,
            bm.id,
            Number(bm.time) || 0,
            bm.endTime !== undefined && bm.endTime !== null ? Number(bm.endTime) : null,
            bm.label || '',
            bm.isIntro ? 1 : 0,
            bm.isOutro ? 1 : 0,
            bm.skipEnabled ? 1 : 0,
            bm.title || bm.label || '',
            bm.description || null,
            bm.category || (bm.isIntro ? 'Intro' : bm.isOutro ? 'Outro' : 'Custom'),
            bm.startTime !== undefined && bm.startTime !== null ? Number(bm.startTime) : (Number(bm.time) || 0),
            bm.thumbnail || null,
            bm.favorite ? 1 : 0,
            bmEpisode,
            bmSeason,
            bm.color || null,
            bmTmdbId,
            bm.userName || null,
            bm.userTime || null,
            bm.mediaName || null,
            bm.createdBy || 'manual'
          );
        }
      } catch (err) {
        console.error('[SQLite] saveBookmarks error:', err.message);
      }
    }

    // 3. Invalidate Redis Caches
    try {
      if (tId) {
        await this.cacheDel(`valor:cache:bookmarks:tmdb:${tId}:${s || 0}:${ep || 0}`);
      }
      if (activeVideoId) {
        await this.cacheDel(`valor:cache:bookmarks:vid:${activeVideoId}`);
      }
      if (userId) {
        await this.cacheDel(`valor:cache:profile_data:${userId}`);
      }
    } catch (e) {}

    return { success: true, count: bookmarks.length };
  }

  /**
   * Save IntroDB timestamps (intro, recap/preview, credits/outro) into our database
   * so they are cached permanently across the entire server.
   */
  async saveIntroDbTimestamps({ tmdbId, season = null, episode = null, videoId = null, mediaName = '', introDbData = null, timestamps = null, userId = 'theintrodb' }) {
    const tId = tmdbId ? parseInt(tmdbId, 10) : null;
    const s = (season !== undefined && season !== null && season !== '') ? parseInt(season, 10) : null;
    const ep = (episode !== undefined && episode !== null && episode !== '') ? parseInt(episode, 10) : null;
    const targetVideoId = videoId || (tId ? `tmdb-${tId}-${s || 0}-${ep || 0}` : 'media-tidb');

    const normalizedBookmarks = [];
    const msToSec = (ms) => (ms !== undefined && ms !== null ? Math.round(Number(ms) / 1000) : 0);

    // If passed direct introDbData object from TheIntroDB API
    if (introDbData && typeof introDbData === 'object') {
      if (Array.isArray(introDbData.intro)) {
        introDbData.intro.forEach((item, idx) => {
          const start = item.start_sec !== undefined ? Number(item.start_sec) : msToSec(item.start_ms);
          const end = item.end_sec !== undefined ? Number(item.end_sec) : msToSec(item.end_ms);
          normalizedBookmarks.push({
            id: `introdb-intro-${tId || '0'}-${s || 0}-${ep || 0}-${idx}-${Math.round(start)}`,
            time: start,
            endTime: end,
            startTime: start,
            label: 'Intro',
            category: 'Intro',
            isIntro: true,
            isOutro: false,
            skipEnabled: true,
            createdBy: 'theintrodb',
            userId: userId || 'theintrodb',
            videoId: targetVideoId,
            tmdbId: tId,
            season: s,
            episode: ep,
            mediaName: mediaName
          });
        });
      }

      if (Array.isArray(introDbData.recap)) {
        introDbData.recap.forEach((item, idx) => {
          const start = item.start_sec !== undefined ? Number(item.start_sec) : msToSec(item.start_ms);
          const end = item.end_sec !== undefined ? Number(item.end_sec) : msToSec(item.end_ms);
          normalizedBookmarks.push({
            id: `introdb-preview-${tId || '0'}-${s || 0}-${ep || 0}-${idx}-${Math.round(start)}`,
            time: start,
            endTime: end,
            startTime: start,
            label: 'Preview / Recap',
            category: 'Preview',
            isIntro: true,
            isOutro: false,
            skipEnabled: true,
            createdBy: 'theintrodb',
            userId: userId || 'theintrodb',
            videoId: targetVideoId,
            tmdbId: tId,
            season: s,
            episode: ep,
            mediaName: mediaName
          });
        });
      }

      if (Array.isArray(introDbData.credits)) {
        introDbData.credits.forEach((item, idx) => {
          const start = item.start_sec !== undefined ? Number(item.start_sec) : msToSec(item.start_ms);
          const end = item.end_sec !== undefined ? Number(item.end_sec) : msToSec(item.end_ms);
          normalizedBookmarks.push({
            id: `introdb-outro-${tId || '0'}-${s || 0}-${ep || 0}-${idx}-${Math.round(start)}`,
            time: start,
            endTime: end,
            startTime: start,
            label: 'Credits / Outro',
            category: 'Outro',
            isIntro: false,
            isOutro: true,
            skipEnabled: true,
            createdBy: 'theintrodb',
            userId: userId || 'theintrodb',
            videoId: targetVideoId,
            tmdbId: tId,
            season: s,
            episode: ep,
            mediaName: mediaName
          });
        });
      }
    }

    // If passed pre-parsed timestamps array
    if (Array.isArray(timestamps)) {
      timestamps.forEach((ts, idx) => {
        const seg = (ts.type || ts.category || ts.label || 'intro').toLowerCase();
        const isIntro = seg.includes('intro');
        const isOutro = seg.includes('outro') || seg.includes('credit');
        const isPreview = seg.includes('preview') || seg.includes('recap');
        const isNudity = seg.includes('nudity') || seg.includes('sex');

        let category = 'Intro';
        let label = 'Intro';
        if (isOutro) { category = 'Outro'; label = 'Credits / Outro'; }
        else if (isPreview) { category = 'Preview'; label = 'Preview / Recap'; }
        else if (isNudity) { category = 'Nudity'; label = 'Nudity'; }
        else if (ts.category) { category = ts.category; label = ts.label || ts.category; }

        const start = Number(ts.time ?? ts.startTime ?? ts.start_sec ?? 0);
        const end = ts.endTime !== undefined ? Number(ts.endTime) : (ts.end_sec !== undefined ? Number(ts.end_sec) : undefined);

        normalizedBookmarks.push({
          id: ts.id || `introdb-${category.toLowerCase()}-${tId || '0'}-${s || 0}-${ep || 0}-${idx}-${Math.round(start)}`,
          time: start,
          endTime: end,
          startTime: start,
          label: ts.label || label,
          category: category,
          isIntro: isIntro || isPreview,
          isOutro: isOutro,
          skipEnabled: ts.skipEnabled !== undefined ? Boolean(ts.skipEnabled) : true,
          createdBy: 'theintrodb',
          userId: userId || 'theintrodb',
          videoId: targetVideoId,
          tmdbId: tId,
          season: s,
          episode: ep,
          mediaName: mediaName || ts.mediaName || ''
        });
      });
    }

    if (normalizedBookmarks.length > 0) {
      await this.saveBookmarks(normalizedBookmarks, { tmdbId: tId, season: s, episode: ep, videoId: targetVideoId, userId });
      console.log(`\x1b[32m[IntroDB Sync]\x1b[0m Saved ${normalizedBookmarks.length} IntroDB timestamp(s) to our database for TMDB ${tId} (S${s || 0}E${ep || 0})`);
    }

    return normalizedBookmarks;
  }

  /**
   * Delete a bookmark from PostgreSQL and SQLite.
   */
  async deleteBookmark({ userId, videoId, id, tmdbId = null, season = null, episode = null }) {
    if (this.isPgConnected && this.pgPool) {
      try {
        await this.pgPool.query('DELETE FROM bookmarks WHERE user_id = $1 AND video_id = $2 AND id = $3', [userId, videoId, id]);
      } catch (err) {
        console.error('[PostgreSQL] deleteBookmark error:', err.message);
      }
    }

    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare('DELETE FROM bookmarks WHERE userId = ? AND videoId = ? AND id = ?').run(userId, videoId, id);
      } catch (err) {
        console.error('[SQLite] deleteBookmark error:', err.message);
      }
    }

    // Invalidate Redis
    try {
      if (tmdbId) {
        await this.cacheDel(`valor:cache:bookmarks:tmdb:${tmdbId}:${season || 0}:${episode || 0}`);
      }
      if (videoId) {
        await this.cacheDel(`valor:cache:bookmarks:vid:${videoId}`);
      }
      if (userId) {
        await this.cacheDel(`valor:cache:profile_data:${userId}`);
      }
    } catch (e) {}

    return { success: true };
  }
}

