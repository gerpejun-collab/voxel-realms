// public/src/multiplayer.js
// Client WebSocket connection, delta synchronization, remote avatars and packet handling
import { Avatar } from './avatar.js';

export class MultiplayerClient {
  constructor(world, scene, particleManager) {
    this.world = world;
    this.scene = scene;
    this.particles = particleManager;

    this.ws = null;
    this.myId = null;
    this.myName = 'Player';
    this.connected = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;

    this.remoteAvatars = new Map(); // id -> Avatar
    this.pendingModifications = new Map(); // "x,y,z" -> originalBlock (for rollback on rejection)
    this.timeOfDay = 0.32; // Perpetual bright sunny day

    // Throttled movement packets
    this.lastSendTime = 0;
    this.sendInterval = 45; // ~22 updates/sec
    this.lastSentPos = [0, 0, 0];
    this.lastSentRot = [0, 0];

    // Callbacks for UI & World Managers
    this.onConnected = null;
    this.onDisconnected = null;
    this.onPlayerCountChange = null;
    this.onChatMessage = null;
    this.onNotification = null;
    this.onError = null;
    this.onTeleportConfirm = null;
    this.onAnimalsUpdate = null;
    this.onAnimalBurst = null;
    this.onWeaponHit = null;
    this.onTntPrime = null;
    this.onTntExplode = null;
  }

  connect(playerName) {
    this.myName = playerName || 'Player';

    // Build WebSocket URL matching current host and secure protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      if (this.onError) this.onError('Error al conectar con el servidor.');
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      if (this.onConnected) this.onConnected();

      // Send join request
      this.send('join', { name: this.myName });
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      this.handleDisconnect();
    };

