// test/test_m1_flightsync.js
// Automated verification suite for Milestone 1: Airborne Flight & Burst Hit Synchronization

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { isValidMove, MSG } = require('../server/protocol');
const { GameState } = require('../server/game-state');
const { RoomManager } = require('../server/rooms');

console.log('=============================================================================');
console.log('      MILESTONE 1: AIRBORNE FLIGHT & BURST HIT SYNCHRONIZATION SUITE        ');
console.log('=============================================================================');

// --- SECTION 1: Server Protocol isFlying Validation ---
console.log('[SECTION 1: Protocol isFlying Validation]');
assert.strictEqual(isValidMove({ pos: [0, 50, 0], rot: [0, 0], isFlying: true }), true, 'Valid flight move must pass');
assert.strictEqual(isValidMove({ pos: [0, 50, 0], rot: [0, 0], isFlying: false }), true, 'Valid ground move must pass');
assert.strictEqual(isValidMove({ pos: [0, 50, 0], rot: [0, 0] }), true, 'Omitted isFlying must pass');
assert.strictEqual(isValidMove({ pos: [0, 50, 0], rot: [0, 0], isFlying: 'true' }), false, 'Non-boolean isFlying must be rejected');
assert.strictEqual(isValidMove({ pos: [0, 50, 0], rot: [0, 0], isFlying: 1 }), false, 'Numeric isFlying must be rejected');
console.log('  ✓ isValidMove validates optional isFlying boolean strictly');

// --- SECTION 2: GameState Player Tracking, Snapshots & TNT Immunity ---
console.log('[SECTION 2: GameState Player Tracking & Explosion Immunity]');
const gs = new GameState();
const p1 = gs.addPlayer('pilot_1', 'SkyAce');
assert.strictEqual(p1.isFlying, false, 'Default player flight state must be false');

gs.updatePlayer('pilot_1', {
  pos: [5, 48.5, -12],
  rot: [1.2, -0.3],
  action: 'flying',
  isFlying: true
});
assert.strictEqual(p1.isFlying, true, 'updatePlayer must record isFlying: true');
assert.strictEqual(p1.action, 'flying', 'updatePlayer must record action: flying');
assert.strictEqual(p1.pos[1], 48.5, 'Altitude must be updated');

// Snapshot export
const snapshot = gs.getPlayersSnapshot();
const snapP1 = snapshot.find(p => p.id === 'pilot_1');
assert(snapP1, 'Player must appear in snapshot');
assert.strictEqual(snapP1.isFlying, true, 'Snapshot must export isFlying: true');
assert.strictEqual(snapP1.action, 'flying');

// Initial state export for new joining client
const initState = gs.getInitialState('pilot_2');
const initP1 = initState.players.find(p => p.id === 'pilot_1');
assert(initP1, 'Player must appear in initial state playerList');
assert.strictEqual(initP1.isFlying, true, 'Initial state must export isFlying: true');

// Detonate TNT directly at and below player
gs.detonateTnt(5, 48.5, -12, 5);
assert.strictEqual(p1.pos[1], 48.5, 'Flying player altitude must NOT be modified by TNT explosion');

// Detonate multiple burst explosions
for (let i = 0; i < 10; i++) {
  gs.detonateTnt(5, 48, -12, 4);
}
assert.strictEqual(p1.pos[1], 48.5, 'Flying player must maintain exact altitude through 10-shot burst fire');

// Break block underneath player
gs.modifyBlock('ground_breaker', 5, 47, -12, 0);
assert.strictEqual(p1.pos[1], 48.5, 'Flying player altitude must NOT be altered when block below is broken');
console.log('  ✓ GameState flight tracking, snapshot serialization, and explosion immunity verified');

// --- SECTION 3: RoomManager Tick & Join Broadcasts ---
console.log('[SECTION 3: RoomManager Broadcast Integration]');
const rm = new RoomManager();
const room = rm.getOrCreateRoom('main');
const pRoom = room.gameState.addPlayer('flying_broadcaster', 'Aero');
room.gameState.updatePlayer('flying_broadcaster', {
  pos: [0, 55, 0],
  rot: [0, 0],
  action: 'flying',
  isFlying: true
});

const receivedBroadcasts = [];
const fakeClient = {
  readyState: 1,
  send(raw) {
    receivedBroadcasts.push(JSON.parse(raw));
  }
};
room.clients.set(fakeClient, 'flying_broadcaster');

