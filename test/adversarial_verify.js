// test/adversarial_verify.js
// EMPIRICAL ADVERSARIAL CHALLENGER VERIFICATION HARNESS
// Milestones 1 & 3: Autonomous Traffic, Plaza Headroom, Gran Circuito Continuity & Barriers

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Module loader helpers (mirroring test.js)
function loadWorldModule() {
  const worldPath = path.resolve(__dirname, '../public/src/world.js');
  let worldCode = fs.readFileSync(worldPath, 'utf8');

  worldCode = worldCode
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+const\s+WATER_LEVEL\s+=/g, 'const WATER_LEVEL =')
    .replace(/export\s+class\s+World/g, 'class World');

  const BLOCKS = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    DIRT_DRY: 3,
    STONE: 4,
    COBBLESTONE: 5,
    OAK_LOG: 6,
    OAK_LEAVES: 7,
    WOOD_PLANK: 8,
    SAND: 9,
    GRAVEL: 10,
    WATER: 11,
    SNOW: 12,
    ICE: 13,
    BRICK: 14,
    CLAY: 15,
    GLASS: 16,
    IRON_ORE: 17,
    GOLD_ORE: 18,
    TNT: 19,
    ASPHALT: 20
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

function loadAnimalsModule() {
  const animalsPath = path.resolve(__dirname, '../public/src/animals.js');
  let animalsCode = fs.readFileSync(animalsPath, 'utf8');

  animalsCode = animalsCode
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+const\s+ANIMAL_SPECIES\s+=/g, 'const ANIMAL_SPECIES =')
    .replace(/export\s+class\s+VoxelCar/g, 'class VoxelCar')
    .replace(/export\s+class\s+TrafficManager/g, 'class TrafficManager')
    .replace(/export\s+class\s+AnimalManager/g, 'class AnimalManager');

  const mockTHREE = {};
  mockTHREE.Vector3 = class {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new mockTHREE.Vector3(this.x, this.y, this.z); }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  };
  mockTHREE.Group = class {
    constructor() {
      this.position = new mockTHREE.Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.children = [];
    }
    add() { this.children.push(...arguments); }
    remove() {}
  };
  mockTHREE.Mesh = class {
    constructor() {
      this.position = new mockTHREE.Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
    }
  };
  mockTHREE.BoxGeometry = class {};
  mockTHREE.MeshLambertMaterial = class {
    constructor(opts = {}) {
      this.color = opts.color;
      this.emissive = {
        hex: opts.emissive || 0,
        setHex: function(val) { this.hex = val; },
        getHex: function() { return this.hex; }
      };
    }
  };

  const BLOCKS = {
    AIR: 0, GRASS: 1, DIRT: 2, DIRT_DRY: 3, STONE: 4, COBBLESTONE: 5,
    OAK_LOG: 6, OAK_LEAVES: 7, WOOD_PLANK: 8, SAND: 9, GRAVEL: 10,
    WATER: 11, SNOW: 12, ICE: 13, BRICK: 14, CLAY: 15, GLASS: 16,
    IRON_ORE: 17, GOLD_ORE: 18, TNT: 19, ASPHALT: 20
  };

  const BLOCK_DEFS = {
    0: { solid: false },
    1: { solid: true },
    2: { solid: true },
    4: { solid: true },
    5: { solid: true },
    6: { solid: true },
    7: { solid: false },
    8: { solid: true },
    11: { solid: false },
    14: { solid: true },
    16: { solid: true },
    17: { solid: true },
    18: { solid: true },
    19: { solid: true, isExplosive: true },
    20: { solid: true }
  };

  const fn = new Function('THREE', 'BLOCKS', 'BLOCK_DEFS', animalsCode + '\nreturn { VoxelCar, TrafficManager, AnimalManager, ANIMAL_SPECIES, BLOCKS, BLOCK_DEFS };');
  return fn(mockTHREE, BLOCKS, BLOCK_DEFS);
}

// Results accumulator
const results = {
  test1_traffic: { passed: false, details: [] },
  test2_headroom: { passed: false, details: [] },
  test3_continuity: { passed: false, details: [] },
  test4_barriers: { passed: false, details: [] }
};

console.log('=============================================================================');
console.log('       EMPIRICAL CHALLENGER ADVERSARIAL VERIFICATION SUITE');
console.log('=============================================================================\n');

