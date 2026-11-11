// public/src/fighter_aircraft.js
// Procedural Acrobatic Fighter Aircraft with Smooth Evasion & Multiplayer Synchronization
// Operates in upper airspace (Y: 45-110) at swift cruising speed (48-64 m/s)
// Executes zero-jitter evasive maneuvers via quintic smoothstep windowing

import * as THREE_MODULE from 'three';

const THREE = typeof window !== 'undefined' && window.THREE ? window.THREE : THREE_MODULE;

/**
 * Procedural 3D model, aerodynamics, and zero-jitter kinematics for an Acrobatic Fighter Aircraft
 */
export class FighterAircraft {
  constructor(data, scene, particleManager, sound) {
    this.id = data.id || 'fighter_1';
    this.scene = scene;
    this.particles = particleManager;
    this.sound = sound;

    this.speed = typeof data.speed === 'number' ? data.speed : 26.0;
    this.baseSpeed = 26.0;
    this.sprintSpeed = 41.0;
    this.state = data.state || 'patrol';
    this.hitCount = typeof data.hitCount === 'number' ? data.hitCount : 0;
    this.maxHits = typeof data.maxHits === 'number' ? data.maxHits : 15;

    const initX = typeof data.x === 'number' ? data.x : (Array.isArray(data.pos) ? data.pos[0] : 0);
    const initY = typeof data.y === 'number' ? data.y : (Array.isArray(data.pos) ? data.pos[1] : 72);
    const initZ = typeof data.z === 'number' ? data.z : (Array.isArray(data.pos) ? data.pos[2] : 0);

    const initYaw = typeof data.yaw === 'number' ? data.yaw : (Array.isArray(data.rot) ? data.rot[0] : 0);
    const initPitch = typeof data.pitch === 'number' ? data.pitch : (Array.isArray(data.rot) ? data.rot[1] : 0);
    const initRoll = typeof data.roll === 'number' ? data.roll : (Array.isArray(data.rot) ? data.rot[2] : 0);

    this.currentPos = { x: initX, y: initY, z: initZ };
    this.targetPos = { x: initX, y: initY, z: initZ };

    this.currentRot = { yaw: initYaw, pitch: initPitch, roll: initRoll };
    this.targetRot = { yaw: initYaw, pitch: initPitch, roll: initRoll };

    this.evasionState = null;
    this.afterburnerIntensity = 0.8;
    this.wingtipTimer = 0;

    // Three.js Hierarchical Scene Nodes (2x size per user requirement)
    this.group = new THREE.Group();
    this.modelGroup = new THREE.Group();
    this.modelGroup.scale.set(2, 2, 2);
    this.group.add(this.modelGroup);

    this.group.position.set(this.currentPos.x, this.currentPos.y, this.currentPos.z);
    this.group.rotation.y = this.currentRot.yaw;
    this.modelGroup.rotation.x = this.currentRot.pitch;
    this.modelGroup.rotation.z = this.currentRot.roll;

    this.buildProceduralMesh();

    if (this.scene) {
      this.scene.add(this.group);
    }
  }

