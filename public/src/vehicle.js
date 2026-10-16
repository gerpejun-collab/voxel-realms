// public/src/vehicle.js
// Drivable Cars & Racing Vehicle System for Voxel Realms
// High-performance racing car physics, dynamic chase & cockpit cameras,
// drifting smoke particles, solid barrier collisions, and multiplayer sync.

import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { sound } from './audio.js';

export class DrivableCar {
  constructor(id, color = 0xdc2626, x = -500, y = 24, z = -500, yaw = 0, name = 'Racing Car') {
    this.id = id;
    this.name = name;
    this.colorHex = color;
    this.color = new THREE.Color(color);

    // Physical position & orientation
    this.pos = { x, y, z };
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;

    // Kinematics (~2.2x player sprint speed: 7.5 * 2.2 = 16.5 m/s)
    this.speed = 0;
    this.maxSpeed = 16.5;
    this.reverseMaxSpeed = -6.5;
    this.accel = 13.5;
    this.brakeForce = 26.0;
    this.drag = 4.5;
    this.steering = 0;
    this.turnRate = 2.8;

    // Drifting state
    this.isDrifting = false;
    this.driftSmokeTimer = 0;

    // Driver binding
    this.driverId = null;
    this.driverName = null;

    // Dimensions for collision box
    this.halfLength = 1.7;
    this.halfWidth = 0.95;

    // 3D Visual Mesh Components
    this.group = new THREE.Group();
    this.steeringWheel = null;
    this.flWheel = null;
    this.frWheel = null;
    this.rlWheel = null;
    this.rrWheel = null;
    this.taillightMat = null;

    this.buildModel();
    this.syncMeshTransform();
  }