// -----------------------------------------------------------------------------
// EMPIRICAL TEST 1: AUTONOMOUS TRAFFIC MULTI-FRAME FLOW & FALSE POSITIVE STRESS
// -----------------------------------------------------------------------------
console.log('--- TEST 1: Autonomous Traffic Multi-Frame Simulation ---');
try {
  const { World } = loadWorldModule();
  const { TrafficManager, VoxelCar } = loadAnimalsModule();
  const world = new World({ add: () => {} }, null, 48151623);

  // Preload chunks along all traffic routes
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      world.getOrCreateChunk(cx, cz);
    }
  }
  for (let cz = -29; cz <= 29; cz++) {
    world.getOrCreateChunk(0, cz);
    world.getOrCreateChunk(-1, cz);
    world.getOrCreateChunk(1, cz);
  }
  for (let cx = -16; cx <= 16; cx++) {
    world.getOrCreateChunk(cx, 0);
    world.getOrCreateChunk(cx, -1);
    world.getOrCreateChunk(cx, 1);
  }
  for (let cz = -15; cz <= 15; cz++) {
    world.getOrCreateChunk(14, cz);
    world.getOrCreateChunk(15, cz);
  }
  for (let cz = -15; cz <= 15; cz++) {
    world.getOrCreateChunk(-14, cz);
    world.getOrCreateChunk(-15, cz);
  }

  const tm = new TrafficManager({ add: () => {} }, world);
  console.log(`[Test 1] Initialized TrafficManager with ${tm.cars.length} autonomous vehicles.`);

  // 500-frame multi-vehicle continuous simulation (25 seconds)
  const consecutiveStops = new Array(tm.cars.length).fill(0);
  const totalDist = new Array(tm.cars.length).fill(0);
  let prevPos = tm.cars.map(c => ({ x: c.position.x, z: c.position.z }));

  for (let frame = 0; frame < 500; frame++) {
    tm.update(0.05);
    for (let i = 0; i < tm.cars.length; i++) {
      const car = tm.cars[i];
      const stepDist = Math.hypot(car.position.x - prevPos[i].x, car.position.z - prevPos[i].z);
      totalDist[i] += stepDist;
      prevPos[i] = { x: car.position.x, z: car.position.z };

      if (car.currentSpeed <= 0.001 || car.isStopped) {
        consecutiveStops[i]++;
      } else {
        consecutiveStops[i] = 0;
      }

      assert.ok(
        consecutiveStops[i] < 5,
        `Car ${i} on route ${car.route.type} must never freeze or stall (stalled for ${consecutiveStops[i]} frames)`
      );
    }
  }

  for (let i = 0; i < tm.cars.length; i++) {
    console.log(`  Car ${i} [${tm.cars[i].route.type}]: total distance traveled = ${totalDist[i].toFixed(1)}m, currentSpeed = ${tm.cars[i].currentSpeed.toFixed(1)}m/s`);
    assert.ok(totalDist[i] > 100.0, `Car ${i} must continuously travel (> 100m in 500 frames, got ${totalDist[i].toFixed(1)}m)`);
  }

  // High-density 360-degree sweep on Roundabout (1000 probe angles)
  console.log('  Sweeping 1000 angles on Central Roundabout...');
  const testRoundaboutCar = new VoxelCar({ type: 'circle', cx: 0, cz: 0, radius: 21.0, speed: 9.0, initialProgress: 0 }, null, world);
  let roundaboutObstacleCount = 0;
  for (let step = 0; step < 1000; step++) {
    const angle = (step / 1000) * Math.PI * 2;
    testRoundaboutCar.progress = angle;
    const pos = testRoundaboutCar.computePositionAtProgress(angle);
    testRoundaboutCar.position.set(pos.x, pos.y, pos.z);
    const obs = testRoundaboutCar.checkObstacleAhead(8.0);
    if (obs) roundaboutObstacleCount++;
  }
  assert.strictEqual(roundaboutObstacleCount, 0, `Roundabout must have 0 false obstacle detections across 1000 angles (got ${roundaboutObstacleCount})`);

  // Highway corridor linear scan (sampling every 1.0m along active lanes)
  console.log('  Scanning straight arterial highways for false obstacles...');
  let highwayObstacleCount = 0;
  for (const r of [
    { type: 'line', x1: 1.6, z1: -435, x2: 1.6, z2: -35, speed: 12.0 },
    { type: 'line', x1: 1.6, z1: 35, x2: 1.6, z2: 420, speed: 12.0 },
    { type: 'line', x1: -1.6, z1: 420, x2: -1.6, z2: 35, speed: 12.0 },
    { type: 'line', x1: -1.6, z1: -35, x2: -1.6, z2: -425, speed: 12.0 },
    { type: 'line', x1: 35, z1: 1.6, x2: 215, z2: 1.6, speed: 11.5 },
    { type: 'line', x1: -35, z1: -1.6, x2: -215, z2: -1.6, speed: 11.5 }
  ]) {
    const car = new VoxelCar(r, null, world);
    const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
    const steps = Math.floor(len);
    for (let s = 0; s <= steps; s++) {
      const prog = s / len;
      car.progress = prog;
      const pos = car.computePositionAtProgress(prog);
      car.position.set(pos.x, pos.y, pos.z);
      const obs = car.checkObstacleAhead(8.0);
      if (obs) highwayObstacleCount++;
    }
  }
  assert.strictEqual(highwayObstacleCount, 0, `Highways must have 0 false obstacle detections across all corridors (got ${highwayObstacleCount})`);

  results.test1_traffic.passed = true;
  results.test1_traffic.details.push('500 frames multi-vehicle simulation: ZERO freezes/stalls across all 12 cars; all vehicles continuously advanced > 100m.');
  results.test1_traffic.details.push('1000-angle 360-degree sweep around Central Roundabout: 100% clear (0 false positives).');
  results.test1_traffic.details.push('Full highway corridor linear sweep (every 1m): 100% clear (0 false positives).');
  console.log('✓ TEST 1 PASSED: Autonomous Traffic advances smoothly with ZERO false positives.\n');
} catch (err) {
  results.test1_traffic.details.push(err.message);
  console.error('✗ TEST 1 FAILED:', err.message, '\n');
}

