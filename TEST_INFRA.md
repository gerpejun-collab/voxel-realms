# TEST_INFRA.md — Grandmaster Chess 3D & Mobile Expansion Test Infrastructure

## 1. Test Philosophy: Opaque-Box & Requirement-Driven

The testing infrastructure for the Grandmaster 3D Chess overhaul in Voxel Realms is engineered under an **opaque-box, requirement-driven** doctrine:
1. **Behavioral Grounding**: Tests validate observable functional requirements, FIDE rules correctness, DOM/CSS layout geometries, procedural 3D vertex/normal math, multiplayer WebSocket packet contracts, and neural network inference/learning dynamics rather than internal implementation details.
2. **Deterministic & Self-Contained Execution**: Every test sets up its own isolated state, creates mock instances where necessary (mocking Three.js scenes/geometries, WebSockets, or browser DOM environments in Node.js), and cleans up resources without reliance on execution order or global side effects.
3. **Flakiness Immunity**: Zero asynchronous sleep races, unconstrained network sockets, or uncoordinated intervals. Clock ticks advance deterministically through discrete time increments ($\Delta t$).
4. **Authoritative Output Derivation**: Test inputs and expected outputs are directly derived from:
   - FIDE Laws of Chess (Handbooks and tournament standards).
   - `c:\Users\workai\Music\MINECRAFT ONRDER\.agents\teamwork\ORIGINAL_REQUEST.md` (Requirements R1 through R5).
   - `c:\Users\workai\Music\MINECRAFT ONRDER\PROJECT.md`.
   - `c:\Users\workai\Music\MINECRAFT ONRDER\CHESS_200_SPEC_PLAN.md` (Technical specifications 1 through 200).
5. **Zero External Test Framework Dependencies**: Built for standard Node.js $\ge 18$ using native assertions (`node:assert/strict`) and clean headless execution with zero native C++ binaries (`node-gyp`, Python, TensorFlow C++ bindings).

---

## 2. Feature Inventory: Grandmaster Chess Systems

| # | Feature Area | Key Requirements & Mandates | Source | Milestone |
|---|--------------|-----------------------------|--------|-----------|
| 1 | **FIDE Chess Rules Extended** | Initial 20 legal moves; Kingside/Queenside castling through check prevention; en passant capture mechanics and immediate expiration; pawn promotion to Q, R, B, N; checkmate vs stalemate; threefold repetition with Zobrist hashing; 50-move rule; insufficient material ($K\text{ vs }K$, $K+B\text{ vs }K$, $K+N\text{ vs }K$); PGN/FEN parsing and serialization. | R1, R5 | M5 / Spec 191 |
| 2 | **Mobile App UI/UX & Responsive Layout** | Single-screen `100dvh` CSS Grid container; safe-area padding (`env(safe-area-inset-*)`); zero horizontal scroll and zero vertical page bounce across mobile viewports (360x800, 375x667, 390x844, 412x915); compact 48px Material 3 App Bar; symmetric 44px player cards with Fischer clocks; 6px vertical evaluation bar; 1-line horizontal SAN move ticker; docked 56px 4-tab bottom navigation bar; 4 modal slide-up bottom sheets with touch backdrop and drag handles; 44px+ touch targets. | R2 | M1 / Spec 192 |
| 3 | **Photorealistic 3D Procedural Board & Staunton Pieces** | Procedural 512x512 PBR Canvas textures (Dark Walnut wood, Light Maple wood, Carrara & Marquina marble) with Sobel normal bumps and clearcoat gloss without external image files; procedural high-poly Staunton 3D piece geometries via `THREE.LatheGeometry` (36 segments) and `THREE.ExtrudeGeometry` (sculpted Knight bust with mane/cheeks); green baize felt pads; studio lighting and soft shadows; dynamic aspect camera math auto-framing the board across 360x800 to 412x915 viewports; 3 camera presets. | R3 | M2 / Spec 193 |
| 4 | **Robust Multiplayer Synchronization & Reconnection** | Strict namespace segregation (`type.startsWith('chess_')`); standardized envelope `{ type, data }`; 4-digit PIN room creation and PIN-only join routing; FIFO matchmaking queues with AI suggestion timeout ($>25\text{s}$); authoritative move validation and clock synchronization; secret session tokens (`playerToken`) with disconnect forfeit timer (60s) and seamless `chess_reconnect`; live spectator streaming with spectator security authority guards (rejecting draw/resign/rematch from spectators). | R4 | M3 / Spec 194 |
| 5 | **Deep-Learning Neural Engine, MCTS & Self-Play RL** | Pure JS `Float32Array` dual-headed Policy/Value Neural Network (896 input features, residual hidden blocks with LeakyReLU, 4096-output policy head, scalar value head in $[-1, 1]$); 64-bit BigInt Zobrist hashing; MCTS search engine with PUCT formula, Dirichlet noise, simulation budgets, and temperature sampling; 1,200+ position Grandmaster Opening Book covering ECO volumes A–E; headless self-play RL training loop (`scripts/train_chess_rl.js`) executing analytical backprop and Adam optimizer weight updates. | R5 | M4 / Specs 195–200 |

