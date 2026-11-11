# Project: Grandmaster Chess Overhaul — Mobile UI/UX, Photorealistic 3D, Robust Multiplayer & Deep-Learning RL Engine

## Architecture

- **Client Presentation & UI Layer (`public/src/chess/`)**:
  - `chess_ui.js`: Mobile-first UI orchestrator, 100dvh CSS Grid container, 48px Material 3 App Bar, symmetric player cards with live Fischer clocks, real-time vertical evaluation bar, 1-line horizontal SAN move ticker, 56px 4-tab docked Bottom Navigation Bar, modal slide-up Bottom Sheets (Play, Options, Analysis, Rooms), touch promotion sheet, and haptic feedback.
  - `chess_view_3d.js`: Three.js photorealistic 3D board scene, dynamic aspect-ratio camera auto-framing (360x800 to 412x915), 3 camera presets, multi-touch gesture engine (1-finger drag orbit, 2-finger pinch zoom, double-tap reset), studio 3-point lighting rig with 2048x2048 soft shadows, procedural HDR environment reflections via PMREM, and decoupled remote move animation.
  - `chess_view_2d.js`: High-DPI 2D canvas vector board fallback, procedural Web Audio synthesizer (`ChessAudio`), touch drag-and-drop piece manipulation, last-move and legal-move highlight indicators.
  - `chess_pbr.js`: Algorithmic procedural PBR texture synthesis (Dark Walnut wood, Light Maple wood, Carrara & Black Marquina Marble) generating 512x512 Canvas textures (albedo, Sobel normal bump, roughness maps) with zero external downloaded image assets.
  - `chess_staunton.js`: Procedural high-poly Staunton 3D piece factory using `THREE.LatheGeometry` (36 radial segments) for Pawn, Rook (crenellated parapet), Bishop (45° cross-cut mitre), Queen (8-point coronet + orb), King (regal tiered capital + cross pattée), and `THREE.ExtrudeGeometry` for the sculpted Knight horse bust with green felt base pads and clearcoat finishes.
  - `styles.css`: 100dvh portrait CSS grid rules, safe-area padding (`env(safe-area-inset-*)`), bottom sheet transforms, 48x48px touch clearance, and fluid responsive media queries.

- **Game Logic, AI & Machine Learning Layer (`public/src/chess/` & `scripts/`)**:
  - `chess_engine.js`: Pure FIDE chess logic (move generation, castling, en passant, promotion, check, checkmate, stalemate, threefold repetition, 50-move rule, insufficient material, PGN/FEN parsing & export).
  - `chess_nn.js`: Pure JavaScript `Float32Array` dual-headed Policy/Value Neural Network ($896$ inputs, residual hidden layers, LeakyReLU, 4096-output policy head with softmax, scalar value head in $[-1, 1]$ with tanh).
  - `chess_zobrist.js`: 64-bit Zobrist hashing for board transposition caching and 3-fold repetition detection.
  - `chess_mcts.js`: Monte Carlo Tree Search with PUCT formula combining neural policy priors and neural value evaluation for deep strategic search.
  - `chess_book.js`: 1,822 position Grandmaster Opening Book covering ECO volumes A through E with temperature-controlled non-repetitive move sampling.
  - `chess_model_weights.json`: Exported pre-trained neural network weights.
  - `scripts/train_chess_rl.js`: Headless self-play reinforcement learning script generating self-play games, computing policy/value loss gradients via analytical backprop, and updating weights via Adam optimizer.

- **Multiplayer Networking & Server Infrastructure (`server/`)**:
  - `server.js`: HTTP/WebSocket server multiplexing voxel packets and `chess_*` packets with strict segregation.
  - `server/chess-rooms.js`: Dedicated `ChessRoomManager` and `ChessRoom` instances supporting matchmaking queues, 4-digit PIN private rooms, live spectator broadcasting, spectator count updates, spectator command authority guards, session-token reconnection (`playerToken`, `chess_reconnect`), and authoritative Fischer clock synchronization.

