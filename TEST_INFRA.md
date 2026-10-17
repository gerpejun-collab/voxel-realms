# TEST_INFRA.md — Voxel Realms Test Infrastructure & 4-Tier Specification

## 1. Test Philosophy: Opaque-Box & Requirement-Driven

The Voxel Realms test infrastructure is engineered under an **opaque-box, requirement-driven** doctrine:
1. **Behavioral Grounding**: Tests validate observable functional requirements, interface contracts, protocol envelopes, physics kinematics, and DOM structures rather than internal implementation minutiae.
2. **Deterministic & Self-Contained Execution**: Every test sets up its own isolated state, creates mock instances where necessary (mocking THREE.js vectors/groups, WebSockets, or browser DOM environments), and cleans up resources without reliance on execution order.
3. **Flakiness Immunity**: No asynchronous sleep races, network timeouts, or unconstrained timers. Time advances through explicit dt stepping or simulated clock increments.
4. **Authoritative Output Derivation**: Test inputs and expected outputs are directly grounded in `ORIGINAL_REQUEST.md` (specifically requirements R1–R6 from 2026-10-17T16:35:06Z and urgent additions) and `PROJECT.md`.

---

## 2. Feature Inventory

| # | Feature | Key Requirements & Mandates | Source | Milestone |
|---|---------|-----------------------------|--------|-----------|
| 1 | Server Circular JSON Crash Fix | Decouple `setTimeout` handles into `animalTimers = new Map()` on `GameState`; sanitize `getAnimalsSnapshot()` to export plain DTOs; guard `broadcast()` against JSON serialization crashes in `server/rooms.js`. | R1 | M1 |
| 2 | Persistent Map Modifications | Retain `blockDeltas` in the singleton `main` room across 0-player periods without clearing when empty; only clear when Admin triggers `resetWorld()`. | R2 | M1 |
| 3 | Stealth Admin Server Protocol | Authenticate `jsieiragerpe@gmail.com` with key `ARGÓN4` / `ARGON4`; track `player.joinedAt` and live XYZ; handle instant teleportation; broadcast `MSG.SERVER_RESET` ("El admin ha reiniciado el server") to disconnect clients. | R4 | M1 |
| 4 | Client-Server Multiplayer Remesh Guard | In `public/src/multiplayer.js`, prevent redundant synchronous chunk remeshing when block updates receive identical block types (`world.getBlock(x,y,z) === blockType`). | Urgent | M1 |
| 5 | Initial Game Load Freeze Elimination | Synchronous $3\times3$ spawn core generation (<35ms); progressive chunk streaming for radius 2..5 (1 chunk/frame); staggered remeshing (1–2 chunks/frame); AABB road rejection. 100% visual fidelity preserved. | R1, Urgent | M2 |
| 6 | Traffic AI CPU Frame-Time Optimization (60 FPS) | Distance-cull traffic cars >120m from player; throttle `VoxelCar.checkObstacleAhead` to 80–100ms with cached distance; 0.25m step size; eliminate per-frame CPU spikes while keeping visual detail. | Urgent | M2 |
| 7 | Plaza Central Red F1 Car Removal | Remove `car_spawn_red` (`GT Monza Rojo (Plaza Central)` at $(-12, 25, -12)$) from `vehicle.js` while preserving `car_spawn_blue` (GT Paris Azul) and all 12 Gran Circuito racing cars. | R2 | M3 |
| 8 | Mobile Touch Driving Controls | Dedicated `#mobile-driving-controls` overlay in `public/index.html` with `#mobile-drive-left`, `#mobile-drive-right`, `#mobile-drive-brake`, `#mobile-drive-gas`; automatically swaps with walking controls when seated in a vehicle. | R3 | M3 |
| 9 | Seated Avatar Positioning & Test Guard | Snap avatar directly to seat coordinates without lerp delay or ground clamping when `action === 'driving'`; auto-hide avatar head in cockpit view; guard `typeof controls.localAvatar.update === 'function'` in `vehicle.js`. | R3 | M3 |
| 10 | Solid Player-Car Collision | 2D Oriented Bounding Box (OBB) pushout collision in `PlayerPhysics` / `VehicleManager` for both `DrivableCar` and `VoxelCar` so player never walks through cars; traffic cars detect player in forward heading and brake smoothly. | R3 | M3 |
| 11 | Secret Admin System Client UI | Expand `player-name-input` `maxlength` to 40; trigger password prompt for `ARGÓN4` when `jsieiragerpe@gmail.com` is entered with zero public hints; unlock Admin section in Settings (`#admin-settings-panel`) featuring live player count, real-time player table, 1-touch teleport button, and Server Reset button; client handler for `server_reset` showing "El admin ha reiniciado el server". | R4 | M4 |
| 12 | Exact TNT Placement | Remove dual invocation / double spawning; eliminate floating offset; implement surface raycast targeting at any distance to place exactly 1 solid TNT cube without floating or duplicating. | R5 | M4 |
| 13 | Infinite Sniper Mode & Touch Scope Buttons | Infinite raycast range in ADS sniper mode hitting animals and TNT at any distance; overlay touch buttons `#scope-btn-shoot` ("🔫 TIRAR") and `#scope-btn-exit` ("❌ QUITAR MIRA") directly on `#rifle-scope-overlay`. | R6 | M4 |
| 14 | Automated E2E Test Suite Expansion | Comprehensive test suite in `test/test.js` validating all R1–R6 requirements and performance mandates with 100% passing tests. | All | M-TEST |
| 15 | Adversarial Hardening & Forensic Audit | Stress testing across edge cases, concurrency, and empirical physics validation in `adversarial_verify.js` and `test_adversarial_challenger.js`. | All | M-FINAL |

