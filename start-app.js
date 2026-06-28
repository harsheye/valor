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
  let port = 5174;
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    port = parseInt(process.argv[portArgIdx + 1], 10);
  }

  let server;
  let success = false;
  
  while (!success && port < 6000) {
    try {
      server = await createServer({
        server: {
          port: port,
          host: '127.0.0.1',
          open: false,
        },
      });
      await server.listen();
      success = true;
    } catch (err) {
      if (err.code === 'EACCES' || err.code === 'EADDRINUSE') {
        console.log(`[Server] Port ${port} is unavailable (${err.code}). Trying next port...`);
        port++;
      } else {
        throw err;
      }
    }
  }

  if (!success) {
    console.error('[Server] Could not find any available port to bind.');
    process.exit(1);
  }

  const getJsonBody = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });

  const dataDir = path.join(process.cwd(), '.valor_data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Settings API
  server.middlewares.use('/api/settings', async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/' && url.pathname !== '') {
      return next();
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    const settingsFile = path.join(dataDir, 'settings.json');
    if (req.method === 'POST') {
      const data = await getJsonBody(req);
      fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
      res.end(JSON.stringify({ success: true }));
    } else {
      if (fs.existsSync(settingsFile)) {
        res.end(fs.readFileSync(settingsFile));
      } else {
        res.end(JSON.stringify({}));
      }
    }
  });

  // History API
  server.middlewares.use('/api/history', async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/' && url.pathname !== '') {
      return next();
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    const historyFile = path.join(dataDir, 'history.json');
    if (req.method === 'POST') {
      const data = await getJsonBody(req);
      fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
      res.end(JSON.stringify({ success: true }));
    } else {
      if (fs.existsSync(historyFile)) {
        res.end(fs.readFileSync(historyFile));
      } else {
        res.end(JSON.stringify([]));
      }
    }
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

  console.log(`[Server] Valor dev server is running on http://127.0.0.1:${port}`);

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
