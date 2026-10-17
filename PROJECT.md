# Project: Voxel Realms Performance Optimization & Mobile Multiplayer Expansion

## Architecture
- **Client Core (`public/src/`)**:
  - `world.js`: Voxel terrain storage, heightmaps, chunk management, progressive chunk generation (3x3 core immediate, radius 2..5 streamed 1/frame, staggered remeshing 1-2/frame), AABB road rejection, sector builders, Central Plaza & Gran Circuito.
  - `avatar.js`: Player avatar anatomy, seated driving pose snapping (zero lerp lag, no floor clamping), remote avatar interpolation.
  - `physics.js`: Continuous collision detection, swept-AABB, 2D OBB solid player-car collision resolution for drivable and traffic cars.
  - `controls.js`: First-person/third-person/cockpit camera controls, infinite-range sniper raycasting, exact TNT block targeting at any distance, mobile touch driving input routing.
  - `vehicle.js`: Drivable racing car fleet, Gran Circuito starting grid, removal of Plaza red F1 car (`car_spawn_red`), avatar seating coordinate projection, driver update guard.
  - `animals.js`: Ambient animals, autonomous traffic (`VoxelCar` distance culling >120m, 80ms throttled obstacle checks, cached obstacle distance, player detection).
  - `ui.js`: HUD, landmark fast-travel teleportation, secret Admin section in Settings with live player telemetry and teleportation, mobile driving touch controls overlay (`#mobile-driving-controls`), sniper overlay buttons (`#scope-btn-shoot`, `#scope-btn-exit`), server reset modal.
  - `multiplayer.js`: Client WebSocket handling, snapshot reception, redundant chunk remesh suppression on matching block types, server reset disconnect handling.
  - `main.js`: Game loop coordinator, event routing, startup streaming orchestration.
- **Server Core (`server/`)**:
  - `server.js`: HTTP/WebSocket server initialization.
  - `game-state.js`: Room game state, `this.animalTimers = new Map()` (decoupled from entities to prevent circular JSON), sanitized `getAnimalsSnapshot()`, `player.joinedAt`, `player.isAdmin`, `resetWorld()`, persistent `blockDeltas`.
  - `rooms.js`: Authoritative room manager, safe broadcast serialization with error handling, disconnect handling preserving `main` room and block deltas, `handleAdminAuth`, `handleAdminResetServer`, broadcasting `MSG.SERVER_RESET` ("El admin ha reiniciado el server").
  - `protocol.js`: Packet serialization, `MSG.ADMIN_AUTH`, `MSG.ADMIN_RESET_SERVER`, `MSG.ADMIN_STATE`, `MSG.SERVER_RESET`, admin credential validation (`jsieiragerpe@gmail.com` / `ARGÓN4` / `ARGON4`).
- **Test Suite (`test/`)**:
  - `test.js`: Comprehensive automated end-to-end and regression test suite (`node test/test.js`).
  - `adversarial_verify.js` & `test_adversarial_challenger.js`: Empirical stress tests and edge case verification.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Server Circular JSON Crash Fix | Decouple `setTimeout` handles into `this.animalTimers = new Map()` on `GameState`, sanitize `getAnimalsSnapshot()` to export plain DTOs, and guard `broadcast()` against JSON serialization errors in `server/rooms.js:61 & 313`. | M1 | Survey 1 |
