const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

process.on('uncaughtException', (err) => {
  console.error('[Server Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server Unhandled Rejection]', reason);
});

const isSea = !process.argv[0].toLowerCase().endsWith('node.exe') && !process.argv[0].toLowerCase().endsWith('node');
const args = process.argv.slice(isSea ? 1 : 2).filter(arg => {
  const lower = arg.toLowerCase();
  return !lower.endsWith('node.exe') && !lower.endsWith('node') && !lower.endsWith('start-app.js') && !lower.endsWith('start-app.exe') && !lower.endsWith('start-app-exe');
});

const playWithVlc = args.includes('--vlc');
const filePath = args.find(arg => arg !== '--vlc' && !arg.startsWith('--'));
const resolvedFilePath = filePath ? path.resolve(filePath) : null;

// VLC fallback handler
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

const execDir = path.dirname(process.execPath);
let appDir = __dirname;
if (!fs.existsSync(path.join(appDir, 'dist'))) {
  appDir = execDir;
}
if (!fs.existsSync(path.join(appDir, 'dist'))) {
  appDir = process.cwd();
}
const dataDir = path.join(appDir, '.valor_data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Setup logging redirection to app.log
const logFilePath = path.join(dataDir, 'app.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  logStream.write(`[${new Date().toISOString()}] [INFO] ${msg}\n`);
  originalLog(...args);
};

console.error = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  logStream.write(`[${new Date().toISOString()}] [ERROR] ${msg}\n`);
  originalError(...args);
};

const PORT_SERVICE = 50000;
const PORT_BACKEND = 50001;

const getJsonBody = (req) => new Promise((resolve) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try { resolve(JSON.parse(body)); }
    catch { resolve({}); }
  });
});

let distDir = path.join(appDir, 'dist');

console.log(`[Server] Serving static files from: ${distDir}`);

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.vtt': 'text/vtt',
  '.srt': 'text/plain'
};

let lastHeartbeat = Date.now();
let hasReceivedFirstHeartbeat = false;
let activeConnections = 0;

