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
   * Deterministic height function using multi-octave simplex noise
   */
  getHeightAt(wx, wz) {
    // Large continental features
    const continent = noise.fbm((wx + this.seed) / 140, (wz + this.seed) / 140, 4, 0.45);
    // Rolling hills and valleys
    const hills = noise.fbm((wx - this.seed) / 45, (wz - this.seed) / 45, 4, 0.5);
    // Mountain ridges
    const ridge = Math.abs(noise.noise2D((wx + 500) / 70, (wz + 500) / 70));

    let h = 20 + continent * 14 + hills * 10;
    if (continent > 0.3) {
      h += Math.pow(ridge, 2) * 18;
    }

    return Math.floor(Math.max(4, Math.min(CHUNK_HEIGHT - 8, h)));
  }

  /**
   * Generates procedural terrain, strata, water, ores, and trees
   */
  generateChunkTerrain(chunk) {
    const ox = chunk.originX;
    const oz = chunk.originZ;

    for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
      for (let lz = 0; lz < CHUNK_DEPTH; lz++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const surfaceY = this.getHeightAt(wx, wz);

        // Bedrock & Stone base
        for (let y = 0; y <= surfaceY; y++) {
          let block = BLOCKS.STONE;

          // Stratification
          if (y === surfaceY) {
            if (surfaceY >= 42) {
              block = BLOCKS.SNOW;
            } else if (surfaceY <= WATER_LEVEL + 1) {
              block = BLOCKS.SAND;
            } else {
              block = BLOCKS.GRASS;
            }
          } else if (y >= surfaceY - 3) {
            if (surfaceY >= 42) {
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

        // Fill water bodies
        if (surfaceY < WATER_LEVEL) {
          for (let y = surfaceY + 1; y <= WATER_LEVEL; y++) {
            chunk.voxels[chunk.getIndex(lx, y, lz)] = BLOCKS.WATER;
          }
        }
      }
    }

    // Procedural Tree Generation on grass
    for (let lx = 2; lx < CHUNK_WIDTH - 2; lx++) {
      for (let lz = 2; lz < CHUNK_DEPTH - 2; lz++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const surfaceY = this.getHeightAt(wx, wz);

        if (surfaceY > WATER_LEVEL + 2 && surfaceY < 38) {
          // Tree density hash (positive in all quadrants)
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
   * Builds an oak tree with trunk and leafy crown
   */
  buildTreeInChunk(chunk, lx, baseY, lz) {
    const trunkHeight = 4 + Math.floor(Math.abs(Math.sin(lx * 3 + lz * 7)) * 2);

    // Trunk
    for (let y = 0; y < trunkHeight; y++) {
      if (baseY + y < CHUNK_HEIGHT) {
        chunk.setBlockLocal(lx, baseY + y, lz, BLOCKS.OAK_LOG);
      }
    }

    // Foliage canopy
    const leafBase = baseY + trunkHeight - 2;
    for (let dy = 0; dy <= 3; dy++) {
      const radius = (dy >= 2) ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && dy > 1) continue;
          const targetX = lx + dx;
          const targetY = leafBase + dy;
          const targetZ = lz + dz;

          if (targetX >= 0 && targetX < CHUNK_WIDTH &&
              targetZ >= 0 && targetZ < CHUNK_DEPTH &&
              targetY < CHUNK_HEIGHT) {
            const cur = chunk.getBlock(targetX, targetY, targetZ);
            if (cur === BLOCKS.AIR) {
              chunk.setBlockLocal(targetX, targetY, targetZ, BLOCKS.OAK_LEAVES);
            }
          }
        }
      }
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