  buildModel() {
    const carMat = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.35,
      metalness: 0.4
    });

    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.7
    });

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      roughness: 0.5,
      metalness: 0.8
    });

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.9
    });

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.3,
      metalness: 0.7
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.55
    });

    const headLightMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfef08a,
      emissiveIntensity: 0.7,
      roughness: 0.2
    });

    this.taillightMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.4,
      roughness: 0.3
    });

    // 1. Main Lower Monocoque / Floor Chassis
    const floorGeom = new THREE.BoxGeometry(1.6, 0.2, 3.2);
    const floor = new THREE.Mesh(floorGeom, blackMat);
    floor.position.y = 0.22;
    floor.castShadow = true;
    this.group.add(floor);

    // 2. Central Cockpit & Body Tub
    const bodyGeom = new THREE.BoxGeometry(1.4, 0.42, 1.8);
    const body = new THREE.Mesh(bodyGeom, carMat);
    body.position.set(0, 0.45, 0.1);
    body.castShadow = true;
    this.group.add(body);

    // 3. Aerodynamic Front Nosecone
    const noseGeom = new THREE.BoxGeometry(0.85, 0.32, 1.3);
    const nose = new THREE.Mesh(noseGeom, carMat);
    nose.position.set(0, 0.40, -1.35);
    nose.castShadow = true;
    this.group.add(nose);

    // Front Splitter Wing
    const frontWingGeom = new THREE.BoxGeometry(1.9, 0.1, 0.5);
    const frontWing = new THREE.Mesh(frontWingGeom, blackMat);
    frontWing.position.set(0, 0.18, -1.9);
    this.group.add(frontWing);

    // Front Wing Endplates
    for (const sx of [-0.95, 0.95]) {
      const ep = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.5), carMat);
      ep.position.set(sx, 0.26, -1.9);
      this.group.add(ep);
    }

    // 4. Sidepods with Cooling Intakes
    for (const sx of [-0.68, 0.68]) {
      const podGeom = new THREE.BoxGeometry(0.45, 0.38, 1.5);
      const pod = new THREE.Mesh(podGeom, carMat);
      pod.position.set(sx, 0.42, 0.1);
      this.group.add(pod);

      // Black intake duct
      const intakeGeom = new THREE.BoxGeometry(0.38, 0.28, 0.1);
      const intake = new THREE.Mesh(intakeGeom, blackMat);
      intake.position.set(sx, 0.42, -0.66);
      this.group.add(intake);
    }

    // 5. Engine Airbox & Roll Hoop (behind driver head)
    const airboxGeom = new THREE.BoxGeometry(0.5, 0.55, 0.8);
    const airbox = new THREE.Mesh(airboxGeom, carMat);
    airbox.position.set(0, 0.82, 0.55);
    this.group.add(airbox);

    const intakeHole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), blackMat);
    intakeHole.position.set(0, 0.95, 0.14);
    this.group.add(intakeHole);

    // 6. Rear Aerodynamic Wing & Struts
    for (const sx of [-0.35, 0.35]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 0.14), darkMetalMat);
      strut.position.set(sx, 0.75, 1.75);
      this.group.add(strut);
    }
    const rearWingGeom = new THREE.BoxGeometry(1.85, 0.12, 0.45);
    const rearWing = new THREE.Mesh(rearWingGeom, carMat);
    rearWing.position.set(0, 1.05, 1.75);
    this.group.add(rearWing);

    // Rear wing endplates
    for (const sx of [-0.92, 0.92]) {
      const ep = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.5), blackMat);
      ep.position.set(sx, 1.05, 1.75);
      this.group.add(ep);
    }

    // 7. Cockpit Interior & Dashboard
    // Cockpit cut-out recess
    const cockpitHole = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.85), blackMat);
    cockpitHole.position.set(0, 0.55, -0.05);
    this.group.add(cockpitHole);

    // Padded Driver Seat
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.15), blackMat);
    seatBack.position.set(0, 0.65, 0.35);
    this.group.add(seatBack);

    // Tinted Windscreen Deflector
    const screenGeom = new THREE.BoxGeometry(0.72, 0.22, 0.08);
    const screen = new THREE.Mesh(screenGeom, glassMat);
    screen.position.set(0, 0.72, -0.45);
    screen.rotation.x = -0.35;
    this.group.add(screen);

    // Dashboard Instrument Console
    const dashGeom = new THREE.BoxGeometry(0.65, 0.18, 0.25);
    const dash = new THREE.Mesh(dashGeom, darkMetalMat);
    dash.position.set(0, 0.60, -0.38);
    this.group.add(dash);

    // Digital Speedometer LCD Display
    const lcdGeom = new THREE.BoxGeometry(0.24, 0.10, 0.02);
    const lcdMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const lcd = new THREE.Mesh(lcdGeom, lcdMat);
    lcd.position.set(0, 0.64, -0.28);
    this.group.add(lcd);

    // Articulated Formula 1 Steering Wheel (rotates dynamically with steering input!)
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0, 0.58, -0.22);
    wheelGroup.rotation.x = -0.35; // angled toward driver

    const rimMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.05), blackMat);
    const centerDisplay = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.06), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    wheelGroup.add(rimMesh);
    wheelGroup.add(centerDisplay);
    this.steeringWheel = wheelGroup;
    this.group.add(wheelGroup);

    // 8. Headlights & LED Taillights
    for (const sx of [-0.35, 0.35]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.05), headLightMat);
      hl.position.set(sx, 0.40, -1.95);
      this.group.add(hl);
    }

    for (const sx of [-0.55, 0.55]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.05), this.taillightMat);
      tl.position.set(sx, 0.38, 1.62);
      this.group.add(tl);
    }

    // Rear Formula 1 Rain / Braking Center Strobe Light
    const centerStrobe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05), this.taillightMat);
    centerStrobe.position.set(0, 0.28, 1.63);
    this.group.add(centerStrobe);

    // Dual Rear Exhausts
    for (const sx of [-0.22, 0.22]) {
      const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), darkMetalMat);
      exh.rotation.x = Math.PI / 2;
      exh.position.set(sx, 0.34, 1.68);
      this.group.add(exh);
    }

    // 9. Four High-Performance Voxel Racing Tires (with steerable front axle)
    const createWheelMesh = () => {
      const wg = new THREE.Group();
      // Outer tire rubber
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.38, 16), tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wg.add(tire);
      // Rim cap
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.39, 8), rimMat);
      rim.rotation.z = Math.PI / 2;
      wg.add(rim);
      return wg;
    };

    // Front Left (steerable pivot)
    this.flWheel = new THREE.Group();
    this.flWheel.position.set(-0.95, 0.36, -1.15);
    this.flMesh = createWheelMesh();
    this.flWheel.add(this.flMesh);
    this.group.add(this.flWheel);

    // Front Right (steerable pivot)
    this.frWheel = new THREE.Group();
    this.frWheel.position.set(0.95, 0.36, -1.15);
    this.frMesh = createWheelMesh();
    this.frWheel.add(this.frMesh);
    this.group.add(this.frWheel);

    // Rear Left
    this.rlMesh = createWheelMesh();
    this.rlMesh.position.set(-0.98, 0.38, 1.15);
    this.group.add(this.rlMesh);

    // Rear Right
    this.rrMesh = createWheelMesh();
    this.rrMesh.position.set(0.98, 0.38, 1.15);
    this.group.add(this.rrMesh);
  }

  syncMeshTransform() {
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }

  isSolidVoxel(x, y, z, world) {
    if (!world || typeof world.getBlock !== 'function') return false;
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    const blk = world.getBlock(bx, by, bz);
    if (blk === BLOCKS.AIR || blk === BLOCKS.WATER) return false;
    const def = BLOCK_DEFS[blk];
    return def ? def.solid : false;
  }

  checkCollisionAt(testPos, testYaw, world) {
    if (!world) return false;
    const sinY = Math.sin(testYaw);
    const cosY = Math.cos(testYaw);

    // 8 perimeter collision check points around the car body
    const offsets = [
      { x: 0, z: -1.7 },      // Front center
      { x: -0.85, z: -1.6 },  // Front left
      { x: 0.85, z: -1.6 },   // Front right
      { x: -0.9, z: 0 },       // Mid left
      { x: 0.9, z: 0 },        // Mid right
      { x: 0, z: 1.7 },       // Rear center
      { x: -0.85, z: 1.6 },   // Rear left
      { x: 0.85, z: 1.6 }     // Rear right
    ];

    const checkY1 = testPos.y + 0.45;
    const checkY2 = testPos.y + 0.85;

    for (const off of offsets) {
      const wx = testPos.x + (-sinY * off.z) + (cosY * off.x);
      const wz = testPos.z + (-cosY * off.z) + (-sinY * off.x);

      if (this.isSolidVoxel(wx, checkY1, wz, world) || this.isSolidVoxel(wx, checkY2, wz, world)) {
        return true;
      }
    }
    return false;
  }

  updatePhysics(dt, input, world) {
    // 1. Steering interpolation
    const targetSteer = input.steer || 0;
    this.steering += (targetSteer - this.steering) * Math.min(1.0, dt * 11.0);

    // 2. Throttle, Reverse & Braking
    const forwardInput = input.forward || 0;
    const isBraking = Boolean(input.brake || input.handbrake);

    if (forwardInput > 0) {
      this.speed += this.accel * forwardInput * dt;
      if (this.speed > this.maxSpeed) this.speed = this.maxSpeed;
    } else if (forwardInput < 0) {
      if (this.speed > 0.5) {
        // Active braking when holding backwards while moving forward
        this.speed -= this.brakeForce * dt;
        if (this.speed < 0) this.speed = 0;
      } else {
        // Reverse
        this.speed -= this.accel * 0.65 * dt;
        if (this.speed < this.reverseMaxSpeed) this.speed = this.reverseMaxSpeed;
      }
    }

    if (isBraking) {
      const bPower = input.handbrake ? this.brakeForce * 1.6 : this.brakeForce;
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - bPower * dt);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + bPower * dt);
      }
    }

    // Natural drag / friction when coasting
    if (forwardInput === 0 && !isBraking) {
      const decel = this.drag * dt;
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - decel);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + decel);
      }
    }

    // 3. Responsive Yaw Steering
    if (Math.abs(this.speed) > 0.1) {
      const speedFactor = Math.min(1.0, Math.abs(this.speed) / 3.5);
      const dirSign = this.speed >= 0 ? 1 : -1;
      this.yaw += -this.steering * this.turnRate * speedFactor * dirSign * dt * 1.5;
    }

    // 4. Drifting Detection & Body Roll
    this.isDrifting = (Math.abs(this.steering) > 0.42 && Math.abs(this.speed) > 8.5) ||
                      (Boolean(input.handbrake) && Math.abs(this.speed) > 4.0);

    const targetRoll = this.isDrifting ? -this.steering * 0.08 : -this.steering * 0.035;
    this.roll += (targetRoll - this.roll) * Math.min(1.0, dt * 8.0);

    // 5. Solid Wall Collision Resolution
    const moveDist = this.speed * dt;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    const targetPos = {
      x: this.pos.x + (-sinY * moveDist),
      y: this.pos.y,
      z: this.pos.z + (-cosY * moveDist)
    };

    if (this.checkCollisionAt(targetPos, this.yaw, world)) {
      // Wall collision! Stop car and rebound slightly to prevent barrier clipping
      this.speed = -this.speed * 0.35;
      if (sound && typeof sound.playClick === 'function') {
        sound.playClick();
      }
    } else {
      this.pos.x = targetPos.x;
      this.pos.z = targetPos.z;
    }

    // 6. Ground & Lake Bridge Elevation Follow
    if (world && typeof world.getHeightAt === 'function') {
      const bx = Math.floor(this.pos.x);
      const bz = Math.floor(this.pos.z);

      // Lake bridge deck at (-500, -500) circuit (X: -425..-395, Z: -525..-440)
      const isLakeBridge = (bx >= -425 && bx <= -395 && bz >= -525 && bz <= -440);
      let targetGroundY = isLakeBridge ? 24 : world.getHeightAt(bx, bz);

      // Smooth step over elevation
      this.pos.y += (targetGroundY - this.pos.y) * Math.min(1.0, dt * 14.0);
    }

    // 7. Visual Mesh Animations
    this.syncMeshTransform();

    // Steer front wheels
    if (this.flWheel && this.frWheel) {
      this.flWheel.rotation.y = this.steering * 0.46;
      this.frWheel.rotation.y = this.steering * 0.46;
    }

    // Roll all wheels
    const rollAngle = (this.speed / 0.36) * dt;
    if (this.flMesh) this.flMesh.rotation.x += rollAngle;
    if (this.frMesh) this.frMesh.rotation.x += rollAngle;
    if (this.rlMesh) this.rlMesh.rotation.x += rollAngle;
    if (this.rrMesh) this.rrMesh.rotation.x += rollAngle;

    // Turn steering wheel
    if (this.steeringWheel) {
      this.steeringWheel.rotation.z = -this.steering * 1.45;
    }

    // Glow taillights brighter when braking
    if (this.taillightMat) {
      const brakeGlow = (isBraking || (forwardInput < 0 && this.speed > 0.2)) ? 1.5 : 0.4;
      this.taillightMat.emissiveIntensity = brakeGlow;
    }
  }

  getRearWheelPositions() {
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    const getPos = (lx, lz) => ({
      x: this.pos.x + (-sinY * lz) + (cosY * lx),
      y: this.pos.y + 0.35,
      z: this.pos.z + (-cosY * lz) + (-sinY * lx)
    });

    return [
      getPos(-0.95, 1.15),
      getPos(0.95, 1.15)
    ];
  }

  dispose() {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

export class VehicleManager {
  constructor(world, scene, particleManager) {
    this.world = world;
    this.scene = scene;
    this.particleManager = particleManager;

    this.cars = new Map(); // id -> DrivableCar
    this.activeCar = null; // currently driven car by local player

    // Camera modes: 'chase' (3rd-person) | 'cockpit' (1st-person interior)
    this.cameraMode = 'chase';

    // Callbacks
    this.onEnterCar = null;
    this.onExitCar = null;

    this.initCircuitCars();
  }

  initCircuitCars() {
    // 6 Distinct Grand Prix Cars placed on the Starting Grid & Pit Lane at (-500, -500)
    const carConfigs = [
      { id: 'car_scuderia_red', color: 0xdc2626, x: -502, y: 24, z: -417, yaw: Math.PI / 2, name: '🏎️ Scuderia Red #1 (Pole)' },
      { id: 'car_azure_bolt', color: 0x2563eb, x: -498, y: 24, z: -423, yaw: Math.PI / 2, name: '🏎️ Azure Bolt #2 (Grid P2)' },
      { id: 'car_gold_arrow', color: 0xeab308, x: -490, y: 24, z: -417, yaw: Math.PI / 2, name: '🏎️ Gold Arrow #3 (Grid P3)' },
      { id: 'car_british_racing', color: 0x16a34a, x: -486, y: 24, z: -423, yaw: Math.PI / 2, name: '🏎️ Emerald GP #4 (Grid P4)' },
      { id: 'car_papaya_speed', color: 0xea580c, x: -512, y: 24, z: -433, yaw: Math.PI / 2, name: '🏎️ Papaya Speed #5 (Pit Stall 1)' },
      { id: 'car_silver_star', color: 0x94a3b8, x: -478, y: 24, z: -433, yaw: Math.PI / 2, name: '🏎️ Silver Star #6 (Pit Stall 2)' }
    ];

    for (const cfg of carConfigs) {
      const car = new DrivableCar(cfg.id, cfg.color, cfg.x, cfg.y, cfg.z, cfg.yaw, cfg.name);
      this.cars.set(cfg.id, car);
      this.scene.add(car.group);
    }
  }

  isDriving() {
    return Boolean(this.activeCar);
  }

  getNearestCar(playerPos, maxDist = 4.8) {
    let nearest = null;
    let minDist = maxDist;

    for (const car of this.cars.values()) {
      const dist = Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z);
      if (dist < minDist) {
        minDist = dist;
        nearest = car;
      }
    }
    return nearest;
  }

  enterCar(car, playerPhysics) {
    if (!car || car.driverId) return false;

    this.activeCar = car;
    car.driverId = 'local';
    car.driverName = 'Tú';

    // Position player exactly inside car
    if (playerPhysics) {
      playerPhysics.pos.x = car.pos.x;
      playerPhysics.pos.y = car.pos.y;
      playerPhysics.pos.z = car.pos.z;
      playerPhysics.action = 'driving';
    }

    if (sound && typeof sound.playClick === 'function') {
      sound.playClick();
    }

    if (this.onEnterCar) {
      this.onEnterCar(car);
    }
    return true;
  }

  exitCar(playerPhysics) {
    if (!this.activeCar) return false;

    const car = this.activeCar;
    car.driverId = null;
    car.driverName = null;
    this.activeCar = null;

    // Safely place player 1.8 blocks to the left of the car
    if (playerPhysics) {
      const exitOffset = 1.8;
      const sinY = Math.sin(car.yaw);
      const cosY = Math.cos(car.yaw);
      playerPhysics.pos.x = car.pos.x + (cosY * exitOffset);
      playerPhysics.pos.z = car.pos.z + (-sinY * exitOffset);
      playerPhysics.vel.x = 0;
      playerPhysics.vel.y = 0;
      playerPhysics.vel.z = 0;
      playerPhysics.action = 'idle';
    }

    if (sound && typeof sound.playClick === 'function') {
      sound.playClick();
    }

    if (this.onExitCar) {
      this.onExitCar(car);
    }
    return true;
  }

  handleInteract(playerPhysics) {
    if (this.isDriving()) {
      return this.exitCar(playerPhysics);
    }
    const nearest = this.getNearestCar(playerPhysics.pos);
    if (nearest) {
      return this.enterCar(nearest, playerPhysics);
    }
    return false;
  }

  toggleCameraMode() {
    this.cameraMode = (this.cameraMode === 'chase') ? 'cockpit' : 'chase';
    return this.cameraMode;
  }

  updateDriver(dt, input, camera, controls) {
    if (!this.activeCar) return;

    const car = this.activeCar;
    car.updatePhysics(dt, input, this.world);

    // Drifting tire smoke particles
    if (car.isDrifting && this.particleManager) {
      car.driftSmokeTimer += dt;
      if (car.driftSmokeTimer >= 0.04) {
        car.driftSmokeTimer = 0;
        const [leftTire, rightTire] = car.getRearWheelPositions();
        this.particleManager.spawnDriftSmoke(leftTire.x, leftTire.y, leftTire.z, 2);
        this.particleManager.spawnDriftSmoke(rightTire.x, rightTire.y, rightTire.z, 2);
      }
    }

    // Dynamic Camera Placement
    if (camera && controls) {
      const sinY = Math.sin(car.yaw);
      const cosY = Math.cos(car.yaw);

      if (this.cameraMode === 'cockpit') {
        // 1st-Person Interior Cockpit Camera over steering wheel and dashboard
        const eyeX = car.pos.x + (-sinY * 0.12);
        const eyeY = car.pos.y + 0.90;
        const eyeZ = car.pos.z + (-cosY * 0.12);

        camera.position.set(eyeX, eyeY, eyeZ);
        // Look ahead down the nose cone with pitch control
        camera.rotation.set(controls.pitch - 0.05, car.yaw, car.roll * 0.5, 'YXZ');

        // Hide local avatar head in cockpit mode so it doesn't block player sightline
        if (controls.localAvatar && controls.localAvatar.group) {
          controls.localAvatar.group.visible = false;
        }
      } else {
        // 3rd-Person Chase Camera trailing behind the car
        const chaseDist = 5.2;
        const chaseHeight = 2.2;

        const backX = sinY * chaseDist;
        const backY = chaseHeight;
        const backZ = cosY * chaseDist;

        const eyeOrigin = { x: car.pos.x, y: car.pos.y + 1.2, z: car.pos.z };
        const safeCamPos = controls.getSafeCameraPosition(eyeOrigin, backX, backY, backZ);

        camera.position.set(safeCamPos.x, safeCamPos.y, safeCamPos.z);
        camera.rotation.set(controls.pitch - 0.08, car.yaw, 0, 'YXZ');

        // Make avatar visible seated inside car in 3rd person chase view
        if (controls.localAvatar && controls.localAvatar.group) {
          controls.localAvatar.group.visible = true;
          controls.localAvatar.setTargetState(
            [car.pos.x, car.pos.y + 0.15, car.pos.z],
            [car.yaw, controls.pitch],
            'driving'
          );
        }
      }
    }
  }

  syncRemoteDrivers(remoteAvatars) {
    if (!remoteAvatars) return;

    for (const [id, avatar] of remoteAvatars.entries()) {
      if (avatar.action === 'driving') {
        // Find nearest car to remote driver or place under them
        const pos = avatar.group.position;
        const car = this.getNearestCar(pos, 3.5);
        if (car && car !== this.activeCar) {
          car.driverId = id;
          car.driverName = avatar.name;
          car.pos.x = pos.x;
          car.pos.y = pos.y - 0.15;
          car.pos.z = pos.z;
          car.yaw = avatar.group.rotation.y;
          car.syncMeshTransform();
        }
      }
    }
  }

  update(dt, controls, multiplayer = null) {
    if (multiplayer && multiplayer.remoteAvatars) {
      this.syncRemoteDrivers(multiplayer.remoteAvatars);
    }
  }
}
