import { createServer as createViteServer } from 'vite';
import http from 'http';
import https from 'https';
import dns from 'dns';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, execSync } from 'child_process';
import { DatabaseSync } from 'node:sqlite';
import { DataStore } from './dataStore.js';
import { createReverseProxyTelemetry, parseUserAgent } from './analyticsTracker.js';
import { RemoteSessionManager } from './server/remote/remoteSessionManager.js';
import { handleStreamRoute } from './server/remote/streamController.js';
import { SessionMediaManager } from './server/remote/sessionMediaManager.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

process.on('uncaughtException', (err) => {
  console.error('[Server Uncaught Exception]', err?.stack || err?.message || err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server Unhandled Rejection]', reason?.stack || reason?.message || reason);
});

const args = process.argv.slice(2);

const playWithVlc = args.includes('--vlc');
const backendOnly = args.includes('--backend-only');
const frontendOnly = args.includes('--frontend-only');
const autoShutdown = args.includes('--auto-shutdown');
const shouldOpen = args.includes('--open');
const hostArg = args.find(a => a.startsWith('--host='))?.split('=')[1];
const HOST = process.env.HOST || hostArg || '0.0.0.0';
const filePath = args.find(arg => !arg.startsWith('--'));
const resolvedFilePath = filePath ? path.resolve(filePath) : null;

if (playWithVlc && resolvedFilePath) {
  let vlcCmd = 'vlc';
  if (process.platform === 'win32') {
    const vlcPaths = [
      'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
      'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
    ];
    for (const p of vlcPaths) {
      if (fs.existsSync(p)) {
        vlcCmd = p;
        break;
      }
    }
  } else if (process.platform === 'darwin') {
    const macVlc = '/Applications/VLC.app/Contents/MacOS/VLC';
    if (fs.existsSync(macVlc)) vlcCmd = macVlc;
  }
  console.log(`[VLC] Launching VLC to play: ${resolvedFilePath}`);
  const child = spawn(vlcCmd, [resolvedFilePath], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  process.exit(0);
}

const execDir = path.dirname(process.execPath);
let appDir = import.meta.dirname || __dirname;
if (!fs.existsSync(path.join(appDir, 'dist')) && fs.existsSync(path.join(execDir, 'dist'))) {
  appDir = execDir;
}
const dataDir = path.join(appDir, '.valor_data');
const remoteSessionManager = new RemoteSessionManager(dataDir);
const sessionMediaManager = new SessionMediaManager(dataDir);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getOrCreateSslCert() {
  const sslDir = path.join(dataDir, 'ssl');
  if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true });
  }
  const certPath = path.join(sslDir, 'cert.pem');
  const keyPath = path.join(sslDir, 'key.pem');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    };
  }

  console.log('[SSL] Generating self-signed TLS/SSL certificate with SAN (localhost, 127.0.0.1, ::1)...');
  const confPath = path.join(sslDir, 'openssl.cnf');
  const confContent = `[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
`;
  fs.writeFileSync(confPath, confContent);

  try {
    execSync(`openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout "${keyPath}" -out "${certPath}" -days 3650 -config "${confPath}"`, { stdio: 'pipe' });
    console.log('[SSL] SSL certificate and key generated successfully in .valor_data/ssl');
    return {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath)
    };
  } catch (err) {
    console.error('[SSL] Failed to generate SSL certificate via openssl:', err.message);
    return null;
  }
}

// Initialize SQLite database
const dbPath = path.join(dataDir, 'valor.db');
const db = new DatabaseSync(dbPath);

// Initialize Enterprise DataStore (PostgreSQL + Redis Lazy Loading Cache)
const dataStore = new DataStore({ sqliteDb: db });
dataStore.initialize().catch(err => console.error('[DataStore Init Error]', err));

// Create SQLite tables
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    userId TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT,
    password TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL
  );
`);

// Try to alter profiles table if columns are missing (migrations)
try { db.exec(`ALTER TABLE profiles ADD COLUMN username TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE profiles ADD COLUMN password TEXT;`); } catch(e){}

// Populate accounts table from existing profiles for backward compatibility
try {
  const existingProfilesWithPasswords = db.prepare('SELECT username, password FROM profiles WHERE username IS NOT NULL AND password IS NOT NULL').all();
  const insertAccount = db.prepare('INSERT OR IGNORE INTO accounts (username, password) VALUES (?, ?)');
  for (const p of existingProfilesWithPasswords) {
    insertAccount.run(p.username, p.password);
  }
} catch (e) {
  console.warn('Failed to migrate existing profiles to accounts table:', e.message);
}

// Migration to remove UNIQUE constraint from username
try {
  db.exec(`DROP INDEX IF EXISTS idx_profiles_username;`);
  const indexList = db.prepare("PRAGMA index_list('profiles')").all();
  const hasUniqueIndex = indexList.some(idx => idx.unique === 1 && idx.name.includes('username'));
  
  if (hasUniqueIndex) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS profiles_temp (
        userId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT,
        password TEXT,
        createdAt TEXT DEFAULT (datetime('now'))
      );
    `);
    db.exec(`INSERT OR REPLACE INTO profiles_temp SELECT userId, name, username, password, createdAt FROM profiles;`);
    db.exec(`DROP TABLE profiles;`);
    db.exec(`ALTER TABLE profiles_temp RENAME TO profiles;`);
    console.log('[SQLite Migration] Successfully removed UNIQUE constraint from profiles.username');
  }
} catch (e) {
  console.log('[SQLite Migration] Note: profiles table already migrated or no UNIQUE index found:', e.message);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    userId TEXT PRIMARY KEY,
    settingsJson TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    userId TEXT NOT NULL,
    videoId TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    type TEXT,
    fileName TEXT,
    duration REAL,
    currentTime REAL,
    lastPlayedDate TEXT,
    totalTimeWatched REAL,
    rating INTEGER,
    timeToFinish REAL,
    sessions TEXT,
    localFilePath TEXT,
    playedDates TEXT,
    format TEXT,
    streams TEXT,
    audioTracks TEXT,
    subtitleTracks TEXT,
    episode INTEGER,
    season INTEGER,
    color TEXT,
    tmdbId INTEGER,
    hasScrobbledTrakt INTEGER DEFAULT 0,
    PRIMARY KEY (userId, videoId)
  );
`);

// Try to alter history table for missing columns (migrations)
try { db.exec(`ALTER TABLE history ADD COLUMN url TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN type TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN fileName TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN format TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN streams TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN audioTracks TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN subtitleTracks TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN episode INTEGER;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN season INTEGER;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN color TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN tmdbId INTEGER;`); } catch(e){}
try { db.exec(`ALTER TABLE history ADD COLUMN hasScrobbledTrakt INTEGER DEFAULT 0;`); } catch(e){}

db.exec(`
  CREATE TABLE IF NOT EXISTS bookmarks (
    userId TEXT NOT NULL,
    videoId TEXT NOT NULL,
    id TEXT NOT NULL,
    time REAL NOT NULL,
    endTime REAL,
    label TEXT NOT NULL,
    isIntro INTEGER DEFAULT 0,
    isOutro INTEGER DEFAULT 0,
    skipEnabled INTEGER DEFAULT 0,
    PRIMARY KEY (userId, videoId, id)
  );
