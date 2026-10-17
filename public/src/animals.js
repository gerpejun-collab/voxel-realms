/**
 * Procedural Voxel Animals, Rare Non-Human NPCs & Structured Highway Traffic
 * Includes:
 * 1. 6 Animal Species (Sheep, Pig, Cow, Chicken, Wolf, Horse) with terrain-aware spawning
 *    (never in water, never on roads, never inside rocks/buildings) and multiplayer sync.
 * 2. 6 Extraordinary Non-Human Voxel NPCs (Rune Golem, Jade Spirit Dragon, Cyber-Drone,
 *    Void Stalker, Nordic Frost Yeti, Coral King Crab).
 * 3. Realistic Voxel Cars (VoxelCar / TrafficManager) circulating along fixed highway lanes,
 *    bridges, and mountain tunnels with rotating wheels, headlights, and taillights.
 */
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export const ANIMAL_SPECIES = ['sheep', 'pig', 'cow', 'chicken', 'wolf', 'horse'];

class VoxelAnimal {
  constructor(type, arg1, arg2, id = null) {
    this.id = id || `local_${Math.random().toString(36).slice(2, 9)}`;
    this.type = type;
    if (arg1 && typeof arg1.getBlock === 'function' && arg2 && typeof arg2.add === 'function') {
      this.scene = arg2;
      this.world = arg1;
    } else {
      this.scene = arg1;
      this.world = arg2;
    }
    this.group = new THREE.Group();

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.rotationY = Math.random() * Math.PI * 2;
    this.targetRotationY = this.rotationY;

    // AI state
    this.state = 'idle'; // 'idle' | 'walk'
    this.stateTimer = 2 + Math.random() * 4;
    this.walkPhase = Math.random() * 10;
    this.speed = type === 'horse' ? 2.4 : (type === 'wolf' || type === 'chicken' ? 1.85 : (type === 'pig' ? 1.6 : 1.25));
    this.serverControlled = false;
    this.targetPos = new THREE.Vector3();

    this.legs = [];
    this.headGroup = null;

    // Knockback & Despawn state
    this.isKnockedDown = false;
    this.knockdownTimer = 0;
    this.isDying = false;
    this.despawnTimer = 0;
    this.knockbackVelocity = new THREE.Vector3();

    this.buildModel(type);
    this.scene.add(this.group);
  }

  buildModel(type) {
    const mat = (color, emissive = 0x000000) => new THREE.MeshLambertMaterial({ color, emissive });

    if (type === 'sheep') {
      const woolMat = mat(0xf2f2ef);
      const skinMat = mat(0xd8b4a0);
      const eyeMat = mat(0x1a1a1a);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 1.3), woolMat);
      body.position.set(0, 0.75, 0);
      body.castShadow = true;
      this.group.add(body);

      this.headGroup = new THREE.Group();
      this.headGroup.position.set(0, 1.0, 0.65);

