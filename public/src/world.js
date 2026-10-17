// public/src/world.js
// Procedural voxel terrain generation, chunk streaming, and world state
import { Chunk, CHUNK_WIDTH, CHUNK_HEIGHT, CHUNK_DEPTH } from './chunks.js';
import { BLOCKS } from './blocks.js';
import { noise } from './textures.js';

export const WATER_LEVEL = 18;

export class World {
  constructor(scene, materialManager, seed = 48151623) {
    this.scene = scene;
    this.materials = materialManager;
    this.seed = seed;
    this.chunks = new Map(); // "cx,cz" -> Chunk
    this.remeshQueue = [];
    this.renderDistance = 5; // Default chunk radius
    this.boostMode = false;
    this.maxRemeshPerFrame = 3;
    this.blockDeltas = new Map(); // Local record of server deltas "x,y,z" -> blockType
    this.blockHooks = [];
    this.onAuthoritativeBlock = null;
  }

  setBoostMode(enabled) {
    this.boostMode = !!enabled;
    if (this.boostMode) {
      this.renderDistance = Math.max(this.renderDistance, 9);
      this.maxRemeshPerFrame = 8;
    } else {
      this.maxRemeshPerFrame = 3;
    }
  }

  getChunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  getChunk(cx, cz) {
    return this.chunks.get(this.getChunkKey(cx, cz)) || null;
  }

