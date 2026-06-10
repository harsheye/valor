import { createServer } from 'vite';

async function start() {
  const server = await createServer({
    server: {
      port: 5174,
      open: true, // Vite will automatically launch the default browser
    },
  });

  await server.listen();
  console.log('[Server] Dracarys dev server is running on http://localhost:5174');

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
