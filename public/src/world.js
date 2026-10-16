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
    this.blockDeltas = new Map(); // Local record of server deltas "x,y,z" -> blockType
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

  applyBlockDelta(x, y, z, blockType) {
    const key = `${x},${y},${z}`;
    this.blockDeltas.set(key, blockType);
    this.setBlock(x, y, z, blockType, true);
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
   * Returns true if coordinates lie inside any of the 6 monument sectors
   */
  isInsideMonument(wx, wz) {
    if (Math.hypot(wx, wz) <= 24) return true; // Spawn Plaza
    if (Math.hypot(wx - 250, wz - 250) <= 45) return true; // Japan Imperial
    if (Math.hypot(wx + 250, wz - 250) <= 45) return true; // China & Shanghai
    if (Math.hypot(wx - 250, wz + 250) <= 45) return true; // Paris & Eiffel Tower
    if (Math.hypot(wx + 250, wz + 250) <= 45) return true; // New York
    if (wz >= 440 && wz <= 560 && Math.abs(wx) <= 55) return true; // Norway Fjords
    return false;
  }

  /**
   * Returns true if coordinates lie within the flat urban building plateaus
   */
  isInsidePlateau(wx, wz) {
    if (Math.hypot(wx, wz) <= 20) return true;
    if (Math.hypot(wx - 250, wz - 250) <= 35) return true;
    if (Math.hypot(wx + 250, wz - 250) <= 35) return true;
    if (Math.hypot(wx - 250, wz + 250) <= 35) return true;
    if (Math.hypot(wx + 250, wz + 250) <= 35) return true;
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
   * Deterministic height function with central spawn clearing and leveled monument plateaus
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

    const BASE_HEIGHT = 24;

    // 2. Central Spawn Plaza clearing (0, 0)
    const distSpawn = Math.hypot(wx, wz);
    if (distSpawn <= 24) {
      return BASE_HEIGHT;
    } else if (distSpawn < 36) {
      const naturalH = this.getNaturalHeightAt(wx, wz);
      const t = (distSpawn - 24) / 12;
      const smoothT = t * t * (3 - 2 * t);
      return Math.floor(BASE_HEIGHT * (1 - smoothT) + naturalH * smoothT);
    }

    // 3. Four Monument Building Plateaus at (+250, +250), (-250, +250), (+250, -250), (-250, -250)
    const centers = [
      [250, 250],   // Japan Imperial
      [-250, 250],  // China & Shanghai
      [250, -250],  // Paris & Eiffel Tower
      [-250, -250]  // New York
    ];
    for (let i = 0; i < 4; i++) {
      const [cx, cz] = centers[i];
      if (Math.abs(wx - cx) <= 55 && Math.abs(wz - cz) <= 55) {
        const d = Math.hypot(wx - cx, wz - cz);
        if (d <= 40) {
          return BASE_HEIGHT;
        } else if (d < 55) {
          const naturalH = this.getNaturalHeightAt(wx, wz);
          const t = (d - 40) / 15;
          const smoothT = t * t * (3 - 2 * t);
          return Math.floor(BASE_HEIGHT * (1 - smoothT) + naturalH * smoothT);
        }
      }
    }

    return this.getNaturalHeightAt(wx, wz);
  }

  /**
   * Generates procedural terrain, strata, water, ores, trees, plaza, and 5 monumental sectors
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
            } else if (Math.hypot(wx - 250, wz - 250) <= 35) {
              // Japan Imperial Sector
              block = ((wx + wz) % 5 === 0) ? BLOCKS.GRAVEL : BLOCKS.GRASS;
            } else if (Math.hypot(wx + 250, wz - 250) <= 35) {
              // China & Shanghai Sector: Lush green gardens with Imperial stone/brick avenues
              const isAvenue = (Math.abs(wx + 250) <= 2 || Math.abs(wz - 250) <= 2 || Math.abs(wx + 242) <= 1);
              block = isAvenue ? (((wx + wz) % 2 === 0) ? BLOCKS.STONE : BLOCKS.BRICK) : BLOCKS.GRASS;
            } else if (Math.hypot(wx - 250, wz + 250) <= 35) {
              // Paris & Eiffel Tower Sector
              block = (Math.abs(wz - -240) <= 2) ? BLOCKS.GRAVEL : BLOCKS.GRASS;
            } else if (Math.hypot(wx + 250, wz + 250) <= 35) {
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

        // Fill wild water bodies strictly outside monument plateau
        if (surfaceY < WATER_LEVEL && !this.isInsideMonument(wx, wz)) {
          for (let y = surfaceY + 1; y <= WATER_LEVEL; y++) {
            chunk.voxels[chunk.getIndex(lx, y, lz)] = BLOCKS.WATER;
          }
        }
      }
    }

    // 1. Central Spawn Plaza & Guardian Statues
    this.buildPlazaFeatures(chunk);

    // 2. The 5 Monument Sectors (Japan, Shanghai, Paris, NYC, Norway Fjords)
    this.buildJapanSector(chunk);
    this.buildShanghaiSector(chunk);
    this.buildParisSector(chunk);
    this.buildNYCSector(chunk);
    this.buildNorwaySector(chunk);

    // 3. Procedural Oak Trees in wild outer areas
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
    // Bounding check for Sector 1
    if (ox + 16 < 210 || ox > 290 || oz + 16 < 210 || oz > 290) return;

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
  }

  /**
   * Helper to build a lush Sakura Cherry Blossom Tree with white and pink blossom crown
   */
  buildSakuraTree(chunk, wx, wz) {
    const baseY = 24;
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
    if (ox + 16 < -290 || ox > -210 || oz + 16 < 210 || oz > 290) return;

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
  }

  /**
   * SECTOR 3: PARÍS & TORRE EIFFEL A ESCALA (+250, -250)
   * 4 arched corner legs, 1st & 2nd observation decks, lattice spire, Champs-Élysées garden promenade
   */
  buildParisSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < 210 || ox > 290 || oz + 16 < -290 || oz > -210) return;

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
  }

  /**
   * SECTOR 4: NUEVA YORK (-250, -250)
   * Art Deco Empire State stepped skyscraper, setbacks, mooring mast, Manhattan street grid
   */
  buildNYCSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < -290 || ox > -210 || oz + 16 < -290 || oz > -210) return;

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
  }

  /**
   * SECTOR 5: NORWAY FJORDS & NATURE (0, +500) (Z = 440..560)
   * Colossal granite cliffs, deep water gorges, roaring waterfalls, Nordic spruce taiga, and viking timber cabins
   */
  buildNorwaySector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < -55 || ox > 55 || oz + 16 < 440 || oz > 560) return;

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

    // Unload chunks beyond (renderDistance + 2) to preserve memory
    const maxDistSq = (rad + 2) * (rad + 2);
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
   * Process remesh queue (max 2 chunks per frame to guarantee 60 FPS)
   */
  updateRemesh() {
    let processed = 0;
    while (this.remeshQueue.length > 0 && processed < 2) {
      const chunk = this.remeshQueue.shift();
      if (chunk && chunk.isDirty) {
        chunk.rebuildMesh(this.materials);
        processed++;
      }
    }
  }
}
