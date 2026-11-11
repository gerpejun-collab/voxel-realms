# Master Implementation Plan: 200 Technical Modifications & Specifications for Grandmaster Chess

**Project**: Grandmaster Chess Comprehensive Overhaul  
**Target Codebase**: `public/src/chess/`, `public/styles.css`, `public/index.html`, `server/chess-rooms.js`, `server.js`, `scripts/`, `test/`  
**Architecture Standard**: Android Mobile Native (Chess.com / Lichess), Three.js PBR Procedural Graphics, FIDE Rules, AlphaZero-style Policy/Value Deep Learning, WebSocket Authoritative Synchronization.

---

## Part I: Native Android Mobile App-Style UI/UX & Touch Ergonomics (Specs 1–50)

### Section 1.1: Mobile Viewport Architecture & Safe Area Container
1. **Container Dimensions**: Re-anchor `#chess-app-modal` to `position: fixed; inset: 0; width: 100vw; height: 100dvh; max-height: -webkit-fill-available; overflow: hidden;` eliminating vertical page scroll.
2. **Safe Area Padding**: Apply CSS `padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px);` to the outer modal wrapper.
3. **Primary CSS Grid Layout**: Structure `.chess-app-layout` using a single-column CSS Grid: `display: grid; grid-template-rows: auto auto 1fr auto auto auto; height: 100%;`.
4. **Touch Action Disabling**: Set `touch-action: none; user-select: none; -webkit-user-select: none;` on the board container and canvases to prevent browser zoom, pull-to-refresh, or text selection during piece drag.
5. **Mobile Viewport Clamping**: Enforce media query ranges from `360px` to `430px` width ensuring zero horizontal scroll (`overflow-x: hidden; width: 100%; box-sizing: border-box;`).
6. **Dynamic 1:1 Board Arena Sizing**: Scale `.chess-canvas-container` dynamically using `width: min(calc(100vw - 16px), calc(100dvh - 280px)); height: min(calc(100vw - 16px), calc(100dvh - 280px)); margin: 0 auto;`.
7. **Orientation Lock Styling**: For landscape viewports on mobile devices (`@media (orientation: landscape) and (max-height: 500px)`), trigger a fluid side-by-side flex layout with board on the left and controls docked right.
8. **Theme Token CSS Custom Properties**: Define CSS variables `--chess-bg: #12141a; --chess-surface: #1e222d; --chess-surface-variant: #282e3d; --chess-primary: #38bdf8; --chess-accent: #f59e0b; --chess-danger: #ef4444; --chess-success: #22c55e;`.
9. **Font Hierarchy**: Declare font stack `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;` with clock numbers rendered in monospace `'Roboto Mono', monospace`.
10. **Touch Tap Highlight Removal**: Set `-webkit-tap-highlight-color: transparent;` on all interactive buttons, cards, and canvas elements.

### Section 1.2: Material 3 Compact Top App Bar
11. **App Bar Geometry**: Replace desktop `.chess-top-bar` with `.chess-mobile-appbar` having a fixed height of `48px`, horizontal flexbox alignment, and `padding: 0 12px;`.
12. **Back Navigation Button**: Implement `#chess-nav-back` with a 24x24px arrow icon button with `min-width: 44px; min-height: 44px;` hit-target compliance returning player to the main game portal.
13. **Title & Subtitle Group**: Position `.chess-appbar-title-group` with `.chess-appbar-title` (`font-size: 16px; font-weight: 700; color: #fff;`) and dynamic subtitle `#chess-game-mode-subtitle` (`font-size: 11px; color: #94a3b8;`).
14: **Action Icon Bar**: Group header actions right: `#chess-btn-toggle-view` (2D/3D pill), `#chess-btn-flip` (rotate icon), and `#chess-btn-options` (overflow settings icon).
15. **2D/3D Toggle Pill**: Format `#chess-btn-toggle-view` as a rounded pill (`border-radius: 14px; padding: 4px 10px; font-size: 12px; font-weight: 600; background: rgba(56, 189, 248, 0.15); color: #38bdf8;`).
16. **Flip Board Animation**: Apply smooth 180° rotation transform on board flip (`transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);`).
17. **Header Status Dot**: Display a 6px circular indicator inside the app bar showing socket latency/connection status (green = <50ms, amber = 50–150ms, red = disconnected).
18. **App Bar Elevation**: Apply Material 3 elevation box-shadow `0 2px 4px rgba(0, 0, 0, 0.25);` when the board or move list scrolls underneath.

