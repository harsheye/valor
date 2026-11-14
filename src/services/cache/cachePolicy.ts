/**
 * Cache Policy & Network / Hardware / Media Adaptive Tuning Service
 * 
 * Dynamically adjusts media player cache size, chunk sizes, and sliding buffer windows
 * based on:
 * - Media Resolution & Bitrate: 4K UHD, 1080p FHD, 720p HD, and HDR dynamic metadata
 * - Media Container / File Type: MKV (Matroska), MP4 / MOV (ISO BMFF), WebM, MPEG-TS, Audio-only (FLAC, MP3, WAV, etc.)
 * - Network type: Wi-Fi, Ethernet, Mobile / Cellular data
 * - Metered status: Data Saver / Metered network detection
 * - Device hardware: RAM (GB), CPU (logical cores), and platform (Desktop PC/Laptop vs iOS vs Android)
 * - Maximum ceiling cap: 128 MB for 4K on desktop, 64 MB baseline for 1080p
 */

export type NetworkConnectionType = 'wifi' | 'ethernet' | 'cellular' | 'bluetooth' | 'other' | 'unknown' | 'none';
export type DevicePlatformType = 'pc' | 'ios' | 'android' | 'other';
export type EffectiveConnectionType = '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
export type HardwareTier = 'high' | 'medium' | 'low';
export type MediaTier = '4k' | '1080p' | '720p' | 'standard';
export type ContainerFormat = 'mkv' | 'mp4' | 'webm' | 'ts' | 'mov' | 'avi' | 'audio' | 'unknown';

export interface NetworkProfile {
  type: NetworkConnectionType;
  isMetered: boolean;
  effectiveType: EffectiveConnectionType;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean;
}

export interface DeviceHardwareProfile {
  platform: DevicePlatformType;
  isMobile: boolean;
  cpuCores: number;
  ramGb: number | null;
  heapLimitMb: number | null;
  tier: HardwareTier;
  label: string;
}

export interface MediaProfile {
  is4K: boolean;
  is1080p: boolean;
  is720p: boolean;
  isHdr: boolean;
  isAudioOnly: boolean;
  container: ContainerFormat;
  width?: number;
  height?: number;
  bitrate?: number;
  codec?: string;
  mediaTier: MediaTier;
  label: string;
}

export interface CacheSettings {
  adaptiveCaching: boolean;
  networkPreference: 'auto' | 'wifi' | 'ethernet' | 'cellular' | 'metered';
  devicePreference: 'auto' | 'pc' | 'ios' | 'android';
  maxCacheCapMB: number; // Max ceiling: 128 MB for 4K, 64 MB baseline for 1080p
  cellularCacheCapMB: number;
  meteredCacheCapMB: number;
  lowHardwareCacheCapMB: number;
}

export const DEFAULT_CACHE_SETTINGS: CacheSettings = {
  adaptiveCaching: true,
  networkPreference: 'auto',
  devicePreference: 'auto',
  maxCacheCapMB: 64, // Baseline cap: 16 chunks * 4 MB = 64 MB (scales to 128 MB for 4K)
  cellularCacheCapMB: 16, // Conservative cap on cellular data: 8 chunks * 2 MB = 16 MB
  meteredCacheCapMB: 8, // Minimal cap on metered connections: 4 chunks * 2 MB = 8 MB
  lowHardwareCacheCapMB: 24, // Balanced cap on low RAM / CPU or mobile: 12 chunks * 2 MB = 24 MB
};

export interface ComputedCacheConfig {
  maxCapMb: number;
  maxCapBytes: number;
  chunkSizeMb: number;
  chunkSizeBytes: number;
  cacheLimit: number; // total number of chunks
  keepBehindSeconds: number; // audio / demux packet cache retention behind playhead
  keepAheadSeconds: number; // audio / demux packet cache lookahead ahead of playhead
  hlsBackBufferSeconds: number;
  hlsMaxBufferLength: number;
  lookbehindChunks: number; // byte-source sliding window chunks behind playhead
  lookaheadChunks: number; // byte-source sliding window chunks ahead of playhead
  isMetered: boolean;
  networkType: NetworkConnectionType;
  platform: DevicePlatformType;
  mediaProfile: MediaProfile;
  reason: string;
  hardwareSummary: string;
  networkSummary: string;
}

