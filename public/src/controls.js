// public/src/controls.js
// First-person pointer lock controls, input handling, and 3D voxel DDA raycasting
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export class Controls {
  constructor(camera, domElement, physics, world) {
    this.camera = camera;
    this.domElement = domElement;
    this.physics = physics;
    this.world = world;

    this.isLocked = false;
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

    this.reachDistance = 6.0;
    this.targetedVoxel = null; // { x, y, z, type, normal: [nx, ny, nz], place: { x, y, z } }

    this.selectedHotbarIndex = 0;

    // Callbacks
    this.onBreakBlock = null;
    this.onPlaceBlock = null;
    this.onSelectHotbar = null;
    this.onLockChange = null;

    this.setupListeners();
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
        if (this.targetedVoxel && this.onBreakBlock) {
          this.onBreakBlock(this.targetedVoxel);
        }
      } else if (e.button === 2) {
        // Right click: Place selected block
        if (this.targetedVoxel && this.onPlaceBlock) {
          this.onPlaceBlock(this.targetedVoxel.place);
        }
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

  handleKeyDown(e) {
    if (!this.isLocked) return;

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
    this.domElement.requestPointerLock();
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

  update(dt) {
    // Calculate world movement vector relative to player yaw
    let forward = 0;
    let strafe = 0;

    if (this.keys.forward) forward += 1;
    if (this.keys.backward) forward -= 1;
    if (this.keys.right) strafe += 1;
    if (this.keys.left) strafe -= 1;

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

    // Sync camera position to eye level
    const eye = this.physics.getEyePosition();
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // Update raycast
    this.raycastVoxel();
  }
}
