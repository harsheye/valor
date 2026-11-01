/**
 * Production-Safe Unified Logger for Valor
 *
 * Rules:
 * - Silent for debug/info/trace in production.
 * - Logs only sanitized errors in production (strips sensitive file paths, tokens, auth keys).
 * - Verbose logging available in development when DEBUG=true or valor_verbose_logs=true.
 */

const getGlobalProcess = () => {
  try {
    return (globalThis as any).process;
  } catch {
    return undefined;
  }
};

const proc = getGlobalProcess();

const isProd = typeof import.meta !== 'undefined' && import.meta.env
  ? Boolean(import.meta.env.PROD)
  : (proc?.env?.NODE_ENV === 'production');

const isDebug = !isProd && (
  (typeof window !== 'undefined' && (
    window.localStorage?.getItem('valor_verbose_logs') === 'true' ||
    window.localStorage?.getItem('DEBUG') === 'true'
  )) ||
  (proc && (
    proc.env?.DEBUG === 'true' ||
    proc.env?.VERBOSE === 'true'
  ))
);

/**
 * Sanitizes arguments to prevent leaking file paths, tokens, JWTs, or passwords.
 */
export function sanitizeLogData(arg: any): any {
  if (arg === null || arg === undefined) return arg;

  if (typeof arg === 'string') {
    return arg
      // Redact Bearer JWT tokens
      .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
      // Redact sensitive query parameters in URLs
      .replace(/([?&](?:api_key|token|auth|key|password|secret)=)[^&\s]+/gi, '$1[REDACTED]')
      // Redact Windows and Unix local file paths with user profiles
      .replace(/[A-Za-z]:\\[Users|Documents|Desktop][^\s"'<>]+/gi, '[LOCAL_FILE]')
      .replace(/\/Users\/[^\s"'<>]+/gi, '[LOCAL_FILE]')
      .replace(/\/home\/[^\s"'<>]+/gi, '[LOCAL_FILE]');
  }

  if (arg instanceof Error) {
    return {
      name: arg.name,
      message: sanitizeLogData(arg.message),
      // In production, omit stack traces that leak source paths
      ...(isProd ? {} : { stack: sanitizeLogData(arg.stack || '') })
    };
  }

  if (typeof arg === 'object') {
    try {
      const sanitizedObj: Record<string, any> = Array.isArray(arg) ? [] : {};
      for (const [key, val] of Object.entries(arg)) {
        if (/token|password|secret|apikey|authorization/i.test(key)) {
          sanitizedObj[key] = '[REDACTED]';
        } else if (typeof val === 'object' && val !== null) {
          sanitizedObj[key] = '[Object]';
        } else {
          sanitizedObj[key] = sanitizeLogData(val);
        }
      }
      return sanitizedObj;
    } catch {
      return '[Unserializable]';
    }
  }

  return arg;
}

const styles = {
  playback: 'background: #6d28d9; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  buffer: 'background: #0f766e; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  scheduler: 'background: #0369a1; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  player: 'background: #3949ab; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  ffmpeg: 'background: #2e7d32; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  ffmpegWarning: 'background: #e65100; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  ffmpegError: 'background: #b71c1c; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  ffmpegMap: 'background: #1565c0; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  remote: 'background: #00838f; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  app: 'background: #37474f; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
  success: 'background: #15803d; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
};

export const logger = {
  isProd,
  isDebug,

  playback(message: string, ...args: any[]) {
    if (isDebug) console.log(`%c PLAYBACK %c ${message}`, styles.playback, 'color: #a78bfa; font-weight: 500;', ...args.map(sanitizeLogData));
  },
  buffer(message: string, ...args: any[]) {
    if (isDebug) console.log(`%c BUFFER   %c ${message}`, styles.buffer, 'color: #5eead4; font-weight: 500;', ...args.map(sanitizeLogData));
  },
  scheduler(message: string, ...args: any[]) {
    if (isDebug) console.log(`%c SCHED    %c ${message}`, styles.scheduler, 'color: #7dd3fc; font-weight: 500;', ...args.map(sanitizeLogData));
  },
  player(message: string, ...args: any[]) {
    if (isDebug) console.log(`%c PLAYER %c ${message}`, styles.player, 'color: #7986cb; font-weight: 500;', ...args.map(sanitizeLogData));
  },
  ffmpeg(message: string, ...args: any[]) {
    if (isDebug) console.log(`%c FFMPEG %c ${message}`, styles.ffmpeg, 'color: #81c784;', ...args.map(sanitizeLogData));
  },
  ffmpegWarning(message: string, ...args: any[]) {
    if (!isProd) console.warn(`%c FF WARN %c ${message}`, styles.ffmpegWarning, 'color: #ffb74d; font-weight: 500;', ...args.map(sanitizeLogData));
  },
  ffmpegError(message: string, ...args: any[]) {
    console.error(`%c FF ERR  %c ${message}`, styles.ffmpegError, 'color: #e57373; font-weight: bold;', ...args.map(sanitizeLogData));
  },
  ffmpegMap(message: string, ...args: any[]) {
    if (isDebug) console.log(`%c FF MAP  %c ${message}`, styles.ffmpegMap, 'color: #64b5f6; font-weight: 500;', ...args.map(sanitizeLogData));
  },
  remote(message: string, ...args: any[]) {
    if (isDebug) console.log(`%c REMOTE  %c ${message}`, styles.remote, 'color: #4dd0e1;', ...args.map(sanitizeLogData));
  },
  app(message: string, ...args: any[]) {
    if (isDebug) console.log(`%c APP     %c ${message}`, styles.app, 'color: #90a4ae;', ...args.map(sanitizeLogData));
  },
  success(message: string, ...args: any[]) {
    if (isDebug) console.log(`%c SUCCESS %c ${message}`, styles.success, 'color: #4ade80;', ...args.map(sanitizeLogData));
  },
  debug(message: string, ...args: any[]) {
    if (isDebug) console.debug(`[DEBUG] ${message}`, ...args.map(sanitizeLogData));
  },
  info(message: string, ...args: any[]) {
    if (isDebug) console.info(`%cℹ %c${message}`, 'color: #0288d1; font-weight: bold;', 'color: #03a9f4;', ...args.map(sanitizeLogData));
  },
  warn(message: string, ...args: any[]) {
    if (!isProd) {
      console.warn(`%c⚠ %c${message}`, 'color: #f57c00; font-weight: bold;', 'color: #ffa726;', ...args.map(sanitizeLogData));
    }
  },
  error(message: string, ...args: any[]) {
    // Errors are logged in production too, but strictly sanitized
    console.error(`%c✖ %c${message}`, 'color: #d32f2f; font-weight: bold;', 'color: #ef5350; font-weight: 500;', ...args.map(sanitizeLogData));
  }
};
