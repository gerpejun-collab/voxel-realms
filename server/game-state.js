// server/game-state.js
// In-memory authority for world state, player tracking, and block modifications

class GameState {
  constructor(seed = 48151623, maxPlayers = 30) {
    this.seed = Number(seed) || 48151623;
    this.maxPlayers = Number(maxPlayers) || 30;
    this.players = new Map(); // id -> player object
    this.blockDeltas = new Map(); // "x,y,z" -> blockType
    this.animals = new Map(); // animalId -> { id, type, x, y, z, yaw, state }
    this.nextAnimalId = 1;
    this.startTime = Date.now();
    this.dayDurationSeconds = 600; // 10 minute full day/night cycle
    this.animalTypes = ['sheep', 'pig', 'cow', 'chicken', 'wolf', 'horse'];

    this.initAmbientAnimals();
  }

  /**
   * Returns normalized day time from 0.0 (midnight) to 0.5 (noon) to 1.0 (midnight)
   * Fixed at 0.32 (perpetual bright sunny day mode) per strict user instruction.
   */
  getTimeOfDay() {
    return 0.32;
  }

  /**
   * Checks whether (wx, wz) is on a road, highway, bridge, or roundabout
   */
  isRoadAt(wx, wz) {
    const distCenter = Math.hypot(wx, wz);
    // Ring road around Central Plaza (radius 19..23)
    if (distCenter >= 18.5 && distCenter <= 23.5) return true;
    // North-South Main Highway (x in -3..3, z in -480..480) outside inner plaza
    if (Math.abs(wx) <= 3.5 && distCenter > 18 && Math.abs(wz) <= 485) return true;
    // East-West Arterial & Diagonal connectors to the 4 quadrants
    if (Math.abs(wz) <= 3.5 && distCenter > 18 && Math.abs(wx) <= 260) return true;
    // Diagonal highways to (+250,+250), (-250,+250), (+250,-250), (-250,-250)
    if (Math.abs(wx) >= 16 && Math.abs(wx) <= 245 && Math.abs(wz) >= 16 && Math.abs(wz) <= 245) {
      if (Math.abs(Math.abs(wx) - Math.abs(wz)) <= 3.5) return true;
    }
    // NYC / Shanghai / Paris / Japan internal avenues
    if (Math.hypot(wx + 250, wz + 250) <= 60 && (Math.abs((wx + 250) % 12) <= 1.5 || Math.abs((wz + 250) % 12) <= 1.5)) return true;
    return false;
  }

  /**
   * Checks whether (wx, wz) is in water, ocean, fjord gorge, or pond
   */
  isWaterZone(wx, wz, groundY = 24) {
    if (groundY <= 18) return true;
    // Norway Fjord gorge water channel
    if (wz >= 435 && wz <= 565 && Math.abs(wx) <= 10) return true;
    // Tropical Beach ocean water (south of z = -485)
    if (wz <= -485 && Math.abs(wx) <= 95) return true;
    // Japan Zen Pond & canal
    if (wx >= 236 && wx <= 246 && wz >= 248 && wz <= 256) return true;
    // Paris Reflecting Pool & Seine canal
    if (wx >= 247 && wx <= 253 && wz >= -242 && wz <= -238) return true;
    return false;
  }

  /**
   * Checks whether (wx, wz) is inside a solid monument building or rock structure
   */
  isInsideStructureOrRock(wx, wz) {
    // Central Plaza inner altar & guardian pedestals
    if (Math.hypot(wx, wz) <= 16) return true;
    // Major monument core footprints
    if (Math.hypot(wx - 250, wz - 250) <= 10) return true; // Pagoda
    if (Math.hypot(wx + 250, wz - 250) <= 12) return true; // Shanghai Tower
    if (Math.hypot(wx - 250, wz + 250) <= 10) return true; // Eiffel Tower
    if (Math.hypot(wx + 250, wz + 250) <= 12) return true; // Empire State
    // Check if a solid block delta was placed at ground level
    const b1 = this.getBlock(Math.floor(wx), 25, Math.floor(wz));
    const b2 = this.getBlock(Math.floor(wx), 26, Math.floor(wz));
    if ((b1 !== null && b1 > 0) || (b2 !== null && b2 > 0)) return true;
    return false;
  }

