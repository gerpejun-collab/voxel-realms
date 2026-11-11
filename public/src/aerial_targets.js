// public/src/aerial_targets.js
// Server-synchronized heavy aerial targets (flying practice drones / missiles)
// Moving at 50% reduced cruising speed (3.5 - 4.8 m/s) at mid-altitude (Y: 35-60)
// Requiring sustained weapon burst fire (250 HP) to destroy.

import * as THREE_MODULE from 'three';

const THREE = typeof window !== 'undefined' && window.THREE ? window.THREE : THREE_MODULE;

/**
 * Procedural 3D model and kinematics for a single Heavy Aerial Target (~5x bulkier than animals)
 */
export class HeavyAerialTarget {
  constructor(data, scene, particleManager, sound) {
    this.id = data.id;
    this.type = data.type || 'drone_heavy';
    this.scene = scene;
    this.particles = particleManager;
    this.sound = sound;

    this.health = typeof data.health === 'number' ? data.health : 5;
    this.maxHealth = typeof data.maxHealth === 'number' ? data.maxHealth : 5;
    this.state = data.state || 'patrol';
    this.speed = typeof data.speed === 'number' ? data.speed : 3.8;

    this.currentPos = {
      x: typeof data.x === 'number' ? data.x : 0,
      y: typeof data.y === 'number' ? data.y : 45,
      z: typeof data.z === 'number' ? data.z : 0
    };
    this.targetPos = { ...this.currentPos };

    this.currentRot = {
      yaw: typeof data.yaw === 'number' ? data.yaw : 0,
      pitch: typeof data.pitch === 'number' ? data.pitch : 0,
      roll: typeof data.roll === 'number' ? data.roll : 0
    };
    this.targetRot = { ...this.currentRot };

    this.shieldOpacity = 0.0;
    this.rotors = [];
    this.rotorSpinAngle = 0;
    this.corePulseTime = 0;
    this.isFalling = false;
    this.fallVelocity = { x: 0, y: 0, z: 0 };
    this.fallSpin = { x: 0, y: 0, z: 0 };
    this.smokeTimer = 0;

    // Three.js Hierarchical Scene Nodes (3x size per user requirement)
    this.group = new THREE.Group();
    this.group.scale.set(3, 3, 3);
    this.group.position.set(this.currentPos.x, this.currentPos.y, this.currentPos.z);
    this.group.rotation.set(this.currentRot.pitch, this.currentRot.yaw, this.currentRot.roll);

    this.buildProceduralMesh();

    if (this.scene) {
      this.scene.add(this.group);
    }
  }

