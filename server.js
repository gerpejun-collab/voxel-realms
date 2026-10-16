// server.js
// Production-ready Express + WebSocket server for Voxel Realms

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./server/rooms');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = '0.0.0.0';
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS, 10) || 30;
const WORLD_SEED = parseInt(process.env.WORLD_SEED, 10) || 48151623;

const app = express();
const server = http.createServer(app);

// Initialize Room Manager
const roomManager = new RoomManager({
  maxPlayers: MAX_PLAYERS,
  seed: WORLD_SEED
});

// Security & Caching middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Health check endpoint for Render monitoring
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// Public status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    onlinePlayers: roomManager.getTotalOnlineCount(),
    maxPlayers: roomManager.maxPlayers,
    seed: roomManager.defaultSeed
  });
});

// Serve frontend static files
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      // Don't cache dynamic application assets so updates apply immediately without hard refresh
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Setup WebSocket server sharing the same HTTP port
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  // Mark socket as alive for heartbeat
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  roomManager.handleConnection(ws);
});

// Heartbeat interval to detect terminated clients and keep Render connection active
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Start listening
server.listen(PORT, HOST, () => {
  console.log(`===============================================`);
  console.log(`   VOXEL REALMS - SERVER STARTED`);
  console.log(`   Port: ${PORT} | Host: ${HOST}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Max Players: ${MAX_PLAYERS} | World Seed: ${WORLD_SEED}`);
  console.log(`   Ready for browser & Render deployment`);
  console.log(`===============================================`);
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  clearInterval(heartbeatInterval);
  roomManager.destroy();

  wss.close(() => {
    server.close(() => {
      console.log('Server terminated cleanly.');
      process.exit(0);
    });
  });

  // Force close after 5s if hanging
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