      const headWool = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), woolMat);
      headWool.position.set(0, 0.05, 0.05);
      this.headGroup.add(headWool);

      const face = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.45), skinMat);
      face.position.set(0, 0, 0.15);
      this.headGroup.add(face);

      const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.05);
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.14, 0.05, 0.38);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.14, 0.05, 0.38);
      this.headGroup.add(leftEye, rightEye);
      this.group.add(this.headGroup);

      const legGeo = new THREE.BoxGeometry(0.24, 0.5, 0.24);
      const legOffsets = [
        [-0.25, 0.25, 0.4],
        [0.25, 0.25, 0.4],
        [-0.25, 0.25, -0.4],
        [0.25, 0.25, -0.4]
      ];
      for (const [lx, ly, lz] of legOffsets) {
        const leg = new THREE.Mesh(legGeo, skinMat);
        leg.position.set(lx, ly, lz);
        leg.castShadow = true;
        this.legs.push(leg);
        this.group.add(leg);
      }
    } else if (type === 'pig') {
      const pinkMat = mat(0xf09ea7);
      const snoutMat = mat(0xd87a85);
      const eyeMat = mat(0x1a1a1a);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.65, 1.15), pinkMat);
      body.position.set(0, 0.6, 0);
      body.castShadow = true;
      this.group.add(body);

      this.headGroup = new THREE.Group();
      this.headGroup.position.set(0, 0.75, 0.58);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), pinkMat);
      head.position.set(0, 0, 0.12);
      this.headGroup.add(head);

      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.14), snoutMat);
      snout.position.set(0, -0.06, 0.4);
      this.headGroup.add(snout);

      const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.05);
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.16, 0.08, 0.38);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.16, 0.08, 0.38);
      this.headGroup.add(leftEye, rightEye);
      this.group.add(this.headGroup);

      const legGeo = new THREE.BoxGeometry(0.22, 0.38, 0.22);
      const legOffsets = [
        [-0.22, 0.19, 0.36],
        [0.22, 0.19, 0.36],
        [-0.22, 0.19, -0.36],
        [0.22, 0.19, -0.36]
      ];
      for (const [lx, ly, lz] of legOffsets) {
        const leg = new THREE.Mesh(legGeo, pinkMat);
        leg.position.set(lx, ly, lz);
        leg.castShadow = true;
        this.legs.push(leg);
        this.group.add(leg);
      }
    } else if (type === 'cow') {
      const brownMat = mat(0x523a28);
      const patchMat = mat(0xedeae4);
      const hornMat = mat(0xc8c2b0);
      const muzzleMat = mat(0xd8a898);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 1.45), brownMat);
      body.position.set(0, 0.9, 0);
      body.castShadow = true;
      this.group.add(body);

      const patch = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.5, 0.6), patchMat);
      patch.position.set(0, 0.95, 0.1);
      this.group.add(patch);

      this.headGroup = new THREE.Group();
      this.headGroup.position.set(0, 1.15, 0.72);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.52), brownMat);
      head.position.set(0, 0, 0.15);
      this.headGroup.add(head);

      const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.14), muzzleMat);
      muzzle.position.set(0, -0.12, 0.42);
      this.headGroup.add(muzzle);

      const hornGeo = new THREE.BoxGeometry(0.1, 0.24, 0.1);
      const leftHorn = new THREE.Mesh(hornGeo, hornMat);
      leftHorn.position.set(-0.3, 0.24, 0.15);
      const rightHorn = new THREE.Mesh(hornGeo, hornMat);
      rightHorn.position.set(0.3, 0.24, 0.15);
      this.headGroup.add(leftHorn, rightHorn);
      this.group.add(this.headGroup);

      const legGeo = new THREE.BoxGeometry(0.26, 0.55, 0.26);
      const legOffsets = [
        [-0.28, 0.27, 0.46],
        [0.28, 0.27, 0.46],
        [-0.28, 0.27, -0.46],
        [0.28, 0.27, -0.46]
      ];
      for (const [lx, ly, lz] of legOffsets) {
        const leg = new THREE.Mesh(legGeo, brownMat);
        leg.position.set(lx, ly, lz);
        leg.castShadow = true;
        this.legs.push(leg);
        this.group.add(leg);
      }
    } else if (type === 'chicken') {
      const featherMat = mat(0xfafaf9);
      const beakMat = mat(0xeab308);
      const combMat = mat(0xdc2626);
      const eyeMat = mat(0x111111);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.58), featherMat);
      body.position.set(0, 0.42, 0);
      body.castShadow = true;
      this.group.add(body);

      const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.42), featherMat);
      leftWing.position.set(-0.27, 0.44, 0);
      const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.42), featherMat);
      rightWing.position.set(0.27, 0.44, 0);
      this.group.add(leftWing, rightWing);

      this.headGroup = new THREE.Group();
      this.headGroup.position.set(0, 0.65, 0.24);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3), featherMat);
      head.position.set(0, 0.08, 0.06);
      this.headGroup.add(head);

      const comb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.22), combMat);
      comb.position.set(0, 0.3, 0.06);
      this.headGroup.add(comb);

      const beak = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.16), beakMat);
      beak.position.set(0, 0.06, 0.26);
      this.headGroup.add(beak);

      const wattle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), combMat);
      wattle.position.set(0, -0.03, 0.22);
      this.headGroup.add(wattle);

      const eyeGeo = new THREE.BoxGeometry(0.05, 0.05, 0.04);
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.15, 0.12, 0.16);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.15, 0.12, 0.16);
      this.headGroup.add(leftEye, rightEye);
      this.group.add(this.headGroup);

      const legGeo = new THREE.BoxGeometry(0.1, 0.26, 0.1);
      for (const lx of [-0.12, 0.12]) {
        const leg = new THREE.Mesh(legGeo, beakMat);
        leg.position.set(lx, 0.13, 0.02);
        this.legs.push(leg);
        this.group.add(leg);
      }
    } else if (type === 'wolf') {
      const coatMat = mat(0x9ca3af);
      const maneMat = mat(0x6b7280);
      const snoutMat = mat(0xd1d5db);
      const eyeMat = mat(0xfbbf24);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 1.05), coatMat);
      body.position.set(0, 0.58, 0);
      body.castShadow = true;
      this.group.add(body);

      const mane = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.62, 0.45), maneMat);
      mane.position.set(0, 0.62, 0.32);
      this.group.add(mane);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.55), maneMat);
      tail.position.set(0, 0.58, -0.68);
      tail.rotation.x = -0.35;
      this.group.add(tail);

      this.headGroup = new THREE.Group();
      this.headGroup.position.set(0, 0.74, 0.55);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.46, 0.46), coatMat);
      head.position.set(0, 0, 0.14);
      this.headGroup.add(head);

      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.26), snoutMat);
      snout.position.set(0, -0.08, 0.44);
      this.headGroup.add(snout);

      const earGeo = new THREE.BoxGeometry(0.14, 0.18, 0.1);
      const lEar = new THREE.Mesh(earGeo, maneMat);
      lEar.position.set(-0.16, 0.28, 0.1);
      const rEar = new THREE.Mesh(earGeo, maneMat);
      rEar.position.set(0.16, 0.28, 0.1);
      this.headGroup.add(lEar, rEar);

      const eyeGeo = new THREE.BoxGeometry(0.08, 0.07, 0.04);
      const lEye = new THREE.Mesh(eyeGeo, eyeMat);
      lEye.position.set(-0.14, 0.06, 0.37);
      const rEye = new THREE.Mesh(eyeGeo, eyeMat);
      rEye.position.set(0.14, 0.06, 0.37);
      this.headGroup.add(lEye, rEye);
      this.group.add(this.headGroup);

      const legGeo = new THREE.BoxGeometry(0.18, 0.42, 0.18);
      const legOffsets = [
        [-0.18, 0.21, 0.35],
        [0.18, 0.21, 0.35],
        [-0.18, 0.21, -0.35],
        [0.18, 0.21, -0.35]
      ];
      for (const [lx, ly, lz] of legOffsets) {
        const leg = new THREE.Mesh(legGeo, coatMat);
        leg.position.set(lx, ly, lz);
        this.legs.push(leg);
        this.group.add(leg);
      }
    } else if (type === 'horse') {
      const bayMat = mat(0x7c3f1d);
      const maneMat = mat(0x271509);
      const muzzleMat = mat(0xd6c3b3);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 1.65), bayMat);
      body.position.set(0, 1.05, 0);
      body.castShadow = true;
      this.group.add(body);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), maneMat);
      tail.position.set(0, 0.9, -0.92);
      tail.rotation.x = 0.25;
      this.group.add(tail);

      this.headGroup = new THREE.Group();
      this.headGroup.position.set(0, 1.42, 0.72);

      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.46), bayMat);
      neck.position.set(0, 0.18, 0.12);
      neck.rotation.x = 0.35;
      this.headGroup.add(neck);

      const mane = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.75, 0.18), maneMat);
      mane.position.set(0, 0.24, -0.08);
      mane.rotation.x = 0.35;
      this.headGroup.add(mane);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.38, 0.62), bayMat);
      head.position.set(0, 0.48, 0.34);
      this.headGroup.add(head);

      const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.26), muzzleMat);
      muzzle.position.set(0, 0.42, 0.72);
      this.headGroup.add(muzzle);

      this.group.add(this.headGroup);

      const legGeo = new THREE.BoxGeometry(0.24, 0.75, 0.24);
      const legOffsets = [
        [-0.28, 0.37, 0.56],
        [0.28, 0.37, 0.56],
        [-0.28, 0.37, -0.56],
        [0.28, 0.37, -0.56]
      ];
      for (const [lx, ly, lz] of legOffsets) {
        const leg = new THREE.Mesh(legGeo, bayMat);
        leg.position.set(lx, ly, lz);
        this.legs.push(leg);
        this.group.add(leg);
      }
    }
  }

  isValidGroundPosition(wx, wz) {
    if (!this.world) return true;
    if (typeof this.world.isValidAnimalSpawn === 'function') {
      if (!this.world.isValidAnimalSpawn(wx, wz)) return false;
    }
    const gy = this.world.getHeightAt(Math.floor(wx), Math.floor(wz));
    if (gy <= 18) return false; // Never enter water level
    return true;
  }

  spawnNear(centerX, centerZ, minRadius = 12, maxRadius = 42) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minRadius + Math.random() * (maxRadius - minRadius);
      const wx = Math.floor(centerX + Math.cos(angle) * dist);
      const wz = Math.floor(centerZ + Math.sin(angle) * dist);

      if (!this.isValidGroundPosition(wx, wz)) continue;

      const wy = this.world.getHeightAt(wx, wz) + 1;
      this.position.set(wx + 0.5, wy, wz + 0.5);
      this.targetPos.copy(this.position);
      this.group.position.copy(this.position);
      return true;
    }
    // Fallback safe meadow spot outside central plaza road ring
    const fallbackX = 28.5;
    const fallbackZ = 28.5;
    const fy = this.world ? this.world.getHeightAt(28, 28) + 1 : 25;
    this.position.set(fallbackX, fy, fallbackZ);
    this.targetPos.copy(this.position);
    this.group.position.copy(this.position);
    return false;
  }

  applyServerState(data) {
    this.serverControlled = true;
    this.targetPos.set(data.x, data.y, data.z);
    if (this.position.distanceToSquared(this.targetPos) > 100) {
      this.position.copy(this.targetPos);
    }
    this.targetRotationY = typeof data.ry === 'number' ? data.ry : this.rotationY;
    this.state = data.state || 'idle';
  }

  triggerKnockdown(dir = null) {
    if (this.isKnockedDown || this.isDying) return;
    this.isKnockedDown = true;
    this.isDying = true;
    this.knockdownTimer = 3.0; // Exactly 3-second despawn timer
    this.despawnTimer = 3.0;
    this.state = 'knockdown';

    let kx = 0, kz = 0;
    if (dir) {
      const dx = (dir.x !== undefined) ? dir.x : (dir[0] || 0);
      const dz = (dir.z !== undefined) ? dir.z : (dir[2] || 0);
      const len = Math.hypot(dx, dz) || 1;
      kx = dx / len;
      kz = dz / len;
    } else {
      const angle = this.rotationY + Math.PI;
      kx = Math.sin(angle);
      kz = Math.cos(angle);
    }
    // Directional knockback velocity vector along bullet direction
    this.knockbackVelocity.set(kx * 5.2, 3.2, kz * 5.2);
    this.applyHurtColor(true);
  }

  triggerHit(dir = null) {
    this.triggerKnockdown(dir);
  }

  applyHurtColor(isHurt) {
    if (!this.group) return;
    this.group.traverse((child) => {
      if (child.isMesh && child.material) {
        if (child.__origEmissive === undefined) {
          child.__origEmissive = child.material.emissive ? child.material.emissive.getHex() : 0x000000;
        }
        if (child.material.emissive) {
          child.material.emissive.setHex(isHurt ? 0xcc1111 : child.__origEmissive);
        }
      }
    });
  }

  update(dt, playerPos) {
    if (this.isKnockedDown || this.isDying) {
      this.knockdownTimer = Math.max(0, (this.knockdownTimer || this.despawnTimer) - dt);
      this.despawnTimer = this.knockdownTimer;

      // Apply knockback movement & gravity along bullet direction
      this.position.x += this.knockbackVelocity.x * dt;
      this.position.z += this.knockbackVelocity.z * dt;
      this.position.y += this.knockbackVelocity.y * dt;

      this.knockbackVelocity.x *= Math.pow(0.86, dt * 60);
      this.knockbackVelocity.z *= Math.pow(0.86, dt * 60);
      this.knockbackVelocity.y -= 20.0 * dt;

      const gy = this.world && typeof this.world.getHeightAt === 'function'
        ? this.world.getHeightAt(Math.floor(this.position.x), Math.floor(this.position.z)) + 1
        : 25;

      if (this.position.y <= gy) {
        this.position.y = gy;
        this.knockbackVelocity.y = 0;
      }

      this.group.position.copy(this.position);

      // Knockdown tilt animation: smoothly rotate onto side (rotation.z = Math.PI / 2)
      this.group.rotation.z = Math.min(Math.PI / 2, this.group.rotation.z + dt * 8.0);

      // Halt leg swings during knockdown
      for (const leg of this.legs) {
        leg.rotation.x *= 0.8;
      }

      // Flash hurt red tint for initial impact
      const flash = (this.knockdownTimer > 2.75) || (Math.floor(this.knockdownTimer * 6) % 2 === 0 && this.knockdownTimer > 2.2);
      this.applyHurtColor(flash);

      // Despawn after exactly 3.0 seconds
      if (this.knockdownTimer <= 0) {
        this.isDespawned = true;
        this.dispose();
      }
      return;
    }

    if (this.serverControlled) {
      // Smooth multiplayer interpolation
      this.position.lerp(this.targetPos, Math.min(1, dt * 6));
      const groundY = this.world ? this.world.getHeightAt(Math.floor(this.position.x), Math.floor(this.position.z)) + 1 : this.position.y;
      this.position.y = groundY;

      let diff = this.targetRotationY - this.rotationY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.rotationY += diff * Math.min(1, dt * 6);
    } else {
      // Respawn if too far from player (> 85 blocks)
      const dx = this.position.x - playerPos.x;
      const dz = this.position.z - playerPos.z;
      if (dx * dx + dz * dz > 85 * 85) {
        this.spawnNear(playerPos.x, playerPos.z, 22, 55);
        return;
      }

      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (this.state === 'idle') {
          this.state = 'walk';
          this.stateTimer = 2.0 + Math.random() * 3.5;
          this.targetRotationY = Math.random() * Math.PI * 2;
        } else {
          this.state = 'idle';
          this.stateTimer = 1.5 + Math.random() * 3.0;
        }
      }

      let diff = this.targetRotationY - this.rotationY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.rotationY += diff * Math.min(1, dt * 5);

      if (this.state === 'walk') {
        const moveX = Math.sin(this.rotationY) * this.speed * dt;
        const moveZ = Math.cos(this.rotationY) * this.speed * dt;
        const nextX = this.position.x + moveX;
        const nextZ = this.position.z + moveZ;

        const curGround = this.world.getHeightAt(Math.floor(this.position.x), Math.floor(this.position.z));
        const nextGround = this.world.getHeightAt(Math.floor(nextX), Math.floor(nextZ));

        // Strict terrain check: never step into water, onto roads, or into steep walls/rocks
        if (Math.abs(nextGround - curGround) <= 1 && this.isValidGroundPosition(nextX, nextZ)) {
          this.position.x = nextX;
          this.position.z = nextZ;
          this.position.y = nextGround + 1;
        } else {
          // Turn away from road, water, or obstacle
          this.targetRotationY = this.rotationY + Math.PI * (0.65 + Math.random() * 0.7);
          this.state = 'idle';
          this.stateTimer = 0.8;
        }
      } else {
        const curGround = this.world.getHeightAt(Math.floor(this.position.x), Math.floor(this.position.z));
        this.position.y = curGround + 1;
      }
    }

    if (this.state === 'walk') {
      this.walkPhase += dt * 8;
      const swing = Math.sin(this.walkPhase) * 0.45;
      if (this.legs.length >= 4) {
        this.legs[0].rotation.x = swing;
        this.legs[1].rotation.x = -swing;
        this.legs[2].rotation.x = -swing;
        this.legs[3].rotation.x = swing;
      } else if (this.legs.length === 2) {
        this.legs[0].rotation.x = swing;
        this.legs[1].rotation.x = -swing;
      }
      if (this.headGroup) {
        this.headGroup.rotation.x = Math.sin(this.walkPhase * 0.5) * 0.08;
      }
    } else {
      for (const leg of this.legs) {
        leg.rotation.x *= 0.85;
      }
      if (this.headGroup) {
        this.headGroup.rotation.y = Math.sin( performance.now() * 0.0015 + this.walkPhase ) * 0.18;
      }
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;
  }

  dispose() {
    if (this.group && this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

/**
 * Extraordinary Non-Human Voxel NPCs (Guardian Golem, Jade Spirit, Cyber-Drone, Void Stalker, Frost Yeti, Coral Crab)
 */
class RareNonHumanNpc {
  constructor(config, arg1, arg2) {
    this.id = config.id;
    this.kind = config.kind;
    this.name = config.name;
    if (arg1 && typeof arg1.getBlock === 'function' && arg2 && typeof arg2.add === 'function') {
      this.scene = arg2;
      this.world = arg1;
    } else {
      this.scene = arg1;
      this.world = arg2;
    }
    this.homeX = config.x;
    this.homeZ = config.z;
    this.phase = Math.random() * Math.PI * 2;
    this.group = new THREE.Group();
    this.parts = {};
    this.config = config;

    // Knockback & Despawn state
    this.isDying = false;
    this.despawnTimer = 0;
    this.knockbackVelocity = new THREE.Vector3();

    this.buildConstruct(config.kind);
    const groundY = this.world ? this.world.getHeightAt(Math.floor(this.homeX), Math.floor(this.homeZ)) + 1 : 25;
    this.position = new THREE.Vector3(this.homeX, groundY, this.homeZ);
    this.group.position.copy(this.position);
    this.scene.add(this.group);
  }

  buildConstruct(kind) {
    const mat = (color, emissive = 0x000000) => new THREE.MeshLambertMaterial({ color, emissive });

    if (kind === 'golem') {
      // Ancient Rune Golem (Stone & Glowing Gold Core)
      const stoneMat = mat(0x64748b);
      const mossMat = mat(0x4d7c0f);
      const runeMat = mat(0xfacc15, 0x854d0e);

      const torso = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 0.9), stoneMat);
      torso.position.set(0, 1.6, 0);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.96), runeMat);
      core.position.set(0, 1.65, 0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 0.75), stoneMat);
      head.position.set(0, 2.65, 0.1);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.8), runeMat);
      visor.position.set(0, 2.7, 0.12);

      const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.65, 0.5), mossMat);
      leftArm.position.set(-1.05, 1.45, 0);
      const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.65, 0.5), mossMat);
      rightArm.position.set(1.05, 1.45, 0);

      const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), stoneMat);
      lLeg.position.set(-0.4, 0.45, 0);
      const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), stoneMat);
      rLeg.position.set(0.4, 0.45, 0);

      this.parts.leftArm = leftArm;
      this.parts.rightArm = rightArm;
      this.parts.core = core;
      this.group.add(torso, core, head, visor, leftArm, rightArm, lLeg, rLeg);
    } else if (kind === 'jade_spirit') {
      // Floating Serpentine Jade Dragon Spirit
      const jadeMat = mat(0x10b981, 0x064e3b);
      const goldMat = mat(0xfbbf24, 0x78350f);
      this.segments = [];
      for (let i = 0; i < 6; i++) {
        const seg = new THREE.Mesh(
          new THREE.BoxGeometry(i === 0 ? 0.7 : 0.5, i === 0 ? 0.65 : 0.45, 0.65),
          i === 0 ? goldMat : jadeMat
        );
        seg.position.set(0, 2.2, -i * 0.55);
        this.segments.push(seg);
        this.group.add(seg);
      }
    } else if (kind === 'mecha_drone') {
      // Shanghai Hovering Cyber-Sentinel Drone
      const hullMat = mat(0x1e293b);
      const neonMat = mat(0x38bdf8, 0x0284c7);
      const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), hullMat);
      core.position.set(0, 2.4, 0);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.96), neonMat);
      eye.position.set(0, 2.4, 0);
      const ring = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 1.7), neonMat);
      ring.position.set(0, 2.4, 0);
      this.parts.ring = ring;
      this.parts.core = core;
      this.group.add(core, eye, ring);
    } else if (kind === 'void_walker') {
      // Crystalline Obsidian Void Construct
      const obMat = mat(0x1e1b4b);
      const shardMat = mat(0xa855f7, 0x581c87);
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 0.7), obMat);
      pillar.position.set(0, 1.5, 0);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.9), shardMat);
      crown.position.set(0, 2.9, 0);
      this.parts.crown = crown;
      this.group.add(pillar, crown);
    } else if (kind === 'frost_yeti') {
      // Nordic Ice Yeti Beast
      const furMat = mat(0xf8fafc);
      const iceMat = mat(0x7dd3fc, 0x0369a1);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 1.0), furMat);
      body.position.set(0, 1.4, 0);
      const hornL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 0.25), iceMat);
      hornL.position.set(-0.6, 2.35, 0);
      const hornR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 0.25), iceMat);
      hornR.position.set(0.6, 2.35, 0);
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.4, 0.45), furMat);
      armL.position.set(-0.95, 1.35, 0.15);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.4, 0.45), furMat);
      armR.position.set(0.95, 1.35, 0.15);
      this.parts.leftArm = armL;
      this.parts.rightArm = armR;
      this.group.add(body, hornL, hornR, armL, armR);
    } else if (kind === 'coral_crab') {
      // Giant Tropical Reef King Crab
      const shellMat = mat(0xef4444);
      const crownMat = mat(0xfacc15, 0x854d0e);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 0.95), shellMat);
      shell.position.set(0, 0.55, 0);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.45), crownMat);
      crown.position.set(0, 0.95, 0);
      const clawL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.55), shellMat);
      clawL.position.set(-0.85, 0.55, 0.55);
      const clawR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.55), shellMat);
      clawR.position.set(0.85, 0.55, 0.55);
      this.parts.leftArm = clawL;
      this.parts.rightArm = clawR;
      this.group.add(shell, crown, clawL, clawR);
    }
  }

  triggerHit(dir = null) {
    if (this.isDying) return;
    this.isDying = true;
    this.despawnTimer = 3.0; // 3 seconds despawn

    let kx = 0, kz = 0;
    if (dir) {
      const dx = (dir.x !== undefined) ? dir.x : (dir[0] || 0);
      const dz = (dir.z !== undefined) ? dir.z : (dir[2] || 0);
      const len = Math.hypot(dx, dz) || 1;
      kx = dx / len;
      kz = dz / len;
    } else {
      kx = (Math.random() - 0.5);
      kz = (Math.random() - 0.5);
    }
    this.knockbackVelocity.set(kx * 4.8, 3.8, kz * 4.8);
    this.applyHurtColor(true);
  }

  applyHurtColor(isHurt) {
    if (!this.group) return;
    this.group.traverse((child) => {
      if (child.isMesh && child.material) {
        if (child.__origEmissive === undefined) {
          child.__origEmissive = child.material.emissive ? child.material.emissive.getHex() : 0x000000;
        }
        if (child.material.emissive) {
          child.material.emissive.setHex(isHurt ? 0xcc1111 : child.__origEmissive);
        }
      }
    });
  }

  dispose() {
    if (this.group && this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }

  update(dt) {
    if (this.isDying) {
      this.despawnTimer -= dt;

      // Knockback kinematics
      this.position.x += this.knockbackVelocity.x * dt;
      this.position.z += this.knockbackVelocity.z * dt;
      this.position.y += this.knockbackVelocity.y * dt;
      this.knockbackVelocity.x *= Math.pow(0.85, dt * 60);
      this.knockbackVelocity.z *= Math.pow(0.85, dt * 60);
      this.knockbackVelocity.y -= 20.0 * dt;

      const gy = this.world ? this.world.getHeightAt(Math.floor(this.position.x), Math.floor(this.position.z)) + 1 : 25;
      if (this.position.y <= gy) {
        this.position.y = gy;
        this.knockbackVelocity.y = 0;
      }

      this.group.position.copy(this.position);
      this.group.rotation.x = -0.35;
      this.group.rotation.z = Math.sin(this.despawnTimer * 12) * 0.25;

      const pulse = (Math.floor(this.despawnTimer * 8) % 2 === 0);
      this.applyHurtColor(pulse);

      if (this.despawnTimer <= 0) {
        this.dispose();
      }
      return;
    }

    this.phase += dt * 2.2;
    const radius = 3.2;
    const wx = this.homeX + Math.cos(this.phase * 0.35) * radius;
    const wz = this.homeZ + Math.sin(this.phase * 0.35) * radius;
    const gy = this.world ? this.world.getHeightAt(Math.floor(wx), Math.floor(wz)) + 1 : 25;

    this.position.set(wx, gy, wz);
    this.group.position.copy(this.position);
    this.group.rotation.y = -this.phase * 0.35 + Math.PI;

    if (this.parts.leftArm && this.parts.rightArm) {
      this.parts.leftArm.rotation.x = Math.sin(this.phase) * 0.35;
      this.parts.rightArm.rotation.x = -Math.sin(this.phase) * 0.35;
    }
    if (this.parts.ring) {
      this.parts.ring.rotation.y += dt * 2.5;
      this.group.position.y = gy + Math.sin(this.phase * 1.5) * 0.45;
    }
    if (this.parts.crown) {
      this.parts.crown.rotation.y -= dt * 1.8;
      this.parts.crown.position.y = 2.9 + Math.sin(this.phase * 2) * 0.18;
    }
    if (this.segments) {
      for (let i = 0; i < this.segments.length; i++) {
        this.segments[i].position.y = 2.2 + Math.sin(this.phase * 2 + i * 0.6) * 0.35;
        this.segments[i].position.x = Math.cos(this.phase * 1.5 + i * 0.5) * 0.25;
      }
    }
  }
}

