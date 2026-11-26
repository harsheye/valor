// ==============================================================================
// Valor GeoIP & Reverse DNS Intelligence Engine
// ==============================================================================

import dns from 'node:dns/promises';

// In-memory cache for fast, zero-latency lookups
const ipCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode === 'LOCAL' || countryCode === 'UN') return '🌐';
  try {
    const code = countryCode.toUpperCase();
    if (code.length !== 2) return '🌐';
    const codePoints = code.split('').map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch (e) {
    return '🌐';
  }
}

export function isPrivateOrLocalIp(ip) {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/, '').trim();
  if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
  if (clean.startsWith('10.') || clean.startsWith('192.168.') || clean.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
  if (clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80:')) return true;
  return false;
}

/**
 * Resolves Geolocation and Reverse DNS for a given IP address
 * @param {string} rawIp 
 * @returns {Promise<{ip: string, country: string, countryCode: string, flag: string, city: string, region: string, isp: string, org: string, lat: number, lon: number, reverseDns: string}>}
 */
export async function lookupIpIntelligence(rawIp) {
  if (!rawIp) {
    return {
      ip: '127.0.0.1',
      country: 'Localhost',
      countryCode: 'LOCAL',
      flag: '💻',
      city: 'Local Machine',
      region: 'Loopback',
      isp: 'Internal / Local',
      org: 'Local Network',
      lat: 0,
      lon: 0,
      reverseDns: 'localhost'
    };
  }

  const ip = rawIp.replace(/^::ffff:/, '').trim();

  // Check in-memory cache
  const cached = ipCache.get(ip);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  // Handle local / private addresses
  if (isPrivateOrLocalIp(ip)) {
    const localData = {
      ip,
      country: 'Local Network',
      countryCode: 'LOCAL',
      flag: '🏠',
      city: 'Private Subnet',
      region: 'Local Lan',
      isp: 'Internal Subnet',
      org: 'Localhost',
      lat: 0,
      lon: 0,
      reverseDns: 'localhost'
    };
    ipCache.set(ip, { timestamp: Date.now(), data: localData });
    return localData;
  }

  // Perform reverse DNS lookup with timeout
  let reverseDns = '';
  try {
    const hostnames = await Promise.race([
      dns.reverse(ip),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DNS Timeout')), 1500))
    ]);
    if (hostnames && hostnames.length > 0) {
      reverseDns = hostnames[0];
    }
  } catch (e) {
    // Reverse DNS PTR not found is normal for many residential IPs
  }

  // Perform GeoIP resolution
  let geo = {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success') {
        geo = data;
      }
    }
  } catch (e) {
    // Network or timeout
  }

  const country = geo.country || 'Unknown';
  const countryCode = geo.countryCode || 'UN';
  const flag = getFlagEmoji(countryCode);
  const city = geo.city || 'Unknown';
  const region = geo.regionName || geo.region || 'Unknown';
  const isp = geo.isp || 'Unknown ISP';
  const org = geo.org || geo.as || 'Unknown Org';
  const lat = typeof geo.lat === 'number' ? geo.lat : 0;
  const lon = typeof geo.lon === 'number' ? geo.lon : 0;
  const resolvedReverseDns = reverseDns || geo.org || geo.isp || ip;

  const result = {
    ip,
    country,
    countryCode,
    flag,
    city,
    region,
    isp,
    org,
    lat,
    lon,
    reverseDns: resolvedReverseDns
  };

  ipCache.set(ip, { timestamp: Date.now(), data: result });
  return result;
}