### Section 1.3: Symmetric Player Info Cards & Digital Clocks
19. **Opponent Card Sizing**: Style `#chess-player-top` as a 44px high card directly above the board arena with `padding: 0 8px; margin-bottom: 4px;`.
20. **Player Card Sizing**: Style `#chess-player-bottom` as a 44px high card directly below the board arena with `padding: 0 8px; margin-top: 4px;`.
21. **Player Avatar Badges**: Add 32x32px circular avatars with status badge in bottom-right corner (green online dot for human, purple robot chip for AI).
22. **Name & Title Typography**: Display player name in bold 14px text with rating pill (e.g., `1850`) and GM/IM title badges when applicable.
23. **Captured Piece Trays**: Render inline SVG minified icons of captured enemy pieces ordered by value: `pawn(1)`, `knight(3)`, `bishop(3)`, `rook(5)`, `queen(9)`.
24. **Material Advantage Badge**: Compute material point difference $\sum V_{captured} - \sum V_{lost}$; if $>0$, display badge (e.g., `+3`) in muted white text.
25. **Fischer Digital Clock Pill**: Construct clock element `#chess-clock-top` and `#chess-clock-bottom` styled as high-contrast pills (`background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 4px 10px;`).
26. **Clock Formatting Rules**: Format clocks as `MM:SS` when time $\ge 60\text{s}$, and `SS.t` (tenths of a second) when time $< 20\text{s}$.
27. **Active Turn Indicator**: Highlight the active player's clock border with bright cyan glow (`border-color: #38bdf8; box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);`).
28. **Low-Time Pulsing Alert**: When time falls below 30s, transition clock background to pulsing dark red (`#7f1d1d`); below 10s, emit an audio beep per second on turn.

### Section 1.4: Real-time Evaluation Bar & SAN Move Ticker
29. **Vertical Evaluation Bar Layout**: Mount `#chess-eval-bar` along the board's left flank (width: 6px, height: 100%, border-radius: 3px; overflow: hidden; background: #27272a;).
30. **Eval Bar Fill Mathematics**: Calculate White territory percentage using logistic curve: $W\% = 50 + 50 \cdot (2 / (1 + e^{-0.004 \cdot ev}) - 1)$, clamped to $[3\%, 97\%]$ for non-mate evaluations.
31. **Checkmate Numeric Label**: If engine detects forced mate in $N$ moves, display `#M` or `-#M` in a floating badge on the evaluation bar.
32. **Horizontal Move Ticker Container**: Construct `#chess-move-ticker` as a single-line horizontal strip (height: 38px) directly underneath the bottom player card.
33. **SAN Auto-Scrolling**: Render consecutive SAN moves in a flex row with `overflow-x: auto; white-space: nowrap; scroll-behavior: smooth;` automatically scrolling to the latest ply.
34. **Active Ply Badge**: Style the active move with high-contrast pill styling (`background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-weight: 700; border-radius: 4px; padding: 2px 6px;`).
35. **Move Navigation Buttons**: Embed 4 navigation control buttons: First move `⏮`, Previous move `◀`, Next move `▶`, Latest move `⏭` (`width: 36px; height: 32px;`).
36. **Tactical Move Annotation Symbols**: Render standard chess symbols directly in the ticker (`!` good move, `!!` brilliant, `?` mistake, `??` blunder, `+` check, `#` checkmate).
37. **Single-Player Undo Button**: In local games against AI or self, provide a one-tap `↩ Deshacer` button in the ticker reverting one full move pair.

### Section 1.5: Docked Material 3 Bottom Navigation Bar
38. **Bottom Nav Bar Dimensions**: Dock `#chess-bottom-nav` at the viewport bottom with `height: 56px; display: flex; justify-content: space-around; background: #181b24; border-top: 1px solid #282e3d;`.
39. **4 Primary Tabs**: Provide 4 touch navigation items:
    - Tab 1: `Partida` (icon: `♟️`, label: "Partida", displays live board).
    - Tab 2: `Jugar` (icon: `⚡`, label: "Jugar", opens matchmaking & AI sheet).
    - Tab 3: `Movimientos` (icon: `📜`, label: "Análisis", opens full PGN score-sheet).
    - Tab 4: `Salas & Chat` (icon: `💬`, label: "Salas", opens lobby & chat sheet).
40. **Active Tab Indicator**: Active tab renders a rounded pill background (`background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 600;`).
41. **Touch Minimum Hit Area**: Every navigation item enforces minimum touch bounds of `48px x 48px`.
42. **Unread Message Badge**: Display a red badge with unread count on the `Salas & Chat` tab when new messages arrive.

### Section 1.6: Native-Style Slide-Up Modal Bottom Sheets
43. **Bottom Sheet Container**: Mount `#chess-bottom-sheet-container` as an overlay with `position: fixed; inset: 0; pointer-events: none; z-index: 1000;`.
44. **Backdrop Blur & Dimmer**: Active bottom sheet activates a semi-transparent touch backdrop (`background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px); pointer-events: auto;`).
45. **Slide-Up Spring Transition**: Animate bottom sheets using `transform: translateY(100%); transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);`. Active sheet sets `transform: translateY(0%);`.
46. **Top Drag Handle**: Every bottom sheet includes a rounded drag handle (`width: 36px; height: 4px; background: #475569; border-radius: 2px; margin: 8px auto 12px auto;`).
47: **Swipe-Down Dismiss Gesture**: Track touch displacement $\Delta y$ on drag handle; if pulled down $>80\text{px}$ or velocity $>0.5\text{px/ms}$, dismiss sheet smoothly.
48. **Play Bottom Sheet Content**: Houses quick-pair buttons (Bullet 1+0, Blitz 3+0, Blitz 5+3, Rapid 10+0), AI difficulty slider (Levels 1–5), and PIN private room controls.
49. **Options Bottom Sheet Content**: Houses Offer Draw, Resign, Rematch, Board Theme selector (Walnut, Marble), Camera Presets, and Sound toggles.
50. **Haptic Touch Integration**: Trigger `navigator.vibrate([15])` on standard piece drop, `navigator.vibrate([25])` on piece capture, `navigator.vibrate([40, 30, 40])` on check, and `navigator.vibrate([60, 40, 100])` on checkmate/game-over.

