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
import { VehicleManager, DrivableCar } from './vehicle.js';
import { MissileManager } from './missile.js';
import { StrategicBomber } from './bomber.js';
import { BunkerManager } from './bunker.js';
import { TacticalRadar } from './radar.js';
import { Avatar } from './avatar.js';
import { BLOCKS } from './blocks.js';
import { sound } from './audio.js';

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
      this.world,
      this.particleManager
    );
    this.controls.setScene(this.sceneManager.scene);
    this.localAvatar = new Avatar('local', 'Tú', this.sceneManager.scene, this.world);
    this.controls.setLocalAvatar(this.localAvatar);

    // 5. Initialize Multiplayer Client
    this.multiplayer = new MultiplayerClient(
      this.world,
      this.sceneManager.scene,
      this.particleManager
    );
    this.multiplayer.physics = this.physics;
    this.multiplayer.controls = this.controls;

    // 6. Initialize Ambient Voxel Animals, Rare NPCs & Highway Traffic
    this.animalManager = new AnimalManager(this.sceneManager.scene, this.world);
    this.controls.animalManager = this.animalManager;

    // 6b. Initialize Drivable Racing Cars & Grand Prix Fleet
    this.vehicleManager = new VehicleManager(
      this.world,
      this.sceneManager.scene,
      this.particleManager
    );
    this.controls.setVehicleManager(this.vehicleManager);

    // 6c. Initialize Guided Missile System & Tactical Radar (Admin Exclusive)
    this.missileManager = new MissileManager(
      this.sceneManager.scene,
      this.particleManager,
      this.multiplayer,
      sound
    );
    this.multiplayer.missileManager = this.missileManager;

    // 6d. Initialize Strategic Heavy Bomber B-1 & Carpet Bombing System
    this.bomber = new StrategicBomber(
      this.sceneManager.scene,
      this.particleManager,
      this.world,
      sound
    );
    this.bomber.onBombImpact = (bx, by, bz) => {
      if (this.multiplayer && typeof this.multiplayer.sendTntTrigger === 'function') {
        this.multiplayer.sendTntTrigger(bx, by, bz, 0, 1);
      }
    };
    this.multiplayer.bomberManager = this.bomber;

    // 6e. Initialize Mega Underground Bunker & 180 Surface Missile Silos
    this.bunkerManager = new BunkerManager(
      this.sceneManager.scene,
      this.particleManager,
      this.world,
      sound,
      this.multiplayer,
      this.missileManager,
      this.sceneManager.renderer
    );
    this.bunkerManager.physics = this.physics;
    this.bunkerManager.controls = this.controls;
    this.missileManager.bunkerManager = this.bunkerManager;
    if (this.multiplayer) {
      this.multiplayer.bunkerManager = this.bunkerManager;
    }

    // 7. Initialize UI Overlay & HUD
    this.ui = new UIManager(
      this.materialManager,
      this.controls,
      this.sceneManager,
      this.world,
      this.multiplayer,
      this.animalManager,
      this.vehicleManager
    );

    this.tacticalRadar = new TacticalRadar(this.multiplayer, this.missileManager);
    this.ui.setTacticalRadar(this.tacticalRadar);

    // Connect Multiplayer Animal & Vehicle Synchronizer
    if (this.multiplayer) {
      this.multiplayer.onAnimalsUpdate = (animals) => {
        this.animalManager.syncAnimalsFromServer(animals);
      };
      this.multiplayer.onVehicleDrive = (data) => {
        this.vehicleManager.handleRemoteDrive(data, this.multiplayer.remoteAvatars);
      };
      this.multiplayer.onVehicleExit = (data) => {
        this.vehicleManager.handleRemoteExit(data, this.multiplayer.remoteAvatars);
      };
      this.multiplayer.onMissileImpact = (data) => {
        if (this.missileManager && data && data.missileId) {
          const m = this.missileManager.missiles.get(data.missileId);
          if (m) {
            m.destroyMidAir();
            this.missileManager.missiles.delete(data.missileId);
          }
        }
      };
    }

    // Connect Vehicle Events to Multiplayer and UI
    this.vehicleManager.onEnterCar = (car) => {
      if (this.multiplayer) {
        this.multiplayer.sendVehicleEnter(car.id);
      }
      if (this.ui && typeof this.ui.onEnterVehicle === 'function') {
        this.ui.onEnterVehicle(car);
      }
    };

    this.vehicleManager.onExitCar = (car) => {
      if (this.multiplayer) {
        this.multiplayer.sendVehicleExit(car.id);
      }
      if (this.ui && typeof this.ui.onExitVehicle === 'function') {
        this.ui.onExitVehicle();
      }
    };

    // Setup Block Interaction & Weapons Events
    this.setupInteractions();

    // Initial safe player spawn at open plaza viewpoint facing the Golden Altar & Statues:
    // Synchronously pre-generates 3x3 core chunks (<35ms) around spawn (0, 0) and queues outer chunks for progressive background streaming
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

      // Place authoritative block in the world and replicate via multiplayer
      this.multiplayer.sendBlockModify(placePos.x, placePos.y, placePos.z, selectedBlockId);
    };

    // Rifle Shoot (Authentic 3D rifle, luminous tracer, animal blood particles & shoot-to-detonate TNT)
    this.controls.onWeaponShoot = ({ origin, dir, muzzlePos, voxelHit, range, isSniperShot }) => {
      const isScoped = Boolean(isSniperShot || (this.controls && (this.controls.isAiming || this.controls.aimBlend > 0.3)));
      const tracerStart = isScoped ? (this.controls?.camera?.position || origin) : (muzzlePos || origin);
      const effectiveRange = typeof range === 'number' ? range : (isScoped ? 1000 : 85);

      // 1. Particle muzzle flash & smoke at gun barrel
      if (this.particleManager && typeof this.particleManager.spawnMuzzleFlash === 'function') {
        this.particleManager.spawnMuzzleFlash(tracerStart, dir);
      }

      // 2. Raycast remote player hit
      let targetPlayerId = null;
      let targetPlayerHit = null;
      if (this.multiplayer && typeof this.multiplayer.getRaycastPlayerHit === 'function') {
        targetPlayerHit = this.multiplayer.getRaycastPlayerHit(origin, dir, effectiveRange);
        if (targetPlayerHit) {
          targetPlayerId = targetPlayerHit.id;
        }
      }

      // 3. Raycast animal / rare NPC hit
      let hitAnim = null;
      if (this.animalManager && typeof this.animalManager.getHitAnimal === 'function') {
        hitAnim = this.animalManager.getHitAnimal(origin, dir, effectiveRange);
      }

      // 4. Raycast voxel block hit (check for BLOCKS.TNT)
      const isTnt = voxelHit && (voxelHit.type === BLOCKS.TNT || voxelHit.type === 19);

      // Distance arbitration: find closest impact target
      const playerDist = targetPlayerHit ? targetPlayerHit.distance : Infinity;
      const animalDist = hitAnim ? (hitAnim.distance || effectiveRange) : Infinity;
      const voxelDist = voxelHit ? Math.hypot(voxelHit.x + 0.5 - origin.x, voxelHit.y + 0.5 - origin.y, voxelHit.z + 0.5 - origin.z) : Infinity;

      let targetPoint = null;
      let targetAnimalId = null;

      if (hitAnim && animalDist <= playerDist && animalDist <= voxelDist) {
        // Bullet hit an animal or NPC: spawn blood particles & trigger knockback animation
        targetAnimalId = hitAnim.id;
        targetPoint = { x: hitAnim.x, y: hitAnim.y, z: hitAnim.z };

        if (this.particleManager && typeof this.particleManager.spawnBloodParticles === 'function') {
          this.particleManager.spawnBloodParticles(hitAnim.x, hitAnim.y, hitAnim.z, dir);
        } else if (this.particleManager && typeof this.particleManager.spawnBloodImpact === 'function') {
          this.particleManager.spawnBloodImpact(hitAnim.x, hitAnim.y, hitAnim.z, dir);
        } else if (this.particleManager && typeof this.particleManager.spawnAnimalBurst === 'function') {
          this.particleManager.spawnAnimalBurst(hitAnim.x, hitAnim.y, hitAnim.z, dir);
        }

        if (this.animalManager && typeof this.animalManager.burstAnimal === 'function') {
          this.animalManager.burstAnimal(hitAnim.id, this.physics.pos, dir);
        } else if (this.animalManager && typeof this.animalManager.triggerAnimalHit === 'function') {
          this.animalManager.triggerAnimalHit(hitAnim.id, dir);
        }
      } else if (targetPlayerHit && playerDist <= animalDist && playerDist <= voxelDist) {
        // Bullet hit a remote player (friendly notification)
        targetPoint = {
          x: origin.x + dir.x * targetPlayerHit.distance,
          y: origin.y + dir.y * targetPlayerHit.distance,
          z: origin.z + dir.z * targetPlayerHit.distance
        };
      } else if (voxelHit && voxelDist < Infinity) {
        targetPoint = { x: voxelHit.x + 0.5, y: voxelHit.y + 0.5, z: voxelHit.z + 0.5 };
        if (isTnt) {
          // Shoot-to-detonate TNT immediately with shockwave particles and sound
          if (!this.multiplayer || !this.multiplayer.isConnected) {
            if (this.world && typeof this.world.setBlock === 'function') {
              this.world.setBlock(voxelHit.x, voxelHit.y, voxelHit.z, 0, true);
            }
            if (this.particleManager && typeof this.particleManager.spawnExplosion === 'function') {
              this.particleManager.spawnExplosion(voxelHit.x, voxelHit.y, voxelHit.z);
            }
            if (sound && typeof sound.playExplosion === 'function') {
              sound.playExplosion();
            }
          }
        } else {
          // NON-DESTRUCTIVE SHOOTING: Shooting MUST NEVER destroy terrain blocks!
          if (this.particleManager && typeof this.particleManager.spawnMuzzleFlash === 'function') {
            this.particleManager.spawnMuzzleFlash(targetPoint);
          }
        }
      } else {
        // No surface hit: tracer travels into the distance
        const tracerDist = Math.min(effectiveRange, 220);
        targetPoint = {
          x: origin.x + dir.x * tracerDist,
          y: origin.y + dir.y * tracerDist,
          z: origin.z + dir.z * tracerDist
        };
      }

      // 5. Render visible high-speed luminous 3D bullet tracer beam from gun barrel toward target
      if (this.particleManager && typeof this.particleManager.spawnBulletTracer === 'function') {
        this.particleManager.spawnBulletTracer(tracerStart, targetPoint);
      }

      // 6. Send multiplayer packet
      if (this.multiplayer && typeof this.multiplayer.sendWeaponShoot === 'function') {
        this.multiplayer.sendWeaponShoot({
          origin: [tracerStart.x, tracerStart.y, tracerStart.z],
          dir: [dir.x, dir.y, dir.z],
          targetPlayerId,
          targetAnimalId,
          targetTnt: isTnt ? { x: voxelHit.x, y: voxelHit.y, z: voxelHit.z } : null,
          hitPos: targetPoint ? [targetPoint.x, targetPoint.y, targetPoint.z] : null
        });
      }
    };

    // Shoot-to-detonate TNT callback
    this.controls.onShootTnt = (voxelHit) => {
      if (!voxelHit) return;
      const radius = voxelHit.radius || (this.controls?.getTntRadius ? this.controls.getTntRadius() : 3);
      if (this.multiplayer && typeof this.multiplayer.sendTntTrigger === 'function') {
        this.multiplayer.sendTntTrigger(voxelHit.x, voxelHit.y, voxelHit.z, 0, radius);
      }
    };
    this.controls.sendTntTrigger = (x, y, z, fuseMs = 0, radius = null) => {
      const blastRadius = typeof radius === 'number' ? radius : (this.controls?.getTntRadius ? this.controls.getTntRadius() : 3);
      if (this.multiplayer && typeof this.multiplayer.sendTntTrigger === 'function') {
        this.multiplayer.sendTntTrigger(x, y, z, fuseMs, blastRadius);
      }
    };

    // TNT placement & trigger (spawns a SINGLE 3D primed TNT block on the targeted surface)
    this.controls.onPlaceTnt = (coords) => {
      if (!coords) return;
      const hasThrownEntity = Boolean(coords.entitySpawned) || (
        Array.isArray(this.controls.activeTntEntities) &&
        this.controls.activeTntEntities.some(t => !t.isDead && Math.hypot(t.pos.x - coords.x, t.pos.z - coords.z) < 3.5)
      );

      if (!hasThrownEntity && this.particleManager && typeof this.particleManager.spawnPrimedTnt === 'function') {
        const isOnline = Boolean(this.multiplayer && this.multiplayer.isConnected);

        this.particleManager.spawnPrimedTnt(coords, coords, 3000, (bx, by, bz) => {
          if (!isOnline) {
            if (this.world && typeof this.world.applyBlockDelta === 'function') {
              for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                  for (let dz = -2; dz <= 2; dz++) {
                    if (dx * dx + dy * dy + dz * dz <= 5 && by + dy > 1) {
                      this.world.applyBlockDelta(bx + dx, by + dy, bz + dz, 0);
                    }
                  }
                }
              }
            }
            if (this.particleManager && typeof this.particleManager.spawnExplosion === 'function') {
              this.particleManager.spawnExplosion(bx, by, bz);
            }
            if (sound && typeof sound.playExplosion === 'function') {
              sound.playExplosion();
            }
          }
        });
      }

      if (this.multiplayer && typeof this.multiplayer.sendTntTrigger === 'function') {
        this.multiplayer.sendTntTrigger(coords.x, coords.y, coords.z, 3000);
      }
    };

    // Synchronized remote TNT prime & animal burst handlers across clients
    if (this.multiplayer) {
      this.multiplayer.onTntPrime = (x, y, z, fuseMs = 3000, playerId = null) => {
        // Ignore echo for our own TNT so we never spawn a duplicate second cube!
        if (playerId && this.multiplayer.myId && playerId === this.multiplayer.myId) return;
        const hasLocalTntEntity = Array.isArray(this.controls.activeTntEntities) &&
          this.controls.activeTntEntities.some(t => !t.isDead && Math.hypot(t.pos.x - (x + 0.5), t.pos.z - (z + 0.5)) < 3.5);
        if (hasLocalTntEntity) return;

        if (this.particleManager && typeof this.particleManager.spawnPrimedTnt === 'function') {
          const alreadyActive = Array.isArray(this.particleManager.primedTnts) &&
            this.particleManager.primedTnts.some(t => Math.abs(t.bx - x) <= 1 && Math.abs(t.by - y) <= 1 && Math.abs(t.bz - z) <= 1);
          if (!alreadyActive) {
            this.particleManager.spawnPrimedTnt({ x, y, z }, { x, y, z }, fuseMs);
          }
        }
      };

      this.multiplayer.onAnimalBurst = (data) => {
        if (!data) return;
        const isMe = data.shooterId && this.multiplayer && (data.shooterId === this.multiplayer.myId);
        if (!isMe) {
          const hitDir = data.dir || [0, 0, -1];
          if (this.animalManager && typeof this.animalManager.burstAnimal === 'function') {
            this.animalManager.burstAnimal(data.animalId, this.physics.pos, hitDir);
          }
          if (this.particleManager && typeof this.particleManager.spawnBloodParticles === 'function') {
            const bx = data.x !== undefined ? data.x : 0;
            const by = data.y !== undefined ? data.y : 25;
            const bz = data.z !== undefined ? data.z : 0;
            this.particleManager.spawnBloodParticles(bx, by, bz, hitDir);
          }
        }
      };
    }
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

    // 5b. Vehicle Driving Simulation & Multiplayer Sync
    if (this.vehicleManager) {
      if (this.vehicleManager.isDriving() && this.multiplayer) {
        this.multiplayer.sendVehicleDrive(this.vehicleManager.activeCar);
      }
      this.vehicleManager.update(dt, this.controls, this.multiplayer);
    }

    // 5c. Guided Missile Simulation & Tactical Radar (Admin Exclusive)
    if (this.missileManager) {
      this.missileManager.update(dt, this.physics.pos);
    }
    if (this.tacticalRadar) {
      this.tacticalRadar.update(dt, this.physics.pos);
    }
    if (this.bomber) {
      this.bomber.update(dt, this.multiplayer ? this.multiplayer.playerDirectory : null);
    }
    if (this.bunkerManager) {
      this.bunkerManager.update(dt, this.physics.pos);
    }

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