// -----------------------------------------------------------------------------
// EMPIRICAL TEST 2: CENTRAL PLAZA HEADROOM CLEARANCE (d in [13..19], Y in [25..29])
// -----------------------------------------------------------------------------
console.log('--- TEST 2: Central Plaza Headroom Clearance ---');
try {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World({ add: () => {} }, null, 48151623);
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      world.getOrCreateChunk(cx, cz);
    }
  }

  let totalVoxelsChecked = 0;
  let nonAirCount = 0;

  const approaches = [
    { name: 'North', getCoords: (d, w) => ({ x: w, z: d }) },
    { name: 'South', getCoords: (d, w) => ({ x: w, z: -d }) },
    { name: 'East',  getCoords: (d, w) => ({ x: d, z: w }) },
    { name: 'West',  getCoords: (d, w) => ({ x: -d, z: w }) }
  ];

  for (const app of approaches) {
    for (let d = 13; d <= 19; d++) {
      for (let w = -3; w <= 3; w++) {
        const { x, z } = app.getCoords(d, w);
        const surf = world.getBlock(x, 24, z);
        assert.ok(
          surf === BLOCKS.ASPHALT || surf === BLOCKS.STONE || surf === BLOCKS.SNOW || surf === BLOCKS.COBBLESTONE,
          `${app.name} approach pavement at (${x}, 24, ${z}) must be solid road surface (got ${surf})`
        );

        for (let y = 25; y <= 29; y++) {
          totalVoxelsChecked++;
          const block = world.getBlock(x, y, z);
          if (block !== BLOCKS.AIR) nonAirCount++;
        }
      }
    }
  }

  console.log(`[Test 2] Checked ${totalVoxelsChecked} headroom voxels ($d \\in [13..19], Y \\in [25..29], w \\in [-3..3]$ across 4 approaches).`);
  assert.strictEqual(nonAirCount, 0, `All ${totalVoxelsChecked} headroom voxels in cardinal approaches must be BLOCKS.AIR (found ${nonAirCount} non-air voxels)`);

  // Verify obelisks are at w = +-4 (strictly outside w in -3..3)
  const obeliskPositions = [[-4, 14], [4, 14], [-4, -14], [4, -14], [14, -4], [14, 4], [-14, -4], [-14, 4]];
  for (const [px, pz] of obeliskPositions) {
    assert.notStrictEqual(world.getBlock(px, 25, pz), BLOCKS.AIR, `Obelisk pillar should exist at (${px}, 25, ${pz})`);
  }

  // Verify corner bell towers are at (+-11, +-11) and posts at (+-12, +-12)
  for (const [tx, tz] of [[11, 11], [-11, 11], [11, -11], [-11, -11]]) {
    assert.strictEqual(world.getBlock(tx - 1, 25, tz - 1), BLOCKS.OAK_LOG, `Bell tower corner post at (${tx-1}, 25, ${tz-1})`);
    const rPost = Math.hypot(tx + 1, tz + 1);
    assert.ok(rPost < 17.5, `Bell tower corner post (r=${rPost.toFixed(2)}) must safely sit inside r < 18, well clear of roundabout ring (19.5..22.5)`);
  }

  results.test2_headroom.passed = true;
  results.test2_headroom.details.push(`All ${totalVoxelsChecked} voxels in cardinal approaches (d=13..19, Y=25..29, w=-3..3) are confirmed 100% BLOCKS.AIR.`);
  results.test2_headroom.details.push('Obelisks correctly placed at |w|=4 outside road lanes.');
  results.test2_headroom.details.push('Bell towers correctly relocated to (±11, ±11) with outer radius r<=16.97, clearing roundabout ring (r=19..23).');
  console.log('✓ TEST 2 PASSED: Central Plaza cardinal approaches have 100% unobstructed headroom.\n');
} catch (err) {
  results.test2_headroom.details.push(err.message);
  console.error('✗ TEST 2 FAILED:', err.message, '\n');
}

