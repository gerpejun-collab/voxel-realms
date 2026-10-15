// public/src/particles.js
// High-performance block destruction and atmospheric wind-driven particle systems
import * as THREE from 'three';

export class ParticleManager {
  constructor(scene) {
    this.scene = scene;

    // --- Block Debris Particles (Instanced) ---
    this.maxDebris = 128;
    this.debrisGeom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.debrisMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.8
    });
    this.debrisMesh = new THREE.InstancedMesh(this.debrisGeom, this.debrisMat, this.maxDebris);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.frustumCulled = false;
    this.scene.add(this.debrisMesh);

    this.debrisParticles = [];
    this.dummy = new THREE.Object3D();

    // Initialize all debris hidden
    for (let i = 0; i < this.maxDebris; i++) {
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;

    // --- Ambient Wind Particles (Leaves & Dust) ---
    this.ambientCount = 150;
    const ambientGeom = new THREE.BufferGeometry();
    const positions = new Float32Array(this.ambientCount * 3);
    const colors = new Float32Array(this.ambientCount * 3);

    for (let i = 0; i < this.ambientCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

      // Golden-green leaves and warm dust
      const isLeaf = Math.random() > 0.4;
      if (isLeaf) {
        colors[i * 3] = 0.4 + Math.random() * 0.2;
        colors[i * 3 + 1] = 0.75 + Math.random() * 0.2;
        colors[i * 3 + 2] = 0.2;
      } else {
        colors[i * 3] = 0.85;
        colors[i * 3 + 1] = 0.75;
        colors[i * 3 + 2] = 0.55;
      }
    }

    ambientGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    ambientGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const ambientMat = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false
    });

    this.ambientPoints = new THREE.Points(ambientGeom, ambientMat);
    this.scene.add(this.ambientPoints);

    // Wind properties
    this.windAngle = 0.8;
    this.windSpeed = 2.4;
    this.time = 0;
  }

  /**
   * Spawns a burst of voxel debris fragments when a block is destroyed
   */
  spawnBlockDebris(x, y, z, blockColor = 0x888888) {
    const count = 14;
    const cx = x + 0.5;
    const cy = y + 0.5;
    const cz = z + 0.5;

    for (let i = 0; i < count; i++) {
      if (this.debrisParticles.length >= this.maxDebris) {
        this.debrisParticles.shift(); // Recycle oldest
      }

      const angle = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.2) * Math.PI;
      const speed = 2.0 + Math.random() * 4.0;

      this.debrisParticles.push({
        x: cx + (Math.random() - 0.5) * 0.6,
        y: cy + (Math.random() - 0.5) * 0.6,
        z: cz + (Math.random() - 0.5) * 0.6,
        vx: Math.cos(angle) * Math.cos(elev) * speed,
        vy: Math.sin(elev) * speed + 3.0,
        vz: Math.sin(angle) * Math.cos(elev) * speed,
        scale: 0.8 + Math.random() * 0.4,
        rotX: Math.random() * 5,
        rotY: Math.random() * 5,
        life: 0.7,
        maxLife: 0.7
      });
    }
  }

  update(dt, playerPos) {
    this.time += dt;

    // --- Update Debris Particles ---
    for (let i = this.debrisParticles.length - 1; i >= 0; i--) {
      const p = this.debrisParticles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.debrisParticles.splice(i, 1);
        continue;
      }

      // Gravity and air drag
      p.vy -= 22.0 * dt;
      p.vx *= Math.pow(0.9, dt * 60);
      p.vz *= Math.pow(0.9, dt * 60);

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      p.rotX += dt * 4;
      p.rotY += dt * 4;
    }

    // Update debris mesh instances
    for (let i = 0; i < this.maxDebris; i++) {
      if (i < this.debrisParticles.length) {
        const p = this.debrisParticles[i];
        const progress = p.life / p.maxLife;
        const curScale = p.scale * progress;

        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.rotation.set(p.rotX, p.rotY, 0);
        this.dummy.scale.set(curScale, curScale, curScale);
      } else {
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
      }
      this.dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;

    // --- Update Wind & Atmospheric Particles ---
    const posAttr = this.ambientPoints.geometry.attributes.position;
    const posArr = posAttr.array;

    const windVx = Math.cos(this.windAngle) * this.windSpeed;
    const windVz = Math.sin(this.windAngle) * this.windSpeed;

    for (let i = 0; i < this.ambientCount; i++) {
      const idx = i * 3;
      // Drift with wind + gentle sway
      posArr[idx] += (windVx + Math.sin(this.time * 2 + i) * 0.4) * dt;
      posArr[idx + 1] -= (0.4 + Math.sin(this.time + i) * 0.2) * dt;
      posArr[idx + 2] += (windVz + Math.cos(this.time * 2 + i) * 0.4) * dt;

      // Wrap around player's active area
      const dx = posArr[idx] - playerPos.x;
      const dz = posArr[idx + 2] - playerPos.z;
      const dy = posArr[idx + 1] - playerPos.y;

      if (Math.abs(dx) > 25) posArr[idx] = playerPos.x - Math.sign(dx) * 24;
      if (Math.abs(dz) > 25) posArr[idx + 2] = playerPos.z - Math.sign(dz) * 24;
      if (dy < -5) posArr[idx + 1] = playerPos.y + 15;
      if (dy > 20) posArr[idx + 1] = playerPos.y - 4;
    }
    posAttr.needsUpdate = true;
  }
}
