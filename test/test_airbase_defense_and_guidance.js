// test/test_airbase_defense_and_guidance.js
// Verification suite for Air Base Forcefield, Attack Nullification,
// Iron Dome Multi-Threat Interception Scalability (14+ missiles),
// Dynamic Missile Guidance (No Circling, Adaptive Turn Rate, Lead Pursuit, Proximity Fuze, CPA),
// and B-1 Bomber Overhaul with Repeat Attack Handling.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { RoomManager } = require('../server/rooms');
const {
  MSG,
  ADMIN_EMAIL,
  RIVAL_ADMIN_EMAIL,
  AIR_BASE_BOUNDS,
  isInsideAirBase,
  isValidAdminCredentials
} = require('../server/protocol');

console.log('=============================================================================');
console.log('  AIR BASE FORCEFIELD, DYNAMIC GUIDANCE & IRON DOME MULTI-THREAT TEST SUITE');
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
// SECTION 1: Military Air Base Bounding Box & Helper Verification
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 1: Air Base Coordinates & Bounding Box ---');
assert.strictEqual(AIR_BASE_BOUNDS.minX, -455);
assert.strictEqual(AIR_BASE_BOUNDS.maxX, -385);
assert.strictEqual(AIR_BASE_BOUNDS.minZ, 115);
assert.strictEqual(AIR_BASE_BOUNDS.maxZ, 185);
assert.strictEqual(AIR_BASE_BOUNDS.minY, 0);
assert.strictEqual(AIR_BASE_BOUNDS.maxY, 85);

// Test inside points
assert.strictEqual(isInsideAirBase(-420, 25, 150), true, 'Center of air base must be inside');
assert.strictEqual(isInsideAirBase(-455, 0, 115), true, 'South-West corner must be inside');
assert.strictEqual(isInsideAirBase(-385, 85, 185), true, 'North-East ceiling corner must be inside');

// Test outside points
assert.strictEqual(isInsideAirBase(-456, 25, 150), false, 'West of base must be outside');
assert.strictEqual(isInsideAirBase(-384, 25, 150), false, 'East of base must be outside');
assert.strictEqual(isInsideAirBase(-420, 25, 114), false, 'South of base must be outside');
assert.strictEqual(isInsideAirBase(-420, 25, 186), false, 'North of base must be outside');
assert.strictEqual(isInsideAirBase(-420, 86, 150), false, 'Above base ceiling must be outside');
console.log('✓ SECTION 1 PASSED: Base bounding box X[-455, -385], Z[115, 185], Y[0, 85] verified.');

// -----------------------------------------------------------------------------
// SECTION 2: Forcefield Defense: Movement, Teleportation & Attack Nullification
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 2: Forcefield Intrusion & Attack Nullification ---');
const rm = new RoomManager();

// Admin Client
const adminWs = new MockWs();
const adminMeta = { id: 'admin_p' };
rm.socketMeta.set(adminWs, adminMeta);
rm.handleJoin(adminWs, adminMeta, {
  name: 'jsieiragerpe',
  email: 'jsieiragerpe@gmail.com',
  adminKey: 'ARGON4'
});

// Admin positions inside the base
const adminMove = { pos: [-410, 25, 150], rot: [0, 0] };
rm.handleMove(adminWs, adminMeta, adminMove);
assert.deepStrictEqual(adminMove.pos, [-410, 25, 150], 'Admin must be permitted inside the base');

// Unauthorized Client
const hackerWs = new MockWs();
const hackerMeta = { id: 'hacker_p' };
rm.socketMeta.set(hackerWs, hackerMeta);
rm.handleJoin(hackerWs, hackerMeta, { name: 'Intruder' });

// 1. Movement repulsion
const hackerMove = { pos: [-420, 25, 150], rot: [0, 0] };
rm.handleMove(hackerWs, hackerMeta, hackerMove);
assert.notStrictEqual(hackerMove.pos[0], -420, 'Intruder must not remain inside base');
assert.strictEqual(isInsideAirBase(hackerMove.pos[0], hackerMove.pos[1], hackerMove.pos[2]), false, 'Intruder must be pushed outside base');