    this.ws.onerror = () => {
      this.handleDisconnect();
    };
  }

  send(type, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  handleDisconnect() {
    if (!this.connected && !this.reconnecting) return;
    this.connected = false;

    // Clean up remote avatars
    for (const avatar of this.remoteAvatars.values()) {
      avatar.dispose();
    }
    this.remoteAvatars.clear();

    if (this.onDisconnected) this.onDisconnected();

    // Auto-reconnect with exponential backoff
    if (this.reconnectAttempts < 6) {
      this.reconnecting = true;
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 8000);
      setTimeout(() => {
        if (!this.connected) {
          this.connect(this.myName);
        }
      }, delay);
    }
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    const { type, data } = msg;

    switch (type) {
      case 'init':
        this.myId = data.id;
        this.timeOfDay = data.timeOfDay ?? 0.32;

        // Apply world seed if different
        if (data.seed && this.world.seed !== data.seed) {
          this.world.seed = data.seed;
        }

        // Apply pre-existing block deltas from server
        if (Array.isArray(data.deltas)) {
          for (const [x, y, z, blockType] of data.deltas) {
            this.world.applyBlockDelta(x, y, z, blockType);
          }
        }

        // Spawn existing remote players
        if (Array.isArray(data.players)) {
          for (const p of data.players) {
            this.addRemotePlayer(p);
          }
        }

        // Sync initial authoritative animals
        if (Array.isArray(data.animals) && this.onAnimalsUpdate) {
          this.onAnimalsUpdate(data.animals);
        }

        if (this.onPlayerCountChange) {
          this.onPlayerCountChange(this.remoteAvatars.size + 1);
        }
        if (this.onNotification) {
          this.onNotification(`Bienvenido a Voxel Realms, ${this.myName}!`);
        }
        break;

      case 'player_joined':
        this.addRemotePlayer(data);
        if (this.onPlayerCountChange) {
          this.onPlayerCountChange(this.remoteAvatars.size + 1);
        }
        if (this.onNotification) {
          this.onNotification(`${data.name} se ha unido al reino.`);
        }
        break;

      case 'player_left':
        this.removeRemotePlayer(data.id);
        if (this.onPlayerCountChange) {
          this.onPlayerCountChange(this.remoteAvatars.size + 1);
        }
        if (this.onNotification) {
          this.onNotification(`${data.name || 'Un jugador'} ha salido del reino.`);
        }
        break;

      case 'players_update':
        if (typeof data.timeOfDay === 'number') {
          this.timeOfDay = data.timeOfDay;
        }
        if (Array.isArray(data.players)) {
          for (const p of data.players) {
            if (p.id !== this.myId) {
              const avatar = this.remoteAvatars.get(p.id);
              if (avatar) {
                avatar.setTargetState(p.pos, p.rot, p.action);
              }
            }
          }
        }
        break;

      case 'animals_update':
        if (data && Array.isArray(data.animals) && this.onAnimalsUpdate) {
          this.onAnimalsUpdate(data.animals);
        }
        break;

      case 'animal_burst':
        if (data && this.onAnimalBurst) {
          this.onAnimalBurst(data);
        }
        break;

      case 'weapon_shot_fx':
        if (data && data.shooterId !== this.myId) {
          const o = Array.isArray(data.origin)
            ? { x: data.origin[0], y: data.origin[1], z: data.origin[2] }
            : (data.origin && typeof data.origin === 'object' ? data.origin : null);
          const hp = Array.isArray(data.hitPos)
            ? { x: data.hitPos[0], y: data.hitPos[1], z: data.hitPos[2] }
            : (data.hitPos && typeof data.hitPos === 'object' ? data.hitPos : null);
          const d = Array.isArray(data.dir)
            ? { x: data.dir[0], y: data.dir[1], z: data.dir[2] }
            : (data.dir && typeof data.dir === 'object' ? data.dir : { x: 0, y: 0, z: -1 });
          if (o && this.particles && typeof this.particles.spawnMuzzleFlash === 'function') {
            this.particles.spawnMuzzleFlash(o);
          }
          if (o && this.particles && typeof this.particles.spawnBulletTracer === 'function') {
            const target = hp || { x: o.x + d.x * 65, y: o.y + d.y * 65, z: o.z + d.z * 65 };
            this.particles.spawnBulletTracer(o, target);
          }
        }
        break;

      case 'weapon_hit':
        if (data && this.onWeaponHit) {
          this.onWeaponHit(data);
        }
        break;

      case 'tnt_primed':
        if (data && this.onTntPrime) {
          this.onTntPrime(data.x, data.y, data.z, data.fuseMs || 1600);
        }
        break;

      case 'tnt_explode':
        if (data) {
          const destroyed = data.destroyedBlocks || data.destroyed;
          if (Array.isArray(destroyed)) {
            for (const [bx, by, bz] of destroyed) {
              if (typeof this.world.applyBlockDelta === 'function') {
                this.world.applyBlockDelta(bx, by, bz, 0);
              } else if (typeof this.world.setBlock === 'function') {
                this.world.setBlock(bx, by, bz, 0, true);
              }
            }
            if (typeof this.checkAvatarsGroundAfterBlockBreak === 'function') {
              this.checkAvatarsGroundAfterBlockBreak();
            }
          }
          if (this.particles && typeof this.particles.spawnExplosion === 'function') {
            this.particles.spawnExplosion(data.x, data.y, data.z);
          }
          if (sound && typeof sound.playExplosion === 'function') {
            sound.playExplosion();
          }
          if (this.onTntExplode) {
            this.onTntExplode(data);
          }
        }
        break;

      case 'block_update':
        // Synchronized block change
        const { x, y, z, blockType, playerId, affectedPlayers } = data;
        const key = `${x},${y},${z}`;
        this.pendingModifications.delete(key);

        const previousBlock = this.world.getBlock(x, y, z);

        // Spawn debris particles if block was destroyed
        if (blockType === 0 && previousBlock !== 0) {
          this.particles.spawnBlockDebris(x, y, z);
        }

        // Trigger arm swing on the avatar who modified the block
        if (playerId && playerId !== this.myId) {
          const remote = this.remoteAvatars.get(playerId);
          if (remote) remote.triggerSwing();
        }

        // Apply authoritative block delta across client world
        this.world.applyBlockDelta(x, y, z, blockType);

        // If block was broken, immediately check supporting blocks and update ground detection
        if (blockType === 0) {
          this.checkAvatarsGroundAfterBlockBreak(x, y, z);
        }

        // If server provided affected players who fell, synchronize their authoritative positions
        if (Array.isArray(affectedPlayers)) {
          for (const ap of affectedPlayers) {
            if (ap.id !== this.myId) {
              const remote = this.remoteAvatars.get(ap.id);
              if (remote) {
                remote.setTargetState(ap.pos, null, null);
                remote.updateGroundDetection();
              }
            }
          }
        }
        break;

      case 'block_reject':
        // Rollback optimistic modification on server rejection
        const rejKey = `${data.x},${data.y},${data.z}`;
        if (this.pendingModifications.has(rejKey)) {
          const original = this.pendingModifications.get(rejKey);
          this.pendingModifications.delete(rejKey);
          this.world.applyBlockDelta(data.x, data.y, data.z, original);
          this.checkAvatarsGroundAfterBlockBreak(data.x, data.y, data.z);
        }
        if (this.onError) {
          this.onError(data.reason || 'Modificación no permitida');
        }
        break;

      case 'teleport_confirm':
        if (this.onTeleportConfirm && data) {
          const x = typeof data.x === 'number' ? data.x : (Array.isArray(data.pos) ? data.pos[0] : 0);
          const y = typeof data.y === 'number' ? data.y : (Array.isArray(data.pos) ? data.pos[1] : 25);
          const z = typeof data.z === 'number' ? data.z : (Array.isArray(data.pos) ? data.pos[2] : 0);
          this.onTeleportConfirm(x, y, z, data.targetName || 'Jugador');
        }
        break;

      case 'chat_broadcast':
        if (this.onChatMessage) {
          this.onChatMessage(data.senderName, data.text);
        }
        break;

      case 'error':
        if (this.onError) {
          this.onError(data.message || 'Error del servidor');
        }
        break;
    }
  }

  addRemotePlayer(p) {
    if (this.remoteAvatars.has(p.id) || p.id === this.myId) return;
    const avatar = new Avatar(p.id, p.name, this.scene, this.world);
    avatar.world = this.world;
    if (p.pos) {
      avatar.group.position.set(p.pos[0], p.pos[1], p.pos[2]);
      avatar.setTargetState(p.pos, p.rot, p.action);
    }
    this.remoteAvatars.set(p.id, avatar);
  }

  removeRemotePlayer(id) {
    const avatar = this.remoteAvatars.get(id);
    if (avatar) {
      avatar.dispose();
      this.remoteAvatars.delete(id);
    }
  }

  sendMove(pos, rot, action) {
    if (!this.connected) return;
    const now = Date.now();
    if (now - this.lastSendTime < this.sendInterval) return;

    // Check if player moved significantly to save network traffic
    const dx = Math.abs(pos.x - this.lastSentPos[0]);
    const dy = Math.abs(pos.y - this.lastSentPos[1]);
    const dz = Math.abs(pos.z - this.lastSentPos[2]);
    const dyaw = Math.abs(rot.yaw - this.lastSentRot[0]);
    const dpitch = Math.abs(rot.pitch - this.lastSentRot[1]);

    if (dx < 0.01 && dy < 0.01 && dz < 0.01 && dyaw < 0.01 && dpitch < 0.01) {
      return;
    }

    this.lastSendTime = now;
    this.lastSentPos = [pos.x, pos.y, pos.z];
    this.lastSentRot = [rot.yaw, rot.pitch];

    this.send('move', {
      pos: [
        Math.round(pos.x * 100) / 100,
        Math.round(pos.y * 100) / 100,
        Math.round(pos.z * 100) / 100
      ],
      rot: [
        Math.round(rot.yaw * 100) / 100,
        Math.round(rot.pitch * 100) / 100
      ],
      action: action || 'idle'
    });
  }

  sendBlockModify(x, y, z, blockType) {
    // Optimistic local update using applyBlockDelta to sync local deltas Map
    const previous = this.world.getBlock(x, y, z);
    const key = `${x},${y},${z}`;
    this.pendingModifications.set(key, previous);

    if (blockType === 0 && previous !== 0) {
      this.particles.spawnBlockDebris(x, y, z);
    }
    this.world.applyBlockDelta(x, y, z, blockType);

    // If block was broken, immediately check supporting blocks and update ground detection
    if (blockType === 0) {
      this.checkAvatarsGroundAfterBlockBreak(x, y, z);
    }

    // Send request to server
    this.send('block_modify', { x, y, z, blockType });
  }

  /**
   * Checks ground detection for all remote avatars and local physics when a block is removed
   */
  checkAvatarsGroundAfterBlockBreak(x, y, z) {
    for (const avatar of this.remoteAvatars.values()) {
      if (!avatar) continue;
      if (typeof avatar.onSupportingBlockRemoved === 'function') {
        avatar.onSupportingBlockRemoved(x, y, z);
      } else if (typeof avatar.updateGroundDetection === 'function') {
        avatar.updateGroundDetection();
      }
    }

    if (this.physics && typeof this.physics.onBlockBroken === 'function') {
      this.physics.onBlockBroken(x, y, z);
    }
  }

  sendWeaponToggle(enabled) {
    this.send('weapon_toggle', { enabled: Boolean(enabled) });
  }

  sendWeaponShoot(payload) {
    this.send('weapon_shoot', payload);
  }

  sendTntTrigger(x, y, z, fuseMs = 1800) {
    this.send('tnt_trigger', { x, y, z, fuseMs });
  }

  /**
   * Raycast against remote players' avatars for non-lethal rifle hits
   */
  getRaycastPlayerHit(rayOrigin, rayDir, maxDist = 80) {
    let closestId = null;
    let closestName = null;
    let closestDist = maxDist;

    for (const [id, avatar] of this.remoteAvatars.entries()) {
      if (!avatar || !avatar.currentPos) continue;
      const center = {
        x: avatar.currentPos.x,
        y: avatar.currentPos.y + 0.9,
        z: avatar.currentPos.z
      };
      const vx = center.x - rayOrigin.x;
      const vy = center.y - rayOrigin.y;
      const vz = center.z - rayOrigin.z;
      const proj = vx * rayDir.x + vy * rayDir.y + vz * rayDir.z;
      if (proj < 0 || proj > closestDist) continue;

      const distSq = vx * vx + vy * vy + vz * vz;
      const perpSq = distSq - proj * proj;
      if (perpSq <= 0.65 * 0.65) {
        closestDist = proj;
        closestId = id;
        closestName = avatar.name;
      }
    }

    if (!closestId) return null;
    return { id: closestId, name: closestName, distance: closestDist };
  }

  sendChat(text) {
    if (!text || !text.trim()) return;
    this.send('chat', { text: text.trim() });
  }

  requestTeleportToPlayer(targetPlayerId) {
    if (!this.connected || !targetPlayerId) return;
    this.send('teleport_to_player', { targetPlayerId });
  }

  shareLocation(x, y, z, sectorName) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const sector = sectorName ? (sectorName.startsWith('[') ? sectorName : `[${sectorName}]`) : '[Tierras del Reino]';
    const msg = `📍 Mi ubicación: ${sector} (X: ${rx}, Y: ${ry}, Z: ${rz}) — [Clic para Teletransportarse]`;
    this.sendChat(msg);

    // Update browser URL query string and copy shareable link if supported
    try {
      if (typeof window !== 'undefined' && window.location && window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set('tp', `${rx},${ry},${rz}`);
        window.history.replaceState({}, '', url.toString());
        if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(url.toString()).catch(() => {});
        }
      }
    } catch (_) {
      // Ignore in headless test environments
    }

    return msg;
  }

  update(dt) {
    for (const avatar of this.remoteAvatars.values()) {
      avatar.update(dt);
    }
  }
}

