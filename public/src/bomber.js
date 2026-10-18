// public/src/bomber.js
// B-1 Heavy Strategic Bomber & Animated Hangar System
// Features: ~20m fuselage, ~50m variable-sweep wings, 4 jet turbines, animated hangar doors,
// runway takeoff from ski-jump ramp, high-altitude cruise, 10x 1X TNT carpet bombing raid,
// and automated return-to-base and hangar docking.

import * as THREE from 'three';

export class StrategicBomber {
  constructor(scene, particleManager, world, sound, onBombDrop) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.world = world;
    this.sound = sound;
    this.onBombDrop = onBombDrop;

    // Airbase Waypoints & Runway Specs
    this.hangarPos = new THREE.Vector3(-375, 25.5, 150);
    this.runwayStart = new THREE.Vector3(-395, 25.5, 150);
    this.runwayEnd = new THREE.Vector3(-445, 25.5, 150);
    this.runwayRamp = new THREE.Vector3(-455, 27.5, 150);
    this.cruiseAltitude = 64.0;

    this.pos = this.hangarPos.clone();
    this.forward = new THREE.Vector3(-1, 0, 0); // Facing West down runway
    this.speed = 0;
    this.targetPos = null;
    this.targetPlayerId = null;
    this.targetName = 'Objetivo';

    // Mission State Machine
    this.state = 'IDLE'; // IDLE, DOORS_OPENING, TAXI, TAKEOFF, CRUISE, BOMB_RUN, RTB, LANDING, TAXI_IN, DOORS_CLOSING
    this.stateTimer = 0;
    this.bombsDropped = 0;
    this.bombDropTimer = 0;
    this.maxBombs = 10;
    this.wingSweep = 0.25; // Variable wing sweep angle
    this.missionQueue = [];
    this.bankAngle = 0;
    this.targetBank = 0;
    this.lastTargetId = null;
    this.lastLaunchTimestamp = 0;

    // Physical Falling Bombs Simulation
    this.activeBombs = [];
    this.onBombImpact = null;