/**
 * Helpers for obstacle block detection
 */
const DEFAULT_BLOCKS = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  DIRT_DRY: 3,
  STONE: 4,
  COBBLESTONE: 5,
  OAK_LOG: 6,
  OAK_LEAVES: 7,
  WOOD_PLANK: 8,
  SAND: 9,
  GRAVEL: 10,
  WATER: 11,
  SNOW: 12,
  ICE: 13,
  BRICK: 14,
  CLAY: 15,
  GLASS: 16,
  IRON_ORE: 17,
  GOLD_ORE: 18,
  TNT: 19,
  ASPHALT: 20
};

function getSafeBlocks() {
  if (typeof BLOCKS !== 'undefined' && BLOCKS) return BLOCKS;
  return DEFAULT_BLOCKS;
}

function getSafeBlockDefs() {
  if (typeof BLOCK_DEFS !== 'undefined' && BLOCK_DEFS) return BLOCK_DEFS;
  return null;
}

function isSolidOrObstacle(block) {
  if (block === null || block === undefined || block === 0 || block === false) return false;
  if (block === true) return true;
  const blocks = getSafeBlocks();
  const defs = getSafeBlockDefs();
  if (typeof block === 'number') {
    if (block === blocks.AIR || block === blocks.WATER) return false;
    if (block === blocks.OAK_LEAVES || block === 7) return false;
    if (block === blocks.TNT) return true;
    if (defs && defs[block]) return Boolean(defs[block].solid);
    return true; // Any other block number is a solid block
  }
  if (typeof block === 'object') {
    if (block.id === blocks.AIR || block.type === blocks.AIR) return false;
    if (block.id === blocks.WATER || block.type === blocks.WATER) return false;
    if (block.id === blocks.OAK_LEAVES || block.type === blocks.OAK_LEAVES || block.id === 7 || block.type === 7) return false;
    if (block.id === blocks.TNT || block.type === blocks.TNT || block.isExplosive) return true;
    if (block.solid !== undefined) return Boolean(block.solid);
    return true;
  }
  return true;
}

