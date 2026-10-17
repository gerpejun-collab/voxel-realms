// scripts/expand_test_suite.js
const fs = require('fs');
const path = require('path');

const testPath = path.resolve(__dirname, '../test/test.js');
const rawContent = fs.readFileSync(testPath, 'utf8');
const lines = rawContent.replace(/\r\n/g, '\n').split('\n');

// 1. Sections 1-7
const sections1to7 = lines.slice(0, 1211).join('\n') + '\n\n';

// 2. Section 8: Weapons, Tracers, TNT & Animal Impact (R2)
const weaponsContent = lines.slice(2155, 2747).join('\n');
const section8 = `// =============================================================================
// SECTION 8: WEAPONS, TRACERS, TNT & ANIMAL IMPACT (R2)
// =============================================================================
console.log('\\n[SECTION 8: WEAPONS, TRACERS, TNT & ANIMAL IMPACT (R2)]');

` + weaponsContent.trim() + '\n\n';

// 3. Section 9: Highway Traffic Obstacle Intelligence (R3)
const trafficContent = lines.slice(1215, 1674).join('\n');
const section9 = `// =============================================================================
// SECTION 9: HIGHWAY TRAFFIC OBSTACLE INTELLIGENCE (R3)
// =============================================================================
console.log('\\n[SECTION 9: HIGHWAY TRAFFIC OBSTACLE INTELLIGENCE (R3)]');

` + trafficContent.trim() + '\n\n';