  /**
   * Validates if an animal is allowed to spawn at (wx, wz, groundY)
   * Never in water, never on roads, never inside rocks/buildings
   */
  isValidAnimalSpawn(wx, wz, groundY = 24) {
    if (typeof wx !== 'number' || typeof wz !== 'number' || !Number.isFinite(wx) || !Number.isFinite(wz)) return false;
    if (groundY <= 18 || groundY > 46) return false;
    if (this.isWaterZone(wx, wz, groundY)) return false;
    if (this.isRoadAt(wx, wz)) return false;
    if (this.isInsideStructureOrRock(wx, wz)) return false;
    return true;
  }

  initAmbientAnimals() {
    const seeds = [
      { type: 'sheep',   x: 28,  z: 14,  y: 25 },
      { type: 'sheep',   x: 32,  z: 18,  y: 25 },
      { type: 'cow',     x: 26,  z: -16, y: 25 },
      { type: 'cow',     x: -28, z: 16,  y: 25 },
      { type: 'pig',     x: -30, z: -14, y: 25 },
      { type: 'pig',     x: -34, z: 12,  y: 25 },
      { type: 'chicken', x: 25,  z: -28, y: 25 },
      { type: 'chicken', x: -25, z: 28,  y: 25 },
      { type: 'wolf',    x: 42,  z: 10,  y: 25 },
      { type: 'horse',   x: -40, z: -12, y: 25 },
      { type: 'sheep',   x: 226, z: 264, y: 25 },
      { type: 'horse',   x: 268, z: -232, y: 25 }
    ];

    for (const s of seeds) {
      if (this.isValidAnimalSpawn(s.x, s.z, s.y)) {
        const id = `anim_${this.nextAnimalId++}`;
        this.animals.set(id, {
          id,
          type: s.type,
          x: s.x,
          y: s.y,
          z: s.z,
          yaw: ((this.nextAnimalId * 1.37) % (Math.PI * 2)),
          state: 'idle'
        });
      }
    }
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
      pos: [0, 25, 0], // Default spawn point at central plaza
      rot: [0, 0],     // [yaw, pitch]
      action: 'idle',
      weaponsEnabled: false,
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
    if (typeof data.weaponsEnabled === 'boolean') {
      player.weaponsEnabled = data.weaponsEnabled;
    }
    player.lastUpdate = Date.now();
    return player;
  }

  /**
   * Toggle weapons mode for a player and reconcile shared area animal density without duplication
   */
  setPlayerWeaponsMode(playerId, enabled) {
    const player = this.players.get(playerId);
    if (!player) return null;
    player.weaponsEnabled = !!enabled;
    this.reconcileAreaAnimals();
    return player;
  }

