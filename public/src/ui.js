// public/src/ui.js
// Modern game UI: Lobby, HUD, Hotbar, Inventory, Pause menu, Chat, Mobile Virtual Controls & Interactive Tutorial
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, HOTBAR_BLOCKS } from './blocks.js';
import { sound } from './audio.js';

export const LANDMARKS = [
  {
    id: 'spawn',
    name: 'Plaza Central (0, 0)',
    icon: '🏰',
    x: 0,
    y: 25,
    z: 0,
    desc: 'XYZ (0, 25, 0) • Altar Dorado & Guardianes'
  },
  {
    id: 'japan',
    name: 'Japón Imperial (+250, +250)',
    icon: '⛩️',
    x: 250,
    y: 25,
    z: 250,
    desc: 'XYZ (+250, 25, +250) • Gran Pagoda, Torii & Sakura'
  },
  {
    id: 'china',
    name: 'China y Shanghai (-250, +250)',
    icon: '🏮',
    x: -250,
    y: 25,
    z: 250,
    desc: 'XYZ (-250, 25, +250) • Torre Spire & Linternas'
  },
  {
    id: 'paris',
    name: 'París y Torre Eiffel (+250, -250)',
    icon: '🗼',
    x: 250,
    y: 25,
    z: -250,
    desc: 'XYZ (+250, 25, -250) • Réplica Torre Eiffel 3 Niveles'
  },
  {
    id: 'newyork',
    name: 'Nueva York (-250, -250)',
    icon: '🗽',
    x: -250,
    y: 25,
    z: -250,
    desc: 'XYZ (-250, 25, -250) • Rascacielos Empire Art Déco'
  },
  {
    id: 'norway',
    name: 'Fiordos de Noruega (0, +500)',
    icon: '🏔️',
    x: 0,
    y: 50,
    z: 500,
    desc: 'XYZ (0, 50, +500) • Acantilados, Cascadas & Taiga'
  },
  {
    id: 'beach',
    name: 'Playa Paraíso (0, -500)',
    icon: '🏖️',
    x: 0,
    y: 20,
    z: -500,
    desc: 'XYZ (0, 20, -500) • Resort de Lujo, Gran Faro, Yate & Arrecife'
  },
  {
    id: 'fuji',
    name: '🗻 Monte Fuji (+350, +350)',
    icon: '🗻',
    x: 350,
    y: 26,
    z: 350,
    desc: 'XYZ (+350, 26, +350) • Volcán Colosal, Cráter Nevado, Lagos & Torii Flotante'
  },
  {
    id: 'circuit',
    name: 'Gran Circuito de Velocidad (110, -60)',
    icon: '🏎️',
    x: 110,
    y: 25,
    z: -60,
    desc: 'XYZ (110, 25, -60) • Pista Internacional, Gradas, Boxes, Lago & Túneles'
  }
];

export class UIManager {
  constructor(materialManager, controls, sceneManager, world, multiplayer, animalManager = null, vehicleManager = null) {
    this.materials = materialManager;
    this.controls = controls;
    this.physics = controls?.physics;
    this.sceneManager = sceneManager;
    this.world = world;
    this.multiplayer = multiplayer;
    this.animalManager = animalManager;
    this.vehicleManager = vehicleManager || controls?.vehicleManager || null;

    // Telemetry and session state
    this.sessionStartTime = Date.now();
    this.fpsHistory = [];
    this.fpsTelemetryCanvas = document.getElementById('fps-telemetry-canvas');
    this.fpsCanvasCtx = this.fpsTelemetryCanvas?.getContext ? this.fpsTelemetryCanvas.getContext('2d') : null;
    this.boostEnabled = false;
    this.weaponsEnabled = true;

    // Elements
    this.lobbyOverlay = document.getElementById('lobby-overlay');
    this.hudOverlay = document.getElementById('hud-overlay');
    this.pauseMenu = document.getElementById('pause-menu');
    this.inventoryModal = document.getElementById('inventory-modal');
    this.guideModal = document.getElementById('guide-modal');
    this.mapModal = document.getElementById('map-modal') || document.getElementById('world-map-modal');
    this.worldMapModal = this.mapModal;
    this.hudOnlineCount = document.getElementById('hud-online-count');
    this.hudSpeedBtn = document.getElementById('hud-speed-btn') || document.getElementById('hud-speed-pill') || document.getElementById('btn-speed-toggle');
    this.mobileOverlay = document.getElementById('mobile-touch-overlay');
    this.chatContainer = document.getElementById('chat-container');
    this.chatInput = document.getElementById('chat-input');
    this.hotbarContainer = document.getElementById('hotbar');
    this.playerListOverlay = document.getElementById('player-list-modal');

    this.hotbarBlocks = [...HOTBAR_BLOCKS];
    this.isChatOpen = false;
    this.isInventoryOpen = false;
    this.isGuideOpen = false;
    this.isMapOpen = false;
    this.isPlayerListOpen = false;
    this.currentSpeedTier = 1; // 1: 1x, 2: 2.5x, 3: 5x flight
    this.tacticalRadar = null;

    // Wire controls callbacks
    if (this.controls) {
      this.controls.onToggleMap = () => {
        sound.playClick();
        this.toggleMap(!this.isMapOpen);
      };
      this.controls.onCycleSpeed = (mult, flight) => {
        this.updateSpeedUI(mult, flight);
      };
      this.controls.onSpeedChange = (mult, flight) => {
        this.updateSpeedUI(mult, flight);
      };
      this.controls.onAimChange = (isAiming) => {
        const crosshair = document.getElementById('crosshair');
        const scopeOverlay = document.getElementById('rifle-scope-overlay');
        if (crosshair) {
          if (isAiming && (!scopeOverlay || !scopeOverlay.classList.contains('hidden') || (this.controls.aimBlend > 0.82))) {
            crosshair.classList.add('hidden');
          } else if (!isAiming) {
            crosshair.classList.remove('hidden');
          }
        }
      };
      if (!this.controls.particleManager) {
        this.controls.particleManager = this.multiplayer?.particles || this.sceneManager?.particleManager || null;
      }
    }

    // 3D wireframe box for highlighting targeted voxel
    this.buildHighlightBox();

    // Setup real-time multiplayer player count and teleport listener
    if (this.multiplayer) {
      this.multiplayer.onPlayerCountChange = (count) => {
        this.updatePlayerCountBadge(count);
        if (this.isPlayerListOpen) {
          this.updatePlayerListModal(true);
        }
      };

      this.multiplayer.onTeleportConfirm = (x, y, z, targetName) => {
        const px = typeof x === 'number' ? x : parseFloat(x);
        const py = typeof y === 'number' ? y : parseFloat(y);
        const pz = typeof z === 'number' ? z : parseFloat(z);

        if (this.physics && typeof this.physics.teleport === 'function') {
          this.physics.teleport(px, py + 1, pz);
        } else if (this.controls?.physics && typeof this.controls.physics.teleport === 'function') {
          this.controls.physics.teleport(px, py + 1, pz);
        }

        if (typeof sound.playTeleport === 'function') {
          sound.playTeleport();
        } else if (typeof sound.playClick === 'function') {
          sound.playClick();
        }

        if (this.world && typeof this.world.updateStreaming === 'function') {
          this.world.updateStreaming(px, pz);
        }

        const pos = this.physics?.pos || this.controls?.physics?.pos || { x: px, y: py + 1, z: pz };
        this.updateHUD(60, pos);

        this.showNotification('Te has teletransportado hacia ' + (targetName || 'Jugador'));
      };

      this.multiplayer.onAdminState = (state) => {
        const adminPanel = document.getElementById('admin-settings-panel');
        const btnAdminMissile = document.getElementById('btn-admin-missile');
        if (!adminPanel) return;
        if (!state || !state.isAdmin) {
          adminPanel.classList.add('hidden');
          if (btnAdminMissile) btnAdminMissile.classList.add('hidden');
          return;
        }

        adminPanel.classList.remove('hidden');
        if (btnAdminMissile) btnAdminMissile.classList.remove('hidden');
        const badge = document.getElementById('admin-online-badge');
        if (badge) {
          badge.textContent = `${state.onlineCount || 1} conectado(s)`;
        }

        const tbody = document.getElementById('admin-players-tbody');
        if (tbody && Array.isArray(state.players)) {
          tbody.innerHTML = '';
          for (const p of state.players) {
            const tr = document.createElement('tr');
            const dateStr = p.joinedAt ? new Date(p.joinedAt).toLocaleTimeString() : '--:--:--';
            const px = p.pos ? Math.floor(p.pos[0]) : 0;
            const py = p.pos ? Math.floor(p.pos[1]) : 25;
            const pz = p.pos ? Math.floor(p.pos[2]) : 0;
            tr.innerHTML = `
              <td><strong>${p.name || 'Player'}</strong> ${p.id === this.multiplayer.myId ? '(Tú)' : ''}</td>
              <td>${dateStr}</td>
              <td style="display:flex;gap:4px;align-items:center;">
                <button class="mc-btn admin-tp-btn" data-player-id="${p.id}" style="padding:4px 8px;font-size:11px;">(${px}, ${py}, ${pz}) 📍</button>
                ${p.id !== this.multiplayer.myId ? `<button class="mc-btn admin-missile-btn" data-player-id="${p.id}" style="padding:4px 8px;font-size:11px;background:#dc2626;color:#ffffff;border-color:#f87171;font-weight:bold;">🚀 Misil</button>` : ''}
              </td>
            `;
            const tpBtn = tr.querySelector('.admin-tp-btn');
            if (tpBtn) {
              tpBtn.addEventListener('click', () => {
                sound.playClick();
                if (p.id === this.multiplayer.myId) return;
                if (this.physics && typeof this.physics.teleport === 'function') {
                  this.physics.teleport(px, py + 1, pz);
                } else if (this.controls?.physics && typeof this.controls.physics.teleport === 'function') {
                  this.controls.physics.teleport(px, py + 1, pz);
                }
                if (typeof sound.playTeleport === 'function') sound.playTeleport();
                if (this.world && typeof this.world.updateStreaming === 'function') {
                  this.world.updateStreaming(px, pz);
                }
                this.showNotification('Teletransportado hacia ' + (p.name || 'Jugador'));
                this.multiplayer.requestTeleportToPlayer(p.id);
                this.pauseMenu.classList.add('hidden');
                if (!this.controls.isMobile) this.controls.lock();
              });
            }
            const missileBtn = tr.querySelector('.admin-missile-btn');
            if (missileBtn) {
              missileBtn.addEventListener('click', () => {
                sound.playClick();
                if (p.id === this.multiplayer.myId) return;
                this.multiplayer.sendAdminLaunchMissile(p.id);
                this.showNotification('🚀 Misil guiado lanzado hacia ' + (p.name || 'Jugador'));
                if (this.tacticalRadar) {
                  this.tacticalRadar.toggle(true);
                  this.tacticalRadar.toggleMinimize(false);
                }
                this.pauseMenu.classList.add('hidden');
                if (!this.controls.isMobile) this.controls.lock();
              });
            }
            tbody.appendChild(tr);
          }
        }
      };

      const openRadarBtn = document.getElementById('admin-open-radar-btn');
      if (openRadarBtn) {
        openRadarBtn.addEventListener('click', () => {
          sound.playClick();
          if (this.tacticalRadar) {
            this.tacticalRadar.toggle(true);
            this.tacticalRadar.toggleMinimize(false);
          }
          this.pauseMenu.classList.add('hidden');
          if (!this.controls.isMobile) this.controls.lock();
        });
      }

      const btnAdminMissile = document.getElementById('btn-admin-missile');
      if (btnAdminMissile) {
        btnAdminMissile.addEventListener('click', () => {
          sound.playClick();
          if (this.tacticalRadar) {
            this.tacticalRadar.toggle();
          }
        });
      }

      const adminResetBtn = document.getElementById('admin-reset-server-btn');
      if (adminResetBtn) {
        let resetConfirmTimeout = null;
        let isAwaitingConfirm = false;

        adminResetBtn.addEventListener('click', () => {
          sound.playClick();
          if (!isAwaitingConfirm) {
            isAwaitingConfirm = true;
            adminResetBtn.textContent = '⚠️ ¿CONFIRMAR REINICIO?';
            adminResetBtn.classList.add('confirming');
            if (resetConfirmTimeout) clearTimeout(resetConfirmTimeout);
            resetConfirmTimeout = setTimeout(() => {
              isAwaitingConfirm = false;
              adminResetBtn.textContent = '🔄 Reiniciar Servidor';
              adminResetBtn.classList.remove('confirming');
            }, 4500);
            return;
          }

          // Second click within 4.5 seconds: confirmed
          isAwaitingConfirm = false;
          if (resetConfirmTimeout) clearTimeout(resetConfirmTimeout);
          adminResetBtn.textContent = '🔄 Reiniciando servidor...';
          adminResetBtn.classList.remove('confirming');

          if (typeof this.multiplayer.requestAdminResetServer === 'function') {
            this.multiplayer.requestAdminResetServer();
          } else if (typeof this.multiplayer.sendAdminResetServer === 'function') {
            this.multiplayer.sendAdminResetServer();
          }
        });
      }
    }

    this.initLobby();
    this.initHotbar();
    this.initInventory();
    this.initPauseMenu();
    this.initChat();
    this.initQuickActions();
    this.initWorldMap();
    this.initGuide();
    this.initMobileControls();
    this.initPlayerList();
  }

