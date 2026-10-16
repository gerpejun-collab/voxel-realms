// public/src/controls.js
// First-person & third-person controls, Minecraft camera perspective toggle (F5),
// articulated 1st-person arm punch animations, mobile touch/joystick input, and 3D voxel DDA raycasting
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { sound } from './audio.js';

export class Controls {
  constructor(camera, domElement, physics, world) {
    this.camera = camera;
    this.domElement = domElement;
    this.physics = physics;
    this.world = world;

    this.isLocked = false;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasFinePointer = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    const hasCoarsePointer = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.isMobile = isMobileUA || (hasCoarsePointer && !hasFinePointer);
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

    // Weapons & Reactive TNT Mode state
    this.weaponsMode = false;
    this.isAiming = false;
    this.aimBlend = 0;
    this.recoilProgress = 0;

    // Callbacks
    this.onBreakBlock = null;
    this.onPlaceBlock = null;
    this.onSelectHotbar = null;
    this.onLockChange = null;
    this.onPerspectiveChange = null;
    this.onToggleMap = null;
    this.onCycleSpeed = null;
    this.onSpeedChange = null;
    this.onWeaponShoot = null;
    this.onPlaceTnt = null;
    this.onAimChange = null;
    this.vehicleManager = null;

    // Build first person arm & tool attached to camera
    this.buildFirstPersonArm();

    this.setupListeners();
    this.setupTouchControls();
  }

  setVehicleManager(vm) {
    this.vehicleManager = vm;
  }

  setLocalAvatar(avatar) {
    this.localAvatar = avatar;
    if (this.localAvatar && this.localAvatar.group) {
      this.localAvatar.group.visible = (this.perspective !== 'first');
    }
  }

