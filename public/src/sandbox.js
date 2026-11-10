// public/src/sandbox.js
// Offline Sandbox Mode, World File Save/Load (.vrealm.json), Android Storage Permission Manager,
// Prefab Building Catalog (Eiffel Tower, Pagoda, Bridges, Lakes, Trees), Multi-Block Brushes & 3D Cloner
import { BLOCKS } from './blocks.js';
import { sound } from './audio.js';

export const PREFAB_CATALOG = [
  {
    id: 'giant_billboard',
    category: 'buildings',
    name: 'Cartel Gigante / Pantalla de Anuncios',
    icon: '📺',
    size: '15×12×3',
    desc: 'Colosal pantalla LED publicitaria con soporte y fotos animadas en ciclo dinámico'
  },
  {
    id: 'eiffel_tower',
    category: 'buildings',
    name: 'Torre Eiffel (París)',
    icon: '🗼',
    size: '15×32×15',
    desc: 'Réplica monumental de 3 niveles con arcos, miradores y faro dorado'
  },
  {
    id: 'japan_pagoda',
    category: 'buildings',
    name: 'Pagoda Imperial (Japón)',
    icon: '🏯',
    size: '13×22×13',
    desc: 'Templo imperial de 4 pisos con aleros carmesí y aguja de oro'
  },
  {
    id: 'torii_gate',
    category: 'buildings',
    name: 'Gran Arco Torii Sagrado',
    icon: '⛩️',
    size: '11×11×5',
    desc: 'Pórtico tradicional japonés carmesí con linternas doradas'
  },
  {
    id: 'shanghai_tower',
    category: 'buildings',
    name: 'Rascacielos de Cristal (Shanghái)',
    icon: '🏙️',
    size: '11×28×11',
    desc: 'Torre moderna de cristal iluminado, acero y corona dorada'
  },
  {
    id: 'ny_skyscraper',
    category: 'buildings',
    name: 'Rascacielos Art Déco (Nueva York)',
    icon: '🏢',
    size: '11×26×11',
    desc: 'Edificio clásico estilo Empire State con aguja metálica'
  },
  {
    id: 'norway_cabin',
    category: 'buildings',
    name: 'Cabaña Alpina de Madera',
    icon: '🏡',
    size: '9×8×9',
    desc: 'Casa acogedora con tejado a dos aguas, ventanas de cristal y entrada'
  },
  {
    id: 'beach_villa',
    category: 'buildings',
    name: 'Villa Resort con Piscina',
    icon: '🏖️',
    size: '13×8×15',
    desc: 'Mansión moderna de vacaciones con terraza y piscina de agua'
  },
  {
    id: 'plaza_fountain',
    category: 'buildings',
    name: 'Fuente Imperial con Agua',
    icon: '⛲',
    size: '9×7×9',
    desc: 'Fuente monumental de piedra y oro con surtidor de agua cristalina'
  },
  {
    id: 'stone_bridge',
    category: 'infra',
    name: 'Gran Puente Colgante y Asfalto',
    icon: '🌉',
    size: '17×7×7',
    desc: 'Puente completo con calzada, arcos de soporte, cables y farolas'
  },
  {
    id: 'highway_segment',
    category: 'infra',
    name: 'Tramo de Autopista Asfaltada',
    icon: '🛣️',
    size: '13×2×7',
    desc: 'Carretera asfaltada con bordillos de piedra y líneas blancas'
  },
  {
    id: 'castle_wall',
    category: 'infra',
    name: 'Muralla Fortificada con Almenas',
    icon: '🧱',
    size: '13×7×3',
    desc: 'Muralla defensiva de piedra con pasarela superior y almenas'
  },
  {
    id: 'water_lake',
    category: 'nature',
    name: 'Lago / Estanque de Agua',
    icon: '💧',
    size: '11×3×11',
    desc: 'Estanque natural de agua cristalina con orilla de arena'
  },
  {
    id: 'water_waterfall',
    category: 'nature',
    name: 'Cascada de Roca y Agua',
    icon: '🌊',
    size: '7×10×7',
    desc: 'Peñasco natural con caída de agua hacia una poza inferior'
  },
  {
    id: 'oak_tree',
    category: 'nature',
    name: 'Roble Frondoso',
    icon: '🌳',
    size: '5×7×5',
    desc: 'Árbol clásico de tronco de roble y copa frondosa'
  },
  {
    id: 'sakura_tree',
    category: 'nature',
    name: 'Cerezo Imperial Gigante',
    icon: '🌸',
    size: '7×9×7',
    desc: 'Árbol monumental de copa ancha y ramas decorativas'
  },
  {
    id: 'palm_tree',
    category: 'nature',
    name: 'Palmera Tropical',
    icon: '🌴',
    size: '7×9×7',
    desc: 'Palmera alta curvada ideal para playas, piscinas y jardines'
  },
  {
    id: 'forest_grove',
    category: 'nature',
    name: 'Bosque Instantáneo (Arboleda)',
    icon: '🌲',
    size: '15×8×15',
    desc: 'Conjunto de 5 árboles variados con césped natural'
  }
];

export const BRUSH_MODES = [
  { id: '1x1', name: 'Bloque 1×1 (Normal)', icon: '🧱', desc: 'Coloca o rompe 1 bloque a la vez' },
  { id: 'platform_3x3', name: 'Plataforma 3×3', icon: '⬛', desc: 'Coloca una losa horizontal de 3×3 bloques' },
  { id: 'platform_5x5', name: 'Gran Plataforma 5×5', icon: '🟧', desc: 'Construye suelos rápidos de 5×5 bloques' },
  { id: 'cube_3x3x3', name: 'Cubo Sólido 3×3×3', icon: '🧊', desc: 'Rellena un bloque cúbico de 27 vóxeles' },
  { id: 'wall_5x4', name: 'Muro Instantáneo 5×4', icon: '🧱', desc: 'Levanta una pared de 5 de ancho por 4 de alto' },
  { id: 'sphere_r3', name: 'Esfera / Colina (Radio 3)', icon: '🟢', desc: 'Esculpe terreno, roca, hojas o agua en esfera' },
  { id: 'water_pool_5x5', name: 'Piscina / Canal de Agua 5×5', icon: '💧', desc: 'Excava y rellena con Agua (BLOCKS.WATER) al instante' },
  { id: 'eraser_5x5x5', name: 'Excavadora / Borrador 5×5×5', icon: '🚜', desc: 'Limpia y aplana estructuras o terreno de 5×5×5' }
];

export const ANIMAL_SPAWN_CATALOG = [
  { id: 'sheep', name: 'Oveja', icon: '🐑', desc: 'Camina libremente evitando paredes y edificios' },
  { id: 'cow', name: 'Vaca', icon: '🐄', desc: 'Pastorea por la pradera sin atravesar muros' },
  { id: 'pig', name: 'Cerdo', icon: '🐖', desc: 'NPC amistoso con colisión sólida contra bloques' },
  { id: 'horse', name: 'Caballo Purasangre', icon: '🐎', desc: 'Galopa por tus caminos y praderas' },
  { id: 'wolf', name: 'Lobo Guardián', icon: '🐺', desc: 'Patrulla alrededor de tus construcciones' },
  { id: 'chicken', name: 'Gallina', icon: '🐔', desc: 'Ideal para granjas y jardines' },
  { id: 'pack_mixed', name: 'Manada Completa (6 Animales)', icon: '🐾', desc: 'Genera 6 animales variados alrededor del punto mirado' }
];

export class SandboxManager {
  constructor(world, physics, controls, multiplayer, animalManager, ui = null) {
    this.world = world;
    this.physics = physics;
    this.controls = controls;
    this.multiplayer = multiplayer;
    this.animalManager = animalManager;
    this.ui = ui;

    // Active Builder Tool State
    // toolType: 'none' | 'brush' | 'prefab' | 'cloner_select_a' | 'cloner_select_b' | 'cloner_paste' | 'animal'
    this.activeToolType = 'none';
    this.activeBrushId = '1x1';
    this.activePrefabId = null;
    this.activeAnimalType = null;
    this.prefabRotation = 0; // 0, 1, 2, 3 (90-degree increments)

    // 3D Structure Cloner State (Copy any building outside restricted zones!)
    this.clonerPointA = null;
    this.clonerPointB = null;
    this.clipboardDeltas = []; // Array of [dx, dy, dz, blockType]
    this.clipboardName = '';
    this.clipboardSize = [0, 0, 0];

    // Ergonomic 1-Tap Quick Building Tools (Fill & Paint)
    this.fillModeActive = false;
    this.fillPointA = null;
    this.paintModeActive = false;

    // Undo stack for batch operations (up to 15 steps)
    this.undoStack = [];

    // Android Permission State
    this.androidStoragePermissionGranted = false;
    try {
      if (typeof localStorage !== 'undefined') {
        this.androidStoragePermissionGranted = localStorage.getItem('vr_android_storage_granted') === 'true';
      }
    } catch (_) {}
  }