// 1. Backend API Server (Port 50001)
const backendServer = http.createServer((req, res) => {
  // CORS and Security Headers for SharedArrayBuffer (ffmpeg.wasm support)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Parse URL
  const parsedUrl = new URL(req.url, `http://localhost:${PORT_BACKEND}`);
  const pathname = parsedUrl.pathname;

  // Heartbeat check
  if (pathname === '/api/heartbeat') {
    lastHeartbeat = Date.now();
    hasReceivedFirstHeartbeat = true;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Play command forward receiver
  if (pathname === '/api/play') {
    const file = parsedUrl.searchParams.get('file');
    const openUrl = file 
      ? `http://127.0.0.1:${PORT_SERVICE}/?file=${encodeURIComponent(file)}`
      : `http://127.0.0.1:${PORT_SERVICE}/`;
      
    console.log(`[Server] Received external play command. Opening browser: ${openUrl}`);
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', openUrl], { detached: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [openUrl], { detached: true }).unref();
    } else {
      spawn('xdg-open', [openUrl], { detached: true }).unref();
    }
    
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Browser remote logging API
  if (pathname === '/api/log') {
    getJsonBody(req).then(data => {
      const type = data.type || 'INFO';
      const msg = data.message || '';
      console.log(`[Browser ${type}] ${msg}`);
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  // Settings API
  if (pathname === '/api/settings') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    const settingsFile = path.join(dataDir, 'settings.json');
    if (req.method === 'POST') {
      getJsonBody(req).then(data => {
        fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
        res.end(JSON.stringify({ success: true }));
      });
    } else {
      if (fs.existsSync(settingsFile)) {
        res.end(fs.readFileSync(settingsFile));
      } else {
        res.end(JSON.stringify({}));
      }
    }
    return;
  }

  // History API
  if (pathname === '/api/history') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    const historyFile = path.join(dataDir, 'history.json');
    if (req.method === 'POST') {
      getJsonBody(req).then(data => {
        fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
        res.end(JSON.stringify({ success: true }));
      });
    } else {
      if (fs.existsSync(historyFile)) {
        res.end(fs.readFileSync(historyFile));
      } else {
        res.end(JSON.stringify([]));
      }
    }
    return;
  }

  // Video streaming endpoint with range request support
  if (pathname === '/local-video-stream') {
    const videoPath = parsedUrl.searchParams.get('path');
    if (!videoPath || !fs.existsSync(videoPath)) {
      res.statusCode = 404;
      res.end('File not found');
      return;
    }

    let connectionTracked = false;
    let fileStream = null;

    const trackStart = () => {
      if (!connectionTracked) {
        activeConnections++;
        connectionTracked = true;
        console.log(`[Server] Active video stream connection started. Total active: ${activeConnections}`);
      }
    };
    const trackEnd = () => {
      if (connectionTracked) {
        activeConnections = Math.max(0, activeConnections - 1);
        connectionTracked = false;
        console.log(`[Server] Active video stream connection ended. Total active: ${activeConnections}`);
      }
    };

    const cleanUp = () => {
      trackEnd();
      if (fileStream) {
        fileStream.destroy();
        fileStream = null;
      }
    };

    req.on('close', cleanUp);
    res.on('close', cleanUp);
    res.on('finish', cleanUp);

    trackStart();

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'video/mp4');

    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Length': fileSize });
      res.end();
      return;
    }

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      fileStream = fs.createReadStream(videoPath, { start, end });
      fileStream.on('error', (err) => {
        console.error('[Server Stream Error]', err.message);
      });
      res.on('error', (err) => {
        console.error('[Server Response Error]', err.message);
      });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunksize,
      };
      res.writeHead(206, head);
      fileStream.pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': fileSize });
      fileStream = fs.createReadStream(videoPath);
      fileStream.on('error', (err) => {
        console.error('[Server Stream Error]', err.message);
      });
      res.on('error', (err) => {
        console.error('[Server Response Error]', err.message);
      });
      fileStream.pipe(res);
    }
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

// 2. Service Static Server (Port 50000)
const serviceServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT_SERVICE}`);
  let pathname = parsedUrl.pathname;

  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(distDir, safePath);

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (e) {
    filePath = path.join(distDir, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      res.end('File not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.end(data);
  });
});

// Auto-shutdown if no active tabs (1-minute grace period under all conditions)
const startShutdownChecker = () => {
  setInterval(() => {
    if (activeConnections > 0) {
      lastHeartbeat = Date.now();
    }
    const limit = 60000; // 1 minute
    if (Date.now() - lastHeartbeat > limit) {
      console.log('[Server] No active tabs detected. Shutting down...');
      serviceServer.close();
      backendServer.close(() => {
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 1000);
    }
  }, 2000);
};

const attemptListen = () => {
  serviceServer.listen({ port: PORT_SERVICE, host: '127.0.0.1' }, () => {
    console.log(`[Server] Valor service server is running on http://127.0.0.1:${PORT_SERVICE}`);
    
    backendServer.listen({ port: PORT_BACKEND, host: '127.0.0.1' }, () => {
      console.log(`[Server] Valor backend server is running on http://127.0.0.1:${PORT_BACKEND}`);
      
      // Write active port to active_port.txt
      try {
        const activePortFile = path.join(dataDir, 'active_port.txt');
        fs.writeFileSync(activePortFile, String(PORT_SERVICE));
      } catch (e) {
        console.error('[Server] Failed to write active_port.txt:', e);
      }

      const openUrl = resolvedFilePath 
        ? `http://127.0.0.1:${PORT_SERVICE}/?file=${encodeURIComponent(resolvedFilePath)}`
        : `http://127.0.0.1:${PORT_SERVICE}/`;
        
      console.log(`[Server] Opening browser: ${openUrl}`);
      
      if (process.platform === 'win32') {
        spawn('cmd', ['/c', 'start', '', openUrl], { detached: true }).unref();
      } else if (process.platform === 'darwin') {
        spawn('open', [openUrl], { detached: true }).unref();
      } else {
        spawn('xdg-open', [openUrl], { detached: true }).unref();
      }

      startShutdownChecker();
    });
  });
};

serviceServer.on('error', (err) => {
  console.error('[Server Fatal Service Error]', err);
  process.exit(1);
});

backendServer.on('error', (err) => {
  console.error('[Server Fatal Backend Error]', err);
  process.exit(1);
});

// Startup check: reuse existing running server if present
let checkingExisting = false;
const activePortFile = path.join(dataDir, 'active_port.txt');
if (fs.existsSync(activePortFile)) {
  try {
    const savedPort = parseInt(fs.readFileSync(activePortFile, 'utf8').trim(), 10);
    if (savedPort && !isNaN(savedPort)) {
      checkingExisting = true;
      console.log(`[Server] Checking for running backend instance on port ${PORT_BACKEND}...`);
      
      const options = {
        host: '127.0.0.1',
        port: PORT_BACKEND,
        path: '/api/heartbeat',
        method: 'POST',
        timeout: 1000
      };
      
      const clientReq = http.request(options, (res) => {
        if (res.statusCode === 200) {
          console.log(`[Server] Found running instance on port ${PORT_BACKEND}. Forwarding play command...`);
          const playPath = resolvedFilePath 
            ? `/api/play?file=${encodeURIComponent(resolvedFilePath)}`
            : '/api/play';
            
          const playReq = http.request({
            host: '127.0.0.1',
            port: PORT_BACKEND,
            path: playPath,
            method: 'GET',
            timeout: 1000
          }, () => {
            console.log('[Server] Command successfully forwarded. Exiting.');
            process.exit(0);
          });
          playReq.on('error', () => {
            process.exit(0);
          });
          playReq.end();
        } else {
          attemptListen();
        }
      });
      
      clientReq.on('error', () => {
        attemptListen();
      });
      clientReq.on('timeout', () => {
        clientReq.destroy();
        attemptListen();
      });
      clientReq.end();
    }
  } catch (e) {
    console.error('[Server] Port check error:', e.message);
    attemptListen();
  }
} else {
  attemptListen();
}