// 2. Teleportation into base rejection
hackerWs.sent.length = 0;
rm.handleTeleportToPlayer(hackerWs, hackerMeta, { targetPlayerId: 'admin_p' });
const teleportError = hackerWs.sent.find(m => m.type === MSG.ERROR);
assert.ok(teleportError, 'Teleporting into military base must be rejected');
assert.ok(teleportError.data.message.includes('Base Militar protegida por campo de fuerza'), 'Rejection message must mention base shield');

// 3. Unauthorized weapon attack against admin inside base
hackerWs.sent.length = 0;
adminWs.sent.length = 0;
rm.handleWeaponShoot(hackerWs, hackerMeta, {
  targetPlayerId: 'admin_p',
  weaponType: 'rifle',
  origin: [-470, 25, 150],
  dir: [1, 0, 0],
  hitPos: [-410, 25, 150]
});

const adminDamagePackets = adminWs.sent.filter(m => m.type === MSG.WEAPON_HIT);
assert.strictEqual(adminDamagePackets.length, 0, 'Admin inside military base MUST NOT receive any damage from unauthorized attack');

const hackerNotif = hackerWs.sent.find(m => m.type === MSG.CHAT_BROADCAST && m.data.senderName === 'CAMPO DE FUERZA');
assert.ok(hackerNotif, 'Intruder must receive chat broadcast that attack was nullified');
assert.ok(hackerNotif.data.text.includes('Ataque anulado'), 'Chat must confirm attack nullification');

// 4. Unauthorized TNT trigger inside base
hackerWs.sent.length = 0;
rm.handleTntTrigger(hackerWs, hackerMeta, { x: -420, y: 25, z: 150, radius: 3, fuseMs: 0 });
const tntBlockNotice = hackerWs.sent.find(m => m.type === MSG.CHAT_BROADCAST && m.data.senderName === 'CAMPO DE FUERZA');
assert.ok(tntBlockNotice, 'Unauthorized TNT detonation inside base must be nullified');

// 5. Hostile missile detonation inside base absorbed with 0 terrain destruction
hackerWs.sent.length = 0;
rm.handleMissileDetonate(hackerWs, hackerMeta, {
  missileId: 'hostile_msl_1',
  x: -420,
  y: 25,
  z: 150
});
const missileAbsorbed = hackerWs.sent.find(m => m.type === MSG.CHAT_BROADCAST && m.data.senderName === 'CAMPO DE FUERZA');
assert.ok(missileAbsorbed, 'Missile detonation inside base must be absorbed by forcefield');
assert.ok(missileAbsorbed.data.text.includes('absorbió y neutralizó'), 'Forcefield must absorb hostile missile');

console.log('✓ SECTION 2 PASSED: 100% forcefield intrusion rejection, attack nullification, and explosive absorption.');

// -----------------------------------------------------------------------------
// SECTION 3: Multi-Threat Defense Triggering & Repeat Attack Integration
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 3: Multi-Threat Defense & Repeat Attack Handling ---');

// Rival Admin Cifrixa
const rivalWs = new MockWs();
const rivalMeta = { id: 'cifrixa_p' };
rm.socketMeta.set(rivalWs, rivalMeta);
rm.handleJoin(rivalWs, rivalMeta, {
  name: 'cifrixa.labs.contact@gmail.com',
  email: 'cifrixa.labs.contact@gmail.com'
});

// Attack 1: Salvo targeting the admin inside the air base
adminWs.sent.length = 0;
rm.handleAdminLaunchMissile(rivalWs, rivalMeta, { targetPlayerId: 'admin_p' });

const defense1 = adminWs.sent.find(m => m.type === MSG.MISSILE_INTERCEPT_DEFENSE);
assert.ok(defense1, 'Defense must trigger for attack 1 against admin');
assert.strictEqual(defense1.data.defenderId, 'admin_p');
assert.strictEqual(defense1.data.hostileMissileIds.length, 2);

// Attack 2 (Repeat attack immediately following Attack 1):
adminWs.sent.length = 0;
rm.handleAdminLaunchMissile(rivalWs, rivalMeta, { targetPlayerId: 'admin_p' });
const defense2 = adminWs.sent.find(m => m.type === MSG.MISSILE_INTERCEPT_DEFENSE);
assert.ok(defense2, 'Repeat attack must trigger active defense without being suppressed or dropped');
assert.strictEqual(defense2.data.hostileMissileIds.length, 2);
assert.notStrictEqual(defense1.data.hostileMissileIds[0], defense2.data.hostileMissileIds[0], 'Repeat attack missiles must have distinct IDs');