- **Automated Verification & Test Suites (`test/`)**:
  - `test/test_chess_rules_extended.js`: FIDE rules, special moves, draw conditions, PGN/FEN validation.
  - `test/test_chess_mobile_ui_layout.js`: Mobile DOM/CSS layout validation across 360x800, 375x667, 390x844, 412x915 viewports, zero horizontal overflow, bottom nav docking, bottom sheet states.
  - `test/test_chess_3d_procedural_geometry.js`: Staunton piece vertex counts, normals, bounding boxes, procedural PBR texture generation, aspect camera projection math.
  - `test/test_chess_multiplayer_sync.js`: PIN matchmaking, move broadcasts, spectator isolation, token reconnection, clock synchronization packets.
  - `test/test_chess_nn.js` & `test/test_chess_rl.js`: Neural network forward/backward inference, MCTS search decisions, opening book diversity, self-play RL training loop execution.

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 200-Specification Master Implementation Plan Artifact | Exactly 200 numbered modifications and technical specifications covering UI/UX, 3D graphics, multiplayer sync, and the AI pipeline. | M1 | Request R1 |
| 2 | 100dvh Portrait Grid & Safe Area Enclosure | CSS Grid container with `env(safe-area-inset-*)` eliminating vertical scrolling and viewport bouncing on mobile. | M1 | UI/3D Survey |
| 3 | Material 3 Compact 48px Android App Bar | Back arrow, game title, mode subtitle chip, and compact icon actions (2D/3D toggle, flip, options) without text clipping. | M1 | UI/3D Survey |
| 4 | Symmetric Opponent & Player Info Cards | 44px player cards with avatar, status badge, live captured piece tray, material advantage diff counter (+3), and Fischer clock pill. | M1 | UI/3D Survey |
| 5 | Real-time Vertical Evaluation Bar | 6px wide vertical eval bar adjacent to board indicating centipawn advantage (+5.0 to -5.0) via smooth sigmoid transition. | M1 | UI/3D Survey |
| 6 | 1-Line SAN Move Ticker & Traversal Controls | Horizontal auto-scrolling SAN notation strip with `⏮`, `◀`, `▶`, `⏭`, and local undo `↩` buttons. | M1 | UI/3D Survey |
| 7 | Docked 56px 4-Tab Bottom Navigation Bar | Fixed bottom navigation bar with Partida, Jugar, Movimientos, and Salas & Chat tabs with active indicator pills. | M1 | UI/3D Survey |
| 8 | Native-Style Slide-Up Modal Bottom Sheets | 4 sliding bottom sheets (Play, Options, Analysis/PGN, Rooms/Chat) with touch backdrop, spring transitions, and swipe-down dismiss. | M1 | UI/3D Survey |
| 9 | Mobile Touch Promotion Floating Sheet | Inline 52x52px circular touch buttons (Queen, Knight, Rook, Bishop) positioned directly above the promotion file. | M1 | UI/3D Survey |
| 10 | Tactile Haptic Touch Feedback | `navigator.vibrate` haptic pulses on piece movement, captures, checks, and game over. | M1 | UI/3D Survey |
| 11 | Procedural Dark Walnut PBR Material | Offscreen Canvas 512x512 synthesis of growth rings, micro-grain streaks, Sobel normal bump map, and clearcoat gloss. | M2 | UI/3D Survey |
| 12 | Procedural Light Maple PBR Material | 512x512 synthesis of golden sycamore ivory base, curly flame chatoyancy, and satin finish. | M2 | UI/3D Survey |
| 13 | Procedural Carrara & Marquina Marble PBR | Multi-octave Fractional Brownian Motion (fBm) turbulent veining with diamond polish clearcoat. | M2 | UI/3D Survey |
| 14 | Luxury Hardwood Board Frame & Coordinate Engraving | Beveled outer frame with 45° chamfers, inlaid metallic brass stringing, and screen-printed rank/file coordinates. | M2 | UI/3D Survey |
| 15 | Studio Pedestal & Contact Shadow Grounding Plane | Circular dark leather table pedestal and radial alpha contact shadow mesh eliminating floating board artifact. | M2 | UI/3D Survey |
| 16 | Procedural High-Poly Staunton Lathe Geometries | `THREE.LatheGeometry` (36 radial segments) for Pawn, Rook (crenellated parapet), Bishop (45° cross-cut mitre), Queen (8-pointed coronet + orb), King (tiered regal capital + cross pattée). | M2 | UI/3D Survey |
| 17 | Procedural Sculpted Staunton Knight Horse Bust | `THREE.ExtrudeGeometry` horse bust sculpted from 2D vector silhouette with arched neck, mane curls, muzzle, and cheek flairs. | M2 | UI/3D Survey |
| 18 | Green Baize Felt Pads & Luxury Finishes | Underside green felt baize pad disc on every piece; aged boxwood/ivory and ebony clearcoat finishes with royal gold finials. | M2 | UI/3D Survey |
| 19 | Procedural Studio HDR Environment Map (IBL) | `THREE.PMREMGenerator` equirectangular studio lightboxes delivering realistic metallic and clearcoat reflections. | M2 | UI/3D Survey |
| 20 | Calibrated 3-Point Studio Lighting Rig | Key light with 2048x2048 PCF soft shadows and penumbra radius, cool fill light, and low-angle rim accent light. | M2 | UI/3D Survey |
| 21 | Mobile Portrait Auto-Framing Camera Math | Dynamic camera distance calculated from viewport aspect ratio ($\text{dist} \propto 1/\text{aspect}$) fitting all squares and King finials within 360x800 to 412x915 viewports. | M2 | UI/3D Survey |
| 22 | Ergonomic 3 Camera View Presets | One-tap camera angle switching: Dynamic Angled 3D (56°), Top-Down 2.5D (84°), and Cinematic Hero View (32°). | M2 | UI/3D Survey |
| 23 | Mobile Multi-Touch Gesture Orbit Engine | 1-finger drag orbit with spherical inertia damping, 2-finger pinch zoom, 2-finger rotate, and double-tap reset. | M2 | UI/3D Survey |
| 24 | Client-Server Packet Protocol Standardization | Align all client transmissions to `{ type, data: { ... } }` matching `server/chess-rooms.js` message types. | M3 | Net Survey |
| 25 | Decoupled 3D Remote Move Animation | Decouple `animateRemoteMove` from local move triggers to prevent recursive move broadcast echo loops. | M3 | Net Survey |
| 26 | 4-Digit PIN Private Rooms & Indexing | Automatic 4-digit PIN generation, `pinToRoom` server indexing map, and PIN-only room joining without requiring `roomId`. | M3 | Net Survey |
| 27 | Robust Matchmaking Queue & AI Suggestion | FIFO matchmaking queues by time control, heartbeat cancellation on disconnect, and auto-suggest AI match after 25s wait. | M3 | Net Survey |
| 28 | Live Spectator View & Real-Time Sync | `chess_spectate_room`, full board state push, real-time move streaming, and live spectator count broadcasting. | M3 | Net Survey |
| 29 | Spectator Authority & Security Guard | Reject non-player sockets from draw, resign, and rematch requests; badge spectator chat messages. | M3 | Net Survey |
| 30 | Session-Token Reconnection Architecture | Issue `playerToken` in `chess_game_start`, store in client `sessionStorage`, and handle `chess_reconnect` without forfeit or duplicate entities. | M3 | Net Survey |
| 31 | Authoritative Clock Synchronization Protocol | 5-second periodic and 1-second low-time clock sync broadcasts with smooth client interpolation. | M3 | Net Survey |
| 32 | Pure JS Float32Array Dual-Headed Policy/Value Neural Network | 896 input features ($8 \times 8 \times 14$ planes), residual hidden layers, LeakyReLU, 4096-output policy head (softmax), scalar value head in $[-1, 1]$ (tanh) with zero native dependencies. | M4 | AI Survey |
| 33 | 64-Bit Zobrist Hashing Transposition Cache | Fast 64-bit Zobrist key generator for board state caching and repetition detection. | M4 | AI Survey |
| 34 | AlphaZero-Style MCTS with PUCT Search | Monte Carlo Tree Search engine balancing neural prior probabilities and neural value estimates. | M4 | AI Survey |
| 35 | 1,200+ Position Grandmaster Opening Book | Comprehensive opening book indexed by Zobrist/FEN covering ECO volumes A-E with temperature-controlled weighted sampling. | M4 | AI Survey |
| 36 | Headless Self-Play Reinforcement Learning Pipeline | `scripts/train_chess_rl.js` executing self-play games, tracking outcomes, computing analytical backpropagation gradients, and updating weights via Adam optimizer. | M4 | AI Survey |
| 37 | Pre-Trained Baseline Weights Persistence | Shipping `public/src/chess/chess_model_weights.json` for immediate high-level play without initial training delays. | M4 | AI Survey |
| 38 | Comprehensive Automated Test Suite (Tiers 1-4) | Automated Node.js test suites validating FIDE rules, mobile UI layout, 3D procedural geometry, multiplayer networking, and AI neural engine. | M5 | Testing Track |
| 39 | Adversarial Coverage Hardening & Forensic Integrity Audit | White-box adversarial testing (Tier 5) exposing edge cases and complete forensic audit verification. | M5 | Final Acceptance |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Native Android Mobile App UI/UX & Responsive Layout | `public/src/chess/chess_ui.js`, `public/styles.css`, `public/index.html`, `CHESS_200_SPEC_PLAN.md` | none | DONE (worker_chess_ui verified) |
| M2 | Photorealistic 3D Board Presentation & Procedural Staunton Pieces | `public/src/chess/chess_pbr.js`, `public/src/chess/chess_staunton.js`, `public/src/chess/chess_view_3d.js` | none | DONE (worker_chess_3d verified) |
| M3 | Robust Multiplayer Synchronization, PIN Rooms & Spectator Architecture | `server/chess-rooms.js`, `public/src/chess/chess_ui.js`, `public/src/chess/chess_view_3d.js` | none | DONE (worker_chess_net verified) |
| M4 | Deep-Learning Neural Network, MCTS Search & Self-Play RL Engine | `public/src/chess/chess_nn.js`, `public/src/chess/chess_zobrist.js`, `public/src/chess/chess_mcts.js`, `public/src/chess/chess_book.js`, `public/src/chess/chess_ai.js`, `public/src/chess/chess_model_weights.json`, `scripts/train_chess_rl.js` | none | DONE (worker_chess_ai verified) |
| M5 | E2E Testing Track, 100% Test Pass & Adversarial Hardening | `test/test_chess_rules_extended.js`, `test/test_chess_mobile_ui_layout.js`, `test/test_chess_3d_procedural_geometry.js`, `test/test_chess_multiplayer_sync.js`, `test/test_chess_nn.js`, `TEST_INFRA.md`, `TEST_READY.md` | M1, M2, M3, M4 | DONE (Verified: 2 Reviewers APPROVE, 2 Challengers APPROVE, Forensic Auditor CLEAN) |

