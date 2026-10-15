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
    this.timeOfDay = 0.35; // Default morning

    // Throttled movement packets
    this.lastSendTime = 0;
    this.sendInterval = 45; // ~22 updates/sec
    this.lastSentPos = [0, 0, 0];
    this.lastSentRot = [0, 0];

    // Callbacks for UI
    this.onConnected = null;
    this.onDisconnected = null;
    this.onPlayerCountChange = null;
    this.onChatMessage = null;
    this.onNotification = null;
    this.onError = null;
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
        this.timeOfDay = data.timeOfDay || 0.35;

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

      case 'block_update':
        // Synchronized block change
        const { x, y, z, blockType, playerId } = data;
        const previousBlock = this.world.getBlock(x, y, z);

        // Spawn debris particles if block was destroyed
        if (blockType === 0 && previousBlock !== 0) {
          this.particles.spawnBlockDebris(x, y, z);
        }

        this.world.setBlock(x, y, z, blockType, true);
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
    const avatar = new Avatar(p.id, p.name, this.scene);
    if (p.pos) avatar.setTargetState(p.pos, p.rot, p.action);
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
    // Optimistic local update
    const previous = this.world.getBlock(x, y, z);
    if (blockType === 0 && previous !== 0) {
      this.particles.spawnBlockDebris(x, y, z);
    }
    this.world.setBlock(x, y, z, blockType, true);

    // Send request to server
    this.send('block_modify', { x, y, z, blockType });
  }

  sendChat(text) {
    if (!text || !text.trim()) return;
    this.send('chat', { text: text.trim() });
  }

  update(dt) {
    for (const avatar of this.remoteAvatars.values()) {
      avatar.update(dt);
    }
  }
}
