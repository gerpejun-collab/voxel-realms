// public/src/bunker.js
// Mega Underground Bunker & 180 Surface Missile Silo Complex
// Features:
// - Subterranean strategic command center carved beneath a colossal mountain at (-500, 300)
// - Built with airplane hangar materials (dark slate reinforced steel, titanium blast doors, hazard stripes)
// - Biometric forcefield entrance permitting ONLY main admin jsieiragerpe@gmail.com
// - 180 surface missile silos flush with terrain at Y=24 with animated sliding/hinged hatch covers
// - Colossal Silo Missiles (2X power, radius 18m, multi-colored thruster flames, heavy smoke contrails)
// - Wall-mounted holographic/CCTV surveillance screens displaying live players and surface silos
// - Interactive control console with salvo count selector (1..180), Big RED launch button, and Big BLUE manual interceptor button
// - When inside bunker: incoming missiles cannot reach admin, auto counter-attack is disabled, defense is 100% manual via blue button

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

export class BunkerManager {
  constructor(scene, particleManager, world, sound, multiplayer, missileManager) {
    this.scene = scene;
    this.particleManager = particleManager;
    this.world = world;
    this.sound = sound;
    this.multiplayer = multiplayer;
    this.missileManager = missileManager;

    this.center = new THREE.Vector3(-500, 12, 300);
    this.surfaceCenter = new THREE.Vector3(-500, 24, 300);
    this.silos = [];
    this.activeSiloLaunches = [];

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

    // Build the 180 Surface Missile Silos and Subterranean Command Center
    this.buildSurfaceSilos();
    this.buildCommandCenterInterior();
    this.initCctvRenderer();
    this.initBunkerUI();
  }

