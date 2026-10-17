# Project: Voxel Realms Gameplay Perfection & World Realism

## Architecture
- **Client Core (`public/src/`)**:
  - `world.js`: Voxel terrain storage, heightmaps, chunk management, sector generation, Central Plaza & roundabout road networks, highway tunnels, caverns, Mount Fuji, Gran Circuito closed-loop track & safety barriers.
  - `avatar.js`: Player avatar anatomy, bone hierarchies, remote avatar interpolation and falling animations.
  - `physics.js`: Continuous collision detection, swept-AABB substepping, ground contact determination.
  - `controls.js`: First-person/third-person camera controls, FPS rifle viewmodel, transparent optical ADS zoom (FOV 75° -> 32°), weapon bobbing, 3D throwable TNT entity physics, raycasting, vehicle driving input & camera toggling.
  - `particles.js`: Bullet tracer beams, crimson impact blood droplets, explosive smoke, shockwaves, debris fragments, tire drift particles.
  - `animals.js`: Ambient animals, autonomous highway traffic (`VoxelCar` arc look-ahead, obstacle braking & unblocked roundabout pathing).
  - `vehicle.js`: Drivable player vehicles (`DrivableCar` starting grid fleet, correct forward yaw, Central Plaza fleet).
  - `main.js`: Game loop coordinator, event routing between controls, weapons, vehicles, and multiplayer.
  - `ui.js`: HUD, landmark fast-travel teleportation, vehicle HUD / speedometer, sniper optical scope overlay.
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
| 1 | Autonomous Traffic Circular Arc Look-Ahead | Replace straight tangent raycasts with circular arc $(\theta + d/R)$ sampling to prevent false obstacle detections on curbs/streetlights around Plaza Central roundabout | M1 | Survey 3_1 |
| 2 | Lateral Coordinate Floor Fix | Use `Math.round` / clamped lane bounds instead of `Math.floor` for lateral ray offsets, eliminating curb and streetlight false positives on highways | M1 | Survey 3_1 |
| 3 | Foliage & Headroom Filtering | Treat non-colliding `OAK_LEAVES` as transparent for vehicles, and sample headroom strictly relative to local $roadSurfaceY$ | M1 | Survey 3_1 |
| 4 | Plaza Central Bell Towers & Obelisk Realignment | Relocate corner bell towers to $(\pm 11, \pm 11)$ and entrance obelisks to $X=\pm 4$ / $Z=\pm 4$ to clear roundabout road ring and cardinal road entries | M1 | Survey 3_1 |
| 5 | Plaza Central Roadway Leveling & Clearance | Pave and level cardinal approaches $d=13..19$ at $Y=24$ with 5 blocks of open AIR headroom ($Y=25..29$), removing blocking curb walls at highway junctions | M1 | Survey 3_1 |
| 6 | Clear Optical Rifle ADS Vision | Hide `rifleGroup` at `aimBlend > 0.82`, set `scopeLens` opacity to 0.0, and hide default `#crosshair` during ADS so the camera has a completely unobstructed view | M2 | Survey 3_2 |
| 7 | Real Camera Optical Zoom (FOV Reduction) | Reduce camera FOV from 75° to 32° (~2.34x optical zoom) smoothly with reticle overlay to provide sharp magnification of distant targets | M2 | Survey 3_2 |
| 8 | 3D Throwable TNT Box Entity | Spawn distinct 3D TNT box entity (`BoxGeometry(0.94)`, 6-face Minecraft canvas textures with red sides and white "TNT" band, flashing white ignition animation) | M2 | Survey 3_2 |
| 9 | Parabolic Throwable TNT Physics | Parabolic lob trajectory with forward impulse, gravity, and ground collision/bounce to rest in the world | M2 | Survey 3_2 |
| 10 | Authentic Reactive TNT Explosion | Minecraft-style flash, shockwave particle burst, flying debris fragments, explosion audio sound effect, and radius-3 crater excavation in destructible blocks | M2 | Survey 3_2 |
| 11 | Instant Bullet-Triggered TNT Detonation | Raycast bullet collisions against placed or in-flight 3D TNT entities to detonate instantly with zero fuse | M2 | Survey 3_2 |
| 12 | Gran Circuito C1 Continuous Closed-Loop Track | Eliminate all 3 disconnected joints with an 8-segment mathematically seamless C1 continuous asphalt circuit ($X \in [50..210], Z \in [-190..-40]$) | M3 | Survey 3_3 |
| 13 | Continuous Perimeter Safety Barriers | 2-block-high crash barriers (`BLOCKS.COBBLESTONE` base + `BLOCKS.IRON_ORE` steel guardrail) continuously tracing inner ($d=-8$) and outer ($d=+8$) track boundaries | M3 | Survey 3_3 |
| 14 | Spectator Grandstands Facing Track | Invert grandstand slope to $tierY = trackY + 2 + (z + 50)$ so seating steps upward North and spectators directly face South towards the main straight | M3 | Survey 3_3 |
| 15 | Starting Grid Forward Yaw & Fleet | Set vehicle spawn `yaw: -Math.PI / 2` so cars face forward down the straight towards Turn 1, with detailed drivable cars on the starting grid and Plaza Central | M3 | Survey 3_3 |
| 16 | Comprehensive E2E Automated Test Suite Expansion | Full automated tests in `test/test.js` validating traffic flow, plaza clearance, ADS transparency, 3D TNT physics/craters, track continuity, barriers, grandstands, and fleet | M-TEST | Survey 3_1, 3_2, 3_3 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Desbloqueo del Tráfico en Rotonda y Accesos Viales en Plaza Central | `public/src/animals.js`, `public/src/world.js` (Plaza Central) | none | DONE (90/90 tests passed) |
| M2 | Mira Óptica con Zoom Real y Caja 3D de TNT Reactivo | `public/src/controls.js`, `public/src/ui.js`, `public/src/particles.js`, `public/src/world.js` (craters) | none | DONE (93/93 tests passed) |
| M3 | Reconstrucción Continua del Gran Circuito, Vallas, Gradas y Flota | `public/src/world.js` (Gran Circuito), `public/src/vehicle.js` | none | DONE (97/97 tests passed) |
| M-TEST | Suite de Pruebas Automatizadas E2E y Regresión | `test/test.js` | M1, M2, M3 | DONE (97/97 tests passed, 14 adversarial tests passed) |
| M-FINAL | Verificación E2E 100%, Desafío Adversarial y Auditoría Forense | Global codebase, test suite, verification artifacts | M1, M2, M3, M-TEST | DONE (Gate PASS: Unanimous APPROVE, CLEAN Audit) |