    // Build 3D mesh
    this.mesh = this.buildMesh();
    this.mesh.position.copy(this.pos);
    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.mesh);
    }

    // Build Animated Hangar Doors
    this.hangarGroup = this.buildHangar();
    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.hangarGroup);
    }
  }

  /**
   * Procedural 3D B-1 Strategic Bomber Model (~22m length, ~48m wingspan)
   * The modelGroup is rotated +PI/2 around Y so the aerodynamic nose points along +Z,
   * aligning directly with Three.js lookAt forward convention and eliminating sideways taxiing.
   */
  buildMesh() {
    const group = new THREE.Group();
    const modelGroup = new THREE.Group();
    modelGroup.rotation.y = Math.PI / 2;
    this.modelGroup = modelGroup;
    group.add(modelGroup);

    // Stealth Matte Dark Charcoal Finish
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.3
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.2
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.95,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85
    });

    // 1. Main Fuselage: Needle-nose blended lifting body (22m length, 3.2m width)
    const fuseGeom = new THREE.CylinderGeometry(0.85, 1.6, 22, 12);
    fuseGeom.rotateZ(Math.PI / 2);
    const fuse = new THREE.Mesh(fuseGeom, skinMat);
    modelGroup.add(fuse);

    // Aerodynamic Nose Radome
    const noseGeom = new THREE.ConeGeometry(0.85, 4.5, 12);
    noseGeom.rotateZ(-Math.PI / 2);
    const nose = new THREE.Mesh(noseGeom, darkMat);
    nose.position.set(-13.25, 0, 0);
    modelGroup.add(nose);

    // Cockpit Glazing
    const canopyGeom = new THREE.BoxGeometry(3.6, 0.9, 1.4);
    const canopy = new THREE.Mesh(canopyGeom, canopyMat);
    canopy.position.set(-8.5, 1.05, 0);
    modelGroup.add(canopy);

    // 2. Variable-Sweep Wings (~48m total wingspan)
    this.leftWingPivot = new THREE.Group();
    this.leftWingPivot.position.set(-1.0, 0.15, 1.8);
    const lWingGeom = new THREE.BoxGeometry(5.2, 0.28, 22);
    const lWing = new THREE.Mesh(lWingGeom, skinMat);
    lWing.position.set(-1.5, 0, 11);
    this.leftWingPivot.add(lWing);
    modelGroup.add(this.leftWingPivot);

    this.rightWingPivot = new THREE.Group();
    this.rightWingPivot.position.set(-1.0, 0.15, -1.8);
    const rWingGeom = new THREE.BoxGeometry(5.2, 0.28, 22);
    const rWing = new THREE.Mesh(rWingGeom, skinMat);
    rWing.position.set(-1.5, 0, -11);
    this.rightWingPivot.add(rWing);
    modelGroup.add(this.rightWingPivot);

    // 3. Four Turbofan Jet Engines in Twin Under-Wing Nacelles
    const nacelleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85 });
    const exhaustMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });

    this.exhaustMeshes = [];
    const nacelleOffsets = [
      { z: 4.2 }, { z: -4.2 }
    ];

    for (const no of nacelleOffsets) {
      const nacelleGeom = new THREE.BoxGeometry(6.2, 1.4, 2.8);
      const nacelle = new THREE.Mesh(nacelleGeom, nacelleMat);
      nacelle.position.set(1.5, -0.65, no.z);
      modelGroup.add(nacelle);

      // Twin Exhaust Nozzles per nacelle
      for (const dz of [-0.65, 0.65]) {
        const exhGeom = new THREE.CylinderGeometry(0.48, 0.42, 1.1, 10);
        exhGeom.rotateZ(Math.PI / 2);
        const exh = new THREE.Mesh(exhGeom, exhaustMat);
        exh.position.set(4.8, -0.65, no.z + dz);
        modelGroup.add(exh);
        this.exhaustMeshes.push(exh);
      }
    }

    // 4. Swept Vertical Stabilizer Tail & Horizontal Elevators
    const vTailGeom = new THREE.BoxGeometry(3.8, 4.6, 0.35);
    const vTail = new THREE.Mesh(vTailGeom, darkMat);
    vTail.position.set(9.0, 2.5, 0);
    modelGroup.add(vTail);

    const hTailGeom = new THREE.BoxGeometry(3.5, 0.25, 9.8);
    const hTail = new THREE.Mesh(hTailGeom, skinMat);
    hTail.position.set(9.5, 0.6, 0);
    modelGroup.add(hTail);

    // 5. Bomb Bay Doors (under belly)
    const bayGeom = new THREE.BoxGeometry(4.2, 0.15, 1.8);
    this.bombBayDoor = new THREE.Mesh(bayGeom, darkMat);
    this.bombBayDoor.position.set(-1.2, -1.0, 0);
    modelGroup.add(this.bombBayDoor);

    return group;
  }

  /**
   * Procedural Military Hangar Structure & Sliding Portals
   */
  buildHangar() {
    const hangar = new THREE.Group();
    hangar.position.set(-375, 24, 150);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    // Hangar Arch Roof & Walls (~36m wide, ~14m high, ~30m deep)
    const roofGeom = new THREE.BoxGeometry(28, 1.2, 38);
    const roof = new THREE.Mesh(roofGeom, wallMat);
    roof.position.set(0, 13.5, 0);
    hangar.add(roof);

    const backWallGeom = new THREE.BoxGeometry(1.5, 13, 38);
    const backWall = new THREE.Mesh(backWallGeom, wallMat);
    backWall.position.set(13.5, 6.5, 0);
    hangar.add(backWall);

    const sideWall1 = new THREE.Mesh(new THREE.BoxGeometry(28, 13, 1.5), wallMat);
    sideWall1.position.set(0, 6.5, 19);
    const sideWall2 = new THREE.Mesh(new THREE.BoxGeometry(28, 13, 1.5), wallMat);
    sideWall2.position.set(0, 6.5, -19);
    hangar.add(sideWall1, sideWall2);

    // Animated Sliding Blast Doors (West Entrance: X = -14)
    this.leftHangarDoor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 12.8, 18), doorMat);
    this.leftHangarDoor.position.set(-13.8, 6.4, 9);
    this.rightHangarDoor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 12.8, 18), doorMat);
    this.rightHangarDoor.position.set(-13.8, 6.4, -9);
    hangar.add(this.leftHangarDoor, this.rightHangarDoor);

    // Warning Beacons
    for (const bz of [-18, 18]) {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8), lightMat);
      beacon.position.set(-14, 13, bz);
      hangar.add(beacon);
    }

    return hangar;
  }

  /**
   * Dispatches the B-1 Bomber on an autonomous strategic strike mission
   */
  launchMission(targetPlayerId, targetPos, targetName = 'Objetivo') {
    const now = Date.now();
    // Debounce duplicate triggers within 3500ms for the same target to prevent duplicate sorties
    if (this.lastTargetId === targetPlayerId && this.lastLaunchTimestamp && (now - this.lastLaunchTimestamp < 3500)) {
      return true;
    }
    this.lastTargetId = targetPlayerId;
    this.lastLaunchTimestamp = now;

    if (this.state !== 'IDLE') {
      // Dynamic Re-Engagement: If returning to base (RTB), turn around and re-attack ("gira y vuelve")!
      if (this.state === 'RTB') {
        this.targetPlayerId = targetPlayerId;
        this.targetPos = new THREE.Vector3(targetPos[0], targetPos[1] || 25, targetPos[2]);
        this.targetName = targetName;
        this.state = 'CRUISE';
        this.stateTimer = 0;
        this.bombsDropped = 0;
        this.bombDropTimer = 0;
        return true;
      }
      // If already airborne on a strike (CRUISE or BOMB_RUN), update target coordinates dynamically
      if (this.state === 'CRUISE' || this.state === 'BOMB_RUN') {
        this.targetPlayerId = targetPlayerId;
        this.targetPos = new THREE.Vector3(targetPos[0], targetPos[1] || 25, targetPos[2]);
        this.targetName = targetName;
        return true;
      }
      // If busy in hangar or takeoff/landing, queue next mission cleanly without duplicates
      if (!this.missionQueue) this.missionQueue = [];
      const alreadyQueued = this.missionQueue.some(m => m.targetPlayerId === targetPlayerId);
      if (!alreadyQueued) {
        this.missionQueue.push({ targetPlayerId, targetPos, targetName });
      }
      return true;
    }

    this.targetPlayerId = targetPlayerId;
    this.targetPos = new THREE.Vector3(targetPos[0], targetPos[1] || 25, targetPos[2]);
    this.targetName = targetName;
    this.state = 'DOORS_OPENING';
    this.stateTimer = 0;
    this.bombsDropped = 0;
    this.bombDropTimer = 0;

    if (this.sound && typeof this.sound.playClick === 'function') {
      this.sound.playClick(0.8);
    }

    return true;
  }

  /**
   * Frame update & flight kinematics
   */
  update(dt, playerDirectory) {
    if (this.state === 'IDLE') return;

    this.stateTimer += dt;

    // Track moving target coordinates during mission
    if (this.targetPlayerId && playerDirectory && playerDirectory.has(this.targetPlayerId)) {
      const tp = playerDirectory.get(this.targetPlayerId);
      if (tp && tp.pos) {
        this.targetPos.set(tp.pos[0], tp.pos[1] || 25, tp.pos[2]);
      }
    }

    switch (this.state) {
      case 'DOORS_OPENING':
        // Hangar doors slide open left and right over 2.5s
        const openProg = Math.min(1.0, this.stateTimer / 2.5);
        if (this.leftHangarDoor) this.leftHangarDoor.position.z = 9 + openProg * 14;
        if (this.rightHangarDoor) this.rightHangarDoor.position.z = -9 - openProg * 14;

        if (this.stateTimer >= 2.5) {
          this.state = 'TAXI';
          this.stateTimer = 0;
        }
        break;

      case 'TAXI':
        // Roll slowly out of hangar doors towards runway start
        this.speed = 8.0;
        this.forward.set(-1, 0, 0); // Heading straight West down runway
        this.pos.x -= this.speed * dt;
        this.pos.y = 25.5;
        this.targetBank = 0;

        if (this.pos.x <= this.runwayStart.x) {
          this.state = 'TAKEOFF';
          this.stateTimer = 0;
        }
        break;

      case 'TAKEOFF':
        // Accelerate along runway and ski-jump ramp
        this.speed = Math.min(42.0, this.speed + 15.0 * dt);
        this.pos.x -= this.speed * dt;
        this.targetBank = 0;

        // Ramp elevation
        if (this.pos.x <= -440) {
          const t = Math.min(1.0, (-440 - this.pos.x) / 15);
          this.pos.y = 25.5 + t * 4.0;
          this.forward.set(-1, 0.22, 0).normalize();
        }

        // Lift off into the sky
        if (this.pos.x <= -465) {
          this.state = 'CRUISE';
          this.stateTimer = 0;
        }
        break;

      case 'CRUISE':
        // Climb smoothly to cruise altitude (64m) and accelerate to supersonic cruise
        this.speed = Math.min(68.0, this.speed + dt * 20.0);
        if (this.pos.y < this.cruiseAltitude) {
          this.pos.y = Math.min(this.cruiseAltitude, this.pos.y + dt * 14.0);
        }

        const toTarget = new THREE.Vector3().subVectors(this.targetPos, this.pos);
        toTarget.y = 0; // Flat navigation vector
        const distToTarget = toTarget.length();

        if (distToTarget > 0.1) {
          toTarget.normalize();
          const angle = this.forward.angleTo(toTarget);
          if (angle > 0.001) {
            const maxTurn = 1.6 * dt;
            const turnStep = Math.min(angle, maxTurn);
            let axis = new THREE.Vector3().crossVectors(this.forward, toTarget);
            if (axis.lengthSq() < 0.0001) {
              axis.set(0, 1, 0); // Turnaround fallback for 180-deg reversal
            } else {
              axis.normalize();
            }
            this.forward.applyAxisAngle(axis, turnStep).normalize();
            this.targetBank = -Math.sign(axis.y) * Math.min(0.65, angle * 0.9);
          } else {
            this.targetBank = 0;
          }
        }

        // Continuous Flight Kinematics: Integrate forward position across the world
        this.pos.x += this.forward.x * this.speed * dt;
        this.pos.z += this.forward.z * this.speed * dt;

        // Begin bomb run when within 45m horizontal distance
        if (distToTarget <= 45.0) {
          this.state = 'BOMB_RUN';
          this.stateTimer = 0;
          this.bombDropTimer = 0;
        }
        break;

      case 'BOMB_RUN':
        // Fly level overhead and discharge 10x 1X TNT carpet bomb
        this.speed = 62.0;
        this.targetBank = 0;
        this.bombDropTimer += dt;

        // Continuous Flight Kinematics: Fly forward steadily during carpet bomb
        this.pos.x += this.forward.x * this.speed * dt;
        this.pos.z += this.forward.z * this.speed * dt;

        if (this.bombsDropped < this.maxBombs && this.bombDropTimer >= 0.35) {
          this.bombDropTimer = 0;
          this.bombsDropped++;
          this.dropSingleBomb();
        }

        if (this.bombsDropped >= this.maxBombs && this.stateTimer >= 4.0) {
          this.state = 'RTB';
          this.stateTimer = 0;
        }
        break;

      case 'RTB':
        // Wide smooth banking turn, navigate back to runway approach at (-475, 30, 150)
        this.speed = 60.0;
        const returnWp = new THREE.Vector3(-475, 30, 150);
        const toBase = new THREE.Vector3().subVectors(returnWp, this.pos);
        toBase.y = 0;
        const distToBase = toBase.length();

        if (distToBase > 0.1) {
          toBase.normalize();
          const angle = this.forward.angleTo(toBase);
          if (angle > 0.001) {
            const maxTurn = 1.4 * dt;
            const turnStep = Math.min(angle, maxTurn);
            let axis = new THREE.Vector3().crossVectors(this.forward, toBase);
            if (axis.lengthSq() < 0.0001) {
              axis.set(0, 1, 0);
            } else {
              axis.normalize();
            }
            this.forward.applyAxisAngle(axis, turnStep).normalize();
            this.targetBank = -Math.sign(axis.y) * Math.min(0.65, angle * 0.9);
          } else {
            this.targetBank = 0;
          }
        }

        // Descend gradually towards runway approach height
        if (this.pos.y > 27.5) {
          this.pos.y = Math.max(27.5, this.pos.y - dt * 8.0);
        }

        // Continuous Flight Kinematics: Fly forward back to airbase
        this.pos.x += this.forward.x * this.speed * dt;
        this.pos.z += this.forward.z * this.speed * dt;

        if (distToBase <= 30.0 && this.pos.x <= -460) {
          this.state = 'LANDING';
          this.stateTimer = 0;
          this.forward.set(1, 0, 0); // Facing East back down runway towards hangar
          this.targetBank = 0;
        }
        break;

      case 'LANDING':
        // Descend onto runway and decelerate smoothly
        this.speed = Math.max(10.0, this.speed - 18.0 * dt);
        this.pos.x += this.speed * dt;
        this.pos.y = Math.max(25.5, this.pos.y - dt * 6.0);
        this.targetBank = 0;

        if (this.pos.x >= this.runwayStart.x) {
          this.state = 'TAXI_IN';
          this.stateTimer = 0;
        }
        break;

      case 'TAXI_IN':
        // Roll back into hangar
        this.speed = 6.0;
        this.pos.x += this.speed * dt;
        this.pos.y = 25.5;
        this.targetBank = 0;

        if (this.pos.x >= this.hangarPos.x) {
          this.pos.copy(this.hangarPos);
          this.speed = 0;
          this.state = 'DOORS_CLOSING';
          this.stateTimer = 0;
        }
        break;

      case 'DOORS_CLOSING':
        // Hangar doors slide shut over 2.5s
        const closeProg = Math.min(1.0, this.stateTimer / 2.5);
        if (this.leftHangarDoor) this.leftHangarDoor.position.z = 23 - closeProg * 14;
        if (this.rightHangarDoor) this.rightHangarDoor.position.z = -23 + closeProg * 14;

        if (this.stateTimer >= 2.5) {
          this.state = 'IDLE';
          this.stateTimer = 0;
          this.forward.set(-1, 0, 0);
          this.targetBank = 0;
          this.bankAngle = 0;
          if (this.missionQueue && this.missionQueue.length > 0) {
            const nextMission = this.missionQueue.shift();
            this.launchMission(nextMission.targetPlayerId, nextMission.targetPos, nextMission.targetName);
          }
        }
        break;
    }

    // Dynamic Variable-Sweep Wings: 0.15 rad (takeoff/landing) to 0.75 rad (supersonic cruise & bomb run)
    const targetSweep = (this.state === 'CRUISE' || this.state === 'BOMB_RUN' || this.state === 'RTB') ? 0.75 : 0.15;
    this.wingSweep = THREE.MathUtils.lerp(this.wingSweep, targetSweep, dt * 2.0);
    if (this.leftWingPivot) this.leftWingPivot.rotation.y = this.wingSweep;
    if (this.rightWingPivot) this.rightWingPivot.rotation.y = -this.wingSweep;

    // Animated Bomb Bay Doors
    if (this.bombBayDoor) {
      const targetBayY = (this.state === 'BOMB_RUN') ? -1.45 : -1.0;
      this.bombBayDoor.position.y = THREE.MathUtils.lerp(this.bombBayDoor.position.y, targetBayY, dt * 4.0);
    }

    // Dynamic Banking Roll: smoothly roll aircraft along longitudinal fuselage axis
    this.bankAngle = THREE.MathUtils.lerp(this.bankAngle, this.targetBank || 0, dt * 3.5);
    if (this.modelGroup) {
      this.modelGroup.rotation.x = this.bankAngle;
    }

    // Integrate position & heading
    this.mesh.position.copy(this.pos);
    const lookTarget = this.pos.clone().add(this.forward);
    this.mesh.lookAt(lookTarget);

    // Jet engine exhaust flicker
    for (const exh of this.exhaustMeshes) {
      if (this.speed > 10.0) {
        exh.visible = true;
        const flk = 0.85 + Math.random() * 0.45;
        exh.scale.set(flk, flk, 1.0 + Math.random() * 0.4);
      } else {
        exh.visible = false;
      }
    }
    // 7. Update physical falling carpet bombs in flight
    this.updateActiveBombs(dt);
  }

  /**
   * Drops 1 physical TNT bomb from bomb bay with realistic gravity trajectory
   */
  dropSingleBomb() {
    const bombOrigin = this.pos.clone().add(new THREE.Vector3(0, -1.8, 0));
    const bomb = this.createFallingBomb(bombOrigin);
    this.activeBombs.push(bomb);

    if (typeof this.onBombDrop === 'function') {
      try {
        this.onBombDrop({
          x: bombOrigin.x,
          y: bombOrigin.y,
          z: bombOrigin.z,
          vx: this.forward.x * (this.speed * 0.45),
          vz: this.forward.z * (this.speed * 0.45),
          targetPos: this.targetPos ? [this.targetPos.x, this.targetPos.y, this.targetPos.z] : null
        });
      } catch (_) {}
    }
  }

  /**
   * Creates 3D aerial bomb entity with Minecraft TNT livery, tail fins, and gravity physics
   */
  createFallingBomb(startPos) {
    const group = new THREE.Group();

    // 1. Aerodynamic Bomb Casing (Minecraft TNT theme: red body + white TNT band + 4 stabilizer fins)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.4,
      metalness: 0.2
    });
    // Bomb cylindrical main charge body: radius 0.26, length 1.2
    const bodyGeom = new THREE.CylinderGeometry(0.26, 0.28, 1.2, 12);
    if (bodyGeom && typeof bodyGeom.rotateX === 'function') bodyGeom.rotateX(Math.PI / 2);
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    if (!bodyGeom || typeof bodyGeom.rotateX !== 'function') bodyMesh.rotation.x = Math.PI / 2;
    group.add(bodyMesh);

    // Rounded nose cone
    const SphereCtor = THREE.SphereGeometry || THREE.BoxGeometry;
    const noseGeom = new SphereCtor(0.26, 10, 8);
    if (noseGeom && typeof noseGeom.rotateX === 'function') noseGeom.rotateX(-Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeom, bodyMat);
    noseMesh.position.set(0, 0, 0.6);
    group.add(noseMesh);

    // Central white TNT band
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
    const bandGeom = new THREE.CylinderGeometry(0.285, 0.285, 0.38, 12);
    if (bandGeom && typeof bandGeom.rotateX === 'function') bandGeom.rotateX(Math.PI / 2);
    const bandMesh = new THREE.Mesh(bandGeom, bandMat);
    if (!bandGeom || typeof bandGeom.rotateX !== 'function') bandMesh.rotation.x = Math.PI / 2;
    group.add(bandMesh);

    // 4 Tail Stabilizer Fins at the rear
    const finMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const finGeom = new THREE.BoxGeometry(0.04, 0.34, 0.42);
      const finMesh = new THREE.Mesh(finGeom, finMat);
      finMesh.position.set(Math.cos(angle) * 0.22, Math.sin(angle) * 0.22, -0.6);
      finMesh.rotation.z = angle;
      group.add(finMesh);
    }

    // Rear fuse wick & glowing spark tip
    const wickMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const wickMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.16), wickMat);
    wickMesh.position.set(0, 0, -0.68);
    group.add(wickMesh);

    group.position.copy(startPos);
    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(group);
    }

    // Realistic falling velocity: forward momentum from bomber + initial downward release
    const forwardSpeed = this.speed * 0.45;
    return {
      group,
      pos: startPos.clone(),
      vel: new THREE.Vector3(
        this.forward.x * forwardSpeed,
        -3.5,
        this.forward.z * forwardSpeed
      ),
      age: 0,
      trailTimer: 0,
      isDead: false
    };
  }

  /**
   * Updates physical falling bombs: gravity, terminal velocity, nose dive pitch, contrail, and ground impact
   */
  updateActiveBombs(dt) {
    if (!this.activeBombs || this.activeBombs.length === 0) return;

    for (let i = this.activeBombs.length - 1; i >= 0; i--) {
      const bomb = this.activeBombs[i];
      bomb.age += dt;
      bomb.trailTimer += dt;

      // Gravity: accelerates downward at 24 m/s^2 up to terminal velocity (-65 m/s)
      bomb.vel.y = Math.max(-65.0, bomb.vel.y - 24.0 * dt);
      // Horizontal drag
      bomb.vel.x *= Math.pow(0.985, dt * 60);
      bomb.vel.z *= Math.pow(0.985, dt * 60);

      // Integrate position
      bomb.pos.x += bomb.vel.x * dt;
      bomb.pos.y += bomb.vel.y * dt;
      bomb.pos.z += bomb.vel.z * dt;
      if (bomb.group && bomb.group.position && bomb.group.position.copy) {
        bomb.group.position.copy(bomb.pos);
      }

      // Dynamically align nose toward velocity vector (starts horizontal, noses down into vertical dive)
      const spdSq = bomb.vel.x * bomb.vel.x + bomb.vel.y * bomb.vel.y + bomb.vel.z * bomb.vel.z;
      if (spdSq > 0.01 && bomb.group && typeof bomb.group.lookAt === 'function') {
        const lookTarget = bomb.pos.clone().add(bomb.vel);
        bomb.group.lookAt(lookTarget);
      }

      // Spark / smoke contrail behind the falling bomb
      if (bomb.trailTimer >= 0.035 && this.particleManager) {
        bomb.trailTimer = 0;
        if (this.particleManager.debrisParticles && this.particleManager.debrisParticles.length < this.particleManager.maxDebris) {
          this.particleManager.debrisParticles.push({
            x: bomb.pos.x + (Math.random() - 0.5) * 0.2,
            y: bomb.pos.y + 0.3,
            z: bomb.pos.z + (Math.random() - 0.5) * 0.2,
            vx: -bomb.vel.x * 0.15 + (Math.random() - 0.5) * 0.8,
            vy: -bomb.vel.y * 0.15 + (Math.random() - 0.5) * 0.8,
            vz: -bomb.vel.z * 0.15 + (Math.random() - 0.5) * 0.8,
            scale: 0.6 + Math.random() * 0.5,
            rotX: Math.random() * 3,
            rotY: Math.random() * 3,
            life: 0.7,
            maxLife: 0.7
          });
        }
      }

      // Ground collision detection
      const bx = Math.floor(bomb.pos.x);
      const bz = Math.floor(bomb.pos.z);
      const groundY = (this.world && typeof this.world.getHeightAt === 'function')
        ? this.world.getHeightAt(bx, bz)
        : 24;

      let hitGround = (bomb.pos.y <= groundY + 0.5);
      if (!hitGround && this.world && typeof this.world.getBlock === 'function') {
        const by = Math.floor(bomb.pos.y);
        const blk = this.world.getBlock(bx, by, bz);
        if (blk !== 0 && blk !== 9) { // 9 is water
          hitGround = true;
        }
      }

      // Safety detonation if bomb falls below terrain floor or lives > 10s
      if (bomb.pos.y <= 10 || bomb.age >= 10.0) {
        hitGround = true;
      }

      if (hitGround) {
        this.detonateBomb(bomb);
        this.activeBombs.splice(i, 1);
      }
    }
  }

  /**
   * Detonates falling bomb on ground impact: spawns explosion, plays sound, creates crater, and informs callback
   */
  detonateBomb(bomb) {
    const ix = Math.floor(bomb.pos.x);
    const iy = Math.floor(bomb.pos.y);
    const iz = Math.floor(bomb.pos.z);

    // 1. Visual explosion particles & fireball shockwave
    if (this.particleManager && typeof this.particleManager.spawnExplosion === 'function') {
      this.particleManager.spawnExplosion(ix, iy, iz);
    }

    // 2. Audio explosion sound
    if (this.sound && typeof this.sound.playExplosion === 'function') {
      this.sound.playExplosion();
    }

    // 3. Terrain destruction crater (1X TNT power: radius ~2.5 blocks)
    if (this.world && typeof this.world.applyBlockDelta === 'function') {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dz = -2; dz <= 2; dz++) {
            if (dx * dx + dy * dy + dz * dz <= 5 && (iy + dy) > 1) {
              this.world.applyBlockDelta(ix + dx, iy + dy, iz + dz, 0);
            }
          }
        }
      }
    }

    // 4. Trigger onBombImpact callback for network multiplayer synchronization
    if (typeof this.onBombImpact === 'function') {
      try {
        this.onBombImpact(ix, iy, iz);
      } catch (_) {}
    }

    // Clean up mesh
    if (bomb.group && bomb.group.parent) {
      bomb.group.parent.remove(bomb.group);
    }
    this.disposeObject(bomb.group);
  }

  disposeObject(obj) {
    if (!obj) return;
    if (typeof obj.traverse === 'function') {
      obj.traverse((child) => {
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
    }
  }

  dispose() {
    if (this.activeBombs) {
      for (const b of this.activeBombs) {
        if (b.group && b.group.parent) {
          b.group.parent.remove(b.group);
        }
        this.disposeObject(b.group);
      }
      this.activeBombs = [];
    }
    if (this.mesh && this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    if (this.hangarGroup && this.hangarGroup.parent) {
      this.hangarGroup.parent.remove(this.hangarGroup);
    }
  }
}

