/**
 * Time formatting utilities for Valor UI.
 * Standardizes timecode displays, runtimes, and prevents centisecond flicker.
 */

/**
 * Parses duration from various inputs (seconds number, "01:46:32.19", "634.584", "10:35") to total seconds.
 */
export function parseDurationToSeconds(duration: string | number | undefined | null): number {
  if (duration === undefined || duration === null) return 0;
  if (typeof duration === 'number') {
    return isNaN(duration) || duration < 0 ? 0 : duration;
  }
  const clean = String(duration).trim();
  if (!clean || clean.toLowerCase() === 'unknown') return 0;

  // Single numeric string, e.g. "634.584"
  if (!clean.includes(':')) {
    const num = Number(clean);
    return isNaN(num) || num < 0 ? 0 : num;
  }

  // Timecode split e.g. "01:46:32.19" or "10:35"
  const parts = clean.split(':').map(Number);
  if (parts.some(isNaN)) return 0;

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Formats timecode rounded to nearest second: "2:12", "1:39:37", "2:00:57".
 * Never outputs centiseconds.
 */
export function formatTimecode(secs: number | string | undefined | null): string {
  const num = typeof secs === 'number' ? secs : parseDurationToSeconds(secs);
  if (isNaN(num) || num <= 0) return '0:00';
  const rounded = Math.round(num);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = Math.floor(rounded % 60);
  const sStr = s.toString().padStart(2, '0');

  if (h > 0) {
    const mStr = m.toString().padStart(2, '0');
    return `${h}:${mStr}:${sStr}`;
  }
  return `${m}:${sStr}`;
}

/**
 * Formats runtime to human-readable string rounded to nearest minute:
 * "1h 47m", "47m", "2h".
 */
export function formatRuntime(secs: number | string | undefined | null): string {
  const totalSecs = typeof secs === 'number' ? secs : parseDurationToSeconds(secs);
  if (isNaN(totalSecs) || totalSecs <= 0) return '';
  const totalMins = Math.round(totalSecs / 60);
  if (totalMins <= 0) return '1m';

  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;

  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0 && m === 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Formats full H:MM:SS string for tooltips.
 */
export function formatFullTimecode(secs: number | string | undefined | null): string {
  const totalSecs = typeof secs === 'number' ? secs : parseDurationToSeconds(secs);
  if (isNaN(totalSecs) || totalSecs <= 0) return '0:00:00';
  const rounded = Math.round(totalSecs);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = Math.floor(rounded % 60);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
