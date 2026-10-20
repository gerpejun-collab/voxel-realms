// server.js
// Production-ready Express + WebSocket server for Voxel Realms

const http = require('http');
const https = require('https');
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
  if (!req.path.startsWith('/api/dorama-proxy') && !req.path.startsWith('/_next')) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Proxy Next.js assets for dorama view
app.use('/_next', async (req, res) => {
  try {
    const upstreamUrl = 'https://doramasia.com/_next' + req.url;
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const cType = upstream.headers.get('content-type') || 'application/javascript';
    res.setHeader('Content-Type', cType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    const buf = await upstream.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(404).end();
  }
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

// Proxy for Doramasia to strip X-Frame-Options SAMEORIGIN, rewrite links, and block ad popups
app.get('/api/dorama-proxy', async (req, res) => {
  const targetUrl = req.query.url || 'https://doramasia.com/';
  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });

    const contentType = upstreamRes.headers.get('content-type') || 'text/html; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    if (contentType.includes('text/html')) {
      let html = await upstreamRes.text();

      const injection = `
        <style>
          #dorama-proxy-nav {
            position: sticky; top: 0; left: 0; right: 0; z-index: 999999;
            background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(8px);
            padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;
            border-bottom: 2px solid #38bdf8; font-family: system-ui, sans-serif;
          }
          #dorama-proxy-nav a {
            background: #0284c7; color: #fff; padding: 6px 12px; border-radius: 6px;
            font-size: 12px; font-weight: bold; text-decoration: none; border: none; cursor: pointer;
          }
        </style>
        <div id="dorama-proxy-nav">
          <span style="color:#38bdf8;font-weight:bold;font-size:12px;">📺 BÚNKER DORAMASIA PROXY</span>
          <div style="display:flex;gap:8px;">
            <a href="${targetUrl}" target="_blank" rel="noopener">🔗 Abrir en Pestaña Nueva</a>
          </div>
        </div>
        <script>
          // Block intrusive popup ads
          window.open = function() { console.log('Popup ad blocked'); return null; };
          document.addEventListener('click', function(e) {
            const a = e.target.closest('a');
            if (a && a.href) {
              const href = a.getAttribute('href');
              if (href && (href.startsWith('/') || href.startsWith('https://doramasia.com'))) {
                e.preventDefault();
                const fullUrl = href.startsWith('http') ? href : ('https://doramasia.com' + href);
                window.location.href = '/api/dorama-proxy?url=' + encodeURIComponent(fullUrl);
              }
            }
          }, true);
        </script>
      `;
      html = html.replace(/<body[^>]*>/i, '$&' + injection);
      res.send(html);
    } else {
      const buffer = await upstreamRes.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (err) {
    res.status(502).send('Error conectando con Doramasia: ' + err.message);
  }
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