/**
 * Detect media characteristics (resolution, 4K UHD, HDR, container/file type, and bitrate)
 * to allow dynamic sliding buffer window adjustments.
 */
export function detectMediaProfile(media: any): MediaProfile {
  if (!media) {
    return {
      is4K: false,
      is1080p: false,
      is720p: false,
      isHdr: false,
      isAudioOnly: false,
      container: 'unknown',
      mediaTier: 'standard',
      label: 'Standard Definition / Auto'
    };
  }

  let width = 0;
  let height = 0;
  let bitrate = 0;
  let codec = '';
  let colorTransfer = '';

  const streams = media.streams || media.videoStreams || [];
  const vStream = streams.find((s: any) => s.type === 'video' || s.width || s.height) || streams[0];
  if (vStream) {
    width = vStream.width || 0;
    height = vStream.height || 0;
    bitrate = vStream.bitrate || 0;
    codec = (vStream.codec || vStream.codec_name || '').toLowerCase();
    colorTransfer = (vStream.color_transfer || vStream.colorSpace || '').toLowerCase();
  }

  if (!width && typeof media.width === 'number') width = media.width;
  if (!height && typeof media.height === 'number') height = media.height;
  if (!bitrate && typeof media.bitrate === 'number') bitrate = media.bitrate;

  const fileNameOrUrl = [
    media.fileName || '',
    media.name || '',
    media.title || '',
    media.url || ''
  ].join(' ').toLowerCase();

  const isAudioExt = /\.(mp3|flac|wav|m4a|aac|ogg|opus|alac|wma|aiff)(\?|$)/i.test(fileNameOrUrl);
  const isAudioOnly = Boolean(
    media.audioOnly ||
    isAudioExt ||
    (streams.length > 0 && streams.every((s: any) => s.type === 'audio'))
  );

  let container: ContainerFormat = 'unknown';
  if (isAudioOnly) {
    container = 'audio';
  } else if (/\.(mkv|mk3d|mka|mks)(\?|$)/i.test(fileNameOrUrl) || (media.containerType || '').toLowerCase().includes('mkv') || (media.format || '').toLowerCase().includes('matroska')) {
    container = 'mkv';
  } else if (/\.(mp4|m4v|mp4v)(\?|$)/i.test(fileNameOrUrl) || (media.containerType || '').toLowerCase().includes('mp4')) {
    container = 'mp4';
  } else if (/\.(mov|qt)(\?|$)/i.test(fileNameOrUrl) || (media.containerType || '').toLowerCase().includes('mov')) {
    container = 'mov';
  } else if (/\.(webm)(\?|$)/i.test(fileNameOrUrl) || (media.containerType || '').toLowerCase().includes('webm')) {
    container = 'webm';
  } else if (/\.(ts|m2ts|mts)(\?|$)/i.test(fileNameOrUrl) || (media.containerType || '').toLowerCase().includes('ts')) {
    container = 'ts';
  } else if (/\.(avi)(\?|$)/i.test(fileNameOrUrl)) {
    container = 'avi';
  }

  const textToScan = [
    fileNameOrUrl,
    codec
  ].join(' ').toLowerCase();

  const is4K = !isAudioOnly && (
    width >= 3840 || height >= 2160 ||
    /\b(4k|2160p|uhd|2160|uhd-4k|hdr10\+|hdr10p)\b/i.test(textToScan) ||
    bitrate >= 18_000_000
  );

  const is1080p = !isAudioOnly && !is4K && (
    width >= 1920 || height >= 1080 ||
    /\b(1080p|1080i|fhd)\b/i.test(textToScan) ||
    bitrate >= 6_000_000
  );

  const is720p = !isAudioOnly && !is4K && !is1080p && (
    width >= 1280 || height >= 720 ||
    /\b(720p|hd)\b/i.test(textToScan)
  );

  const isHdr = !isAudioOnly && (
    /\b(hdr|hdr10|hdr10\+|hdr10p|dovi|dv|dolby\s*vision|hlg)\b/i.test(textToScan) ||
    colorTransfer.includes('smpte2084') ||
    colorTransfer.includes('arib-std-b67')
  );

  const mediaTier: MediaTier = isAudioOnly ? 'standard' : (is4K ? '4k' : (is1080p ? '1080p' : (is720p ? '720p' : 'standard')));

  let label = 'Standard Definition';
  if (isAudioOnly) {
    label = `Audio Track (${codec ? codec.toUpperCase() : 'Audio'})`;
  } else if (is4K) {
    label = `4K UHD (2160p)${isHdr ? ' HDR' : ''} · ${container.toUpperCase()}`;
  } else if (is1080p) {
    label = `Full HD (1080p)${isHdr ? ' HDR' : ''} · ${container.toUpperCase()}`;
  } else if (is720p) {
    label = `HD (720p) · ${container.toUpperCase()}`;
  } else if (container !== 'unknown') {
    label = `Standard · ${container.toUpperCase()}`;
  }

  return {
    is4K,
    is1080p,
    is720p,
    isHdr,
    isAudioOnly,
    container,
    width,
    height,
    bitrate,
    codec,
    mediaTier,
    label
  };
}