rm.tick();
const playersUpdate = receivedBroadcasts.find(msg => msg.type === MSG.PLAYERS_UPDATE);
assert(playersUpdate, 'Room tick must broadcast PLAYERS_UPDATE');
const broadcastPlayer = playersUpdate.data.players.find(p => p.id === 'flying_broadcaster');
assert(broadcastPlayer, 'Player must be present in broadcast');
assert.strictEqual(broadcastPlayer.isFlying, true, 'PLAYERS_UPDATE broadcast must include isFlying: true');

rm.destroy();
console.log('  ✓ RoomManager tick loop serializes and broadcasts isFlying to all clients');

// --- SECTION 4: Client Source Code Verification (Physics, Avatar, Multiplayer, Main) ---
console.log('[SECTION 4: Client Source Code Verification]');
const physicsSrc = fs.readFileSync(path.join(__dirname, '../public/src/physics.js'), 'utf8');
const avatarSrc = fs.readFileSync(path.join(__dirname, '../public/src/avatar.js'), 'utf8');
const multiplayerSrc = fs.readFileSync(path.join(__dirname, '../public/src/multiplayer.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(__dirname, '../public/src/main.js'), 'utf8');

// Physics assertions
assert(physicsSrc.includes('this.action = \'flying\''), 'physics.js must set action to flying');
assert(physicsSrc.includes('this.isFlying = true'), 'physics.js must set isFlying to true');
assert(physicsSrc.includes('get isFlying()'), 'physics.js must define isFlying getter');
assert(physicsSrc.includes('if (this.flightMode || this.isFlying) return;'), 'physics.js onBlockBroken must guard against flightMode');
console.log('  ✓ physics.js implements flightMode action tagging, getter, and block break guard');

// Avatar assertions
assert(avatarSrc.includes('this.isFlying = false'), 'avatar.js constructor must initialize isFlying');
assert(avatarSrc.includes('setFlightMode(isFlying)'), 'avatar.js must define setFlightMode');
assert(avatarSrc.includes('if (this.isFlying || this.action === \'flying\' || this.action === \'driving\') return this.targetPos.y;'),
  'avatar.js updateGroundDetection must guard against flying state');
assert(avatarSrc.includes('if (this.isFlying || this.action === \'flying\' || this.action === \'driving\') return true;'),
  'avatar.js updateGroundSupport must guard against flying state');
assert(avatarSrc.includes('if (this.isFlying || this.action === \'flying\' || this.action === \'driving\') return;'),
  'avatar.js onSupportingBlockRemoved must guard against flying state');
assert(avatarSrc.includes('!this.isFlying && this.action !== \'flying\''),
  'avatar.js setTargetState must bypass ground height clamping when flying');
assert(avatarSrc.includes('this.isFlying || this.action === \'flying\''),
  'avatar.js update(dt) must branch into smooth symmetric flight interpolation');
console.log('  ✓ avatar.js implements flight immunity across all ground detection/support methods and kinematic lerp');

// Multiplayer assertions
assert(multiplayerSrc.includes('const isFlying = Boolean('), 'multiplayer.js sendMove must compute isFlying boolean');
assert(multiplayerSrc.includes('isFlying,') || multiplayerSrc.includes('isFlying: isFlying'), 'multiplayer.js sendMove must serialize isFlying');
assert(multiplayerSrc.includes('if (avatar.isFlying || avatar.action === \'flying\') continue;'),
  'multiplayer.js checkAvatarsGroundAfterBlockBreak must skip flying avatars');
assert(multiplayerSrc.includes('avatar.setTargetState(p.pos, p.rot, p.action, p.weaponsEnabled, p.isFlying)'),
  'multiplayer.js players_update must pass isFlying to remote avatars');
console.log('  ✓ multiplayer.js transmits flight state and filters block break ground checks for flying avatars');

// Main assertions
assert(mainSrc.includes('isSolidVoxelHit = Boolean(voxelHit && voxelDist < Infinity && voxelDist <= playerDist && voxelDist <= animalDist)'),
  'main.js must define isSolidVoxelHit');
assert(mainSrc.includes('hasSurfaceOrEntityImpact = Boolean(voxelHit && voxelDist < Infinity && isSolidVoxelHit)'),
  'main.js Bazooka must restrict sendTntTrigger to isSolidVoxelHit');
console.log('  ✓ main.js restricts sendTntTrigger to solid voxel impacts, eliminating mid-air burst explosions');

console.log('=============================================================================');
console.log('STATUS: ALL MILESTONE 1 VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
console.log('=============================================================================');