---

## Part II: Photorealistic 3D Board Presentation, Procedural Staunton Pieces & Studio Lighting (Specs 51–100)

### Section 2.1: Zero External Asset Procedural PBR Texture Pipeline
51. **Offscreen Canvas Texture Synthesis**: Create `ProceduralPBRGenerator` utility synthesizing 512x512 textures in memory wrapped in `THREE.CanvasTexture` with zero external image requests.
52. **Texture Filter Settings**: Configure `texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;`.
53. **Anisotropic Filtering**: Set `texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);` for crisp grazing-angle board viewing.
54. **Dark Walnut Albedo Map**: Generate concentric annual wood rings: $\text{ring}(x, y) = \sin(\sqrt{(x-x_0)^2 \cdot 0.12 + (y-y_0)^2 \cdot 1.8} + 7.5 \cdot \text{noise}(x \cdot 0.04, y \cdot 0.04))$ shaded from `#3b2314` to `#24140b`.
55. **Dark Walnut Normal Map**: Compute $3 \times 3$ Sobel filter gradient convolution over the grain heightmap to produce authentic surface pore bumps.
56. **Dark Walnut Roughness Map**: Synthesize roughness values varying between 0.24 (polished growth rings) and 0.38 (open wood pores).
57. **Light Maple Albedo Map**: Generate ivory sycamore base tone (`#faebd7` to `#f3dbb3`) modulated by curly flame chatoyancy $\text{flame}(x, y) = \sin(y \cdot 0.08 + \cos(x \cdot 0.06) \cdot 3.0)$.
58. **Light Maple Roughness Map**: Set uniform satin finish roughness of 0.28 with metalness of 0.02.
59. **Carrara Marble Albedo Map**: Implement multi-octave Fractional Brownian Motion (fBm) turbulent noise producing smoky grey and golden calcite veining over a `#f8f9fa` base.
60. **Black Marquina Marble Albedo Map**: Implement sharp fracture noise over deep obsidian `#18181b` with high-contrast white veining.
61. **Marble Clearcoat Properties**: Configure marble materials with `roughness: 0.10, metalness: 0.02, clearcoat: 0.85, clearcoatRoughness: 0.08` for a mirror diamond polish.

### Section 2.2: Luxury Board Frame, Inlays & Coordinate Markings
62. **Beveled Hardwood Frame Geometry**: Construct the outer frame as an extruded beveled polygon (outer 10.4 x 10.4, inner 9.44 x 9.44, depth 0.7 units) with a 45° chamfered edge (width 0.12 units).
63. **Inlaid Metallic Brass Stringing**: Embed a 0.03 unit wide metallic strip (`color: 0xd4af37, roughness: 0.2, metalness: 0.85`) framing the boundary between squares and outer wood.
64. **Engraved Coordinate Files**: Render algebraic files `a` through `h` centered along the North and South beveled borders using procedural canvas font rendering with gold deboss styling.
65. **Engraved Coordinate Ranks**: Render algebraic ranks `1` through `8` centered along the East and West beveled borders with matching gold deboss styling.
66. **Square Tile Geometries**: Render the 64 squares as individual `BoxGeometry(1.15, 0.10, 1.15)` instances with rounded corner vertices at a spacing of 1.18 units.
67. **Studio Pedestal Table**: Place a circular dark leather/felt table disc (`CylinderGeometry(7.5, 7.8, 0.15, 48)`) beneath the board at $y = -0.38$.
68. **Radial Contact Shadow Plane**: Place a horizontal plane mesh at $y = -0.36$ with a custom procedural radial alpha gradient texture (`rgba(0,0,0,0.65)` under center fading to 0.0 at radius 5.8) to eliminate floating board artifacts.

