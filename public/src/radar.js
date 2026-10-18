// public/src/radar.js
// Exclusive Admin Holographic Tactical Radar HUD
// 2D real-time scale display of all players, active homing missiles with matching target colors,
// directional flight arrows, live distance readouts, and collapsible/minimizable floating widget.

export class TacticalRadar {
  constructor(multiplayer, missileManager) {
    this.multiplayer = multiplayer;
    this.missileManager = missileManager;

    this.isOpen = false;
    this.isMinimized = false;
    this.sweepAngle = 0;
    this.radarRange = 1200; // Radius in meters shown on radar

    // World landmark anchors for orientation
    this.landmarks = [
      { name: 'Plaza', icon: '🏰', x: 0, z: 0 },
      { name: 'Japón', icon: '⛩️', x: 250, z: 250 },
      { name: 'China', icon: '🏮', x: -250, z: 250 },
      { name: 'París', icon: '🗼', x: 250, z: -250 },
      { name: 'NY', icon: '🗽', x: -250, z: -250 },
      { name: 'Fiordos', icon: '🏔️', x: 0, z: 500 },
      { name: 'Playa', icon: '🏖️', x: 0, z: -500 },
      { name: 'Fuji', icon: '🗻', x: 500, z: 500 },
      { name: 'Circuito', icon: '🏎️', x: -500, z: -500 }
    ];

    this.createDOM();
  }

