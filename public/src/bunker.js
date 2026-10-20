// public/src/bunker.js
// Mega Underground Bunker & 180 Surface Missile Silo Complex (MOBILE-FIRST)
// Features:
// - Subterranean strategic command center carved beneath a colossal mountain at (-500, 300)
// - Built with airplane hangar materials (dark slate reinforced steel, titanium blast doors, hazard stripes)
// - Biometric forcefield entrance permitting ONLY main admin jsieiragerpe@gmail.com
// - 180 surface missile silos flush with terrain at Y=24; hatches are ALWAYS closed and swing open only on launch
// - Colossal Silo Missiles (2X power, radius 18m, multi-colored thruster flames, heavy smoke contrails)
// - Command center screens: live player telemetry, tactical radar, 3 REAL camera feeds (silo field, launch cam, missile chase cam)
// - Touch-first HUD: on-screen buttons to enter/exit the bunker, open the command console and fire the blue interceptor
// - Console: tap a player OR any point of the world map, choose 1..180 missiles, choose flame color, LAUNCH.
//   The server fires them in PAIRS of 2 with 3 seconds between pairs; each missile leaves its own silo.
// - When inside the bunker: incoming missiles cannot reach admin, the automatic Iron Dome is OFF, and defense is
//   100% manual via the blue interceptor button (1 direct kinetic interceptor per press)

import * as THREE from 'three';

export const BUNKER_BOUNDS = {
  minX: -565,
  maxX: -435,
  minZ: 235,
  maxZ: 365,
  minY: 0,
  maxY: 85
};

export const BUNKER_INTERIOR_BOUNDS = {
  minX: -520,
  maxX: -480,
  minZ: 280,
  maxZ: 320,
  minY: 8,
  maxY: 22
};

export function isInsideBunker(x, y, z) {
  if (typeof x !== 'number' || typeof z !== 'number') return false;
  const inY = (typeof y === 'number') ? (y >= BUNKER_BOUNDS.minY && y <= BUNKER_BOUNDS.maxY) : true;
  return x >= BUNKER_BOUNDS.minX && x <= BUNKER_BOUNDS.maxX &&
         z >= BUNKER_BOUNDS.minZ && z <= BUNKER_BOUNDS.maxZ &&
         inY;
}

export function isInsideBunkerInterior(x, y, z) {
  if (typeof x !== 'number' || typeof z !== 'number') return false;
  const inY = (typeof y === 'number') ? (y >= BUNKER_INTERIOR_BOUNDS.minY && y <= BUNKER_INTERIOR_BOUNDS.maxY) : true;
  return x >= BUNKER_INTERIOR_BOUNDS.minX && x <= BUNKER_INTERIOR_BOUNDS.maxX &&
         z >= BUNKER_INTERIOR_BOUNDS.minZ && z <= BUNKER_INTERIOR_BOUNDS.maxZ &&
         inY;
}

/**
 * 3 Concentric Rings of silos: 40 + 60 + 80 = 180 silos
 * (layout MUST match server/protocol.js siloPosition() and world.js shaft carving)
 */
export const SILO_RINGS = [
  { radius: 36, count: 40 },
  { radius: 48, count: 60 },
  { radius: 60, count: 80 }
];
export const SILO_COUNT = 180;

export function siloPosition(index) {
  let idx = ((index % SILO_COUNT) + SILO_COUNT) % SILO_COUNT;
  for (const ring of SILO_RINGS) {
    if (idx < ring.count) {
      const angle = (idx / ring.count) * Math.PI * 2;
      return [
        Math.floor(-500 + Math.cos(angle) * ring.radius) + 0.5,
        24,
        Math.floor(300 + Math.sin(angle) * ring.radius) + 0.5
      ];
    }
    idx -= ring.count;
  }
  return [-500, 24, 300];
}

// Colossal silo missile spec (2X power => radius 18m)
export const SILO_MISSILE_SPEC = {
  power: 8,
  isSiloMissile: true,
  pairSize: 2,
  pairIntervalSec: 3
};

const MAP_RANGE = 650; // world map covers X,Z in [-650, +650]

const MAP_LANDMARKS = [
  { name: 'Plaza', icon: '🏰', x: 0, z: 0 },
  { name: 'Japón', icon: '⛩️', x: 250, z: 250 },
  { name: 'China', icon: '🏮', x: -250, z: 250 },
  { name: 'París', icon: '🗼', x: 250, z: -250 },
  { name: 'N. York', icon: '🗽', x: -250, z: -250 },
  { name: 'Noruega', icon: '🏔️', x: 0, z: 500 },
  { name: 'Playa', icon: '🏖️', x: 0, z: -500 },
  { name: 'Fuji', icon: '🗻', x: 500, z: 500 },
  { name: 'Circuito', icon: '🏎️', x: -500, z: -500 },
  { name: 'Base Militar', icon: '🎖️', x: -420, z: 150 }
];

export class BunkerManager {
  constructor(scene, particleManager, world, sound, multiplayer, missileManager, renderer = null) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.world = world;
    this.sound = sound;
    this.multiplayer = multiplayer;
    this.missileManager = missileManager;
    this.renderer = renderer;
    this.physics = null; // injected from main.js
    this.controls = null; // injected from main.js

    this.center = new THREE.Vector3(-500, 12, 300);
    this.surfaceCenter = new THREE.Vector3(-500, 24, 300);
    this.silos = [];

    this.group = new THREE.Group();
    if (this.scene && typeof this.scene.add === 'function') {
      this.scene.add(this.group);
    }

    // Flame color palette options
    this.flameColors = [
      { name: 'Fuego Clásico', hex: 0xff6600, label: '🔥 Clásico' },
      { name: 'Azul Eléctrico', hex: 0x00f0ff, label: '⚡ Cian' },
      { name: 'Plasma Púrpura', hex: 0xa855f7, label: '🟣 Plasma' },
      { name: 'Verde Esmeralda', hex: 0x10b981, label: '🟢 Láser' },
      { name: 'Carmesí Radioactivo', hex: 0xef4444, label: '🔴 Carmesí' }
    ];
    this.selectedFlameColor = 0xff6600;

    // Console state
    this.selectedCount = 2;
    this.selection = null; // { type: 'player'|'point', playerId, name, x, z }
    this.salvo = null; // { total, launched, startedAt }
    this.lastLaunchSilo = -1;
    this.lastLaunchTime = 0;
    this.playerInside = false;
    this.timeAcc = 0;
    this.cctvTimer = 0;
    this.cctvIndex = 0;
    this.screenTimer = 0;
    this.modalTimer = 0;
    this.lastInterceptorTime = 0;
    this.hudState = '';

    this.buildSurfaceSilos();
    this.buildCommandCenterInterior();
    this.initCctvRenderer();
    this.injectStyles();
    this.initBunkerUI();
    this.initBunkerHUD();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  isMainAdminPlayer() {
    const m = this.multiplayer;
    if (!m) return false;
    const em = String(m.myEmail || '').toLowerCase();
    const nm = String(m.myName || '').toLowerCase();
    return em === 'jsieiragerpe@gmail.com' || nm === 'jsieiragerpe' || nm === 'jsieiragerpe@gmail.com';
  }

  notify(text) {
    const m = this.multiplayer;
    if (m && typeof m.onNotification === 'function') {
      m.onNotification(text);
    } else if (m && typeof m.showNotification === 'function') {
      m.showNotification(text);
    }
  }

  createDynamicCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    return { width: w, height: h, getContext: () => null };
  }

  makeCanvasTexture(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Returns list of {id,name,pos} of every OTHER connected player */
  getPlayersList() {
    const list = [];
    const dir = this.multiplayer?.playerDirectory;
    const myId = this.multiplayer?.myId;
    if (dir) {
      for (const p of dir.values()) {
        if (!p || p.id === myId || p.isDisconnected) continue;
        const pos = Array.isArray(p.pos) ? p.pos : [0, 25, 0];
        list.push({ id: p.id, name: p.name || 'Jugador', pos });
      }
    }
    return list;
  }

  /** Current world target {x,y,z,name} for the selection (live for players) */
  resolveSelection() {
    const s = this.selection;
    if (!s) return null;
    if (s.type === 'player') {
      const p = this.getPlayersList().find(q => q.id === s.playerId);
      if (p) return { x: p.pos[0], y: p.pos[1], z: p.pos[2], name: p.name };
      return null;
    }
    let y = 25;
    if (this.world && typeof this.world.getHeightAt === 'function') {
      try { y = this.world.getHeightAt(Math.floor(s.x), Math.floor(s.z)) + 1; } catch (e) { /* keep default */ }
    }
    return { x: s.x, y, z: s.z, name: s.name };
  }

  teleportPlayer(x, y, z, yaw = 0) {
    if (this.world && typeof this.world.updateStreaming === 'function') {
      this.world.updateStreaming(x, z);
    }
    if (this.physics && typeof this.physics.teleport === 'function') {
      this.physics.teleport(x, y, z);
    }
    if (this.controls) {
      this.controls.yaw = yaw;
      this.controls.pitch = 0;
    }
  }

  enterBunker() {
    if (!this.isMainAdminPlayer()) return;
    // Enter through the blast door side (+Z), facing the screen wall (-Z)
    this.teleportPlayer(-500, 11, 316, 0);
    this.notify('🛡️ Acceso biométrico concedido: bienvenido al Centro de Mando, jsieiragerpe.');
  }

  exitBunker() {
    this.toggleBunkerHUD(false);
    // Clear spot between silo rings (R=42, 45deg)
    this.teleportPlayer(-470.3, 26, 329.7, Math.PI * 0.75);
    this.notify('🚪 Has salido del búnker. Cúpula de Hierro automática reactivada.');
  }

  // ---------------------------------------------------------------------------
  // Surface silos (always covered; hatch swings open only when launching)
  // ---------------------------------------------------------------------------

  buildSurfaceSilos() {
    this.silos = [];

    // Shared hazard-striped hatch material (one texture for all 180 hatches)
    const hz = this.createDynamicCanvas(128, 128);
    const hctx = hz.getContext ? hz.getContext('2d') : null;
    if (hctx) {
      hctx.fillStyle = '#475569';
      hctx.fillRect(0, 0, 128, 128);
      hctx.fillStyle = '#334155';
      hctx.fillRect(6, 6, 116, 116);
      hctx.fillStyle = '#facc15';
      hctx.globalAlpha = 0.9;
      for (let i = -128; i < 128; i += 32) {
        hctx.beginPath();
        hctx.moveTo(i, 128);
        hctx.lineTo(i + 16, 128);
        hctx.lineTo(i + 144, 0);
        hctx.lineTo(i + 128, 0);
        hctx.closePath();
        hctx.fill();
      }
      hctx.globalAlpha = 1;
      hctx.strokeStyle = '#0f172a';
      hctx.lineWidth = 6;
      hctx.strokeRect(3, 3, 122, 122);
    }
    const hatchTex = this.makeCanvasTexture(hz);
    const hatchMat = new THREE.MeshStandardMaterial({ map: hatchTex, roughness: 0.5, metalness: 0.8 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.9 });
    const hatchGeom = new THREE.BoxGeometry(3.0, 0.16, 3.0);
    hatchGeom.translate(0, 0.08, 1.5);

    // Static frames (4 bars per silo) in ONE instanced draw call
    const barGeom = new THREE.BoxGeometry(1, 0.1, 1);
    const frames = new THREE.InstancedMesh(barGeom, frameMat, SILO_COUNT * 4);
    const dummy = new THREE.Object3D();
    let fi = 0;

    for (let i = 0; i < SILO_COUNT; i++) {
      const sp = siloPosition(i);

      // Frame around the 3x3 shaft
      const bars = [
        [0, -1.7, 3.8, 0.4],
        [0, 1.7, 3.8, 0.4],
        [-1.7, 0, 0.4, 3.0],
        [1.7, 0, 0.4, 3.0]
      ];
      for (const b of bars) {
        dummy.position.set(sp[0] + b[0], sp[1] + 0.05, sp[2] + b[1]);
        dummy.scale.set(b[2], 1, b[3]);
        dummy.updateMatrix();
        frames.setMatrixAt(fi++, dummy.matrix);
      }

      // Animated hatch (hinged on its north edge, swings up when launching)
      const hatchPivot = new THREE.Group();
      hatchPivot.position.set(sp[0], sp[1] + 0.02, sp[2] - 1.5);
      const hatchMesh = new THREE.Mesh(hatchGeom, hatchMat);
      hatchPivot.add(hatchMesh);
      this.group.add(hatchPivot);

      this.silos.push({
        index: i,
        pos: new THREE.Vector3(sp[0], sp[1], sp[2]),
        hatchPivot,
        isOpen: false,
        openProgress: 0.0,
        targetProgress: 0.0,
        isLaunching: false,
        openTimer: 0,
        smokeTimer: 0
      });
    }
    frames.instanceMatrix.needsUpdate = true;
    this.group.add(frames);
  }

  // ---------------------------------------------------------------------------
  // Command center interior (bright, big, readable screens)
  // ---------------------------------------------------------------------------

  makeTiledTexture(drawFn, size, repX, repY) {
    const c = this.createDynamicCanvas(size, size);
    const ctx = c.getContext ? c.getContext('2d') : null;
    if (ctx) drawFn(ctx, size);
    const tex = this.makeCanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    return tex;
  }

  makeLabelMesh(text, w, color = '#38bdf8') {
    const c = this.createDynamicCanvas(512, 64);
    const ctx = c.getContext ? c.getContext('2d') : null;
    if (ctx) {
      ctx.fillStyle = 'rgba(2,8,14,0.85)';
      ctx.fillRect(0, 0, 512, 64);
      ctx.fillStyle = color;
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 34);
    }
    const mat = new THREE.MeshBasicMaterial({ map: this.makeCanvasTexture(c), toneMapped: false });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), mat);
  }

  buildCommandCenterInterior() {
    const g = new THREE.Group();
    g.position.copy(this.center);

    const FLOOR = -1.97; // voxel floor top at world Y=10
    const CEIL = 8.95; // world Y=20.95
    const HALF = 19.6;
    const WALL_H = CEIL - FLOOR;
    const MID_Y = (CEIL + FLOOR) / 2;

    const plateTex = this.makeTiledTexture((ctx, s) => {
      ctx.fillStyle = '#2b3542';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#4b5a6e';
      ctx.lineWidth = 3;
      for (let i = 0; i < s; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 32, 32); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i + 32, 0); ctx.lineTo(i, 32); ctx.stroke();
      }
      ctx.strokeStyle = '#0b1118';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, s, s);
    }, 128, 16, 16);
    const floorMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.55, metalness: 0.6 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR;
    g.add(floor);

    const makePanelMat = (rx, ry) => new THREE.MeshStandardMaterial({
      map: this.makeTiledTexture((ctx, s) => {
        ctx.fillStyle = '#3a4757';
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#2c3744';
        ctx.fillRect(6, 6, s - 12, s - 12);
        ctx.fillStyle = '#6b7c93';
        [[14, 14], [s - 14, 14], [14, s - 14], [s - 14, s - 14]].forEach(([x, y]) => {
          ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        });
      }, 128, rx, ry),
      roughness: 0.6,
      metalness: 0.7
    });

    const addWall = (x, z, rotY) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, WALL_H), makePanelMat(10, 3));
      m.position.set(x, MID_Y, z);
      m.rotation.y = rotY;
      g.add(m);
    };
    addWall(0, -HALF, 0); // screens wall (faces +Z)
    addWall(0, HALF, Math.PI); // blast door wall (faces -Z)
    addWall(HALF, 0, -Math.PI / 2);
    addWall(-HALF, 0, Math.PI / 2);

    // Ceiling with ribs and bright light strips
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), makePanelMat(10, 10));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = CEIL;
    g.add(ceil);

    const ribMat = new THREE.MeshStandardMaterial({ color: 0x172033, roughness: 0.4, metalness: 0.9 });
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, toneMapped: false });
    for (let z = -15; z <= 15; z += 7.5) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.35, 0.5), ribMat);
      rib.position.set(0, CEIL - 0.18, z);
      g.add(rib);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.35), stripMat);
      strip.position.set(0, CEIL - 0.4, z + 3.7);
      g.add(strip);
    }

    // Hazard-yellow floor border
    const hazardTex = this.makeTiledTexture((ctx, s) => {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#111827';
      for (let i = -s; i < s * 2; i += s / 2) {
        ctx.beginPath();
        ctx.moveTo(i, s); ctx.lineTo(i + s / 4, s); ctx.lineTo(i + s / 4 + s, 0); ctx.lineTo(i + s, 0);
        ctx.closePath(); ctx.fill();
      }
    }, 64, 20, 1);
    const hazardMat = new THREE.MeshBasicMaterial({ map: hazardTex, toneMapped: false });
    [[0, -HALF + 0.35, 0], [0, HALF - 0.35, 0], [-HALF + 0.35, 0, Math.PI / 2], [HALF - 0.35, 0, Math.PI / 2]].forEach(([x, z, r]) => {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 0.5), hazardMat);
      bar.rotation.x = -Math.PI / 2;
      bar.rotation.z = r;
      bar.position.set(x, FLOOR + 0.02, z);
      g.add(bar);
    });

    // --- Screens wall (south, z = -HALF, faces +Z) ---
    this.canvasTelemetry = this.createDynamicCanvas(512, 256);
    this.textureTelemetry = this.makeCanvasTexture(this.canvasTelemetry);
    this.canvasRadar = this.createDynamicCanvas(640, 320);
    this.textureRadar = this.makeCanvasTexture(this.canvasRadar);
    this.canvasStatus = this.createDynamicCanvas(512, 256);
    this.textureStatus = this.makeCanvasTexture(this.canvasStatus);
    this.canvasMapTable = this.createDynamicCanvas(512, 320);
    this.textureMapTable = this.makeCanvasTexture(this.canvasMapTable);
    // Camera feed textures are bound in initCctvRenderer() once render targets exist
    this.camScreenMats = [];

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.4, metalness: 0.9 });
    const glowFrameMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, toneMapped: false });
    const addScreen = (map, x, y, w, h, label, labelColor) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.2), frameMat);
      frame.position.set(x, y, -HALF + 0.12);
      g.add(frame);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(w + 0.62, h + 0.62, 0.1), glowFrameMat);
      glow.position.set(x, y, -HALF + 0.06);
      g.add(glow);
      const mat = new THREE.MeshBasicMaterial({ map, toneMapped: false });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      screen.position.set(x, y, -HALF + 0.25);
      g.add(screen);
      const lab = this.makeLabelMesh(label, Math.min(w, 6.5), labelColor);
      lab.position.set(x, y + h / 2 + 0.55, -HALF + 0.25);
      g.add(lab);
      return mat;
    };

    // Bottom row
    addScreen(this.textureTelemetry, -11.8, 0.9, 8.0, 4.0, 'JUGADORES CONECTADOS', '#22c55e');
    addScreen(this.textureRadar, 0, 0.9, 10.4, 5.2, 'RADAR TÁCTICO GLOBAL', '#38bdf8');
    addScreen(this.textureStatus, 11.8, 0.9, 8.0, 4.0, 'ESTADO DE SILOS Y DEFENSA', '#f59e0b');
    // Top row: real camera feeds (textures assigned once render targets exist)
    this.camScreenMats.push(addScreen(null, -9.2, 6.3, 8.0, 4.0, 'CAM-01 · CAMPO DE SILOS', '#22c55e'));
    this.camScreenMats.push(addScreen(null, 0, 6.3, 8.0, 4.0, 'CAM-02 · LANZAMIENTO', '#ef4444'));
    this.camScreenMats.push(addScreen(null, 9.2, 6.3, 8.0, 4.0, 'CAM-03 · SEGUIMIENTO MISIL', '#38bdf8'));

    // --- Central war table with live tactical map ---
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.95 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.95, 5.4), tableMat);
    table.position.set(0, FLOOR + 0.475, 2);
    g.add(table);
    const tableTop = new THREE.Mesh(
      new THREE.PlaneGeometry(7.8, 4.8),
      new THREE.MeshBasicMaterial({ map: this.textureMapTable, toneMapped: false })
    );
    tableTop.rotation.x = -Math.PI / 2;
    tableTop.position.set(0, FLOOR + 0.97, 2);
    g.add(tableTop);
    const tableEdge = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.06, 5.6), glowFrameMat);
    tableEdge.position.set(0, FLOOR + 0.94, 2);
    g.add(tableEdge);

    // Holographic rotating rings above the table
    this.holoRing = new THREE.Group();
    const holoMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65, toneMapped: false });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.04, 8, 48), holoMat);
    ringA.rotation.x = Math.PI / 2;
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 8, 40), holoMat);
    ringB.rotation.x = Math.PI / 2;
    ringB.position.y = 0.5;
    this.holoRing.add(ringA, ringB);
    this.holoRing.position.set(0, FLOOR + 2.4, 2);
    g.add(this.holoRing);

    // Physical (decorative) red / blue buttons on the table front edge
    const redBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.2, 20), new THREE.MeshBasicMaterial({ color: 0xdc2626, toneMapped: false }));
    redBtn.position.set(-1.6, FLOOR + 1.1, 4.1);
    const blueBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.2, 20), new THREE.MeshBasicMaterial({ color: 0x2563eb, toneMapped: false }));
    blueBtn.position.set(1.6, FLOOR + 1.1, 4.1);
    g.add(redBtn, blueBtn);

    // Side operator desks
    [-14, 14].forEach(x => {
      const desk = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.0, 2.2), tableMat);
      desk.position.set(x, FLOOR + 0.5, 6);
      g.add(desk);
      const monitor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.12), new THREE.MeshBasicMaterial({ color: 0x0ea5e9, toneMapped: false }));
      monitor.position.set(x, FLOOR + 1.7, 5.4);
      monitor.rotation.x = -0.25;
      g.add(monitor);
    });

    // Blast door (decorative) on the entrance wall
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(9, 8.2, 0.5), frameMat);
    doorFrame.position.set(0, FLOOR + 4.1, HALF - 0.25);
    g.add(doorFrame);
    const doorTex = hazardTex.clone();
    doorTex.repeat.set(3, 3);
    doorTex.needsUpdate = true;
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(7.6, 7.4, 0.3), new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.5, metalness: 0.8 }));
    doorPanel.position.set(0, FLOOR + 3.9, HALF - 0.55);
    g.add(doorPanel);
    const doorLight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.15), new THREE.MeshBasicMaterial({ color: 0x22c55e, toneMapped: false }));
    doorLight.position.set(0, FLOOR + 8.0, HALF - 0.6);
    g.add(doorLight);

    // Interior lights (intensity switched on only while the admin is inside: no shader recompiles)
    this.interiorLights = [];
    [[0, 6.5, -10], [-12, 6.5, 0], [12, 6.5, 0], [0, 6.5, 10], [0, 6.5, 0]].forEach(([x, y, z]) => {
      const light = new THREE.PointLight(0xdbeafe, 0, 30, 1);
      light.position.set(x, y, z);
      g.add(light);
      this.interiorLights.push(light);
    });

    this.group.add(g);
    this.interiorGroup = g;

    this.drawTelemetry();
    this.drawRadar();
    this.drawStatus();
    this.drawMapTable();
  }

  // ---------------------------------------------------------------------------
  // Screen drawing
  // ---------------------------------------------------------------------------

  hostileMissiles() {
    const out = [];
    const mm = this.missileManager;
    if (!mm || !mm.missiles) return out;
    for (const m of mm.missiles.values()) {
      if (m.isInterceptor || m.isRetaliation || m.isDetonated || m.isDestroyedMidAir) continue;
      if (m.isSiloMissile) continue;
      if (m.launcherId === this.multiplayer?.myId || m.launcherName === 'jsieiragerpe') continue;
      out.push(m);
    }
    return out;
  }

  siloMissiles() {
    const out = [];
    const mm = this.missileManager;
    if (!mm || !mm.missiles) return out;
    for (const m of mm.missiles.values()) {
      if (m.isSiloMissile && !m.isDetonated && !m.isDestroyedMidAir) out.push(m);
    }
    return out;
  }

  /** Generic world map painter (used by radar screen, table and the touch console) */
  paintWorldMap(ctx, x0, y0, size, opts = {}) {
    const R = MAP_RANGE;
    const toPx = (wx) => x0 + ((wx + R) / (2 * R)) * size;
    const toPz = (wz) => y0 + ((wz + R) / (2 * R)) * size;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    ctx.fillStyle = '#04141c';
    ctx.fillRect(x0, y0, size, size);

    // Grid every 100m
    ctx.strokeStyle = 'rgba(14,165,233,0.18)';
    ctx.lineWidth = 1;
    for (let w = -R; w <= R; w += 100) {
      ctx.beginPath(); ctx.moveTo(toPx(w), y0); ctx.lineTo(toPx(w), y0 + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, toPz(w)); ctx.lineTo(x0 + size, toPz(w)); ctx.stroke();
    }

    const fs = Math.max(9, Math.round(size / 28));
    ctx.font = `${fs}px monospace`;
    ctx.textAlign = 'center';

    // Landmarks
    if (opts.landmarks !== false) {
      ctx.fillStyle = 'rgba(148,163,184,0.9)';
      for (const l of MAP_LANDMARKS) {
        ctx.beginPath(); ctx.arc(toPx(l.x), toPz(l.z), 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(l.name, toPx(l.x), toPz(l.z) - 5);
      }
    }

    // Bunker and silo rings
    const bx = toPx(-500);
    const bz = toPz(300);
    ctx.strokeStyle = 'rgba(34,197,94,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(bx, bz, (60 / (2 * R)) * size, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(bx - 3, bz - 3, 6, 6);
    ctx.fillText('BÚNKER', bx, bz + fs + 6);

    // Players
    const sel = this.selection;
    for (const p of this.getPlayersList()) {
      const px = toPx(p.pos[0]);
      const pz = toPz(p.pos[2]);
      const isSel = sel && sel.type === 'player' && sel.playerId === p.id;
      ctx.fillStyle = isSel ? '#fde047' : '#f8fafc';
      ctx.beginPath(); ctx.arc(px, pz, isSel ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = isSel ? '#fde047' : '#e2e8f0';
      ctx.fillText(p.name, px, pz - 8);
    }

    // Missiles in flight
    const mm = this.missileManager;
    if (mm && mm.missiles) {
      for (const m of mm.missiles.values()) {
        if (m.isDetonated || m.isDestroyedMidAir) continue;
        const mx = toPx(m.pos.x);
        const mz = toPz(m.pos.z);
        ctx.fillStyle = m.isInterceptor ? '#22d3ee' : (m.isSiloMissile ? '#fb923c' : '#ef4444');
        ctx.beginPath(); ctx.arc(mx, mz, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Selected map point
    if (sel && sel.type === 'point') {
      const sx = toPx(sel.x);
      const sz = toPz(sel.z);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sz, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 12, sz); ctx.lineTo(sx + 12, sz); ctx.moveTo(sx, sz - 12); ctx.lineTo(sx, sz + 12); ctx.stroke();
    }

    // Sweep line for the "live radar" feel
    if (opts.sweep) {
      const a = (Date.now() / 1500) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(56,189,248,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, bz); ctx.lineTo(bx + Math.cos(a) * size, bz + Math.sin(a) * size); ctx.stroke();
    }

    ctx.restore();
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, y0 + 1, size - 2, size - 2);
  }

  drawTelemetry() {
    if (!this.canvasTelemetry || !this.canvasTelemetry.getContext) return;
    const ctx = this.canvasTelemetry.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#04121a';
    ctx.fillRect(0, 0, 512, 256);

    const players = this.getPlayersList();
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`TOTAL: ${players.length + 1} EN LÍNEA`, 14, 28);
    ctx.fillStyle = '#64748b';
    ctx.font = '15px monospace';
    ctx.fillText('NOMBRE        POSICIÓN XYZ        DIST', 14, 52);

    ctx.font = 'bold 18px monospace';
    const rows = players.slice(0, 7);
    rows.forEach((p, i) => {
      const y = 78 + i * 25;
      const d = Math.round(Math.hypot(p.pos[0] + 500, p.pos[2] - 300));
      const isSel = this.selection && this.selection.type === 'player' && this.selection.playerId === p.id;
      ctx.fillStyle = isSel ? '#fde047' : '#e2e8f0';
      ctx.fillText(`${isSel ? '▶' : ' '}${String(p.name).slice(0, 10)}`, 10, y);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${Math.round(p.pos[0])},${Math.round(p.pos[1])},${Math.round(p.pos[2])}`, 175, y);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`${d}m`, 410, y);
    });
    if (players.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '18px monospace';
      ctx.fillText('Sin otros jugadores conectados', 14, 100);
    } else if (players.length > 7) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px monospace';
      ctx.fillText(`... y ${players.length - 7} más`, 14, 246);
    }
    if (this.textureTelemetry) this.textureTelemetry.needsUpdate = true;
  }

  drawRadar() {
    if (!this.canvasRadar || !this.canvasRadar.getContext) return;
    const ctx = this.canvasRadar.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#020b10';
    ctx.fillRect(0, 0, 640, 320);
    this.paintWorldMap(ctx, 0, 0, 320, { sweep: true });

    // Right info panel
    ctx.textAlign = 'left';
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('SITUACIÓN AÉREA', 336, 28);

    const hostiles = this.hostileMissiles();
    const mine = this.siloMissiles();
    ctx.font = '17px monospace';
    ctx.fillStyle = hostiles.length ? '#ef4444' : '#22c55e';
    ctx.fillText(hostiles.length ? `⚠ AMENAZAS: ${hostiles.length}` : '✔ ESPACIO AÉREO LIMPIO', 336, 56);
    ctx.fillStyle = '#fb923c';
    ctx.fillText(`MISILES DE SILO EN VUELO: ${mine.length}`, 336, 80);

    ctx.font = '15px monospace';
    hostiles.slice(0, 6).forEach((m, i) => {
      const d = Math.round(Math.hypot(m.pos.x + 500, m.pos.z - 300));
      ctx.fillStyle = '#fca5a5';
      ctx.fillText(`${String(m.launcherName || '?').slice(0, 9)} > ${String(m.targetName || '?').slice(0, 9)} ${d}m`, 336, 112 + i * 22);
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText('blanco: jugador  rojo: amenaza', 336, 262);
    ctx.fillText('naranja: silo  cian: interceptor', 336, 282);
    ctx.fillText(`Rango: ±${MAP_RANGE} m`, 336, 302);
    if (this.textureRadar) this.textureRadar.needsUpdate = true;
  }

  drawStatus() {
    if (!this.canvasStatus || !this.canvasStatus.getContext) return;
    const ctx = this.canvasStatus.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#120d04';
    ctx.fillRect(0, 0, 512, 256);

    const open = this.silos.filter(s => s.openProgress > 0.05).length;
    const flying = this.siloMissiles().length;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('BLINDAJE: ACTIVO (INMUNE)', 14, 30);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('CÚPULA AUTOMÁTICA: APAGADA', 14, 58);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('DEFENSA: MANUAL (BOTÓN AZUL)', 14, 86);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '18px monospace';
    ctx.fillText(`SILOS: ${SILO_COUNT} LISTOS · ${open} ABIERTOS`, 14, 122);
    ctx.fillText(`MISILES EN VUELO: ${flying} (PODER 2X)`, 14, 148);

    const t = this.resolveSelection();
    ctx.fillStyle = '#fde047';
    ctx.fillText(`OBJETIVO: ${t ? `${t.name} (${Math.round(t.x)}, ${Math.round(t.z)})` : 'SIN SELECCIONAR'}`.slice(0, 40), 14, 176);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`SALVA PREPARADA: ${this.selectedCount} MISIL(ES)`, 14, 202);

    // Salvo progress bar
    const total = this.salvo ? this.salvo.total : 0;
    const done = this.salvo ? Math.min(this.salvo.launched, total) : 0;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 218, 484, 22);
    ctx.fillStyle = '#ef4444';
    if (total > 0) ctx.fillRect(16, 220, 480 * (done / total), 18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(total > 0 ? `SALVA EN CURSO: ${done}/${total}` : 'SIN SALVA ACTIVA', 22, 234);
    if (this.textureStatus) this.textureStatus.needsUpdate = true;
  }

  drawMapTable() {
    if (!this.canvasMapTable || !this.canvasMapTable.getContext) return;
    const ctx = this.canvasMapTable.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#031017';
    ctx.fillRect(0, 0, 512, 320);
    this.paintWorldMap(ctx, 96, 0, 320, { sweep: true, landmarks: true });
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MESA TÁCTICA', 8, 20);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('MAPA EN VIVO', 8, 38);
    if (this.textureMapTable) this.textureMapTable.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------
  // REAL camera feeds rendered into the wall screens
  // ---------------------------------------------------------------------------

  initCctvRenderer() {
    this.cctv = [];
    if (!this.renderer || typeof THREE.WebGLRenderTarget !== 'function') return;
    for (let i = 0; i < 3; i++) {
      const rt = new THREE.WebGLRenderTarget(384, 192);
      const cam = new THREE.PerspectiveCamera(58, 2, 0.5, 450);
      this.cctv.push({ rt, cam });
      if (this.camScreenMats[i]) {
        this.camScreenMats[i].map = rt.texture;
        this.camScreenMats[i].needsUpdate = true;
      }
    }
  }

  positionCctvCamera(index) {
    const cam = this.cctv[index].cam;
    const nowSec = Date.now() / 1000;

    if (index === 0) {
      // CAM-01: elevated overview of the whole silo field
      cam.position.set(-500, 84, 214);
      cam.lookAt(-500, 24, 304);
    } else if (index === 1) {
      // CAM-02: launch cam, focused on the silo that fired last (otherwise patrols the silo field)
      const recent = this.lastLaunchSilo >= 0 && (Date.now() - this.lastLaunchTime) < 9000;
      const idx = recent ? this.lastLaunchSilo : (Math.floor(nowSec / 4) * 13) % SILO_COUNT;
      const silo = this.silos[idx];
      const out = new THREE.Vector3(silo.pos.x - this.surfaceCenter.x, 0, silo.pos.z - this.surfaceCenter.z).normalize();
      const side = new THREE.Vector3(-out.z, 0, out.x);
      cam.position.set(
        silo.pos.x + out.x * 15 + side.x * 7,
        silo.pos.y + 6.5,
        silo.pos.z + out.z * 15 + side.z * 7
      );
      cam.lookAt(silo.pos.x, silo.pos.y + 5, silo.pos.z);
    } else {
      // CAM-03: chase cam behind the newest silo missile; otherwise a wide side angle
      let target = null;
      for (const m of this.siloMissiles()) {
        if (!target || m.age < target.age) target = m;
      }
      if (target) {
        const f = target.forward.clone();
        cam.position.set(target.pos.x - f.x * 20, target.pos.y - f.y * 20 + 4, target.pos.z - f.z * 20);
        cam.lookAt(target.pos.x + f.x * 8, target.pos.y + f.y * 8, target.pos.z + f.z * 8);
      } else {
        cam.position.set(-425, 42, 345);
        cam.lookAt(-500, 30, 300);
      }
    }
    cam.updateMatrixWorld();
  }

  renderCctvFeeds(dt) {
    if (!this.renderer || !this.cctv || this.cctv.length === 0) return;
    this.cctvTimer += dt;
    if (this.cctvTimer < 0.1) return;
    this.cctvTimer = 0;

    const idx = this.cctvIndex++ % this.cctv.length;
    this.positionCctvCamera(idx);
    const feed = this.cctv[idx];
    const r = this.renderer;
    const prevAuto = r.shadowMap.autoUpdate;
    const prevTarget = r.getRenderTarget();
    // Hide our own interior so the cameras never film the screens themselves
    if (this.interiorGroup) this.interiorGroup.visible = false;
    r.shadowMap.autoUpdate = false;
    try {
      r.setRenderTarget(feed.rt);
      r.render(this.scene, feed.cam);
    } catch (e) {
      // never let a camera feed error break the main render loop
    }
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = prevAuto;
    if (this.interiorGroup) this.interiorGroup.visible = true;
  }

  // ---------------------------------------------------------------------------
  // UI: styles, touch HUD buttons and command console
  // ---------------------------------------------------------------------------

  injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('bunker-style')) return;
    const style = document.createElement('style');
    style.id = 'bunker-style';
    style.textContent = `
      #bunker-hud { position: fixed; right: 10px; top: 26%; z-index: 9000; display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
      #bunker-hud.hidden, #bunker-hud .hidden { display: none !important; }
      .bhud-btn { min-width: 76px; min-height: 76px; padding: 8px 10px; border-radius: 18px; border: 3px solid #0f172a; color: #fff; font: 800 13px/1.15 system-ui, sans-serif; text-align: center; box-shadow: 0 4px 14px rgba(0,0,0,.55); touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; }
      .bhud-btn .ico { display: block; font-size: 28px; line-height: 1.1; }
      .bhud-enter { background: linear-gradient(#16a34a, #166534); min-width: 110px; }
      .bhud-console { background: linear-gradient(#f59e0b, #b45309); }
      .bhud-blue { background: linear-gradient(#3b82f6, #1d4ed8); }
      .bhud-exit { background: linear-gradient(#64748b, #334155); }
      .bhud-btn:active { transform: scale(.93); }

      .bunker-modal { position: fixed; inset: 0; z-index: 10000; background: rgba(2, 8, 14, .97); display: flex; flex-direction: column; color: #e2e8f0; font-family: system-ui, sans-serif; }
      .bunker-modal.hidden { display: none; }
      .bm-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #0b1622; border-bottom: 2px solid #0ea5e9; flex: 0 0 auto; }
      .bm-title { font-weight: 800; font-size: 15px; letter-spacing: .5px; color: #38bdf8; }
      .bm-close { width: 52px; height: 52px; border-radius: 14px; border: 2px solid #475569; background: #1e293b; color: #fff; font-size: 24px; touch-action: manipulation; }
      .bm-body { flex: 1 1 auto; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 12px 14px 8px; }
      .bm-sec { margin-bottom: 14px; }
      .bm-sec > label { display: block; font-size: 12px; font-weight: 800; color: #94a3b8; margin-bottom: 6px; letter-spacing: .6px; }
      .bm-tabs { display: flex; gap: 8px; margin-bottom: 8px; }
      .bm-tab { flex: 1; min-height: 52px; border-radius: 12px; border: 2px solid #334155; background: #111c2b; color: #cbd5e1; font-weight: 800; font-size: 15px; touch-action: manipulation; }
      .bm-tab.active { border-color: #38bdf8; background: #0c3a57; color: #fff; }
      .bm-players { display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto; }
      .bm-player { min-height: 58px; border-radius: 12px; border: 2px solid #334155; background: #111c2b; color: #fff; text-align: left; padding: 8px 12px; font-size: 16px; font-weight: 700; touch-action: manipulation; }
      .bm-player small { display: block; color: #94a3b8; font-weight: 500; font-size: 12px; margin-top: 2px; }
      .bm-player.active { border-color: #fde047; background: #3b3305; }
      .bm-empty { color: #94a3b8; padding: 14px; text-align: center; border: 2px dashed #334155; border-radius: 12px; }
      .bm-map-wrap { width: 100%; max-width: 440px; margin: 0 auto; }
      #bm-map-canvas { width: 100%; aspect-ratio: 1 / 1; display: block; border-radius: 12px; touch-action: none; background: #04141c; }
      .bm-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .bm-chip { min-height: 44px; padding: 6px 12px; border-radius: 22px; border: 2px solid #334155; background: #111c2b; color: #e2e8f0; font-weight: 700; font-size: 13px; touch-action: manipulation; }
      .bm-chip.active { border-color: #fde047; color: #fde047; }
      .bm-stepper { display: flex; align-items: center; gap: 10px; }
      .bm-step-btn { width: 70px; height: 70px; border-radius: 16px; border: 2px solid #475569; background: #1e293b; color: #fff; font-size: 34px; font-weight: 800; touch-action: manipulation; }
      #bm-count-val { flex: 1; text-align: center; font-size: 44px; font-weight: 900; color: #fde047; }
      .bm-hint { font-size: 12px; color: #94a3b8; margin-top: 6px; text-align: center; }
      .bm-colors { display: flex; flex-wrap: wrap; gap: 8px; }
      .bm-color { min-height: 48px; padding: 6px 12px; border-radius: 12px; border: 3px solid; background: #0b1118; color: #fff; font-weight: 700; font-size: 13px; touch-action: manipulation; opacity: .6; }
      .bm-color.active { opacity: 1; background: #1b2636; }
      .bm-foot { flex: 0 0 auto; padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px)); background: #0b1622; border-top: 2px solid #0ea5e9; display: flex; flex-direction: column; gap: 8px; }
      .bm-summary { font-size: 13px; text-align: center; color: #fde047; min-height: 18px; }
      .bm-actions { display: flex; gap: 10px; }
      .bm-btn-red, .bm-btn-blue { flex: 1; min-height: 64px; border-radius: 16px; border: 3px solid #0f172a; color: #fff; font-size: 15px; font-weight: 900; touch-action: manipulation; }
      .bm-btn-red { background: linear-gradient(#ef4444, #991b1b); }
      .bm-btn-red[disabled] { filter: grayscale(1) brightness(.6); }
      .bm-btn-blue { background: linear-gradient(#3b82f6, #1d4ed8); }
      .bm-btn-red:active, .bm-btn-blue:active { transform: scale(.97); }
    `;
    document.head.appendChild(style);
  }

  stopTouch(el) {
    ['touchstart', 'touchend', 'pointerdown', 'mousedown'].forEach(ev => {
      el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    });
  }

  initBunkerHUD() {
    if (typeof document === 'undefined') return;
    let hud = document.getElementById('bunker-hud');
    if (hud) return;
    hud = document.createElement('div');
    hud.id = 'bunker-hud';
    hud.className = 'hidden';
    hud.innerHTML = `
      <button id="bhud-enter" class="bhud-btn bhud-enter hidden"><span class="ico">🛡️</span>ENTRAR AL BÚNKER</button>
      <button id="bhud-console" class="bhud-btn bhud-console hidden"><span class="ico">🖥️</span>MANDO</button>
      <button id="bhud-intercept" class="bhud-btn bhud-blue hidden"><span class="ico">🛡️</span>INTERCEPTOR</button>
      <button id="bhud-exit" class="bhud-btn bhud-exit hidden"><span class="ico">🚪</span>SALIR</button>
    `;
    document.body.appendChild(hud);
    this.hud = hud;
    this.stopTouch(hud);

    hud.querySelector('#bhud-enter').addEventListener('click', () => this.enterBunker());
    hud.querySelector('#bhud-console').addEventListener('click', () => this.toggleBunkerHUD(true));
    hud.querySelector('#bhud-intercept').addEventListener('click', () => this.launchManualInterceptor());
    hud.querySelector('#bhud-exit').addEventListener('click', () => this.exitBunker());
  }

  /** Shows/hides the touch buttons according to where the admin is */
  updateHud(playerPos) {
    if (!this.hud) return;
    let state = 'none';
    if (playerPos && this.isMainAdminPlayer()) {
      if (this.playerInside) {
        state = 'inside';
      } else if (Math.hypot(playerPos.x + 500, playerPos.z - 300) <= 90 && playerPos.y > 20) {
        state = 'near';
      }
    }
    if (state === this.hudState) return;
    this.hudState = state;
    const show = (id, v) => this.hud.querySelector(id).classList.toggle('hidden', !v);
    show('#bhud-enter', state === 'near');
    show('#bhud-console', state === 'inside');
    show('#bhud-intercept', state === 'inside');
    show('#bhud-exit', state === 'inside');
    this.hud.classList.toggle('hidden', state === 'none');
    if (state !== 'inside') this.toggleBunkerHUD(false);
  }

  /**
   * Initializes the touch-first Command Console (full-screen sheet)
   */
  initBunkerUI() {
    if (typeof document === 'undefined') return;

    let modal = document.getElementById('bunker-command-modal');
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'bunker-command-modal';
    modal.className = 'bunker-modal hidden';
    modal.innerHTML = `
      <div class="bm-head">
        <div class="bm-title">🎖️ CENTRO DE MANDO · 180 SILOS</div>
        <button id="bm-close-btn" class="bm-close">✕</button>
      </div>
      <div class="bm-body">
        <div class="bm-sec">
          <label>1 · OBJETIVO</label>
          <div class="bm-tabs">
            <button class="bm-tab active" data-tab="players">👤 JUGADORES</button>
            <button class="bm-tab" data-tab="map">🗺️ PUNTO DEL MAPA</button>
          </div>
          <div id="bm-tab-players"><div id="bm-players" class="bm-players"></div></div>
          <div id="bm-tab-map" style="display:none">
            <div class="bm-map-wrap"><canvas id="bm-map-canvas" width="440" height="440"></canvas></div>
            <div class="bm-hint">Toca cualquier punto del mapa · o elige un lugar:</div>
            <div id="bm-chips" class="bm-chips">
              ${MAP_LANDMARKS.map((l, i) => `<button class="bm-chip" data-i="${i}">${l.icon} ${l.name}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="bm-sec">
          <label>2 · CANTIDAD DE MISILES (1 – 180)</label>
          <div class="bm-stepper">
            <button id="bm-count-minus" class="bm-step-btn">−</button>
            <div id="bm-count-val">2</div>
            <button id="bm-count-plus" class="bm-step-btn">+</button>
          </div>
          <div class="bm-chips" id="bm-count-chips">
            ${[1, 2, 4, 10, 30, 60, 180].map(n => `<button class="bm-chip" data-n="${n}">${n === 180 ? '🚀 180 TOTAL' : n}</button>`).join('')}
          </div>
          <div class="bm-hint" id="bm-eta">Salen de 2 en 2, con 3 s entre parejas.</div>
        </div>

        <div class="bm-sec">
          <label>3 · COLOR DE LLAMA</label>
          <div class="bm-colors">
            ${this.flameColors.map((c, i) => `<button class="bm-color ${i === 0 ? 'active' : ''}" data-hex="${c.hex}" style="border-color:#${c.hex.toString(16).padStart(6, '0')}">${c.label}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="bm-foot">
        <div class="bm-summary" id="bm-summary">Elige un objetivo</div>
        <div class="bm-actions">
          <button id="bm-launch-red-btn" class="bm-btn-red" disabled>🚀 LANZAR SALVA<br><small>(PODER 2X)</small></button>
          <button id="bm-intercept-blue-btn" class="bm-btn-blue">🛡️ INTERCEPTOR<br><small>MANUAL DIRECTO</small></button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    this.bunkerModal = modal;
    this.stopTouch(modal);

    modal.querySelector('#bm-close-btn').addEventListener('click', () => this.toggleBunkerHUD(false));

    // Tabs
    modal.querySelectorAll('.bm-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.bm-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isMap = tab.dataset.tab === 'map';
        modal.querySelector('#bm-tab-players').style.display = isMap ? 'none' : 'block';
        modal.querySelector('#bm-tab-map').style.display = isMap ? 'block' : 'none';
        if (isMap) this.drawConsoleMap();
      });
    });

    // Map canvas picking (tap or drag)
    const mapCanvas = modal.querySelector('#bm-map-canvas');
    this.consoleMapCanvas = mapCanvas;
    const pick = (ev) => {
      const rect = mapCanvas.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width);
      const pz = ((ev.clientY - rect.top) / rect.height);
      const x = Math.max(-MAP_RANGE, Math.min(MAP_RANGE, Math.round(px * 2 * MAP_RANGE - MAP_RANGE)));
      const z = Math.max(-MAP_RANGE, Math.min(MAP_RANGE, Math.round(pz * 2 * MAP_RANGE - MAP_RANGE)));
      this.selection = { type: 'point', x, z, name: `Punto (${x}, ${z})` };
      this.refreshConsole();
    };
    let dragging = false;
    mapCanvas.addEventListener('pointerdown', (e) => { dragging = true; pick(e); });
    mapCanvas.addEventListener('pointermove', (e) => { if (dragging) pick(e); });
    window.addEventListener('pointerup', () => { dragging = false; });

    // Landmark chips
    modal.querySelectorAll('#bm-chips .bm-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const l = MAP_LANDMARKS[parseInt(chip.dataset.i, 10)];
        this.selection = { type: 'point', x: l.x, z: l.z, name: l.name };
        this.refreshConsole();
      });
    });

    // Count controls
    const setCount = (n) => {
      this.selectedCount = Math.max(1, Math.min(SILO_COUNT, n));
      this.refreshConsole();
    };
    modal.querySelector('#bm-count-minus').addEventListener('click', () => setCount(this.selectedCount - 1));
    modal.querySelector('#bm-count-plus').addEventListener('click', () => setCount(this.selectedCount + 1));
    modal.querySelectorAll('#bm-count-chips .bm-chip').forEach(chip => {
      chip.addEventListener('click', () => setCount(parseInt(chip.dataset.n, 10)));
    });

    // Colors
    const colorBtns = modal.querySelectorAll('.bm-color');
    colorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedFlameColor = parseInt(btn.dataset.hex, 10) || 0xff6600;
      });
    });

    // Red launch / Blue interceptor
    modal.querySelector('#bm-launch-red-btn').addEventListener('click', () => {
      const t = this.resolveSelection();
      if (!t) {
        this.notify('⚠️ Selecciona primero un objetivo (jugador o punto del mapa).');
        return;
      }
      this.launchSalvoFromBunker(this.selectedCount, this.selection, this.selectedFlameColor);
      this.toggleBunkerHUD(false);
    });
    modal.querySelector('#bm-intercept-blue-btn').addEventListener('click', () => {
      this.launchManualInterceptor();
    });

    this.refreshConsole();
  }

  /** Refreshes player cards, summary text, count chips and launch button state */
  refreshConsole() {
    const modal = this.bunkerModal;
    if (!modal) return;

    // Player cards
    const list = modal.querySelector('#bm-players');
    if (list) {
      const players = this.getPlayersList();
      if (players.length === 0) {
        list.innerHTML = '<div class="bm-empty">No hay otros jugadores conectados.<br>Usa «Punto del mapa» para atacar cualquier lugar.</div>';
      } else {
        list.innerHTML = '';
        players.forEach(p => {
          const btn = document.createElement('button');
          const active = this.selection && this.selection.type === 'player' && this.selection.playerId === p.id;
          btn.className = 'bm-player' + (active ? ' active' : '');
          const d = Math.round(Math.hypot(p.pos[0] + 500, p.pos[2] - 300));
          btn.innerHTML = `${active ? '🎯 ' : '👤 '}${p.name}<small>XYZ ${Math.round(p.pos[0])}, ${Math.round(p.pos[1])}, ${Math.round(p.pos[2])} · a ${d} m del búnker</small>`;
          btn.addEventListener('click', () => {
            this.selection = { type: 'player', playerId: p.id, name: p.name };
            this.refreshConsole();
          });
          list.appendChild(btn);
        });
      }
    }

    modal.querySelector('#bm-count-val').textContent = String(this.selectedCount);
    modal.querySelectorAll('#bm-count-chips .bm-chip').forEach(c => {
      c.classList.toggle('active', parseInt(c.dataset.n, 10) === this.selectedCount);
    });
    const pairs = Math.ceil(this.selectedCount / SILO_MISSILE_SPEC.pairSize);
    const secs = Math.max(0, (pairs - 1) * SILO_MISSILE_SPEC.pairIntervalSec);
    modal.querySelector('#bm-eta').textContent =
      `Salen de ${SILO_MISSILE_SPEC.pairSize} en ${SILO_MISSILE_SPEC.pairSize}, con ${SILO_MISSILE_SPEC.pairIntervalSec} s entre parejas · duración ≈ ${secs} s`;

    const t = this.resolveSelection();
    const sum = modal.querySelector('#bm-summary');
    const launchBtn = modal.querySelector('#bm-launch-red-btn');
    if (t) {
      sum.textContent = `🎯 ${t.name}  ·  ${this.selectedCount} misil(es)`;
      launchBtn.disabled = false;
    } else {
      sum.textContent = this.selection ? '⚠️ El objetivo ya no está conectado' : 'Elige un objetivo';
      launchBtn.disabled = true;
    }
    modal.querySelectorAll('#bm-chips .bm-chip').forEach(chip => {
      const l = MAP_LANDMARKS[parseInt(chip.dataset.i, 10)];
      chip.classList.toggle('active', !!(this.selection && this.selection.type === 'point' && this.selection.x === l.x && this.selection.z === l.z));
    });

    this.drawConsoleMap();
  }

  drawConsoleMap() {
    const c = this.consoleMapCanvas;
    if (!c || !this.bunkerModal || this.bunkerModal.classList.contains('hidden')) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    this.paintWorldMap(ctx, 0, 0, c.width, { landmarks: true, sweep: false });
  }

  toggleBunkerHUD(open = null) {
    if (!this.bunkerModal) return;
    const isVis = !this.bunkerModal.classList.contains('hidden');
    const targetState = (open !== null) ? open : !isVis;
    if (targetState === isVis) return;

    if (targetState) {
      if (!this.isMainAdminPlayer()) return;
      this.bunkerModal.classList.remove('hidden');
      if (this.controls && typeof this.controls.unlock === 'function') {
        try { this.controls.unlock(); } catch (e) { /* ignore */ }
      }
      this.refreshConsole();
    } else {
      this.bunkerModal.classList.add('hidden');
      const mobile = this.controls && this.controls.isMobile;
      if (!mobile && this.controls && typeof this.controls.lock === 'function') {
        try { this.controls.lock(); } catch (e) { /* ignore */ }
      }
    }
  }

  /**
   * Returns true if the given position is inside the subterranean bunker chamber
   */
  isPlayerInsideBunker(pos) {
    if (!pos) return false;
    return isInsideBunkerInterior(pos.x, pos.y, pos.z);
  }

  // ---------------------------------------------------------------------------
  // Launch logic
  // ---------------------------------------------------------------------------

  /**
   * Requests a salvo of Silo Missiles (1..180) with 2X power and custom colored flames.
   * The SERVER fires them in pairs of 2 with 3 s between pairs; every client then sees the hatch open
   * (fireSingleSilo) and the missile rise out of its silo.
   */
  launchSalvoFromBunker(count = 1, selection = null, colorHex = 0xff6600) {
    const launchCount = Math.max(1, Math.min(SILO_COUNT, count));
    const t = this.resolveSelection();
    if (!t || !selection) {
      this.notify('⚠️ Selecciona primero un objetivo.');
      return;
    }

    if (this.multiplayer && typeof this.multiplayer.send === 'function') {
      this.multiplayer.send('admin_launch_missile', {
        targetPlayerId: selection.type === 'player' ? selection.playerId : 'area_strike',
        targetPos: [t.x, t.y, t.z],
        count: launchCount,
        isSiloLaunch: true,
        flameColor: colorHex
      });
    }

    this.salvo = { total: launchCount, launched: 0, startedAt: Date.now() };
    this.notify(`🚀 Salva de ${launchCount} misil(es) hacia ${t.name}: salen de ${SILO_MISSILE_SPEC.pairSize} en ${SILO_MISSILE_SPEC.pairSize}, cada ${SILO_MISSILE_SPEC.pairIntervalSec} s.`);
  }

  emitSmoke(x, y, z, count, spread = 1.6, rise = 7) {
    const pm = this.particleManager;
    if (!pm || !pm.debrisParticles || typeof pm.maxDebris !== 'number') return;
    for (let i = 0; i < count; i++) {
      if (pm.debrisParticles.length >= pm.maxDebris) break;
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * spread;
      pm.debrisParticles.push({
        x: x + Math.cos(a) * 0.6,
        y: y + Math.random() * 0.6,
        z: z + Math.sin(a) * 0.6,
        vx: Math.cos(a) * s,
        vy: rise * (0.5 + Math.random() * 0.8),
        vz: Math.sin(a) * s,
        scale: 1.4 + Math.random() * 1.6,
        rotX: Math.random() * 3,
        rotY: Math.random() * 3,
        life: 2.2,
        maxLife: 2.2
      });
    }
  }

  /**
   * Visual/audio sequence for ONE silo: rumble + smoke, hatch swings open, then (1 s later, from
   * missile.js) the rocket rises slowly out of the shaft; the hatch closes again afterwards.
   */
  fireSingleSilo(siloIndex) {
    const silo = this.silos[siloIndex];
    if (!silo) return;

    silo.isOpen = true;
    silo.targetProgress = 1.0;
    silo.isLaunching = true;
    silo.openTimer = 7.0; // stays open while the missile climbs out and clears the shaft
    silo.smokeTimer = 0;

    this.lastLaunchSilo = siloIndex;
    this.lastLaunchTime = Date.now();
    if (this.salvo) this.salvo.launched = Math.min(this.salvo.total, this.salvo.launched + 1);

    // Initial burst of launch smoke from the shaft
    this.emitSmoke(silo.pos.x, silo.pos.y, silo.pos.z, 26, 2.2, 6);
    if (this.sound && typeof this.sound.playMissileLaunch === 'function') {
      this.sound.playMissileLaunch();
    }
  }

  /**
   * Launches a Manual Kinetic Interceptor (Blue Button): 1 direct interceptor at the most dangerous
   * incoming missile (the one aimed at the bunker/admin; otherwise the nearest hostile one).
   */
  launchManualInterceptor() {
    const now = Date.now();
    if (now - this.lastInterceptorTime < 900) return;
    this.lastInterceptorTime = now;

    const hostiles = this.hostileMissiles();
    let threat = null;
    let best = Infinity;
    for (const m of hostiles) {
      const aimedAtMe = (m.targetPlayerId === this.multiplayer?.myId) || m.targetName === 'jsieiragerpe' ||
        (m.targetPos && isInsideBunker(m.targetPos.x, m.targetPos.y, m.targetPos.z));
      const d = Math.hypot(m.pos.x + 500, m.pos.y - 24, m.pos.z - 300) - (aimedAtMe ? 1000 : 0);
      if (d < best) {
        best = d;
        threat = m;
      }
    }

    if (!threat) {
      this.notify('🛡️ [INTERCEPTOR MANUAL] Escaneando espacio aéreo... No hay misiles hostiles entrantes.');
      return;
    }

    // Fire from the silo closest to the threat
    let siloIdx = 0;
    let bestD = Infinity;
    for (const s of this.silos) {
      const d = Math.hypot(s.pos.x - threat.pos.x, s.pos.z - threat.pos.z);
      if (d < bestD) { bestD = d; siloIdx = s.index; }
    }
    const silo = this.silos[siloIdx];
    this.fireSingleSilo(siloIdx);
    if (this.salvo) this.salvo.launched = Math.max(0, this.salvo.launched - 1); // interceptor is not part of a salvo

    setTimeout(() => {
      if (threat.isDetonated || threat.isDestroyedMidAir) return;
      if (this.missileManager && typeof this.missileManager.launchSingleInterceptor === 'function') {
        this.missileManager.launchSingleInterceptor(threat, [silo.pos.x, silo.pos.y + 1.5, silo.pos.z]);
      }
    }, 700);

    this.notify('🚀 [INTERCEPTOR MANUAL] ¡Misil cinético directo lanzado! Neutralizando amenaza...');
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  update(dt, playerPos) {
    this.timeAcc += dt;

    // 1. Animate silo hatch doors (swing upward to ~85 degrees when launching) and exhaust smoke
    for (const silo of this.silos) {
      if (silo.openTimer > 0) {
        silo.openTimer -= dt;
        silo.smokeTimer += dt;
        if (silo.smokeTimer > 0.12 && silo.openTimer > 3.5) {
          silo.smokeTimer = 0;
          this.emitSmoke(silo.pos.x, silo.pos.y, silo.pos.z, 3, 1.2, 5);
        }
        if (silo.openTimer <= 0) {
          silo.isOpen = false;
          silo.isLaunching = false;
          silo.targetProgress = 0.0;
        }
      }
      if (Math.abs(silo.openProgress - silo.targetProgress) > 0.01) {
        const step = dt * 2.2;
        if (silo.openProgress < silo.targetProgress) {
          silo.openProgress = Math.min(silo.targetProgress, silo.openProgress + step);
        } else {
          silo.openProgress = Math.max(silo.targetProgress, silo.openProgress - step);
        }
        silo.hatchPivot.rotation.x = -silo.openProgress * 1.48; // Swing up to ~85 degrees
      }
    }

    if (this.holoRing) this.holoRing.rotation.y += dt * 0.9;

    // 2. Player location state
    this.playerInside = !!playerPos && this.isPlayerInsideBunker(playerPos);
    const adminInside = this.playerInside && this.isMainAdminPlayer();

    // Interior lights only burn while the admin is inside (no shader recompiles)
    if (this.interiorLights) {
      const target = adminInside ? 55 : 0;
      for (const l of this.interiorLights) l.intensity = target;
    }

    // 3. Touch HUD buttons
    this.updateHud(playerPos);

    // 4. Live screens + real camera feeds (only while the admin is inside)
    if (adminInside) {
      this.screenTimer += dt;
      if (this.screenTimer >= 0.4) {
        this.screenTimer = 0;
        this.drawTelemetry();
        this.drawRadar();
        this.drawStatus();
        this.drawMapTable();
      }
      this.renderCctvFeeds(dt);
    }

    // 5. Keep the open console fresh (players move, salvo progresses)
    if (this.bunkerModal && !this.bunkerModal.classList.contains('hidden')) {
      this.modalTimer += dt;
      if (this.modalTimer >= 0.7) {
        this.modalTimer = 0;
        this.refreshConsole();
      }
    }

    // 6. Biometric rejection for unauthorized intruders (server forcefield is authoritative too)
    if (playerPos && this.playerInside && !this.isMainAdminPlayer()) {
      this.teleportPlayer(-430, 25, 300, -Math.PI / 2);
      this.notify('🛡️ Acceso denegado: Búnker Subterráneo exclusivo para jsieiragerpe.');
    }
  }
}