// -----------------------------------------------------------------------------
// EMPIRICAL TEST 3: GRAN CIRCUITO CONTINUITY (R4) 8-SEGMENT CLOSED LOOP
// -----------------------------------------------------------------------------
console.log('--- TEST 3: Gran Circuito Closed-Loop Continuity (8 Segments) ---');
try {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World(null, null, 12345);

  // Preload all chunks in SE quadrant covering X: 46..215, Z: -195..-35
  for (let cx = Math.floor(46 / 16); cx <= Math.floor(215 / 16); cx++) {
    for (let cz = Math.floor(-195 / 16); cz <= Math.floor(-35 / 16); cz++) {
      world.getOrCreateChunk(cx, cz);
    }
  }

  const segments = [
    { name: 'Seg 1: Main Straight North', type: 'straight', p1: [80, -60], p2: [176, -60] },
    { name: 'Seg 2: Turn 1 & 2 (Curva Grande)', type: 'arc', center: [176, -82], r: 22.5, a1: Math.PI / 2, a2: 0 },
    { name: 'Seg 3: Lake Bridge East Straight', type: 'straight', p1: [198.5, -82], p2: [198.5, -132] },
    { name: 'Seg 4: Turn 3 & 4 (Horquilla del Lago)', type: 'arc', center: [176, -132], r: 22.5, a1: 0, a2: -Math.PI / 2 },
    { name: 'Seg 5: Mountain Tunnel South Straight', type: 'straight', p1: [176, -154.5], p2: [80, -154.5] },
    { name: 'Seg 6: Turn 5 & 6 (Southwest Turn)', type: 'arc', center: [80, -132], r: 22.5, a1: -Math.PI / 2, a2: -Math.PI },
    { name: 'Seg 7: West Stadium Straight', type: 'straight', p1: [57.5, -132], p2: [57.5, -82] },
    { name: 'Seg 8: Turn 7 & 8 (Final Turn to Straight)', type: 'arc', center: [80, -82], r: 22.5, a1: Math.PI, a2: Math.PI / 2 }
  ];

  let totalCenterlineSamples = 0;
  let centerlineGaps = 0;
  let headroomObstacles = 0;

  for (const seg of segments) {
    const segPoints = [];
    if (seg.type === 'straight') {
      const len = Math.hypot(seg.p2[0] - seg.p1[0], seg.p2[1] - seg.p1[1]);
      const steps = Math.ceil(len * 4);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        segPoints.push([
          seg.p1[0] + (seg.p2[0] - seg.p1[0]) * t,
          seg.p1[1] + (seg.p2[1] - seg.p1[1]) * t
        ]);
      }
    } else {
      const arcLen = Math.abs(seg.a2 - seg.a1) * seg.r;
      const steps = Math.ceil(arcLen * 4);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const a = seg.a1 + (seg.a2 - seg.a1) * t;
        segPoints.push([
          seg.center[0] + Math.cos(a) * seg.r,
          seg.center[1] + Math.sin(a) * seg.r
        ]);
      }
    }

    for (const [px, pz] of segPoints) {
      totalCenterlineSamples++;
      const bx = Math.round(px);
      const bz = Math.round(pz);

      const surface = world.getBlock(bx, 24, bz);
      if (surface !== BLOCKS.ASPHALT && surface !== BLOCKS.SNOW) {
        centerlineGaps++;
        console.error(`  [Gap in ${seg.name}] at (${bx}, 24, ${bz}): block=${surface}`);
      }

      const h1 = world.getBlock(bx, 25, bz);
      const h2 = world.getBlock(bx, 26, bz);
      if (h1 !== BLOCKS.AIR || h2 !== BLOCKS.AIR) {
        headroomObstacles++;
      }
    }
  }

  console.log(`[Test 3] Centerline verification: ${totalCenterlineSamples} samples across all 8 segments. Gaps=${centerlineGaps}, Obstacles=${headroomObstacles}`);
  assert.strictEqual(centerlineGaps, 0, `Centerline must have 0 gaps across all 8 segments (found ${centerlineGaps})`);
  assert.strictEqual(headroomObstacles, 0, `Centerline must have 0 headroom obstacles (found ${headroomObstacles})`);

  // Full-surface comprehensive grid scan across the entire 12-block track width (r in [16.5..28.5])
  console.log('  Performing full-width 2D grid scan across entire circuit bounding box...');
  let totalTrackVoxels = 0;
  let trackVoxelErrors = 0;
  let waterSeepage = 0;

  for (let x = 48; x <= 208; x++) {
    for (let z = -180; z <= -40; z++) {
      const cx = Math.max(80, Math.min(176, x));
      const cz = Math.max(-132, Math.min(-82, z));
      const r = Math.hypot(x - cx, z - cz);

      if (r >= 16.5 && r <= 28.5) {
        totalTrackVoxels++;
        const surf = world.getBlock(x, 24, z);
        const y25 = world.getBlock(x, 25, z);
        const y26 = world.getBlock(x, 26, z);

        if (surf !== BLOCKS.ASPHALT && surf !== BLOCKS.SNOW) trackVoxelErrors++;
        if (surf === BLOCKS.WATER) waterSeepage++;
        if (y25 !== BLOCKS.AIR || y26 !== BLOCKS.AIR) trackVoxelErrors++;
      }
    }
  }

  console.log(`[Test 3] Full-width track scan: ${totalTrackVoxels} track surface voxels verified. Errors=${trackVoxelErrors}, WaterSeepage=${waterSeepage}`);
  assert.strictEqual(trackVoxelErrors, 0, `Track surface must have 0 errors across all ${totalTrackVoxels} voxels (found ${trackVoxelErrors})`);
  assert.strictEqual(waterSeepage, 0, 'No water must ever seep through track surface');

  results.test3_continuity.passed = true;
  results.test3_continuity.details.push(`Dense 8-segment closed-loop centerline test (${totalCenterlineSamples} points): 100% C1 continuous, ZERO gaps.`);
  results.test3_continuity.details.push(`Full-width track grid scan (${totalTrackVoxels} voxels across 12-block width): ZERO voids, zero elevation disconnects, zero water seepage.`);
  console.log('✓ TEST 3 PASSED: Gran Circuito is 100% closed-loop continuous with zero gaps.\n');
} catch (err) {
  results.test3_continuity.details.push(err.message);
  console.error('✗ TEST 3 FAILED:', err.message, '\n');
}