  /**
   * Ensures armed players have higher nearby animal probability on valid land
   * while guaranteeing NO duplication if another player is within the same area range (45 blocks)
   */
  reconcileAreaAnimals() {
    const AREA_RADIUS = 45;
    const BASE_AREA_CAP = 5;
    const ARMED_AREA_CAP = 9;

    const visitedPlayers = new Set();
    const clusters = [];

    for (const p of this.players.values()) {
      if (visitedPlayers.has(p.id)) continue;
      visitedPlayers.add(p.id);

      const clusterPlayers = [p];
      let sumX = p.pos[0];
      let sumY = p.pos[1];
      let sumZ = p.pos[2];
      let anyArmed = !!p.weaponsEnabled;

      for (const other of this.players.values()) {
        if (visitedPlayers.has(other.id)) continue;
        const dist = Math.hypot(other.pos[0] - p.pos[0], other.pos[2] - p.pos[2]);
        if (dist <= AREA_RADIUS) {
          visitedPlayers.add(other.id);
          clusterPlayers.push(other);
          sumX += other.pos[0];
          sumY += other.pos[1];
          sumZ += other.pos[2];
          if (other.weaponsEnabled) anyArmed = true;
        }
      }

      clusters.push({
        cx: sumX / clusterPlayers.length,
        cy: sumY / clusterPlayers.length,
        cz: sumZ / clusterPlayers.length,
        anyArmed,
        players: clusterPlayers
      });
    }

    const spawnedAnimals = [];

    for (const cluster of clusters) {
      // If cluster center itself is underwater, do not spawn extra animals around swimmer
      if (this.isWaterZone(cluster.cx, cluster.cz, cluster.cy)) {
        continue;
      }

      const targetCap = cluster.anyArmed ? ARMED_AREA_CAP : BASE_AREA_CAP;

      // Count how many animals already exist within AREA_RADIUS of this cluster
      let existingInArea = 0;
      for (const anim of this.animals.values()) {
        if (Math.hypot(anim.x - cluster.cx, anim.z - cluster.cz) <= AREA_RADIUS) {
          existingInArea++;
        }
      }

      const needed = Math.max(0, targetCap - existingInArea);
      let attempts = 0;
      let added = 0;

      while (added < needed && attempts < 36) {
        attempts++;
        const angle = ((this.nextAnimalId * 2.39996) + attempts * 0.785) % (Math.PI * 2);
        const dist = 16 + ((this.nextAnimalId * 7 + attempts * 5) % 24); // Ring 16..40 blocks away (never under feet)
        const sx = Math.round(cluster.cx + Math.cos(angle) * dist);
        const sz = Math.round(cluster.cz + Math.sin(angle) * dist);
        const sy = 25;

        if (!this.isValidAnimalSpawn(sx, sz, sy)) continue;

        // Ensure not too close to existing animals
        let tooClose = false;
        for (const anim of this.animals.values()) {
          if (Math.hypot(anim.x - sx, anim.z - sz) < 4.0) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;

        const id = `anim_${this.nextAnimalId++}`;
        const type = this.animalTypes[this.nextAnimalId % this.animalTypes.length];
        const newAnim = {
          id,
          type,
          x: sx,
          y: sy,
          z: sz,
          yaw: Math.round(angle * 100) / 100,
          state: 'walking'
        };
        this.animals.set(id, newAnim);
        spawnedAnimals.push(newAnim);
        added++;
      }
    }

    return spawnedAnimals;
  }

  /**
   * Burst/destroy an animal when hit by weapon or TNT
   */
  hitAnimal(animalId, shooterId = null) {
    const anim = this.animals.get(animalId);
    if (!anim) return null;
    this.animals.delete(animalId);
    // Replenish shared area animals if needed
    this.reconcileAreaAnimals();
    return {
      animalId: anim.id,
      type: anim.type,
      x: anim.x,
      y: anim.y,
      z: anim.z,
      shooterId
    };
  }

  /**
   * Detonate a reactive TNT at (x, y, z), destroying blocks in radius and bursting nearby animals
   */
  detonateTnt(x, y, z, radius = 3) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const destroyedBlocks = [];

    // Clear the TNT block itself and surrounding blocks above bedrock (y >= 19)
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dy * dy + dz * dz <= radius * radius) {
            const bx = rx + dx;
            const by = ry + dy;
            const bz = rz + dz;
            if (by >= 19 && by < 63) {
              const key = `${bx},${by},${bz}`;
              this.blockDeltas.set(key, 0);
              destroyedBlocks.push([bx, by, bz]);
            }
          }
        }
      }
    }

    // Burst any animals within blast radius (radius + 3)
    const hitAnimals = [];
    const blastRange = radius + 3.5;
    for (const [id, anim] of this.animals.entries()) {
      const dist = Math.hypot(anim.x - rx, (anim.y || 25) - ry, anim.z - rz);
      if (dist <= blastRange) {
        hitAnimals.push(anim);
        this.animals.delete(id);
      }
    }

    if (hitAnimals.length > 0) {
      this.reconcileAreaAnimals();
    }

    return {
      x: rx,
      y: ry,
      z: rz,
      radius,
      destroyedBlocks,
      hitAnimalIds: hitAnimals.map(a => a.id),
      hitAnimals
    };
  }

  getAnimalsSnapshot() {
    return Array.from(this.animals.values());
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
        const pMinX = px - 0.3, pMaxX = px + 0.3;
        const pMinY = py, pMaxY = py + 1.8;
        const pMinZ = pz - 0.3, pMaxZ = pz + 0.3;

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
          action: p.action,
          weaponsEnabled: !!p.weaponsEnabled
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
      animals: this.getAnimalsSnapshot(),
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
        action: p.action,
        weaponsEnabled: !!p.weaponsEnabled
      });
    }
    return list;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameState };
}