/**
 * Realistic Voxel Car that drives deterministically along structured highway lanes
 * with forward obstacle probing (2.5 blocks ahead), smooth deceleration, and obstacle avoidance.
 */
export class VoxelCar {
  constructor(route, arg1, arg2) {
    this.route = route;
    if (arg1 && typeof arg1.getBlock === 'function') {
      this.world = arg1;
      this.scene = (arg2 && typeof arg2.add === 'function') ? arg2 : null;
    } else if (arg2 && typeof arg2.getBlock === 'function') {
      this.world = arg2;
      this.scene = (arg1 && typeof arg1.add === 'function') ? arg1 : null;
    } else {
      this.scene = (arg1 && typeof arg1.add === 'function') ? arg1 : null;
      this.world = arg2;
    }

    this.group = new THREE.Group();
    this.wheels = [];
    this.progress = route.initialProgress || 0;
    this.maxSpeed = route.speed !== undefined ? route.speed : 9.5;
    this.currentSpeed = this.maxSpeed;
    this.speed = this.currentSpeed;
    this.direction = 1;
    this.position = new THREE.Vector3();
    this.rotationY = 0;

    // Obstacle avoidance & collision intelligence state
    this.probeDistance = 2.5;       // Probes 2.5 blocks ahead along travel heading
    this.decelerationRate = 22.0;   // Smooth braking deceleration (units/s^2)
    this.accelerationRate = 14.0;   // Smooth throttle acceleration (units/s^2)
    this.hasObstacle = false;
    this.isBlocked = false;
    this.isStopped = false;
    this.isBraking = false;
    this.isHalted = false;
    this.targetSpeed = this.maxSpeed;
    this.trafficManager = null;
    this.taillights = [];
    this.headlights = [];

    // Set initial position and orientation based on initialProgress
    const initialPos = this.computePositionAtProgress(this.progress);
    this.position.set(initialPos.x, initialPos.y, initialPos.z);
    this.rotationY = this.computeRotationAtProgress(this.progress);

    this.buildCarModel(route.color || 0xd92b2b);
    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.group);
    }
    const initPos = this.computePositionAtProgress(this.progress);
    this.position.set(initPos.x, initPos.y, initPos.z);
    this.rotationY = this.computeRotationAtProgress(this.progress);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;
  }

  computePositionAtProgress(prog) {
    let wx, wz;
    if (this.route.type === 'circle') {
      wx = this.route.cx + Math.cos(prog) * this.route.radius;
      wz = this.route.cz + Math.sin(prog) * this.route.radius;
    } else {
      const dx = this.route.x2 - this.route.x1;
      const dz = this.route.z2 - this.route.z1;
      wx = this.route.x1 + dx * prog;
      wz = this.route.z1 + dz * prog;
    }
    const roadY = (this.world && typeof this.world.getRoadHeightAt === 'function')
      ? this.world.getRoadHeightAt(Math.round(wx), Math.round(wz)) + 1
      : 25;
    return { x: wx, y: roadY, z: wz };
  }

  computeRotationAtProgress(prog) {
    if (this.route.type === 'circle') {
      const tx = -Math.sin(prog);
      const tz = Math.cos(prog);
      return Math.atan2(tx, tz);
    } else {
      const dx = this.route.x2 - this.route.x1;
      const dz = this.route.z2 - this.route.z1;
      return Math.atan2(dx, dz);
    }
  }

  getHeadingVector() {
    if (this.route.type === 'circle') {
      const tx = -Math.sin(this.progress);
      const tz = Math.cos(this.progress);
      return { x: tx, z: tz };
    } else {
      const dx = this.route.x2 - this.route.x1;
      const dz = this.route.z2 - this.route.z1;
      const len = Math.hypot(dx, dz) || 1;
      return { x: dx / len, z: dz / len };
    }
  }

  /**
   * Casts 3 parallel forward rays at road heights +1 and +2 (center, left +0.6, right -0.6)
   * interrogating world.getBlock to detect walls, buildings, placed blocks, monuments,
   * and TNT blocks up to lookAheadDist (default 8.0 blocks) ahead.
   *
   * @param {number} [lookAheadDist=8.0] - Maximum look-ahead distance in blocks
   * @returns {{ distance: number, blockId: number, x: number, y: number, z: number, isObstacle: boolean } | null}
   */
  checkObstacleAhead(lookAheadDist = 8.0) {
    if (!this.world || typeof this.world.getBlock !== 'function') {
      return null;
    }

    const heading = this.getHeadingVector();
    const hx = heading.x;
    const hz = heading.z;
    const curX = this.position.x;
    const curZ = this.position.z;
    const curY = Math.floor(this.position.y || 25);

    // Lateral perpendicular vector: pointing to the right (+0.6) / left (-0.6)
    const perpX = hz;
    const perpZ = -hx;

    const isCircle = Boolean(this.route && (this.route.type === 'circle' || this.route === 'circle'));
    const routeRadius = (this.route && this.route.radius) || 21.0;
    const routeCx = (this.route && this.route.cx) || 0;
    const routeCz = (this.route && this.route.cz) || 0;
    const currentAngle = (typeof this.progress === 'number')
      ? this.progress
      : Math.atan2(curZ - routeCz, curX - routeCx);

    const hasLineEndpoint = (!isCircle && this.route && typeof this.route.x2 === 'number' && typeof this.route.z2 === 'number');
    const remainingRouteDist = hasLineEndpoint
      ? Math.hypot(this.route.x2 - curX, this.route.z2 - curZ)
      : Infinity;

    // 3 parallel rays: center (0.0), left (-0.6), right (+0.6)
    const lateralOffsets = [0.0, -0.6, 0.6];
    const frontBumper = 1.55;
    const maxDist = (typeof lookAheadDist === 'number' && lookAheadDist > 0) ? lookAheadDist : 8.0;

    // First check direct contact at front bumper (d = 0.0)
    if (frontBumper <= remainingRouteDist + 0.25) {
      for (const lat of lateralOffsets) {
        let sampleX, sampleZ;
        if (isCircle) {
          const arcAngle = currentAngle + (frontBumper / routeRadius);
          sampleX = routeCx + Math.cos(arcAngle) * (routeRadius + lat);
          sampleZ = routeCz + Math.sin(arcAngle) * (routeRadius + lat);
        } else {
          sampleX = curX + hx * frontBumper + perpX * lat;
          sampleZ = curZ + hz * frontBumper + perpZ * lat;
        }

        const bx = Math.round(sampleX);
        const bz = Math.round(sampleZ);
        if (Math.abs(lat) > 0.01 && typeof this.world.isRoadAt === 'function' && !this.world.isRoadAt(bx, bz)) {
          continue;
        }
        const roadSurfaceY = (typeof this.world.getRoadHeightAt === 'function')
          ? this.world.getRoadHeightAt(bx, bz)
          : (curY >= 25 ? curY - 1 : 24);
        const yLevels = [Math.floor(roadSurfaceY) + 1, Math.floor(roadSurfaceY) + 2];

        for (const iy of yLevels) {
          const block = this.world.getBlock(bx, iy, bz);
          if (isSolidOrObstacle(block)) {
            return {
              distance: 0.0,
              blockId: (typeof block === 'object' && block) ? (block.id || block.type || 1) : block,
              x: sampleX,
              y: iy,
              z: sampleZ,
              isObstacle: true
            };
          }
        }
      }
    }

    // Step along 3 forward rays from 0.1m up to maxDist in 0.1m increments
    for (let d = 0.1; d <= maxDist + 0.001; d += 0.1) {
      const roundedD = Math.round(d * 10) / 10;
      const distFromCenter = frontBumper + roundedD;
      if (distFromCenter > remainingRouteDist + 0.25) break;

      for (const lat of lateralOffsets) {
        let sampleX, sampleZ;
        if (isCircle) {
          const arcAngle = currentAngle + (distFromCenter / routeRadius);
          sampleX = routeCx + Math.cos(arcAngle) * (routeRadius + lat);
          sampleZ = routeCz + Math.sin(arcAngle) * (routeRadius + lat);
        } else {
          sampleX = curX + hx * distFromCenter + perpX * lat;
          sampleZ = curZ + hz * distFromCenter + perpZ * lat;
        }

        const bx = Math.round(sampleX);
        const bz = Math.round(sampleZ);
        if (Math.abs(lat) > 0.01 && typeof this.world.isRoadAt === 'function' && !this.world.isRoadAt(bx, bz)) {
          continue;
        }

        const roadSurfaceY = (typeof this.world.getRoadHeightAt === 'function')
          ? this.world.getRoadHeightAt(bx, bz)
          : (curY >= 25 ? curY - 1 : 24);

        // Heights: road surface + 1 (hood height) and road surface + 2 (windshield height)
        const yLevels = [Math.floor(roadSurfaceY) + 1, Math.floor(roadSurfaceY) + 2];

        for (const iy of yLevels) {
          const block = this.world.getBlock(bx, iy, bz);

          if (isSolidOrObstacle(block)) {
            return {
              distance: roundedD,
              blockId: (typeof block === 'object' && block) ? (block.id || block.type || 1) : block,
              x: sampleX,
              y: iy,
              z: sampleZ,
              isObstacle: true
            };
          }
        }
      }
    }

    // Dynamic vehicle ahead detection in the same traffic lane
    if (this.trafficManager && Array.isArray(this.trafficManager.cars)) {
      for (const other of this.trafficManager.cars) {
        if (other === this) continue;
        if (typeof other.getHeadingVector === 'function') {
          const oh = other.getHeadingVector();
          if (oh.x * hx + oh.z * hz < 0.5) continue;
        }
        const toX = other.position.x - curX;
        const toZ = other.position.z - curZ;
        const forwardProj = toX * hx + toZ * hz;
        const lateralProj = Math.abs(toX * perpX + toZ * perpZ);
        if (forwardProj > frontBumper && forwardProj <= maxDist + frontBumper && lateralProj < 1.35) {
          const carDist = Math.max(0.1, Math.round((forwardProj - frontBumper * 2) * 10) / 10);
          return {
            distance: carDist,
            isVehicle: true,
            x: other.position.x,
            y: other.position.y,
            z: other.position.z,
            isObstacle: true
          };
        }
      }
    }

    return null;
  }

  /**
   * Forward obstacle probing along travel heading using world.getBlock(...)
   * Maintains compatibility with legacy probe checks.
   */
  checkObstacle(distance = 2.5) {
    if (!this.world || typeof this.world.getBlock !== 'function') {
      this.hasObstacle = false;
      this.isBlocked = false;
      return false;
    }

    const heading = this.getHeadingVector();
    const hx = heading.x;
    const hz = heading.z;
    const curX = this.position.x;
    const curZ = this.position.z;
    const curY = Math.floor(this.position.y || 25);

    // Lateral perpendicular vector for checking lane width
    const perpX = hz;
    const perpZ = -hx;

    const isCircle = Boolean(this.route && (this.route.type === 'circle' || this.route === 'circle'));
    const routeRadius = (this.route && this.route.radius) || 21.0;
    const routeCx = (this.route && this.route.cx) || 0;
    const routeCz = (this.route && this.route.cz) || 0;
    const currentAngle = (typeof this.progress === 'number')
      ? this.progress
      : Math.atan2(curZ - routeCz, curX - routeCx);

    const hasLineEndpoint = (!isCircle && this.route && typeof this.route.x2 === 'number' && typeof this.route.z2 === 'number');
    const remainingRouteDist = hasLineEndpoint
      ? Math.hypot(this.route.x2 - curX, this.route.z2 - curZ)
      : Infinity;

    // Distances to probe: probe distance plus intermediate samples along heading
    const probeDist = typeof distance === 'number' ? distance : 2.5;
    const sampleDistances = [probeDist];
    if (probeDist >= 1.8) {
      sampleDistances.unshift(1.0, 1.8);
    }
    if (Math.round(probeDist) !== probeDist && Math.round(probeDist) > probeDist) {
      sampleDistances.push(Math.round(probeDist));
    }

    const lateralOffsets = [0, -0.45, 0.45];

    for (const d of sampleDistances) {
      if (d > remainingRouteDist + 0.25) continue;
      for (const lat of lateralOffsets) {
        let sampleX, sampleZ;
        if (isCircle) {
          const arcAngle = currentAngle + (d / routeRadius);
          sampleX = routeCx + Math.cos(arcAngle) * (routeRadius + lat);
          sampleZ = routeCz + Math.sin(arcAngle) * (routeRadius + lat);
        } else {
          sampleX = curX + hx * d + perpX * lat;
          sampleZ = curZ + hz * d + perpZ * lat;
        }

        const bx = Math.round(sampleX);
        const bz = Math.round(sampleZ);
        if (Math.abs(lat) > 0.01 && typeof this.world.isRoadAt === 'function' && !this.world.isRoadAt(bx, bz)) {
          continue;
        }

        const roadSurfaceY = (typeof this.world.getRoadHeightAt === 'function')
          ? this.world.getRoadHeightAt(bx, bz)
          : (curY >= 25 ? curY - 1 : 24);

        const yLevels = [Math.floor(roadSurfaceY) + 1, Math.floor(roadSurfaceY) + 2];

        for (const iy of yLevels) {
          const block = this.world.getBlock(bx, iy, bz);
          if (isSolidOrObstacle(block)) {
            this.hasObstacle = true;
            this.isBlocked = true;
            return true;
          }
        }
      }
    }

    // Car-to-car collision intelligence if inside TrafficManager
    if (this.trafficManager && Array.isArray(this.trafficManager.cars)) {
      for (const other of this.trafficManager.cars) {
        if (other === this) continue;
        if (typeof other.getHeadingVector === 'function') {
          const oh = other.getHeadingVector();
          if (oh.x * hx + oh.z * hz < 0.5) continue;
        }
        const toX = other.position.x - curX;
        const toZ = other.position.z - curZ;
        const forwardProj = toX * hx + toZ * hz;
        const lateralProj = Math.abs(toX * perpX + toZ * perpZ);
        if (forwardProj > 0.2 && forwardProj <= 3.8 && lateralProj < 1.35) {
          this.hasObstacle = true;
          this.isBlocked = true;
          return true;
        }
      }
    }

    this.hasObstacle = false;
    this.isBlocked = false;
    return false;
  }

  probeObstacle(distance = 2.5) {
    return this.checkObstacle(distance);
  }

  isObstacleAhead(distance = 2.5) {
    return this.checkObstacle(distance);
  }

  /**
   * Checks if candidate car position penetrates any solid obstacle block or wall
   */
  isCollisionAt(x, z, hx, hz) {
    if (!this.world || typeof this.world.getBlock !== 'function') return false;
    const curY = Math.floor(this.position.y || 25);
    const isCircle = Boolean(this.route && (this.route.type === 'circle' || this.route === 'circle'));
    const hasLineEndpoint = (!isCircle && this.route && typeof this.route.x2 === 'number' && typeof this.route.z2 === 'number');
    const remainingRouteDist = hasLineEndpoint
      ? Math.hypot(this.route.x2 - x, this.route.z2 - z)
      : Infinity;

    // Bumper check: front center and front corners (3 points) plus body points
    const collisionOffsets = [
      [0.0, 1.55],
      [-0.60, 1.55],
      [0.60, 1.55],
      [0.0, 1.0],
      [-0.60, 1.0],
      [0.60, 1.0]
    ];
    const perpX = hz;
    const perpZ = -hx;

    for (const [lat, fwd] of collisionOffsets) {
      if (fwd > remainingRouteDist + 0.25) continue;
      const cx = x + hx * fwd + perpX * lat;
      const cz = z + hz * fwd + perpZ * lat;

      const bx = Math.round(cx);
      const bz = Math.round(cz);
      if (Math.abs(lat) > 0.01 && typeof this.world.isRoadAt === 'function' && !this.world.isRoadAt(bx, bz)) {
        continue;
      }

      const roadSurfaceY = (typeof this.world.getRoadHeightAt === 'function')
        ? this.world.getRoadHeightAt(bx, bz)
        : (curY >= 25 ? curY - 1 : 24);

      const yLevels = [Math.floor(roadSurfaceY) + 1, Math.floor(roadSurfaceY) + 2];

      for (const iy of yLevels) {
        if (isSolidOrObstacle(this.world.getBlock(bx, iy, bz))) {
          return true;
        }
      }
    }
    return false;
  }

  setTaillightsBraking(isBraking) {
    const emissiveColor = isBraking ? 0xff0000 : 0x991b1b;
    if (this.taillightMat && this.taillightMat.emissive && typeof this.taillightMat.emissive.setHex === 'function') {
      this.taillightMat.emissive.setHex(emissiveColor);
    }
    if (Array.isArray(this.taillights)) {
      for (const tl of this.taillights) {
        if (tl && tl.material && tl.material.emissive && typeof tl.material.emissive.setHex === 'function') {
          tl.material.emissive.setHex(emissiveColor);
        }
      }
    }
  }

  buildCarModel(bodyColor) {
    const paintMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const chassisMat = new THREE.MeshLambertMaterial({ color: 0x1e232a });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.78 });
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x111317 });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0xe2e8f0 });
    const headlightMat = new THREE.MeshLambertMaterial({ color: 0xfef08a, emissive: 0xca8a04 });
    const taillightMat = new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0x991b1b });
    this.taillightMat = taillightMat;
    this.headlightMat = headlightMat;
    this.taillights = [];
    this.headlights = [];

    // Lower chassis & bumpers (1.6m wide, 0.45m tall, 3.1m long)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.42, 3.1), chassisMat);
    chassis.position.set(0, 0.42, 0);
    chassis.castShadow = true;
    this.group.add(chassis);

    // Main painted car body
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.52, 2.95), paintMat);
    lowerBody.position.set(0, 0.72, 0);
    lowerBody.castShadow = true;
    this.group.add(lowerBody);

    // Greenhouse cabin roof & windows
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.55, 1.65), paintMat);
    cabin.position.set(0, 1.22, -0.1);
    cabin.castShadow = true;
    this.group.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.46, 1.72), glassMat);
    windshield.position.set(0, 1.20, -0.1);
    this.group.add(windshield);

    // Twin Headlights (+Z front) & Twin Taillights (-Z rear)
    for (const lx of [-0.52, 0.52]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.08), headlightMat);
      hl.position.set(lx, 0.74, 1.50);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.08), taillightMat);
      tl.position.set(lx, 0.74, -1.50);
      this.group.add(hl, tl);
      this.headlights.push(hl);
      this.taillights.push(tl);
    }

    // 4 Rotating Voxel Wheels
    const wheelOffsets = [
      [-0.82, 0.34, 0.95],
      [0.82, 0.34, 0.95],
      [-0.82, 0.34, -0.95],
      [0.82, 0.34, -0.95]
    ];
    for (const [wx, wy, wz] of wheelOffsets) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wx, wy, wz);
      const tire = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.64, 0.64), tireMat);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.32), rimMat);
      wheelGroup.add(tire, rim);
      this.wheels.push(wheelGroup);
      this.group.add(wheelGroup);
    }
  }

  update(dt = 0.016) {
    const clampedDt = Math.min(Math.max(dt, 0), 0.1);

    // Heading and orientation
    this.rotationY = this.computeRotationAtProgress(this.progress);
    const heading = this.getHeadingVector();
    const hx = heading.x;
    const hz = heading.z;

    // Obstacle detection raycasting (up to 8 blocks ahead)
    const obsAhead = this.checkObstacleAhead(8.0);
    // Legacy probe for compatibility with test assertions on checkObstacle(2.5)
    const probeBlocked = this.checkObstacle(this.probeDistance);
    const obstacleDetected = (obsAhead !== null) || probeBlocked;

    this.hasObstacle = obstacleDetected;
    this.isBlocked = obstacleDetected;

    // Target speed calculation:
    // - If obstacle distance <= 1.8m: set target speed = 0, halt completely before obstacle
    // - If obstacle distance 1.8m < d <= 7.5m: smoothly decelerate linearly toward 0
    // - When clear: target speed = maxSpeed (cruising speed 8.0 .. 14.0 m/s)
    let targetSpeed = this.maxSpeed;
    let isBraking = false;

    if (obsAhead) {
      const d = obsAhead.distance;
      if (d <= 1.8) {
        targetSpeed = 0.0;
        isBraking = true;
      } else if (d <= 7.5) {
        // Smooth linear deceleration toward 0
        const factor = (d - 1.8) / (7.5 - 1.8);
        targetSpeed = this.maxSpeed * Math.max(0, Math.min(1, factor));
        isBraking = true;
      }
    } else if (probeBlocked) {
      targetSpeed = 0.0;
      isBraking = true;
    }

    this.targetSpeed = targetSpeed;

    // Smooth deceleration / acceleration toward targetSpeed
    if (this.currentSpeed > targetSpeed) {
      this.currentSpeed = Math.max(targetSpeed, this.currentSpeed - this.decelerationRate * clampedDt);
      this.isBraking = true;
    } else if (this.currentSpeed < targetSpeed) {
      this.currentSpeed = Math.min(targetSpeed, this.currentSpeed + this.accelerationRate * clampedDt);
      this.isBraking = false;
    } else {
      this.isBraking = isBraking;
    }

    this.speed = this.currentSpeed;
    this.isStopped = (this.currentSpeed <= 0.001);
    if (this.isStopped) {
      this.currentSpeed = 0;
      this.speed = 0;
    }
    this.isHalted = (this.currentSpeed === 0 && obstacleDetected);

    // If obstacle is <= 1.8m, enforce complete halt without clipping or passing through
    if (obsAhead && obsAhead.distance <= 1.8) {
      this.currentSpeed = 0;
      this.speed = 0;
      this.isStopped = true;
      this.isHalted = true;
      this.isBraking = true;
    }

    // Taillight brake light indication:
    // While braking or halted, set vehicle taillights to bright red emissive (0xff0000).
    // When obstacle clears or is removed, restore normal taillights (0x991b1b).
    const isBrakingOrHalted = this.isBraking || this.isHalted || (this.isStopped && obstacleDetected);
    this.setTaillightsBraking(isBrakingOrHalted);

    // Advance vehicle along lane if moving
    if (this.currentSpeed > 0) {
      let candidateProgress = this.progress;
      let candPos;

      if (this.route.type === 'circle') {
        const angularSpeed = this.currentSpeed / this.route.radius;
        candidateProgress = (this.progress + angularSpeed * clampedDt) % (Math.PI * 2);
        candPos = this.computePositionAtProgress(candidateProgress);
      } else {
        const dx = this.route.x2 - this.route.x1;
        const dz = this.route.z2 - this.route.z1;
        const totalLen = Math.hypot(dx, dz) || 1;
        candidateProgress = this.progress + (this.currentSpeed * clampedDt) / totalLen;
        if (candidateProgress > 1) {
          candidateProgress -= 1;
        }
        candPos = this.computePositionAtProgress(candidateProgress);
      }

      // Check if moving to candidate position would cause bumper to collide with an obstacle
      const candHeading = this.route.type === 'circle'
        ? { x: -Math.sin(candidateProgress), z: Math.cos(candidateProgress) }
        : heading;

      if (this.isCollisionAt(candPos.x, candPos.z, candHeading.x, candHeading.z)) {
        // Halt before colliding
        this.currentSpeed = 0;
        this.speed = 0;
        this.isStopped = true;
        this.isHalted = true;
        this.isBraking = true;
        this.setTaillightsBraking(true);
      } else {
        this.progress = candidateProgress;
        this.position.set(candPos.x, candPos.y, candPos.z);
        this.rotationY = this.computeRotationAtProgress(this.progress);
      }
    } else {
      // Re-anchor Y to road height when stationary
      const roadY = (this.world && typeof this.world.getRoadHeightAt === 'function')
        ? this.world.getRoadHeightAt(Math.round(this.position.x), Math.round(this.position.z)) + 1
        : (this.position.y || 25);
      this.position.y = roadY;
    }

    // Update 3D scene group transform
    if (this.group) {
      if (this.group.position && typeof this.group.position.copy === 'function') {
        this.group.position.copy(this.position);
      }
      if (this.group.rotation) {
        this.group.rotation.y = this.rotationY;
      }
    }

    // Spin wheels proportionally to linear speed
    const wheelSpin = this.currentSpeed * clampedDt * 2.6;
    for (const w of this.wheels) {
      if (w && w.rotation) {
        w.rotation.x += wheelSpin;
      }
    }
  }
}

