# Project: Voxel Realms Simulation & World Expansion

## Architecture
- **Client Core (`public/src/`)**:
  - `world.js`: Voxel terrain storage, heightmaps, chunk management, sector generation, highway tunnels, caverns, Mount Fuji, Gran Circuito track.
  - `avatar.js`: Player avatar anatomy, leg pivot alignment, bone hierarchies, remote avatar interpolation and falling animations.
  - `physics.js`: Continuous collision detection, swept-AABB substepping, ground contact determination.
  - `controls.js`: First-person/third-person camera controls, FPS rifle viewmodel, ADS transitions, weapon bobbing, raycasting, vehicle driving input & camera toggling.
  - `particles.js`: Bullet tracer beams, crimson impact blood droplets, explosive smoke, tire drift particles.
  - `animals.js`: Ambient animals (knockback, blood burst, 3s despawn), autonomous highway traffic (`VoxelCar` obstacle raycasting & braking), and player `DrivableCar` physics.
  - `main.js`: Game loop coordinator, event routing between controls, weapons, vehicles, and multiplayer.
  - `ui.js`: HUD, landmark fast-travel teleportation, vehicle HUD / speedometer, sniper scope overlay.
- **Server Core (`server/`)**:
  - `server.js`: HTTP/WebSocket server initialization.
  - `rooms.js`: Authoritative room state, player movement validation, block modification broadcast, zero-fuse TNT detonation, vehicle driving packet sync.
  - `protocol.js`: Packet serialization, sanitization, validation schemas.
- **Test Suite (`test/`)**:
  - `test.js`: Comprehensive automated end-to-end and regression test suite (`node test/test.js`).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Avatar Leg Pivot Alignment | Elevate hip pivot to Y=0.75 and torso to Y=1.125 to eliminate 0.125-block floor submergence | M1 | Survey 1 |
| 2 | Authoritative Synchronous Remesh | Rebuild modified chunk mesh synchronously upon block destruction to prevent visual ghost blocks | M1 | Survey 1 |
| 3 | Predictive Gravity Descent | Invalidate onGround and trigger smooth falling for avatars when underlying blocks are dug | M1 | Survey 1 |
| 4 | Horizontal FPS Rifle Model | Reorient rifle along camera -Z, natural hip-carry offset, realistic barrel, stock, sight | M2 | Survey 2 |
| 5 | Smooth ADS Transition & Scope | Centered optical sightline, FOV lerp, weapon bobbing dampening, tactical scope overlay toggle | M2 | Survey 2 |
| 6 | Non-Destructive Shooting | Bullets never destroy terrain blocks; pass through air and interact only with entities/TNT | M2 | Survey 2 |
| 7 | Synchronized Bullet Tracers | High-speed luminous tracer beam spawned from muzzle to hit position across all clients | M2 | Survey 2 |
| 8 | Animal Blood, Knockback & 3s Despawn | Crimson impact particles, directional impulse, knockdown tilt, 3s despawn timer | M2 | Survey 2 |
| 9 | Shoot-to-Detonate TNT | Immediate zero-fuse explosion on bullet impact with shockwave and particle burst | M2 | Survey 2 |
| 10 | Traffic Forward Obstacle Raycasting | Multi-point forward rays detecting terrain, walls, buildings, placed blocks, and TNT | M3 | Survey 2 |
| 11 | Traffic Smooth Braking & Taillights | Smooth deceleration <=7.5m, complete halt before 1.8m, bright red braking taillights | M3 | Survey 2 |
| 12 | Sprawling City Sector Redesigns | Multi-building grids, avenues, streetlights, sidewalks across all 6 sectors | M4 | Survey 3 |
| 13 | Illuminated Mountain Tunnels & Caverns | Arched stone tunnels with 4-block headroom for traffic; caverns with exposed iron/gold ore veins | M4 | Survey 3 |
| 14 | Colossal Mount Fuji Landmark | Symmetrical volcano rising 2.58x up to Y=62, caldera crater (Y=54..56), snowline (Y>=46), lakes (Y=18) | M4 | Survey 3 |
| 15 | Gran Circuito Racing Track Structure | 14-block wide track (12 asphalt + red/white curbs), starting gantry, grandstands, pit lane, bridge, tunnel | M5 | Survey 3 |
| 16 | Drivable Car Physics Controller | Player drivable car (~16.5 m/s, ~2.2x sprint), responsive steering, drift smoke, swept-AABB barrier collision | M5 | Survey 1 |
| 17 | Vehicle Dual Camera Modes | Smooth third-person chase camera and interior first-person cockpit view over steering wheel | M5 | Survey 1 |
| 18 | Vehicle Entry/Exit & Multiplayer Sync | Proximity interact, WebSocket driving packets, seated driver avatar rendering | M5 | Survey 1 |
| 19 | E2E Automated Test Suite Expansion | Full automated test coverage for R1–R5 maintaining 100% compliance (`node test/test.js`) | M-TEST | Survey 1,2,3 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Multiplayer Block Excavation & Avatar Synchronization | `avatar.js`, `world.js`, `physics.js`, `rooms.js` | none | DONE (458ac3b3) |
| M2 | Premium Weapons, Synchronized Tracers & TNT Reactivity | `controls.js`, `particles.js`, `animals.js`, `main.js`, `rooms.js` | none | DONE (c0d884c9) |
| M3 | Highway Traffic Collision & Obstacle Intelligence | `animals.js`, `world.js`, `blocks.js` | none | DONE (01ed66b0) |
| M4 | Sprawling City Redesigns, Mountain Tunnels & Mount Fuji | `world.js`, `blocks.js`, `ui.js` | none | DONE (4b2b4fee) |
| M5 | Grand Prix Racing Circuit & Drivable Cars | `world.js`, `animals.js`, `controls.js`, `multiplayer.js`, `rooms.js` | M1, M4 | PLANNED |
| M-TEST | Dual Track E2E Automated Test Suite | `test/test.js` | M1, M2, M3, M4, M5 | IN_PROGRESS (f75df417) |

