// test/test_military_bomber_defense.js
// Verification suite for Military Base, B-1 Bomber, Iron Dome Defense, Dual Missile Kinematics & Radar Upgrades

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { RoomManager } = require('../server/rooms');
const {
  MSG,
  ADMIN_EMAIL,
  RIVAL_ADMIN_EMAIL,
  ADMIN_EMAILS,
  isValidAdminCredentials
} = require('../server/protocol');

console.log('=============================================================================');
console.log('       MILITARY BASE, B-1 BOMBER & ACTIVE DEFENSE VERIFICATION');
console.log('=============================================================================');

// Mock WebSocket helper
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

// TEST 1: Dual Admin Authentication (Main & Rival)
console.log('\n--- TEST 1: Dual Admin Authentication ---');
assert.strictEqual(isValidAdminCredentials('jsieiragerpe@gmail.com', 'ARGÓN4'), true, 'Main admin must validate with ARGÓN4');
assert.strictEqual(isValidAdminCredentials('jsieiragerpe@gmail.com', 'ARGON4'), true, 'Main admin must validate with ARGON4');
assert.strictEqual(isValidAdminCredentials('cifrixa.labs.contact@gmail.com', 'ARGÓN4'), true, 'Rival admin must validate with ARGÓN4');
assert.strictEqual(isValidAdminCredentials('cifrixa.labs.contact@gmail.com', 'ARGON4'), true, 'Rival admin must validate with ARGON4');
assert.strictEqual(isValidAdminCredentials('hacker@gmail.com', 'ARGON4'), false, 'Unauthorized email must be rejected');
assert.strictEqual(isValidAdminCredentials('cifrixa.labs.contact@gmail.com', 'WRONGKEY'), false, 'Wrong key must be rejected');
console.log('✓ TEST 1 PASSED: Both jsieiragerpe@gmail.com and cifrixa.labs.contact@gmail.com validate stealth credentials.');

// TEST 2: Rival Admin Salvo Launch (2 Missiles)
console.log('\n--- TEST 2: Rival Admin Dual Missile Salvo ---');
const rm = new RoomManager();
const rivalWs = new MockWs();
const rivalMeta = { id: 'p_rival' };
rm.socketMeta.set(rivalWs, rivalMeta);

// Join room as rival admin
rm.handleJoin(rivalWs, rivalMeta, {
  name: 'cifrixa.labs.contact@gmail.com',
  email: 'cifrixa.labs.contact@gmail.com',
  adminKey: 'ARGON4'
});
assert.strictEqual(rivalMeta.isAdmin, true, 'Rival must be granted admin permissions');
assert.strictEqual(rivalMeta.adminEmail, 'cifrixa.labs.contact@gmail.com', 'Rival admin email must be tracked');

// Join a regular target player
const targetWs = new MockWs();
const targetMeta = { id: 'p_target' };
rm.socketMeta.set(targetWs, targetMeta);
rm.handleJoin(targetWs, targetMeta, { name: 'TargetPlayer' });

// Rival launches missile at target player
rivalWs.sent.length = 0;
targetWs.sent.length = 0;
rm.handleAdminLaunchMissile(rivalWs, rivalMeta, { targetPlayerId: 'p_target' });

const rivalSpawns = targetWs.sent.filter(m => m.type === MSG.MISSILE_SPAWN);
assert.strictEqual(rivalSpawns.length, 2, 'Rival admin must launch a salvo of exactly 2 missiles');
assert.notStrictEqual(rivalSpawns[0].data.missileId, rivalSpawns[1].data.missileId, 'Salvo missiles must have unique IDs');
assert.notStrictEqual(rivalSpawns[0].data.startYaw, rivalSpawns[1].data.startYaw, 'Salvo missiles must have angular separation');
console.log('✓ TEST 2 PASSED: Rival admin successfully fires coordinated 2-missile salvo.');

// TEST 3: Automated Active Defense (Iron Dome) Trigger against Main Admin Target
console.log('\n--- TEST 3: Active Defense Trigger when Targeting Main Admin ---');
const mainAdminWs = new MockWs();
const mainAdminMeta = { id: 'p_main_admin' };
rm.socketMeta.set(mainAdminWs, mainAdminMeta);
rm.handleJoin(mainAdminWs, mainAdminMeta, {
  name: 'jsieiragerpe@gmail.com',
  email: 'jsieiragerpe@gmail.com',
  adminKey: 'ARGON4'
});

mainAdminWs.sent.length = 0;
targetWs.sent.length = 0;
// Rival launches missiles at Main Admin
rm.handleAdminLaunchMissile(rivalWs, rivalMeta, { targetPlayerId: 'p_main_admin' });

