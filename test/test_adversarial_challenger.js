// test/test_adversarial_challenger.js
// =============================================================================
// ADVERSARIAL CHALLENGER VERIFICATION HARNESS (challenger_2_v3)
//
// Empirical Verification of:
// 1. Rifle Optical ADS Zoom (R2)
// 2. 3D Throwable TNT Box Entity & Reactive Detonation (R3)
// 3. Starting Grid Fleet, Elevation Y=25 & Forward Yaw -Math.PI/2 (R4)
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function runAdversarialTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    testsFailed++;
  }
}

// -----------------------------------------------------------------------------
// GLOBAL ENVIRONMENT MOCKS
// -----------------------------------------------------------------------------
const recordedCanvasOps = [];

global.navigator = { userAgent: 'Node-Challenger' };

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false })
};

global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: (tag) => {
    if (tag === 'canvas') {
      return {
        width: 64,
        height: 64,
        getContext: () => ({
          fillStyle: '#000000',
          font: '',
          textAlign: '',
          textBaseline: '',
          fillRect: (x, y, w, h) => {
            recordedCanvasOps.push({ op: 'fillRect', x, y, w, h });
          },
          beginPath: () => {},
          arc: (x, y, r) => {
            recordedCanvasOps.push({ op: 'arc', x, y, r });
          },
          fill: () => {},
          fillText: (text, x, y) => {
            recordedCanvasOps.push({ op: 'fillText', text, x, y });
          }
        })
      };
    }
    return {
      classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
      addEventListener: () => {}
    };
  },
  pointerLockElement: null
};

// -----------------------------------------------------------------------------
// MODULE LOADERS
// -----------------------------------------------------------------------------

function loadWorldModule() {
  const worldPath = path.resolve(__dirname, '../public/src/world.js');
  let worldCode = fs.readFileSync(worldPath, 'utf8')
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+const\s+WATER_LEVEL\s+=/g, 'const WATER_LEVEL =')
    .replace(/export\s+class\s+World/g, 'class World');

  const BLOCKS = {
    AIR: 0, GRASS: 1, DIRT: 2, DIRT_DRY: 3, STONE: 4, COBBLESTONE: 5,
    OAK_LOG: 6, OAK_LEAVES: 7, WOOD_PLANK: 8, SAND: 9, GRAVEL: 10,
    WATER: 11, SNOW: 12, ICE: 13, BRICK: 14, CLAY: 15, GLASS: 16,
    IRON_ORE: 17, GOLD_ORE: 18, TNT: 19, ASPHALT: 20, BEDROCK: 8
  };
  const BLOCK_DEFS = {
    0: { solid: false },
    1: { solid: true },
    4: { solid: true },
    5: { solid: true },
    11: { solid: false },
    14: { solid: true },
    19: { solid: true, isExplosive: true },
    20: { solid: true }
  };

  const texPath = path.resolve(__dirname, '../public/src/textures.js');
  const texCode = fs.readFileSync(texPath, 'utf8');
  const noiseMatch = texCode.match(/class SimplexNoise\s*\{[\s\S]*?\n\}/);
  const SimplexNoise = new Function(noiseMatch[0] + '\nreturn SimplexNoise;')();
  const noise = new SimplexNoise(1337);

  class Chunk {
    constructor(cx, cz, world) {
      this.cx = cx;
      this.cz = cz;
      this.world = world;
      this.originX = cx * 16;
      this.originZ = cz * 16;
      this.voxels = new Uint8Array(16 * 64 * 16);
      this.isGenerated = false;
      this.isDirty = false;
    }
    getIndex(lx, ly, lz) {
      return (lx * 16 + lz) * 64 + ly;
    }
    getBlock(lx, ly, lz) {
      if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16 || ly < 0 || ly >= 64) {
        return this.world ? this.world.getBlock(this.originX + lx, ly, this.originZ + lz) : 0;
      }
      return this.voxels[this.getIndex(lx, ly, lz)];
    }
    setBlockLocal(lx, ly, lz, blockType) {
      if (lx >= 0 && lx < 16 && ly >= 0 && ly < 64 && lz >= 0 && lz < 16) {
        this.voxels[this.getIndex(lx, ly, lz)] = blockType;
        this.isDirty = true;
        return true;
      }
      return false;
    }
    rebuildMesh() {
      this.rebuilt = true;
      this.isDirty = false;
    }
  }

  const { World } = new Function(
    'Chunk', 'CHUNK_WIDTH', 'CHUNK_HEIGHT', 'CHUNK_DEPTH', 'BLOCKS', 'noise',
    worldCode + '\nreturn { World };'
  )(Chunk, 16, 64, 16, BLOCKS, noise);

  return { World, Chunk, BLOCKS, noise };
}

