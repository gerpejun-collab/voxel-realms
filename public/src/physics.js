// public/src/physics.js
// Robust swept-AABB voxel physics engine with gravity, collision detection, and water physics
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export class PlayerPhysics {
  constructor(world) {
    this.world = world;

    // Player position represents the bottom center of the character (feet)
    this.pos = { x: 0, y: 35, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };

    // Player bounding box dimensions
    this.width = 0.6;
    this.height = 1.8;
    this.depth = 0.6;
    this.eyeHeight = 1.62;

    // Movement tuning
    this.walkSpeed = 4.8;
    this.sprintSpeed = 7.5;
    this.jumpForce = 8.6;
    this.gravity = -26.0;

    // State flags
    this.onGround = false;
    this.inWater = false;
    this.action = 'idle';

    // Speed multiplier & Flight Mode
    this.speedMultiplier = 1.0;
    this.flightMode = false;

    // Step height (allows stepping over 0.5 unit obstacles smoothly)
    this.stepHeight = 0.5;

    // Vehicles reference / registry for solid 2D OBB collisions
    this.vehicles = [];
    this.vehicleManager = null;
    this.trafficManager = null;
    this.isDriving = false;
  }

  setVehicleManager(vm) {
    this.vehicleManager = vm;
  }

  setTrafficManager(tm) {
    this.trafficManager = tm;
  }

  registerVehicle(car) {
    if (!this.vehicles) this.vehicles = [];
    if (!this.vehicles.includes(car)) {
      this.vehicles.push(car);
    }
  }

  unregisterVehicle(car) {
    if (!this.vehicles) return;
    const idx = this.vehicles.indexOf(car);
    if (idx !== -1) {
      this.vehicles.splice(idx, 1);
    }
  }

  isSolid(x, y, z) {
    const block = this.world.getBlock(x, y, z);
    if (block === BLOCKS.AIR || block === BLOCKS.WATER) return false;
    const def = BLOCK_DEFS[block];
    return def ? def.solid : false;
  }

  isWater(x, y, z) {
    return this.world.getBlock(x, y, z) === BLOCKS.WATER;
  }

  /**
   * Teleports player instantly to specific coordinates
   */
  teleport(x, y, z) {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.vel.x = 0;
    this.vel.y = 0;
    this.vel.z = 0;
  }

  /**
   * Respawns the player safely on top of the terrain
   */
  respawn(spawnX = 0, spawnZ = 0) {
    let surfaceY = this.world.getHeightAt(spawnX, spawnZ);
    while (surfaceY < 60 && this.isSolid(spawnX, surfaceY + 1, spawnZ)) {
      surfaceY++;
    }
    this.pos.x = spawnX + 0.5;
    this.pos.y = surfaceY + 1.0;
    this.pos.z = spawnZ + 0.5;
    this.vel.x = 0;
    this.vel.y = 0;
    this.vel.z = 0;
  }

  /**
   * Checks whether the specified block coordinates lie directly beneath the player bounding box
   */
  isSupportedByBlock(x, y, z) {
    const halfW = this.width * 0.5;
    const halfD = this.depth * 0.5;
    const minX = Math.floor(this.pos.x - halfW + 0.001);
    const maxX = Math.floor(this.pos.x + halfW - 0.001);
    const minZ = Math.floor(this.pos.z - halfD + 0.001);
    const maxZ = Math.floor(this.pos.z + halfD - 0.001);

    if (x < minX || x > maxX || z < minZ || z > maxZ) {
      return false;
    }

    const feetY = Math.floor(this.pos.y - 0.05);
    return Math.abs(y - feetY) <= 1 || (y < this.pos.y && y >= this.pos.y - 1.5);
  }

  /**
   * Triggered immediately when a supporting block is broken
   */
  onBlockBroken(x, y, z) {
    if (this.isSupportedByBlock(x, y, z)) {
      this.onGround = false;
      if (this.vel.y >= 0) {
        this.vel.y = -1.5;
      }
      this.checkGroundSupport();
    }
  }

  /**
   * Validates supporting voxel directly beneath player feet
   */
  checkGroundSupport() {
    if (this.flightMode) return;
    const halfW = this.width * 0.5;
    const halfD = this.depth * 0.5;
    const minX = Math.floor(this.pos.x - halfW + 0.001);
    const maxX = Math.floor(this.pos.x + halfW - 0.001);
    const minZ = Math.floor(this.pos.z - halfD + 0.001);
    const maxZ = Math.floor(this.pos.z + halfD - 0.001);
    const checkY = Math.floor(this.pos.y - 0.05);

    let supported = false;
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (this.isSolid(x, checkY, z)) {
          supported = true;
          break;
        }
      }
      if (supported) break;
    }

    if (!supported) {
      this.onGround = false;
      if (this.vel.y >= 0) {
        this.vel.y = -1.0;
      }
    }
  }

  /**
   * Fixed physics timestep update
   */
  update(dt, input) {
    // Invalidate ground if supporting block beneath feet was removed
    if (this.onGround && !this.flightMode) {
      this.checkGroundSupport();
    }

    // Check water immersion
    const feetBlockX = Math.floor(this.pos.x);
    const feetBlockY = Math.floor(this.pos.y);
    const feetBlockZ = Math.floor(this.pos.z);
    this.inWater = this.isWater(feetBlockX, feetBlockY, feetBlockZ) ||
                   this.isWater(feetBlockX, Math.floor(this.pos.y + 1), feetBlockZ);

    // Apply movement acceleration with user speed multiplier
    const baseSpeed = input.sprint ? this.sprintSpeed : this.walkSpeed;
    const speed = baseSpeed * this.speedMultiplier;
    const moveX = input.moveX;
    const moveZ = input.moveZ;

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    let targetVx = 0;
    let targetVz = 0;

    if (len > 0.001) {
      targetVx = (moveX / len) * speed;
      targetVz = (moveZ / len) * speed;
    }

    // Horizontal acceleration / friction
    const accel = this.onGround ? 18.0 : 6.0;
    this.vel.x += (targetVx - this.vel.x) * Math.min(1.0, accel * dt);
    this.vel.z += (targetVz - this.vel.z) * Math.min(1.0, accel * dt);

    // Vertical physics
    if (this.flightMode) {
      // Flight mode: jump ascends, sprint/crouch descends, zero gravity
      let targetVy = 0;
      if (input.jump) targetVy = 8.0 * this.speedMultiplier;
      else if (input.sprint) targetVy = -8.0 * this.speedMultiplier;
      this.vel.y += (targetVy - this.vel.y) * Math.min(1.0, 15.0 * dt);
    } else if (this.inWater) {
      // Water buoyancy and swimming
      this.vel.y += this.gravity * 0.25 * dt;
      if (input.jump) {
        this.vel.y = 3.5;
      }
      this.vel.y *= Math.pow(0.85, dt * 60);
    } else {
      // Normal gravity
      this.vel.y += this.gravity * dt;
      if (input.jump && this.onGround) {
        this.vel.y = this.jumpForce;
        this.onGround = false;
      }
    }

    // Prevent excessive velocities
    this.vel.y = Math.max(-40, Math.min(35, this.vel.y));

    // Axis-aligned collision resolution
    this.resolveCollision(dt);

    // Void fall detection
    if (this.pos.y < -15) {
      this.respawn(Math.floor(this.pos.x), Math.floor(this.pos.z));
    }

    // Determine current action for animation sync
    const horizSpeed = Math.sqrt(this.vel.x * this.vel.x + this.vel.z * this.vel.z);
    if (this.inWater) {
      this.action = 'swimming';
    } else if (!this.onGround) {
      this.action = 'jumping';
    } else if (horizSpeed > 5.0) {
      this.action = 'running';
    } else if (horizSpeed > 0.3) {
      this.action = 'walking';
    } else {
      this.action = 'idle';
    }
  }

  /**
   * Resolves collision with the voxel world and solid vehicles along X, Y, and Z axes
   * Uses continuous substepping when moving fast to guarantee zero tunneling
   */
  resolveCollision(dt, vehicles = null) {
    const maxDisp = Math.max(
      Math.abs(this.vel.x * dt),
      Math.abs(this.vel.y * dt),
      Math.abs(this.vel.z * dt)
    );
    const steps = Math.max(1, Math.min(8, Math.ceil(maxDisp / 0.35)));
    const subDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      this.resolveCollisionStep(subDt);
      this.resolveCarCollisions(vehicles);
    }
  }

  /**
   * Resolves solid 2D OBB player-car collision pushout against all nearby vehicles
   * (both DrivableCar and VoxelCar) when player is not driving.
   */
  resolveCarCollisions(customVehicles = null) {
    if (this.action === 'driving' || this.isDriving) return;

    let candidateCars = [];

    if (customVehicles) {
      if (Array.isArray(customVehicles)) {
        candidateCars = customVehicles;
      } else if (customVehicles instanceof Map || typeof customVehicles.values === 'function') {
        candidateCars = Array.from(customVehicles.values());
      }
    } else {
      if (this.vehicles && this.vehicles.length > 0) {
        candidateCars.push(...this.vehicles);
      }
      if (this.vehicleManager && this.vehicleManager.cars) {
        if (typeof this.vehicleManager.cars.values === 'function') {
          for (const car of this.vehicleManager.cars.values()) {
            candidateCars.push(car);
          }
        } else if (Array.isArray(this.vehicleManager.cars)) {
          candidateCars.push(...this.vehicleManager.cars);
        }
      }
      if (this.trafficManager && this.trafficManager.cars) {
        if (Array.isArray(this.trafficManager.cars)) {
          candidateCars.push(...this.trafficManager.cars);
        } else if (typeof this.trafficManager.cars.values === 'function') {
          for (const car of this.trafficManager.cars.values()) {
            candidateCars.push(car);
          }
        }
      }
      if (this.world) {
        if (this.world.vehicleManager && this.world.vehicleManager.cars) {
          const cars = this.world.vehicleManager.cars;
          if (typeof cars.values === 'function') {
            for (const car of cars.values()) candidateCars.push(car);
          } else if (Array.isArray(cars)) {
            candidateCars.push(...cars);
          }
        }
        if (this.world.trafficManager && this.world.trafficManager.cars) {
          const cars = this.world.trafficManager.cars;
          if (Array.isArray(cars)) {
            candidateCars.push(...cars);
          } else if (typeof cars.values === 'function') {
            for (const car of cars.values()) candidateCars.push(car);
          }
        }
        if (Array.isArray(this.world.vehicles)) {
          candidateCars.push(...this.world.vehicles);
        }
        if (Array.isArray(this.world.cars)) {
          candidateCars.push(...this.world.cars);
        }
      }
      if (typeof globalThis !== 'undefined') {
        const g = globalThis;
        if (g.vehicleManager && g.vehicleManager.cars && typeof g.vehicleManager.cars.values === 'function') {
          for (const car of g.vehicleManager.cars.values()) candidateCars.push(car);
        }
        if (g.trafficManager && Array.isArray(g.trafficManager.cars)) {
          candidateCars.push(...g.trafficManager.cars);
        }
        if (g.game && g.game.vehicleManager && g.game.vehicleManager.cars) {
          for (const car of g.game.vehicleManager.cars.values()) candidateCars.push(car);
        }
        if (g.game && g.game.animalManager && g.game.animalManager.trafficManager && Array.isArray(g.game.animalManager.trafficManager.cars)) {
          candidateCars.push(...g.game.animalManager.trafficManager.cars);
        }
      }
    }

    if (!candidateCars || candidateCars.length === 0) return;

    const pPos = this.pos;
    const playerRadius = this.width * 0.5; // 0.3m

    for (const car of candidateCars) {
      if (!car) continue;
      // Skip if player is currently driving this car
      if (car.isDriven && (car.driverId === 'local' || car.driverId === this.id)) continue;
      if (this.vehicleManager && this.vehicleManager.activeCar === car) continue;

      const carPos = car.pos || car.position;
      if (!carPos || typeof carPos.x !== 'number' || typeof carPos.z !== 'number') continue;
      const carY = typeof carPos.y === 'number' ? carPos.y : 25;

      // Vertical clearance: check if player feet and car body overlap vertically
      if (Math.abs(pPos.y - carY) > 2.5) continue;

      const dx = pPos.x - carPos.x;
      const dz = pPos.z - carPos.z;
      // Fast broadphase distance check (car length ~3.5m + radius 0.3m = 3.8m -> distSq ~ 25)
      if (dx * dx + dz * dz > 25) continue;

      // Determine vehicle forward and right vectors
      let hx = 0;
      let hz = -1;
      let rx = 1;
      let rz = 0;

      if (typeof car.yaw === 'number') {
        hx = -Math.sin(car.yaw);
        hz = -Math.cos(car.yaw);
        rx = Math.cos(car.yaw);
        rz = -Math.sin(car.yaw);
      } else if (typeof car.rotationY === 'number') {
        hx = -Math.sin(car.rotationY);
        hz = -Math.cos(car.rotationY);
        rx = Math.cos(car.rotationY);
        rz = -Math.sin(car.rotationY);
      } else if (typeof car.getHeadingVector === 'function') {
        const hd = car.getHeadingVector();
        hx = hd.x;
        hz = hd.z;
        rx = -hz;
        rz = hx;
      }

      // Project displacement onto vehicle local coordinate frame
      const localFwd = dx * hx + dz * hz;
      const localRight = dx * rx + dz * rz;

      // Dimensions: DrivableCar halfLength=1.75, halfWidth=0.95; VoxelCar halfLength=1.55, halfWidth=0.85
      const carHalfLength = car.halfLength !== undefined ? car.halfLength : (car.route ? 1.55 : 1.75);
      const carHalfWidth = car.halfWidth !== undefined ? car.halfWidth : (car.route ? 0.85 : 0.95);

      const halfLen = carHalfLength + playerRadius;
      const halfWid = carHalfWidth + playerRadius;

      // 2D Oriented Bounding Box collision overlap test
      if (Math.abs(localFwd) < halfLen && Math.abs(localRight) < halfWid) {
        const penFwd = halfLen - Math.abs(localFwd);
        const penRight = halfWid - Math.abs(localRight);

        let normX = 0;
        let normZ = 0;
        let pushDist = 0;

        if (penRight < penFwd) {
          const sign = localRight >= 0 ? 1 : -1;
          normX = rx * sign;
          normZ = rz * sign;
          pushDist = penRight;
        } else {
          const sign = localFwd >= 0 ? 1 : -1;
          normX = hx * sign;
          normZ = hz * sign;
          pushDist = penFwd;
        }

        pPos.x += normX * pushDist;
        pPos.z += normZ * pushDist;

        // Eliminate velocity component directed into vehicle body
        const vDotN = this.vel.x * normX + this.vel.z * normZ;
        if (vDotN < 0) {
          this.vel.x -= normX * vDotN;
          this.vel.z -= normZ * vDotN;
        }
      }
    }
  }

  resolveCollisionStep(dt) {
    const halfW = this.width * 0.5;
    const halfD = this.depth * 0.5;

    // --- Y AXIS ---
    this.pos.y += this.vel.y * dt;
    this.onGround = false;

    let minX = Math.floor(this.pos.x - halfW + 0.001);
    let maxX = Math.floor(this.pos.x + halfW - 0.001);
    let minZ = Math.floor(this.pos.z - halfD + 0.001);
    let maxZ = Math.floor(this.pos.z + halfD - 0.001);

    if (this.vel.y <= 0) {
      // Moving down: check floor beneath feet
      const checkY = Math.floor(this.pos.y);
      let hitFloor = false;
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isSolid(x, checkY, z)) {
            hitFloor = true;
            break;
          }
        }
        if (hitFloor) break;
      }

      if (hitFloor) {
        this.pos.y = checkY + 1.0;
        this.vel.y = 0;
        this.onGround = true;
      } else {
        // Prevent sinking: check if resting on top of solid block directly beneath feet
        const belowY = Math.floor(this.pos.y - 0.05);
        if (belowY !== checkY) {
          let hitBelow = false;
          for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
              if (this.isSolid(x, belowY, z)) {
                hitBelow = true;
                break;
              }
            }
            if (hitBelow) break;
          }
          if (hitBelow && Math.abs(this.pos.y - (belowY + 1.0)) < 0.05) {
            this.pos.y = belowY + 1.0;
            this.vel.y = 0;
            this.onGround = true;
          }
        }
      }
    } else {
      // Moving up: check ceiling above head
      const checkY = Math.floor(this.pos.y + this.height);
      let hitCeiling = false;
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isSolid(x, checkY, z)) {
            hitCeiling = true;
            break;
          }
        }
        if (hitCeiling) break;
      }

      if (hitCeiling) {
        this.pos.y = checkY - this.height;
        this.vel.y = 0;
      }
    }

    // --- X AXIS ---
    this.pos.x += this.vel.x * dt;
    let minY = Math.floor(this.pos.y);
    let maxY = Math.floor(this.pos.y + this.height - 0.05);
    minZ = Math.floor(this.pos.z - halfD + 0.001);
    maxZ = Math.floor(this.pos.z + halfD - 0.001);

    if (this.vel.x > 0) {
      const checkX = Math.floor(this.pos.x + halfW);
      let hit = false;
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isSolid(checkX, y, z)) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        // Minecraft Auto-step assist
        if (this.canStepUp(this.pos.x, this.pos.z)) {
          this.pos.y = Math.floor(this.pos.y) + 1.0;
        } else {
          this.pos.x = checkX - halfW;
          this.vel.x = 0;
        }
      }
    } else if (this.vel.x < 0) {
      const checkX = Math.floor(this.pos.x - halfW);
      let hit = false;
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isSolid(checkX, y, z)) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        // Minecraft Auto-step assist
        if (this.canStepUp(this.pos.x, this.pos.z)) {
          this.pos.y = Math.floor(this.pos.y) + 1.0;
        } else {
          this.pos.x = checkX + 1.0 + halfW;
          this.vel.x = 0;
        }
      }
    }

    // --- Z AXIS ---
    this.pos.z += this.vel.z * dt;
    minX = Math.floor(this.pos.x - halfW + 0.001);
    maxX = Math.floor(this.pos.x + halfW - 0.001);
    minY = Math.floor(this.pos.y);
    maxY = Math.floor(this.pos.y + this.height - 0.05);

    if (this.vel.z > 0) {
      const checkZ = Math.floor(this.pos.z + halfD);
      let hit = false;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.isSolid(x, y, checkZ)) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        // Minecraft Auto-step assist
        if (this.canStepUp(this.pos.x, this.pos.z)) {
          this.pos.y = Math.floor(this.pos.y) + 1.0;
        } else {
          this.pos.z = checkZ - halfD;
          this.vel.z = 0;
        }
      }
    } else if (this.vel.z < 0) {
      const checkZ = Math.floor(this.pos.z - halfD);
      let hit = false;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.isSolid(x, y, checkZ)) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        // Minecraft Auto-step assist
        if (this.canStepUp(this.pos.x, this.pos.z)) {
          this.pos.y = Math.floor(this.pos.y) + 1.0;
        } else {
          this.pos.z = checkZ + 1.0 + halfD;
          this.vel.z = 0;
        }
      }
    }
  }

  /**
   * Checks if an obstacle can be stepped up smoothly (0.5 to 1.0 block height)
   */
  canStepUp(targetX, targetZ) {
    if (!this.onGround) return false;
    const halfW = this.width * 0.5;
    const halfD = this.depth * 0.5;
    const targetY = Math.floor(this.pos.y) + 1.0;
    if (targetY - this.pos.y > 1.05) return false;

    // Check headroom clearance at the elevated position
    const minX = Math.floor(targetX - halfW + 0.001);
    const maxX = Math.floor(targetX + halfW - 0.001);
    const minZ = Math.floor(targetZ - halfD + 0.001);
    const maxZ = Math.floor(targetZ + halfD - 0.001);
    const minY = Math.floor(targetY);
    const maxY = Math.floor(targetY + this.height - 0.05);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isSolid(x, y, z)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  getEyePosition() {
    return {
      x: this.pos.x,
      y: this.pos.y + this.eyeHeight,
      z: this.pos.z
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PlayerPhysics };
}