const defensePacket = mainAdminWs.sent.find(m => m.type === MSG.MISSILE_INTERCEPT_DEFENSE);
assert.ok(defensePacket, 'Server must broadcast MISSILE_INTERCEPT_DEFENSE when missile targets main admin');
assert.strictEqual(defensePacket.data.attackerId, 'p_rival', 'Attacker must be identified as rival');
assert.strictEqual(defensePacket.data.defenderId, 'p_main_admin', 'Defender must be identified as main admin');
assert.strictEqual(defensePacket.data.hostileMissileIds.length, 2, 'Must track incoming hostile missile IDs');
console.log('✓ TEST 3 PASSED: Iron dome intercept defense triggers automatically with threat tracking.');

// TEST 4: Military Base Shield & Forcefield Protection
console.log('\n--- TEST 4: Military Base Forcefield Protection ---');
// Try to modify blocks inside base as a regular player
targetWs.sent.length = 0;
rm.handleBlockModify(targetWs, targetMeta, { x: -420, y: 26, z: 150, blockType: 0 });
const rejectPacket = targetWs.sent.find(m => m.type === MSG.BLOCK_REJECT);
assert.ok(rejectPacket, 'Block modification inside military base must be rejected for non-admin');
assert.ok(rejectPacket.data.reason.includes('Base militar protegida'), 'Rejection reason must mention base forcefield');

// Verify main admin CAN modify inside base
mainAdminWs.sent.length = 0;
rm.handleBlockModify(mainAdminWs, mainAdminMeta, { x: -420, y: 26, z: 150, blockType: 1 });
const updatePacket = mainAdminWs.sent.find(m => m.type === MSG.BLOCK_UPDATE);
assert.ok(updatePacket, 'Main admin jsieiragerpe@gmail.com must be allowed to modify base');

// Verify unauthorized player is repelled outside the perimeter
const movePayload = { pos: [-420, 25, 150], rot: [0, 0] };
rm.handleMove(targetWs, targetMeta, movePayload);
const repelledX = movePayload.pos[0];
const repelledZ = movePayload.pos[2];
const isInside = (repelledX >= -455 && repelledX <= -385 && repelledZ >= 115 && repelledZ <= 185);
assert.strictEqual(isInside, false, 'Unauthorized player must be repelled outside the base boundary');
console.log('✓ TEST 4 PASSED: Forcefield barrier repels unauthorized players and rejects block modification.');

// TEST 5: Strategic Bomber Module & Hangar Animation Verification
console.log('\n--- TEST 5: Strategic Bomber & Animated Hangar Codebase Verification ---');
const bomberJs = fs.readFileSync(path.resolve(__dirname, '../public/src/bomber.js'), 'utf8');
assert.ok(bomberJs.includes('class StrategicBomber'), 'bomber.js must export StrategicBomber');
assert.ok(bomberJs.includes('buildHangar'), 'bomber.js must build procedural military hangar');
assert.ok(bomberJs.includes('leftHangarDoor'), 'bomber.js must have animated left sliding hangar door');
assert.ok(bomberJs.includes('rightHangarDoor'), 'bomber.js must have animated right sliding hangar door');
assert.ok(bomberJs.includes('launchMission'), 'bomber.js must support autonomous launchMission');
assert.ok(bomberJs.includes('maxBombs = 10'), 'bomber.js must drop exactly 10 bombs during carpet run');
assert.ok(bomberJs.includes('runwayRamp'), 'bomber.js must include ski-jump runway ramp waypoint');
console.log('✓ TEST 5 PASSED: StrategicBomber includes animated doors, ski-jump ramp, and 10x carpet bomb sequence.');

// TEST 6: Tactical Radar Bombard-All & Selection Stability
console.log('\n--- TEST 6: Tactical Radar Enhancements ---');
const radarJs = fs.readFileSync(path.resolve(__dirname, '../public/src/radar.js'), 'utf8');
assert.ok(radarJs.includes('bombardAllTargets'), 'radar.js must provide bombardAllTargets method');
assert.ok(radarJs.includes('radar-bomb-all-btn'), 'radar.js markup must include BOMBARDEAR A TODOS button');
assert.ok(radarJs.includes('selectedTargetId'), 'radar.js must maintain selectedTargetId state across updates');
assert.ok(radarJs.includes('active-target'), 'radar.js must highlight active-target card visually');

const stylesCss = fs.readFileSync(path.resolve(__dirname, '../public/styles.css'), 'utf8');
assert.ok(stylesCss.includes('.radar-bomb-all-btn'), 'styles.css must style radar-bomb-all-btn');
assert.ok(stylesCss.includes('.active-target'), 'styles.css must style active-target card');
assert.ok(stylesCss.includes('@media (max-width: 680px)'), 'styles.css must provide mobile responsive layout for radar');
console.log('✓ TEST 6 PASSED: Tactical radar features bombard-all button, active selection, and mobile CSS.');

rm.destroy();

console.log('\n=============================================================================');
console.log('VERIFICATION SUMMARY: ALL 6 SPECIFICATIONS PASSED WITH ZERO DEFECTS!');
console.log('=============================================================================');