---

## 3. Test Architecture & Directory Layout

```
MINECRAFT ONRDER/
├── server/
│   ├── protocol.js         # Packet types, validation, admin credential authentication
│   ├── game-state.js       # Room state, player telemetry, sanitized animal snapshots, persistence
│   └── rooms.js            # RoomManager, safe broadcast serialization, admin actions
├── public/
│   ├── index.html          # Markup: HUD, admin panel, mobile driving pedals, scope overlay
│   ├── styles.css          # Styling: HUD, admin UI, mobile buttons, scope overlay
│   └── src/
│       ├── world.js        # Terrain storage, progressive chunk generation, remeshing
│       ├── avatar.js       # Player avatar anatomy, seated pose, zero-lag position snapping
│       ├── physics.js      # Swept-AABB, 2D OBB solid player-car collision
│       ├── controls.js     # Camera controls, infinite sniper raycast, exact TNT placement
│       ├── vehicle.js      # DrivableCar fleet, seat alignment, solid car pushout
│       ├── animals.js      # TrafficManager, VoxelCar obstacle checking & throttling
│       ├── ui.js           # UI state, admin table rendering, mobile control visibility
│       └── multiplayer.js  # WebSocket client, delta caching, admin reset handling
├── test/
│   ├── test.js             # Comprehensive automated test suite (Sections 1–12)
│   ├── adversarial_verify.js # Empirical stress tests & boundary validation
│   └── test_adversarial_challenger.js # Challenger edge case verification
├── TEST_INFRA.md           # This infrastructure & test design document
└── TEST_READY.md           # Test suite completion & coverage declaration
```

### Module Loading Strategy in Node.js
Because client modules in `public/src/` use browser ES6 modules (`import`/`export`), the test harness utilizes custom dynamic loaders (`loadWorldModule`, `loadPlayerPhysicsModule`, `loadSoundSystemModule`, `loadControlsModuleForM2`, `loadVehicleModule`, `loadAnimalsModule`, etc.). These loaders:
- Strip `import`/`export` keywords.
- Inject stubbed browser APIs (`THREE`, `AudioContext`, `DOMElement`).
- Bind mathematical helper classes (such as `SimplexNoise`, `Vector3`, `Euler`).
- Return instantiated classes for direct, isolated evaluation in Node.js.

---

## 4. 4-Tier Test Design Methodology

### Tier 1: Feature Coverage (Core Requirements $\ge 5$ tests per feature)
- **F1 (Server Stability & Circular JSON)**:
  1. `GameState.animalTimers` Map stores timer without mutating animal object.
  2. `GameState.getAnimalsSnapshot()` returns plain JSON-serializable DTOs without circular structures.
  3. `JSON.stringify` on animals snapshot succeeds without throwing `TypeError`.
  4. `RoomManager.prototype.broadcast` catches serialization errors gracefully.
  5. Despawn timer clean-up on animal destruction prevents orphaned timer references.