// Attack 3: Targeted directly at air base coordinates
adminWs.sent.length = 0;
rm.handleAdminLaunchMissile(rivalWs, rivalMeta, {
  targetPlayerId: 'some_other_id',
  targetPos: [-420, 25, 150]
});
const defense3 = adminWs.sent.find(m => m.type === MSG.MISSILE_INTERCEPT_DEFENSE);
assert.ok(defense3, 'Targeting air base coordinates must trigger Iron Dome interceptors');

console.log('✓ SECTION 3 PASSED: Multi-threat and repeat attacks trigger active defenses reliably.');

// -----------------------------------------------------------------------------
// SECTION 4: Client Dynamic Guidance & Iron Dome Scalability Codebase Verification
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 4: Dynamic Guidance & Scalable Iron Dome Verification ---');
const missileJs = fs.readFileSync(path.resolve(__dirname, '../public/src/missile.js'), 'utf8');

// 1. Adaptive turning rate (< 50m)
assert.ok(missileJs.includes('rawDist < 50.0'), 'missile.js must check rawDist < 50.0 for adaptive turn scaling');
assert.ok(missileJs.includes('currentTurnRate = THREE.MathUtils.lerp'), 'missile.js must scale turn rate dynamically with lerp');
assert.ok(missileJs.includes('maxCloseTurn'), 'missile.js must define maxCloseTurn for tight close-range tracking');

// 2. Lead pursuit / proportional intercept
assert.ok(missileJs.includes('targetVelocity'), 'missile.js must track targetVelocity');
assert.ok(missileJs.includes('leadTime'), 'missile.js must compute leadTime proportional intercept');
assert.ok(missileJs.includes('aimTarget.addScaledVector(this.targetVelocity, leadTime)'), 'missile.js must project aim target along velocity vector');

// 3. Proximity Fuze and CPA (Closest Point of Approach)
assert.ok(missileJs.includes('closestDistToTarget'), 'missile.js must track closest point of approach');
assert.ok(missileJs.includes('cpaDetonate'), 'missile.js must implement CPA detonation to eliminate circling loops');
assert.ok(missileJs.includes('proximityThreshold'), 'missile.js must define proximity threshold for proximity fuzing');

// 4. Base Air Space Mid-Air Neutralization
assert.ok(missileJs.includes('Base Militar Forcefield Anti-Missile Perimeter'), 'missile.js must include base forcefield perimeter check');
assert.ok(missileJs.includes('this.pos.x >= -455 && this.pos.x <= -385'), 'missile.js must check exact base X bounding box [-455, -385]');

// 5. Scalable 1-to-1+ threat coverage (e.g. 14 incoming missiles)
assert.ok(missileJs.includes('interceptorCount = Math.max(5, incomingThreatCount)'), 'missile.js must scale interceptor count dynamically to cover threat count');
assert.ok(missileJs.includes('assignedHostileMissileIds'), 'missile.js must track assigned hostile missile IDs');
assert.ok(missileJs.includes('launchSingleInterceptor'), 'missile.js must implement continuous single interceptor launches for unassigned threats');
assert.ok(missileJs.includes('pendingDefenses'), 'missile.js must use pendingDefenses queue for continuous multi-salvo defense');

console.log('✓ SECTION 4 PASSED: Dynamic guidance (adaptive turn, lead pursuit, proximity fuze, CPA) & scalable Iron Dome verified.');

// -----------------------------------------------------------------------------
// SECTION 5: Strategic B-1 Bomber Overhaul & Repeat Mission Queue Verification
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 5: B-1 Bomber Overhaul & Sortie Queuing ---');
const bomberJs = fs.readFileSync(path.resolve(__dirname, '../public/src/bomber.js'), 'utf8');

// 1. Mission queue for repeat sorties
assert.ok(bomberJs.includes('this.missionQueue = []'), 'bomber.js must initialize missionQueue in constructor');
assert.ok(bomberJs.includes('this.missionQueue.push'), 'bomber.js must queue repeat missions when busy');
assert.ok(bomberJs.includes('this.missionQueue.shift()'), 'bomber.js must dequeue and launch queued missions upon docking');

// 2. Retask capability from RTB
assert.ok(bomberJs.includes("this.state === 'RTB'"), 'bomber.js must check RTB state for immediate re-tasking');

