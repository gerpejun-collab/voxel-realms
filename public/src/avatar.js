// public/src/avatar.js
// 3D multiplayer humanoid voxel avatar with animated limbs, head rotation, and floating name tag
import * as THREE from 'three';

export class Avatar {
  constructor(id, name, scene, world = null) {
    this.id = id;
    this.name = name;
    this.scene = scene;
    this.world = world;

    // Bounding box dimensions matching player physics exactly
    this.width = 0.6;
    this.height = 1.8;
    this.depth = 0.6;

    // Fall kinematics & ground detection state
    this.velY = 0;
    this.gravity = -26.0;
    this.onGround = true;

    this.group = new THREE.Group();
    this.targetPos = new THREE.Vector3(0, 30, 0);
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.action = 'idle';

    this.animTime = 0;
    this.swingProgress = 0;
    this.buildModel();
    this.createNameTag();

    this.scene.add(this.group);
  }

  get currentPos() {
    return this.group.position;
  }

  set currentPos(val) {
    if (val && typeof val === 'object') {
      this.group.position.copy(val);
    }
  }

  buildModel() {
    // Distinctive color palettes based on player ID hash
    const hash = this.hashString(this.name);
    const shirtColor = new THREE.Color().setHSL((hash % 360) / 360, 0.75, 0.5);
    const pantsColor = new THREE.Color(0x2d3e50);
    const skinColor = new THREE.Color(0xe0ac69);
    const hairColor = new THREE.Color(0x4a2c11);

    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.7 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.8 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.9 });

    // Torso (Minecraft proportions: 8x12x4 pixels -> 0.5 x 0.75 x 0.25 units, height 0.75 spans 0.75 to 1.50)
    const torsoGeom = new THREE.BoxGeometry(0.5, 0.75, 0.25);
    this.torso = new THREE.Mesh(torsoGeom, shirtMat);
    this.torso.position.y = 1.125;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    // Head group (pivot at neck y = 1.50, Minecraft: 8x8x8 pixels -> 0.5 x 0.5 x 0.5 units)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.50, 0);

    const headGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.head = new THREE.Mesh(headGeom, skinMat);
    this.head.position.y = 0.25;
    this.head.castShadow = true;
    this.headGroup.add(this.head);

    // Hair cap layer
    const hairGeom = new THREE.BoxGeometry(0.52, 0.18, 0.52);
    const hair = new THREE.Mesh(hairGeom, hairMat);
    hair.position.y = 0.42;
    this.headGroup.add(hair);

    // Authentic Minecraft Face details on front face (-Z)
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2563eb }); // Classic blue eyes
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x7c2d12 });

    // Eye Whites
    const scleraGeom = new THREE.BoxGeometry(0.08, 0.06, 0.02);
    const scleraL = new THREE.Mesh(scleraGeom, whiteMat);
    scleraL.position.set(-0.13, 0.24, -0.252);
    const scleraR = new THREE.Mesh(scleraGeom, whiteMat);
    scleraR.position.set(0.13, 0.24, -0.252);
    this.headGroup.add(scleraL);
    this.headGroup.add(scleraR);

    // Blue Pupils
    const pupilGeom = new THREE.BoxGeometry(0.045, 0.06, 0.022);
    const pupilL = new THREE.Mesh(pupilGeom, eyeMat);
    pupilL.position.set(-0.15, 0.24, -0.253);
    const pupilR = new THREE.Mesh(pupilGeom, eyeMat);
    pupilR.position.set(0.11, 0.24, -0.253);
    this.headGroup.add(pupilL);
    this.headGroup.add(pupilR);

    // Mouth
    const mouthGeom = new THREE.BoxGeometry(0.14, 0.035, 0.02);
    const mouth = new THREE.Mesh(mouthGeom, mouthMat);
    mouth.position.set(0, 0.10, -0.252);
    this.headGroup.add(mouth);

    // Front Hair Bangs
    const bangsGeom = new THREE.BoxGeometry(0.50, 0.08, 0.04);
    const bangs = new THREE.Mesh(bangsGeom, hairMat);
    bangs.position.set(0, 0.44, -0.245);
    this.headGroup.add(bangs);

    this.group.add(this.headGroup);

    // Left Arm (pivot at shoulder y = 1.375, Minecraft: 4x12x4 pixels -> 0.25 x 0.75 x 0.25 units)
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.375, 1.375, 0);
    const armGeom = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    const leftArmMesh = new THREE.Mesh(armGeom, shirtMat);
    leftArmMesh.position.y = -0.375;
    leftArmMesh.castShadow = true;
    this.leftArmPivot.add(leftArmMesh);
    this.group.add(this.leftArmPivot);

    // Right Arm (pivot at shoulder y = 1.375)
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.375, 1.375, 0);
    const rightArmMesh = new THREE.Mesh(armGeom, skinMat);
    rightArmMesh.position.y = -0.375;
    rightArmMesh.castShadow = true;
    this.rightArmPivot.add(rightArmMesh);
    this.group.add(this.rightArmPivot);

    // Left Leg (pivot at hip y = 0.75, Minecraft: 4x12x4 pixels -> 0.25 x 0.75 x 0.25 units, feet bottom aligns exactly at Y = 0.0)
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.125, 0.75, 0);
    const legGeom = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    const leftLegMesh = new THREE.Mesh(legGeom, pantsMat);
    leftLegMesh.position.y = -0.375;
    leftLegMesh.castShadow = true;
    this.leftLegPivot.add(leftLegMesh);
    this.group.add(this.leftLegPivot);

    // Right Leg (pivot at hip y = 0.75)
    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.125, 0.75, 0);
    const rightLegMesh = new THREE.Mesh(legGeom, pantsMat);
    rightLegMesh.position.y = -0.375;
    rightLegMesh.castShadow = true;
    this.rightLegPivot.add(rightLegMesh);
    this.group.add(this.rightLegPivot);
  }

  createNameTag() {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Rounded background pill (with fallback for browsers lacking roundRect)
    ctx.fillStyle = 'rgba(10, 15, 25, 0.75)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(10, 8, 236, 48, 16);
    } else {
      ctx.rect(10, 8, 236, 48);
    }
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Player name text
    ctx.font = 'bold 26px "Segoe UI", Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.name, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });

    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.position.set(0, 2.25, 0);
    this.nameSprite.scale.set(1.5, 0.375, 1);
    this.group.add(this.nameSprite);
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  }

  /**
   * Calculates the authoritative solid ground height under the avatar's bounding box
   */
  getGroundHeight(x = this.group.position.x, z = this.group.position.z, startY = this.group.position.y) {
    if (!this.world) return 24;

    const halfW = (this.width || 0.6) * 0.5;
    const halfD = (this.depth || 0.6) * 0.5;
    const minX = Math.floor(x - halfW + 0.001);
    const maxX = Math.floor(x + halfW - 0.001);
    const minZ = Math.floor(z - halfD + 0.001);
    const maxZ = Math.floor(z + halfD - 0.001);
    const baseStartY = Math.max(
      startY !== undefined ? startY : this.group.position.y,
      this.targetPos ? this.targetPos.y : 0,
      this.group.position ? this.group.position.y : 0
    );
    const checkStartY = Math.min(63, Math.max(0, Math.floor(baseStartY) + 1));

    // 1. Check voxel terrain if getBlock is available
    if (typeof this.world.getBlock === 'function') {
      for (let y = checkStartY; y >= 0; y--) {
        let hasSolid = false;
        for (let bx = minX; bx <= maxX; bx++) {
          for (let bz = minZ; bz <= maxZ; bz++) {
            const block = this.world.getBlock(bx, y, bz);
            if (block !== 0 && block !== 11) { // 0 = AIR, 11 = WATER
              hasSolid = true;
              break;
            }
          }
          if (hasSolid) break;
        }
        if (hasSolid) {
          return y + 1.0;
        }
      }
    }

    // 2. Fallback to world.getHeightAt if no solid voxels found in loaded chunks
    if (typeof this.world.getHeightAt === 'function') {
      return this.world.getHeightAt(x, z);
    }

    return 24;
  }

  getGroundY(x, z, startY) {
    return this.getGroundHeight(x, z, startY);
  }

  /**
   * Checks whether the specified block coordinates lie directly beneath this avatar's bounding box
   */
  isSupportedByBlock(bx, by, bz) {
    const halfW = (this.width || 0.6) * 0.5;
    const halfD = (this.depth || 0.6) * 0.5;

    // Check against both current rendered position and target position
    const positions = [this.group.position, this.targetPos];
    for (const pos of positions) {
      const minX = Math.floor(pos.x - halfW + 0.001);
      const maxX = Math.floor(pos.x + halfW - 0.001);
      const minZ = Math.floor(pos.z - halfD + 0.001);
      const maxZ = Math.floor(pos.z + halfD - 0.001);

      if (bx >= minX && bx <= maxX && bz >= minZ && bz <= maxZ) {
        const feetBlockY = Math.floor(pos.y - 0.05);
        if (Math.abs(by - feetBlockY) <= 1 || (by < pos.y && by >= pos.y - 1.5)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Immediately updates ground detection when supporting block is removed.
   * Model falls naturally and stands firmly on the newly exposed floor.
   */
  updateGroundDetection(world = this.world) {
    if (this.action === 'driving') return 25;
    if (world) this.world = world;
    const px = this.group.position.x;
    const pz = this.group.position.z;
    const py = this.group.position.y;
    const groundY = this.getGroundHeight(px, pz, py);

    // Update targetPos.y to newly exposed floor
    this.targetPos.y = groundY;

    if (this.group.position.y < groundY) {
      // Sinking/burying prevention: snap up to ground
      this.group.position.y = groundY;
      this.velY = 0;
      this.onGround = true;
    } else if (this.group.position.y > groundY) {
      this.onGround = false;
      if (this.velY >= 0) {
        this.velY = -2.0; // Start falling naturally immediately
      }
    } else {
      this.onGround = true;
      this.velY = 0;
    }

    return groundY;
  }

  /**
   * Validates supporting voxel at Math.floor(x), Math.floor(y - 0.05), Math.floor(z).
   * If BLOCKS.AIR, sets onGround = false and applies downward gravitational velocity.
   */
  updateGroundSupport(world = this.world) {
    if (this.action === 'driving') return true;
    if (world) this.world = world;
    if (!this.world) return false;

    const px = this.group.position.x;
    const py = this.group.position.y;
    const pz = this.group.position.z;

    const bx = Math.floor(px);
    const by = Math.floor(py - 0.05);
    const bz = Math.floor(pz);

    const block = typeof this.world.getBlock === 'function' ? this.world.getBlock(bx, by, bz) : 0;
    // 0 = BLOCKS.AIR, 11 = BLOCKS.WATER
    if (block === 0 || block === 11) {
      this.onGround = false;
      if (this.velY >= 0) {
        this.velY = -2.0; // Apply downward gravitational velocity
      }
      this.updateGroundDetection(this.world);
      return false;
    } else {
      this.onGround = true;
      this.velY = 0;
      return true;
    }
  }

  onSupportingBlockRemoved(bx, by, bz) {
    if (bx !== undefined && by !== undefined && bz !== undefined) {
      if (!this.isSupportedByBlock(bx, by, bz)) {
        return;
      }
    }
    this.updateGroundSupport(this.world);
  }

  setTargetState(pos, rot, action) {
    if (action) {
      this.action = action;
    }
    if (pos) {
      const px = pos[0];
      let py = pos[1];
      const pz = pos[2];

      if (this.world && this.action !== 'driving') {
        const groundY = this.getGroundHeight(px, pz, py);
        // Eliminate burying or sinking glitch: player model must never sink below true voxel ground
        if (py < groundY) {
          py = groundY;
        } else if (this.action !== 'jumping') {
          // If not actively jumping and the supporting block was excavated, stay grounded on exposed floor
          const feetBlockY = Math.floor(py - 0.05);
          const hasSupport = typeof this.world.getBlock === 'function' ?
            (this.world.getBlock(Math.floor(px), feetBlockY, Math.floor(pz)) !== 0) : true;
          if (!hasSupport && Math.abs(py - groundY) <= 1.05) {
            py = groundY;
          }
        }
      }

      this.targetPos.set(px, py, pz);
    }
    if (rot) {
      this.targetYaw = rot[0];
      this.targetPitch = rot[1];
    }
    if (this.action === 'driving') {
      this.group.position.copy(this.targetPos);
      this.group.rotation.y = this.targetYaw;
      this.velY = 0;
      this.onGround = true;
    }
  }

  triggerSwing() {
    this.swingProgress = 1.0;
  }

  update(dt) {
    // Distance snap if teleported/respawned or if seated inside a car
    const distSq = this.group.position.distanceToSquared(this.targetPos);
    if (this.action === 'driving') {
      // Snap directly to cockpit seat position so avatar never lags behind the moving car
      this.group.position.copy(this.targetPos);
      this.group.rotation.y = this.targetYaw;
      this.velY = 0;
      this.onGround = true;
    } else if (distSq > 100) {
      this.group.position.copy(this.targetPos);
      this.velY = 0;
      this.onGround = true;
    } else {
      // Horizontal smooth interpolation (lerp)
      const horizLerp = Math.min(1.0, dt * 14.0);
      this.group.position.x += (this.targetPos.x - this.group.position.x) * horizLerp;
      this.group.position.z += (this.targetPos.z - this.group.position.z) * horizLerp;

      // Vertical movement & natural fall physics
      const groundY = this.getGroundHeight(this.group.position.x, this.group.position.z, this.group.position.y);

      if (this.group.position.y > this.targetPos.y) {
        // Fall naturally using gravity
        this.velY = (this.velY || 0) + (this.gravity || -26.0) * dt;
        this.group.position.y += this.velY * dt;
        if (this.group.position.y <= this.targetPos.y) {
          this.group.position.y = this.targetPos.y;
          this.velY = 0;
          this.onGround = true;
        } else {
          this.onGround = false;
        }
      } else if (this.group.position.y < this.targetPos.y) {
        // Ascending (e.g. jump or step up)
        this.group.position.y += (this.targetPos.y - this.group.position.y) * Math.min(1.0, dt * 14.0);
        this.velY = 0;
      }

      // Eliminate burying or sinking glitch: clamp strictly to true ground floor
      if (this.group.position.y < groundY) {
        this.group.position.y = groundY;
        this.velY = 0;
        this.onGround = true;
      }
    }

    // Smooth yaw rotation (instant lock when driving so avatar rotates with car chassis)
    if (this.action === 'driving') {
      this.group.rotation.y = this.targetYaw;
    } else {
      let angleDiff = this.targetYaw - this.group.rotation.y;
      // Normalize angle difference to [-PI, PI]
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      this.group.rotation.y += angleDiff * Math.min(1.0, dt * 14.0);
    }

    // Head pitch
    this.headGroup.rotation.x = this.targetPitch;

    // Limb animations based on action
    const isMoving = (this.action === 'walking' || this.action === 'running');
    const animSpeed = (this.action === 'running') ? 14.0 : 8.0;
    const swingAmp = (this.action === 'running') ? 0.75 : 0.45;

    // Sprint lean / tilt forward
    const isRunning = (this.action === 'running');
    const targetTorsoTilt = isRunning ? 0.22 : 0;
    this.torso.rotation.x += (targetTorsoTilt - this.torso.rotation.x) * Math.min(1.0, dt * 10.0);

    if (this.action === 'driving') {
      // Seated driving pose inside racing car cockpit
      this.torso.position.y = 0.65;
      this.torso.rotation.x = 0.08;
      this.headGroup.position.y = 1.02;
      this.leftArmPivot.position.y = 0.92;
      this.rightArmPivot.position.y = 0.92;
      this.leftLegPivot.position.y = 0.35;
      this.rightLegPivot.position.y = 0.35;
      // Arms gripping steering wheel forward
      this.leftArmPivot.rotation.x = -1.15;
      this.leftArmPivot.rotation.y = 0.28;
      this.leftArmPivot.rotation.z = 0.15;
      this.rightArmPivot.rotation.x = -1.15;
      this.rightArmPivot.rotation.y = -0.28;
      this.rightArmPivot.rotation.z = -0.15;
      // Legs bent forward at 90 degrees inside cockpit tub
      this.leftLegPivot.rotation.x = -1.48;
      this.leftLegPivot.rotation.y = 0.08;
      this.leftLegPivot.rotation.z = 0.05;
      this.rightLegPivot.rotation.x = -1.48;
      this.rightLegPivot.rotation.y = -0.08;
      this.rightLegPivot.rotation.z = -0.05;
    } else {
      this.torso.position.y = 1.125;
      this.headGroup.position.y = 1.50;
      this.leftArmPivot.position.y = 1.375;
      this.rightArmPivot.position.y = 1.375;
      this.leftLegPivot.position.y = 0.75;
      this.rightLegPivot.position.y = 0.75;

      if (this.action === 'swimming') {
        this.animTime += dt * 6.0;
        const stroke = Math.sin(this.animTime);
        this.leftArmPivot.rotation.x = -1.2 + stroke * 0.4;
        this.rightArmPivot.rotation.x = -1.2 - stroke * 0.4;
        this.leftArmPivot.rotation.z = -0.3 + stroke * 0.2;
        this.rightArmPivot.rotation.z = 0.3 - stroke * 0.2;
        this.leftLegPivot.rotation.x = stroke * 0.35;
        this.rightLegPivot.rotation.x = -stroke * 0.35;
      } else if (isMoving) {
        this.leftArmPivot.rotation.z = 0;
        this.rightArmPivot.rotation.z = 0;
        this.animTime += dt * animSpeed;
        const swing = Math.sin(this.animTime) * swingAmp;

        // Minecraft opposing sinusoidal swing
        this.leftArmPivot.rotation.x = swing;
        this.rightArmPivot.rotation.x = -swing;
        this.leftLegPivot.rotation.x = -swing;
        this.rightLegPivot.rotation.x = swing;
      } else if (this.action === 'jumping') {
        this.leftArmPivot.rotation.z = 0;
        this.rightArmPivot.rotation.z = 0;
        this.leftArmPivot.rotation.x = -0.6;
        this.rightArmPivot.rotation.x = -0.6;
        this.leftLegPivot.rotation.x = 0.35;
        this.rightLegPivot.rotation.x = -0.35;
      } else {
        // Idle: smoothly return to neutral
        this.leftArmPivot.rotation.z = 0;
        this.rightArmPivot.rotation.z = 0;
        this.leftArmPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
        this.rightArmPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
        this.leftLegPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
        this.rightLegPivot.rotation.x *= Math.max(0, 1.0 - dt * 10);
      }
    }

    // Apply punch / block interaction swing to right arm
    if (this.swingProgress > 0) {
      this.swingProgress -= dt * 5.0;
      if (this.swingProgress < 0) this.swingProgress = 0;
      const punch = Math.sin((1.0 - this.swingProgress) * Math.PI) * 1.35;
      this.rightArmPivot.rotation.x -= punch;
      this.rightArmPivot.rotation.y = -punch * 0.25;
    } else {
      this.rightArmPivot.rotation.y *= Math.max(0, 1.0 - dt * 10);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      }
    });
  }
}