function loadVehicleModule() {
  const vehiclePath = path.resolve(__dirname, '../public/src/vehicle.js');
  let vehicleCode = fs.readFileSync(vehiclePath, 'utf8')
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+class\s+DrivableCar/g, 'class DrivableCar')
    .replace(/export\s+class\s+VehicleManager/g, 'class VehicleManager');

  class Vector3 {
    constructor(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    normalize() {
      const l = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= l; this.y /= l; this.z /= l;
      return this;
    }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  }

  class Group {
    constructor() {
      this.children = [];
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0, set() {} };
      this.visible = true;
    }
    add(...c) { for (const el of c) this.children.push(el); }
    traverse(fn) { fn(this); for (const c of this.children) if (c.traverse) c.traverse(fn); else fn(c); }
  }

  class Mesh {
    constructor(g, m) {
      this.geometry = g;
      this.material = m;
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.visible = true;
    }
    traverse(fn) { fn(this); }
  }

  const mockTHREE = {
    Vector3,
    Color: class { constructor(c) { this.hex = c; } },
    Group,
    Mesh,
    BoxGeometry: class {},
    CylinderGeometry: class {},
    MeshStandardMaterial: class { constructor(o) { Object.assign(this, o); } },
    MeshBasicMaterial: class { constructor(o) { Object.assign(this, o); } }
  };

  const BLOCKS = { AIR: 0, WATER: 11, STONE: 4, BRICK: 14, SNOW: 12, ASPLIGHT: 20 };
  const BLOCK_DEFS = { 4: { solid: true }, 14: { solid: true }, 12: { solid: true }, 20: { solid: true } };
  const sound = { playClick: () => {} };

  const fn = new Function('THREE', 'BLOCKS', 'BLOCK_DEFS', 'sound', vehicleCode + '\nreturn { DrivableCar, VehicleManager };');
  return fn(mockTHREE, BLOCKS, BLOCK_DEFS, sound);
}

const sharedSoundMock = {
  playClick: () => {},
  playShoot: () => {},
  playExplosion: () => {},
  playFuse: () => {}
};

function loadControlsModule() {
  const controlsPath = path.resolve(__dirname, '../public/src/controls.js');
  let controlsCode = fs.readFileSync(controlsPath, 'utf8')
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+class\s+Controls/g, 'class Controls');

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    applyEuler(euler) {
      const p = euler.x;
      const y = euler.y;
      const cosP = Math.cos(p);
      const sinP = Math.sin(p);
      const cosY = Math.cos(y);
      const sinY = Math.sin(y);

      if (this.x === 0 && this.y === 0 && this.z === -1) {
        this.x = -sinY * cosP;
        this.y = sinP;
        this.z = -cosY * cosP;
        return this;
      }
      return this;
    }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  }

  class Euler {
    constructor(x = 0, y = 0, z = 0, order = 'YXZ') { this.x = x; this.y = y; this.z = z; this.order = order; }
    set(x, y, z, order = 'YXZ') { this.x = x; this.y = y; this.z = z; this.order = order; return this; }
  }

  class Group {
    constructor() {
      this.position = new Vector3();
      this.rotation = new Euler();
      this.children = [];
      this.visible = true;
    }
    add(...c) { for (const el of c) this.children.push(el); }
    remove(c) {
      const idx = this.children.indexOf(c);
      if (idx !== -1) this.children.splice(idx, 1);
    }
  }

  class Mesh {
    constructor(geom, mat) {
      this.geometry = geom;
      this.material = mat;
      this.position = new Vector3();
      this.rotation = new Euler();
      this.scale = { x: 1, y: 1, z: 1, setScalar(s) { this.x = s; this.y = s; this.z = s; } };
      this.visible = true;
      this.children = [];
    }
    add(...c) { for (const el of c) this.children.push(el); }
    getWorldPosition(targetVec) {
      return targetVec.copy(this.position);
    }
  }

  class BoxGeometry {
    constructor(w = 1, h = 1, d = 1) { this.width = w; this.height = h; this.depth = d; }
  }

  class MeshStandardMaterial {
    constructor(opts = {}) {
      this.color = {
        hex: opts.color || 0xffffff,
        setHex: function(val) { this.hex = val; }
      };
      this.emissive = {
        hex: opts.emissive || 0x000000,
        setHex: function(val) { this.hex = val; }
      };
      this.emissiveIntensity = opts.emissiveIntensity || 0;
      this.roughness = opts.roughness;
      this.metalness = opts.metalness;
      this.transparent = Boolean(opts.transparent);
      this.opacity = opts.opacity !== undefined ? opts.opacity : 1.0;
      this.depthWrite = opts.depthWrite !== undefined ? opts.depthWrite : true;
      this.map = opts.map || null;
    }
    clone() {
      const copy = new MeshStandardMaterial(this);
      copy.color.hex = this.color.hex;
      copy.emissive.hex = this.emissive.hex;
      copy.emissiveIntensity = this.emissiveIntensity;
      copy.transparent = this.transparent;
      copy.opacity = this.opacity;
      copy.depthWrite = this.depthWrite;
      copy.map = this.map;
      return copy;
    }
  }

  class MeshBasicMaterial {
    constructor(opts = {}) {
      this.color = {
        hex: opts.color || 0xffffff,
        setHex: function(val) { this.hex = val; }
      };
      this.transparent = Boolean(opts.transparent);
      this.opacity = opts.opacity !== undefined ? opts.opacity : 1.0;
    }
  }

  class CanvasTexture {
    constructor(canvas) {
      this.canvas = canvas;
    }
  }

  const mockTHREE = {
    Vector3,
    Euler,
    Group,
    Mesh,
    BoxGeometry,
    MeshStandardMaterial,
    MeshBasicMaterial,
    CanvasTexture
  };

  const BLOCKS = {
    AIR: 0, GRASS: 1, DIRT: 2, DIRT_DRY: 3, STONE: 4, COBBLESTONE: 5,
    OAK_LOG: 6, OAK_LEAVES: 7, WOOD_PLANK: 8, SAND: 9, GRAVEL: 10,
    WATER: 11, SNOW: 12, ICE: 13, BRICK: 14, CLAY: 15, GLASS: 16,
    IRON_ORE: 17, GOLD_ORE: 18, TNT: 19, ASPHALT: 20, BEDROCK: 8
  };
  const BLOCK_DEFS = {
    1: { solid: true },
    4: { solid: true },
    19: { solid: true, isExplosive: true },
    20: { solid: true }
  };

  global.sound = sharedSoundMock;

  const fn = new Function(
    'THREE', 'BLOCKS', 'BLOCK_DEFS', 'sound',
    controlsCode + '\nreturn { Controls, TntEntity: Controls.TntEntity };'
  );

  return { ...fn(mockTHREE, BLOCKS, BLOCK_DEFS, sharedSoundMock), mockTHREE, BLOCKS, BLOCK_DEFS, sound: sharedSoundMock };
}