  /**
   * Returns true if the current user is the main administrator
   */
  isMainAdmin() {
    if (this.multiplayer && typeof this.multiplayer.isMainAdmin === 'function') {
      return this.multiplayer.isMainAdmin();
    }
    return false;
  }

  /**
   * Strict Restricted Zone Check:
   * Base Militar (-455..-385, 115..185) & Búnker Subterráneo (-565..-435, 235..365)
   * remain reserved and protected even in Offline Mode for non-admin users!
   */
  isRestrictedZone(x, y, z) {
    if (this.isMainAdmin()) return false;
    const bx = Math.round(x);
    const bz = Math.round(z);
    if (bx >= -455 && bx <= -385 && bz >= 115 && bz <= 185) return true;
    if (bx >= -565 && bx <= -435 && bz >= 235 && bz <= 365) return true;
    return false;
  }

  /**
   * Enforces physical perimeter repulsion around reserved zones when in Offline Mode
   * (Online mode already enforces this on the server, and now Offline Mode enforces it locally too!)
   */
  enforceOfflineRestrictedZones(playerPos) {
    if (!playerPos || this.isMainAdmin()) return false;

    const px = playerPos.x;
    const pz = playerPos.z;

    // 1. Air Base Perimeter (-455..-385, 115..185)
    if (px >= -455.5 && px <= -384.5 && pz >= 114.5 && pz <= 185.5) {
      const distWest = Math.abs(px - (-455.5));
      const distEast = Math.abs(-384.5 - px);
      const distSouth = Math.abs(pz - 114.5);
      const distNorth = Math.abs(185.5 - pz);
      const minD = Math.min(distWest, distEast, distSouth, distNorth);
      if (minD === distWest) playerPos.x = -456.8;
      else if (minD === distEast) playerPos.x = -383.2;
      else if (minD === distSouth) playerPos.z = 113.2;
      else playerPos.z = 186.8;

      if (this.ui && (!this._lastRepelNotify || Date.now() - this._lastRepelNotify > 3500)) {
        this._lastRepelNotify = Date.now();
        this.ui.showNotification('🛡️ Zona Reservada: La Base Militar Aérea está protegida en todos los modos.');
      }
      return true;
    }

    // 2. Underground Bunker & Silo Perimeter (-565..-435, 235..365)
    if (px >= -565.5 && px <= -434.5 && pz >= 234.5 && pz <= 365.5) {
      const distWest = Math.abs(px - (-565.5));
      const distEast = Math.abs(-434.5 - px);
      const distSouth = Math.abs(pz - 234.5);
      const distNorth = Math.abs(365.5 - pz);
      const minD = Math.min(distWest, distEast, distSouth, distNorth);
      if (minD === distWest) playerPos.x = -566.8;
      else if (minD === distEast) playerPos.x = -433.2;
      else if (minD === distSouth) playerPos.z = 233.2;
      else playerPos.z = 366.8;

      if (this.ui && (!this._lastRepelNotify || Date.now() - this._lastRepelNotify > 3500)) {
        this._lastRepelNotify = Date.now();
        this.ui.showNotification('🛡️ Zona Reservada: El Búnker Subterráneo y los Silos están protegidos.');
      }
      return true;
    }

    return false;
  }

  /**
   * Detects if running on Android or mobile device
   */
  isAndroidDevice() {
    if (typeof navigator === 'undefined') return false;
    return /Android/i.test(navigator.userAgent || '');
  }

  /**
   * Request Android file/storage permissions (READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE / Media & File Access)
   * Calls native Android WebView bridge if wrapped in APK/Capacitor/Cordova, requests StorageManager persistence,
   * and shows the interactive Android permission dialog if not yet granted.
   */
  async requestAndroidStoragePermissions(showPromptIfNeeded = true) {
    try {
      // 1. Native Android WebView / Capacitor / Cordova Bridge hooks
      if (typeof window !== 'undefined') {
        if (window.Android && typeof window.Android.requestStoragePermission === 'function') {
          window.Android.requestStoragePermission();
        }
        if (window.VoxelAndroid && typeof window.VoxelAndroid.requestStoragePermission === 'function') {
          window.VoxelAndroid.requestStoragePermission();
        }
        if (window.AndroidBridge && typeof window.AndroidBridge.requestPermissions === 'function') {
          window.AndroidBridge.requestPermissions([
            'android.permission.READ_MEDIA_IMAGES',
            'android.permission.READ_EXTERNAL_STORAGE',
            'android.permission.WRITE_EXTERNAL_STORAGE'
          ]);
        }
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
          try {
            await window.Capacitor.Plugins.Filesystem.requestPermissions();
          } catch (_) {}
        }
      }

      // 2. Browser Persistent Storage API
      if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
        try {
          await navigator.storage.persist();
        } catch (_) {}
      }

      // 3. Interactive Android Permission Modal if not yet confirmed by user
      if (!this.androidStoragePermissionGranted && showPromptIfNeeded && typeof document !== 'undefined') {
        const modal = document.getElementById('android-permission-modal');
        if (modal) {
          modal.classList.remove('hidden');
          return new Promise((resolve) => {
            this._pendingPermissionResolve = resolve;
          });
        }
      }