---

## Interface Contracts

### M1: Traffic AI & Plaza Central Geometry
- `VoxelCar.prototype.checkObstacleAhead(lookAheadDist)`:
  - For route `circle`: samples forward positions along arc $(\theta + s / R)$ at radial distance $R = 21.0 \pm 0.5$.
  - Uses `Math.round` to avoid probing neighbor curb blocks.
  - Ignores `BLOCKS.OAK_LEAVES` (7) in collision evaluation.
  - Headroom checked at `[roadSurfaceY + 1, roadSurfaceY + 2]`.
- `World.prototype.buildSpawnPlaza(chunk)`:
  - Relocates corner bell towers to $(\pm 11, \pm 11)$.
  - Places cardinal obelisks at $X = \pm 4$ (for N/S) and $Z = \pm 4$ (for E/W).
  - Paves road corridors $d = 13 \dots 19$ at $Y = 24$, carving $Y = 25 \dots 29$ as `BLOCKS.AIR`.
  - Suppresses curb walls at highway-roundabout junctions ($d \in [18.5, 23.5]$ across cardinal axes).

### M2: Rifle ADS & 3D Throwable TNT
- `Controls.prototype.update(dt)`:
  - When `this.aimBlend > 0.82`: `this.rifleGroup.visible = false`; otherwise `true`.
  - Camera FOV lerps smoothly between 75° and 32°.
  - `#crosshair` display set to `none` while `#rifle-scope-overlay` is active.
- `Controls.prototype.throwTnt()`:
  - Spawns `TntEntity` in front of camera with velocity $\vec{V} = \text{cameraDir} \times 14.0 + (0, 3.5, 0)$.
  - `TntEntity.update(dt)`: applies gravity $-18.0 \text{ m/s}^2$, checks ground contact, bounces, flashes white with accelerating frequency over 3.0s fuse.
  - On detonation: triggers sound, particles, calls `world.excavateCrater(x, y, z, 3.0)`.
- `Controls.prototype.triggerShoot()`:
  - Raycasts against active `tntEntities` list; if struck, detonates instantly with 0 fuse.

### M3: Gran Circuito Continuous Rebuild & Grid Cars
- `World.prototype.buildGranCircuito(chunk)`:
  - Paves 8 continuous segments with C1 continuity:
    1. Main Straight: $X \in [75..175], Z \in [-66..-54]$.
    2. Curva Grande: Center $(175, -84)$, $R = 24$, angle $-90^\circ \to 0^\circ$.
    3. Lake Bridge: $X \in [193..205], Z \in [-84..-140]$.
    4. Lake Hairpin: Center $(165, -140)$, $R = 34$, angle $0^\circ \to 180^\circ$.
    5. Mountain Tunnel: $X \in [70..131], Z \in [-164..-152]$.
    6. Southwest Turn: Center $(70, -132)$, $R = 26$, angle $180^\circ \to 270^\circ$.
    7. Chicane del Estadio: S-curve transition from $(-106)$ to $(-74)$.
    8. Final Turn: Center $(75, -74)$, $R = 14$, angle $270^\circ \to 360^\circ$ back to Main Straight.
  - Continuous 2-block safety barriers along inner and outer perimeters (`BLOCKS.COBBLESTONE` + `BLOCKS.IRON_ORE`).
  - Grandstand: $tierY = trackY + 2 + (z + 50)$, stepped upward North, facing South.
- `VehicleManager.prototype.initVehicles()`:
  - SE starting grid cars spawned at $X = 90, 105, 120, 135$, $Z = -60$ with `yaw: -Math.PI / 2`.
  - Plaza Central sports car spawned at $(25, 25, 0)$ ready to drive.

---

## Code Layout
- `public/src/animals.js`: Traffic vehicle physics, arc raycasting, obstacle braking.
- `public/src/world.js`: Spawn plaza clearance, road leveling, Gran Circuito continuous closed loop, safety barriers, grandstands, explosion crater.
- `public/src/controls.js`: FPS rifle viewmodel visibility, ADS optical zoom, throwable 3D TNT entity, shooting collision.
- `public/src/ui.js`: Optical scope overlay, crosshair toggling.
- `public/src/particles.js`: Explosion shockwave, debris particles.
- `public/src/vehicle.js`: Drivable racing car fleet, forward starting yaw.
- `test/test.js`: Automated end-to-end test suite.