### Section 2.3: Procedural High-Poly Staunton Piece Geometries
69. **Standard Pedestal Profile**: Formulate a classical Staunton base profile for `THREE.LatheGeometry(points, 36)`: base rim radius 0.42, concave scotia fillet radius 0.32, and lower bead collar radius 0.36.
70. **Green Baize Felt Base Pads**: Attach an underside felt disc (`CircleGeometry(radius * 0.96, 24)`) at $y = 0.002$ with `MeshStandardMaterial({ color: 0x1b4332, roughness: 0.95 })` to every piece.
71. **Staunton Pawn Geometry**: Construct complete pawn silhouette (height 1.11 units) via 24 spline points: weighted pedestal, tapered concave waist (radius 0.15), neck ring, and spherical head (radius 0.23).
72. **Staunton Rook Geometry**: Construct rook silhouette (height 1.25 units) with solid fluted rampart stem, flared capital, and hollowed parapet rim.
73. **Rook Crenellations**: Cut 4 precision merlons and embrasures into the rook parapet using compound radial geometry sections.
74. **Staunton Bishop Geometry**: Construct bishop silhouette (height 1.68 units) with slender tapered waist, double torus bead collar, and bulbous teardrop mitre.
75. **Bishop Mitre 45° Cross-Cut**: Sculpt the authentic 45-degree angled mitre slit (width 0.035, depth 0.14) into the upper teardrop body.
76. **Bishop Brass Finial Bead**: Crown the bishop mitre with a polished golden ball (`SphereGeometry(0.06, 16, 16)`) at apex $y = 1.68$.
77. **Staunton Queen Geometry**: Construct queen silhouette (height 1.76 units) with graceful fluted torso, flared crown capital, and crenellated coronet rim.
78. **Queen 8-Pointed Coronet**: Model 8 sculpted radial scallops along the coronet rim topped with a central royal gold orb (`SphereGeometry(0.08, 16, 16)`).
79. **Staunton King Geometry**: Construct commanding king silhouette (height 1.92 units) with broad pedestal (radius 0.46), tiered regal crown capital, and arched cross mount.
80. **King Finial 3D Cross Pattée**: Construct a beveled 3D Latin cross with flared arms using `THREE.ExtrudeGeometry` with `bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015` at $y = 1.65..1.92$.
81. **Procedural Sculpted Knight Horse Bust**: Model knight torso via `THREE.ExtrudeGeometry` from an authentic 2D vector spline silhouette: arched dorsal neck curve with 3 stylized mane curls, alert triangular ears, convex forehead, and defined muzzle.
82. **Knight Extrusion & Bevel Settings**: Extrude knight shape with `depth: 0.28, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 4`.
83. **Knight Anatomical Cheek Flairs**: Merge left and right parabolic cheek plates (`SphereGeometry` scaled by `[0.6, 1.2, 0.4]`) into the extruded horse head for muscular three-dimensional presence.
84. **White Piece Boxwood PBR Material**: Shaded with ivory tone `#f8f6f0`, `roughness: 0.20, metalness: 0.03, clearcoat: 0.45, clearcoatRoughness: 0.15`.
85. **Black Piece Ebony PBR Material**: Shaded with warm deep black `#1c1917`, `roughness: 0.18, metalness: 0.04, clearcoat: 0.45, clearcoatRoughness: 0.12`.
86. **Piece Metallic Trim Material**: King cross, queen orb, and bishop finial use royal gold finish (`color: 0xd4af37, roughness: 0.22, metalness: 0.88`).

### Section 2.4: Studio Lighting, Reflections & Mobile Camera Math
87. **Procedural Studio HDR Environment Map**: Generate an offscreen equirectangular canvas (1024x512) painted with warm key lightbox (intensity 3.5, 3200K) and cool diffuse skylight, processed via `THREE.PMREMGenerator` and assigned to `scene.environment`.
88. **Warm Directional Key Light**: Position `DirectionalLight(0xfff7ed, 1.5)` at `(8, 20, 10)` targeting board center `(0, 0, 0)`.
89. **Studio Shadow Map Configuration**: Key light configures `shadow.mapSize.set(2048, 2048); shadow.camera.near = 5; shadow.camera.far = 40; shadow.camera.left = -7; shadow.camera.right = 7; shadow.camera.top = 7; shadow.camera.bottom = -7; shadow.bias = -0.0003;`.
90. **Soft Penumbra Shadow Blur**: Set `shadow.radius = 2.8` with `renderer.shadowMap.type = THREE.PCFSoftShadowMap` for smooth photorealistic contact shadows.
91. **Cool Diffuse Fill Light**: Position `DirectionalLight(0xe0f2fe, 0.65)` at `(-10, 14, -8)` ensuring ebony pieces maintain legible silhouette contrast.
92. **Low-Angle Rim Accent Light**: Position `PointLight(0xfef3c7, 0.8, 25)` at `(0, 9, -12)` highlighting the crown rims and finials from behind.
93. **Portrait Aspect-Ratio Camera Distance**: Dynamically calculate camera distance: $\text{dist} = \frac{\text{boardRadius}}{\sin(\text{fovRad} / 2)} \cdot \left(\frac{1.0}{\min(1.0, \text{aspect})}\right) \cdot 1.10$, pulling back on narrow screens (e.g., 360x800) to keep all squares and kings in view.
94. **Angled 3D View Preset**: Set pitch to 56° from horizontal at position `(0, dist * sin(56°), dist * cos(56°))` for White, mirrored for Black.
95. **Top-Down 2.5D View Preset**: Set pitch to 84° at position `(0, dist * 0.98, dist * 0.15)` for rapid tournament blitz play.
96. **Cinematic Hero View Preset**: Set pitch to 32° at position `(0, dist * sin(32°), dist * cos(32°))` for dramatic perspective and replay evaluation.
97. **Mobile 1-Finger Orbit Gesture**: 1-finger drag on background rotates azimuth $\theta$ and pitch $\phi$ with spherical damping (friction 0.92); clamp pitch $\phi \in [15^\circ, 88^\circ]$.
98. **Mobile 2-Finger Pinch Zoom**: 2-finger pinch calculates distance delta $\Delta d$ to zoom smoothly in/out, clamped to $[14, 32]$ units.
99. **Mobile Double-Tap Camera Reset**: Double-tap on empty canvas resets camera smoothly to the calibrated home preset within 300ms using spherical lerp.
100. **Mobile GPU Performance Clamping**: Clamp device pixel ratio `renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));` and share geometry buffers across identical pieces.

---

## Part III: Robust Multiplayer Synchronization, PIN Rooms & Spectator Architecture (Specs 101–150)