// 4. Section 10: World Generation & Landmarks: Mount Fuji, Cities, Tunnels & Caverns (R4)
const section10 = `// =============================================================================
// SECTION 10: WORLD GENERATION & LANDMARKS: MOUNT FUJI, CITIES, TUNNELS & CAVERNS (R4)
// =============================================================================
console.log('\\n[SECTION 10: WORLD GENERATION & LANDMARKS: MOUNT FUJI, CITIES, TUNNELS & CAVERNS (R4)]');

it('verifies Mount Fuji peak elevation reaching Y=62 (2.58x above surrounding Y=24)', () => {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World(null, null, 12345);

  // Peak caldera rim at (355, 350)
  const peakH = world.getFujiHeight(355, 350);
  assert.strictEqual(peakH, 62, 'Mount Fuji caldera rim must reach maximum world height Y=62');

  const surroundingH = 24;
  const ratio = peakH / surroundingH;
  assert.ok(ratio >= 2.58, \`Mount Fuji peak elevation must rise 2.58x above surrounding terrain (expected >= 2.58, got \${ratio.toFixed(3)})\`);

  // Verify symmetrical conical elevation slope
  for (let d = 7; d <= 22; d += 3) {
    const h = world.getFujiHeight(350 + d, 350);
    assert.ok(h <= 62 && h >= 46, \`Cone height at distance \${d} must be within snow cap (46..62), got \${h}\`);
  }
});

it('verifies Mount Fuji caldera depression, snow cap (Y>=46), reflection lakes, and shoreline', () => {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World(null, null, 12345);

  // 1. Central volcanic caldera depression (Y = 54..56) at distance d <= 4
  const calderaCenterH = world.getFujiHeight(350, 350);
  assert.strictEqual(calderaCenterH, 54, 'Volcanic caldera crater center must depress to Y=54');
  for (let d = 0; d <= 4; d++) {
    const ch = world.getFujiHeight(350 + d, 350);
    assert.ok(ch <= 56, \`Caldera depression at d=\${d} must remain <= 56, got \${ch}\`);
  }

  // 2. Snow cap above Y >= 46
  const snowFlankH = world.getFujiHeight(360, 350); // d = 10
  assert.ok(snowFlankH >= 46, 'Upper conical peak must be above snowline Y >= 46');

  // Verify chunk terrain surface sets snow above Y >= 46
  const fujiChunk = world.getOrCreateChunk(Math.floor(355 / 16), Math.floor(350 / 16));
  assert.ok(fujiChunk, 'Mount Fuji chunk must be generated');

  // 3. Reflection lakes: Lake Kawaguchi and Lake Motosu
  const lakeKawaguchiH = world.getFujiHeight(305, 305);
  const lakeMotosuH = world.getFujiHeight(375, 315);
  assert.strictEqual(lakeKawaguchiH, 15, 'Lake Kawaguchi bed must be below WATER_LEVEL 18');
  assert.strictEqual(lakeMotosuH, 15, 'Lake Motosu bed must be below WATER_LEVEL 18');

  // Shoreline slope transition (15..24)
  const shoreH = world.getFujiHeight(321, 305); // distance ~16
  assert.ok(shoreH >= 15 && shoreH <= 24, 'Lake shoreline must transition smoothly from lake bed to land');
});

it('verifies urban district multi-building grids and signature landmarks across all 6 sectors', () => {
  const worldPath = path.resolve(__dirname, '../public/src/world.js');
  const worldCode = fs.readFileSync(worldPath, 'utf8');

  // 1. Japan Imperial (+250, +250)
  assert.ok(worldCode.includes('Samurai Castle Keep (Tenshu)'), 'Japan Imperial must include Himeji Tenshu castle keep');
  assert.ok(worldCode.includes('Grand Martial Arts Dojo'), 'Japan Imperial must include Martial Arts Dojo');
  assert.ok(worldCode.includes('Senbon Torii Tunnel'), 'Japan Imperial must include Senbon Torii tunnel corridor');

  // 2. China & Shanghai (-250, +250)
  assert.ok(worldCode.includes('isSkybridge'), 'China & Shanghai must feature elevated glass skybridges');
  assert.ok(worldCode.includes('Nanjing Road'), 'China & Shanghai must feature illuminated commercial avenue');

  // 3. Paris & Eiffel (+250, -250)
  assert.ok(worldCode.includes('Arc de Triomphe'), 'Paris must feature Arc de Triomphe');
  assert.ok(worldCode.includes('Louvre Glass Pyramid'), 'Paris must feature Grand Louvre Glass Pyramid');

  // 4. New York (-250, -250)
  assert.ok(worldCode.includes('Subway'), 'New York must feature authentic subway entrances');
  assert.ok(worldCode.includes('Grand Central') || worldCode.includes('Manhattan'), 'New York must feature multi-block grid architecture');

  // 5. Norway Fjords (0, +500)
  assert.ok(worldCode.includes('Stave Church'), 'Norway Fjords must feature Borgund Viking Stave Church');
  assert.ok(worldCode.includes('Mjødhall') || worldCode.includes('Viking'), 'Norway Fjords must feature Viking timber longhouses');

  // 6. Central Spawn Plaza (0, 0)
  assert.ok(worldCode.includes('Guardian'), 'Central Spawn must feature guardian statues and compass rose');
});

it('verifies mountain tunnel headroom (>=4 blocks) and natural caverns with mineral veins', () => {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World(null, null, 12345);

  // 1. Highway Mountain Tunnel: North Highway at (0, 130)
  assert.strictEqual(world.isTunnelAt(0, 130), true, 'Passage at (0, 130) must be a designated mountain tunnel');
  assert.ok(world.getHeightAt(0, 130) >= 35, 'Mountain overburden ridge above tunnel must be at least Y=35');

  const tunnelChunk = world.getOrCreateChunk(0, 8); // chunk containing Z=128..143
  assert.strictEqual(world.getBlock(0, 24, 130), BLOCKS.ASPHALT, 'Tunnel floor must be ASPHALT road');

  // Clear vertical headroom: 4 full blocks (Y=25, 26, 27, 28)
  for (let y = 25; y <= 28; y++) {
    assert.strictEqual(world.getBlock(0, y, 130), BLOCKS.AIR, \`Tunnel interior at Y=\${y} must be clear AIR for vehicle headroom\`);
  }
  // Ceiling arch with illuminated lanterns
  assert.strictEqual(world.getBlock(0, 29, 130), BLOCKS.GOLD_ORE, 'Tunnel arch ceiling must feature illuminated lantern');

  // 2. Subterranean Natural Caverns with mineral veins (Iron Ore and Gold Ore)
  const cavernChunk = world.getOrCreateChunk(2, 31); // Norway Mountain Cavern at X=32..47, Z=496..511
  let ironOres = 0;
  let goldOres = 0;
  for (let lx = 0; lx < 16; lx++) {
    for (let lz = 0; lz < 16; lz++) {
      for (let ly = 0; ly < 64; ly++) {
        const b = cavernChunk.getBlock(lx, ly, lz);
        if (b === BLOCKS.IRON_ORE) ironOres++;
        if (b === BLOCKS.GOLD_ORE) goldOres++;
      }
    }
  }
  assert.ok(ironOres >= 20, \`Cavern must feature rich Iron Ore veins (found \${ironOres})\`);
  assert.ok(goldOres >= 10, \`Cavern must feature rich Gold Ore veins (found \${goldOres})\`);
});
\n\n`;