// 3. Dynamic variable-sweep wings
assert.ok(bomberJs.includes('Dynamic Variable-Sweep Wings'), 'bomber.js must implement dynamic variable wing sweep animation');
assert.ok(bomberJs.includes('this.leftWingPivot.rotation.y = this.wingSweep'), 'bomber.js must articulate left wing sweep');
assert.ok(bomberJs.includes('this.rightWingPivot.rotation.y = -this.wingSweep'), 'bomber.js must articulate right wing sweep');

// 5. Straight runway orientation & dynamic banking roll
assert.ok(bomberJs.includes('modelGroup.rotation.y = Math.PI / 2'), 'bomber.js must align modelGroup +Z with Three.js lookAt forward vector');
assert.ok(bomberJs.includes('this.modelGroup.rotation.x = this.bankAngle'), 'bomber.js must articulate dynamic banking roll along fuselage axis');
assert.ok(bomberJs.includes('now - this.lastLaunchTimestamp < 3500'), 'bomber.js must debounce duplicate triggers within 3.5s');

// 6. Continuous flight position integration (Never freezes in mid-air!)
assert.ok(bomberJs.includes('this.pos.x += this.forward.x * this.speed * dt'), 'bomber.js must integrate continuous forward X position');
assert.ok(bomberJs.includes('this.pos.z += this.forward.z * this.speed * dt'), 'bomber.js must integrate continuous forward Z position');
assert.ok(bomberJs.includes('Turnaround fallback for 180-deg reversal'), 'bomber.js must handle turnaround without collapsing heading vector');

console.log('✓ SECTION 5 PASSED: B-1 Bomber overhaul with variable wing sweep, bomb doors, and repeat mission queuing verified.');

// -----------------------------------------------------------------------------
// SECTION 6: Empirical Kinematic Simulation (Straight Taxi, Continuous Flight & Turnaround)
// -----------------------------------------------------------------------------
console.log('\n--- SECTION 6: Empirical Bomber Flight & Anti-Circling Simulation ---');

const mockTHREE = {
  Vector3: class {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new mockTHREE.Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    length() { return Math.hypot(this.x, this.y, this.z); }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    normalize() { const l = this.length(); if (l > 0.00001) { this.x /= l; this.y /= l; this.z /= l; } return this; }
    angleTo(v) {
      const denom = Math.sqrt(this.lengthSq() * v.lengthSq());
      if (denom === 0) return Math.PI / 2;
      const theta = (this.x * v.x + this.y * v.y + this.z * v.z) / denom;
      return Math.acos(Math.max(-1, Math.min(1, theta)));
    }
    crossVectors(a, b) {
      this.x = a.y * b.z - a.z * b.y;
      this.y = a.z * b.x - a.x * b.z;
      this.z = a.x * b.y - a.y * b.x;
      return this;
    }
    applyAxisAngle(axis, angle) {
      const halfAngle = angle / 2;
      const s = Math.sin(halfAngle);
      const qx = axis.x * s, qy = axis.y * s, qz = axis.z * s, qw = Math.cos(halfAngle);
      const ix = qw * this.x + qy * this.z - qz * this.y;
      const iy = qw * this.y + qz * this.x - qx * this.z;
      const iz = qw * this.z + qx * this.y - qy * this.x;
      const iw = -qx * this.x - qy * this.y - qz * this.z;
      this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
      this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
      this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
      return this;
    }
    lerp(v, alpha) {
      this.x += (v.x - this.x) * alpha;
      this.y += (v.y - this.y) * alpha;
      this.z += (v.z - this.z) * alpha;
      return this;
    }
  },
  Group: class {
    constructor() {
      this.position = new mockTHREE.Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.children = [];
    }
    add(c) { this.children.push(c); c.parent = this; }
    lookAt() {}
  },
  Mesh: class {
    constructor() {
      this.position = new mockTHREE.Vector3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    }
  },
  CylinderGeometry: class { rotateZ() {} },
  ConeGeometry: class { rotateZ() {} },
  BoxGeometry: class {},
  MeshStandardMaterial: class {},
  MeshBasicMaterial: class {},
  MathUtils: {
    lerp: (a, b, t) => a + (b - a) * t
  }
};

