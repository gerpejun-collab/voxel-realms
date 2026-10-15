// server/game-state.js
// In-memory authority for world state, player tracking, and block modifications

class GameState {
  constructor(seed = 48151623) {
    this.seed = Number(seed) || 48151623;
    this.players = new Map(); // id -> player object
    this.blockDeltas = new Map(); // "x,y,z" -> blockType
    this.startTime = Date.now();
    this.dayDurationSeconds = 600; // 10 minute full day/night cycle
  }

  /**
   * Returns normalized day time from 0.0 (midnight) to 0.5 (noon) to 1.0 (midnight)
   */
  getTimeOfDay() {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    return (elapsedSeconds % this.dayDurationSeconds) / this.dayDurationSeconds;
  }

  addPlayer(id, name) {
    // Generate safe unique name if duplicate
    let finalName = name;
    const existingNames = new Set(Array.from(this.players.values()).map(p => p.name.toLowerCase()));
    let counter = 1;
    while (existingNames.has(finalName.toLowerCase())) {
      finalName = `${name}_${counter++}`;
    }

    const player = {
      id,
      name: finalName,
      pos: [0, 32, 0], // Default spawn point, will be adjusted by client terrain height
      rot: [0, 0],     // [yaw, pitch]
      action: 'idle',
      lastUpdate: Date.now()
    };

    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    this.players.delete(id);
    return player;
  }

  getPlayer(id) {
    return this.players.get(id);
  }

  updatePlayer(id, data) {
    const player = this.players.get(id);
    if (!player) return null;

    if (data.pos) {
      player.pos[0] = data.pos[0];
      player.pos[1] = data.pos[1];
      player.pos[2] = data.pos[2];
    }
    if (data.rot) {
      player.rot[0] = data.rot[0];
      player.rot[1] = data.rot[1];
    }
    if (data.action) {
      player.action = data.action;
    }
    player.lastUpdate = Date.now();
    return player;
  }

  /**
   * Apply a block modification if valid.
   * Player must be within reach distance (max 10 blocks) of target.
   */
  modifyBlock(playerId, x, y, z, blockType) {
    const player = this.players.get(playerId);
    if (player) {
      const dx = player.pos[0] - (x + 0.5);
      const dy = player.pos[1] - (y + 0.5);
      const dz = player.pos[2] - (z + 0.5);
      const distSq = dx * dx + dy * dy + dz * dz;
      // Allow up to 10 blocks distance
      if (distSq > 100) {
        return { success: false, reason: 'Out of reach' };
      }

      // Check if placing a block inside the player's own bounding box
      if (blockType > 0) {
        const px = player.pos[0];
        const py = player.pos[1];
        const pz = player.pos[2];
        const pMinX = px - 0.35, pMaxX = px + 0.35;
        const pMinY = py, pMaxY = py + 1.8;
        const pMinZ = pz - 0.35, pMaxZ = pz + 0.35;

        const bMinX = x, bMaxX = x + 1;
        const bMinY = y, bMaxY = y + 1;
        const bMinZ = z, bMaxZ = z + 1;

        const intersects = (pMinX < bMaxX && pMaxX > bMinX) &&
                           (pMinY < bMaxY && pMaxY > bMinY) &&
                           (pMinZ < bMaxZ && pMaxZ > bMinZ);
        if (intersects) {
          return { success: false, reason: 'Cannot place block inside player' };
        }
      }
    }

    const key = `${x},${y},${z}`;
    this.blockDeltas.set(key, blockType);

    return {
      success: true,
      delta: { x, y, z, blockType, playerId }
    };
  }

  /**
   * Get delta block at coordinate if present
   */
  getBlock(x, y, z) {
    const key = `${x},${y},${z}`;
    return this.blockDeltas.has(key) ? this.blockDeltas.get(key) : null;
  }

  /**
   * Snapshot for a newly connecting client
   */
  getInitialState(forPlayerId) {
    const playerList = [];
    for (const [id, p] of this.players.entries()) {
      if (id !== forPlayerId) {
        playerList.push({
          id: p.id,
          name: p.name,
          pos: p.pos,
          rot: p.rot,
          action: p.action
        });
      }
    }

    // Convert block deltas map to array of [x, y, z, type]
    const deltas = [];
    for (const [key, type] of this.blockDeltas.entries()) {
      const [x, y, z] = key.split(',').map(Number);
      deltas.push([x, y, z, type]);
    }

    return {
      seed: this.seed,
      players: playerList,
      deltas: deltas,
      timeOfDay: this.getTimeOfDay()
    };
  }

  /**
   * Broadcast payload of all player positions
   */
  getPlayersSnapshot() {
    const list = [];
    for (const [id, p] of this.players.entries()) {
      list.push({
        id: p.id,
        pos: [
          Math.round(p.pos[0] * 100) / 100,
          Math.round(p.pos[1] * 100) / 100,
          Math.round(p.pos[2] * 100) / 100
        ],
        rot: [
          Math.round(p.rot[0] * 100) / 100,
          Math.round(p.rot[1] * 100) / 100
        ],
        action: p.action
      });
    }
    return list;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameState };
}