  /**
   * Builds exactly 180 Surface Missile Silos arranged around the mountain complex flush with Y=24
   * 3 Concentric Rings:
   * Ring 1: R = 36m, 40 silos
   * Ring 2: R = 48m, 60 silos
   * Ring 3: R = 60m, 80 silos
   * Total = 40 + 60 + 80 = 180 silos!
   */
  buildSurfaceSilos() {
    this.silos = [];
    const ringConfigs = [
      { radius: 36, count: 40 },
      { radius: 48, count: 60 },
      { radius: 60, count: 80 }
    ];

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Hangar dark slate steel
      roughness: 0.65,
      metalness: 0.8
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.9
    });
    const hatchMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.5,
      metalness: 0.85
    });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 }); // Hazard yellow

    let globalIndex = 0;

    for (const ring of ringConfigs) {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2;
        const sx = this.surfaceCenter.x + Math.cos(angle) * ring.radius;
        const sz = this.surfaceCenter.z + Math.sin(angle) * ring.radius;
        const sy = 24.0;

        const siloGroup = new THREE.Group();
        siloGroup.position.set(sx, sy, sz);

        // Cylindrical Silo Collar (outer diameter 2.6m, depth 4.0m)
        const collarGeom = new THREE.CylinderGeometry(1.3, 1.35, 4.0, 12, 1, true);
        collarGeom.translate(0, -2.0, 0);
        const collarMesh = new THREE.Mesh(collarGeom, wallMat);
        siloGroup.add(collarMesh);

        // Surface Flush Rim Flange
        const rimGeom = new THREE.RingGeometry(1.05, 1.45, 14);
        rimGeom.rotateX(-Math.PI / 2);
        rimGeom.translate(0, 0.04, 0);
        const rimMesh = new THREE.Mesh(rimGeom, rimMat);
        siloGroup.add(rimMesh);

        // Animated Silo Hatch Door (pivots upward when launching)
        const hatchPivot = new THREE.Group();
        hatchPivot.position.set(0, 0.06, -1.2);

        const hatchGeom = new THREE.CylinderGeometry(1.15, 1.15, 0.12, 14);
        const hatchMesh = new THREE.Mesh(hatchGeom, hatchMat);
        hatchMesh.position.set(0, 0.06, 1.2);
        hatchPivot.add(hatchMesh);

        // Hazard Chevron Stripe across hatch
        const stripeGeom = new THREE.BoxGeometry(0.32, 0.14, 2.1);
        const stripeMesh = new THREE.Mesh(stripeGeom, stripeMat);
        stripeMesh.position.set(0, 0.06, 1.2);
        hatchPivot.add(stripeMesh);

        siloGroup.add(hatchPivot);

        const siloObj = {
          index: globalIndex,
          pos: new THREE.Vector3(sx, sy, sz),
          group: siloGroup,
          hatchPivot,
          isOpen: false,
          openProgress: 0.0,
          targetProgress: 0.0,
          isLaunching: false,
          cooldown: 0
        };

        this.silos.push(siloObj);
        this.group.add(siloGroup);
        globalIndex++;
      }
    }
  }

  /**
   * Builds the Fortified Subterranean Command Center Interior at (-500, 12, 300)
   * Chamber spans X in [-516, -484], Y in [10, 16], Z in [284, 316]
   * Constructed from airplane hangar materials (dark slate steel, blast arches, caution chevrons)
   */
  buildCommandCenterInterior() {
    const interiorGroup = new THREE.Group();
    interiorGroup.position.copy(this.center);

    const hangarWallMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Hangar dark slate steel
      roughness: 0.7,
      metalness: 0.75
    });
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.9
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.8
    });
    const hazardMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    // 1. Reinforced Floor (32m x 32m) at local Y = -2.0 (world Y = 10.0)
    const floorGeom = new THREE.BoxGeometry(32, 0.8, 32);
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.position.set(0, -2.0, 0);
    interiorGroup.add(floorMesh);

    // Hazard Yellow Border Ring
    const borderGeom = new THREE.BoxGeometry(28, 0.1, 28);
    const borderMesh = new THREE.Mesh(borderGeom, hazardMat);
    borderMesh.position.set(0, -1.55, 0);
    interiorGroup.add(borderMesh);

    // 2. Heavy Ceiling Slab at local Y = 4.2 (world Y = 16.2)
    const ceilGeom = new THREE.BoxGeometry(32, 1.2, 32);
    const ceilMesh = new THREE.Mesh(ceilGeom, hangarWallMat);
    ceilMesh.position.set(0, 4.2, 0);
    interiorGroup.add(ceilMesh);

    // 3. Perimeter Reinforced Walls
    const wallNorth = new THREE.Mesh(new THREE.BoxGeometry(32, 6, 1.2), hangarWallMat);
    wallNorth.position.set(0, 1.0, 16);
    const wallSouth = new THREE.Mesh(new THREE.BoxGeometry(32, 6, 1.2), hangarWallMat);
    wallSouth.position.set(0, 1.0, -16);
    const wallEast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6, 32), hangarWallMat);
    wallEast.position.set(16, 1.0, 0);
    const wallWest = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6, 32), hangarWallMat);
    wallWest.position.set(-16, 1.0, 0);
    interiorGroup.add(wallNorth, wallSouth, wallEast, wallWest);

    // 4. Structural Hangar Blast Arches
    for (let z = -12; z <= 12; z += 6) {
      const archGeom = new THREE.BoxGeometry(31.6, 0.6, 0.8);
      const arch = new THREE.Mesh(archGeom, archMat);
      arch.position.set(0, 3.5, z);
      interiorGroup.add(arch);
    }

    // 5. Central Strategic Command Table & Consoles
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.95 });
    const tableGeom = new THREE.BoxGeometry(6.4, 0.9, 3.8);
    const table = new THREE.Mesh(tableGeom, tableMat);
    table.position.set(0, -1.1, 0);
    interiorGroup.add(table);

    // Holographic Tactical Holo-Emitter Plate on Table
    const holoPlateMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
    const holoPlate = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.08, 3.2), holoPlateMat);
    holoPlate.position.set(0, -0.6, 0);
    interiorGroup.add(holoPlate);

    // 6. Wall-Mounted Massive Command Center Screens (Facing South wall Z = 15.2)
    // Screen 1: Connected Players Telemetry Monitor (Left: X = -9.5)
    this.canvasTelemetry = this.createDynamicCanvas(512, 256);
    this.textureTelemetry = new THREE.CanvasTexture(this.canvasTelemetry);
    const screenMat1 = new THREE.MeshBasicMaterial({ map: this.textureTelemetry });
    const screenMesh1 = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.8, 0.2), screenMat1);
    screenMesh1.position.set(-9.5, 1.5, 15.3);
    interiorGroup.add(screenMesh1);

    // Screen 2: CCTV Silo Surveillance Feed (Center: X = 0)
    this.canvasCctv = this.createDynamicCanvas(512, 256);
    this.textureCctv = new THREE.CanvasTexture(this.canvasCctv);
    const screenMat2 = new THREE.MeshBasicMaterial({ map: this.textureCctv });
    const screenMesh2 = new THREE.Mesh(new THREE.BoxGeometry(9.6, 4.4, 0.2), screenMat2);
    screenMesh2.position.set(0, 1.7, 15.3);
    interiorGroup.add(screenMesh2);

    // Screen 3: Silo Weapons & Readiness Status (Right: X = 9.5)
    this.canvasStatus = this.createDynamicCanvas(512, 256);
    this.textureStatus = new THREE.CanvasTexture(this.canvasStatus);
    const screenMat3 = new THREE.MeshBasicMaterial({ map: this.textureStatus });
    const screenMesh3 = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.8, 0.2), screenMat3);
    screenMesh3.position.set(9.5, 1.5, 15.3);
    interiorGroup.add(screenMesh3);

    // Biometric Scanner Pedestal at entrance (X = 0, Z = -14)
    const scanMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const scanner = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.2, 12), tableMat);
    scanner.position.set(0, -0.9, -14);
    const scanBeacon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 12), scanMat);
    scanBeacon.position.set(0, -0.25, -14);
    interiorGroup.add(scanner, scanBeacon);

    this.group.add(interiorGroup);
    this.interiorGroup = interiorGroup;

    // Draw initial screen canvases
    this.renderTelemetryCanvas();
    this.renderStatusCanvas();
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

  renderTelemetryCanvas() {
    if (!this.canvasTelemetry || !this.canvasTelemetry.getContext) return;
    const ctx = this.canvasTelemetry.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 512, 256);

    // Header
    ctx.fillStyle = '#06b6d4';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('📡 MONITOR DE EXPLORADORES (VIVO)', 20, 32);

    // Divider line
    ctx.strokeStyle = '#0891b2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 44);
    ctx.lineTo(492, 44);
    ctx.stroke();

    const dir = this.multiplayer?.playerDirectory;
    const players = dir ? Array.from(dir.values()) : [];

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText(`Conectados: ${players.length} | Búnker: PROTEGIDO`, 20, 68);

    let y = 96;
    for (let i = 0; i < Math.min(6, players.length); i++) {
      const p = players[i];
      const isMe = (p.id === this.multiplayer?.myId);
      ctx.fillStyle = isMe ? '#22c55e' : '#f8fafc';
      ctx.font = 'bold 15px monospace';
      const posStr = p.pos ? `(${Math.floor(p.pos[0])}, ${Math.floor(p.pos[1])}, ${Math.floor(p.pos[2])})` : '(---)';
      ctx.fillText(`[${i + 1}] ${p.name || 'Jugador'} ${isMe ? '(ADMIN)' : ''}`, 24, y);
      ctx.fillStyle = '#38bdf8';
      ctx.font = '13px monospace';
      ctx.fillText(posStr, 340, y);
      y += 24;
    }

    if (players.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = 'italic 15px monospace';
      ctx.fillText('Esperando telemetría de jugadores...', 24, 110);
    }

    if (this.textureTelemetry) this.textureTelemetry.needsUpdate = true;
  }

  renderStatusCanvas() {
    if (!this.canvasStatus || !this.canvasStatus.getContext) return;
    const ctx = this.canvasStatus.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 512, 256);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('🚀 ESTADO DE LOS 180 SILOS', 20, 32);

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 44);
    ctx.lineTo(492, 44);
    ctx.stroke();

    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('SILOS ACTIVOS: 180 / 180 LISTOS [100%]', 20, 72);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px monospace';
    ctx.fillText('POTENCIA DE OJIVA: 2X (Radio 18m, 8X TNT)', 20, 98);
    ctx.fillText('TIPO DE PROPULSIÓN: HIPERSÓNICA MULTICOLOR', 20, 122);
    ctx.fillText('BLINDAJE SUBTERRÁNEO: HANGAR TITANIO NIVEL 5', 20, 146);

    // Defense status box
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(20, 168, 472, 68);
    ctx.strokeStyle = '#38bdf8';
    ctx.strokeRect(20, 168, 472, 68);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('🛡️ MODO DEFENSIVO: BÚNKER MANUAL', 34, 192);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText('Contraataque auto DESACTIVADO. Pulsa BOTÓN AZUL para interceptar.', 34, 214);

    if (this.textureStatus) this.textureStatus.needsUpdate = true;
  }

  initCctvRenderer() {
    // Security Camera perspective looking down at the surface silos
    this.cctvCamera = new THREE.PerspectiveCamera(55, 2, 1, 500);
    this.cctvCamera.position.set(-500, 78, 230); // High overlooking perch
    this.cctvCamera.lookAt(new THREE.Vector3(-500, 24, 300));
  }

  renderCctvFeed() {
    if (!this.canvasCctv || !this.canvasCctv.getContext) return;
    const ctx = this.canvasCctv.getContext('2d');
    if (!ctx) return;

    // Draw simulated cinematic CCTV feed with animated missile launches and radar sweep
    ctx.fillStyle = '#041014';
    ctx.fillRect(0, 0, 512, 256);

    // Surveillance grid lines
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 512; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Concentric silo radar circles
    const cx = 256;
    const cy = 128;
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.lineWidth = 1.5;
    [35, 65, 95].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Draw active silos
    const now = Date.now();
    ctx.fillStyle = '#22c55e';
    for (let i = 0; i < this.silos.length; i += 4) {
      const s = this.silos[i];
      const rx = cx + (s.pos.x - this.surfaceCenter.x) * 1.5;
      const ry = cy + (s.pos.z - this.surfaceCenter.z) * 1.5;
      if (s.isOpen || s.isLaunching) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(rx - 3, ry - 3, 6, 6);
      } else {
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
      }
    }

    // Scanning sweep line
    const sweepAngle = (now / 1200) % (Math.PI * 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * 105, cy + Math.sin(sweepAngle) * 105);
    ctx.stroke();

    // CCTV Timestamp & Cam Stamp
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('CAM-01 [VISTA SUPERFICIE SILOS - ELEVADA]', 16, 22);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px monospace';
    ctx.fillText(`REC ● ${new Date().toLocaleTimeString()} FPS: 60`, 16, 242);
    ctx.fillText('ANG: 45° OBS | ZOOM: 1.0X', 330, 242);

    if (this.textureCctv) this.textureCctv.needsUpdate = true;
  }

  /**
   * Initializes the Interactive Tactical Bunker HUD
   */
  initBunkerUI() {
    if (typeof document === 'undefined') return;

    // Create Bunker Control Modal if not already present
    let modal = document.getElementById('bunker-command-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bunker-command-modal';
      modal.className = 'bunker-modal hidden';
      modal.innerHTML = `
        <div class="bunker-modal-card">
          <div class="bunker-modal-header">
            <div class="bm-title">🎖️ CENTRO DE MANDO SUBTERRÁNEO — BÚNKER SUPREMO</div>
            <button id="bm-close-btn" class="bm-close">✕</button>
          </div>
          <div class="bunker-modal-body">
            <div class="bm-section">
              <label>SELECCIÓN DE OBJETIVO:</label>
              <select id="bm-target-select" class="bm-select">
                <option value="">Cargando exploradores...</option>
              </select>
            </div>

            <div class="bm-section">
              <label>SALVA DE MISILES (SILOS ACTIVOS: 180):</label>
              <div class="bm-salvo-buttons">
                <button class="bm-count-btn active" data-count="1">1 Misil</button>
                <button class="bm-count-btn" data-count="5">5 Misiles</button>
                <button class="bm-count-btn" data-count="10">10 Misiles</button>
                <button class="bm-count-btn" data-count="30">30 Misiles</button>
                <button class="bm-count-btn" data-count="60">60 Misiles</button>
                <button class="bm-count-btn highlight" data-count="180">🚀 180 TOTAL</button>
              </div>
            </div>

            <div class="bm-section">
              <label>COLOR DE PROPULSIÓN DE OJIVA (HIPERSÓNICA):</label>
              <div class="bm-color-buttons">
                ${this.flameColors.map((c, i) => `
                  <button class="bm-color-btn ${i === 0 ? 'active' : ''}" data-hex="${c.hex}" style="border-color:${'#' + c.hex.toString(16).padStart(6, '0')}">
                    ${c.label}
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="bm-actions">
              <button id="bm-launch-red-btn" class="bm-btn-red">
                🚀 LANZAR SALVA DE SILOS (PODER 2X)
              </button>
              <button id="bm-intercept-blue-btn" class="bm-btn-blue">
                🛡️ INTERCEPTOR MANUAL DIRECTO
              </button>
            </div>

            <div class="bm-status-pill">
              🛡️ BLINDAJE ACTIVO: INMUNE A MISILES ENEMIGOS | DEFENSA 100% MANUAL
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      this.bunkerModal = modal;

      // Event listeners
      const closeBtn = modal.querySelector('#bm-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.toggleBunkerHUD(false));
      }

      // Count buttons
      this.selectedCount = 1;
      const countBtns = modal.querySelectorAll('.bm-count-btn');
      countBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          countBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.selectedCount = parseInt(btn.dataset.count, 10) || 1;
        });
      });

      // Color buttons
      const colorBtns = modal.querySelectorAll('.bm-color-btn');
      colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          colorBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.selectedFlameColor = parseInt(btn.dataset.hex, 10) || 0xff6600;
        });
      });

      // Red Launch Button
      const redBtn = modal.querySelector('#bm-launch-red-btn');
      if (redBtn) {
        redBtn.addEventListener('click', () => {
          const sel = modal.querySelector('#bm-target-select');
          const targetId = sel ? sel.value : null;
          this.launchSalvoFromBunker(this.selectedCount, targetId, this.selectedFlameColor);
          this.toggleBunkerHUD(false);
        });
      }

      // Blue Intercept Button
      const blueBtn = modal.querySelector('#bm-intercept-blue-btn');
      if (blueBtn) {
        blueBtn.addEventListener('click', () => {
          this.launchManualInterceptor();
          this.toggleBunkerHUD(false);
        });
      }

      // Hotkey 'E': toggles bunker console when inside bunker near command center
      window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyE' || e.key === 'e' || e.key === 'E') {
          if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
          if (this.lastPlayerPos && this.isPlayerInsideBunker(this.lastPlayerPos)) {
            const lp = this.lastPlayerPos;
            const dist = Math.hypot(lp.x - this.center.x, lp.y - this.center.y, lp.z - this.center.z);
            if (dist <= 14) {
              this.toggleBunkerHUD();
            }
          }
        }
      });
    }
  }

  toggleBunkerHUD(open = null) {
    if (!this.bunkerModal) return;
    const isVis = !this.bunkerModal.classList.contains('hidden');
    const targetState = (open !== null) ? open : !isVis;

    if (targetState) {
      this.populateTargetSelect();
      this.bunkerModal.classList.remove('hidden');
    } else {
      this.bunkerModal.classList.add('hidden');
    }
  }

  populateTargetSelect() {
    if (!this.bunkerModal) return;
    const select = this.bunkerModal.querySelector('#bm-target-select');
    if (!select) return;

    select.innerHTML = '';
    const dir = this.multiplayer?.playerDirectory;
    if (!dir || dir.size === 0) {
      select.innerHTML = '<option value="">No hay otros jugadores conectados</option>';
      return;
    }

    let added = 0;
    for (const p of dir.values()) {
      if (p.id === this.multiplayer?.myId) continue;
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name || 'Jugador'} - (${Math.floor(p.pos?.[0] || 0)}, ${Math.floor(p.pos?.[1] || 25)}, ${Math.floor(p.pos?.[2] || 0)})`;
      select.appendChild(opt);
      added++;
    }

    if (added === 0) {
      select.innerHTML = '<option value="">Sin objetivos remotos (prueba solo)</option>';
    }
  }

  /**
   * Returns true if the given position is inside the subterranean bunker chamber
   */
  isPlayerInsideBunker(pos) {
    if (!pos) return false;
    return isInsideBunkerInterior(pos.x, pos.y, pos.z);
  }

  /**
   * Launches a salvo of Silo Missiles (from 1 up to 180) with 2X power and custom colored flames
   */
  launchSalvoFromBunker(count = 1, targetPlayerId = null, colorHex = 0xff6600) {
    const launchCount = Math.max(1, Math.min(180, count));

    // Choose target position
    let targetPos = [0, 25, 0];
    let targetName = 'Área Designada';
    if (targetPlayerId && this.multiplayer?.playerDirectory?.has(targetPlayerId)) {
      const p = this.multiplayer.playerDirectory.get(targetPlayerId);
      targetPos = p.pos ? [...p.pos] : [0, 25, 0];
      targetName = p.name || 'Objetivo';
    } else {
      // Find nearest remote player
      const dir = this.multiplayer?.playerDirectory;
      if (dir) {
        for (const p of dir.values()) {
          if (p.id !== this.multiplayer?.myId) {
            targetPlayerId = p.id;
            targetPos = p.pos ? [...p.pos] : [0, 25, 0];
            targetName = p.name || 'Objetivo';
            break;
          }
        }
      }
    }

    // Play launch rumble
    if (this.sound && typeof this.sound.playMissileLaunch === 'function') {
      this.sound.playMissileLaunch();
    }

    // Sequential firing sequence across silos
    for (let i = 0; i < launchCount; i++) {
      const siloIndex = i % this.silos.length;
      const delay = (launchCount > 1) ? (i * 45) : 0; // Rapid cinematic ripple fire!

      setTimeout(() => {
        this.fireSingleSilo(siloIndex, targetPlayerId, targetPos, targetName, colorHex);
      }, delay);
    }

    // Sync to server
    if (this.multiplayer && typeof this.multiplayer.send === 'function') {
      this.multiplayer.send('admin_launch_missile', {
        targetPlayerId: targetPlayerId || 'area_strike',
        targetPos,
        count: launchCount,
        isSiloLaunch: true,
        flameColor: colorHex
      });
    }

    // Announce in chat
    if (this.multiplayer?.addChat) {
      this.multiplayer.addChat({
        senderName: 'SISTEMA DE SILOS',
        text: `🚀 ¡Salva de ${launchCount} misiles de silo (Poder 2X) lanzada hacia ${targetName}!`,
        system: true
      });
    }
  }

  /**
   * Animates a single silo hatch open, spawns a 2X colossal missile, and closes hatch
   */
  fireSingleSilo(siloIndex, targetPlayerId, targetPos, targetName, colorHex) {
    const silo = this.silos[siloIndex];
    if (!silo) return;

    silo.isOpen = true;
    silo.targetProgress = 1.0;
    silo.isLaunching = true;

    // Spawn massive launch smoke and sparks at silo surface
    if (this.particleManager && typeof this.particleManager.spawnDebris === 'function') {
      this.particleManager.spawnDebris(silo.pos.x, silo.pos.y + 0.5, silo.pos.z, 28);
    }

    // Spawn missile directly out of silo shaft
    if (this.missileManager && typeof this.missileManager.spawnMissile === 'function') {
      const missileId = 'silo_msl_' + Date.now() + '_' + siloIndex + '_' + Math.floor(Math.random() * 1000);
      const payload = {
        missileId,
        launcherId: this.multiplayer?.myId || 'ADMIN_BUNKER',
        launcherName: 'Búnker jsieiragerpe',
        targetPlayerId,
        targetName,
        startPos: [silo.pos.x, silo.pos.y + 1.2, silo.pos.z],
        targetPos,
        startYaw: Math.atan2(targetPos[0] - silo.pos.x, targetPos[2] - silo.pos.z),
        power: 8, // 2X power! (radius 18m)
        launchType: 'land',
        colorHex,
        isSiloMissile: true
      };
      this.missileManager.spawnMissile(payload);
    }

    // Close hatch after missile clears shaft (1.8s)
    setTimeout(() => {
      silo.isOpen = false;
      silo.targetProgress = 0.0;
      silo.isLaunching = false;
    }, 1800);
  }

  /**
   * Launches a Manual Kinetic Interceptor (Blue Button)
   * Directly intercepts and obliterates incoming hostile missiles targeting the bunker or admin
   */
  launchManualInterceptor() {
    let closestThreat = null;
    let closestDist = Infinity;

    if (this.missileManager && this.missileManager.missiles) {
      for (const m of this.missileManager.missiles.values()) {
        if (!m.isInterceptor && !m.isRetaliation && !m.isDetonated && !m.isDestroyedMidAir) {
          // Ignore own missiles
          if (m.launcherId === this.multiplayer?.myId || m.launcherName === 'jsieiragerpe') continue;

          const dist = m.pos.distanceTo(this.surfaceCenter);
          if (dist < closestDist) {
            closestDist = dist;
            closestThreat = m;
          }
        }
      }
    }

    if (!closestThreat) {
      if (this.multiplayer?.showNotification) {
        this.multiplayer.showNotification('🛡️ [INTERCEPTOR MANUAL] Escaneando espacio aéreo... No hay misiles hostiles entrantes.');
      }
      return;
    }

    // Fire direct interceptor from Silo 0
    const silo = this.silos[0];
    const sx = silo ? silo.pos.x : this.surfaceCenter.x;
    const sy = silo ? silo.pos.y + 1.5 : this.surfaceCenter.y + 1.5;
    const sz = silo ? silo.pos.z : this.surfaceCenter.z;

    if (silo) {
      silo.isOpen = true;
      silo.targetProgress = 1.0;
      setTimeout(() => {
        silo.isOpen = false;
        silo.targetProgress = 0.0;
      }, 1500);
    }

    if (this.missileManager && typeof this.missileManager.launchSingleInterceptor === 'function') {
      this.missileManager.launchSingleInterceptor(closestThreat, [sx, sy, sz]);
    }

    if (this.sound && typeof this.sound.playMissileLaunch === 'function') {
      this.sound.playMissileLaunch();
    }

    if (this.multiplayer?.showNotification) {
      this.multiplayer.showNotification('🚀 [INTERCEPTOR MANUAL] ¡Misil cinético directo lanzado! Neutralizando amenaza...');
    }

    if (this.multiplayer?.addChat) {
      this.multiplayer.addChat({
        senderName: 'DEFENSA BÚNKER',
        text: '🛡️ [INTERCEPCIÓN MANUAL] Misil interceptor lanzado desde silo subterráneo.',
        system: true
      });
    }
  }

  /**
   * Per-frame animation update for silo hatches, screens, and CCTV surveillance
   */
  update(dt, playerPos) {
    // 1. Animate Silo Hatch Doors (swing upward to 85 degrees when opening)
    for (const silo of this.silos) {
      if (Math.abs(silo.openProgress - silo.targetProgress) > 0.01) {
        const step = dt * 3.5;
        if (silo.openProgress < silo.targetProgress) {
          silo.openProgress = Math.min(silo.targetProgress, silo.openProgress + step);
        } else {
          silo.openProgress = Math.max(silo.targetProgress, silo.openProgress - step);
        }
        if (silo.hatchPivot) {
          silo.hatchPivot.rotation.x = -silo.openProgress * 1.48; // Swing up to ~85 degrees
        }
      }
    }

    // 2. Throttled Screen Updates (every 0.5s)
    this.screenTimer = (this.screenTimer || 0) + dt;
    if (this.screenTimer >= 0.5) {
      this.screenTimer = 0;
      this.renderTelemetryCanvas();
      this.renderStatusCanvas();
      this.renderCctvFeed();
    }

    // 3. Check proximity to command console for prompt
    if (playerPos) {
      this.lastPlayerPos = playerPos;
      const distToConsole = Math.hypot(
        playerPos.x - this.center.x,
        playerPos.y - this.center.y,
        playerPos.z - this.center.z
      );
      const isInside = this.isPlayerInsideBunker(playerPos);

      // Biometric rejection for unauthorized intruders
      const isAdmin = (this.multiplayer?.myEmail === 'jsieiragerpe@gmail.com' || this.multiplayer?.myName === 'jsieiragerpe');
      if (isInside && !isAdmin) {
        // Repel outside
        if (this.multiplayer?.physics?.teleport) {
          this.multiplayer.physics.teleport(-430, 25, 300);
        }
        if (this.multiplayer?.showNotification) {
          this.multiplayer.showNotification('🛡️ Acceso denegado: Búnker Subterráneo exclusivo para jsieiragerpe.');
        }
      }

      // Proximity prompt for command console HUD
      const promptElem = document.getElementById('bunker-console-prompt');
      if (promptElem) {
        if (isInside && isAdmin && distToConsole <= 12) {
          promptElem.classList.remove('hidden');
        } else {
          promptElem.classList.add('hidden');
        }
      }
    }
  }
}