  buildProceduralMesh() {
    // 1. Titanium Armor Fuselage (~5x bulkier: 3.6m wide, 2.2m high, 5.2m long)
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.28
    });
    const hullGeo = new THREE.BoxGeometry(3.6, 2.0, 5.2);
    const hullMesh = new THREE.Mesh(hullGeo, hullMat);
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    this.group.add(hullMesh);

    // 2. Armored Side Skirts / Sponsons with Hazard Stripes
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.4
    });
    const skirtLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 4.4), skirtMat);
    skirtLeft.position.set(-2.0, -0.2, 0);
    this.group.add(skirtLeft);

    const skirtRight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 4.4), skirtMat);
    skirtRight.position.set(2.0, -0.2, 0);
    this.group.add(skirtRight);

    // 3. Central Pulsing Cyan Reactor Core & Forward Sensor Pod
    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.85,
      roughness: 0.2
    });
    const coreMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.6), this.coreMat);
    coreMesh.position.set(0, 0.4, 2.2);
    this.group.add(coreMesh);

    // 4. Heavy Outrigger Rotor Arms & Turbine Nacelles
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.3 });
    const rotorBladeMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, roughness: 0.1 });

    const pylonConfigs = [
      { x: -2.4, y: 0.6, z: 2.0, rotZ: 0.3 },
      { x: 2.4, y: 0.6, z: 2.0, rotZ: -0.3 },
      { x: -2.6, y: 0.7, z: -2.0, rotZ: 0.3 },
      { x: 2.6, y: 0.7, z: -2.0, rotZ: -0.3 }
    ];

    for (const cfg of pylonConfigs) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.55), pylonMat);
      arm.position.set(cfg.x * 0.6, cfg.y * 0.5, cfg.z);
      arm.rotation.z = cfg.rotZ;
      this.group.add(arm);

      // Nacelle ring
      const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.45, 12), pylonMat);
      nacelle.position.set(cfg.x, cfg.y, cfg.z);
      this.group.add(nacelle);

      // Rotating turbine blades
      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(cfg.x, cfg.y + 0.25, cfg.z);
      const blade1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.25), rotorBladeMat);
      const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 1.8), rotorBladeMat);
      rotorGroup.add(blade1);
      rotorGroup.add(blade2);
      this.group.add(rotorGroup);
      this.rotors.push(rotorGroup);
    }

    // 5. Twin Rear Jet Thruster Cones
    const thrusterMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.3 });
    const exhaustMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    const tLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.9, 10), thrusterMat);
    tLeft.rotation.x = Math.PI / 2;
    tLeft.position.set(-0.85, -0.1, -2.8);
    this.group.add(tLeft);

    const exhLeft = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 8), exhaustMat);
    exhLeft.rotation.x = -Math.PI / 2;
    exhLeft.position.set(-0.85, -0.1, -3.3);
    this.group.add(exhLeft);

    const tRight = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.9, 10), thrusterMat);
    tRight.rotation.x = Math.PI / 2;
    tRight.position.set(0.85, -0.1, -2.8);
    this.group.add(tRight);

    const exhRight = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 8), exhaustMat);
    exhRight.rotation.x = -Math.PI / 2;
    exhRight.position.set(0.85, -0.1, -3.3);
    this.group.add(exhRight);

    // 6. Interactive Energy Shield Bubble (Wireframe & ripple effect)
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.0
    });
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(3.5, 14, 10), this.shieldMat);
    this.group.add(this.shieldMesh);

    // 7. 3D Floating Health Bar
    this.createHealthBar();
  }

  createHealthBar() {
    this.healthBarGroup = new THREE.Group();
    this.healthBarGroup.position.set(0, 2.6, 0);

    const bgMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.32), bgMat);
    this.healthBarGroup.add(bgMesh);

    this.healthFillMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });
    this.healthFillMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.24), this.healthFillMat);
    this.healthFillMesh.position.set(0, 0, 0.02);
    this.healthBarGroup.add(this.healthFillMesh);

    this.group.add(this.healthBarGroup);
  }

  updateHealthBar(camera) {
    if (!this.healthBarGroup) return;
    if (camera) {
      this.healthBarGroup.quaternion.copy(camera.quaternion);
    }
    const ratio = Math.max(0, Math.min(1.0, this.health / this.maxHealth));
    this.healthFillMesh.scale.x = Math.max(0.001, ratio);
    this.healthFillMesh.position.x = (ratio - 1.0) * 1.5;

    if (ratio > 0.6) {
      this.healthFillMat.color.setHex(0x22c55e); // Green
    } else if (ratio > 0.25) {
      this.healthFillMat.color.setHex(0xeab308); // Amber
    } else {
      this.healthFillMat.color.setHex(0xef4444); // Red
    }
  }

  updateServerState(data) {
    if (typeof data.x === 'number') this.targetPos.x = data.x;
    if (typeof data.y === 'number') this.targetPos.y = Math.max(35, Math.min(60, data.y));
    if (typeof data.z === 'number') this.targetPos.z = data.z;

    if (typeof data.yaw === 'number') this.targetRot.yaw = data.yaw;
    if (typeof data.pitch === 'number') this.targetRot.pitch = data.pitch;
    if (typeof data.roll === 'number') this.targetRot.roll = data.roll;

    if (typeof data.health === 'number') this.health = data.health;
    if (typeof data.maxHealth === 'number') this.maxHealth = data.maxHealth;
    if (data.state) {
      this.state = data.state;
      if (this.state === 'destroyed' && !this.isFalling) {
        this.triggerDestructionEffect();
      }
    }
  }

  onHit(hitData) {
    if (typeof hitData.remainingHealth === 'number') {
      this.health = hitData.remainingHealth;
    } else if (typeof hitData.damage === 'number') {
      this.health = Math.max(0, this.health - hitData.damage);
    } else {
      this.health = Math.max(0, this.health - 1);
    }

    if (this.health <= 0 && this.state !== 'destroyed') {
      this.onDestroyed(hitData);
      return;
    }

    // Flash shield
    this.shieldOpacity = 0.85;

    // Shield flash sound or spark particles
    if (this.particles && typeof this.particles.spawnMuzzleFlash === 'function') {
      const hitPt = hitData.hitPos
        ? (Array.isArray(hitData.hitPos) ? { x: hitData.hitPos[0], y: hitData.hitPos[1], z: hitData.hitPos[2] } : hitData.hitPos)
        : this.currentPos;
      this.particles.spawnMuzzleFlash(hitPt);
    }
  }

  onDestroyed(destroyedData) {
    this.health = 0;
    this.state = 'destroyed';
    this.triggerDestructionEffect(destroyedData);
  }

  triggerDestructionEffect(destroyedData) {
    this.isFalling = true;
    this.fallVelocity = {
      x: (Math.random() - 0.5) * 4.0,
      y: -3.0,
      z: (Math.random() - 0.5) * 4.0
    };
    this.fallSpin = {
      x: (Math.random() - 0.5) * 2.5,
      y: 3.5,
      z: (Math.random() - 0.5) * 2.5
    };

    if (this.particles && typeof this.particles.spawnExplosion === 'function') {
      const pos = destroyedData || this.currentPos;
      this.particles.spawnExplosion(pos.x, pos.y, pos.z);
    }
    if (this.sound && typeof this.sound.playExplosion === 'function') {
      this.sound.playExplosion();
    }
  }

  update(dt = 0.05, camera = null) {
    const delta = Math.min(0.1, dt);

    if (this.isFalling) {
      // Destruction death plunge animation
      this.fallVelocity.y -= 9.8 * delta;
      this.currentPos.x += this.fallVelocity.x * delta;
      this.currentPos.y += this.fallVelocity.y * delta;
      this.currentPos.z += this.fallVelocity.z * delta;

      this.currentRot.pitch += this.fallSpin.x * delta;
      this.currentRot.yaw += this.fallSpin.y * delta;
      this.currentRot.roll += this.fallSpin.z * delta;

      this.group.position.set(this.currentPos.x, this.currentPos.y, this.currentPos.z);
      this.group.rotation.set(this.currentRot.pitch, this.currentRot.yaw, this.currentRot.roll);

      if (this.currentPos.y <= 24) {
        // Impact ground: hide mesh until respawn
        this.group.visible = false;
      }
      return;
    }

    if (this.state === 'patrol') {
      this.group.visible = true;

      // Smooth kinematic interpolation (50% slower, 3.5 - 4.8 m/s, zero jitter)
      const lerpSpeed = Math.min(1.0, delta * 12.0);
      this.currentPos.x += (this.targetPos.x - this.currentPos.x) * lerpSpeed;
      this.currentPos.y += (this.targetPos.y - this.currentPos.y) * lerpSpeed;
      this.currentPos.z += (this.targetPos.z - this.currentPos.z) * lerpSpeed;

      // Clamp altitude strictly between Y: 35 and Y: 60
      this.currentPos.y = Math.max(35, Math.min(60, this.currentPos.y));

      // Angle interpolation
      let dyaw = this.targetRot.yaw - this.currentRot.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      this.currentRot.yaw += dyaw * lerpSpeed;

      this.group.position.set(this.currentPos.x, this.currentPos.y, this.currentPos.z);
      this.group.rotation.set(this.currentRot.pitch, this.currentRot.yaw, this.currentRot.roll);

      // Spin rotors
      this.rotorSpinAngle += delta * 18.0;
      for (let i = 0; i < this.rotors.length; i++) {
        const sign = (i % 2 === 0) ? 1 : -1;
        this.rotors[i].rotation.y = sign * this.rotorSpinAngle;
      }

      // Reactor core pulsing
      this.corePulseTime += delta * 3.0;
      if (this.coreMat) {
        if (this.health <= 2) {
          // Warning red pulse
          this.coreMat.color.setHex(0xef4444);
          this.coreMat.emissive.setHex(0xdc2626);
          this.coreMat.emissiveIntensity = 0.6 + 0.4 * Math.sin(this.corePulseTime * 2.5);
        } else {
          // Calm cyan glow
          this.coreMat.color.setHex(0x06b6d4);
          this.coreMat.emissive.setHex(0x0891b2);
          this.coreMat.emissiveIntensity = 0.7 + 0.3 * Math.sin(this.corePulseTime);
        }
      }

      // Shield flash decay
      if (this.shieldOpacity > 0.0) {
        this.shieldOpacity = Math.max(0.0, this.shieldOpacity - delta * 3.5);
        if (this.shieldMat) {
          this.shieldMat.opacity = this.shieldOpacity;
        }
      }

      // Progressive damage smoke/fire trails (triggered at <= 3 hits)
      this.smokeTimer += delta;
      if (this.smokeTimer >= 0.15) {
        this.smokeTimer = 0;
        if (this.health <= 3 && this.particles) {
          const spawnPt = {
            x: this.currentPos.x + (Math.random() - 0.5) * 1.5,
            y: this.currentPos.y + 0.5,
            z: this.currentPos.z - 1.8
          };
          if (this.health <= 1 && typeof this.particles.spawnMuzzleFlash === 'function') {
            this.particles.spawnMuzzleFlash(spawnPt);
          }
          if (typeof this.particles.spawnBlockDebris === 'function') {
            this.particles.spawnBlockDebris(spawnPt.x, spawnPt.y, spawnPt.z);
          }
        }
      }

      // Update 3D Health bar
      this.updateHealthBar(camera);
    }
  }

  raycast(rayOrigin, rayDir, maxDist = 3500) {
    if (this.state === 'destroyed' || !this.group.visible) return null;

    // Ray-sphere intersection with ~3.4m bounding radius
    const cx = this.currentPos.x - rayOrigin.x;
    const cy = this.currentPos.y - rayOrigin.y;
    const cz = this.currentPos.z - rayOrigin.z;

    const proj = cx * rayDir.x + cy * rayDir.y + cz * rayDir.z;
    if (proj <= 0 || proj > maxDist) return null;

    const distSq = cx * cx + cy * cy + cz * cz;
    const perpSq = distSq - proj * proj;
    const hitRadius = 10.2; // 3x scaled target missile bounding radius per user requirement

    if (perpSq <= hitRadius * hitRadius) {
      return {
        distance: proj,
        point: {
          x: rayOrigin.x + rayDir.x * proj,
          y: rayOrigin.y + rayDir.y * proj,
          z: rayOrigin.z + rayDir.z * proj
        }
      };
    }
    return null;
  }

  dispose() {
    if (this.group && this.group.parent) {
      this.group.parent.remove(this.group);
    }
    if (this.group) {
      this.group.traverse((child) => {
        if (child.geometry && typeof child.geometry.dispose === 'function') {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => {
              if (m.map && typeof m.map.dispose === 'function') m.map.dispose();
              if (typeof m.dispose === 'function') m.dispose();
            });
          } else {
            if (child.material.map && typeof child.material.map.dispose === 'function') child.material.map.dispose();
            if (typeof child.material.dispose === 'function') child.material.dispose();
          }
        }
      });
    }
  }
}