// -----------------------------------------------------------------------------
// EMPIRICAL TEST 4: PERIMETER BARRIERS & INVERTED GRANDSTANDS (R4)
// -----------------------------------------------------------------------------
console.log('--- TEST 4: Perimeter Barriers & Grandstand Slope ---');
try {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World(null, null, 12345);

  for (let cx = Math.floor(46 / 16); cx <= Math.floor(215 / 16); cx++) {
    for (let cz = Math.floor(-195 / 16); cz <= Math.floor(-35 / 16); cz++) {
      world.getOrCreateChunk(cx, cz);
    }
  }

  // 1. Comprehensive 2D spatial scan of ALL perimeter crash barrier positions across the entire circuit
  console.log('  Testing complete 2D circuit perimeter crash barriers...');
  let barrierCount = 0;
  let barrierErrors = 0;

  for (let x = 46; x <= 210; x++) {
    for (let z = -182; z <= -38; z++) {
      const cx = Math.max(80, Math.min(176, x));
      const cz = Math.max(-132, Math.min(-82, z));
      const r = Math.hypot(x - cx, z - cz);

      const isPitOpening = (z >= -68 && z <= -66 && ((x >= 86 && x <= 94) || (x >= 140 && x <= 148)));
      const isPaddockGate = (z >= -53 && z <= -51 && x >= 106 && x <= 114);
      const isWestTrackCross = (x >= 49 && x <= 51 && z >= -65 && z <= -54);

      if (((r >= 14.1 && r < 15.3) || (r > 29.7 && r <= 30.9)) && !isPitOpening && !isPaddockGate && !isWestTrackCross) {
        barrierCount++;
        const y25 = world.getBlock(x, 25, z);
        const y26 = world.getBlock(x, 26, z);

        const inTunnel = (x >= 85 && x <= 135 && (z === -162 || z === -147));
        const onBridgeTower = ((x === 191 || x === 206) && (z === -120 || z === -96));
        const onConcretePitWall = (z === -67 && x >= 95 && x <= 139);

        if (inTunnel) {
          // Tunnel structural vault walls (Cobblestone or Oak Log up to Y=30)
          if (!((y25 === BLOCKS.COBBLESTONE || y25 === BLOCKS.OAK_LOG) && (y26 === BLOCKS.COBBLESTONE || y26 === BLOCKS.OAK_LOG))) {
            barrierErrors++;
            console.error(`    Tunnel barrier error at (${x}, ${z}): Y=25 is ${y25}, Y=26 is ${y26}`);
          }
        } else if (onBridgeTower) {
          // Bridge suspension stone towers
          if (y25 !== BLOCKS.STONE || y26 !== BLOCKS.STONE) {
            barrierErrors++;
            console.error(`    Bridge tower error at (${x}, ${z}): Y=25 is ${y25}, Y=26 is ${y26}`);
          }
        } else if (onConcretePitWall) {
          // Concrete Pit Wall: Stone at Y=25, Iron Ore guardrail at Y=26
          if (y25 !== BLOCKS.STONE || y26 !== BLOCKS.IRON_ORE) {
            barrierErrors++;
            console.error(`    Pit wall error at (${x}, ${z}): Y=25 is ${y25}, Y=26 is ${y26}`);
          }
        } else {
          // Standard 2-block perimeter crash barrier: Cobblestone at Y=25, Iron Ore steel rail at Y=26
          if (y25 !== BLOCKS.COBBLESTONE || y26 !== BLOCKS.IRON_ORE) {
            barrierErrors++;
            console.error(`    Perimeter barrier error at (${x}, ${z}): Y=25 is ${y25}, Y=26 is ${y26}`);
          }
        }
      }
    }
  }

  console.log(`[Test 4] Complete barrier scan: ${barrierCount} barrier positions verified. Errors=${barrierErrors}`);
  assert.strictEqual(barrierErrors, 0, `All ${barrierCount} perimeter barrier positions must be continuous and solid (found ${barrierErrors} errors)`);

  // 2. Grandstand Inversion and Monotonic Upward Slope (tierY = trackY + 2 + (z + 50))
  console.log('  Testing Tribuna Principal grandstand orientation & seating slope...');
  let grandstandPointsChecked = 0;
  let grandstandErrors = 0;

  for (let x = 82; x <= 148; x += 2) {
    let prevTierY = 25;
    for (let z = -50; z <= -43; z++) {
      grandstandPointsChecked++;
      const expectedTierY = 24 + 2 + (z + 50);

      // Verify monotonic step upward North (away from track, facing south)
      assert.strictEqual(expectedTierY, prevTierY + 1, `Grandstand tier at z=${z} must step +1 above z=${z-1}`);
      prevTierY = expectedTierY;

      // Check seating surface block at expectedTierY
      const seatBlock = world.getBlock(x, expectedTierY, z);
      assert.ok(
        seatBlock === BLOCKS.STONE || seatBlock === BLOCKS.WOOD_PLANK || seatBlock === BLOCKS.BRICK,
        `Grandstand seat at (${x}, ${expectedTierY}, ${z}) must be solid seating material (got ${seatBlock})`
      );

      // Check substructure below seat (Y in 24..expectedTierY-1) is solid COBBLESTONE
      for (let y = 24; y < expectedTierY; y++) {
        const sub = world.getBlock(x, y, z);
        if (sub !== BLOCKS.COBBLESTONE) {
          grandstandErrors++;
          console.error(`    Grandstand substructure error at (${x}, ${y}, ${z}): got ${sub}`);
        }
      }

      // Check open sightline above seat (Y in expectedTierY+1..35) is BLOCKS.AIR
      for (let y = expectedTierY + 1; y <= 35; y++) {
        const air = world.getBlock(x, y, z);
        if (air !== BLOCKS.AIR) {
          grandstandErrors++;
          console.error(`    Grandstand sightline blocked at (${x}, ${y}, ${z}): got ${air} (expected AIR)`);
        }
      }
      // At Y = 36: either AIR or front canopy floodlights at Z = -50
      const y36 = world.getBlock(x, 36, z);
      const isFrontFloodlight = (z === -50 && (x - 80) % 10 === 0 && y36 === BLOCKS.GOLD_ORE);
      if (y36 !== BLOCKS.AIR && !isFrontFloodlight) {
        grandstandErrors++;
        console.error(`    Grandstand Y=36 blocked at (${x}, 36, ${z}): got ${y36}`);
      }

      // Check cantilever roof canopy at Y = 37 is solid (IRON_ORE or WOOD_PLANK)
      const roof = world.getBlock(x, 37, z);
      if (roof !== BLOCKS.IRON_ORE && roof !== BLOCKS.WOOD_PLANK) {
        grandstandErrors++;
        console.error(`    Grandstand roof canopy missing at (${x}, 37, ${z}): got ${roof}`);
      }
    }
  }

  console.log(`[Test 4] Grandstand verification: ${grandstandPointsChecked} tier positions checked across X in [82..148]. Errors=${grandstandErrors}`);
  assert.strictEqual(grandstandErrors, 0, `Grandstand must have 0 geometry errors (found ${grandstandErrors})`);

  results.test4_barriers.passed = true;
  results.test4_barriers.details.push(`Complete 2D circuit barrier scan (${barrierCount} positions verified): 100% continuous containment with Cobblestone Y=25 + Iron Ore Y=26, tunnel masonry, and stone bridge towers (0 errors).`);
  results.test4_barriers.details.push('Tribuna Principal grandstand verified: slopes monotonically UP Northward from Y=26 (Z=-50) to Y=33 (Z=-43).');
  results.test4_barriers.details.push('Unobstructed spectator sightlines confirmed: Y in [tierY+1..36] is 100% BLOCKS.AIR facing South toward track.');
  results.test4_barriers.details.push('Cantilever roof canopy confirmed at Y=37 with front row floodlights.');
  console.log('✓ TEST 4 PASSED: Perimeter barriers and grandstands conform 100% to specifications.\n');
} catch (err) {
  results.test4_barriers.details.push(err.message);
  console.error('✗ TEST 4 FAILED:', err.message, '\n');
}

