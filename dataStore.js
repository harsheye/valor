// ==============================================================================
// Valor Enterprise Data Store (PostgreSQL + Redis Lazy Loading Cache + Fallback)
// ==============================================================================

import pg from 'pg';
import Redis from 'ioredis';
import crypto from 'crypto';

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

    // Run table verification if PostgreSQL is connected
    if (this.isPgConnected) {
      await this.ensurePgTables();
    }
  }

  async ensurePgTables() {
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
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_traffic_created ON analytics_traffic_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen ON analytics_sessions(last_seen DESC);
    `;
    try {
      await this.pgPool.query(initSql);
    } catch (e) {
      console.error('[PostgreSQL] Failed ensuring tables:', e.message);
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
      ip,
      userAgent,
      browser,
      os,
      device,
      path,
      method,
      statusCode,
      bytesTransferred = 0,
      latencyMs = 0,
      userId = null,
      profileName = null
    } = event;

    const now = Date.now();
    const dateStr = new Date().toISOString().slice(0, 10);
    const hourStr = new Date().getHours().toString();

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

        // Active Session presence in sorted set (score = timestamp)
        pipeline.zadd('valor:active_sessions', now, sessionId);

        // Session hash metadata
        const sessionKey = `valor:session:${sessionId}`;
        pipeline.hset(sessionKey, {
          sessionId,
          ip: ip || '127.0.0.1',
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
          method: method || 'GET',
          path: path || '/',
          statusCode: statusCode || 200,
          latencyMs: latencyMs || 0,
          bytes: bytesTransferred || 0,
          browser: browser || 'Unknown',
          os: os || 'Unknown',
          device: device || 'Desktop',
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
          `INSERT INTO analytics_traffic_logs (session_id, ip, method, path, status_code, latency_ms, bytes_transferred, user_agent, browser, os, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [sessionId, ip, method, path, statusCode, latencyMs, bytesTransferred, (userAgent || '').slice(0, 500), browser, os, userId]
        ).catch(() => {});

        this.pgPool.query(
          `INSERT INTO analytics_sessions (session_id, ip, user_agent, browser, os, device, user_id, profile_name, last_seen, total_requests, bytes_transferred, current_path)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 1, $9, $10)
           ON CONFLICT (session_id) DO UPDATE SET
             last_seen = NOW(),
             total_requests = analytics_sessions.total_requests + 1,
             bytes_transferred = analytics_sessions.bytes_transferred + $9,
             current_path = $10,
             user_id = COALESCE($7, analytics_sessions.user_id),
             profile_name = COALESCE($8, analytics_sessions.profile_name)`,
          [sessionId, ip, (userAgent || '').slice(0, 500), browser, os, device, userId, profileName, bytesTransferred, path]
        ).catch(() => {});
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare(
          `INSERT INTO analytics_traffic_logs (session_id, ip, method, path, status_code, latency_ms, bytes_transferred, user_agent, browser, os, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(sessionId, ip, method, path, statusCode, latencyMs, bytesTransferred, (userAgent || '').slice(0, 500), browser, os, userId);

        const existing = this.sqliteDb.prepare('SELECT session_id, total_requests, bytes_transferred FROM analytics_sessions WHERE session_id = ?').get(sessionId);
        if (existing) {
          this.sqliteDb.prepare(
            `UPDATE analytics_sessions SET 
               last_seen = datetime('now'),
               total_requests = total_requests + 1,
               bytes_transferred = bytes_transferred + ?,
               current_path = ?,
               user_id = COALESCE(?, user_id),
               profile_name = COALESCE(?, profile_name)
             WHERE session_id = ?`
          ).run(bytesTransferred, path, userId, profileName, sessionId);
        } else {
          this.sqliteDb.prepare(
            `INSERT INTO analytics_sessions (session_id, ip, user_agent, browser, os, device, user_id, profile_name, total_requests, bytes_transferred, current_path)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
          ).run(sessionId, ip, (userAgent || '').slice(0, 500), browser, os, device, userId, profileName, bytesTransferred, path);
        }
      } catch (e) {}
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

  async getDetailedAnalytics() {
    const today = new Date().toISOString().slice(0, 10);
    const hourlyData = [];
    const currentHour = new Date().getHours();

    let hourlyRequests = {};
    let hourlyBytes = {};
    if (this.isRedisConnected && this.redis) {
      try {
        hourlyRequests = await this.redis.hgetall(`valor:analytics:hourly_requests:${today}`) || {};
        hourlyBytes = await this.redis.hgetall(`valor:analytics:hourly_bytes:${today}`) || {};
      } catch (e) {}
    }

    for (let h = Math.max(0, currentHour - 11); h <= currentHour; h++) {
      const hStr = h.toString();
      const hourLabel = `${h.toString().padStart(2, '0')}:00`;
      const reqs = parseInt(hourlyRequests[hStr] || '0', 10);
      const bytes = parseInt(hourlyBytes[hStr] || '0', 10);
      hourlyData.push({
        hour: hourLabel,
        requests: reqs,
        bytes,
        activeUsers: reqs > 0 ? Math.max(1, Math.ceil(reqs / 6)) : 0
      });
    }

    let browsers = {};
    let osList = {};
    let devices = {};
    let topPathsRaw = [];

    if (this.isRedisConnected && this.redis) {
      try {
        browsers = await this.redis.hgetall('valor:analytics:browsers') || {};
        osList = await this.redis.hgetall('valor:analytics:os') || {};
        devices = await this.redis.hgetall('valor:analytics:devices') || {};
        topPathsRaw = await this.redis.zrevrange('valor:analytics:paths', 0, 9, 'WITHSCORES') || [];
      } catch (e) {}
    }

    if (Object.keys(browsers).length === 0) browsers = { Brave: 1, Chrome: 1 };
    if (Object.keys(osList).length === 0) osList = { macOS: 1 };
    if (Object.keys(devices).length === 0) devices = { Desktop: 1 };

    const browserTotal = Object.values(browsers).reduce((sum, v) => sum + parseInt(v, 10), 0) || 1;
    const browserBreakdown = Object.entries(browsers).map(([name, count]) => {
      const num = parseInt(count, 10);
      return {
        name,
        count: num,
        percentage: Math.round((num / browserTotal) * 100)
      };
    }).sort((a, b) => b.count - a.count);

    const osTotal = Object.values(osList).reduce((sum, v) => sum + parseInt(v, 10), 0) || 1;
    const osBreakdown = Object.entries(osList).map(([name, count]) => {
      const num = parseInt(count, 10);
      return {
        name,
        count: num,
        percentage: Math.round((num / osTotal) * 100)
      };
    }).sort((a, b) => b.count - a.count);

    const deviceTotal = Object.values(devices).reduce((sum, v) => sum + parseInt(v, 10), 0) || 1;
    const deviceBreakdown = Object.entries(devices).map(([name, count]) => {
      const num = parseInt(count, 10);
      return {
        name,
        count: num,
        percentage: Math.round((num / deviceTotal) * 100)
      };
    }).sort((a, b) => b.count - a.count);

    const topPaths = [];
    for (let i = 0; i < topPathsRaw.length; i += 2) {
      topPaths.push({
        path: topPathsRaw[i],
        count: parseInt(topPathsRaw[i + 1], 10)
      });
    }

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
      hourlyData,
      browserBreakdown,
      osBreakdown,
      deviceBreakdown,
      topPaths,
      timeSpentBuckets
    };
  }

  async getTrafficLogs(limit = 50) {
    if (this.isRedisConnected && this.redis) {
      try {
        const rawLogs = await this.redis.lrange('valor:recent_traffic_log', 0, limit - 1);
        if (rawLogs && rawLogs.length > 0) {
          return rawLogs.map(str => {
            try { return JSON.parse(str); } catch { return null; }
          }).filter(Boolean);
        }
      } catch (e) {}
    }

    if (this.isPgConnected && this.pgPool) {
      try {
        const res = await this.pgPool.query(
          `SELECT id, created_at as timestamp, ip, method, path, status_code as "statusCode", latency_ms as "latencyMs", bytes_transferred as bytes, browser, os, user_id as "userId"
           FROM analytics_traffic_logs
           ORDER BY created_at DESC
           LIMIT $1`,
          [limit]
        );
        return res.rows;
      } catch (e) {}
    } else if (this.sqliteDb) {
      try {
        const rows = this.sqliteDb.prepare(
          `SELECT id, created_at as timestamp, ip, method, path, status_code as statusCode, latency_ms as latencyMs, bytes_transferred as bytes, browser, os, user_id as userId
           FROM analytics_traffic_logs
           ORDER BY id DESC
           LIMIT ?`
        ).all(limit);
        return rows;
      } catch (e) {}
    }

    return [];
  }

  async terminateSession(sessionId) {
    if (this.isRedisConnected && this.redis) {
      try {
        await this.redis.zrem('valor:active_sessions', sessionId);
        await this.redis.del(`valor:session:${sessionId}`);
      } catch (e) {}
    }
    return { success: true };
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
}