  createDOM() {
    if (typeof document === 'undefined') return;

    // Main Floating Tactical Radar Container
    const container = document.createElement('div');
    container.id = 'tactical-radar-panel';
    container.className = 'tactical-radar-panel hidden';

    container.innerHTML = `
      <div class="radar-header">
        <div class="radar-title">
          <span class="radar-pulse-dot"></span>
          <strong>RADAR TÁCTICO DE MISILES (ADMIN)</strong>
        </div>
        <div class="radar-controls">
          <button id="radar-btn-minimize" class="mc-btn radar-ctrl-btn" title="Minimizar">➖</button>
          <button id="radar-btn-close" class="mc-btn radar-ctrl-btn" title="Cerrar">&times;</button>
        </div>
      </div>

      <div id="radar-body" class="radar-body">
        <div class="radar-viewport-wrap">
          <canvas id="tactical-radar-canvas" width="340" height="340"></canvas>
          <div class="radar-range-badge">RANGO: 1200m</div>
        </div>

        <div class="radar-sidebar">
          <div class="radar-section-title">MISILES EN VUELO</div>
          <div id="radar-missiles-list" class="radar-missiles-list">
            <div class="radar-empty-hint">Ningún misil en vuelo. Selecciona un objetivo para lanzar.</div>
          </div>

          <div class="radar-section-title">OBJETIVOS DISPONIBLES</div>
          <div id="radar-targets-list" class="radar-targets-list"></div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    this.panelElem = container;
    this.bodyElem = container.querySelector('#radar-body');
    this.canvas = container.querySelector('#tactical-radar-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.missilesListElem = container.querySelector('#radar-missiles-list');
    this.targetsListElem = container.querySelector('#radar-targets-list');

    // Minimized Floating Pill Widget
    const pill = document.createElement('div');
    pill.id = 'radar-floating-pill';
    pill.className = 'radar-floating-pill hidden';
    pill.innerHTML = `
      <span class="radar-pill-dot"></span>
      <span id="radar-pill-text">📡 Radar Misiles [0]</span>
      <button id="radar-pill-expand" class="radar-pill-btn">Expandir ↗</button>
    `;
    document.body.appendChild(pill);
    this.pillElem = pill;
    this.pillTextElem = pill.querySelector('#radar-pill-text');

    // Listeners
    const btnMin = container.querySelector('#radar-btn-minimize');
    if (btnMin) {
      btnMin.addEventListener('click', () => this.toggleMinimize());
    }
    const btnClose = container.querySelector('#radar-btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.toggle(false));
    }
    const btnExpand = pill.querySelector('#radar-pill-expand');
    if (btnExpand) {
      btnExpand.addEventListener('click', () => this.toggleMinimize(false));
    }
    pill.addEventListener('click', (e) => {
      if (e.target !== btnExpand) this.toggleMinimize(false);
    });
  }

  toggle(open = null) {
    this.isOpen = (open !== null) ? open : !this.isOpen;
    if (this.panelElem) {
      this.panelElem.classList.toggle('hidden', !this.isOpen || this.isMinimized);
    }
    if (this.pillElem) {
      this.pillElem.classList.toggle('hidden', !this.isOpen || !this.isMinimized);
    }
  }

  toggleMinimize(min = null) {
    this.isMinimized = (min !== null) ? min : !this.isMinimized;
    if (this.panelElem) {
      this.panelElem.classList.toggle('hidden', !this.isOpen || this.isMinimized);
    }
    if (this.pillElem) {
      this.pillElem.classList.toggle('hidden', !this.isOpen || !this.isMinimized);
    }
  }

  /**
   * Main radar update loop
   */
  update(dt, playerPos) {
    if (!this.isOpen && this.pillElem && this.pillElem.classList.contains('hidden')) return;

    this.sweepAngle += dt * 2.2;
    if (this.sweepAngle > Math.PI * 2) {
      this.sweepAngle -= Math.PI * 2;
    }

    const activeMissiles = this.missileManager ? this.missileManager.getActiveMissiles() : [];

    // Update pill text counter
    if (this.pillTextElem) {
      this.pillTextElem.textContent = `📡 Radar Misiles [${activeMissiles.length} en vuelo]`;
    }

    if (this.isMinimized || !this.isOpen) return;

    // Render Canvas Radar Display
    this.renderCanvas(playerPos, activeMissiles);

    // Update Telemetry Sidebar
    this.updateSidebar(playerPos, activeMissiles);
  }

  renderCanvas(playerPos, activeMissiles) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) - 10;

    ctx.clearRect(0, 0, w, h);

    // Background circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 18, 14, 0.92)';
    ctx.fill();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.clip();

    // Concentric Range Rings (200m, 500m, 800m, 1200m)
    const ranges = [200, 500, 800, 1200];
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.28)';
    ctx.lineWidth = 1;
    for (const r of ranges) {
      const ringPx = (r / this.radarRange) * radius;
      ctx.beginPath();
      ctx.arc(cx, cy, ringPx, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(16, 185, 129, 0.65)';
      ctx.font = '9px monospace';
      ctx.fillText(`${r}m`, cx + 4, cy - ringPx + 11);
    }

    // Crosshairs & Compass Cardinal Marks
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - radius + 15);
    ctx.fillText('S', cx, cy + radius - 6);
    ctx.fillText('W', cx - radius + 14, cy + 4);
    ctx.fillText('E', cx + radius - 14, cy + 4);

    // Rotating Radar Sweep Beam
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0.0)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.25)');

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, this.sweepAngle - 0.45, this.sweepAngle);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // World Landmarks plotted
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    for (const lm of this.landmarks) {
      const screenX = cx + (lm.x / this.radarRange) * radius;
      const screenY = cy + (lm.z / this.radarRange) * radius;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(lm.icon, screenX, screenY);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
      ctx.fillText(lm.name, screenX, screenY + 11);
    }

    // Plot Online Players (Targets)
    const playerDir = this.multiplayer ? this.multiplayer.playerDirectory : null;
    if (playerDir) {
      for (const p of playerDir.values()) {
        if (p.id === this.multiplayer.myId) continue;
        const px = p.pos ? p.pos[0] : 0;
        const pz = p.pos ? p.pos[2] : 0;
        const sx = cx + (px / this.radarRange) * radius;
        const sy = cy + (pz / this.radarRange) * radius;

        const colorHex = this.missileManager ? this.missileManager.getColorForPlayer(p.id) : 0x06b6d4;
        const colorCss = '#' + colorHex.toString(16).padStart(6, '0');

        // Target glowing blip
        ctx.beginPath();
        ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = colorCss;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = colorCss;
        ctx.font = 'bold 10px monospace';
        ctx.fillText(p.name || 'Player', sx, sy - 7);
      }
    }

    // Plot Admin (Self) Position
    if (playerPos) {
      const ax = cx + (playerPos.x / this.radarRange) * radius;
      const ay = cy + (playerPos.z / this.radarRange) * radius;
      ctx.beginPath();
      ctx.arc(ax, ay, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('ADMIN (TÚ)', ax, ay + 12);
    }

    // Plot Active Guided Missiles (Directional Arrows with matching target color)
    for (const m of activeMissiles) {
      const mx = cx + (m.pos[0] / this.radarRange) * radius;
      const my = cy + (m.pos[2] / this.radarRange) * radius;

      const colorCss = '#' + m.colorHex.toString(16).padStart(6, '0');
      const angle = Math.atan2(m.forward[2], m.forward[0]);

      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle);

      // Missile Arrow shape pointing along forward vector
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-7, -5);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, 5);
      ctx.closePath();
      ctx.fillStyle = colorCss;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.restore();

      // Missile Distance tag
      ctx.fillStyle = '#fef08a';
      ctx.font = '9px monospace';
      ctx.fillText(`🚀 ${Math.round(m.distance)}m`, mx, my - 9);
    }

    ctx.restore();
  }

  updateSidebar(playerPos, activeMissiles) {
    if (!this.missilesListElem || !this.targetsListElem) return;

    // 1. In-flight missiles
    if (activeMissiles.length === 0) {
      this.missilesListElem.innerHTML = `<div class="radar-empty-hint">Ningún misil en vuelo. Haz clic en "🚀 Lanzar" en la lista inferior.</div>`;
    } else {
      let mHtml = '';
      for (const m of activeMissiles) {
        const colorCss = '#' + m.colorHex.toString(16).padStart(6, '0');
        const isCritical = m.distance <= 50;
        const eta = (m.speed > 0) ? (m.distance / m.speed).toFixed(1) : '--';
        mHtml += `
          <div class="radar-missile-card ${isCritical ? 'critical' : ''}">
            <div class="rm-header">
              <span class="rm-tag" style="background:${colorCss}"></span>
              <strong>${m.id}</strong> ➔ <span>${m.targetName}</span>
            </div>
            <div class="rm-stats">
              <span>Dist: <strong>${Math.round(m.distance)}m</strong></span>
              <span>Vel: <strong>${Math.round(m.speed)} m/s</strong></span>
              <span>ETA: <strong>${eta}s</strong></span>
            </div>
            ${isCritical ? '<div class="rm-alert">⚠️ IMPACTO INMINENTE</div>' : ''}
            ${m.targetDisconnected ? '<div class="rm-disconnected">⚠️ Objetivo desconectado: guiando a última pos.</div>' : ''}
          </div>
        `;
      }
      this.missilesListElem.innerHTML = mHtml;
    }

    // 2. Targets list
    const playerDir = this.multiplayer ? this.multiplayer.playerDirectory : null;
    let tHtml = '';
    let targetCount = 0;

    if (playerDir) {
      for (const p of playerDir.values()) {
        if (p.id === this.multiplayer.myId) continue;
        targetCount++;
        const colorHex = this.missileManager ? this.missileManager.getColorForPlayer(p.id) : 0x06b6d4;
        const colorCss = '#' + colorHex.toString(16).padStart(6, '0');
        const px = p.pos ? Math.floor(p.pos[0]) : 0;
        const py = p.pos ? Math.floor(p.pos[1]) : 25;
        const pz = p.pos ? Math.floor(p.pos[2]) : 0;

        let distFromAdmin = '--';
        if (playerPos) {
          distFromAdmin = Math.round(Math.hypot(px - playerPos.x, pz - playerPos.z)) + 'm';
        }

        tHtml += `
          <div class="radar-target-card">
            <div class="rt-info">
              <span class="rt-color" style="background:${colorCss}"></span>
              <div>
                <strong>${p.name || 'Player'}</strong>
                <div class="rt-coords">(${px}, ${py}, ${pz}) • ${distFromAdmin}</div>
              </div>
            </div>
            <button class="mc-btn radar-launch-btn" data-target-id="${p.id}" data-target-name="${p.name || 'Player'}">
              🚀 Lanzar
            </button>
          </div>
        `;
      }
    }

    if (targetCount === 0) {
      this.targetsListElem.innerHTML = `<div class="radar-empty-hint">No hay otros jugadores en la sala. Esperando exploradores...</div>`;
    } else {
      this.targetsListElem.innerHTML = tHtml;

      // Attach launch click handlers
      const launchBtns = this.targetsListElem.querySelectorAll('.radar-launch-btn');
      launchBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.dataset.targetId;
          const targetName = btn.dataset.targetName;
          if (this.multiplayer && typeof this.multiplayer.sendAdminLaunchMissile === 'function') {
            this.multiplayer.sendAdminLaunchMissile(targetId);
          }
        });
      });
    }
  }
}
