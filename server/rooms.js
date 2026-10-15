// server/rooms.js
// Room manager and message dispatcher for multiplayer sessions

const { MSG, sanitizeName, sanitizeChat, isValidBlockModify, isValidMove } = require('./protocol');
const { GameState } = require('./game-state');

class RoomManager {
  constructor(options = {}) {
    this.maxPlayers = Number(options.maxPlayers) || 12;
    this.defaultSeed = Number(options.seed) || 48151623;
    this.rooms = new Map(); // roomId -> { gameState, clients: Map<ws, playerId> }
    this.socketMeta = new Map(); // ws -> { id, roomId, lastMsgTime, msgCount }

    // Start tick loop for movement broadcasts (20 updates/second)
    this.tickInterval = setInterval(() => this.tick(), 50);
  }

  getOrCreateRoom(roomId = 'main') {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        gameState: new GameState(this.defaultSeed),
        clients: new Map() // ws -> playerId
      });
    }
    return this.rooms.get(roomId);
  }

  getTotalOnlineCount() {
    let count = 0;
    for (const room of this.rooms.values()) {
      count += room.clients.size;
    }
    return count;
  }

  send(ws, type, data) {
    if (ws.readyState === 1) { // 1 = WebSocket.OPEN
      try {
        ws.send(JSON.stringify({ type, data }));
      } catch (err) {
        // Socket error, handled on close
      }
    }
  }

  broadcast(room, type, data, excludeWs = null) {
    const payload = JSON.stringify({ type, data });
    for (const clientWs of room.clients.keys()) {
      if (clientWs !== excludeWs && clientWs.readyState === 1) {
        try {
          clientWs.send(payload);
        } catch (err) {
          // ignore individual send errors
        }
      }
    }
  }

  handleConnection(ws) {
    const id = 'p_' + Math.random().toString(36).substring(2, 9);
    this.socketMeta.set(ws, {
      id,
      roomId: null,
      lastMsgTime: Date.now(),
      msgCount: 0
    });

    ws.on('message', (message) => {
      this.handleMessage(ws, message);
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', () => {
      this.handleDisconnect(ws);
    });
  }

  checkRateLimit(ws) {
    const meta = this.socketMeta.get(ws);
    if (!meta) return false;
    const now = Date.now();
    if (now - meta.lastMsgTime > 1000) {
      meta.lastMsgTime = now;
      meta.msgCount = 1;
      return true;
    }
    meta.msgCount++;
    // Maximum 80 messages per second per client
    return meta.msgCount <= 80;
  }

  handleMessage(ws, raw) {
    if (!this.checkRateLimit(ws)) {
      return; // Drop flooded packets
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return; // Invalid JSON
    }

    const { type, data } = parsed;
    const meta = this.socketMeta.get(ws);
    if (!meta) return;

    switch (type) {
      case MSG.PING:
        this.send(ws, MSG.PONG, { time: Date.now() });
        break;

      case MSG.JOIN:
        this.handleJoin(ws, meta, data);
        break;

      case MSG.MOVE:
        this.handleMove(ws, meta, data);
        break;

      case MSG.BLOCK_MODIFY:
        this.handleBlockModify(ws, meta, data);
        break;

      case MSG.CHAT:
        this.handleChat(ws, meta, data);
        break;
    }
  }

  handleJoin(ws, meta, data) {
    const roomId = 'main';
    const room = this.getOrCreateRoom(roomId);

    if (room.clients.size >= this.maxPlayers) {
      this.send(ws, MSG.ERROR, { message: 'El servidor está lleno (máximo alcanzado). Intenta más tarde.' });
      return;
    }

    const cleanName = sanitizeName(data?.name);
    const player = room.gameState.addPlayer(meta.id, cleanName);

    meta.roomId = roomId;
    room.clients.set(ws, meta.id);

    // Send initial world state & existing players to the new player
    const initialState = room.gameState.getInitialState(meta.id);
    this.send(ws, MSG.INIT, {
      id: meta.id,
      player,
      ...initialState
    });

    // Notify other players
    this.broadcast(room, MSG.PLAYER_JOINED, {
      id: player.id,
      name: player.name,
      pos: player.pos,
      rot: player.rot,
      action: player.action
    }, ws);
  }

  handleMove(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || !isValidMove(data)) return;

    room.gameState.updatePlayer(meta.id, data);
  }

  handleBlockModify(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || !isValidBlockModify(data)) return;

    const { x, y, z, blockType } = data;
    const result = room.gameState.modifyBlock(meta.id, x, y, z, blockType);

    if (result.success) {
      // Broadcast validated block change to all players in the room including sender
      this.broadcast(room, MSG.BLOCK_UPDATE, result.delta);
    } else {
      // Revert / inform sender if modification was invalid
      const currentBlock = room.gameState.getBlock(data.x, data.y, data.z);
      if (currentBlock !== null) {
        this.send(ws, MSG.BLOCK_UPDATE, {
          x: data.x,
          y: data.y,
          z: data.z,
          blockType: currentBlock,
          playerId: 'server'
        });
      }
      this.send(ws, MSG.ERROR, { message: result.reason || 'Modificación inválida' });
    }
  }

  handleChat(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room) return;

    const player = room.gameState.getPlayer(meta.id);
    if (!player) return;

    const text = sanitizeChat(data?.text);
    if (!text) return;

    this.broadcast(room, MSG.CHAT_BROADCAST, {
      senderId: player.id,
      senderName: player.name,
      text,
      timestamp: Date.now()
    });
  }

  handleDisconnect(ws) {
    const meta = this.socketMeta.get(ws);
    if (!meta) return;

    if (meta.roomId) {
      const room = this.rooms.get(meta.roomId);
      if (room) {
        const player = room.gameState.removePlayer(meta.id);
        room.clients.delete(ws);

        if (player) {
          this.broadcast(room, MSG.PLAYER_LEFT, {
            id: player.id,
            name: player.name
          });
        }
      }
    }

    this.socketMeta.delete(ws);
  }

  tick() {
    for (const room of this.rooms.values()) {
      if (room.clients.size === 0) continue;
      const snapshot = room.gameState.getPlayersSnapshot();
      const timeOfDay = room.gameState.getTimeOfDay();

      const payload = JSON.stringify({
        type: MSG.PLAYERS_UPDATE,
        data: { players: snapshot, timeOfDay }
      });

      for (const clientWs of room.clients.keys()) {
        if (clientWs.readyState === 1) {
          try {
            clientWs.send(payload);
          } catch (e) {
            // handled on close
          }
        }
      }
    }
  }

  destroy() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }
  }
}

module.exports = { RoomManager };