| 2 | Persistent Map Modifications | Maintain `blockDeltas` in the singleton `main` room across 0-player periods without clearing when empty; only clear when Admin triggers `resetWorld()`. | M1 | Survey 1 |
| 3 | Stealth Admin Server Protocol | Server packet validation for `jsieiragerpe@gmail.com` with password `ARGÓN4` (and normalized `ARGON4`), tracking `player.joinedAt` and live XYZ coordinates, instant teleport packet handling, and server reset broadcasting `MSG.SERVER_RESET` ("El admin ha reiniciado el server") to disconnect clients. | M1 | Survey 1 |
| 4 | Client-Server Multiplayer Remesh Guard | In `public/src/multiplayer.js`, prevent redundant synchronous chunk remeshing when block updates receive the same block type (`world.getBlock(x,y,z) === blockType`). | M1 | Survey 1 |
| 5 | Initial Game Load Freeze Elimination | Pre-generate immediate $3\times3$ spawn core (9 chunks) synchronously (<35ms) for instant spawn at $(3, 25, 6)$; stream remaining chunks (radius 2..5) progressively at 1 chunk/frame; stagger remeshing to 1-2 chunks/frame in `World.update`; add early AABB fast-rejection in `buildRoadAndTunnelNetwork`. 100% visual fidelity preserved. | M2 | Survey 2 |
| 6 | Traffic AI CPU Frame-Time Optimization (60 FPS) | Distance-cull traffic cars >120m from player, throttle `VoxelCar.checkObstacleAhead` to every 80-100ms with cached distance and staggered timers, and use 0.25m step size, reducing queries by 99.5% and eliminating frame stutter without lowering visual quality or removing any world features. | M2 | Survey 2 |
| 7 | Plaza Central Red F1 Car Removal | Remove `car_spawn_red` (`GT Monza Rojo (Plaza Central)` at $(-12, 25, -12)$) from `vehicle.js:659` while preserving `car_spawn_blue` (GT Paris Azul) and all 12 Gran Circuito racing cars. | M3 | Survey 2 |
| 8 | Mobile Touch Driving Controls | Dedicated `#mobile-driving-controls` touch overlay in `public/index.html` and `public/src/ui.js` showing Steer Left/Right, Gas, Brake/Reverse, Camera Toggle, and Exit Vehicle buttons when seated, automatically swapping with walking controls. | M3 | Survey 2 |
| 9 | Seated Avatar Positioning & Test Guard | Snap avatar directly to seat coordinates without lerp delay or ground clamping when `action === 'driving'`; auto-hide avatar head in cockpit view; guard `typeof controls.localAvatar.update === 'function'` in `vehicle.js:837` to fix unit test TypeError. | M3 | Survey 2 |
| 10 | Solid Player-Car Collision | 2D Oriented Bounding Box (OBB) pushout collision in `PlayerPhysics` for both `DrivableCar` and `VoxelCar` so player never walks through cars; traffic cars detect player in forward heading and brake smoothly. | M3 | Survey 2 |
| 11 | Secret Admin System Client UI | Expand `player-name-input` `maxlength` to 32; when `jsieiragerpe@gmail.com` is entered, trigger password prompt for `ARGÓN4` with zero public hints; unlock Admin section in Settings (`#pause-menu`) featuring live player count, real-time player table (name, join time, XYZ, 1-touch teleport button), and Server Reset button; client handler for `server_reset` packet showing "El admin ha reiniciado el server" modal and returning to title screen. | M4 | Survey 3 |
| 12 | Exact TNT Placement | Fix dual invocation in `main.js:161-163` and dual spawning in `controls.js:909-912`, remove floating spawn offset, and implement raycast targeting at any distance to place exactly 1 solid TNT cube at the targeted block surface without floating or duplicating. | M4 | Survey 3 |
| 13 | Infinite Sniper Mode & Touch Scope Buttons | Infinite raycast range in ADS sniper mode hitting animals and TNT at any distance; overlay touch buttons `#scope-btn-shoot` ("Disparar") and `#scope-btn-exit` ("Quitar la mira") directly on `#rifle-scope-overlay`. | M4 | Survey 3 |
| 14 | Automated E2E Test Suite Expansion | Comprehensive test suite in `test/test.js` validating all R1-R6 requirements, server stability, map persistence, solid collisions, mobile controls, admin system, exact TNT, sniper mode, and 100% passing tests. | M-TEST | Survey 3 |
| 15 | Adversarial Hardening & Forensic Integrity Audit | Adversarial stress testing across edge cases, concurrency, and empirical physics validation, followed by independent forensic integrity audit. | M-FINAL | Survey 1, 2, 3 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Server Stability, Circular JSON Fix & Persistent Map Sync | `server/game-state.js`, `server/rooms.js`, `server/protocol.js`, `public/src/multiplayer.js` | none | DONE (worker_m1 verified) |
| M2 | Client Startup Performance, Progressive World Streaming & 60 FPS Traffic Optimization | `public/src/world.js`, `public/src/main.js`, `public/src/animals.js` | none | DONE (worker_m2 verified) |
| M3 | Vehicle Driving Reconstruction, Mobile Controls, Seated Avatar, Solid Collision & Plaza Cleanup | `public/src/vehicle.js`, `public/src/physics.js`, `public/src/avatar.js`, `public/src/controls.js`, `public/src/ui.js`, `public/index.html`, `public/styles.css` | none | DONE (worker_m3 verified) |
| M4 | Secret Admin UI, Exact TNT Placement & Infinite Sniper Mode | `public/index.html`, `public/styles.css`, `public/src/ui.js`, `public/src/controls.js`, `public/src/world.js` | M1 | IN_PROGRESS (worker_m4) |
| M-TEST | Suite de Pruebas Automatizadas E2E y Regresión | `test/test.js`, `TEST_INFRA.md`, `TEST_READY.md` | M1, M2, M3, M4 | IN_PROGRESS (e2e_test_writer) |
| M-FINAL | Verificación E2E 100%, Desafío Adversarial y Auditoría Forense | Global codebase, test suites, verification artifacts | M1, M2, M3, M4, M-TEST | PLANNED |


---

## Interface Contracts

