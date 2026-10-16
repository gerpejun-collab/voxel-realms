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
   * Returns true if coordinates lie inside any of the monumental sectors (including Playa Paraíso)
   */
  isInsideMonument(wx, wz) {
    if (Math.hypot(wx, wz) <= 28) return true; // Spawn Plaza
    if (Math.hypot(wx - 250, wz - 250) <= 65) return true; // Japan Imperial District
    if (Math.hypot(wx + 250, wz - 250) <= 65) return true; // China & Shanghai District
    if (Math.hypot(wx - 250, wz + 250) <= 65) return true; // Paris & Eiffel District
    if (Math.hypot(wx + 250, wz + 250) <= 65) return true; // New York District
    if (wz >= 440 && wz <= 560 && Math.abs(wx) <= 55) return true; // Norway Fjords
    if (wz >= -560 && wz <= -440 && Math.abs(wx) <= 75) return true; // Playa Paraíso Beach Sector
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

        // Fill ocean water in Playa Paraíso and wild water bodies outside dry plateaus
        const isBeachOcean = (wz >= -560 && wz <= -488 && Math.abs(wx) <= 75);
        if (surfaceY < WATER_LEVEL && (isBeachOcean || !this.isInsideMonument(wx, wz))) {
          for (let y = surfaceY + 1; y <= WATER_LEVEL; y++) {
            chunk.voxels[chunk.getIndex(lx, y, lz)] = BLOCKS.WATER;
          }
        }
      }
    }

    // 1. Interconnected Highways, Bridges & Minecraft Mountain Tunnels
    this.buildRoadAndTunnelNetwork(chunk);

    // 2. Central Spawn Plaza & Guardian Statues
    this.buildPlazaFeatures(chunk);

    // 3. The 6 Monument Sectors (Japan, Shanghai, Paris, NYC, Norway Fjords, Playa Paraíso)
    this.buildJapanSector(chunk);
    this.buildShanghaiSector(chunk);
    this.buildParisSector(chunk);
    this.buildNYCSector(chunk);
    this.buildNorwaySector(chunk);
    this.buildBeachSector(chunk);

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
          // Ensure rocky mountain overburden above the tunnel roof (Y = 30..36)
          const roofTop = Math.max(naturalH, roadY + 11);
          for (let y = roadY + 6; y <= roofTop; y++) {
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
            // Outer tunnel wall (at distance 4 from tunnel center)
            for (let y = roadY; y <= roadY + 6; y++) {
              chunk.setBlockLocal(lx, y, lz, isRib ? BLOCKS.OAK_LOG : BLOCKS.COBBLESTONE);
            }
          } else {
            // Inside tunnel bore: arched ceiling at Y = roadY + 5 (29)
            const isCenter = (wx === 0 || wz === 0 || wx === 229 || wx === -229);
            if (isCenter && isRib) {
              // Glowing Minecraft tunnel ceiling lantern
              chunk.setBlockLocal(lx, roadY + 5, lz, BLOCKS.GOLD_ORE);
            } else if (isRib) {
              // Timber mineshaft support crossbeam
              chunk.setBlockLocal(lx, roadY + 5, lz, BLOCKS.WOOD_PLANK);
            } else {
              chunk.setBlockLocal(lx, roadY + 5, lz, BLOCKS.COBBLESTONE);
            }
            // Clear any stray mountain blocks above roadY..roadY+4 inside tunnel
            for (let y = roadY + 1; y <= roadY + 4; y++) {
              chunk.setBlockLocal(lx, y, lz, BLOCKS.AIR);
            }
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