/**
 * Client manager for synchronized heavy aerial targets
 */
export class AerialTargetManager {
  constructor(scene, particleManager, sound) {
    this.scene = scene;
    this.particles = particleManager;
    this.sound = sound;
    this.targets = new Map(); // id -> HeavyAerialTarget
  }

  syncFromServer(targetList) {
    if (!Array.isArray(targetList)) return;
    const incomingIds = new Set();

    for (const item of targetList) {
      if (!item || !item.id) continue;
      incomingIds.add(item.id);

      let target = this.targets.get(item.id);
      if (!target) {
        target = new HeavyAerialTarget(item, this.scene, this.particles, this.sound);
        this.targets.set(item.id, target);
      } else {
        target.updateServerState(item);
      }
    }

    // Clean up targets that no longer exist on server
    for (const [id, target] of this.targets.entries()) {
      if (!incomingIds.has(id)) {
        target.dispose();
        this.targets.delete(id);
      }
    }
  }

  handleHit(data) {
    if (!data || !data.targetId) return;
    const target = this.targets.get(data.targetId);
    if (target) {
      target.onHit(data);
    }
  }

  handleDestroyed(data) {
    if (!data || !data.targetId) return;
    const target = this.targets.get(data.targetId);
    if (target) {
      target.onDestroyed(data);
    }
  }

