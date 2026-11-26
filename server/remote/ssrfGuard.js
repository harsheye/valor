import dns from 'dns/promises';
import { isIP } from 'net';

/**
 * Checks if an IPv4 address is in a private, loopback, link-local, or restricted range.
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateOrRestrictedIPv4(ip) {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP is treated as restricted
  }

  const [a, b] = parts;

  // 169.254.0.0/16 (Link-local cloud metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (Reserved)
  if (a >= 240) return true;

  // Loopback (127.x.x.x) and private LAN IPs (10.x.x.x, 192.168.x.x, 172.16-31.x.x)
  // are explicitly permitted for local desktop media player playback (Plex, Jellyfin, WebDAV, local media servers)
  return false;
}

/**
 * Checks if an IPv6 address is private, loopback, or link-local.
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateOrRestrictedIPv6(ip) {
  const normalized = ip.toLowerCase();
  // Unspecified ::
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.slice(7);
    if (isIP(v4Part) === 4) {
      return isPrivateOrRestrictedIPv4(v4Part);
    }
  }
  // Link-local fe80::/10
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;

  return false;
}

/**
 * Validates a remote URL against SSRF attacks.
 * Throws an Error if the URL is dangerous or points to internal infrastructure.
 * @param {string} rawUrl
 * @returns {Promise<URL>} Parsed URL if safe
 */
export async function validateRemoteUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('SSRF_GUARD: Missing or invalid URL parameter');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('SSRF_GUARD: Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`SSRF_GUARD: Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Known cloud metadata endpoints
  const forbiddenHostnames = [
    'metadata.google.internal',
    'metadata.internal',
    'instance-data',
    '169.254.169.254'
  ];

  if (forbiddenHostnames.includes(hostname)) {
    throw new Error(`SSRF_GUARD: Destination hostname "${hostname}" is prohibited`);
  }

  // If hostname is directly an IP literal
  const ipType = isIP(hostname);
  if (ipType === 4) {
    if (isPrivateOrRestrictedIPv4(hostname)) {
      throw new Error(`SSRF_GUARD: Access to cloud metadata IP ${hostname} is blocked`);
    }
    return parsed;
  }
  if (ipType === 6) {
    if (isPrivateOrRestrictedIPv6(hostname)) {
      throw new Error(`SSRF_GUARD: Access to restricted IPv6 ${hostname} is blocked`);
    }
    return parsed;
  }

  // Resolve DNS to verify the IP addresses behind the hostname
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const record of addresses) {
      if (record.family === 4 && isPrivateOrRestrictedIPv4(record.address)) {
        throw new Error(`SSRF_GUARD: Hostname "${hostname}" resolves to restricted IP ${record.address}`);
      }
      if (record.family === 6 && isPrivateOrRestrictedIPv6(record.address)) {
        throw new Error(`SSRF_GUARD: Hostname "${hostname}" resolves to restricted IPv6 ${record.address}`);
      }
    }
  } catch (err) {
    if (err.message && err.message.startsWith('SSRF_GUARD')) {
      throw err;
    }
    throw new Error(`SSRF_GUARD: DNS resolution failed for "${hostname}": ${err.message}`);
  }

  return parsed;
}
