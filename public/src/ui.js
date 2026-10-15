// public/src/ui.js
// Modern game UI: Lobby, HUD, Hotbar, Inventory, Pause menu, Chat, Mobile Virtual Controls & Interactive Tutorial
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, HOTBAR_BLOCKS } from './blocks.js';
import { sound } from './audio.js';

export class UIManager {
  constructor(materialManager, controls, sceneManager, world, multiplayer) {
    this.materials = materialManager;
    this.controls = controls;
    this.sceneManager = sceneManager;
    this.world = world;
    this.multiplayer = multiplayer;

    // Elements
    this.lobbyOverlay = document.getElementById('lobby-overlay');
    this.hudOverlay = document.getElementById('hud-overlay');
    this.pauseMenu = document.getElementById('pause-menu');
    this.inventoryModal = document.getElementById('inventory-modal');
    this.guideModal = document.getElementById('guide-modal');
    this.worldMapModal = document.getElementById('world-map-modal');
    this.hudOnlineCount = document.getElementById('hud-online-count');
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

    // 3D wireframe box for highlighting targeted voxel
    this.buildHighlightBox();

    // Setup real-time multiplayer player count listener
    if (this.multiplayer) {
      this.multiplayer.onPlayerCountChange = (count) => {
        this.updatePlayerCountBadge(count);
        if (this.isPlayerListOpen) {
          this.updatePlayerListModal(true);
        }
      };
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
            lobbyPlayerCount.textContent = `${data.onlinePlayers || 0} / ${data.maxPlayers || 12} conectados`;
          }
        })
        .catch(() => {
          if (serverStatus) {
            serverStatus.innerHTML = '<span class="status-dot offline"></span> Reconectando...';
          }
        });
    };
    updateServerStatus();
    setInterval(updateServerStatus, 5000);

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
      }

      this.multiplayer.connect(name);
      this.controls.lock();

      // Show friendly tutorial prompt in chat
      setTimeout(() => {
        this.addSystemNotification('🏰 ¡Bienvenido a la Plaza Central! Clic Izq: Romper | Clic Der: Construir | [🎒 Bloques] | [❓ Guía]');
      }, 700);
    };

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
    const btnMap = document.getElementById('btn-open-map');
    const btnShareLoc = document.getElementById('btn-share-loc');
    const btnSpeedToggle = document.getElementById('btn-speed-toggle');

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
        sound.playClick();
        this.cycleSpeed();
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

    // Fast travel destination buttons
    const destButtons = document.querySelectorAll('.map-dest-btn');
    destButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.playClick();
        const tx = parseFloat(btn.dataset.x);
        const ty = parseFloat(btn.dataset.y);
        const tz = parseFloat(btn.dataset.z);
        const titleElem = btn.querySelector('.dest-title');
        const title = titleElem ? titleElem.textContent : 'Monumento';

        this.controls.physics.teleport(tx, ty, tz);
        this.world.updateStreaming(tx, tz);
        sound.playTeleport();

        this.toggleMap(false);
        this.addSystemNotification(`Has viajado a [${title}] XYZ (${tx}, ${ty}, ${tz})`);
      });
    });

    // Speed options buttons inside World Map modal
    const speedOpt1 = document.getElementById('speed-btn-1');
    const speedOpt2 = document.getElementById('speed-btn-2');
    const speedOpt5 = document.getElementById('speed-btn-5');

    const setSpeedOption = (tier, mult, flight) => {
      this.currentSpeedTier = tier;
      this.controls.physics.speedMultiplier = mult;
      this.controls.physics.flightMode = flight;

      [speedOpt1, speedOpt2, speedOpt5].forEach((b, idx) => {
        if (b) b.classList.toggle('active', idx + 1 === tier);
      });

      const speedBtn = document.getElementById('btn-speed-toggle');
      if (speedBtn) {
        speedBtn.textContent = (tier === 1) ? '⚡ 1x' : ((tier === 2) ? '⚡ 2.5x' : '🦅 5x');
      }

      const modeName = (tier === 1) ? 'Normal (1x)' : ((tier === 2) ? 'Rápido (2.5x)' : 'Vuelo / Modo Dios (5x)');
      this.addSystemNotification(`Velocidad ajustada a: ${modeName}`);
    };

    if (speedOpt1) {
      speedOpt1.addEventListener('click', () => {
        sound.playClick();
        setSpeedOption(1, 1.0, false);
      });
    }
    if (speedOpt2) {
      speedOpt2.addEventListener('click', () => {
        sound.playClick();
        setSpeedOption(2, 2.5, false);
      });
    }
    if (speedOpt5) {
      speedOpt5.addEventListener('click', () => {
        sound.playClick();
        setSpeedOption(3, 5.0, true);
      });
    }

    // Hotkey 'KeyM'
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !this.isChatOpen) {
        sound.playClick();
        this.toggleMap(!this.isMapOpen);
      }
      if (e.code === 'Escape' && this.isMapOpen) {
        sound.playClick();
        this.toggleMap(false);
      }
    });
  }

  toggleMap(open) {
    this.isMapOpen = open;
    if (this.worldMapModal) {
      this.worldMapModal.classList.toggle('hidden', !open);
    }
    if (open) {
      this.controls.unlock();
    } else {
      this.controls.lock();
    }
  }

  cycleSpeed() {
    this.currentSpeedTier = (this.currentSpeedTier % 3) + 1;
    let mult = 1.0;
    let flight = false;
    let label = '⚡ 1x';

    if (this.currentSpeedTier === 2) {
      mult = 2.5;
      flight = false;
      label = '⚡ 2.5x';
    } else if (this.currentSpeedTier === 3) {
      mult = 5.0;
      flight = true;
      label = '🦅 5x';
    }

    this.controls.physics.speedMultiplier = mult;
    this.controls.physics.flightMode = flight;

    const speedBtn = document.getElementById('btn-speed-toggle');
    if (speedBtn) speedBtn.textContent = label;

    const speedOpt1 = document.getElementById('speed-btn-1');
    const speedOpt2 = document.getElementById('speed-btn-2');
    const speedOpt5 = document.getElementById('speed-btn-5');
    [speedOpt1, speedOpt2, speedOpt5].forEach((b, idx) => {
      if (b) b.classList.toggle('active', idx + 1 === this.currentSpeedTier);
    });

    const modeName = (this.currentSpeedTier === 1) ? 'Normal (1x)' : ((this.currentSpeedTier === 2) ? 'Rápido (2.5x)' : 'Vuelo / Modo Dios (5x)');
    this.addSystemNotification(`Velocidad: ${modeName}`);
  }

  getSectorName(x, z) {
    const distCenter = Math.hypot(x, z);
    if (distCenter <= 24) return '🏰 Descampado Central';
    if (z >= 440 && z <= 560 && Math.abs(x) <= 55) return '🇳🇴 Fiordos de Noruega';
    if (Math.hypot(x - 250, z - 250) <= 60) return '🇯🇵 Japón Imperial';
    if (Math.hypot(x + 250, z - 250) <= 60) return '🇨🇳 China & Shanghai';
    if (Math.hypot(x - 250, z + 250) <= 60) return '🇫🇷 París';
    if (Math.hypot(x + 250, z + 250) <= 60) return '🇺🇸 Nueva York';
    return '🌲 Bosque y Llanuras';
  }

  shareLocation() {
    const pos = this.controls.physics.pos;
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);
    const sector = this.getSectorName(bx, bz);
    const msg = `📍 Estoy en [${sector}] XYZ (${bx}, ${by}, ${bz}). ¡Venid a visitarme!`;
    this.multiplayer.sendChat(msg);
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

    // Pointer lock listener to toggle pause menu
    this.controls.onLockChange = (isLocked) => {
      const isInGame = this.lobbyOverlay.classList.contains('hidden');
      if (!isLocked && !this.isInventoryOpen && !this.isChatOpen && !this.isGuideOpen && isInGame && !this.controls.isMobile) {
        this.pauseMenu.classList.remove('hidden');
      } else {
        this.pauseMenu.classList.add('hidden');
      }
    };
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

    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = text;

    row.appendChild(senderSpan);
    row.appendChild(textSpan);
    feed.appendChild(row);

    feed.scrollTop = feed.scrollHeight;

    // Fade out after 10 seconds
    setTimeout(() => {
      row.classList.add('fading');
      setTimeout(() => row.remove(), 2000);
    }, 8000);
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
        <td><button class="tp-friend-btn mc-btn" title="Teletransportarte a ${avatar.name}">🚀 Ir a él</button></td>
      `;

      const tpBtn = row.querySelector('.tp-friend-btn');
      if (tpBtn) {
        tpBtn.addEventListener('click', () => {
          sound.playClick();
          this.controls.physics.teleport(ax, ay + 1, az);
          this.world.updateStreaming(ax, az);
          sound.playTeleport();
          this.updatePlayerListModal(false);
          this.addSystemNotification(`Te has teletransportado junto a ${avatar.name}`);
        });
      }

      tableBody.appendChild(row);
    }
  }

  updateHUD(fps, pos) {
    // Update live connected count badge
    this.updatePlayerCountBadge();

    // Update coordinates & sector
    const coordsElem = document.getElementById('hud-coords');
    if (coordsElem && pos) {
      const bx = Math.floor(pos.x);
      const by = Math.floor(pos.y);
      const bz = Math.floor(pos.z);
      const sector = this.getSectorName(bx, bz);
      coordsElem.textContent = `XYZ: ${bx} / ${by} / ${bz} | ${sector} | ${fps} FPS`;
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
  }
}