const mockDomElement = {
  addEventListener: () => {},
  removeEventListener: () => {},
  requestPointerLock: () => {}
};

console.log('=============================================================================');
console.log('CHALLENGER EMPIRICAL ADVERSARIAL VERIFICATION SUITE');
console.log('=============================================================================\n');

// =============================================================================
// CHALLENGE 1: RIFLE OPTICAL ADS ZOOM & CLEAR VISION (R2)
// =============================================================================
console.log('--- CHALLENGE 1: RIFLE OPTICAL ADS ZOOM & CLEAR VISION (R2) ---');

runAdversarialTest('R2: scopeLens material has opacity 0.0, transparent true, depthWrite false', () => {
  const { Controls, mockTHREE } = loadControlsModule();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  const physics = { pos: new mockTHREE.Vector3(), vel: new mockTHREE.Vector3(), getEyePosition: () => new mockTHREE.Vector3(), update: () => {} };
  const world = { getBlock: () => 0 };

  const controls = new Controls(camera, mockDomElement, physics, world);
  assert.ok(controls.scopeLens, 'scopeLens mesh must be created on controls');
  assert.strictEqual(controls.scopeLens.material.opacity, 0.0, 'scopeLens opacity must be strictly 0.0');
  assert.strictEqual(controls.scopeLens.material.transparent, true, 'scopeLens transparent must be true');
  assert.strictEqual(controls.scopeLens.material.depthWrite, false, 'scopeLens depthWrite must be false');
});

