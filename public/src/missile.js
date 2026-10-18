// public/src/missile.js
// Guided Homing Tactical Missile System (Exclusive Admin Weapon)
// Real-time homing tracking, dual air vs land kinematics, 4-stage ignition timelines,
// procedural 3D rocket meshes (white air-to-air vs heavy titanium ballistic),
// dense smoke contrails, active iron dome interceptors, and 3X colossal retaliation missiles.

import * as THREE from 'three';

export class GuidedMissile {
  constructor(options, scene, particleManager, onDetonate) {
    this.id = options.missileId || ('msl_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
    this.launcherId = options.launcherId;
    this.launcherName = options.launcherName || 'Admin';
    this.targetPlayerId = options.targetPlayerId;
    this.targetName = options.targetName || 'Objetivo';
    this.launchType = options.launchType || 'land'; // 'air' | 'land'
    this.isRetaliation = Boolean(options.isRetaliation);
    this.isInterceptor = Boolean(options.isInterceptor);
    this.targetHostileMissile = options.targetHostileMissile || null;

    this.power = options.power || (this.isRetaliation ? 8 : 4);

    this.scene = scene;
    this.particleManager = particleManager;
    this.onDetonate = onDetonate;

    // Start coordinates and target coordinates
    const sx = options.startPos ? options.startPos[0] : 0;
    const sy = options.startPos ? options.startPos[1] : 25;
    const sz = options.startPos ? options.startPos[2] : 0;

    const tx = options.targetPos ? options.targetPos[0] : 0;
    const ty = options.targetPos ? options.targetPos[1] : 25;
    const tz = options.targetPos ? options.targetPos[2] : 0;

    this.pos = new THREE.Vector3(sx, sy + 1.2, sz);
    this.targetPos = new THREE.Vector3(tx, ty + 1.0, tz);
    this.lastKnownTargetPos = this.targetPos.clone();
    this.targetDisconnected = false;
    this.targetVelocity = new THREE.Vector3(0, 0, 0);
    this.prevTargetPos = this.targetPos.clone();
    this.hasPrevTargetPos = false;
    this.closestDistToTarget = Infinity;
    this.missileManager = options.missileManager || null;

    // Initial forward orientation
    const startYaw = typeof options.startYaw === 'number' ? options.startYaw : 0;
    const initialPitch = (this.launchType === 'air') ? 0.25 : 0.65;
    this.forward = new THREE.Vector3(
      -Math.sin(startYaw),
      initialPitch,
      -Math.cos(startYaw)
    ).normalize();

    // Flight kinematics: gradual acceleration and realistic turn limits
    this.speed = 16.0;
    this.maxSpeed = 82.0;
    this.accel = 24.0;
    this.maxTurnRate = 2.4;
    this.liftoffTime = 1.15;

    // Flight kinematics based on Launch Type
    if (this.isInterceptor) {
      this.speed = 18.0;
      this.maxSpeed = 95.0;
      this.accel = 38.0;
      this.maxTurnRate = 5.2;
      this.liftoffTime = 0.4;
    } else if (this.isRetaliation) {
      this.speed = 4.0;
      this.maxSpeed = 80.0;
      this.accel = 20.0;
      this.maxTurnRate = 2.0;
      this.liftoffTime = 3.5;
    } else if (this.launchType === 'air') {
      // Air Launch: 0-2s slow climb, 2-3s pre-ignition, 3-4s max thrust, >4s hypersonic cruise
      this.speed = 8.0;
      this.maxSpeed = 85.0;
      this.accel = 26.0;
      this.maxTurnRate = 2.6;
      this.liftoffTime = 4.0;
    } else {
      // Land Launch: 0-4.5s slow heavy liftoff with dense smoke, then booster stage acceleration
      this.speed = 5.0;
      this.maxSpeed = 82.0;
      this.accel = 22.0;
      this.maxTurnRate = 2.4;
      this.liftoffTime = 4.5;
    }

    this.age = 0;
    this.maxLifetime = 60.0;
    this.isDetonated = false;
    this.isDestroyedMidAir = false;
    this.smokeTimer = 0;

    // Color assigned for missile & radar matching
    this.colorHex = options.colorHex || (this.isInterceptor ? 0x38bdf8 : (this.isRetaliation ? 0xdc2626 : 0xef4444));

    // Build 3D mesh
    this.mesh = this.buildMesh();
    this.mesh.position.copy(this.pos);
    if (this.isRetaliation) {
      this.mesh.scale.set(3.0, 3.0, 3.0);
    } else if (this.isInterceptor) {
      this.mesh.scale.set(0.75, 0.75, 0.75);
    }

    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.mesh);
    }
  }

  /**
   * Procedural military missile 3D mesh
   * - Air Launch: Sleek white aerodynamic missile (AIM-120 style)
   * - Land Launch: Heavy dark titanium ballistic missile with hazard bands and dual thrusters
   * - Interceptor: Agile cyan/white rocket
   */
  buildMesh() {
    const group = new THREE.Group();

    if (this.launchType === 'air' || this.isInterceptor) {
      // --- AIR LAUNCH / INTERCEPTOR MODEL (Sleek White/Cyan) ---
      const bodyMat = new THREE.MeshStandardMaterial({
        color: this.isInterceptor ? 0x0284c7 : 0xf8fafc, // Pure military white or sky blue
        roughness: 0.25,
        metalness: 0.8
      });

      // 1. Fuselage
      const bodyGeom = new THREE.CylinderGeometry(0.24, 0.25, 3.4, 12);
      bodyGeom.rotateX(Math.PI / 2);
      const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
      group.add(bodyMesh);

      // Radome nose
      const noseGeom = new THREE.ConeGeometry(0.24, 0.95, 12);
      noseGeom.rotateX(Math.PI / 2);
      const noseMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.2,
        metalness: 0.9
      });
      const noseMesh = new THREE.Mesh(noseGeom, noseMat);
      noseMesh.position.set(0, 0, 2.15);
      group.add(noseMesh);

      // White Cruciform Tail Fins
      const finMat = new THREE.MeshStandardMaterial({
        color: this.isInterceptor ? 0x38bdf8 : 0xe2e8f0,
        roughness: 0.3,
        metalness: 0.7
      });
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const finGeom = new THREE.BoxGeometry(0.04, 0.48, 0.85);
        const finMesh = new THREE.Mesh(finGeom, finMat);
        finMesh.position.set(Math.cos(angle) * 0.32, Math.sin(angle) * 0.32, -1.35);
        finMesh.rotation.z = angle;
        group.add(finMesh);
      }

      // Canard guidance fins near nose
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        const cGeom = new THREE.BoxGeometry(0.02, 0.24, 0.35);
        const cMesh = new THREE.Mesh(cGeom, finMat);
        cMesh.position.set(Math.cos(angle) * 0.26, Math.sin(angle) * 0.26, 1.25);
        cMesh.rotation.z = angle;
        group.add(cMesh);
      }
    } else {
      // --- LAND LAUNCH MODEL (Imposing Heavy Titanium Ballistic) ---
      const bodyMat = new THREE.MeshStandardMaterial({
        color: this.isRetaliation ? 0x111827 : 0x1f2937, // Heavy charcoal/stealth black
        roughness: 0.35,
        metalness: 0.85
      });

      // 1. Heavy Fuselage (wider diameter 0.36m, length 3.8m)
      const bodyGeom = new THREE.CylinderGeometry(0.34, 0.36, 3.6, 14);
      bodyGeom.rotateX(Math.PI / 2);
      const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
      group.add(bodyMesh);

      // Hazard yellow inspection bands
      const bandGeom = new THREE.CylinderGeometry(0.345, 0.345, 0.25, 14);
      bandGeom.rotateX(Math.PI / 2);
      const bandMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
      const b1 = new THREE.Mesh(bandGeom, bandMat);
      b1.position.set(0, 0, 1.1);
      const b2 = new THREE.Mesh(bandGeom, bandMat);
      b2.position.set(0, 0, 0.7);
      group.add(b1, b2);

      // Heavy conical nose cone
      const noseGeom = new THREE.ConeGeometry(0.34, 1.1, 14);
      noseGeom.rotateX(Math.PI / 2);
      const noseMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.2,
        metalness: 0.95
      });
      const noseMesh = new THREE.Mesh(noseGeom, noseMat);
      noseMesh.position.set(0, 0, 2.35);
      group.add(noseMesh);

      // Heavy swept grid fins at tail
      const finMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.7 });
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const finGeom = new THREE.BoxGeometry(0.06, 0.65, 0.9);
        const finMesh = new THREE.Mesh(finGeom, finMat);
        finMesh.position.set(Math.cos(angle) * 0.44, Math.sin(angle) * 0.44, -1.45);
        finMesh.rotation.z = angle;
        group.add(finMesh);
      }
    }

    // Rear Thruster Nozzle
    const nozzleGeom = new THREE.CylinderGeometry(0.24, 0.18, 0.4, 12);
    nozzleGeom.rotateX(Math.PI / 2);
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.95,
      roughness: 0.15
    });
    const nozzle = new THREE.Mesh(nozzleGeom, nozzleMat);
    nozzle.position.set(0, 0, -1.85);
    group.add(nozzle);

    // Pulsating Rocket Flame Mesh
    const flameGeom = new THREE.ConeGeometry(0.26, 1.6, 10);
    flameGeom.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({
      color: this.isInterceptor ? 0x38bdf8 : 0xff6600,
      transparent: true,
      opacity: 0.92
    });
    this.flameMesh = new THREE.Mesh(flameGeom, flameMat);
    this.flameMesh.position.set(0, 0, -2.65);
    group.add(this.flameMesh);

    // Dynamic thruster point light
    this.light = new THREE.PointLight(this.isInterceptor ? 0x38bdf8 : 0xff7700, 2.8, 16);
    this.light.position.set(0, 0, -2.4);
    group.add(this.light);

    return group;
  }

  /**
   * Updates target position from live player registry or caches last known position on disconnect
   */
  updateTarget(playerDirectory, remoteAvatars) {
    if (this.isDetonated || this.isDestroyedMidAir) return;

    if (this.isInterceptor) {
      if (this.targetHostileMissile && (this.targetHostileMissile.isDetonated || this.targetHostileMissile.isDestroyedMidAir)) {
        this.targetHostileMissile = null;
      }

      // If no active hostile missile or previous was destroyed, dynamically acquire one
      if (!this.targetHostileMissile && this.missileManager) {
        for (const m of this.missileManager.missiles.values()) {
          if (!m.isInterceptor && !m.isRetaliation && !m.isDetonated && !m.isDestroyedMidAir) {
            this.targetHostileMissile = m;
            break;
          }
        }
      }

      if (this.targetHostileMissile) {
        this.targetPos.copy(this.targetHostileMissile.pos);
        if (this.targetHostileMissile.forward && typeof this.targetHostileMissile.speed === 'number') {
          this.targetVelocity.copy(this.targetHostileMissile.forward).multiplyScalar(this.targetHostileMissile.speed);
        }
        return;
      }
    }

    let targetData = null;
    if (playerDirectory && playerDirectory.has(this.targetPlayerId)) {
      targetData = playerDirectory.get(this.targetPlayerId);
    } else if (remoteAvatars && remoteAvatars.has(this.targetPlayerId)) {
      const av = remoteAvatars.get(this.targetPlayerId);
      if (av && av.pos) {
        targetData = { pos: [av.pos.x, av.pos.y, av.pos.z], name: av.name };
      }
    }

    if (targetData && Array.isArray(targetData.pos)) {
      const newPos = new THREE.Vector3(targetData.pos[0], targetData.pos[1] + 1.0, targetData.pos[2]);
      if (this.hasPrevTargetPos) {
        const velSample = new THREE.Vector3().subVectors(newPos, this.prevTargetPos).multiplyScalar(10.0);
        if (velSample.length() < 60.0) {
          this.targetVelocity.lerp(velSample, 0.4);
        }
      }
      this.prevTargetPos.copy(newPos);
      this.hasPrevTargetPos = true;
      this.targetPos.copy(newPos);
      this.lastKnownTargetPos.copy(this.targetPos);
      this.targetDisconnected = false;
      if (targetData.name) this.targetName = targetData.name;
    } else {
      // Player disconnected: lock to last known coordinates!
      this.targetDisconnected = true;
      this.targetPos.copy(this.lastKnownTargetPos);
      this.targetVelocity.set(0, 0, 0);
    }
  }

  /**
   * Physics, steering curves, contrail emissions and impact detection
   */
  update(dt, playerPos) {
    if (this.isDetonated || this.isDestroyedMidAir) return;

    this.age += dt;
    if (this.age >= this.maxLifetime) {
      this.detonate();
      return;
    }

    // Base Militar Forcefield Anti-Missile Perimeter
    // If a hostile missile attempts to penetrate base airspace, forcefield neutralizes it mid-air!
    if (!this.isInterceptor && !this.isRetaliation && this.launcherName !== 'Admin' && this.launcherId !== 'ADMIN_RETALIATION') {
      if (this.pos.x >= -455 && this.pos.x <= -385 && this.pos.z >= 115 && this.pos.z <= 185 && this.pos.y <= 85) {
        this.destroyMidAir();
        return;
      }
    }

    // 1. Phased Kinematics & Acceleration Timeline
    if (this.launchType === 'air' && !this.isInterceptor && !this.isRetaliation) {
      // --- AIR LAUNCH PHASES ---
      // Phase 1 (0 to 2s): slow upward climb (8 m/s), engine warmup
      if (this.age < 2.0) {
        this.speed = 8.0 + (this.age / 2.0) * 4.0;
        this.forward.y += dt * 0.35;
        this.forward.normalize();
        if (this.flameMesh) this.flameMesh.scale.set(0.4, 0.4, 0.5);
      }
      // Phase 2 (2 to 3s): engine medium ignition
      else if (this.age < 3.0) {
        this.speed = 12.0 + (this.age - 2.0) * 14.0;
        if (this.flameMesh) this.flameMesh.scale.set(0.7, 0.7, 0.85);
      }
      // Phase 3 (3 to 4s): max engine thrust with full flame and smoke
      else if (this.age < 4.0) {
        this.speed = 26.0 + (this.age - 3.0) * 28.0;
        if (this.flameMesh) this.flameMesh.scale.set(1.2, 1.2, 1.4);
      }
      // Phase 4 (>4s): hypersonic cruise acceleration up to maxSpeed
      else {
        if (this.speed < this.maxSpeed) {
          this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt);
        }
      }
    } else if (this.launchType === 'land' && !this.isInterceptor && !this.isRetaliation) {
      // --- LAND LAUNCH PHASES ---
      // Phase 1 (0 to 4.5s): slow heavy vertical liftoff, dense smoke plume
      if (this.age < 4.5) {
        this.speed = 5.0 + (this.age / 4.5) * 12.0;
        this.forward.y += dt * 0.5;
        this.forward.normalize();
      }
      // Phase 2 (>4.5s): booster stage, aggressive acceleration
      else {
        if (this.speed < this.maxSpeed) {
          this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt);
        }
      }
    } else {
      // Interceptor or Retaliation missile: smooth continuous acceleration
      if (this.speed < this.maxSpeed) {
        this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt);
      }
    }

    // 2. Real-Time Homing Guidance & Dynamic Calibration
    if (this.age >= this.liftoffTime || this.isInterceptor) {
      const directVec = new THREE.Vector3().subVectors(this.targetPos, this.pos);
      const rawDist = directVec.length();

      // Track Closest Point of Approach (CPA)
      if (rawDist < this.closestDistToTarget) {
        this.closestDistToTarget = rawDist;
      }

      // Proximity Fuze & CPA Detonation:
      // If missile gets within proximity (<= 4.5 - 5.0m) or reaches CPA (distance starts increasing after getting close <= 12m)
      const proximityThreshold = this.isInterceptor ? 5.0 : 4.5;
      const cpaDetonate = (this.closestDistToTarget <= 12.0 && rawDist > this.closestDistToTarget + 0.35);

      // Orbit Breaker: If missile stays within close range (< 32m) for > 1.4s without hitting, detonate immediately!
      if (rawDist < 32.0) {
        this.closeRangeTime = (this.closeRangeTime || 0) + dt;
      } else {
        this.closeRangeTime = 0;
      }
      const orbitBreakDetonate = (this.closeRangeTime > 1.4);

      if (this.isInterceptor) {
        if (rawDist <= proximityThreshold || cpaDetonate || orbitBreakDetonate) {
          if (this.targetHostileMissile) {
            this.targetHostileMissile.destroyMidAir();
          }
          this.destroyMidAir();
          return;
        }
      } else {
        if (rawDist <= proximityThreshold || cpaDetonate || orbitBreakDetonate) {
          this.detonate();
          return;
        }
      }

      // Lead Pursuit / Proportional Intercept:
      // Steer towards target position plus velocity projection
      const closingSpeed = Math.max(this.speed, 20.0);
      const leadTime = Math.min(1.2, rawDist / closingSpeed);
      const aimTarget = this.targetPos.clone();
      if (this.targetVelocity.lengthSq() > 0.01) {
        aimTarget.addScaledVector(this.targetVelocity, leadTime);
      }

      const desiredVec = new THREE.Vector3().subVectors(aimTarget, this.pos);
      if (desiredVec.lengthSq() > 0.001) {
        desiredVec.normalize();
      }

      // Adaptive Turning Rate:
      // As distance to target decreases (< 50m), dynamically scale up maxTurnRate (from base up to 10.5 - 13.0 rad/s)
      let currentTurnRate = this.maxTurnRate;
      if (rawDist < 50.0) {
        const t = 1.0 - Math.max(0, Math.min(1.0, (rawDist - 4.0) / 46.0));
        const maxCloseTurn = this.isInterceptor ? 13.0 : 10.5;
        currentTurnRate = THREE.MathUtils.lerp(this.maxTurnRate, maxCloseTurn, t);
        // Moderate terminal speed inside close range (< 25m) so turning circle radius shrinks to < 3.5m
        if (rawDist < 25.0 && this.speed > 45.0) {
          this.speed = Math.max(45.0, this.speed - 35.0 * dt);
        }
      }

      const angle = this.forward.angleTo(desiredVec);
      if (angle > 0.001) {
        const maxTurn = currentTurnRate * dt;
        const turnStep = Math.min(angle, maxTurn);
        let axis = new THREE.Vector3().crossVectors(this.forward, desiredVec);
        if (axis.lengthSq() < 0.00001) {
          axis.set(0, 1, 0); // 180-deg reversal fallback
        } else {
          axis.normalize();
        }
        this.forward.applyAxisAngle(axis, turnStep).normalize();
      }
    }

    // 3. Position integration
    const stepMove = this.forward.clone().multiplyScalar(this.speed * dt);
    this.pos.add(stepMove);
    this.mesh.position.copy(this.pos);

    // Look along forward direction
    const lookTarget = this.pos.clone().add(this.forward);
    this.mesh.lookAt(lookTarget);
    this.mesh.rotateZ(dt * 3.5);

    // 4. Animated Thruster Flame & Light
    if (this.flameMesh && this.age >= 2.0) {
      const flk = 0.85 + Math.random() * 0.4;
      this.flameMesh.scale.set(flk, flk, 1.0 + Math.random() * 0.35);
    }

    // 5. Dense Contrail Smoke Particles
    this.smokeTimer += dt;
    const smokeRate = (this.launchType === 'land' && this.age < 4.5) ? 0.012 : 0.024;
    if (this.smokeTimer >= smokeRate && this.particleManager) {
      this.smokeTimer = 0;
      const tailPos = this.pos.clone().sub(this.forward.clone().multiplyScalar(2.2));
      if (this.particleManager.debrisParticles && this.particleManager.debrisParticles.length < this.particleManager.maxDebris) {
        this.particleManager.debrisParticles.push({
          x: tailPos.x + (Math.random() - 0.5) * 0.3,
          y: tailPos.y + (Math.random() - 0.5) * 0.3,
          z: tailPos.z + (Math.random() - 0.5) * 0.3,
          vx: -this.forward.x * 2.0 + (Math.random() - 0.5) * 1.5,
          vy: -this.forward.y * 2.0 + 0.8 + Math.random() * 0.8,
          vz: -this.forward.z * 2.0 + (Math.random() - 0.5) * 1.5,
          scale: 0.95 + Math.random() * 0.8,
          rotX: Math.random() * 4,
          rotY: Math.random() * 4,
          life: 1.8,
          maxLife: 1.8
        });
      }
    }
  }

  /**
   * Mid-air kinetic interception destruction without excavating terrain
   */
  destroyMidAir() {
    if (this.isDetonated || this.isDestroyedMidAir) return;
    this.isDestroyedMidAir = true;

    if (this.particleManager && typeof this.particleManager.spawnExplosion === 'function') {
      this.particleManager.spawnExplosion(this.pos.x, this.pos.y, this.pos.z);
    }
    this.dispose();
  }

  /**
   * Executes detonation: triggers callback, spawns explosion, and disposes 3D resources
   */
  detonate() {
    if (this.isDetonated || this.isDestroyedMidAir) return;
    this.isDetonated = true;

    const hitX = this.pos.x;
    const hitY = this.pos.y;
    const hitZ = this.pos.z;

    if (this.particleManager && typeof this.particleManager.spawnExplosion === 'function') {
      this.particleManager.spawnExplosion(hitX, hitY, hitZ);
    }

    if (typeof this.onDetonate === 'function') {
      try {
        this.onDetonate({
          missileId: this.id,
          x: hitX,
          y: hitY,
          z: hitZ,
          targetPlayerId: this.targetPlayerId,
          power: this.power
        });
      } catch (_) {}
    }

    this.dispose();
  }

  dispose() {
    if (this.mesh) {
      if (this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
      }
      this.mesh.traverse((child) => {
        if (child.geometry && typeof child.geometry.dispose === 'function') {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            for (const m of child.material) {
              if (m && typeof m.dispose === 'function') m.dispose();
            }
          } else if (typeof child.material.dispose === 'function') {
            child.material.dispose();
          }
        }
      });
      this.mesh = null;
    }
  }
}