/**
 * Detect current network connectivity and metered state
 */
export function getNetworkProfile(): NetworkProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      type: 'wifi',
      isMetered: false,
      effectiveType: '4g',
      downlinkMbps: null,
      rttMs: null,
      saveData: false,
    };
  }

  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

  let rawType: string = (conn?.type || '').toLowerCase();
  let effectiveType: EffectiveConnectionType = (conn?.effectiveType || 'unknown').toLowerCase() as EffectiveConnectionType;
  const saveData: boolean = Boolean(conn?.saveData);
  const downlinkMbps: number | null = typeof conn?.downlink === 'number' ? conn.downlink : null;
  const rttMs: number | null = typeof conn?.rtt === 'number' ? conn.rtt : null;

  let type: NetworkConnectionType = 'unknown';

  if (rawType === 'wifi') {
    type = 'wifi';
  } else if (rawType === 'ethernet') {
    type = 'ethernet';
  } else if (rawType === 'cellular') {
    type = 'cellular';
  } else if (rawType === 'bluetooth') {
    type = 'bluetooth';
  } else if (rawType === 'none') {
    type = 'none';
  } else if (rawType) {
    type = 'other';
  } else {
    // If connection.type is not directly reported by browser:
    // Heuristic: On mobile browser or cellular effective type with low downlink
    const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (saveData) {
      type = 'cellular';
    } else if (isMobileUA && (effectiveType === '3g' || effectiveType === '2g' || effectiveType === 'slow-2g')) {
      type = 'cellular';
    } else if (!isMobileUA) {
      // Desktop PC or Laptop without cellular card is Wi-Fi or Ethernet
      type = 'wifi';
    } else {
      type = 'wifi';
    }
  }

  const isMetered = saveData || type === 'cellular' || effectiveType === '2g' || effectiveType === 'slow-2g';

  return {
    type,
    isMetered,
    effectiveType,
    downlinkMbps,
    rttMs,
    saveData,
  };
}

/**
 * Detect device hardware specifications: RAM, CPU cores, and OS platform
 */