runAdversarialTest('R2: rifleGroup.visible is false when aimBlend > 0.82, and #crosshair is hidden during ADS', () => {
  const { Controls, mockTHREE } = loadControlsModule();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  camera.updateProjectionMatrix = () => {};
  const physics = { pos: new mockTHREE.Vector3(), vel: new mockTHREE.Vector3(), getEyePosition: () => new mockTHREE.Vector3(), update: () => {} };
  const world = { getBlock: () => 0 };

  const domClasses = {
    scope: new Set(['hidden']),
    crosshair: new Set()
  };

  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => {
    if (id === 'rifle-scope-overlay') {
      return {
        classList: {
          add: (c) => domClasses.scope.add(c),
          remove: (c) => domClasses.scope.delete(c),
          contains: (c) => domClasses.scope.has(c)
        }
      };
    }
    if (id === 'crosshair') {
      return {
        classList: {
          add: (c) => domClasses.crosshair.add(c),
          remove: (c) => domClasses.crosshair.delete(c),
          contains: (c) => domClasses.crosshair.has(c)
        }
      };
    }
    return null;
  };

  try {
    const controls = new Controls(camera, mockDomElement, physics, world);
    controls.setWeaponsMode(true);

    // 1. Hip-fire at aimBlend = 0.0
    controls.aimBlend = 0.0;
    controls.update(0.0001);
    assert.strictEqual(controls.rifleGroup.visible, true, 'At aimBlend=0.0 (hip-fire), rifleGroup must be visible');
    assert.strictEqual(domClasses.crosshair.has('hidden'), false, 'At aimBlend=0.0, crosshair must be visible');
    assert.strictEqual(domClasses.scope.has('hidden'), true, 'At aimBlend=0.0, scope overlay must be hidden');
    assert.strictEqual(camera.fov, 75, 'At aimBlend=0.0, camera.fov must be 75');

    // 2. Empirically verify that when aimBlend > 0.82, rifleGroup.visible is strictly false
    for (const blend of [0.83, 0.85, 0.90, 0.95, 1.0]) {
      controls.aimBlend = blend;
      controls.update(0.0001);
      assert.strictEqual(controls.rifleGroup.visible, false, `At aimBlend=${blend} (>0.82), rifleGroup.visible MUST be false`);
      assert.strictEqual(domClasses.crosshair.has('hidden'), true, `At aimBlend=${blend} (>0.82), crosshair MUST be hidden`);
      assert.strictEqual(domClasses.scope.has('hidden'), false, `At aimBlend=${blend} (>0.82), scope overlay MUST be visible`);
      assert.ok(camera.fov < 40, `Camera FOV must be zoomed in (got ${camera.fov})`);
    }

    // 3. Full ADS state through natural aiming transition
    controls.setAiming(true);
    for (let i = 0; i < 25; i++) {
      controls.update(0.04);
    }
    assert.strictEqual(controls.aimBlend, 1.0, 'Full ADS aimBlend must reach 1.0');
    assert.strictEqual(camera.fov, 32, 'At full ADS (aimBlend=1.0), camera.fov must be exactly 32 degrees (~2.34x optical zoom)');
    assert.strictEqual(controls.rifleGroup.visible, false, '3D rifleGroup must be hidden at full ADS');
    assert.strictEqual(domClasses.crosshair.has('hidden'), true, 'Crosshair must be hidden at full ADS');
    assert.strictEqual(domClasses.scope.has('hidden'), false, 'Scope overlay must be visible at full ADS');
  } finally {
    global.document.getElementById = origGetElementById;
  }
});

runAdversarialTest('R2: stress test rapid ADS toggling & variable dt lag spikes (dt=0.001s to 2.0s)', () => {
  const { Controls, mockTHREE } = loadControlsModule();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  camera.updateProjectionMatrix = () => {};
  const physics = { pos: new mockTHREE.Vector3(), vel: new mockTHREE.Vector3(), getEyePosition: () => new mockTHREE.Vector3(), update: () => {} };
  const world = { getBlock: () => 0 };

  const controls = new Controls(camera, mockDomElement, physics, world);
  controls.setWeaponsMode(true);

  // 1. Rapid toggle 100 times with random dt
  for (let i = 0; i < 100; i++) {
    const aim = i % 2 === 0;
    controls.setAiming(aim);
    const dt = 0.01 + Math.random() * 0.05;
    controls.update(dt);
    assert.ok(controls.aimBlend >= 0.0 && controls.aimBlend <= 1.0, `aimBlend ${controls.aimBlend} out of bounds [0, 1] during rapid toggle`);
    assert.ok(camera.fov >= 32.0 && camera.fov <= 75.0, `camera.fov ${camera.fov} out of bounds [32, 75] during rapid toggle`);
  }

  // 2. Huge lag spike while aiming (dt = 2.0s)
  controls.setAiming(true);
  controls.update(2.0);
  assert.strictEqual(controls.aimBlend, 1.0, 'Large dt step must clamp smoothly to 1.0 without overshoot');
  assert.strictEqual(camera.fov, 32.0, 'Large dt step must settle at 32 FOV');
  assert.strictEqual(controls.rifleGroup.visible, false, 'Rifle group must be hidden when full ADS');

  // 3. Huge lag spike while releasing aim (dt = 2.0s)
  controls.setAiming(false);
  controls.update(2.0);
  assert.strictEqual(controls.aimBlend, 0.0, 'Large dt step must clamp smoothly to 0.0 without undershoot');
  assert.strictEqual(camera.fov, 75.0, 'Large dt step must restore 75 FOV');
  assert.strictEqual(controls.rifleGroup.visible, true, 'Rifle group must become visible again');
});