---

## 3. Test Architecture & Directory Layout

```
MINECRAFT ONRDER/
├── public/
│   ├── index.html                     # Mobile modal container #chess-app-modal
│   ├── styles.css                     # Responsive 100dvh CSS Grid, bottom sheets, app bar
│   └── src/chess/
│       ├── chess_engine.js            # Authoritative FIDE chess rules engine
│       ├── chess_ui.js                # Mobile UI orchestrator, bottom navigation & sheets
│       ├── chess_view_2d.js           # 2D canvas vector board fallback & Web Audio
│       ├── chess_view_3d.js           # Three.js 3D scene, lighting, camera math, touch orbit
│       ├── chess_pbr.js               # Procedural 512x512 canvas PBR texture generator
│       ├── chess_staunton.js          # Procedural high-poly Staunton piece geometries
│       ├── chess_nn.js                # Dual-headed policy/value neural network
│       ├── chess_zobrist.js           # 64-bit BigInt Zobrist hashing & transposition table
│       ├── chess_mcts.js              # AlphaZero-style MCTS engine with PUCT
│       ├── chess_book.js              # 1,200+ position Grandmaster Opening Book
│       ├── chess_ai.js                # AI coordinator integrating NN, MCTS, and Alpha-Beta
│       └── chess_model_weights.json   # Exported baseline weights
├── server/
│   ├── chess-rooms.js                 # Authoritative ChessRoomManager, PIN rooms, clocks
│   └── server.js                      # Express/WebSocket server multiplexing packets
├── scripts/
│   └── train_chess_rl.js              # Headless self-play RL training script
├── test/
│   ├── test_chess_rules_extended.js   # Tier 1-4 FIDE rules, special moves, draw conditions
│   ├── test_chess_mobile_ui_layout.js # Tier 1-4 Mobile DOM/CSS layout & responsive viewports
│   ├── test_chess_3d_procedural_geometry.js # Tier 1-4 Procedural 3D pieces, textures, camera
│   ├── test_chess_multiplayer_sync.js # Tier 1-4 Multiplayer PIN, reconnection, clocks, spectators
│   ├── test_chess_nn_engine.js        # Tier 1-4 Neural network, MCTS, book, self-play RL loop
│   └── check_syntax.js                # Client/server syntax validation
├── TEST_INFRA.md                      # Test infrastructure & 4-tier specification (this doc)
└── TEST_READY.md                      # Publication of test readiness & coverage declaration
```

---

## 4. 4-Tier Test Design Methodology

### Tier 1: Feature Coverage (Core Requirements)
Tier 1 asserts that each feature fulfills its fundamental behavioral specification under normal operating conditions:
- **T1.1 (FIDE Legal Rules)**:
  - Initial board has exactly 20 legal moves for White (16 pawn moves, 4 knight moves).
  - Kingside (`e1-g1`) and Queenside (`e1-c1`) castling move both King and Rook into standard positions.
  - Castling is strictly disallowed when King is in check, passes through check, or lands on attacked square.
  - En passant capture captures the enemy pawn and removes it from the board.
  - En passant right is temporary and expires on the subsequent turn.
  - Pawn promotion transforms pawn to chosen piece (Q, R, B, N) upon reaching 8th rank.
  - Stalemate is detected when side to move has 0 legal moves and is NOT in check.
  - Checkmate is detected when side to move has 0 legal moves and IS in check.
  - Threefold repetition triggers draw when identical position occurs 3 times.
  - Insufficient material ($K\text{ vs }K$, $K+B\text{ vs }K$, $K+N\text{ vs }K$, same-color bishops) results in immediate draw.
- **T1.2 (Mobile UI/UX Layout)**:
  - Mobile container `#chess-app-modal` applies `100dvh` and `overflow: hidden`.
  - App bar `#chess-mobile-appbar` maintains `48px` height with back button, title, and action icons.
  - Player cards (`#chess-player-top`, `#chess-player-bottom`) occupy `44px` with avatars and Fischer clocks.
  - Bottom navigation bar `#chess-bottom-nav` maintains `56px` height with 4 tabs (`Partida`, `Jugar`, `Movimientos`, `Salas & Chat`).
  - Interactive touch buttons have minimum hit dimensions of $\ge 44 \times 44\text{px}$.
  - Modal bottom sheets slide up smoothly and display appropriate content (Play, Options, Analysis, Rooms).