### Section 3.1: Protocol Envelope Standardization & Namespace Isolation
101. **Namespace Isolation Invariant**: All chess WebSocket packets must carry string type prefix `chess_` (`type.startsWith('chess_')`) to guarantee 100% zero collision with Voxel Realms room packets.
102. **Standardized Packet Envelope**: Standardize all client transmissions to `{ type: string, data: object }` matching `server/chess-rooms.js` message handler expectations.
103. **Payload Sanitization**: Server-side `ChessRoomManager.prototype.handleMessage` wraps all JSON parsing and route dispatching in `try...catch` blocks to prevent malformed packets from crashing the server process.
104. **Client Sender Helper**: Implement `ChessUI.prototype.send(type, data = {})` ensuring every outgoing message automatically wraps arguments in `{ type, data }`.
105. **Server Sender Helper**: Implement `ChessRoomManager.prototype.send(ws, type, data = {})` ensuring all outgoing broadcasts follow `{ type, data }`.
106. **Ping/Pong Heartbeat**: Client sends `{ type: 'chess_ping' }` every 15 seconds; server responds with `{ type: 'chess_pong', data: { timestamp: Date.now() } }` to track round-trip latency.
107. **Strict Packet Validation**: Validate string length of player names ($\le 24$ chars), FEN string length, and square coordinates (`/^[a-h][1-8]$/`) on server receipt.
108. **Rate Limiting**: Throttle client move transmissions to at most 10 packets per second per socket, rejecting rapid packet floods with `CHESS_MSG.ERROR`.

### Section 3.2: PIN-Based Private Rooms & Matchmaking Queues
109. **4-Digit PIN Generation**: Implement `generatePin()` in `server/chess-rooms.js` producing a random numeric string from `"1000"` to `"9999"` not currently active in `this.pinToRoom`.
110. **Server PIN Indexing Map**: Maintain `this.pinToRoom = new Map()` mapping 4-digit PIN strings directly to active `ChessRoom` instances.
111. **PIN Room Creation Route**: On `chess_create_room`, server generates PIN, creates `ChessRoom`, registers room in both `this.rooms` and `this.pinToRoom`, and responds with `CHESS_MSG.QUEUE_STATUS` containing `{ status: 'room_created', pin, roomId }`.
112. **PIN-Only Room Join Route**: On `chess_join_room`, if `data.pin` is supplied without `data.roomId`, server looks up room via `this.pinToRoom.get(data.pin)` and attaches challenger immediately.
113. **PIN Input Formatting in UI**: In the mobile bottom sheet, format PIN entry as 4 separate high-contrast input boxes with auto-focus advancing on each keystroke.
114. **Matchmaking Queues by Time Control**: Maintain separate FIFO queues for `bullet_1_0`, `blitz_3_0`, `blitz_5_3`, and `rapid_10_0`.
115. **Automatic Dequeue on Disconnect**: When a socket disconnects while queued, automatically purge that socket from all matchmaking arrays.
116. **AI Suggestion Timeout**: If a player waits in queue $>25\text{s}$, broadcast `CHESS_MSG.QUEUE_STATUS` with `{ status: 'suggest_ai', timeControl }` prompting 1-tap play against AI.

### Section 3.3: Authoritative Move Execution & Remote Animation Decoupling
117. **Decoupled Remote Move Method**: In `public/src/chess/chess_view_3d.js`, implement `animateRemoteMove(fromCoords, toCoords, fromSq, toSq)` which only interpolates the 3D piece mesh and syncs positions on complete without calling `engine.makeMove` or `onMoveAttempt`.
118. **Elimination of Move Broadcast Echo Loop**: In `public/src/chess/chess_ui.js`, route incoming `chess_move_broadcast` solely to `this.engine.makeMove` and `animateRemoteMove`, preventing the client from re-transmitting opponent moves back to the server.
119. **Server-Side Authoritative Move Validation**: In `server/chess-rooms.js`, validate incoming moves against the server's internal `ChessEngine` instance before broadcasting; reject illegal moves with `CHESS_MSG.ERROR`.
120. **Atomic Server State Updates**: Upon valid move, atomically update FEN, switch active clock, apply increment, append PGN history, and broadcast `chess_move_broadcast` with updated FEN and clocks.
121. **FEN Consistency Check**: When client receives `chess_move_broadcast`, verify that local `engine.getFen()` matches `packet.data.fen`; if diverged, trigger state recovery.
122. **Desynchronization Recovery**: On FEN mismatch, client sends `{ type: 'chess_resync_request', data: { roomId } }`; server responds with complete authoritative game snapshot.
123. **Parabolic Arc Interpolation**: Animate 3D pieces along parabolic trajectory: $y(t) = 4 \cdot h_{peak} \cdot t \cdot (1 - t)$ where $h_{peak} = 1.2$ units, duration $240\text{ms}$.
124. **Captured Piece Descent**: Animate captured pieces sinking smoothly through the board with opacity fade over $180\text{ms}$ before removal from scene.

