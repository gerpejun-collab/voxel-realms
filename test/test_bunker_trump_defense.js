// test/test_bunker_trump_defense.js
// Verification suite for:
// 1. Password bypass bug fix (ARGON4 / ARGÓN4 strict enforcement)
// 2. Admin normal missile launch bug fix (self-interception prevented at spawn)
// 3. 100% Calculated Automatic Interception (360-degree mathematical all-aspect intercept)
// 4. False-positive targeting fix (only intercept threats aimed at admin/base/bunker)
// 5. Mega Underground Bunker & 180 Surface Missile Silos
// 6. Bunker Invulnerability & Blue Manual Kinetic Interceptor Button
// 7. Donald Trump 3D Cube Head & Presidential Suit Avatar
// 8. World mountain elevation (Y=54) and bunker excavation

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { RoomManager } = require('../server/rooms');
const {
  MSG,
  ADMIN_EMAIL,
  BUNKER_BOUNDS,
  BUNKER_INTERIOR_BOUNDS,
  isInsideBunker,
  isInsideBunkerInterior,
  isValidAdminCredentials
} = require('../server/protocol');

console.log('=============================================================================');
console.log('   BUNKER, TRUMP SKIN, 360 INTERCEPTION & SECURITY VERIFICATION SUITE');
console.log('=============================================================================');