runAdversarialTest('R2: turning off weaponsMode while aiming instantly resets ADS and crosshair', () => {
  const { Controls, mockTHREE } = loadControlsModule();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  camera.updateProjectionMatrix = () => {};
  const physics = { pos: new mockTHREE.Vector3(), vel: new mockTHREE.Vector3(), getEyePosition: () => new mockTHREE.Vector3(), update: () => {} };
  const world = { getBlock: () => 0 };

  const domClasses = { scope: new Set(['hidden']), crosshair: new Set() };
  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => {
    if (id === 'rifle-scope-overlay') return { classList: { add: (c) => domClasses.scope.add(c), remove: (c) => domClasses.scope.delete(c) } };
    if (id === 'crosshair') return { classList: { add: (c) => domClasses.crosshair.add(c), remove: (c) => domClasses.crosshair.delete(c) } };
    return null;
  };

  try {
    const controls = new Controls(camera, mockDomElement, physics, world);
    controls.setWeaponsMode(true);
    controls.setAiming(true);
    for (let i = 0; i < 20; i++) controls.update(0.05);

    assert.strictEqual(controls.isAiming, true);
    assert.strictEqual(controls.rifleGroup.visible, false);

    // Disable weaponsMode directly
    controls.setWeaponsMode(false);
    assert.strictEqual(controls.weaponsMode, false);
    assert.strictEqual(controls.isAiming, false, 'isAiming must reset to false when weaponsMode is disabled');
    assert.strictEqual(controls.rifleGroup.visible, false, 'rifleGroup visible must be false when weaponsMode is disabled');
    assert.strictEqual(domClasses.scope.has('hidden'), true, 'scope overlay must be hidden');
    assert.strictEqual(domClasses.crosshair.has('hidden'), false, 'crosshair must be restored');
  } finally {
    global.document.getElementById = origGetElementById;
  }
});

// =============================================================================
// CHALLENGE 2: 3D THROWABLE TNT BOX & REACTIVE DETONATION (R3)
// =============================================================================
console.log('\n--- CHALLENGE 2: 3D THROWABLE TNT BOX & REACTIVE DETONATION (R3) ---');

runAdversarialTest('R3: TntEntity creation has 6-face Minecraft canvas textures and 0.94 cube geometry', () => {
  const { TntEntity, mockTHREE } = loadControlsModule();

  const tnt = new TntEntity({
    x: 10, y: 25, z: 10,
    vx: 5, vy: 5, vz: -5,
    fuse: 3.0,
    THREE: mockTHREE
  });

  // Verify canvas operations recorded during texture generation
  const fillTexts = recordedCanvasOps.filter(op => op.op === 'fillText');
  assert.ok(fillTexts.some(op => op.text === 'TNT' && op.x === 32 && op.y === 32), 'Canvas texture must draw centered "TNT" banner text');

  const bannerRects = recordedCanvasOps.filter(op => op.op === 'fillRect' && op.y === 20 && op.h === 24);
  assert.ok(bannerRects.length > 0, 'Canvas texture must render white horizontal center banner at y=20..44');

  const fuseCircles = recordedCanvasOps.filter(op => op.op === 'arc' && op.x === 32 && op.y === 32);
  assert.ok(fuseCircles.length > 0, 'Top face canvas must render central fuse knot circle');

  assert.strictEqual(tnt.geometry.width, 0.94, 'Geometry width must be 0.94');
  assert.strictEqual(tnt.geometry.height, 0.94, 'Geometry height must be 0.94');
  assert.strictEqual(tnt.geometry.depth, 0.94, 'Geometry depth must be 0.94');
  assert.ok(Array.isArray(tnt.materials) && tnt.materials.length === 6, 'Must have 6 face materials');
});

runAdversarialTest('R3: Parabolic trajectory velocity vector math V = cameraDir * 14.0 + (0, 3.5, 0)', () => {
  const { Controls, mockTHREE } = loadControlsModule();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  const physics = {
    pos: new mockTHREE.Vector3(100, 30, 200),
    vel: new mockTHREE.Vector3(),
    getEyePosition: () => new mockTHREE.Vector3(100, 31.6, 200),
    update: () => {}
  };
  const world = { getBlock: () => 0 };

  const controls = new Controls(camera, mockDomElement, physics, world);

  // 1. Level camera pointing forward along -Z (pitch=0, yaw=0)
  controls.pitch = 0;
  controls.yaw = 0;
  const tnt1 = controls.throwTnt();
  assert.ok(Math.abs(tnt1.vel.x - 0.0) < 0.001, 'Vx must be 0');
  assert.ok(Math.abs(tnt1.vel.y - 3.5) < 0.001, 'Vy must be +3.5 upward lob');
  assert.ok(Math.abs(tnt1.vel.z - (-14.0)) < 0.001, 'Vz must be -14.0 forward');

  // 2. Camera pointing East along +X (yaw = -Math.PI / 2, pitch = 0)
  controls.pitch = 0;
  controls.yaw = -Math.PI / 2;
  const tnt2 = controls.throwTnt();
  assert.ok(Math.abs(tnt2.vel.x - 14.0) < 0.01, 'Vx must be +14.0 East');
  assert.ok(Math.abs(tnt2.vel.y - 3.5) < 0.01, 'Vy must be +3.5 upward');
  assert.ok(Math.abs(tnt2.vel.z - 0.0) < 0.01, 'Vz must be ~0.0');

  // 3. Camera pointing 30 degrees upward (pitch = Math.PI / 6, yaw = 0)
  controls.pitch = Math.PI / 6; // 30 deg
  controls.yaw = 0;
  const tnt3 = controls.throwTnt();
  assert.ok(Math.abs(tnt3.vel.y - 10.5) < 0.05, `Vy must be ~10.5 (got ${tnt3.vel.y})`);
  assert.ok(Math.abs(tnt3.vel.z - (-12.124)) < 0.05, `Vz must be ~-12.124 (got ${tnt3.vel.z})`);
});

