// ==============================================================================
// Valor Analytics & Reverse Proxy Telemetry Engine (Redis + PostgreSQL)
// ==============================================================================

import crypto from 'crypto';

/**
 * Lightweight, high-performance User-Agent and client platform parser
 */
export function parseUserAgent(ua = '') {
  const uaLower = ua.toLowerCase();

  // 1. Device Type
  let device = 'Desktop';
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
    device = 'Tablet';
  } else if (/mobi|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/i.test(uaLower)) {
    device = 'Mobile';
  }

  // 2. Browser
  let browser = 'Unknown';
  if (ua.includes('Brave')) {
    browser = 'Brave';
  } else if (ua.includes('Edg/') || ua.includes('Edge/')) {
    browser = 'Edge';
  } else if (ua.includes('OPR/') || ua.includes('Opera/')) {
    browser = 'Opera';
  } else if (ua.includes('Chrome/') || ua.includes('CriOS/')) {
    // Note: Brave often has Chrome in UA, but if navigator.brave is used or Brave token exists
    browser = ua.includes('Brave') ? 'Brave' : 'Chrome';
  } else if (ua.includes('Firefox/') || ua.includes('FxiOS/')) {
    browser = 'Firefox';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    browser = 'Safari';
  } else if (ua.includes('curl') || ua.includes('Postman')) {
    browser = 'API Client';
  }

  // 3. Operating System
  let os = 'Unknown';
  if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS';
  } else if (/windows nt/i.test(ua)) {
    os = 'Windows';
  } else if (/android/i.test(ua)) {
    os = 'Android';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  return { browser, os, device };
}

/**
 * Normalizes IP address handling reverse proxies and local addresses
 */
export function extractClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const list = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor;
    const ip = list.split(',')[0].trim();
    if (ip) return normalizeIp(ip);
  }

  const headerIp = req.headers['x-real-ip'] || 
                   req.headers['cf-connecting-ip'] || 
                   req.headers['true-client-ip'] ||
                   req.socket?.remoteAddress || 
                   req.connection?.remoteAddress || '';

  return normalizeIp(headerIp);
}

function normalizeIp(ip) {
  if (!ip) return '127.0.0.1';
  if (ip === '::1' || ip === '::ffff:127.0.0.1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) return ip.replace('::ffff:', '');
  return ip;
}

/**
 * Formats byte counts into human-readable strings (KB, MB, GB)
 */
export function formatBytes(bytes) {
  const b = parseInt(bytes, 10) || 0;
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Formats seconds into human-readable duration (e.g. "1h 12m 45s")
 */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) return `${m}m ${remSec}s`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  return `${h}h ${remMin}m`;
}

/**
 * Creates the Reverse Proxy & Telemetry Middleware
 */
export function createReverseProxyTelemetry(dataStore) {
  return function analyticsMiddleware(req, res, next) {
    const startTime = Date.now();
    const ip = extractClientIp(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { browser, os, device } = parseUserAgent(userAgent);

    // Parse or generate Session ID
    let sessionId = req.headers['x-valor-session'];
    if (!sessionId) {
      // Check cookies
      const cookieHeader = req.headers.cookie || '';
      const match = cookieHeader.match(/valor_sid=([^;]+)/);
      if (match) {
        sessionId = match[1];
      }
    }

    if (!sessionId) {
      // Fallback fingerprint session ID: hash(ip + userAgent + day)
      const dayHash = new Date().toISOString().slice(0, 10);
      const hash = crypto.createHash('md5').update(`${ip}-${userAgent}-${dayHash}`).digest('hex').substring(0, 16);
      sessionId = `sess_${hash}`;
    }

    // Set header so browser knows its session ID
    res.setHeader('X-Valor-Session', sessionId);

    // Track response bytes
    let bytesSent = 0;
    const originalWrite = res.write;
    const originalEnd = res.end;

    res.write = function (chunk, encoding, callback) {
      if (chunk) {
        bytesSent += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
      }
      return originalWrite.apply(res, arguments);
    };

    res.end = function (chunk, encoding, callback) {
      if (chunk) {
        bytesSent += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
      }
      return originalEnd.apply(res, arguments);
    };

    // When request finishes, report asynchronously to DataStore (Redis + Postgres)
    res.on('finish', () => {
      const latencyMs = Date.now() - startTime;
      const parsedUrl = new URL(req.url, 'http://localhost');
      const path = parsedUrl.pathname;
      const method = req.method;
      const statusCode = res.statusCode;

      // Extract optional userId if attached
      const userId = req.headers['x-valor-user-id'] || parsedUrl.searchParams.get('userId') || null;
      const profileName = req.headers['x-valor-profile-name'] ? decodeURIComponent(req.headers['x-valor-profile-name']) : null;

      // Ignore telemetry self-polling requests to keep metrics clean
      if (path.startsWith('/api/admin/') || path.startsWith('/api/telemetry/heartbeat')) {
        return;
      }

      dataStore.recordRequest({
        sessionId,
        ip,
        userAgent,
        browser,
        os,
        device,
        path,
        method,
        statusCode,
        bytesTransferred: bytesSent,
        latencyMs,
        userId,
        profileName
      }).catch(err => {
        // Non-blocking error handling
      });
    });

    if (typeof next === 'function') {
      next();
    }
  };
}