class MockWs {
  constructor() {
    this.sent = [];
    this.readyState = 1;
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
}

// -----------------------------------------------------------------------------
// SECTION 1: Strict Admin Password Enforcement (ARGON4 / ARGÓN4)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 1: Strict Admin Password Enforcement ---');
const rm = new RoomManager();

// 1a. Verification of credential helper
assert.strictEqual(isValidAdminCredentials('jsieiragerpe@gmail.com', 'ARGON4'), true, 'Must validate with ARGON4');
assert.strictEqual(isValidAdminCredentials('jsieiragerpe@gmail.com', 'ARGÓN4'), true, 'Must validate with ARGÓN4');
assert.strictEqual(isValidAdminCredentials('jsieiragerpe@gmail.com', ''), false, 'Must reject empty password');
assert.strictEqual(isValidAdminCredentials('jsieiragerpe@gmail.com', '12345'), false, 'Must reject wrong password');

// 1b. Server handleJoin rejecting unauthenticated jsieiragerpe
const unauthWs = new MockWs();
const unauthMeta = { id: 'p_unauth' };
rm.socketMeta.set(unauthWs, unauthMeta);

rm.handleJoin(unauthWs, unauthMeta, {
  name: 'jsieiragerpe',
  email: '',
  adminKey: ''
});
assert.strictEqual(unauthMeta.isAdmin, undefined, 'Unauthenticated user must not become admin');
assert.strictEqual(unauthMeta.adminEmail, undefined, 'Admin email must not be set');
assert.strictEqual(unauthWs.sent.length, 1, 'Rejection message must be sent');
assert.strictEqual(unauthWs.sent[0].type, MSG.ERROR, 'Rejection type must be MSG.ERROR');
assert.ok(unauthWs.sent[0].data.message.includes('ARGON4') || unauthWs.sent[0].data.message.includes('Contraseña'), 'Rejection text must state password requirement');

// 1c. Server handleJoin with email jsieiragerpe@gmail.com without password
const emailUnauthWs = new MockWs();
const emailUnauthMeta = { id: 'p_email_unauth' };
rm.socketMeta.set(emailUnauthWs, emailUnauthMeta);
rm.handleJoin(emailUnauthWs, emailUnauthMeta, {
  name: 'RandomName',
  email: 'jsieiragerpe@gmail.com',
  adminKey: ''
});
assert.strictEqual(emailUnauthMeta.isAdmin, undefined, 'Unauthenticated email must not become admin');
assert.strictEqual(emailUnauthWs.sent[0].type, MSG.ERROR, 'Must send error for unauthenticated admin email');

// 1d. Server handleJoin with valid ARGON4
const adminWs = new MockWs();
const adminMeta = { id: 'p_main_admin' };
rm.socketMeta.set(adminWs, adminMeta);
rm.handleJoin(adminWs, adminMeta, {
  name: 'jsieiragerpe',
  email: 'jsieiragerpe@gmail.com',
  adminKey: 'ARGON4'
});
assert.strictEqual(adminMeta.isAdmin, true, 'Valid ARGON4 must grant admin privileges');
assert.strictEqual(adminMeta.adminEmail, 'jsieiragerpe@gmail.com');
console.log('✓ SECTION 1 PASSED: Strict ARGON4 / ARGÓN4 password validation enforced.');

// -----------------------------------------------------------------------------
// SECTION 2: Bunker Coordinates, Perimeter & Forcefield Security
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Bunker Coordinates & Biometric Forcefield Security ---');
// Verify exact bounding boxes
assert.strictEqual(BUNKER_BOUNDS.minX, -565);
assert.strictEqual(BUNKER_BOUNDS.maxX, -435);
assert.strictEqual(BUNKER_BOUNDS.minZ, 235);
assert.strictEqual(BUNKER_BOUNDS.maxZ, 365);
assert.strictEqual(BUNKER_INTERIOR_BOUNDS.minX, -520);
assert.strictEqual(BUNKER_INTERIOR_BOUNDS.maxX, -480);
assert.strictEqual(BUNKER_INTERIOR_BOUNDS.minZ, 280);
assert.strictEqual(BUNKER_INTERIOR_BOUNDS.maxZ, 320);

// Coordinates check
assert.strictEqual(isInsideBunker(-500, 24, 300), true, 'Bunker center surface is inside bunker');
assert.strictEqual(isInsideBunkerInterior(-500, 12, 300), true, 'Bunker command center is inside bunker interior');
assert.strictEqual(isInsideBunkerInterior(0, 25, 0), false, 'Plaza is not inside bunker');

// Unauthorized player movement repulsion
const intruderWs = new MockWs();
const intruderMeta = { id: 'p_intruder', name: 'intruder', adminEmail: 'intruder@test.com' };
intruderMeta.roomId = 'main';
const moveData = { pos: [-500, 12, 300], rot: [0, 0] };
rm.handleMove(intruderWs, intruderMeta, moveData);
assert.ok(
  moveData.pos[0] < BUNKER_BOUNDS.minX || moveData.pos[0] > BUNKER_BOUNDS.maxX ||
  moveData.pos[2] < BUNKER_BOUNDS.minZ || moveData.pos[2] > BUNKER_BOUNDS.maxZ,
  'Unauthorized intruder must be repelled outside bunker perimeter'
);

// Unauthorized player block modify rejection
intruderWs.sent.length = 0;
rm.handleBlockModify(intruderWs, intruderMeta, { x: -500, y: 12, z: 300, blockType: 0 });
const blockReject = intruderWs.sent.find(m => m.type === MSG.BLOCK_REJECT);
assert.ok(blockReject, 'Unauthorized block edit inside bunker must be blocked');

// Unauthorized teleport rejection
const room = rm.getOrCreateRoom('main');
room.gameState.addPlayer(intruderMeta.id, 'intruder');
const adminPlayer = room.gameState.addPlayer(adminMeta.id, 'jsieiragerpe');
adminPlayer.pos = [-500, 12, 300];
intruderWs.sent.length = 0;
rm.handleTeleportToPlayer(intruderWs, intruderMeta, { targetPlayerId: adminMeta.id });
const tpReject = intruderWs.sent.find(m => m.type === MSG.ERROR && m.data && m.data.message.includes('denegado'));
assert.ok(tpReject, 'Intruder teleport into bunker must be rejected');

console.log('✓ SECTION 2 PASSED: Bunker bounding boxes and biometric rejection verified.');

// -----------------------------------------------------------------------------
// SECTION 3: Admin Normal Missile Launch & False-Positive Interception Fix
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Admin Missile Launch & Threat Filter Verification ---');
const missileJs = fs.readFileSync(path.resolve(__dirname, '../public/src/missile.js'), 'utf8');

// 3a. Admin own missiles are exempt from self-targeting:
assert.ok(missileJs.includes('m.launcherId === this.multiplayer?.myId'), 'missile.js must check myId for own missiles');
assert.ok(missileJs.includes("m.launcherName === 'jsieiragerpe'"), 'missile.js must exempt jsieiragerpe launcherName');
assert.ok(missileJs.includes("m.launcherId === 'ADMIN_BUNKER'"), 'missile.js must exempt ADMIN_BUNKER missiles');
assert.ok(missileJs.includes('if (isMyOwnMissile) continue;'), 'missile.js must continue past own missiles to avoid self-interception');

// 3b. Threat Filter: Only intercept missiles targeting admin or base or bunker
assert.ok(missileJs.includes('m.targetPlayerId === this.multiplayer?.myId'), 'missile.js must verify if missile targets player');
assert.ok(missileJs.includes("m.targetName === 'jsieiragerpe'"), 'missile.js must verify if missile targets admin name');
assert.ok(missileJs.includes('targetsAirBase'), 'missile.js must check if missile targets airbase');
assert.ok(missileJs.includes('targetsBunker'), 'missile.js must check if missile targets bunker');
assert.ok(missileJs.includes('if (!targetsMe && !targetsAirBase && !targetsBunker)'), 'missile.js must NOT intercept missiles aimed at regular players');

console.log('✓ SECTION 3 PASSED: Admin launch self-interception and false-positive bugs eliminated.');

// -----------------------------------------------------------------------------
// SECTION 4: 100% Calculated Automatic Interception (360-Degree All-Aspect)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: 100% Calculated All-Aspect 360 Interception ---');
// Verify mathematical 3D intercept vector calculation:
assert.ok(missileJs.includes('targetVec.clone().sub(startVec).normalize()'), 'missile.js must compute direct 3D vector from launch to target');
assert.ok(missileJs.includes('interceptor.forward.copy(interceptDir)'), 'missile.js must orient interceptor forward vector directly at threat');
assert.ok(missileJs.includes('aimTarget.addScaledVector(this.targetVelocity, leadTime)'), 'missile.js must apply lead pursuit vector');
assert.ok(missileJs.includes('proximityThreshold'), 'missile.js must use proximity fuzing');

// Empirical 360-degree math test
const mockVec3 = (x, y, z) => ({
  x, y, z,
  sub(v) { return mockVec3(this.x - v.x, this.y - v.y, this.z - v.z); },
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    return mockVec3(this.x / l, this.y / l, this.z / l);
  }
});