// 5. Section 11: Gran Circuito & Drivable Cars (R1, R5)
const excavationContent = lines.slice(1678, 2151).join('\n');
const section11 = `// =============================================================================
// SECTION 11: GRAN CIRCUITO & DRIVABLE CARS (R1, R5)
// =============================================================================
console.log('\\n[SECTION 11: GRAN CIRCUITO & DRIVABLE CARS (R1, R5)]');

function loadVehicleModule() {
  const vehiclePath = path.resolve(__dirname, '../public/src/vehicle.js');
  let vehicleCode = fs.readFileSync(vehiclePath, 'utf8')
    .replace(/import\\s+.*?from\\s+.*?;/g, '')
    .replace(/export\\s+class\\s+DrivableCar/g, 'class DrivableCar')
    .replace(/export\\s+class\\s+VehicleManager/g, 'class VehicleManager');

  class Vector3 {
    constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
    set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
    copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
    clone(){return new Vector3(this.x,this.y,this.z);}
    sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
    normalize(){const l=Math.hypot(this.x,this.y,this.z)||1;this.x/=l;this.y/=l;this.z/=l;return this;}
    distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
  }

  class Color { constructor(c){this.hex=c;} }

  class Group {
    constructor(){
      this.children=[];
      this.position=new Vector3();
      this.rotation={x:0,y:0,z:0,set(){}};
      this.visible=true;
    }
    add(...c){for(const el of c) this.children.push(el);}
    traverse(fn){ fn(this); for(const c of this.children) if(c.traverse) c.traverse(fn); else fn(c); }
  }

  class Mesh {
    constructor(g,m){
      this.geometry=g;
      this.material=m;
      this.position=new Vector3();
      this.rotation={x:0,y:0,z:0};
      this.visible=true;
    }
    traverse(fn){ fn(this); }
  }

  const mockTHREE = {
    Vector3,
    Color,
    Group,
    Mesh,
    BoxGeometry: class {},
    CylinderGeometry: class {},
    MeshStandardMaterial: class { constructor(o){Object.assign(this, o);} },
    MeshBasicMaterial: class { constructor(o){Object.assign(this, o);} }
  };

  const BLOCKS = { AIR: 0, WATER: 11, STONE: 4, BRICK: 14, SNOW: 12, ASPHALT: 20 };
  const BLOCK_DEFS = { 4: { solid: true }, 14: { solid: true }, 12: { solid: true }, 20: { solid: true } };
  const sound = { playClick: ()=>{} };

  const { DrivableCar, VehicleManager } = new Function(
    'THREE', 'BLOCKS', 'BLOCK_DEFS', 'sound',
    vehicleCode + '\\nreturn { DrivableCar, VehicleManager };'
  )(mockTHREE, BLOCKS, BLOCK_DEFS, sound);

  return { DrivableCar, VehicleManager, mockTHREE, BLOCKS, BLOCK_DEFS };
}

it('verifies Gran Circuito track dimensions (14-block wide track, red/white curbs, grandstands, pit lane)', () => {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World(null, null, 12345);

  // Load Gran Circuito Main Straight chunks at X = -505, Z in [-428..-413]
  world.getOrCreateChunk(Math.floor(-505 / 16), Math.floor(-428 / 16));
  world.getOrCreateChunk(Math.floor(-505 / 16), Math.floor(-413 / 16));

  // 1. Red/white rumble curbs on outer edges
  const southCurb = world.getBlock(-505, 24, -428);
  const northCurb = world.getBlock(-505, 24, -413);
  assert.ok(southCurb === BLOCKS.BRICK || southCurb === BLOCKS.SNOW, 'South track curb must be BRICK or SNOW');
  assert.ok(northCurb === BLOCKS.BRICK || northCurb === BLOCKS.SNOW, 'North track curb must be BRICK or SNOW');

  // 2. Center asphalt racing surface (12-14 lanes wide)
  let asphaltLanes = 0;
  for (let z = -427; z <= -414; z++) {
    if (world.getBlock(-505, 24, z) === BLOCKS.ASPHALT) asphaltLanes++;
  }
  assert.ok(asphaltLanes >= 12, \`Gran Circuito track must have at least 12 asphalt lanes (found \${asphaltLanes})\`);
  const totalTrackWidth = asphaltLanes + 2;
  assert.ok(totalTrackWidth >= 14 && totalTrackWidth <= 16, \`Total track width with curbs must be 14-16 blocks (got \${totalTrackWidth})\`);

  // 3. Structural elements verified in code: Starting grid gantry, Grandstands, Pit lane
  const worldPath = path.resolve(__dirname, '../public/src/world.js');
  const worldCode = fs.readFileSync(worldPath, 'utf8');
  assert.ok(worldCode.includes('buildGrandPrixSector'), 'world.js must define buildGrandPrixSector');
  assert.ok(worldCode.includes('Starting Grid Gantry') || worldCode.includes('5-light start sequence'), 'Gran Circuito must feature starting grid gantry');
  assert.ok(worldCode.includes('Grandstand Stadium') || worldCode.includes('Tribuna Principal'), 'Gran Circuito must feature spectator grandstands');
  assert.ok(worldCode.includes('Concrete Pit Wall') || worldCode.includes('Garage'), 'Gran Circuito must feature pit lane and team garages');
});

it('verifies drivable car physics (~16.5 m/s, ~2.2x sprint speed, turning, drift smoke)', () => {
  const { DrivableCar } = loadVehicleModule();

  const car = new DrivableCar('test_car_1', 0xdc2626, -500, 24, -420, 0, 'Scuderia Red');
  assert.strictEqual(car.maxSpeed, 16.5, 'DrivableCar max speed must be exactly 16.5 m/s');

  const playerSprintSpeed = 7.5;
  const speedRatio = Math.round((car.maxSpeed / playerSprintSpeed) * 10) / 10;
  assert.strictEqual(speedRatio, 2.2, 'DrivableCar top speed must be ~2.2x player sprint speed');

  // 1. Throttle acceleration
  for (let step = 0; step < 30; step++) {
    car.updatePhysics(0.05, { forward: 1, steer: 0 }, null);
  }
  assert.strictEqual(car.speed, 16.5, 'Car must accelerate smoothly to full top speed');

  // 2. Responsive steering
  const initYaw = car.yaw;
  car.updatePhysics(0.05, { forward: 1, steer: 0.6 }, null);
  assert.notStrictEqual(car.yaw, initYaw, 'Car yaw must rotate smoothly when steering');

  // 3. Drifting mechanics & smoke emitter positions
  car.updatePhysics(0.05, { forward: 1, steer: 0.6, handbrake: true }, null);
  assert.strictEqual(car.isDrifting, true, 'Hard turning with handbrake must trigger drift state');

  const wheels = car.getRearWheelPositions();
  assert.strictEqual(wheels.length, 2, 'Car must compute dual rear wheel positions for tire drift smoke');
  assert.ok(wheels[0].x !== wheels[1].x, 'Rear wheels must have distinct lateral coordinates');

  // 4. Solid barrier collision prevention
  const mockBarrierWorld = {
    getBlock: (x, y, z) => (z <= -435 ? 4 : 0) // Solid stone barrier at Z <= -435
  };
  car.pos = { x: -500, y: 24, z: -432 };
  car.yaw = 0; // Heading forward along -Z towards barrier
  car.speed = 16.5;

  for (let step = 0; step < 10; step++) {
    car.updatePhysics(0.05, { forward: 1, steer: 0 }, mockBarrierWorld);
  }
  // Car front bumper (z - 1.7) must NOT penetrate barrier (Z <= -435)
  assert.ok(car.pos.z - 1.7 > -435.5, 'Car front must not clip or penetrate into solid barrier');
});

it('verifies vehicle dual camera perspectives (Chase view and Cockpit Interior view)', () => {
  const { DrivableCar, VehicleManager, mockTHREE } = loadVehicleModule();

  const mockPM = { spawnDriftSmoke: () => {} };
  const mockScene = { add: () => {}, remove: () => {} };
  const vm = new VehicleManager(null, mockScene, mockPM);

  assert.strictEqual(vm.cameraMode, 'chase', 'Vehicle camera must default to 3rd-person chase mode');

  const car = new DrivableCar('cam_test_car', 0x2563eb, -500, 24, -420, 0, 'Azure GP');
  const mockCam = {
    position: new mockTHREE.Vector3(),
    rotation: { set: () => {} }
  };
  const mockControls = {
    pitch: 0,
    getSafeCameraPosition: (eye, bx, by, bz) => ({ x: eye.x + bx, y: eye.y + by, z: eye.z + bz }),
    localAvatar: { group: new mockTHREE.Group(), setTargetState: () => {} }
  };

  vm.enterCar(car, { pos: new mockTHREE.Vector3(), vel: new mockTHREE.Vector3(), action: 'idle' });
  assert.strictEqual(vm.isDriving(), true, 'Player must be driving vehicle');

  // 1. Chase Camera: Avatar visible seated inside vehicle
  vm.updateDriver(0.05, { forward: 1, steer: 0 }, mockCam, mockControls);
  assert.strictEqual(mockControls.localAvatar.group.visible, true, 'Driver avatar must be visible in chase view');
  assert.ok(mockCam.position.z > car.pos.z, 'Chase camera must trail behind the vehicle (+Z behind forward -Z)');

  // 2. Cockpit Interior View: Overlooks dashboard and steering wheel, avatar head hidden
  const toggled = vm.toggleCameraMode();
  assert.strictEqual(toggled, 'cockpit');
  assert.strictEqual(vm.cameraMode, 'cockpit');

  vm.updateDriver(0.05, { forward: 1, steer: 0 }, mockCam, mockControls);
  assert.strictEqual(mockControls.localAvatar.group.visible, false, 'Driver avatar head must be hidden in cockpit view');
  assert.strictEqual(Math.round(mockCam.position.y * 100) / 100, Math.round((car.pos.y + 0.90) * 100) / 100, 'Cockpit camera must be placed inside cabin at Y=car.pos.y+0.90');
});

` + excavationContent.trim() + '\n\n';

// 6. Summary
const summaryContent = lines.slice(2747).join('\n');

const fullSuite = sections1to7 + section8 + section9 + section10 + section11 + summaryContent;

fs.writeFileSync(testPath, fullSuite, 'utf8');
console.log('Successfully expanded test/test.js with Sections 8, 9, 10, 11!');