---

## Interface Contracts

### M1 ↔ M2: UI/UX & 3D Board View Contract
- `ChessView3D.prototype.setAspect(width, height)`: Calculates aspect ratio, updates camera distance via aspect math, and re-renders without horizontal clipping.
- `ChessView3D.prototype.setCameraPreset(presetName)`: Supports `'angled'`, `'topdown'`, `'cinematic'`.
- `ChessView3D.prototype.setTheme(themeName)`: Dynamically swaps procedural PBR materials (`'walnut_maple'`, `'carrara_marquina'`).
- `ChessView3D.prototype.animateRemoteMove(fromCoords, toCoords, fromSq, toSq)`: Smooth parabolic piece animation for remote moves without re-triggering local engine move attempts or network broadcasts.

### M1 ↔ M3: UI/UX & Multiplayer Network Contract
- All client WebSocket transmissions use standardized envelope: `{ type: string, data: object }`.
- `chess_join_queue`: `{ type: 'chess_join_queue', data: { name, timeControl } }`.
- `chess_create_room`: `{ type: 'chess_create_room', data: { pin, timeControl, preferredColor } }`.
- `chess_join_room`: `{ type: 'chess_join_room', data: { pin, name } }`.
- `chess_move`: `{ type: 'chess_move', data: { from, to, promotion } }`.
- `chess_reconnect`: `{ type: 'chess_reconnect', data: { roomId, playerToken } }`.