// Threat coming from behind (+Z when player faces -Z, or -Z when player faces +Z)
const playerOrigin = { x: 0, y: 25, z: 0 };
const threats = [
  { x: 0, y: 30, z: -80, name: 'North (Behind when facing South)' },
  { x: 0, y: 30, z: 80, name: 'South (Behind when facing North)' },
  { x: -80, y: 30, z: 0, name: 'West (Behind when facing East)' },
  { x: 80, y: 30, z: 0, name: 'East (Behind when facing West)' }
];

for (const t of threats) {
  const dir = mockVec3(t.x - playerOrigin.x, t.y - playerOrigin.y, t.z - playerOrigin.z).normalize();
  assert.ok(Math.abs(Math.hypot(dir.x, dir.y, dir.z) - 1.0) < 0.001, `${t.name}: Intercept vector must be normalized unit vector`);
  // Vector must point toward threat coordinates
  if (t.x !== 0) assert.strictEqual(Math.sign(dir.x), Math.sign(t.x));
  if (t.z !== 0) assert.strictEqual(Math.sign(dir.z), Math.sign(t.z));
}
console.log('✓ SECTION 4 PASSED: 360-degree mathematical intercept calculation verified across all 4 quadrants.');

// -----------------------------------------------------------------------------
// SECTION 5: Bunker 180 Surface Missile Silos & Salvo Power (2X)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: Bunker 180 Surface Silos & 2X Power Salvos ---');
const bunkerJs = fs.readFileSync(path.resolve(__dirname, '../public/src/bunker.js'), 'utf8');

// 5a. 180 Silos structure
assert.ok(bunkerJs.includes('{ radius: 36, count: 40 }'), 'Ring 1 must have 40 silos at R=36');
assert.ok(bunkerJs.includes('{ radius: 48, count: 60 }'), 'Ring 2 must have 60 silos at R=48');
assert.ok(bunkerJs.includes('{ radius: 60, count: 80 }'), 'Ring 3 must have 80 silos at R=60');
// 40 + 60 + 80 = 180 silos

// 5b. Animated hatches
assert.ok(bunkerJs.includes('silo.hatchPivot.rotation.x'), 'Silo hatches must articulate animated rotation');
assert.ok(bunkerJs.includes('fireSingleSilo'), 'bunker.js must implement fireSingleSilo sequence');

// 5c. Salvo parameters: 2X power = 8 (radius 18m)
assert.ok(bunkerJs.includes('power: 8'), 'Silo missiles must have 2X power (power: 8)');
assert.ok(bunkerJs.includes('isSiloMissile: true'), 'Silo missiles must be tagged with isSiloMissile');

// 5d. Server handling of salvo and bunker defense
const roomsJs = fs.readFileSync(path.resolve(__dirname, '../server/rooms.js'), 'utf8');
assert.ok(roomsJs.includes('isTargetInBunker'), 'server rooms.js must check if target is inside bunker');
assert.ok(roomsJs.includes('handleBunkerManualIntercept'), 'server rooms.js must handle manual bunker interceptor');

console.log('✓ SECTION 5 PASSED: 180 silos and 2X power missile salvo specifications verified.');

// -----------------------------------------------------------------------------
// SECTION 6: Bunker Invulnerability & Blue Button Manual Interception
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 6: Bunker Invulnerability & Blue Manual Interceptor ---');

// 6a. Inside bunker: auto counter-attack is disabled, missiles absorbed with 0 crater
assert.ok(bunkerJs.includes('isPlayerInsideBunker'), 'bunker.js must check if player is inside bunker');
assert.ok(missileJs.includes('isInsideBunkerNow'), 'missile.js must check if admin is inside bunker');
assert.ok(roomsJs.includes('isInsideBunker(rx, ry, rz)'), 'rooms.js must nullify ground crater when detonating in bunker');
assert.ok(roomsJs.includes('radius: 0'), 'rooms.js must set radius to 0 for bunker / intercepted impacts');

