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
   * Fixed physics timestep update
   */
  update(dt, input) {
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
   * Resolves collision with the voxel world along X, Y, and Z axes
   * Uses continuous substepping when moving fast to guarantee zero tunneling
   */
  resolveCollision(dt) {
    const maxDisp = Math.max(
      Math.abs(this.vel.x * dt),
      Math.abs(this.vel.y * dt),
      Math.abs(this.vel.z * dt)
    );
    const steps = Math.max(1, Math.min(8, Math.ceil(maxDisp / 0.35)));
    const subDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      this.resolveCollisionStep(subDt);
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