  buildHighlightBox() {
    const boxGeom = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    const edges = new THREE.EdgesGeometry(boxGeom);
    this.highlightBox = new THREE.LineSegments(edges, this.materials.highlightMaterial);
    this.highlightBox.visible = false;
    this.sceneManager.scene.add(this.highlightBox);
  }

  setVehicleManager(vm) {
    this.vehicleManager = vm;
  }

  updatePlayerCountBadge(count) {
    if (!this.hudOnlineCount) {
      this.hudOnlineCount = document.getElementById('hud-online-count');
    }
    if (this.hudOnlineCount) {
      const total = typeof count === 'number' ? count : (1 + (this.multiplayer?.remoteAvatars?.size || 0));
      this.hudOnlineCount.textContent = total === 1 ? '1 Jugador Conectado' : `${total} Jugadores Conectados`;
    }
  }

  initLobby() {
    const nameInput = document.getElementById('player-name-input');
    const joinBtn = document.getElementById('join-btn');
    const qualitySelect = document.getElementById('quality-select');
    const serverStatus = document.getElementById('server-status-pill');
    const lobbyPlayerCount = document.getElementById('lobby-players-count');

    // Restore saved username
    const savedName = localStorage.getItem('vr_username');
    if (savedName && nameInput) {
      nameInput.value = savedName;
    }

    // Poll status from server API
    const updateServerStatus = () => {
      fetch('/api/status')
        .then(r => r.json())
        .then(data => {
          if (serverStatus) {
            serverStatus.innerHTML = '<span class="status-dot online"></span> Servidor En Línea';
          }
          if (lobbyPlayerCount) {
            lobbyPlayerCount.textContent = `${data.onlinePlayers || 0} / ${data.maxPlayers || 30} conectados`;
          }
        })
        .catch(() => {
          if (serverStatus) {
            serverStatus.innerHTML = '<span class="status-dot offline"></span> Reconectando...';
          }
        });
    };
    updateServerStatus();
    const accessKeyGroup = document.getElementById('access-key-group');
    const accessKeyInput = document.getElementById('access-key-input');

    if (nameInput && accessKeyGroup) {
      const checkAdminEmail = () => {
        const val = (nameInput.value || '').trim().toLowerCase();
        if (val === 'jsieiragerpe@gmail.com') {
          accessKeyGroup.classList.remove('hidden');
        } else {
          accessKeyGroup.classList.add('hidden');
        }
      };
      nameInput.addEventListener('input', checkAdminEmail);
      checkAdminEmail();
    }

    // Join Game
    const doJoin = () => {
      let name = (nameInput.value || '').trim();
      if (!name) name = 'Explorador_' + Math.floor(Math.random() * 1000);
      localStorage.setItem('vr_username', name);

      if (qualitySelect) {
        this.sceneManager.setGraphicsQuality(qualitySelect.value);
        if (qualitySelect.value === 'balanced') this.world.renderDistance = 4;
        else if (qualitySelect.value === 'ultra') this.world.renderDistance = 7;
      }

      this.lobbyOverlay.classList.add('hidden');
      this.hudOverlay.classList.remove('hidden');
      this.updatePlayerCountBadge(1 + (this.multiplayer?.remoteAvatars?.size || 0));

      if (this.controls.isMobile && this.mobileOverlay) {
        this.mobileOverlay.classList.remove('hidden');
        document.body.classList.add('mobile-mode');
      }

      const isSpecialEmail = name.trim().toLowerCase() === 'jsieiragerpe@gmail.com';
      const adminKeyVal = accessKeyInput ? accessKeyInput.value.trim() : '';

      this.multiplayer.connect(name, {
        email: isSpecialEmail ? name.trim() : undefined,
        adminKey: isSpecialEmail ? adminKeyVal : undefined
      });
      this.controls.lock();

      // Show friendly tutorial prompt in chat
      setTimeout(() => {
        this.addSystemNotification('🏰 ¡Bienvenido a la Plaza Central! Clic Izq: Romper | Clic Der: Construir | [🎒 Bloques] | [❓ Guía]');
      }, 700);
    };

    this.triggerJoin = doJoin;

    if (joinBtn) {
      joinBtn.addEventListener('click', () => {
        sound.playClick();
        doJoin();
      });
    }
    if (nameInput) {
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          sound.playClick();
          doJoin();
        }
      });
    }
    if (qualitySelect) {
      qualitySelect.addEventListener('change', () => {
        sound.playClick();
      });
    }
  }

  initHotbar() {
    this.hotbarContainer.innerHTML = '';

    for (let i = 0; i < 9; i++) {
      const slotDiv = document.createElement('div');
      slotDiv.className = `hotbar-slot ${i === 0 ? 'active' : ''}`;
      slotDiv.dataset.index = i;

      const numSpan = document.createElement('span');
      numSpan.className = 'slot-key';
      numSpan.textContent = (i + 1);
      slotDiv.appendChild(numSpan);

      const iconImg = document.createElement('img');
      iconImg.className = 'slot-icon';
      this.updateSlotIcon(iconImg, this.hotbarBlocks[i]);
      slotDiv.appendChild(iconImg);

      slotDiv.addEventListener('click', () => {
        sound.playClick(1.05);
        this.selectHotbarSlot(i);
      });

      this.hotbarContainer.appendChild(slotDiv);
    }

    this.controls.onSelectHotbar = (idx) => {
      sound.playClick(1.05);
      this.selectHotbarSlot(idx);
    };

    // Initial held block setup
    this.selectHotbarSlot(0);
  }

  updateSlotIcon(imgElem, blockId) {
    const def = BLOCK_DEFS[blockId];
    if (def && def.faces) {
      const faceSlot = def.faces[0]; // Top face texture
      const dataUrl = this.materials.getTileDataURL(faceSlot);
      if (dataUrl) {
        imgElem.src = dataUrl;
        imgElem.title = def.name;
      }
    }
  }

  selectHotbarSlot(index) {
    this.controls.selectedHotbarIndex = index;
    const slots = this.hotbarContainer.querySelectorAll('.hotbar-slot');
    slots.forEach((s, idx) => {
      s.classList.toggle('active', idx === index);
    });

    const activeBlockId = this.hotbarBlocks[index];
    if (this.controls.updateHeldBlock) {
      this.controls.updateHeldBlock(activeBlockId);
    }
    const def = BLOCK_DEFS[activeBlockId];
    const nameLabel = document.getElementById('selected-block-label');
    if (nameLabel && def) {
      nameLabel.textContent = def.name;
      nameLabel.classList.add('show');
      clearTimeout(this.labelTimeout);
      this.labelTimeout = setTimeout(() => nameLabel.classList.remove('show'), 2000);
    }
  }

  getSelectedBlock() {
    return this.hotbarBlocks[this.controls.selectedHotbarIndex] || BLOCKS.DIRT;
  }

  initInventory() {
    const grid = document.getElementById('inventory-grid');
    const closeBtn = document.getElementById('close-inventory-btn');

    if (!grid) return;
    grid.innerHTML = '';

    // List all solid & decorative blocks
    const available = [
      BLOCKS.GRASS, BLOCKS.DIRT, BLOCKS.DIRT_DRY, BLOCKS.STONE,
      BLOCKS.COBBLESTONE, BLOCKS.WOOD_PLANK, BLOCKS.OAK_LOG, BLOCKS.OAK_LEAVES,
      BLOCKS.SAND, BLOCKS.GRAVEL, BLOCKS.SNOW, BLOCKS.ICE,
      BLOCKS.BRICK, BLOCKS.CLAY, BLOCKS.GLASS, BLOCKS.IRON_ORE, BLOCKS.GOLD_ORE
    ];

    for (const bId of available) {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'inventory-item';

      const def = BLOCK_DEFS[bId];
      const img = document.createElement('img');
      this.updateSlotIcon(img, bId);
      itemDiv.appendChild(img);

      const label = document.createElement('span');
      label.textContent = def.name;
      itemDiv.appendChild(label);

      itemDiv.addEventListener('click', () => {
        sound.playClick(1.0);
        // Assign to currently selected hotbar slot
        const activeIdx = this.controls.selectedHotbarIndex;
        this.hotbarBlocks[activeIdx] = bId;

        const activeSlot = this.hotbarContainer.children[activeIdx];
        if (activeSlot) {
          const slotImg = activeSlot.querySelector('.slot-icon');
          this.updateSlotIcon(slotImg, bId);
        }
        this.toggleInventory(false);
      });

      grid.appendChild(itemDiv);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        sound.playClick();
        this.toggleInventory(false);
      });
    }

    // Toggle on 'E' key or close on 'Escape'
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !this.isChatOpen && !this.isGuideOpen) {
        if (e.__vrHandled || (this.vehicleManager && this.vehicleManager.isDriving())) {
          return;
        }
        sound.playClick();
        if (this.controls.isLocked) {
          this.controls.unlock();
          this.toggleInventory(true);
        } else if (this.isInventoryOpen) {
          this.toggleInventory(false);
          this.controls.lock();
        }
      } else if (e.code === 'Escape' && this.isInventoryOpen) {
        sound.playClick();
        this.toggleInventory(false);
        this.controls.lock();
      }
    });
  }

  toggleInventory(open) {
    this.isInventoryOpen = open;
    if (this.inventoryModal) {
      this.inventoryModal.classList.toggle('hidden', !open);
    }
  }

  initQuickActions() {
    const btnToggleCam = document.getElementById('btn-toggle-cam');
    const btnChat = document.getElementById('btn-open-chat');
    const btnGuide = document.getElementById('btn-open-guide');
    const btnInv = document.getElementById('btn-open-inv');
    const btnMap = document.getElementById('btn-map') || document.getElementById('btn-open-map');
    const btnShareLoc = document.getElementById('btn-share-loc');
    const btnSpeedToggle = document.getElementById('hud-speed-btn') || 
                           document.getElementById('hud-speed-pill') || 
                           document.getElementById('btn-speed-toggle');

    if (btnToggleCam) {
      const updateCamLabel = (mode) => {
        if (mode === 'first') btnToggleCam.textContent = '📷 1ª Persona';
        else if (mode === 'third-back') btnToggleCam.textContent = '📷 3ª Persona';
        else btnToggleCam.textContent = '📷 Frontal';
      };
      btnToggleCam.addEventListener('click', () => {
        sound.playClick();
        const mode = this.controls.togglePerspective();
        updateCamLabel(mode);
      });
      this.controls.onPerspectiveChange = updateCamLabel;
    }

    if (btnChat) {
      btnChat.addEventListener('click', () => {
        sound.playClick();
        this.openChat();
      });
    }

    if (btnGuide) {
      btnGuide.addEventListener('click', () => {
        sound.playClick();
        this.toggleGuide(true);
      });
    }

    if (btnInv) {
      btnInv.addEventListener('click', () => {
        sound.playClick();
        this.controls.unlock();
        this.toggleInventory(true);
      });
    }

    if (btnMap) {
      btnMap.addEventListener('click', () => {
        sound.playClick();
        this.toggleMap(true);
      });
    }

    if (btnShareLoc) {
      btnShareLoc.addEventListener('click', () => {
        sound.playClick();
        this.shareLocation();
      });
    }

    if (btnSpeedToggle) {
      btnSpeedToggle.addEventListener('click', () => {
        this.cycleSpeed();
      });
    }

    const btnToggleWeapons = document.getElementById('btn-toggle-weapons');
    if (btnToggleWeapons) {
      btnToggleWeapons.addEventListener('click', () => {
        sound.playClick();
        this.weaponsEnabled = !this.weaponsEnabled;
        btnToggleWeapons.textContent = this.weaponsEnabled ? '🔫 Armas: ON' : '⛏️ Minería: OFF';
        btnToggleWeapons.classList.toggle('active', this.weaponsEnabled);

        const weaponsToggleBtn = document.getElementById('weapons-mode-toggle');
        const weaponsStateLabel = document.getElementById('weapons-mode-state');
        if (weaponsStateLabel) weaponsStateLabel.textContent = this.weaponsEnabled ? 'ON' : 'OFF';
        if (weaponsToggleBtn) weaponsToggleBtn.classList.toggle('active', this.weaponsEnabled);

        const weaponsHud = document.getElementById('weapons-hud-controls');
        if (weaponsHud) weaponsHud.classList.toggle('hidden', !this.weaponsEnabled);

        if (this.controls && typeof this.controls.setWeaponsMode === 'function') {
          this.controls.setWeaponsMode(this.weaponsEnabled);
        }
        if (this.multiplayer && typeof this.multiplayer.sendWeaponToggle === 'function') {
          this.multiplayer.sendWeaponToggle(this.weaponsEnabled);
        }
        if (this.animalManager && typeof this.animalManager.setWeaponsMode === 'function') {
          this.animalManager.setWeaponsMode(this.weaponsEnabled);
        }
        this.showNotification(`Modo Armas & TNT ${this.weaponsEnabled ? 'Activado 🔫' : 'Desactivado ⛏️'}`);
      });
    }

    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        sound.playClick();
        this.toggleFullscreen();
      });
    }

    const btnMenuToggle = document.getElementById('btn-menu-toggle');
    if (btnMenuToggle) {
      btnMenuToggle.addEventListener('click', () => {
        sound.playClick();
        const isOpen = !this.pauseMenu.classList.contains('hidden');
        if (isOpen) {
          this.pauseMenu.classList.add('hidden');
          if (!this.controls.isMobile) this.controls.lock();
        } else {
          this.controls.unlock();
          this.pauseMenu.classList.remove('hidden');
        }
      });
    }
  }

  initWorldMap() {
    const closeBtn = document.getElementById('close-map-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        sound.playClick();
        this.toggleMap(false);
      });
    }

    // Close when clicking modal backdrop
    if (this.mapModal) {
      this.mapModal.addEventListener('click', (e) => {
        if (e.target === this.mapModal) {
          sound.playClick();
          this.toggleMap(false);
        }
      });
    }

    // Fast travel landmark buttons
    const destButtons = document.querySelectorAll('.map-dest-btn');
    destButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tx = parseFloat(btn.dataset.x);
        const ty = parseFloat(btn.dataset.y);
        const tz = parseFloat(btn.dataset.z);
        const titleElem = btn.querySelector('.dest-title');
        const title = titleElem ? titleElem.textContent : 'Monumento';

        this.teleportToLandmark({ name: title, x: tx, y: ty, z: tz });
      });
    });

    // Speed options buttons inside World Map modal
    const speedOpt1 = document.getElementById('speed-btn-1');
    const speedOpt2 = document.getElementById('speed-btn-2');
    const speedOpt5 = document.getElementById('speed-btn-5');

    if (speedOpt1) {
      speedOpt1.addEventListener('click', () => {
        this.setSpeed(1.0, false);
      });
    }
    if (speedOpt2) {
      speedOpt2.addEventListener('click', () => {
        this.setSpeed(2.5, false);
      });
    }
    if (speedOpt5) {
      speedOpt5.addEventListener('click', () => {
        this.setSpeed(5.0, true);
      });
    }

    // Global Hotkeys: 'KeyM' for Map, 'KeyV' for Speed Cycle, 'Escape' to close
    window.addEventListener('keydown', (e) => {
      if (e.__vrHandled) return;
      if (this.isChatOpen) return;
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;

      if (e.code === 'KeyM') {
        sound.playClick();
        this.toggleMap(!this.isMapOpen);
      } else if (e.code === 'KeyV') {
        sound.playClick();
        this.cycleSpeed();
      } else if (e.code === 'KeyR' && this.multiplayer && this.multiplayer.isAdmin) {
        sound.playClick();
        if (this.tacticalRadar) {
          this.tacticalRadar.toggle();
        }
      } else if (e.code === 'Escape' && this.isMapOpen) {
        sound.playClick();
        this.toggleMap(false);
      }
    });
  }

  setTacticalRadar(radar) {
    this.tacticalRadar = radar;
  }

  teleportToLandmark(landmark) {
    const tx = typeof landmark.x === 'number' ? landmark.x : parseFloat(landmark.x);
    const ty = typeof landmark.y === 'number' ? landmark.y : parseFloat(landmark.y);
    const tz = typeof landmark.z === 'number' ? landmark.z : parseFloat(landmark.z);
    const title = landmark.name || 'Monumento';

    // Determine scenic arrival viewpoint in front of the monument so player isn't buried inside walls
    let vx = tx + 0.5;
    let vy = ty;
    let vz = tz + 0.5;
    let targetYaw = null;
    let targetPitch = null;

    if (tx === 0 && tz === 0) {
      // Spawn Plaza: stand on south plaza facing Golden Altar & Guardian Statues
      vx = 3.5; vy = 25.0; vz = 6.5;
      targetYaw = 0.45; targetPitch = 0.08;
    } else if (tx === 250 && tz === 250) {
      // Japan Imperial: stand at entrance of Crimson Torii Gate avenue facing the 4-tier Pagoda & Sakura trees
      vx = 250.5; vy = 25.0; vz = 232.5;
      targetYaw = Math.PI; targetPitch = 0.18;
    } else if (tx === -250 && tz === 250) {
      // China & Shanghai: stand on Imperial avenue facing Shanghai Tower, Jin Mao, Oriental Pearl & Paifang Arch
      vx = -250.5; vy = 25.0; vz = 231.5;
      targetYaw = Math.PI; targetPitch = 0.26;
    } else if (tx === 250 && tz === -250) {
      // Paris: stand on Champs-Élysées promenade facing the Reflecting Pool & Eiffel Tower
      vx = 250.5; vy = 25.0; vz = -231.5;
      targetYaw = 0; targetPitch = 0.26;
    } else if (tx === -250 && tz === -250) {
      // New York: stand on Manhattan avenue facing Empire State Building & Statue of Liberty
      vx = -252.5; vy = 25.0; vz = -232.5;
      targetYaw = 0.12; targetPitch = 0.26;
    } else if (tx === 0 && tz === 500) {
      // Norway Fjords: stand on scenic cliff overlook facing the fjord gorge, waterfalls & Viking cabin
      vx = -16.5; vy = 51.0; vz = 492.5;
      targetYaw = -1.45; targetPitch = -0.12;
    } else if (tx === 0 && tz === -500) {
      // Playa Paraíso: stand on coastal boardwalk facing tropical resort, palm trees & superyacht
      vx = 0.5; vy = 21.0; vz = -442.5;
      targetYaw = Math.PI; targetPitch = 0.05;
    } else if ((tx === 350 && tz === 350) || (tx === 500 && tz === 500)) {
      // Mount Fuji: stand on the scenic reflection lake shore facing the colossal volcano
      vx = 305.5; vy = 20.0; vz = 305.5;
      targetYaw = -Math.PI / 4; targetPitch = 0.28;
    } else if ((tx === 110 && tz === -60) || (tx === -500 && tz === -500)) {
      // Gran Circuito: stand on the starting grid facing down the main straight toward Turn 1
      vx = 110.5; vy = 25.0; vz = -60.5;
      targetYaw = 0; targetPitch = 0.05;
    }

    // Stream chunks around new location first so terrain & monuments exist before physics step
    if (this.world && typeof this.world.updateStreaming === 'function') {
      this.world.updateStreaming(vx, vz);
    }

    // Invoke physics.teleport(x, y, z)
    if (this.physics && typeof this.physics.teleport === 'function') {
      this.physics.teleport(vx, vy, vz);
    } else if (this.controls?.physics && typeof this.controls.physics.teleport === 'function') {
      this.controls.physics.teleport(vx, vy, vz);
    }

    if (this.controls && targetYaw !== null) {
      this.controls.yaw = targetYaw;
      this.controls.pitch = targetPitch;
    }

    // Play click and teleport audio
    sound.playClick();
    if (typeof sound.playTeleport === 'function') {
      sound.playTeleport();
    }

    // Update coordinates immediately
    const pos = this.physics?.pos || this.controls?.physics?.pos || { x: vx, y: vy, z: vz };
    this.updateHUD(60, pos);

    // Close modal
    this.toggleMap(false);

    this.addSystemNotification(`⚡ Teletransportado con éxito a [${title}]`);
  }

  toggleMap(open) {
    this.isMapOpen = (open !== undefined) ? !!open : !this.isMapOpen;
    const modal = this.mapModal || document.getElementById('map-modal') || document.getElementById('world-map-modal');
    if (modal) {
      modal.classList.toggle('hidden', !this.isMapOpen);
    }
    if (this.isMapOpen) {
      this.controls.unlock();
    } else {
      this.controls.lock();
    }
  }

  toggleMapModal(open) {
    this.toggleMap(open);
  }

  setSpeed(mult, flight = (mult === 5.0)) {
    if (this.controls && typeof this.controls.setSpeed === 'function') {
      this.controls.setSpeed(mult, flight);
    } else if (this.physics) {
      this.physics.speedMultiplier = mult;
      this.physics.flightMode = flight;
      if (!this.physics.setSpeedMultiplier) {
        this.physics.setSpeedMultiplier = (m) => {
          this.physics.speedMultiplier = m;
          this.physics.flightMode = (m === 5.0);
        };
      }
    }
    sound.playClick();
    this.updateSpeedUI(mult, flight);
  }

  cycleSpeed() {
    if (this.controls && typeof this.controls.cycleSpeed === 'function') {
      const res = this.controls.cycleSpeed();
      this.updateSpeedUI(res.speedMultiplier, res.flightMode);
      return res;
    }

    this.currentSpeedTier = (this.currentSpeedTier % 3) + 1;
    let mult = 1.0;
    let flight = false;

    if (this.currentSpeedTier === 2) {
      mult = 2.5;
      flight = false;
    } else if (this.currentSpeedTier === 3) {
      mult = 5.0;
      flight = true;
    } else {
      this.currentSpeedTier = 1;
      mult = 1.0;
      flight = false;
    }

    if (this.physics) {
      this.physics.speedMultiplier = mult;
      this.physics.flightMode = flight;
    }

    sound.playClick();
    this.updateSpeedUI(mult, flight);
    return { speedMultiplier: mult, flightMode: flight };
  }

  updateSpeedUI(mult, flight) {
    let label = '⚡ 1x Caminar';
    let modeName = 'Caminar Normal (1x)';
    let tier = 1;

    if (Math.abs(mult - 2.5) < 0.05) {
      tier = 2;
      label = '⚡ 2.5x Explorar';
      modeName = 'Exploración Rápida (2.5x)';
    } else if (Math.abs(mult - 5.0) < 0.05 || flight) {
      tier = 3;
      label = '🕊️ 5x Volar';
      modeName = 'Vuelo / Modo Dios (5x)';
    } else {
      tier = 1;
      label = '⚡ 1x Caminar';
      modeName = 'Caminar Normal (1x)';
    }

    this.currentSpeedTier = tier;

    // Update HUD button/pill
    const hudSpeedBtns = [
      document.getElementById('hud-speed-btn'),
      document.getElementById('hud-speed-pill'),
      document.getElementById('btn-speed-toggle')
    ];
    hudSpeedBtns.forEach((btn) => {
      if (btn) btn.textContent = label;
    });

    // Update modal speed options
    const speedOpt1 = document.getElementById('speed-btn-1');
    const speedOpt2 = document.getElementById('speed-btn-2');
    const speedOpt5 = document.getElementById('speed-btn-5');
    [speedOpt1, speedOpt2, speedOpt5].forEach((b, idx) => {
      if (b) b.classList.toggle('active', idx + 1 === tier);
    });

    this.addSystemNotification(`Velocidad ajustada a: ${modeName}`);
  }

  getSectorName(x, z) {
    const distCenter = Math.hypot(x, z);
    if (distCenter <= 40) return '🏰 Plaza Central';
    if (Math.hypot(x - 350, z - 350) <= 85 || Math.hypot(x - 500, z - 500) <= 90) return '🗻 Monte Fuji';
    if (z >= 420 && z <= 580 && Math.abs(x) <= 80) return '🇳🇴 Fiordos de Noruega';
    if (Math.hypot(x, z + 500) <= 120) return '🏖️ Playa Paraíso';
    if (Math.hypot(x - 250, z - 250) <= 70) return '🇯🇵 Japón Imperial';
    if (Math.hypot(x + 250, z - 250) <= 70) return '🇨🇳 China y Shanghai';
    if (Math.hypot(x - 250, z + 250) <= 70) return '🇫🇷 París y Torre Eiffel';
    if (Math.hypot(x + 250, z + 250) <= 70) return '🇺🇸 Nueva York';
    if ((x >= 40 && x <= 220 && z >= -195 && z <= -35) || (Math.abs(x - (-500)) <= 125 && Math.abs(z - (-500)) <= 125)) return '🏎️ Gran Circuito de Velocidad';
    return '🌲 Tierras del Reino';
  }

  shareLocation() {
    sound.playClick();
    const pos = this.physics?.pos || this.controls?.physics?.pos || { x: 0, y: 25, z: 0 };
    const bx = Math.round(pos.x);
    const by = Math.round(pos.y);
    const bz = Math.round(pos.z);
    const sector = this.getSectorName(bx, bz);

    if (this.multiplayer && typeof this.multiplayer.shareLocation === 'function') {
      this.multiplayer.shareLocation(bx, by, bz, sector);
    } else if (this.multiplayer && typeof this.multiplayer.sendChat === 'function') {
      const msg = `📍 Mi ubicación: [${sector}] (X: ${bx}, Y: ${by}, Z: ${bz})`;
      this.multiplayer.sendChat(msg);
    }

    this.showNotification('Has compartido tu ubicación en el chat.');
  }

  initGuide() {
    const closeBtn = document.getElementById('close-guide-btn');
    const understandBtn = document.getElementById('guide-understand-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        sound.playClick();
        this.toggleGuide(false);
      });
    }
    if (understandBtn) {
      understandBtn.addEventListener('click', () => {
        sound.playClick();
        this.toggleGuide(false);
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isGuideOpen) {
        sound.playClick();
        this.toggleGuide(false);
        this.controls.lock();
      }
    });
  }

  toggleGuide(open) {
    this.isGuideOpen = open;
    if (this.guideModal) {
      this.guideModal.classList.toggle('hidden', !open);
    }
    if (open) {
      this.controls.unlock();
    } else {
      this.controls.lock();
    }
  }

  initMobileControls() {
    // If mobile or touch capable, prepare virtual joystick and action buttons
    const joystickZone = document.getElementById('joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickKnob = document.getElementById('joystick-knob');

    let activeTouchId = null;

    if (joystickZone && joystickBase && joystickKnob) {
      const handleTouchStart = (e) => {
        if (activeTouchId !== null) return;
        const touch = e.changedTouches[0];
        activeTouchId = touch.identifier;
        updateKnob(touch);
      };

      const handleTouchMove = (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            updateKnob(e.changedTouches[i]);
            break;
          }
        }
      };

      const handleTouchEnd = (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchId) {
            activeTouchId = null;
            joystickKnob.style.transform = 'translate(0px, 0px)';
            this.controls.joystick.x = 0;
            this.controls.joystick.y = 0;
            break;
          }
        }
      };

      const updateKnob = (touch) => {
        const rect = joystickBase.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const maxRadius = (rect.width / 2) - 8;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const distance = Math.hypot(dx, dy);

        if (distance > maxRadius) {
          dx = (dx / distance) * maxRadius;
          dy = (dy / distance) * maxRadius;
        }

        joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

        // Normalize -1 to 1 (screen Y down is backward, so negate dy for forward)
        this.controls.joystick.x = dx / maxRadius;
        this.controls.joystick.y = -(dy / maxRadius);
      };

      joystickZone.addEventListener('touchstart', handleTouchStart, { passive: false });
      joystickZone.addEventListener('touchmove', handleTouchMove, { passive: false });
      joystickZone.addEventListener('touchend', handleTouchEnd, { passive: false });
      joystickZone.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    }

    // Mobile Action buttons
    const btnBreak = document.getElementById('mobile-btn-break');
    const btnPlace = document.getElementById('mobile-btn-place');
    const btnJump = document.getElementById('mobile-btn-jump');

    if (btnBreak) {
      btnBreak.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sound.playClick(0.9);
        this.controls.triggerBreak();
      });
      btnBreak.addEventListener('click', () => {
        sound.playClick(0.9);
        this.controls.triggerBreak();
      });
    }

    if (btnPlace) {
      btnPlace.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sound.playClick(1.1);
        this.controls.triggerPlace();
      });
      btnPlace.addEventListener('click', () => {
        sound.playClick(1.1);
        this.controls.triggerPlace();
      });
    }

    if (btnJump) {
      const startJump = (e) => {
        e.preventDefault();
        sound.playClick(1.0);
        this.controls.setJump(true);
      };
      const stopJump = (e) => {
        e.preventDefault();
        this.controls.setJump(false);
      };

      btnJump.addEventListener('touchstart', startJump);
      btnJump.addEventListener('touchend', stopJump);
      btnJump.addEventListener('touchcancel', stopJump);
      btnJump.addEventListener('mousedown', startJump);
      btnJump.addEventListener('mouseup', stopJump);
    }

    const btnCam = document.getElementById('mobile-btn-cam');
    if (btnCam) {
      btnCam.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sound.playClick(1.2);
        this.controls.togglePerspective();
      });
      btnCam.addEventListener('click', () => {
        sound.playClick(1.2);
        this.controls.togglePerspective();
      });
    }

    const btnSprint = document.getElementById('mobile-btn-sprint');
    if (btnSprint) {
      let isSprinting = false;
      const toggleSprint = (e) => {
        e.preventDefault();
        isSprinting = !isSprinting;
        sound.playClick(1.3);
        this.controls.setSprint(isSprinting);
        btnSprint.classList.toggle('active', isSprinting);
      };
      btnSprint.addEventListener('touchstart', toggleSprint);
      btnSprint.addEventListener('click', toggleSprint);
    }

    const btnCar = document.getElementById('mobile-btn-car');
    if (btnCar) {
      const handleCarAction = (e) => {
        e.preventDefault();
        sound.playClick(1.0);
        if (this.vehicleManager) {
          this.vehicleManager.handleInteract(this.controls?.physics || this.physics);
        }
      };
      btnCar.addEventListener('touchstart', handleCarAction);
      btnCar.addEventListener('click', handleCarAction);
    }

    const btnCarExit = document.getElementById('mobile-btn-car-exit');
    if (btnCarExit) {
      const handleCarExit = (e) => {
        e.preventDefault();
        sound.playClick(1.0);
        if (this.vehicleManager) {
          this.vehicleManager.exitCar(this.controls?.physics || this.physics);
        }
      };
      btnCarExit.addEventListener('touchstart', handleCarExit);
      btnCarExit.addEventListener('click', handleCarExit);
    }
  }

  initPauseMenu() {
    const resumeBtn = document.getElementById('resume-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const sensSlider = document.getElementById('sens-slider');
    const fovSlider = document.getElementById('fov-slider');
    const renderDistSlider = document.getElementById('render-dist-slider');
    const qualityMenuSelect = document.getElementById('menu-quality-select');

    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        sound.playClick();
        this.pauseMenu.classList.add('hidden');
        this.controls.lock();
      });
    }

    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => {
        sound.playClick();
        location.reload();
      });
    }

    if (sensSlider) {
      sensSlider.addEventListener('input', (e) => {
        this.controls.sensitivity = parseFloat(e.target.value);
      });
      sensSlider.addEventListener('change', () => sound.playClick());
    }

    if (fovSlider) {
      fovSlider.addEventListener('input', (e) => {
        this.sceneManager.camera.fov = parseInt(e.target.value, 10);
        this.sceneManager.camera.updateProjectionMatrix();
      });
      fovSlider.addEventListener('change', () => sound.playClick());
    }

    if (renderDistSlider) {
      renderDistSlider.addEventListener('input', (e) => {
        this.world.renderDistance = parseInt(e.target.value, 10);
      });
      renderDistSlider.addEventListener('change', () => sound.playClick());
    }

    if (qualityMenuSelect) {
      qualityMenuSelect.addEventListener('change', (e) => {
        sound.playClick();
        this.sceneManager.setGraphicsQuality(e.target.value);
      });
    }

    // FPS Cap Slider (10, 30, 60, 100, 120, MAX)
    const fpsCapSlider = document.getElementById('fps-cap-slider');
    const fpsCapLabel = document.getElementById('fps-cap-label');
    const fpsCapSteps = [10, 30, 60, 100, 120, Infinity];
    const fpsCapLabels = ['10 FPS', '30 FPS', '60 FPS', '100 FPS', '120 FPS', 'MAX'];
    if (fpsCapSlider) {
      fpsCapSlider.addEventListener('input', (e) => {
        const step = parseInt(e.target.value, 10);
        const cap = fpsCapSteps[step] || Infinity;
        window.targetMaxFps = cap;
        if (fpsCapLabel) fpsCapLabel.textContent = fpsCapLabels[step] || 'MAX';
      });
      fpsCapSlider.addEventListener('change', () => sound.playClick());
    }

    // Slider value labels
    const renderDistVal = document.getElementById('render-dist-val');
    if (renderDistSlider && renderDistVal) {
      renderDistSlider.addEventListener('input', (e) => {
        renderDistVal.textContent = e.target.value;
      });
    }
    const sensVal = document.getElementById('sens-val');
    if (sensSlider && sensVal) {
      sensSlider.addEventListener('input', (e) => {
        sensVal.textContent = Math.round((parseFloat(e.target.value) / 0.0022) * 100) + '%';
      });
    }
    const fovVal = document.getElementById('fov-val');
    if (fovSlider && fovVal) {
      fovSlider.addEventListener('input', (e) => {
        fovVal.textContent = e.target.value + '°';
      });
    }

    // Boost Mode Toggle
    const boostToggleBtn = document.getElementById('boost-mode-toggle');
    const boostStateLabel = document.getElementById('boost-mode-state');
    if (boostToggleBtn) {
      boostToggleBtn.addEventListener('click', () => {
        sound.playClick();
        this.boostEnabled = !this.boostEnabled;
        if (boostStateLabel) boostStateLabel.textContent = this.boostEnabled ? 'ON' : 'OFF';
        boostToggleBtn.classList.toggle('active', this.boostEnabled);
        if (this.world && typeof this.world.setBoostMode === 'function') {
          this.world.setBoostMode(this.boostEnabled);
        }
        if (this.sceneManager && typeof this.sceneManager.setBoostQuality === 'function') {
          this.sceneManager.setBoostQuality(this.boostEnabled);
        }
        if (qualityMenuSelect && this.boostEnabled) {
          qualityMenuSelect.value = 'boost';
        }
        this.showNotification(`Modo BOOST ${this.boostEnabled ? 'Activado 🚀' : 'Desactivado'}`);
      });
    }

    // Weapons & TNT Mode Toggle
    const weaponsToggleBtn = document.getElementById('weapons-mode-toggle');
    const weaponsStateLabel = document.getElementById('weapons-mode-state');
    const weaponsHud = document.getElementById('weapons-hud-controls');
    if (weaponsToggleBtn) {
      weaponsToggleBtn.addEventListener('click', () => {
        sound.playClick();
        this.weaponsEnabled = !this.weaponsEnabled;
        if (weaponsStateLabel) weaponsStateLabel.textContent = this.weaponsEnabled ? 'ON' : 'OFF';
        weaponsToggleBtn.classList.toggle('active', this.weaponsEnabled);
        const quickWeaponsBtn = document.getElementById('btn-toggle-weapons');
        if (quickWeaponsBtn) {
          quickWeaponsBtn.textContent = this.weaponsEnabled ? '🔫 Armas: ON' : '⛏️ Minería: OFF';
          quickWeaponsBtn.classList.toggle('active', this.weaponsEnabled);
        }
        if (this.controls && typeof this.controls.setWeaponsMode === 'function') {
          this.controls.setWeaponsMode(this.weaponsEnabled);
        }
        if (weaponsHud) {
          weaponsHud.classList.toggle('hidden', !this.weaponsEnabled);
        }
        if (this.multiplayer && typeof this.multiplayer.sendWeaponToggle === 'function') {
          this.multiplayer.sendWeaponToggle(this.weaponsEnabled);
        }
        if (this.animalManager && typeof this.animalManager.setWeaponsMode === 'function') {
          this.animalManager.setWeaponsMode(this.weaponsEnabled);
        }
        this.showNotification(`Modo Armas & TNT ${this.weaponsEnabled ? 'Activado 🔫' : 'Desactivado ⛏️'}`);
      });
    }

    // Desktop & Click listeners for Weapons HUD buttons
    const btnAim = document.getElementById('btn-weapon-aim');
    if (btnAim) {
      btnAim.addEventListener('click', () => {
        sound.playClick();
        const active = this.controls.toggleAiming();
        btnAim.classList.toggle('active', active);
        const crosshair = document.getElementById('crosshair');
        const scopeOverlay = document.getElementById('rifle-scope-overlay');
        if (crosshair) {
          if (active && scopeOverlay && !scopeOverlay.classList.contains('hidden')) {
            crosshair.classList.add('hidden');
          } else if (!active) {
            crosshair.classList.remove('hidden');
          }
        }
      });
    }
    const btnShoot = document.getElementById('btn-weapon-shoot');
    if (btnShoot) {
      btnShoot.addEventListener('click', () => {
        this.controls.triggerShoot();
      });
    }
    const btnTnt = document.getElementById('btn-weapon-tnt');
    if (btnTnt) {
      btnTnt.addEventListener('click', () => {
        this.controls.triggerTnt();
      });
    }

    const btnTntPower = document.getElementById('btn-tnt-power');
    if (btnTntPower) {
      btnTntPower.addEventListener('click', () => {
        if (sound && typeof sound.playClick === 'function') sound.playClick(1.2);
        if (this.controls && typeof this.controls.cycleTntPower === 'function') {
          this.controls.cycleTntPower();
          const powerLabel = this.controls.getTntPowerLabel ? this.controls.getTntPowerLabel() : '';
          this.showNotification(`TNT ${powerLabel}`);
        }
      });
    }

    const scopeBtnShoot = document.getElementById('scope-btn-shoot');
    if (scopeBtnShoot) {
      const onScopeShoot = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (this.controls && typeof this.controls.triggerShoot === 'function') {
          this.controls.triggerShoot(true);
        }
      };
      scopeBtnShoot.addEventListener('click', onScopeShoot);
      scopeBtnShoot.addEventListener('touchstart', onScopeShoot, { passive: false });
    }

    const scopeBtnExit = document.getElementById('scope-btn-exit');
    if (scopeBtnExit) {
      const onScopeExit = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (this.controls && typeof this.controls.setAiming === 'function') {
          this.controls.setAiming(false);
        }
      };
      scopeBtnExit.addEventListener('click', onScopeExit);
      scopeBtnExit.addEventListener('touchstart', onScopeExit, { passive: false });
    }

    // Fast action grid inside Pause Menu
    const menuMapBtn = document.getElementById('menu-btn-map');
    if (menuMapBtn) {
      menuMapBtn.addEventListener('click', () => {
        sound.playClick();
        this.pauseMenu.classList.add('hidden');
        this.toggleMap(true);
      });
    }

    const menuSpeedBtn = document.getElementById('menu-btn-speed');
    if (menuSpeedBtn) {
      menuSpeedBtn.addEventListener('click', () => {
        const res = this.cycleSpeed();
        const mult = res?.speedMultiplier || 1.0;
        menuSpeedBtn.textContent = `⚡ Velocidad: ${mult}x${res?.flightMode ? ' (Vuelo)' : ''}`;
      });
    }

    const menuCamBtn = document.getElementById('menu-btn-cam');
    if (menuCamBtn) {
      menuCamBtn.addEventListener('click', () => {
        sound.playClick();
        const mode = this.controls.togglePerspective();
        const names = { 'first': '1ª Persona', 'third-back': '3ª Persona', 'third-front': 'Frontal' };
        menuCamBtn.textContent = `📷 Cámara: ${names[mode] || mode}`;
      });
    }

    const menuShareLocBtn = document.getElementById('menu-btn-share-loc');
    if (menuShareLocBtn) {
      menuShareLocBtn.addEventListener('click', () => {
        this.shareLocation();
      });
    }

    const menuInvBtn = document.getElementById('menu-btn-inv');
    if (menuInvBtn) {
      menuInvBtn.addEventListener('click', () => {
        sound.playClick();
        this.pauseMenu.classList.add('hidden');
        this.toggleInventory(true);
      });
    }

    const menuGuideBtn = document.getElementById('menu-btn-guide');
    if (menuGuideBtn) {
      menuGuideBtn.addEventListener('click', () => {
        sound.playClick();
        this.pauseMenu.classList.add('hidden');
        this.toggleGuide(true);
      });
    }

    const menuFullscreenBtn = document.getElementById('menu-btn-fullscreen');
    if (menuFullscreenBtn) {
      menuFullscreenBtn.addEventListener('click', () => {
        sound.playClick();
        this.toggleFullscreen();
      });
    }

    // Pointer lock listener to toggle pause menu & desktop click prompt
    this.controls.onLockChange = (isLocked) => {
      const isInGame = this.lobbyOverlay.classList.contains('hidden');
      const clickPrompt = document.getElementById('click-to-lock-prompt');

      if (!isLocked && !this.isInventoryOpen && !this.isChatOpen && !this.isGuideOpen && !this.isMapOpen && isInGame && !this.controls.isMobile) {
        this.pauseMenu.classList.remove('hidden');
        if (clickPrompt) clickPrompt.classList.add('hidden');
      } else {
        this.pauseMenu.classList.add('hidden');
        if (!isLocked && isInGame && !this.controls.isMobile && !this.isInventoryOpen && !this.isChatOpen && !this.isGuideOpen && !this.isMapOpen) {
          if (clickPrompt) clickPrompt.classList.remove('hidden');
        } else {
          if (clickPrompt) clickPrompt.classList.add('hidden');
        }
      }
    };
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  initChat() {
    const chatInput = document.getElementById('chat-input-field');
    const sendBtn = document.getElementById('chat-send-btn');

    window.addEventListener('keydown', (e) => {
      if ((e.code === 'KeyT' || e.code === 'Enter') && !this.isChatOpen && (this.controls.isLocked || this.controls.isMobile)) {
        e.preventDefault();
        sound.playClick();
        this.openChat();
      } else if (e.code === 'Escape' && this.isChatOpen) {
        sound.playClick();
        this.closeChat();
      }
    });

    const sendCurrentText = () => {
      if (!chatInput) return;
      const text = chatInput.value.trim();
      if (text) {
        this.multiplayer.sendChat(text);
      }
      chatInput.value = '';
      this.closeChat();
      if (!this.controls.isMobile) {
        this.controls.lock();
      }
    };

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          sound.playClick();
          sendCurrentText();
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        sound.playClick();
        sendCurrentText();
      });
    }

    const chatShareBtn = document.getElementById('chat-share-loc-btn');
    if (chatShareBtn) {
      chatShareBtn.addEventListener('click', () => {
        this.shareLocation();
      });
    }

    this.multiplayer.onChatMessage = (sender, text) => {
      this.addChatMessage(sender, text);
    };

    this.multiplayer.onNotification = (text) => {
      this.addSystemNotification(text);
    };
  }

  openChat() {
    this.controls.unlock();
    this.isChatOpen = true;
    if (this.chatInput) {
      this.chatInput.classList.remove('hidden');
      const inputField = document.getElementById('chat-input-field');
      if (inputField) inputField.focus();
    }
  }

  closeChat() {
    this.isChatOpen = false;
    if (this.chatInput) {
      this.chatInput.classList.add('hidden');
    }
  }

  addChatMessage(sender, text) {
    const feed = document.getElementById('chat-feed');
    if (!feed) return;

    const row = document.createElement('div');
    row.className = 'chat-message';

    const senderSpan = document.createElement('span');
    senderSpan.className = 'chat-sender';
    senderSpan.textContent = `<${sender}> `;
    row.appendChild(senderSpan);

    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';

    // Check for coordinate patterns to make them clickable
    const coordRegex = /(?:\(?X:\s*(-?\d+)[,\s]+Y:\s*(-?\d+)[,\s]+Z:\s*(-?\d+)\)?|XYZ(?::|\s)?\s*\(?(-?\d+)[,\s/]+(-?\d+)[,\s/]+(-?\d+)\)?)/i;
    const match = text.match(coordRegex);

    if (match) {
      const matchIndex = match.index;
      const matchText = match[0];
      const cx = parseInt(match[1] || match[4], 10);
      const cy = parseInt(match[2] || match[5], 10);
      const cz = parseInt(match[3] || match[6], 10);

      // Part before coords
      if (matchIndex > 0) {
        textSpan.appendChild(document.createTextNode(text.substring(0, matchIndex)));
      }

      // Interactive coordinate chip
      const coordBtn = document.createElement('span');
      coordBtn.className = 'chat-coord-btn';
      coordBtn.title = `Haz clic para teletransportarte a (${cx}, ${cy}, ${cz})`;
      coordBtn.textContent = matchText;

      coordBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sound.playClick();
        if (this.physics && typeof this.physics.teleport === 'function') {
          this.physics.teleport(cx, cy + 1, cz);
        } else if (this.controls?.physics && typeof this.controls.physics.teleport === 'function') {
          this.controls.physics.teleport(cx, cy + 1, cz);
        }
        if (typeof sound.playTeleport === 'function') {
          sound.playTeleport();
        }
        if (this.world && typeof this.world.updateStreaming === 'function') {
          this.world.updateStreaming(cx, cz);
        }
        const pos = this.physics?.pos || this.controls?.physics?.pos || { x: cx, y: cy + 1, z: cz };
        this.updateHUD(60, pos);
        this.showNotification(`Teletransportado a las coordenadas compartidas (${cx}, ${cy}, ${cz})`);
      });

      textSpan.appendChild(coordBtn);

      // Part after coords
      const afterIndex = matchIndex + matchText.length;
      if (afterIndex < text.length) {
        textSpan.appendChild(document.createTextNode(text.substring(afterIndex)));
      }
    } else {
      textSpan.textContent = text;
    }

    row.appendChild(textSpan);
    feed.appendChild(row);

    feed.scrollTop = feed.scrollHeight;

    // Fade out after 10 seconds
    setTimeout(() => {
      row.classList.add('fading');
      setTimeout(() => row.remove(), 2000);
    }, 8000);
  }

  showNotification(text) {
    this.addSystemNotification(text);
  }

  addSystemNotification(text) {
    const feed = document.getElementById('chat-feed');
    if (!feed) return;

    const row = document.createElement('div');
    row.className = 'chat-message system';
    row.textContent = `★ ${text}`;
    feed.appendChild(row);

    feed.scrollTop = feed.scrollHeight;
    setTimeout(() => {
      row.classList.add('fading');
      setTimeout(() => row.remove(), 2000);
    }, 7000);
  }

  initPlayerList() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!this.isPlayerListOpen) sound.playClick();
        this.updatePlayerListModal(true);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        this.updatePlayerListModal(false);
      }
    });

    const closeBtn = document.getElementById('close-player-list-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        sound.playClick();
        this.updatePlayerListModal(false);
      });
    }
  }

  updatePlayerListModal(show) {
    this.isPlayerListOpen = !!show;
    if (!this.playerListOverlay) return;
    if (!show) {
      this.playerListOverlay.classList.add('hidden');
      return;
    }

    this.playerListOverlay.classList.remove('hidden');
    const tableBody = document.getElementById('player-list-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    // Local player
    const pos = this.controls.physics.pos;
    const mySector = this.getSectorName(pos.x, pos.z);
    const myRow = document.createElement('tr');
    myRow.innerHTML = `
      <td><strong>${this.multiplayer.myName} (Tú)</strong></td>
      <td><span class="location-badge">${mySector}</span></td>
      <td><span class="self-badge">Tú</span></td>
    `;
    tableBody.appendChild(myRow);

    // Remote players
    for (const [id, avatar] of this.multiplayer.remoteAvatars.entries()) {
      const ax = avatar.targetPos ? Math.floor(avatar.targetPos.x) : 0;
      const ay = avatar.targetPos ? Math.floor(avatar.targetPos.y) : 24;
      const az = avatar.targetPos ? Math.floor(avatar.targetPos.z) : 0;
      const remoteSector = this.getSectorName(ax, az);

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${avatar.name}</td>
        <td><span class="location-badge">${remoteSector} (${ax}, ${az})</span></td>
        <td><button class="tp-friend-btn mc-btn" data-player-id="${id}" title="Teletransportarte a ${avatar.name}">Teletransportar 🚀</button></td>
      `;

      const tpBtn = row.querySelector('.tp-friend-btn');
      if (tpBtn) {
        tpBtn.addEventListener('click', () => {
          sound.playClick();
          if (this.multiplayer && typeof this.multiplayer.requestTeleportToPlayer === 'function') {
            this.multiplayer.requestTeleportToPlayer(id);
          } else if (this.physics && typeof this.physics.teleport === 'function') {
            this.physics.teleport(ax, ay + 1, az);
            if (typeof sound.playTeleport === 'function') sound.playTeleport();
            this.showNotification('Te has teletransportado hacia ' + avatar.name);
          }
          this.updatePlayerListModal(false);
          if (!this.controls?.isMobile) {
            this.controls?.lock?.();
          }
        });
      }

      tableBody.appendChild(row);
    }
  }

  setScopeVisible(visible) {
    const scopeOverlay = document.getElementById('rifle-scope-overlay');
    const crosshair = document.getElementById('crosshair');
    if (scopeOverlay) {
      if (visible) {
        scopeOverlay.classList.remove('hidden');
        if (crosshair) crosshair.classList.add('hidden');
      } else {
        scopeOverlay.classList.add('hidden');
        if (crosshair) crosshair.classList.remove('hidden');
      }
    }
  }

  updateHUD(fps, pos) {
    // Synchronize crosshair visibility with sniper scope overlay
    const scopeOverlay = document.getElementById('rifle-scope-overlay');
    const crosshair = document.getElementById('crosshair');
    if (scopeOverlay && crosshair) {
      const scopeVisible = !scopeOverlay.classList.contains('hidden');
      if (scopeVisible && !crosshair.classList.contains('hidden')) {
        crosshair.classList.add('hidden');
      } else if (!scopeVisible && crosshair.classList.contains('hidden') && !this.controls?.isAiming) {
        crosshair.classList.remove('hidden');
      }
    }

    // Update live connected count badge
    this.updatePlayerCountBadge();

    // Update corner FPS element (ONLY place where FPS is displayed in HUD)
    const fpsElem = document.getElementById('hud-fps-val');
    if (fpsElem) {
      fpsElem.textContent = `${fps} FPS`;
    }

    // Update coordinates & sector (WITHOUT duplicate FPS)
    const coordsElem = document.getElementById('hud-coords');
    if (coordsElem && pos) {
      const bx = Math.floor(pos.x);
      const by = Math.floor(pos.y);
      const bz = Math.floor(pos.z);
      const sector = this.getSectorName(bx, bz);
      coordsElem.textContent = `XYZ: ${bx} / ${by} / ${bz} • ${sector}`;
    }

    // Session Uptime Timer (HH:MM:SS)
    const uptimeSec = Math.floor((Date.now() - this.sessionStartTime) / 1000);
    const hh = String(Math.floor(uptimeSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((uptimeSec % 3600) / 60)).padStart(2, '0');
    const ss = String(uptimeSec % 60).padStart(2, '0');
    const uptimeElem = document.getElementById('session-uptime-val');
    if (uptimeElem) {
      uptimeElem.textContent = `${hh}:${mm}:${ss}`;
    }

    // FPS Telemetry Stats & Live Canvas Graph
    if (typeof fps === 'number' && fps > 0) {
      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > 50) this.fpsHistory.shift();

      const nowElem = document.getElementById('telemetry-fps-now');
      if (nowElem) nowElem.textContent = fps;

      let sum = 0, min = 999, max = 0;
      for (let i = 0; i < this.fpsHistory.length; i++) {
        const val = this.fpsHistory[i];
        sum += val;
        if (val < min) min = val;
        if (val > max) max = val;
      }
      const avg = Math.round(sum / this.fpsHistory.length);

      const avgElem = document.getElementById('telemetry-fps-avg');
      if (avgElem) avgElem.textContent = avg;
      const minElem = document.getElementById('telemetry-fps-min');
      if (minElem) minElem.textContent = min;
      const maxElem = document.getElementById('telemetry-fps-max');
      if (maxElem) maxElem.textContent = max;

      const gradeBadge = document.getElementById('telemetry-grade-badge');
      if (gradeBadge) {
        if (avg >= 55) {
          gradeBadge.className = 'telemetry-grade grade-s';
          gradeBadge.textContent = `S+ ÓPTIMO (${Math.min(100, Math.round((avg / 60) * 100))}%)`;
        } else if (avg >= 45) {
          gradeBadge.className = 'telemetry-grade grade-a';
          gradeBadge.textContent = `A EXCELENTE (${Math.round((avg / 60) * 100)}%)`;
        } else if (avg >= 30) {
          gradeBadge.className = 'telemetry-grade grade-b';
          gradeBadge.textContent = `B BUENO (${Math.round((avg / 60) * 100)}%)`;
        } else {
          gradeBadge.className = 'telemetry-grade grade-c';
          gradeBadge.textContent = `C MODERADO (${Math.round((avg / 60) * 100)}%)`;
        }
      }

      this.drawFpsGraph();
    }

    // Update targeted voxel highlight wireframe
    const targeted = this.controls.targetedVoxel;
    if (targeted) {
      this.highlightBox.position.set(targeted.x + 0.5, targeted.y + 0.5, targeted.z + 0.5);
      this.highlightBox.visible = true;

      const blockLabel = document.getElementById('target-block-name');
      const def = BLOCK_DEFS[targeted.type];
      if (blockLabel && def) {
        blockLabel.textContent = `Mirando a: ${def.name}`;
      }
    } else {
      this.highlightBox.visible = false;
      const blockLabel = document.getElementById('target-block-name');
      if (blockLabel) blockLabel.textContent = '';
    }

    // Update Vehicle Driving HUD, Speedometer & Proximity Enter Prompt
    const drivingHud = document.getElementById('vehicle-driving-hud');
    const enterPrompt = document.getElementById('vehicle-enter-prompt');
    const mobileCarExitBtn = document.getElementById('mobile-btn-car-exit');
    const mobileCarBtn = document.getElementById('mobile-btn-car');

    const isDriving = !!(this.vehicleManager && this.vehicleManager.isDriving());
    if (isDriving) {
      if (drivingHud) {
        drivingHud.classList.remove('hidden');
      }
      if (enterPrompt) {
        enterPrompt.classList.add('hidden');
      }
      if (mobileCarExitBtn) {
        mobileCarExitBtn.classList.remove('hidden');
      }
      if (mobileCarBtn) {
        mobileCarBtn.classList.add('hidden');
      }

      const car = this.vehicleManager.activeCar;
      if (car) {
        const speedMs = Math.abs(car.speed || 0);
        const speedKmh = Math.round(speedMs * 3.6);
        const speedNum = document.getElementById('vehicle-speed-num');
        const speedMsEl = document.getElementById('vehicle-speed-ms');
        const speedBar = document.getElementById('vehicle-speed-bar');
        const modelName = document.getElementById('vehicle-model-name');
        const camIndicator = document.getElementById('vehicle-cam-indicator');

        if (speedNum) speedNum.textContent = speedKmh;
        if (speedMsEl) speedMsEl.textContent = `${speedMs.toFixed(1)} m/s`;
        if (speedBar) {
          const maxSpd = car.maxSpeed || 16.5;
          const pct = Math.min(100, Math.max(0, Math.round((speedMs / maxSpd) * 100)));
          speedBar.style.width = `${pct}%`;
        }
        if (modelName) {
          modelName.textContent = car.name || 'Gran Prix Racer';
        }
        if (camIndicator) {
          const camMode = this.vehicleManager.cameraMode || 'chase';
          camIndicator.textContent = camMode === 'cockpit' ? '🕹️ CABINA [V]' : '🎥 PERSECUCIÓN [V]';
        }
      }
    } else {
      if (drivingHud) {
        drivingHud.classList.add('hidden');
      }
      if (mobileCarExitBtn) {
        mobileCarExitBtn.classList.add('hidden');
      }

      const playerPos = pos || this.physics?.pos || this.controls?.physics?.pos;
      if (this.vehicleManager && playerPos) {
        const nearestCar = this.vehicleManager.getNearestCar(playerPos, 4.5);
        if (nearestCar && enterPrompt) {
          enterPrompt.classList.remove('hidden');
          const promptText = document.getElementById('vehicle-prompt-text');
          if (promptText) {
            promptText.innerHTML = `Presiona <strong>[E]</strong> o <strong>[F]</strong> para conducir <strong>${nearestCar.name || 'el coche'}</strong>`;
          }
          if (mobileCarBtn) {
            mobileCarBtn.classList.remove('hidden');
          }
        } else {
          if (enterPrompt) enterPrompt.classList.add('hidden');
          if (mobileCarBtn) mobileCarBtn.classList.add('hidden');
        }
      } else {
        if (enterPrompt) enterPrompt.classList.add('hidden');
        if (mobileCarBtn) mobileCarBtn.classList.add('hidden');
      }
    }
  }

  drawFpsGraph() {
    if (!this.fpsCanvasCtx || !this.fpsTelemetryCanvas) return;
    const ctx = this.fpsCanvasCtx;
    const w = this.fpsTelemetryCanvas.width;
    const h = this.fpsTelemetryCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Subtle horizontal grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.25); ctx.lineTo(w, h * 0.25);
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
    ctx.moveTo(0, h * 0.75); ctx.lineTo(w, h * 0.75);
    ctx.stroke();

    if (this.fpsHistory.length < 2) return;

    const maxScale = Math.max(75, ...this.fpsHistory);
    const stepX = w / (this.fpsHistory.length - 1);

    // Area fill with green gradient
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < this.fpsHistory.length; i++) {
      const x = i * stepX;
      const y = h - (this.fpsHistory[i] / maxScale) * (h - 8);
      ctx.lineTo(x, y);
    }
    ctx.lineTo((this.fpsHistory.length - 1) * stepX, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(85, 255, 85, 0.35)');
    grad.addColorStop(1, 'rgba(85, 255, 85, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line stroke
    ctx.beginPath();
    for (let i = 0; i < this.fpsHistory.length; i++) {
      const x = i * stepX;
      const y = h - (this.fpsHistory[i] / maxScale) * (h - 8);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#55ff55';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  showWeaponHitToast(data) {
    const toast = document.getElementById('weapon-hit-toast');
    if (!toast || !data) return;

    const isMeTarget = (data.targetPlayerId === this.multiplayer?.myId);
    const isMeShooter = (data.shooterId === this.multiplayer?.myId);

    if (isMeTarget) {
      toast.textContent = `💥 ¡Has recibido un impacto amistoso de ${data.shooterName || 'Jugador'}!`;
      toast.className = 'hit-target-toast show';
      if (sound && typeof sound.playHitThud === 'function') sound.playHitThud();
    } else if (isMeShooter) {
      toast.textContent = `🎯 ¡Impacto certero en ${data.targetName || 'Jugador'}!`;
      toast.className = 'hit-shooter-toast show';
      if (sound && typeof sound.playHitThud === 'function') sound.playHitThud();
    } else {
      return;
    }

    clearTimeout(this.hitToastTimeout);
    this.hitToastTimeout = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2400);
    toast.classList.remove('hidden');
  }
}
