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
  isValidTntTrigger,
  isValidVehicleDrive,
  isValidMissileLaunch,
  ADMIN_EMAIL,
  RIVAL_ADMIN_EMAIL,
  ADMIN_EMAILS,
  isValidAdminCredentials,
  AIR_BASE_BOUNDS,
  isInsideAirBase
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
    this.lastKnownPlayerPositions = new Map(); // playerId -> [x, y, z]

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
    if (ws && ws.readyState === 1) { // 1 = WebSocket.OPEN
      try {
        const payload = JSON.stringify({ type, data });
        ws.send(payload);
      } catch (err) {
        // Socket or serialization error, safely ignored
      }
    }
  }

  broadcast(room, type, data, excludeWs = null) {
    if (!room || !room.clients) return;
    let payload;
    try {
      payload = JSON.stringify({ type, data });
    } catch (err) {
      console.error('[RoomManager.broadcast] serialization error:', err);
      return;
    }
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

      case MSG.VEHICLE_DRIVE:
        this.handleVehicleDrive(ws, meta, data);
        break;

      case MSG.VEHICLE_ENTER:
        this.handleVehicleEnter(ws, meta, data);
        break;

      case MSG.VEHICLE_EXIT:
        this.handleVehicleExit(ws, meta, data);
        break;

      case MSG.ADMIN_AUTH:
        this.handleAdminAuth(ws, meta, data);
        break;

      case MSG.ADMIN_RESET_SERVER:
        this.handleAdminResetServer(ws, meta, data);
        break;

      case MSG.ADMIN_LAUNCH_MISSILE:
        this.handleAdminLaunchMissile(ws, meta, data);
        break;

      case MSG.MISSILE_DETONATE:
        this.handleMissileDetonate(ws, meta, data);
        break;
    }
  }

  handleJoin(ws, meta, data) {
    const roomId = 'main';
    const room = this.getOrCreateRoom(roomId);

    const rawIdentifier = typeof data?.email === 'string' ? data.email : (typeof data?.name === 'string' ? data.name : '');
    const isAdmin = isValidAdminCredentials(rawIdentifier, data?.adminKey || '');
    const normAdminEmail = isAdmin ? rawIdentifier.trim().toLowerCase() : null;

    if (room.clients.size >= this.maxPlayers && !isAdmin) {
      this.send(ws, MSG.ERROR, { message: 'El servidor está lleno (máximo alcanzado). Intenta más tarde.' });
      return;
    }

    const cleanName = sanitizeName(data?.name);
    const player = room.gameState.addPlayer(meta.id, cleanName);
    player.isAdmin = isAdmin;
    player.adminEmail = normAdminEmail;

    meta.roomId = roomId;
    meta.isAdmin = isAdmin;
    meta.adminEmail = normAdminEmail;
    room.clients.set(ws, meta.id);

    // Send initial world state & existing players to the new player
    const initialState = room.gameState.getInitialState(meta.id);
    this.send(ws, MSG.INIT, {
      id: meta.id,
      player,
      isAdmin,
      adminEmail: normAdminEmail,
      ...initialState
    });

    if (isAdmin) {
      this.sendAdminState(ws, room);
    }

    // Notify other players
    this.broadcast(room, MSG.PLAYER_JOINED, {
      id: player.id,
      name: player.name,
      pos: player.pos,
      rot: player.rot,
      action: player.action,
      weaponsEnabled: !!player.weaponsEnabled,
      joinedAt: player.joinedAt
    }, ws);
  }

  sendAdminState(ws, room) {
    if (!room) return;
    const meta = this.socketMeta.get(ws);
    this.send(ws, MSG.ADMIN_STATE, {
      isAdmin: true,
      adminEmail: meta?.adminEmail || null,
      onlineCount: room.clients.size,
      players: room.gameState.getPlayersSnapshot()
    });
  }

  handleAdminAuth(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room) return;
    const player = room.gameState.getPlayer(meta.id);
    if (!player) return;

    const identifier = data?.email || data?.name || '';
    const adminKey = data?.adminKey || '';
    if (isValidAdminCredentials(identifier, adminKey)) {
      const normEmail = identifier.trim().toLowerCase();
      player.isAdmin = true;
      player.adminEmail = normEmail;
      meta.isAdmin = true;
      meta.adminEmail = normEmail;
      this.sendAdminState(ws, room);
    } else {
      this.send(ws, MSG.ERROR, { message: 'Clave incorrecta.' });
    }
  }

  handleAdminResetServer(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room) return;
    const player = room.gameState.getPlayer(meta.id);
    const identifier = data?.email || data?.name || '';
    const key = data?.adminKey || data?.key || '';
    const authorized = (player && player.isAdmin) || meta.isAdmin || isValidAdminCredentials(identifier, key);
    if (!authorized) {
      this.send(ws, MSG.ERROR, { message: 'No autorizado.' });
      return;
    }

    // Clear pending TNT timers
    for (const timer of this.pendingTntTimers) {
      clearTimeout(timer);
    }
    this.pendingTntTimers.clear();
    this.playerHitCooldowns.clear();

    // Reset world state (clears blockDeltas and restores animals)
    room.gameState.resetWorld();

    const resetMsg = 'El admin ha reiniciado el server';
    // Broadcast MSG.SERVER_RESET with reason "El admin ha reiniciado el server"
    try {
      this.broadcast(room, MSG.SERVER_RESET, {
        message: resetMsg,
        reason: resetMsg
      });
    } catch (err) {
      console.error('[RoomManager] Error broadcasting SERVER_RESET:', err);
    }

    // Cleanly remove from game state and room session immediately
    const sockets = Array.from(room.clients.keys());
    for (const clientWs of sockets) {
      const clientMeta = this.socketMeta.get(clientWs);
      if (clientMeta) {
        room.gameState.removePlayer(clientMeta.id);
        clientMeta.roomId = null;
        clientMeta.isAdmin = false;
      }
      room.clients.delete(clientWs);
    }

    // Give 250ms buffer so that MSG.SERVER_RESET frame is reliably delivered before closing sockets
    const closeSockets = () => {
      for (const clientWs of sockets) {
        try {
          if (typeof clientWs.close === 'function') {
            clientWs.close();
          }
        } catch (_) {}
      }
    };
    if (typeof setTimeout !== 'undefined') {
      setTimeout(closeSockets, 250);
    } else {
      closeSockets();
    }
  }

  handleMove(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || !isValidMove(data)) return;

    // Military Base Protected Perimeter Shield
    // Bounding box: X in [-455, -385], Z in [115, 185], Y in [0, 85]
    // Only jsieiragerpe@gmail.com is allowed entry.
    if (meta.adminEmail !== ADMIN_EMAIL && Array.isArray(data.pos)) {
      const [px, py, pz] = data.pos;
      if (px >= -455 && px <= -385 && pz >= 115 && pz <= 185 && py <= 85) {
        const distToWest = Math.abs(px - (-455));
        const distToEast = Math.abs(px - (-385));
        const distToSouth = Math.abs(pz - 115);
        const distToNorth = Math.abs(pz - 185);
        const minDist = Math.min(distToWest, distToEast, distToSouth, distToNorth);

        if (minDist === distToWest) data.pos[0] = -458;
        else if (minDist === distToEast) data.pos[0] = -382;
        else if (minDist === distToSouth) data.pos[2] = 112;
        else data.pos[2] = 188;

        const now = Date.now();
        if (!meta.lastShieldNotice || now - meta.lastShieldNotice > 3500) {
          meta.lastShieldNotice = now;
          this.send(ws, MSG.CHAT_BROADCAST, {
            senderId: 'SYSTEM',
            senderName: 'CAMPO DE FUERZA',
            text: '🛡️ Acceso denegado: Base Militar protegida por escudo impenetrable.',
            timestamp: now
          });
        }
      }
    }

    room.gameState.updatePlayer(meta.id, data);
  }

  handleWeaponToggle(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room) return;

    const enabled = Boolean(data && data.enabled);
    room.gameState.setPlayerWeaponsMode(meta.id, enabled);

    // Broadcast weapon toggle to all players so remote avatars equip/unequip immediately
    this.broadcast(room, MSG.WEAPON_TOGGLE, {
      id: meta.id,
      enabled: enabled
    });

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
        // Military Base Forcefield Protection:
        // Nullify unauthorized attacks targeting the admin or anyone inside the military air base
        const tx = Array.isArray(targetPlayer.pos) ? targetPlayer.pos[0] : (typeof targetPlayer.x === 'number' ? targetPlayer.x : 0);
        const ty = Array.isArray(targetPlayer.pos) ? targetPlayer.pos[1] : (typeof targetPlayer.y === 'number' ? targetPlayer.y : 25);
        const tz = Array.isArray(targetPlayer.pos) ? targetPlayer.pos[2] : (typeof targetPlayer.z === 'number' ? targetPlayer.z : 0);
        const isTargetInBase = isInsideAirBase(tx, ty, tz);
        const isTargetAdmin = (targetPlayer.adminEmail === ADMIN_EMAIL || targetPlayer.name === 'jsieiragerpe');

        if (meta.adminEmail !== ADMIN_EMAIL && (isTargetInBase || isTargetAdmin)) {
          this.send(ws, MSG.CHAT_BROADCAST, {
            senderId: 'SYSTEM',
            senderName: 'CAMPO DE FUERZA',
            text: '🛡️ Ataque anulado: El objetivo está protegido por el escudo de la Base Militar.',
            timestamp: Date.now()
          });
          return;
        }

        if (meta.adminEmail !== ADMIN_EMAIL && data.hitPos && isInsideAirBase(data.hitPos[0], data.hitPos[1], data.hitPos[2])) {
          this.send(ws, MSG.CHAT_BROADCAST, {
            senderId: 'SYSTEM',
            senderName: 'CAMPO DE FUERZA',
            text: '🛡️ Ataque anulado: El proyectil colisionó contra el campo de fuerza de la Base Militar.',
            timestamp: Date.now()
          });
          return;
        }

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

    // 2. Check if shot targeted a synchronized animal or NPC
    if (data.targetAnimalId) {
      const burstResult = room.gameState.hitAnimal(data.targetAnimalId, shooter.id);
      const payload = {
        animalId: data.targetAnimalId,
        shooterId: shooter.id,
        dir: data.dir || [0, 0, -1],
        hitPos: data.hitPos || null,
        ...(burstResult || {})
      };
      if (burstResult && burstResult.x !== undefined) {
        payload.x = burstResult.x;
        payload.y = burstResult.y;
        payload.z = burstResult.z;
        payload.type = burstResult.type;
      } else if (data.hitPos) {
        payload.x = data.hitPos[0];
        payload.y = data.hitPos[1];
        payload.z = data.hitPos[2];
        payload.type = 'npc';
      }

      this.broadcast(room, MSG.ANIMAL_BURST, payload);

      // Despawn synchronization after 3 seconds: broadcast final removal
      const despawnBroadcastTimer = setTimeout(() => {
        this.pendingTntTimers.delete(despawnBroadcastTimer);
        this.broadcast(room, MSG.ANIMALS_UPDATE, {
          animals: room.gameState.getAnimalsSnapshot()
        });
      }, 3050);
      this.pendingTntTimers.add(despawnBroadcastTimer);
    }

    // 3. Shoot-to-detonate TNT block immediately
    if (data.targetTnt) {
      const tx = Math.round(Array.isArray(data.targetTnt) ? data.targetTnt[0] : data.targetTnt.x);
      const ty = Math.round(Array.isArray(data.targetTnt) ? data.targetTnt[1] : data.targetTnt.y);
      const tz = Math.round(Array.isArray(data.targetTnt) ? data.targetTnt[2] : data.targetTnt.z);
      if (!isNaN(tx) && !isNaN(ty) && !isNaN(tz)) {
        const explosion = room.gameState.detonateTnt(tx, ty, tz, 3);
        this.broadcast(room, MSG.TNT_EXPLODE, explosion);
        if (explosion.hitAnimals && explosion.hitAnimals.length > 0) {
          for (const anim of explosion.hitAnimals) {
            this.broadcast(room, MSG.ANIMAL_BURST, {
              animalId: anim.id,
              type: anim.type,
              x: anim.x,
              y: anim.y,
              z: anim.z,
              shooterId: shooter.id,
              dir: data.dir || [0, 0, -1]
            });
          }
          this.broadcast(room, MSG.ANIMALS_UPDATE, {
            animals: room.gameState.getAnimalsSnapshot()
          });
        }
      }
    }
  }

  handleTntTrigger(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || !isValidTntTrigger(data)) return;

    const fuseMs = typeof data.fuseMs === 'number' ? Math.max(0, Math.min(4000, data.fuseMs)) : 1800;
    const radius = typeof data.radius === 'number' ? Math.max(1, Math.min(10, Math.round(data.radius))) : 3;
    const rx = Math.round(data.x);
    const ry = Math.round(data.y);
    const rz = Math.round(data.z);

    if (meta.adminEmail !== ADMIN_EMAIL && isInsideAirBase(rx, ry, rz)) {
      this.send(ws, MSG.CHAT_BROADCAST, {
        senderId: 'SYSTEM',
        senderName: 'CAMPO DE FUERZA',
        text: '🛡️ Detonación anulada: La Base Militar está protegida contra explosivos.',
        timestamp: Date.now()
      });
      return;
    }

    const executeDetonation = () => {
      const explosion = room.gameState.detonateTnt(rx, ry, rz, radius);
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
      this.broadcast(room, MSG.TNT_PRIMED, {
        x: rx,
        y: ry,
        z: rz,
        fuseMs,
        playerId: meta.id
      });
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

    // Military Base Protected Perimeter Shield: block edits prohibited unless jsieiragerpe@gmail.com
    if (x >= -455 && x <= -385 && z >= 115 && z <= 185 && y >= 0 && y <= 85) {
      if (meta.adminEmail !== ADMIN_EMAIL) {
        this.send(ws, MSG.BLOCK_REJECT, {
          x, y, z,
          reason: '🛡️ Base militar protegida por campo de fuerza impenetrable.'
        });
        return;
      }
    }

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

    // Military Base Protected Perimeter: unauthorized players cannot teleport inside base
    if (meta.adminEmail !== ADMIN_EMAIL && isInsideAirBase(tx, ty, tz)) {
      this.send(ws, MSG.ERROR, { message: '🛡️ Acceso denegado: Base Militar protegida por campo de fuerza impenetrable.' });
      return;
    }

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

  handleVehicleDrive(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || !isValidVehicleDrive(data)) return;

    const player = room.gameState.getPlayer(meta.id);
    if (!player) return;

    // Update authoritative player state
    player.pos = [data.x, data.y, data.z];
    player.rot = [data.yaw, data.pitch || 0];
    player.action = 'driving';
    player.lastUpdate = Date.now();

    // Broadcast vehicle drive packet to other players in the room
    this.broadcast(room, MSG.VEHICLE_DRIVE, {
      playerId: meta.id,
      vehicleId: data.vehicleId,
      x: data.x,
      y: data.y,
      z: data.z,
      yaw: data.yaw,
      pitch: data.pitch || 0,
      roll: data.roll || 0,
      speed: data.speed || 0,
      steering: data.steering || 0,
      isDrifting: Boolean(data.isDrifting)
    }, ws);
  }

  handleVehicleEnter(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room) return;

    const player = room.gameState.getPlayer(meta.id);
    if (player) {
      player.action = 'driving';
    }

    this.broadcast(room, MSG.VEHICLE_ENTER, {
      playerId: meta.id,
      vehicleId: data?.vehicleId
    }, ws);
  }

  handleVehicleExit(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room) return;

    const player = room.gameState.getPlayer(meta.id);
    if (player) {
      player.action = 'idle';
    }

    this.broadcast(room, MSG.VEHICLE_EXIT, {
      playerId: meta.id,
      vehicleId: data?.vehicleId
    }, ws);
  }

  handleDisconnect(ws) {
    const meta = this.socketMeta.get(ws);
    if (!meta) return;

    if (meta.roomId) {
      const room = this.rooms.get(meta.roomId);
      if (room) {
        const player = room.gameState.getPlayer(meta.id);
        if (player && Array.isArray(player.pos)) {
          this.lastKnownPlayerPositions.set(meta.id, [...player.pos]);
        }
        room.gameState.removePlayer(meta.id);
        room.clients.delete(ws);

        if (player) {
          this.broadcast(room, MSG.PLAYER_LEFT, {
            id: player.id,
            name: player.name,
            lastPos: player.pos ? [...player.pos] : null
          });
        }
      }
    }

    this.socketMeta.delete(ws);
  }

  handleAdminLaunchMissile(ws, meta, data) {
    if (!meta.roomId) {
      this.send(ws, MSG.ERROR, { message: 'No estás conectado a ninguna sala.' });
      return;
    }
    const room = this.rooms.get(meta.roomId);
    if (!room || !isValidMissileLaunch(data)) return;

    const launcher = room.gameState.getPlayer(meta.id);
    if (!launcher) return;

    // Look up target either online or from last known positions
    const targetPlayer = room.gameState.getPlayer(data.targetPlayerId);
    let targetPos = null;
    let targetName = 'Objetivo';

    if (targetPlayer) {
      targetPos = [...targetPlayer.pos];
      targetName = targetPlayer.name;
    } else if (this.lastKnownPlayerPositions.has(data.targetPlayerId)) {
      targetPos = [...this.lastKnownPlayerPositions.get(data.targetPlayerId)];
      targetName = 'Jugador (Desconectado)';
    } else if (Array.isArray(data.targetPos)) {
      targetPos = [...data.targetPos];
    } else {
      this.send(ws, MSG.ERROR, { message: 'El jugador objetivo no está disponible.' });
      return;
    }

    const isAir = (typeof data.launchType === 'string')
      ? (data.launchType === 'air')
      : (Array.isArray(data.origin) ? data.origin[1] > 28 : (launcher.pos ? launcher.pos[1] > 28 : false));

    const startPos = Array.isArray(data.origin) ? [...data.origin] : [...launcher.pos];
    const startYaw = typeof data.yaw === 'number' ? data.yaw : (launcher.rot ? launcher.rot[0] : 0);

    // Exactly 1 missile for all players (user requested: "ponle misiles pero solo 1 a todos, los jugadores en vez de lanzar 2, solo uno")
    const missileCount = 1;
    const launchedIds = [];

    for (let i = 0; i < missileCount; i++) {
      const missileId = 'msl_' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '_' + i;
      launchedIds.push(missileId);
      const yawOffset = (missileCount > 1) ? (i === 0 ? -0.16 : 0.16) : 0;

      const payload = {
        missileId,
        launcherId: meta.id,
        launcherName: launcher.name,
        targetPlayerId: data.targetPlayerId,
        targetName,
        targetPos,
        startPos: [startPos[0] + (missileCount > 1 ? (i === 0 ? -0.8 : 0.8) : 0), startPos[1], startPos[2]],
        startYaw: startYaw + yawOffset,
        power: 4, // 4X TNT equivalent (radius 9m)
        launchType: isAir ? 'air' : 'land'
      };

      // Broadcast missile spawn to everyone in the room
      this.broadcast(room, MSG.MISSILE_SPAWN, payload);
    }

    // Check if target is the Main Admin (jsieiragerpe@gmail.com) OR inside the Military Air Base
    const isTargetMainAdmin = (targetPlayer && (targetPlayer.adminEmail === ADMIN_EMAIL || targetPlayer.name === 'jsieiragerpe' || targetPlayer.name === 'jsieiragerpe@gmail.com' || targetPlayer.id === 'p_main_admin'));
    const isTargetInBase = targetPos && isInsideAirBase(targetPos[0], targetPos[1], targetPos[2]);
    if (isTargetMainAdmin || isTargetInBase) {
      this.broadcast(room, MSG.MISSILE_INTERCEPT_DEFENSE, {
        attackerId: meta.id,
        attackerName: launcher.name,
        attackerPos: startPos,
        defenderId: targetPlayer ? targetPlayer.id : 'p_main_admin',
        defenderName: targetPlayer ? targetPlayer.name : 'jsieiragerpe',
        defenderPos: targetPos,
        hostileMissileIds: launchedIds,
        isAir: targetPos[1] > 28
      });

      this.broadcast(room, MSG.CHAT_BROADCAST, {
        senderId: 'SYSTEM',
        senderName: 'CÚPULA DE HIERRO',
        text: '🛡️ [DEFENSA ACTIVA] ¡Misiles entrantes detectados hacia el Admin! Desplegando interceptores de defensa...',
        timestamp: Date.now()
      });
    }

    // Announce to launcher
    this.send(ws, MSG.CHAT_BROADCAST, {
      senderId: 'SYSTEM',
      senderName: 'RADAR TÁCTICO',
      text: `🚀 ${missileCount > 1 ? 'Salva de 2 misiles teledirigidos lanzada' : 'Misil teledirigido lanzado'} con éxito hacia ${targetName} (${isAir ? 'Modo Aire' : 'Modo Tierra'}).`,
      timestamp: Date.now()
    });
  }

  handleMissileDetonate(ws, meta, data) {
    if (!meta.roomId) return;
    const room = this.rooms.get(meta.roomId);
    if (!room || !data) return;

    const rx = Math.round(data.x);
    const ry = Math.round(data.y);
    const rz = Math.round(data.z);

    // Mid-air kinetic interception: broadcast impact to all players without ground crater
    if (data.isIntercepted) {
      this.broadcast(room, MSG.MISSILE_IMPACT, {
        missileId: data.missileId,
        x: rx,
        y: ry,
        z: rz,
        isIntercepted: true,
        radius: 0
      });
      this.broadcast(room, MSG.CHAT_BROADCAST, {
        senderId: 'SYSTEM',
        senderName: 'CÚPULA DE HIERRO',
        text: '🛡️ [INTERCEPCIÓN CINÉTICA] ¡Misil enemigo neutralizado en pleno vuelo por la Cúpula de Hierro!',
        timestamp: Date.now()
      });
      return;
    }

    const radius = 9; // 4x TNT power

    // Base Militar forcefield absorbs hostile missile detonation without terrain damage
    if (meta.adminEmail !== ADMIN_EMAIL && isInsideAirBase(rx, ry, rz)) {
      this.broadcast(room, MSG.CHAT_BROADCAST, {
        senderId: 'SYSTEM',
        senderName: 'CAMPO DE FUERZA',
        text: '🛡️ El escudo de la Base Militar absorbió y neutralizó el misil entrante al 100%.',
        timestamp: Date.now()
      });
      return;
    }

    const explosion = room.gameState.detonateTnt(rx, ry, rz, radius);
    this.broadcast(room, MSG.TNT_EXPLODE, explosion);
    this.broadcast(room, MSG.MISSILE_IMPACT, {
      missileId: data.missileId,
      x: rx,
      y: ry,
      z: rz,
      radius
    });

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
  }

  tick() {
    this.adminBroadcastTick = (this.adminBroadcastTick || 0) + 1;
    const shouldSendAdmin = (this.adminBroadcastTick % 20 === 0);

    for (const room of this.rooms.values()) {
      if (!room || !room.clients || room.clients.size === 0) continue;
      try {
        const snapshot = room.gameState.getPlayersSnapshot();
        const timeOfDay = room.gameState.getTimeOfDay();

        const payload = JSON.stringify({
          type: MSG.PLAYERS_UPDATE,
          data: { players: snapshot, timeOfDay }
        });

        let adminPayload = null;
        if (shouldSendAdmin) {
          adminPayload = JSON.stringify({
            type: MSG.ADMIN_STATE,
            data: {
              isAdmin: true,
              onlineCount: room.clients.size,
              players: snapshot
            }
          });
        }

        for (const clientWs of room.clients.keys()) {
          if (clientWs.readyState === 1) {
            try {
              clientWs.send(payload);
              if (adminPayload) {
                const meta = this.socketMeta.get(clientWs);
                if (meta && meta.isAdmin) {
                  clientWs.send(adminPayload);
                }
              }
            } catch (e) {
              // handled on close
            }
          }
        }
      } catch (err) {
        console.error('[RoomManager.tick] serialization error:', err);
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
    for (const room of this.rooms.values()) {
      if (room.gameState && room.gameState.animalTimers) {
        for (const timer of room.gameState.animalTimers.values()) {
          clearTimeout(timer);
        }
        room.gameState.animalTimers.clear();
      }
    }
  }
}

module.exports = { RoomManager };