### Section 3.4: Live Spectator Architecture & Authority Safeguards
125. **Spectator Socket Registry**: Maintain `room.spectators = new Set()` inside each `ChessRoom` instance.
126. **Spectator Join Handling**: On `chess_spectate_room`, register socket in `room.spectators` and dispatch `chess_spectate_state` containing full FEN, clock times, moves history, and player metadata.
127. **Live Move Streaming to Spectators**: Broadcast every `chess_move_broadcast` simultaneously to `room.whiteWs`, `room.blackWs`, and all sockets in `room.spectators`.
128. **Spectator Command Rejection**: In `handleOfferDraw`, `handleRespondDraw`, `handleResign`, and `handleRematch`, verify `ws === room.whiteWs || ws === room.blackWs`; if spectator, reject with error message.
129. **Spectator Count Broadcasting**: Broadcast `chess_spectator_count_update` with `{ roomId, count: room.spectators.size }` on spectator join/leave.
130. **Spectator Chat Badging**: Prepend `[Espectador]` badge and muted styling to chat messages sent by spectator sockets.
131. **Public Games Discovery**: On `chess_list_public_games`, server iterates `this.rooms`, filtering active matches with `allowSpectators: true`, returning list of `{ roomId, whiteName, blackName, timeControl, moveCount, spectatorCount }`.
132. **Spectator Clean Exit**: On `chess_leave_spectate`, remove socket from `room.spectators` without triggering game pause or player forfeit.

### Section 3.5: Token-Based Reconnection & Clock Synchronization
133. **Secret Session Token Generation**: On game start, server generates 64-bit random alphanumeric tokens `room.whiteToken = 'tok_w_' + crypto.randomBytes(8).toString('hex')` and `room.blackToken = 'tok_b_' + ...`.
134. **Token Transmission**: Send `playerToken` in `chess_game_start` to each respective client.
135. **Client Token Persistence**: Client saves `chess_active_room_id` and `chess_player_token` into browser `sessionStorage`.
136. **Disconnect Forfeit Timer**: On socket drop, server starts a 60-second grace timer (`room.disconnectTimer = setTimeout(...)`); notifies opponent via `chess_opponent_disconnected`.
137. **Reconnection Request Packet**: On socket reconnect, client transmits `{ type: 'chess_reconnect', data: { roomId, playerToken } }`.
138. **Reconnection Verification**: Server validates token against `room.whiteToken` or `room.blackToken`; cancels 60-second forfeit timer immediately.
139. **State Recovery Dispatch**: Server dispatches `chess_reconnect_success` with authoritative FEN, clock values, turn, move history, and restores socket binding.
140. **Opponent Reconnect Notification**: Server notifies opponent via `chess_opponent_reconnected` and resumes normal clock countdown.
141. **Authoritative Clock Ticking**: Server decrements active player's clock every 100ms: `room.whiteTime -= 0.1;` or `room.blackTime -= 0.1;`.
142. **Flag Fall Forfeit**: When a player's clock reaches $\le 0$, server halts clocks and terminates game via `chess_game_over` with `{ winner, reason: 'timeout' }`.
143. **Periodic Clock Sync Broadcast**: Server broadcasts `chess_clock_sync` with `{ whiteTime, blackTime }` every 5 seconds, and every 1 second when time $< 30\text{s}$.
144. **Client Clock Drift Smoothing**: Client smoothly interpolates clock display towards authoritative server times without jerky text jumps.
145. **Draw Offer Protocol**: Client sends `chess_offer_draw`; server validates player role and forwards `chess_draw_offered` to opponent; opponent responds with `chess_respond_draw` (`accept: true/false`).
146. **Resignation Protocol**: Client sends `chess_resign`; server immediately awards victory to opponent, records PGN result, and broadcasts `chess_game_over`.
147. **Rematch Protocol**: When both players send `chess_rematch_request`, server spawns new match with swapped colors.
148. **Room Garbage Collection**: Set 15-minute cleanup timer on finished rooms, clearing all timers and removing room from `this.rooms` and `this.pinToRoom`.
149. **Emergency World Reset Isolation**: Voxel world reset packets (`server_reset`) do not corrupt, terminate, or reset active chess rooms.
150. **Room Switching Sequence Invariant**: Returning to voxel world disposes chess scene cleanly before processing `SWITCH_ROOM_CONFIRM` and `INIT`.

---

## Part IV: Deep-Learning Neural Network, MCTS Search, GM Opening Book & Self-Play RL Pipeline (Specs 151–200)

### Section 4.1: Pure JavaScript Float32Array Dual-Headed Policy/Value Neural Network
151. **Zero External Dependency Rule**: Implement `ChessNN` in pure JavaScript using native `Float32Array` buffers without requiring `node-gyp`, Python, TensorFlow C++, or binary bindings.
152. **Input Tensor Planes ($8 \times 8 \times 14 = 896$ features)**:
    - 6 planes for White pieces (P, N, B, R, Q, K).
    - 6 planes for Black pieces (p, n, b, r, q, k).
    - 1 plane for active side to move (all 1s for White, all 0s for Black).
    - 1 plane for castling availability and en passant rights.
