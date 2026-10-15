// public/src/chunks.js
// Chunk voxel storage, face culling, vertex ambient occlusion and buffer meshing
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export const CHUNK_WIDTH = 16;
export const CHUNK_HEIGHT = 64;
export const CHUNK_DEPTH = 16;

// Direction vectors for 6 faces: [dx, dy, dz, normalX, normalY, normalZ]
// Face order: 0: Y+ (top), 1: Y- (bottom), 2: X- (west), 3: X+ (east), 4: Z+ (north), 5: Z- (south)
const FACES = [
  { dir: [0, 1, 0],  norm: [0, 1, 0],  name: 'top' },
  { dir: [0, -1, 0], norm: [0, -1, 0], name: 'bottom' },
  { dir: [-1, 0, 0], norm: [-1, 0, 0], name: 'west' },
  { dir: [1, 0, 0],  norm: [1, 0, 0],  name: 'east' },
  { dir: [0, 0, 1],  norm: [0, 0, 1],  name: 'north' },
  { dir: [0, 0, -1], norm: [0, 0, -1], name: 'south' }
];

// Vertex positions for 6 faces of a 1x1x1 unit cube
const FACE_VERTICES = [
  // 0: Y+ (top)
  [
    [0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]
  ],
  // 1: Y- (bottom)
  [
    [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]
  ],
  // 2: X- (west)
  [
    [0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]
  ],
  // 3: X+ (east)
  [
    [1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]
  ],
  // 4: Z+ (north)
  [
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
  ],
  // 5: Z- (south)
  [
    [1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]
  ]
];

// Ambient Occlusion brightness factor lookup: [ao=0 (darkest), ao=1, ao=2, ao=3 (brightest)]
const AO_FACTORS = [0.5, 0.68, 0.84, 1.0];

export class Chunk {
  constructor(cx, cz, world) {
    this.cx = cx;
    this.cz = cz;
    this.world = world;
    this.originX = cx * CHUNK_WIDTH;
    this.originZ = cz * CHUNK_DEPTH;

    this.voxels = new Uint8Array(CHUNK_WIDTH * CHUNK_HEIGHT * CHUNK_DEPTH);
    this.solidMesh = null;
    this.transparentMesh = null;
    this.waterMesh = null;
    this.isDirty = true;
    this.isGenerated = false;
  }

  getIndex(lx, ly, lz) {
    return (lx * CHUNK_DEPTH + lz) * CHUNK_HEIGHT + ly;
  }

  getBlock(lx, ly, lz) {
    if (lx < 0 || lx >= CHUNK_WIDTH || lz < 0 || lz >= CHUNK_DEPTH || ly < 0 || ly >= CHUNK_HEIGHT) {
      // Query world if outside this chunk's boundaries
      return this.world.getBlock(this.originX + lx, ly, this.originZ + lz);
    }
    return this.voxels[this.getIndex(lx, ly, lz)];
  }

  setBlockLocal(lx, ly, lz, blockType) {
    if (lx < 0 || lx >= CHUNK_WIDTH || lz < 0 || lz >= CHUNK_DEPTH || ly < 0 || ly >= CHUNK_HEIGHT) {
      return false;
    }
    const idx = this.getIndex(lx, ly, lz);
    this.voxels[idx] = blockType;
    this.isDirty = true;
    return true;
  }

  /**
   * Computes vertex ambient occlusion for a corner on a face
   */
  calculateAO(side1, side2, corner) {
    const s1 = side1 ? 1 : 0;
    const s2 = side2 ? 1 : 0;
    const c  = corner ? 1 : 0;
    if (s1 && s2) {
      return 0; // complete occlusion
    }
    return 3 - (s1 + s2 + c);
  }