runAdversarialTest('R3: Ground bounce physics, restitution, and settle to rest', () => {
  const { TntEntity, mockTHREE, BLOCKS } = loadControlsModule();

  const mockWorld = {
    getBlock: (x, y, z) => (y < 25 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 24
  };

  const tnt = new TntEntity({
    x: 0, y: 35, z: 0,
    vx: 2.0, vy: -5.0, vz: 0,
    fuse: 3.0,
    world: mockWorld,
    THREE: mockTHREE
  });

  let bounced = false;
  for (let i = 0; i < 50; i++) {
    const prevVy = tnt.vel.y;
    tnt.update(0.02);
    if (prevVy < -1.8 && tnt.vel.y > 0) {
      bounced = true;
      const expectedVy = -prevVy * 0.38;
      assert.ok(Math.abs(tnt.vel.y - expectedVy) < 0.5, 'Bounce restitution should be ~0.38');
      break;
    }
  }
  assert.ok(bounced, 'High downward speed must bounce off solid ground');

  for (let i = 0; i < 150; i++) {
    tnt.update(0.03);
  }
  assert.strictEqual(tnt.onGround, true, 'TNT must settle on ground');
  assert.strictEqual(tnt.vel.y, 0, 'Vertical velocity must settle to 0');
  assert.ok(Math.abs(tnt.pos.y - 25.47) < 0.05, `Resting Y should be floor surface 25.0 + 0.47 halfSize (got ${tnt.pos.y})`);
});

runAdversarialTest('R3: Accelerating white flash ignition animation & audio fuse sizzle', () => {
  let fusePlayed = false;
  sharedSoundMock.playFuse = () => { fusePlayed = true; };
  const { TntEntity, mockTHREE } = loadControlsModule();

  const tnt = new TntEntity({
    x: 0, y: 25, z: 0,
    fuse: 3.0,
    THREE: mockTHREE
  });

  assert.strictEqual(fusePlayed, true, 'Instantiation must trigger sound.playFuse()');

  let whiteCount = 0;
  let normalCount = 0;
  for (let step = 0; step < 60; step++) {
    tnt.update(0.05);
    const mat = tnt.materials[0];
    if (mat.emissive.hex === 0xffffff) whiteCount++;
    else normalCount++;
  }
  assert.ok(whiteCount > 5, `TNT must produce white flashes (got ${whiteCount})`);
  assert.ok(normalCount > 5, `TNT must toggle between white and normal texture during fuse (got ${normalCount})`);
});

runAdversarialTest('R3: Radius-3 spherical crater excavation & bedrock protection', () => {
  const { TntEntity, mockTHREE, BLOCKS } = loadControlsModule();

  const blocks = new Map();
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      for (let y = 18; y <= 30; y++) {
        if (y === 18) blocks.set(`${x},${y},${z}`, BLOCKS.BEDROCK);
        else blocks.set(`${x},${y},${z}`, BLOCKS.STONE);
      }
    }
  }

  const world = {
    getBlock: (x, y, z) => {
      const k = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return blocks.get(k) || 0;
    },
    applyAuthoritativeBlock: (x, y, z, val) => {
      const k = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      if (val === 0) blocks.delete(k);
      else blocks.set(k, val);
    }
  };

  let explosionSpawned = null;
  let explosionAudioPlayed = false;
  const particleManager = {
    spawnExplosion: (x, y, z) => { explosionSpawned = { x, y, z }; }
  };
  sharedSoundMock.playExplosion = () => { explosionAudioPlayed = true; };

  const tnt = new TntEntity({
    x: 0, y: 25, z: 0,
    fuse: 0.1,
    world,
    particleManager,
    THREE: mockTHREE
  });

  tnt.update(0.15);

  assert.strictEqual(tnt.isDead, true, 'TNT must be marked isDead after detonation');
  assert.ok(explosionSpawned, 'Detonation must call particleManager.spawnExplosion');
  assert.strictEqual(explosionAudioPlayed, true, 'Detonation must trigger sound.playExplosion()');

  // Verify spherical crater geometry (radius 3)
  assert.strictEqual(world.getBlock(0, 25, 0), BLOCKS.AIR, 'Center of explosion must be excavated');
  assert.strictEqual(world.getBlock(0, 27, 0), BLOCKS.AIR, 'Point at distance 2 must be excavated');
  assert.strictEqual(world.getBlock(3, 25, 0), BLOCKS.AIR, 'Point at distance 3 must be excavated');
  assert.strictEqual(world.getBlock(4, 25, 0), BLOCKS.STONE, 'Point at distance 4 must NOT be excavated (outside radius 3)');

  // Verify Bedrock protection: block at Y=18 must remain intact
  assert.strictEqual(world.getBlock(0, 18, 0), BLOCKS.BEDROCK, 'Bedrock at Y=18 must be preserved');
});