153. **Input Encoder Method**: Implement `encodeBoard(engine)` converting board state into `Float32Array(896)` in $<0.05\text{ms}$.
154. **Residual Hidden Layers**: Construct network with 2 residual blocks (hidden dimension: 192 units) with skip connections: $y = \text{LeakyReLU}(W_2 \cdot \text{LeakyReLU}(W_1 \cdot x + b_1) + b_2) + x$.
155. **LeakyReLU Activation**: Implement fast in-place LeakyReLU: $f(x) = x > 0 ? x : 0.01 \cdot x$.
156. **Policy Head Architecture**: Fully connected layer projecting 192 hidden units to 4096 output logits corresponding to from-square $\times$ to-square move combinations ($64 \times 64 = 4096$).
157. **Masked Softmax Policy Normalization**: Mask illegal moves with $-\infty$ before computing numerically stable softmax: $\pi(a) = \frac{e^{z_a - \max(z)}}{\sum_j e^{z_j - \max(z)}}$.
158. **Value Head Architecture**: Fully connected layer mapping 192 hidden units through 64-unit hidden layer with LeakyReLU to a single scalar output with $\tanh(x)$ activation, yielding $V(s) \in [-1.0, 1.0]$.
159. **Analytical Forward Pass**: Implement `forward(inputFloat32)` executing unrolled matrix-vector multiplications in pure JS achieving $>2,000$ evaluations per second per CPU core.
160. **Model Weights Format**: Serialize and deserialize weights to/from JSON with compressed base64 or array floats (`chess_model_weights.json`).
161. **Pre-Trained Baseline Weights**: Ship with pre-trained baseline weights capturing opening control, piece activity, king safety, and endgame fundamentals.

### Section 4.2: 64-Bit Zobrist Hashing & Transposition Table
162. **64-Bit Zobrist Keys Initialization**: Implement `ChessZobrist` generating pseudorandom `BigInt` 64-bit keys for $12 \text{ pieces} \times 64 \text{ squares} + 8 \text{ en passant files} + 16 \text{ castling rights} + 1 \text{ side to move}$.
163. **Incremental Zobrist Updating**: Update board hash incrementally during move execution via XOR operations: $H_{new} = H_{old} \oplus K_{\text{piece, from}} \oplus K_{\text{piece, to}}$.
164. **Transposition Table Sizing**: Allocate a fixed-size `TranspositionTable` with $2^{18}$ entries (262,144 slots) storing `{ hash, depth, score, flag, bestMove }`.
165. **Threefold Repetition Cache**: Query Zobrist history array to detect threefold repetition in $O(1)$ time during tree search.

### Section 4.3: AlphaZero-Style Monte Carlo Tree Search (MCTS) with PUCT
166. **MCTS Node Structure**: Define `MCTSNode` storing `visitCount` $N(s, a)$, `totalValue` $W(s, a)$, `meanValue` $Q(s, a) = W/N$, `prior` $P(s, a)$, and children map.
167. **PUCT Selection Formula**: Select child move maximizing:
    $$a^* = \arg\max_a \left( Q(s, a) + c_{\text{puct}} \cdot P(s, a) \cdot \frac{\sqrt{\sum_b N(s, b)}}{1 + N(s, a)} \right)$$
    with exploration constant $c_{\text{puct}} = 1.414$.
168. **Dirichlet Noise Injection**: At root node during training/self-play, inject Dirichlet noise into prior probabilities: $P(s, a) = (1 - \epsilon) \cdot P(s, a) + \epsilon \cdot \eta_a$ with $\epsilon = 0.25, \alpha = 0.3$.
169. **Tree Expansion & Neural Evaluation**: When an unvisited leaf node is reached, evaluate position using `ChessNN.forward()`, store prior probabilities $P(s, \cdot)$, and return value $V(s)$.
170. **Backpropagation Step**: Backpropagate value $V$ up the search path, updating visit counts $N \leftarrow N + 1$ and accumulating values $W \leftarrow W + V$, negating value between alternating turns.
171. **Simulation Budget Control**: Implement configurable simulation budgets: 100 simulations for Fast/Mobile mode ($<50\text{ms}$), 400 simulations for Tournament mode ($<200\text{ms}$), and 1000 simulations for Deep Analysis.
172. **Temperature-Controlled Move Selection**: Convert visit counts $N(s, a)$ to move probabilities $\pi(a) \propto N(s, a)^{1/\tau}$; use $\tau = 1.0$ for the first 10 moves (variety), transitioning to $\tau \to 0$ (argmax) for competitive play.
173. **Hybrid Alpha-Beta Fallback**: If neural network inference is disabled, provide smooth fallback to Minimax with alpha-beta pruning, quiescence search, and piece-square evaluation tables.