### M3 ↔ M4: Server/Client Rooms & Chess AI Engine Contract
- `ChessAI.prototype.findBestMove(engine, options)`: Returns `{ bestMove: { from, to, promotion }, evaluation, depth, nodes, pv, bookMove }`.
- `ChessBook.prototype.lookup(fen)`: Returns `{ move: { from, to, promotion }, name, eco }` or `null`.
- `ChessNN.prototype.forward(boardPlanes)`: Returns `{ policy: Float32Array(4096), value: number }`.

---

## Code Layout

- `public/src/chess/chess_ui.js`: Mobile layout orchestrator, app bar, player cards, evaluation bar, move ticker, bottom navigation, bottom sheets.
- `public/src/chess/chess_pbr.js`: Procedural canvas texture generator for walnut, maple, and marble PBR materials.
- `public/src/chess/chess_staunton.js`: Procedural Staunton 3D piece geometries (LatheGeometry + ExtrudeGeometry).
- `public/src/chess/chess_view_3d.js`: Three.js 3D board scene, lighting, shadows, camera presets, touch gestures.
- `public/src/chess/chess_view_2d.js`: 2D canvas vector board and Web Audio sound synthesizer.
- `public/src/chess/chess_engine.js`: Full FIDE rules engine.
- `public/src/chess/chess_nn.js`: Dual-headed policy/value neural network.
- `public/src/chess/chess_zobrist.js`: 64-bit Zobrist hashing.
- `public/src/chess/chess_mcts.js`: MCTS search engine with PUCT formula.
- `public/src/chess/chess_book.js`: 1,822 position Grandmaster opening book.
- `public/src/chess/chess_model_weights.json`: Pre-trained neural network weights.
- `scripts/train_chess_rl.js`: Headless self-play reinforcement learning training script.
- `server/chess-rooms.js`: Multiplayer rooms, PIN matchmaking, spectator streaming, token reconnection, clock sync.
- `public/styles.css`: CSS styles for mobile layout, bottom navigation, and bottom sheets.
- `test/`: Automated test suites.