### M1: Server Stability, Persistence & Admin Protocol
- `GameState.prototype.animalTimers`: Map storing active animal despawn timers indexed by `animalId`. Does not attach `Timeout` instances to `animal` objects.
- `GameState.prototype.getAnimalsSnapshot()`: Returns an array of sanitized DTOs: `{ id, type, pos: [x,y,z], yaw, health, isDead, isKnockedDown }`.
- `GameState.prototype.resetWorld()`: Clears `this.blockDeltas = new Map()`, resets world structures to default.
- `protocol.js`:
  - `MSG.ADMIN_AUTH = 'admin_auth'`
  - `MSG.ADMIN_RESET_SERVER = 'admin_reset_server'`
  - `MSG.ADMIN_STATE = 'admin_state'`
  - `MSG.SERVER_RESET = 'server_reset'`
  - `isValidAdminCredentials(identifier, key)`: returns true if identifier === 'jsieiragerpe@gmail.com' and key (normalized) === 'ARGON4'.
- `RoomManager.prototype.broadcast(room, type, data, excludeWs)`: Wrapped in `try...catch` to prevent any unhandled serialization error from crashing the process.
- `RoomManager.prototype.handleDisconnect(ws)`: Does NOT remove room or clear `blockDeltas` when player count reaches 0.

### M2: Client Startup Performance & Frame-Time Optimization
- `World.prototype.updateStreaming(playerX, playerZ)`:
  - Generates radius 1 ($3\times3$ chunks) synchronously on boot.
  - Queues radius 2..5 chunks into `this.pendingChunkGenerations` and generates at most 1 chunk per frame.
- `World.prototype.updateRemesh()`: Limits chunk meshing to `maxRemeshPerFrame = 1` (or 2 during boost mode).
- `World.prototype.buildRoadAndTunnelNetwork(chunk)`: Evaluates fast AABB road bounding box before running 256-step road geometry loop.
- `VoxelCar.prototype.checkObstacleAhead(lookAheadDist)`:
  - Bypasses check if distance to player > 120m.
  - Runs check at most every 80ms (using `_obstacleCheckTimer`), caching result in `_cachedObstacleAhead`.
  - Uses 0.25m step size.
  - Probes player bounding box in heading path.

### M3: Vehicle Driving, Avatar Seating, Solid Collision & Plaza
- `vehicle.js`:
  - `car_spawn_red` deleted from `initCircuitCars()`.
  - In `updateDriver`: `controls.localAvatar.update` guarded with `typeof ... === 'function'`.
  - Avatar target position set to cockpit seat offset `[seatX, seatY, seatZ]`.
- `avatar.js`:
  - When `this.action === 'driving'`: snaps `this.group.position.copy(this.targetPos)` directly without lerp lag; bypasses ground floor clamping.
- `physics.js`:
  - `resolveCollision`: checks 2D OBB collision against all cars (drivable and traffic), pushing the player out by penetration depth.
- `index.html` & `ui.js`:
  - `#mobile-driving-controls` added with `#mobile-btn-steer-left`, `#mobile-btn-steer-right`, `#mobile-btn-gas`, `#mobile-btn-brake`, `#mobile-btn-drive-cam`, `#mobile-btn-drive-exit`.
  - Shown when entering car, hidden when exiting car.

### M4: Secret Admin UI, Exact TNT Placement & Infinite Sniper
- `ui.js`:
  - Input `player-name-input` allows 32 characters.
  - If name is `jsieiragerpe@gmail.com`, displays modal for `ARGÓN4` password.
  - On auth success: unlocks Admin section in Settings (`#admin-panel`) displaying live player table with name, join time, XYZ, 1-touch teleport button, and Server Reset button.
  - On `server_reset` packet received: displays modal "El admin ha reiniciado el server" and disconnects back to title screen.
- `controls.js`:
  - Placed TNT raycasts targeted block surface at any distance and places exactly 1 solid TNT cube (`BLOCKS.TNT`).
  - Sniper ADS raycasts infinite distance against animals and TNT blocks.
  - Superimposes `#scope-btn-shoot` and `#scope-btn-exit` touch buttons directly on `#rifle-scope-overlay`.

---

## Code Layout
- `server/game-state.js`: Animal timers decoupling, sanitized DTO snapshot, world reset, player telemetry.
- `server/rooms.js`: Safe broadcast, persistent block deltas, admin packet handling, server reset broadcast.
- `server/protocol.js`: Admin credentials validation, message constants.
- `public/src/world.js`: Progressive chunk generation, AABB road rejection, staggered remeshing.
- `public/src/animals.js`: Traffic car distance culling, obstacle raycast throttling, player detection.
- `public/src/vehicle.js`: Removal of red F1 car, avatar seat positioning, driver update safety guard.
- `public/src/avatar.js`: Zero-lag seated driving pose snapping.
- `public/src/physics.js`: Solid 2D OBB player-car collision pushout.
- `public/src/controls.js`: Infinite sniper raycast, exact TNT targeting, mobile driving input routing.
- `public/src/ui.js`: Secret admin UI, mobile driving controls overlay, scope touch buttons, server reset modal.
- `public/src/multiplayer.js`: Redundant chunk remesh suppression, server reset handling.
- `public/index.html` & `public/styles.css`: HTML and CSS for admin panel, mobile driving controls, scope buttons.
- `test/test.js`: Comprehensive automated end-to-end test suite.