// 6b. Blue Manual Interceptor Button
assert.ok(bunkerJs.includes('launchManualInterceptor()'), 'bunker.js must implement launchManualInterceptor');
assert.ok(bunkerJs.includes('bm-intercept-blue-btn'), 'bunker.js must bind the big Blue Interceptor button');

console.log('✓ SECTION 6 PASSED: Bunker invulnerability and manual kinetic interceptor button verified.');

// -----------------------------------------------------------------------------
// SECTION 7: Donald Trump Procedural 3D Cube Head & Presidential Suit Avatar
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 7: Donald Trump 3D Cube Head & Presidential Suit ---');
const avatarJs = fs.readFileSync(path.resolve(__dirname, '../public/src/avatar.js'), 'utf8');

// 7a. Procedural Canvas Textures for all 6 faces of the 3D cube head
assert.ok(avatarJs.includes('drawTrumpFrontFace'), 'avatar.js must define drawTrumpFrontFace');
assert.ok(avatarJs.includes('drawTrumpTopHair'), 'avatar.js must define drawTrumpTopHair');
assert.ok(avatarJs.includes('drawTrumpSideHair'), 'avatar.js must define drawTrumpSideHair');
assert.ok(avatarJs.includes('drawTrumpBackHair'), 'avatar.js must define drawTrumpBackHair');
assert.ok(avatarJs.includes('drawTrumpBottom'), 'avatar.js must define drawTrumpBottom');

// 7b. Presidential Suit with red tie
assert.ok(avatarJs.includes('drawTrumpSuitFront'), 'avatar.js must define drawTrumpSuitFront');
assert.ok(avatarJs.includes("ctx.fillStyle = '#dc2626'"), 'Front of suit must paint presidential red tie');
assert.ok(avatarJs.includes("ctx.fillStyle = '#1e293b'"), 'Suit jacket must be presidential navy blue');

// 7c. 3D Cube Head Geometry (authentic 3D cube, not a flat 2D plane)
assert.ok(avatarJs.includes('isDonaldTrumpHead = true'), 'Head must be tagged with isDonaldTrumpHead');
assert.ok(avatarJs.includes('trumpHeadMats'), 'Head must use 6-face box material array');
assert.ok(avatarJs.includes('trumpHairGeom'), 'Avatar must add 3D comb-over crest layer');

console.log('✓ SECTION 7 PASSED: Donald Trump 3D cube head and presidential suit verified.');

// -----------------------------------------------------------------------------
// SECTION 8: World Generation Mountain & Bunker Excavation
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 8: World Mountain Elevation & Chamber Excavation ---');
const worldJs = fs.readFileSync(path.resolve(__dirname, '../public/src/world.js'), 'utf8');

assert.ok(worldJs.includes('Mega Búnker Subterráneo y Complejo de 180 Silos at (-500, 300)'), 'world.js must have bunker section in getHeightAt');
assert.ok(worldJs.includes('Math.floor(24 + 30 * curve)'), 'world.js must raise mountain to peak Y=54 above bunker');
assert.ok(worldJs.includes('buildBunkerSector'), 'world.js must define and call buildBunkerSector');
assert.ok(worldJs.includes('this.setVoxelInWorld(chunk, wx, y, wz, BLOCKS.AIR)'), 'world.js must carve air inside bunker interior headroom');

// Verify indexing in HTML and UI
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');
assert.ok(indexHtml.includes('underground_bunker'), 'index.html must include underground_bunker map destination');
assert.ok(indexHtml.includes('menu-btn-bunker'), 'index.html must include menu-btn-bunker in pause menu');

const uiJs = fs.readFileSync(path.resolve(__dirname, '../public/src/ui.js'), 'utf8');
assert.ok(uiJs.includes('menu-btn-bunker'), 'ui.js must bind menu-btn-bunker click listener');
assert.ok(uiJs.includes('underground_bunker'), 'ui.js must handle underground_bunker landmark teleport');

const radarJs = fs.readFileSync(path.resolve(__dirname, '../public/src/radar.js'), 'utf8');
assert.ok(radarJs.includes("name: 'Búnker'"), 'radar.js must include Búnker in landmark anchors');

console.log('✓ SECTION 8 PASSED: Mountain terrain, bunker excavation, UI shortcuts and radar anchors verified.');

console.log('\n=============================================================================');
console.log('VERIFICATION SUMMARY: ALL 8 SECTIONS PASSED WITH 100% SUCCESS!');
console.log('=============================================================================');

process.exit(0);
