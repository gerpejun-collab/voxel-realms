// public/src/ui.js
// Modern game UI: Lobby, HUD, Hotbar, Inventory, Pause menu, Chat, Mobile Virtual Controls & Interactive Tutorial
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, HOTBAR_BLOCKS } from './blocks.js';

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
    this.mobileOverlay = document.getElementById('mobile-touch-overlay');
    this.chatContainer = document.getElementById('chat-container');
    this.chatInput = document.getElementById('chat-input');
    this.hotbarContainer = document.getElementById('hotbar');
    this.playerListOverlay = document.getElementById('player-list-modal');

    this.hotbarBlocks = [...HOTBAR_BLOCKS];
    this.isChatOpen = false;
    this.isInventoryOpen = false;
    this.isGuideOpen = false;

    // 3D wireframe box for highlighting targeted voxel
    this.buildHighlightBox();

    this.initLobby();
    this.initHotbar();
    this.initInventory();
    this.initPauseMenu();
    this.initChat();
    this.initQuickActions();
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
      joinBtn.addEventListener('click', doJoin);
    }
    if (nameInput) {
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doJoin();
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
        this.selectHotbarSlot(i);
      });

      this.hotbarContainer.appendChild(slotDiv);
    }

    this.controls.onSelectHotbar = (idx) => {
      this.selectHotbarSlot(idx);
    };
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
      closeBtn.addEventListener('click', () => this.toggleInventory(false));
    }

    // Toggle on 'E' key or close on 'Escape'
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !this.isChatOpen && !this.isGuideOpen) {
        if (this.controls.isLocked) {
          this.controls.unlock();
          this.toggleInventory(true);
        } else if (this.isInventoryOpen) {
          this.toggleInventory(false);
          this.controls.lock();
        }
      } else if (e.code === 'Escape' && this.isInventoryOpen) {
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
    const btnChat = document.getElementById('btn-open-chat');
    const btnGuide = document.getElementById('btn-open-guide');
    const btnInv = document.getElementById('btn-open-inv');

    if (btnChat) {
      btnChat.addEventListener('click', () => {
        this.openChat();
      });
    }

    if (btnGuide) {
      btnGuide.addEventListener('click', () => {
        this.toggleGuide(true);
      });
    }

    if (btnInv) {
      btnInv.addEventListener('click', () => {
        this.controls.unlock();
        this.toggleInventory(true);
      });
    }
  }

  initGuide() {
    const closeBtn = document.getElementById('close-guide-btn');
    const understandBtn = document.getElementById('guide-understand-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.toggleGuide(false));
    }
    if (understandBtn) {
      understandBtn.addEventListener('click', () => this.toggleGuide(false));
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isGuideOpen) {
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
        this.controls.triggerBreak();
      });
      btnBreak.addEventListener('click', () => {
        this.controls.triggerBreak();
      });
    }

    if (btnPlace) {
      btnPlace.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.controls.triggerPlace();
      });
      btnPlace.addEventListener('click', () => {
        this.controls.triggerPlace();
      });
    }

    if (btnJump) {
      const startJump = (e) => {
        e.preventDefault();
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
        this.pauseMenu.classList.add('hidden');
        this.controls.lock();
      });
    }

    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => {
        location.reload();
      });
    }

    if (sensSlider) {
      sensSlider.addEventListener('input', (e) => {
        this.controls.sensitivity = parseFloat(e.target.value);
      });
    }

    if (fovSlider) {
      fovSlider.addEventListener('input', (e) => {
        this.sceneManager.camera.fov = parseInt(e.target.value, 10);
        this.sceneManager.camera.updateProjectionMatrix();
      });
    }

    if (renderDistSlider) {
      renderDistSlider.addEventListener('input', (e) => {
        this.world.renderDistance = parseInt(e.target.value, 10);
      });
    }

    if (qualityMenuSelect) {
      qualityMenuSelect.addEventListener('change', (e) => {
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
        this.openChat();
      } else if (e.code === 'Escape' && this.isChatOpen) {
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
          sendCurrentText();
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
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
        this.updatePlayerListModal(true);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        this.updatePlayerListModal(false);
      }
    });
  }

  updatePlayerListModal(show) {
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
    const myRow = document.createElement('tr');
    myRow.innerHTML = `<td><strong>${this.multiplayer.myName} (Tú)</strong></td><td><span class="ping-badge">Activo</span></td>`;
    tableBody.appendChild(myRow);

    // Remote players
    for (const [id, avatar] of this.multiplayer.remoteAvatars.entries()) {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${avatar.name}</td><td><span class="ping-badge">Conectado</span></td>`;
      tableBody.appendChild(row);
    }
  }

  updateHUD(fps, pos) {
    // Update coordinates & biome
    const coordsElem = document.getElementById('hud-coords');
    if (coordsElem && pos) {
      const bx = Math.floor(pos.x);
      const by = Math.floor(pos.y);
      const bz = Math.floor(pos.z);
      const distCenter = Math.hypot(bx, bz);
      const biome = (distCenter <= 16) ? '🏰 Descampado Central' : ((by >= 42) ? 'Montañas Nevadas' : ((by <= 19) ? 'Costa / Playa' : 'Bosque y Pradera'));
      coordsElem.textContent = `XYZ: ${bx} / ${by} / ${bz} | ${biome} | ${fps} FPS`;
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