  togglePerspective() {
    if (this.vehicleManager && this.vehicleManager.isDriving()) {
      return this.vehicleManager.toggleCameraMode();
    }
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

    // 1st-Person Authentic Horizontal 3D Precision Tactical Rifle attached to hand
    this.rifleGroup = new THREE.Group();
    this.rifleGroup.position.set(0, 0, 0);
    this.rifleGroup.rotation.set(0, 0, 0);

    const stockMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.75 }); // Dark walnut wood stock
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.38, metalness: 0.75 }); // Gunmetal steel receiver
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.32, metalness: 0.82 }); // Dark titanium barrel
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, roughness: 0.15 }); // Glowing cyan optical reticle
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.7, roughness: 0.28 }); // Polished brass muzzle brake

    // 1. Stock: BoxGeometry(0.08, 0.13, 0.32) placed at (0, -0.03, 0.22)
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.32), stockMat);
    stock.position.set(0, -0.03, 0.22);
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.13, 0.03), metalMat);
    buttPlate.position.set(0, -0.03, 0.38);

    // 2. Receiver & frame: BoxGeometry(0.09, 0.12, 0.34) at (0, 0.03, -0.10)
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.34), metalMat);
    receiver.position.set(0, 0.03, -0.10);

    // 3. Pistol Grip: BoxGeometry(0.07, 0.18, 0.09) rotated -22 deg at (0, -0.12, 0.06)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), stockMat);
    grip.position.set(0, -0.12, 0.06);
    grip.rotation.x = -0.38;

    // Trigger guard & trigger
    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.07), metalMat);
    triggerGuard.position.set(0, -0.05, -0.04);

    // 4. Detachable Curved Magazine: BoxGeometry(0.065, 0.22, 0.12) at (0, -0.13, -0.08)
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.22, 0.12), metalMat);
    magazine.position.set(0, -0.13, -0.08);
    magazine.rotation.x = 0.12;

    // 5. Vented Handguard: BoxGeometry(0.08, 0.09, 0.42) at (0, 0.03, -0.42)
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.42), stockMat);
    handguard.position.set(0, 0.03, -0.42);

    // 6. Fluted Precision Barrel: BoxGeometry(0.045, 0.045, 0.65) at (0, 0.03, -0.72)
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.65), barrelMat);
    barrel.position.set(0, 0.03, -0.72);

    // 7. Tactical Muzzle Brake: BoxGeometry(0.065, 0.065, 0.10) at (0, 0.03, -1.06)
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.10), goldMat);
    muzzle.position.set(0, 0.03, -1.06);
    this.muzzleMesh = muzzle;

    // 8. Elevated Optical Rail & Scope (optical center on Y=0.13)
    const scopeRail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.025, 0.26), metalMat);
    scopeRail.position.set(0, 0.095, -0.10);
    const scopeBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.36), metalMat);
    scopeBody.position.set(0, 0.13, -0.14);
    const scopeRings = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.06), metalMat);
    scopeRings.position.set(0, 0.13, -0.14);
    const scopeFront = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.05), metalMat);
    scopeFront.position.set(0, 0.13, -0.32);
    const scopeRear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.04), metalMat);
    scopeRear.position.set(0, 0.13, 0.04);
    const scopeLens = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), lensMat);
    scopeLens.position.set(0, 0.13, 0.06);

    this.rifleGroup.add(
      stock, buttPlate, receiver, grip, triggerGuard, magazine,
      handguard, barrel, muzzle, scopeRail, scopeBody, scopeRings, scopeFront, scopeRear, scopeLens
    );
    this.rifleGroup.visible = false;
    this.armPivot.add(this.rifleGroup);

    this.firstPersonArm.add(this.armPivot);
    this.punchProgress = 0;
  }

  getMuzzleWorldPosition(targetVec = new THREE.Vector3()) {
    if (this.muzzleMesh) {
      if (this.camera && typeof this.camera.updateMatrixWorld === 'function') {
        this.camera.updateMatrixWorld(true);
      }
      return this.muzzleMesh.getWorldPosition(targetVec);
    }
    const eye = this.physics ? this.physics.getEyePosition() : this.camera.position;
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0));
    return targetVec.copy(eye).addScaledVector(forward, 0.8).addScaledVector(right, 0.25).add(new THREE.Vector3(0, -0.15, 0));
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
      18: 0xeab308, // Gold Ore
      19: 0xdc2626, // TNT
      20: 0x262930  // Asphalt
    };
    if (this.weaponsMode) {
      this.heldBlockMesh.visible = false;
      if (this.rifleGroup) this.rifleGroup.visible = true;
      return;
    }
    if (this.rifleGroup) this.rifleGroup.visible = false;
    if (colors[blockId]) {
      this.heldBlockMat.color.setHex(colors[blockId]);
      this.heldBlockMesh.visible = true;
    } else {
      this.heldBlockMesh.visible = false;
    }
  }

  setWeaponsMode(enabled) {
    this.weaponsMode = Boolean(enabled);
    if (!this.weaponsMode && this.isAiming) {
      this.setAiming(false);
    }
    if (this.rifleGroup) {
      this.rifleGroup.visible = this.weaponsMode;
    }
    if (this.heldBlockMesh) {
      this.heldBlockMesh.visible = !this.weaponsMode;
    }
    if (!this.weaponsMode && typeof document !== 'undefined') {
      const scopeOverlay = document.getElementById('rifle-scope-overlay');
      if (scopeOverlay) scopeOverlay.classList.add('hidden');
    }
  }

  setAiming(aiming) {
    const nextAim = Boolean(aiming) && this.weaponsMode;
    if (this.isAiming === nextAim) return this.isAiming;
    this.isAiming = nextAim;
    if (!this.isAiming && typeof document !== 'undefined') {
      const scopeOverlay = document.getElementById('rifle-scope-overlay');
      if (scopeOverlay) scopeOverlay.classList.add('hidden');
    }
    if (sound && typeof sound.playClick === 'function') {
      sound.playClick(this.isAiming ? 1.25 : 0.9);
    }
    if (this.onAimChange) {
      this.onAimChange(this.isAiming);
    }
    return this.isAiming;
  }

  toggleAiming() {
    if (!this.weaponsMode) return false;
    return this.setAiming(!this.isAiming);
  }

  triggerShoot() {
    if (!this.weaponsMode) return null;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (this.lastShootTime && (now - this.lastShootTime < 200)) return null;
    this.lastShootTime = now;

    this.recoilProgress = 1.0;
    if (this.localAvatar) {
      this.localAvatar.triggerSwing();
    }
    if (sound && typeof sound.playShoot === 'function') {
      sound.playShoot();
    }

    const origin = this.physics.getEyePosition();
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    // Long-range raycast for TNT blocks or remote targets (up to 85 blocks)
    // Non-destructive: Bullets NEVER destroy terrain blocks
    const savedReach = this.reachDistance;
    this.reachDistance = 85.0;
    const longVoxelHit = this.raycastVoxel();
    this.reachDistance = savedReach;
    this.raycastVoxel();

    const muzzleVec = this.getMuzzleWorldPosition(new THREE.Vector3());

    const shotData = {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      dir: { x: dir.x, y: dir.y, z: dir.z },
      muzzlePos: { x: muzzleVec.x, y: muzzleVec.y, z: muzzleVec.z },
      voxelHit: longVoxelHit ? { ...longVoxelHit } : null
    };

    // Shoot-to-detonate TNT reactivity: if raycast struck a TNT block (BLOCKS.TNT = 19)
    if (longVoxelHit && longVoxelHit.type === 19) {
      if (this.onShootTnt) {
        this.onShootTnt(longVoxelHit);
      }
    }

    if (this.onWeaponShoot) {
      this.onWeaponShoot(shotData);
    }
    return shotData;
  }

  triggerTnt() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (this.lastTntTime && (now - this.lastTntTime < 300)) return null;
    this.lastTntTime = now;

    this.triggerPunch();
    let targetCoords = null;
    if (this.targetedVoxel && this.targetedVoxel.place) {
      targetCoords = {
        x: this.targetedVoxel.place.x,
        y: this.targetedVoxel.place.y,
        z: this.targetedVoxel.place.z
      };
    } else if (this.physics) {
      const eye = this.physics.getEyePosition();
      const dir = new THREE.Vector3(0, 0, -1);
      dir.applyEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'));
      const tx = Math.floor(eye.x + dir.x * 2.5);
      const tz = Math.floor(eye.z + dir.z * 2.5);
      const ty = this.world ? this.world.getHeightAt(tx, tz) + 1 : Math.floor(this.physics.pos.y);
      targetCoords = { x: tx, y: ty, z: tz };
    }

    if (targetCoords && this.onPlaceTnt) {
      this.onPlaceTnt(targetCoords);
    }
    return targetCoords;
  }

  setupListeners() {
    // Mouse movement
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      // Finer mouse precision when aiming down sniper scope
      const aimFactor = this.isAiming ? 0.42 : 1.0;
      this.yaw -= movementX * this.sensitivity * aimFactor;
      this.pitch -= movementY * this.sensitivity * aimFactor;

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

    // Mouse buttons for building, destroying, or firing weapons
    this.domElement.addEventListener('mousedown', (e) => {
      if (!this.isLocked) return;

      if (e.button === 0) {
        if (this.weaponsMode) {
          this.triggerShoot();
        } else {
          this.triggerBreak();
        }
      } else if (e.button === 2) {
        if (this.weaponsMode) {
          this.toggleAiming();
        } else {
          this.triggerPlace();
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

    // Click on canvas to lock pointer (PC mouse look)
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked && !this.isMobile) {
        this.lock();
      }
    });

    // Prevent right click context menu in game
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setupTouchControls() {
    this.initTouchLook();
    this.initVirtualJoystick();
    this.initActionFan();
    this.initHotbarIsolation();
  }

  initTouchLook() {
    // Touch drag for looking around (right portion of screen)
    window.addEventListener('touchstart', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.clientX > window.innerWidth * 0.40 && this.lookTouchId === null) {
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          if (target && (
            target.closest('.touch-btn') ||
            target.closest('.mobile-action-btn') ||
            target.closest('#mobile-action-buttons') ||
            target.closest('#mobile-btn-cam') ||
            target.closest('#mobile-btn-car') ||
            target.closest('#btn-vehicle-action') ||
            target.closest('#weapons-hud-controls') ||
            target.closest('.weapon-hud-btn') ||
            target.closest('#virtual-joystick') ||
            target.closest('#joystick-zone') ||
            target.closest('#chat-container') ||
            target.closest('.modal-card') ||
            target.closest('#hotbar-wrapper') ||
            target.closest('#hotbar') ||
            target.closest('.hud-action-pill') ||
            target.closest('#hud-top-bar')
          )) {
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

          const aimFactor = this.isAiming ? 0.45 : 1.6;
          this.yaw -= dx * this.sensitivity * aimFactor;
          this.pitch -= dy * this.sensitivity * aimFactor;

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

  initVirtualJoystick() {
    const vJoy = document.getElementById('virtual-joystick') || document.getElementById('joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickKnob = document.getElementById('joystick-knob');
    if (!vJoy || !joystickBase || !joystickKnob) return;

    let activeTouchId = null;

    const updateKnob = (touch) => {
      const rect = joystickBase.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxRadius = (rect.width / 2) - 8;

      let dx = touch.clientX - centerX;
      let dy = touch.clientY - centerY;
      const distance = Math.hypot(dx, dy);

      if (distance > maxRadius && distance > 0) {
        dx = (dx / distance) * maxRadius;
        dy = (dy / distance) * maxRadius;
      }

      joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      // Normalize -1 to 1 (screen Y down is backward, so negate dy for forward)
      this.joystick.x = maxRadius > 0 ? (dx / maxRadius) : 0;
      this.joystick.y = maxRadius > 0 ? -(dy / maxRadius) : 0;
    };

    vJoy.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      if (activeTouchId !== null) return;
      const touch = e.changedTouches[0];
      activeTouchId = touch.identifier;
      updateKnob(touch);
    }, { passive: false });

    vJoy.addEventListener('touchmove', (e) => {
      e.stopPropagation();
      if (activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          updateKnob(e.changedTouches[i]);
          break;
        }
      }
    }, { passive: false });

    const endJoystick = (e) => {
      e.stopPropagation();
      if (activeTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          activeTouchId = null;
          joystickKnob.style.transform = 'translate(0px, 0px)';
          this.joystick.x = 0;
          this.joystick.y = 0;
          break;
        }
      }
    };

    vJoy.addEventListener('touchend', endJoystick, { passive: false });
    vJoy.addEventListener('touchcancel', endJoystick, { passive: false });
  }

  initActionFan() {
    const actionContainer = document.getElementById('mobile-action-buttons');
    if (actionContainer) {
      actionContainer.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
      actionContainer.addEventListener('touchend', (e) => e.stopPropagation(), { passive: false });
    }

    const actionButtons = document.querySelectorAll('.mobile-action-btn, .weapon-hud-btn');
    actionButtons.forEach((btn) => {
      btn.addEventListener('touchstart', () => {
        btn.classList.add('active-press');
      }, { passive: true });

      const removePress = () => {
        btn.classList.remove('active-press');
      };
      btn.addEventListener('touchend', removePress, { passive: true });
      btn.addEventListener('touchcancel', removePress, { passive: true });
    });

    const btnJump = document.getElementById('mobile-btn-jump');
    if (btnJump && !btnJump.__fanBound) {
      btnJump.__fanBound = true;
      btnJump.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setJump(true);
      }, { passive: false });
      const endJump = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setJump(false);
      };
      btnJump.addEventListener('touchend', endJump, { passive: false });
      btnJump.addEventListener('touchcancel', endJump, { passive: false });
    }

    const btnPlace = document.getElementById('mobile-btn-place');
    if (btnPlace && !btnPlace.__fanBound) {
      btnPlace.__fanBound = true;
      btnPlace.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.triggerPlace();
      }, { passive: false });
    }

    const btnBreak = document.getElementById('mobile-btn-break');
    if (btnBreak && !btnBreak.__fanBound) {
      btnBreak.__fanBound = true;
      btnBreak.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.weaponsMode) {
          this.triggerShoot();
        } else {
          this.triggerBreak();
        }
      }, { passive: false });
    }

    const btnCam = document.getElementById('mobile-btn-cam');
    if (btnCam && !btnCam.__fanBound) {
      btnCam.__fanBound = true;
      btnCam.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.togglePerspective();
      }, { passive: false });
    }

    const btnCar = document.getElementById('mobile-btn-car');
    if (btnCar && !btnCar.__fanBound) {
      btnCar.__fanBound = true;
      btnCar.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.vehicleManager) {
          this.vehicleManager.handleInteract(this.physics);
        }
      }, { passive: false });
    }

    const btnSprint = document.getElementById('mobile-btn-sprint');
    if (btnSprint && !btnSprint.__fanBound) {
      btnSprint.__fanBound = true;
      let sprintState = false;
      btnSprint.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        sprintState = !sprintState;
        this.setSprint(sprintState);
        btnSprint.classList.toggle('active', sprintState);
      }, { passive: false });
    }

    const btnWeaponAim = document.getElementById('btn-weapon-aim');
    if (btnWeaponAim && !btnWeaponAim.__fanBound) {
      btnWeaponAim.__fanBound = true;
      btnWeaponAim.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const active = this.toggleAiming();
        btnWeaponAim.classList.toggle('active', active);
      }, { passive: false });
    }

    const btnWeaponShoot = document.getElementById('btn-weapon-shoot');
    if (btnWeaponShoot && !btnWeaponShoot.__fanBound) {
      btnWeaponShoot.__fanBound = true;
      btnWeaponShoot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.triggerShoot();
      }, { passive: false });
    }

    const btnWeaponTnt = document.getElementById('btn-weapon-tnt');
    if (btnWeaponTnt && !btnWeaponTnt.__fanBound) {
      btnWeaponTnt.__fanBound = true;
      btnWeaponTnt.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.triggerTnt();
      }, { passive: false });
    }
  }

  initHotbarIsolation() {
    const hotbar = document.getElementById('hotbar');
    const hotbarWrapper = document.getElementById('hotbar-wrapper');

    const isolate = (e) => {
      e.stopPropagation();
    };

    [hotbar, hotbarWrapper].forEach((elem) => {
      if (!elem) return;
      elem.addEventListener('touchstart', isolate, { passive: false });
      elem.addEventListener('touchmove', isolate, { passive: false });
      elem.addEventListener('touchend', isolate, { passive: false });
      elem.addEventListener('touchcancel', isolate, { passive: false });
    });

    if (hotbar) {
      hotbar.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        const slot = e.target.closest('.hotbar-slot');
        if (slot && slot.dataset.index !== undefined) {
          const idx = parseInt(slot.dataset.index, 10);
          if (!isNaN(idx)) {
            this.selectedHotbarIndex = idx;
            if (this.onSelectHotbar) {
              this.onSelectHotbar(idx);
            }
          }
        }
      }, { passive: false });
    }
  }

  triggerPunch() {
    this.punchProgress = 1.0;
    if (this.localAvatar) {
      this.localAvatar.triggerSwing();
    }
  }

  triggerBreak() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (this.lastBreakTime && (now - this.lastBreakTime < 80)) return;
    this.lastBreakTime = now;

    this.triggerPunch();
    if (this.targetedVoxel && this.onBreakBlock) {
      this.onBreakBlock(this.targetedVoxel);
    }
  }

  triggerPlace() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (this.lastPlaceTime && (now - this.lastPlaceTime < 80)) return;
    this.lastPlaceTime = now;

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

  /**
   * 3-way speed selector (R3):
   * 1x (Normal Walk): speedMultiplier = 1.0, flightMode = false
   * 2.5x (Fast Exploration): speedMultiplier = 2.5, flightMode = false
   * 5x (Flight / God Mode): speedMultiplier = 5.0, flightMode = true
   */
  cycleSpeed() {
    const current = this.physics ? (this.physics.speedMultiplier || 1.0) : 1.0;
    let nextMultiplier = 1.0;
    let nextFlight = false;

    if (Math.abs(current - 1.0) < 0.05) {
      nextMultiplier = 2.5;
      nextFlight = false;
    } else if (Math.abs(current - 2.5) < 0.05) {
      nextMultiplier = 5.0;
      nextFlight = true;
    } else {
      nextMultiplier = 1.0;
      nextFlight = false;
    }

    this.setSpeed(nextMultiplier, nextFlight);

    if (sound && typeof sound.playClick === 'function') {
      sound.playClick();
    }

    if (this.onCycleSpeed) {
      this.onCycleSpeed(nextMultiplier, nextFlight);
    }
    return { speedMultiplier: nextMultiplier, flightMode: nextFlight };
  }

  setSpeed(multiplier, flight = (multiplier === 5.0)) {
    if (this.physics) {
      this.physics.speedMultiplier = multiplier;
      this.physics.flightMode = flight;
      if (!this.physics.setSpeedMultiplier) {
        this.physics.setSpeedMultiplier = (m) => {
          this.physics.speedMultiplier = m;
          this.physics.flightMode = (m === 5.0);
        };
      }
    }
    if (this.onSpeedChange) {
      this.onSpeedChange(multiplier, flight);
    }
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
      case 'KeyM':
        e.preventDefault();
        e.__vrHandled = true;
        if (this.onToggleMap) {
          this.onToggleMap();
        }
        break;
      case 'KeyV':
        e.preventDefault();
        e.__vrHandled = true;
        this.cycleSpeed();
        break;
      case 'KeyF':
        if (this.vehicleManager && this.vehicleManager.handleInteract(this.physics)) {
          e.preventDefault();
          break;
        }
        if (this.weaponsMode) {
          e.preventDefault();
          this.triggerShoot();
        }
        break;
      case 'KeyZ':
      case 'KeyQ':
        if (this.weaponsMode) {
          e.preventDefault();
          this.toggleAiming();
        }
        break;
      case 'KeyG':
      case 'KeyT':
        if (this.weaponsMode) {
          e.preventDefault();
          this.triggerTnt();
        }
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
    if (!this.isMobile && this.domElement && this.domElement.requestPointerLock) {
      try {
        const res = this.domElement.requestPointerLock();
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch (_) {}
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
    if (this.vehicleManager && this.vehicleManager.isDriving()) {
      let forward = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0) + this.joystick.y;
      let steer = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0) - this.joystick.x;
      let brake = this.keys.jump;
      let handbrake = this.keys.sprint;

      this.vehicleManager.updateDriver(dt, {
        forward,
        steer,
        brake,
        handbrake
      }, this.camera, this);

      const car = this.vehicleManager.activeCar;
      this.physics.pos.x = car.pos.x;
      this.physics.pos.y = car.pos.y;
      this.physics.pos.z = car.pos.z;
      this.physics.vel.x = 0;
      this.physics.vel.y = 0;
      this.physics.vel.z = 0;
      this.physics.action = 'driving';
      this.yaw = car.yaw;

      if (this.firstPersonArm) {
        this.firstPersonArm.visible = false;
      }

      this.raycastVoxel();
      return;
    }

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

    // Smooth Sniper Scope Aiming interpolation (FOV 75 -> 32)
    const targetAim = (this.weaponsMode && this.isAiming) ? 1.0 : 0.0;
    if (Math.abs(targetAim - this.aimBlend) > 0.001) {
      this.aimBlend += (targetAim - this.aimBlend) * Math.min(1.0, dt * 11.0);
      if (this.camera && typeof this.camera.updateProjectionMatrix === 'function') {
        this.camera.fov = 75 - this.aimBlend * 43;
        this.camera.updateProjectionMatrix();
      }
    } else if (this.aimBlend !== targetAim) {
      this.aimBlend = targetAim;
      if (this.camera && typeof this.camera.updateProjectionMatrix === 'function') {
        this.camera.fov = 75 - this.aimBlend * 43;
        this.camera.updateProjectionMatrix();
      }
    }

    // Toggle #rifle-scope-overlay when aimBlend > 0.82
    if (typeof document !== 'undefined') {
      const scopeOverlay = document.getElementById('rifle-scope-overlay');
      if (scopeOverlay) {
        if (this.weaponsMode && this.aimBlend > 0.82) {
          scopeOverlay.classList.remove('hidden');
        } else {
          scopeOverlay.classList.add('hidden');
        }
      }
    }

    if (this.recoilProgress > 0) {
      this.recoilProgress = Math.max(0, this.recoilProgress - dt * 6.5);
    }

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

    const bobScale = 1.0 - this.aimBlend * 0.75;
    const bobY = Math.sin(this.bobTimer) * 0.045 * this.bobAmount * bobScale;
    const bobRoll = Math.cos(this.bobTimer * 0.5) * 0.012 * this.bobAmount * bobScale;

    // First-person punch, rifle scope aiming, and recoil animation
    if (this.armPivot) {
      if (this.weaponsMode) {
        // Weapon bobbing calculation when walking or running (dampened 88% during ADS)
        const weaponBobScale = 1.0 - this.aimBlend * 0.88;
        const weaponBobX = isMoving ? Math.sin(this.bobTimer * 0.5) * 0.022 * this.bobAmount * weaponBobScale : 0;
        const weaponBobY = isMoving ? (Math.abs(Math.sin(this.bobTimer)) * 0.016) * this.bobAmount * weaponBobScale : 0;
        const weaponBobRoll = isMoving ? Math.sin(this.bobTimer * 0.5) * 0.012 * this.bobAmount * weaponBobScale : 0;

        // Tactical recoil kickback along Z and muzzle pitch rise along X
        const recoilKick = Math.sin(this.recoilProgress * Math.PI) * 0.10;
        const recoilPitch = -Math.sin(this.recoilProgress * Math.PI) * 0.09;

        // Natural horizontal hip-carry vs centered scope sightline (ADS)
        // In hip: authentic horizontal tactical rifle held naturally along camera -Z
        const hipX = 0.24;
        const hipY = -0.22;
        const hipZ = -0.42;

        // In ADS: optical axis (scope at local Y=0.13) centered directly on camera -Z (adsY = -0.13)
        const adsX = 0.0;
        const adsY = -0.13;
        const adsZ = -0.30;

        const curX = hipX * (1 - this.aimBlend) + adsX * this.aimBlend + weaponBobX;
        const curY = hipY * (1 - this.aimBlend) + adsY * this.aimBlend + weaponBobY;
        const curZ = hipZ * (1 - this.aimBlend) + adsZ * this.aimBlend + recoilKick;

        this.armPivot.position.set(curX, curY, curZ);

        // Rotation: horizontal with natural right-shoulder offset at hip, zero angle in ADS
        const hipRotX = -0.02 + recoilPitch;
        const hipRotY = 0.04;
        const hipRotZ = -0.02 + weaponBobRoll;

        const adsRotX = 0.0 + recoilPitch * 0.35;
        const adsRotY = 0.0;
        const adsRotZ = 0.0;

        this.armPivot.rotation.set(
          hipRotX * (1 - this.aimBlend) + adsRotX * this.aimBlend,
          hipRotY * (1 - this.aimBlend) + adsRotY * this.aimBlend,
          hipRotZ * (1 - this.aimBlend) + adsRotZ * this.aimBlend
        );
      } else if (this.punchProgress > 0) {
        this.punchProgress -= dt * 6.5;
        if (this.punchProgress < 0) this.punchProgress = 0;
        const punch = Math.sin((1.0 - this.punchProgress) * Math.PI);
        this.armPivot.position.x = 0.36;
        this.armPivot.rotation.x = -0.25 - punch * 0.9;
        this.armPivot.rotation.y = 0.35 - punch * 0.4;
        this.armPivot.position.z = -0.52 - punch * 0.12;
      } else {
        const bobArmX = isMoving ? Math.sin(this.bobTimer) * 0.05 : 0;
        const bobArmY = isMoving ? Math.abs(Math.cos(this.bobTimer)) * 0.03 : 0;
        this.armPivot.position.x = 0.36;
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
