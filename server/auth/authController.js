// ==============================================================================
// Authentication Controller (PostgreSQL 16 + Redis Cache-Aside Layer)
// Endpoints:
//   - POST /auth/signup   { profileName, username, password }
//   - POST /auth/login    { username, password }
//   - POST /auth/logout
//   - GET  /auth/me
// Security:
//   - bcrypt cost >= 12
//   - Precomputed dummy hash for timing attack mitigation (constant time)
//   - Redis rate-limiting per IP and per username (cooldown on 5+ failures)
//   - Session via httpOnly, Secure, SameSite=Lax cookie with Redis cache-aside (TTL 24h)
//   - Strictly NO email address column or flow
//   - Strictly NO password recovery or reset
// ==============================================================================

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { validateSignupPayload, validateLoginPayload } from './authValidation.js';
import { AuthRateLimiter } from './rateLimiter.js';

const BCRYPT_COST = 12;
// Precompute dummy hash for constant-time timing mitigation against username enumeration
const DUMMY_HASH = bcrypt.hashSync('valor_timing_protection_dummy_salt_2026', BCRYPT_COST);

let rateLimiterInstance = null;
function getRateLimiter(dataStore) {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new AuthRateLimiter(dataStore);
  }
  return rateLimiterInstance;
}

export function parseCookies(req) {
  const list = {};
  const header = req.headers.cookie;
  if (!header) return list;
  header.split(';').forEach(c => {
    const parts = c.split('=');
    const key = parts[0]?.trim();
    if (key) {
      list[key] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

// Find account by username_lower in Postgres or SQLite fallback
async function findAccountByUsernameLower(dataStore, usernameLower) {
  // 1. PostgreSQL
  if (dataStore && dataStore.isPgConnected && dataStore.pgPool) {
    try {
      const res = await dataStore.pgPool.query(
        'SELECT id, profile_name, username, username_lower, password_hash, created_at FROM accounts WHERE username_lower = $1',
        [usernameLower]
      );
      if (res.rows.length > 0) return res.rows[0];
    } catch (err) {
      console.warn('[PostgreSQL findAccount error]', err.message);
    }
  }

  // 2. SQLite Fallback
  if (dataStore && dataStore.sqliteDb) {
    try {
      const acc = dataStore.sqliteDb.prepare(
        'SELECT id, profile_name, username, username_lower, password_hash, created_at FROM accounts WHERE username_lower = ?'
      ).get(usernameLower);
      if (acc) return acc;
    } catch (err) {
      console.warn('[SQLite findAccount error]', err.message);
    }
  }

  return null;
}

// Find account by userId or username_lower
async function findAccountByIdOrUsername(dataStore, { userId, usernameLower }) {
  if (userId) {
    if (dataStore && dataStore.isPgConnected && dataStore.pgPool) {
      try {
        const res = await dataStore.pgPool.query(
          'SELECT id, profile_name, username, username_lower, password_hash, created_at FROM accounts WHERE id = $1',
          [userId]
        );
        if (res.rows.length > 0) return res.rows[0];
      } catch (err) {}
    }
    if (dataStore && dataStore.sqliteDb) {
      try {
        const acc = dataStore.sqliteDb.prepare(
          'SELECT id, profile_name, username, username_lower, password_hash, created_at FROM accounts WHERE id = ?'
        ).get(userId);
        if (acc) return acc;
      } catch (err) {}
    }
  }

  if (usernameLower) {
    return await findAccountByUsernameLower(dataStore, usernameLower);
  }

  return null;
}

// Create account in Postgres or SQLite fallback
async function createAccountRecord(dataStore, { id, profileName, username, usernameLower, passwordHash }) {
  let created = false;

  // 1. PostgreSQL
  if (dataStore && dataStore.isPgConnected && dataStore.pgPool) {
    try {
      await dataStore.pgPool.query(
        `INSERT INTO accounts (id, profile_name, username, username_lower, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [id, profileName, username, usernameLower, passwordHash]
      );
      created = true;
    } catch (err) {
      console.error('[PostgreSQL createAccount error]', err.message);
      throw err;
    }
  }

  // 2. SQLite
  if (dataStore && dataStore.sqliteDb) {
    try {
      dataStore.sqliteDb.prepare(
        `INSERT INTO accounts (id, profile_name, username, username_lower, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).run(id, profileName, username, usernameLower, passwordHash);
      created = true;
    } catch (err) {
      if (!dataStore.isPgConnected) throw err;
    }
  }

  // Also ensure profile exists in profiles table for seamless app integration
  try {
    if (dataStore && dataStore.isPgConnected && dataStore.pgPool) {
      await dataStore.createProfile(id, profileName, username, passwordHash);
    }
    if (dataStore && dataStore.sqliteDb) {
      dataStore.sqliteDb.prepare(
        `INSERT OR REPLACE INTO profiles (userId, name, username, password, createdAt)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).run(id, profileName, username, passwordHash);
    }
    if (dataStore) {
      await dataStore.cacheDel('valor:cache:profiles:all');
      await dataStore.cacheDel(`valor:cache:profiles:u_${username}`);
    }
  } catch {}

  return created;
}

// Session management with Redis Cache-Aside
async function storeSession(dataStore, sessionId, user, ttlSeconds = 86400) {
  const sessionData = {
    sessionId,
    userId: user.id,
    profileName: user.profile_name,
    username: user.username,
    createdAt: new Date().toISOString()
  };

  const redis = (dataStore && dataStore.isRedisConnected && dataStore.redis) ? dataStore.redis : null;
  if (redis) {
    try {
      await redis.set(`session:${sessionId}`, JSON.stringify(sessionData), 'EX', ttlSeconds);
    } catch (err) {
      console.warn('[Redis session set error]', err.message);
    }
  }

  if (dataStore && dataStore.memoryCache) {
    dataStore.memoryCache.set(`session:${sessionId}`, {
      val: sessionData,
      exp: Date.now() + (ttlSeconds * 1000)
    });
  }

  return sessionData;
}

async function getSession(dataStore, sessionId) {
  if (!sessionId) return null;

  // 1. Check Redis
  const redis = (dataStore && dataStore.isRedisConnected && dataStore.redis) ? dataStore.redis : null;
  if (redis) {
    try {
      const data = await redis.get(`session:${sessionId}`);
      if (data) return JSON.parse(data);
    } catch (err) {}
  }

  // 2. Check Memory Cache
  if (dataStore && dataStore.memoryCache) {
    const mem = dataStore.memoryCache.get(`session:${sessionId}`);
    if (mem && mem.exp > Date.now()) {
      return mem.val;
    }
  }

  return null;
}

async function removeSession(dataStore, sessionId) {
  if (!sessionId) return;
  const redis = (dataStore && dataStore.isRedisConnected && dataStore.redis) ? dataStore.redis : null;
  if (redis) {
    try {
      await redis.del(`session:${sessionId}`);
    } catch (err) {}
  }
  if (dataStore && dataStore.memoryCache) {
    dataStore.memoryCache.delete(`session:${sessionId}`);
  }
}

export async function handleAuthRoutes(req, res, pathname, parsedUrl, cleanClientIp, getJsonBody, dataStore, isProd = false) {
  // Normalize pathname to support both /auth/* and /api/auth/*
  const route = pathname.startsWith('/api/auth') ? pathname.replace('/api/auth', '/auth') : pathname;

  if (!route.startsWith('/auth/')) {
    return false; // Not an auth route
  }

  const rateLimiter = getRateLimiter(dataStore);
  const isSecure = isProd || (req.headers['x-forwarded-proto'] === 'https');

  // Helper response functions
  const sendJson = (status, payload, headers = {}) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    for (const [k, v] of Object.entries(headers)) {
      res.setHeader(k, v);
    }
    res.end(JSON.stringify(payload));
  };

  const setSessionCookie = (sessionId) => {
    const cookie = `valor_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${isSecure ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', cookie);
  };

  const clearSessionCookie = () => {
    const cookie = `valor_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${isSecure ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', cookie);
  };

  // --------------------------------------------------------------------------
  // 1. POST /auth/signup
  // --------------------------------------------------------------------------
  if (route === '/auth/signup' && req.method === 'POST') {
    const body = await getJsonBody(req);

    // Rate Limit Check per IP for signups
    const rlCheck = await rateLimiter.checkSignupRateLimit(cleanClientIp);
    if (!rlCheck.allowed) {
      return sendJson(429, {
        error: `Too many signup attempts. Please try again in ${rlCheck.retryAfter} seconds.`,
        retryAfter: rlCheck.retryAfter
      }, { 'Retry-After': String(rlCheck.retryAfter) });
    }

    // Validation
    const validation = validateSignupPayload(body);
    if (!validation.isValid) {
      return sendJson(400, {
        error: 'Validation failed.',
        errors: validation.errors
      });
    }

    const { profileName, username, usernameLower, password } = validation.data;

    try {
      // Check if username_lower already exists (case-insensitive uniqueness)
      const existing = await findAccountByUsernameLower(dataStore, usernameLower);
      if (existing) {
        return sendJson(409, {
          error: 'Username is already taken.',
          errors: { username: 'This username is already taken.' }
        });
      }

      // Hash password with bcrypt cost >= 12
      const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

      // Generate UUID
      const accountId = crypto.randomUUID();

      // Insert account record
      await createAccountRecord(dataStore, {
        id: accountId,
        profileName,
        username,
        usernameLower,
        passwordHash
      });

      // Record signup for IP rate limiter
      await rateLimiter.recordSignup(cleanClientIp);

      // Create session & set cookie
      const sessionId = 'val_sess_' + crypto.randomBytes(32).toString('hex');
      const accountData = {
        id: accountId,
        profile_name: profileName,
        username
      };
      await storeSession(dataStore, sessionId, accountData, 86400);
      setSessionCookie(sessionId);

      return sendJson(201, {
        success: true,
        user: {
          id: accountId,
          profileName,
          username
        }
      });
    } catch (err) {
      console.error('[Signup Exception]', err);
      return sendJson(500, { error: 'Failed to create account. Please try again.' });
    }
  }

  // --------------------------------------------------------------------------
  // 2. POST /auth/login
  // --------------------------------------------------------------------------
  if (route === '/auth/login' && req.method === 'POST') {
    const body = await getJsonBody(req);
    const { userId, username, password } = body;

    if (!password) {
      return sendJson(400, {
        error: 'Password is required.',
        errors: { password: 'Password is required.' }
      });
    }

    let usernameLower = username ? String(username).trim().toLowerCase() : '';

    if (!usernameLower && userId) {
      const acc = await findAccountByIdOrUsername(dataStore, { userId });
      if (acc && acc.username_lower) {
        usernameLower = acc.username_lower;
      } else {
        usernameLower = `uid_${userId}`;
      }
    }

    if (!usernameLower && !userId) {
      return sendJson(400, {
        error: 'Username is required.',
        errors: { username: 'Username is required.' }
      });
    }

    // Rate Limit Check per IP and per username
    const rlCheck = await rateLimiter.checkLoginRateLimit(cleanClientIp, usernameLower);
    if (!rlCheck.allowed) {
      return sendJson(429, {
        error: `Too many failed login attempts. Please try again in ${rlCheck.retryAfter} seconds.`,
        retryAfter: rlCheck.retryAfter
      }, { 'Retry-After': String(rlCheck.retryAfter) });
    }

    try {
      const account = await findAccountByIdOrUsername(dataStore, { userId, usernameLower });

      if (!account) {
        // Run dummy hash to ensure constant time comparison and prevent username enumeration
        await bcrypt.compare(password, DUMMY_HASH);
        await rateLimiter.recordLoginFailure(cleanClientIp, usernameLower);
        return sendJson(401, { error: 'Incorrect username or password.' });
      }

      // Account found: compare password with account.password_hash (or fallback)
      let isMatch = false;
      const targetHash = account.password_hash || account.password || '';
      if (targetHash.startsWith('$2')) {
        isMatch = await bcrypt.compare(password, targetHash);
      } else if (targetHash) {
        isMatch = (targetHash === password);
      }

      if (!isMatch) {
        await rateLimiter.recordLoginFailure(cleanClientIp, usernameLower);
        return sendJson(401, { error: 'Incorrect username or password.' });
      }

      // Login Successful! Clear rate-limit failures
      await rateLimiter.clearLoginFailures(cleanClientIp, usernameLower);

      // Create session & set cookie
      const sessionId = 'val_sess_' + crypto.randomBytes(32).toString('hex');
      await storeSession(dataStore, sessionId, account, 86400);
      setSessionCookie(sessionId);

      return sendJson(200, {
        success: true,
        user: {
          id: account.id || userId,
          profileName: account.profile_name || account.name || account.username,
          username: account.username
        }
      });
    } catch (err) {
      console.error('[Login Exception]', err);
      return sendJson(500, { error: 'Login service encountered an unexpected error.' });
    }
  }

  // --------------------------------------------------------------------------
  // 3. POST /auth/logout
  // --------------------------------------------------------------------------
  if (route === '/auth/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    const sessionId = cookies['valor_session'];
    if (sessionId) {
      await removeSession(dataStore, sessionId);
    }
    clearSessionCookie();
    return sendJson(200, { success: true });
  }

  // --------------------------------------------------------------------------
  // 4. GET /auth/me
  // --------------------------------------------------------------------------
  if (route === '/auth/me' && req.method === 'GET') {
    const cookies = parseCookies(req);
    const sessionId = cookies['valor_session'];
    if (!sessionId) {
      return sendJson(401, { authenticated: false });
    }

    const session = await getSession(dataStore, sessionId);
    if (!session) {
      clearSessionCookie();
      return sendJson(401, { authenticated: false });
    }

    return sendJson(200, {
      authenticated: true,
      user: {
        id: session.userId,
        profileName: session.profileName,
        username: session.username
      }
    });
  }

  return false;
}
