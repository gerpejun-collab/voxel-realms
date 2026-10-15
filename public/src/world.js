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
   * Deterministic height function with central spawn clearing and leveled monument plateau
   */
  getHeightAt(wx, wz) {
    // Large continental features
    const continent = noise.fbm((wx + this.seed) / 140, (wz + this.seed) / 140, 4, 0.45);
    // Rolling hills and valleys
    const hills = noise.fbm((wx - this.seed) / 45, (wz - this.seed) / 45, 4, 0.5);
    // Mountain ridges
    const ridge = Math.abs(noise.noise2D((wx + 500) / 70, (wz + 500) / 70));

    let naturalH = 22 + continent * 14 + hills * 10;
    if (continent > 0.3) {
      naturalH += Math.pow(ridge, 2) * 18;
    }

    // Central spawn clearing & Monument Sectors Plateau
    const distCenter = Math.hypot(wx, wz);
    const MONUMENT_RADIUS = 50;
    const BLEND_RADIUS = 68;
    const BASE_HEIGHT = 24;

    let h = naturalH;
    if (distCenter <= MONUMENT_RADIUS) {
      h = BASE_HEIGHT;
    } else if (distCenter < BLEND_RADIUS) {
      const t = (distCenter - MONUMENT_RADIUS) / (BLEND_RADIUS - MONUMENT_RADIUS);
      const smoothT = t * t * (3 - 2 * t);
      h = BASE_HEIGHT * (1 - smoothT) + naturalH * smoothT;
    }

    // Norway Fjords: Colossal granite cliffs & deep ocean water gorge at (0, 180)
    if (wz >= 140 && wz <= 220 && Math.abs(wx) <= 45) {
      const distFromFjord = Math.abs(wx);
      if (distFromFjord <= 7) {
        h = 13; // Deep canyon bed below water level 18
      } else if (distFromFjord <= 15) {
        const t = (distFromFjord - 7) / 8;
        h = Math.floor(13 + t * (50 - 13));
      } else {
        const ridgeH = 50 + Math.floor(Math.abs(Math.sin(wx * 0.3 + wz * 0.15)) * 6);
        h = Math.min(CHUNK_HEIGHT - 6, ridgeH);
      }
    }

    return Math.floor(Math.max(4, Math.min(CHUNK_HEIGHT - 8, h)));
  }

  /**
   * Generates procedural terrain, strata, water, ores, trees, plaza, and 4 monumental sectors
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
            if (distCenter <= 15) {
              // Central Spawn Plaza
              if (distCenter <= 3) {
                block = BLOCKS.BRICK;
              } else if (Math.abs(wx) <= 1 || Math.abs(wz) <= 1) {
                block = BLOCKS.COBBLESTONE;
              } else if (distCenter <= 10 && (wx + wz) % 2 === 0) {
                block = BLOCKS.WOOD_PLANK;
              } else {
                block = BLOCKS.GRASS;
              }
            } else if (distCenter <= 50) {
              // Monument Sectors & Grand Cardinal Boulevards
              const isMainAvenue = (Math.abs(wx) <= 2 || Math.abs(wz) <= 2);
              const isDiagAvenue = (Math.abs(wx - wz) <= 1 || Math.abs(wx + wz) <= 1);

              if (isMainAvenue || isDiagAvenue) {
                block = BLOCKS.COBBLESTONE; // Paved boulevard linking all 4 countries
              } else if (wx > 15 && wz > 15) {
                // Sector 1: Japón - Zen gardens and gravel walkways
                block = ((wx + wz) % 6 === 0) ? BLOCKS.GRAVEL : BLOCKS.GRASS;
              } else if (wx < -15 && wz > 15) {
                // Sector 2: China & Shanghai - Modern paved plazas
                block = ((wx * wz) % 3 === 0) ? BLOCKS.STONE : BLOCKS.COBBLESTONE;
              } else if (wx > 15 && wz < -15) {
                // Sector 3: París - Champs-Élysées gravel and lawns
                block = (Math.abs(wz - -20) <= 2) ? BLOCKS.GRAVEL : BLOCKS.GRASS;
              } else if (wx < -15 && wz < -15) {
                // Sector 4: Nueva York - Manhattan asphalt grid & sidewalks
                const isStreet = (wz % 8 === 0 || wx % 8 === 0);
                block = isStreet ? BLOCKS.DIRT_DRY : BLOCKS.STONE;
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
            if (distCenter <= 50) {
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
        if (surfaceY < WATER_LEVEL && distCenter > 52) {
          for (let y = surfaceY + 1; y <= WATER_LEVEL; y++) {
            chunk.voxels[chunk.getIndex(lx, y, lz)] = BLOCKS.WATER;
          }
        }
      }
    }

    // 1. Central Spawn Plaza & Guardian Statues
    if (chunk.cx === 0 && chunk.cz === 0) {
      this.buildPlazaFeatures(chunk);
    }

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
        const distCenter = Math.hypot(wx, wz);
        const surfaceY = this.getHeightAt(wx, wz);

        if (distCenter > 54 && surfaceY > WATER_LEVEL + 2 && surfaceY < 38) {
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
   * SECTOR 1: JAPÓN (+X, +Z)
   * Multi-tier wooden pagoda, crimson Torii gates, Sakura cherry blossom trees, zen pond & bridge
   */
  buildJapanSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    // Bounding check for Sector 1
    if (ox + 16 < 16 || ox > 48 || oz + 16 < 16 || oz > 48) return;

    const baseY = 24;
    const cX = 30; // Pagoda center
    const cZ = 30;

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
    // Torii Gate 1 at (22, 22)
    for (let y = baseY + 1; y <= baseY + 4; y++) {
      this.setVoxelInWorld(chunk, 22, y, 20, BLOCKS.BRICK); // Left post
      this.setVoxelInWorld(chunk, 22, y, 24, BLOCKS.BRICK); // Right post
    }
    // Nageshi beam
    for (let z = 20; z <= 24; z++) {
      this.setVoxelInWorld(chunk, 22, baseY + 3, z, BLOCKS.BRICK);
    }
    // Kasagi curved top lintel
    for (let z = 19; z <= 25; z++) {
      this.setVoxelInWorld(chunk, 22, baseY + 4, z, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, 22, baseY + 5, 19, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, 22, baseY + 5, 25, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, 22, baseY + 4, 22, BLOCKS.GOLD_ORE);

    // Torii Gate 2 at (30, 21)
    for (let y = baseY + 1; y <= baseY + 4; y++) {
      this.setVoxelInWorld(chunk, 28, y, 21, BLOCKS.BRICK);
      this.setVoxelInWorld(chunk, 32, y, 21, BLOCKS.BRICK);
    }
    for (let x = 28; x <= 32; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 3, 21, BLOCKS.BRICK);
    }
    for (let x = 27; x <= 33; x++) {
      this.setVoxelInWorld(chunk, x, baseY + 4, 21, BLOCKS.BRICK);
    }
    this.setVoxelInWorld(chunk, 27, baseY + 5, 21, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, 33, baseY + 5, 21, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, 30, baseY + 4, 21, BLOCKS.GOLD_ORE);

    // --- 3. Sakura Cherry Blossom Trees ---
    this.buildSakuraTree(chunk, 23, 37);
    this.buildSakuraTree(chunk, 38, 23);
    this.buildSakuraTree(chunk, 38, 37);
    this.buildSakuraTree(chunk, 23, 27);

    // --- 4. Zen Pond & Arched Wooden Bridge ---
    for (let x = 18; x <= 24; x++) {
      for (let z = 29; z <= 35; z++) {
        const isBorder = (x === 18 || x === 24 || z === 29 || z === 35);
        if (isBorder) {
          this.setVoxelInWorld(chunk, x, baseY, z, BLOCKS.COBBLESTONE);
        } else {
          this.setVoxelInWorld(chunk, x, baseY, z, BLOCKS.WATER);
        }
      }
    }
    // Arched Bridge crossing at z = 32
    this.setVoxelInWorld(chunk, 18, baseY + 1, 32, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 19, baseY + 2, 32, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 20, baseY + 2, 32, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 21, baseY + 2, 32, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 22, baseY + 2, 32, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 23, baseY + 2, 32, BLOCKS.WOOD_PLANK);
    this.setVoxelInWorld(chunk, 24, baseY + 1, 32, BLOCKS.WOOD_PLANK);

    // --- 5. Stone Lanterns (Tōrō) ---
    const lanterns = [[20, 28], [26, 22], [35, 22], [35, 34]];
    for (const [lx, lz] of lanterns) {
      this.setVoxelInWorld(chunk, lx, baseY + 1, lz, BLOCKS.COBBLESTONE);
      this.setVoxelInWorld(chunk, lx, baseY + 2, lz, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, lx, baseY + 3, lz, BLOCKS.STONE);
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
   * SECTOR 2: CHINA & SHANGHAI (-X, +Z)
   * Modern mega-skyscrapers (37 blocks tall, up to Y = 62), glass curtain facades, central spire, boulevards
   */
  buildShanghaiSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < -48 || ox > -16 || oz + 16 < 16 || oz > 48) return;

    const baseY = 24;
    const sX = -30; // Shanghai Tower center
    const sZ = 30;

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

    // --- 2. Shanghai Financial High-Rise 2 at (-20, 34) (Jin Mao style) ---
    const jX = -20, jZ = 34;
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
    const lamps = [[-24, 24], [-32, 24], [-24, 38], [-38, 32]];
    for (const [lx, lz] of lamps) {
      for (let y = baseY + 1; y <= baseY + 3; y++) {
        this.setVoxelInWorld(chunk, lx, y, lz, BLOCKS.IRON_ORE);
      }
      this.setVoxelInWorld(chunk, lx - 1, baseY + 4, lz, BLOCKS.GOLD_ORE);
      this.setVoxelInWorld(chunk, lx + 1, baseY + 4, lz, BLOCKS.GOLD_ORE);
    }
  }

  /**
   * SECTOR 3: PARÍS & TORRE EIFFEL A ESCALA (+X, -Z)
   * 4 arched corner legs, 1st & 2nd observation decks, lattice spire, Champs-Élysées garden promenade
   */
  buildParisSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < 16 || ox > 48 || oz + 16 < -48 || oz > -16) return;

    const baseY = 24;
    const eX = 30; // Eiffel Tower center
    const eZ = -30;

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

    // Under-arch connecting the 4 legs (Grandes Arches) at Y = 30..31
    for (let d = -3; d <= 3; d++) {
      this.setVoxelInWorld(chunk, eX + d, baseY + 6, eZ - 3, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, eX + d, baseY + 6, eZ + 3, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, eX - 3, baseY + 6, eZ + d, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, eX + 3, baseY + 6, eZ + d, BLOCKS.IRON_ORE);
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
    // Wide promenade at eZ + 10 (z = -20)
    for (let x = eX - 12; x <= eX + 12; x++) {
      for (let z = -22; z <= -18; z++) {
        this.setVoxelInWorld(chunk, x, baseY, z, (z === -22 || z === -18) ? BLOCKS.COBBLESTONE : BLOCKS.GRAVEL);
      }
    }
    // Symmetrical manicured trees
    const treePoints = [[20, -20], [25, -20], [35, -20], [40, -20]];
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
    for (let x = 28; x <= 32; x++) {
      for (let z = -21; z <= -19; z++) {
        this.setVoxelInWorld(chunk, x, baseY, z, BLOCKS.WATER);
      }
    }
  }

  /**
   * SECTOR 4: NUEVA YORK (-X, -Z)
   * Art Deco Empire State stepped skyscraper, setbacks, mooring mast, Manhattan street grid
   */
  buildNYCSector(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;
    if (ox + 16 < -48 || ox > -16 || oz + 16 < -48 || oz > -16) return;

    const baseY = 24;
    const nX = -30; // Empire State center
    const nZ = -30;

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

    // --- 2. Manhattan Second High-Rise at (-20, -32) ---
    const ny2X = -20, ny2Z = -32;
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
    // Street at nZ + 6 (z = -24)
    for (let x = -40; x <= -18; x++) {
      this.setVoxelInWorld(chunk, x, baseY, -24, BLOCKS.DIRT_DRY);
      this.setVoxelInWorld(chunk, x, baseY, -23, BLOCKS.STONE); // Sidewalk
      this.setVoxelInWorld(chunk, x, baseY, -25, BLOCKS.STONE); // Sidewalk
    }
    // Fire hydrants at street corners
    this.setVoxelInWorld(chunk, -24, baseY + 1, -23, BLOCKS.BRICK);
    this.setVoxelInWorld(chunk, -36, baseY + 1, -23, BLOCKS.BRICK);
    // Golden street lamps
    const nyLamps = [[-24, -25], [-36, -25]];
    for (const [lx, lz] of nyLamps) {
      this.setVoxelInWorld(chunk, lx, baseY + 1, lz, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx, baseY + 2, lz, BLOCKS.IRON_ORE);
      this.setVoxelInWorld(chunk, lx, baseY + 3, lz, BLOCKS.GOLD_ORE);
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