export class MissileManager {
  constructor(scene, particleManager, multiplayer, sound) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.multiplayer = multiplayer;
    this.sound = sound;
    this.missiles = new Map(); // missileId -> GuidedMissile
    this.assignedHostileMissileIds = new Set();
    this.pendingDefenses = [];

    // Distinct target neon colors for visual & radar correspondence
    this.targetPalette = [
      0x06b6d4, // Neon Cyan
      0x10b981, // Emerald Green
      0xfacc15, // Bright Gold
      0xec4899, // Hot Pink
      0xf97316, // Vivid Orange
      0x8b5cf6, // Violet
      0xef4444  // Signal Red
    ];
    this.paletteIndex = 0;
    this.playerColorMap = new Map();
  }

  getColorForPlayer(playerId) {
    if (!this.playerColorMap.has(playerId)) {
      const col = this.targetPalette[this.paletteIndex % this.targetPalette.length];
      this.paletteIndex++;
      this.playerColorMap.set(playerId, col);
    }
    return this.playerColorMap.get(playerId);
  }

  /**
   * Spawns a guided missile from local or network packet
   */
  spawnMissile(data) {
    if (!data || !data.missileId) return null;
    if (this.missiles.has(data.missileId)) return this.missiles.get(data.missileId);

    const colorHex = this.getColorForPlayer(data.targetPlayerId);
    const missile = new GuidedMissile(
      { ...data, colorHex, missileManager: this },
      this.scene,
      this.particleManager,
      (detonatePayload) => {
        this.missiles.delete(detonatePayload.missileId);
        if (this.multiplayer && typeof this.multiplayer.sendMissileDetonate === 'function') {
          this.multiplayer.sendMissileDetonate(detonatePayload);
        }
        if (this.sound && typeof this.sound.playMissileImpact === 'function') {
          this.sound.playMissileImpact();
        }
      }
    );

    this.missiles.set(data.missileId, missile);

    if (this.sound && typeof this.sound.playMissileLaunch === 'function') {
      this.sound.playMissileLaunch();
    }

    return missile;
  }

  /**
   * Arms Iron Dome Secret Defense: waits until hostile incoming missiles are within visual proximity
   * (<= 85m) so player can clearly see the missile in the background sky, then launches interceptors
   * with 1-to-1+ threat coverage to destroy them mid-air, followed by Colossal Retaliation Missiles and B-1 bomber deployment.
   */
  triggerIronDomeDefense(data) {
    if (!data) return;
    if (!this.pendingDefenses) this.pendingDefenses = [];
    this.pendingDefenses.push(data);
    this.pendingDefense = data;
    this.checkProximityDefense();
  }

  checkProximityDefense(playerPos) {
    if (!this.pendingDefenses || this.pendingDefenses.length === 0) {
      if (this.pendingDefense) {
        this.pendingDefenses = [this.pendingDefense];
      } else {
        return;
      }
    }

    const PROXIMITY_TRIGGER_DIST = 85.0;
    const remaining = [];

    for (const data of this.pendingDefenses) {
      const { hostileMissileIds, defenderPos } = data;

      let targetX = defenderPos ? defenderPos[0] : 0;
      let targetY = defenderPos ? defenderPos[1] : 25;
      let targetZ = defenderPos ? defenderPos[2] : 0;

      if (playerPos && (this.multiplayer?.myId === data.defenderId || this.multiplayer?.myName === 'jsieiragerpe')) {
        targetX = playerPos.x;
        targetY = playerPos.y;
        targetZ = playerPos.z;
      }

      const defVec = new THREE.Vector3(targetX, targetY, targetZ);
      let anyHostileTracked = false;
      let closestDist = Infinity;

      if (Array.isArray(hostileMissileIds) && hostileMissileIds.length > 0) {
        for (const hid of hostileMissileIds) {
          const m = this.missiles.get(hid);
          if (m && !m.isDetonated && !m.isDestroyedMidAir) {
            anyHostileTracked = true;
            const d = m.pos.distanceTo(defVec);
            if (d < closestDist) closestDist = d;
          }
        }
      }

      if (!anyHostileTracked || closestDist <= PROXIMITY_TRIGGER_DIST) {
        this.executeIronDomeLaunch(data);
      } else {
        remaining.push(data);
      }
    }

    this.pendingDefenses = remaining;
    this.pendingDefense = remaining.length > 0 ? remaining[0] : null;
  }

  executeIronDomeLaunch(data) {
    if (!data) return;
    const { hostileMissileIds, attackerId, attackerPos, defenderPos, isAir, attackerName } = data;

    // Find active hostile missile objects and register threat tracking
    const hostileMissiles = [];
    if (Array.isArray(hostileMissileIds)) {
      for (const hid of hostileMissileIds) {
        this.assignedHostileMissileIds.add(hid);
        if (this.missiles.has(hid)) {
          hostileMissiles.push(this.missiles.get(hid));
        }
      }
    }

    // Dynamic 1-to-1+ threat coverage: spawn at least max(5, threatCount) interceptors
    const incomingThreatCount = (Array.isArray(hostileMissileIds) && hostileMissileIds.length > 0)
      ? hostileMissileIds.length
      : hostileMissiles.length;
    const interceptorCount = Math.max(5, incomingThreatCount);

    if (this.multiplayer && typeof this.multiplayer.onNotification === 'function') {
      this.multiplayer.onNotification(`🛡️ [DEFENSA ACTIVA] ¡${incomingThreatCount || 'Amenaza múltiple'} misiles enemigos en rango visual! Desplegando ${interceptorCount} interceptores.`);
    }

    // Launch interceptors sequentially with stagger so each hunts a unique hostile missile
    for (let i = 0; i < interceptorCount; i++) {
      setTimeout(() => {
        const interceptorId = 'icp_' + Date.now() + '_' + i;
        const targetHostile = (hostileMissiles.length > 0)
          ? (hostileMissiles[i] || hostileMissiles[i % hostileMissiles.length])
          : null;

        const defX = defenderPos ? defenderPos[0] : 0;
        const defY = defenderPos ? defenderPos[1] : 25;
        const defZ = defenderPos ? defenderPos[2] : 0;

        const interceptor = new GuidedMissile(
          {
            missileId: interceptorId,
            launcherId: 'IRON_DOME',
            launcherName: 'Cúpula de Hierro',
            targetPlayerId: attackerId,
            startPos: [defX + (i - Math.floor(interceptorCount / 2)) * 1.2, defY + 2.0, defZ + (Math.random() - 0.5) * 2.5],
            targetPos: targetHostile ? [targetHostile.pos.x, targetHostile.pos.y, targetHostile.pos.z] : (attackerPos || [0, 25, 0]),
            startYaw: (i * Math.PI) / (Math.max(1, interceptorCount) / 2),
            isInterceptor: true,
            targetHostileMissile: targetHostile,
            launchType: isAir ? 'air' : 'land',
            missileManager: this
          },
          this.scene,
          this.particleManager,
          (payload) => {
            this.missiles.delete(payload.missileId);
          }
        );

        this.missiles.set(interceptorId, interceptor);
        if (this.sound && typeof this.sound.playMissileLaunch === 'function') {
          this.sound.playMissileLaunch();
        }
      }, i * 120);
    }

    // After mid-air interception (~2.8s), launch 2 Colossal Retaliation Missiles AND deploy B-1 bomber!
    setTimeout(() => {
      for (let r = 0; r < 2; r++) {
        const retalId = 'retal_' + Date.now() + '_' + r;
        const defX = defenderPos ? defenderPos[0] : 0;
        const defY = defenderPos ? defenderPos[1] : 25;
        const defZ = defenderPos ? defenderPos[2] : 0;

        const retalMissile = new GuidedMissile(
          {
            missileId: retalId,
            launcherId: 'ADMIN_RETALIATION',
            launcherName: 'Contraataque Colosal',
            targetPlayerId: attackerId,
            targetName: attackerName || 'Admin Rival (cifrixa)',
            startPos: [defX + (r === 0 ? -3 : 3), defY + 1.5, defZ],
            targetPos: attackerPos || [0, 25, 0],
            startYaw: (r === 0 ? -0.2 : 0.2),
            isRetaliation: true,
            power: 8,
            launchType: 'land',
            missileManager: this
          },
          this.scene,
          this.particleManager,
          (detonatePayload) => {
            this.missiles.delete(detonatePayload.missileId);
            if (this.multiplayer && typeof this.multiplayer.sendMissileDetonate === 'function') {
              this.multiplayer.sendMissileDetonate(detonatePayload);
            }
          }
        );

        this.missiles.set(retalId, retalMissile);
      }

      // Launch Strategic Bomber mission towards Cifrixa
      const bManager = this.bomberManager || (this.multiplayer ? this.multiplayer.bomberManager : null);
      if (bManager && typeof bManager.launchMission === 'function') {
        bManager.launchMission(attackerId, attackerPos, attackerName || 'Admin Rival (cifrixa)');
      }
    }, 2800);
  }

  launchSingleInterceptor(hostileMissile, defPos) {
    const interceptorId = 'icp_dyn_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const interceptor = new GuidedMissile(
      {
        missileId: interceptorId,
        launcherId: 'IRON_DOME',
        launcherName: 'Cúpula de Hierro',
        targetPlayerId: hostileMissile.launcherId || 'hostile',
        startPos: [defPos[0], defPos[1] + 2.0, defPos[2]],
        targetPos: [hostileMissile.pos.x, hostileMissile.pos.y, hostileMissile.pos.z],
        startYaw: Math.random() * Math.PI * 2,
        isInterceptor: true,
        targetHostileMissile: hostileMissile,
        launchType: hostileMissile.launchType || 'air',
        missileManager: this
      },
      this.scene,
      this.particleManager,
      (payload) => {
        this.missiles.delete(payload.missileId);
      }
    );
    this.missiles.set(interceptorId, interceptor);
    if (this.sound && typeof this.sound.playMissileLaunch === 'function') {
      this.sound.playMissileLaunch();
    }
  }

  /**
   * Frame update for all active missiles
   */
  update(dt, playerPos) {
    if (this.pendingDefenses && this.pendingDefenses.length > 0) {
      this.checkProximityDefense(playerPos);
    } else if (this.pendingDefense) {
      this.checkProximityDefense(playerPos);
    }

    // Continuous Threat Detection for incoming hostile missiles
    const isAdmin = (this.multiplayer?.myName === 'jsieiragerpe' || this.multiplayer?.isAdmin);
    if (isAdmin && playerPos) {
      const defVec = new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z);
      for (const [id, m] of this.missiles.entries()) {
        if (!m.isInterceptor && !m.isRetaliation && !m.isDetonated && !m.isDestroyedMidAir) {
          if (!this.assignedHostileMissileIds.has(id)) {
            const dist = m.pos.distanceTo(defVec);
            const inBase = (m.pos.x >= -455 && m.pos.x <= -385 && m.pos.z >= 115 && m.pos.z <= 185);
            if (dist <= 85.0 || inBase) {
              this.assignedHostileMissileIds.add(id);
              this.launchSingleInterceptor(m, [playerPos.x, playerPos.y, playerPos.z]);
            }
          }
        }
      }
    }

    if (this.missiles.size === 0) return;

    const playerDir = this.multiplayer ? this.multiplayer.playerDirectory : null;
    const remoteAvatars = this.multiplayer ? this.multiplayer.remoteAvatars : null;

    for (const [id, missile] of this.missiles.entries()) {
      missile.updateTarget(playerDir, remoteAvatars);
      missile.update(dt, playerPos);

      if (missile.isDetonated || missile.isDestroyedMidAir) {
        this.missiles.delete(id);
      }
    }
  }

  /**
   * Returns list of currently flying missiles for radar telemetry
   */
  getActiveMissiles() {
    const list = [];
    for (const m of this.missiles.values()) {
      if (m.isDetonated || m.isDestroyedMidAir) continue;
      const dist = m.pos.distanceTo(m.targetPos);
      list.push({
        id: m.id,
        targetPlayerId: m.targetPlayerId,
        targetName: m.targetName,
        pos: [m.pos.x, m.pos.y, m.pos.z],
        targetPos: [m.targetPos.x, m.targetPos.y, m.targetPos.z],
        forward: [m.forward.x, m.forward.y, m.forward.z],
        speed: m.speed,
        distance: dist,
        colorHex: m.colorHex,
        targetDisconnected: m.targetDisconnected,
        isInterceptor: m.isInterceptor,
        isRetaliation: m.isRetaliation
      });
    }
    return list;
  }

  clear() {
    for (const m of this.missiles.values()) {
      m.dispose();
    }
    this.missiles.clear();
  }
}
