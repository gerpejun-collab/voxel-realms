// public/src/animals.js
// Procedural Minecraft-style voxel fauna: articulated cubic sheep, pigs & cows with autonomous wandering AI
import * as THREE from 'three';

class VoxelAnimal {
  constructor(type, x, z, world, scene) {
    this.type = type; // 'sheep' | 'pig' | 'cow'
    this.world = world;
    this.scene = scene;

    this.group = new THREE.Group();
    const spawnY = this.getGroundY(x, z);
    this.pos = new THREE.Vector3(x, spawnY, z);
    this.group.position.copy(this.pos);

    this.yaw = Math.random() * Math.PI * 2;
    this.targetYaw = this.yaw;
    this.speed = (type === 'pig') ? 1.4 : ((type === 'cow') ? 1.0 : 1.15);

    // AI State
    this.state = 'idle'; // 'idle' | 'walking' | 'grazing'
    this.stateTimer = 1.0 + Math.random() * 3.0;
    this.walkDirection = new THREE.Vector3();
    this.walkTimer = 0;
    this.animTime = Math.random() * 10;
    this.grazeAmount = 0;

    this.buildModel();
    this.scene.add(this.group);
  }

  getGroundY(wx, wz) {
    let groundY = this.world.getHeightAt(wx, wz);
    const bx = Math.floor(wx);
    const bz = Math.floor(wz);
    // Ascend if solid block is placed on top
    while (groundY < 60 && this.world.getBlock(bx, groundY + 1, bz) !== 0) {
      groundY++;
    }
    // Block occupies [groundY, groundY + 1), standing surface is at groundY + 1.0
    return groundY + 1.0;
  }

  buildModel() {
    if (this.type === 'sheep') {
      this.buildSheepModel();
    } else if (this.type === 'cow') {
      this.buildCowModel();
    } else {
      this.buildPigModel();
    }
  }