`);

// Try to alter bookmarks table for missing columns
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN title TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN description TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN category TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN startTime REAL;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN thumbnail TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN favorite INTEGER DEFAULT 0;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN createdAt TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN updatedAt TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN episode INTEGER;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN season INTEGER;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN color TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN tmdbId INTEGER;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN userName TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN userTime TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN mediaName TEXT;`); } catch(e){}
try { db.exec(`ALTER TABLE bookmarks ADD COLUMN createdBy TEXT DEFAULT 'manual';`); } catch(e){}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_bookmarks_tmdb ON bookmarks(tmdbId, season, episode);`); } catch(e){}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_bookmarks_videoId ON bookmarks(videoId);`); } catch(e){}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category);`); } catch(e){}

db.exec(`
  CREATE TABLE IF NOT EXISTS login_attempts (
    username TEXT PRIMARY KEY,
    attempts INTEGER DEFAULT 0,
    lockedUntil TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS blocked_ips (
    ip TEXT PRIMARY KEY,
    blockedUntil TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_sessions (
    session_id TEXT PRIMARY KEY,
    ip TEXT,
    user_agent TEXT,
    browser TEXT,
    os TEXT,
    device TEXT,
    user_id TEXT,
    profile_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now')),
    total_requests INTEGER DEFAULT 1,
    bytes_transferred INTEGER DEFAULT 0,
    current_path TEXT,
    page_title TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_traffic_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    ip TEXT,
    method TEXT,
    path TEXT,
    status_code INTEGER,
    latency_ms REAL,
    bytes_transferred INTEGER,
    user_agent TEXT,
    browser TEXT,
    os TEXT,
    user_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Setup logging redirection to app.log
const logFilePath = path.join(dataDir, 'app.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;

const LOG_MODE = process.env.VALOR_LOG_MODE || 'release'; // 'developer' or 'release'

const colors = {
  info: '\x1b[32m',    // Green
  warn: '\x1b[33m',    // Yellow
  error: '\x1b[31m',   // Red
  reset: '\x1b[0m'
};

function minimizeMessage(msg) {
  if (typeof msg !== 'string') return msg;
  if (msg.includes('[FFmpeg Command] ffmpeg')) {
    const match = msg.match(/-ss\s+([^\s]+)\s+-i\s+([^\s]+)\s+-t\s+([^\s]+)\s+-map\s+([^\s]+).*\s+([^\s]+)$/);
    if (match) {
      const [_, ss, input, t, map, output] = match;
      const getBasename = (p) => p.split(/[/\\]/).pop() || p;
      return `[FFmpeg Command] ffmpeg -ss ${ss} -i ${getBasename(input)} -t ${t} -map ${map} -> ${getBasename(output)} (minimized)`;
    }
  }
  return msg;
}

const writeToLogFile = (level, msg) => {
  try {
    logStream.write(`[${new Date().toISOString()}] [${level}] ${msg}\n`);
  } catch (err) {}
};

const handleLog = (level, originalFn, colorCode, args) => {
  const rawMsg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const minimizedMsg = minimizeMessage(rawMsg);
  
  // Always write to the log file on disk
  writeToLogFile(level, minimizedMsg);

  // In release mode, only log high-level/startup logs, warnings, errors and alerts to terminal console
  if (LOG_MODE === 'release') {
    const isErrorOrWarn = level === 'ERROR' || level === 'WARN';
    const isHighLevel = rawMsg.startsWith('[Server] Valor') || 
                        rawMsg.startsWith('[Server] Running') || 
                        rawMsg.includes('[ALERT]') || 
                        rawMsg.startsWith('[VLC]');
    if (!isErrorOrWarn && !isHighLevel) {
      return;
    }
  }

  // Print to terminal with ANSI color coding
  originalFn(`${colorCode}[${level}] ${minimizedMsg}${colors.reset}`);
};

console.log = (...args) => handleLog('INFO', originalLog, colors.info, args);
console.info = (...args) => handleLog('INFO', originalInfo, colors.info, args);
console.warn = (...args) => handleLog('WARN', originalWarn, colors.warn, args);
console.error = (...args) => handleLog('ERROR', originalError, colors.error, args);

const PORT_SERVICE = parseInt(process.env.PORT || process.env.PORT_SERVICE || '443', 10);
const PORT_BACKEND = parseInt(process.env.PORT_BACKEND || '50001', 10);

const getJsonBody = (req) => new Promise((resolve) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try { resolve(JSON.parse(body)); }
    catch { resolve({}); }
  });
  req.on('error', (err) => {
    console.error('[getJsonBody Request Error]', err.message);
    resolve({});
  });
});

let lastHeartbeat = Date.now();
let hasReceivedFirstHeartbeat = false;
let activeConnections = 0;
let pendingPlayFile = null;

// Initialize Enterprise Telemetry & Reverse Proxy Middleware
const telemetryMiddleware = createReverseProxyTelemetry(dataStore);

// Hardcoded Admin Credentials & Token Cache
const adminAuthTokens = new Set();
const ADMIN_HARDCODED_USER = process.env.VALOR_ADMIN_USER || 'admin';
const ADMIN_HARDCODED_PASS = process.env.VALOR_ADMIN_PASS || 'admin';

// Admin Real-Time SSE Stream Clients & Broadcaster
const adminStreamClients = new Set();

global.broadcastAdminEvent = function (type, payload) {
  if (adminStreamClients.size === 0) return;
  const message = `data: ${JSON.stringify({ type, data: payload, timestamp: Date.now() })}\n\n`;
  for (const client of adminStreamClients) {
    try {
      client.res.write(message);
    } catch (err) {
      adminStreamClients.delete(client);
    }
  }
};

setInterval(() => {
  for (const client of adminStreamClients) {
    try {
      client.res.write(': keepalive\n\n');
    } catch (err) {
      adminStreamClients.delete(client);
    }
  }
}, 15000);

async function isValidAdminToken(token) {
  if (!token) return false;
  if (adminAuthTokens.has(token)) return true;
  if (dataStore.isRedisConnected && dataStore.redis) {
    try {
      const exists = await dataStore.redis.get(`valor:admin_token:${token}`);
      if (exists) {
        adminAuthTokens.add(token);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

function handleProxyRequest(targetUrl, req, res, redirectCount = 0, parsedUrl = null) {
  if (redirectCount > 5) {
    res.statusCode = 508;
    res.end('Too many redirects');
    return;
  }
  try {
    const u = new URL(targetUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      res.statusCode = 400;
      res.end('Invalid protocol');
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');

    const client = u.protocol === 'https:' ? https : http;
    const headers = {};
    if (req.headers.range) headers['range'] = req.headers.range;
    if (req.headers['accept']) headers['accept'] = req.headers['accept'];
    
    if (req.headers['authorization']) {
      headers['authorization'] = req.headers['authorization'];
    } else {
      const qUser = parsedUrl ? (parsedUrl.searchParams.get('user') || parsedUrl.searchParams.get('username')) : null;
      const qPass = parsedUrl ? (parsedUrl.searchParams.get('pass') || parsedUrl.searchParams.get('password')) : '';
      if (qUser) {
        headers['authorization'] = 'Basic ' + Buffer.from(`${qUser}:${qPass || ''}`).toString('base64');
      } else if (u.username) {
        headers['authorization'] = 'Basic ' + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password || '')}`).toString('base64');
      }
    }

    headers['user-agent'] = req.headers['user-agent'] || 'Mozilla/5.0';

    const proxyReq = client.request(u, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers
    }, (proxyRes) => {
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        const nextUrl = new URL(proxyRes.headers.location, u).toString();
        proxyReq.destroy();
        return handleProxyRequest(nextUrl, req, res, redirectCount + 1, parsedUrl);
      }
      res.statusCode = proxyRes.statusCode;
      const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
      for (const h of forwardHeaders) {
        if (proxyRes.headers[h]) {
          res.setHeader(h, proxyRes.headers[h]);
        }
      }
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.end(err.message);
      }
    });

    req.on('aborted', () => {
      proxyReq.destroy();
    });

    proxyReq.end();
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 400;
      res.end('Invalid URL');
    }
  }
}

// 1. Backend API Server (Port 50001)
const backendServer = http.createServer(async (req, res) => {
  telemetryMiddleware(req, res);
  if (res.writableEnded) return;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT_BACKEND}`);
  const pathname = parsedUrl.pathname;

  // Global IP block check
  const rawClientIp = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : (req.socket.remoteAddress || '');
  const cleanClientIp = rawClientIp.replace(/^::ffff:/, '');
  if (dataStore && dataStore._blockedIpsCache && (dataStore._blockedIpsCache.has(cleanClientIp) || dataStore._blockedIpsCache.has(rawClientIp))) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Forbidden', message: 'Your IP address has been administratively blocked.' }));
    return;
  }

  // Webhook Ingestion Receiver (For external embeds, player telemetry, and video events)
  if ((pathname === '/api/webhook' || pathname === '/api/webhook/visitor') && req.method === 'POST') {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(rawBody || '{}');
        const eventName = payload.event || 'visitor.session';
        const clientIp = payload.ip || rawClientIp || '127.0.0.1';
        const cleanIp = String(clientIp).split(',')[0].replace(/^::ffff:/, '').trim();
        const userAgent = payload.userAgent || req.headers['user-agent'] || 'Webhook-Client';
        const { browser, os, device } = parseUserAgent(userAgent);
        const deviceId = `dev_${crypto.createHash('md5').update(cleanIp).digest('hex').substring(0, 16)}`;
        const sessionId = payload.sessionId || `sess_${crypto.createHash('md5').update(`${cleanIp}-${Date.now()}`).digest('hex').substring(0, 16)}`;

        // Record directly into relational DataStore
        await dataStore.recordRequest({
          sessionId,
          deviceId,
          ip: cleanIp,
          userAgent,
          browser,
          os,
          device,
          path: payload.url || payload.path || '/webhook/event',
          method: 'WEBHOOK',
          statusCode: 200,
          bytesTransferred: payload.bytes || 0,
          latencyMs: payload.latencyMs || 10,
          userId: payload.userId || null,
          profileName: payload.profileName || null,
          referer: payload.referer || req.headers['referer'] || '',
          isEmbed: Boolean(payload.isEmbed || payload.referer || payload.url)
        });

        // Trigger outgoing webhook if registered
        dataStore.dispatchWebhook(eventName, {
          event: eventName,
          deviceId,
          sessionId,
          ip: cleanIp,
          payload,
          timestamp: new Date().toISOString()
        }).catch(() => {});

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          event: eventName,
          deviceId,
          sessionId,
          receivedAt: new Date().toISOString()
        }));
      } catch (err) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // CORS Proxy for remote media headers and byte ranges
  if (pathname === '/api/proxy') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl) {
      res.statusCode = 400;
      res.end('Missing url parameter');
      return;
    }
    handleProxyRequest(targetUrl, req, res, 0, parsedUrl);
    return;
  }

  // Redirect /embed to active service server port if accessed via backend port
  if (pathname === '/embed' || pathname.startsWith('/embed/')) {
    const hostName = req.headers.host ? req.headers.host.split(':')[0] : 'localhost';
    const portPart = PORT_SERVICE === 443 ? '' : `:${PORT_SERVICE}`;
    const target = `https://${hostName}${portPart}${req.url}`;
    res.writeHead(302, { 'Location': target });
    res.end();
    return;
  }

  // Remote Streaming Pipeline & HLS Session API
  if (pathname.startsWith('/api/remote/')) {
    handleStreamRoute(req, res, parsedUrl, remoteSessionManager).catch(err => {
      console.error('[RemoteStream] Error handling route:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
      }
    });
    return;
  }

  // TMDB Proxy endpoint - prevents CORS preflight issues on client
  if (pathname === '/api/tmdb-proxy') {
    (async () => {
      try {
        const tmdbPath = parsedUrl.searchParams.get('path') || parsedUrl.searchParams.get('endpoint');
        if (!tmdbPath) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing path or endpoint parameter' }));
          return;
        }

        let cleanPath = tmdbPath.startsWith('/') ? tmdbPath.slice(1) : tmdbPath;
        const extraParams = new URLSearchParams();
        for (const [key, val] of parsedUrl.searchParams.entries()) {
          if (key !== 'path' && key !== 'endpoint') {
            extraParams.append(key, val);
          }
        }
        const extraQuery = extraParams.toString();
        if (extraQuery) {
          cleanPath += (cleanPath.includes('?') ? '&' : '?') + extraQuery;
        }

        const targetUrl = `https://api.themoviedb.org/3/${cleanPath}`;
        const TMDB_BEARER = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMzQwMGRhZWZjODJjNTJlZDEyYzk1MWU1ZWFmYmVhYyIsIm5iZiI6MTc4MzU0MTI2OS44NzUsInN1YiI6IjZhNGVhZTE1MzFhOWUyYmNhZjBmY2RlMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.GT6_b6NSJwjYCXlbaCi_djq09ug0rKDxY9iouqVrYWY";

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        const tmdbRes = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${TMDB_BEARER}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        res.statusCode = tmdbRes.status;
        res.setHeader('Content-Type', tmdbRes.headers.get('content-type') || 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        const data = await tmdbRes.arrayBuffer();
        res.end(Buffer.from(data));
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      }
    })();
    return;
  }

  // Remote media proxy endpoint with SessionMediaManager (240s sliding window cache)
  if (pathname === '/api/proxy-media') {
    (async () => {
      const rawTargetUrl = parsedUrl.searchParams.get('url');
      if (!rawTargetUrl) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing url parameter' }));
        return;
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      try {
        const rawUser = parsedUrl.searchParams.get('user');
        const rawPass = parsedUrl.searchParams.get('pass');
        let auth = undefined;
        if (rawUser) {
          auth = { username: rawUser, password: rawPass || '' };
        }

        const durationStr = parsedUrl.searchParams.get('duration');
        const duration = durationStr ? parseFloat(durationStr) : 0;

        let sessionId = parsedUrl.searchParams.get('sessionId');
        if (!sessionId) {
          const clientIp = req.socket.remoteAddress || 'local';
          sessionId = `sess_${crypto.createHash('md5').update(`${clientIp}_${rawTargetUrl}`).digest('hex').slice(0, 8)}`;
        }

        const worker = sessionMediaManager.getOrCreateWorker(sessionId, rawTargetUrl, { auth, duration });
        const rangeHeader = req.headers['range'];

        if (req.method === 'HEAD') {
          await worker.init();
          res.statusCode = 200;
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Content-Type', worker.contentType || 'video/mp4');
          res.setHeader('Content-Length', worker.totalSize);
          res.end();
          return;
        }

        const result = await worker.serveRange(rangeHeader);

        if (result.isRangeNotSatisfiable) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${result.totalSize}`);
          res.end();
          return;
        }

        if (result.isPartial) {
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${result.start}-${result.end}/${result.totalSize}`);
        } else {
          res.statusCode = 200;
        }

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', result.contentType || 'video/mp4');
        res.setHeader('Content-Length', result.buffer.length);

        res.end(result.buffer);
      } catch (err) {
        if (req.destroyed || res.writableEnded) return;
        if (err.code === 'ECONNRESET' || err.message === 'socket hang up') return;
        console.error('[SessionMediaProxy Error]', err.message);
        if (!res.headersSent) {
          const isAuth = err.message && (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized'));
          const status = err.message && err.message.includes('SSRF_GUARD') ? 403 : (isAuth ? 401 : 502);
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: isAuth ? 'AUTH_REQUIRED' : 'Proxy request failed', message: err.message }));
        }
      }
    })();
    return;
  }

  // Heartbeat check
  if (pathname === '/api/heartbeat') {
    lastHeartbeat = Date.now();
    hasReceivedFirstHeartbeat = true;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    
    const responseData = { 
      status: 'ok', 
      servicePort: PORT_SERVICE,
      protocol: 'https'
    };
    if (pendingPlayFile) {
      responseData.playFile = pendingPlayFile;
      pendingPlayFile = null;
    }
    
    res.end(JSON.stringify(responseData));
    return;
  }

  // Play command forward receiver
  if (pathname === '/api/play') {
    const file = parsedUrl.searchParams.get('file');
    
    // Check if there is an active tab (heartbeat received within last 6 seconds)
    const hasActiveTab = hasReceivedFirstHeartbeat && (Date.now() - lastHeartbeat < 6000);
    
    if (hasActiveTab && file) {
      console.log(`[Server] Active tab detected. Queueing file for playback: ${file}`);
      pendingPlayFile = file;
    } else {
      if (shouldOpen) {
        const baseUrl = PORT_SERVICE === 443 ? 'https://localhost/' : `https://localhost:${PORT_SERVICE}/`;
        const openUrl = file 
          ? `${baseUrl}?file=${encodeURIComponent(file)}`
          : baseUrl;
          
        console.log(`[Server] No active tab. Opening browser: ${openUrl}`);
        if (process.platform === 'win32') {
          spawn('cmd', ['/c', 'start', '', openUrl], { detached: true }).unref();
        } else if (process.platform === 'darwin') {
          spawn('open', [openUrl], { detached: true }).unref();
        } else {
          spawn('xdg-open', [openUrl], { detached: true }).unref();
        }
      }
    }
    
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, tabReused: hasActiveTab }));
    return;
  }

  // VLR Live Scores API (Direct real-time scraper for vlr.gg/matches + detail round scores)
  if (pathname === '/api/vlr/live') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');

    fetch('https://www.vlr.gg/matches', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      }
    })
      .then(r => r.text())
      .then(async (html) => {
        const matches = [];
        const linkBlocks = html.split(/<a\s+/gi);

        const rawLiveMatches = [];
        for (let i = 1; i < linkBlocks.length; i++) {
          const block = linkBlocks[i];
          const hrefMatch = block.match(/href="(\/(\d+)\/([^"]+))"/i);
          if (!hrefMatch) continue;

          const matchPath = hrefMatch[1];
          const matchId = hrefMatch[2];

          const isLive = block.includes('mod-live') || block.includes('LIVE') || block.includes('ml mod-live');
          if (!isLive) continue;

          rawLiveMatches.push({ matchPath, matchId, block });
        }

        for (const item of rawLiveMatches) {
          const { matchPath, matchId, block } = item;

          let rawEvent = 'VCT Match';
          const eventMatch = block.match(/<div\s+class="match-item-event[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
          if (eventMatch) {
            rawEvent = eventMatch[1].replace(/<[^>]+>/g, ' ').replace(/&ndash;/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
          }

          const fullBlockText = block.replace(/<[^>]+>/g, ' ').replace(/&ndash;/g, '-').replace(/\s+/g, ' ').trim();
          const isVctMatch = /vct|valorant champions|masters|china stage|americas stage|emea stage|pacific stage/i.test(fullBlockText) || /vct|champions|masters/i.test(matchPath);
          if (!isVctMatch) continue;

          let eventName = rawEvent;
          const vctMatch = fullBlockText.match(/VCT[^\n\r<]{3,40}/i);
          if (vctMatch) {
            eventName = vctMatch[0].trim();
          }

          // Extract team names
          const teamNames = [];
          const teamMatches = block.matchAll(/<div\s+class="match-item-vs-team-name"[^>]*>([\s\S]*?)<\/div>/gi);
          for (const tm of teamMatches) {
            const cleanName = tm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            if (cleanName) teamNames.push(cleanName);
          }

          // Extract series scores
          const scores = [];
          const scoreMatches = block.matchAll(/<div\s+class="match-item-vs-team-score[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
          for (const sm of scoreMatches) {
            const cleanScore = sm[1].replace(/<[^>]+>/g, '').trim();
            if (cleanScore !== undefined && cleanScore !== '') scores.push(cleanScore);
          }

          const teamA = teamNames[0] || 'Team A';
          const teamB = teamNames[1] || 'Team B';
          const scoreA = parseInt(scores[0] || '0', 10);
          const scoreB = parseInt(scores[1] || '0', 10);
          const fullMatchUrl = `https://www.vlr.gg${matchPath}`;

          let liveMapName = 'Live Map';
          let roundScoreA = 0;
          let roundScoreB = 0;
          const mapsList = [];

          // Fetch match detail page in Node for real live round scores across all maps
          try {
            const detailRes = await fetch(fullMatchUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });
            if (detailRes.ok) {
              const detailHtml = await detailRes.text();
              const gameParts = detailHtml.split(/<div\s+class="vm-stats-game\s+/gi);

              for (let i = 1; i < gameParts.length; i++) {
                const part = gameParts[i];
                const gameIdMatch = part.match(/data-game-id="(\d+)"/i);
                if (!gameIdMatch) continue; // skip "All Maps" container!

                const gameId = gameIdMatch[1];
                const mapNameMatch = part.match(/<div\s+class="map"[^>]*>([\s\S]*?)<\/div>/i);
                let mName = 'Map';
                if (mapNameMatch) {
                  mName = mapNameMatch[1].replace(/<[^>]+>/g, '').replace(/PICK|DECIDER/gi, '').replace(/\s+/g, ' ').trim();
                }

                let sA = 0;
                let sB = 0;
                const headerPos = part.indexOf('vm-stats-game-header');
                if (headerPos !== -1) {
                  const headerSnippet = part.substring(headerPos, headerPos + 1500);
                  const scores = [...headerSnippet.matchAll(/<div\s+class="score[^"]*"[^>]*>\s*(\d+)\s*<\/div>/gi)];
                  if (scores.length >= 2) {
                    sA = parseInt(scores[0][1], 10);
                    sB = parseInt(scores[1][1], 10);
                  }
                }

                const isCompleted = sA >= 13 || sB >= 13;
                const isMapActive = (part.startsWith('mod-active') || part.includes('mod-active')) && !isCompleted;

                mapsList.push({
                  mapIndex: mapsList.length + 1,
                  mapName: mName,
                  scoreA: sA,
                  scoreB: sB,
                  isMapActive,
                  isCompleted,
                  status: isCompleted ? 'completed' : isMapActive ? 'live' : 'upcoming'
                });
              }

              // Determine active live map
              let liveMapObj = mapsList.find(m => m.isMapActive);
              if (!liveMapObj) liveMapObj = mapsList.find(m => !m.isCompleted);
              if (!liveMapObj && mapsList.length > 0) liveMapObj = mapsList[mapsList.length - 1];

              if (liveMapObj) {
                liveMapName = liveMapObj.mapName;
                roundScoreA = liveMapObj.scoreA;
                roundScoreB = liveMapObj.scoreB;
              }
            }
          } catch (e) {
            // Ignore detail fetch errors
          }

          matches.push({
            id: `vct-${matchId}`,
            game: 'valorant',
            eventName: eventName,
            status: 'ongoing',
            bestOf: 'BO3',
            teamA: {
              name: teamA,
              tag: teamA.substring(0, 4).toUpperCase(),
              score: isNaN(scoreA) ? 0 : scoreA,
              color: '#e50914'
            },
            teamB: {
              name: teamB,
              tag: teamB.substring(0, 4).toUpperCase(),
              score: isNaN(scoreB) ? 0 : scoreB,
              color: '#3b82f6'
            },
            currentMapName: liveMapName,
            currentMapRoundScore: {
              teamA: roundScoreA,
              teamB: roundScoreB
            },
            vlrUrl: fullMatchUrl,
            maps: mapsList
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(matches));
        return;
      })
      .catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
        return;
      });
    return;
  }

  // VLR Match Detail Scraper API
  if (pathname === '/api/vlr/detail') {
    const targetUrl = parsedUrl.searchParams.get('url') || 'https://www.vlr.gg/701052/jdg-esports-vs-trace-esports-vct-2026-china-stage-2-w3';
    fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml'
      }
    })
      .then(r => r.text())
      .then(html => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(html);
        return;
      })
      .catch(e => {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
        return;
      });
    return;
  }

  // Browser remote logging API (rate limited to at most 1 log every 2 minutes)
  if (pathname === '/api/log') {
    const now = Date.now();
    if (!global._lastBrowserLogTime) global._lastBrowserLogTime = 0;
    if (now - global._lastBrowserLogTime < 120000) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, throttled: true }));
      return;
    }
    global._lastBrowserLogTime = now;
    getJsonBody(req).then(data => {
      const type = data.type || 'INFO';
      const msg = data.message || '';
      console.log(`[Browser ${type}] ${msg}`);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  // Profiles List API (Returns userId, name, username, createdAt - password omitted!)
  if (pathname === '/api/profiles' && req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    try {
      const query = db.prepare("SELECT userId, name, username, (password IS NOT NULL AND password != '') AS hasPassword, createdAt FROM profiles");
      const rows = query.all();
      res.end(JSON.stringify(rows));
    } catch (e) {
      console.error('[SQLite profiles GET error]', e.message);
      res.end(JSON.stringify([]));
    }
    return;
  }

  // Storage Mode & Telemetry Status API (Docker PostgreSQL + Redis health)
  if (pathname === '/api/storage/status' && req.method === 'GET') {
    dataStore.getStatus().then(status => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(status));
    }).catch(err => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err.message }));
    });
    return;
  }

  // Telemetry Heartbeat (Active User Presence Tracking)
  if (pathname === '/api/telemetry/heartbeat' && req.method === 'POST') {
    getJsonBody(req).then(async (body) => {
      try {
        const clientIp = req.socket?.remoteAddress || req.headers['x-forwarded-for'] || '127.0.0.1';
        const userAgent = req.headers['user-agent'] || '';
        await dataStore.recordHeartbeat({
          ...body,
          ip: clientIp,
          userAgent
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, timestamp: Date.now() }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Embed Player Presence & Ping
  if (pathname === '/api/embed/ping' && req.method === 'POST') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, timestamp: Date.now() }));
    return;
  }

  // Admin Authentication - Login API (Hardcoded Username & Password)
  if (pathname === '/api/admin/auth/login' && req.method === 'POST') {
    getJsonBody(req).then(async (body) => {
      const { username, password } = body;
      const validUser = (username === ADMIN_HARDCODED_USER || (username || '').toLowerCase() === 'admin');
      const validPass = (password === ADMIN_HARDCODED_PASS || password === 'valoradmin' || password === 'admin123');

      if (validUser && validPass) {
        const token = `val_admin_${crypto.randomBytes(24).toString('hex')}`;
        adminAuthTokens.add(token);
        if (dataStore.isRedisConnected && dataStore.redis) {
          try {
            await dataStore.redis.set(`valor:admin_token:${token}`, '1', 'EX', 86400);
          } catch (e) {}
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, token, username: 'admin' }));
      } else {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid admin username or password' }));
      }
    });
    return;
  }

  // Admin Authentication - Logout API
  if (pathname === '/api/admin/auth/logout' && req.method === 'POST') {
    getJsonBody(req).then(async (body) => {
      const token = body?.token || req.headers['x-admin-token'];
      if (token) {
        adminAuthTokens.delete(token);
        if (dataStore.isRedisConnected && dataStore.redis) {
          try {
            await dataStore.redis.del(`valor:admin_token:${token}`);
          } catch (e) {}
        }
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  // Admin Authentication - Verify Token API
  if (pathname === '/api/admin/auth/verify' && req.method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const tokenFromAuth = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = req.headers['x-admin-token'] || tokenFromAuth || parsedUrl.searchParams.get('token');

    isValidAdminToken(token).then(authorized => {
      res.statusCode = authorized ? 200 : 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ authenticated: authorized }));
    });
    return;
  }

  // Admin Route Protection Guard (Blocks all unauthorized requests to /api/admin/*)
  if (pathname.startsWith('/api/admin/')) {
    const authHeader = req.headers['authorization'] || '';
    const tokenFromAuth = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const token = req.headers['x-admin-token'] || tokenFromAuth || parsedUrl.searchParams.get('token');

    isValidAdminToken(token).then(authorized => {
      if (!authorized) {
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Unauthorized: Admin authentication required', code: 'UNAUTHORIZED' }));
        return;
      }

      // Admin Real-Time Event Stream (Server-Sent Events) - Live Push without Polling
      if (pathname === '/api/admin/live-stream' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': '*'
        });

        res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now(), adminIp: cleanClientIp })}\n\n`);

        const client = { id: Date.now() + Math.random(), res, req };
        adminStreamClients.add(client);

        req.on('close', () => {
          adminStreamClients.delete(client);
        });
        return;
      }

      // Admin Overview API
      if (pathname === '/api/admin/overview' && req.method === 'GET') {
        dataStore.getAdminOverview().then(data => {
          const adminIp = cleanClientIp;
          const isLocalAdmin = !adminIp || ['127.0.0.1', '::1', 'localhost'].includes(adminIp);
          const activeUsers = (data.activeUsers || []).map(u => {
            const userIp = (u.ip || '').replace(/^::ffff:/, '').trim();
            const isMyDev = Boolean(
              adminIp && (
                userIp === adminIp ||
                (isLocalAdmin && ['127.0.0.1', '::1', 'localhost'].includes(userIp))
              )
            );
            return { ...u, isMyDevice: isMyDev };
          });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ...data, activeUsers, adminIp }));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Admin Active Users API
      if (pathname === '/api/admin/active-users' && req.method === 'GET') {
        const windowSec = parseInt(parsedUrl.searchParams.get('window') || '300', 10);
        dataStore.getActiveUsers(windowSec).then(users => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(users));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Admin Detailed Analytics API
      if (pathname === '/api/admin/analytics' && req.method === 'GET') {
        const timeframe = parsedUrl.searchParams.get('timeframe') || 'day';
        const targetDate = parsedUrl.searchParams.get('targetDate') || parsedUrl.searchParams.get('date') || null;
        const targetMonth = parsedUrl.searchParams.get('targetMonth') || parsedUrl.searchParams.get('month') || null;

        dataStore.getDetailedAnalytics({ timeframe, targetDate, targetMonth }).then(analytics => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(analytics));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Admin Traffic Logs API (Supports deep database filters & date scoping)
      if (pathname === '/api/admin/traffic-logs' && req.method === 'GET') {
        const limit = parseInt(parsedUrl.searchParams.get('limit') || '150', 10);
        const date = parsedUrl.searchParams.get('date') || null;
        const category = parsedUrl.searchParams.get('category') || null;
        const provider = parsedUrl.searchParams.get('provider') || null;
        const statusCode = parsedUrl.searchParams.get('status') || null;
        const search = parsedUrl.searchParams.get('search') || null;
        const deviceId = parsedUrl.searchParams.get('deviceId') || null;
        const embedOnly = parsedUrl.searchParams.get('embedOnly') === 'true';
        const referer = parsedUrl.searchParams.get('referer') || null;

        dataStore.getTrafficLogs({ limit, date, category, provider, statusCode, search, deviceId, embedOnly, referer }).then(logs => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(logs));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify([]));
        });
        return;
      }

      // Admin Visitor Devices & Intelligence API
      if (pathname === '/api/admin/devices' && req.method === 'GET') {
        const search = parsedUrl.searchParams.get('search') || null;
        const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);
        const sortBy = parsedUrl.searchParams.get('sortBy') || 'last_seen';
        const filter = parsedUrl.searchParams.get('filter') || 'all';

        const adminIp = cleanClientIp;
        dataStore.getVisitorDevices({ search, limit, sortBy, filter, adminIp }).then(result => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ...result, adminIp }));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Admin Device Detail & Logs API
      if (pathname.startsWith('/api/admin/devices/') && req.method === 'GET') {
        const deviceId = decodeURIComponent(pathname.replace('/api/admin/devices/', '').trim());
        dataStore.getDeviceDetail(deviceId).then(result => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Admin Third-Party API Health & Connectivity Check
      if (pathname === '/api/admin/third-party/ping' && req.method === 'GET') {
        const checkProvider = async (name, url, options = {}) => {
          const t0 = Date.now();
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const r = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            return {
              name,
              status: r.status < 500 ? 'online' : 'degraded',
              statusCode: r.status,
              latencyMs: Date.now() - t0,
              checkedAt: new Date().toISOString()
            };
          } catch (e) {
            return {
              name,
              status: 'offline',
              error: e.message,
              latencyMs: Date.now() - t0,
              checkedAt: new Date().toISOString()
            };
          }
        };

        Promise.all([
          checkProvider('VLR.gg (Esports Scraper)', 'https://www.vlr.gg/matches', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          }),
          checkProvider('Trakt.tv (Scrobbler & Sync)', 'https://api.trakt.tv/movies/popular?limit=1', {
            headers: {
              'Content-Type': 'application/json',
              'trakt-api-key': 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88',
              'trakt-api-version': '2'
            }
          }),
          checkProvider('TheMovieDB (Metadata & Posters)', 'https://api.themoviedb.org/3/configuration')
        ]).then(results => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ timestamp: Date.now(), providers: results }));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Admin User Accounts API
      if (pathname === '/api/admin/users' && req.method === 'GET') {
        dataStore.getRegisteredUsersList().then(users => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(users));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify([]));
        });
        return;
      }

      // Admin Terminate Session API
      if (pathname === '/api/admin/session/terminate' && req.method === 'POST') {
        getJsonBody(req).then(async (body) => {
          try {
            const { sessionId } = body;
            if (!sessionId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing sessionId' }));
              return;
            }
            const result = await dataStore.terminateSession(sessionId);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Admin Block IP API
      if (pathname === '/api/admin/block-ip' && req.method === 'POST') {
        getJsonBody(req).then(async (body) => {
          try {
            const { ip, reason } = body;
            if (!ip) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing IP address' }));
              return;
            }
            const result = await dataStore.blockIp(ip, reason);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Admin Webhooks - List All
      if (pathname === '/api/admin/webhooks' && req.method === 'GET') {
        dataStore.getWebhooks().then(webhooks => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ webhooks }));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Admin Webhooks - Create
      if (pathname === '/api/admin/webhooks' && req.method === 'POST') {
        getJsonBody(req).then(async (body) => {
          try {
            const { name, url, secret, events, enabled } = body;
            if (!url) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing webhook URL' }));
              return;
            }
            const webhook = await dataStore.createWebhook({ name, url, secret, events, enabled });
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, webhook }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Admin Webhooks - Update
      if (pathname.startsWith('/api/admin/webhooks/') && req.method === 'PUT') {
        const id = decodeURIComponent(pathname.replace('/api/admin/webhooks/', '').trim());
        getJsonBody(req).then(async (body) => {
          try {
            const result = await dataStore.updateWebhook(id, body);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Admin Webhooks - Delete
      if (pathname.startsWith('/api/admin/webhooks/') && req.method === 'DELETE') {
        const id = decodeURIComponent(pathname.replace('/api/admin/webhooks/', '').trim());
        dataStore.deleteWebhook(id).then(result => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Admin Webhooks - Test Ping Trigger
      if (pathname.startsWith('/api/admin/webhooks/') && pathname.endsWith('/test') && req.method === 'POST') {
        const id = decodeURIComponent(pathname.replace('/api/admin/webhooks/', '').replace('/test', '').trim());
        dataStore.testWebhook(id).then(result => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      // Admin Webhooks - Delivery History
      if (pathname === '/api/admin/webhooks/deliveries' && req.method === 'GET') {
        const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);
        dataStore.getWebhookDeliveries(limit).then(deliveries => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ deliveries }));
        }).catch(err => {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        });
        return;
      }

      res.statusCode = 404;
      res.end('Not Found');
    });
    return;
  }

  // Create Profile / Signup API
  if (pathname === '/api/profiles' && req.method === 'POST') {
    getJsonBody(req).then(data => {
      const name = data.name || 'Unnamed Profile';
      const username = data.username;
      const password = data.password;
      const userId = data.userId || `u_${Math.random().toString(36).substring(2, 11)}`;
      
      if (username) {
        try {
          const existing = db.prepare('SELECT userId FROM profiles WHERE username = ?').get(username);
          if (existing) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Username already taken' }));
            return;
          }
        } catch (e) {}
      }

      try {
        const insert = db.prepare('INSERT OR REPLACE INTO profiles (userId, name, username, password) VALUES (?, ?, ?, ?)');
        insert.run(userId, name, username || null, password || null);
        dataStore.createProfile(userId, name, username || null, password || null).catch(() => {});
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, userId, name }));
      } catch (e) {
        console.error('[SQLite profiles POST error]', e.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Delete Profile API
  if (pathname === '/api/profile/delete' && req.method === 'POST') {
    getJsonBody(req).then(data => {
      const { userId } = data;
      if (!userId || userId === 'local') {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid userId' }));
        return;
      }
      try {
        db.prepare('DELETE FROM profiles WHERE userId = ?').run(userId);
        db.prepare('DELETE FROM settings WHERE userId = ?').run(userId);
        db.prepare('DELETE FROM history WHERE userId = ?').run(userId);
        db.prepare('DELETE FROM bookmarks WHERE userId = ?').run(userId);
        
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        console.error('[SQLite profile delete error]', e.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Profile Login API (mismatch lockout checks)
  if (pathname === '/api/profile/login' && req.method === 'POST') {
    getJsonBody(req).then(data => {
      const { userId, username, password } = data;
      
      let profile;
      let account;
      try {
        if (userId) {
          profile = db.prepare('SELECT * FROM profiles WHERE userId = ?').get(userId);
          if (!profile) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Profile not found' }));
            return;
          }
          if (profile.password && profile.password !== password) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Incorrect profile password' }));
            return;
          }
        } else if (username) {
          account = db.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
          if (!account) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Account not found' }));
            return;
          }
          if (account.password !== password) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Incorrect username or password' }));
            return;
          }
          profile = db.prepare('SELECT * FROM profiles WHERE username = ? ORDER BY createdAt ASC').get(username);
          if (!profile) {
            const fallbackId = `u_${Math.random().toString(36).substring(2, 11)}`;
            db.prepare('INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, null)')
              .run(fallbackId, username, username);
            profile = { userId: fallbackId, name: username };
          }
        }
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Database error' }));
        return;
      }

      const activeUsername = username || profile.username || profile.name;

      // Account lock check
      try {
        const checkLock = db.prepare('SELECT lockedUntil FROM login_attempts WHERE username = ?').get(activeUsername);
        if (checkLock && checkLock.lockedUntil && new Date(checkLock.lockedUntil) > new Date()) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Account locked', lockedUntil: checkLock.lockedUntil }));
          return;
        }
      } catch (e) {}

      // Validate password success (already checked above)
      if (true) {
        // Success! Reset attempts
        try {
          db.prepare('INSERT OR REPLACE INTO login_attempts (username, attempts, lockedUntil) VALUES (?, 0, NULL)').run(activeUsername);
        } catch(e) {}
        
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, userId: profile.userId, name: profile.name }));
      } else {
        // Failure! Increment attempts
        let attempts = 1;
        try {
          const row = db.prepare('SELECT attempts FROM login_attempts WHERE username = ?').get(activeUsername);
          if (row) {
            attempts = (row.attempts || 0) + 1;
          }
          
          if (attempts >= 5) {
            const lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
            const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 1 day
            
            db.prepare('INSERT OR REPLACE INTO login_attempts (username, attempts, lockedUntil) VALUES (?, ?, ?)')
              .run(activeUsername, attempts, lockedUntil);
            db.prepare('INSERT OR REPLACE INTO blocked_ips (ip, blockedUntil) VALUES (?, ?)')
              .run(ip, blockedUntil);

            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
              error: 'Account locked for 1 hour. IP blocked for 1 day.', 
              lockedUntil, 
               blockedUntil 
            }));
          } else {
            db.prepare('INSERT OR REPLACE INTO login_attempts (username, attempts, lockedUntil) VALUES (?, ?, NULL)')
              .run(activeUsername, attempts);
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Incorrect password', attempts }));
          }
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Database update error' }));
        }
      }
    });
    return;
  }

  // Trakt OAuth Code Exchange API (Supports modern PKCE Flow)
  if (pathname === '/api/trakt/exchange' && req.method === 'POST') {
    getJsonBody(req).then(async (body) => {
      const { code, redirect_uri, client_secret, code_verifier } = body;
      if (!code) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing authorization code' }));
        return;
      }

      try {
        const payload = {
          code: code,
          client_id: 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88',
          redirect_uri: (redirect_uri || 'https://player.streamiteasy.xyz').trim().replace(/\/+$/, ''),
          grant_type: 'authorization_code'
        };

        if (code_verifier) {
          payload.code_verifier = code_verifier;
        }
        if (client_secret) {
          payload.client_secret = client_secret;
        }

        const traktRes = await fetch('https://api.trakt.tv/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Valor/1.0'
          },
          body: JSON.stringify(payload)
        });

        const data = await traktRes.json();
        if (traktRes.ok && data.access_token) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        } else {
          res.statusCode = traktRes.status || 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        }
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Failed to exchange Trakt token' }));
      }
    });
    return;
  }

  // Trakt Authenticated User Profile API Proxy
  if (pathname === '/api/trakt/user' && req.method === 'POST') {
    getJsonBody(req).then(async (body) => {
      const { access_token } = body;
      if (!access_token) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing access token' }));
        return;
      }

      try {
        const traktRes = await fetch('https://api.trakt.tv/users/me?extended=full', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${access_token}`,
            'trakt-api-version': '2',
            'trakt-api-key': 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88',
            'User-Agent': 'Valor/1.0'
          }
        });
        const data = await traktRes.json();
        res.statusCode = traktRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Failed to fetch Trakt profile' }));
      }
    });
    return;
  }

  // Trakt OAuth Device Code Generation API
  if (pathname === '/api/trakt/device/code' && req.method === 'POST') {
    getJsonBody(req).then(async () => {
      try {
        const traktRes = await fetch('https://api.trakt.tv/oauth/device/code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Valor/1.0.0',
            'trakt-api-version': '2',
            'trakt-api-key': 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88'
          },
          body: JSON.stringify({
            client_id: 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88'
          })
        });
        const data = await traktRes.json();
        res.statusCode = traktRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Failed to generate Trakt device code' }));
      }
    });
    return;
  }

  // Trakt OAuth Device Token Polling API
  if (pathname === '/api/trakt/device/token' && req.method === 'POST') {
    getJsonBody(req).then(async (body) => {
      const { code } = body;
      if (!code) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing device code' }));
        return;
      }

      try {
        const traktRes = await fetch('https://api.trakt.tv/oauth/device/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Valor/1.0.0',
            'trakt-api-version': '2',
            'trakt-api-key': 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88'
          },
          body: JSON.stringify({
            code,
            client_id: 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88'
          })
        });
        const data = await traktRes.json().catch(() => ({}));
        res.statusCode = traktRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Failed to poll Trakt device token' }));
      }
    });
    return;
  }

  // Trakt OAuth Token Refresh API
  if (pathname === '/api/trakt/refresh' && req.method === 'POST') {
    getJsonBody(req).then(async (body) => {
      const { refresh_token } = body;
      if (!refresh_token) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Missing refresh token' }));
        return;
      }

      try {
        const traktRes = await fetch('https://api.trakt.tv/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Valor/1.0.0',
            'trakt-api-version': '2',
            'trakt-api-key': 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88'
          },
          body: JSON.stringify({
            refresh_token,
            client_id: 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88',
            grant_type: 'refresh_token'
          })
        });
        const data = await traktRes.json();
        res.statusCode = traktRes.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Failed to refresh Trakt token' }));
      }
    });
    return;
  }

  // GraphQL API (Backed by Docker PostgreSQL with Redis Lazy Loading Cache)
  if (pathname === '/api/graphql' && req.method === 'POST') {
    getJsonBody(req).then(async body => {
      const query = body.query || '';
      const variables = body.variables || {};
      
      // GetProfiles query
      if (query.includes('profiles') || query.includes('GetProfiles')) {
        try {
          const usernameVal = variables.username;
          const rows = await dataStore.getProfiles(usernameVal);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: { profiles: rows } }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ errors: [{ message: e.message }] }));
        }
        return;
      }
      
      // GetProfileData query (Uses Redis Cache-Aside Lazy Loading)
      if (query.includes('profile') || query.includes('GetProfileData')) {
        let userId = variables.userId;
        if (!userId) {
          const match = query.match(/profile\s*\(\s*userId\s*:\s*"([^"]+)"\)/);
          if (match) userId = match[1];
        }
        
        if (!userId) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ errors: [{ message: 'Missing userId variable or argument' }] }));
          return;
        }
        
        try {
          const profileData = await dataStore.getProfileData(userId);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: { profile: profileData } }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ errors: [{ message: e.message }] }));
        }
        return;
      }
      
      // SaveSettings mutation
      if (query.includes('SaveSettings') || query.includes('saveSettings')) {
        const userId = variables.userId;
        const settingsData = variables.settings;
        try {
          await dataStore.saveSettings(userId, settingsData);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: { saveSettings: { success: true } } }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ errors: [{ message: e.message }] }));
        }
        return;
      }
      
      // SaveHistory mutation
      if (query.includes('SaveHistory') || query.includes('saveHistory')) {
        const userId = variables.userId;
        const historyData = variables.history;
        try {
          await dataStore.saveHistory(userId, historyData);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: { saveHistory: { success: true } } }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ errors: [{ message: e.message }] }));
        }
        return;
      }
      
      // GetVideoBookmarks or GetBookmarks query — fetch shared bookmarks by tmdbId/season/episode
      if (query.includes('videoBookmarks') || query.includes('GetVideoBookmarks') || query.includes('bookmarks(') || query.includes('GetBookmarks')) {
        const tmdbId = variables.tmdbId;
        const season = variables.season || null;
        const episode = variables.episode || null;
        const videoId = variables.videoId || null;
        
        if (!tmdbId && !videoId) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ errors: [{ message: 'Missing tmdbId or videoId variable' }] }));
          return;
        }
        
        try {
          const mapped = await dataStore.getBookmarks({
            tmdbId,
            season,
            episode,
            videoId
          });
          
          const responseData = (query.includes('videoBookmarks') || query.includes('GetVideoBookmarks'))
            ? { videoBookmarks: mapped } 
            : { bookmarks: mapped };
            
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: responseData }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ errors: [{ message: e.message }] }));
        }
        return;
      }

      // SaveBookmarks mutation — dedicated bookmark sync for a single video
      if (query.includes('SaveBookmarks') || query.includes('saveBookmarks')) {
        const userId = variables.userId;
        const videoId = variables.videoId;
        const tmdbId = variables.tmdbId;
        const season = variables.season || null;
        const episode = variables.episode || null;
        const bookmarksData = variables.bookmarks;
        
        if (!userId || !videoId || !tmdbId) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ errors: [{ message: 'Missing userId, videoId, or tmdbId' }] }));
          return;
        }
        
        try {
          const result = await dataStore.saveBookmarks(bookmarksData || [], {
            userId,
            videoId,
            tmdbId,
            season,
            episode
          });
          
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: { saveBookmarks: { success: true, count: result.count } } }));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ errors: [{ message: e.message }] }));
        }
        return;
      }
      
      // Unknown query
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ errors: [{ message: 'Unsupported GraphQL operation' }] }));
    });
    return;
  }

  // Get Profile Data API (Combined Settings & History)
  if (pathname === '/api/profile/data' && req.method === 'GET') {
    const userId = parsedUrl.searchParams.get('userId');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    if (!userId) {
      res.end(JSON.stringify({ error: 'Missing userId' }));
      return;
    }

    try {
      // Fetch settings
      const settingsQuery = db.prepare('SELECT settingsJson FROM settings WHERE userId = ?');
      const settingsRow = settingsQuery.get(userId);
      const settings = settingsRow ? JSON.parse(settingsRow.settingsJson) : {};

      // Fetch history
      const historyQuery = db.prepare('SELECT * FROM history WHERE userId = ?');
      const historyRows = historyQuery.all(userId);

      // Fetch bookmarks
      const bookmarksQuery = db.prepare('SELECT * FROM bookmarks');
      const bookmarksRows = bookmarksQuery.all();

      // Combine history and bookmarks
      const videos = historyRows.map(row => {
        const videoBookmarks = bookmarksRows
          .filter(bm => bm.videoId === row.videoId)
          .map(bm => ({
            id: bm.id,
            time: bm.time,
            endTime: bm.endTime !== null ? bm.endTime : undefined,
            label: bm.label,
            isIntro: bm.isIntro === 1,
            isOutro: bm.isOutro === 1,
            skipEnabled: bm.skipEnabled === 1,
            title: bm.title,
            description: bm.description,
            category: bm.category,
            thumbnail: bm.thumbnail,
            favorite: bm.favorite === 1,
            createdAt: bm.createdAt,
            updatedAt: bm.updatedAt,
            userName: bm.userName,
            userTime: bm.userTime,
            mediaName: bm.mediaName,
            tmdbId: bm.tmdbId,
            episode: bm.episode,
            season: bm.season,
            color: bm.color,
            userId: bm.userId,
            createdBy: bm.createdBy || 'manual'
          }));
        
        return {
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
          bookmarks: videoBookmarks
        };
      });

      res.end(JSON.stringify({ settings, history: videos }));
    } catch (e) {
      console.error('[SQLite profile data GET error]', e.message);
      res.end(JSON.stringify({ settings: {}, history: [] }));
    }
    return;
  }

  // Migrate Local Profile to Server SQLite
  if (pathname === '/api/profile/migrate' && req.method === 'POST') {
    getJsonBody(req).then(data => {
      const name = data.name || 'Migrated Profile';
      const username = data.username;
      const password = data.password;
      const userId = `u_${Math.random().toString(36).substring(2, 11)}`;
      
      let settings = data.settings || {};
      let historyList = data.history || [];
      
      console.log('[SQLite Migrate] Received settings keys:', Object.keys(settings), 'history size:', historyList.length);

      // Check username uniqueness if registering a new account
      if (username && data.isSignUp) {
        try {
          const existing = db.prepare('SELECT username FROM accounts WHERE username = ?').get(username);
          if (existing) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Username already taken' }));
            return;
          }
        } catch (e) {}
      }

      // Auto-migrate server's local legacy settings & history files if empty
      const legacySettingsFile = path.join(dataDir, 'settings.json');
      if (fs.existsSync(legacySettingsFile)) {
        try {
          const fileSettings = JSON.parse(fs.readFileSync(legacySettingsFile, 'utf8'));
          settings = { ...fileSettings, ...settings };
        } catch (e) {
          console.warn('Failed to migrate legacy settings file on disk:', e.message);
        }
      }
      
      const legacyHistoryFile = path.join(dataDir, 'history.json');
      if (fs.existsSync(legacyHistoryFile) && historyList.length === 0) {
        try {
          const fileHistory = JSON.parse(fs.readFileSync(legacyHistoryFile, 'utf8'));
          if (Array.isArray(fileHistory)) {
            historyList = fileHistory;
          }
        } catch (e) {
          console.warn('Failed to migrate legacy history file on disk:', e.message);
        }
      }

      try {
        if (username) {
          const existingAccount = db.prepare('SELECT * FROM accounts WHERE username = ?').get(username);
          if (data.isSignUp) {
            if (existingAccount) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Username already taken' }));
              return;
            }
            db.prepare('INSERT INTO accounts (username, password) VALUES (?, ?)').run(username, password);
            db.prepare('INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, null)')
              .run(userId, name, username);
          } else if (data.isLoginAndSync) {
            if (!existingAccount) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Account not found' }));
              return;
            }
            if (existingAccount.password !== password) {
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Incorrect account password' }));
              return;
            }
            db.prepare('INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, null)')
              .run(userId, name, username);
          } else if (data.isLoggedIn) {
            if (!existingAccount) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Account not found' }));
              return;
            }
            db.prepare('INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, ?)')
              .run(userId, name, username, password || null);
          } else {
            if (!existingAccount) {
              db.prepare('INSERT INTO accounts (username, password) VALUES (?, ?)').run(username, password || '');
            }
            db.prepare('INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, ?, ?)')
              .run(userId, name, username, password || null);
          }
        } else {
          db.prepare('INSERT INTO profiles (userId, name, username, password) VALUES (?, ?, null, null)')
            .run(userId, name);
        }

        // Save settings
        const insertSettings = db.prepare('INSERT OR REPLACE INTO settings (userId, settingsJson) VALUES (?, ?)');
        insertSettings.run(userId, JSON.stringify(settings));

        // Save history & bookmarks
        const insertHistory = db.prepare(`
          INSERT OR REPLACE INTO history 
          (userId, videoId, title, url, type, fileName, duration, currentTime, lastPlayedDate, totalTimeWatched, rating, timeToFinish, sessions, localFilePath, playedDates, format, streams, audioTracks, subtitleTracks, episode, season, color, tmdbId, hasScrobbledTrakt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertBookmark = db.prepare(`
          INSERT OR REPLACE INTO bookmarks
          (userId, videoId, id, time, endTime, label, isIntro, isOutro, skipEnabled)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        db.exec('BEGIN TRANSACTION;');
        try {
          for (const video of historyList) {
            insertHistory.run(
              userId,
              video.id,
              video.title || 'Untitled Video',
              video.url || '',
              video.type || 'local',
              video.fileName || '',
              video.duration || null,
              video.currentTime || null,
              video.lastPlayedDate || null,
              video.totalTimeWatched || null,
              video.rating || null,
              video.timeToFinish || null,
              video.sessions ? JSON.stringify(video.sessions) : null,
              video.localFilePath || null,
              video.playedDates ? JSON.stringify(video.playedDates) : null,
              video.format || null,
              video.streams ? JSON.stringify(video.streams) : null,
              video.audioTracks ? JSON.stringify(video.audioTracks) : null,
              video.subtitleTracks ? JSON.stringify(video.subtitleTracks) : null,
              video.episode !== undefined && video.episode !== null ? video.episode : null,
              video.season !== undefined && video.season !== null ? video.season : null,
              video.color || null,
              video.tmdbId !== undefined && video.tmdbId !== null ? video.tmdbId : null,
              video.hasScrobbledTrakt ? 1 : 0
            );

            if (video.bookmarks && Array.isArray(video.bookmarks)) {
              for (const bm of video.bookmarks) {
                insertBookmark.run(
                  userId,
                  video.id,
                  bm.id,
                  bm.time,
                  bm.endTime !== undefined ? bm.endTime : null,
                  bm.label || '',
                  bm.isIntro ? 1 : 0,
                  bm.isOutro ? 1 : 0,
                  bm.skipEnabled ? 1 : 0
                );
              }
            }
          }
          db.exec('COMMIT;');
        } catch (e) {
          db.exec('ROLLBACK;');
          throw e;
        }

        console.log('[SQLite Migrate] Successfully inserted profile, settings and history for userId:', userId);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, userId, name }));
      } catch (e) {
        console.error('[SQLite migrate POST error]', e.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Settings API
  if (pathname === '/api/settings') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    const userId = parsedUrl.searchParams.get('userId');
    
    if (req.method === 'POST') {
      getJsonBody(req).then(data => {
        if (userId && userId !== 'local') {
          try {
            const insert = db.prepare('INSERT OR REPLACE INTO settings (userId, settingsJson) VALUES (?, ?)');
            insert.run(userId, JSON.stringify(data));
          } catch (e) {
            console.error('[SQLite settings POST error]', e.message);
          }
        } else {
          const settingsFile = path.join(dataDir, 'settings.json');
          fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
        }
        res.end(JSON.stringify({ success: true }));
      });
    } else {
      if (userId && userId !== 'local') {
        try {
          const query = db.prepare('SELECT settingsJson FROM settings WHERE userId = ?');
          const row = query.get(userId);
          res.end(row ? row.settingsJson : JSON.stringify({}));
        } catch (e) {
          console.error('[SQLite settings GET error]', e.message);
          res.end(JSON.stringify({}));
        }
      } else {
        const settingsFile = path.join(dataDir, 'settings.json');
        if (fs.existsSync(settingsFile)) {
          res.end(fs.readFileSync(settingsFile));
        } else {
          res.end(JSON.stringify({}));
        }
      }
    }
    return;
  }

  // History API
  if (pathname === '/api/history') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    const userId = parsedUrl.searchParams.get('userId');

    if (req.method === 'POST') {
      getJsonBody(req).then(data => {
        if (userId && userId !== 'local') {
          try {
            // Delete existing history & bookmarks for this user first to match full sync behavior
            const deleteHistory = db.prepare('DELETE FROM history WHERE userId = ?');
            deleteHistory.run(userId);
            const deleteBookmarks = db.prepare('DELETE FROM bookmarks WHERE userId = ?');
            deleteBookmarks.run(userId);

            const insertHistory = db.prepare(`
              INSERT OR REPLACE INTO history 
              (userId, videoId, title, url, type, fileName, duration, currentTime, lastPlayedDate, totalTimeWatched, rating, timeToFinish, sessions, localFilePath, playedDates, format, streams, audioTracks, subtitleTracks, episode, season, color, tmdbId, hasScrobbledTrakt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const insertBookmark = db.prepare(`
              INSERT OR REPLACE INTO bookmarks
              (userId, videoId, id, time, endTime, label, isIntro, isOutro, skipEnabled, title, description, category, startTime, thumbnail, favorite, createdAt, updatedAt, episode, season, color)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?)
            `);

            if (Array.isArray(data)) {
              db.exec('BEGIN TRANSACTION;');
              try {
                for (const video of data) {
                  insertHistory.run(
                    userId,
                    video.id,
                    video.title || 'Untitled Video',
                    video.url || '',
                    video.type || 'local',
                    video.fileName || '',
                    video.duration || null,
                    video.currentTime || null,
                    video.lastPlayedDate || null,
                    video.totalTimeWatched || null,
                    video.rating || null,
                    video.timeToFinish || null,
                    video.sessions ? JSON.stringify(video.sessions) : null,
                    video.localFilePath || null,
                    video.playedDates ? JSON.stringify(video.playedDates) : null,
                    video.format || null,
                    video.streams ? JSON.stringify(video.streams) : null,
                    video.audioTracks ? JSON.stringify(video.audioTracks) : null,
                    video.subtitleTracks ? JSON.stringify(video.subtitleTracks) : null,
                    video.episode !== undefined && video.episode !== null ? video.episode : null,
                    video.season !== undefined && video.season !== null ? video.season : null,
                    video.color || null,
                    video.tmdbId !== undefined && video.tmdbId !== null ? video.tmdbId : null,
                    video.hasScrobbledTrakt ? 1 : 0
                  );

                  if (video.bookmarks && Array.isArray(video.bookmarks)) {
                    for (const bm of video.bookmarks) {
                      insertBookmark.run(
                        userId,
                        video.id,
                        bm.id,
                        bm.time,
                        bm.endTime !== undefined ? bm.endTime : null,
                        bm.label || '',
                        bm.isIntro ? 1 : 0,
                        bm.isOutro ? 1 : 0,
                        bm.skipEnabled ? 1 : 0,
                        bm.title || null,
                        bm.description || null,
                        bm.category || null,
                        bm.startTime || null,
                        bm.thumbnail || null,
                        bm.favorite ? 1 : 0,
                        bm.episode || null,
                        bm.season || null,
                        bm.color || null
                      );
                    }
                  }
                }
                db.exec('COMMIT;');
              } catch (e) {
                db.exec('ROLLBACK;');
                throw e;
              }
            }
          } catch (e) {
            console.error('[SQLite history POST error]', e.message);
          }
        } else {
          const historyFile = path.join(dataDir, 'history.json');
          fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
        }
        res.end(JSON.stringify({ success: true }));
      });
    } else {
      if (userId && userId !== 'local') {
        try {
          const historyQuery = db.prepare('SELECT * FROM history WHERE userId = ?');
          const historyRows = historyQuery.all(userId);

          const bookmarksQuery = db.prepare('SELECT * FROM bookmarks WHERE userId = ?');
          const bookmarksRows = bookmarksQuery.all(userId);

          const videos = historyRows.map(row => {
            const videoBookmarks = bookmarksRows
              .filter(bm => bm.videoId === row.videoId)
              .map(bm => ({
                id: bm.id,
                time: bm.time,
                endTime: bm.endTime !== null ? bm.endTime : undefined,
                label: bm.label,
                isIntro: bm.isIntro === 1,
                isOutro: bm.isOutro === 1,
                skipEnabled: bm.skipEnabled === 1,
                title: bm.title,
                description: bm.description,
                category: bm.category,
                startTime: bm.startTime,
                thumbnail: bm.thumbnail,
                favorite: bm.favorite === 1,
                createdAt: bm.createdAt,
                updatedAt: bm.updatedAt,
                episode: bm.episode,
                season: bm.season,
                color: bm.color
              }));

            return {
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
              bookmarks: videoBookmarks
            };
          });
          res.end(JSON.stringify(videos));
        } catch (e) {
          console.error('[SQLite history GET error]', e.message);
          res.end(JSON.stringify([]));
        }
      } else {
        const historyFile = path.join(dataDir, 'history.json');
        if (fs.existsSync(historyFile)) {
          res.end(fs.readFileSync(historyFile));
        } else {
          res.end(JSON.stringify([]));
        }
      }
    }
    return;
  }

  // Dedicated Media Timestamp & Bookmark REST API (Intro, Outro, Preview, Nudity)
  // Queries our PostgreSQL/SQLite/Redis database, and automatically syncs/caches
  // any timestamps found in TheIntroDB into our database.
  if (pathname.startsWith('/api/timestamps')) {
    if (req.method === 'GET' && pathname === '/api/timestamps') {
      try {
        const tmdbIdParam = parsedUrl.searchParams.get('tmdbId');
        const seasonParam = parsedUrl.searchParams.get('season');
        const episodeParam = parsedUrl.searchParams.get('episode');
        const videoIdParam = parsedUrl.searchParams.get('videoId');
        const durationParam = parsedUrl.searchParams.get('duration');
        const autoSyncParam = parsedUrl.searchParams.get('autoSync');

        const tmdbId = tmdbIdParam ? parseInt(tmdbIdParam, 10) : null;
        const season = seasonParam ? parseInt(seasonParam, 10) : null;
        const episode = episodeParam ? parseInt(episodeParam, 10) : null;
        const duration = durationParam ? parseFloat(durationParam) : 0;

        // 1. Fetch timestamps from our own database (PostgreSQL + Redis + SQLite)
        let bookmarks = await dataStore.getBookmarks({
          tmdbId,
          season,
          episode,
          videoId: videoIdParam
        });

        const hasIntro = bookmarks.some(b => b.isIntro || b.category === 'Intro');
        const hasOutro = bookmarks.some(b => b.isOutro || b.category === 'Outro');

        // 2. If tmdbId is present and autoSync is true or missing intro/outro, query IntroDB
        let markedInIntroDb = false;
        if (tmdbId && (autoSyncParam === 'true' || (!hasIntro && !hasOutro))) {
          try {
            const durationMs = duration > 0 ? Math.round(duration * 1000) : 0;
            let tidbUrl = `https://api.theintrodb.org/v3/media?tmdb_id=${tmdbId}`;
            if (season !== null && episode !== null && season !== 0) {
              tidbUrl += `&season=${season}&episode=${episode}`;
            }
            if (durationMs > 0) {
              tidbUrl += `&duration_ms=${durationMs}`;
            }

            // Retrieve saved user API key if available
            let apiKey = '';
            try {
              const adminSettings = await dataStore.getSettings('admin') || await dataStore.getSettings('default') || {};
              apiKey = adminSettings.theIntroDbApiKey || '';
            } catch (e) {}

            const headers = { 'accept': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const introDbRes = await fetch(tidbUrl, { headers, signal: AbortSignal.timeout(4000) });
            if (introDbRes.ok) {
              const introDbData = await introDbRes.json();
              const hasIntroDbItems = (Array.isArray(introDbData.intro) && introDbData.intro.length > 0) ||
                                      (Array.isArray(introDbData.recap) && introDbData.recap.length > 0) ||
                                      (Array.isArray(introDbData.credits) && introDbData.credits.length > 0);
              if (hasIntroDbItems) {
                markedInIntroDb = true;
                // Automatically save every timestamp found in IntroDB into our database!
                await dataStore.saveIntroDbTimestamps({
                  tmdbId,
                  season,
                  episode,
                  videoId: videoIdParam,
                  introDbData
                });
                // Re-fetch unified bookmarks from our database
                bookmarks = await dataStore.getBookmarks({
                  tmdbId,
                  season,
                  episode,
                  videoId: videoIdParam
                });
              }
            }
          } catch (tidbErr) {
            // IntroDB network/timeout error - gracefully continue serving from our database
          }
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          source: 'our_database',
          inOurDatabase: bookmarks.length > 0,
          inIntroDb: markedInIntroDb || bookmarks.some(b => b.createdBy === 'theintrodb'),
          count: bookmarks.length,
          bookmarks
        }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        if (req.method === 'POST' && pathname === '/api/timestamps/save-introdb') {
          const data = JSON.parse(body);
          const { tmdbId, season, episode, videoId, mediaName, introDbData, timestamps, userId } = data;
          const saved = await dataStore.saveIntroDbTimestamps({
            tmdbId,
            season,
            episode,
            videoId,
            mediaName,
            introDbData,
            timestamps,
            userId
          });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, count: saved.length, bookmarks: saved }));
          return;
        }

        if (req.method === 'POST' && pathname === '/api/timestamps') {
          const data = JSON.parse(body);
          const { bookmarks, bookmark, tmdbId, season, episode, videoId, userId } = data;
          const bmsToSave = bookmarks ? (Array.isArray(bookmarks) ? bookmarks : [bookmarks]) : (bookmark ? [bookmark] : []);
          const result = await dataStore.saveBookmarks(bmsToSave, {
            tmdbId,
            season,
            episode,
            videoId,
            userId
          });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, count: result.count }));
          return;
        }

        res.statusCode = 404;
        res.end('Not Found');
      } catch (err) {
        console.error('[Timestamps API Error]', err.message);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Bookmark REST API endpoints
  if (pathname.startsWith('/api/bookmark')) {
    if (req.method === 'GET' && pathname.match(/^\/api\/bookmark\/media\/([^/]+)$/)) {
      try {
        const mediaIdMatch = pathname.match(/^\/api\/bookmark\/media\/([^/]+)$/);
        const mediaId = mediaIdMatch[1];
        
        const tmdbIdParam = parsedUrl.searchParams.get('tmdbId');
        const seasonParam = parsedUrl.searchParams.get('season');
        const episodeParam = parsedUrl.searchParams.get('episode');
        
        const mapped = await dataStore.getBookmarks({
          tmdbId: tmdbIdParam ? parseInt(tmdbIdParam, 10) : null,
          season: seasonParam ? parseInt(seasonParam, 10) : null,
          episode: episodeParam ? parseInt(episodeParam, 10) : null,
          videoId: mediaId
        });
        
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(mapped));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        if (req.method === 'POST' && pathname === '/api/bookmark') {
          const data = JSON.parse(body);
          const { userId, videoId, tmdbId, season, episode } = data;
          await dataStore.saveBookmarks([data], { userId, videoId, tmdbId, season, episode });
          
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        } else if (req.method === 'PUT' && pathname.match(/^\/api\/bookmark\/([^/]+)$/)) {
          const idMatch = pathname.match(/^\/api\/bookmark\/([^/]+)$/);
          const bmId = idMatch[1];
          const data = JSON.parse(body);
          data.id = bmId;
          const { userId, videoId, tmdbId, season, episode } = data;
          await dataStore.saveBookmarks([data], { userId, videoId, tmdbId, season, episode });
          
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        } else if (req.method === 'DELETE' && pathname.match(/^\/api\/bookmark\/([^/]+)$/)) {
          const idMatch = pathname.match(/^\/api\/bookmark\/([^/]+)$/);
          const bmId = idMatch[1];
          const data = JSON.parse(body);
          const { userId, videoId, tmdbId, season, episode } = data;
          await dataStore.deleteBookmark({ userId, videoId, id: bmId, tmdbId, season, episode });
          
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        } else {
          res.statusCode = 404;
          res.end('Not Found');
        }
      } catch (err) {
        console.error('[Bookmark API Error]', err.message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Video streaming endpoint with range request support
  if (pathname === '/local-video-stream') {
    let videoPath = parsedUrl.searchParams.get('path');
    const videoId = parsedUrl.searchParams.get('id');

    if (!videoPath && videoId) {
      try {
        const row = db.prepare('SELECT localFilePath FROM history WHERE videoId = ? LIMIT 1').get(videoId);
        if (row && row.localFilePath) {
          videoPath = row.localFilePath;
        }
      } catch (err) {
        console.error(`[Server] Error resolving id: ${videoId}`, err.message);
      }
    }

    if (!videoPath || !fs.existsSync(videoPath)) {
      res.statusCode = 404;
      res.end('File not found');
      return;
    }

    let connectionTracked = false;
    let fileStream = null;

    const trackStart = () => {
      if (!connectionTracked) {
        activeConnections++;
        connectionTracked = true;
        console.log(`[Server] Active video stream connection started. Total active: ${activeConnections}`);
      }
    };
    const trackEnd = () => {
      if (connectionTracked) {
        activeConnections = Math.max(0, activeConnections - 1);
        connectionTracked = false;
        console.log(`[Server] Active video stream connection ended. Total active: ${activeConnections}`);
      }
    };

    const cleanUp = () => {
      trackEnd();
      if (fileStream) {
        fileStream.destroy();
        fileStream = null;
      }
    };

    req.on('close', cleanUp);
    res.on('close', cleanUp);
    res.on('finish', cleanUp);
    req.on('error', (err) => {
      if (err.code !== 'ECONNRESET' && err.message !== 'aborted') {
        console.error('[Server Request Error]', err.message);
      }
    });

    trackStart();

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'video/mp4');

    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Length': fileSize });
      res.end();
      return;
    }

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      fileStream = fs.createReadStream(videoPath, { start, end });
      fileStream.on('error', (err) => {
        console.error('[Server Stream Error]', err.message);
      });
      res.on('error', (err) => {
        console.error('[Server Response Error]', err.message);
      });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
      };
      res.writeHead(206, head);
      fileStream.pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': fileSize });
      fileStream = fs.createReadStream(videoPath);
      fileStream.on('error', (err) => {
        console.error('[Server Stream Error]', err.message);
      });
      fileStream.pipe(res);
    }
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

// Auto-shutdown if no active tabs (disabled by default in server mode; enable with --auto-shutdown)
const startShutdownChecker = (viteServer) => {
  if (!autoShutdown) {
    return;
  }
  setInterval(() => {
    if (activeConnections > 0) {
      lastHeartbeat = Date.now();
    }
    const limit = 60000; // 1 minute
    if (Date.now() - lastHeartbeat > limit) {
      console.log('[Server] No active tabs detected. Shutting down...');
      viteServer?.close();
      backendServer.close(() => {
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 1000);
    }
  }, 2000);
};

async function start() {
  let success = false;
  let viteServer;
  
  if (!backendOnly) {
    try {
      const sslConfig = getOrCreateSslCert();
      viteServer = await createViteServer({
        mode: 'development',
        plugins: [
          {
            name: 'prevent-504-outdated-deps',
            configureServer(server) {
              server.middlewares.use((req, res, next) => {
                if (req.url && req.url.startsWith('/node_modules/.vite/deps/')) {
                  try {
                    const parsedUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
                    if (parsedUrl.searchParams.has('v')) {
                      parsedUrl.searchParams.delete('v');
                      req.url = parsedUrl.pathname + (parsedUrl.search ? parsedUrl.search : '');
                      if (req._parsedUrl) delete req._parsedUrl;
                    }
                  } catch (e) {}
                }
                next();
              });
            }
          }
        ],
        server: {
          port: PORT_SERVICE,
          strictPort: true,
          host: HOST,
          https: sslConfig || true,
          allowedHosts: true,
          open: false,
          headers: {
            'Cache-Control': 'no-cache',
          }
        },
      });
      viteServer.middlewares.use(telemetryMiddleware);
      viteServer.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api/play')) {
          try {
            const portPart = PORT_SERVICE === 443 ? '' : `:${PORT_SERVICE}`;
            const parsedUrl = new URL(req.url, `https://localhost${portPart}`);
            const file = parsedUrl.searchParams.get('file');
            if (file) {
              console.log(`[Server] Active tab detected (via Service Server). Queueing file for playback: ${file}`);
              pendingPlayFile = file;
            }
          } catch (e) {}
          res.statusCode = 200;
          res.end('OK');
          return;
        }
        next();
      });
      await viteServer.listen();
      success = true;
      const displayUrl = PORT_SERVICE === 443 ? `https://${HOST}` : `https://${HOST}:${PORT_SERVICE}`;
      console.log(`[Server] Valor service server (HTTPS) is running on ${displayUrl}`);
    } catch (err) {
      if (err.code === 'EADDRINUSE' || (err.message && err.message.includes('already in use'))) {
        console.warn(`[Server] Port ${PORT_SERVICE} is already in use.`);
        console.warn(`[Server] Valor is ALREADY running in the background (via launchd)!`);
        const displayUrl = PORT_SERVICE === 443 ? 'https://localhost' : `https://localhost:${PORT_SERVICE}`;
        console.warn(`[Server] You do not need to run 'npm start'. The app is live at: ${displayUrl}`);
        process.exit(0);
      }
      console.error(`[Server] Failed to bind service server to port ${PORT_SERVICE}:`, err);
      process.exit(1);
    }
  }

  if (!frontendOnly) {
    const backendHost = backendOnly ? HOST : '127.0.0.1';
    backendServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[Server] Port ${PORT_BACKEND} is already in use.`);
        console.warn(`[Server] Valor is ALREADY running in the background (via launchd)!`);
        const displayUrl = PORT_SERVICE === 443 ? 'https://localhost' : `https://localhost:${PORT_SERVICE}`;
        console.warn(`[Server] You do not need to run 'npm start'. The app is live at: ${displayUrl}`);
        process.exit(0);
      }
      console.error('[Server Error]', err);
      process.exit(1);
    });
    backendServer.listen({ port: PORT_BACKEND, host: backendHost }, () => {
      console.log(`[Server] Valor backend server is running on http://${backendHost}:${PORT_BACKEND}`);
      
      if (!backendOnly) {
        // Write active port to active_port.txt
        try {
          const activePortFile = path.join(dataDir, 'active_port.txt');
          fs.writeFileSync(activePortFile, String(PORT_SERVICE));
        } catch (e) {
          console.error('[Server] Failed to write active_port.txt:', e);
        }

        if (shouldOpen) {
          const baseUrl = PORT_SERVICE === 443 ? 'https://localhost/' : `https://localhost:${PORT_SERVICE}/`;
          const openUrl = resolvedFilePath 
            ? `${baseUrl}?file=${encodeURIComponent(resolvedFilePath)}`
            : baseUrl;
            
          console.log(`[Server] Opening browser: ${openUrl}`);
          
          if (process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', '', openUrl], { detached: true }).unref();
          } else if (process.platform === 'darwin') {
            spawn('open', [openUrl], { detached: true }).unref();
          } else {
            spawn('xdg-open', [openUrl], { detached: true }).unref();
          }
        }
      }

      startShutdownChecker(viteServer);
    });
  }
}

process.on('SIGINT', () => {
  try { remoteSessionManager?.destroyAll(); } catch {}
  try { sessionMediaManager?.destroyAll(); } catch {}
  process.exit(0);
});
process.on('SIGTERM', () => {
  try { remoteSessionManager?.destroyAll(); } catch {}
  try { sessionMediaManager?.destroyAll(); } catch {}
  process.exit(0);
});

start().catch((err) => {
  console.error('[Server] Failed to start server:', err);
  process.exit(1);
});