---

## Interface Contracts

### M1: Multiplayer Block Excavation ↔ Physics & Avatar
- `World.prototype.applyAuthoritativeBlock(x, y, z, blockType)`:
  - Updates voxel memory at `(x, y, z)`.
  - Immediately invokes synchronous chunk meshing for the local chunk and neighboring border chunks if `lx === 0 || lx === 15 || lz === 0 || lz === 15`.
- `Avatar.prototype.updateGroundSupport(world)`:
  - Validates supporting voxel at `Math.floor(x), Math.floor(y - 0.05), Math.floor(z)`. If `BLOCKS.AIR`, sets `onGround = false` and applies downward gravitational velocity.

### M2: Shooting ↔ TNT & Particles
- `Controls.prototype.triggerShoot()`:
  - Emits `{ origin, dir, voxelHit, entityHit }`.
  - Non-destructive: Does NOT emit `sendBlockModify` for terrain blocks.
  - If `voxelHit && voxelHit.type === BLOCKS.TNT`, invokes `sendTntTrigger(voxelHit.x, voxelHit.y, voxelHit.z, 0)` with `fuseMs: 0`.
- `ParticleManager.prototype.spawnBulletTracer(origin, target)`:
  - Spawns high-velocity luminous beam fading over 120ms.
- `ParticleManager.prototype.spawnBloodParticles(x, y, z, normal)`:
  - Spawns 20+ crimson particle droplets with randomized parabolic velocity.

### M3: Autonomous Traffic ↔ Obstacle Raycast
- `VoxelCar.prototype.checkObstacleAhead(lookAheadDist)`:
  - Queries `world.getBlock` along 3 forward rays at `(roadY + 1)` and `(roadY + 2)`.
  - If obstacle found within `<= 1.8m`: `speed = 0`, `isBraking = true`.
  - If obstacle found within `1.8m < d <= 7.5m`: smooth linear deceleration to 0, `isBraking = true`.
  - If clear: accelerates back to cruising speed (`8.0 .. 14.0 m/s`), `isBraking = false`.

### M4: World Generation ↔ Landmarks & Heights
- `World.prototype.getFujiHeight(x, z)`:
  - Center $(350, 350)$, radius $R=52$.
  - Conical slope rising from $Y=24$ to peak $Y=62$.
  - Caldera depression at $d \le 4$ lowering to $Y=54..56$.
  - Snow cap above $Y \ge 46$.
- `World.prototype.buildGranCircuito(chunk)`:
  - Bounding box $X \in [50..210], Z \in [-190..-40]$.
  - 14-block wide track (12-block `BLOCKS.ASPHALT` + 1-block alternating `BLOCKS.BRICK` / `BLOCKS.SNOW` curbs).

### M5: Drivable Car ↔ Controls & Multiplayer
- `DrivableCar` class in `animals.js`:
  - Methods: `enter(player)`, `exit()`, `update(dt, input)`, `getSeatPosition()`, `getSeatRotation()`.
  - Speed: Max speed $\sim 16.5 \text{ m/s}$ ($\approx 2.2\times$ sprint speed).
- `Controls.prototype.vehicleMode`:
  - When active: directs WASD/Space to car acceleration, steering, handbrake drift.
  - Key `V`: toggles between Chase Camera (third person, 5.5m distance) and Cockpit Interior View (first person inside cabin).
  - Key `E` / `F`: enter/exit vehicle.
- Multiplayer packets:
  - `vehicle_drive`: `{ vehicleId, x, y, z, yaw, pitch, roll, speed, steering, isDrifting }`.

---

## Code Layout
- `public/src/avatar.js`: Avatar proportions, bone pivots, animations.
- `public/src/world.js`: World generation, heights, sector builders, chunk updates.
- `public/src/physics.js`: Player physics, bounding boxes, collision response.
- `public/src/controls.js`: Input handling, viewmodels, weapons, driving camera.
- `public/src/particles.js`: Visual effects, tracers, blood, smoke, explosions.
- `public/src/animals.js`: Animals, autonomous traffic, drivable cars.
- `public/src/main.js`: Main loop integration, event subscriptions.
- `public/src/ui.js`: User interface, speedometers, scopes.
- `server/rooms.js`: Server state, authoritative broadcast, vehicle replication.
- `test/test.js`: Automated testing suite.
