import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

process.on('uncaughtException', (err) => {
  console.error('[Server Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server Unhandled Rejection]', reason);
});

const args = process.argv.slice(1).filter(arg => {
  const lower = arg.toLowerCase();
  return !lower.endsWith('node.exe') && !lower.endsWith('node') && !lower.endsWith('start-app.js') && !lower.endsWith('start-app.exe') && !lower.endsWith('start-app-exe');
});

const playWithVlc = args.includes('--vlc');
const filePath = args.find(arg => arg !== '--vlc' && !arg.startsWith('--'));
const resolvedFilePath = filePath ? path.resolve(filePath) : null;

if (playWithVlc && resolvedFilePath) {
  const vlcPaths = [
    'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
    'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
    'vlc'
  ];
  let selectedPath = 'vlc';
  for (const p of vlcPaths) {
    if (p === 'vlc' || fs.existsSync(p)) {
      selectedPath = p;
      if (p !== 'vlc') break;
    }
  }
  console.log(`[VLC] Launching VLC to play: ${resolvedFilePath}`);
  const child = spawn(selectedPath, [resolvedFilePath], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  process.exit(0);
}

async function start() {
  const server = await createServer({
    server: {
      port: 5174,
      open: resolvedFilePath ? `?file=${encodeURIComponent(resolvedFilePath)}` : true,
    },
  });

  // Local file streaming middleware
  server.middlewares.use('/local-video-stream', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const videoPath = url.searchParams.get('path');
    if (!videoPath || !fs.existsSync(videoPath)) {
      res.statusCode = 404;
      res.end('File not found');
      return;
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      file.on('error', (err) => {
        console.error('[Server Stream Error]', err.message);
      });
      res.on('error', (err) => {
        console.error('[Server Response Error]', err.message);
      });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      const file = fs.createReadStream(videoPath);
      file.on('error', (err) => {
        console.error('[Server Stream Error]', err.message);
      });
      res.on('error', (err) => {
        console.error('[Server Response Error]', err.message);
      });
      file.pipe(res);
    }
  });

  await server.listen();
  console.log('[Server] Valor dev server is running on http://localhost:5174');

  let activeConnections = 0;
  let shutdownTimeout = null;

  // Shutdown timer helper
  const startShutdownTimer = (delay = 5000, reason = 'No active tabs') => {
    if (shutdownTimeout) clearTimeout(shutdownTimeout);
    shutdownTimeout = setTimeout(async () => {
      console.log(`[Server] Shutting down server: ${reason}`);
      try {
        await server.close();
      } catch (e) {
        console.error('[Server] Error closing server:', e);
      }
      process.exit(0);
    }, delay);
  };

  // Start initial timer in case the browser doesn't open or connect at all
  startShutdownTimer(15000, 'Initial startup timeout (no tab connected)');

  // Track WebSocket connections from Vite clients
  server.ws.on('connection', (socket) => {
    activeConnections++;
    console.log(`[Server] Browser tab connected. Active tabs: ${activeConnections}`);
    
    if (shutdownTimeout) {
      clearTimeout(shutdownTimeout);
      shutdownTimeout = null;
      console.log('[Server] Shutdown cancelled: Tab re-connected.');
    }

    socket.on('close', () => {
      activeConnections = Math.max(0, activeConnections - 1);
      console.log(`[Server] Browser tab disconnected. Active tabs: ${activeConnections}`);
      
      if (activeConnections === 0) {
        startShutdownTimer(5000, 'All tabs closed');
      }
    });

    socket.on('error', () => {
      // Swallow error to prevent crashes; 'close' event will clean it up
    });
  });
}

start().catch((err) => {
  console.error('[Server] Failed to start server:', err);
  process.exit(1);
});