### Section 4.4: 1,200+ Position Grandmaster Opening Book
174. **Grandmaster Opening Book Dataset**: Construct `ChessBook` containing over 1,200 curated positions derived from master and grandmaster tournament games.
175. **ECO Volume Coverage**: Comprehensive coverage spanning all 5 ECO categories:
    - Volume A: Flank openings (English, Réti, King's Indian Attack, Bird).
    - Volume B: Semi-Open games (Sicilian Defense, French Defense, Caro-Kann, Alekhine).
    - Volume C: Open games (Ruy Lopez, Italian Game, King's Gambit, Scotch, Petroff).
    - Volume D: Closed games (Queen's Gambit, Slav Defense, Gruenfeld, Tarrasch).
    - Volume E: Indian defenses (Nimzo-Indian, King's Indian Defense, Bogo-Indian, Catalan).
176. **Fast Zobrist/FEN Indexing**: Index opening positions via canonical FEN strings and 64-bit Zobrist hashes in a compact lookup table.
177. **Opening Variety & Weighted Sampling**: For positions with multiple grandmaster moves, store popularity frequency weights and sample moves using weighted temperature distribution to prevent repetitive opening play.
178. **Opening Name Retrieval**: Return the exact opening name and ECO code (e.g., `"B90: Sicilian Defense, Najdorf Variation"`) in the search evaluation metadata.
179. **Seamless Book-to-Engine Transition**: When the game leaves known opening theory, transition seamlessly to MCTS neural search without hesitation or evaluation discontinuities.

### Section 4.5: Scripted Self-Play Reinforcement Learning Training Pipeline
180. **Headless Training Script**: Implement `scripts/train_chess_rl.js` executable via `node scripts/train_chess_rl.js [options]`.
181. **CLI Command-Line Arguments**: Support parameters `--games <N>`, `--sims <N>`, `--batch-size <N>`, `--lr <float>`, `--epochs <N>`, `--checkpoint <path>`.
182. **Self-Play Game Episode Generator**: Script runs self-play games between two instances of `ChessNN` guided by MCTS search.
183. **Episode Data Buffer**: For each move $t$, record state tensor $s_t$, MCTS search visit distribution $\pi_t$, and active player color.
184. **Game Outcome Assignment**: Upon game termination (checkmate, draw, 50-move), assign final outcome $z_t \in \{+1, -1, 0\}$ relative to player turn at step $t$.
185. **Loss Function Formulation**: Compute combined loss:
    $$L = L_{\text{value}} + L_{\text{policy}} + c_{\text{reg}} \cdot \|\theta\|^2 = (z - V(s))^2 - \sum_a \pi(a) \cdot \log(p_a) + c_{\text{reg}} \cdot \|\theta\|^2$$
186. **Analytical Backpropagation**: Implement analytical backpropagation for LeakyReLU, residual addition, and cross-entropy/MSE heads computing exact weight gradients.
187. **Adam Optimizer Implementation**: Update model weights using Adam optimizer:
    $$m_t = \beta_1 m_{t-1} + (1 - \beta_1) g_t, \quad v_t = \beta_2 v_{t-1} + (1 - \beta_2) g_t^2$$
    $$\theta_{t+1} = \theta_t - \frac{\alpha}{\sqrt{\hat{v}_t} + \epsilon} \hat{m}_t$$
    with $\alpha = 0.001, \beta_1 = 0.9, \beta_2 = 0.999, \epsilon = 10^{-8}$.
188. **Loss & Evaluation Logging**: Output epoch progress, value MSE loss, policy cross-entropy loss, and game length metrics to console and logfile.
189. **Model Checkpoint Management**: Save intermediate weights to `checkpoints/chess_weights_epoch_N.json` and automatically update `public/src/chess/chess_model_weights.json`.
190. **Self-Play Win/Loss Tracker**: Log cumulative wins for White, wins for Black, and draws across training runs.

### Section 4.6: Automated Programmatic Test Suite Specifications
191. **FIDE Rules Compliance Suite (`test/test_chess_rules_extended.js`)**: Test legal move counts from initial position (20 moves), castling through check, en passant capture timing, promotion piece selection, stalemate vs checkmate, and threefold repetition detection.
192. **Mobile UI Layout DOM Test (`test/test_chess_mobile_ui_layout.js`)**: Headless DOM verification evaluating `styles.css` across viewport dimensions (360x800, 375x667, 390x844, 412x915) verifying `overflow: hidden`, zero horizontal overflow, 48px app bar, 56px bottom nav, and 44x44px touch bounding clearance.
193. **Procedural 3D Geometry Test (`test/test_chess_3d_procedural_geometry.js`)**: Headless Three.js audit validating vertex counts, non-null face normals, non-zero bounding boxes for all 6 Staunton pieces, non-blank 512x512 procedural canvas textures, and aspect camera projection math.
194. **Multiplayer Networking Test (`test/test_chess_multiplayer_sync.js`)**: Test mock WebSocket clients for PIN room creation, PIN-only joining, move broadcasts, spectator isolation, token-based reconnection, and clock sync packets.
195. **Neural Network Forward/Backward Pass Test (`test/test_chess_nn_engine.js`)**: Test `ChessNN` forward inference output shapes ($4096$ policy logits, $1$ scalar value in $[-1, 1]$), gradient propagation, and analytical backpropagation correctness.
196. **MCTS Search Decision Test**: Verify MCTS selects winning tactical moves (e.g., Mate in 1, capturing hanging queen) within 100 simulations.
197. **Grandmaster Opening Book Diversity Test**: Verify that opening book returns distinct grandmaster moves across 50 simulated games with non-zero temperature sampling.
198. **Self-Play RL Pipeline Integration Test**: Execute 2 self-play matches in test environment, verify buffer generation, compute 1 optimization step, and assert weights update without NaN or Infinity.
199. **End-to-End Test Suite Execution (`npm test`)**: Integrate new test files into `package.json` test script ensuring 100% pass across all test suites.
200. **Production Integrity & Zero Cheating Invariant**: Verify that all piece models, textures, AI logic, and tests are genuinely computed without hardcoding test answers, dummy facades, or external network dependencies.