export class TrafficManager {
  constructor(arg1, arg2) {
    if (arg1 && typeof arg1.getBlock === 'function' && arg2 && typeof arg2.add === 'function') {
      this.scene = arg2;
      this.world = arg1;
    } else if (arg1 && typeof arg1.getBlock === 'function') {
      this.world = arg1;
      this.scene = arg2;
    } else if (arg2 && typeof arg2.getBlock === 'function') {
      this.scene = arg1;
      this.world = arg2;
    } else {
      this.scene = arg1;
      this.world = arg2;
    }
    this.cars = [];
    this.initHighwayTraffic();
  }

  initHighwayTraffic() {
    const routes = [
      // Central Roundabout Ring (radius 21 around Spawn Plaza)
      { type: 'circle', cx: 0, cz: 0, radius: 21.0, speed: 9.0, initialProgress: 0.0, color: 0xd92b2b },
      { type: 'circle', cx: 0, cz: 0, radius: 21.0, speed: 9.0, initialProgress: Math.PI, color: 0xf4b41b },

      // North & South Arterial Highways (staying on unobstructed highway lanes outside Central Plaza altar)
      { type: 'line', x1: 1.6, z1: -435, x2: 1.6, z2: -23, speed: 12.0, initialProgress: 0.15, color: 0x2563eb },
      { type: 'line', x1: 1.6, z1: 23, x2: 1.6, z2: 430, speed: 12.0, initialProgress: 0.25, color: 0x10b981 },
      { type: 'line', x1: -1.6, z1: 430, x2: -1.6, z2: 23, speed: 12.0, initialProgress: 0.30, color: 0xf97316 },
      { type: 'line', x1: -1.6, z1: -23, x2: -1.6, z2: -435, speed: 12.0, initialProgress: 0.45, color: 0xf1f5f9 },

      // East & West Central Highways (staying on unobstructed highway lanes outside Central Plaza altar)
      { type: 'line', x1: 23, z1: 1.6, x2: 224, z2: 1.6, speed: 11.5, initialProgress: 0.20, color: 0xd92b2b },
      { type: 'line', x1: -23, z1: -1.6, x2: -224, z2: -1.6, speed: 11.5, initialProgress: 0.35, color: 0xf4b41b },

      // Eastern Connector Highway (Paris (+250,-250) <-> Japan (+250,+250) along X = 229)
      { type: 'line', x1: 230.5, z1: -220, x2: 230.5, z2: 220, speed: 11.5, initialProgress: 0.20, color: 0x10b981 },
      { type: 'line', x1: 227.5, z1: 220, x2: 227.5, z2: -220, speed: 11.5, initialProgress: 0.70, color: 0x2563eb },

      // Western Connector Highway (New York (-250,-250) <-> Shanghai (-250,+250) along X = -229)
      { type: 'line', x1: -227.5, z1: -220, x2: -227.5, z2: 220, speed: 11.5, initialProgress: 0.35, color: 0xf4b41b },
      { type: 'line', x1: -230.5, z1: 220, x2: -230.5, z2: -220, speed: 11.5, initialProgress: 0.80, color: 0xd92b2b }
    ];

    for (const r of routes) {
      const car = new VoxelCar(r, this.scene, this.world);
      car.trafficManager = this;
      this.cars.push(car);
    }
  }

