// public/src/missile.js
// Guided Homing Tactical Missile System (Exclusive Admin Weapon)
// Real-time homing tracking, smooth aerodynamic flight curves, 3D rocket mesh,
// dense contrail smoke, thruster flame, underground chunk phasing, and 4X TNT detonation.

import * as THREE from 'three';

export class GuidedMissile {
  constructor(options, scene, particleManager, onDetonate) {
    this.id = options.missileId || ('msl_' + Date.now());
    this.launcherId = options.launcherId;
    this.launcherName = options.launcherName || 'Admin';
    this.targetPlayerId = options.targetPlayerId;
    this.targetName = options.targetName || 'Objetivo';
    this.power = options.power || 4; // 4X TNT equivalent (radius 9m)

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

    // Initial forward orientation
    const startYaw = typeof options.startYaw === 'number' ? options.startYaw : 0;
    this.forward = new THREE.Vector3(
      -Math.sin(startYaw),
      0.35, // Initial upward lift angle
      -Math.cos(startYaw)
    ).normalize();

    // Flight kinematics: gradual acceleration and realistic turn limits
    this.speed = 16.0; // Initial liftoff speed (m/s)
    this.maxSpeed = 82.0; // Cruise hypersonic speed (~300 km/h)
    this.accel = 24.0; // Smooth continuous acceleration
    this.maxTurnRate = 2.4; // Max angular turn rate (rad/s) for realistic arcing curves
    this.liftoffTime = 1.15; // Initial ignition boost stage before full guidance lock
    this.age = 0;
    this.maxLifetime = 60.0; // Safety self-destruct after 60s
    this.isDetonated = false;
    this.smokeTimer = 0;

    // Color assigned for missile & radar matching
    this.colorHex = options.colorHex || 0xef4444;

    // Build 3D mesh
    this.mesh = this.buildMesh();
    this.mesh.position.copy(this.pos);
    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.mesh);
    }
  }

  /**
   * Procedural military missile 3D mesh (~3.6m tall, double player height)
   */
  buildMesh() {
    const group = new THREE.Group();

    // 1. Main Fuselage: Sleek military cylinder (length 3.6m, radius 0.26m)
    const bodyGeom = new THREE.CylinderGeometry(0.26, 0.28, 3.2, 12);
    // Align cylinder along +Z axis
    bodyGeom.rotateX(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937, // Tactical dark slate / military charcoal
      roughness: 0.35,
      metalness: 0.75
    });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    group.add(bodyMesh);

    // Hazard yellow warhead inspection bands
    const bandGeom = new THREE.CylinderGeometry(0.265, 0.265, 0.22, 12);
    bandGeom.rotateX(Math.PI / 2);
    const bandMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const band1 = new THREE.Mesh(bandGeom, bandMat);
    band1.position.set(0, 0, 0.95);
    const band2 = new THREE.Mesh(bandGeom, bandMat);
    band2.position.set(0, 0, 0.65);
    group.add(band1, band2);

    // 2. Conical Radome Nose Cone (length 0.85m)
    const noseGeom = new THREE.ConeGeometry(0.26, 0.85, 12);
    noseGeom.rotateX(Math.PI / 2);
    const noseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Dark titanium nose tip
      roughness: 0.25,
      metalness: 0.85
    });
    const noseMesh = new THREE.Mesh(noseGeom, noseMat);
    noseMesh.position.set(0, 0, 2.025);
    group.add(noseMesh);

    // 3. Tail Stabilizer Fins (4 cruciform delta fins at tail)
    const finMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626, // Crimson military fin trim
      roughness: 0.4,
      metalness: 0.6
    });
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const finGeom = new THREE.BoxGeometry(0.04, 0.52, 0.75);
      const finMesh = new THREE.Mesh(finGeom, finMat);
      finMesh.position.set(
        Math.cos(angle) * 0.36,
        Math.sin(angle) * 0.36,
        -1.35
      );
      finMesh.rotation.z = angle;
      group.add(finMesh);
    }

    // 4. Fore Canard Guidance Fins (4 steerable mini-canards near nose)
    const canardMat = new THREE.MeshBasicMaterial({ color: 0x475569 });
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const cGeom = new THREE.BoxGeometry(0.02, 0.28, 0.38);
      const cMesh = new THREE.Mesh(cGeom, canardMat);
      cMesh.position.set(
        Math.cos(angle) * 0.28,
        Math.sin(angle) * 0.28,
        1.15
      );
      cMesh.rotation.z = angle;
      group.add(cMesh);
    }

    // 5. Rear Thruster Bell & Incandescent Fire Cone
    const nozzleGeom = new THREE.CylinderGeometry(0.22, 0.16, 0.35, 12);
    nozzleGeom.rotateX(Math.PI / 2);
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.95,
      roughness: 0.15
    });
    const nozzle = new THREE.Mesh(nozzleGeom, nozzleMat);
    nozzle.position.set(0, 0, -1.75);
    group.add(nozzle);

    // Pulsating Rocket Flame Mesh
    const flameGeom = new THREE.ConeGeometry(0.24, 1.45, 10);
    flameGeom.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.92
    });
    this.flameMesh = new THREE.Mesh(flameGeom, flameMat);
    this.flameMesh.position.set(0, 0, -2.45);
    group.add(this.flameMesh);

    // Dynamic thruster point light
    this.light = new THREE.PointLight(0xff7700, 2.8, 14);
    this.light.position.set(0, 0, -2.2);
    group.add(this.light);

    return group;
  }

  /**
   * Updates target position from live player registry or caches last known position on disconnect
   */
  updateTarget(playerDirectory, remoteAvatars) {
    if (this.isDetonated) return;

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
      this.targetPos.set(targetData.pos[0], targetData.pos[1] + 1.0, targetData.pos[2]);
      this.lastKnownTargetPos.copy(this.targetPos);
      this.targetDisconnected = false;
      if (targetData.name) this.targetName = targetData.name;
    } else {
      // Player disconnected or unavailable: lock to last known coordinates!
      this.targetDisconnected = true;
      this.targetPos.copy(this.lastKnownTargetPos);
    }
  }

  /**
   * Physics, steering curves, contrail emissions and impact detection
   */
  update(dt, playerPos) {
    if (this.isDetonated) return;

    this.age += dt;
    if (this.age >= this.maxLifetime) {
      this.detonate();
      return;
    }

    // 1. Speed acceleration: smoothly scales from 16 m/s to 82 m/s
    if (this.speed < this.maxSpeed) {
      this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt);
    }

    // 2. Steering & Real-Time Homing Guidance
    if (this.age < this.liftoffTime) {
      // Liftoff stage: initial booster thrust arcs upward & outward
      this.forward.y += dt * 0.45;
      this.forward.normalize();
    } else {
      // Active homing cruise stage: smoothly steer towards target position
      const desiredVec = new THREE.Vector3().subVectors(this.targetPos, this.pos);
      const distToTarget = desiredVec.length();

      // Proximity detonation check: hits when closer than 1.8m
      if (distToTarget <= 1.85) {
        this.detonate();
        return;
      }

      desiredVec.normalize();

      // Angle between current forward and target direction
      const angle = this.forward.angleTo(desiredVec);
      if (angle > 0.001) {
        // Clamp turn rate for realistic aerodynamic banking and sweeping curves
        const maxTurn = this.maxTurnRate * dt;
        const turnStep = Math.min(angle, maxTurn);

        // Rotation axis
        const axis = new THREE.Vector3().crossVectors(this.forward, desiredVec);
        if (axis.lengthSq() > 0.00001) {
          axis.normalize();
          this.forward.applyAxisAngle(axis, turnStep).normalize();
        }
      }
    }

    // 3. Position integration
    const stepMove = this.forward.clone().multiplyScalar(this.speed * dt);
    this.pos.add(stepMove);
    this.mesh.position.copy(this.pos);

    // Look along forward direction
    const lookTarget = this.pos.clone().add(this.forward);
    this.mesh.lookAt(lookTarget);

    // Aerodynamic roll flicker
    this.mesh.rotateZ(dt * 3.5);

    // 4. Animated Thruster Flame & Light
    if (this.flameMesh) {
      const flicker = 0.85 + Math.random() * 0.45;
      this.flameMesh.scale.set(flicker, flicker, 1.0 + Math.random() * 0.35);
    }
    if (this.light) {
      this.light.intensity = 2.2 + Math.random() * 1.2;
    }

    // 5. Continuous Contrail Smoke Puff Emission in Air
    this.smokeTimer += dt;
    if (this.smokeTimer >= 0.024 && this.particleManager) {
      this.smokeTimer = 0;
      const tailPos = this.pos.clone().sub(this.forward.clone().multiplyScalar(2.2));
      if (this.particleManager.debrisParticles && this.particleManager.debrisParticles.length < this.particleManager.maxDebris) {
        this.particleManager.debrisParticles.push({
          x: tailPos.x + (Math.random() - 0.5) * 0.25,
          y: tailPos.y + (Math.random() - 0.5) * 0.25,
          z: tailPos.z + (Math.random() - 0.5) * 0.25,
          vx: -this.forward.x * 2.5 + (Math.random() - 0.5) * 1.5,
          vy: -this.forward.y * 2.5 + 0.8 + Math.random() * 0.8,
          vz: -this.forward.z * 2.5 + (Math.random() - 0.5) * 1.5,
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
   * Executes detonation: triggers callback, spawns 4X explosion, and disposes 3D resources
   */
  detonate() {
    if (this.isDetonated) return;
    this.isDetonated = true;

    const hitX = this.pos.x;
    const hitY = this.pos.y;
    const hitZ = this.pos.z;

    // Visual explosion and shockwaves
    if (this.particleManager && typeof this.particleManager.spawnExplosion === 'function') {
      this.particleManager.spawnExplosion(hitX, hitY, hitZ);
    }

    // Detonation callback to multiplayer & server
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

    // Remove from scene and dispose WebGL buffers cleanly
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
      { ...data, colorHex },
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
   * Frame update for all active missiles
   */
  update(dt, playerPos) {
    if (this.missiles.size === 0) return;

    const playerDir = this.multiplayer ? this.multiplayer.playerDirectory : null;
    const remoteAvatars = this.multiplayer ? this.multiplayer.remoteAvatars : null;

    for (const [id, missile] of this.missiles.entries()) {
      missile.updateTarget(playerDir, remoteAvatars);
      missile.update(dt, playerPos);

      if (missile.isDetonated) {
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
      if (m.isDetonated) continue;
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
        targetDisconnected: m.targetDisconnected
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
