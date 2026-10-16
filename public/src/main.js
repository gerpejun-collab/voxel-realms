// public/src/main.js
// Voxel Realms - Main Application Entrypoint & Game Loop
import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { MaterialManager } from './materials.js';
import { ParticleManager } from './particles.js';
import { World } from './world.js';
import { PlayerPhysics } from './physics.js';
import { Controls } from './controls.js';
import { MultiplayerClient } from './multiplayer.js';
import { UIManager } from './ui.js';
import { AnimalManager } from './animals.js';
import { Avatar } from './avatar.js';

class VoxelRealmsApp {
  constructor() {
    this.container = document.getElementById('canvas-container');

    // 1. Initialize Graphics & Scene
    this.sceneManager = new SceneManager(this.container);
    this.materialManager = new MaterialManager();
    this.particleManager = new ParticleManager(this.sceneManager.scene);

    // 2. Initialize World & Procedural Terrain
    this.world = new World(this.sceneManager.scene, this.materialManager, 48151623);

    // 3. Initialize Character Physics & Swept-AABB
    this.physics = new PlayerPhysics(this.world);

    // 4. Initialize Controls, Camera & Local Avatar
    this.controls = new Controls(
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement,
      this.physics,
      this.world
    );
    this.localAvatar = new Avatar('local', 'Tú', this.sceneManager.scene);
    this.controls.setLocalAvatar(this.localAvatar);

    // 5. Initialize Multiplayer Client
    this.multiplayer = new MultiplayerClient(
      this.world,
      this.sceneManager.scene,
      this.particleManager
    );

    // 6. Initialize Ambient Voxel Animals, Rare NPCs & Highway Traffic
    this.animalManager = new AnimalManager(this.sceneManager.scene, this.world);

    // 7. Initialize UI Overlay & HUD
    this.ui = new UIManager(
      this.materialManager,
      this.controls,
      this.sceneManager,
      this.world,
      this.multiplayer,
      this.animalManager
    );

    // Connect Multiplayer Animal Synchronizer & Bursts
    if (this.multiplayer) {
      this.multiplayer.onAnimalsUpdate = (animals) => {
        this.animalManager.syncAnimalsFromServer(animals);
      };
      this.multiplayer.onAnimalBurst = (burstData) => {
        if (burstData && this.particleManager) {
          this.particleManager.spawnAnimalBurst(burstData.x, burstData.y, burstData.z);
        }
      };
    }

    // Setup Block Interaction & Weapons Events
    this.setupInteractions();

    // Initial safe player spawn at open plaza viewpoint facing the Golden Altar & Statues
    this.world.updateStreaming(0, 0);
    this.physics.respawn(3, 6);
    this.controls.yaw = 0.45;
    this.controls.pitch = 0.06;

    // Game loop timing
    this.clock = new THREE.Clock();
    this.fpsCounter = 0;
    this.fpsTimer = 0;
    this.currentFps = 60;
    this.lastFrameTime = 0;

    // Start loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupInteractions() {
    // Left Click: Destroy Block
    this.controls.onBreakBlock = (target) => {
      this.multiplayer.sendBlockModify(target.x, target.y, target.z, 0);
    };

    // Right Click: Place Selected Block
    this.controls.onPlaceBlock = (placePos) => {
      const selectedBlockId = this.ui.getSelectedBlock();
      if (!selectedBlockId) return;

      // Validate that placement doesn't collide with player feet or body
      const px = this.physics.pos.x;
      const py = this.physics.pos.y;
      const pz = this.physics.pos.z;

      const pMinX = px - 0.3, pMaxX = px + 0.3;
      const pMinY = py, pMaxY = py + 1.8;
      const pMinZ = pz - 0.3, pMaxZ = pz + 0.3;

      const bMinX = placePos.x, bMaxX = placePos.x + 1;
      const bMinY = placePos.y, bMaxY = placePos.y + 1;
      const bMinZ = placePos.z, bMaxZ = placePos.z + 1;

      const intersects = (pMinX < bMaxX && pMaxX > bMinX) &&
                         (pMinY < bMaxY && pMaxY > bMinY) &&
                         (pMinZ < bMaxZ && pMaxZ > bMinZ);

      if (intersects) {
        return; // Block placement would trap player
      }

      this.multiplayer.sendBlockModify(placePos.x, placePos.y, placePos.z, selectedBlockId);
    };

    // Rifle Shoot (Sniper / Non-lethal player hit & animal bursting)
    this.controls.onWeaponShoot = ({ origin, dir, voxelHit }) => {
      // 1. Particle muzzle flash & smoke
      if (this.particleManager && typeof this.particleManager.spawnMuzzleFlash === 'function') {
        this.particleManager.spawnMuzzleFlash(origin, dir);
      }

      // 2. Raycast remote player hit (friendly notification)
      let targetPlayerId = null;
      let targetPlayerHit = null;
      if (this.multiplayer && typeof this.multiplayer.getRaycastPlayerHit === 'function') {
        targetPlayerHit = this.multiplayer.getRaycastPlayerHit(origin, dir, 85);
        if (targetPlayerHit) {
          targetPlayerId = targetPlayerHit.id;
        }
      }

      // 3. Raycast animal / rare NPC hit
      let targetAnimalId = null;
      if (this.animalManager && typeof this.animalManager.getHitAnimal === 'function') {
        const hitAnim = this.animalManager.getHitAnimal(origin, dir, 75);
        if (hitAnim) {
          targetAnimalId = hitAnim.id;
          const burstPos = this.animalManager.burstAnimal(hitAnim.id, this.physics.pos);
          if (burstPos && this.particleManager && typeof this.particleManager.spawnAnimalBurst === 'function') {
            this.particleManager.spawnAnimalBurst(burstPos.x, burstPos.y, burstPos.z);
          }
        }
      }

      // 4. Send multiplayer packet
      if (this.multiplayer && typeof this.multiplayer.sendWeaponShoot === 'function') {
        this.multiplayer.sendWeaponShoot({
          origin: [origin.x, origin.y, origin.z],
          dir: [dir.x, dir.y, dir.z],
          targetPlayerId,
          targetAnimalId,
          hitPos: targetPlayerHit ? [origin.x + dir.x * targetPlayerHit.distance, origin.y + dir.y * targetPlayerHit.distance, origin.z + dir.z * targetPlayerHit.distance] : null
        });
      }
    };

    // TNT placement & trigger
    this.controls.onPlaceTnt = (coords) => {
      if (!coords) return;
      if (this.multiplayer && typeof this.multiplayer.sendTntTrigger === 'function') {
        this.multiplayer.sendTntTrigger(coords.x, coords.y, coords.z);
      }
    };
  }