  getCars() {
    return this.cars;
  }

  update(dt) {
    for (const car of this.cars) {
      car.update(dt);
    }
  }
}

export class AnimalManager {
  constructor(arg1, arg2) {
    if (arg1 && typeof arg1.getBlock === 'function' && arg2 && typeof arg2.add === 'function') {
      this.scene = arg2;
      this.world = arg1;
    } else {
      this.scene = arg1;
      this.world = arg2;
    }
    this.animals = [];
    this.animalsById = new Map();
    this.npcs = [];
    this.weaponsMode = false;
    this.serverSynced = false;

    // Initialize highway traffic & rare non-human NPCs
    this.traffic = new TrafficManager(this.scene, this.world);
    this.initRareNpcs();
    this.initLocalAnimals();
  }

  initRareNpcs() {
    const npcConfigs = [
      { id: 'npc_golem', kind: 'golem', name: 'Gólem de Runas', x: 15, z: 15 },
      { id: 'npc_jade', kind: 'jade_spirit', name: 'Dragón Espíritu de Jade', x: 256, z: 256 },
      { id: 'npc_drone', kind: 'mecha_drone', name: 'Centinela Cyber-Drone', x: -246, z: 246 },
      { id: 'npc_void', kind: 'void_walker', name: 'Acechador del Vacío', x: 244, z: -246 },
      { id: 'npc_yeti', kind: 'frost_yeti', name: 'Coloso Escarcha Nórdico', x: 16, z: 490 },
      { id: 'npc_crab', kind: 'coral_crab', name: 'Rey Cangrejo de Coral', x: 12, z: -492 }
    ];
    for (const cfg of npcConfigs) {
      this.npcs.push(new RareNonHumanNpc(cfg, this.scene, this.world));
    }
  }

