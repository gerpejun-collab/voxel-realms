// public/src/main.js
// Voxel Realms - Main Application Entrypoint & Game Loop
import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { MaterialManager } from './materials.js';
import { ParticleManager } from './particles.js';
import { World } from './world.js';
import { PlayerPhysics } from './physics.js';
import { Controls } from './controls.js';
import { MultiplayerClient } from './multiplayer.js';
import { UIManager } from './ui.js';
import { AnimalManager } from './animals.js';
import { Avatar } from './avatar.js';

class VoxelRealmsApp {
  constructor() {
    this.container = document.getElementById('canvas-container');

    // 1. Initialize Graphics & Scene
    this.sceneManager = new SceneManager(this.container);
    this.materialManager = new MaterialManager();
    this.particleManager = new ParticleManager(this.sceneManager.scene);

    // 2. Initialize World & Procedural Terrain
    this.world = new World(this.sceneManager.scene, this.materialManager, 48151623);

    // 3. Initialize Character Physics & Swept-AABB
    this.physics = new PlayerPhysics(this.world);

    // 4. Initialize Controls, Camera & Local Avatar
    this.controls = new Controls(
      this.sceneManager.camera,
      this.sceneManager.renderer.domElement,
      this.physics,
      this.world
    );
    this.localAvatar = new Avatar('local', 'Tú', this.sceneManager.scene);
    this.controls.setLocalAvatar(this.localAvatar);

    // 5. Initialize Multiplayer Client
    this.multiplayer = new MultiplayerClient(
      this.world,
      this.sceneManager.scene,
      this.particleManager
    );

    // 6. Initialize UI Overlay & HUD
    this.ui = new UIManager(
      this.materialManager,
      this.controls,
      this.sceneManager,
      this.world,
      this.multiplayer
    );

    // 7. Initialize Ambient Voxel Animals (Minecraft Sheep & Pigs)
    this.animalManager = new AnimalManager(this.world, this.sceneManager.scene);

    // Setup Block Interaction Events
    this.setupInteractions();

    // Initial safe player spawn at open plaza viewpoint facing the Golden Altar & Statues
    this.world.updateStreaming(0, 0);
    this.physics.respawn(3, 6);
    this.controls.yaw = 0.45;
    this.controls.pitch = 0.06;

    // Game loop timing
    this.clock = new THREE.Clock();
    this.fpsCounter = 0;
    this.fpsTimer = 0;
    this.currentFps = 60;

    // Start loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupInteractions() {
    // Left Click: Destroy Block
    this.controls.onBreakBlock = (target) => {
      this.multiplayer.sendBlockModify(target.x, target.y, target.z, 0);
    };

    // Right Click: Place Selected Block
    this.controls.onPlaceBlock = (placePos) => {
      const selectedBlockId = this.ui.getSelectedBlock();
      if (!selectedBlockId) return;

      // Validate that placement doesn't collide with player feet or body
      const px = this.physics.pos.x;
      const py = this.physics.pos.y;
      const pz = this.physics.pos.z;

      const pMinX = px - 0.3, pMaxX = px + 0.3;
      const pMinY = py, pMaxY = py + 1.8;
      const pMinZ = pz - 0.3, pMaxZ = pz + 0.3;

      const bMinX = placePos.x, bMaxX = placePos.x + 1;
      const bMinY = placePos.y, bMaxY = placePos.y + 1;
      const bMinZ = placePos.z, bMaxZ = placePos.z + 1;

      const intersects = (pMinX < bMaxX && pMaxX > bMinX) &&
                         (pMinY < bMaxY && pMaxY > bMinY) &&
                         (pMinZ < bMaxZ && pMaxZ > bMinZ);

      if (intersects) {
        return; // Block placement would trap player
      }

      this.multiplayer.sendBlockModify(placePos.x, placePos.y, placePos.z, selectedBlockId);
    };
  }

  animate() {
    requestAnimationFrame(this.animate);

    // Calculate delta time (capped to avoid physics anomalies on lag)
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.08);

    // FPS calculation
    this.fpsCounter++;
    this.fpsTimer += rawDt;
    if (this.fpsTimer >= 1.0) {
      this.currentFps = Math.round(this.fpsCounter / this.fpsTimer);
      this.fpsCounter = 0;
      this.fpsTimer = 0;
    }

    // 1. Controls & Physics Update
    this.controls.update(dt);

    // 2. Dynamic Chunk Streaming & Remeshing
    this.world.updateStreaming(this.physics.pos.x, this.physics.pos.z);
    this.world.updateRemesh();

    // 3. PBR Animated Materials
    this.materialManager.update(dt);

    // 4. Wind & Destruction Particles
    this.particleManager.update(dt, this.physics.pos);

    // 5. Multiplayer Movement & Remote Avatars
    this.multiplayer.sendMove(
       this.physics.pos,
       { yaw: this.controls.yaw, pitch: this.controls.pitch },
       this.physics.action
     );
    this.multiplayer.update(dt);

    // 6. Ambient Voxel Animals
    this.animalManager.update(dt);

    // 7. Day/Night Atmosphere & Sun Orbit (Perpetual Bright Day)
    this.sceneManager.updateDayNightCycle(this.multiplayer.timeOfDay, this.physics.pos);

    // 7. HUD & Target Highlight
    this.ui.updateHUD(this.currentFps, this.physics.pos);

    // 8. Render Frame
    this.sceneManager.render();
  }
}

// Launch application on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  new VoxelRealmsApp();
});