  /**
   * Get AO value for a specific vertex of a quad
   */
  getVertexAO(lx, ly, lz, faceIdx, vertIdx) {
    // Determine neighbor blocks for corner occlusion
    const isSolid = (dx, dy, dz) => {
      const b = this.getBlock(lx + dx, ly + dy, lz + dz);
      return b !== BLOCKS.AIR && b !== BLOCKS.WATER && BLOCK_DEFS[b]?.solid;
    };

    let s1 = false, s2 = false, c = false;

    // Top face (Y+)
    if (faceIdx === 0) {
      if (vertIdx === 0) { s1 = isSolid(-1, 1, 0); s2 = isSolid(0, 1, 1);  c = isSolid(-1, 1, 1); }
      if (vertIdx === 1) { s1 = isSolid(1, 1, 0);  s2 = isSolid(0, 1, 1);  c = isSolid(1, 1, 1); }
      if (vertIdx === 2) { s1 = isSolid(1, 1, 0);  s2 = isSolid(0, 1, -1); c = isSolid(1, 1, -1); }
      if (vertIdx === 3) { s1 = isSolid(-1, 1, 0); s2 = isSolid(0, 1, -1); c = isSolid(-1, 1, -1); }
    }
    // Bottom face (Y-)
    else if (faceIdx === 1) {
      if (vertIdx === 0) { s1 = isSolid(-1, -1, 0); s2 = isSolid(0, -1, -1); c = isSolid(-1, -1, -1); }
      if (vertIdx === 1) { s1 = isSolid(1, -1, 0);  s2 = isSolid(0, -1, -1); c = isSolid(1, -1, -1); }
      if (vertIdx === 2) { s1 = isSolid(1, -1, 0);  s2 = isSolid(0, -1, 1);  c = isSolid(1, -1, 1); }
      if (vertIdx === 3) { s1 = isSolid(-1, -1, 0); s2 = isSolid(0, -1, 1);  c = isSolid(-1, -1, 1); }
    }
    // West face (X-)
    else if (faceIdx === 2) {
      if (vertIdx === 0) { s1 = isSolid(-1, -1, 0); s2 = isSolid(-1, 0, -1); c = isSolid(-1, -1, -1); }
      if (vertIdx === 1) { s1 = isSolid(-1, -1, 0); s2 = isSolid(-1, 0, 1);  c = isSolid(-1, -1, 1); }
      if (vertIdx === 2) { s1 = isSolid(-1, 1, 0);  s2 = isSolid(-1, 0, 1);  c = isSolid(-1, 1, 1); }
      if (vertIdx === 3) { s1 = isSolid(-1, 1, 0);  s2 = isSolid(-1, 0, -1); c = isSolid(-1, 1, -1); }
    }
    // East face (X+)
    else if (faceIdx === 3) {
      if (vertIdx === 0) { s1 = isSolid(1, -1, 0); s2 = isSolid(1, 0, 1);  c = isSolid(1, -1, 1); }
      if (vertIdx === 1) { s1 = isSolid(1, -1, 0); s2 = isSolid(1, 0, -1); c = isSolid(1, -1, -1); }
      if (vertIdx === 2) { s1 = isSolid(1, 1, 0);  s2 = isSolid(1, 0, -1); c = isSolid(1, 1, -1); }
      if (vertIdx === 3) { s1 = isSolid(1, 1, 0);  s2 = isSolid(1, 0, 1);  c = isSolid(1, 1, 1); }
    }
    // North face (Z+)
    else if (faceIdx === 4) {
      if (vertIdx === 0) { s1 = isSolid(-1, 0, 1); s2 = isSolid(0, -1, 1); c = isSolid(-1, -1, 1); }
      if (vertIdx === 1) { s1 = isSolid(1, 0, 1);  s2 = isSolid(0, -1, 1); c = isSolid(1, -1, 1); }
      if (vertIdx === 2) { s1 = isSolid(1, 0, 1);  s2 = isSolid(0, 1, 1);  c = isSolid(1, 1, 1); }
      if (vertIdx === 3) { s1 = isSolid(-1, 0, 1); s2 = isSolid(0, 1, 1);  c = isSolid(-1, 1, 1); }
    }
    // South face (Z-)
    else if (faceIdx === 5) {
      if (vertIdx === 0) { s1 = isSolid(1, 0, -1);  s2 = isSolid(0, -1, -1); c = isSolid(1, -1, -1); }
      if (vertIdx === 1) { s1 = isSolid(-1, 0, -1); s2 = isSolid(0, -1, -1); c = isSolid(-1, -1, -1); }
      if (vertIdx === 2) { s1 = isSolid(-1, 0, -1); s2 = isSolid(0, 1, -1);  c = isSolid(-1, 1, -1); }
      if (vertIdx === 3) { s1 = isSolid(1, 0, -1);  s2 = isSolid(0, 1, -1);  c = isSolid(1, 1, -1); }
    }

    const aoScore = this.calculateAO(s1, s2, c);
    return AO_FACTORS[aoScore];
  }