  getOrCreateChunk(cx, cz) {
    const key = this.getChunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz, this);
      this.chunks.set(key, chunk);
      this.generateChunkTerrain(chunk);
    }
    return chunk;
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return BLOCKS.AIR;
    const cx = Math.floor(x / CHUNK_WIDTH);
    const cz = Math.floor(z / CHUNK_DEPTH);
    const chunk = this.chunks.get(this.getChunkKey(cx, cz));
    if (!chunk) return BLOCKS.AIR;

    const lx = ((x % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH;
    const lz = ((z % CHUNK_DEPTH) + CHUNK_DEPTH) % CHUNK_DEPTH;
    return chunk.voxels[chunk.getIndex(lx, y, lz)];
  }

  setBlock(x, y, z, blockType, updateNeighbors = true) {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const cx = Math.floor(x / CHUNK_WIDTH);
    const cz = Math.floor(z / CHUNK_DEPTH);
    const chunk = this.getOrCreateChunk(cx, cz);

    const lx = ((x % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH;
    const lz = ((z % CHUNK_DEPTH) + CHUNK_DEPTH) % CHUNK_DEPTH;

    chunk.setBlockLocal(lx, y, lz, blockType);
    this.queueRemesh(chunk);

    if (updateNeighbors) {
      if (lx === 0) this.queueRemesh(this.getChunk(cx - 1, cz));
      if (lx === CHUNK_WIDTH - 1) this.queueRemesh(this.getChunk(cx + 1, cz));
      if (lz === 0) this.queueRemesh(this.getChunk(cx, cz - 1));
      if (lz === CHUNK_DEPTH - 1) this.queueRemesh(this.getChunk(cx, cz + 1));
    }

    return true;
  }

  addBlockHook(fn) {
    if (!this.blockHooks) this.blockHooks = [];
    if (typeof fn === 'function' && !this.blockHooks.includes(fn)) {
      this.blockHooks.push(fn);
    }
  }

  removeBlockHook(fn) {
    if (!this.blockHooks) return;
    const idx = this.blockHooks.indexOf(fn);
    if (idx !== -1) this.blockHooks.splice(idx, 1);
  }

  /**
   * Immediately updates voxel memory and synchronously rebuilds the chunk mesh
   * (and boundary neighbors if on border) so excavated blocks disappear visually without lag.
   */
  applyAuthoritativeBlock(x, y, z, blockType) {
    const key = `${x},${y},${z}`;
    this.blockDeltas.set(key, blockType);

    // Update voxel memory immediately
    this.setBlock(x, y, z, blockType, false);

    const cx = Math.floor(x / CHUNK_WIDTH);
    const cz = Math.floor(z / CHUNK_DEPTH);
    const chunk = this.getChunk(cx, cz);
    if (chunk) {
      if (this.materials && typeof chunk.rebuildMesh === 'function') {
        try {
          chunk.rebuildMesh(this.materials);
        } catch (_) {}
      }
      chunk.isDirty = false;
      const qIdx = this.remeshQueue.indexOf(chunk);
      if (qIdx !== -1) this.remeshQueue.splice(qIdx, 1);
    }

    // Border chunk boundary check: lx === 0 || lx === 15 || lz === 0 || lz === 15
    const lx = ((x % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH;
    const lz = ((z % CHUNK_DEPTH) + CHUNK_DEPTH) % CHUNK_DEPTH;

    const remeshNeighbor = (ncx, ncz) => {
      const neighbor = this.getChunk(ncx, ncz);
      if (neighbor) {
        if (this.materials && typeof neighbor.rebuildMesh === 'function') {
          try {
            neighbor.rebuildMesh(this.materials);
          } catch (_) {}
        }
        neighbor.isDirty = false;
        const qIdx = this.remeshQueue.indexOf(neighbor);
        if (qIdx !== -1) this.remeshQueue.splice(qIdx, 1);
      }
    };

    if (lx === 0) remeshNeighbor(cx - 1, cz);
    if (lx === CHUNK_WIDTH - 1) remeshNeighbor(cx + 1, cz);
    if (lz === 0) remeshNeighbor(cx, cz - 1);
    if (lz === CHUNK_DEPTH - 1) remeshNeighbor(cx, cz + 1);

    // Notify registered block hooks
    if (typeof this.onAuthoritativeBlock === 'function') {
      try {
        this.onAuthoritativeBlock(x, y, z, blockType);
      } catch (_) {}
    }
    if (Array.isArray(this.blockHooks)) {
      for (const hook of this.blockHooks) {
        try {
          hook(x, y, z, blockType);
        } catch (_) {}
      }
    }
  }

  applyBlockDelta(x, y, z, blockType) {
    this.applyAuthoritativeBlock(x, y, z, blockType);
  }

  queueRemesh(chunk) {
    if (chunk) {
      chunk.isDirty = true;
      if (!this.remeshQueue.includes(chunk)) {
        this.remeshQueue.push(chunk);
      }
    }
  }

  /**
   * Safe voxel setter: sets a block at global world coordinates if inside this chunk
   */
  setVoxelInWorld(chunk, wx, wy, wz, blockType) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (wx >= ox && wx < ox + CHUNK_WIDTH && wz >= oz && wz < oz + CHUNK_DEPTH) {
      chunk.setBlockLocal(wx - ox, wy, wz - oz, blockType);
    }
  }

  /**
   * Returns true if coordinates lie on the interconnected highway/road/bridge network
   */
  isRoadAt(wx, wz) {
    const distCenter = Math.hypot(wx, wz);
    // 1. Central Plaza Roundabout ring (radius 19..23)
    if (distCenter >= 19 && distCenter <= 23) return true;
    // 2. North-South Main Arterial Highway (X in -3..3, Z in -465..438)
    if (Math.abs(wx) <= 3 && distCenter > 19 && wz >= -465 && wz <= 438) return true;
    // 3. East-West Main Arterial Highway (Z in -3..3, X in -232..232)
    if (Math.abs(wz) <= 3 && distCenter > 19 && Math.abs(wx) <= 232) return true;
    // 4. Eastern Sector Highway connecting Japan (+250,+250) and Paris (+250,-250) along X in 226..232
    if (wx >= 226 && wx <= 232 && Math.abs(wz) <= 250) return true;
    // 5. Western Sector Highway connecting Shanghai (-250,+250) and New York (-250,-250) along X in -232..-226
    if (wx >= -232 && wx <= -226 && Math.abs(wz) <= 250) return true;
    // 6. Norway High Cliff Suspension Bridge (Z in 466..470, X in -18..18)
    if (wz >= 466 && wz <= 470 && Math.abs(wx) <= 18) return true;
    // 7. Mount Fuji Scenic Highways: Eastbound corridor from Japan (Z in 247..253, X in 250..440) and Northbound along X in 437..443, Z in 250..465
    if (wz >= 247 && wz <= 253 && wx >= 250 && wx <= 440) return true;
    if (wx >= 437 && wx <= 443 && wz >= 250 && wz <= 465) return true;
    return false;
  }

  /**
   * Returns true if coordinates lie inside a Minecraft mountain tunnel pass
   */
  isTunnelAt(wx, wz) {
    // Dedicated mountain tunnel passes along the 4 main highways
    if (Math.abs(wx) <= 4 && wz >= 115 && wz <= 145) return true; // North Mountain Tunnel
    if (Math.abs(wx) <= 4 && wz >= -145 && wz <= -115) return true; // South Coastal Tunnel
    if (wx >= 225 && wx <= 233 && Math.abs(wz) >= 95 && Math.abs(wz) <= 125) return true; // East Mountain Tunnels
    if (wx >= -233 && wx <= -225 && Math.abs(wz) >= 95 && Math.abs(wz) <= 125) return true; // West Mountain Tunnels
    if (Math.abs(wz) <= 4 && Math.abs(wx) >= 110 && Math.abs(wx) <= 136) return true; // Central E-W Tunnels
    // Mount Fuji highway mountain passes
    if (wz >= 246 && wz <= 254 && wx >= 340 && wx <= 380) return true; // East Mountain Ridge Tunnel
    if (wx >= 436 && wx <= 444 && wz >= 370 && wz <= 415) return true; // Mount Fuji Pass Tunnel
    return false;
  }

  /**
   * Returns elevation of the road surface at (wx, wz)
   */
  getRoadHeightAt(wx, wz) {
    if (wz >= 466 && wz <= 470 && Math.abs(wx) <= 18) {
      return 50; // High Norway Fjord suspension bridge
    }
    return 24;
  }

  /**
   * Validates if an animal is allowed to spawn at (wx, wz)
   * Never in water, never on roads/bridges/tunnels, never buried inside rocks/buildings
   */
  isValidAnimalSpawn(wx, wz) {
    const bx = Math.floor(wx);
    const bz = Math.floor(wz);
    if (this.isRoadAt(bx, bz) || this.isTunnelAt(bx, bz)) return false;
    const h = this.getHeightAt(bx, bz);
    if (h <= WATER_LEVEL || h > 46) return false;
    // Reject ocean / fjord / pond zones
    if (bz <= -475 && Math.abs(bx) <= 85) return false;
    if (bz >= 435 && bz <= 565 && Math.abs(bx) <= 12) return false;
    if (Math.hypot(bx, bz) <= 18) return false;
    // If chunk is loaded, verify surface block is not water and headroom is clear
    const surfaceBlock = this.getBlock(bx, h, bz);
    if (surfaceBlock === BLOCKS.WATER) return false;
    const above1 = this.getBlock(bx, h + 1, bz);
    const above2 = this.getBlock(bx, h + 2, bz);
    if (above1 !== BLOCKS.AIR || above2 !== BLOCKS.AIR) return false;
    return true;
  }

  /**
   * Returns true if coordinates lie inside any of the monumental sectors (including Playa Paraíso and Mount Fuji)
   */
  isInsideMonument(wx, wz) {
    if (Math.hypot(wx, wz) <= 28) return true; // Spawn Plaza
    if (Math.hypot(wx - 250, wz - 250) <= 65) return true; // Japan Imperial District
    if (Math.hypot(wx + 250, wz - 250) <= 65) return true; // China & Shanghai District
    if (Math.hypot(wx - 250, wz + 250) <= 65) return true; // Paris & Eiffel District
    if (Math.hypot(wx + 250, wz + 250) <= 65) return true; // New York District
    if (wz >= 440 && wz <= 560 && Math.abs(wx) <= 55) return true; // Norway Fjords
    if (wz >= -560 && wz <= -440 && Math.abs(wx) <= 75) return true; // Playa Paraíso Beach Sector
    if (Math.abs(wx - (-500)) <= 125 && Math.abs(wz - (-500)) <= 125) return true; // Grand Prix Racing Circuit
    if (wx >= 45 && wx <= 215 && wz >= -195 && wz <= -35) return true; // Gran Circuito SE Quadrant
    if (Math.hypot(wx - 350, wz - 350) <= 70 || Math.hypot(wx - 500, wz - 500) <= 88) return true; // Mount Fuji Volcano & Reflection Lakes
    if (this.isRoadAt(wx, wz) || this.isTunnelAt(wx, wz)) return true;
    return false;
  }

  /**
   * Returns true if coordinates lie within the flat urban building plateaus
   */
  isInsidePlateau(wx, wz) {
    if (Math.hypot(wx, wz) <= 24) return true;
    if (Math.hypot(wx - 250, wz - 250) <= 56) return true;
    if (Math.hypot(wx + 250, wz - 250) <= 56) return true;
    if (Math.hypot(wx - 250, wz + 250) <= 56) return true;
    if (Math.hypot(wx + 250, wz + 250) <= 56) return true;
    if (Math.abs(wx - (-500)) <= 120 && Math.abs(wz - (-500)) <= 120) return true;
    if (wx >= 50 && wx <= 210 && wz >= -190 && wz <= -40) return true; // Gran Circuito Plateau
    return false;
  }

  /**
   * Natural procedural terrain height without monument plateaus
   */
  getNaturalHeightAt(wx, wz) {
    const continent = noise.fbm((wx + this.seed) / 140, (wz + this.seed) / 140, 4, 0.45);
    const hills = noise.fbm((wx - this.seed) / 45, (wz - this.seed) / 45, 4, 0.5);
    const ridge = Math.abs(noise.noise2D((wx + 500) / 70, (wz + 500) / 70));

    let naturalH = 22 + continent * 14 + hills * 10;
    if (continent > 0.3) {
      naturalH += Math.pow(ridge, 2) * 18;
    }
    return Math.floor(Math.max(4, Math.min(CHUNK_HEIGHT - 8, naturalH)));
  }

  /**
   * Colossal Mount Fuji Landmark centered at (+350, +350)
   * Rising 2.58x higher than surrounding terrain (Y=24) up to maximum world height Y=62.
   * Features symmetrical conical peak, volcanic caldera crater depression (Y=54..56),
   * snowline (Y>=46), and reflection lakes (Y=18) with floating torii.
   */
  getFujiHeight(wx, wz) {
    const fX = 350;
    const fZ = 350;

    // Southwestern Reflection Lake (Lake Kawaguchi) facing Japan Imperial
    const distLake1 = Math.hypot(wx - 305, wz - 305);
    if (distLake1 <= 14) {
      return 15; // Deep lake bed below WATER_LEVEL=18
    } else if (distLake1 <= 17) {
      const t = (distLake1 - 14) / 3;
      return Math.floor(15 + t * 9); // Shoreline transition 15..24
    }

    // Southeastern Reflection Pond (Lake Motosu)
    const distLake2 = Math.hypot(wx - 375, wz - 315);
    if (distLake2 <= 11) {
      return 15;
    } else if (distLake2 <= 14) {
      const t = (distLake2 - 11) / 3;
      return Math.floor(15 + t * 9);
    }

    const d = Math.hypot(wx - fX, wz - fZ);
    if (d > 68) return null;

    // 1. Volcanic Caldera Crater Depression for d <= 4: Y = 54..56
    if (d <= 4) {
      if (d <= 1) return 54;
      if (d <= 2.5) return 55;
      return 56;
    }

    // 2. Caldera Rim (Peak Summit) for 4 < d <= 6: Y = 62 (max world height)
    if (d <= 6) {
      return 62;
    }

    // 3. Snow-Capped Upper Cone for 6 < d <= 22: Y = 62 down to 46 (Snowline)
    if (d <= 22) {
      const t = (d - 6) / 16;
      return Math.round(62 - 16 * Math.pow(t, 0.85));
    }

    // 4. Volcanic Mid Flank for 22 < d <= 42: Y = 46 down to 32
    if (d <= 42) {
      const t = (d - 22) / 20;
      return Math.round(46 - 14 * t);
    }

    // 5. Lower Skirt for 42 < d <= 58: Y = 32 down to 24
    if (d <= 58) {
      const t = (d - 42) / 16;
      return Math.round(32 - 8 * Math.pow(t, 1.3));
    }

    // 6. Smooth Blending into surrounding terrain for 58 < d <= 68
    return 24;
  }

  /**
   * Deterministic height function with central spawn clearing, beach shoreline, and leveled monument plateaus
   */
  getHeightAt(wx, wz) {
    // 1. Norway Fjords & Nature: Colossal granite cliffs & deep ocean water gorge at (0, +500)
    if (wz >= 440 && wz <= 560 && Math.abs(wx) <= 55) {
      const distFromFjord = Math.abs(wx);
      if (distFromFjord <= 7) {
        return 13; // Deep canyon bed below water level 18
      } else if (distFromFjord <= 16) {
        const t = (distFromFjord - 7) / 9;
        return Math.floor(13 + t * (50 - 13));
      } else {
        const ridgeH = 50 + Math.floor(Math.abs(Math.sin(wx * 0.3 + wz * 0.15)) * 6);
        return Math.min(CHUNK_HEIGHT - 6, ridgeH);
      }
    }

    // 1.5. Colossal Mount Fuji Landmark & Reflection Lakes at (+350, +350)
    const fujiH = this.getFujiHeight(wx, wz);
    if (fujiH !== null) {
      return fujiH;
    }

    // 1.8. Mountain Ridge Overburden above Highway Tunnels
    if (this.isTunnelAt(wx, wz)) {
      const ridgeBase = 35;
      const ridgeH = ridgeBase + Math.floor(Math.abs(Math.sin(wx * 0.25 + wz * 0.25)) * 3);
      return ridgeH;
    }

    // 2. Playa Paraíso / Tropical Beach Sector at (0, -500) (wz in -560..-440, wx in -75..75)
    if (wz >= -560 && wz <= -440 && Math.abs(wx) <= 75) {
      if (wz >= -465) {
        // Resort & Palm Boardwalk terrace sloping gently from 24 down to 20
        const t = (wz - (-465)) / 25; // 0 at -465, 1 at -440
        return Math.floor(20 + t * 4);
      } else if (wz >= -490) {
        // Golden sand beach sloping into the sea (20 down to 18)
        const t = (wz - (-490)) / 25;
        return Math.floor(18 + t * 2);
      } else {
        // Turquoise lagoon & ocean bed (below WATER_LEVEL=18)
        return 13;
      }
    }

    // 2.4. Gran Circuito Internacional de Velocidad in SE Quadrant (wx in 50..210, wz in -190..-40)
    if (wx >= 50 && wx <= 210 && wz >= -190 && wz <= -40) {
      // Circuit Azure Lake for Lake Bridge (wx in 185..210, wz in -140..-100)
      if (wx >= 185 && wx <= 210 && wz >= -140 && wz <= -100) {
        return 14; // Lake bed below WATER_LEVEL=18
      }
      // Mountain Ridge for Racing Tunnel (wx in 70..130, wz in -165..-145)
      if (wx >= 70 && wx <= 130 && wz >= -165 && wz <= -145) {
        const mDist = Math.abs(wz - (-155));
        const ridge = 38 + Math.floor(Math.abs(Math.sin(wx * 0.2 + wz * 0.2)) * 4) - Math.floor(mDist * 0.5);
        return Math.max(26, Math.min(42, ridge));
      }
      return 24; // Leveled circuit plateau
    }

    // 2.5. Grand Prix Racing Circuit at (-500, -500) (wx in -625..-375, wz in -625..-375)
    if (Math.abs(wx - (-500)) <= 125 && Math.abs(wz - (-500)) <= 125) {
      // Azure Lake for the Lake Bridge (wx in -435..-385, wz in -525..-465)
      if (wx >= -435 && wx <= -385 && wz >= -525 && wz <= -465) {
        return 14; // Lake bed below WATER_LEVEL=18
      }
      // Mountain Ridge for Mountain Tunnels (wz in -615..-565, wx in -580..-430)
      if (wz >= -615 && wz <= -565 && wx >= -580 && wx <= -430) {
        const mDist = Math.abs(wz - (-585));
        const ridge = 44 + Math.floor(Math.abs(Math.sin(wx * 0.15 + wz * 0.2)) * 6) - Math.floor(mDist * 0.4);
        return Math.max(26, Math.min(50, ridge));
      }
      return 24; // Leveled circuit plateau
    }

    // 2.6. Mount Fuji (Monte Fuji) Colossal Volcano at (+500, +500)
    const distFuji = Math.hypot(wx - 500, wz - 500);
    if (distFuji <= 88) {
      // Base Reflection Lakes: Lake Kawaguchi at (438, 485) and Lake Yamanaka at (485, 438)
      const dLake1 = Math.hypot(wx - 438, wz - 485);
      const dLake2 = Math.hypot(wx - 485, wz - 438);
      const minLakeDist = Math.min(dLake1, dLake2);
      if (minLakeDist <= 14) {
        // Reflection lake bed at Y = 21, filled with water up to Y = 24
        return 21;
      } else if (minLakeDist <= 17) {
        // Sandy shoreline slope
        const t = (minLakeDist - 14) / 3;
        return Math.floor(21 + t * 3);
      }

      // Symmetrical conical volcanic profile rising 2.5x higher than other mountains up to maximum world height Y = 62
      if (distFuji <= 9) {
        // Open basalt caldera crater: rim at Y=62, center basin drops to Y=54
        const t = distFuji / 9;
        return Math.floor(54 + t * t * 8);
      } else if (distFuji <= 76) {
        // Classic conical stratovolcano profile curving up to Y=62
        const t = (distFuji - 9) / 67;
        const curve = Math.pow(1 - t, 1.45);
        return Math.min(62, Math.floor(24 + 38 * curve));
      } else {
        // Smooth base transition to surrounding landscape
        const naturalH = this.getNaturalHeightAt(wx, wz);
        const t = (distFuji - 76) / 12;
        const smoothT = t * t * (3 - 2 * t);
        return Math.floor(24 * (1 - smoothT) + naturalH * smoothT);
      }
    }

    const BASE_HEIGHT = 24;

    // 3. Central Spawn Plaza clearing (0, 0)
    const distSpawn = Math.hypot(wx, wz);
    if (distSpawn <= 26) {
      return BASE_HEIGHT;
    } else if (distSpawn < 38) {
      const naturalH = this.getNaturalHeightAt(wx, wz);
      const t = (distSpawn - 26) / 12;
      const smoothT = t * t * (3 - 2 * t);
      return Math.floor(BASE_HEIGHT * (1 - smoothT) + naturalH * smoothT);
    }

    // 4. Four Expansive Custom Monument Districts at (+250, +250), (-250, +250), (+250, -250), (-250, -250)
    const centers = [
      [250, 250],   // Japan Imperial District
      [-250, 250],  // China & Shanghai District
      [250, -250],  // Paris & Eiffel Tower District
      [-250, -250]  // New York District
    ];
    for (let i = 0; i < 4; i++) {
      const [cx, cz] = centers[i];
      if (Math.abs(wx - cx) <= 75 && Math.abs(wz - cz) <= 75) {
        const d = Math.hypot(wx - cx, wz - cz);
        if (d <= 58) {
          return BASE_HEIGHT;
        } else if (d < 74) {
          const naturalH = this.getNaturalHeightAt(wx, wz);
          const t = (d - 58) / 16;
          const smoothT = t * t * (3 - 2 * t);
          return Math.floor(BASE_HEIGHT * (1 - smoothT) + naturalH * smoothT);
        }
      }
    }

    return this.getNaturalHeightAt(wx, wz);
  }

  /**
   * Generates procedural terrain, strata, water, ores, trees, roads, tunnels, bridges, beach, and 6 monumental sectors
   */
  generateChunkTerrain(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;

    for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
      for (let lz = 0; lz < CHUNK_DEPTH; lz++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const surfaceY = this.getHeightAt(wx, wz);
        const distCenter = Math.hypot(wx, wz);

        // Bedrock & Stone base
        for (let y = 0; y <= surfaceY; y++) {
          let block = BLOCKS.STONE;

          // Stratification
          if (y === surfaceY) {
            if (distCenter <= 18) {
              // Central Spawn Plaza
              if (distCenter <= 3) {
                block = BLOCKS.GOLD_ORE;
              } else if (distCenter <= 7) {
                block = BLOCKS.BRICK;
              } else if (distCenter <= 14) {
                block = ((wx + wz) % 2 === 0) ? BLOCKS.WOOD_PLANK : BLOCKS.COBBLESTONE;
              } else {
                block = BLOCKS.STONE;
              }
            } else if (wz >= -560 && wz <= -440 && Math.abs(wx) <= 75) {
              // Playa Paraíso Tropical Beach
              if (wz >= -462) {
                block = ((wx + wz) % 6 === 0) ? BLOCKS.WOOD_PLANK : BLOCKS.SAND;
              } else {
                block = BLOCKS.SAND;
              }
            } else if (Math.hypot(wx - 250, wz - 250) <= 58) {
              // Japan Imperial Sector
              const isCanalPath = (Math.abs(wx - 235) <= 1 || Math.abs(wz - 235) <= 1);
              block = isCanalPath ? BLOCKS.COBBLESTONE : (((wx + wz) % 5 === 0) ? BLOCKS.GRAVEL : BLOCKS.GRASS);
            } else if (Math.hypot(wx + 250, wz - 250) <= 58) {
              // China & Shanghai Sector: Lush green gardens with Imperial stone/brick avenues
              const isAvenue = (Math.abs(wx + 250) <= 2 || Math.abs(wz - 250) <= 2 || Math.abs(wx + 242) <= 1 || Math.abs(wz - 235) <= 2);
              block = isAvenue ? (((wx + wz) % 2 === 0) ? BLOCKS.STONE : BLOCKS.BRICK) : BLOCKS.GRASS;
            } else if (Math.hypot(wx - 250, wz + 250) <= 58) {
              // Paris & Eiffel Tower Sector
              const isPromenade = (Math.abs(wz - -240) <= 2 || Math.abs(wx - 250) <= 2);
              block = isPromenade ? BLOCKS.GRAVEL : BLOCKS.GRASS;
            } else if (Math.hypot(wx + 250, wz + 250) <= 58) {
              // New York Sector: Central Park green lawns with Manhattan avenues & sidewalks
              const isStreet = ((wx + 250) % 12 === 0 || (wz + 250) % 12 === 0);
              const isSidewalk = (Math.abs((wx + 250) % 12) === 1 || Math.abs((wz + 250) % 12) === 1);
              block = isStreet ? BLOCKS.DIRT_DRY : (isSidewalk ? BLOCKS.STONE : BLOCKS.GRASS);
            } else if (wz >= 440 && wz <= 560 && Math.abs(wx) <= 55) {
              // Norway Fjords
              if (Math.abs(wx) <= 8) {
                block = BLOCKS.GRAVEL;
              } else if (surfaceY >= 48) {
                block = ((wx + wz) % 3 === 0) ? BLOCKS.SNOW : BLOCKS.STONE;
              } else {
                block = BLOCKS.STONE;
              }
            } else if (wx >= 50 && wx <= 210 && wz >= -190 && wz <= -40) {
              // Gran Circuito SE Quadrant
              if (surfaceY <= WATER_LEVEL + 1) {
                block = BLOCKS.SAND;
              } else if (surfaceY >= 35) {
                block = BLOCKS.STONE;
              } else {
                block = BLOCKS.GRASS;
              }
            } else if (Math.abs(wx - (-500)) <= 125 && Math.abs(wz - (-500)) <= 125) {
              // Grand Prix Racing Circuit
              if (surfaceY <= WATER_LEVEL + 1) {
                block = BLOCKS.SAND;
              } else if (surfaceY >= 38) {
                block = BLOCKS.STONE;
              } else {
                block = BLOCKS.GRASS;
              }
            } else if (Math.hypot(wx - 350, wz - 350) <= 68 || Math.hypot(wx - 500, wz - 500) <= 88) {
              // Mount Fuji (Monte Fuji)
              const d350 = Math.hypot(wx - 350, wz - 350);
              const dLake350_1 = Math.hypot(wx - 305, wz - 305);
              const dLake350_2 = Math.hypot(wx - 375, wz - 315);
              const dLake1 = Math.hypot(wx - 438, wz - 485);
              const dLake2 = Math.hypot(wx - 485, wz - 438);
              if (dLake350_1 <= 17 || dLake350_2 <= 14 || dLake1 <= 17 || dLake2 <= 17) {
                block = (surfaceY <= WATER_LEVEL) ? BLOCKS.SAND : BLOCKS.GRAVEL; // Reflection lake bed & beach
              } else if (d350 <= 4) {
                // Volcanic Caldera crater floor: sulfur gold vents, basalt cobblestone & stone
                block = ((wx + wz) % 3 === 0) ? BLOCKS.GOLD_ORE : BLOCKS.COBBLESTONE;
              } else if (surfaceY >= 46) {
                // Snowy caldera summit & snow cap (Y >= 46)
                block = BLOCKS.SNOW;
              } else if (surfaceY >= 32) {
                // Volcanic basalt slopes & scree
                block = ((wx + wz) % 2 === 0) ? BLOCKS.STONE : BLOCKS.GRAVEL;
              } else {
                block = BLOCKS.GRASS;
              }
            } else if (surfaceY >= 42) {
              block = BLOCKS.SNOW;
            } else if (surfaceY <= WATER_LEVEL + 1) {
              block = BLOCKS.SAND;
            } else {
              block = BLOCKS.GRASS;
            }
          } else if (y >= surfaceY - 3) {
            if (this.isInsidePlateau(wx, wz)) {
              block = BLOCKS.COBBLESTONE;
            } else if (wz >= -560 && wz <= -440 && Math.abs(wx) <= 75) {
              block = BLOCKS.SAND;
            } else if (wx >= 50 && wx <= 210 && wz >= -190 && wz <= -40) {
              block = (surfaceY <= WATER_LEVEL + 1) ? BLOCKS.SAND : BLOCKS.COBBLESTONE;
            } else if (Math.abs(wx - (-500)) <= 125 && Math.abs(wz - (-500)) <= 125) {
              block = (surfaceY <= WATER_LEVEL + 1) ? BLOCKS.SAND : BLOCKS.COBBLESTONE;
            } else if (Math.hypot(wx - 350, wz - 350) <= 68 || Math.hypot(wx - 500, wz - 500) <= 88) {
              const dLake350_1 = Math.hypot(wx - 305, wz - 305);
              const dLake350_2 = Math.hypot(wx - 375, wz - 315);
              const dLake1 = Math.hypot(wx - 438, wz - 485);
              const dLake2 = Math.hypot(wx - 485, wz - 438);
              if (dLake350_1 <= 17 || dLake350_2 <= 14 || dLake1 <= 17 || dLake2 <= 17) {
                block = BLOCKS.SAND;
              } else if (surfaceY >= 46) {
                block = BLOCKS.ICE; // Glacial ice under snow cap
              } else {
                block = BLOCKS.STONE;
              }
            } else if (surfaceY >= 42) {
              block = BLOCKS.STONE;
            } else if (surfaceY <= WATER_LEVEL + 1) {
              block = BLOCKS.SAND;
            } else {
              block = BLOCKS.DIRT;
            }
          } else {
            // Underground stone & ores
            const oreNoise = noise.noise2D((wx + y * 7) / 10, (wz + y * 7) / 10);
            if (oreNoise > 0.72 && y < 25) {
              block = (oreNoise > 0.82 && y < 14) ? BLOCKS.GOLD_ORE : BLOCKS.IRON_ORE;
            } else {
              block = BLOCKS.STONE;
            }
          }

          chunk.voxels[chunk.getIndex(lx, y, lz)] = block;
        }

        // Fill ocean water in Playa Paraíso, Grand Prix azure lake, and wild water bodies
        const isBeachOcean = (wz >= -560 && wz <= -488 && Math.abs(wx) <= 75);
        const isCircuitLake = (Math.abs(wx - (-500)) <= 125 && Math.abs(wz - (-500)) <= 125 && surfaceY < WATER_LEVEL);
        const isCircuitLakeSE = (wx >= 50 && wx <= 210 && wz >= -190 && wz <= -40 && surfaceY < WATER_LEVEL);
        if (surfaceY < WATER_LEVEL && (isBeachOcean || isCircuitLake || isCircuitLakeSE || !this.isInsideMonument(wx, wz))) {
          for (let y = surfaceY + 1; y <= WATER_LEVEL; y++) {
            chunk.voxels[chunk.getIndex(lx, y, lz)] = BLOCKS.WATER;
          }
        }

        // Fill reflection lakes at base of Mount Fuji (+350, +350) up to WATER_LEVEL=18
        const isFujiLake350 = (Math.hypot(wx - 305, wz - 305) <= 14 || Math.hypot(wx - 375, wz - 315) <= 11);
        if (isFujiLake350 && surfaceY < WATER_LEVEL) {
          for (let y = surfaceY + 1; y <= WATER_LEVEL; y++) {
            chunk.voxels[chunk.getIndex(lx, y, lz)] = BLOCKS.WATER;
          }
        }

        // Fill reflection lakes at base of Mount Fuji (+500, +500) up to Y=24
        const isFujiLake = (Math.hypot(wx - 438, wz - 485) <= 14 || Math.hypot(wx - 485, wz - 438) <= 14);
        if (isFujiLake && surfaceY < 24) {
          for (let y = surfaceY + 1; y <= 24; y++) {
            chunk.voxels[chunk.getIndex(lx, y, lz)] = BLOCKS.WATER;
          }
        }
      }
    }

    // 1. Interconnected Highways, Bridges & Minecraft Mountain Tunnels
    this.buildRoadAndTunnelNetwork(chunk);

    // 2. Central Spawn Plaza & Guardian Statues
    this.buildPlazaFeatures(chunk);

    // 3. Monument Sectors (Japan, Shanghai, Paris, NYC, Norway Fjords, Playa Paraíso, Grand Prix, Mount Fuji)
    this.buildJapanSector(chunk);
    this.buildShanghaiSector(chunk);
    this.buildParisSector(chunk);
    this.buildNYCSector(chunk);
    this.buildNorwaySector(chunk);
    this.buildBeachSector(chunk);
    if (typeof this.buildGrandPrixSector === 'function') this.buildGrandPrixSector(chunk);
    if (typeof this.buildGranCircuito === 'function') this.buildGranCircuito(chunk);
    if (typeof this.buildMountFujiSector === 'function') this.buildMountFujiSector(chunk);
    if (typeof this.buildMountainCaverns === 'function') this.buildMountainCaverns(chunk);

    // 4. Procedural Oak Trees in wild outer areas
    for (let lx = 2; lx < CHUNK_WIDTH - 2; lx++) {
      for (let lz = 2; lz < CHUNK_DEPTH - 2; lz++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const surfaceY = this.getHeightAt(wx, wz);

        if (!this.isInsideMonument(wx, wz) && surfaceY > WATER_LEVEL + 2 && surfaceY < 38) {
          const rawHash = (Math.sin(wx * 12.9898 + wz * 78.233 + this.seed) * 43758.5453);
          const treeVal = Math.abs(rawHash - Math.floor(rawHash));
          if (treeVal > 0.965) {
            this.buildTreeInChunk(chunk, lx, surfaceY + 1, lz);
          }
        }
      }
    }

    // Apply any previously stored block deltas from server in this chunk
    for (const [key, type] of this.blockDeltas.entries()) {
      const [bx, by, bz] = key.split(',').map(Number);
      if (bx >= ox && bx < ox + CHUNK_WIDTH && bz >= oz && bz < oz + CHUNK_DEPTH) {
        const clx = bx - ox;
        const clz = bz - oz;
        chunk.setBlockLocal(clx, by, clz, type);
      }
    }

    chunk.isGenerated = true;
    this.queueRemesh(chunk);
  }

  /**
   * Builds the world-spanning Highway Network, Suspension Bridges over water/valleys,
   * and Minecraft-style Timber/Stone Mountain Tunnels
   */
  buildRoadAndTunnelNetwork(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    const ASPHALT_BLK = BLOCKS.ASPHALT || BLOCKS.COBBLESTONE;
    const roadY = 24;

    for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
      for (let lz = 0; lz < CHUNK_DEPTH; lz++) {
        const wx = ox + lx;
        const wz = oz + lz;

        // Skip high Norway Fjord bridge here (handled in buildNorwaySector at Y=50)
        if (wz >= 440 && wz <= 560 && Math.abs(wx) <= 55) continue;
        // Skip inner monument plazas so custom district flooring is preserved
        if (Math.hypot(wx, wz) <= 18) continue;
        if (Math.hypot(wx - 250, wz - 250) <= 32) continue;
        if (Math.hypot(wx + 250, wz - 250) <= 32) continue;
        if (Math.hypot(wx - 250, wz + 250) <= 32) continue;
        if (Math.hypot(wx + 250, wz + 250) <= 32) continue;

        const onRoad = this.isRoadAt(wx, wz);
        const inTunnel = this.isTunnelAt(wx, wz);

        if (!onRoad && !inTunnel) continue;

        const naturalH = this.getNaturalHeightAt(wx, wz);

        if (onRoad) {
          // Determine if this voxel is on the outer curb or center dashed line
          const distCenter = Math.hypot(wx, wz);
          let isCurb = false;
          let isCenterStripe = false;

          if (distCenter >= 18.5 && distCenter <= 23.5) {
            isCurb = (distCenter < 19.6 || distCenter > 22.6);
            isCenterStripe = (Math.abs(distCenter - 21.0) < 0.55 && ((wx + wz) % 3 === 0));
          } else if (Math.abs(wx) <= 3 && Math.abs(wz) > 3) {
            isCurb = (Math.abs(wx) === 3);
            isCenterStripe = (wx === 0 && (Math.abs(wz) % 4 <= 1));
          } else if (Math.abs(wz) <= 3 && Math.abs(wx) > 3) {
            isCurb = (Math.abs(wz) === 3);
            isCenterStripe = (wz === 0 && (Math.abs(wx) % 4 <= 1));
          } else if (wx >= 226 && wx <= 232) {
            isCurb = (wx === 226 || wx === 232);
            isCenterStripe = (wx === 229 && (Math.abs(wz) % 4 <= 1));
          } else if (wx >= -232 && wx <= -226) {
            isCurb = (wx === -232 || wx === -226);
            isCenterStripe = (wx === -229 && (Math.abs(wz) % 4 <= 1));
          } else if (wz >= 247 && wz <= 253 && wx >= 250 && wx <= 440) {
            isCurb = (wz === 247 || wz === 253);
            isCenterStripe = (wz === 250 && (Math.abs(wx) % 4 <= 1));
          } else if (wx >= 437 && wx <= 443 && wz >= 250 && wz <= 465) {
            isCurb = (wx === 437 || wx === 443);
            isCenterStripe = (wx === 440 && (Math.abs(wz) % 4 <= 1));
          }

          // Roadbed foundation
          chunk.setBlockLocal(lx, roadY - 1, lz, BLOCKS.COBBLESTONE);
          const surfaceBlock = isCurb ? BLOCKS.STONE : (isCenterStripe ? BLOCKS.SNOW : ASPHALT_BLK);
          chunk.setBlockLocal(lx, roadY, lz, surfaceBlock);

          // Clear 4 blocks of headroom above road for traffic & player movement
          for (let y = roadY + 1; y <= roadY + 4; y++) {
            chunk.setBlockLocal(lx, y, lz, BLOCKS.AIR);
          }

          // Bridge structure when crossing valleys or water (naturalH < roadY - 1)
          if (naturalH < roadY - 1 && !inTunnel) {
            if (isCurb) {
              // Bridge parapet railing & suspension cable posts
              chunk.setBlockLocal(lx, roadY + 1, lz, BLOCKS.COBBLESTONE);
              if ((wx + wz) % 6 === 0) {
                chunk.setBlockLocal(lx, roadY + 2, lz, BLOCKS.IRON_ORE);
                chunk.setBlockLocal(lx, roadY + 3, lz, BLOCKS.GOLD_ORE);
              }
              // Sturdy bridge piers down to riverbed/seabed every 8 blocks
              if (Math.abs(wx) % 8 === 0 || Math.abs(wz) % 8 === 0) {
                for (let py = Math.max(4, naturalH); py < roadY - 1; py++) {
                  chunk.setBlockLocal(lx, py, lz, BLOCKS.COBBLESTONE);
                }
              }
            }
          } else if (!inTunnel && isCurb && ((Math.abs(wx) + Math.abs(wz)) % 16 === 0)) {
            // Highway streetlights along open roads
            chunk.setBlockLocal(lx, roadY + 1, lz, BLOCKS.IRON_ORE);
            chunk.setBlockLocal(lx, roadY + 2, lz, BLOCKS.IRON_ORE);
            chunk.setBlockLocal(lx, roadY + 3, lz, BLOCKS.IRON_ORE);
            chunk.setBlockLocal(lx, roadY + 4, lz, BLOCKS.GOLD_ORE);
          }
        }

        // Minecraft-style Mountain Tunnel Architecture
        if (inTunnel) {
          // Ensure rocky mountain overburden above the tunnel vault roof (Y = 31..roofTop)
          const roofTop = Math.max(naturalH, roadY + 12);
          for (let y = roadY + 7; y <= roofTop; y++) {
            if (y === roofTop) {
              chunk.setBlockLocal(lx, y, lz, BLOCKS.GRASS);
            } else if (y >= roofTop - 1) {
              chunk.setBlockLocal(lx, y, lz, BLOCKS.DIRT);
            } else {
              chunk.setBlockLocal(lx, y, lz, BLOCKS.STONE);
            }
          }

          const isRib = (Math.abs(wx) % 4 === 0 || Math.abs(wz) % 4 === 0);

          if (!onRoad) {
            // Outer tunnel wall (Y: 24..29) with oak log ribs and cobblestone
            for (let y = roadY; y <= roadY + 5; y++) {
              chunk.setBlockLocal(lx, y, lz, isRib ? BLOCKS.OAK_LOG : BLOCKS.COBBLESTONE);
            }
            // Wall illumination lanterns every 4 blocks at Y = 27 (roadY + 3)
            if (isRib) {
              chunk.setBlockLocal(lx, roadY + 3, lz, BLOCKS.GOLD_ORE);
            }
            // Arch wall abutment at Y = 30
            chunk.setBlockLocal(lx, roadY + 6, lz, BLOCKS.STONE);
          } else {
            // Inside tunnel bore: strictly clear 4 blocks of headroom (Y = 25..28)
            for (let y = roadY + 1; y <= roadY + 4; y++) {
              chunk.setBlockLocal(lx, y, lz, BLOCKS.AIR);
            }

            // Stone arch vault at Y = 29..30 (roadY + 5 and roadY + 6)
            const isCenter = (wx === 0 || wz === 0 || wx === 229 || wx === -229 || wz === 250 || wx === 440);
            if (isCenter && isRib) {
              // Glowing illumination ceiling lantern at Y = 29
              chunk.setBlockLocal(lx, roadY + 5, lz, BLOCKS.GOLD_ORE);
            } else if (isRib) {
              // Structural timber crossbeam at Y = 29
              chunk.setBlockLocal(lx, roadY + 5, lz, BLOCKS.WOOD_PLANK);
            } else {
              // Stone arch voussoir at Y = 29
              chunk.setBlockLocal(lx, roadY + 5, lz, BLOCKS.COBBLESTONE);
            }

            // Continuous stone arch vault keystone layer at Y = 30 (roadY + 6)
            chunk.setBlockLocal(lx, roadY + 6, lz, BLOCKS.STONE);
          }
        }
      }
    }
  }

  /**
   * Central Spawn Plaza at (0, 0)
   * Paved meeting clearing, 4 monumental guardian statues, world compass rose pointing to each sector
   */
  buildPlazaFeatures(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    // Fast bounding box check
    if (ox + 16 < -24 || ox > 24 || oz + 16 < -24 || oz > 24) return;

    const baseY = 24;

    // --- 1. Paved Central Meeting Clearing ---
    for (let x = -16; x <= 16; x++) {
      for (let z = -16; z <= 16; z++) {
        const d = Math.hypot(x, z);
        if (d <= 15) {
          // Inner paved flooring at Y = baseY
          let floorBlock = BLOCKS.COBBLESTONE;
          if (d <= 2) {
            floorBlock = BLOCKS.GOLD_ORE;
          } else if (d <= 5) {
            floorBlock = BLOCKS.BRICK;
          } else if (d <= 10) {
            floorBlock = ((x + z) % 2 === 0) ? BLOCKS.WOOD_PLANK : BLOCKS.STONE;
          } else if (d <= 14) {
            floorBlock = BLOCKS.COBBLESTONE;
          } else {
            floorBlock = BLOCKS.STONE; // Outer curb
          }
          this.setVoxelInWorld(chunk, x, baseY, z, floorBlock);
        }
      }
    }

    // Center podium at (0, 25, 0)
    this.setVoxelInWorld(chunk, 0, baseY + 1, 0, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, 1, baseY + 1, 0, BLOCKS.STONE);
    this.setVoxelInWorld(chunk, -1, baseY + 1, 0, BLOCKS.STONE);
    this.setVoxelInWorld(chunk, 0, baseY + 1, 1, BLOCKS.STONE);
    this.setVoxelInWorld(chunk, 0, baseY + 1, -1, BLOCKS.STONE);

    // --- 2. World Compass Rose pointing to sectors ---
    // North Arm pointing to Norway Fjords (0, +500)
    for (let z = 2; z <= 12; z++) {
      this.setVoxelInWorld(chunk, 0, baseY + 1, z, (z % 2 === 0) ? BLOCKS.GOLD_ORE : BLOCKS.BRICK);
    }
    // North Arrow tip at z = 12
    this.setVoxelInWorld(chunk, -1, baseY + 1, 11, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, 1, baseY + 1, 11, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, 0, baseY + 1, 13, BLOCKS.GOLD_ORE);

    // Northeast Arm pointing to Japan Imperial (+250, +250)
    for (let d = 2; d <= 9; d++) {
      this.setVoxelInWorld(chunk, d, baseY + 1, d, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, 10, baseY + 1, 10, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, 9, baseY + 1, 10, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, 10, baseY + 1, 9, BLOCKS.GOLD_ORE);

    // Northwest Arm pointing to China & Shanghai (-250, +250)
    for (let d = 2; d <= 9; d++) {
      this.setVoxelInWorld(chunk, -d, baseY + 1, d, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, -10, baseY + 1, 10, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, -9, baseY + 1, 10, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, -10, baseY + 1, 9, BLOCKS.GOLD_ORE);

    // Southeast Arm pointing to Paris & Eiffel Tower (+250, -250)
    for (let d = 2; d <= 9; d++) {
      this.setVoxelInWorld(chunk, d, baseY + 1, -d, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, 10, baseY + 1, -10, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, 9, baseY + 1, -10, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, 10, baseY + 1, -9, BLOCKS.GOLD_ORE);

    // Southwest Arm pointing to New York (-250, -250)
    for (let d = 2; d <= 9; d++) {
      this.setVoxelInWorld(chunk, -d, baseY + 1, -d, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, -10, baseY + 1, -10, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, -9, baseY + 1, -10, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, -10, baseY + 1, -9, BLOCKS.GOLD_ORE);

    // Cardinal tick lines (South, East, West)
    for (let z = -2; z >= -10; z--) {
      this.setVoxelInWorld(chunk, 0, baseY + 1, z, BLOCKS.STONE);
    }
    for (let x = 2; x <= 10; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 1, 0, BLOCKS.STONE);
    }
    for (let x = -2; x >= -10; x--) {
      this.setVoxelInWorld(chunk, x, baseY + 1, 0, BLOCKS.STONE);
    }

    // Directional obelisks / entrance pillars
    const pillars = [[0, 14], [0, -14], [14, 0], [-14, 0]];
    for (const [px, pz] of pillars) {
      this.setVoxelInWorld(chunk, px, baseY + 1, pz, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, px, baseY + 2, pz, BLOCKS.STONE);
      this.setVoxelInWorld(chunk, px, baseY + 3, pz, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, px, baseY + 4, pz, BLOCKS.GOLD_ORE);
    }

    // --- 3. Four Monumental Guardian Statues ---
    // Placed at (+8, +8), (-8, +8), (+8, -8), (-8, -8)
    const guardians = [
      [8, 8],   // NE Guardian (watching towards Japan)
      [-8, 8],  // NW Guardian (watching towards Shanghai)
      [8, -8],  // SE Guardian (watching towards Paris)
      [-8, -8]  // SW Guardian (watching towards New York)
    ];

    for (const [gx, gz] of guardians) {
      // 3x3 Pedestal base
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          this.setVoxelInWorld(chunk, gx + dx, baseY + 1, gz + dz, BLOCKS.COBBLESTONE);
        }
      }
      this.setVoxelInWorld(chunk, gx, baseY + 2, gz, BLOCKS.STONE);
      // Statue legs / robe
      this.setVoxelInWorld(chunk, gx, baseY + 3, gz, BLOCKS.STONE);
      // Torso & armor shoulders
      this.setVoxelInWorld(chunk, gx, baseY + 4, gz, BLOCKS.STONE);
      this.setVoxelInWorld(chunk, gx - 1, baseY + 4, gz, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, gx + 1, baseY + 4, gz, BLOCKS.IRON_ORE);
      // Head & Eyes
      this.setVoxelInWorld(chunk, gx, baseY + 5, gz, BLOCKS.STONE);
      // Golden Crown
      this.setVoxelInWorld(chunk, gx, baseY + 6, gz, BLOCKS.GOLD_ORE);
      // Golden Guardian Spear / Beacon Staff
      for (let y = baseY + 1; y <= baseY + 7; y++) {
        this.setVoxelInWorld(chunk, gx + 1, y, gz + 1, BLOCKS.IRON_ORE);
      }
      this.setVoxelInWorld(chunk, gx + 1, baseY + 8, gz + 1, BLOCKS.GOLD_ORE);
    }

    // --- 4. Four Grand Imperial Triumphal Gate Arches over Highway Entries ---
    // North & South Highway Entries (Z = +19, Z = -19)
    for (const gz of [19, -19]) {
      for (const gx of [-4, 4]) {
        for (let y = baseY + 1; y <= baseY + 6; y++) {
          this.setVoxelInWorld(chunk, gx, y, gz, (y === baseY + 6) ? BLOCKS.COBBLESTONE : BLOCKS.STONE);
        }
        this.setVoxelInWorld(chunk, gx, baseY + 7, gz, BLOCKS.GOLD_ORE); // Golden lantern atop pillar
      }
      // Vaulted brick archway spanning across highway (X: -3..3, Y: 30..32)
      for (let x = -3; x <= 3; x++) {
        const archY = (Math.abs(x) <= 1) ? baseY + 8 : baseY + 7;
        this.setVoxelInWorld(chunk, x, archY, gz, BLOCKS.BRICK);
        this.setVoxelInWorld(chunk, x, archY + 1, gz, BLOCKS.STONE);
      }
      // Golden imperial eagle / crown finial atop center arch
      this.setVoxelInWorld(chunk, 0, baseY + 10, gz, BLOCKS.GOLD_ORE);
    }

    // East & West Highway Entries (X = +19, X = -19)
    for (const gx of [19, -19]) {
      for (const gz of [-4, 4]) {
        for (let y = baseY + 1; y <= baseY + 6; y++) {
          this.setVoxelInWorld(chunk, gx, y, gz, (y === baseY + 6) ? BLOCKS.COBBLESTONE : BLOCKS.STONE);
        }
        this.setVoxelInWorld(chunk, gx, baseY + 7, gz, BLOCKS.GOLD_ORE);
      }
      for (let z = -3; z <= 3; z++) {
        const archY = (Math.abs(z) <= 1) ? baseY + 8 : baseY + 7;
        this.setVoxelInWorld(chunk, gx, archY, z, BLOCKS.BRICK);
        this.setVoxelInWorld(chunk, gx, archY + 1, z, BLOCKS.STONE);
      }
      this.setVoxelInWorld(chunk, gx, baseY + 10, 0, BLOCKS.GOLD_ORE);
    }

    // --- 5. Four Cascading Tiered Fountains at (0, 6), (0, -6), (6, 0), (-6, 0) ---
    const fountainCenters = [[0, 6], [0, -6], [6, 0], [-6, 0]];
    for (const [fx, fz] of fountainCenters) {
      // Basin ring (3x3 outer ring at Y=25)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) {
            // Center fountain pillar
            this.setVoxelInWorld(chunk, fx, baseY + 1, fz, BLOCKS.STONE);
            this.setVoxelInWorld(chunk, fx, baseY + 2, fz, BLOCKS.STONE);
            this.setVoxelInWorld(chunk, fx, baseY + 3, fz, BLOCKS.GOLD_ORE); // Golden fountain spout
          } else {
            this.setVoxelInWorld(chunk, fx + dx, baseY + 1, fz + dz, BLOCKS.WATER);
          }
        }
      }
    }

    // --- 6. Four Corner Orientation Bell Towers at (+13, +13), (-13, +13), (+13, -13), (-13, -13) ---
    const cornerTowers = [[13, 13], [-13, 13], [13, -13], [-13, -13]];
    for (const [tx, tz] of cornerTowers) {
      // 4 oak corner posts
      for (let y = baseY + 1; y <= baseY + 6; y++) {
        this.setVoxelInWorld(chunk, tx - 1, y, tz - 1, BLOCKS.OAK_LOG);
        this.setVoxelInWorld(chunk, tx + 1, y, tz - 1, BLOCKS.OAK_LOG);
        this.setVoxelInWorld(chunk, tx - 1, y, tz + 1, BLOCKS.OAK_LOG);
        this.setVoxelInWorld(chunk, tx + 1, y, tz + 1, BLOCKS.OAK_LOG);
      }
      // Timber canopy roof with golden spire finial
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          this.setVoxelInWorld(chunk, tx + dx, baseY + 7, tz + dz, BLOCKS.WOOD_PLANK);
        }
      }
      this.setVoxelInWorld(chunk, tx, baseY + 8, tz, BLOCKS.GOLD_ORE);
      // Ceremonial bronze bell hanging in belfry
      this.setVoxelInWorld(chunk, tx, baseY + 4, tz, BLOCKS.GOLD_ORE);
    }
  }

  /**
   * Builds a procedural oak tree inside chunk local coordinates
   */
  buildTreeInChunk(chunk, lx, baseY, lz) {
    if (baseY < 1 || baseY >= CHUNK_HEIGHT - 8) return;
    const trunkHeight = 5;

    // Wood trunk
    for (let y = baseY; y < baseY + trunkHeight; y++) {
      if (y < CHUNK_HEIGHT) {
        chunk.setBlockLocal(lx, y, lz, BLOCKS.OAK_LOG);
      }
    }

    // Lower canopy (5x5 leaves at baseY + 3 and baseY + 4)
    for (let dy = 3; dy <= 4; dy++) {
      const y = baseY + dy;
      if (y >= CHUNK_HEIGHT) continue;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; // Cut outer corners
          const tx = lx + dx;
          const tz = lz + dz;
          if (tx >= 0 && tx < CHUNK_WIDTH && tz >= 0 && tz < CHUNK_DEPTH) {
            if (chunk.voxels[chunk.getIndex(tx, y, tz)] === BLOCKS.AIR) {
              chunk.setBlockLocal(tx, y, tz, BLOCKS.OAK_LEAVES);
            }
          }
        }
      }
    }

    // Upper canopy (3x3 leaves at baseY + 5)
    const y5 = baseY + 5;
    if (y5 < CHUNK_HEIGHT) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const tx = lx + dx;
          const tz = lz + dz;
          if (tx >= 0 && tx < CHUNK_WIDTH && tz >= 0 && tz < CHUNK_DEPTH) {
            if (chunk.voxels[chunk.getIndex(tx, y5, tz)] === BLOCKS.AIR) {
              chunk.setBlockLocal(tx, y5, tz, BLOCKS.OAK_LEAVES);
            }
          }
        }
      }
    }

    // Peak canopy (cross at baseY + 6)
    const y6 = baseY + 6;
    if (y6 < CHUNK_HEIGHT) {
      const peakOffsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of peakOffsets) {
        const tx = lx + dx;
        const tz = lz + dz;
        if (tx >= 0 && tx < CHUNK_WIDTH && tz >= 0 && tz < CHUNK_DEPTH) {
          if (chunk.voxels[chunk.getIndex(tx, y6, tz)] === BLOCKS.AIR) {
            chunk.setBlockLocal(tx, y6, tz, BLOCKS.OAK_LEAVES);
          }
        }
      }
    }
  }

  /**
   * SECTOR 1: JAPÓN (+250, +250)
   * Multi-tier wooden pagoda, crimson Torii gates, Sakura cherry blossom trees, zen pond & bridge
   */
  buildJapanSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    // Bounding check for Expanded Sector 1
    if (ox + 16 < 200 || ox > 300 || oz + 16 < 200 || oz > 300) return;

    const baseY = 24;
    const cX = 250; // Pagoda center
    const cZ = 250;

    // --- 1. Traditional 4-Tier Japanese Pagoda ---
    // Level 1 (Y: 25..29): 9x9 base
    for (let x = cX - 4; x <= cX + 4; x++) {
      for (let z = cZ - 4; z <= cZ + 4; z++) {
        // Floor
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.WOOD_PLANK);
        // Columns & Walls
        const isCorner = (x === cX - 4 || x === cX + 4) && (z === cZ - 4 || z === cZ + 4);
        const isEdge = (x === cX - 4 || x === cX + 4 || z === cZ - 4 || z === cZ + 4);
        const isDoor = (x === cX && z === cZ - 4) || (x === cX && z === cZ + 4);

        for (let y = baseY + 2; y <= baseY + 4; y++) {
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          } else if (isDoor && y <= baseY + 3) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y === baseY + 3) ? BLOCKS.GLASS : BLOCKS.WOOD_PLANK);
          }
        }
      }
    }
    // Roof 1 with upturned eaves at Y = 29..30 (11x11 footprint)
    for (let x = cX - 5; x <= cX + 5; x++) {
      for (let z = cZ - 5; z <= cZ + 5; z++) {
        const isEdge = (x === cX - 5 || x === cX + 5 || z === cZ - 5 || z === cZ + 5);
        const isCorner = (x === cX - 5 || x === cX + 5) && (z === cZ - 5 || z === cZ + 5);
        if (isCorner) {
          this.setVoxelInWorld(chunk, x, baseY + 6, z, BLOCKS.BRICK); // Upturned eave corner
        }
        if (isEdge) {
          this.setVoxelInWorld(chunk, x, baseY + 5, z, BLOCKS.BRICK);
        } else {
          this.setVoxelInWorld(chunk, x, baseY + 5, z, BLOCKS.WOOD_PLANK);
        }
      }
    }

    // Level 2 (Y: 30..33): 7x7 inset
    for (let x = cX - 3; x <= cX + 3; x++) {
      for (let z = cZ - 3; z <= cZ + 3; z++) {
        const isCorner = (x === cX - 3 || x === cX + 3) && (z === cZ - 3 || z === cZ + 3);
        const isEdge = (x === cX - 3 || x === cX + 3 || z === cZ - 3 || z === cZ + 3);
        for (let y = baseY + 6; y <= baseY + 8; y++) {
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y === baseY + 7) ? BLOCKS.GLASS : BLOCKS.WOOD_PLANK);
          }
        }
      }
    }
    // Roof 2 with upturned eaves at Y = 33..34 (9x9)
    for (let x = cX - 4; x <= cX + 4; x++) {
      for (let z = cZ - 4; z <= cZ + 4; z++) {
        const isEdge = (x === cX - 4 || x === cX + 4 || z === cZ - 4 || z === cZ + 4);
        const isCorner = (x === cX - 4 || x === cX + 4) && (z === cZ - 4 || z === cZ + 4);
        if (isCorner) {
          this.setVoxelInWorld(chunk, x, baseY + 10, z, BLOCKS.BRICK);
        }
        if (isEdge) {
          this.setVoxelInWorld(chunk, x, baseY + 9, z, BLOCKS.BRICK);
        } else {
          this.setVoxelInWorld(chunk, x, baseY + 9, z, BLOCKS.WOOD_PLANK);
        }
      }
    }

    // Level 3 (Y: 34..37): 5x5 inset
    for (let x = cX - 2; x <= cX + 2; x++) {
      for (let z = cZ - 2; z <= cZ + 2; z++) {
        const isCorner = (x === cX - 2 || x === cX + 2) && (z === cZ - 2 || z === cZ + 2);
        const isEdge = (x === cX - 2 || x === cX + 2 || z === cZ - 2 || z === cZ + 2);
        for (let y = baseY + 10; y <= baseY + 12; y++) {
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.WOOD_PLANK);
          }
        }
      }
    }
    // Roof 3 with upturned eaves at Y = 37..38 (7x7)
    for (let x = cX - 3; x <= cX + 3; x++) {
      for (let z = cZ - 3; z <= cZ + 3; z++) {
        const isEdge = (x === cX - 3 || x === cX + 3 || z === cZ - 3 || z === cZ + 3);
        const isCorner = (x === cX - 3 || x === cX + 3) && (z === cZ - 3 || z === cZ + 3);
        if (isCorner) {
          this.setVoxelInWorld(chunk, x, baseY + 14, z, BLOCKS.BRICK);
        }
        if (isEdge) {
          this.setVoxelInWorld(chunk, x, baseY + 13, z, BLOCKS.BRICK);
        } else {
          this.setVoxelInWorld(chunk, x, baseY + 13, z, BLOCKS.WOOD_PLANK);
        }
      }
    }

    // Level 4 (Y: 38..40): 3x3 top sanctuary
    for (let x = cX - 1; x <= cX + 1; x++) {
      for (let z = cZ - 1; z <= cZ + 1; z++) {
        for (let y = baseY + 14; y <= baseY + 16; y++) {
          this.setVoxelInWorld(chunk, x, y, z, BLOCKS.WOOD_PLANK);
        }
      }
    }
    // Roof 4 Pyramid at Y = 41 (5x5)
    for (let x = cX - 2; x <= cX + 2; x++) {
      for (let z = cZ - 2; z <= cZ + 2; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 17, z, BLOCKS.BRICK);
      }
    }
    this.setVoxelInWorld(chunk, cX - 1, baseY + 18, cZ, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, cX + 1, baseY + 18, cZ, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, cX, baseY + 18, cZ - 1, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, cX, baseY + 18, cZ + 1, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, cX, baseY + 18, cZ, BLOCKS.BRICK);

    // Sorin Finial Spire (Y: 43..48)
    for (let y = baseY + 19; y <= baseY + 24; y++) {
      this.setVoxelInWorld(chunk, cX, y, cZ, BLOCKS.IRON_ORE);
    }
    // Sacred golden rings & jewel at peak
    this.setVoxelInWorld(chunk, cX, baseY + 20, cZ, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, cX, baseY + 22, cZ, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, cX, baseY + 24, cZ, BLOCKS.GOLD_ORE);

    // --- 2. Crimson Torii Gates ---
    // Torii Gate 1 at (242, 242)
    for (let y = baseY + 1; y <= baseY + 4; y++) {
      this.setVoxelInWorld(chunk, 242, y, 240, BLOCKS.BRICK); // Left post
      this.setVoxelInWorld(chunk, 242, y, 244, BLOCKS.BRICK); // Right post
    }
    // Nageshi beam
    for (let z = 240; z <= 244; z++) {
      this.setVoxelInWorld(chunk, 242, baseY + 3, z, BLOCKS.BRICK);
    }
    // Kasagi curved top lintel
    for (let z = 239; z <= 245; z++) {
      this.setVoxelInWorld(chunk, 242, baseY + 4, z, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, 242, baseY + 5, 239, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, 242, baseY + 5, 245, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, 242, baseY + 4, 242, BLOCKS.GOLD_ORE);

    // Torii Gate 2 at (250, 241)
    for (let y = baseY + 1; y <= baseY + 4; y++) {
      this.setVoxelInWorld(chunk, 248, y, 241, BLOCKS.BRICK);
      this.setVoxelInWorld(chunk, 252, y, 241, BLOCKS.BRICK);
    }
    for (let x = 248; x <= 252; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 3, 241, BLOCKS.BRICK);
    }
    for (let x = 247; x <= 253; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 4, 241, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, 247, baseY + 5, 241, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, 253, baseY + 5, 241, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, 250, baseY + 4, 241, BLOCKS.GOLD_ORE);

    // --- 3. Sakura Cherry Blossom Trees ---
    this.buildSakuraTree(chunk, 243, 257);
    this.buildSakuraTree(chunk, 258, 243);
    this.buildSakuraTree(chunk, 258, 257);
    this.buildSakuraTree(chunk, 243, 247);
    this.buildSakuraTree(chunk, 263, 250);
    this.buildSakuraTree(chunk, 237, 250);
    this.buildSakuraTree(chunk, 282, 255);
    this.buildSakuraTree(chunk, 260, 278);

    // --- 4. Zen Pond & Arched Wooden Bridge ---
    for (let x = 238; x <= 244; x++) {
      for (let z = 249; z <= 255; z++) {
        const isBorder = (x === 238 || x === 244 || z === 249 || z === 255);
        if (isBorder) {
          this.setVoxelInWorld(chunk, x, baseY, z, BLOCKS.COBBLESTONE);
        } else {
          this.setVoxelInWorld(chunk, x, baseY, z, BLOCKS.WATER);
        }
      }
    }
    // Arched Bridge crossing at z = 252
    this.setVoxelInWorld(chunk, 238, baseY + 1, 252, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 239, baseY + 2, 252, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 240, baseY + 2, 252, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 241, baseY + 2, 252, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 242, baseY + 2, 252, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 243, baseY + 2, 252, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 244, baseY + 1, 252, BLOCKS.WOOD_PLANK);

    // --- 5. Stone Lanterns (Tōrō) ---
    const lanterns = [[240, 248], [246, 242], [255, 242], [255, 254]];
    for (const [lx, lz] of lanterns) {
      this.setVoxelInWorld(chunk, lx, baseY + 1, lz, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, lx, baseY + 2, lz, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, lx, baseY + 3, lz, BLOCKS.STONE);
    }

    // --- 6. Traditional Shinto Shrine Sanctuary (Haiden) at (250, 262) ---
    const hX = 250, hZ = 262;
    // Raised wooden deck (Y: 25)
    for (let x = hX - 4; x <= hX + 4; x++) {
      for (let z = hZ - 3; z <= hZ + 3; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.WOOD_PLANK);
      }
    }
    // Veranda railings and corner oak pillars
    for (let x = hX - 4; x <= hX + 4; x++) {
      for (let z = hZ - 3; z <= hZ + 3; z++) {
        const isCorner = (x === hX - 4 || x === hX + 4) && (z === hZ - 3 || z === hZ + 3);
        const isWall = (x >= hX - 3 && x <= hX + 3) && (z >= hZ - 2 && z <= hZ + 2);
        const isWallEdge = isWall && (x === hX - 3 || x === hX + 3 || z === hZ - 2 || z === hZ + 2);
        const isDoor = (x === hX && z === hZ - 2);

        if (isCorner) {
          for (let y = baseY + 2; y <= baseY + 4; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          }
        }
        if (isWallEdge) {
          for (let y = baseY + 2; y <= baseY + 4; y++) {
            if (isDoor && y <= baseY + 3) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
            } else if (y === baseY + 3) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GLASS); // Shoji window
            } else {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.WOOD_PLANK);
            }
          }
        }
      }
    }
    // Shrine curved roof (Y: 29..31)
    for (let x = hX - 5; x <= hX + 5; x++) {
      for (let z = hZ - 4; z <= hZ + 4; z++) {
        const isEdge = (x === hX - 5 || x === hX + 5 || z === hZ - 4 || z === hZ + 4);
        this.setVoxelInWorld(chunk, x, baseY + 5, z, isEdge ? BLOCKS.BRICK : BLOCKS.WOOD_PLANK);
      }
    }
    for (let x = hX - 4; x <= hX + 4; x++) {
      for (let z = hZ - 3; z <= hZ + 3; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 6, z, BLOCKS.BRICK);
      }
    }
    for (let x = hX - 3; x <= hX + 3; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 7, hZ, BLOCKS.GOLD_ORE); // Golden roof ridge
    }
    // Golden altar inside shrine
    this.setVoxelInWorld(chunk, hX, baseY + 2, hZ, BLOCKS.GOLD_ORE);

    // --- 7. Karesansui Zen Rock Garden at (262, 250) ---
    for (let x = 259; x <= 265; x++) {
      for (let z = 247; z <= 253; z++) {
        const ripple = (x + z) % 2 === 0 ? BLOCKS.GRAVEL : BLOCKS.SAND;
        this.setVoxelInWorld(chunk, x, baseY, z, ripple);
      }
    }
    // Central zen rock cairn
    this.setVoxelInWorld(chunk, 262, baseY + 1, 250, BLOCKS.STONE);
    this.setVoxelInWorld(chunk, 262, baseY + 2, 250, BLOCKS.COBBLESTONE);
    this.setVoxelInWorld(chunk, 263, baseY + 1, 251, BLOCKS.STONE);

    // --- 8. Perimeter Bamboo Grove ---
    const bambooCoords = [[264, 244], [265, 246], [266, 248], [265, 254], [266, 256], [264, 258]];
    for (const [bx, bz] of bambooCoords) {
      for (let y = baseY + 1; y <= baseY + 6; y++) {
        this.setVoxelInWorld(chunk, bx, y, bz, (y === baseY + 6) ? BLOCKS.OAK_LEAVES : BLOCKS.OAK_LOG);
      }
    }

    // --- 9. Himeji White Heron Samurai Castle Keep (Tenshu) at (274, 274) ---
    const kX = 274, kZ = 274;
    // Sloped stone samurai foundation wall (Ishigaki, Y: 25..28, 13x13)
    for (let y = baseY + 1; y <= baseY + 4; y++) {
      const r = (y <= baseY + 2) ? 6 : 5;
      for (let x = kX - r; x <= kX + r; x++) {
        for (let z = kZ - r; z <= kZ + r; z++) {
          const isEdge = (Math.abs(x - kX) === r || Math.abs(z - kZ) === r);
          this.setVoxelInWorld(chunk, x, y, z, isEdge ? BLOCKS.COBBLESTONE : BLOCKS.STONE);
        }
      }
    }
    // Castle Keep Tier 1 (White plaster walls & dark wood framing, Y: 29..32, 9x9)
    for (let y = baseY + 5; y <= baseY + 8; y++) {
      for (let x = kX - 4; x <= kX + 4; x++) {
        for (let z = kZ - 4; z <= kZ + 4; z++) {
          const isCorner = (Math.abs(x - kX) === 4 && Math.abs(z - kZ) === 4);
          const isEdge = (Math.abs(x - kX) === 4 || Math.abs(z - kZ) === 4);
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          } else if (isEdge) {
            const isWindow = (y === baseY + 7 && ((x + z) % 2 === 0));
            this.setVoxelInWorld(chunk, x, y, z, isWindow ? BLOCKS.GLASS : BLOCKS.SNOW);
          }
        }
      }
    }
    // Tier 1 Gray Tiled Roof Eaves (Y: 33, 11x11)
    for (let x = kX - 5; x <= kX + 5; x++) {
      for (let z = kZ - 5; z <= kZ + 5; z++) {
        if (Math.abs(x - kX) >= 4 || Math.abs(z - kZ) >= 4) {
          this.setVoxelInWorld(chunk, x, baseY + 9, z, BLOCKS.STONE);
        }
      }
    }
    // Castle Keep Tier 2 (Y: 34..37, 7x7)
    for (let y = baseY + 10; y <= baseY + 13; y++) {
      for (let x = kX - 3; x <= kX + 3; x++) {
        for (let z = kZ - 3; z <= kZ + 3; z++) {
          const isCorner = (Math.abs(x - kX) === 3 && Math.abs(z - kZ) === 3);
          const isEdge = (Math.abs(x - kX) === 3 || Math.abs(z - kZ) === 3);
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y === baseY + 12) ? BLOCKS.GLASS : BLOCKS.SNOW);
          }
        }
      }
    }
    // Tier 2 Roof Eaves (Y: 38, 9x9)
    for (let x = kX - 4; x <= kX + 4; x++) {
      for (let z = kZ - 4; z <= kZ + 4; z++) {
        if (Math.abs(x - kX) >= 3 || Math.abs(z - kZ) >= 3) {
          this.setVoxelInWorld(chunk, x, baseY + 14, z, BLOCKS.STONE);
        }
      }
    }
    // Castle Keep Tier 3 Watchtower & Golden Shachihoko Roof Finials (Y: 39..43, 5x5)
    for (let y = baseY + 15; y <= baseY + 17; y++) {
      for (let x = kX - 2; x <= kX + 2; x++) {
        for (let z = kZ - 2; z <= kZ + 2; z++) {
          const isEdge = (Math.abs(x - kX) === 2 || Math.abs(z - kZ) === 2);
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.SNOW);
          }
        }
      }
    }
    for (let x = kX - 3; x <= kX + 3; x++) {
      for (let z = kZ - 3; z <= kZ + 3; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 18, z, BLOCKS.STONE);
      }
    }
    for (let x = kX - 2; x <= kX + 2; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 19, kZ, BLOCKS.STONE);
    }
    this.setVoxelInWorld(chunk, kX - 2, baseY + 20, kZ, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, kX + 2, baseY + 20, kZ, BLOCKS.GOLD_ORE);

    // --- 10. Kyoto Machiya Wooden Townhouses & Matcha Tea House at (232, 272) ---
    for (const mZ of [266, 274]) {
      const mX = 233;
      for (let x = mX - 3; x <= mX + 3; x++) {
        for (let z = mZ - 2; z <= mZ + 2; z++) {
          this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.WOOD_PLANK);
          const isEdge = (Math.abs(x - mX) === 3 || Math.abs(z - mZ) === 2);
          const isDoor = (x === mX + 3 && z === mZ);
          for (let y = baseY + 2; y <= baseY + 6; y++) {
            if (isDoor && y <= baseY + 3) {
              this.setVoxelInWorld(chunk, x, y, z, (y === baseY + 3) ? BLOCKS.BRICK : BLOCKS.AIR); // Crimson noren curtain
            } else if (isEdge) {
              this.setVoxelInWorld(chunk, x, y, z, (y === baseY + 3 || y === baseY + 5) ? BLOCKS.GLASS : BLOCKS.WOOD_PLANK);
            }
          }
          // Gabled Machiya tile roof
          this.setVoxelInWorld(chunk, x, baseY + 7, z, BLOCKS.COBBLESTONE);
        }
      }
      // Glowing paper lantern outside shopfront
      this.setVoxelInWorld(chunk, mX + 4, baseY + 3, mZ - 1, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, mX + 4, baseY + 3, mZ + 1, BLOCKS.GOLD_ORE);
    }

    // --- 11. Fushimi Inari Senbon Torii Tunnel along Southern Approach (X=250, Z=222..237) ---
    for (let tz = 223; tz <= 238; tz++) {
      this.setVoxelInWorld(chunk, 249, baseY, tz, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, 250, baseY, tz, BLOCKS.STONE);
      this.setVoxelInWorld(chunk, 251, baseY, tz, BLOCKS.COBBLESTONE);
      if (tz % 3 === 1) {
        for (let y = baseY + 1; y <= baseY + 4; y++) {
          this.setVoxelInWorld(chunk, 248, y, tz, BLOCKS.BRICK);
          this.setVoxelInWorld(chunk, 252, y, tz, BLOCKS.BRICK);
        }
        for (let x = 247; x <= 253; x++) {
          this.setVoxelInWorld(chunk, x, baseY + 4, tz, BLOCKS.BRICK);
        }
        this.setVoxelInWorld(chunk, 250, baseY + 4, tz, BLOCKS.GOLD_ORE);
      }
    }

    // --- 12. Taiko Festival Drum Watchtower (Yagura) at (272, 234) ---
    const yX = 272, yZ = 234;
    for (let y = baseY + 1; y <= baseY + 7; y++) {
      this.setVoxelInWorld(chunk, yX - 2, y, yZ - 2, BLOCKS.OAK_LOG);
      this.setVoxelInWorld(chunk, yX + 2, y, yZ - 2, BLOCKS.OAK_LOG);
      this.setVoxelInWorld(chunk, yX - 2, y, yZ + 2, BLOCKS.OAK_LOG);
      this.setVoxelInWorld(chunk, yX + 2, y, yZ + 2, BLOCKS.OAK_LOG);
    }
    for (let x = yX - 2; x <= yX + 2; x++) {
      for (let z = yZ - 2; z <= yZ + 2; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 5, z, BLOCKS.WOOD_PLANK);
        this.setVoxelInWorld(chunk, x, baseY + 8, z, BLOCKS.BRICK);
      }
    }
    this.setVoxelInWorld(chunk, yX, baseY + 6, yZ, BLOCKS.GOLD_ORE); // Festival Taiko drum

    // --- 13. Sprawling Japanese Megacity Grid, Avenues & Sidewalks ---
    for (let c = 224; c <= 276; c++) {
      for (const sz of [233, 267]) {
        if (Math.abs(c - 250) > 16) {
          this.setVoxelInWorld(chunk, c, baseY, sz, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, c, baseY, sz - 1, BLOCKS.STONE); // Sidewalk
          this.setVoxelInWorld(chunk, c, baseY, sz + 1, BLOCKS.STONE); // Sidewalk
        }
      }
      for (const sx of [233, 267]) {
        if (Math.abs(c - 250) > 16) {
          this.setVoxelInWorld(chunk, sx, baseY, c, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, sx - 1, baseY, c, BLOCKS.STONE); // Sidewalk
          this.setVoxelInWorld(chunk, sx + 1, baseY, c, BLOCKS.STONE); // Sidewalk
        }
      }
    }

    // --- 14. Grand Martial Arts Dojo (Budo-kan) at (233, 233) ---
    const dojoX = 233, dojoZ = 233;
    for (let x = dojoX - 4; x <= dojoX + 4; x++) {
      for (let z = dojoZ - 4; z <= dojoZ + 4; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.WOOD_PLANK);
      }
    }
    for (let x = dojoX - 4; x <= dojoX + 4; x++) {
      for (let z = dojoZ - 4; z <= dojoZ + 4; z++) {
        const isCorner = (Math.abs(x - dojoX) === 4 && Math.abs(z - dojoZ) === 4);
        const isEdge = (Math.abs(x - dojoX) === 4 || Math.abs(z - dojoZ) === 4);
        const isDoor = (x === dojoX + 4 && z === dojoZ);
        for (let y = baseY + 2; y <= baseY + 4; y++) {
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          } else if (isDoor && y <= baseY + 3) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y === baseY + 3) ? BLOCKS.GLASS : BLOCKS.WOOD_PLANK);
          }
        }
      }
    }
    this.setVoxelInWorld(chunk, dojoX, baseY + 4, dojoZ, BLOCKS.GOLD_ORE);
    for (let x = dojoX - 5; x <= dojoX + 5; x++) {
      for (let z = dojoZ - 5; z <= dojoZ + 5; z++) {
        const isEdge = (Math.abs(x - dojoX) === 5 || Math.abs(z - dojoZ) === 5);
        if (isEdge) {
          this.setVoxelInWorld(chunk, x, baseY + 5, z, BLOCKS.BRICK);
        }
      }
    }
    for (let x = dojoX - 2; x <= dojoX + 2; x++) {
      for (let z = dojoZ - 2; z <= dojoZ + 2; z++) {
        const isEdge = (Math.abs(x - dojoX) === 2 || Math.abs(z - dojoZ) === 2);
        for (let y = baseY + 6; y <= baseY + 8; y++) {
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y === baseY + 7) ? BLOCKS.GLASS : BLOCKS.WOOD_PLANK);
          }
        }
      }
    }
    for (let x = dojoX - 3; x <= dojoX + 3; x++) {
      for (let z = dojoZ - 3; z <= dojoZ + 3; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 9, z, BLOCKS.BRICK);
      }
    }
    this.setVoxelInWorld(chunk, dojoX, baseY + 10, dojoZ, BLOCKS.GOLD_ORE);

    // --- 15. Imperial Archives & Pagoda Library at (267, 274) ---
    const libX = 267, libZ = 274;
    for (let x = libX - 4; x <= libX + 4; x++) {
      for (let z = libZ - 4; z <= libZ + 4; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.STONE);
        const isCorner = (Math.abs(x - libX) === 4 && Math.abs(z - libZ) === 4);
        const isEdge = (Math.abs(x - libX) === 4 || Math.abs(z - libZ) === 4);
        for (let y = baseY + 2; y <= baseY + 6; y++) {
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.BRICK);
          } else if (isEdge) {
            const isWindow = (y >= baseY + 4 && ((x + z) % 2 === 0));
            this.setVoxelInWorld(chunk, x, y, z, isWindow ? BLOCKS.GLASS : BLOCKS.SNOW);
          }
        }
      }
    }
    this.setVoxelInWorld(chunk, libX - 4, baseY + 3, libZ, BLOCKS.GOLD_ORE);
    for (let x = libX - 5; x <= libX + 5; x++) {
      for (let z = libZ - 5; z <= libZ + 5; z++) {
        if (Math.abs(x - libX) >= 4 || Math.abs(z - libZ) >= 4) {
          this.setVoxelInWorld(chunk, x, baseY + 7, z, BLOCKS.BRICK);
        }
      }
    }
    for (let x = libX - 3; x <= libX + 3; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 8, libZ, BLOCKS.GOLD_ORE);
    }

    // --- 16. Edo Tea Merchant Guildhouse at (268, 232) ---
    const tgX = 268, tgZ = 232;
    for (let x = tgX - 3; x <= tgX + 3; x++) {
      for (let z = tgZ - 3; z <= tgZ + 3; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.WOOD_PLANK);
        const isEdge = (Math.abs(x - tgX) === 3 || Math.abs(z - tgZ) === 3);
        for (let y = baseY + 2; y <= baseY + 5; y++) {
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y === baseY + 3) ? BLOCKS.GLASS : BLOCKS.WOOD_PLANK);
          }
        }
        this.setVoxelInWorld(chunk, x, baseY + 6, z, BLOCKS.BRICK);
      }
    }
    this.setVoxelInWorld(chunk, tgX, baseY + 3, tgZ - 3, BLOCKS.GOLD_ORE);

    // --- 17. Samurai Clan Estate & Walled Courtyard at (233, 250) ---
    const samX = 233, samZ = 250;
    for (let x = samX - 3; x <= samX + 3; x++) {
      for (let z = samZ - 3; z <= samZ + 3; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.WOOD_PLANK);
        const isEdge = (Math.abs(x - samX) === 3 || Math.abs(z - samZ) === 3);
        for (let y = baseY + 2; y <= baseY + 5; y++) {
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.WOOD_PLANK);
          }
        }
        this.setVoxelInWorld(chunk, x, baseY + 6, z, BLOCKS.BRICK);
      }
    }
    this.setVoxelInWorld(chunk, samX, baseY + 3, samZ + 3, BLOCKS.GOLD_ORE);

    // --- 18. Tōrō Stone Streetlights at Avenue Intersections ---
    const jpLamps = [
      [233, 233], [250, 233], [267, 233],
      [233, 250], [267, 250],
      [233, 267], [250, 267], [267, 267]
    ];
    for (const [lx, lz] of jpLamps) {
      this.setVoxelInWorld(chunk, lx - 2, baseY + 1, lz - 2, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 2, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 3, lz - 2, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 4, lz - 2, BLOCKS.STONE);
    }
  }

  /**
   * Helper to build a lush Sakura Cherry Blossom Tree with white and pink blossom crown
   */
  buildSakuraTree(chunk, wx, wz, baseY = 24) {
    // Curved trunk
    this.setVoxelInWorld(chunk, wx, baseY + 1, wz, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, wx, baseY + 2, wz, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, wx + 1, baseY + 3, wz, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, wx + 1, baseY + 4, wz, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, wx + 1, baseY + 5, wz, BLOCKS.OAK_LOG);

    // Lush canopy of snow (white blossom) and oak leaves
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 4; dy <= 6; dy++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy > 4) continue;
          const blossom = ((dx + dz + dy) % 2 === 0) ? BLOCKS.SNOW : BLOCKS.OAK_LEAVES;
          this.setVoxelInWorld(chunk, wx + 1 + dx, baseY + dy, wz + dz, blossom);
        }
      }
    }
    // Top blossom cap
    this.setVoxelInWorld(chunk, wx + 1, baseY + 7, wz, BLOCKS.SNOW);
  }

  /**
   * SECTOR 2: CHINA & SHANGHAI (-250, +250)
   * Modern mega-skyscrapers (37 blocks tall, up to Y = 62), glass curtain facades, central spire, boulevards
   */
  buildShanghaiSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < -300 || ox > -200 || oz + 16 < 200 || oz > 300) return;

    const baseY = 24;
    const sX = -250; // Shanghai Tower center
    const sZ = 250;

    // --- 1. Shanghai Mega-Skyscraper (Y: 25 to 62) ---
    // Podium Lobby (Y: 25..28): 9x9 base
    for (let x = sX - 4; x <= sX + 4; x++) {
      for (let z = sZ - 4; z <= sZ + 4; z++) {
        const isCorner = (x === sX - 4 || x === sX + 4) && (z === sZ - 4 || z === sZ + 4);
        const isEdge = (x === sX - 4 || x === sX + 4 || z === sZ - 4 || z === sZ + 4);

        for (let y = baseY + 1; y <= baseY + 4; y++) {
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.STONE);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GLASS);
          } else if (y === baseY + 1) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE);
          }
        }
      }
    }

    // Tower Shaft (Y: 29..51) - 23 floors of glass and steel (7x7 footprint)
    for (let y = baseY + 5; y <= baseY + 27; y++) {
      const isFloorSlab = (y % 4 === 0);
      for (let x = sX - 3; x <= sX + 3; x++) {
        for (let z = sZ - 3; z <= sZ + 3; z++) {
          const isCorner = (x === sX - 3 || x === sX + 3) && (z === sZ - 3 || z === sZ + 3);
          const isEdge = (x === sX - 3 || x === sX + 3 || z === sZ - 3 || z === sZ + 3);

          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.STONE);
          } else if (isFloorSlab && isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.IRON_ORE); // Floor accent belt
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GLASS); // Glass curtain facade
          } else if (x === sX && z === sZ) {
            // Interior glowing elevator core
            this.setVoxelInWorld(chunk, x, y, z, (y % 3 === 0) ? BLOCKS.GOLD_ORE : BLOCKS.STONE);
          }
        }
      }
    }

    // Tapering Crown (Y: 52..56): 5x5 geometric glass pyramid
    for (let y = baseY + 28; y <= baseY + 32; y++) {
      const inset = Math.floor((y - (baseY + 28)) / 2);
      for (let x = sX - 2 + inset; x <= sX + 2 - inset; x++) {
        for (let z = sZ - 2 + inset; z <= sZ + 2 - inset; z++) {
          const isEdge = (x === sX - 2 + inset || x === sX + 2 - inset || z === sZ - 2 + inset || z === sZ + 2 - inset);
          this.setVoxelInWorld(chunk, x, y, z, isEdge ? BLOCKS.GLASS : BLOCKS.IRON_ORE);
        }
      }
    }

    // Tower Communication Spire & Aviation Beacon (Y: 57..62)
    for (let y = baseY + 33; y <= baseY + 37; y++) {
      this.setVoxelInWorld(chunk, sX, y, sZ, BLOCKS.IRON_ORE);
    }
    this.setVoxelInWorld(chunk, sX, baseY + 38, sZ, BLOCKS.GOLD_ORE); // Beacon at Y = 62

    // --- 2. Shanghai Financial High-Rise 2 at (-240, 254) (Jin Mao style) ---
    const jX = -240, jZ = 254;
    // Base tier (Y: 25..34): 7x7
    for (let y = baseY + 1; y <= baseY + 10; y++) {
      for (let x = jX - 3; x <= jX + 3; x++) {
        for (let z = jZ - 3; z <= jZ + 3; z++) {
          const isEdge = (x === jX - 3 || x === jX + 3 || z === jZ - 3 || z === jZ + 3);
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y % 3 === 0) ? BLOCKS.STONE : BLOCKS.GLASS);
          }
        }
      }
    }
    // Mid tier (Y: 35..43): 5x5
    for (let y = baseY + 11; y <= baseY + 19; y++) {
      for (let x = jX - 2; x <= jX + 2; x++) {
        for (let z = jZ - 2; z <= jZ + 2; z++) {
          const isEdge = (x === jX - 2 || x === jX + 2 || z === jZ - 2 || z === jZ + 2);
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y % 3 === 0) ? BLOCKS.STONE : BLOCKS.GLASS);
          }
        }
      }
    }
    // Crown (Y: 44..48): 3x3
    for (let y = baseY + 20; y <= baseY + 24; y++) {
      for (let x = jX - 1; x <= jX + 1; x++) {
        for (let z = jZ - 1; z <= jZ + 1; z++) {
          this.setVoxelInWorld(chunk, x, y, z, BLOCKS.STONE);
        }
      }
    }
    this.setVoxelInWorld(chunk, jX, baseY + 25, jZ, BLOCKS.GOLD_ORE);

    // --- 3. Avenue Streetlights ---
    const lamps = [[-244, 244], [-256, 244], [-244, 258], [-258, 252]];
    for (const [lx, lz] of lamps) {
      for (let y = baseY + 1; y <= baseY + 3; y++) {
        this.setVoxelInWorld(chunk, lx, y, lz, BLOCKS.IRON_ORE);
      }
      this.setVoxelInWorld(chunk, lx - 1, baseY + 4, lz, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, lx + 1, baseY + 4, lz, BLOCKS.GOLD_ORE);
    }

    // --- 4. The Oriental Pearl Tower (东方明珠电视塔) at (-260, 260) ---
    const pX = -260, pZ = 260;
    // Tripod Space-Frame Legs (Y: 25..31)
    const tripodLegs = [
      [-3, -2], [3, -2], [0, 4]
    ];
    for (const [dx, dz] of tripodLegs) {
      for (let y = baseY + 1; y <= baseY + 7; y++) {
        this.setVoxelInWorld(chunk, pX + dx, y, pZ + dz, BLOCKS.IRON_ORE);
      }
    }
    // Lower Spherical Observation Globe (Y: 32..36, 5x5 sphere)
    for (let y = baseY + 8; y <= baseY + 12; y++) {
      const r = (y === baseY + 8 || y === baseY + 12) ? 1 : 2;
      for (let x = pX - r; x <= pX + r; x++) {
        for (let z = pZ - r; z <= pZ + r; z++) {
          const isEdge = (Math.abs(x - pX) === r || Math.abs(z - pZ) === r);
          this.setVoxelInWorld(chunk, x, y, z, isEdge ? BLOCKS.GLASS : BLOCKS.BRICK);
        }
      }
    }
    // Central Column Shaft (Y: 37..44)
    for (let y = baseY + 13; y <= baseY + 20; y++) {
      for (let x = pX - 1; x <= pX + 1; x++) {
        for (let z = pZ - 1; z <= pZ + 1; z++) {
          this.setVoxelInWorld(chunk, x, y, z, (x === pX && z === pZ) ? BLOCKS.GOLD_ORE : BLOCKS.STONE);
        }
      }
    }
    // Upper Observation Sphere (Y: 45..49, 5x5 sphere)
    for (let y = baseY + 21; y <= baseY + 25; y++) {
      const r = (y === baseY + 21 || y === baseY + 25) ? 1 : 2;
      for (let x = pX - r; x <= pX + r; x++) {
        for (let z = pZ - r; z <= pZ + r; z++) {
          const isEdge = (Math.abs(x - pX) === r || Math.abs(z - pZ) === r);
          this.setVoxelInWorld(chunk, x, y, z, isEdge ? BLOCKS.GLASS : BLOCKS.GOLD_ORE);
        }
      }
    }
    // Top Sky Pod & Antenna Mast (Y: 50..62)
    for (let y = baseY + 26; y <= baseY + 37; y++) {
      this.setVoxelInWorld(chunk, pX, y, pZ, BLOCKS.IRON_ORE);
    }
    this.setVoxelInWorld(chunk, pX, baseY + 38, pZ, BLOCKS.GOLD_ORE); // Beacon at Y = 62

    // --- 5. Imperial Chinese Gateway Arch (Paifang / 中华牌坊) at (-242, 240) ---
    const pfX = -242, pfZ = 240;
    // 4 Crimson Pillars (Y: 25..29)
    const pillarX = [pfX - 4, pfX - 1, pfX + 1, pfX + 4];
    for (const px of pillarX) {
      for (let y = baseY + 1; y <= baseY + 5; y++) {
        this.setVoxelInWorld(chunk, px, y, pfZ, BLOCKS.BRICK);
      }
    }
    // Lintel beam and decorative signboard (Y: 30)
    for (let x = pfX - 5; x <= pfX + 5; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 6, pfZ, (x === pfX) ? BLOCKS.GOLD_ORE : BLOCKS.BRICK);
    }
    // Golden upturned tiled roofs with flared eaves (Y: 31..32)
    for (let x = pfX - 6; x <= pfX + 6; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 7, pfZ, BLOCKS.WOOD_PLANK);
      if (Math.abs(x - pfX) <= 2) {
        this.setVoxelInWorld(chunk, x, baseY + 8, pfZ, BLOCKS.GOLD_ORE);
      }
    }
    // Flared eave tips
    this.setVoxelInWorld(chunk, pfX - 6, baseY + 8, pfZ, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, pfX + 6, baseY + 8, pfZ, BLOCKS.WOOD_PLANK);

    // --- 6. Shanghai World Financial Center ("Bottle Opener" Skyscraper) at (-274, 246) ---
    const swX = -274, swZ = 246;
    for (let y = baseY + 1; y <= baseY + 36; y++) {
      for (let x = swX - 4; x <= swX + 4; x++) {
        for (let z = swZ - 3; z <= swZ + 3; z++) {
          // Iconic trapezoidal "bottle opener" skybridge aperture near crown (Y: 51..56)
          const inAperture = (y >= baseY + 27 && y <= baseY + 32 && Math.abs(x - swX) <= 2);
          if (inAperture) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
            continue;
          }
          const isEdge = (Math.abs(x - swX) === 4 || Math.abs(z - swZ) === 3);
          const isSkybridge = ((y === baseY + 26 || y === baseY + 33 || y === baseY + 34) && Math.abs(x - swX) <= 2);
          if (isSkybridge) {
            this.setVoxelInWorld(chunk, x, y, z, (y === baseY + 33) ? BLOCKS.GOLD_ORE : BLOCKS.IRON_ORE);
          } else if (isEdge) {
            const isCorner = (Math.abs(x - swX) === 4 && Math.abs(z - swZ) === 3);
            this.setVoxelInWorld(chunk, x, y, z, isCorner ? BLOCKS.IRON_ORE : BLOCKS.GLASS);
          }
        }
      }
    }
    this.setVoxelInWorld(chunk, swX - 4, baseY + 37, swZ, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, swX + 4, baseY + 37, swZ, BLOCKS.GOLD_ORE);

    // --- 7. Imperial Forbidden City Hall of Supreme Harmony at (-232, 274) ---
    const fcX = -232, fcZ = 274;
    // White marble two-tier terrace (Y: 25..26, 15x11)
    for (let x = fcX - 7; x <= fcX + 7; x++) {
      for (let z = fcZ - 5; z <= fcZ + 5; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.SNOW);
        if (Math.abs(x - fcX) <= 6 && Math.abs(z - fcZ) <= 4) {
          this.setVoxelInWorld(chunk, x, baseY + 2, z, BLOCKS.STONE);
        }
      }
    }
    // Crimson imperial colonnade & palace walls (Y: 27..31, 11x7)
    for (let y = baseY + 3; y <= baseY + 7; y++) {
      for (let x = fcX - 5; x <= fcX + 5; x++) {
        for (let z = fcZ - 3; z <= fcZ + 3; z++) {
          const isEdge = (Math.abs(x - fcX) === 5 || Math.abs(z - fcZ) === 3);
          const isDoor = (Math.abs(x - fcX) <= 1 && z === fcZ - 3 && y <= baseY + 5);
          if (isDoor) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.BRICK);
          }
        }
      }
    }
    // Double-eaved golden imperial roof (Y: 32..35)
    for (let x = fcX - 6; x <= fcX + 6; x++) {
      for (let z = fcZ - 4; z <= fcZ + 4; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 8, z, BLOCKS.GOLD_ORE);
      }
    }
    for (let x = fcX - 5; x <= fcX + 5; x++) {
      for (let z = fcZ - 3; z <= fcZ + 3; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 9, z, BLOCKS.WOOD_PLANK);
        this.setVoxelInWorld(chunk, x, baseY + 10, z, BLOCKS.GOLD_ORE);
      }
    }
    for (let x = fcX - 4; x <= fcX + 4; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 11, fcZ, BLOCKS.GOLD_ORE);
    }

    // --- 8. Huangpu River Bund Basin & Illuminated Cruise Ship at (-276, 272) ---
    for (let x = -284; x <= -268; x++) {
      for (let z = 264; z <= 284; z++) {
        const isQuay = (x === -284 || x === -268 || z === 264 || z === 284);
        this.setVoxelInWorld(chunk, x, baseY, z, isQuay ? BLOCKS.COBBLESTONE : BLOCKS.WATER);
      }
    }
    // Bund River Cruise Ship (X: -278..-274, Z: 268..280)
    for (let z = 268; z <= 280; z++) {
      const r = (z === 268 || z === 280) ? 1 : 2;
      for (let x = -276 - r; x <= -276 + r; x++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, x, baseY + 2, z, BLOCKS.SNOW);
        if (z >= 270 && z <= 278) {
          this.setVoxelInWorld(chunk, x, baseY + 3, z, BLOCKS.GLASS);
          this.setVoxelInWorld(chunk, x, baseY + 4, z, (z % 2 === 0) ? BLOCKS.GOLD_ORE : BLOCKS.SNOW);
        }
      }
    }

    // --- 9. Sprawling Metropolitan Grid, Avenues & Sidewalks ---
    for (let c = -276; c <= -224; c++) {
      for (const sz of [233, 267]) {
        if (Math.abs(c - (-250)) > 16) {
          const isStripe = ((Math.abs(c) % 4) <= 1);
          this.setVoxelInWorld(chunk, c, baseY, sz, isStripe ? BLOCKS.SNOW : (BLOCKS.ASPHALT || BLOCKS.COBBLESTONE));
          this.setVoxelInWorld(chunk, c, baseY, sz - 1, BLOCKS.STONE); // Sidewalk
          this.setVoxelInWorld(chunk, c, baseY, sz + 1, BLOCKS.STONE); // Sidewalk
        }
      }
      for (const sx of [-267, -233]) {
        if (Math.abs(c - 250) > 16) {
          const isStripe = ((Math.abs(c) % 4) <= 1);
          this.setVoxelInWorld(chunk, sx, baseY, c, isStripe ? BLOCKS.SNOW : (BLOCKS.ASPHALT || BLOCKS.COBBLESTONE));
          this.setVoxelInWorld(chunk, sx - 1, baseY, c, BLOCKS.STONE); // Sidewalk
          this.setVoxelInWorld(chunk, sx + 1, baseY, c, BLOCKS.STONE); // Sidewalk
        }
      }
    }

    // --- 10. Bank of China Tower (Torre Banco de China) at (-267, 267) ---
    const bocX = -267, bocZ = 267;
    for (let y = baseY + 1; y <= baseY + 34; y++) {
      for (let x = bocX - 4; x <= bocX + 4; x++) {
        for (let z = bocZ - 4; z <= bocZ + 4; z++) {
          const isCorner = (Math.abs(x - bocX) === 4 && Math.abs(z - bocZ) === 4);
          const isEdge = (Math.abs(x - bocX) === 4 || Math.abs(z - bocZ) === 4);
          const isTruss = ((Math.abs(x - bocX) + Math.abs(z - bocZ)) % 4 === (y % 4));
          const isLitOffice = (y % 3 === 0 && (x + z) % 2 === 0);

          if (isCorner || (isEdge && isTruss)) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.IRON_ORE);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, isLitOffice ? BLOCKS.GOLD_ORE : BLOCKS.GLASS);
          }
        }
      }
    }
    this.setVoxelInWorld(chunk, bocX - 2, baseY + 35, bocZ, BLOCKS.IRON_ORE);
    this.setVoxelInWorld(chunk, bocX - 2, baseY + 36, bocZ, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, bocX + 2, baseY + 35, bocZ, BLOCKS.IRON_ORE);
    this.setVoxelInWorld(chunk, bocX + 2, baseY + 36, bocZ, BLOCKS.GOLD_ORE);

    // --- 11. Shanghai World Expo Grand Pavilion at (-267, 233) ---
    const expX = -267, expZ = 233;
    for (let tier = 0; tier < 4; tier++) {
      const r = 2 + tier;
      const tY = baseY + 1 + tier * 2;
      for (let x = expX - r; x <= expX + r; x++) {
        for (let z = expZ - r; z <= expZ + r; z++) {
          const isEdge = (Math.abs(x - expX) === r || Math.abs(z - expZ) === r);
          this.setVoxelInWorld(chunk, x, tY, z, isEdge ? BLOCKS.BRICK : BLOCKS.GLASS);
          this.setVoxelInWorld(chunk, x, tY + 1, z, isEdge ? BLOCKS.BRICK : BLOCKS.GLASS);
        }
      }
    }
    for (let y = baseY + 1; y <= baseY + 9; y++) {
      this.setVoxelInWorld(chunk, expX, y, expZ, BLOCKS.GOLD_ORE);
    }

    // --- 12. Lujiazui Financial Center Tower 2 at (-233, 267) ---
    const l2X = -233, l2Z = 267;
    for (let y = baseY + 1; y <= baseY + 28; y++) {
      for (let x = l2X - 3; x <= l2X + 3; x++) {
        for (let z = l2Z - 3; z <= l2Z + 3; z++) {
          const isCorner = (Math.abs(x - l2X) === 3 && Math.abs(z - l2Z) === 3);
          const isEdge = (Math.abs(x - l2X) === 3 || Math.abs(z - l2Z) === 3);
          const isSkyLobby = (y >= baseY + 14 && y <= baseY + 15);
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.STONE);
          } else if (isSkyLobby && isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GOLD_ORE);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GLASS);
          }
        }
      }
    }
    this.setVoxelInWorld(chunk, l2X, baseY + 29, l2Z, BLOCKS.IRON_ORE);
    this.setVoxelInWorld(chunk, l2X, baseY + 30, l2Z, BLOCKS.GOLD_ORE);

    // --- 13. Grand Metro Central Station Pavilion at (-233, 233) ---
    const metX = -233, metZ = 233;
    for (let x = metX - 3; x <= metX + 3; x++) {
      for (let z = metZ - 3; z <= metZ + 3; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.STONE);
        const isEdge = (Math.abs(x - metX) === 3 || Math.abs(z - metZ) === 3);
        const isDoor = (z === metZ + 3 && Math.abs(x - metX) <= 1);
        for (let y = baseY + 2; y <= baseY + 4; y++) {
          if (isDoor) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GLASS);
          }
        }
        this.setVoxelInWorld(chunk, x, baseY + 5, z, BLOCKS.GLASS);
      }
    }
    this.setVoxelInWorld(chunk, metX, baseY + 4, metZ, BLOCKS.GOLD_ORE);

    // --- 14. Modern Dual-Mast LED Streetlights at Intersections ---
    const shLamps = [
      [-267, 233], [-250, 233], [-233, 233],
      [-267, 250], [-233, 250],
      [-267, 267], [-250, 267], [-233, 267]
    ];
    for (const [lx, lz] of shLamps) {
      this.setVoxelInWorld(chunk, lx - 2, baseY + 1, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 2, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 3, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 4, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 3, baseY + 4, lz - 2, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, lx - 1, baseY + 4, lz - 2, BLOCKS.GOLD_ORE);
    }
  }

  /**
   * SECTOR 3: PARÍS & TORRE EIFFEL A ESCALA (+250, -250)
   * 4 arched corner legs, 1st & 2nd observation decks, lattice spire, Champs-Élysées garden promenade
   */
  buildParisSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < 200 || ox > 300 || oz + 16 < -300 || oz > -200) return;

    const baseY = 24;
    const eX = 250; // Eiffel Tower center
    const eZ = -250;

    // --- 1. Eiffel Tower 4 Arched Corner Pylons (Piliers) ---
    // Pylon corners at ground level (offset 5 from center: radius 5 -> 11x11 footprint)
    const legCoords = [
      [-5, -5], [-4, -5], [-5, -4], // NW leg
      [5, -5],  [4, -5],  [5, -4],  // NE leg
      [-5, 5],  [-4, 5],  [-5, 4],  // SW leg
      [5, 5],   [4, 5],   [5, 4]    // SE leg
    ];
    for (const [dx, dz] of legCoords) {
      this.setVoxelInWorld(chunk, eX + dx, baseY + 1, eZ + dz, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, eX + dx, baseY + 2, eZ + dz, BLOCKS.IRON_ORE);
    }

    // Legs curve inward as they ascend (Y: 27..32)
    const curveOffsets = [
      { y: baseY + 3, r: 4 },
      { y: baseY + 4, r: 4 },
      { y: baseY + 5, r: 3 },
      { y: baseY + 6, r: 3 },
      { y: baseY + 7, r: 2 },
      { y: baseY + 8, r: 2 }
    ];
    for (const level of curveOffsets) {
      const r = level.r;
      const corners = [
        [-r, -r], [-r + 1, -r], [-r, -r + 1],
        [r, -r],  [r - 1, -r],  [r, -r + 1],
        [-r, r],  [-r + 1, r],  [-r, r - 1],
        [r, r],   [r - 1, r],   [r, r - 1]
      ];
      for (const [dx, dz] of corners) {
        this.setVoxelInWorld(chunk, eX + dx, level.y, eZ + dz, BLOCKS.IRON_ORE);
      }
    }

    // Under-arch connecting the 4 legs (Grandes Arches) with curved parabolic profile
    const archDistances = [-3, -2, -1, 0, 1, 2, 3];
    for (const d of archDistances) {
      const archH = (Math.abs(d) <= 1) ? baseY + 6 : ((Math.abs(d) === 2) ? baseY + 5 : baseY + 4);
      for (let y = archH; y <= baseY + 6; y++) {
        this.setVoxelInWorld(chunk, eX + d, y, eZ - 3, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, eX + d, y, eZ + 3, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, eX - 3, y, eZ + d, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, eX + 3, y, eZ + d, BLOCKS.IRON_ORE);
      }
    }

    // Under-tower golden compass rose & commemorative plaza
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const isCenter = (dx === 0 && dz === 0);
        const isDiag = (Math.abs(dx) === Math.abs(dz));
        this.setVoxelInWorld(chunk, eX + dx, baseY, eZ + dz, isCenter ? BLOCKS.GOLD_ORE : (isDiag ? BLOCKS.BRICK : BLOCKS.COBBLESTONE));
      }
    }

    // --- 1st Observation Platform (1er Étage) at Y = 32..33 (11x11 Platform) ---
    for (let x = eX - 5; x <= eX + 5; x++) {
      for (let z = eZ - 5; z <= eZ + 5; z++) {
        const isRailing = (x === eX - 5 || x === eX + 5 || z === eZ - 5 || z === eZ + 5);
        this.setVoxelInWorld(chunk, x, baseY + 8, z, BLOCKS.WOOD_PLANK);
        if (isRailing) {
          this.setVoxelInWorld(chunk, x, baseY + 9, z, BLOCKS.IRON_ORE); // Iron railing
        }
      }
    }

    // Mid Tower Pylons tapering (Y: 34..39)
    for (let y = baseY + 10; y <= baseY + 14; y++) {
      const r = (y >= baseY + 13) ? 1 : 2;
      const pts = [
        [-r, -r], [r, -r], [-r, r], [r, r]
      ];
      for (const [dx, dz] of pts) {
        this.setVoxelInWorld(chunk, eX + dx, y, eZ + dz, BLOCKS.IRON_ORE);
      }
    }

    // --- 2nd Observation Platform (2e Étage) at Y = 39..40 (5x5 Platform) ---
    for (let x = eX - 2; x <= eX + 2; x++) {
      for (let z = eZ - 2; z <= eZ + 2; z++) {
        const isRailing = (x === eX - 2 || x === eX + 2 || z === eZ - 2 || z === eZ + 2);
        this.setVoxelInWorld(chunk, x, baseY + 15, z, BLOCKS.STONE);
        if (isRailing) {
          this.setVoxelInWorld(chunk, x, baseY + 16, z, BLOCKS.IRON_ORE);
        }
      }
    }

    // --- Upper Tapering Lattice Tower (Y: 41..52) ---
    for (let y = baseY + 17; y <= baseY + 28; y++) {
      for (let x = eX - 1; x <= eX + 1; x++) {
        for (let z = eZ - 1; z <= eZ + 1; z++) {
          const isCorner = (x !== eX || z !== eZ);
          this.setVoxelInWorld(chunk, x, y, z, isCorner ? BLOCKS.IRON_ORE : BLOCKS.COBBLESTONE);
        }
      }
    }

    // --- 3rd Observation Deck & Dome (Sommet) at Y = 53..55 ---
    for (let x = eX - 1; x <= eX + 1; x++) {
      for (let z = eZ - 1; z <= eZ + 1; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 29, z, BLOCKS.STONE); // Floor
        this.setVoxelInWorld(chunk, x, baseY + 30, z, BLOCKS.GLASS); // Lantern window
        this.setVoxelInWorld(chunk, x, baseY + 31, z, BLOCKS.STONE); // Dome cap
      }
    }

    // --- Spire & Radiant Light Beacon (Y: 56..61) ---
    for (let y = baseY + 32; y <= baseY + 36; y++) {
      this.setVoxelInWorld(chunk, eX, y, eZ, BLOCKS.IRON_ORE);
    }
    this.setVoxelInWorld(chunk, eX, baseY + 37, eZ, BLOCKS.GOLD_ORE); // Golden beacon at Y = 61

    // --- 2. Champs-Élysées Garden Boulevard & Reflecting Pool ---
    // Wide promenade at eZ + 10 (z = -240)
    for (let x = eX - 12; x <= eX + 12; x++) {
      for (let z = -242; z <= -238; z++) {
        this.setVoxelInWorld(chunk, x, baseY, z, (z === -242 || z === -238) ? BLOCKS.COBBLESTONE : BLOCKS.GRAVEL);
      }
    }
    // Symmetrical manicured trees
    const treePoints = [[240, -240], [245, -240], [255, -240], [260, -240]];
    for (const [tx, tz] of treePoints) {
      this.setVoxelInWorld(chunk, tx, baseY + 1, tz, BLOCKS.OAK_LOG);
      this.setVoxelInWorld(chunk, tx, baseY + 2, tz, BLOCKS.OAK_LOG);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          this.setVoxelInWorld(chunk, tx + dx, baseY + 3, tz + dz, BLOCKS.OAK_LEAVES);
        }
      }
      this.setVoxelInWorld(chunk, tx, baseY + 4, tz, BLOCKS.OAK_LEAVES);
    }
    // Reflecting Pool
    for (let x = 248; x <= 252; x++) {
      for (let z = -241; z <= -239; z++) {
        this.setVoxelInWorld(chunk, x, baseY, z, BLOCKS.WATER);
      }
    }

    // --- 3. Arc de Triomphe (Arco de Triunfo de París) at (262, -240) ---
    const aX = 262, aZ = -240;
    // Monumental stone footprint (11 wide along X, 7 deep along Z, Y: 25..34)
    for (let x = aX - 5; x <= aX + 5; x++) {
      for (let z = aZ - 3; z <= aZ + 3; z++) {
        const isArchPortal = (Math.abs(x - aX) <= 2); // Central vaulted archway (5 blocks wide)
        for (let y = baseY + 1; y <= baseY + 10; y++) {
          if (isArchPortal && y <= baseY + 6) {
            // Vaulted arch ceiling
            if (y === baseY + 6 && Math.abs(x - aX) === 2) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.STONE);
            } else {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
            }
          } else if (y <= baseY + 8) {
            // Main pylons and arch vault
            const isCorner = (Math.abs(x - aX) === 5 && Math.abs(z - aZ) === 3);
            this.setVoxelInWorld(chunk, x, y, z, isCorner ? BLOCKS.COBBLESTONE : BLOCKS.STONE);
          } else if (y === baseY + 9) {
            // Sculpted attic frieze belt
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.BRICK);
          } else if (y === baseY + 10) {
            // Top observation terrace & balustrade
            const isBalustrade = (Math.abs(x - aX) === 5 || Math.abs(z - aZ) === 3);
            this.setVoxelInWorld(chunk, x, y, z, isBalustrade ? BLOCKS.COBBLESTONE : BLOCKS.STONE);
          }
        }
      }
    }

    // --- 4. Grand Louvre Glass Pyramid & Courtyard Reflecting Pools at (232, -264) ---
    const lvX = 232, lvZ = -264;
    for (let x = lvX - 8; x <= lvX + 8; x++) {
      for (let z = lvZ - 8; z <= lvZ + 8; z++) {
        const isPool = (Math.abs(x - lvX) > 6 || Math.abs(z - lvZ) > 6) && (Math.abs(x - lvX) <= 8 && Math.abs(z - lvZ) <= 8);
        this.setVoxelInWorld(chunk, x, baseY, z, isPool ? BLOCKS.WATER : BLOCKS.COBBLESTONE);
      }
    }
    // Stepped Crystalline Glass & Steel Lattice Pyramid (Y: 25..31)
    for (let step = 0; step <= 6; step++) {
      const r = 6 - step;
      const y = baseY + 1 + step;
      for (let x = lvX - r; x <= lvX + r; x++) {
        for (let z = lvZ - r; z <= lvZ + r; z++) {
          const isEdge = (Math.abs(x - lvX) === r || Math.abs(z - lvZ) === r);
          const isDiag = (Math.abs(x - lvX) === Math.abs(z - lvZ));
          if (step === 6) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GOLD_ORE); // Illuminated pyramid apex
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, isDiag ? BLOCKS.IRON_ORE : BLOCKS.GLASS);
          }
        }
      }
    }

    // --- 5. Notre-Dame de Paris Gothic Cathedral at (274, -268) ---
    const ndX = 274, ndZ = -268;
    // Cathedral Nave & Twin Western Bell Towers (X: 269..279, Z: -276..-260)
    for (let x = ndX - 5; x <= ndX + 5; x++) {
      for (let z = ndZ - 8; z <= ndZ + 8; z++) {
        const isWestFacade = (z >= ndZ + 5);
        const isTower = isWestFacade && (Math.abs(x - ndX) >= 2);
        const maxH = isTower ? baseY + 19 : baseY + 12;
        const isWall = (Math.abs(x - ndX) === 5 || z === ndZ - 8 || z === ndZ + 8 || (isTower && (Math.abs(x - ndX) === 2 || z === ndZ + 5)));
        const isPortal = (z === ndZ + 8 && Math.abs(x - ndX) <= 1 && true);

        for (let y = baseY + 1; y <= maxH; y++) {
          if (isPortal && y <= baseY + 4) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          } else if (z === ndZ + 8 && Math.abs(x - ndX) <= 2 && y >= baseY + 7 && y <= baseY + 11) {
            // Iconic Gothic Rose Window
            const isRoseCenter = (x === ndX && y === baseY + 9);
            this.setVoxelInWorld(chunk, x, y, z, isRoseCenter ? BLOCKS.GOLD_ORE : BLOCKS.GLASS);
          } else if (isWall) {
            const isButtress = (z % 3 === 0 && Math.abs(x - ndX) === 5);
            const isStainedGlass = (!isTower && Math.abs(x - ndX) === 5 && (z % 3 !== 0) && y >= baseY + 4 && y <= baseY + 9);
            this.setVoxelInWorld(chunk, x, y, z, isStainedGlass ? BLOCKS.GLASS : (isButtress ? BLOCKS.COBBLESTONE : BLOCKS.STONE));
          }
        }
      }
    }
    // Pitched Cathedral Lead Roof & Central Gothic Flèche Spire (Y: 37..48)
    for (let z = ndZ - 8; z <= ndZ + 4; z++) {
      for (let s = 0; s <= 4; s++) {
        this.setVoxelInWorld(chunk, ndX - 4 + s, baseY + 13 + s, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, ndX + 4 - s, baseY + 13 + s, z, BLOCKS.COBBLESTONE);
      }
    }
    for (let y = baseY + 17; y <= baseY + 24; y++) {
      this.setVoxelInWorld(chunk, ndX, y, ndZ - 2, (y === baseY + 24) ? BLOCKS.GOLD_ORE : BLOCKS.IRON_ORE);
    }

    // --- 6. Haussmannian Apartment Block & Parisian Corner Bistro at (232, -234) ---
    const bX = 232, bZ = -234;
    for (let x = bX - 4; x <= bX + 4; x++) {
      for (let z = bZ - 3; z <= bZ + 3; z++) {
        const isEdge = (Math.abs(x - bX) === 4 || Math.abs(z - bZ) === 3);
        for (let y = baseY + 1; y <= baseY + 10; y++) {
          if (y === baseY + 10) {
            // Zinc mansard roof
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE);
          } else if (isEdge) {
            const isWindow = (y % 3 === 0 && (x + z) % 2 === 0);
            this.setVoxelInWorld(chunk, x, y, z, isWindow ? BLOCKS.GLASS : BLOCKS.SAND);
          }
        }
      }
    }
    // Red-and-white striped Parisian café awning along southern sidewalk (z = bZ + 4)
    for (let x = bX - 4; x <= bX + 4; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 3, bZ + 4, (x % 2 === 0) ? BLOCKS.BRICK : BLOCKS.SNOW);
    }
    // Outdoor café bistro tables
    this.setVoxelInWorld(chunk, bX - 2, baseY + 1, bZ + 5, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, bX + 2, baseY + 1, bZ + 5, BLOCKS.WOOD_PLANK);

    // --- 7. Sprawling Haussmannian Boulevard Grid, Sidewalks & Plazas ---
    for (let c = 224; c <= 276; c++) {
      for (const sz of [-260, -240]) {
        if (Math.abs(c - 250) > 16) {
          this.setVoxelInWorld(chunk, c, baseY, sz, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, c, baseY, sz - 1, BLOCKS.GRAVEL);
          this.setVoxelInWorld(chunk, c, baseY, sz + 1, BLOCKS.GRAVEL);
        }
      }
      for (const sx of [234, 266]) {
        if (Math.abs(c - (-250)) > 16) {
          this.setVoxelInWorld(chunk, sx, baseY, c, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, sx - 1, baseY, c, BLOCKS.GRAVEL);
          this.setVoxelInWorld(chunk, sx + 1, baseY, c, BLOCKS.GRAVEL);
        }
      }
    }

    // --- 8. Haussmannian Grand Apartment Block (Ouest) at (234, -266) ---
    const ap1X = 234, ap1Z = -266;
    for (let x = ap1X - 4; x <= ap1X + 4; x++) {
      for (let z = ap1Z - 4; z <= ap1Z + 4; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.STONE);
        const isCorner = (Math.abs(x - ap1X) === 4 && Math.abs(z - ap1Z) === 4);
        const isEdge = (Math.abs(x - ap1X) === 4 || Math.abs(z - ap1Z) === 4);

        for (let y = baseY + 2; y <= baseY + 12; y++) {
          if (y === baseY + 12) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE);
          } else if (y >= baseY + 10 && isEdge) {
            const isLucarne = (y === baseY + 11 && (x + z) % 2 === 0);
            this.setVoxelInWorld(chunk, x, y, z, isLucarne ? BLOCKS.GLASS : BLOCKS.BRICK);
          } else if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.STONE);
          } else if (isEdge) {
            if (y === baseY + 2 || y === baseY + 3) {
              const isDisplay = ((x + z) % 2 === 0);
              this.setVoxelInWorld(chunk, x, y, z, isDisplay ? BLOCKS.GLASS : BLOCKS.STONE);
              if (isDisplay && y === baseY + 2) {
                this.setVoxelInWorld(chunk, x, baseY + 2, z, BLOCKS.GOLD_ORE);
              }
            } else if (y === baseY + 6 || y === baseY + 9) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.IRON_ORE);
            } else {
              const isWindow = ((x + z) % 2 === 0);
              this.setVoxelInWorld(chunk, x, y, z, isWindow ? BLOCKS.GLASS : BLOCKS.SAND);
            }
          }
        }
      }
    }

    // --- 9. Haussmannian Grand Apartment Block & "Café de Paris" (Est) at (266, -266) ---
    const ap2X = 266, ap2Z = -266;
    for (let x = ap2X - 4; x <= ap2X + 4; x++) {
      for (let z = ap2Z - 4; z <= ap2Z + 4; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.STONE);
        const isCorner = (Math.abs(x - ap2X) === 4 && Math.abs(z - ap2Z) === 4);
        const isEdge = (Math.abs(x - ap2X) === 4 || Math.abs(z - ap2Z) === 4);

        for (let y = baseY + 2; y <= baseY + 12; y++) {
          if (y === baseY + 12) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE);
          } else if (y >= baseY + 10 && isEdge) {
            const isLucarne = (y === baseY + 11 && (x + z) % 2 === 0);
            this.setVoxelInWorld(chunk, x, y, z, isLucarne ? BLOCKS.GLASS : BLOCKS.BRICK);
          } else if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.STONE);
          } else if (isEdge) {
            if (y === baseY + 6 || y === baseY + 9) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.IRON_ORE);
            } else {
              const isWindow = ((x + z) % 2 === 0);
              this.setVoxelInWorld(chunk, x, y, z, isWindow ? BLOCKS.GLASS : BLOCKS.SAND);
            }
          }
        }
      }
    }
    for (let z = ap2Z - 4; z <= ap2Z + 4; z++) {
      this.setVoxelInWorld(chunk, ap2X - 5, baseY + 3, z, (z % 2 === 0) ? BLOCKS.BRICK : BLOCKS.SNOW);
      if (z % 3 === 0) {
        this.setVoxelInWorld(chunk, ap2X - 6, baseY + 1, z, BLOCKS.WOOD_PLANK);
      }
    }
    this.setVoxelInWorld(chunk, ap2X, baseY + 3, ap2Z - 4, BLOCKS.GOLD_ORE);

    // --- 10. Palais Garnier / Opéra National Wing at (234, -226) ---
    const opX = 234, opZ = -226;
    for (let x = opX - 4; x <= opX + 4; x++) {
      for (let z = opZ - 4; z <= opZ + 4; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.STONE);
        const isEdge = (Math.abs(x - opX) === 4 || Math.abs(z - opZ) === 4);
        for (let y = baseY + 2; y <= baseY + 6; y++) {
          if (isEdge) {
            const isColonnade = ((x + z) % 2 === 0);
            this.setVoxelInWorld(chunk, x, y, z, isColonnade ? BLOCKS.STONE : BLOCKS.GLASS);
          }
        }
        this.setVoxelInWorld(chunk, x, baseY + 7, z, isEdge ? BLOCKS.COBBLESTONE : BLOCKS.STONE);
      }
    }
    this.setVoxelInWorld(chunk, opX, baseY + 8, opZ, BLOCKS.GOLD_ORE);

    // --- 11. Musée d'Orsay Gallery & Clock Pavilion at (266, -226) ---
    const musX = 266, musZ = -226;
    for (let x = musX - 4; x <= musX + 4; x++) {
      for (let z = musZ - 4; z <= musZ + 4; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.STONE);
        const isEdge = (Math.abs(x - musX) === 4 || Math.abs(z - musZ) === 4);
        for (let y = baseY + 2; y <= baseY + 6; y++) {
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y === baseY + 4) ? BLOCKS.GLASS : BLOCKS.STONE);
          }
        }
        this.setVoxelInWorld(chunk, x, baseY + 7, z, BLOCKS.COBBLESTONE);
      }
    }
    this.setVoxelInWorld(chunk, musX - 4, baseY + 5, musZ, BLOCKS.GOLD_ORE);

    // --- 12. Parisian Cast-Iron Lampadaires at Intersections ---
    const parLamps = [
      [234, -260], [250, -260], [266, -260],
      [234, -240], [266, -240]
    ];
    for (const [lx, lz] of parLamps) {
      this.setVoxelInWorld(chunk, lx - 2, baseY + 1, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 2, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 3, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 4, lz - 2, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 5, lz - 2, BLOCKS.IRON_ORE);
    }
  }

  /**
   * SECTOR 4: NUEVA YORK (-250, -250)
   * Art Deco Empire State stepped skyscraper, setbacks, mooring mast, Manhattan street grid
   */
  buildNYCSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < -300 || ox > -200 || oz + 16 < -300 || oz > -200) return;

    const baseY = 24;
    const nX = -250; // Empire State center
    const nZ = -250;

    // --- 1. Empire State Art Deco Skyscraper (Y: 25 to 62) ---
    // Base & Grand Entrance (Y: 25..32): 11x11 footprint
    for (let x = nX - 5; x <= nX + 5; x++) {
      for (let z = nZ - 5; z <= nZ + 5; z++) {
        const isCorner = (x === nX - 5 || x === nX + 5) && (z === nZ - 5 || z === nZ + 5);
        const isEdge = (x === nX - 5 || x === nX + 5 || z === nZ - 5 || z === nZ + 5);

        for (let y = baseY + 1; y <= baseY + 8; y++) {
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE); // Heavy corner pilaster
          } else if (isEdge) {
            if (y <= baseY + 3 && (x === nX || z === nZ)) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GLASS); // Grand 2-story entrance
            } else {
              this.setVoxelInWorld(chunk, x, y, z, (y % 2 === 0) ? BLOCKS.GLASS : BLOCKS.STONE);
            }
          } else if (y === baseY + 1) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.STONE);
          }
        }
      }
    }

    // 1st Setback Tier (Y: 33..42): 9x9 footprint
    for (let x = nX - 4; x <= nX + 4; x++) {
      for (let z = nZ - 4; z <= nZ + 4; z++) {
        const isEdge = (x === nX - 4 || x === nX + 4 || z === nZ - 4 || z === nZ + 4);
        for (let y = baseY + 9; y <= baseY + 18; y++) {
          if (isEdge) {
            // Vertical pinstripe piers and ribbon windows
            const isPier = ((x + z) % 2 === 0);
            this.setVoxelInWorld(chunk, x, y, z, isPier ? BLOCKS.STONE : BLOCKS.GLASS);
          }
        }
      }
    }

    // 2nd Setback Tier (Y: 43..49): 7x7 footprint
    for (let x = nX - 3; x <= nX + 3; x++) {
      for (let z = nZ - 3; z <= nZ + 3; z++) {
        const isEdge = (x === nX - 3 || x === nX + 3 || z === nZ - 3 || z === nZ + 3);
        for (let y = baseY + 19; y <= baseY + 25; y++) {
          if (isEdge) {
            const isPier = ((x + z) % 2 === 0);
            this.setVoxelInWorld(chunk, x, y, z, isPier ? BLOCKS.STONE : BLOCKS.GLASS);
          }
        }
      }
    }

    // 3rd Setback Tier (Y: 50..54): 5x5 footprint
    for (let x = nX - 2; x <= nX + 2; x++) {
      for (let z = nZ - 2; z <= nZ + 2; z++) {
        const isEdge = (x === nX - 2 || x === nX + 2 || z === nZ - 2 || z === nZ + 2);
        for (let y = baseY + 26; y <= baseY + 30; y++) {
          this.setVoxelInWorld(chunk, x, y, z, isEdge ? BLOCKS.STONE : BLOCKS.IRON_ORE);
        }
      }
    }

    // Art Deco Crown & Sunburst Wing (Y: 55..57): 3x3 footprint
    for (let x = nX - 1; x <= nX + 1; x++) {
      for (let z = nZ - 1; z <= nZ + 1; z++) {
        for (let y = baseY + 31; y <= baseY + 33; y++) {
          this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GOLD_ORE);
        }
      }
    }

    // Mooring Mast & Aviation Beacon (Y: 58..62)
    for (let y = baseY + 34; y <= baseY + 37; y++) {
      this.setVoxelInWorld(chunk, nX, y, nZ, BLOCKS.IRON_ORE);
    }
    this.setVoxelInWorld(chunk, nX, baseY + 38, nZ, BLOCKS.GOLD_ORE); // Beacon at Y = 62

    // --- 2. Manhattan Second High-Rise at (-240, -252) ---
    const ny2X = -240, ny2Z = -252;
    for (let y = baseY + 1; y <= baseY + 20; y++) {
      for (let x = ny2X - 2; x <= ny2X + 2; x++) {
        for (let z = ny2Z - 2; z <= ny2Z + 2; z++) {
          const isEdge = (x === ny2X - 2 || x === ny2X + 2 || z === ny2Z - 2 || z === ny2Z + 2);
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y % 4 === 0) ? BLOCKS.STONE : BLOCKS.GLASS);
          }
        }
      }
    }
    this.setVoxelInWorld(chunk, ny2X, baseY + 21, ny2Z, BLOCKS.GOLD_ORE);

    // --- 3. Manhattan Street Grid, Sidewalks & Hydrants ---
    // Street at nZ + 6 (z = -244)
    for (let x = -260; x <= -238; x++) {
      this.setVoxelInWorld(chunk, x, baseY, -244, BLOCKS.DIRT_DRY);
      this.setVoxelInWorld(chunk, x, baseY, -243, BLOCKS.STONE); // Sidewalk
      this.setVoxelInWorld(chunk, x, baseY, -245, BLOCKS.STONE); // Sidewalk
    }
    // Fire hydrants at street corners
    this.setVoxelInWorld(chunk, -244, baseY + 1, -243, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, -256, baseY + 1, -243, BLOCKS.BRICK);
    // Golden street lamps
    const nyLamps = [[-244, -245], [-256, -245]];
    for (const [lx, lz] of nyLamps) {
      this.setVoxelInWorld(chunk, lx, baseY + 1, lz, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx, baseY + 2, lz, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx, baseY + 3, lz, BLOCKS.GOLD_ORE);
    }

    // --- 4. Statue of Liberty (Estatua de la Libertad) at (-262, -262) ---
    const libX = -262, libZ = -262;
    // Star-shaped stepped pedestal (Y: 25..30)
    for (let x = libX - 4; x <= libX + 4; x++) {
      for (let z = libZ - 4; z <= libZ + 4; z++) {
        const dX = Math.abs(x - libX);
        const dZ = Math.abs(z - libZ);
        if (dX + dZ <= 5) {
          this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.STONE);
          this.setVoxelInWorld(chunk, x, baseY + 2, z, BLOCKS.STONE);
        }
        if (dX <= 3 && dZ <= 3) {
          this.setVoxelInWorld(chunk, x, baseY + 3, z, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, baseY + 4, z, BLOCKS.STONE);
        }
        if (dX <= 2 && dZ <= 2) {
          this.setVoxelInWorld(chunk, x, baseY + 5, z, BLOCKS.STONE);
          this.setVoxelInWorld(chunk, x, baseY + 6, z, BLOCKS.COBBLESTONE);
        }
      }
    }
    // Draped Statue Body (Y: 31..38, copper patina)
    for (let y = baseY + 7; y <= baseY + 14; y++) {
      for (let x = libX - 1; x <= libX + 1; x++) {
        for (let z = libZ - 1; z <= libZ + 1; z++) {
          this.setVoxelInWorld(chunk, x, y, z, BLOCKS.CLAY);
        }
      }
    }
    // Head with 7-Spike Radiate Crown (Y: 39..41)
    for (let x = libX - 1; x <= libX + 1; x++) {
      for (let z = libZ - 1; z <= libZ + 1; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 15, z, BLOCKS.CLAY);
        this.setVoxelInWorld(chunk, x, baseY + 16, z, BLOCKS.CLAY);
      }
    }
    // Crown spikes
    this.setVoxelInWorld(chunk, libX - 1, baseY + 17, libZ - 1, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, libX + 1, baseY + 17, libZ - 1, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, libX - 1, baseY + 17, libZ + 1, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, libX + 1, baseY + 17, libZ + 1, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, libX, baseY + 17, libZ, BLOCKS.GOLD_ORE);

    // Left arm holding tablet
    this.setVoxelInWorld(chunk, libX - 2, baseY + 12, libZ, BLOCKS.CLAY);
    this.setVoxelInWorld(chunk, libX - 2, baseY + 13, libZ, BLOCKS.WOOD_PLANK); // Tablet of Law

    // Raised right arm holding golden torch (Y: 39..44)
    for (let y = baseY + 15; y <= baseY + 19; y++) {
      this.setVoxelInWorld(chunk, libX + 2, y, libZ, BLOCKS.CLAY);
    }
    // Golden Illuminated Torch Beacon at Y = 44..45
    this.setVoxelInWorld(chunk, libX + 2, baseY + 20, libZ, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, libX + 2, baseY + 21, libZ, BLOCKS.GOLD_ORE);

    // --- 5. Times Square Crosswalks ---
    // White zebra stripes on street
    for (let z = -245; z <= -243; z++) {
      this.setVoxelInWorld(chunk, -248, baseY, z, BLOCKS.SNOW);
      this.setVoxelInWorld(chunk, -250, baseY, z, BLOCKS.SNOW);
      this.setVoxelInWorld(chunk, -252, baseY, z, BLOCKS.SNOW);
    }

    // --- 6. Chrysler Building (Art Deco Sunburst Crown Tower) at (-274, -242) ---
    const chX = -274, chZ = -242;
    for (let y = baseY + 1; y <= baseY + 22; y++) {
      const r = (y <= baseY + 8) ? 4 : 3;
      for (let x = chX - r; x <= chX + r; x++) {
        for (let z = chZ - r; z <= chZ + r; z++) {
          const isEdge = (Math.abs(x - chX) === r || Math.abs(z - chZ) === r);
          const isCorner = (Math.abs(x - chX) === r && Math.abs(z - chZ) === r);
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.IRON_ORE);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y % 2 === 0) ? BLOCKS.GLASS : BLOCKS.SNOW);
          }
        }
      }
    }
    // Terraced Stainless-Steel Sunburst Arches (Y: 47..54)
    for (let y = baseY + 23; y <= baseY + 30; y++) {
      const r = y <= baseY + 26 ? 2 : 1;
      for (let x = chX - r; x <= chX + r; x++) {
        for (let z = chZ - r; z <= chZ + r; z++) {
          const isCenterCross = (x === chX || z === chZ);
          this.setVoxelInWorld(chunk, x, y, z, isCenterCross ? BLOCKS.GOLD_ORE : BLOCKS.SNOW);
        }
      }
    }
    for (let y = baseY + 31; y <= baseY + 36; y++) {
      this.setVoxelInWorld(chunk, chX, y, chZ, (y === baseY + 36) ? BLOCKS.GOLD_ORE : BLOCKS.IRON_ORE);
    }

    // --- 7. One World Trade Center (Freedom Tower) at (-230, -272) ---
    const wtX = -230, wtZ = -272;
    for (let y = baseY + 1; y <= baseY + 31; y++) {
      for (let x = wtX - 3; x <= wtX + 3; x++) {
        for (let z = wtZ - 3; z <= wtZ + 3; z++) {
          // Chamfered corners above podium
          if (y > baseY + 8 && Math.abs(x - wtX) === 3 && Math.abs(z - wtZ) === 3) continue;
          const isEdge = (Math.abs(x - wtX) === 3 || Math.abs(z - wtZ) === 3 || (y > baseY + 8 && Math.abs(x - wtX) + Math.abs(z - wtZ) === 5));
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, (y % 5 === 0) ? BLOCKS.IRON_ORE : BLOCKS.GLASS);
          }
        }
      }
    }
    for (let y = baseY + 32; y <= baseY + 38; y++) {
      this.setVoxelInWorld(chunk, wtX, y, wtZ, (y === baseY + 38) ? BLOCKS.GOLD_ORE : BLOCKS.IRON_ORE);
    }

    // --- 8. Times Square Neon Billboard Towers & Red TKTS Steps at (-250, -230) ---
    // Red TKTS Amphitheater Steps (X: -253..-247, Z: -234..-229)
    for (let step = 0; step < 5; step++) {
      const z = -234 + step;
      for (let x = -253; x <= -247; x++) {
        for (let y = baseY + 1; y <= baseY + 1 + step; y++) {
          this.setVoxelInWorld(chunk, x, y, z, (x === -250) ? BLOCKS.GOLD_ORE : BLOCKS.BRICK);
        }
      }
    }
    // Giant Neon Advertising Screens at (-256, -232) and (-244, -232)
    for (const bx of [-257, -243]) {
      for (let y = baseY + 1; y <= baseY + 14; y++) {
        for (let z = -235; z <= -229; z++) {
          const neonBlock = ((y + z) % 3 === 0) ? BLOCKS.GOLD_ORE : (((y + z) % 3 === 1) ? BLOCKS.BRICK : BLOCKS.GLASS);
          this.setVoxelInWorld(chunk, bx, y, z, neonBlock);
        }
      }
    }

    // --- 9. Central Park Oasis, Lake & Bethesda Fountain at (-276, -274) ---
    for (let x = -284; x <= -268; x++) {
      for (let z = -282; z <= -266; z++) {
        const d = Math.hypot(x + 276, z + 274);
        if (d <= 2.2) {
          this.setVoxelInWorld(chunk, x, baseY, z, BLOCKS.COBBLESTONE);
          if (x === -276 && z === -274) {
            this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.STONE);
            this.setVoxelInWorld(chunk, x, baseY + 2, z, BLOCKS.GOLD_ORE);
            this.setVoxelInWorld(chunk, x, baseY + 3, z, BLOCKS.WATER);
          }
        } else if (d <= 5.5) {
          // Central Park Lake & Bow Bridge along z = -274
          if (z === -274) {
            this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.WOOD_PLANK);
          } else {
            this.setVoxelInWorld(chunk, x, baseY, z, BLOCKS.WATER);
          }
        } else {
          this.setVoxelInWorld(chunk, x, baseY, z, BLOCKS.GRASS);
        }
      }
    }

    // --- 10. Sprawling Manhattan Orthogonal Street Grid & Sidewalks ---
    for (let c = -276; c <= -224; c++) {
      if (Math.abs(c - (-250)) > 16) {
        this.setVoxelInWorld(chunk, c, baseY, -260, BLOCKS.DIRT_DRY);
        this.setVoxelInWorld(chunk, c, baseY, -259, BLOCKS.STONE);
        this.setVoxelInWorld(chunk, c, baseY, -261, BLOCKS.STONE);
      }
      for (const sx of [-266, -234]) {
        if (Math.abs(c - (-250)) > 16) {
          this.setVoxelInWorld(chunk, sx, baseY, c, BLOCKS.DIRT_DRY);
          this.setVoxelInWorld(chunk, sx - 1, baseY, c, BLOCKS.STONE);
          this.setVoxelInWorld(chunk, sx + 1, baseY, c, BLOCKS.STONE);
        }
      }
    }

    // --- 11. The Flatiron Building at (-266, -250) ---
    const flX = -266, flZ = -250;
    for (let y = baseY + 1; y <= baseY + 22; y++) {
      for (let dz = -4; dz <= 4; dz++) {
        const maxWidth = Math.floor((4 - Math.abs(dz)) * 0.8) + 1;
        for (let dx = -maxWidth; dx <= maxWidth; dx++) {
          const x = flX + dx;
          const z = flZ + dz;
          const isEdge = (dx === -maxWidth || dx === maxWidth || Math.abs(dz) === 4);
          if (isEdge) {
            const isWindow = (y % 3 === 0);
            this.setVoxelInWorld(chunk, x, y, z, isWindow ? BLOCKS.GLASS : BLOCKS.STONE);
          }
        }
      }
    }
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setVoxelInWorld(chunk, flX + dx, baseY + 22, flZ + dz, BLOCKS.STONE);
      }
    }
    this.setVoxelInWorld(chunk, flX, baseY + 23, flZ, BLOCKS.GOLD_ORE);

    // --- 12. Wall Street Stock Exchange at (-234, -260) ---
    const wsX = -234, wsZ = -260;
    for (let x = wsX - 4; x <= wsX + 4; x++) {
      for (let z = wsZ - 4; z <= wsZ + 4; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.STONE);
      }
    }
    for (const dz of [-4, -2, 0, 2, 4]) {
      for (let y = baseY + 2; y <= baseY + 8; y++) {
        this.setVoxelInWorld(chunk, wsX - 4, y, wsZ + dz, BLOCKS.STONE);
      }
    }
    for (let dz = -4; dz <= 4; dz++) {
      this.setVoxelInWorld(chunk, wsX - 4, baseY + 9, wsZ + dz, BLOCKS.STONE);
      const pedH = Math.max(0, 3 - Math.abs(dz));
      for (let py = 1; py <= pedH; py++) {
        this.setVoxelInWorld(chunk, wsX - 4, baseY + 9 + py, wsZ + dz, (dz === 0) ? BLOCKS.GOLD_ORE : BLOCKS.STONE);
      }
    }
    for (let x = wsX - 3; x <= wsX + 4; x++) {
      for (let z = wsZ - 4; z <= wsZ + 4; z++) {
        const isBack = (x === wsX + 4 || Math.abs(z - wsZ) === 4);
        if (isBack) {
          for (let y = baseY + 2; y <= baseY + 9; y++) {
            this.setVoxelInWorld(chunk, x, y, z, (y >= baseY + 4 && y <= baseY + 7 && z % 2 === 0) ? BLOCKS.GLASS : BLOCKS.STONE);
          }
        }
        this.setVoxelInWorld(chunk, x, baseY + 10, z, BLOCKS.STONE);
      }
    }
    this.setVoxelInWorld(chunk, wsX, baseY + 8, wsZ, BLOCKS.GOLD_ORE);

    // --- 13. Rockefeller Plaza Art Deco Skyscraper 3 at (-234, -234) ---
    const rkX = -234, rkZ = -234;
    for (let y = baseY + 1; y <= baseY + 30; y++) {
      const r = (y <= baseY + 12) ? 3 : ((y <= baseY + 22) ? 2 : 1);
      for (let x = rkX - r; x <= rkX + r; x++) {
        for (let z = rkZ - r; z <= rkZ + r; z++) {
          const isEdge = (Math.abs(x - rkX) === r || Math.abs(z - rkZ) === r);
          if (isEdge) {
            const isWindow = (y % 2 === 0);
            this.setVoxelInWorld(chunk, x, y, z, isWindow ? BLOCKS.GLASS : BLOCKS.STONE);
          }
        }
      }
    }
    this.setVoxelInWorld(chunk, rkX, baseY + 31, rkZ, BLOCKS.GOLD_ORE);

    // --- 14. Historic Manhattan Brownstone Row at (-266, -260) ---
    const brwX = -266, brwZ = -260;
    for (let x = brwX - 3; x <= brwX + 3; x++) {
      for (let z = brwZ - 3; z <= brwZ + 3; z++) {
        this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.BRICK);
        const isEdge = (Math.abs(x - brwX) === 3 || Math.abs(z - brwZ) === 3);
        for (let y = baseY + 2; y <= baseY + 8; y++) {
          if (isEdge) {
            const isWindow = ((y === baseY + 4 || y === baseY + 7) && (x + z) % 2 === 0);
            this.setVoxelInWorld(chunk, x, y, z, isWindow ? BLOCKS.GLASS : BLOCKS.BRICK);
          }
        }
        this.setVoxelInWorld(chunk, x, baseY + 9, z, BLOCKS.BRICK);
      }
    }
    this.setVoxelInWorld(chunk, brwX + 4, baseY + 1, brwZ, BLOCKS.STONE);
    this.setVoxelInWorld(chunk, brwX + 4, baseY + 2, brwZ, BLOCKS.STONE);
    for (let y = baseY + 10; y <= baseY + 13; y++) {
      this.setVoxelInWorld(chunk, brwX, y, brwZ, (y === baseY + 10) ? BLOCKS.IRON_ORE : BLOCKS.WOOD_PLANK);
    }
    this.setVoxelInWorld(chunk, brwX, baseY + 14, brwZ, BLOCKS.BRICK);

    // --- 15. Manhattan Corner Streetlights & Fire Hydrants ---
    const nyGridLamps = [
      [-266, -260], [-250, -260], [-234, -260],
      [-266, -244], [-234, -244]
    ];
    for (const [lx, lz] of nyGridLamps) {
      this.setVoxelInWorld(chunk, lx - 2, baseY + 1, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 2, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 3, lz - 2, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx - 2, baseY + 4, lz - 2, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, lx + 2, baseY + 1, lz + 2, BLOCKS.BRICK);
    }
  }

  /**
   * SECTOR 5: NORWAY FJORDS & NATURE (0, +500) (Z = 440..560)
   * Colossal granite cliffs, deep water gorges, roaring waterfalls, Nordic spruce taiga, and viking timber cabins
   */
  buildNorwaySector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < -60 || ox > 60 || oz + 16 < 435 || oz > 565) return;

    // 1. Water filling inside the deep fjord gorge (Z in 440..560, X in -7..7, Y: 14..18)
    for (let x = Math.max(ox, -7); x <= Math.min(ox + 15, 7); x++) {
      for (let z = Math.max(oz, 440); z <= Math.min(oz + 15, 560); z++) {
        for (let y = 14; y <= WATER_LEVEL; y++) {
          this.setVoxelInWorld(chunk, x, y, z, BLOCKS.WATER);
        }
      }
    }

    // 2. Roaring Waterfalls at cliff faces
    // A. Eastern Waterfall (wx = 8..9, wz = 495..497)
    for (let z = 495; z <= 497; z++) {
      for (let y = 18; y <= 48; y++) {
        this.setVoxelInWorld(chunk, 8, y, z, BLOCKS.WATER);
        this.setVoxelInWorld(chunk, 9, y, z, (y % 3 === 0) ? BLOCKS.COBBLESTONE : BLOCKS.STONE);
      }
      // Top spring source
      this.setVoxelInWorld(chunk, 9, 49, z, BLOCKS.WATER);
      this.setVoxelInWorld(chunk, 10, 49, z, BLOCKS.WATER);
      this.setVoxelInWorld(chunk, 11, 49, z, BLOCKS.WATER);
    }
    // Froth and spray at bottom of eastern waterfall
    for (let z = 494; z <= 498; z++) {
      this.setVoxelInWorld(chunk, 7, 19, z, BLOCKS.SNOW); // White foam
    }

    // B. Western Waterfall (wx = -9..-8, wz = 505..507)
    for (let z = 505; z <= 507; z++) {
      for (let y = 18; y <= 48; y++) {
        this.setVoxelInWorld(chunk, -8, y, z, BLOCKS.WATER);
        this.setVoxelInWorld(chunk, -9, y, z, (y % 3 === 0) ? BLOCKS.COBBLESTONE : BLOCKS.STONE);
      }
      // Top spring source
      this.setVoxelInWorld(chunk, -9, 49, z, BLOCKS.WATER);
      this.setVoxelInWorld(chunk, -10, 49, z, BLOCKS.WATER);
      this.setVoxelInWorld(chunk, -11, 49, z, BLOCKS.WATER);
    }
    // Froth and spray at bottom of western waterfall
    for (let z = 504; z <= 508; z++) {
      this.setVoxelInWorld(chunk, -7, 19, z, BLOCKS.SNOW);
    }

    // 3. Viking Longhouse 1 atop Eastern Cliff (wx: 17..25, wz: 480..488, Y: 50)
    const cabX = 21;
    const cabZ = 484;
    const cabY = 50;
    // Foundation & Wooden Floor
    for (let x = cabX - 4; x <= cabX + 4; x++) {
      for (let z = cabZ - 4; z <= cabZ + 4; z++) {
        this.setVoxelInWorld(chunk, x, cabY, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, x, cabY + 1, z, BLOCKS.WOOD_PLANK);
      }
    }
    // Wooden Walls & Corner Oak Logs (Y: 52..54)
    for (let y = cabY + 2; y <= cabY + 4; y++) {
      for (let x = cabX - 4; x <= cabX + 4; x++) {
        for (let z = cabZ - 4; z <= cabZ + 4; z++) {
          const isCorner = (x === cabX - 4 || x === cabX + 4) && (z === cabZ - 4 || z === cabZ + 4);
          const isEdge = (x === cabX - 4 || x === cabX + 4 || z === cabZ - 4 || z === cabZ + 4);
          const isDoor = (x === cabX - 4 && z === cabZ && y <= cabY + 3);
          const isWindow = ((x === cabX || z === cabZ) && isEdge && y === cabY + 3);

          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          } else if (isDoor) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          } else if (isWindow) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GLASS);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.WOOD_PLANK);
          }
        }
      }
    }
    // Stone Hearth & Viking Fireplace Chimney
    for (let y = cabY + 1; y <= cabY + 7; y++) {
      this.setVoxelInWorld(chunk, cabX + 3, y, cabZ + 3, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, cabX + 2, cabY + 2, cabZ + 3, BLOCKS.COBBLESTONE);

    // Nordic A-Frame Peaked Timber Roof (Y: 55..58)
    for (let z = cabZ - 5; z <= cabZ + 5; z++) {
      for (let x of [cabX - 4, cabX + 4]) {
        this.setVoxelInWorld(chunk, x, cabY + 5, z, BLOCKS.WOOD_PLANK);
      }
      for (let x of [cabX - 3, cabX + 3]) {
        this.setVoxelInWorld(chunk, x, cabY + 6, z, BLOCKS.WOOD_PLANK);
      }
      for (let x of [cabX - 2, cabX - 1, cabX, cabX + 1, cabX + 2]) {
        this.setVoxelInWorld(chunk, x, cabY + 7, z, BLOCKS.WOOD_PLANK);
      }
      this.setVoxelInWorld(chunk, cabX, cabY + 8, z, BLOCKS.SNOW);
    }

    // 4. Viking Longhouse 2 atop Western Cliff (cab2X = -21, cab2Z = 516, Y: 50)
    const cab2X = -21;
    const cab2Z = 516;
    const cab2Y = 50;
    for (let x = cab2X - 4; x <= cab2X + 4; x++) {
      for (let z = cab2Z - 4; z <= cab2Z + 4; z++) {
        this.setVoxelInWorld(chunk, x, cab2Y, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, x, cab2Y + 1, z, BLOCKS.WOOD_PLANK);
      }
    }
    for (let y = cab2Y + 2; y <= cab2Y + 4; y++) {
      for (let x = cab2X - 4; x <= cab2X + 4; x++) {
        for (let z = cab2Z - 4; z <= cab2Z + 4; z++) {
          const isCorner = (x === cab2X - 4 || x === cab2X + 4) && (z === cab2Z - 4 || z === cab2Z + 4);
          const isEdge = (x === cab2X - 4 || x === cab2X + 4 || z === cab2Z - 4 || z === cab2Z + 4);
          const isDoor = (x === cab2X + 4 && z === cab2Z && y <= cab2Y + 3);
          const isWindow = ((x === cab2X || z === cab2Z) && isEdge && y === cab2Y + 3);

          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          } else if (isDoor) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          } else if (isWindow) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GLASS);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.WOOD_PLANK);
          }
        }
      }
    }
    // Chimney & Roof for Cabin 2
    for (let y = cab2Y + 1; y <= cab2Y + 7; y++) {
      this.setVoxelInWorld(chunk, cab2X - 3, y, cab2Z + 3, BLOCKS.BRICK);
    }
    for (let z = cab2Z - 5; z <= cab2Z + 5; z++) {
      for (let x of [cab2X - 4, cab2X + 4]) {
        this.setVoxelInWorld(chunk, x, cab2Y + 5, z, BLOCKS.WOOD_PLANK);
      }
      for (let x of [cab2X - 3, cab2X + 3]) {
        this.setVoxelInWorld(chunk, x, cab2Y + 6, z, BLOCKS.WOOD_PLANK);
      }
      for (let x of [cab2X - 2, cab2X - 1, cab2X, cab2X + 1, cab2X + 2]) {
        this.setVoxelInWorld(chunk, x, cab2Y + 7, z, BLOCKS.WOOD_PLANK);
      }
      this.setVoxelInWorld(chunk, cab2X, cab2Y + 8, z, BLOCKS.SNOW);
    }

    // 5. Wooden Pier / Fjord Docks at water edge (Y = 18)
    // Eastern Dock at wx = 7, wz: 485..492
    for (let z = 485; z <= 492; z++) {
      this.setVoxelInWorld(chunk, 7, 18, z, BLOCKS.WOOD_PLANK);
      this.setVoxelInWorld(chunk, 6, 18, z, BLOCKS.WOOD_PLANK);
      if (z % 3 === 0) {
        for (let y = 13; y <= 17; y++) {
          this.setVoxelInWorld(chunk, 6, y, z, BLOCKS.OAK_LOG);
        }
      }
    }
    // Western Dock at wx = -7, wz: 508..515
    for (let z = 508; z <= 515; z++) {
      this.setVoxelInWorld(chunk, -7, 18, z, BLOCKS.WOOD_PLANK);
      this.setVoxelInWorld(chunk, -6, 18, z, BLOCKS.WOOD_PLANK);
      if (z % 3 === 0) {
        for (let y = 13; y <= 17; y++) {
          this.setVoxelInWorld(chunk, -6, y, z, BLOCKS.OAK_LOG);
        }
      }
    }

    // 6. Nordic Spruce Taiga Forest Grove on Cliff Tops
    const spruceSites = [
      [22, 450], [28, 458], [24, 478], [30, 486], [22, 498], [28, 506], [24, 520], [30, 535], [22, 548],
      [-22, 450], [-28, 458], [-24, 472], [-30, 482], [-22, 496], [-28, 508], [-24, 525], [-30, 540], [-22, 550]
    ];
    for (const [sx, sz] of spruceSites) {
      const surfaceH = this.getHeightAt(sx, sz);
      this.buildNordicSpruceTree(chunk, sx, surfaceH, sz);
    }

    // 7. High-Altitude Fjord Suspension Bridge spanning East-West Cliffs at Z = 470 (X: -19..19, Y = 49)
    const brZ = 470;
    const brY = 49;
    for (let x = -19; x <= 19; x++) {
      for (let z = brZ - 2; z <= brZ + 2; z++) {
        const isRail = (z === brZ - 2 || z === brZ + 2);
        this.setVoxelInWorld(chunk, x, brY, z, isRail ? BLOCKS.COBBLESTONE : BLOCKS.WOOD_PLANK);
        if (isRail) {
          this.setVoxelInWorld(chunk, x, brY + 1, z, BLOCKS.OAK_LOG);
        }
      }
      // Suspension Towers at X = -11 and X = 11
      if (Math.abs(x) === 11) {
        for (let y = 40; y <= brY + 11; y++) {
          this.setVoxelInWorld(chunk, x, y, brZ - 2, BLOCKS.STONE);
          this.setVoxelInWorld(chunk, x, y, brZ + 2, BLOCKS.STONE);
        }
        for (let z = brZ - 2; z <= brZ + 2; z++) {
          this.setVoxelInWorld(chunk, x, brY + 9, z, BLOCKS.IRON_ORE);
          this.setVoxelInWorld(chunk, x, brY + 11, z, BLOCKS.GOLD_ORE);
        }
      }
      // Parabolic main suspension cables & vertical hanger rods
      const cableH = brY + 2 + Math.round(Math.pow((Math.abs(x) - 0) / 11, 2) * 8);
      if (cableH <= CHUNK_HEIGHT - 2) {
        this.setVoxelInWorld(chunk, x, cableH, brZ - 2, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, x, cableH, brZ + 2, BLOCKS.IRON_ORE);
        if (Math.abs(x) % 3 === 0) {
          for (let y = brY + 2; y < cableH; y++) {
            this.setVoxelInWorld(chunk, x, y, brZ - 2, BLOCKS.IRON_ORE);
            this.setVoxelInWorld(chunk, x, y, brZ + 2, BLOCKS.IRON_ORE);
          }
        }
      }
    }

    // 8. Borgund Viking Stave Church (Stavkirke) at (-24, 488, Y = 50)
    const stX = -24, stZ = 488, stY = 50;
    for (let x = stX - 4; x <= stX + 4; x++) {
      for (let z = stZ - 4; z <= stZ + 4; z++) {
        this.setVoxelInWorld(chunk, x, stY, z, BLOCKS.COBBLESTONE);
        for (let y = stY + 1; y <= stY + 4; y++) {
          const isEdge = (Math.abs(x - stX) === 4 || Math.abs(z - stZ) === 4);
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          }
        }
      }
    }
    // Tier 2 Stave Roof & Clerestory (Y: 55..58)
    for (let x = stX - 2; x <= stX + 2; x++) {
      for (let z = stZ - 2; z <= stZ + 2; z++) {
        for (let y = stY + 5; y <= stY + 8; y++) {
          this.setVoxelInWorld(chunk, x, y, z, BLOCKS.WOOD_PLANK);
        }
      }
    }
    // Tier 3 Turret Spire & Dragon-Head Finials (Y: 59..62)
    for (let y = stY + 9; y <= stY + 12; y++) {
      this.setVoxelInWorld(chunk, stX, y, stZ, (y === stY + 12) ? BLOCKS.GOLD_ORE : BLOCKS.OAK_LOG);
    }

    // 9. Viking Drakkar Longship sailing in the Fjord at (0, 490, Y = 18)
    const dkZ = 490;
    for (let z = dkZ - 6; z <= dkZ + 6; z++) {
      const halfW = (Math.abs(z - dkZ) >= 5) ? 0 : ((Math.abs(z - dkZ) >= 3) ? 1 : 2);
      for (let x = -halfW; x <= halfW; x++) {
        this.setVoxelInWorld(chunk, x, 18, z, BLOCKS.OAK_LOG);
        if (Math.abs(x) === halfW) {
          // Gunwale & alternating Viking shields
          this.setVoxelInWorld(chunk, x, 19, z, (z % 2 === 0) ? BLOCKS.GOLD_ORE : BLOCKS.WOOD_PLANK);
        }
      }
    }
    // Carved Dragon Prow & Stern Tail
    this.setVoxelInWorld(chunk, 0, 20, dkZ - 6, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, 0, 21, dkZ - 7, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, 0, 20, dkZ + 6, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, 0, 21, dkZ + 7, BLOCKS.GOLD_ORE);
    // Longship Mast & Red-and-White Striped Viking Square Sail
    for (let y = 19; y <= 27; y++) {
      this.setVoxelInWorld(chunk, 0, y, dkZ, BLOCKS.OAK_LOG);
    }
    for (let x = -3; x <= 3; x++) {
      for (let y = 21; y <= 25; y++) {
        this.setVoxelInWorld(chunk, x, y, dkZ - 1, (Math.abs(x) % 2 === 0) ? BLOCKS.BRICK : BLOCKS.SNOW);
      }
    }

    // 10. Nordic Coastal Lighthouse (Fyr) at (22, 535, Y = 50)
    const lhX = 22, lhZ = 535, lhY = 50;
    for (let y = lhY + 1; y <= lhY + 12; y++) {
      const r = (y <= lhY + 4) ? 2 : 1;
      const stripeBlk = (Math.floor((y - lhY) / 2) % 2 === 0) ? BLOCKS.BRICK : BLOCKS.SNOW;
      for (let x = lhX - r; x <= lhX + r; x++) {
        for (let z = lhZ - r; z <= lhZ + r; z++) {
          if (y >= lhY + 10 && y <= lhY + 11) {
            this.setVoxelInWorld(chunk, x, y, z, (x === lhX && z === lhZ) ? BLOCKS.GOLD_ORE : BLOCKS.GLASS);
          } else {
            this.setVoxelInWorld(chunk, x, y, z, stripeBlk);
          }
        }
      }
    }

    // --- 11. Second Mountain Suspension Footbridge across Fjord Gorge at Z = 530 (Y = 50) ---
    const sbZ = 530, sbY = 50;
    for (let x = -18; x <= 18; x++) {
      this.setVoxelInWorld(chunk, x, sbY, sbZ, BLOCKS.WOOD_PLANK);
      this.setVoxelInWorld(chunk, x, sbY + 1, sbZ - 1, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, x, sbY + 1, sbZ + 1, BLOCKS.IRON_ORE);
    }
    for (const tx of [-18, 18]) {
      for (let y = sbY + 1; y <= sbY + 7; y++) {
        this.setVoxelInWorld(chunk, tx, y, sbZ - 1, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, tx, y, sbZ + 1, BLOCKS.COBBLESTONE);
      }
      this.setVoxelInWorld(chunk, tx, sbY + 8, sbZ, BLOCKS.GOLD_ORE);
    }

    // --- 12. Jarl's Valhalla Mead Hall (Gran Salón Vikingo) at (-26, 50, 545) ---
    const mhX = -26, mhZ = 545, mhY = 50;
    for (let x = mhX - 5; x <= mhX + 5; x++) {
      for (let z = mhZ - 4; z <= mhZ + 4; z++) {
        this.setVoxelInWorld(chunk, x, mhY, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, x, mhY + 1, z, BLOCKS.WOOD_PLANK);
        const isCorner = (Math.abs(x - mhX) === 5 && Math.abs(z - mhZ) === 4);
        const isEdge = (Math.abs(x - mhX) === 5 || Math.abs(z - mhZ) === 4);
        const isDoor = (x === mhX + 5 && z === mhZ);
        for (let y = mhY + 2; y <= mhY + 5; y++) {
          if (isCorner) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          } else if (isDoor && y <= mhY + 3) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          } else if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.WOOD_PLANK);
          }
        }
      }
    }
    for (let z = mhZ - 5; z <= mhZ + 5; z++) {
      for (let s = 0; s <= 3; s++) {
        this.setVoxelInWorld(chunk, mhX - 5 + s, mhY + 6 + s, z, BLOCKS.WOOD_PLANK);
        this.setVoxelInWorld(chunk, mhX + 5 - s, mhY + 6 + s, z, BLOCKS.WOOD_PLANK);
      }
      this.setVoxelInWorld(chunk, mhX, mhY + 10, z, BLOCKS.SNOW);
    }
    this.setVoxelInWorld(chunk, mhX, mhY + 1, mhZ, BLOCKS.COBBLESTONE);
    this.setVoxelInWorld(chunk, mhX, mhY + 2, mhZ, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, mhX, mhY + 2, mhZ - 2, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, mhX, mhY + 2, mhZ + 2, BLOCKS.WOOD_PLANK);

    // --- 13. Fjord Blacksmith & Armory Forge at (23, 51, 505) ---
    const smX = 23, smZ = 505, smY = 51;
    for (let x = smX - 2; x <= smX + 2; x++) {
      for (let z = smZ - 2; z <= smZ + 2; z++) {
        this.setVoxelInWorld(chunk, x, smY, z, BLOCKS.COBBLESTONE);
      }
    }
    for (let y = smY + 1; y <= smY + 6; y++) {
      this.setVoxelInWorld(chunk, smX + 2, y, smZ + 2, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, smX + 1, smY + 1, smZ + 2, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, smX - 1, smY + 1, smZ, BLOCKS.IRON_ORE);

    // --- 14. Fisherman Rorbuer (Stilt Cabins) along Water Edge at (-7, 18, 515..527) ---
    const rbX = -7, rbZ = 520;
    for (let x = rbX - 3; x <= rbX; x++) {
      for (let z = rbZ - 3; z <= rbZ + 3; z++) {
        if (x === rbX - 3 || x === rbX) {
          for (let y = 14; y <= 18; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          }
        }
        this.setVoxelInWorld(chunk, x, 19, z, BLOCKS.WOOD_PLANK);
        const isEdge = (x === rbX - 3 || x === rbX || Math.abs(z - rbZ) === 3);
        for (let y = 20; y <= 22; y++) {
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.BRICK);
          }
        }
        this.setVoxelInWorld(chunk, x, 23, z, BLOCKS.WOOD_PLANK);
      }
    }
    this.setVoxelInWorld(chunk, rbX, 20, rbZ, BLOCKS.GOLD_ORE);

    // --- 15. Cliffside Mountain Watchtower at (-26, 50, 535) ---
    const wtX = -26, wtZ = 535, wtY = 50;
    for (let y = wtY + 1; y <= wtY + 9; y++) {
      for (let x = wtX - 2; x <= wtX + 2; x++) {
        for (let z = wtZ - 2; z <= wtZ + 2; z++) {
          const isEdge = (Math.abs(x - wtX) === 2 || Math.abs(z - wtZ) === 2);
          if (isEdge) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.STONE);
          }
        }
      }
    }
    this.setVoxelInWorld(chunk, wtX, wtY + 10, wtZ, BLOCKS.COBBLESTONE);
    this.setVoxelInWorld(chunk, wtX, wtY + 11, wtZ, BLOCKS.GOLD_ORE);

    // --- 16. Nordic Pathway Grid & Cliff Torch Sconces ---
    for (let z = 475; z <= 545; z++) {
      if (z % 8 === 0) {
        this.setVoxelInWorld(chunk, 21, 51, z, BLOCKS.OAK_LOG);
        this.setVoxelInWorld(chunk, 21, 52, z, BLOCKS.GOLD_ORE);
        this.setVoxelInWorld(chunk, -21, 51, z, BLOCKS.OAK_LOG);
        this.setVoxelInWorld(chunk, -21, 52, z, BLOCKS.GOLD_ORE);
      }
    }
  }

  /**
   * Helper to build tall conical Nordic spruce taiga trees
   */
  buildNordicSpruceTree(chunk, wx, baseY, wz) {
    const trunkH = 8;
    // Dark trunk
    for (let y = baseY + 1; y <= baseY + trunkH; y++) {
      this.setVoxelInWorld(chunk, wx, y, wz, BLOCKS.OAK_LOG);
    }

    // Lower tier canopy (5x5 cross at baseY + 4)
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; // Cut corners
        this.setVoxelInWorld(chunk, wx + dx, baseY + 4, wz + dz, BLOCKS.OAK_LEAVES);
      }
    }

    // Mid tier canopy (3x3 at baseY + 6)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this.setVoxelInWorld(chunk, wx + dx, baseY + 6, wz + dz, BLOCKS.OAK_LEAVES);
      }
    }

    // High tier canopy (cross at baseY + 8)
    this.setVoxelInWorld(chunk, wx + 1, baseY + 8, wz, BLOCKS.OAK_LEAVES);
    this.setVoxelInWorld(chunk, wx - 1, baseY + 8, wz, BLOCKS.OAK_LEAVES);
    this.setVoxelInWorld(chunk, wx, baseY + 8, wz + 1, BLOCKS.OAK_LEAVES);
    this.setVoxelInWorld(chunk, wx, baseY + 8, wz - 1, BLOCKS.OAK_LEAVES);

    // Conical pointed peak with snow dusting
    this.setVoxelInWorld(chunk, wx, baseY + 9, wz, BLOCKS.OAK_LEAVES);
    this.setVoxelInWorld(chunk, wx, baseY + 10, wz, BLOCKS.SNOW);
  }

  /**
   * SECTOR 6: PLAYA PARAÍSO & LUXURY RESORT (0, -500)
   * Golden sand shoreline, turquoise lagoon, timber boardwalk, ocean pier & sunset pavilion,
   * Grand Luxury Resort Hotel, Tropical Chiringuito Tiki Bar, Lifeguard Tower, Volleyball Court,
   * colorful beach umbrellas/loungers, curved coconut palm trees, and anchored Superyacht.
   */
  buildBeachSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < -85 || ox > 85 || oz + 16 < -590 || oz > -430) return;

    // 1. Coastal Timber Boardwalk Promenade (X: -54..54, Z: -486..-480, Y = 20)
    for (let x = -54; x <= 54; x++) {
      for (let z = -486; z <= -480; z++) {
        const isBorder = (z === -486 || z === -480 || Math.abs(x) === 54);
        this.setVoxelInWorld(chunk, x, 20, z, isBorder ? BLOCKS.COBBLESTONE : BLOCKS.WOOD_PLANK);
        if (z === -486 && x % 8 === 0 && Math.abs(x) > 4) {
          this.setVoxelInWorld(chunk, x, 21, z, BLOCKS.OAK_LOG);
          this.setVoxelInWorld(chunk, x, 22, z, BLOCKS.OAK_LOG);
          this.setVoxelInWorld(chunk, x, 23, z, BLOCKS.GOLD_ORE);
        }
      }
    }

    // Highway-to-Boardwalk Grand Coastal Staircase along X: -3..3, Z: -450..-480
    for (let z = -450; z >= -479; z--) {
      const stepY = this.getRoadHeightAt(0, z);
      for (let x = -3; x <= 3; x++) {
        const isRail = (Math.abs(x) === 3);
        this.setVoxelInWorld(chunk, x, stepY, z, isRail ? BLOCKS.COBBLESTONE : BLOCKS.STONE);
        for (let y = stepY + 1; y <= stepY + 4; y++) {
          this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
        }
      }
    }

    // 2. Ocean Pier & Over-Water Sunset Pavilion (X: -3..3, Z: -486..-542, Y = 20)
    for (let z = -486; z >= -542; z--) {
      for (let x = -3; x <= 3; x++) {
        const isEdge = (Math.abs(x) === 3);
        this.setVoxelInWorld(chunk, x, 20, z, BLOCKS.WOOD_PLANK);
        if (isEdge && z % 4 === 0) {
          for (let y = 13; y <= 21; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          }
          if (z % 8 === 0) {
            this.setVoxelInWorld(chunk, x, 22, z, BLOCKS.GOLD_ORE);
          }
        }
      }
    }
    // Sunset Pavilion at end of Pier (0, -538)
    for (let x = -5; x <= 5; x++) {
      for (let z = -543; z <= -533; z++) {
        this.setVoxelInWorld(chunk, x, 20, z, BLOCKS.WOOD_PLANK);
        const isCorner = (Math.abs(x) === 4 && (z === -542 || z === -534));
        if (isCorner) {
          for (let y = 21; y <= 24; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          }
        }
        if (Math.abs(x) <= 5 && z >= -543 && z <= -533) {
          const dist = Math.max(Math.abs(x), Math.abs(z + 538));
          if (dist <= 5) {
            this.setVoxelInWorld(chunk, x, 25, z, BLOCKS.WOOD_PLANK);
          }
          if (dist <= 3) {
            this.setVoxelInWorld(chunk, x, 26, z, BLOCKS.BRICK);
          }
        }
      }
    }
    this.setVoxelInWorld(chunk, 0, 27, -538, BLOCKS.GOLD_ORE);

    // 3. Grand Luxury Coastal Resort Hotel ("Hotel Paraíso Real") at (-28, -468, baseY = 22)
    const hX = -28, hZ = -468, hY = 22;
    for (let x = hX - 12; x <= hX + 12; x++) {
      for (let z = hZ - 6; z <= hZ + 6; z++) {
        // Resort terrace foundation
        for (let fy = 19; fy <= hY; fy++) {
          this.setVoxelInWorld(chunk, x, fy, z, BLOCKS.STONE);
        }
        // U-shaped hotel wings (open courtyard facing the ocean to the south)
        const inCourtyard = (Math.abs(x - hX) <= 5 && z <= hZ - 1);
        if (inCourtyard) {
          // Courtyard swimming pool
          this.setVoxelInWorld(chunk, x, hY, z, (Math.abs(x - hX) <= 4 && z <= hZ - 2) ? BLOCKS.WATER : BLOCKS.SAND);
          continue;
        }
        const isEdge = (Math.abs(x - hX) === 12 || Math.abs(z - hZ) === 6 || (Math.abs(x - hX) === 6 && z <= hZ - 1) || (z === hZ && Math.abs(x - hX) <= 5));
        for (let y = hY + 1; y <= hY + 18; y++) {
          const isFloorSlab = (y - hY) % 3 === 0;
          if (isFloorSlab) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.SNOW);
            // Oceanfront glass balconies on south face
            if (z === hZ - 6) {
              this.setVoxelInWorld(chunk, x, y, z - 1, BLOCKS.WOOD_PLANK);
              this.setVoxelInWorld(chunk, x, y + 1, z - 1, BLOCKS.GLASS);
            }
          } else if (isEdge) {
            const isPillar = (x % 4 === 0);
            this.setVoxelInWorld(chunk, x, y, z, isPillar ? BLOCKS.SNOW : BLOCKS.GLASS);
          }
        }
        // Rooftop Sky Lounge & Infinity Pool at Y = hY + 19 (41)
        const isRoofEdge = (Math.abs(x - hX) === 12 || Math.abs(z - hZ) === 6);
        this.setVoxelInWorld(chunk, x, hY + 19, z, isRoofEdge ? BLOCKS.GOLD_ORE : BLOCKS.WATER);
      }
    }

    // 4. Tropical Chiringuito Tiki Bar ("El Dorado Beach Club") at (22, -472, baseY = 21)
    const tkX = 22, tkZ = -472, tkY = 21;
    for (let x = tkX - 5; x <= tkX + 5; x++) {
      for (let z = tkZ - 5; z <= tkZ + 5; z++) {
        this.setVoxelInWorld(chunk, x, tkY, z, BLOCKS.WOOD_PLANK);
        const isCorner = (Math.abs(x - tkX) === 4 && Math.abs(z - tkZ) === 4);
        if (isCorner) {
          for (let y = tkY + 1; y <= tkY + 4; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.OAK_LOG);
          }
        }
        // Bar counter
        if (Math.abs(x - tkX) <= 2 && Math.abs(z - tkZ) === 2) {
          this.setVoxelInWorld(chunk, x, tkY + 1, z, BLOCKS.OAK_LOG);
          this.setVoxelInWorld(chunk, x, tkY + 2, z, BLOCKS.WOOD_PLANK);
        }
      }
    }
    // Thatched pyramid roof (Y: 26..29)
    for (let step = 0; step <= 3; step++) {
      const r = 6 - step;
      for (let x = tkX - r; x <= tkX + r; x++) {
        for (let z = tkZ - r; z <= tkZ + r; z++) {
          this.setVoxelInWorld(chunk, x, tkY + 5 + step, z, (step % 2 === 0) ? BLOCKS.WOOD_PLANK : BLOCKS.OAK_LEAVES);
        }
      }
    }
    this.setVoxelInWorld(chunk, tkX, tkY + 9, tkZ, BLOCKS.GOLD_ORE);

    // 5. Red & White Baywatch Lifeguard Tower at (-14, -496, baseY = 19)
    const lgX = -14, lgZ = -496;
    const lgY = this.getHeightAt(lgX, lgZ);
    for (const dx of [-2, 2]) {
      for (const dz of [-2, 2]) {
        for (let y = lgY; y <= lgY + 3; y++) {
          this.setVoxelInWorld(chunk, lgX + dx, y, lgZ + dz, BLOCKS.OAK_LOG);
        }
      }
    }
    for (let x = lgX - 3; x <= lgX + 3; x++) {
      for (let z = lgZ - 3; z <= lgZ + 3; z++) {
        this.setVoxelInWorld(chunk, x, lgY + 4, z, BLOCKS.WOOD_PLANK);
        if (Math.abs(x - lgX) <= 2 && Math.abs(z - lgZ) <= 2) {
          const isEdge = (Math.abs(x - lgX) === 2 || Math.abs(z - lgZ) === 2);
          for (let y = lgY + 5; y <= lgY + 7; y++) {
            if (isEdge) {
              this.setVoxelInWorld(chunk, x, y, z, (y === lgY + 6) ? BLOCKS.GLASS : BLOCKS.SNOW);
            }
          }
          this.setVoxelInWorld(chunk, x, lgY + 8, z, BLOCKS.BRICK);
        }
      }
    }

    // 6. Beach Volleyball Court at (28, -494)
    const vbX = 28, vbZ = -494;
    const vbY = this.getHeightAt(vbX, vbZ);
    for (let x = vbX - 6; x <= vbX + 6; x++) {
      this.setVoxelInWorld(chunk, x, vbY + 1, vbZ, (Math.abs(x - vbX) === 6) ? BLOCKS.OAK_LOG : BLOCKS.AIR);
      this.setVoxelInWorld(chunk, x, vbY + 2, vbZ, (Math.abs(x - vbX) === 6) ? BLOCKS.OAK_LOG : BLOCKS.SNOW);
      this.setVoxelInWorld(chunk, x, vbY + 3, vbZ, (Math.abs(x - vbX) === 6) ? BLOCKS.OAK_LOG : BLOCKS.GLASS);
    }

    // 7. Colorful Beach Umbrellas & Sun Loungers along the Golden Sand
    const umbrellas = [
      [-36, -494, BLOCKS.BRICK], [-26, -496, BLOCKS.GOLD_ORE], [-8, -494, BLOCKS.BRICK],
      [10, -494, BLOCKS.GOLD_ORE], [16, -498, BLOCKS.BRICK], [40, -495, BLOCKS.GOLD_ORE]
    ];
    for (const [ux, uz, colorBlk] of umbrellas) {
      const uy = this.getHeightAt(ux, uz);
      for (let y = uy + 1; y <= uy + 3; y++) {
        this.setVoxelInWorld(chunk, ux, y, uz, BLOCKS.OAK_LOG);
      }
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          const stripe = ((dx + dz) % 2 === 0) ? colorBlk : BLOCKS.SNOW;
          this.setVoxelInWorld(chunk, ux + dx, uy + 4, uz + dz, stripe);
        }
      }
      this.setVoxelInWorld(chunk, ux, uy + 5, uz, colorBlk);
      // Wooden sun loungers beside each umbrella
      this.setVoxelInWorld(chunk, ux - 1, uy + 1, uz - 1, BLOCKS.WOOD_PLANK);
      this.setVoxelInWorld(chunk, ux - 1, uy + 1, uz - 2, BLOCKS.SNOW);
      this.setVoxelInWorld(chunk, ux + 1, uy + 1, uz - 1, BLOCKS.WOOD_PLANK);
      this.setVoxelInWorld(chunk, ux + 1, uy + 1, uz - 2, BLOCKS.SNOW);
    }

    // 8. Curved Tropical Coconut Palm Trees
    const palmSites = [
      [-46, -488], [-34, -488], [-20, -488], [-8, -487], [8, -487], [18, -488], [34, -488], [46, -488],
      [-42, -502], [-22, -504], [12, -503], [36, -502]
    ];
    for (const [px, pz] of palmSites) {
      const py = this.getHeightAt(px, pz);
      this.buildPalmTree(chunk, px, py, pz);
    }

    // 9. Luxury Superyacht "Sol de Oro" Anchored in Turquoise Lagoon at (-24, -536, Y = 18)
    const yX = -24, yZ = -536;
    for (let z = yZ - 9; z <= yZ + 9; z++) {
      const distZ = Math.abs(z - yZ);
      const halfW = (distZ >= 8) ? 0 : ((distZ >= 6) ? 1 : ((distZ >= 4) ? 2 : 3));
      for (let x = yX - halfW; x <= yX + halfW; x++) {
        // White yacht hull & teak deck
        this.setVoxelInWorld(chunk, x, 18, z, BLOCKS.SNOW);
        this.setVoxelInWorld(chunk, x, 19, z, (Math.abs(x - yX) === halfW) ? BLOCKS.SNOW : BLOCKS.WOOD_PLANK);
        // Main cabin & panoramic bridge (Z: yZ - 4 .. yZ + 4)
        if (distZ <= 4 && Math.abs(x - yX) <= 2) {
          this.setVoxelInWorld(chunk, x, 20, z, BLOCKS.GLASS);
          this.setVoxelInWorld(chunk, x, 21, z, BLOCKS.SNOW);
        }
        // Upper flybridge & radar arch
        if (distZ <= 2 && Math.abs(x - yX) <= 1) {
          this.setVoxelInWorld(chunk, x, 22, z, BLOCKS.GLASS);
          this.setVoxelInWorld(chunk, x, 23, z, BLOCKS.SNOW);
        }
      }
    }
    this.setVoxelInWorld(chunk, yX, 24, yZ, BLOCKS.IRON_ORE);
    this.setVoxelInWorld(chunk, yX, 25, yZ, BLOCKS.GOLD_ORE);

    // 10. Grand Maritime Lighthouse of Playa Paraíso at (36, -515, Y = 18..45)
    const lhX = 36, lhZ = -515, lhBaseY = 18;
    // Octagonal stone breakwater pier around lighthouse
    for (let x = lhX - 5; x <= lhX + 5; x++) {
      for (let z = lhZ - 5; z <= lhZ + 5; z++) {
        if (Math.hypot(x - lhX, z - lhZ) <= 5.2) {
          for (let y = 14; y <= lhBaseY; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE);
          }
          this.setVoxelInWorld(chunk, x, lhBaseY + 1, z, (Math.hypot(x - lhX, z - lhZ) > 4.2) ? BLOCKS.STONE : BLOCKS.BRICK);
        }
      }
    }
    // Cylindrical tower with 2-block red/white stripes tapering upward
    for (let y = lhBaseY + 2; y <= lhBaseY + 20; y++) {
      const r = (y <= lhBaseY + 8) ? 3 : ((y <= lhBaseY + 14) ? 2 : 2);
      const isRedStripe = (Math.floor((y - (lhBaseY + 2)) / 3) % 2 === 0);
      const stripeBlk = isRedStripe ? BLOCKS.BRICK : BLOCKS.SNOW;
      for (let x = lhX - r; x <= lhX + r; x++) {
        for (let z = lhZ - r; z <= lhZ + r; z++) {
          if (Math.hypot(x - lhX, z - lhZ) <= r + 0.3) {
            const isOuter = Math.hypot(x - lhX, z - lhZ) >= r - 0.7;
            if (isOuter) {
              this.setVoxelInWorld(chunk, x, y, z, stripeBlk);
            } else if (x === lhX && z === lhZ) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.WOOD_PLANK);
            } else {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
            }
          }
        }
      }
    }
    // Observation Gallery Catwalk at Y = lhBaseY + 21
    const catY = lhBaseY + 21;
    for (let x = lhX - 3; x <= lhX + 3; x++) {
      for (let z = lhZ - 3; z <= lhZ + 3; z++) {
        if (Math.hypot(x - lhX, z - lhZ) <= 3.4) {
          const isRail = Math.hypot(x - lhX, z - lhZ) > 2.6;
          this.setVoxelInWorld(chunk, x, catY, z, BLOCKS.STONE);
          if (isRail) {
            this.setVoxelInWorld(chunk, x, catY + 1, z, BLOCKS.IRON_ORE);
          }
        }
      }
    }
    // Glass Lantern Room & Golden Rotary Beacon at Y = catY + 1 .. catY + 3
    for (let y = catY + 1; y <= catY + 3; y++) {
      for (let x = lhX - 2; x <= lhX + 2; x++) {
        for (let z = lhZ - 2; z <= lhZ + 2; z++) {
          if (Math.abs(x - lhX) <= 2 && Math.abs(z - lhZ) <= 2) {
            const isBeacon = (x === lhX && z === lhZ);
            const isGlass = (Math.abs(x - lhX) === 2 || Math.abs(z - lhZ) === 2);
            if (isBeacon && y === catY + 2) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GOLD_ORE);
            } else if (isGlass) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.GLASS);
            } else {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
            }
          }
        }
      }
    }
    // Conical roof & golden lightning finial at Y = catY + 4 .. catY + 7
    for (let x = lhX - 2; x <= lhX + 2; x++) {
      for (let z = lhZ - 2; z <= lhZ + 2; z++) {
        this.setVoxelInWorld(chunk, x, catY + 4, z, BLOCKS.BRICK);
      }
    }
    for (let x = lhX - 1; x <= lhX + 1; x++) {
      for (let z = lhZ - 1; z <= lhZ + 1; z++) {
        this.setVoxelInWorld(chunk, x, catY + 5, z, BLOCKS.BRICK);
      }
    }
    this.setVoxelInWorld(chunk, lhX, catY + 6, lhZ, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, lhX, catY + 7, lhZ, BLOCKS.IRON_ORE);

    // 11. Underwater Coral Reef Sanctuary in the turquoise lagoon (Z: -520..-555, X: -36..36, Y: 14..17)
    const reefCenters = [
      [-14, -524], [6, -532], [22, -540], [-26, -544], [-4, -548], [16, -522]
    ];
    for (const [rcX, rcZ] of reefCenters) {
      const coralTypes = [BLOCKS.BRICK, BLOCKS.GOLD_ORE, BLOCKS.CLAY, BLOCKS.SNOW];
      const cType = coralTypes[(Math.abs(rcX * 7 + rcZ * 13)) % coralTypes.length];
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const d = Math.hypot(dx, dz);
          if (d <= 2.2) {
            const h = (d <= 0.8) ? 3 : ((d <= 1.6) ? 2 : 1);
            for (let y = 14; y < 14 + h && y <= 17; y++) {
              this.setVoxelInWorld(chunk, rcX + dx, y, rcZ + dz, (y === 14) ? BLOCKS.SAND : cType);
            }
          }
        }
      }
    }
  }

  /**
   * GRAN CIRCUITO INTERNACIONAL DE VELOCIDAD (SE Quadrant: 50..210, -190..-40)
   * Dedicated Grand Prix circuit in South-East quadrant between Central Spawn (0,0) and Paris (+250, -250).
   * 14-block wide racing track (12-block ASPHALT + 1-block alternating BRICK/SNOW rumble curbs).
   * Features:
   * 1. Main Straight (X in 60..180, Z in -66..-54): 12 lanes asphalt at Y=24, curbs at Z=-66 and Z=-53.
   * 2. Starting Grid Gantry at X=110 across track (Y=25..31) with starting lights (BRICK & GOLD_ORE).
   * 3. Checkered start/finish line at X=110 across all 12 lanes (ASPHALT & SNOW).
   * 4. Staggered starting grid boxes at X=104, 98, 92, 86, 80.
   * 5. Covered Grandstand Stadium (Tribuna Principal) north of straight (Z in -51..-42, X in 80..150) with 8 stepped seating tiers (Y=25..32) and cantilever roof at Y=34.
   * 6. Pit Lane & Team Garages south of straight (Z in -76..-69, X in 90..145) with concrete pit wall at Z=-68.
   * 7. Turn 1 & 2 (Curva Grande) sweeping corner (X in 180..205, Z in -60..-100).
   * 8. Bridge Over Water (Puente del Circuito) across Azure Lake (X in 195..205, Z in -100..-140) with concrete piers and suspension towers.
   * 9. Turn 3 & 4 (Horquilla del Lago - Hairpin) around lake shore (X in 130..200, Z in -140..-175).
   * 10. Mountain Racing Tunnel (Túnel de la Montaña) through hill (X in 70..130, Z in -162..-148) with arched roof and ceiling floodlights.
   * 11. S-bend Chicane (Chicana del Estadio) with 150m/100m/50m braking markers (X in 55..75, Z in -120..-66) returning to main straight.
   */
  buildGranCircuito(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < 45 || ox > 215 || oz + 16 < -195 || oz > -35) return;

    const ASPHALT = BLOCKS.ASPHALT || BLOCKS.COBBLESTONE;
    const CURB_RED = BLOCKS.BRICK;
    const CURB_WHITE = BLOCKS.SNOW;
    const getCurb = (s) => (Math.floor(Math.abs(s) / 2) % 2 === 0 ? CURB_RED : CURB_WHITE);
    const trackY = 24;

    // Helper to pave a 12-block wide segment with 1-block outer curbs and clear 5 blocks headroom (Y=25..29)
    const setTrackVoxel = (wx, wz) => {
      this.setVoxelInWorld(chunk, wx, trackY - 1, wz, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, wx, trackY, wz, ASPHALT);
      for (let y = trackY + 1; y <= trackY + 5; y++) {
        this.setVoxelInWorld(chunk, wx, y, wz, BLOCKS.AIR);
      }
    };

    const setCurbVoxel = (wx, wz, s) => {
      this.setVoxelInWorld(chunk, wx, trackY - 1, wz, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, wx, trackY, wz, getCurb(s));
    };

    // -------------------------------------------------------------------------
    // 1. MAIN STRAIGHT (X in 60..180, Z in -66..-54): Track width 14 (12 ASPHALT + 2 Curbs)
    // -------------------------------------------------------------------------
    const msX1 = Math.max(60, ox);
    const msX2 = Math.min(180, ox + 15);
    if (msX1 <= msX2) {
      for (let x = msX1; x <= msX2; x++) {
        for (let z = -65; z <= -54; z++) {
          setTrackVoxel(x, z);
        }
        setCurbVoxel(x, -66, x);
        setCurbVoxel(x, -53, x);
      }
    }

    // Starting Grid Gantry at X = 110 (Y=25..31)
    if (110 >= ox && 110 <= ox + 15) {
      for (let y = trackY + 1; y <= trackY + 7; y++) {
        this.setVoxelInWorld(chunk, 110, y, -67, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, 110, y, -52, BLOCKS.IRON_ORE);
      }
      for (let z = -67; z <= -52; z++) {
        this.setVoxelInWorld(chunk, 110, trackY + 7, z, BLOCKS.IRON_ORE);
      }
      for (const lz of [-63, -61, -59, -57, -55]) {
        this.setVoxelInWorld(chunk, 110, trackY + 6, lz, BLOCKS.BRICK);
        this.setVoxelInWorld(chunk, 110, trackY + 5, lz, BLOCKS.GOLD_ORE);
      }

      // Checkered start/finish line at X = 110
      for (let z = -65; z <= -54; z++) {
        const isWhite = ((z + 110) % 2 === 0);
        this.setVoxelInWorld(chunk, 110, trackY, z, isWhite ? CURB_WHITE : ASPHALT);
      }
    }

    // Staggered grid boxes behind finish line
    for (const gx of [104, 98, 92, 86, 80]) {
      if (gx >= ox && gx <= ox + 15) {
        for (let z = -64; z <= -55; z++) {
          if (z === -63 || z === -59 || z === -55) {
            this.setVoxelInWorld(chunk, gx, trackY, z, CURB_WHITE);
          }
        }
      }
    }

    // Grandstand Stadium (Tribuna Principal) North of straight (Z in -51..-42, X in 80..150)
    const gsX1 = Math.max(80, ox);
    const gsX2 = Math.min(150, ox + 15);
    const gsZ1 = Math.max(-51, oz);
    const gsZ2 = Math.min(-42, oz + 15);
    if (gsX1 <= gsX2 && gsZ1 <= gsZ2) {
      for (let x = gsX1; x <= gsX2; x++) {
        for (let z = gsZ1; z <= gsZ2; z++) {
          if (z <= -44) {
            const tierY = trackY + 1 + (-44 - z);
            for (let y = trackY; y < tierY; y++) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE);
            }
            this.setVoxelInWorld(chunk, x, tierY, z, ((x + z) % 2 === 0) ? BLOCKS.WOOD_PLANK : BLOCKS.STONE);
          }
          if (z <= -44) {
            this.setVoxelInWorld(chunk, x, trackY + 10, z, BLOCKS.WOOD_PLANK);
          }
        }
      }
    }
    // Grandstand Stadium Floodlight Towers at X = 85, 115, 145, Z = -42
    for (const lx of [85, 115, 145]) {
      if (lx >= ox && lx <= ox + 15 && -42 >= oz && -42 <= oz + 15) {
        for (let y = trackY + 1; y <= trackY + 12; y++) {
          this.setVoxelInWorld(chunk, lx, y, -42, BLOCKS.IRON_ORE);
        }
        this.setVoxelInWorld(chunk, lx, trackY + 12, -42, BLOCKS.GOLD_ORE);
      }
    }

    // Pit Lane & Team Garages South of straight (Z in -76..-68, X in 90..145)
    const pitX1 = Math.max(90, ox);
    const pitX2 = Math.min(145, ox + 15);
    if (pitX1 <= pitX2) {
      for (let x = pitX1; x <= pitX2; x++) {
        this.setVoxelInWorld(chunk, x, trackY, -68, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, x, trackY + 1, -68, BLOCKS.STONE);
        this.setVoxelInWorld(chunk, x, trackY + 2, -68, BLOCKS.IRON_ORE);

        for (let z = -74; z <= -69; z++) {
          setTrackVoxel(x, z);
        }
        setCurbVoxel(x, -75, x);

        for (let z = -80; z <= -76; z++) {
          this.setVoxelInWorld(chunk, x, trackY, z, BLOCKS.COBBLESTONE);
          const isGarageWall = (z === -80 || x % 9 === 0);
          if (isGarageWall) {
            for (let y = trackY + 1; y <= trackY + 3; y++) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.IRON_ORE);
            }
          }
          this.setVoxelInWorld(chunk, x, trackY + 4, z, BLOCKS.WOOD_PLANK);
          if (x % 9 === 4 && z === -78) {
            this.setVoxelInWorld(chunk, x, trackY + 3, z, BLOCKS.GOLD_ORE);
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 2. TURN 1 & 2 (CURVA GRANDE) (X in 180..205, Z in -100..-60)
    // -------------------------------------------------------------------------
    const t1X1 = Math.max(180, ox);
    const t1X2 = Math.min(205, ox + 15);
    const t1Z1 = Math.max(-100, oz);
    const t1Z2 = Math.min(-60, oz + 15);
    if (t1X1 <= t1X2 && t1Z1 <= t1Z2) {
      const centerX = 175, centerZ = -95;
      for (let x = t1X1; x <= t1X2; x++) {
        for (let z = t1Z1; z <= t1Z2; z++) {
          if (z >= -66 && x <= 180) continue;
          const r = Math.hypot(x - centerX, z - centerZ);
          if (r >= 17 && r <= 29) {
            setTrackVoxel(x, z);
          } else if ((r >= 15.5 && r < 17) || (r > 29 && r <= 30.5)) {
            setCurbVoxel(x, z, Math.round(r * 2 + x + z));
          } else if (r > 30.5 && r <= 34.5) {
            this.setVoxelInWorld(chunk, x, trackY, z, BLOCKS.GRAVEL);
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 3. BRIDGE OVER WATER (PUENTE DEL CIRCUITO) (X in 194..206, Z in -140..-100)
    // -------------------------------------------------------------------------
    const brZ1 = Math.max(-140, oz);
    const brZ2 = Math.min(-100, oz + 15);
    if (brZ1 <= brZ2) {
      for (let z = brZ1; z <= brZ2; z++) {
        for (let x = 194; x <= 205; x++) {
          setTrackVoxel(x, z);
        }
        setCurbVoxel(193, z, z);
        setCurbVoxel(206, z, z);

        this.setVoxelInWorld(chunk, 192, trackY + 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, 192, trackY + 2, z, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, 207, trackY + 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, 207, trackY + 2, z, BLOCKS.IRON_ORE);

        if (z === -135 || z === -120 || z === -105) {
          for (let x = 193; x <= 206; x++) {
            for (let py = 14; py < trackY; py++) {
              this.setVoxelInWorld(chunk, x, py, z, BLOCKS.COBBLESTONE);
            }
          }
        }
      }
      if (-120 >= oz && -120 <= oz + 15) {
        for (const px of [192, 207]) {
          for (let y = trackY + 1; y <= trackY + 8; y++) {
            this.setVoxelInWorld(chunk, px, y, -120, BLOCKS.STONE);
          }
          this.setVoxelInWorld(chunk, px, trackY + 8, -120, BLOCKS.GOLD_ORE);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 4. TURN 3 & 4 (HORQUILLA DEL LAGO - HAIRPIN) (X in 130..205, Z in -175..-140)
    // -------------------------------------------------------------------------
    const hpX1 = Math.max(130, ox);
    const hpX2 = Math.min(205, ox + 15);
    const hpZ1 = Math.max(-175, oz);
    const hpZ2 = Math.min(-140, oz + 15);
    if (hpX1 <= hpX2 && hpZ1 <= hpZ2) {
      const hcX = 165, hcZ = -145;
      for (let x = hpX1; x <= hpX2; x++) {
        for (let z = hpZ1; z <= hpZ2; z++) {
          if (z >= -140 && x >= 193) continue;
          const r = Math.hypot(x - hcX, z - hcZ);
          if (z <= -145 && r >= 20 && r <= 32) {
            setTrackVoxel(x, z);
          } else if (z <= -145 && ((r >= 18.5 && r < 20) || (r > 32 && r <= 33.5))) {
            setCurbVoxel(x, z, Math.round(r * 2 + x + z));
          } else if (z <= -145 && r > 33.5 && r <= 35) {
            this.setVoxelInWorld(chunk, x, trackY + 1, z, BLOCKS.COBBLESTONE);
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 5. MOUNTAIN RACING TUNNEL (TÚNEL DE LA MONTAÑA) (X in 70..130, Z in -162..-148)
    // -------------------------------------------------------------------------
    const tunX1 = Math.max(70, ox);
    const tunX2 = Math.min(130, ox + 15);
    if (tunX1 <= tunX2) {
      for (let x = tunX1; x <= tunX2; x++) {
        for (let z = -161; z <= -150; z++) {
          setTrackVoxel(x, z);
        }
        setCurbVoxel(x, -162, x);
        setCurbVoxel(x, -149, x);

        for (let y = trackY + 1; y <= trackY + 6; y++) {
          this.setVoxelInWorld(chunk, x, y, -163, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, y, -148, BLOCKS.COBBLESTONE);
        }
        for (let z = -162; z <= -149; z++) {
          this.setVoxelInWorld(chunk, x, trackY + 6, z, BLOCKS.STONE);
          this.setVoxelInWorld(chunk, x, trackY + 7, z, BLOCKS.STONE);
        }
        if (x % 6 === 0) {
          this.setVoxelInWorld(chunk, x, trackY + 5, -155, BLOCKS.GOLD_ORE);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 6. CHICANE & RETURN TO MAIN STRAIGHT (X in 55..75, Z in -148..-60)
    // -------------------------------------------------------------------------
    const chZ1 = Math.max(-148, oz);
    const chZ2 = Math.min(-60, oz + 15);
    if (chZ1 <= chZ2) {
      for (let z = chZ1; z <= chZ2; z++) {
        const t = (z - (-148)) / ((-60) - (-148));
        const centerX = Math.round(70 - 10 * t + Math.sin(t * Math.PI * 2) * 4);
        for (let x = centerX - 6; x <= centerX + 5; x++) {
          setTrackVoxel(x, z);
        }
        setCurbVoxel(centerX - 7, z, z);
        setCurbVoxel(centerX + 6, z, z);

        if (z === -90 || z === -80 || z === -70) {
          const signX = centerX + 8;
          this.setVoxelInWorld(chunk, signX, trackY + 1, z, BLOCKS.IRON_ORE);
          this.setVoxelInWorld(chunk, signX, trackY + 2, z, BLOCKS.SNOW);
          this.setVoxelInWorld(chunk, signX, trackY + 3, z, (z === -90) ? BLOCKS.BRICK : ((z === -80) ? BLOCKS.GOLD_ORE : BLOCKS.SNOW));
        }
      }
    }
  }

  /**
   * SECTOR 7: GRAND PRIX RACING CIRCUIT (-500, -500)
   * A massive 250x250 racing track complex featuring:
   * 1. Wide 14-block asphalt track with alternating red-and-white rumble curbs on both borders.
   * 2. Covered spectator grandstands with tiered seating and cantilevered roof overhead.
   * 3. Starting grid gantry with 5-light Formula 1 start sequence, checkered finish line and grid boxes.
   * 4. Pit lane and covered pit garages with team stalls and pit wall.
   * 5. Lake bridge spanning the azure lake on heavy stone piers with parapet guardrails.
   * 6. Mountain tunnels carved through solid stone peaks with timber arch ribs and glowing lanterns.
   */
  buildGrandPrixSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < -625 || ox > -375 || oz + 16 < -625 || oz > -375) return;

    const ASPHALT = BLOCKS.ASPHALT || BLOCKS.COBBLESTONE;
    const CURB_RED = (BLOCKS.RED_CONCRETE !== undefined ? BLOCKS.RED_CONCRETE : (BLOCKS.RED_WOOL !== undefined ? BLOCKS.RED_WOOL : BLOCKS.BRICK));
    const CURB_WHITE = (BLOCKS.WHITE_CONCRETE !== undefined ? BLOCKS.WHITE_CONCRETE : (BLOCKS.WHITE_WOOL !== undefined ? BLOCKS.WHITE_WOOL : BLOCKS.SNOW));
    const getCurb = (x, z) => ((Math.abs(x) + Math.abs(z)) % 2 === 0 ? CURB_RED : CURB_WHITE);

    // =========================================================================
    // 1. SOUTH MAIN STRAIGHT: Z in -427..-414, X in -560..-430 (Track width 14, Y = 24)
    // =========================================================================
    const mainStraightX1 = Math.max(-560, ox);
    const mainStraightX2 = Math.min(-430, ox + 15);
    const mainStraightZ1 = Math.max(-427, oz);
    const mainStraightZ2 = Math.min(-414, oz + 15);
    const trackY = 24;

    if (mainStraightX1 <= mainStraightX2 && mainStraightZ1 <= mainStraightZ2) {
      for (let x = mainStraightX1; x <= mainStraightX2; x++) {
        for (let z = mainStraightZ1; z <= mainStraightZ2; z++) {
          this.setVoxelInWorld(chunk, x, trackY - 1, z, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, trackY, z, ASPHALT);
          for (let y = trackY + 1; y <= trackY + 5; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          }
        }
      }
    }

    // Main straight curbs & crash barriers
    if (mainStraightX1 <= mainStraightX2) {
      for (let x = mainStraightX1; x <= mainStraightX2; x++) {
        // Red and white rumble curbs
        this.setVoxelInWorld(chunk, x, trackY - 1, -428, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, x, trackY, -428, getCurb(x, -428));
        this.setVoxelInWorld(chunk, x, trackY - 1, -413, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, x, trackY, -413, getCurb(x, -413));

        // Solid Crash Barriers
        // Grandstand side (Z = -412): solid barrier protecting spectators and keeping cars on track
        this.setVoxelInWorld(chunk, x, trackY + 1, -412, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, x, trackY + 2, -412, BLOCKS.IRON_ORE);
      }
    }

    // =========================================================================
    // 2. STARTING GRID GANTRY & FINISH LINE (at X = -500 across Main Straight)
    // =========================================================================
    // Checkered start/finish line at X = -500 and -501
    for (const fx of [-500, -501]) {
      if (fx >= ox && fx <= ox + 15) {
        for (let z = -427; z <= -414; z++) {
          const isWhite = ((z + fx) % 2 === 0);
          this.setVoxelInWorld(chunk, fx, trackY, z, isWhite ? CURB_WHITE : ASPHALT);
        }
      }
    }

    // Staggered grid boxes behind start line (X = -506, -512, -518, -524, -530)
    for (const gx of [-506, -512, -518, -524, -530]) {
      if (gx >= ox && gx <= ox + 15) {
        for (let z = -426; z <= -415; z++) {
          if (z === -425 || z === -421 || z === -417) {
            this.setVoxelInWorld(chunk, gx, trackY, z, CURB_WHITE);
          }
        }
      }
    }

    // Gantry Structural Towers at Z = -429 and Z = -412
    for (const gz of [-429, -412]) {
      for (const gx of [-500, -501]) {
        if (gx >= ox && gx <= ox + 15) {
          for (let y = trackY + 1; y <= trackY + 8; y++) {
            this.setVoxelInWorld(chunk, gx, y, gz, (y === trackY + 8) ? BLOCKS.GOLD_ORE : BLOCKS.IRON_ORE);
          }
        }
      }
    }

    // Gantry Bridge Truss across track at Y = trackY + 7..8 (31..32)
    for (const gx of [-500, -501]) {
      if (gx >= ox && gx <= ox + 15) {
        for (let gz = -429; gz <= -412; gz++) {
          this.setVoxelInWorld(chunk, gx, trackY + 7, gz, BLOCKS.IRON_ORE);
          this.setVoxelInWorld(chunk, gx, trackY + 8, gz, (gx === -500) ? BLOCKS.COBBLESTONE : BLOCKS.GLASS);

          // Formula 1 5-light start sequence at Y = trackY + 6 (30)
          if (gz >= -425 && gz <= -416 && gz % 2 !== 0) {
            this.setVoxelInWorld(chunk, -500, trackY + 6, gz, CURB_RED); // Countdown red light
            this.setVoxelInWorld(chunk, -499, trackY + 6, gz, BLOCKS.GOLD_ORE); // Amber/green indicator
          }
        }
      }
    }

    // =========================================================================
    // 3. PIT LANE & COVERED PIT GARAGES (North of Main Straight, X: -550..-450)
    // =========================================================================
    const pitX1 = Math.max(-550, ox);
    const pitX2 = Math.min(-450, ox + 15);

    if (pitX1 <= pitX2) {
      for (let x = pitX1; x <= pitX2; x++) {
        // Concrete Pit Wall at Z = -429 separating track and pit lane
        this.setVoxelInWorld(chunk, x, trackY + 1, -429, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, x, trackY + 2, -429, (x % 3 === 0) ? BLOCKS.IRON_ORE : BLOCKS.COBBLESTONE);
        if (x % 20 === 0) {
          this.setVoxelInWorld(chunk, x, trackY + 2, -429, BLOCKS.GLASS);
          this.setVoxelInWorld(chunk, x, trackY + 3, -429, BLOCKS.GOLD_ORE); // Pit telemetry console
        }

        // Pit Lane Roadway: Z in -436..-430
        for (let z = -436; z <= -430; z++) {
          this.setVoxelInWorld(chunk, x, trackY - 1, z, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, trackY, z, ASPHALT);
          for (let y = trackY + 1; y <= trackY + 4; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          }
        }

        // Pit lane entry and exit speed lines
        if (x === -548 || x === -452) {
          for (let z = -436; z <= -430; z++) {
            this.setVoxelInWorld(chunk, x, trackY, z, CURB_WHITE);
          }
        }
      }
    }

    // Covered Pit Garages (Team Stalls): Z in -446..-437, X in -540..-460
    const garX1 = Math.max(-540, ox);
    const garX2 = Math.min(-460, ox + 15);

    if (garX1 <= garX2) {
      for (let x = garX1; x <= garX2; x++) {
        // Rear concrete garage wall at Z = -446
        for (let y = trackY; y <= trackY + 4; y++) {
          this.setVoxelInWorld(chunk, x, y, -446, BLOCKS.STONE);
        }

        // Garage floor & interior clearance
        for (let z = -445; z <= -437; z++) {
          this.setVoxelInWorld(chunk, x, trackY - 1, z, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, trackY, z, BLOCKS.COBBLESTONE);
          for (let y = trackY + 1; y <= trackY + 4; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          }
        }

        // Team divider walls every 16 blocks along X
        if (Math.abs(x + 540) % 16 === 0) {
          for (let z = -445; z <= -437; z++) {
            for (let y = trackY + 1; y <= trackY + 4; y++) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.BRICK);
            }
          }
        }

        // Cantilevered Garage Roof overhead at Y = trackY + 5 (29)
        for (let z = -446; z <= -436; z++) {
          this.setVoxelInWorld(chunk, x, trackY + 5, z, (z === -436) ? BLOCKS.WOOD_PLANK : BLOCKS.SNOW);
        }

        // Team workbench toolboxes
        if (x % 8 === 0) {
          this.setVoxelInWorld(chunk, x, trackY + 1, -444, BLOCKS.WOOD_PLANK);
          this.setVoxelInWorld(chunk, x, trackY + 2, -444, BLOCKS.IRON_ORE);
          this.setVoxelInWorld(chunk, x + 1, trackY + 1, -444, BLOCKS.GOLD_ORE);
        }
      }
    }

    // =========================================================================
    // 4. COVERED SPECTATOR GRANDSTANDS (South of Main Straight, Z: -411..-395)
    // =========================================================================
    const gsX1 = Math.max(-550, ox);
    const gsX2 = Math.min(-450, ox + 15);

    if (gsX1 <= gsX2) {
      const tiers = [
        [-410, trackY + 1],
        [-408, trackY + 2],
        [-406, trackY + 3],
        [-404, trackY + 4],
        [-402, trackY + 5],
        [-400, trackY + 6],
        [-398, trackY + 7]
      ];

      for (let x = gsX1; x <= gsX2; x++) {
        for (const [tz, ty] of tiers) {
          // Concrete stepped tier base
          for (let y = trackY; y <= ty; y++) {
            this.setVoxelInWorld(chunk, x, y, tz, BLOCKS.STONE);
            this.setVoxelInWorld(chunk, x, y, tz + 1, BLOCKS.STONE);
          }
          // Spectator wooden bench seat
          this.setVoxelInWorld(chunk, x, ty, tz, BLOCKS.WOOD_PLANK);
          // Clear headroom above bench
          for (let y = ty + 1; y <= trackY + 11; y++) {
            this.setVoxelInWorld(chunk, x, y, tz, BLOCKS.AIR);
            this.setVoxelInWorld(chunk, x, y, tz + 1, BLOCKS.AIR);
          }
        }

        // Upper concourse walkway at Z = -396..-395
        for (let y = trackY; y <= trackY + 8; y++) {
          this.setVoxelInWorld(chunk, x, y, -396, BLOCKS.STONE);
          this.setVoxelInWorld(chunk, x, y, -395, BLOCKS.STONE);
        }
        this.setVoxelInWorld(chunk, x, trackY + 9, -395, BLOCKS.IRON_ORE); // Rear safety railing

        // Grandstand structural support columns at Z = -397
        if (Math.abs(x + 550) % 10 === 0) {
          for (let y = trackY + 8; y <= trackY + 12; y++) {
            this.setVoxelInWorld(chunk, x, y, -397, BLOCKS.IRON_ORE);
          }
        }

        // Cantilevered overhead grandstand roof canopy at Y = trackY + 12 (36)
        for (let z = -412; z <= -395; z++) {
          const isEdge = (z === -412);
          this.setVoxelInWorld(chunk, x, trackY + 12, z, isEdge ? BLOCKS.WOOD_PLANK : BLOCKS.SNOW);
          if (isEdge && Math.abs(x + 550) % 10 === 0) {
            this.setVoxelInWorld(chunk, x, trackY + 11, z, BLOCKS.GOLD_ORE); // Track floodlight
          }
        }
      }
    }

    // =========================================================================
    // 5. TURN 1 & TURN 2 (Southeast Corner, X: -430..-410, Z: -440..-420)
    // =========================================================================
    const t1X1 = Math.max(-430, ox);
    const t1X2 = Math.min(-410, ox + 15);
    const t1Z1 = Math.max(-440, oz);
    const t1Z2 = Math.min(-420, oz + 15);

    if (t1X1 <= t1X2 && t1Z1 <= t1Z2) {
      for (let x = t1X1; x <= t1X2; x++) {
        for (let z = t1Z1; z <= t1Z2; z++) {
          const dx = x - (-410);
          const dz = z - (-420);
          const dist = Math.hypot(dx, dz);
          if (dist <= 26 && dist >= 8) {
            this.setVoxelInWorld(chunk, x, trackY - 1, z, BLOCKS.COBBLESTONE);
            this.setVoxelInWorld(chunk, x, trackY, z, ASPHALT);
            for (let y = trackY + 1; y <= trackY + 5; y++) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
            }
            // Inner curb
            if (dist <= 9) {
              this.setVoxelInWorld(chunk, x, trackY, z, getCurb(x, z));
            }
            // Outer curb & crash barrier
            if (dist >= 25) {
              this.setVoxelInWorld(chunk, x, trackY, z, getCurb(x, z));
              this.setVoxelInWorld(chunk, x, trackY + 1, z, BLOCKS.COBBLESTONE);
              this.setVoxelInWorld(chunk, x, trackY + 2, z, BLOCKS.IRON_ORE);
            }
          }
        }
      }
    }

    // =========================================================================
    // 6. STEEP UPHILL CLIMB (East Section, Z: -465..-440, X: -417..-404, W=14)
    //    Climbs steeply from Y = 24 up to Y = 30 over 25 blocks!
    // =========================================================================
    const climbX1 = Math.max(-417, ox);
    const climbX2 = Math.min(-404, ox + 15);
    const climbZ1 = Math.max(-465, oz);
    const climbZ2 = Math.min(-440, oz + 15);

    if (climbX1 <= climbX2 && climbZ1 <= climbZ2) {
      for (let z = climbZ1; z <= climbZ2; z++) {
        const progress = (Math.abs(z) - 440) / 25; // 0 at -440, 1 at -465
        const curY = Math.floor(24 + progress * 6); // 24 -> 30

        for (let x = climbX1; x <= climbX2; x++) {
          // Solid foundation down to ground level (no void gap!)
          for (let y = 20; y < curY; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE);
          }
          this.setVoxelInWorld(chunk, x, curY, z, ASPHALT);
          // Clear headroom above climbing track
          for (let y = curY + 1; y <= curY + 5; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          }
        }
      }
    }

    // Curbs & crash barriers along uphill climb
    if (climbZ1 <= climbZ2) {
      for (let z = climbZ1; z <= climbZ2; z++) {
        const progress = (Math.abs(z) - 440) / 25;
        const curY = Math.floor(24 + progress * 6);

        // Curbs
        this.setVoxelInWorld(chunk, -418, curY - 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -418, curY, z, getCurb(-418, z));
        this.setVoxelInWorld(chunk, -403, curY - 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -403, curY, z, getCurb(-403, z));

        // Solid Crash Barriers along climb
        this.setVoxelInWorld(chunk, -419, curY + 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -419, curY + 2, z, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, -402, curY + 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -402, curY + 2, z, BLOCKS.IRON_ORE);
      }
    }

    // =========================================================================
    // 7. LAKESIDE BRIDGE CROSSING (over Azure Lake, Z: -520..-466, X: -417..-404, Y = 30)
    // =========================================================================
    const bridgeX1 = Math.max(-417, ox);
    const bridgeX2 = Math.min(-404, ox + 15);
    const bridgeZ1 = Math.max(-520, oz);
    const bridgeZ2 = Math.min(-466, oz + 15);
    const bridgeY = 30;

    if (bridgeX1 <= bridgeX2 && bridgeZ1 <= bridgeZ2) {
      for (let z = bridgeZ1; z <= bridgeZ2; z++) {
        for (let x = bridgeX1; x <= bridgeX2; x++) {
          this.setVoxelInWorld(chunk, x, bridgeY - 1, z, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, bridgeY, z, ASPHALT);
          for (let y = bridgeY + 1; y <= bridgeY + 6; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          }
        }
      }
    }

    // Bridge parapets, rumble curbs, and deep water piers
    if (bridgeZ1 <= bridgeZ2) {
      for (let z = bridgeZ1; z <= bridgeZ2; z++) {
        // Red and white rumble curbs at Y = 30
        this.setVoxelInWorld(chunk, -418, bridgeY - 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -418, bridgeY, z, getCurb(-418, z));
        this.setVoxelInWorld(chunk, -403, bridgeY - 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -403, bridgeY, z, getCurb(-403, z));

        // Parapet Crash Barriers: solid stone base + iron guardrail (Y = 31..32)
        this.setVoxelInWorld(chunk, -418, bridgeY + 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -403, bridgeY + 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -418, bridgeY + 2, z, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, -403, bridgeY + 2, z, BLOCKS.IRON_ORE);

        // Deep Bridge Support Piers descending into the azure lake (water level 18, lake bed 14)
        if (Math.abs(z) % 10 === 0) {
          for (let py = 14; py < bridgeY; py++) {
            for (let px = -418; px <= -415; px++) {
              this.setVoxelInWorld(chunk, px, py, z, BLOCKS.STONE);
            }
            for (let px = -406; px <= -403; px++) {
              this.setVoxelInWorld(chunk, px, py, z, BLOCKS.STONE);
            }
          }
        }

        // Bridge suspension towers at mid-lake (Z = -495)
        if (z === -495) {
          for (let ty = bridgeY + 3; ty <= bridgeY + 8; ty++) {
            this.setVoxelInWorld(chunk, -418, ty, z, (ty === bridgeY + 8) ? BLOCKS.GOLD_ORE : BLOCKS.IRON_ORE);
            this.setVoxelInWorld(chunk, -403, ty, z, (ty === bridgeY + 8) ? BLOCKS.GOLD_ORE : BLOCKS.IRON_ORE);
          }
        }
      }
    }

    // =========================================================================
    // 8. TURN 3: HIGH-BANKED SWEEPING CURVE (Northeast Corner, X: -430..-410, Z: -585..-520)
    //    Outer edge banked upwards by 3 blocks (Y = 30 at inside, up to Y = 33 at outside!)
    // =========================================================================
    const t3X1 = Math.max(-430, ox);
    const t3X2 = Math.min(-410, ox + 15);
    const t3Z1 = Math.max(-585, oz);
    const t3Z2 = Math.min(-520, oz + 15);

    if (t3X1 <= t3X2 && t3Z1 <= t3Z2) {
      for (let x = t3X1; x <= t3X2; x++) {
        for (let z = t3Z1; z <= t3Z2; z++) {
          const dx = x - (-410);
          const dz = z - (-520);
          const dist = Math.hypot(dx, dz);

          if (dist <= 68 && dist >= 48) {
            // High-Banking calculation: outer radius elevated up to 3 blocks higher
            const bankOffset = Math.floor(((dist - 48) / 20) * 3); // 0 at inner (dist 48), 3 at outer (dist 68)
            const curY = 30 + bankOffset; // 30, 31, 32, 33!

            // Solid foundation down to ground
            for (let y = 24; y < curY; y++) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE);
            }
            this.setVoxelInWorld(chunk, x, curY, z, ASPHALT);

            // Clear headroom above banked road
            for (let y = curY + 1; y <= curY + 5; y++) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
            }

            // Banked inner curb
            if (dist <= 49) {
              this.setVoxelInWorld(chunk, x, curY, z, getCurb(x, z));
            }
            // Banked outer curb & high crash barrier wall
            if (dist >= 67) {
              this.setVoxelInWorld(chunk, x, curY, z, getCurb(x, z));
              this.setVoxelInWorld(chunk, x, curY + 1, z, BLOCKS.STONE);
              this.setVoxelInWorld(chunk, x, curY + 2, z, BLOCKS.STONE);
              this.setVoxelInWorld(chunk, x, curY + 3, z, BLOCKS.IRON_ORE);
            }
          }
        }
      }
    }

    // =========================================================================
    // 9. NORTH SECTION & MOUNTAIN TUNNELS (Z: -592..-579, X: -570..-430, W=14, Y=30)
    //    Carved straight through solid mountain peaks with timber arch ribs & lanterns
    // =========================================================================
    const northX1 = Math.max(-570, ox);
    const northX2 = Math.min(-430, ox + 15);
    const northZ1 = Math.max(-592, oz);
    const northZ2 = Math.min(-579, oz + 15);
    const northY = 30;

    if (northX1 <= northX2 && northZ1 <= northZ2) {
      for (let x = northX1; x <= northX2; x++) {
        for (let z = northZ1; z <= northZ2; z++) {
          this.setVoxelInWorld(chunk, x, northY - 1, z, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, northY, z, ASPHALT);
          // Clear 6 blocks of interior headroom inside tunnel / track
          for (let y = northY + 1; y <= northY + 6; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          }
        }
      }
    }

    // North rumble curbs, mountain tunnel architecture & portals
    if (northX1 <= northX2) {
      for (let x = northX1; x <= northX2; x++) {
        // Red and white rumble curbs
        this.setVoxelInWorld(chunk, x, northY - 1, -593, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, x, northY, -593, getCurb(x, -593));
        this.setVoxelInWorld(chunk, x, northY - 1, -578, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, x, northY, -578, getCurb(x, -578));

        // Mountain Tunnels (Tunnel 1: X in -480..-440, Tunnel 2: X in -560..-510)
        const inTunnel = (x >= -480 && x <= -440) || (x >= -560 && x <= -510);
        const isPortal = (x === -480 || x === -440 || x === -560 || x === -510);

        if (inTunnel) {
          // Arched stone tunnel ceiling at Y = northY + 7..8 (37..38)
          for (let z = -593; z <= -578; z++) {
            this.setVoxelInWorld(chunk, x, northY + 7, z, (z === -593 || z === -578) ? BLOCKS.STONE : BLOCKS.COBBLESTONE);
            this.setVoxelInWorld(chunk, x, northY + 8, z, BLOCKS.STONE);
          }

          // Timber arch support ribs every 5 blocks along X
          if (Math.abs(x) % 5 === 0) {
            for (let y = northY + 1; y <= northY + 6; y++) {
              this.setVoxelInWorld(chunk, x, y, -593, BLOCKS.OAK_LOG);
              this.setVoxelInWorld(chunk, x, y, -578, BLOCKS.OAK_LOG);
            }
            for (let z = -592; z <= -579; z++) {
              this.setVoxelInWorld(chunk, x, northY + 7, z, BLOCKS.WOOD_PLANK);
            }
            // Glowing gold ceiling lanterns down center of tunnel
            this.setVoxelInWorld(chunk, x, northY + 6, -586, BLOCKS.GOLD_ORE);
            this.setVoxelInWorld(chunk, x, northY + 6, -585, BLOCKS.GOLD_ORE);
          }

          // Portal arch frames at tunnel mouths
          if (isPortal) {
            for (let z = -594; z <= -577; z++) {
              for (let y = northY + 1; y <= northY + 10; y++) {
                if (z === -594 || z === -577 || y >= northY + 8) {
                  this.setVoxelInWorld(chunk, x, y, z, BLOCKS.STONE);
                }
              }
            }
          }
        } else {
          // Open canyon between tunnels: solid crash barriers on both sides
          this.setVoxelInWorld(chunk, x, northY + 1, -594, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, northY + 2, -594, BLOCKS.IRON_ORE);
          this.setVoxelInWorld(chunk, x, northY + 1, -577, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, northY + 2, -577, BLOCKS.IRON_ORE);
        }
      }
    }

    // =========================================================================
    // 10. TURN 4: HIGH-BANKED SWEEPING DOWNHILL CURVE (Northwest Corner)
    //     X: -585..-565, Z: -585..-560. Descends from Y = 30 down to Y = 24!
    // =========================================================================
    const t4X1 = Math.max(-585, ox);
    const t4X2 = Math.min(-565, ox + 15);
    const t4Z1 = Math.max(-585, oz);
    const t4Z2 = Math.min(-560, oz + 15);

    if (t4X1 <= t4X2 && t4Z1 <= t4Z2) {
      for (let x = t4X1; x <= t4X2; x++) {
        for (let z = t4Z1; z <= t4Z2; z++) {
          const dx = x - (-565);
          const dz = z - (-560);
          const dist = Math.hypot(dx, dz);

          if (dist <= 26 && dist >= 6) {
            // Downhill descent & banking
            const descentProgress = Math.max(0, Math.min(1, (z - (-585)) / 25)); // 0 at -585 (Y=30), 1 at -560 (Y=24)
            const baseDescY = Math.floor(30 - descentProgress * 6); // 30 down to 24
            const bankOffset = Math.floor(((dist - 6) / 20) * 2); // 0..2 banking
            const curY = baseDescY + bankOffset;

            // Solid foundation down to ground
            for (let y = 20; y < curY; y++) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE);
            }
            this.setVoxelInWorld(chunk, x, curY, z, ASPHALT);

            // Clear headroom
            for (let y = curY + 1; y <= curY + 5; y++) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
            }

            // Inner curb
            if (dist <= 8) {
              this.setVoxelInWorld(chunk, x, curY, z, getCurb(x, z));
            }
            // Outer curb & crash barrier
            if (dist >= 24) {
              this.setVoxelInWorld(chunk, x, curY, z, getCurb(x, z));
              this.setVoxelInWorld(chunk, x, curY + 1, z, BLOCKS.STONE);
              this.setVoxelInWorld(chunk, x, curY + 2, z, BLOCKS.IRON_ORE);
            }
          }
        }
      }
    }

    // =========================================================================
    // 11. WEST SECTION & HIGH-SPEED CHICANE (X: -577..-564, Z: -560..-435, W=14, Y=24)
    // =========================================================================
    const westX1 = Math.max(-577, ox);
    const westX2 = Math.min(-564, ox + 15);
    const westZ1 = Math.max(-560, oz);
    const westZ2 = Math.min(-435, oz + 15);

    if (westX1 <= westX2 && westZ1 <= westZ2) {
      for (let z = westZ1; z <= westZ2; z++) {
        for (let x = westX1; x <= westX2; x++) {
          this.setVoxelInWorld(chunk, x, trackY - 1, z, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, trackY, z, ASPHALT);
          for (let y = trackY + 1; y <= trackY + 5; y++) {
            this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
          }
        }
      }
    }

    // West curbs, crash barriers, and tire barriers in chicane
    if (westZ1 <= westZ2) {
      for (let z = westZ1; z <= westZ2; z++) {
        // Rumble curbs
        this.setVoxelInWorld(chunk, -578, trackY - 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -578, trackY, z, getCurb(-578, z));
        this.setVoxelInWorld(chunk, -563, trackY - 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -563, trackY, z, getCurb(-563, z));

        // Solid Crash Barriers along West straight
        this.setVoxelInWorld(chunk, -579, trackY + 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -579, trackY + 2, z, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, -562, trackY + 1, z, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, -562, trackY + 2, z, BLOCKS.IRON_ORE);

        // High-speed chicane safety tire barriers (Z: -505..-495)
        if (z >= -505 && z <= -495) {
          this.setVoxelInWorld(chunk, -580, trackY + 1, z, (z % 2 === 0) ? CURB_RED : CURB_WHITE);
          this.setVoxelInWorld(chunk, -580, trackY + 2, z, (z % 2 === 0) ? CURB_WHITE : CURB_RED);
          this.setVoxelInWorld(chunk, -561, trackY + 1, z, (z % 2 === 0) ? CURB_RED : CURB_WHITE);
          this.setVoxelInWorld(chunk, -561, trackY + 2, z, (z % 2 === 0) ? CURB_WHITE : CURB_RED);
        }
      }
    }

    // =========================================================================
    // 12. TURN 5 (Southwest Corner, X: -580..-555, Z: -440..-420)
    //     Connects West Straight back into South Main Straight (Y = 24)
    // =========================================================================
    const t5X1 = Math.max(-580, ox);
    const t5X2 = Math.min(-555, ox + 15);
    const t5Z1 = Math.max(-440, oz);
    const t5Z2 = Math.min(-420, oz + 15);

    if (t5X1 <= t5X2 && t5Z1 <= t5Z2) {
      for (let x = t5X1; x <= t5X2; x++) {
        for (let z = t5Z1; z <= t5Z2; z++) {
          const dx = x - (-560);
          const dz = z - (-420);
          const dist = Math.hypot(dx, dz);
          if (dist <= 24 && dist >= 7) {
            this.setVoxelInWorld(chunk, x, trackY - 1, z, BLOCKS.COBBLESTONE);
            this.setVoxelInWorld(chunk, x, trackY, z, ASPHALT);
            for (let y = trackY + 1; y <= trackY + 5; y++) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
            }
            // Inner curb
            if (dist <= 8) {
              this.setVoxelInWorld(chunk, x, trackY, z, getCurb(x, z));
            }
            // Outer curb & crash barrier
            if (dist >= 23) {
              this.setVoxelInWorld(chunk, x, trackY, z, getCurb(x, z));
              this.setVoxelInWorld(chunk, x, trackY + 1, z, BLOCKS.COBBLESTONE);
              this.setVoxelInWorld(chunk, x, trackY + 2, z, BLOCKS.IRON_ORE);
            }
          }
        }
      }
    }

    // =========================================================================
    // 13. SOLID PERIMETER FENCES & CORNER WATCHTOWERS (Full 250x250 boundaries)
    //     Ensuring vehicles and players never fall into void or clip through walls
    // =========================================================================
    const perimMin = -624;
    const perimMax = -376;

    // West boundary (X = -624) and East boundary (X = -376)
    for (const px of [perimMin, perimMax]) {
      if (px >= ox && px <= ox + 15) {
        const pz1 = Math.max(perimMin, oz);
        const pz2 = Math.min(perimMax, oz + 15);
        for (let z = pz1; z <= pz2; z++) {
          const ph = this.getHeightAt(px, z);
          this.setVoxelInWorld(chunk, px, ph + 1, z, BLOCKS.STONE);
          this.setVoxelInWorld(chunk, px, ph + 2, z, BLOCKS.STONE);
          this.setVoxelInWorld(chunk, px, ph + 3, z, BLOCKS.IRON_ORE); // Security fencing
        }
      }
    }

    // North boundary (Z = -624) and South boundary (Z = -376)
    for (const pz of [perimMin, perimMax]) {
      if (pz >= oz && pz <= oz + 15) {
        const px1 = Math.max(perimMin, ox);
        const px2 = Math.min(perimMax, ox + 15);
        for (let x = px1; x <= px2; x++) {
          const ph = this.getHeightAt(x, pz);
          this.setVoxelInWorld(chunk, x, ph + 1, pz, BLOCKS.STONE);
          this.setVoxelInWorld(chunk, x, ph + 2, pz, BLOCKS.STONE);
          this.setVoxelInWorld(chunk, x, ph + 3, pz, BLOCKS.IRON_ORE); // Security fencing
        }
      }
    }

    // 4 Corner Security Watchtowers with Golden Beacon Floodlights
    const corners = [
      [perimMin, perimMin],
      [perimMin, perimMax],
      [perimMax, perimMin],
      [perimMax, perimMax]
    ];
    for (const [cx, cz] of corners) {
      if (cx >= ox && cx <= ox + 15 && cz >= oz && cz <= oz + 15) {
        const cy = this.getHeightAt(cx, cz);
        for (let y = cy + 1; y <= cy + 6; y++) {
          this.setVoxelInWorld(chunk, cx, y, cz, BLOCKS.STONE);
        }
        this.setVoxelInWorld(chunk, cx, cy + 7, cz, BLOCKS.GOLD_ORE); // Floodlight beacon
      }
    }
  }

  /**
   * Helper to build a curved tropical coconut palm tree leaning toward the ocean
   */
  buildPalmTree(chunk, wx, baseY, wz) {
    // Curved palm trunk leaning south toward the ocean
    this.setVoxelInWorld(chunk, wx, baseY + 1, wz, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, wx, baseY + 2, wz, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, wx, baseY + 3, wz - 1, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, wx, baseY + 4, wz - 1, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, wx, baseY + 5, wz - 2, BLOCKS.OAK_LOG);
    this.setVoxelInWorld(chunk, wx, baseY + 6, wz - 2, BLOCKS.OAK_LOG);

    const cx = wx;
    const cy = baseY + 7;
    const cz = wz - 2;

    // Golden coconuts clustered beneath crown
    this.setVoxelInWorld(chunk, cx - 1, cy - 1, cz, BLOCKS.GOLD_ORE);
    this.setVoxelInWorld(chunk, cx + 1, cy - 1, cz, BLOCKS.GOLD_ORE);

    // Radiating palm fronds with drooping tips
    this.setVoxelInWorld(chunk, cx, cy, cz, BLOCKS.OAK_LEAVES);
    const frondDirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const [dx, dz] of frondDirs) {
      this.setVoxelInWorld(chunk, cx + dx, cy, cz + dz, BLOCKS.OAK_LEAVES);
      this.setVoxelInWorld(chunk, cx + dx * 2, cy, cz + dz * 2, BLOCKS.OAK_LEAVES);
      this.setVoxelInWorld(chunk, cx + dx * 3, cy - 1, cz + dz * 3, BLOCKS.OAK_LEAVES);
    }
  }

  /**
   * SECTOR 7: COLOSSAL MOUNT FUJI (MONTE FUJI) (+500, +500)
   * Majestic stratovolcano rising 2.5x higher than other mountains up to maximum world height Y=62.
   * Conical volcanic profile, snowy caldera summit (BLOCKS.SNOW), open basalt crater (BLOCKS.COBBLESTONE/STONE)
   * with molten volcanic vent, lakeside Shinto Torii gate, and reflection lakes with cherry blossom groves.
   */
  buildMountFujiSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < 410 || ox > 590 || oz + 16 < 410 || oz > 590) return;

    const fX = 500, fZ = 500;
    const baseY = 24;

    // --- 1. Reflection Lakes Cherry Blossom Groves & Scenic Shoreline ---
    const sakuraCoords = [
      [422, 485], [425, 473], [438, 467], [452, 472],
      [456, 486], [450, 499], [437, 503], [424, 497],
      [485, 422], [473, 425], [467, 438], [472, 452],
      [486, 456], [499, 450], [503, 437], [497, 424],
      [448, 456], [456, 448], [464, 464], [435, 452]
    ];
    for (const [sx, sz] of sakuraCoords) {
      const sY = this.getHeightAt(sx, sz);
      if (sY >= 24 && sY <= 28) {
        this.buildSakuraTree(chunk, sx, sz, sY);
      }
    }

    // --- 2. Lakeside Shinto Torii Gate & Viewing Deck at Lake Kawaguchi (444, 468) ---
    for (let x = 441; x <= 447; x++) {
      for (let z = 466; z <= 472; z++) {
        const isBorder = (x === 441 || x === 447 || z === 466 || z === 472);
        this.setVoxelInWorld(chunk, x, baseY, z, BLOCKS.WOOD_PLANK);
        if (isBorder && x !== 444) {
          this.setVoxelInWorld(chunk, x, baseY + 1, z, BLOCKS.IRON_ORE);
        }
      }
    }
    const tX = 444, tZ = 469;
    for (let y = baseY + 1; y <= baseY + 6; y++) {
      this.setVoxelInWorld(chunk, tX - 3, y, tZ, BLOCKS.BRICK);
      this.setVoxelInWorld(chunk, tX + 3, y, tZ, BLOCKS.BRICK);
    }
    for (let x = tX - 4; x <= tX + 4; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 5, tZ, BLOCKS.BRICK);
      this.setVoxelInWorld(chunk, x, baseY + 7, tZ, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, tX - 5, baseY + 8, tZ, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, tX + 5, baseY + 8, tZ, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, tX, baseY + 6, tZ, BLOCKS.GOLD_ORE);
    for (const lx of [tX - 4, tX + 4]) {
      this.setVoxelInWorld(chunk, lx, baseY + 1, tZ + 2, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, lx, baseY + 2, tZ + 2, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, lx, baseY + 3, tZ + 2, BLOCKS.STONE);
    }

    // --- 3. Open Basalt Caldera Crater Detailing (500, 500) ---
    for (let dx = -8; dx <= 8; dx++) {
      for (let dz = -8; dz <= 8; dz++) {
        const d = Math.hypot(dx, dz);
        if (d <= 8.5) {
          const wx = fX + dx;
          const wz = fZ + dz;
          const floorY = this.getHeightAt(wx, wz);
          for (let y = floorY + 1; y <= 63; y++) {
            this.setVoxelInWorld(chunk, wx, y, wz, BLOCKS.AIR);
          }
          if (d <= 2) {
            this.setVoxelInWorld(chunk, wx, floorY, wz, BLOCKS.GOLD_ORE);
            this.setVoxelInWorld(chunk, wx, floorY - 1, wz, BLOCKS.GOLD_ORE);
          } else if (d <= 5) {
            const isFumarole = ((dx + dz) % 3 === 0);
            this.setVoxelInWorld(chunk, wx, floorY, wz, isFumarole ? BLOCKS.IRON_ORE : BLOCKS.COBBLESTONE);
          } else {
            this.setVoxelInWorld(chunk, wx, floorY, wz, BLOCKS.STONE);
          }
        }
      }
    }
    for (let dx = -11; dx <= 11; dx++) {
      for (let dz = -11; dz <= 11; dz++) {
        const d = Math.hypot(dx, dz);
        if (d >= 8.5 && d <= 11.5) {
          const wx = fX + dx;
          const wz = fZ + dz;
          const rimY = this.getHeightAt(wx, wz);
          if (rimY >= 60) {
            this.setVoxelInWorld(chunk, wx, rimY, wz, BLOCKS.SNOW);
            this.setVoxelInWorld(chunk, wx, rimY - 1, wz, BLOCKS.SNOW);
          }
        }
      }
    }
  }

  /**
   * Natural underground caverns carved into mountain flanks
   * Featuring hollowed chambers, rich veins of iron and gold ore, stalactites/stalagmites, and glowing torches.
   */
  buildMountainCaverns(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;

    // --- 1. Mount Fuji Lava Grotto & Ore Cavern (Southern Flank: 500..540, 515..555, Y: 26..40) ---
    if (ox + 16 >= 500 && ox <= 540 && oz + 16 >= 515 && oz <= 555) {
      const cX = 518, cZ = 532, cY = 32;
      for (let dx = -9; dx <= 9; dx++) {
        for (let dz = -9; dz <= 9; dz++) {
          for (let dy = -6; dy <= 6; dy++) {
            const wx = cX + dx;
            const wz = cZ + dz;
            const wy = cY + dy;
            const distSq = (dx / 8.5) * (dx / 8.5) + (dz / 8.5) * (dz / 8.5) + (dy / 5.5) * (dy / 5.5);

            if (distSq <= 1.0) {
              this.setVoxelInWorld(chunk, wx, wy, wz, BLOCKS.AIR);
            } else if (distSq <= 1.25) {
              const oreNoise = (Math.sin(wx * 0.7 + wy * 1.1 + wz * 0.9) * 43758.5453) % 1;
              const isGoldVein = Math.abs(oreNoise) > 0.82;
              const isIronVein = Math.abs(oreNoise) > 0.65;
              const wallBlock = isGoldVein ? BLOCKS.GOLD_ORE : (isIronVein ? BLOCKS.IRON_ORE : (((wx + wy + wz) % 2 === 0) ? BLOCKS.COBBLESTONE : BLOCKS.STONE));
              this.setVoxelInWorld(chunk, wx, wy, wz, wallBlock);
            }
          }
        }
      }

      for (let dx = -7; dx <= 7; dx++) {
        for (let dz = -7; dz <= 7; dz++) {
          const d = Math.hypot(dx, dz);
          if (d <= 7) {
            const wx = cX + dx;
            const wz = cZ + dz;
            this.setVoxelInWorld(chunk, wx, 26, wz, (d <= 2.5) ? BLOCKS.COBBLESTONE : BLOCKS.STONE);
          }
        }
      }
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.hypot(dx, dz) <= 2.2) {
            this.setVoxelInWorld(chunk, cX + dx, 26, cZ + dz, BLOCKS.WATER);
          }
        }
      }

      const stalagmites = [
        [cX - 4, cZ - 3, 2], [cX + 5, cZ - 2, 3],
        [cX - 3, cZ + 5, 2], [cX + 4, cZ + 4, 3],
        [cX - 5, cZ + 2, 2], [cX + 2, cZ - 5, 2]
      ];
      for (const [sx, sz, h] of stalagmites) {
        for (let y = 27; y < 27 + h; y++) {
          this.setVoxelInWorld(chunk, sx, y, sz, BLOCKS.COBBLESTONE);
        }
      }

      const stalactites = [
        [cX - 3, cZ - 2, 2], [cX + 4, cZ - 3, 3],
        [cX - 2, cZ + 4, 3], [cX + 3, cZ + 3, 2],
        [cX, cZ - 4, 2],     [cX, cZ + 4, 2]
      ];
      for (const [tx, tz, h] of stalactites) {
        for (let y = 37 - h; y <= 37; y++) {
          this.setVoxelInWorld(chunk, tx, y, tz, BLOCKS.STONE);
        }
      }

      for (let y = 28; y <= 34; y++) {
        this.setVoxelInWorld(chunk, cX - 7, y, cZ, BLOCKS.GOLD_ORE);
        this.setVoxelInWorld(chunk, cX - 7, y, cZ + 1, BLOCKS.GOLD_ORE);
        this.setVoxelInWorld(chunk, cX + 7, y, cZ - 1, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, cX + 7, y, cZ, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, cX, y, cZ - 7, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, cX + 1, y, cZ - 7, BLOCKS.GOLD_ORE);
      }

      const torches = [
        [cX - 4, 27, cZ - 4], [cX + 4, 27, cZ - 4],
        [cX - 4, 27, cZ + 4], [cX + 4, 27, cZ + 4]
      ];
      for (const [tx, ty, tz] of torches) {
        this.setVoxelInWorld(chunk, tx, ty, tz, BLOCKS.OAK_LOG);
        this.setVoxelInWorld(chunk, tx, ty + 1, tz, BLOCKS.GOLD_ORE);
      }

      for (let z = 540; z <= 548; z++) {
        for (let x = 506; x <= 510; x++) {
          for (let y = 27; y <= 30; y++) {
            if (y === 27) {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.COBBLESTONE);
            } else {
              this.setVoxelInWorld(chunk, x, y, z, BLOCKS.AIR);
            }
          }
        }
      }
      for (let y = 28; y <= 31; y++) {
        this.setVoxelInWorld(chunk, 505, y, 548, BLOCKS.COBBLESTONE);
        this.setVoxelInWorld(chunk, 511, y, 548, BLOCKS.COBBLESTONE);
      }
      for (let x = 505; x <= 511; x++) {
        this.setVoxelInWorld(chunk, x, 32, 548, BLOCKS.STONE);
      }
      this.setVoxelInWorld(chunk, 505, 30, 548, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, 511, 30, 548, BLOCKS.GOLD_ORE);
    }

    // --- 2. Norway Granite Mountain Cliff Cavern (20..45, 490..525, Y: 24..38) ---
    if (ox + 16 >= 15 && ox <= 50 && oz + 16 >= 490 && oz <= 525) {
      const nX = 28, nZ = 505, nY = 30;
      for (let dx = -7; dx <= 7; dx++) {
        for (let dz = -7; dz <= 7; dz++) {
          for (let dy = -5; dy <= 5; dy++) {
            const wx = nX + dx;
            const wz = nZ + dz;
            const wy = nY + dy;
            const distSq = (dx / 7.5) * (dx / 7.5) + (dz / 7.5) * (dz / 7.5) + (dy / 5.0) * (dy / 5.0);

            if (distSq <= 1.0) {
              this.setVoxelInWorld(chunk, wx, wy, wz, BLOCKS.AIR);
            } else if (distSq <= 1.25) {
              const oreNoise = (Math.sin(wx * 1.3 + wy * 0.9 + wz * 1.1) * 43758.5453) % 1;
              const isGold = Math.abs(oreNoise) > 0.84;
              const isIron = Math.abs(oreNoise) > 0.68;
              this.setVoxelInWorld(chunk, wx, wy, wz, isGold ? BLOCKS.GOLD_ORE : (isIron ? BLOCKS.IRON_ORE : BLOCKS.STONE));
            }
          }
        }
      }
      for (let dx = -6; dx <= 6; dx++) {
        for (let dz = -6; dz <= 6; dz++) {
          if (Math.hypot(dx, dz) <= 6.5) {
            this.setVoxelInWorld(chunk, nX + dx, 25, nZ + dz, BLOCKS.COBBLESTONE);
          }
        }
      }
      for (let y = 26; y <= 32; y++) {
        this.setVoxelInWorld(chunk, nX + 6, y, nZ, BLOCKS.GOLD_ORE);
        this.setVoxelInWorld(chunk, nX + 6, y, nZ + 1, BLOCKS.GOLD_ORE);
        this.setVoxelInWorld(chunk, nX - 6, y, nZ, BLOCKS.IRON_ORE);
        this.setVoxelInWorld(chunk, nX - 6, y, nZ - 1, BLOCKS.IRON_ORE);
      }
      this.setVoxelInWorld(chunk, nX - 3, 26, nZ - 3, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, nX - 3, 27, nZ - 3, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, nX + 3, 26, nZ + 3, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, nX + 3, 27, nZ + 3, BLOCKS.GOLD_ORE);

      for (let x = 16; x <= 22; x++) {
        for (let z = 504; z <= 506; z++) {
          this.setVoxelInWorld(chunk, x, 25, z, BLOCKS.COBBLESTONE);
          this.setVoxelInWorld(chunk, x, 26, z, BLOCKS.AIR);
          this.setVoxelInWorld(chunk, x, 27, z, BLOCKS.AIR);
          this.setVoxelInWorld(chunk, x, 28, z, BLOCKS.AIR);
        }
      }
      this.setVoxelInWorld(chunk, 17, 28, 503, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, 17, 28, 507, BLOCKS.GOLD_ORE);
    }
  }

  /**
   * Updates chunks around player position
   */
  updateStreaming(playerX, playerZ) {
    const centerCX = Math.floor(playerX / CHUNK_WIDTH);
    const centerCZ = Math.floor(playerZ / CHUNK_DEPTH);
    const rad = this.renderDistance;

    // Load chunks within render distance
    for (let dx = -rad; dx <= rad; dx++) {
      for (let dz = -rad; dz <= rad; dz++) {
        if (dx * dx + dz * dz <= rad * rad) {
          const cx = centerCX + dx;
          const cz = centerCZ + dz;
          this.getOrCreateChunk(cx, cz);
        }
      }
    }

    // In Boost mode, keep a wider cache of preloaded chunks in memory so rapid movement never stutters
    const unloadPad = this.boostMode ? 4 : 2;
    const maxDistSq = (rad + unloadPad) * (rad + unloadPad);
    for (const [key, chunk] of this.chunks.entries()) {
      const distSq = (chunk.cx - centerCX) * (chunk.cx - centerCX) +
                     (chunk.cz - centerCZ) * (chunk.cz - centerCZ);
      if (distSq > maxDistSq) {
        chunk.dispose();
        this.chunks.delete(key);
      }
    }
  }

  /**
   * Process remesh queue (scales up to 6 chunks/frame in Boost mode)
   */
  updateRemesh() {
    let processed = 0;
    const budget = this.maxRemeshPerFrame || 2;
    while (this.remeshQueue.length > 0 && processed < budget) {
      const chunk = this.remeshQueue.shift();
      if (chunk && chunk.isDirty) {
        chunk.rebuildMesh(this.materials);
        processed++;
      }
    }
  }
}
