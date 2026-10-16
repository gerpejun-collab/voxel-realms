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

  update(dt, playerPos) {
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

  update(dt) {
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
 * Realistic Voxel Car that drives deterministically along structured highway lanes
 */
export class VoxelCar {
  constructor(route, arg1, arg2) {
    this.route = route;
    if (arg1 && typeof arg1.getBlock === 'function' && arg2 && typeof arg2.add === 'function') {
      this.scene = arg2;
      this.world = arg1;
    } else {
      this.scene = arg1;
      this.world = arg2;
    }
    this.group = new THREE.Group();
    this.wheels = [];
    this.progress = route.initialProgress || 0;
    this.speed = route.speed || 9.5;
    this.direction = 1;
    this.position = new THREE.Vector3();
    this.rotationY = 0;

    this.buildCarModel(route.color || 0xd92b2b);
    this.scene.add(this.group);
    this.update(0.016);
  }

  buildCarModel(bodyColor) {
    const paintMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const chassisMat = new THREE.MeshLambertMaterial({ color: 0x1e232a });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.78 });
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x111317 });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0xe2e8f0 });
    const headlightMat = new THREE.MeshLambertMaterial({ color: 0xfef08a, emissive: 0xca8a04 });
    const taillightMat = new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0x991b1b });

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

  update(dt) {
    if (this.route.type === 'circle') {
      // Smooth circular roundabout route around Central Spawn Plaza
      const angularSpeed = this.speed / this.route.radius;
      this.progress = (this.progress + angularSpeed * dt) % (Math.PI * 2);
      const wx = this.route.cx + Math.cos(this.progress) * this.route.radius;
      const wz = this.route.cz + Math.sin(this.progress) * this.route.radius;
      const roadY = (this.world && typeof this.world.getRoadHeightAt === 'function')
        ? this.world.getRoadHeightAt(Math.round(wx), Math.round(wz)) + 1
        : 25;

      this.position.set(wx, roadY, wz);
      // Tangent direction along circle
      const tx = -Math.sin(this.progress);
      const tz = Math.cos(this.progress);
      this.rotationY = Math.atan2(tx, tz);
    } else {
      // Linear highway lane between (x1, z1) and (x2, z2)
      const dx = this.route.x2 - this.route.x1;
      const dz = this.route.z2 - this.route.z1;
      const totalLen = Math.hypot(dx, dz) || 1;
      this.progress += (this.speed * dt) / totalLen;
      if (this.progress > 1) {
        this.progress -= 1;
      }

      const wx = this.route.x1 + dx * this.progress;
      const wz = this.route.z1 + dz * this.progress;
      const roadY = (this.world && typeof this.world.getRoadHeightAt === 'function')
        ? this.world.getRoadHeightAt(Math.round(wx), Math.round(wz)) + 1
        : 25;

      this.position.set(wx, roadY, wz);
      this.rotationY = Math.atan2(dx, dz);
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotationY;

    // Spin wheels proportionally to linear speed
    const wheelSpin = this.speed * dt * 2.6;
    for (const w of this.wheels) {
      w.rotation.x += wheelSpin;
    }
  }
}