  buildSheepModel() {
    const woolMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.95 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.8 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 });

    // Woolly Body (y = 0.75)
    const bodyGeom = new THREE.BoxGeometry(0.85, 0.7, 1.15);
    const bodyMesh = new THREE.Mesh(bodyGeom, woolMat);
    bodyMesh.position.set(0, 0.75, 0);
    bodyMesh.castShadow = true;
    this.group.add(bodyMesh);

    // Head group (pivot at front y = 0.95, z = 0.6)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.95, 0.6);

    // Sheep head base
    const headGeom = new THREE.BoxGeometry(0.4, 0.4, 0.45);
    const headMesh = new THREE.Mesh(headGeom, skinMat);
    headMesh.position.set(0, 0, 0.15);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    // Woolly crown on head
    const woolCapGeom = new THREE.BoxGeometry(0.42, 0.22, 0.35);
    const woolCap = new THREE.Mesh(woolCapGeom, woolMat);
    woolCap.position.set(0, 0.14, 0.08);
    this.headGroup.add(woolCap);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
    eyeL.position.set(-0.205, 0.05, 0.22);
    const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
    eyeR.position.set(0.205, 0.05, 0.22);
    this.headGroup.add(eyeL);
    this.headGroup.add(eyeR);

    this.group.add(this.headGroup);

    // 4 Articulated Legs (Leg pivot at y = 0.5)
    this.legPivots = [];
    const legOffsets = [
      [-0.28, 0.5, 0.35],  // Front Left
      [0.28, 0.5, 0.35],   // Front Right
      [-0.28, 0.5, -0.35], // Back Left
      [0.28, 0.5, -0.35]   // Back Right
    ];

    const legGeom = new THREE.BoxGeometry(0.22, 0.55, 0.22);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(...legOffsets[i]);
      const legMesh = new THREE.Mesh(legGeom, skinMat);
      legMesh.position.y = -0.25;
      legMesh.castShadow = true;
      pivot.add(legMesh);
      this.group.add(pivot);
      this.legPivots.push(pivot);
    }
  }

  buildPigModel() {
    const pigPinkMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.75 });
    const snoutMat = new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.7 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 });

    // Torso Body (y = 0.65)
    const bodyGeom = new THREE.BoxGeometry(0.8, 0.65, 1.1);
    const bodyMesh = new THREE.Mesh(bodyGeom, pigPinkMat);
    bodyMesh.position.set(0, 0.65, 0);
    bodyMesh.castShadow = true;
    this.group.add(bodyMesh);

    // Head group (pivot at front y = 0.8, z = 0.55)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.8, 0.55);

    const headGeom = new THREE.BoxGeometry(0.48, 0.45, 0.48);
    const headMesh = new THREE.Mesh(headGeom, pigPinkMat);
    headMesh.position.set(0, 0, 0.15);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    // Iconic protruding snout
    const snoutGeom = new THREE.BoxGeometry(0.24, 0.14, 0.1);
    const snoutMesh = new THREE.Mesh(snoutGeom, snoutMat);
    snoutMesh.position.set(0, -0.06, 0.4);
    this.headGroup.add(snoutMesh);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
    eyeL.position.set(-0.245, 0.06, 0.24);
    const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
    eyeR.position.set(0.245, 0.06, 0.24);
    this.headGroup.add(eyeL);
    this.headGroup.add(eyeR);

    this.group.add(this.headGroup);

    // 4 Stubby Articulated Legs
    this.legPivots = [];
    const legOffsets = [
      [-0.26, 0.42, 0.32],
      [0.26, 0.42, 0.32],
      [-0.26, 0.42, -0.32],
      [0.26, 0.42, -0.32]
    ];

    const legGeom = new THREE.BoxGeometry(0.2, 0.45, 0.2);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(...legOffsets[i]);
      const legMesh = new THREE.Mesh(legGeom, pigPinkMat);
      legMesh.position.y = -0.2;
      legMesh.castShadow = true;
      pivot.add(legMesh);
      this.group.add(pivot);
      this.legPivots.push(pivot);
    }
  }

  buildCowModel() {
    const cowBrownMat = new THREE.MeshStandardMaterial({ color: 0x4a3325, roughness: 0.85 });
    const cowWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.85 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.5 });
    const muzzleMat = new THREE.MeshStandardMaterial({ color: 0xbfa393, roughness: 0.7 });
    const udderMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.7 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 });

    // Body (y = 0.8)
    const bodyGeom = new THREE.BoxGeometry(0.9, 0.75, 1.25);
    const bodyMesh = new THREE.Mesh(bodyGeom, cowBrownMat);
    bodyMesh.position.set(0, 0.8, 0);
    bodyMesh.castShadow = true;
    this.group.add(bodyMesh);

    // White cow spots on torso
    const spotGeom = new THREE.BoxGeometry(0.92, 0.5, 0.6);
    const spotMesh = new THREE.Mesh(spotGeom, cowWhiteMat);
    spotMesh.position.set(0, 0.82, -0.1);
    this.group.add(spotMesh);

    // Udder beneath belly
    const udderGeom = new THREE.BoxGeometry(0.24, 0.12, 0.28);
    const udderMesh = new THREE.Mesh(udderGeom, udderMat);
    udderMesh.position.set(0, 0.38, -0.25);
    this.group.add(udderMesh);

    // Head group (pivot at front y = 0.95, z = 0.65)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.95, 0.65);

    const headGeom = new THREE.BoxGeometry(0.48, 0.46, 0.48);
    const headMesh = new THREE.Mesh(headGeom, cowBrownMat);
    headMesh.position.set(0, 0, 0.12);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    // Cow Muzzle
    const muzzleGeom = new THREE.BoxGeometry(0.32, 0.2, 0.14);
    const muzzleMesh = new THREE.Mesh(muzzleGeom, muzzleMat);
    muzzleMesh.position.set(0, -0.1, 0.38);
    this.headGroup.add(muzzleMesh);

    // 2 Iconic Horns
    const hornGeom = new THREE.BoxGeometry(0.08, 0.16, 0.08);
    const hornL = new THREE.Mesh(hornGeom, hornMat);
    hornL.position.set(-0.25, 0.28, 0.06);
    const hornR = new THREE.Mesh(hornGeom, hornMat);
    hornR.position.set(0.25, 0.28, 0.06);
    this.headGroup.add(hornL);
    this.headGroup.add(hornR);

    // Eyes
    const eyeGeom = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
    eyeL.position.set(-0.245, 0.08, 0.22);
    const eyeR = new THREE.Mesh(eyeGeom, eyeMat);
    eyeR.position.set(0.245, 0.08, 0.22);
    this.headGroup.add(eyeL);
    this.headGroup.add(eyeR);

    this.group.add(this.headGroup);

    // 4 Legs
    this.legPivots = [];
    const legOffsets = [
      [-0.28, 0.5, 0.4],
      [0.28, 0.5, 0.4],
      [-0.28, 0.5, -0.4],
      [0.28, 0.5, -0.4]
    ];

    const legGeom = new THREE.BoxGeometry(0.22, 0.6, 0.22);
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(...legOffsets[i]);
      const legMesh = new THREE.Mesh(legGeom, cowBrownMat);
      legMesh.position.y = -0.25;
      legMesh.castShadow = true;
      pivot.add(legMesh);
      this.group.add(pivot);
      this.legPivots.push(pivot);
    }
  }

  update(dt) {
    this.animTime += dt;
    this.stateTimer -= dt;

    // AI State Transitions
    if (this.stateTimer <= 0) {
      const roll = Math.random();
      if (roll < 0.45) {
        // Switch to walking
        this.state = 'walking';
        this.stateTimer = 2.0 + Math.random() * 4.0;
        this.targetYaw = this.yaw + (Math.random() - 0.5) * 2.2;
        this.walkDirection.set(Math.sin(this.targetYaw), 0, Math.cos(this.targetYaw)).normalize();
      } else if (roll < 0.75) {
        // Switch to grazing
        this.state = 'grazing';
        this.stateTimer = 2.0 + Math.random() * 3.0;
      } else {
        // Idle looking around
        this.state = 'idle';
        this.stateTimer = 1.5 + Math.random() * 3.0;
        this.targetYaw = this.yaw + (Math.random() - 0.5) * 1.0;
      }
    }

    // Smooth rotation towards target yaw
    let angleDiff = this.targetYaw - this.yaw;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    this.yaw += angleDiff * Math.min(1.0, dt * 5.0);
    this.group.rotation.y = this.yaw;

    // Walking movement & leg animation
    if (this.state === 'walking') {
      const moveDist = this.speed * dt;
      const nextX = this.pos.x + Math.sin(this.yaw) * moveDist;
      const nextZ = this.pos.z + Math.cos(this.yaw) * moveDist;

      // Ensure terrain height is walkable (not plunging into deep water)
      const targetY = this.getGroundY(nextX, nextZ);
      if (targetY >= 19 && targetY <= 48) {
        this.pos.x = nextX;
        this.pos.z = nextZ;
        this.pos.y += (targetY - this.pos.y) * Math.min(1.0, dt * 10.0);
      } else {
        // Turn around on steep drop or water
        this.targetYaw += Math.PI;
      }

      // Minecraft quadruped walk swing: diagonal pairs swing in sync
      const swing = Math.sin(this.animTime * 7.0) * 0.55;
      if (this.legPivots && this.legPivots.length === 4) {
        this.legPivots[0].rotation.x = swing;   // Front Left
        this.legPivots[1].rotation.x = -swing;  // Front Right
        this.legPivots[2].rotation.x = -swing;  // Back Left
        this.legPivots[3].rotation.x = swing;   // Back Right
      }
    } else {
      // Return legs to upright
      if (this.legPivots) {
        for (const pivot of this.legPivots) {
          pivot.rotation.x *= Math.max(0, 1.0 - dt * 8.0);
        }
      }
    }

    // Head grazing animation (dips down when grazing)
    const targetGraze = (this.state === 'grazing') ? 0.65 : 0;
    this.grazeAmount += (targetGraze - this.grazeAmount) * Math.min(1.0, dt * 6.0);
    if (this.headGroup) {
      this.headGroup.rotation.x = this.grazeAmount;
    }

    this.group.position.copy(this.pos);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}

export class AnimalManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.animals = [];

    this.spawnInitialFlock();
  }

  spawnInitialFlock() {
    // Ambient sheep, pigs, and cows around grassy zones near spawn and monuments
    const spawnPoints = [
      { type: 'sheep', x: 8, z: 12 },
      { type: 'sheep', x: 12, z: 14 },
      { type: 'cow',   x: 10, z: 18 },
      { type: 'cow',   x: -8, z: 16 },
      { type: 'pig',   x: -10, z: 12 },
      { type: 'pig',   x: -14, z: 10 },
      { type: 'sheep', x: 14, z: -10 },
      { type: 'cow',   x: 18, z: -14 },
      { type: 'pig',   x: -12, z: -12 },
      { type: 'sheep', x: 26, z: 34 }  // Japan garden sheep
    ];

    for (const pt of spawnPoints) {
      const animal = new VoxelAnimal(pt.type, pt.x, pt.z, this.world, this.scene);
      this.animals.push(animal);
    }
  }

  update(dt) {
    for (const animal of this.animals) {
      animal.update(dt);
    }
  }

  dispose() {
    for (const animal of this.animals) {
      animal.dispose();
    }
    this.animals = [];
  }
}