  /**
   * Rebuilds the chunk geometry buffers
   */
  rebuildMesh(materialManager) {
    const solidData = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
    const transData = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
    const waterData = { positions: [], normals: [], uvs: [], colors: [], indices: [] };

    for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
      for (let lz = 0; lz < CHUNK_DEPTH; lz++) {
        for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
          const block = this.voxels[this.getIndex(lx, ly, lz)];
          if (block === BLOCKS.AIR) continue;

          const def = BLOCK_DEFS[block];
          if (!def || !def.faces) continue;

          const isWater = (block === BLOCKS.WATER);
          const isTransparent = def.transparent && !isWater;
          const targetData = isWater ? waterData : (isTransparent ? transData : solidData);

          const wx = this.originX + lx;
          const wy = ly;
          const wz = this.originZ + lz;

          // Check all 6 faces
          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nx = face.dir[0];
            const ny = face.dir[1];
            const nz = face.dir[2];

            const neighbor = this.getBlock(lx + nx, ly + ny, lz + nz);
            const neighborDef = BLOCK_DEFS[neighbor];

            let drawFace = false;

            if (isWater) {
              // Draw water faces if neighbor is air
              if (neighbor === BLOCKS.AIR) {
                drawFace = true;
              }
            } else if (!def.transparent) {
              // Solid block: draw face if neighbor is air or transparent
              if (neighbor === BLOCKS.AIR || neighborDef?.transparent) {
                drawFace = true;
              }
            } else {
              // Transparent block (e.g. leaves, glass): draw face if neighbor is air or different block
              if (neighbor === BLOCKS.AIR || neighbor !== block) {
                drawFace = true;
              }
            }

            if (!drawFace) continue;

            const slot = def.faces[f];
            const [u0, v0, u1, v1] = materialManager.getUV(slot);

            const baseIdx = targetData.positions.length / 3;
            const verts = FACE_VERTICES[f];

            // 4 vertices of the quad
            for (let v = 0; v < 4; v++) {
              const vert = verts[v];
              targetData.positions.push(wx + vert[0], wy + vert[1], wz + vert[2]);
              targetData.normals.push(face.norm[0], face.norm[1], face.norm[2]);

              // UV mapping
              if (v === 0) targetData.uvs.push(u0, v0);
              else if (v === 1) targetData.uvs.push(u1, v0);
              else if (v === 2) targetData.uvs.push(u1, v1);
              else if (v === 3) targetData.uvs.push(u0, v1);

              // AO factor as vertex color
              const ao = isWater ? 1.0 : this.getVertexAO(lx, ly, lz, f, v);
              targetData.colors.push(ao, ao, ao);
            }

            // Two triangles for quad [0, 1, 2] and [0, 2, 3]
            targetData.indices.push(
              baseIdx, baseIdx + 1, baseIdx + 2,
              baseIdx, baseIdx + 2, baseIdx + 3
            );
          }
        }
      }
    }

    // Helper to build/update Mesh
    const buildSubMesh = (existingMesh, data, material, castShadow = true) => {
      if (data.positions.length === 0) {
        if (existingMesh) {
          existingMesh.geometry.dispose();
          this.world.scene.remove(existingMesh);
        }
        return null;
      }

      if (existingMesh && existingMesh.geometry) {
        existingMesh.geometry.dispose();
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
      geom.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
      geom.setIndex(data.indices);
      geom.computeBoundingSphere();
      geom.computeBoundingBox();

      let mesh = existingMesh;
      if (!mesh) {
        mesh = new THREE.Mesh(geom, material);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.world.scene.add(mesh);
      } else {
        mesh.geometry = geom;
      }
      return mesh;
    };

    this.solidMesh = buildSubMesh(this.solidMesh, solidData, materialManager.solidMaterial, true);
    this.transparentMesh = buildSubMesh(this.transparentMesh, transData, materialManager.transparentMaterial, false);
    this.waterMesh = buildSubMesh(this.waterMesh, waterData, materialManager.waterMaterial, false);

    this.isDirty = false;
  }

  dispose() {
    if (this.solidMesh) {
      this.solidMesh.geometry.dispose();
      this.world.scene.remove(this.solidMesh);
      this.solidMesh = null;
    }
    if (this.transparentMesh) {
      this.transparentMesh.geometry.dispose();
      this.world.scene.remove(this.transparentMesh);
      this.transparentMesh = null;
    }
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      this.world.scene.remove(this.waterMesh);
      this.waterMesh = null;
    }
  }
}