  /**
   * Constructs supersonic twin-engine air-superiority fighter model:
   * Swept delta wings, canted twin vertical stabilizers, reflective bubble canopy,
   * aerodynamic intake nacelles, and dynamic afterburner exhaust nozzles.
   */
  buildProceduralMesh() {
    // 1. Aerodynamic Main Fuselage / Lifting Body (Tactical Low-Vis Gray)
    const fuselageMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.65,
      roughness: 0.35
    });

    const bodyGeo = new THREE.BoxGeometry(2.4, 1.3, 11.5);
    const bodyMesh = new THREE.Mesh(bodyGeo, fuselageMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.modelGroup.add(bodyMesh);

    // 2. Chiseled Radome / Nose Cone (Forward +Z)
    const noseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.7,
      roughness: 0.4
    });
    const noseGeo = new THREE.ConeGeometry(1.2, 4.2, 6);
    noseGeo.rotateX(Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeo, noseMat);
    noseMesh.position.set(0, -0.05, 7.8);
    noseMesh.castShadow = true;
    this.modelGroup.add(noseMesh);

    // 3. Reflective Gold/Cyan Bubble Cockpit Canopy
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.25,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.8
    });
    const canopyGeo = new THREE.SphereGeometry(1.0, 16, 12);
    canopyGeo.scale(0.85, 0.75, 2.6);
    const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
    canopyMesh.position.set(0, 0.75, 2.8);
    this.modelGroup.add(canopyMesh);

    // 4. Swept Delta Main Wings with Elevons
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.6,
      roughness: 0.4
    });

    // Left Delta Wing
    const leftWingGeo = new THREE.BufferGeometry();
    const leftVertices = new Float32Array([
      // Top face
      -1.1,  0.1,  2.5,
      -5.9,  0.0, -2.8,
      -1.1,  0.1, -4.5,
      // Bottom face
      -1.1, -0.1,  2.5,
      -1.1, -0.1, -4.5,
      -5.9,  0.0, -2.8
    ]);
    leftWingGeo.setAttribute('position', new THREE.BufferAttribute(leftVertices, 3));
    leftWingGeo.computeVertexNormals();
    const leftWingMesh = new THREE.Mesh(leftWingGeo, wingMat);
    leftWingMesh.castShadow = true;
    this.modelGroup.add(leftWingMesh);

    // Right Delta Wing
    const rightWingGeo = new THREE.BufferGeometry();
    const rightVertices = new Float32Array([
      // Top face
      1.1,  0.1,  2.5,
      1.1,  0.1, -4.5,
      5.9,  0.0, -2.8,
      // Bottom face
      1.1, -0.1,  2.5,
      5.9,  0.0, -2.8,
      1.1, -0.1, -4.5
    ]);
    rightWingGeo.setAttribute('position', new THREE.BufferAttribute(rightVertices, 3));
    rightWingGeo.computeVertexNormals();
    const rightWingMesh = new THREE.Mesh(rightWingGeo, wingMat);
    rightWingMesh.castShadow = true;
    this.modelGroup.add(rightWingMesh);

    // 5. Canted Twin Vertical Stabilizers (Outward canted at 18 degrees)
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.7,
      roughness: 0.35
    });

    // Left Fin
    const leftTailGeo = new THREE.BoxGeometry(0.18, 2.4, 2.8);
    const leftTail = new THREE.Mesh(leftTailGeo, tailMat);
    leftTail.position.set(-1.15, 1.25, -4.2);
    leftTail.rotation.z = -0.31; // -18 deg cant
    leftTail.rotation.x = -0.22; // slight rake
    leftTail.castShadow = true;
    this.modelGroup.add(leftTail);

    // Right Fin
    const rightTailGeo = new THREE.BoxGeometry(0.18, 2.4, 2.8);
    const rightTail = new THREE.Mesh(rightTailGeo, tailMat);
    rightTail.position.set(1.15, 1.25, -4.2);
    rightTail.rotation.z = 0.31; // +18 deg cant
    rightTail.rotation.x = -0.22; // slight rake
    rightTail.castShadow = true;
    this.modelGroup.add(rightTail);

    // 6. Underbelly Twin Jet Engine Nacelles
    const nacelleGeo = new THREE.BoxGeometry(0.9, 0.7, 5.2);
    const nacelleLeft = new THREE.Mesh(nacelleGeo, tailMat);
    nacelleLeft.position.set(-0.75, -0.65, -1.2);
    this.modelGroup.add(nacelleLeft);

    const nacelleRight = new THREE.Mesh(nacelleGeo, tailMat);
    nacelleRight.position.set(0.75, -0.65, -1.2);
    this.modelGroup.add(nacelleRight);

    // 7. Twin Animated Supersonic Afterburner Exhaust Nozzles (Rear -Z)
    const nozzleRimMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.95,
      roughness: 0.15
    });
    const rimGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.8, 12, 1, true);
    rimGeo.rotateX(Math.PI / 2);

    const rimLeft = new THREE.Mesh(rimGeo, nozzleRimMat);
    rimLeft.position.set(-0.75, -0.15, -5.9);
    this.modelGroup.add(rimLeft);

    const rimRight = new THREE.Mesh(rimGeo, nozzleRimMat);
    rimRight.position.set(0.75, -0.15, -5.9);
    this.modelGroup.add(rimRight);

    // Dynamic Emissive Flame Cones
    this.afterburnerMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff4500,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      transparent: true,
      opacity: 0.92
    });
    const flameGeo = new THREE.ConeGeometry(0.42, 2.6, 12);
    flameGeo.rotateX(-Math.PI / 2);

    this.flameLeft = new THREE.Mesh(flameGeo, this.afterburnerMat);
    this.flameLeft.position.set(-0.75, -0.15, -7.2);
    this.modelGroup.add(this.flameLeft);

    this.flameRight = new THREE.Mesh(flameGeo, this.afterburnerMat);
    this.flameRight.position.set(0.75, -0.15, -7.2);
    this.modelGroup.add(this.flameRight);

    // Inner Supersonic Mach Diamond Glow
    this.machDiamondMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.4,
      roughness: 0.1
    });
    const machGeo = new THREE.ConeGeometry(0.22, 1.5, 8);
    machGeo.rotateX(-Math.PI / 2);

    this.machLeft = new THREE.Mesh(machGeo, this.machDiamondMat);
    this.machLeft.position.set(-0.75, -0.15, -6.6);
    this.modelGroup.add(this.machLeft);

    this.machRight = new THREE.Mesh(machGeo, this.machDiamondMat);
    this.machRight.position.set(0.75, -0.15, -6.6);
    this.modelGroup.add(this.machRight);
  }

  /**
   * Synchronizes authoritative server state
   */
  updateServerState(data) {
    if (!data) return;

    if (typeof data.x === 'number') this.targetPos.x = data.x;
    else if (Array.isArray(data.pos)) this.targetPos.x = data.pos[0];

    if (typeof data.y === 'number') this.targetPos.y = Math.max(45, Math.min(110, data.y));
    else if (Array.isArray(data.pos)) this.targetPos.y = Math.max(45, Math.min(110, data.pos[1]));

    if (typeof data.z === 'number') this.targetPos.z = data.z;
    else if (Array.isArray(data.pos)) this.targetPos.z = data.pos[2];

    if (typeof data.yaw === 'number') this.targetRot.yaw = data.yaw;
    else if (Array.isArray(data.rot)) this.targetRot.yaw = data.rot[0];

    if (typeof data.pitch === 'number') this.targetRot.pitch = data.pitch;
    else if (Array.isArray(data.rot)) this.targetRot.pitch = data.rot[1];

    if (typeof data.roll === 'number') this.targetRot.roll = data.roll;
    else if (Array.isArray(data.rot)) this.targetRot.roll = data.rot[2];

    if (typeof data.speed === 'number') this.speed = data.speed;
    if (typeof data.hitCount === 'number') this.hitCount = data.hitCount;
    if (typeof data.maxHits === 'number') this.maxHits = data.maxHits;

    if (data.state) {
      this.state = data.state;
      if (this.state === 'destroyed') {
        this.group.visible = false;
      } else if (this.state === 'patrol') {
        this.group.visible = true;
      }
    }

    // Trigger evasion if indicated by server
    if (data.evasionManeuver && (!this.evasionState || this.evasionState.maneuver !== data.evasionManeuver)) {
      this.handleEvade({
        evasionType: data.evasionManeuver,
        startTime: data.evasionStartTime || Date.now(),
        durationMs: (data.evasionDuration || 2.2) * 1000
      });
    }
  }

  /**
   * Initiates local evasive maneuver triggered by burst fire or server packet
   */
  handleEvade(data) {
    if (!data || this.state === 'destroyed') return;
    if (this.state === 'evading' && this.evasionState) {
      const elapsed = Date.now() - (this.evasionState.startTime || 0);
      const dur = this.evasionState.durationMs || 2200;
      const tau = elapsed / dur;
      if (tau < 0.9) {
        return; // Evasion already active, do not interrupt
      }
    }
    this.evasionState = {
      maneuver: data.evasionType || data.evasionManeuver || 'barrel_roll',
      startTime: typeof data.startTime === 'number' ? data.startTime : Date.now(),
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : 2200,
      direction: typeof data.direction === 'number' ? data.direction : (Math.random() > 0.5 ? 1 : -1)
    };
    this.state = 'evading';
  }

  /**
   * Registers a bullet hit against this aircraft
   */
  onHit(hitData) {
    if (!hitData) return;
    if (typeof hitData.hitCount === 'number') {
      this.hitCount = hitData.hitCount;
    } else {
      this.hitCount = (this.hitCount || 0) + 1;
    }
    if (typeof hitData.maxHits === 'number') {
      this.maxHits = hitData.maxHits;
    }

    if (this.particles && typeof this.particles.spawnMuzzleFlash === 'function') {
      const hitPt = hitData.hitPos
        ? (Array.isArray(hitData.hitPos) ? { x: hitData.hitPos[0], y: hitData.hitPos[1], z: hitData.hitPos[2] } : hitData.hitPos)
        : this.group.position;
      this.particles.spawnMuzzleFlash(hitPt);
    }
  }

  /**
   * Triggers explosion effect when aircraft accumulates bullet hits threshold
   */
  onDestroyed(destroyedData) {
    this.state = 'destroyed';
    const pos = destroyedData && typeof destroyedData.x === 'number'
      ? { x: destroyedData.x, y: destroyedData.y, z: destroyedData.z }
      : this.group.position;

    if (this.particles && typeof this.particles.spawnExplosion === 'function') {
      this.particles.spawnExplosion(pos.x, pos.y, pos.z);
    }
    if (this.sound && typeof this.sound.playExplosion === 'function') {
      this.sound.playExplosion();
    }
    this.group.visible = false;
  }

  /**
   * Resets aircraft to active patrol after server respawn
   */
  handleSpawn(data) {
    this.state = 'patrol';
    this.hitCount = 0;
    this.group.visible = true;
    if (data) this.updateServerState(data);
  }

  /**
   * Kinematic update loop with quintic smoothstep evasion blending and zero visual jitter
   */
  update(dt = 0.016) {
    if (this.state === 'destroyed') {
      this.group.visible = false;
      return;
    }
    const delta = typeof dt === 'number' && Number.isFinite(dt) && dt > 0 ? dt : 0.016;
    const now = Date.now();

    // 1. Smoothly interpolate position towards server target
    const posLerp = Math.min(1.0, delta * 9.0);
    this.currentPos.x += (this.targetPos.x - this.currentPos.x) * posLerp;
    this.currentPos.y += (this.targetPos.y - this.currentPos.y) * posLerp;
    this.currentPos.z += (this.targetPos.z - this.currentPos.z) * posLerp;

    // Clamp altitude strictly between Y: 45 and Y: 110
    this.currentPos.y = Math.max(45, Math.min(110, this.currentPos.y));

    // 2. Smoothly interpolate Euler angles with shortest-arc wrapping
    const rotLerp = Math.min(1.0, delta * 8.5);

    let dyaw = this.targetRot.yaw - this.currentRot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.currentRot.yaw += dyaw * rotLerp;

    let dpitch = this.targetRot.pitch - this.currentRot.pitch;
    while (dpitch > Math.PI) dpitch -= Math.PI * 2;
    while (dpitch < -Math.PI) dpitch += Math.PI * 2;
    this.currentRot.pitch += dpitch * rotLerp;

    let droll = this.targetRot.roll - this.currentRot.roll;
    while (droll > Math.PI) droll -= Math.PI * 2;
    while (droll < -Math.PI) droll += Math.PI * 2;
    this.currentRot.roll += droll * rotLerp;

    // 3. Evasion Perturbation blending with Quintic Smoothstep S(tau) = 6t^5 - 15t^4 + 10t^3
    let evRoll = 0;
    let evPitch = 0;
    let evYaw = 0;
    let evOffsetX = 0;
    let evOffsetY = 0;
    let evOffsetZ = 0;

    let isSprintAfterburner = false;

    if (this.evasionState) {
      const elapsed = now - this.evasionState.startTime;
      const tau = Math.max(0, Math.min(1, elapsed / this.evasionState.durationMs));

      if (tau >= 1.0) {
        this.evasionState = null;
        this.state = 'patrol';
      } else {
        isSprintAfterburner = true;

        // Quintic smoothstep
        const t2 = tau * tau;
        const t3 = t2 * tau;
        const t4 = t3 * tau;
        const t5 = t4 * tau;
        const S = 6 * t5 - 15 * t4 + 10 * t3;

        // Symmetric quintic bell window W(tau)
        const sub = tau < 0.5 ? 2 * tau : 2 * (1 - tau);
        const s2 = sub * sub;
        const s3 = s2 * sub;
        const s4 = s3 * sub;
        const s5 = s4 * sub;
        const W = 6 * s5 - 15 * s4 + 10 * s3;

        const dir = this.evasionState.direction || 1;
        const maneuver = this.evasionState.maneuver || 'barrel_roll';

        const forwardX = Math.sin(this.currentRot.yaw);
        const forwardZ = Math.cos(this.currentRot.yaw);
        const rightX = forwardZ;
        const rightZ = -forwardX;

        if (maneuver === 'barrel_roll') {
          evRoll = dir * Math.PI * 2 * S;
          const rHelix = 4.5;
          evOffsetY = W * rHelix * (1 - Math.cos(Math.PI * 2 * tau));
          evOffsetX = W * rHelix * Math.sin(Math.PI * 2 * tau) * rightX;
          evOffsetZ = W * rHelix * Math.sin(Math.PI * 2 * tau) * rightZ;
        } else if (maneuver === 'break_turn') {
          evRoll = dir * 1.39 * W;
          evYaw = dir * 1.13 * W;
          evOffsetX = W * 15.0 * dir * rightX;
          evOffsetZ = W * 15.0 * dir * rightZ;
          evOffsetY = W * 3.5;
        } else if (maneuver === 'zoom_climb') {
          evPitch = 0.96 * W;
          evOffsetY = W * 24.0;
          if (tau > 0.5) {
            const recTau = (tau - 0.5) * 2;
            const rt2 = recTau * recTau;
            const rt3 = rt2 * recTau;
            const rt4 = rt3 * recTau;
            const rt5 = rt4 * recTau;
            const recS = 6 * rt5 - 15 * rt4 + 10 * rt3;
            evRoll = dir * Math.PI * 2 * recS;
          }
        } else if (maneuver === 'spiraling_scissors') {
          const freq = 1.4;
          const durSec = this.evasionState.durationMs / 1000;
          const wave = Math.sin(Math.PI * 2 * freq * tau * durSec);
          const cosWave = Math.cos(Math.PI * 2 * freq * tau * durSec);
          evRoll = dir * 1.13 * wave * W;
          evOffsetY = W * 5.0 * cosWave;
          evOffsetX = W * 5.0 * wave * rightX;
          evOffsetZ = W * 5.0 * wave * rightZ;
        }
      }
    }

    // 4. Update Three.js node transforms
    const finalX = this.currentPos.x + evOffsetX;
    const finalY = Math.max(45, Math.min(110, this.currentPos.y + evOffsetY));
    const finalZ = this.currentPos.z + evOffsetZ;

    this.group.position.set(finalX, finalY, finalZ);
    this.group.rotation.y = this.currentRot.yaw + evYaw;
    this.modelGroup.rotation.x = this.currentRot.pitch + evPitch;
    this.modelGroup.rotation.z = this.currentRot.roll + evRoll;

    // 5. Dynamic Afterburner Glow Animation
    const targetIntensity = isSprintAfterburner ? (2.4 + 0.4 * Math.sin(now * 0.03)) : 0.85;
    this.afterburnerIntensity += (targetIntensity - this.afterburnerIntensity) * Math.min(1.0, delta * 6.0);

    if (this.afterburnerMat) {
      this.afterburnerMat.emissiveIntensity = this.afterburnerIntensity;
    }
    if (this.machDiamondMat) {
      this.machDiamondMat.emissiveIntensity = this.afterburnerIntensity * 1.5;
    }

    // Dynamic exhaust flame elongation during afterburner sprint
    const flameScaleZ = isSprintAfterburner ? 1.55 : 1.0;
    if (this.flameLeft) this.flameLeft.scale.set(1, 1, flameScaleZ);
    if (this.flameRight) this.flameRight.scale.set(1, 1, flameScaleZ);

    // 6. Wingtip Vortex Contrail Particle Emission
    this.wingtipTimer += delta;
    if (this.wingtipTimer >= (isSprintAfterburner ? 0.08 : 0.22)) {
      this.wingtipTimer = 0;
      if (this.particles && typeof this.particles.spawnMuzzleFlash === 'function') {
        const leftTip = new THREE.Vector3(-5.9, 0, -2.8);
        leftTip.applyEuler(this.modelGroup.rotation);
        leftTip.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
        leftTip.add(this.group.position);

        const rightTip = new THREE.Vector3(5.9, 0, -2.8);
        rightTip.applyEuler(this.modelGroup.rotation);
        rightTip.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
        rightTip.add(this.group.position);

        if (isSprintAfterburner) {
          this.particles.spawnMuzzleFlash({ x: leftTip.x, y: leftTip.y, z: leftTip.z });
          this.particles.spawnMuzzleFlash({ x: rightTip.x, y: rightTip.y, z: rightTip.z });
        }
      }
    }
  }

  /**
   * Raycast intersection check against aircraft hull
   */
  raycast(rayOrigin, rayDir, maxDist = 3500) {
    if (!this.group.visible) return null;

    const cx = this.group.position.x - rayOrigin.x;
    const cy = this.group.position.y - rayOrigin.y;
    const cz = this.group.position.z - rayOrigin.z;

    const proj = cx * rayDir.x + cy * rayDir.y + cz * rayDir.z;
    if (proj <= 0 || proj > maxDist) return null;

    const distSq = cx * cx + cy * cy + cz * cz;
    const perpSq = distSq - proj * proj;
    const hitRadius = 11.0; // 2x supersonic jet bounding radius per user requirement

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

  /**
   * Clean Three.js resource disposal
   */
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
 * Client manager for synchronized acrobatic fighter aircraft
 */
export class FighterAircraftManager {
  constructor(scene, particleManager, sound) {
    this.scene = scene;
    this.particles = particleManager;
    this.sound = sound;
    this.aircraft = new Map(); // id -> FighterAircraft
  }

  /**
   * Synchronizes aircraft entities from server snapshots
   */
  syncFromServer(aircraftList) {
    if (!Array.isArray(aircraftList)) return;
    const incomingIds = new Set();

    for (const item of aircraftList) {
      if (!item || !item.id) continue;
      incomingIds.add(item.id);

      let plane = this.aircraft.get(item.id);
      if (!plane) {
        plane = new FighterAircraft(item, this.scene, this.particles, this.sound);
        this.aircraft.set(item.id, plane);
      } else {
        plane.updateServerState(item);
      }
    }

    // Clean up aircraft no longer in server snapshot
    for (const [id, plane] of this.aircraft.entries()) {
      if (!incomingIds.has(id)) {
        plane.dispose();
        this.aircraft.delete(id);
      }
    }
  }

  /**
   * Handles bullet hit packet on matching aircraft
   */
  handleHit(data) {
    if (!data) return;
    const plane = this.aircraft.get(data.aircraftId);
    if (plane) {
      plane.onHit(data);
    }
  }

  /**
   * Handles aircraft destruction packet
   */
  handleDestroyed(data) {
    if (!data) return;
    const plane = this.aircraft.get(data.aircraftId);
    if (plane) {
      plane.onDestroyed(data);
    }
  }

  /**
   * Handles aircraft respawn packet
   */
  handleSpawn(data) {
    if (!data || !data.id) return;
    let plane = this.aircraft.get(data.id);
    if (!plane) {
      plane = new FighterAircraft(data, this.scene, this.particles, this.sound);
      this.aircraft.set(data.id, plane);
    } else {
      plane.handleSpawn(data);
    }
  }

  /**
   * Dispatches evasion maneuver to matching aircraft
   */
  handleEvade(evadeData) {
    if (!evadeData) return;
    const plane = this.aircraft.get(evadeData.aircraftId);
    if (plane) {
      plane.handleEvade(evadeData);
    } else {
      // If plane not yet created or multiple, apply to first available
      for (const p of this.aircraft.values()) {
        p.handleEvade(evadeData);
        break;
      }
    }
  }

  /**
   * Weapon raycasting against fighter aircraft hulls
   */
  getRaycastHit(rayOrigin, rayDir, maxDist = 3500) {
    let closestHit = null;
    let closestDist = maxDist;
    let closestId = null;

    for (const [id, plane] of this.aircraft.entries()) {
      const hit = plane.raycast(rayOrigin, rayDir, closestDist);
      if (hit && hit.distance < closestDist) {
        closestDist = hit.distance;
        closestHit = hit;
        closestId = id;
      }
    }

    if (!closestHit) return null;
    return {
      id: closestId,
      distance: closestHit.distance,
      point: closestHit.point
    };
  }

  /**
   * Frame update loop for all aircraft
   */
  update(dt = 0.016) {
    for (const plane of this.aircraft.values()) {
      plane.update(dt);
    }
  }

  /**
   * Cleans up all aircraft instances on room switch or reset
   */
  clearAll() {
    for (const plane of this.aircraft.values()) {
      plane.dispose();
    }
    this.aircraft.clear();
  }
}

// Global window registration for compatibility
if (typeof window !== 'undefined') {
  window.FighterAircraft = FighterAircraft;
  window.FighterAircraftManager = FighterAircraftManager;
}