  initLocalAnimals() {
    // 18 ambient animals across all 6 species: sheep, pig, cow, chicken, wolf, horse
    const types = [
      'sheep', 'sheep', 'sheep',
      'pig', 'pig', 'pig',
      'cow', 'cow', 'cow',
      'chicken', 'chicken', 'chicken',
      'wolf', 'wolf', 'wolf',
      'horse', 'horse', 'horse'
    ];
    for (let i = 0; i < types.length; i++) {
      const animal = new VoxelAnimal(types[i], this.scene, this.world, `local_${i + 1}`);
      animal.spawnNear(0, 0, 18, 45);
      this.animals.push(animal);
      this.animalsById.set(animal.id, animal);
    }
  }

  /**
   * Synchronize animal states from the authoritative multiplayer server
   */
  syncAnimalsFromServer(serverList) {
    if (!Array.isArray(serverList)) return;

    if (!this.serverSynced) {
      // Clear initial local-only animals when first authoritative server snapshot arrives
      for (const a of this.animals) {
        a.dispose();
      }
      this.animals = [];
      this.animalsById.clear();
      this.serverSynced = true;
    }

    const activeIds = new Set();
    for (const item of serverList) {
      if (!item || !item.id) continue;
      activeIds.add(item.id);
      let animal = this.animalsById.get(item.id);
      if (!animal) {
        const species = ANIMAL_SPECIES.includes(item.type) ? item.type : 'sheep';
        animal = new VoxelAnimal(species, this.scene, this.world, item.id);
        animal.position.set(item.x, item.y, item.z);
        this.animals.push(animal);
        this.animalsById.set(item.id, animal);
      }
      animal.applyServerState(item);
    }

    // Remove animals that were despawned or burst on server
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (a.isDying) continue; // Keep entity visible during 3-second knockback / despawn
      if (!activeIds.has(a.id)) {
        a.dispose();
        this.animalsById.delete(a.id);
        this.animals.splice(i, 1);
      }
    }
  }

  /**
   * Toggle Weapons Mode locally (increases local animal density if offline; server handles online density)
   */
  setWeaponsMode(enabled, playerPos = { x: 0, z: 0 }) {
    this.weaponsMode = Boolean(enabled);
    if (this.serverSynced) return;

    const targetCount = this.weaponsMode ? 28 : 18;
    while (this.animals.length < targetCount) {
      const type = ANIMAL_SPECIES[this.animals.length % ANIMAL_SPECIES.length];
      const id = `local_${Date.now()}_${this.animals.length}`;
      const animal = new VoxelAnimal(type, this.scene, this.world, id);
      animal.spawnNear(playerPos.x || 0, playerPos.z || 0, 14, 42);
      this.animals.push(animal);
      this.animalsById.set(id, animal);
    }
    while (this.animals.length > targetCount) {
      const removed = this.animals.pop();
      if (removed) {
        this.animalsById.delete(removed.id);
        removed.dispose();
      }
    }
  }

  /**
   * Raycast against active animals and rare non-human NPCs for rifle shooting
   */
  getHitAnimal(rayOrigin, rayDir, maxDist = 75) {
    let closest = null;
    let closestDist = maxDist;
    let isNpc = false;

    for (const animal of this.animals) {
      if (animal.isDying) continue;
      const center = new THREE.Vector3(animal.position.x, animal.position.y + 0.65, animal.position.z);
      const toCenter = center.clone().sub(rayOrigin);
      const proj = toCenter.dot(rayDir);
      if (proj < 0 || proj > closestDist) continue;

      const perpDistSq = toCenter.lengthSq() - proj * proj;
      const hitRadius = animal.type === 'horse' || animal.type === 'cow' ? 1.05 : 0.85;
      if (perpDistSq <= hitRadius * hitRadius) {
        closestDist = proj;
        closest = animal;
        isNpc = false;
      }
    }

    // Also raycast against extraordinary rare non-human NPCs
    for (const npc of this.npcs) {
      if (npc.isDying) continue;
      const center = new THREE.Vector3(npc.position.x, npc.position.y + 1.2, npc.position.z);
      const toCenter = center.clone().sub(rayOrigin);
      const proj = toCenter.dot(rayDir);
      if (proj < 0 || proj > closestDist) continue;

      const perpDistSq = toCenter.lengthSq() - proj * proj;
      const hitRadius = 1.35;
      if (perpDistSq <= hitRadius * hitRadius) {
        closestDist = proj;
        closest = npc;
        isNpc = true;
      }
    }

    if (!closest) return null;
    return {
      id: closest.id || (closest.config && closest.config.id) || 'npc',
      type: closest.type || (closest.config && closest.config.kind) || 'animal',
      x: closest.position.x,
      y: closest.position.y + (isNpc ? 1.0 : 0.6),
      z: closest.position.z,
      distance: closestDist,
      isNpc
    };
  }

  /**
   * Burst / knockback an animal or NPC when shot or caught in a TNT explosion
   */
  burstAnimal(id, playerPos = { x: 0, z: 0 }, dir = null) {
    const animal = this.animalsById.get(id);
    if (animal) {
      animal.triggerHit(dir);
      return {
        x: animal.position.x,
        y: animal.position.y + 0.6,
        z: animal.position.z,
        type: animal.type
      };
    }

    const npc = this.npcs.find(n => n.id === id || (n.config && n.config.id === id));
    if (npc) {
      npc.triggerHit(dir);
      return {
        x: npc.position.x,
        y: npc.position.y + 1.0,
        z: npc.position.z,
        type: npc.config ? npc.config.kind : 'npc'
      };
    }

    return null;
  }

  triggerAnimalHit(id, dir = null) {
    return this.burstAnimal(id, { x: 0, z: 0 }, dir);
  }

  update(dt, playerPos) {
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const animal = this.animals[i];
      animal.update(dt, playerPos);
      if (animal.isDying && animal.despawnTimer <= 0) {
        animal.dispose();
        this.animalsById.delete(animal.id);
        this.animals.splice(i, 1);
      }
    }
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const npc = this.npcs[i];
      npc.update(dt);
      if (npc.isDying && npc.despawnTimer <= 0) {
        npc.dispose();
        this.npcs.splice(i, 1);
      }
    }
    if (this.traffic) {
      this.traffic.update(dt);
    }
  }
}