- **F2 (Persistent Map Modifications)**:
  1. `GameState.modifyBlock` records block delta in `this.blockDeltas`.
  2. Disconnecting all players from room retains all `blockDeltas`.
  3. New player joining an empty room receives all accumulated `blockDeltas`.
  4. Multiple block modifications at the same coordinates overwrite previous deltas correctly.
  5. Only `GameState.prototype.resetWorld()` clears `blockDeltas`.
- **F3 (Stealth Admin Server Protocol)**:
  1. `isValidAdminCredentials` accepts `jsieiragerpe@gmail.com` with `ARGÓN4`.
  2. `isValidAdminCredentials` accepts normalized ASCII `ARGON4`.
  3. Reject unauthorized credentials with incorrect password or incorrect email.
  4. `RoomManager.handleAdminResetServer` wipes room state and emits `MSG.SERVER_RESET`.
  5. Admin telemetry snapshot includes `joinedAt`, `name`, `pos` [x, y, z] for all players.
- **F4 (Client-Server Remesh Guard)**:
  1. Identical block modification (`blockType === currentBlock`) does not mark chunk dirty.
  2. Redundant block update does not trigger expensive synchronous `rebuildMesh`.
  3. Real block changes mark chunk dirty and trigger rebuild.
  4. Boundary block modification rebuilds adjacent chunk only when block actually changed.
  5. Unloaded chunk delta reception stores change in `blockDeltas` without forcing synchronous mesh rebuild.
- **F5 (Initial Load Freeze Elimination)**:
  1. `World.updateStreaming` generates immediate $3\times3$ spawn core (distSq $\le 2$).
  2. Outer chunks beyond $3\times3$ are generated progressively across frames.
  3. `World.updateRemesh` budgets remeshes to $\le 2$ chunks per frame.
  4. Fast AABB bounding box check in road generator skips unaffected chunks.
  5. Instant spawn at $(3, 25, 6)$ has solid ground support without falling into void.
- **F6 (Traffic AI 60 FPS Throttling & Distance Culling)**:
  1. `VoxelCar.checkObstacleAhead` skips execution when distance to player $> 120$m.
  2. Obstacle raycast results are cached in `_cachedObstacleAhead`.
  3. Raycast uses $0.25$m step size deduplicating integer voxel lookups.
  4. Forward player detection halts car smoothly when pedestrian is in front bumper heading.
  5. Moving pedestrian clear of lane allows traffic car to resume speed smoothly.
- **F7 (Plaza Central F1 Car Removal)**:
  1. `car_spawn_red` (`GT Monza Rojo`) is absent from `VehicleManager.circuitCars`.
  2. `car_spawn_blue` (`GT Paris Azul`) remains present at Plaza Central.
  3. `car_spawn_gold` (`GT Veloce Oro`) remains present at Plaza Central.
  4. All 12 Gran Circuito racing cars remain present in starting grid & pit stalls.
  5. Total vehicle count in `VehicleManager.circuitCars` reflects exact removal.
- **F8 (Mobile Touch Driving Controls UI)**:
  1. `#mobile-driving-controls` DOM element exists in `index.html`.
  2. Pedals `#mobile-drive-gas` and `#mobile-drive-brake` exist with appropriate labels.
  3. Steering buttons `#mobile-drive-left` and `#mobile-drive-right` exist with appropriate icons.
  4. Entering vehicle displays `#mobile-driving-controls` and hides pedestrian joystick.
  5. Exiting vehicle restores pedestrian touch controls and hides driving pedals.
- **F9 (Seated Avatar Pose & Test Guard)**:
  1. Entering car positions avatar directly at cockpit seat offset $(seatX, seatY, seatZ)$.
  2. When `action === 'driving'`, `Avatar.update` snaps directly without lerp lag.
  3. Avatar torso, head, and arm pivots adjust to seated driving posture.
  4. Cockpit view hides avatar group / head so sightline is unobstructed.
  5. `vehicle.js` updateDriver guards `typeof controls.localAvatar.update === 'function'`.
- **F10 (Solid Player-Car Collision)**:
  1. 2D OBB collision detects player penetration against drivable car chassis.
  2. Player position is pushed out along minimum penetration axis.
  3. 2D OBB collision detects player penetration against autonomous traffic cars.
  4. Walking into a stationary car prevents passing through or ghosting into car body.
  5. Forward obstacle check detects player as solid obstacle and brakes traffic car.