export function getHardwareProfile(): DeviceHardwareProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      platform: 'pc',
      isMobile: false,
      cpuCores: 4,
      ramGb: 8,
      heapLimitMb: null,
      tier: 'high',
      label: 'Desktop PC / Laptop',
    };
  }

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || (navigator as any).userAgentData?.mobile;

  let platform: DevicePlatformType = 'pc';
  let label = 'Desktop PC / Laptop';

  if (isIOS) {
    platform = 'ios';
    label = /iPad/.test(ua) ? 'Apple iPad' : 'Apple iPhone / iOS';
  } else if (isAndroid) {
    platform = 'android';
    label = 'Android Device';
  } else {
    if (/Windows/i.test(ua)) {
      label = 'Windows PC / Laptop';
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      label = 'macOS Desktop / Laptop';
    } else if (/Linux/i.test(ua)) {
      label = 'Linux PC / Laptop';
    }
  }

  const cpuCores = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency > 0
    ? navigator.hardwareConcurrency
    : 4;

  const ramGb: number | null = typeof (navigator as any).deviceMemory === 'number'
    ? (navigator as any).deviceMemory
    : null;

  let heapLimitMb: number | null = null;
  if (typeof performance !== 'undefined' && (performance as any).memory?.jsHeapSizeLimit) {
    heapLimitMb = Math.round((performance as any).memory.jsHeapSizeLimit / (1024 * 1024));
  }

  let tier: HardwareTier = 'high';
  if (isMobile) {
    if (ramGb !== null && ramGb <= 3) {
      tier = 'low';
    } else if (cpuCores <= 4 && (ramGb === null || ramGb <= 4)) {
      tier = 'low';
    } else if (cpuCores >= 6 && (ramGb === null || ramGb >= 6)) {
      tier = 'medium';
    } else {
      tier = 'medium';
    }
  } else {
    if (cpuCores <= 2 || (ramGb !== null && ramGb <= 2)) {
      tier = 'low';
    } else if (cpuCores <= 4 || (ramGb !== null && ramGb <= 4)) {
      tier = 'medium';
    } else {
      tier = 'high';
    }
  }

  return {
    platform,
    isMobile,
    cpuCores,
    ramGb,
    heapLimitMb,
    tier,
    label,
  };
}

/**
 * Subscribe to live network condition changes (WiFi <-> Cellular, Metered / Data Saver, Online/Offline)
 */
export function subscribeNetworkChanges(callback: (profile: NetworkProfile) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleUpdate = () => {
    callback(getNetworkProfile());
  };

  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

  if (conn && typeof conn.addEventListener === 'function') {
    conn.addEventListener('change', handleUpdate);
  }

  window.addEventListener('online', handleUpdate);
  window.addEventListener('offline', handleUpdate);

  return () => {
    if (conn && typeof conn.removeEventListener === 'function') {
      conn.removeEventListener('change', handleUpdate);
    }
    window.removeEventListener('online', handleUpdate);
    window.removeEventListener('offline', handleUpdate);
  };
}

/**
 * Computes the optimal cache configuration according to media profile (4K / 1080p, Container/File Type),
 * network connectivity, metered connection status, hardware metrics (RAM & CPU), and device platform.
 * 
 * Automatically expands sliding windows for 4K UHD and Matroska content (up to 128 MB cache cap,
 * 8 MB chunk slices, 180s lookahead) while guarding mobile/metered constraints, and scales
 * lean, extended lookahead windows for audio-only media.
 */