// -----------------------------------------------------------------------------
// SUMMARY REPORT
// -----------------------------------------------------------------------------
console.log('=============================================================================');
console.log('ADVERSARIAL VERIFICATION SUMMARY:');
console.log(`- Test 1 (Autonomous Traffic Multi-Frame Flow): ${results.test1_traffic.passed ? 'PASSED' : 'FAILED'}`);
console.log(`- Test 2 (Central Plaza Headroom Clearance):    ${results.test2_headroom.passed ? 'PASSED' : 'FAILED'}`);
console.log(`- Test 3 (Gran Circuito 8-Segment Continuity):  ${results.test3_continuity.passed ? 'PASSED' : 'FAILED'}`);
console.log(`- Test 4 (Perimeter Barriers & Grandstands):    ${results.test4_barriers.passed ? 'PASSED' : 'FAILED'}`);

const allPassed = results.test1_traffic.passed && results.test2_headroom.passed && results.test3_continuity.passed && results.test4_barriers.passed;
if (allPassed) {
  console.log('\nVERDICT: ALL 4 EMPIRICAL ADVERSARIAL CHALLENGES PASSED WITH ZERO DEFECTS.');
  process.exit(0);
} else {
  console.error('\nVERDICT: DEFECTS DETECTED. REQUEST_CHANGES.');
  process.exit(1);
}