runAdversarialTest('R3: Instant bullet shoot-to-detonate reactivity against active TNT in-flight and at rest', () => {
  const { Controls, mockTHREE } = loadControlsModule();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    vel: new mockTHREE.Vector3(),
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };
  const world = { getBlock: () => 0 };

  const controls = new Controls(camera, mockDomElement, physics, world);
  controls.setWeaponsMode(true);
  controls.pitch = 0;
  controls.yaw = 0; // Forward along -Z

  let netTrigger = null;
  controls.sendTntTrigger = (x, y, z, fuseMs) => {
    netTrigger = { x, y, z, fuseMs };
  };

  // 1. Spawn TNT in flight 20 blocks away at (0, 26.6, -20)
  const tntFlight = new Controls.TntEntity({
    x: 0, y: 26.6, z: -20,
    fuse: 3.0,
    world,
    THREE: mockTHREE
  });
  controls.activeTntEntities.push(tntFlight);

  const shot1 = controls.triggerShoot();
  assert.ok(shot1.tntEntityHit, 'Bullet ray must detect and strike in-flight TNT entity');
  assert.strictEqual(shot1.tntEntityHit, tntFlight, 'Struck entity must match in-flight TNT');
  assert.strictEqual(tntFlight.isDead, true, 'In-flight TNT must detonate instantly');
  assert.ok(netTrigger, 'Network trigger must be sent');
  assert.strictEqual(netTrigger.fuseMs, 0, 'Network trigger fuse must be 0 ms');

  // 2. Off-axis TNT must NOT be struck
  controls.lastShootTime = 0;
  const tntMiss = new Controls.TntEntity({
    x: 5.0, y: 26.6, z: -20,
    fuse: 3.0,
    world,
    THREE: mockTHREE
  });
  controls.activeTntEntities = [tntMiss];
  const shot2 = controls.triggerShoot();
  assert.strictEqual(shot2.tntEntityHit, null, 'Bullet ray must not strike TNT that is off-axis');
  assert.strictEqual(tntMiss.isDead, false, 'Missed TNT must not detonate');

  // 3. Shoot resting TNT at maximum range (80 blocks ahead: Z = -80)
  controls.lastShootTime = 0;
  const tntFar = new Controls.TntEntity({
    x: 0, y: 26.6, z: -80,
    fuse: 3.0,
    world,
    THREE: mockTHREE
  });
  controls.activeTntEntities = [tntFar];
  const shot3 = controls.triggerShoot();
  assert.ok(shot3.tntEntityHit, 'Bullet ray must strike TNT up to 85 blocks reach');
  assert.strictEqual(tntFar.isDead, true, 'Far TNT must detonate immediately');
});

// =============================================================================
// CHALLENGE 3: STARTING GRID FLEET ELEVATION & FORWARD YAW (R4)
// =============================================================================
console.log('\n--- CHALLENGE 3: STARTING GRID FLEET ELEVATION & FORWARD YAW (R4) ---');

runAdversarialTest('R4: Starting grid cars spawn at Y=25 with yaw = -Math.PI / 2', () => {
  const { VehicleManager } = loadVehicleModule();
  const mockScene = { add: () => {}, remove: () => {} };
  const mockPM = { spawnDriftSmoke: () => {} };
  const world = { getBlock: () => 0 };

  const vm = new VehicleManager(world, mockScene, mockPM);

  const seCarIds = [
    'car_se_scuderia',
    'car_se_azure',
    'car_se_gold',
    'car_se_emerald',
    'car_se_papaya',
    'car_se_silver'
  ];

  for (const id of seCarIds) {
    const car = vm.getCarById(id);
    assert.ok(car, `VehicleManager must contain ${id}`);
    assert.strictEqual(car.pos.y, 25, `${id} must spawn at Y=25 (top of Y=24 asphalt)`);
    assert.strictEqual(car.group.position.y, 25, `${id} 3D group position must be Y=25`);
    assert.strictEqual(car.yaw, -Math.PI / 2, `${id} yaw must be -Math.PI/2 (facing East towards Turn 1)`);
    assert.ok(car.pos.x >= 50 && car.pos.x <= 210, `${id} X must be within SE quadrant`);
    assert.ok(car.pos.z >= -190 && car.pos.z <= -40, `${id} Z must be within SE quadrant`);
  }
});