      this.grantAndroidStoragePermission();
      return true;
    } catch (_) {
      this.grantAndroidStoragePermission();
      return true;
    }
  }

  grantAndroidStoragePermission() {
    this.androidStoragePermissionGranted = true;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vr_android_storage_granted', 'true');
      }
    } catch (_) {}
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('android-permission-modal');
      if (modal) modal.classList.add('hidden');
      const statusBadge = document.getElementById('android-perm-status-badge');
      if (statusBadge) {
        statusBadge.textContent = '✅ Permisos de Archivos Android Concedidos';
        statusBadge.classList.add('granted');
      }
    }
    if (this._pendingPermissionResolve) {
      const res = this._pendingPermissionResolve;
      this._pendingPermissionResolve = null;
      res(true);
    }
  }

  /**
   * Rotate current prefab by 90 degrees
   */
  rotatePrefab() {
    this.prefabRotation = (this.prefabRotation + 1) % 4;
    const deg = this.prefabRotation * 90;
    if (this.ui) {
      this.ui.showNotification(`🔄 Rotación de estructura: ${deg}°`);
      if (typeof this.ui.updateSandboxToolbarUI === 'function') {
        this.ui.updateSandboxToolbarUI();
      }
    }
    return deg;
  }

  /**
   * Clear active special tool and return to normal 1x1 block mode
   */
  clearActiveTool() {
    this.activeToolType = 'none';
    this.activeBrushId = '1x1';
    this.activePrefabId = null;
    this.activeAnimalType = null;
    if (this.ui && typeof this.ui.updateSandboxToolbarUI === 'function') {
      this.ui.updateSandboxToolbarUI();
    }
  }

  /**
   * Select a multi-block brush
   */
  selectBrush(brushId) {
    this.activeBrushId = brushId || '1x1';
    this.activeToolType = (this.activeBrushId === '1x1') ? 'none' : 'brush';
    this.activePrefabId = null;
    this.activeAnimalType = null;
    if (this.ui && typeof this.ui.updateSandboxToolbarUI === 'function') {
      this.ui.updateSandboxToolbarUI();
    }
  }

  /**
   * Select a prefab structure to stamp in the world
   */
  selectPrefab(prefabId) {
    this.activePrefabId = prefabId;
    this.activeToolType = prefabId ? 'prefab' : 'none';
    this.activeAnimalType = null;
    if (this.ui && typeof this.ui.updateSandboxToolbarUI === 'function') {
      this.ui.updateSandboxToolbarUI();
    }
  }

  /**
   * Select an animal NPC species to spawn on tap/click
   */
  selectAnimalSpawner(species) {
    this.activeAnimalType = species;
    this.activeToolType = species ? 'animal' : 'none';
    this.activePrefabId = null;
    if (this.ui && typeof this.ui.updateSandboxToolbarUI === 'function') {
      this.ui.updateSandboxToolbarUI();
    }
  }

  /**
   * Apply a batch of [x, y, z, blockType] deltas with undo support and restricted-zone filtering
   */
  applyDeltasWithUndo(deltas, actionLabel = 'Construcción') {
    if (!Array.isArray(deltas) || deltas.length === 0 || !this.world) return 0;

    const validDeltas = [];
    const inverseDeltas = [];
    let blockedByRestricted = 0;

    for (let i = 0; i < deltas.length; i++) {
      const [bx, by, bz, blockType] = deltas[i];
      const rx = Math.round(bx);
      const ry = Math.round(by);
      const rz = Math.round(bz);
      if (ry < 1 || ry >= 124) continue;

      if (this.isRestrictedZone(rx, ry, rz)) {
        blockedByRestricted++;
        continue;
      }

      const prevBlock = this.world.getBlock(rx, ry, rz);
      if (prevBlock !== blockType) {
        inverseDeltas.push([rx, ry, rz, prevBlock]);
        validDeltas.push([rx, ry, rz, blockType]);
      }
    }

    if (blockedByRestricted > 0 && validDeltas.length === 0) {
      if (this.ui) {
        this.ui.showNotification('🛡️ Zona reservada: No puedes modificar ni pegar estructuras en la Base Militar ni en el Búnker.');
      }
      return 0;
    }

    if (validDeltas.length === 0) return 0;

    this.undoStack.push({
      label: actionLabel,
      deltas: inverseDeltas
    });
    if (this.undoStack.length > 15) {
      this.undoStack.shift();
    }

    this.world.applyBlockDeltasBatch(validDeltas);

    // If online, replicate all placed blocks to the multiplayer server via batch modify!
    if (this.multiplayer && this.multiplayer.connected && !this.multiplayer.isOfflineMode) {
      if (typeof this.multiplayer.sendBlockModifyBatch === 'function') {
        this.multiplayer.sendBlockModifyBatch(validDeltas);
      } else {
        for (const [rx, ry, rz, bt] of validDeltas) {
          this.multiplayer.send('block_modify', { x: rx, y: ry, z: rz, blockType: bt });
        }
      }
    }

    return validDeltas.length;
  }

  /**
   * Undo the last prefab stamp or multi-block brush operation
   */
  /**
   * Toggle 3D Cuboid Box Fill Mode (Select Corner A then Corner B)
   */
  toggleFillMode(blockType = 1) {
    this.fillModeActive = !this.fillModeActive;
    this.paintModeActive = false;
    this.fillPointA = null;
    if (this.ui) {
      if (this.fillModeActive) {
        this.ui.showNotification('📐 Varita de Relleno 3D ACTIVA: Toca el Bloque 1 (Esquina A)');
      } else {
        this.ui.showNotification('❌ Modo Relleno desactivado');
      }
    }
    return this.fillModeActive;
  }

  handleFillTap(x, y, z, blockType = null) {
    if (!this.fillModeActive) return false;
    const finalBlockType = (blockType !== null && blockType !== undefined && blockType > 0)
      ? blockType
      : (this.ui?.getSelectedBlock() || 1);

    if (!this.fillPointA) {
      this.fillPointA = [Math.round(x), Math.round(y), Math.round(z)];
      if (this.ui) {
        this.ui.showNotification(`📍 Esquina A fijada en (${this.fillPointA[0]}, ${this.fillPointA[1]}, ${this.fillPointA[2]}). Ahora toca la Esquina B.`);
      }
      return true;
    }

    const [x1, y1, z1] = this.fillPointA;
    const x2 = Math.round(x);
    const y2 = Math.round(y);
    const z2 = Math.round(z);

    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.max(1, Math.min(y1, y2)), maxY = Math.min(120, Math.max(y1, y2));
    const minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);

    const totalBlocks = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
    if (totalBlocks > 12000) {
      if (this.ui) this.ui.showNotification('⚠️ Volumen demasiado grande (máximo 12.000 bloques por relleno).');
      this.fillPointA = null;
      return true;
    }

    const deltas = [];
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          deltas.push([bx, by, bz, finalBlockType]);
        }
      }
    }

    const count = this.applyDeltasWithUndo(deltas, 'Relleno Cubo 3D');
    if (this.ui) {
      this.ui.showNotification(`✨ ¡Relleno 3D completado! (${count} bloques colocados)`);
    }
    this.fillPointA = null;
    return true;
  }

  /**
   * Toggle Voxel Texture / Color Painter Mode
   */
  togglePaintMode() {
    this.paintModeActive = !this.paintModeActive;
    this.fillModeActive = false;
    this.fillPointA = null;
    if (this.ui) {
      if (this.paintModeActive) {
        this.ui.showNotification('🎨 Pincel Pintor ACTIVO: Toca cualquier bloque para cambiar su material');
      } else {
        this.ui.showNotification('❌ Modo Pintor desactivado');
      }
    }
    return this.paintModeActive;
  }

  handlePaintTap(x, y, z, blockType = null) {
    if (!this.paintModeActive) return false;
    const finalBlockType = (blockType !== null && blockType !== undefined && blockType > 0)
      ? blockType
      : (this.ui?.getSelectedBlock() || 1);
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    this.applyDeltasWithUndo([[rx, ry, rz, finalBlockType]], 'Pintar Bloque');
    if (this.ui) this.ui.showNotification(`🎨 Bloque pintado en (${rx}, ${ry}, ${rz})`);
    return true;
  }

  /**
   * Generate instant glass/stone dome at target point
   */
  generateQuickDome(centerX, centerY, centerZ, radius = 6, blockType = 9) {
    const cx = Math.round(centerX);
    const cy = Math.round(centerY);
    const cz = Math.round(centerZ);
    const deltas = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = 0; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq <= radius * radius && distSq >= (radius - 1.25) * (radius - 1.25)) {
            deltas.push([cx + dx, cy + dy, cz + dz, blockType]);
          }
        }
      }
    }

    const count = this.applyDeltasWithUndo(deltas, 'Cúpula Hemisférica');
    if (this.ui) {
      this.ui.showNotification(`⭕ Cúpula generada con éxito (${count} bloques)`);
    }
    return count;
  }

  placeInstantTorch() {
    const p = this.physics ? this.physics.pos : { x: 0, y: 25, z: 0 };
    const tx = Math.round(p.x);
    const ty = Math.round(p.y);
    const tz = Math.round(p.z);
    // Block 10 (Glowstone / Luz)
    this.applyDeltasWithUndo([[tx, ty, tz, 10]], 'Antorcha Instantánea');
    if (this.ui) this.ui.showNotification(`💡 Luz colocada en (${tx}, ${ty}, ${tz})`);
    return true;
  }

  flattenGround3x3() {
    const p = this.physics ? this.physics.pos : { x: 0, y: 25, z: 0 };
    const cx = Math.round(p.x);
    const cy = Math.round(p.y) - 1; // foot level
    const cz = Math.round(p.z);
    const deltas = [];
    const floorBlock = this.ui?.getSelectedBlock() || 1; // selected or stone

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        deltas.push([cx + dx, cy, cz + dz, floorBlock]); // solid floor
        deltas.push([cx + dx, cy + 1, cz + dz, 0]); // air clearance
        deltas.push([cx + dx, cy + 2, cz + dz, 0]); // air clearance
      }
    }
    const count = this.applyDeltasWithUndo(deltas, 'Aplanador 3x3');
    if (this.ui) this.ui.showNotification(`🚜 Terreno 3x3 aplanado (${count} bloques modificados)`);
    return count;
  }

  undo() {
    return this.undoLastAction();
  }

  undoLastAction() {
    if (this.undoStack.length === 0 || !this.world) {
      if (this.ui) this.ui.showNotification('ℹ️ No hay acciones recientes para deshacer.');
      return false;
    }
    const last = this.undoStack.pop();
    this.world.applyBlockDeltasBatch(last.deltas);
    if (last.billboardId) {
      if (this.billboardManager && typeof this.billboardManager.removeBillboard === 'function') {
        this.billboardManager.removeBillboard(last.billboardId);
      }
      if (this.multiplayer && this.multiplayer.connected && !this.multiplayer.isOfflineMode) {
        if (typeof this.multiplayer.sendBillboardRemove === 'function') {
          this.multiplayer.sendBillboardRemove(last.billboardId);
        }
      }
    }
    if (this.multiplayer && this.multiplayer.connected && !this.multiplayer.isOfflineMode) {
      if (typeof this.multiplayer.sendBlockModifyBatch === 'function') {
        this.multiplayer.sendBlockModifyBatch(last.deltas);
      }
    }
    if (sound && typeof sound.playClick === 'function') sound.playClick(0.9);
    if (this.ui) {
      this.ui.showNotification(`↩️ Deshecho: ${last.label} (${last.deltas.length} bloques restaurados)`);
    }
    return true;
  }

  /**
   * Get target coordinate where the player is looking (or 6 blocks ahead if looking at sky)
   */
  getTargetPlacementCoord(placePos = null) {
    if (placePos && typeof placePos.x === 'number') {
      return { x: Math.round(placePos.x), y: Math.round(placePos.y), z: Math.round(placePos.z) };
    }
    if (this.controls && this.controls.targetedVoxel) {
      const tv = this.controls.targetedVoxel;
      return {
        x: Math.round(tv.x + (tv.nx || 0)),
        y: Math.round(tv.y + (tv.ny || 1)),
        z: Math.round(tv.z + (tv.nz || 0))
      };
    }
    const pos = this.physics?.pos || { x: 0, y: 25, z: 0 };
    const yaw = this.controls?.yaw || 0;
    const tx = Math.round(pos.x - Math.sin(yaw) * 7);
    const tz = Math.round(pos.z - Math.cos(yaw) * 7);
    const ty = this.world ? this.world.getHeightAt(tx, tz) + 1 : Math.round(pos.y);
    return { x: tx, y: ty, z: tz };
  }

  /**
   * Handle primary action when a Sandbox tool is active
   * Returns true if handled by SandboxManager, false to fall back to default 1x1 block placement
   */
  handleToolAction(placePos, selectedBlockId = BLOCKS.STONE) {
    const target = this.getTargetPlacementCoord(placePos);
    if (!target) return false;

    if (this.isRestrictedZone(target.x, target.y, target.z)) {
      if (this.ui) {
        this.ui.showNotification('🛡️ Zona reservada: La Base Militar y el Búnker están protegidos.');
      }
      return true;
    }

    // 1. Prefab Structure Stamp
    if (this.activeToolType === 'prefab' && this.activePrefabId) {
      const count = this.stampPrefab(this.activePrefabId, target.x, target.y, target.z, this.prefabRotation);
      if (count > 0) {
        if (sound && typeof sound.playPlace === 'function') sound.playPlace();
        const item = PREFAB_CATALOG.find(p => p.id === this.activePrefabId);
        if (this.ui) {
          this.ui.showNotification(`🏗️ Construido: ${item ? item.name : this.activePrefabId} (${count} bloques)`);
        }
      }
      return true;
    }

    // 2. Multi-Block Brush
    if (this.activeToolType === 'brush' && this.activeBrushId && this.activeBrushId !== '1x1') {
      const count = this.applyBrush(this.activeBrushId, target.x, target.y, target.z, selectedBlockId);
      if (count > 0 && sound && typeof sound.playPlace === 'function') {
        sound.playPlace();
      }
      return true;
    }

    // 3. Animal Spawner Tool
    if (this.activeToolType === 'animal' && this.activeAnimalType) {
      this.spawnAnimalAt(this.activeAnimalType, target.x, target.y, target.z);
      return true;
    }

    // 4. 3D Cloner Point A / Point B / Paste
    if (this.activeToolType === 'cloner_select_a') {
      const tv = this.controls?.targetedVoxel || target;
      if (this.isRestrictedZone(tv.x, tv.y, tv.z)) {
        if (this.ui) this.ui.showNotification('🛡️ No puedes copiar estructuras dentro de zonas reservadas (Base Militar / Búnker).');
        return true;
      }
      this.clonerPointA = { x: Math.round(tv.x), y: Math.round(tv.y), z: Math.round(tv.z) };
      this.activeToolType = 'cloner_select_b';
      if (this.ui) {
        this.ui.showNotification(`📐 Esquina A marcada en (${this.clonerPointA.x}, ${this.clonerPointA.y}, ${this.clonerPointA.z}). Ahora toca la Esquina B.`);
        if (typeof this.ui.updateSandboxToolbarUI === 'function') this.ui.updateSandboxToolbarUI();
      }
      return true;
    }

    if (this.activeToolType === 'cloner_select_b') {
      const tv = this.controls?.targetedVoxel || target;
      if (this.isRestrictedZone(tv.x, tv.y, tv.z)) {
        if (this.ui) this.ui.showNotification('🛡️ No puedes copiar estructuras dentro de zonas reservadas (Base Militar / Búnker).');
        return true;
      }
      this.clonerPointB = { x: Math.round(tv.x), y: Math.round(tv.y), z: Math.round(tv.z) };
      const copied = this.copyRegionToClipboard(this.clonerPointA, this.clonerPointB, 'Edificio Personalizado');
      if (copied > 0) {
        this.activeToolType = 'cloner_paste';
        if (this.ui) {
          this.ui.showNotification(`📋 ¡Estructura copiada (${copied} bloques)! Toca cualquier lugar para pegarla.`);
          if (typeof this.ui.updateSandboxToolbarUI === 'function') this.ui.updateSandboxToolbarUI();
        }
      }
      return true;
    }

    if (this.activeToolType === 'cloner_paste') {
      const pasted = this.pasteClipboardAt(target.x, target.y, target.z, this.prefabRotation);
      if (pasted > 0) {
        if (sound && typeof sound.playPlace === 'function') sound.playPlace();
        if (this.ui) {
          this.ui.showNotification(`📋 Estructura pegada (${pasted} bloques) en (${target.x}, ${target.y}, ${target.z})`);
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Spawn 1 animal or a mixed pack of 6 animals at (x, y, z)
   */
  spawnAnimalAt(type, x, y, z) {
    if (!this.animalManager) return 0;
    if (this.isRestrictedZone(x, y, z)) {
      if (this.ui) this.ui.showNotification('🛡️ Zona reservada: No puedes colocar entidades aquí.');
      return 0;
    }

    const isOnline = Boolean(this.multiplayer && this.multiplayer.connected && !this.multiplayer.isOfflineMode);

    if (type === 'pack_mixed') {
      const speciesList = ['sheep', 'cow', 'pig', 'horse', 'wolf', 'chicken'];
      let spawned = 0;
      if (isOnline) {
        if (typeof this.multiplayer.sendAnimalSpawn === 'function') {
          this.multiplayer.sendAnimalSpawn('pack_mixed', x, y, z);
        }
        spawned = 6;
      } else {
        for (let i = 0; i < speciesList.length; i++) {
          const angle = (i / speciesList.length) * Math.PI * 2;
          const ax = x + Math.cos(angle) * 2.5;
          const az = z + Math.sin(angle) * 2.5;
          if (!this.isRestrictedZone(ax, y, az)) {
            const ay = this.world ? this.world.getHeightAt(Math.floor(ax), Math.floor(az)) + 1 : y;
            this.animalManager.spawnCustomAnimal(speciesList[i], ax, ay, az);
            spawned++;
          }
        }
      }
      if (sound && typeof sound.playClick === 'function') sound.playClick(1.15);
      if (this.ui) this.ui.showNotification(`🐾 Manada de ${spawned} animales creada. Caminan libremente sin atravesar edificios.`);
      return spawned;
    }

    const ay = this.world ? Math.max(y, this.world.getHeightAt(Math.floor(x), Math.floor(z)) + 1) : y;
    if (isOnline) {
      if (typeof this.multiplayer.sendAnimalSpawn === 'function') {
        this.multiplayer.sendAnimalSpawn(type, x + 0.5, ay, z + 0.5);
      }
    } else {
      this.animalManager.spawnCustomAnimal(type, x + 0.5, ay, z + 0.5);
    }

    if (sound && typeof sound.playClick === 'function') sound.playClick(1.15);
    const info = ANIMAL_SPAWN_CATALOG.find(a => a.id === type);
    if (this.ui) {
      this.ui.showNotification(`${info ? info.icon : '🐾'} ${info ? info.name : type} añadido en (${Math.round(x)}, ${Math.round(ay)}, ${Math.round(z)})`);
    }
    return 1;
  }

  /**
   * Apply multi-block brush at (cx, cy, cz)
   */
  applyBrush(brushId, cx, cy, cz, blockType = BLOCKS.STONE) {
    const deltas = [];
    const yaw = this.controls?.yaw || 0;
    // Determine cardinal facing axis for directional walls
    const faceX = Math.abs(Math.cos(yaw)) >= Math.abs(Math.sin(yaw));

    if (brushId === 'platform_3x3') {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          deltas.push([cx + dx, cy, cz + dz, blockType]);
        }
      }
    } else if (brushId === 'platform_5x5') {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          deltas.push([cx + dx, cy, cz + dz, blockType]);
        }
      }
    } else if (brushId === 'cube_3x3x3') {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = 0; dy <= 2; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            deltas.push([cx + dx, cy + dy, cz + dz, blockType]);
          }
        }
      }
    } else if (brushId === 'wall_5x4') {
      for (let w = -2; w <= 2; w++) {
        for (let h = 0; h < 4; h++) {
          if (faceX) {
            deltas.push([cx + w, cy + h, cz, blockType]);
          } else {
            deltas.push([cx, cy + h, cz + w, blockType]);
          }
        }
      }
    } else if (brushId === 'sphere_r3') {
      const r = 3;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx * dx + dy * dy + dz * dz <= r * r + 0.5) {
              deltas.push([cx + dx, cy + dy, cz + dz, blockType]);
            }
          }
        }
      }
    } else if (brushId === 'water_pool_5x5') {
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          const isRim = (Math.abs(dx) === 3 || Math.abs(dz) === 3);
          deltas.push([cx + dx, cy - 2, cz + dz, BLOCKS.SAND]);
          deltas.push([cx + dx, cy - 1, cz + dz, isRim ? BLOCKS.SAND : BLOCKS.WATER]);
          deltas.push([cx + dx, cy, cz + dz, isRim ? BLOCKS.COBBLESTONE : BLOCKS.WATER]);
          deltas.push([cx + dx, cy + 1, cz + dz, BLOCKS.AIR]);
        }
      }
    } else if (brushId === 'eraser_5x5x5') {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -1; dy <= 3; dy++) {
          for (let dz = -2; dz <= 2; dz++) {
            deltas.push([cx + dx, cy + dy, cz + dz, BLOCKS.AIR]);
          }
        }
      }
    }

    return this.applyDeltasWithUndo(deltas, `Brocha ${brushId}`);
  }

  /**
   * Copy a 3D bounding box between pointA and pointB into the clipboard (excluding restricted zones)
   */
  copyRegionToClipboard(pointA, pointB, label = 'Estructura Copiada') {
    if (!pointA || !pointB || !this.world) return 0;

    const minX = Math.max(Math.min(pointA.x, pointB.x), Math.min(pointA.x, pointB.x));
    const maxX = Math.min(Math.max(pointA.x, pointB.x), minX + 42);
    const minY = Math.max(1, Math.min(pointA.y, pointB.y));
    const maxY = Math.min(120, Math.max(pointA.y, pointB.y), minY + 48);
    const minZ = Math.min(pointA.z, pointB.z);
    const maxZ = Math.min(Math.max(pointA.z, pointB.z), minZ + 42);

    // Verify no part of the copied box touches reserved Military Base or Bunker
    for (let x = minX; x <= maxX; x += 2) {
      for (let z = minZ; z <= maxZ; z += 2) {
        if (this.isRestrictedZone(x, minY, z)) {
          if (this.ui) {
            this.ui.showNotification('🛡️ Zona reservada: No se permite copiar estructuras de la Base Militar ni del Búnker.');
          }
          return 0;
        }
      }
    }

    const centerX = Math.floor((minX + maxX) / 2);
    const centerZ = Math.floor((minZ + maxZ) / 2);
    const baseY = minY;

    const copied = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isRestrictedZone(x, y, z)) continue;
          const blk = this.world.getBlock(x, y, z);
          if (blk !== BLOCKS.AIR) {
            copied.push([x - centerX, y - baseY, z - centerZ, blk]);
          }
        }
      }
    }

    if (copied.length === 0) {
      if (this.ui) this.ui.showNotification('⚠️ No se encontraron bloques sólidos en el área seleccionada.');
      return 0;
    }

    this.clipboardDeltas = copied;
    this.clipboardName = label;
    this.clipboardSize = [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1];
    return copied.length;
  }

  /**
   * Quick 1-Tap Copy of whichever building the player is currently looking at!
   * Captures a 21x30x21 column around the targeted block above ground level (Y >= 24)
   */
  copyTargetedBuilding() {
    const tv = this.controls?.targetedVoxel || this.getTargetPlacementCoord();
    if (!tv) return 0;

    if (this.isRestrictedZone(tv.x, tv.y, tv.z)) {
      if (this.ui) {
        this.ui.showNotification('🛡️ Zona reservada: La Base Militar y el Búnker no pueden copiarse.');
      }
      return 0;
    }

    const groundY = this.world ? this.world.getHeightAt(Math.round(tv.x), Math.round(tv.z)) : 24;
    const baseY = Math.max(20, Math.min(Math.round(tv.y), groundY + 1));
    const radius = 10;
    const height = 32;

    const pointA = { x: Math.round(tv.x) - radius, y: baseY, z: Math.round(tv.z) - radius };
    const pointB = { x: Math.round(tv.x) + radius, y: baseY + height, z: Math.round(tv.z) + radius };

    const count = this.copyRegionToClipboard(pointA, pointB, `Edificio en (${Math.round(tv.x)}, ${Math.round(tv.z)})`);
    if (count > 0) {
      this.activeToolType = 'cloner_paste';
      if (this.ui) {
        this.ui.showNotification(`📋 ¡Edificio capturado (${count} bloques)! Ahora apunta donde quieras y pulsa PEGAR.`);
        if (typeof this.ui.updateSandboxToolbarUI === 'function') this.ui.updateSandboxToolbarUI();
      }
    }
    return count;
  }

  /**
   * Paste copied structure from clipboard at (originX, originY, originZ) with rotation
   */
  pasteClipboardAt(originX, originY, originZ, rotation = 0) {
    if (!Array.isArray(this.clipboardDeltas) || this.clipboardDeltas.length === 0) {
      if (this.ui) this.ui.showNotification('⚠️ El portapapeles 3D está vacío. Copia un edificio primero.');
      return 0;
    }

    const deltas = [];
    const rot = ((rotation % 4) + 4) % 4;
    for (let i = 0; i < this.clipboardDeltas.length; i++) {
      const [dx, dy, dz, blk] = this.clipboardDeltas[i];
      let rx = dx;
      let rz = dz;
      if (rot === 1) { rx = -dz; rz = dx; }
      else if (rot === 2) { rx = -dx; rz = -dz; }
      else if (rot === 3) { rx = dz; rz = -dx; }
      deltas.push([originX + rx, originY + dy, originZ + rz, blk]);
    }

    return this.applyDeltasWithUndo(deltas, `Pegar ${this.clipboardName || 'Estructura'}`);
  }

  /**
   * Stamp a complete prefab structure from PREFAB_CATALOG at (ox, oy, oz) with 90-degree rotation
   */
  stampPrefab(prefabId, ox, oy, oz, rotation = 0) {
    if (this.isRestrictedZone(ox, oy, oz)) {
      if (this.ui) this.ui.showNotification('🛡️ Zona reservada: No puedes construir en la Base Militar ni en el Búnker.');
      return 0;
    }

    const localDeltas = this.generatePrefabDeltas(prefabId);
    if (!localDeltas || localDeltas.length === 0) return 0;

    const rot = ((rotation % 4) + 4) % 4;
    const worldDeltas = [];
    for (let i = 0; i < localDeltas.length; i++) {
      const [dx, dy, dz, blk] = localDeltas[i];
      let rx = dx;
      let rz = dz;
      if (rot === 1) { rx = -dz; rz = dx; }
      else if (rot === 2) { rx = -dx; rz = -dz; }
      else if (rot === 3) { rx = dz; rz = -dx; }
      worldDeltas.push([ox + rx, oy + dy, oz + rz, blk]);
    }

    const count = this.applyDeltasWithUndo(worldDeltas, `Prefab ${prefabId}`);

    if (prefabId === 'giant_billboard' && this.billboardManager) {
      const photos = (this.ui && typeof this.ui.getUploadedPhotos === 'function')
        ? this.ui.getUploadedPhotos()
        : (this.billboardManager.localPhotos || []);
      const billboardData = {
        id: `bb_${Math.round(ox)}_${Math.round(oy)}_${Math.round(oz)}`,
        x: ox,
        y: oy,
        z: oz,
        rotation: rot,
        photos: Array.isArray(photos) ? photos : []
      };
      this.billboardManager.createBillboard(billboardData, false);
      if (this.undoStack.length > 0) {
        this.undoStack[this.undoStack.length - 1].billboardId = billboardData.id;
      }
      if (this.multiplayer && typeof this.multiplayer.sendBillboardCreate === 'function') {
        this.multiplayer.sendBillboardCreate(billboardData);
      }
    }

    return count;
  }

  /**
   * Generates relative [dx, dy, dz, blockType] voxel array for any prefab in PREFAB_CATALOG
   */
  generatePrefabDeltas(prefabId) {
    const out = [];
    const set = (dx, dy, dz, blk) => {
      out.push([dx, dy, dz, blk]);
    };

    switch (prefabId) {
      case 'giant_billboard': {
        // Colossal 15x12x3 outdoor advertising billboard structure:
        // Support columns, cross-bracing truss, metallic frame, dark backing, and screen mount
        const IRON = BLOCKS.IRON_ORE;
        const STONE = BLOCKS.COBBLESTONE;
        const OBSIDIAN = BLOCKS.STONE;
        const GLASS = BLOCKS.GLASS || BLOCKS.ICE || BLOCKS.IRON_ORE;
        const GOLD = BLOCKS.GOLD_ORE;

        // Two heavy steel support pillars at x = -5 and x = +5 (height y = 0..5, z = 0..1)
        for (const sx of [-5, 5]) {
          for (let y = 0; y <= 5; y++) {
            set(sx, y, 0, IRON);
            set(sx + 1, y, 0, IRON);
            set(sx, y, 1, STONE);
            set(sx + 1, y, 1, STONE);
          }
          // Concrete foundation base
          for (let dx = -1; dx <= 2; dx++) {
            for (let dz = -1; dz <= 2; dz++) {
              set(sx + dx, 0, dz, STONE);
            }
          }
        }

        // Horizontal truss / catwalk connecting the pillars (y = 5, x = -6..6, z = 0..1)
        for (let x = -6; x <= 6; x++) {
          set(x, 5, 0, IRON);
          set(x, 5, 1, IRON);
          if (Math.abs(x) === 6 || x === 0) {
            set(x, 5, -1, GOLD); // Warning beacon / spotlight mount
          }
        }

        // Billboard Screen Frame (y = 6..11, x = -7..7, z = 0..1)
        // Backing (z = 1) is solid dark stone/obsidian
        // Frame border (top, bottom, left, right) is iron / gold trim
        // Screen surface (z = 0) is glass / screen backing blocks
        for (let y = 6; y <= 11; y++) {
          for (let x = -7; x <= 7; x++) {
            // Structural backing wall
            set(x, y, 1, OBSIDIAN);

            const isBorder = (x === -7 || x === 7 || y === 6 || y === 11);
            if (isBorder) {
              set(x, y, 0, (Math.abs(x) === 7 && (y === 6 || y === 11)) ? GOLD : IRON);
            } else {
              set(x, y, 0, GLASS);
            }
          }
        }

        // Crown spotlights on top of billboard (y = 12, x in [-5, 0, 5], z = 0)
        for (const sx of [-5, 0, 5]) {
          set(sx, 12, 0, GOLD);
        }
        break;
      }

      case 'eiffel_tower': {
        // 32-block tall replica of the Paris Eiffel Tower with 4 arched legs, 3 observation decks, lattice spire & gold beacon
        const IRON = BLOCKS.IRON_ORE;
        const GOLD = BLOCKS.GOLD_ORE;
        const STONE = BLOCKS.COBBLESTONE;
        const PLANK = BLOCKS.WOOD_PLANK;

        // Base corner foundations
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            for (let x = 4; x <= 6; x++) {
              for (let z = 4; z <= 6; z++) {
                set(sx * x, 0, sz * z, STONE);
              }
            }
          }
        }
        // Lower inclined legs (dy = 1..9) & arches
        for (let dy = 1; dy <= 9; dy++) {
          const offset = Math.round(5 - (dy - 1) * 0.25); // 5 -> 3
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              set(sx * offset, dy, sz * offset, IRON);
              set(sx * (offset + 1), dy, sz * offset, IRON);
              set(sx * offset, dy, sz * (offset + 1), IRON);
            }
          }
          if (dy === 4 || dy === 5) {
            for (let a = -offset; a <= offset; a++) {
              set(a, dy, offset, IRON);
              set(a, dy, -offset, IRON);
              set(offset, dy, a, IRON);
              set(-offset, dy, a, IRON);
            }
          }
        }
        // First Observation Deck (dy = 10)
        for (let x = -4; x <= 4; x++) {
          for (let z = -4; z <= 4; z++) {
            const edge = Math.abs(x) === 4 || Math.abs(z) === 4;
            set(x, 10, z, edge ? GOLD : PLANK);
          }
        }
        // Middle lattice section (dy = 11..18)
        for (let dy = 11; dy <= 18; dy++) {
          const off = dy <= 14 ? 3 : 2;
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              set(sx * off, dy, sz * off, IRON);
              if (dy % 2 === 0) {
                set(sx * off, dy, 0, IRON);
                set(0, dy, sz * off, IRON);
              }
            }
          }
        }
        // Second Observation Deck (dy = 19)
        for (let x = -3; x <= 3; x++) {
          for (let z = -3; z <= 3; z++) {
            const edge = Math.abs(x) === 3 || Math.abs(z) === 3;
            set(x, 19, z, edge ? GOLD : PLANK);
          }
        }
        // Upper spire shaft (dy = 20..27)
        for (let dy = 20; dy <= 27; dy++) {
          for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
              if (x === 0 || z === 0 || dy % 2 === 0) {
                set(x, dy, z, IRON);
              }
            }
          }
        }
        // Summit cupola & golden beacon (dy = 28..32)
        for (let x = -1; x <= 1; x++) {
          for (let z = -1; z <= 1; z++) {
            set(x, 28, z, GOLD);
          }
        }
        for (let dy = 29; dy <= 32; dy++) {
          set(0, dy, 0, dy >= 31 ? GOLD : IRON);
        }
        break;
      }

      case 'japan_pagoda': {
        // 4-tier Imperial Pagoda with crimson brick roofs, upturned gold tips, and dark wood pillars
        for (let x = -6; x <= 6; x++) {
          for (let z = -6; z <= 6; z++) {
            set(x, 0, z, BLOCKS.COBBLESTONE);
          }
        }
        const tiers = [
          { yBase: 1, height: 4, w: 4, roofW: 6 },
          { yBase: 5, height: 4, w: 3, roofW: 5 },
          { yBase: 9, height: 4, w: 2, roofW: 4 },
          { yBase: 13, height: 3, w: 1, roofW: 3 }
        ];
        for (const t of tiers) {
          for (let dy = 0; dy < t.height; dy++) {
            const y = t.yBase + dy;
            for (let x = -t.w; x <= t.w; x++) {
              for (let z = -t.w; z <= t.w; z++) {
                const isCorner = Math.abs(x) === t.w && Math.abs(z) === t.w;
                const isWall = Math.abs(x) === t.w || Math.abs(z) === t.w;
                const isDoor = (t.yBase === 1 && dy <= 1 && ((x === 0 && Math.abs(z) === t.w) || (z === 0 && Math.abs(x) === t.w)));
                if (isDoor) {
                  set(x, y, z, BLOCKS.AIR);
                } else if (isCorner) {
                  set(x, y, z, BLOCKS.OAK_LOG);
                } else if (isWall) {
                  set(x, y, z, BLOCKS.WOOD_PLANK);
                }
              }
            }
          }
          const ry = t.yBase + t.height;
          for (let x = -t.roofW; x <= t.roofW; x++) {
            for (let z = -t.roofW; z <= t.roofW; z++) {
              const isTip = Math.abs(x) === t.roofW && Math.abs(z) === t.roofW;
              set(x, ry, z, BLOCKS.BRICK);
              if (isTip) set(x, ry + 1, z, BLOCKS.GOLD_ORE);
            }
          }
        }
        for (let y = 17; y <= 22; y++) {
          set(0, y, 0, BLOCKS.GOLD_ORE);
        }
        break;
      }

      case 'torii_gate': {
        for (let y = 0; y <= 8; y++) {
          set(-4, y, 0, y <= 1 ? BLOCKS.STONE : BLOCKS.BRICK);
          set(4, y, 0, y <= 1 ? BLOCKS.STONE : BLOCKS.BRICK);
        }
        for (let x = -5; x <= 5; x++) {
          set(x, 6, 0, BLOCKS.BRICK);
        }
        for (let x = -6; x <= 6; x++) {
          set(x, 8, 0, BLOCKS.BRICK);
          set(x, 9, 0, Math.abs(x) >= 5 ? BLOCKS.GOLD_ORE : BLOCKS.OAK_LOG);
        }
        set(0, 7, 0, BLOCKS.GOLD_ORE);
        break;
      }

      case 'shanghai_tower': {
        // Glass & steel skyscraper with gold crown
        for (let y = 0; y <= 24; y++) {
          const r = y < 10 ? 4 : (y < 18 ? 3 : 2);
          for (let x = -r; x <= r; x++) {
            for (let z = -r; z <= r; z++) {
              const isEdge = Math.abs(x) === r || Math.abs(z) === r;
              const isCorner = Math.abs(x) === r && Math.abs(z) === r;
              if (y === 0 || y % 6 === 0) {
                set(x, y, z, BLOCKS.STONE);
              } else if (isCorner) {
                set(x, y, z, BLOCKS.IRON_ORE);
              } else if (isEdge) {
                if (y <= 2 && x === 0 && z === r) {
                  set(x, y, z, BLOCKS.AIR);
                } else {
                  set(x, y, z, (y % 3 === 0) ? BLOCKS.GOLD_ORE : BLOCKS.GLASS);
                }
              }
            }
          }
        }
        for (let y = 25; y <= 28; y++) {
          set(0, y, 0, BLOCKS.GOLD_ORE);
        }
        break;
      }

      case 'ny_skyscraper': {
        // Art Deco Empire State style tower
        for (let y = 0; y <= 22; y++) {
          const r = y < 12 ? 4 : (y < 18 ? 3 : 2);
          for (let x = -r; x <= r; x++) {
            for (let z = -r; z <= r; z++) {
              const isEdge = Math.abs(x) === r || Math.abs(z) === r;
              const isCorner = Math.abs(x) === r && Math.abs(z) === r;
              if (y === 0 || y % 5 === 0) {
                set(x, y, z, BLOCKS.COBBLESTONE);
              } else if (isCorner) {
                set(x, y, z, BLOCKS.STONE);
              } else if (isEdge) {
                if (y <= 2 && x === 0 && z === r) {
                  set(x, y, z, BLOCKS.AIR);
                } else {
                  set(x, y, z, (x + z + y) % 2 === 0 ? BLOCKS.GLASS : BLOCKS.STONE);
                }
              }
            }
          }
        }
        for (let y = 23; y <= 27; y++) {
          set(0, y, 0, y === 27 ? BLOCKS.GOLD_ORE : BLOCKS.IRON_ORE);
        }
        break;
      }

      case 'norway_cabin': {
        // Cozy wooden cabin with pitched roof, glass windows, and doorway
        for (let x = -4; x <= 4; x++) {
          for (let z = -4; z <= 4; z++) {
            set(x, 0, z, BLOCKS.COBBLESTONE);
          }
        }
        for (let y = 1; y <= 4; y++) {
          for (let x = -3; x <= 3; x++) {
            for (let z = -3; z <= 3; z++) {
              const isCorner = Math.abs(x) === 3 && Math.abs(z) === 3;
              const isWall = Math.abs(x) === 3 || Math.abs(z) === 3;
              if (x === 0 && z === 3 && y <= 2) {
                set(x, y, z, BLOCKS.AIR); // Front door
              } else if (isCorner) {
                set(x, y, z, BLOCKS.OAK_LOG);
              } else if (isWall) {
                if (y === 2 && (Math.abs(x) === 1 || Math.abs(z) === 1)) {
                  set(x, y, z, BLOCKS.GLASS);
                } else {
                  set(x, y, z, BLOCKS.WOOD_PLANK);
                }
              } else {
                set(x, y, z, BLOCKS.AIR);
              }
            }
          }
        }
        // Pitched roof
        for (let step = 0; step <= 3; step++) {
          const ry = 5 + step;
          const rx = 4 - step;
          for (let x = -rx; x <= rx; x++) {
            for (let z = -4; z <= 4; z++) {
              set(x, ry, z, BLOCKS.BRICK);
            }
          }
        }
        break;
      }

      case 'beach_villa': {
        // Luxury resort villa with sunlit glass walls and a crystal water swimming pool in front
        for (let x = -6; x <= 6; x++) {
          for (let z = -6; z <= 8; z++) {
            if (z >= 2 && z <= 7 && Math.abs(x) <= 4) {
              // Swimming Pool filled with BLOCKS.WATER
              const isPoolBorder = Math.abs(x) === 4 || z === 2 || z === 7;
              set(x, -1, z, BLOCKS.SAND);
              set(x, 0, z, isPoolBorder ? BLOCKS.SNOW : BLOCKS.WATER);
            } else {
              set(x, 0, z, BLOCKS.WOOD_PLANK);
            }
          }
        }
        // Villa body (z in -5..1)
        for (let y = 1; y <= 4; y++) {
          for (let x = -5; x <= 5; x++) {
            for (let z = -5; z <= 1; z++) {
              const isWall = Math.abs(x) === 5 || z === -5 || z === 1;
              const isCorner = Math.abs(x) === 5 && (z === -5 || z === 1);
              if (z === 1 && Math.abs(x) <= 1 && y <= 2) {
                set(x, y, z, BLOCKS.AIR); // Wide patio entrance
              } else if (isCorner) {
                set(x, y, z, BLOCKS.SNOW);
              } else if (isWall) {
                set(x, y, z, (y === 2 || y === 3) ? BLOCKS.GLASS : BLOCKS.SNOW);
              } else {
                set(x, y, z, BLOCKS.AIR);
              }
            }
          }
        }
        // Flat modern roof terrace
        for (let x = -6; x <= 6; x++) {
          for (let z = -6; z <= 2; z++) {
            set(x, 5, z, BLOCKS.SNOW);
            if (Math.abs(x) === 6 || z === -6 || z === 2) {
              set(x, 6, z, BLOCKS.GLASS);
            }
          }
        }
        break;
      }

      case 'plaza_fountain': {
        for (let x = -4; x <= 4; x++) {
          for (let z = -4; z <= 4; z++) {
            const d = Math.hypot(x, z);
            if (d <= 4.3) {
              set(x, 0, z, BLOCKS.STONE);
              if (d >= 3.2) {
                set(x, 1, z, BLOCKS.COBBLESTONE);
              } else {
                set(x, 1, z, BLOCKS.WATER);
              }
            }
          }
        }
        for (let y = 1; y <= 5; y++) {
          set(0, y, 0, y === 5 ? BLOCKS.GOLD_ORE : BLOCKS.STONE);
        }
        set(0, 6, 0, BLOCKS.WATER);
        set(1, 5, 0, BLOCKS.WATER);
        set(-1, 5, 0, BLOCKS.WATER);
        set(0, 5, 1, BLOCKS.WATER);
        set(0, 5, -1, BLOCKS.WATER);
        break;
      }

      case 'stone_bridge': {
        // 17-block long bridge with stone piers, asphalt deck, parapets, and suspension towers
        const ASPHALT = BLOCKS.ASPHALT || BLOCKS.COBBLESTONE;
        for (let x = -8; x <= 8; x++) {
          const archY = Math.abs(x) <= 4 ? 1 : 0;
          for (let z = -3; z <= 3; z++) {
            const isEdge = Math.abs(z) === 3;
            const isCenter = z === 0 && (Math.abs(x) % 3 === 0);
            set(x, archY, z, isEdge ? BLOCKS.COBBLESTONE : (isCenter ? BLOCKS.SNOW : ASPHALT));
            if (isEdge) {
              set(x, archY + 1, z, BLOCKS.COBBLESTONE);
              if (Math.abs(x) === 4) {
                for (let py = -3; py <= archY + 4; py++) {
                  set(x, py, z, py === archY + 4 ? BLOCKS.GOLD_ORE : BLOCKS.IRON_ORE);
                }
              }
            }
          }
        }
        break;
      }

      case 'highway_segment': {
        const ASPHALT = BLOCKS.ASPHALT || BLOCKS.COBBLESTONE;
        for (let x = -6; x <= 6; x++) {
          for (let z = -3; z <= 3; z++) {
            const isCurb = Math.abs(z) === 3;
            const isStripe = z === 0 && (Math.abs(x) % 3 <= 1);
            set(x, 0, z, isCurb ? BLOCKS.STONE : (isStripe ? BLOCKS.SNOW : ASPHALT));
          }
        }
        break;
      }

      case 'castle_wall': {
        for (let x = -6; x <= 6; x++) {
          for (let z = -1; z <= 1; z++) {
            for (let y = 0; y <= 4; y++) {
              set(x, y, z, BLOCKS.COBBLESTONE);
            }
            if (Math.abs(z) === 1) {
              set(x, 5, z, BLOCKS.STONE);
              if (Math.abs(x) % 2 === 0) {
                set(x, 6, z, BLOCKS.STONE);
              }
            } else {
              set(x, 5, z, BLOCKS.WOOD_PLANK);
            }
          }
        }
        break;
      }

      case 'water_lake': {
        for (let x = -5; x <= 5; x++) {
          for (let z = -5; z <= 5; z++) {
            const d = Math.hypot(x, z);
            if (d <= 5.2) {
              set(x, -2, z, BLOCKS.SAND);
              if (d <= 3.8) {
                set(x, -1, z, BLOCKS.WATER);
                set(x, 0, z, BLOCKS.WATER);
              } else {
                set(x, -1, z, BLOCKS.SAND);
                set(x, 0, z, BLOCKS.SAND);
              }
            }
          }
        }
        break;
      }

      case 'water_waterfall': {
        // Stone cliff at z = -3..-1 with cascading water into a pool at z = 0..3
        for (let x = -3; x <= 3; x++) {
          for (let z = -3; z <= 3; z++) {
            if (z <= -1) {
              const h = z === -3 ? 8 : (z === -2 ? 6 : 4);
              for (let y = 0; y <= h; y++) {
                set(x, y, z, Math.abs(x) <= 1 && y >= h - 1 ? BLOCKS.WATER : BLOCKS.STONE);
              }
            } else {
              const d = Math.hypot(x, z - 1);
              if (d <= 3.2) {
                set(x, -1, z, BLOCKS.STONE);
                set(x, 0, z, d <= 2.3 ? BLOCKS.WATER : BLOCKS.COBBLESTONE);
              }
            }
          }
        }
        for (let y = 1; y <= 7; y++) {
          set(0, y, 0, BLOCKS.WATER);
          set(-1, y, 0, BLOCKS.WATER);
          set(1, y, 0, BLOCKS.WATER);
        }
        break;
      }

      case 'oak_tree': {
        for (let y = 0; y <= 4; y++) {
          set(0, y, 0, BLOCKS.OAK_LOG);
        }
        for (let lx = -2; lx <= 2; lx++) {
          for (let lz = -2; lz <= 2; lz++) {
            for (let ly = 3; ly <= 5; ly++) {
              if (Math.abs(lx) + Math.abs(lz) + (ly - 3) <= 4 && !(lx === 0 && lz === 0 && ly <= 4)) {
                set(lx, ly, lz, BLOCKS.OAK_LEAVES);
              }
            }
          }
        }
        break;
      }

      case 'sakura_tree': {
        for (let y = 0; y <= 5; y++) {
          set(0, y, 0, BLOCKS.OAK_LOG);
        }
        for (let lx = -3; lx <= 3; lx++) {
          for (let lz = -3; lz <= 3; lz++) {
            for (let ly = 4; ly <= 7; ly++) {
              const d = Math.hypot(lx, lz);
              if (d <= 3.3 - (ly - 4) * 0.5 && !(lx === 0 && lz === 0 && ly <= 5)) {
                set(lx, ly, lz, (lx + lz + ly) % 4 === 0 ? BLOCKS.SNOW : BLOCKS.OAK_LEAVES);
              }
            }
          }
        }
        break;
      }

      case 'palm_tree': {
        for (let y = 0; y <= 6; y++) {
          const shift = y >= 4 ? 1 : 0;
          set(shift, y, 0, BLOCKS.OAK_LOG);
        }
        const topX = 1;
        const topY = 7;
        set(topX, topY, 0, BLOCKS.OAK_LEAVES);
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
        for (const [dx, dz] of dirs) {
          set(topX + dx, topY, dz, BLOCKS.OAK_LEAVES);
          set(topX + dx * 2, topY - 1, dz * 2, BLOCKS.OAK_LEAVES);
          set(topX + dx * 3, topY - 2, dz * 3, BLOCKS.OAK_LEAVES);
        }
        break;
      }

      case 'forest_grove': {
        const offsets = [[0, 0], [-5, -4], [5, -4], [-4, 5], [5, 4]];
        for (const [ox, oz] of offsets) {
          for (let y = 0; y <= 4; y++) {
            set(ox, y, oz, BLOCKS.OAK_LOG);
          }
          for (let lx = -2; lx <= 2; lx++) {
            for (let lz = -2; lz <= 2; lz++) {
              for (let ly = 3; ly <= 5; ly++) {
                if (Math.abs(lx) + Math.abs(lz) + (ly - 3) <= 4 && !(lx === 0 && lz === 0 && ly <= 4)) {
                  set(ox + lx, ly, oz + lz, BLOCKS.OAK_LEAVES);
                }
              }
            }
          }
        }
        break;
      }
    }

    return out;
  }

  /**
   * Serialize the entire modified world, player name, player coordinates, and custom NPC animals
   */
  serializeWorldData() {
    const playerName = (this.multiplayer?.myName || document.getElementById('player-name-input')?.value || 'Explorador').trim();
    const pos = this.physics?.pos || { x: 3.5, y: 25, z: 6.5 };
    const yaw = this.controls?.yaw || 0;
    const pitch = this.controls?.pitch || 0;

    const deltas = [];
    if (this.world && this.world.blockDeltas) {
      for (const [key, blockType] of this.world.blockDeltas.entries()) {
        const parts = key.split(',');
        if (parts.length === 3) {
          const bx = parseInt(parts[0], 10);
          const by = parseInt(parts[1], 10);
          const bz = parseInt(parts[2], 10);
          if (!this.isRestrictedZone(bx, by, bz)) {
            deltas.push([bx, by, bz, blockType]);
          }
        }
      }
    }

    const customAnimals = (this.animalManager && typeof this.animalManager.exportCustomAnimals === 'function')
      ? this.animalManager.exportCustomAnimals()
      : [];

    return {
      format: 'VOXEL_REALMS_WORLD',
      version: 2,
      savedAt: new Date().toISOString(),
      playerName,
      playerPos: [
        Math.round(pos.x * 100) / 100,
        Math.round(pos.y * 100) / 100,
        Math.round(pos.z * 100) / 100
      ],
      playerRot: [
        Math.round(yaw * 100) / 100,
        Math.round(pitch * 100) / 100
      ],
      seed: this.world ? this.world.seed : 48151623,
      deltasCount: deltas.length,
      deltas,
      customAnimals
    };
  }

  /**
   * Export & Download the player's customized map as a .vrealm.json file (requests Android permission first)
   */
  async exportWorldFile() {
    await this.requestAndroidStoragePermissions(false);

    const payload = this.serializeWorldData();
    const jsonString = JSON.stringify(payload, null, 2);

    // Save automatic backup in localStorage as well
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vr_offline_world_autosave', JSON.stringify(payload));
      }
    } catch (_) {}

    const safeName = (payload.playerName || 'jugador').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateTag = new Date().toISOString().slice(0, 10);
    const filename = `mapa_${safeName}_${dateTag}.vrealm.json`;

    // Android Native Bridge save if present
    if (typeof window !== 'undefined' && window.Android && typeof window.Android.saveWorldFile === 'function') {
      try {
        window.Android.saveWorldFile(filename, jsonString);
      } catch (_) {}
    }

    // Standard Browser & Mobile Download
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 600);
    }

    if (this.ui) {
      this.ui.showNotification(`💾 Mapa descargado: "${filename}" (${payload.deltas.length} bloques modificados y ${payload.customAnimals.length} animales guardados).`);
    }
    return payload;
  }

  /**
   * Load and restore a world state object (from uploaded file or autosave)
   * Automatically restores playerName, switches to Offline Mode, applies all block deltas, spawns animals, and teleports player!
   */
  loadWorldDataObject(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Formato de archivo inválido.');
    }
    if (!Array.isArray(data.deltas) && data.format !== 'VOXEL_REALMS_WORLD') {
      throw new Error('El archivo no es un mapa válido de Voxel Realms (.vrealm.json).');
    }

    // 1. Restore saved playerName
    const restoredName = (data.playerName && typeof data.playerName === 'string' && data.playerName.trim())
      ? data.playerName.trim()
      : (this.multiplayer?.myName || 'Explorador');

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('vr_username', restoredName);
      }
      if (typeof document !== 'undefined') {
        const nameInput = document.getElementById('player-name-input');
        if (nameInput) nameInput.value = restoredName;
      }
    } catch (_) {}

    // 2. Activate Offline Mode (no server connection needed!)
    if (this.multiplayer && typeof this.multiplayer.startOfflineMode === 'function') {
      this.multiplayer.startOfflineMode(restoredName);
    }
    if (this.animalManager && typeof this.animalManager.enableOfflineMode === 'function') {
      this.animalManager.enableOfflineMode();
    }

    // 3. Reset terrain to clean base and apply all saved block deltas (filtering out restricted zones for non-admins)
    if (this.world) {
      if (typeof data.seed === 'number' && data.seed > 0) {
        this.world.seed = data.seed;
      }
      if (typeof this.world.resetToInitialTerrain === 'function') {
        this.world.resetToInitialTerrain();
      }
      const rawDeltas = Array.isArray(data.deltas) ? data.deltas : [];
      const safeDeltas = [];
      for (let i = 0; i < rawDeltas.length; i++) {
        const entry = rawDeltas[i];
        if (!Array.isArray(entry) || entry.length < 4) continue;
        const [bx, by, bz, bt] = entry;
        if (!this.isRestrictedZone(bx, by, bz)) {
          safeDeltas.push([Math.round(bx), Math.round(by), Math.round(bz), bt]);
        }
      }
      if (safeDeltas.length > 0 && typeof this.world.applyBlockDeltasBatch === 'function') {
        this.world.applyBlockDeltasBatch(safeDeltas);
      }
    }

    // 4. Restore custom-spawned animals
    let animalsCount = 0;
    if (this.animalManager && typeof this.animalManager.importCustomAnimals === 'function') {
      animalsCount = this.animalManager.importCustomAnimals(data.customAnimals || []);
    }

    // 5. Restore player position & camera rotation (ensuring not inside restricted zones)
    if (Array.isArray(data.playerPos) && data.playerPos.length >= 3) {
      let [px, py, pz] = data.playerPos;
      if (this.isRestrictedZone(px, py, pz)) {
        px = 3.5; py = 25; pz = 6.5;
      }
      if (this.world && typeof this.world.updateStreaming === 'function') {
        this.world.updateStreaming(px, pz);
      }
      if (this.physics && typeof this.physics.teleport === 'function') {
        this.physics.teleport(px, py, pz);
      }
    }
    if (Array.isArray(data.playerRot) && data.playerRot.length >= 2 && this.controls) {
      this.controls.yaw = data.playerRot[0] || 0;
      this.controls.pitch = data.playerRot[1] || 0;
    }

    if (this.ui) {
      this.ui.showNotification(
        `📂 Mapa cargado para "${restoredName}" (${(data.deltas || []).length} bloques y ${animalsCount} animales restaurados en Modo Offline).`
      );
    }

    return {
      playerName: restoredName,
      deltasLoaded: (data.deltas || []).length,
      animalsLoaded: animalsCount
    };
  }

  /**
   * Read a File object from <input type="file"> and restore the world
   */
  async importWorldFromFile(file) {
    if (!file) return null;
    await this.requestAndroidStoragePermissions(false);

    const text = await new Promise((resolve, reject) => {
      if (typeof file.text === 'function') {
        file.text().then(resolve).catch(reject);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      reader.readAsText(file);
    });

    const parsed = JSON.parse(text);
    return this.loadWorldDataObject(parsed);
  }
}