  handleSpawn(data) {
    if (!data || !data.id) return;
    let target = this.targets.get(data.id);
    if (!target) {
      target = new HeavyAerialTarget(data, this.scene, this.particles, this.sound);
      this.targets.set(data.id, target);
    } else {
      target.isFalling = false;
      target.updateServerState(data);
      if (target.group) {
        target.group.visible = true;
      }
    }
  }

  getRaycastHit(rayOrigin, rayDir, maxDist = 3500) {
    let closestTarget = null;
    let closestDistance = maxDist;
    let closestPoint = null;

    for (const target of this.targets.values()) {
      const hit = target.raycast(rayOrigin, rayDir, closestDistance);
      if (hit && hit.distance < closestDistance) {
        closestDistance = hit.distance;
        closestTarget = target;
        closestPoint = hit.point;
      }
    }

    if (closestTarget) {
      return {
        id: closestTarget.id,
        target: closestTarget,
        distance: closestDistance,
        point: closestPoint
      };
    }
    return null;
  }

  update(dt = 0.05, camera = null) {
    for (const target of this.targets.values()) {
      target.update(dt, camera);
    }
  }

  clearAll() {
    for (const target of this.targets.values()) {
      target.dispose();
    }
    this.targets.clear();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HeavyAerialTarget, AerialTargetManager };
}
