// server/rooms.js
// Room manager and message dispatcher for multiplayer sessions

const {
  MSG,
  sanitizeName,
  sanitizeChat,
  isValidBlockModify,
  isValidMove,
  validateTeleportPacket,
  isValidWeaponShoot,
  isValidTntTrigger
} = require('./protocol');
const { GameState } = require('./game-state');

class RoomManager {
  constructor(options = {}) {
    const maxParam = (typeof options === 'number') ? options : (options && options.maxPlayers);
    this.maxPlayers = Number(maxParam) || 30;
    this.defaultSeed = Number(options?.seed) || 48151623;
    this.rooms = new Map(); // roomId -> { gameState, clients: Map<ws, playerId> }
    this.socketMeta = new Map(); // ws -> { id, roomId, lastMsgTime, msgCount }
    this.pendingTntTimers = new Set();
    this.playerHitCooldowns = new Map(); // "shooterId->targetId" -> timestamp

    // Start tick loop for movement broadcasts (20 updates/second)
    this.tickInterval = setInterval(() => this.tick(), 50);
  }

  getOrCreateRoom(roomId = 'main') {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        gameState: new GameState(this.defaultSeed, this.maxPlayers),
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

  findSocketByPlayerId(room, playerId) {
    for (const [clientWs, pid] of room.clients.entries()) {
      if (pid === playerId) return clientWs;
    }
    return null;
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

      case MSG.TELEPORT_TO_PLAYER:
        this.handleTeleportToPlayer(ws, meta, (data && typeof data === 'object') ? data : parsed);
        break;

      case MSG.WEAPON_TOGGLE:
        this.handleWeaponToggle(ws, meta, data);
        break;

      case MSG.WEAPON_SHOOT:
        this.handleWeaponShoot(ws, meta, data);
        break;

      case MSG.TNT_TRIGGER:
        this.handleTntTrigger(ws, meta, data);
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
      action: player.action,
      weaponsEnabled: !!player.weaponsEnabled
    }, ws);
  }

  handleMove(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || !isValidMove(data)) return;

    room.gameState.updatePlayer(meta.id, data);
  }

  handleWeaponToggle(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room) return;

    const enabled = Boolean(data && data.enabled);
    room.gameState.setPlayerWeaponsMode(meta.id, enabled);

    // Broadcast updated shared animal list to everyone in the room (no duplicates!)
    this.broadcast(room, MSG.ANIMALS_UPDATE, {
      animals: room.gameState.getAnimalsSnapshot()
    });
  }

  handleWeaponShoot(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || !isValidWeaponShoot(data)) return;

    const shooter = room.gameState.getPlayer(meta.id);
    if (!shooter) return;

    // Broadcast tracer/muzzle FX to other players
    this.broadcast(room, MSG.WEAPON_SHOT_FX, {
      shooterId: shooter.id,
      weaponType: data.weaponType || 'rifle',
      origin: data.origin || shooter.pos,
      dir: data.dir || [0, 0, -1],
      hitPos: data.hitPos || null
    }, ws);

    // 1. Check if shot targeted a player (Non-lethal impact + non-annoying notification)
    if (data.targetPlayerId) {
      const targetPlayer = room.gameState.getPlayer(data.targetPlayerId);
      if (targetPlayer && targetPlayer.id !== shooter.id) {
        const pairKey = `${shooter.id}->${targetPlayer.id}`;
        const now = Date.now();
        const lastHit = this.playerHitCooldowns.get(pairKey) || 0;

        // Throttle notifications to at most once every 1.2s per shooter/target pair so it is never annoying
        if (now - lastHit >= 1200) {
          this.playerHitCooldowns.set(pairKey, now);
          const hitPayload = {
            shooterId: shooter.id,
            shooterName: shooter.name,
            targetPlayerId: targetPlayer.id,
            targetName: targetPlayer.name,
            weaponType: data.weaponType || 'rifle',
            nonLethal: true,
            hitPos: data.hitPos || targetPlayer.pos
          };

          const targetWs = this.findSocketByPlayerId(room, targetPlayer.id);
          if (targetWs) {
            this.send(targetWs, MSG.WEAPON_HIT, hitPayload);
          }
          // Confirm impact to shooter as well
          this.send(ws, MSG.WEAPON_HIT, hitPayload);
        }
      }
    }

    // 2. Check if shot targeted a synchronized animal (Animal bursts/explodes for all players)
    if (data.targetAnimalId) {
      const burstResult = room.gameState.hitAnimal(data.targetAnimalId, shooter.id);
      if (burstResult) {
        this.broadcast(room, MSG.ANIMAL_BURST, burstResult);
        this.broadcast(room, MSG.ANIMALS_UPDATE, {
          animals: room.gameState.getAnimalsSnapshot()
        });
      }
    }
  }

  handleTntTrigger(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || !isValidTntTrigger(data)) return;

    const fuseMs = typeof data.fuseMs === 'number' ? Math.max(0, Math.min(4000, data.fuseMs)) : 1800;
    const rx = Math.round(data.x);
    const ry = Math.round(data.y);
    const rz = Math.round(data.z);

    this.broadcast(room, MSG.TNT_PRIMED, {
      x: rx,
      y: ry,
      z: rz,
      fuseMs,
      playerId: meta.id
    });

    const executeDetonation = () => {
      const explosion = room.gameState.detonateTnt(rx, ry, rz, 3);
      this.broadcast(room, MSG.TNT_EXPLODE, explosion);
      if (explosion.hitAnimals && explosion.hitAnimals.length > 0) {
        for (const anim of explosion.hitAnimals) {
          this.broadcast(room, MSG.ANIMAL_BURST, {
            animalId: anim.id,
            type: anim.type,
            x: anim.x,
            y: anim.y,
            z: anim.z,
            shooterId: meta.id
          });
        }
        this.broadcast(room, MSG.ANIMALS_UPDATE, {
          animals: room.gameState.getAnimalsSnapshot()
        });
      }
    };

    if (fuseMs <= 0) {
      executeDetonation();
    } else {
      const timer = setTimeout(() => {
        this.pendingTntTimers.delete(timer);
        executeDetonation();
      }, fuseMs);
      this.pendingTntTimers.add(timer);
    }
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
      // Inform sender of block rejection with exact coordinates so client rolls back
      this.send(ws, MSG.BLOCK_REJECT, {
        x: data.x,
        y: data.y,
        z: data.z,
        reason: result.reason || 'Modificación inválida'
      });
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

  handleTeleportToPlayer(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room) return;

    if (!validateTeleportPacket(data)) {
      this.send(ws, MSG.ERROR, { message: 'Paquete de teletransporte inválido.' });
      return;
    }

    const requester = room.gameState.getPlayer(meta.id);
    if (!requester) return;

    const target = room.gameState.getPlayer(data.targetPlayerId);
    if (!target) {
      this.send(ws, MSG.ERROR, { message: 'El jugador objetivo no está disponible.' });
      return;
    }

    const tx = typeof target.x === 'number' ? target.x : (Array.isArray(target.pos) ? target.pos[0] : 0);
    const ty = typeof target.y === 'number' ? target.y : (Array.isArray(target.pos) ? target.pos[1] : 25);
    const tz = typeof target.z === 'number' ? target.z : (Array.isArray(target.pos) ? target.pos[2] : 0);

    if (Array.isArray(requester.pos)) {
      requester.pos[0] = tx;
      requester.pos[1] = ty;
      requester.pos[2] = tz;
      requester.lastUpdate = Date.now();
    }

    this.send(ws, MSG.TELEPORT_CONFIRM, {
      type: MSG.TELEPORT_CONFIRM,
      x: tx,
      y: ty,
      z: tz,
      targetName: target.name
    });

    this.broadcast(room, MSG.CHAT_BROADCAST, {
      senderId: 'SYSTEM',
      senderName: 'SISTEMA',
      text: `${requester.name} se ha teletransportado hacia ${target.name}`,
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
    for (const timer of this.pendingTntTimers) {
      clearTimeout(timer);
    }
    this.pendingTntTimers.clear();
  }
}

module.exports = { RoomManager };