- **T1.3 (Photorealistic 3D & Procedural Staunton)**:
  - `ProceduralPBRGenerator` creates non-blank 512x512 Canvas textures for Dark Walnut, Light Maple, Carrara and Marquina marble.
  - Texture normal maps compute valid Sobel gradient bumps with perturbed surface normals.
  - Procedural Staunton piece geometries (Pawn, Rook, Knight, Bishop, Queen, King) construct valid meshes with non-zero vertex counts, valid face normals, and non-empty bounding boxes.
  - Green felt pads are mounted underneath piece pedestals.
  - Aspect camera projection math dynamically recalculates camera distance $\text{dist} \propto \frac{1}{\min(1.0, \text{aspect})}$ to ensure full board visibility.
- **T1.4 (Multiplayer Synchronization)**:
  - Room creation generates 4-digit PIN and registers room in `pinToRoom`.
  - PIN-only joining matches challenger to active private room without requiring internal `roomId`.
  - Move broadcasts convey updated FEN, turn, and synchronized clocks to both players.
  - Spectators receive initial game snapshot upon joining and real-time move broadcasts without game interruption.
  - Token-based reconnection accepts valid `playerToken` within 60s, restores socket bindings, and cancels forfeit timer.
- **T1.5 (Neural Network & MCTS Engine)**:
  - Board encoder outputs contiguous `Float32Array(896)` from player perspective.
  - Neural network forward pass produces 4096 policy logits and 1 scalar value in $[-1.0, 1.0]$.
  - MCTS PUCT search evaluates tree nodes and returns highest-visited legal move.
  - Opening book correctly looks up known positions across ECO volumes A–E.
  - Headless self-play RL training loop steps through an episode and updates weights via Adam optimizer without NaN or Infinity.

---

### Tier 2: Boundary & Corner Cases
Tier 2 validates behavior under edge cases, extreme bounds, and stress inputs:
- **T2.1 (Rules Boundaries)**:
  - 50-move rule activates exactly when `halfmoveClock >= 100` without pawn moves or captures.
  - Discovered checks and absolute pins prevent pinned pieces from moving or exposing the King.
  - Multiple underpromotions (e.g., underpromoting to Knight to deliver checkmate or prevent stalemate).
  - Castling rights correctly invalidated after King or Rook moves even if they return to origin squares.
  - En passant capture with absolute pin on rank 5 (preventing illegal King exposure).
- **T2.2 (Mobile Layout Viewport Boundaries)**:
  - Layout maintains zero horizontal overflow ($W \le \text{viewport width}$) across extreme mobile dimensions:
    * Samsung Galaxy A-series / compact Android: `360x800`
    * iPhone SE / legacy viewports: `375x667`
    * Standard modern portrait: `390x844`
    * Flagship Android / Pixel / Galaxy Ultra: `412x915`
  - Safe-area inset handling (`padding-top: env(safe-area-inset-top)` and bottom inset) adapts properly without clipping navigation.
  - Touch target bounding boxes strictly maintain $\ge 44\text{px}$ width/height across all screen sizes.
- **T2.3 (3D Graphics & Memory Boundaries)**:
  - Extreme narrow aspect ratio ($0.45$) adjusts camera distance safely to avoid board clipping.
  - Extreme wide aspect ratio ($2.2$) clamps minimum distance preventing over-zoomed board.
  - Geometry buffer reuse: identical pieces share underlying buffer geometries to prevent mobile WebGL context memory leaks.
  - Canvas pixel ratio clamping to $\le 2.0$ prevents GPU fill-rate exhaustion on high-DPI screens.
- **T2.4 (Networking Boundaries & Edge Handling)**:
  - Unauthorized spectator attempts to send `chess_offer_draw`, `chess_resign`, or `chess_rematch` are rejected with descriptive error.
  - Disconnect grace timer triggers flag-fall victory for opponent if player fails to reconnect within 60 seconds.
  - Invalid or forged `playerToken` on reconnection attempt is rejected with `CHESS_MSG.ERROR`.
  - Rate limiting drops spam packets exceeding 10 moves/sec per socket without dropping socket connection.
  - Rapid room disconnects clean up matchmaking queues and room maps without memory leaks.