  animate() {
    requestAnimationFrame(this.animate);

    // FPS Cap throttling (10, 30, 60, 100, 120, MAX)
    const targetFps = window.targetMaxFps || Infinity;
    if (targetFps < 300) {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const minInterval = 1000 / targetFps;
      if (this.lastFrameTime && (now - this.lastFrameTime < minInterval - 1.2)) {
        return;
      }
      this.lastFrameTime = now;
    }

    // Calculate delta time (capped to avoid physics anomalies on lag)
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.08);

    // FPS calculation
    this.fpsCounter++;
    this.fpsTimer += rawDt;
    if (this.fpsTimer >= 1.0) {
      this.currentFps = Math.round(this.fpsCounter / this.fpsTimer);
      this.fpsCounter = 0;
      this.fpsTimer = 0;
    }

    // 1. Controls & Physics Update
    this.controls.update(dt);

    // 2. Dynamic Chunk Streaming & Remeshing
    this.world.updateStreaming(this.physics.pos.x, this.physics.pos.z);
    this.world.updateRemesh();

    // 3. PBR Animated Materials
    this.materialManager.update(dt);

    // 4. Wind & Destruction Particles
    this.particleManager.update(dt, this.physics.pos);

    // 5. Multiplayer Movement & Remote Avatars
    this.multiplayer.sendMove(
       this.physics.pos,
       { yaw: this.controls.yaw, pitch: this.controls.pitch },
       this.physics.action
     );
    this.multiplayer.update(dt);

    // 6. Ambient Voxel Animals, Rare NPCs & Highway Traffic
    this.animalManager.update(dt, this.physics.pos);

    // 7. Day/Night Atmosphere & Sun Orbit (Perpetual Bright Day)
    this.sceneManager.updateDayNightCycle(this.multiplayer.timeOfDay, this.physics.pos);

    // 8. HUD, Target Highlight & Telemetry
    this.ui.updateHUD(this.currentFps, this.physics.pos);

    // 9. Render Frame
    this.sceneManager.render();
  }
}

// Launch application on DOM ready or immediately if already loaded
function launchApp() {
  try {
    window.app = new VoxelRealmsApp();
    console.log('🎮 VoxelRealmsApp initialized successfully.');
    if (window.__wantsToJoin && window.app.ui && typeof window.app.ui.triggerJoin === 'function') {
      window.app.ui.triggerJoin();
    }
  } catch (err) {
    console.error('Critical failure launching VoxelRealmsApp:', err);
    const statusPill = document.getElementById('server-status-pill');
    if (statusPill) {
      statusPill.innerHTML = `<span class="status-dot offline"></span> Error: ${err.message || err}`;
    }
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', launchApp);
} else {
  launchApp();
}

