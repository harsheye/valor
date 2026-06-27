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

const args = process.argv.slice(2).filter(arg => {
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

// HTTP Server configuration
const PORT = 5174;
const execDir = path.dirname(process.execPath);

const dataDir = path.join(process.cwd(), '.valor_data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const getJsonBody = (req) => new Promise((resolve) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try { resolve(JSON.parse(body)); }
    catch { resolve({}); }
  });
});

let distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  distDir = path.join(execDir, 'dist');
}
if (!fs.existsSync(distDir)) {
  distDir = path.join(process.cwd(), 'dist');
}

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
  '.wasm': 'application/wasm'
};

let lastHeartbeat = Date.now();

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Parse URL
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // 1. Heartbeat check
  if (pathname === '/api/heartbeat') {
    lastHeartbeat = Date.now();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
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

  // 2. Video streaming endpoint with range request support
  if (pathname === '/local-video-stream') {
    const videoPath = parsedUrl.searchParams.get('path');
    if (!videoPath || !fs.existsSync(videoPath)) {
      res.statusCode = 404;
      res.end('File not found');
      return;
    }

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
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': fileSize });
      const file = fs.createReadStream(videoPath);
      file.on('error', (err) => {
        console.error('[Server Stream Error]', err.message);
      });
      res.on('error', (err) => {
        console.error('[Server Response Error]', err.message);
      });
      file.pipe(res);
    }
    return;
  }

  // 3. Serve static web files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(distDir, safePath);

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch (e) {
    // If not found, default to index.html (supports SPA router)
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

// Auto-shutdown if no active tabs
const startShutdownChecker = () => {
  setInterval(() => {
    if (Date.now() - lastHeartbeat > 8000) {
      console.log('[Server] No active tabs detected. Shutting down...');
      server.close(() => {
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 1000);
    }
  }, 2000);
};

// Start the server
server.listen(PORT, () => {
  console.log(`[Server] Valor production server is running on http://localhost:${PORT}`);
  
  const openUrl = resolvedFilePath 
    ? `http://localhost:${PORT}?file=${encodeURIComponent(resolvedFilePath)}`
    : `http://localhost:${PORT}`;
    
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