export class TrafficManager {
  constructor(arg1, arg2) {
    if (arg1 && typeof arg1.getBlock === 'function' && arg2 && typeof arg2.add === 'function') {
      this.scene = arg2;
      this.world = arg1;
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
      { type: 'circle', cx: 0, cz: 0, radius: 21.0, speed: 7.5, initialProgress: 0.0, color: 0xd92b2b },
      { type: 'circle', cx: 0, cz: 0, radius: 21.0, speed: 7.5, initialProgress: Math.PI, color: 0xf4b41b },

      // North-South Grand Highway (Playa Paraíso <-> Central Plaza <-> Norway Fjords)
      { type: 'line', x1: 1.6, z1: -440, x2: 1.6, z2: 430, speed: 12.0, initialProgress: 0.15, color: 0x2563eb },
      { type: 'line', x1: 1.6, z1: -440, x2: 1.6, z2: 430, speed: 12.0, initialProgress: 0.55, color: 0x10b981 },
      { type: 'line', x1: -1.6, z1: 430, x2: -1.6, z2: -440, speed: 12.0, initialProgress: 0.30, color: 0xf97316 },
      { type: 'line', x1: -1.6, z1: 430, x2: -1.6, z2: -440, speed: 12.0, initialProgress: 0.75, color: 0xf1f5f9 },

      // East-West Central Highway (Western Highway <-> Central Plaza <-> Eastern Highway)
      { type: 'line', x1: -225, z1: 1.6, x2: 225, z2: 1.6, speed: 11.0, initialProgress: 0.25, color: 0xd92b2b },
      { type: 'line', x1: 225, z1: -1.6, x2: -225, z2: -1.6, speed: 11.0, initialProgress: 0.65, color: 0xf4b41b },

      // Eastern Connector Highway (Paris (+250,-250) <-> Japan (+250,+250) along X = 229)
      { type: 'line', x1: 230.5, z1: -245, x2: 230.5, z2: 245, speed: 11.5, initialProgress: 0.20, color: 0x10b981 },
      { type: 'line', x1: 227.5, z1: 245, x2: 227.5, z2: -245, speed: 11.5, initialProgress: 0.70, color: 0x2563eb },

      // Western Connector Highway (New York (-250,-250) <-> Shanghai (-250,+250) along X = -229)
      { type: 'line', x1: -227.5, z1: -245, x2: -227.5, z2: 245, speed: 11.5, initialProgress: 0.35, color: 0xf4b41b },
      { type: 'line', x1: -230.5, z1: 245, x2: -230.5, z2: -245, speed: 11.5, initialProgress: 0.80, color: 0xd92b2b }
    ];

    for (const r of routes) {
      this.cars.push(new VoxelCar(r, this.scene, this.world));
    }
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
   * Raycast against active animals for rifle shooting
   */
  getHitAnimal(rayOrigin, rayDir, maxDist = 75) {
    let closest = null;
    let closestDist = maxDist;

    for (const animal of this.animals) {
      const center = new THREE.Vector3(animal.position.x, animal.position.y + 0.65, animal.position.z);
      const toCenter = center.clone().sub(rayOrigin);
      const proj = toCenter.dot(rayDir);
      if (proj < 0 || proj > closestDist) continue;

      const perpDistSq = toCenter.lengthSq() - proj * proj;
      const hitRadius = animal.type === 'horse' || animal.type === 'cow' ? 1.05 : 0.85;
      if (perpDistSq <= hitRadius * hitRadius) {
        closestDist = proj;
        closest = animal;
      }
    }

    if (!closest) return null;
    return {
      id: closest.id,
      type: closest.type,
      x: closest.position.x,
      y: closest.position.y + 0.6,
      z: closest.position.z
    };
  }

  /**
   * Burst / respawn an animal when shot or caught in a TNT explosion
   */
  burstAnimal(id, playerPos = { x: 0, z: 0 }) {
    const animal = this.animalsById.get(id);
    if (!animal) return null;

    const burstPos = {
      x: animal.position.x,
      y: animal.position.y + 0.6,
      z: animal.position.z,
      type: animal.type
    };

    if (this.serverSynced) {
      animal.dispose();
      this.animalsById.delete(id);
      const idx = this.animals.indexOf(animal);
      if (idx !== -1) this.animals.splice(idx, 1);
    } else {
      animal.spawnNear(playerPos.x || 0, playerPos.z || 0, 18, 44);
    }

    return burstPos;
  }

  update(dt, playerPos) {
    for (const animal of this.animals) {
      animal.update(dt, playerPos);
    }
    for (const npc of this.npcs) {
      npc.update(dt);
    }
    if (this.traffic) {
      this.traffic.update(dt);
    }
  }
}