runAdversarialTest('R4: Forward motion direction verification: yaw = -Math.PI / 2 accelerates East (+X)', () => {
  const { DrivableCar } = loadVehicleModule();

  const car = new DrivableCar('test_yaw_car', 0xdc2626, 104, 25, -57, -Math.PI / 2, 'Test Car');

  const startX = car.pos.x;
  const startZ = car.pos.z;

  for (let i = 0; i < 10; i++) {
    car.updatePhysics(0.05, { forward: 1, steer: 0 }, null);
  }

  assert.ok(car.pos.x > startX + 1.0, `Car must move in positive X direction (East). Start: ${startX}, Now: ${car.pos.x}`);
  assert.ok(Math.abs(car.pos.z - startZ) < 0.001, `Car must maintain straight line along Z. Start: ${startZ}, Now: ${car.pos.z}`);
  assert.ok(car.pos.y >= 24.9, 'Car elevation must remain on top of Y=25');
});

runAdversarialTest('R4: Plaza Central car stationed at (25, 25, 0) with yaw = -Math.PI / 2', () => {
  const { VehicleManager } = loadVehicleModule();
  const mockScene = { add: () => {}, remove: () => {} };
  const mockPM = { spawnDriftSmoke: () => {} };
  const world = { getBlock: () => 0 };

  const vm = new VehicleManager(world, mockScene, mockPM);

  const plazaCar = vm.getCarById('car_spawn_blue');
  assert.ok(plazaCar, 'VehicleManager must contain car_spawn_blue (GT Paris Azul)');
  assert.strictEqual(plazaCar.pos.x, 25, 'car_spawn_blue X must be 25 (East approach of Plaza Central)');
  assert.strictEqual(plazaCar.pos.y, 25, 'car_spawn_blue Y must be 25');
  assert.strictEqual(plazaCar.pos.z, 0, 'car_spawn_blue Z must be 0');
  assert.strictEqual(plazaCar.yaw, -Math.PI / 2, 'car_spawn_blue yaw must be -Math.PI/2 (facing forward East down highway)');
});

runAdversarialTest('R4: Roadbed and headroom validation on real World generator', () => {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World(null, null, 12345);

  world.getOrCreateChunk(Math.floor(104 / 16), Math.floor(-57 / 16));
  world.getOrCreateChunk(Math.floor(98 / 16), Math.floor(-61 / 16));
  world.getOrCreateChunk(Math.floor(92 / 16), Math.floor(-57 / 16));
  world.getOrCreateChunk(Math.floor(86 / 16), Math.floor(-61 / 16));

  world.getOrCreateChunk(0, 0);
  world.getOrCreateChunk(Math.floor(25 / 16), 0);

  // 1. Grid pole car at (104, 25, -57)
  const poleRoadbed = world.getBlock(104, 24, -57);
  assert.ok(poleRoadbed === BLOCKS.ASPHALT || poleRoadbed === BLOCKS.SNOW, `Pole roadbed at (104, 24, -57) must be ASPHALT or SNOW (got ${poleRoadbed})`);
  assert.strictEqual(world.getBlock(104, 25, -57), BLOCKS.AIR, 'Pole spawn headroom at Y=25 must be AIR');
  assert.strictEqual(world.getBlock(104, 26, -57), BLOCKS.AIR, 'Pole spawn headroom at Y=26 must be AIR');

  // 2. Plaza Central car at (25, 25, 0)
  const plazaRoadbed = world.getBlock(25, 24, 0);
  assert.ok(
    plazaRoadbed === BLOCKS.ASPHALT || plazaRoadbed === BLOCKS.SNOW || plazaRoadbed === BLOCKS.STONE || plazaRoadbed === BLOCKS.COBBLESTONE,
    `Plaza car roadbed at (25, 24, 0) must be solid paved surface or road marking (got ${plazaRoadbed})`
  );
  assert.strictEqual(world.getBlock(25, 25, 0), BLOCKS.AIR, 'Plaza car spawn headroom at Y=25 must be AIR');
  assert.strictEqual(world.getBlock(25, 26, 0), BLOCKS.AIR, 'Plaza car spawn headroom at Y=26 must be AIR');
});

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n=============================================================================');
console.log(`CHALLENGER RESULTS: ${testsPassed} passed, ${testsFailed} failed.`);
console.log('=============================================================================');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
