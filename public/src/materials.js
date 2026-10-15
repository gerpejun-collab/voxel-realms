// public/src/materials.js
// PBR materials for voxel chunks and blocks
import * as THREE from 'three';
import { TextureAtlasManager } from './textures.js';

export class MaterialManager {
  constructor() {
    this.atlas = new TextureAtlasManager();

    // Solid PBR chunk material
    this.solidMaterial = new THREE.MeshStandardMaterial({
      map: this.atlas.diffuseTexture,
      normalMap: this.atlas.normalTexture,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: this.atlas.roughnessTexture,
      roughness: 0.85,
      metalness: 0.08,
      shadowSide: THREE.FrontSide
    });

    // Transparent cut-out material (leaves, flowers)
    this.transparentMaterial = new THREE.MeshStandardMaterial({
      map: this.atlas.diffuseTexture,
      normalMap: this.atlas.normalTexture,
      roughnessMap: this.atlas.roughnessTexture,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
      roughness: 0.6,
      metalness: 0.05
    });

    // Realistic animated water material
    this.waterMaterial = new THREE.MeshStandardMaterial({
      map: this.atlas.diffuseTexture,
      normalMap: this.atlas.normalTexture,
      normalScale: new THREE.Vector2(1.5, 1.5),
      color: new THREE.Color(0x3aa8db),
      roughness: 0.1,
      metalness: 0.15,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    // Wireframe highlight material for targeted block
    this.highlightMaterial = new THREE.LineBasicMaterial({
      color: 0x111111,
      linewidth: 2,
      transparent: true,
      opacity: 0.75
    });

    this.waterTime = 0;
  }

  update(delta) {
    this.waterTime += delta * 0.8;
    // Animate water normal map UV offset for realistic moving ripples
    if (this.atlas.normalTexture) {
      this.waterMaterial.normalScale.set(
        1.2 + Math.sin(this.waterTime * 2.0) * 0.3,
        1.2 + Math.cos(this.waterTime * 2.5) * 0.3
      );
    }
  }

  getUV(slot) {
    return this.atlas.getUV(slot);
  }

  getTileDataURL(slot) {
    return this.atlas.getTileDataURL(slot);
  }
}
