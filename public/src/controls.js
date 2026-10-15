// public/src/controls.js
// First-person & third-person controls, Minecraft camera perspective toggle (F5),
// articulated 1st-person arm punch animations, mobile touch/joystick input, and 3D voxel DDA raycasting
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export class Controls {
  constructor(camera, domElement, physics, world) {
    this.camera = camera;
    this.domElement = domElement;
    this.physics = physics;
    this.world = world;

    this.isLocked = false;
    this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.sensitivity = 0.0022;

    this.pitch = 0; // vertical camera rotation
    this.yaw = 0;   // horizontal camera rotation

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false
    };

    // Virtual mobile joystick state (-1 to 1)
    this.joystick = { x: 0, y: 0 };

    // Mobile touch look tracking
    this.lookTouchId = null;
    this.lastTouchX = 0;
    this.lastTouchY = 0;

    this.reachDistance = 6.0;
    this.targetedVoxel = null; // { x, y, z, type, normal: [nx, ny, nz], place: { x, y, z } }

    this.selectedHotbarIndex = 0;

    // View bobbing camera dynamics
    this.bobTimer = 0;
    this.bobAmount = 0;

    // Minecraft Perspective modes: 'first' | 'third-back' | 'third-front'
    this.perspective = 'first';
    this.perspectiveIndex = 0;
    this.localAvatar = null;

    // Callbacks
    this.onBreakBlock = null;
    this.onPlaceBlock = null;
    this.onSelectHotbar = null;
    this.onLockChange = null;
    this.onPerspectiveChange = null;

    // Build first person arm & tool attached to camera
    this.buildFirstPersonArm();

    this.setupListeners();
    this.setupTouchControls();
  }

  setLocalAvatar(avatar) {
    this.localAvatar = avatar;
    if (this.localAvatar && this.localAvatar.group) {
      this.localAvatar.group.visible = (this.perspective !== 'first');
    }
  }

  togglePerspective() {
    this.perspectiveIndex = (this.perspectiveIndex + 1) % 3;
    const modes = ['first', 'third-back', 'third-front'];
    this.perspective = modes[this.perspectiveIndex];

    if (this.firstPersonArm) {
      this.firstPersonArm.visible = (this.perspective === 'first');
    }
    if (this.localAvatar && this.localAvatar.group) {
      this.localAvatar.group.visible = (this.perspective !== 'first');
    }

    if (this.onPerspectiveChange) {
      this.onPerspectiveChange(this.perspective);
    }
    return this.perspective;
  }

  buildFirstPersonArm() {
    this.firstPersonArm = new THREE.Group();
    this.camera.add(this.firstPersonArm);

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.7 }); // Cyan Steve shirt

    this.armPivot = new THREE.Group();
    // Position arm naturally in the bottom right corner of the view
    this.armPivot.position.set(0.36, -0.32, -0.52);
    this.armPivot.rotation.set(-0.25, 0.35, -0.1);

    // Upper arm sleeve
    const sleeveGeom = new THREE.BoxGeometry(0.16, 0.26, 0.16);
    const sleeveMesh = new THREE.Mesh(sleeveGeom, shirtMat);
    sleeveMesh.position.set(0, -0.13, 0);
    this.armPivot.add(sleeveMesh);

    // Forearm & Hand
    const handGeom = new THREE.BoxGeometry(0.15, 0.30, 0.15);
    const handMesh = new THREE.Mesh(handGeom, skinMat);
    handMesh.position.set(0, -0.38, 0);
    this.armPivot.add(handMesh);

    // Mini held block attached to hand
    const blockGeom = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    this.heldBlockMat = new THREE.MeshStandardMaterial({ color: 0x5b8a3c, roughness: 0.85 });
    this.heldBlockMesh = new THREE.Mesh(blockGeom, this.heldBlockMat);
    this.heldBlockMesh.position.set(0, -0.44, 0.12);
    this.armPivot.add(this.heldBlockMesh);

    this.firstPersonArm.add(this.armPivot);
    this.punchProgress = 0;
  }

  updateHeldBlock(blockId) {
    if (!this.heldBlockMat) return;
    const colors = {
      1: 0x5b8a3c, // Grass
      2: 0x866043, // Dirt
      3: 0xa1724e, // Dirt dry
      4: 0x808080, // Stone
      5: 0x6e6e6e, // Cobblestone
      6: 0x6d5032, // Oak Log
      7: 0x3d732c, // Leaves
      8: 0xb58c54, // Wood Plank
      9: 0xdfd3a2, // Sand
      10: 0x939393, // Gravel
      11: 0x3b82f6, // Water
      12: 0xf8fafc, // Snow
      13: 0x93c5fd, // Ice
      14: 0xb91c1c, // Brick
      15: 0xa8a29e, // Clay
      16: 0xbae6fd, // Glass
      17: 0xd97706, // Iron Ore
      18: 0xeab308  // Gold Ore
    };
    if (colors[blockId]) {
      this.heldBlockMat.color.setHex(colors[blockId]);
      this.heldBlockMesh.visible = true;
    } else {
      this.heldBlockMesh.visible = false;
    }
  }

  setupListeners() {
    // Mouse movement
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      this.yaw -= movementX * this.sensitivity;
      this.pitch -= movementY * this.sensitivity;

      // Clamp vertical pitch to prevent backflips
      const maxPitch = Math.PI / 2 - 0.02;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    });

    // Pointer Lock change
    document.addEventListener('pointerlockchange', () => {
      this.isLocked = (document.pointerLockElement === this.domElement);
      if (this.onLockChange) {
        this.onLockChange(this.isLocked);
      }
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    window.addEventListener('keyup', (e) => {
      this.handleKeyUp(e);
    });

    // Mouse buttons for building and destroying blocks
    this.domElement.addEventListener('mousedown', (e) => {
      if (!this.isLocked) return;

      if (e.button === 0) {
        // Left click: Break targeted block
        this.triggerBreak();
      } else if (e.button === 2) {
        // Right click: Place selected block
        this.triggerPlace();
      }
    });

    // Mouse wheel for hotbar cycling
    window.addEventListener('wheel', (e) => {
      if (!this.isLocked) return;
      if (e.deltaY > 0) {
        this.selectedHotbarIndex = (this.selectedHotbarIndex + 1) % 9;
      } else if (e.deltaY < 0) {
        this.selectedHotbarIndex = (this.selectedHotbarIndex + 8) % 9;
      }
      if (this.onSelectHotbar) {
        this.onSelectHotbar(this.selectedHotbarIndex);
      }
    });

    // Prevent right click context menu in game
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setupTouchControls() {
    // Touch drag for looking around (right portion of screen)
    window.addEventListener('touchstart', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.clientX > window.innerWidth * 0.35 && this.lookTouchId === null) {
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          if (target && (target.closest('.touch-btn') || target.closest('.mobile-action-btn') || target.closest('#chat-container') || target.closest('.modal-card') || target.closest('#hotbar-wrapper'))) {
            continue;
          }
          this.lookTouchId = touch.identifier;
          this.lastTouchX = touch.clientX;
          this.lastTouchY = touch.clientY;
        }
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (this.lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.lookTouchId) {
          const dx = touch.clientX - this.lastTouchX;
          const dy = touch.clientY - this.lastTouchY;
          this.lastTouchX = touch.clientX;
          this.lastTouchY = touch.clientY;

          this.yaw -= dx * this.sensitivity * 1.6;
          this.pitch -= dy * this.sensitivity * 1.6;

          const maxPitch = Math.PI / 2 - 0.02;
          this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
          break;
        }
      }
    }, { passive: true });

    const endTouchLook = (e) => {
      if (this.lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) {
          this.lookTouchId = null;
          break;
        }
      }
    };

    window.addEventListener('touchend', endTouchLook, { passive: true });
    window.addEventListener('touchcancel', endTouchLook, { passive: true });
  }

  triggerPunch() {
    this.punchProgress = 1.0;
    if (this.localAvatar) {
      this.localAvatar.triggerSwing();
    }
  }

  triggerBreak() {
    this.triggerPunch();
    if (this.targetedVoxel && this.onBreakBlock) {
      this.onBreakBlock(this.targetedVoxel);
    }
  }

  triggerPlace() {
    this.triggerPunch();
    if (this.targetedVoxel && this.onPlaceBlock) {
      this.onPlaceBlock(this.targetedVoxel.place);
    }
  }

  setJump(isDown) {
    this.keys.jump = isDown;
  }

  setSprint(isSprint) {
    this.keys.sprint = isSprint;
  }

  handleKeyDown(e) {
    if (!this.isLocked && !this.isMobile) return;

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = true;
        break;
      case 'Space':
        this.keys.jump = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = true;
        break;
      case 'F5':
        e.preventDefault();
        this.togglePerspective();
        break;
      case 'Digit1': case 'Digit2': case 'Digit3':
      case 'Digit4': case 'Digit5': case 'Digit6':
      case 'Digit7': case 'Digit8': case 'Digit9':
        const idx = parseInt(e.code.replace('Digit', ''), 10) - 1;
        this.selectedHotbarIndex = idx;
        if (this.onSelectHotbar) {
          this.onSelectHotbar(this.selectedHotbarIndex);
        }
        break;
    }
  }

  handleKeyUp(e) {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = false;
        break;
      case 'Space':
        this.keys.jump = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = false;
        break;
    }
  }

  lock() {
    if (!this.isMobile && this.domElement.requestPointerLock) {
      this.domElement.requestPointerLock();
    }
  }

  unlock() {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  /**
   * Fast Voxel DDA (Digital Differential Analyzer) raycast
   */
  raycastVoxel() {
    const origin = this.physics.getEyePosition();
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    let px = origin.x;
    let py = origin.y;
    let pz = origin.z;

    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;

    let mapX = Math.floor(px);
    let mapY = Math.floor(py);
    let mapZ = Math.floor(pz);

    const stepX = (dx >= 0) ? 1 : -1;
    const stepY = (dy >= 0) ? 1 : -1;
    const stepZ = (dz >= 0) ? 1 : -1;

    const deltaDistX = (dx !== 0) ? Math.abs(1 / dx) : Infinity;
    const deltaDistY = (dy !== 0) ? Math.abs(1 / dy) : Infinity;
    const deltaDistZ = (dz !== 0) ? Math.abs(1 / dz) : Infinity;

    let sideDistX = (dx >= 0) ? (mapX + 1.0 - px) * deltaDistX : (px - mapX) * deltaDistX;
    let sideDistY = (dy >= 0) ? (mapY + 1.0 - py) * deltaDistY : (py - mapY) * deltaDistY;
    let sideDistZ = (dz >= 0) ? (mapZ + 1.0 - pz) * deltaDistZ : (pz - mapZ) * deltaDistZ;

    let hit = false;
    let norm = [0, 0, 0];
    let distance = 0;

    while (!hit && distance < this.reachDistance) {
      if (sideDistX < sideDistY) {
        if (sideDistX < sideDistZ) {
          distance = sideDistX;
          sideDistX += deltaDistX;
          mapX += stepX;
          norm = [-stepX, 0, 0];
        } else {
          distance = sideDistZ;
          sideDistZ += deltaDistZ;
          mapZ += stepZ;
          norm = [0, 0, -stepZ];
        }
      } else {
        if (sideDistY < sideDistZ) {
          distance = sideDistY;
          sideDistY += deltaDistY;
          mapY += stepY;
          norm = [0, -stepY, 0];
        } else {
          distance = sideDistZ;
          sideDistZ += deltaDistZ;
          mapZ += stepZ;
          norm = [0, 0, -stepZ];
        }
      }

      if (distance > this.reachDistance) break;

      const block = this.world.getBlock(mapX, mapY, mapZ);
      if (block !== BLOCKS.AIR && block !== BLOCKS.WATER && BLOCK_DEFS[block]?.solid) {
        hit = true;
        this.targetedVoxel = {
          x: mapX,
          y: mapY,
          z: mapZ,
          type: block,
          normal: norm,
          place: {
            x: mapX + norm[0],
            y: mapY + norm[1],
            z: mapZ + norm[2]
          }
        };
        return this.targetedVoxel;
      }
    }

    this.targetedVoxel = null;
    return null;
  }

  /**
   * Raycasts from eye position to target camera offset to prevent clipping through solid blocks in 3rd person
   */
  getSafeCameraPosition(eye, ox, oy, oz) {
    if (!this.world || typeof this.world.getBlock !== 'function') {
      return { x: eye.x + ox, y: eye.y + oy, z: eye.z + oz };
    }
    const len = Math.hypot(ox, oy, oz);
    if (len < 0.001) return { x: eye.x, y: eye.y, z: eye.z };

    const dx = ox / len;
    const dy = oy / len;
    const dz = oz / len;

    // Raycast outward from eye in fine steps
    const step = 0.2;
    let safeLen = len;

    for (let cur = 0.4; cur <= len; cur += step) {
      const cx = eye.x + dx * cur;
      const cy = eye.y + dy * cur;
      const cz = eye.z + dz * cur;

      const bx = Math.floor(cx);
      const by = Math.floor(cy);
      const bz = Math.floor(cz);

      const block = this.world.getBlock(bx, by, bz);
      if (block !== BLOCKS.AIR && block !== BLOCKS.WATER && BLOCK_DEFS[block]?.solid) {
        safeLen = Math.max(0.35, cur - 0.25);
        break;
      }
    }

    return {
      x: eye.x + dx * safeLen,
      y: eye.y + dy * safeLen,
      z: eye.z + dz * safeLen
    };
  }

  update(dt) {
    // Calculate world movement vector from keyboard keys and virtual joystick
    let forward = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0) + this.joystick.y;
    let strafe = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) + this.joystick.x;

    const mag = Math.hypot(forward, strafe);
    if (mag > 1) {
      forward /= mag;
      strafe /= mag;
    }

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    // Camera forward is (-sinY, -cosY), camera right is (cosY, -sinY)
    const moveX = (-sinY * forward) + (cosY * strafe);
    const moveZ = (-cosY * forward) + (-sinY * strafe);

    // Physics step
    this.physics.update(dt, {
      moveX,
      moveZ,
      jump: this.keys.jump,
      sprint: this.keys.sprint
    });

    // Minecraft View bobbing calculation when walking or running on ground
    const isMoving = this.physics.onGround && (this.physics.action === 'walking' || this.physics.action === 'running');
    if (isMoving) {
      const bobSpeed = (this.physics.action === 'running') ? 14.0 : 9.5;
      this.bobTimer += dt * bobSpeed;
      this.bobAmount += (1.0 - this.bobAmount) * Math.min(1.0, dt * 8.0);
    } else {
      this.bobAmount += (0.0 - this.bobAmount) * Math.min(1.0, dt * 8.0);
      if (this.bobAmount < 0.001) {
        this.bobAmount = 0;
        this.bobTimer = 0;
      }
    }

    const bobY = Math.sin(this.bobTimer) * 0.045 * this.bobAmount;
    const bobRoll = Math.cos(this.bobTimer * 0.5) * 0.012 * this.bobAmount;

    // First-person punch & arm animation
    if (this.armPivot) {
      if (this.punchProgress > 0) {
        this.punchProgress -= dt * 6.5;
        if (this.punchProgress < 0) this.punchProgress = 0;
        const punch = Math.sin((1.0 - this.punchProgress) * Math.PI);
        this.armPivot.rotation.x = -0.25 - punch * 0.9;
        this.armPivot.rotation.y = 0.35 - punch * 0.4;
        this.armPivot.position.z = -0.52 - punch * 0.12;
      } else {
        const bobArmX = isMoving ? Math.sin(this.bobTimer) * 0.05 : 0;
        const bobArmY = isMoving ? Math.abs(Math.cos(this.bobTimer)) * 0.03 : 0;
        this.armPivot.rotation.x = -0.25 + bobArmX;
        this.armPivot.position.y = -0.32 + bobArmY;
        this.armPivot.rotation.y = 0.35;
        this.armPivot.position.z = -0.52;
      }
    }

    // Camera placement based on perspective mode (1st person, 3rd person back, 3rd person front)
    const eye = this.physics.getEyePosition();

    if (this.perspective === 'first') {
      this.camera.position.set(eye.x, eye.y + bobY, eye.z);
      this.camera.rotation.set(this.pitch, this.yaw, bobRoll, 'YXZ');
      if (this.firstPersonArm) this.firstPersonArm.visible = true;
      if (this.localAvatar && this.localAvatar.group) this.localAvatar.group.visible = false;
    } else if (this.perspective === 'third-back') {
      const dist = 3.5;
      const cosPitch = Math.cos(this.pitch);
      const sinPitch = Math.sin(this.pitch);
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);

      const backX = sinYaw * cosPitch * dist;
      const backY = -sinPitch * dist + 0.35;
      const backZ = cosYaw * cosPitch * dist;

      const safePos = this.getSafeCameraPosition(eye, backX, backY, backZ);
      this.camera.position.set(safePos.x, safePos.y, safePos.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      if (this.firstPersonArm) this.firstPersonArm.visible = false;
      if (this.localAvatar && this.localAvatar.group) this.localAvatar.group.visible = true;
    } else if (this.perspective === 'third-front') {
      const dist = 3.5;
      const cosPitch = Math.cos(this.pitch);
      const sinPitch = Math.sin(this.pitch);
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);

      const frontX = -sinYaw * cosPitch * dist;
      const frontY = -sinPitch * dist + 0.35;
      const frontZ = -cosYaw * cosPitch * dist;

      const safePos = this.getSafeCameraPosition(eye, frontX, frontY, frontZ);
      this.camera.position.set(safePos.x, safePos.y, safePos.z);
      this.camera.rotation.set(-this.pitch, this.yaw + Math.PI, 0, 'YXZ');
      if (this.firstPersonArm) this.firstPersonArm.visible = false;
      if (this.localAvatar && this.localAvatar.group) this.localAvatar.group.visible = true;
    }

    // Sync local avatar for 3rd person rendering
    if (this.localAvatar) {
      this.localAvatar.setTargetState(
        [this.physics.pos.x, this.physics.pos.y, this.physics.pos.z],
        [this.yaw, this.pitch],
        this.physics.action
      );
      this.localAvatar.update(dt);
    }

    // Update raycast
    this.raycastVoxel();
  }
}