- **F11 (Secret Admin Client UI)**:
  1. `player-name-input` allows at least 40 characters (for email input).
  2. Public login screen has zero admin buttons, labels, or hints.
  3. Entering `jsieiragerpe@gmail.com` reveals password input field.
  4. `#admin-settings-panel` exists in `#pause-menu` with player telemetry table.
  5. Receiving `server_reset` packet displays "El admin ha reiniciado el server" modal and disconnects.
- **F12 (Exact TNT Placement)**:
  1. Activating TNT places exactly 1 solid cube of `BLOCKS.TNT` (19).
  2. TNT is placed at targeted block face without floating in mid-air.
  3. Long-range raycast places TNT accurately at 50m, 100m, and 300m distances.
  4. No duplicate 2nd cube or duplicate packet emitted.
  5. Shooting placed TNT immediately detonates it.
- **F13 (Infinite Sniper Mode & Scope Buttons)**:
  1. Sniper ADS mode activates raycast with range $\ge 1000$ blocks.
  2. Striking an animal at 500m distance triggers hit registration.
  3. Striking TNT at 500m distance triggers instant detonation.
  4. `#scope-btn-shoot` ("🔫 TIRAR") exists in `#rifle-scope-overlay`.
  5. `#scope-btn-exit` ("❌ QUITAR MIRA") exists in `#rifle-scope-overlay`.

---

### Tier 2: Boundary & Corner Conditions ($\ge 5$ tests per feature)
- Out-of-bounds coordinates ($Y < 0$, $Y > 128$, $|X| > 10000$).
- Extreme rapid packet flooding (100 block modifications per second).
- Null, undefined, empty, and non-ASCII character inputs in admin authentication.
- Zero-speed, reverse-speed, and terminal-velocity vehicle driving states.
- Exact boundary chunk coordinate transitions (e.g., $X = 15 \to 16$, $Z = -1 \to 0$).
- High-altitude sniper shots aiming at void / sky.
- Disconnecting client during active car driving or active TNT throw.

---

### Tier 3: Cross-Feature Pairwise Interactions
- **Admin Reset $\times$ Active Driving**: Admin resets server while a player is driving at max speed $\to$ player is cleanly dismounted, car physics resets, and client receives reset modal.
- **Sniper Shot $\times$ Moving Car $\times$ TNT**: Sniper fires at infinite range hitting TNT block mounted near track while a car drives by $\to$ TNT detonates, car obstacle detection halts vehicle, player avatar remains seated.
- **Multiplayer Block Digging $\times$ Mobile Driving Controls**: Player digs road surface beneath an oncoming car $\to$ road height updates, car detects obstacle/pit, mobile pedals remain responsive.
- **Persistent Deltas $\times$ Admin Teleportation**: Admin teleports to player standing in an excavated cavern $\to$ chunks load with all historical deltas preserved.

---

### Tier 4: Real-World Scenarios
1. **Full Mobile Player Session**:
   - Player logs in on mobile device (small viewport).
   - Walks to Gran Circuito, enters a racing car.
   - Mobile driving controls appear; player drives laps around the track.
   - Exits car; pedestrian controls re-appear cleanly.
2. **Admin Emergency Server Wipe**:
   - Multiple players build structures across several sectors.
   - Admin logs in with `jsieiragerpe@gmail.com` + `ARGÓN4`.
   - Admin inspects player telemetry table and teleports to a player.
   - Admin triggers server reset.
   - All players receive "El admin ha reiniciado el server" and return to login screen; world is restored.
3. **Infinite-Range Tactical Sniper**:
   - Player equips rifle, aims down sights (ADS).
   - Scope overlay appears with touch buttons `#scope-btn-shoot` and `#scope-btn-exit`.
   - Player hits TNT placed 400 blocks away; TNT detonates with shockwave.
   - Player taps `#scope-btn-exit` to leave scope smoothly.

---

## 5. Verification Commands

```bash
# Execute core test suite
node test/test.js

# Execute adversarial verification suite
node test/adversarial_verify.js

# Execute adversarial challenger suite
node test/test_adversarial_challenger.js
```