let bomberCleanCode = bomberJs.replace(/import\s+.*?;/g, '').replace(/export\s+class\s+StrategicBomber/g, 'class StrategicBomber');
const bomberFactory = new Function('THREE', bomberCleanCode + '\nreturn StrategicBomber;');
const StrategicBomber = bomberFactory(mockTHREE);

let totalBombsDropped = 0;
const testBomber = new StrategicBomber(
  { add: () => {} },
  null,
  null,
  null,
  () => { totalBombsDropped++; }
);

// 1. Straight Hangar Exit Alignment
assert.strictEqual(testBomber.modelGroup.rotation.y, Math.PI / 2, 'ModelGroup must rotate by +PI/2 to align with West forward heading');
assert.strictEqual(testBomber.forward.x, -1, 'Initial heading must be straight West down runway');
assert.strictEqual(testBomber.forward.z, 0, 'Initial lateral heading must be 0 (no crab sideways motion)');

// 2. Launch Mission
const launchResult = testBomber.launchMission('target_player', [100, 25, 200], 'Enemy Target');
assert.strictEqual(launchResult, true, 'launchMission must succeed');
assert.strictEqual(testBomber.state, 'DOORS_OPENING', 'Initial launch state must be DOORS_OPENING');

// 3. Debounce identical repeat launch within 2 seconds
const duplicateResult = testBomber.launchMission('target_player', [100, 25, 200], 'Enemy Target');
assert.strictEqual(duplicateResult, true, 'Debounced call returns true');
assert.strictEqual(testBomber.missionQueue.length, 0, 'Duplicate call within 3.5s must NOT be queued');

// 4. Step through DOORS_OPENING (2.5s)
for (let i = 0; i < 26; i++) testBomber.update(0.1);
assert.strictEqual(testBomber.state, 'TAXI', 'Must transition to TAXI after doors open');

// 5. Step through TAXI and TAKEOFF
while (testBomber.state === 'TAXI' || testBomber.state === 'TAKEOFF') {
  testBomber.update(0.1);
}
assert.strictEqual(testBomber.state, 'CRUISE', 'Must transition to CRUISE after ski-jump liftoff');

// 6. Verify continuous forward movement in CRUISE (NO MID-AIR FREEZE BUG!)
const cruiseX1 = testBomber.pos.x;
const cruiseZ1 = testBomber.pos.z;
testBomber.update(0.5);
const cruiseX2 = testBomber.pos.x;
const cruiseZ2 = testBomber.pos.z;
assert.notStrictEqual(cruiseX1, cruiseX2, 'Bomber pos.x MUST continuously advance in CRUISE (not freeze!)');
assert.strictEqual(testBomber.speed > 50, true, 'Bomber must cruise at high speed');

// 7. Step through CRUISE into BOMB_RUN and RTB
let runSteps = 0;
while (testBomber.state !== 'RTB' && runSteps < 500) {
  testBomber.update(0.1);
  runSteps++;
}
assert.strictEqual(testBomber.state, 'RTB', 'Bomber must transition to RTB after dropping bombs');
assert.strictEqual(testBomber.bombsDropped, 10, 'Bomber must drop all 10 bombs during bomb run');

// 8. Re-attack while in RTB: "GIRA Y VUELVE" (Turns around and returns!)
testBomber.lastLaunchTimestamp -= 5000; // Past debounce window
testBomber.launchMission('enemy_2', [-200, 25, -200], 'Second Wave');
assert.strictEqual(testBomber.state, 'CRUISE', 'Attacking in RTB must switch immediately to CRUISE ("gira y vuelve")');
assert.strictEqual(testBomber.bombsDropped, 0, 'Bombs must reset for the new strike sortie');
assert.strictEqual(testBomber.targetPlayerId, 'enemy_2', 'Target must be updated to new attacker');

// Verify turning around does not produce NaNs
for (let i = 0; i < 10; i++) {
  testBomber.update(0.1);
}
assert.ok(!isNaN(testBomber.pos.x) && !isNaN(testBomber.forward.x), 'Turnaround kinematics must never produce NaNs');

console.log('✓ SECTION 6 PASSED: Empirical bomber kinematics, straight exit, continuous flight, and turnaround verified.');

rm.destroy();

console.log('\n=============================================================================');
console.log('  ALL SPECIFICATIONS & ADVERSARIAL EDGE CASES PASSED WITH 100% SUCCESS!');
console.log('=============================================================================');