export function getEffectiveCacheConfig(
  userSettings?: Partial<CacheSettings>,
  networkOverrideProfile?: NetworkProfile,
  mediaOverrideProfile?: MediaProfile | any
): ComputedCacheConfig {
  const settings: CacheSettings = {
    ...DEFAULT_CACHE_SETTINGS,
    ...(userSettings || {}),
  };

  const detectedNetwork = networkOverrideProfile || getNetworkProfile();
  const hardware = getHardwareProfile();
  const media = mediaOverrideProfile?.mediaTier ? (mediaOverrideProfile as MediaProfile) : detectMediaProfile(mediaOverrideProfile);

  // Resolve effective network type & metered status based on user preference or detection
  let effectiveNetType: NetworkConnectionType = detectedNetwork.type;
  let effectiveMetered = detectedNetwork.isMetered;

  if (settings.networkPreference === 'wifi') {
    effectiveNetType = 'wifi';
    effectiveMetered = false;
  } else if (settings.networkPreference === 'ethernet') {
    effectiveNetType = 'ethernet';
    effectiveMetered = false;
  } else if (settings.networkPreference === 'cellular') {
    effectiveNetType = 'cellular';
    effectiveMetered = true;
  } else if (settings.networkPreference === 'metered') {
    effectiveMetered = true;
  }

  // Resolve effective device platform based on user preference or detection
  let effectivePlatform: DevicePlatformType = hardware.platform;
  if (settings.devicePreference === 'pc') {
    effectivePlatform = 'pc';
  } else if (settings.devicePreference === 'ios') {
    effectivePlatform = 'ios';
  } else if (settings.devicePreference === 'android') {
    effectivePlatform = 'android';
  }

  const isMobileDevice = effectivePlatform === 'ios' || effectivePlatform === 'android';

  // Absolute ceiling: 128 MB for 4K media on desktop, 64 MB for 1080p/standard, 16 MB for audio
  const absoluteMaxCeilingMB = media.isAudioOnly ? 16 : (media.is4K && !isMobileDevice && !effectiveMetered ? 128 : 64);
  const baseConfiguredMax = settings.maxCacheCapMB || 64;
  const configuredMaxCap = media.isAudioOnly
    ? 16
    : (media.is4K && !isMobileDevice && !effectiveMetered
      ? Math.max(baseConfiguredMax, 128)
      : Math.min(64, Math.max(8, baseConfiguredMax)));

  let targetCapMb: number = configuredMaxCap;
  let chunkSizeMb = media.isAudioOnly ? 1 : (media.is4K ? 8 : 4);
  let keepBehindSec = media.isAudioOnly ? 60 : (media.is4K ? 45 : 30);
  let keepAheadSec = media.isAudioOnly ? 300 : (media.is4K ? 180 : 120);
  let hlsBackBuffer = media.isAudioOnly ? 30 : (media.is4K ? 45 : 60);
  let hlsMaxBuffer = media.isAudioOnly ? 120 : (media.is4K ? 90 : 60);
  let lookbehindChunks = media.isAudioOnly ? 4 : (media.is4K ? 4 : 3);
  let lookaheadChunks = media.isAudioOnly ? 16 : (media.is4K ? 16 : 10);
  let reason = `High-speed Wi-Fi / Ethernet on PC with ample hardware: Full cache cap (${targetCapMb} MB)`;

  if (!settings.adaptiveCaching) {
    // Non-adaptive: use user configured max cap
    targetCapMb = configuredMaxCap;
    chunkSizeMb = media.isAudioOnly ? 1 : (media.is4K ? 8 : 4);
    keepBehindSec = media.isAudioOnly ? 60 : (media.is4K ? 45 : 30);
    keepAheadSec = media.isAudioOnly ? 300 : (media.is4K ? 180 : 120);
    hlsBackBuffer = 60;
    hlsMaxBuffer = media.is4K ? 90 : 60;
    lookbehindChunks = media.is4K ? 4 : 3;
    lookaheadChunks = media.is4K ? 16 : 10;
    reason = `Manual cache mode: Operating at fixed ${targetCapMb} MB cap (Adaptive tuning disabled)`;
  } else if (media.isAudioOnly) {
    // Priority 0: Audio-Only Media (FLAC, MP3, WAV, etc.)
    targetCapMb = effectiveMetered ? 8 : 16;
    chunkSizeMb = 1;
    keepBehindSec = 60; // 1 min rewind
    keepAheadSec = effectiveMetered ? 120 : 300; // 5 min lookahead on unmetered
    hlsBackBuffer = 30;
    hlsMaxBuffer = 120;
    lookbehindChunks = 4;
    lookaheadChunks = 16;
    reason = `Audio-only stream (${media.label}): Lightweight ${targetCapMb} MB cap with 1 MB chunks provides extensive 300s lookahead buffer with minimal memory footprint.`;
  } else if (effectiveMetered) {
    // Priority 1: Metered / Data Saver / Constrained connection
    targetCapMb = Math.min(settings.meteredCacheCapMB || 8, configuredMaxCap);
    chunkSizeMb = 2;
    keepBehindSec = 5;
    keepAheadSec = 20;
    hlsBackBuffer = 10;
    hlsMaxBuffer = 15;
    lookbehindChunks = 2;
    lookaheadChunks = 4;
    reason = `Metered connection / Data Saver active (${media.label}): Scaled down to ${targetCapMb} MB to prevent data usage & overage charges.`;
  } else if (effectiveNetType === 'cellular') {
    // Priority 2: Mobile / Cellular Data
    targetCapMb = Math.min(settings.cellularCacheCapMB || 16, configuredMaxCap);
    chunkSizeMb = 2;
    keepBehindSec = 10;
    keepAheadSec = media.is4K ? 40 : 30;
    hlsBackBuffer = 15;
    hlsMaxBuffer = 30;
    lookbehindChunks = 2;
    lookaheadChunks = 6;
    reason = `Mobile cellular data detected (${media.label}): Scaled down to ${targetCapMb} MB (2 MB chunks) to conserve mobile data.`;
  } else if (isMobileDevice) {
    // Priority 3: Mobile platform (iOS or Android) on Wi-Fi
    if (hardware.tier === 'low') {
      targetCapMb = Math.min(settings.lowHardwareCacheCapMB || 16, 24);
      chunkSizeMb = 2;
      keepBehindSec = 10;
      keepAheadSec = 30;
      hlsBackBuffer = 15;
      hlsMaxBuffer = 30;
      lookbehindChunks = 2;
      lookaheadChunks = 6;
      reason = `${effectivePlatform === 'ios' ? 'iOS' : 'Android'} mobile device (low memory tier): Scaled to ${targetCapMb} MB to protect tab stability.`;
    } else {
      targetCapMb = media.is4K ? 48 : Math.min(32, configuredMaxCap);
      chunkSizeMb = media.is4K ? 4 : 2;
      keepBehindSec = media.is4K ? 25 : 15;
      keepAheadSec = media.is4K ? 90 : 60;
      hlsBackBuffer = 30;
      hlsMaxBuffer = media.is4K ? 60 : 45;
      lookbehindChunks = 3;
      lookaheadChunks = media.is4K ? 10 : 8;
      reason = `${effectivePlatform === 'ios' ? 'iOS' : 'Android'} mobile device on Wi-Fi (${media.label}): Balanced ${targetCapMb} MB cap for smooth playback without battery or memory drain.`;
    }
  } else if (hardware.tier === 'low' || (hardware.ramGb !== null && hardware.ramGb <= 4) || hardware.cpuCores <= 2) {
    // Priority 4: Desktop PC / Laptop with limited hardware specs
    targetCapMb = Math.min(settings.lowHardwareCacheCapMB || 24, 32);
    chunkSizeMb = 2;
    keepBehindSec = 15;
    keepAheadSec = 60;
    hlsBackBuffer = 20;
    hlsMaxBuffer = 30;
    lookbehindChunks = 2;
    lookaheadChunks = 8;
    reason = `Desktop PC / Laptop with constrained hardware (${hardware.cpuCores} cores, ${hardware.ramGb ? `~${hardware.ramGb} GB RAM` : 'low tier'}): Scaled to ${targetCapMb} MB to avoid memory pressure.`;
  } else if (media.is4K) {
    // Priority 5: 4K UHD Media on Full Desktop PC / Laptop on high-speed Wi-Fi or Ethernet
    targetCapMb = 128; // High-throughput 128 MB cache cap for 4K
    chunkSizeMb = 8; // 8 MB chunks = 16 chunks total
    keepBehindSec = 45;
    keepAheadSec = 180;
    hlsBackBuffer = 45;
    hlsMaxBuffer = 90;
    lookbehindChunks = 4;
    lookaheadChunks = 16;
    if (media.container === 'mkv') {
      reason = `Identified 4K Matroska (MKV) media: Slid buffer window to high-throughput profile (128 MB cap, 8 MB chunks, 180s lookahead) to buffer large MKV cluster blocks seamlessly.`;
    } else if (media.container === 'ts') {
      reason = `Identified 4K MPEG Transport Stream (TS): High-throughput 128 MB buffer window with 180s lookahead to absorb packet burst variations.`;
    } else {
      reason = `Identified ${media.label} media: Slid buffer window to high-throughput profile (128 MB cap, 8 MB chunks, 180s lookahead) for uninterrupted 4K playback.`;
    }
  } else if (media.container === 'ts') {
    // Priority 6: MPEG-TS Container (Requires wider forward window to absorb PTS jitter)
    targetCapMb = 64;
    chunkSizeMb = 4;
    keepBehindSec = 30;
    keepAheadSec = 150;
    hlsBackBuffer = 60;
    hlsMaxBuffer = 75;
    lookbehindChunks = 3;
    lookaheadChunks = 14;
    reason = `Identified MPEG Transport Stream (TS): Expanded forward buffer (150s) to absorb stream synchronization and timestamp variations.`;
  } else if (media.is1080p) {
    // Priority 7: 1080p Full HD on Full Desktop PC
    targetCapMb = 64;
    chunkSizeMb = 4;
    keepBehindSec = 30;
    keepAheadSec = 120;
    hlsBackBuffer = 60;
    hlsMaxBuffer = 60;
    lookbehindChunks = 3;
    lookaheadChunks = 12;
    reason = `Identified ${media.label} media: Standard Full HD profile (64 MB cap, 4 MB chunks, 120s lookahead).`;
  } else {
    // Priority 8: Standard Definition / Auto on Full desktop PC
    targetCapMb = configuredMaxCap;
    chunkSizeMb = 4;
    keepBehindSec = 30;
    keepAheadSec = 120;
    hlsBackBuffer = 60;
    hlsMaxBuffer = 60;
    lookbehindChunks = 3;
    lookaheadChunks = 10;
    reason = `Desktop PC / Laptop on high-speed ${effectiveNetType === 'ethernet' ? 'Ethernet' : 'Wi-Fi'} (${hardware.cpuCores} cores, ${hardware.ramGb ? `~${hardware.ramGb} GB RAM` : 'ample RAM'}): Cache cap (${targetCapMb} MB).`;
  }

  // Ensure integers and valid chunk division
  targetCapMb = Math.max(4, Math.min(absoluteMaxCeilingMB, targetCapMb));
  if (chunkSizeMb > targetCapMb) {
    chunkSizeMb = targetCapMb;
  }
  const chunkSizeBytes = chunkSizeMb * 1024 * 1024;
  const maxCapBytes = targetCapMb * 1024 * 1024;
  const cacheLimit = Math.max(2, Math.floor(maxCapBytes / chunkSizeBytes));

  const networkSummary = `${effectiveNetType.toUpperCase()} ${effectiveMetered ? '· Metered / Data Saver' : '· Unmetered'}${detectedNetwork.effectiveType !== 'unknown' ? ` (${detectedNetwork.effectiveType.toUpperCase()})` : ''}`;
  const hardwareSummary = `${hardware.label} · ${hardware.cpuCores} Cores · ${hardware.ramGb ? `~${hardware.ramGb} GB RAM` : 'System RAM'}`;

  return {
    maxCapMb: targetCapMb,
    maxCapBytes,
    chunkSizeMb,
    chunkSizeBytes,
    cacheLimit,
    keepBehindSeconds: keepBehindSec,
    keepAheadSeconds: keepAheadSec,
    hlsBackBufferSeconds: hlsBackBuffer,
    hlsMaxBufferLength: hlsMaxBuffer,
    lookbehindChunks,
    lookaheadChunks,
    isMetered: effectiveMetered,
    networkType: effectiveNetType,
    platform: effectivePlatform,
    mediaProfile: media,
    reason,
    hardwareSummary,
    networkSummary,
  };
}