- **T2.5 (Neural Network & AI Numerical Stability)**:
  - Softmax policy computation uses numerical stabilization ($\max(z)$ subtraction) preventing float overflow.
  - Value head scalar output is strictly bounded to $[-1.0, 1.0]$ via hyperbolic tangent ($\tanh$).
  - Zero-division guards in MCTS PUCT formula when visit count $N(s, a) = 0$.
  - Dirichlet noise normalization guarantees probability distribution sums to 1.0.

---

### Tier 3: Cross-Feature Combinations
Tier 3 verifies seamless interaction when multiple asynchronous subsystems interact:
- **T3.1 (3D Camera Dynamic Resizing During Mobile Layout Transitions)**:
  - Opening modal bottom sheets adjusts viewport aspect ratio; 3D view triggers `setAspect()` dynamically repositioning camera distance without WebGL context loss.
- **T3.2 (Simultaneous Remote Move & Clock Sync with Animation Decoupling)**:
  - Receiving a remote `chess_move_broadcast` animates the piece via `animateRemoteMove()` without re-triggering local engine move attempts or echoing moves back to the server.
- **T3.3 (Spectator Join During Active Clock Flag-Fall Countdown)**:
  - Spectator connects midway through a rapid blitz match; receives authoritative clock snapshot and subsequent 1-second sync broadcasts without clock drift or state divergence.
- **T3.4 (Hybrid Opening Book to MCTS Engine Handover)**:
  - Engine plays first 6 plies from opening book using temperature-controlled weighted sampling, then transitions smoothly to MCTS PUCT neural evaluation on ply 7 without hesitation or frame drops.
- **T3.5 (Concurrent Multiplayer PIN Room Creation & Matchmaking Queues)**:
  - Multiple simultaneous clients create PIN rooms while other players matchmake in rapid queues; PIN indexes and FIFO queues remain segregated and thread-safe.

---

### Tier 4: Real-World Workloads & High-Fidelity Scenarios
Tier 4 tests complete, end-to-end user journeys simulating real human play and grandmaster games:
- **T4.1 (Complete Immortal Game Playthrough)**:
  - Replay Adolf Anderssen's "Immortal Game" (1851) move-by-move through the engine:
    * 23 full plies with multiple sacrifices (Bishops, Rooks, Queen).
    * Verifies accurate FEN, SAN generation, and checkmate detection at conclusion.
- **T4.2 (Mobile Portrait Touch Session Simulation)**:
  - Simulate a complete mobile user session:
    1. Launch mobile modal at 390x844.
    2. Switch camera between Angled 3D (56°), Top-Down 2.5D (84°), and Cinematic Hero (32°).
    3. Open Play bottom sheet, select Blitz 3+0, enter 4-digit PIN.
    4. Play moves via touch coordinates, promote pawn to Queen via touch sheet.
    5. Offer draw, accept draw, inspect PGN history.
- **T4.3 (Multiplayer Drop & Token Reconnection Scenario)**:
  - Simulate realistic mobile network handover (e.g. WiFi $\to$ Cellular):
    1. Player White and Player Black start live game with clocks.
    2. White makes move 1.
    3. Black client connection drops abruptly.
    4. Server starts 60s forfeit timer; informs White that opponent disconnected.
    5. Black establishes new WebSocket, sends `chess_reconnect` with saved `playerToken`.
    6. Server re-binds socket, cancels forfeit timer, sends `chess_reconnect_success`.
    7. Game resumes seamlessly, Black plays move 2.
- **T4.4 (Full Self-Play RL Episode & Analytical Backpropagation)**:
  - Execute 2 full self-play games using `ChessNN` and `ChessMCTS`:
    * Record $(s_t, \pi_t, z_t)$ trajectories across all turns.
    * Compute analytical gradients for residual blocks and dual heads.
    * Perform Adam optimizer step and verify weight divergence without NaN.
- **T4.5 (Grandmaster Opening Diversity Benchmark)**:
  - Run 50 simulated game openings:
    * Assert non-repetitive opening moves chosen across games.
    * Verify ECO classifications across Volumes A, B, C, D, and E.

---

## 5. Verification Commands

Run the full automated test suite:
```bash
npm test
```

Execute individual test suites:
```bash
# FIDE rules extended
node test/test_chess_rules_extended.js

# Mobile UI & DOM layout
node test/test_chess_mobile_ui_layout.js

# 3D procedural geometry, PBR textures & camera
node test/test_chess_3d_procedural_geometry.js

# Multiplayer networking, PIN rooms, reconnection & clocks
node test/test_chess_multiplayer_sync.js

# Neural network, MCTS, opening book & RL training
node test/test_chess_nn_engine.js
```
