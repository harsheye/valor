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

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 169.254.0.0/16 (Link-local / AWS/GCP/Azure cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0) return true;
  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (Reserved)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address is private, loopback, or link-local.
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateOrRestrictedIPv6(ip) {
  const normalized = ip.toLowerCase();
  // Loopback ::1
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
  // Unspecified ::
  if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;
  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.slice(7);
    if (isIP(v4Part) === 4) {
      return isPrivateOrRestrictedIPv4(v4Part);
    }
  }
  // Unique local addresses fc00::/7 (fc00... or fd00...)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
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

  // Known metadata hostnames
  const forbiddenHostnames = [
    'localhost',
    'metadata.google.internal',
    'metadata.internal',
    'instance-data',
    '169.254.169.254'
  ];

  if (forbiddenHostnames.includes(hostname) || hostname.endsWith('.localhost')) {
    throw new Error(`SSRF_GUARD: Destination hostname "${hostname}" is prohibited`);
  }

  // If hostname is directly an IP literal
  const ipType = isIP(hostname);
  if (ipType === 4) {
    if (isPrivateOrRestrictedIPv4(hostname)) {
      throw new Error(`SSRF_GUARD: Access to private/loopback IP ${hostname} is blocked`);
    }
    return parsed;
  }
  if (ipType === 6) {
    if (isPrivateOrRestrictedIPv6(hostname)) {
      throw new Error(`SSRF_GUARD: Access to private/loopback IPv6 ${hostname} is blocked`);
    }
    return parsed;
  }

  // Resolve DNS to verify the IP addresses behind the hostname
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const record of addresses) {
      if (record.family === 4 && isPrivateOrRestrictedIPv4(record.address)) {
        throw new Error(`SSRF_GUARD: Hostname "${hostname}" resolves to private IP ${record.address}`);
      }
      if (record.family === 6 && isPrivateOrRestrictedIPv6(record.address)) {
        throw new Error(`SSRF_GUARD: Hostname "${hostname}" resolves to private IPv6 ${record.address}`);
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
