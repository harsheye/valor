const isDev = import.meta.env?.DEV ?? true;

const styles = {
  player: 'background: #5c6bc0; color: #fff; padding: 2px 5px; border-radius: 3px; font-weight: bold; font-size: 10px;',
  ffmpeg: 'background: #2e7d32; color: #fff; padding: 2px 5px; border-radius: 3px; font-weight: bold; font-size: 10px;',
  ffmpegWarning: 'background: #f57c00; color: #fff; padding: 2px 5px; border-radius: 3px; font-weight: bold; font-size: 10px;',
  ffmpegError: 'background: #c62828; color: #fff; padding: 2px 5px; border-radius: 3px; font-weight: bold; font-size: 10px;',
  ffmpegMap: 'background: #1565c0; color: #fff; padding: 2px 5px; border-radius: 3px; font-weight: bold; font-size: 10px;',
  remote: 'background: #00838f; color: #fff; padding: 2px 5px; border-radius: 3px; font-weight: bold; font-size: 10px;',
  app: 'background: #455a64; color: #fff; padding: 2px 5px; border-radius: 3px; font-weight: bold; font-size: 10px;',
};

export const logger = {
  player(message: string, ...args: any[]) {
    if (isDev) {
      console.log(`%c PLAYER %c ${message}`, styles.player, 'color: #7986cb; font-weight: 500;', ...args);
    }
  },
  ffmpeg(message: string, ...args: any[]) {
    if (isDev) {
      console.log(`%c FFMPEG %c ${message}`, styles.ffmpeg, 'color: #81c784;', ...args);
    }
  },
  ffmpegWarning(message: string, ...args: any[]) {
    if (isDev) {
      console.log(`%c FF WARN %c ${message}`, styles.ffmpegWarning, 'color: #ffb74d; font-weight: 500;', ...args);
    }
  },
  ffmpegError(message: string, ...args: any[]) {
    console.log(`%c FF ERR  %c ${message}`, styles.ffmpegError, 'color: #e57373; font-weight: bold;', ...args);
  },
  ffmpegMap(message: string, ...args: any[]) {
    if (isDev) {
      console.log(`%c FF MAP  %c ${message}`, styles.ffmpegMap, 'color: #64b5f6; font-weight: 500;', ...args);
    }
  },
  remote(message: string, ...args: any[]) {
    if (isDev) {
      console.log(`%c REMOTE  %c ${message}`, styles.remote, 'color: #4dd0e1;', ...args);
    }
  },
  app(message: string, ...args: any[]) {
    if (isDev) {
      console.log(`%c APP     %c ${message}`, styles.app, 'color: #90a4ae;', ...args);
    }
  },
  info(message: string, ...args: any[]) {
    if (isDev) {
      console.log(`%cℹ %c${message}`, 'color: #0288d1; font-weight: bold;', 'color: #03a9f4;', ...args);
    }
  },
  success(message: string, ...args: any[]) {
    if (isDev) {
      console.log(`%c✔ %c${message}`, 'color: #2e7d32; font-weight: bold;', 'color: #4caf50; font-weight: 500;', ...args);
    }
  },
  warn(message: string, ...args: any[]) {
    console.warn(`%c⚠ %c${message}`, 'color: #f57c00; font-weight: bold;', 'color: #ffa726;', ...args);
  },
  error(message: string, ...args: any[]) {
    console.error(`%c✖ %c${message}`, 'color: #d32f2f; font-weight: bold;', 'color: #ef5350; font-weight: 500;', ...args);
  }
};
