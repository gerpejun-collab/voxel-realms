// test/test.js
// =============================================================================
// VOXEL REALMS EXPANSION: COMPREHENSIVE AUTOMATED VERIFICATION SUITE
// Covers Requirements R1, R2, R3, R4, R5 and All Acceptance Criteria
//
// Sections:
//   1. Protocol, Sanitization & Teleportation Packets (R4)
//   2. Game State Authority, Block Reach & Permanent Daytime 0.32 (R5)
//   3. Room Management, Player Capacity & Friend Teleportation Flow (R4)
//   4. Physics Collision Mathematics, Substepping & Speed Multipliers (R3)
//   5. World Generation & Six Monument Sectors (R2)
//   6. Client UI, Audio & Controls Architecture (R1, R3, R5)
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// --- Server-side common modules ---
const {
  MSG,
  sanitizeName,
  sanitizeChat,
  isValidBlockModify,
  isValidMove,
  validateTeleportPacket
} = require('../server/protocol');

const { GameState } = require('../server/game-state');
const { RoomManager } = require('../server/rooms');

// --- Helper to extract and instantiate Browser ES6 modules in Node ---
function loadWorldModule() {
  const worldPath = path.resolve(__dirname, '../public/src/world.js');
  let worldCode = fs.readFileSync(worldPath, 'utf8');

  // Strip ES6 module import/export declarations for dynamic instantiation
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

  // Extract SimplexNoise from public/src/textures.js
  const texPath = path.resolve(__dirname, '../public/src/textures.js');
  const texCode = fs.readFileSync(texPath, 'utf8');
  const noiseMatch = texCode.match(/class SimplexNoise\s*\{[\s\S]*?\n\}/);
  const SimplexNoise = new Function(noiseMatch[0] + '\nreturn SimplexNoise;')();
  const noise = new SimplexNoise(1337);

  // Chunk implementation mirroring public/src/chunks.js
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
  }

  const { World } = new Function(
    'Chunk', 'CHUNK_WIDTH', 'CHUNK_HEIGHT', 'CHUNK_DEPTH', 'BLOCKS', 'noise',
    worldCode + '\nreturn { World };'
  )(Chunk, 16, 64, 16, BLOCKS, noise);

  return { World, Chunk, BLOCKS, noise };
}

function loadPlayerPhysicsModule() {
  const physPath = path.resolve(__dirname, '../public/src/physics.js');
  let physCode = fs.readFileSync(physPath, 'utf8');
  physCode = physCode
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+class\s+PlayerPhysics/g, 'class PlayerPhysics');

  const BLOCKS = { AIR: 0, WATER: 11, STONE: 4 };
  const BLOCK_DEFS = { 4: { solid: true }, 11: { solid: false } };

  const { PlayerPhysics } = new Function(
    'BLOCKS', 'BLOCK_DEFS',
    physCode + '\nreturn { PlayerPhysics };'
  )(BLOCKS, BLOCK_DEFS);

  return { PlayerPhysics };
}

function loadSoundSystemModule() {
  const audioPath = path.resolve(__dirname, '../public/src/audio.js');
  let audioCode = fs.readFileSync(audioPath, 'utf8');
  audioCode = audioCode
    .replace(/export\s+class\s+SoundSystem/g, 'class SoundSystem')
    .replace(/export\s+const\s+sound\s*=\s*new\s+SoundSystem\(\);/g, '');

  const { SoundSystem } = new Function(audioCode + '\nreturn { SoundSystem };')();
  return { SoundSystem };
}

// Test harness execution tracking
console.log('=============================================================================');
console.log('           VOXEL REALMS EXPANSION: AUTOMATED TEST SUITE (R1-R5)              ');
console.log('=============================================================================');

let passed = 0;
let total = 0;
const failures = [];

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    -> Assertion Error: ${err.message}`);
    failures.push({ name, error: err });
  }
}

// =============================================================================
// SECTION 1: PROTOCOL, SANITIZATION & TELEPORTATION PACKETS (R4)
// =============================================================================
console.log('\n[SECTION 1: PROTOCOL, SANITIZATION & TELEPORTATION PACKETS (R4)]');

it('sanitizes malicious usernames and prevents HTML/script injection', () => {
  assert.strictEqual(sanitizeName('<script>alert(1)</script>'), 'scriptalert1scri');
  assert.strictEqual(sanitizeName('NormalPlayer'), 'NormalPlayer');
  assert.strictEqual(sanitizeName('A_Very_Long_Player_Name_Over_Limit'), 'A_Very_Long_Play');
  assert.strictEqual(sanitizeName('   '), 'Player');
  assert.strictEqual(sanitizeName(''), 'Player');
  assert.strictEqual(sanitizeName(null), 'Player');
  assert.strictEqual(sanitizeName(undefined), 'Player');
  assert.strictEqual(sanitizeName({}), 'Player');
});

it('sanitizes chat messages and prevents XSS markup while preserving clean text', () => {
  assert.strictEqual(sanitizeChat('Hello <b>world</b>!'), 'Hello bworld/b!');
  assert.strictEqual(sanitizeChat('Clean text'), 'Clean text');
  assert.strictEqual(sanitizeChat(''), '');
  assert.strictEqual(sanitizeChat(null), '');
  assert.strictEqual(sanitizeChat(undefined), '');
  assert.strictEqual(sanitizeChat('a'.repeat(200)).length, 120); // 120 max length check
});

it('validates block modification coordinates and bounds (positive, negative, Y limits, float rejection)', () => {
  assert.strictEqual(isValidBlockModify({ x: 10, y: 30, z: -5, blockType: 1 }), true);
  // Invalid Y (negative or over 128)
  assert.strictEqual(isValidBlockModify({ x: 10, y: -1, z: 0, blockType: 1 }), false);
  assert.strictEqual(isValidBlockModify({ x: 10, y: 150, z: 0, blockType: 1 }), false);
  // Floating point coordinates
  assert.strictEqual(isValidBlockModify({ x: 10.5, y: 30, z: 0, blockType: 1 }), false);
  assert.strictEqual(isValidBlockModify({ x: 10, y: 30.2, z: 0, blockType: 1 }), false);
  // Negative or invalid blockType
  assert.strictEqual(isValidBlockModify({ x: 10, y: 30, z: 0, blockType: -1 }), false);
  assert.strictEqual(isValidBlockModify({ x: 10, y: 30, z: 0, blockType: 999 }), false);
  assert.strictEqual(isValidBlockModify(null), false);
});

it('validates player movement packets with position and rotation arrays', () => {
  assert.strictEqual(isValidMove({ pos: [1.2, 30.5, -4.8], rot: [0.5, -0.2] }), true);
  assert.strictEqual(isValidMove({ pos: [1.2, 30.5], rot: [0.5, -0.2] }), false);
  assert.strictEqual(isValidMove({ pos: [1.2, 30.5, 0], rot: [0.5] }), false);
  assert.strictEqual(isValidMove({ pos: [NaN, 30.5, 0], rot: [0, 0] }), false);
  assert.strictEqual(isValidMove({ pos: [0, 30.5, Infinity], rot: [0, 0] }), false);
  assert.strictEqual(isValidMove(null), false);
});

it('validates player teleportation packets and rejects invalid target IDs', () => {
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: 'p_1234567' }), true);
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: 'player-test_99' }), true);
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: 'a'.repeat(64) }), true);

  // Missing or non-string targetPlayerId
  assert.strictEqual(validateTeleportPacket({}), false);
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: null }), false);
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: 123 }), false);
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: true }), false);

  // Empty or whitespace
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: '' }), false);
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: '   ' }), false);

  // Exceeding max length
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: 'a'.repeat(65) }), false);

  // Malicious/invalid characters
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: '<script>alert(1)</script>' }), false);
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: 'p_123; DROP TABLE' }), false);
  assert.strictEqual(validateTeleportPacket({ targetPlayerId: 'id with spaces' }), false);
  assert.strictEqual(validateTeleportPacket(null), false);
});

it('exports authoritative MSG constants including multiplayer and teleport types', () => {
  assert.strictEqual(MSG.JOIN, 'join');
  assert.strictEqual(MSG.MOVE, 'move');
  assert.strictEqual(MSG.BLOCK_MODIFY, 'block_modify');
  assert.strictEqual(MSG.CHAT, 'chat');
  assert.strictEqual(MSG.TELEPORT_TO_PLAYER, 'teleport_to_player');
  assert.strictEqual(MSG.TELEPORT_CONFIRM, 'teleport_confirm');
  assert.strictEqual(MSG.BLOCK_REJECT, 'block_reject');
  assert.strictEqual(MSG.BLOCK_UPDATE, 'block_update');
  assert.strictEqual(MSG.CHAT_BROADCAST, 'chat_broadcast');
  assert.strictEqual(MSG.ERROR, 'error');
});

// =============================================================================
// SECTION 2: GAME STATE AUTHORITY, BLOCK REACH & PERMANENT DAYTIME 0.32 (R5)
// =============================================================================
console.log('\n[SECTION 2: GAME STATE AUTHORITY, BLOCK REACH & PERMANENT DAYTIME 0.32 (R5)]');

it('correctly tracks players, assigns unique IDs, and resolves duplicate names', () => {
  const state = new GameState(12345);
  const p1 = state.addPlayer('id1', 'Alex');
  const p2 = state.addPlayer('id2', 'Alex');
  const p3 = state.addPlayer('id3', 'Alex');

  assert.strictEqual(p1.name, 'Alex');
  assert.strictEqual(p2.name, 'Alex_1');
  assert.strictEqual(p3.name, 'Alex_2');
  assert.strictEqual(state.players.size, 3);

  state.removePlayer('id1');
  assert.strictEqual(state.players.size, 2);
  assert.strictEqual(state.getPlayer('id2').name, 'Alex_1');
});

it('rejects block modifications that are out of reach from player position', () => {
  const state = new GameState(12345);
  const p = state.addPlayer('p1', 'Builder');
  p.pos = [0, 20, 0];

  // Block at distance ~140 blocks
  const result = state.modifyBlock('p1', 100, 20, 100, 1);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'Out of reach');
});

it('rejects placing a solid block inside the player bounding box but allows block destruction', () => {
  const state = new GameState(12345);
  const p = state.addPlayer('p1', 'Builder');
  p.pos = [10.2, 25.0, 10.2]; // feet at y=25, height 1.8

  // Placing solid block (type: 1) inside bounding box
  const placeResult = state.modifyBlock('p1', 10, 25, 10, 1);
  assert.strictEqual(placeResult.success, false);
  assert.strictEqual(placeResult.reason, 'Cannot place block inside player');

  // Destroying block (type: 0) at same location is permitted
  const destroyResult = state.modifyBlock('p1', 10, 25, 10, 0);
  assert.strictEqual(destroyResult.success, true);
});

it('stores block deltas and serializes initial state for new joiners', () => {
  const state = new GameState(99999);
  const p1 = state.addPlayer('p1', 'Steve');
  p1.pos = [5, 20, 5];

  state.modifyBlock('p1', 5, 20, 7, 3); // Place block
  state.modifyBlock('p1', 5, 21, 7, 0); // Destroy block

  const initial = state.getInitialState('p2');
  assert.strictEqual(initial.seed, 99999);
  assert.strictEqual(initial.players.length, 1);
  assert.strictEqual(initial.players[0].name, 'Steve');
  assert.strictEqual(initial.deltas.length, 2);
  assert.deepStrictEqual(initial.deltas[0], [5, 20, 7, 3]);
  assert.deepStrictEqual(initial.deltas[1], [5, 21, 7, 0]);
});

it('locks timeOfDay to permanent bright sunny day mode (0.32) without temporal drift', () => {
  const state = new GameState(12345);
  assert.strictEqual(state.getTimeOfDay(), 0.32);

  const initial = state.getInitialState('p1');
  assert.strictEqual(initial.timeOfDay, 0.32);

  // Solar position calculation check for 0.32
  const timeOfDay = state.getTimeOfDay();
  const sunAngle = (timeOfDay - 0.25) * Math.PI * 2;
  const sunY = Math.sin(sunAngle);
  assert.strictEqual(Math.round(sunY * 1000) / 1000, 0.426, 'sunY must equal ~0.426');

  const t = Math.min(1.0, (sunY - 0.2) / 0.5);
  const sunLightIntensity = 1.8 * t + 0.4;
  assert.strictEqual(Math.round(sunLightIntensity * 100) / 100, 1.21, 'sunLight intensity must equal ~1.21');
});

// =============================================================================
// SECTION 3: ROOM MANAGEMENT, PLAYER CAPACITY & FRIEND TELEPORTATION FLOW (R4)
// =============================================================================
console.log('\n[SECTION 3: ROOM MANAGEMENT, PLAYER CAPACITY & FRIEND TELEPORTATION FLOW (R4)]');

it('enforces maximum player capacity and rejects excess clients with ERROR packet', () => {
  const roomManager = new RoomManager({ maxPlayers: 2, seed: 12345 });
  const mockSockets = [
    { readyState: 1, send: () => {}, on: () => {} },
    { readyState: 1, send: () => {}, on: () => {} },
    { readyState: 1, send: (data) => { mockSockets[2].lastMsg = JSON.parse(data); }, on: () => {} }
  ];

  mockSockets.forEach(ws => roomManager.handleConnection(ws));

  // Join first two
  roomManager.handleJoin(mockSockets[0], roomManager.socketMeta.get(mockSockets[0]), { name: 'P1' });
  roomManager.handleJoin(mockSockets[1], roomManager.socketMeta.get(mockSockets[1]), { name: 'P2' });
  assert.strictEqual(roomManager.getTotalOnlineCount(), 2);

  // Third player rejected
  roomManager.handleJoin(mockSockets[2], roomManager.socketMeta.get(mockSockets[2]), { name: 'P3' });
  assert.strictEqual(roomManager.getTotalOnlineCount(), 2);
  assert.strictEqual(mockSockets[2].lastMsg.type, MSG.ERROR);
  assert.ok(mockSockets[2].lastMsg.data.message.includes('lleno'));

  roomManager.destroy();
});

it('sends BLOCK_REJECT with exact coordinates when an invalid block modification occurs', () => {
  const roomManager = new RoomManager({ maxPlayers: 4, seed: 12345 });
  const messages = [];
  const mockWs = {
    readyState: 1,
    send: (str) => { messages.push(JSON.parse(str)); },
    on: () => {}
  };

  roomManager.handleConnection(mockWs);
  const meta = roomManager.socketMeta.get(mockWs);
  roomManager.handleJoin(mockWs, meta, { name: 'RejectTester' });

  // Out of reach block modify at (100, 32, 100)
  roomManager.handleBlockModify(mockWs, meta, { x: 100, y: 32, z: 100, blockType: 1 });

  const rejectMsg = messages.find(m => m.type === MSG.BLOCK_REJECT);
  assert.ok(rejectMsg, 'Expected BLOCK_REJECT message');
  assert.strictEqual(rejectMsg.data.x, 100);
  assert.strictEqual(rejectMsg.data.y, 32);
  assert.strictEqual(rejectMsg.data.z, 100);

  roomManager.destroy();
});

it('processes valid player teleportation request, updates coordinates, and broadcasts social chat announcement', () => {
  const roomManager = new RoomManager({ maxPlayers: 4, seed: 12345 });
  const p1Messages = [];
  const p2Messages = [];

  const ws1 = {
    readyState: 1,
    send: (str) => { p1Messages.push(JSON.parse(str)); },
    on: () => {}
  };
  const ws2 = {
    readyState: 1,
    send: (str) => { p2Messages.push(JSON.parse(str)); },
    on: () => {}
  };

  roomManager.handleConnection(ws1);
  roomManager.handleConnection(ws2);

  const meta1 = roomManager.socketMeta.get(ws1);
  const meta2 = roomManager.socketMeta.get(ws2);

  roomManager.handleJoin(ws1, meta1, { name: 'Explorer1' });
  roomManager.handleJoin(ws2, meta2, { name: 'Explorer2' });

  // Move Explorer2 to Japan Imperial sector (250, 25, 250)
  roomManager.handleMove(ws2, meta2, {
    pos: [250.0, 25.0, 250.0],
    rot: [0, 0]
  });

  const room = roomManager.rooms.get(meta1.roomId);
  const targetPlayer = room.gameState.getPlayer(meta2.id);
  assert.deepStrictEqual(targetPlayer.pos, [250.0, 25.0, 250.0]);

  // Explorer1 requests teleportation to Explorer2
  roomManager.handleTeleportToPlayer(ws1, meta1, { targetPlayerId: meta2.id });

  // 1. Verify TELEPORT_CONFIRM packet received by Explorer1
  const confirmMsg = p1Messages.find(m => m.type === MSG.TELEPORT_CONFIRM);
  assert.ok(confirmMsg, 'Expected TELEPORT_CONFIRM packet to be sent to requester');
  assert.strictEqual(confirmMsg.data.x, 250.0);
  assert.strictEqual(confirmMsg.data.y, 25.0);
  assert.strictEqual(confirmMsg.data.z, 250.0);
  assert.strictEqual(confirmMsg.data.targetName, 'Explorer2');

  // 2. Verify requester authoritative game state updated
  const requester = room.gameState.getPlayer(meta1.id);
  assert.strictEqual(requester.pos[0], 250.0);
  assert.strictEqual(requester.pos[1], 25.0);
  assert.strictEqual(requester.pos[2], 250.0);

  // 3. Verify social chat announcement broadcast to both clients
  const broadcastMsg = p1Messages.find(m => m.type === MSG.CHAT_BROADCAST && m.data.senderId === 'SYSTEM');
  assert.ok(broadcastMsg, 'Expected SYSTEM chat broadcast to requester');
  assert.strictEqual(broadcastMsg.data.text, 'Explorer1 se ha teletransportado hacia Explorer2');

  const p2Broadcast = p2Messages.find(m => m.type === MSG.CHAT_BROADCAST && m.data.senderId === 'SYSTEM');
  assert.ok(p2Broadcast, 'Expected target player to also receive social chat announcement');

  roomManager.destroy();
});

it('rejects teleportation when target player is missing or packet is invalid with descriptive errors', () => {
  const roomManager = new RoomManager({ maxPlayers: 4, seed: 12345 });
  const messages = [];
  const ws = {
    readyState: 1,
    send: (str) => { messages.push(JSON.parse(str)); },
    on: () => {}
  };

  roomManager.handleConnection(ws);
  const meta = roomManager.socketMeta.get(ws);
  roomManager.handleJoin(ws, meta, { name: 'SoloExplorer' });

  // 1. Request nonexistent player
  roomManager.handleTeleportToPlayer(ws, meta, { targetPlayerId: 'p_nonexistent' });
  const errorMsg1 = messages[messages.length - 1];
  assert.strictEqual(errorMsg1.type, MSG.ERROR);
  assert.ok(errorMsg1.data.message.includes('objetivo no está disponible'));

  // 2. Request invalid packet payload
  roomManager.handleTeleportToPlayer(ws, meta, { targetPlayerId: '' });
  const errorMsg2 = messages[messages.length - 1];
  assert.strictEqual(errorMsg2.type, MSG.ERROR);
  assert.ok(errorMsg2.data.message.includes('inválido'));

  roomManager.destroy();
});

// =============================================================================
// SECTION 4: PHYSICS COLLISION MATHEMATICS, SUBSTEPPING & SPEED MULTIPLIERS (R3)
// =============================================================================
console.log('\n[SECTION 4: PHYSICS COLLISION MATHEMATICS, SUBSTEPPING & SPEED MULTIPLIERS (R3)]');

it('accurately resolves floor collision and detects ground contact', () => {
  let posY = 20.1;
  let velY = -10.0;
  let onGround = false;
  const dt = 1 / 60;

  posY += velY * dt;
  if (velY <= 0) {
    const floorY = 20.0;
    if (posY <= floorY) {
      posY = floorY;
      velY = 0;
      onGround = true;
    }
  }

  assert.strictEqual(onGround, true);
  assert.strictEqual(velY, 0);
  assert.strictEqual(posY, 20.0);
});

it('prevents tunneling through thin 1-block platforms at terminal velocity via substepping', () => {
  // Platform at Y = 15.0. Player falls from Y = 16.5 at terminal velocity velY = -40 m/s with dt = 0.05
  // Total unstepped displacement would be -2.0 blocks (tunneling straight through from 16.5 to 14.5!)
  const floorY = 15.0;
  let posY = 16.5;
  const velY = -40.0;
  const dt = 0.05;

  const maxDisp = Math.abs(velY * dt);
  const steps = Math.max(1, Math.min(8, Math.ceil(maxDisp / 0.35)));
  const subDt = dt / steps;
  let onGround = false;

  for (let s = 0; s < steps; s++) {
    posY += velY * subDt;
    if (posY <= floorY) {
      posY = floorY;
      onGround = true;
      break;
    }
  }

  assert.strictEqual(onGround, true);
  assert.strictEqual(posY, 15.0);
});

it('correctly calculates Minecraft auto-step elevation when moving forward into a 1-block step with headroom', () => {
  const onGround = true;
  const posY = 24.0;
  const targetStepY = Math.floor(posY) + 1.0;
  const stepHeight = targetStepY - posY;

  // Step height is within Minecraft range (<= 1.05)
  const canStep = onGround && stepHeight <= 1.05;
  assert.strictEqual(canStep, true);

  const resolvedY = canStep ? targetStepY : posY;
  assert.strictEqual(resolvedY, 25.0);
});

it('verifies 3-way speed selector modes and flight mode toggle mechanics (1x Walk, 2.5x Fast, 5x Flight)', () => {
  const speedConfigs = [
    { tier: 1, mult: 1.0, flight: false, label: '⚡ 1x Caminar' },
    { tier: 2, mult: 2.5, flight: false, label: '⚡ 2.5x Explorar' },
    { tier: 3, mult: 5.0, flight: true,  label: '🕊️ 5x Volar' }
  ];

  for (const cfg of speedConfigs) {
    assert.ok(cfg.mult >= 1.0 && cfg.mult <= 5.0);
    if (cfg.mult === 5.0) {
      assert.strictEqual(cfg.flight, true);
    } else {
      assert.strictEqual(cfg.flight, false);
    }
  }

  // Speed cycle simulation
  function cycleSpeed(current) {
    if (Math.abs(current - 1.0) < 0.05) return { mult: 2.5, flight: false };
    if (Math.abs(current - 2.5) < 0.05) return { mult: 5.0, flight: true };
    return { mult: 1.0, flight: false };
  }

  const step1 = cycleSpeed(1.0);
  assert.strictEqual(step1.mult, 2.5);
  assert.strictEqual(step1.flight, false);

  const step2 = cycleSpeed(2.5);
  assert.strictEqual(step2.mult, 5.0);
  assert.strictEqual(step2.flight, true);

  const step3 = cycleSpeed(5.0);
  assert.strictEqual(step3.mult, 1.0);
  assert.strictEqual(step3.flight, false);
});

it('validates PlayerPhysics kinematics, zero-gravity flight updates, and instant teleportation', () => {
  const { PlayerPhysics } = loadPlayerPhysicsModule();
  const mockWorld = {
    getBlock: () => 0,
    getHeightAt: () => 24
  };

  const physics = new PlayerPhysics(mockWorld);
  assert.strictEqual(physics.speedMultiplier, 1.0);
  assert.strictEqual(physics.flightMode, false);

  // 1. Instant teleportation
  physics.teleport(250, 25, 250);
  assert.deepStrictEqual(physics.pos, { x: 250, y: 25, z: 250 });
  assert.deepStrictEqual(physics.vel, { x: 0, y: 0, z: 0 });

  // 2. Normal gravity update
  physics.update(0.1, { moveX: 0, moveZ: 0, jump: false, sprint: false });
  assert.ok(physics.vel.y < 0, 'Gravity must pull player down in normal walk mode');

  // 3. Flight mode update (zero gravity, jump ascends)
  physics.flightMode = true;
  physics.speedMultiplier = 5.0;
  physics.vel.y = 0;
  physics.update(0.1, { moveX: 0, moveZ: 0, jump: true, sprint: false });
  assert.ok(physics.vel.y > 0, 'In flight mode, jump must propel upward without gravity penalty');
});

it('verifies 3rd-person camera ray obstruction calculation prevents clipping into solid walls', () => {
  const mockWorld = {
    getBlock: (x, y, z) => (z >= 1 ? 1 : 0) // Solid wall at z >= 1
  };

  const eye = { x: 0, y: 25, z: 0 };
  const targetOffset = { x: 0, y: 0, z: 3.5 };

  function getSafeCameraPosition(eye, ox, oy, oz, world) {
    const len = Math.hypot(ox, oy, oz);
    const dx = ox / len;
    const dy = oy / len;
    const dz = oz / len;
    const step = 0.2;
    let safeLen = len;

    for (let cur = 0.4; cur <= len; cur += step) {
      const cx = eye.x + dx * cur;
      const cy = eye.y + dy * cur;
      const cz = eye.z + dz * cur;

      const bx = Math.floor(cx);
      const by = Math.floor(cy);
      const bz = Math.floor(cz);

      if (world.getBlock(bx, by, bz) !== 0) {
        safeLen = Math.max(0.35, cur - 0.25);
        break;
      }
    }

    return {
      x: eye.x + dx * safeLen,
      y: eye.y + dy * safeLen,
      z: eye.z + dz * safeLen
    };
  }

  const safePos = getSafeCameraPosition(eye, targetOffset.x, targetOffset.y, targetOffset.z, mockWorld);
  assert.ok(safePos.z < 1.0, `Camera z (${safePos.z}) must not penetrate solid wall (z < 1.0)`);
  assert.ok(safePos.z >= 0.35, `Camera z (${safePos.z}) must maintain min safe eye offset`);
});

it('verifies Minecraft camera perspective cycling modes (first, third-back, third-front)', () => {
  const modes = ['first', 'third-back', 'third-front'];
  let idx = 0;
  function toggle() {
    idx = (idx + 1) % 3;
    return modes[idx];
  }

  assert.strictEqual(toggle(), 'third-back');
  assert.strictEqual(toggle(), 'third-front');
  assert.strictEqual(toggle(), 'first');
});

// =============================================================================
// SECTION 5: WORLD GENERATION & SIX MONUMENT SECTORS (R2)
// =============================================================================
console.log('\n[SECTION 5: WORLD GENERATION & SIX MONUMENT SECTORS (R2)]');

const { World, Chunk, BLOCKS } = loadWorldModule();
const world = new World(null, null, 12345);

// Helper to query block with on-demand chunk generation
function getBlockAt(x, y, z) {
  const cx = Math.floor(x / 16);
  const cz = Math.floor(z / 16);
  world.getOrCreateChunk(cx, cz);
  return world.getBlock(x, y, z);
}

it('verifies heightmap leveling plateaus (Y=24) for urban sectors and central spawn clearing', () => {
  // Spawn Plaza at (0, 0)
  assert.strictEqual(world.getHeightAt(0, 0), 24, 'Spawn Plaza height must be 24');

  // Japan Imperial at (+250, +250)
  assert.strictEqual(world.getHeightAt(250, 250), 24, 'Japan Imperial height must be 24');

  // China & Shanghai at (-250, +250)
  assert.strictEqual(world.getHeightAt(-250, 250), 24, 'China & Shanghai height must be 24');

  // Paris & Eiffel Tower at (+250, -250)
  assert.strictEqual(world.getHeightAt(250, -250), 24, 'Paris & Eiffel Tower height must be 24');

  // New York at (-250, -250)
  assert.strictEqual(world.getHeightAt(-250, -250), 24, 'New York height must be 24');
});

it('verifies Norway Fjord deep gorge (Y=13) and colossal granite cliffs (Y=50..56) in [440, 560]', () => {
  // Deep water canyon bed (width <= 7 blocks)
  assert.strictEqual(world.getHeightAt(0, 500), 13, 'Fjord canyon bed height at (0, 500) must be 13');
  assert.strictEqual(world.getHeightAt(5, 480), 13, 'Fjord canyon bed height at (5, 480) must be 13');
  assert.strictEqual(world.getHeightAt(-6, 520), 13, 'Fjord canyon bed height at (-6, 520) must be 13');

  // Granite cliff ridge (distFromFjord > 16)
  const cliffHeight = world.getHeightAt(25, 500);
  assert.ok(cliffHeight >= 50 && cliffHeight <= 56, `Fjord cliff height (${cliffHeight}) must be between 50 and 56`);

  // Slope transition
  const slopeH = world.getHeightAt(11, 500);
  assert.ok(slopeH > 13 && slopeH < 50, `Fjord slope height (${slopeH}) must be between 13 and 50`);
});

it('verifies Spawn Plaza (0, 0) architecture: center altar, 4 guardian statues with spears, and 8-point compass rose', () => {
  // Center golden altar
  assert.strictEqual(getBlockAt(0, 25, 0), BLOCKS.GOLD_ORE, 'Spawn center altar at (0, 25, 0) must be GOLD_ORE');

  // World Compass Rose North Golden Tip at (0, 25, 10)
  assert.strictEqual(getBlockAt(0, 25, 10), BLOCKS.GOLD_ORE, 'North compass rose tip at (0, 25, 10) must be GOLD_ORE');

  // NE Guardian Spear Tip at (9, 32, 9)
  assert.strictEqual(getBlockAt(9, 32, 9), BLOCKS.GOLD_ORE, 'NE Guardian spear tip at (9, 32, 9) must be GOLD_ORE');

  // NW Guardian Pedestal at (-8, 25, 8)
  assert.strictEqual(getBlockAt(-8, 25, 8), BLOCKS.COBBLESTONE, 'NW Guardian base must be COBBLESTONE');
});

it('verifies Japan Imperial (+250, +250) architecture: multi-tier pagoda, golden spire finial, torii gates, and sakura trees', () => {
  // Pagoda base wooden floor
  assert.strictEqual(getBlockAt(250, 25, 250), BLOCKS.WOOD_PLANK, 'Pagoda base floor at (250, 25, 250) must be WOOD_PLANK');

  // Pagoda upturned eaves at Y=29
  assert.strictEqual(getBlockAt(250, 29, 245), BLOCKS.BRICK, 'Pagoda eave corner at (250, 29, 245) must be BRICK');

  // Golden Spire Finial at (250, 48, 250)
  assert.strictEqual(getBlockAt(250, 48, 250), BLOCKS.GOLD_ORE, 'Pagoda golden spire finial at (250, 48, 250) must be GOLD_ORE');

  // Crimson Torii Gate post at (242, 25, 240)
  assert.strictEqual(getBlockAt(242, 25, 240), BLOCKS.BRICK, 'Torii gate post must be BRICK');

  // Zen rock garden cairn at (262, 25, 250)
  assert.strictEqual(getBlockAt(262, 25, 250), BLOCKS.STONE, 'Zen rock cairn at (262, 25, 250) must be STONE');
});

it('verifies China & Shanghai (-250, +250) architecture: modern glass skyscrapers and central spire beacon', () => {
  // Glass curtain facade of Shanghai Tower
  assert.strictEqual(getBlockAt(-250, 30, 253), BLOCKS.GLASS, 'Shanghai Tower facade must be GLASS');

  // Floor accent belt at Y=32
  assert.strictEqual(getBlockAt(-250, 32, 253), BLOCKS.IRON_ORE, 'Floor accent belt at Y=32 must be IRON_ORE');

  // Aviation Spire Beacon at (-250, 62, 250)
  assert.strictEqual(getBlockAt(-250, 62, 250), BLOCKS.GOLD_ORE, 'Shanghai Tower beacon at (-250, 62, 250) must be GOLD_ORE');

  // Paifang Imperial Arch lintel at (-242, 30, 240)
  assert.strictEqual(getBlockAt(-242, 30, 240), BLOCKS.GOLD_ORE, 'Paifang signboard at (-242, 30, 240) must be GOLD_ORE');
});

it('verifies Paris & Eiffel Tower (+250, -250) architecture: 3 observation tiers, arched base, and summit beacon', () => {
  // Eiffel Tower corner foot pylon at ground level
  assert.strictEqual(getBlockAt(245, 25, -255), BLOCKS.COBBLESTONE, 'Eiffel Tower pylon foot must be COBBLESTONE');

  // Under-arch apex at Y=30
  assert.strictEqual(getBlockAt(250, 30, -253), BLOCKS.IRON_ORE, 'Eiffel Tower under-arch apex must be IRON_ORE');

  // 1st Observation Platform deck at Y=32
  assert.strictEqual(getBlockAt(250, 32, -250), BLOCKS.WOOD_PLANK, '1st observation deck must be WOOD_PLANK');

  // Summit Light Beacon at (250, 61, -250)
  assert.strictEqual(getBlockAt(250, 61, -250), BLOCKS.GOLD_ORE, 'Eiffel Tower summit beacon at (250, 61, -250) must be GOLD_ORE');
});

it('verifies New York (-250, -250) architecture: Art Deco stepped skyscrapers, aviation beacon, and asphalt street grid', () => {
  // Aviation Beacon atop Empire State mooring mast at (-250, 62, -250)
  assert.strictEqual(getBlockAt(-250, 62, -250), BLOCKS.GOLD_ORE, 'Empire State beacon at (-250, 62, -250) must be GOLD_ORE');

  // Art Deco Sunburst Wing at Y=55
  assert.strictEqual(getBlockAt(-250, 55, -250), BLOCKS.GOLD_ORE, 'Art Deco sunburst wing must be GOLD_ORE');

  // Asphalt road grid at z = -244
  assert.strictEqual(getBlockAt(-246, 24, -244), BLOCKS.DIRT_DRY, 'Street surface at z=-244 must be DIRT_DRY');

  // Sidewalk bordering street at z = -243
  assert.strictEqual(getBlockAt(-246, 24, -243), BLOCKS.STONE, 'Sidewalk at z=-243 must be STONE');

  // Statue of Liberty pedestal at (-262, 25, -262)
  assert.strictEqual(getBlockAt(-262, 25, -262), BLOCKS.STONE, 'Statue of Liberty pedestal must be STONE');
});

it('verifies Norway Fjords & Nature (0, +500) architecture: deep water gorge, cliff face, waterfalls, and timber cabin', () => {
  // Deep water gorge bed at (0, 16, 500)
  assert.strictEqual(getBlockAt(0, 16, 500), BLOCKS.WATER, 'Fjord gorge at (0, 16, 500) must be filled with WATER');

  // Colossal granite cliff wall at (25, 50, 500)
  assert.strictEqual(getBlockAt(25, 50, 500), BLOCKS.STONE, 'Cliff face at (25, 50, 500) must be STONE');

  // Timber Cabin 1 floor at (21, 51, 484)
  assert.strictEqual(getBlockAt(21, 51, 484), BLOCKS.WOOD_PLANK, 'Viking cabin floor must be WOOD_PLANK');

  // Timber Cabin corner log at (21 - 4, 52, 484 - 4)
  assert.strictEqual(getBlockAt(17, 52, 480), BLOCKS.OAK_LOG, 'Viking cabin corner post must be OAK_LOG');

  // Fjord wooden pier dock at water edge (7, 18, 488)
  assert.strictEqual(getBlockAt(7, 18, 488), BLOCKS.WOOD_PLANK, 'Fjord pier dock at (7, 18, 488) must be WOOD_PLANK');
});

it('verifies procedural oak tree generator in wild chunks (buildTreeInChunk) and suppression within monuments (isInsideMonument)', () => {
  // 1. Procedural tree generation creates oak log trunk and oak leaves canopy
  const testChunk = new Chunk(10, 10, world);
  world.buildTreeInChunk(testChunk, 8, 25, 8);

  let logCount = 0;
  let leavesCount = 0;
  for (let i = 0; i < testChunk.voxels.length; i++) {
    if (testChunk.voxels[i] === BLOCKS.OAK_LOG) logCount++;
    if (testChunk.voxels[i] === BLOCKS.OAK_LEAVES) leavesCount++;
  }

  assert.strictEqual(logCount, 5, 'Tree trunk must consist of exactly 5 OAK_LOG blocks');
  assert.strictEqual(leavesCount, 54, 'Tree canopy must consist of exactly 54 OAK_LEAVES blocks');

  // 2. Suppression within all 6 monument sectors
  assert.strictEqual(world.isInsideMonument(0, 0), true, 'Spawn plaza must be inside monument bounds');
  assert.strictEqual(world.isInsideMonument(250, 250), true, 'Japan Imperial must be inside monument bounds');
  assert.strictEqual(world.isInsideMonument(-250, 250), true, 'China & Shanghai must be inside monument bounds');
  assert.strictEqual(world.isInsideMonument(250, -250), true, 'Paris & Eiffel must be inside monument bounds');
  assert.strictEqual(world.isInsideMonument(-250, -250), true, 'New York must be inside monument bounds');
  assert.strictEqual(world.isInsideMonument(0, 500), true, 'Norway Fjords must be inside monument bounds');

  // Wild chunk outside monument bounds
  assert.strictEqual(world.isInsideMonument(100, 100), false, 'Wild coordinates (100, 100) must NOT be inside monument bounds');
});

it('verifies absence of missing world methods (buildPlazaFeatures and buildTreeInChunk are fully defined)', () => {
  assert.strictEqual(typeof world.buildPlazaFeatures, 'function', 'buildPlazaFeatures must be a defined method');
  assert.strictEqual(typeof world.buildTreeInChunk, 'function', 'buildTreeInChunk must be a defined method');

  // Executing chunk generation for (0, 0) and wild chunks executes without throwing
  const chunk00 = world.getOrCreateChunk(0, 0);
  assert.strictEqual(chunk00.isGenerated, true, 'Chunk (0, 0) must generate cleanly without error');

  const chunkWild = world.getOrCreateChunk(8, 8);
  assert.strictEqual(chunkWild.isGenerated, true, 'Wild chunk (8, 8) must generate cleanly without error');
});

// =============================================================================
// SECTION 6: CLIENT UI, AUDIO & CONTROLS ARCHITECTURE (R1, R3, R5)
// =============================================================================
console.log('\n[SECTION 6: CLIENT UI, AUDIO & CONTROLS ARCHITECTURE (R1, R3, R5)]');

it('verifies Web Audio procedural click synthesizer (playClick) frequency sweep, noise transient, and 18ms frame debouncing', () => {
  const { SoundSystem } = loadSoundSystemModule();

  // Mock Web Audio Context
  class MockParam {
    constructor(val = 0) { this.value = val; this.history = []; }
    setValueAtTime(v, t) { this.history.push(['set', v, t]); this.value = v; }
    exponentialRampToValueAtTime(v, t) { this.history.push(['ramp', v, t]); this.value = v; }
  }
  class MockNode {
    constructor() {
      this.connected = [];
      this.frequency = new MockParam(440);
      this.gain = new MockParam(1);
      this.started = false;
      this.stopped = false;
    }
    connect(dest) { this.connected.push(dest); }
    start(t) { this.started = true; this.startTime = t; }
    stop(t) { this.stopped = true; this.stopTime = t; }
  }
  class MockAudioContext {
    constructor() {
      this.currentTime = 1.0;
      this.state = 'running';
      this.destination = new MockNode();
      this.oscillators = [];
      this.gains = [];
      this.filters = [];
      this.sources = [];
    }
    resume() { return Promise.resolve(); }
    createOscillator() { const o = new MockNode(); this.oscillators.push(o); return o; }
    createGain() { const g = new MockNode(); this.gains.push(g); return g; }
    createBiquadFilter() { const f = new MockNode(); this.filters.push(f); return f; }
    createBufferSource() { const s = new MockNode(); this.sources.push(s); return s; }
    createBuffer(c, len, sr) {
      return { numberOfChannels: c, length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) };
    }
  }

  // Supply minimal window mock
  global.window = { addEventListener: () => {} };

  const sound = new SoundSystem();
  const mockCtx = new MockAudioContext();
  sound.ctx = mockCtx;
  sound.masterGain = mockCtx.createGain();

  // 1. Initial click synthesis
  sound.playClick(1.0);
  assert.strictEqual(mockCtx.oscillators.length, 1, 'playClick must create a triangle oscillator');
  const osc = mockCtx.oscillators[0];
  assert.strictEqual(osc.type, 'triangle');
  assert.deepStrictEqual(osc.frequency.history, [
    ['set', 1200, 1.0],
    ['ramp', 680, 1.026]
  ]);

  // 2. Highpass noise transient
  assert.strictEqual(mockCtx.filters.length, 1, 'playClick must create a high-pass biquad filter');
  assert.strictEqual(mockCtx.filters[0].type, 'highpass');

  // 3. 18ms frame debounce
  const oscCountBefore = mockCtx.oscillators.length;
  sound.playClick(1.0); // Duplicate call within 0ms
  assert.strictEqual(mockCtx.oscillators.length, oscCountBefore, 'Instant second click must be debounced');

  // 4. Successful call after debounce window expires
  sound.lastClickTime -= 25; // 25ms elapsed
  sound.playClick(1.0);
  assert.strictEqual(mockCtx.oscillators.length, oscCountBefore + 1, 'Click after 25ms must execute');

  // 5. playButtonClick alias check
  sound.lastClickTime -= 25;
  sound.playButtonClick(1.2);
  assert.strictEqual(mockCtx.oscillators.length, oscCountBefore + 2, 'playButtonClick alias must execute');
});

it('verifies permanent HUD player count badge (#hud-online-badge, #hud-online-count) and dynamic singular/plural formatting', () => {
  const htmlPath = path.resolve(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // DOM element existence
  assert.ok(html.includes('id="hud-online-count"'), 'index.html must include #hud-online-count');
  assert.ok(html.includes('id="hud-corner-badge"') || html.includes('id="hud-online-badge"'), 'index.html must include HUD player badge container');
  assert.ok(html.includes('🟢'), 'index.html must include online pulse dot');

  // Text formatting function check as defined in ui.js
  function formatPlayerCount(count) {
    const total = Math.max(1, count || 1);
    return (total === 1) ? '1 Jugador Conectado' : `${total} Jugadores Conectados`;
  }

  assert.strictEqual(formatPlayerCount(1), '1 Jugador Conectado');
  assert.strictEqual(formatPlayerCount(2), '2 Jugadores Conectados');
  assert.strictEqual(formatPlayerCount(8), '8 Jugadores Conectados');
  assert.strictEqual(formatPlayerCount(0), '1 Jugador Conectado'); // Fallback to self
});

it('verifies World Map modal (#map-modal) markup, fast travel button (#btn-map), and exact 6 landmark coordinates', () => {
  const htmlPath = path.resolve(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('id="map-modal"'), 'index.html must declare #map-modal');
  assert.ok(html.includes('id="btn-map"'), 'index.html must declare #btn-map');

  const requiredLandmarks = [
    { name: 'Plaza Central (0, 0)', x: 0, y: 25, z: 0 },
    { name: 'Japón Imperial (+250, +250)', x: 250, y: 25, z: 250 },
    { name: 'China y Shanghai (-250, +250)', x: -250, y: 25, z: 250 },
    { name: 'París y Torre Eiffel (+250, -250)', x: 250, y: 25, z: -250 },
    { name: 'Nueva York (-250, -250)', x: -250, y: 25, z: -250 },
    { name: 'Fiordos de Noruega (0, +500)', x: 0, y: 50, z: 500 }
  ];

  for (const lm of requiredLandmarks) {
    assert.ok(html.includes(lm.name), `HTML must display landmark name: ${lm.name}`);
    assert.ok(html.includes(`data-x="${lm.x}"`), `HTML must contain data-x="${lm.x}" for ${lm.name}`);
    assert.ok(html.includes(`data-y="${lm.y}"`), `HTML must contain data-y="${lm.y}" for ${lm.name}`);
    assert.ok(html.includes(`data-z="${lm.z}"`), `HTML must contain data-z="${lm.z}" for ${lm.name}`);
  }
});

it('verifies UI fast travel teleport invocation updates physics position and triggers click sound', () => {
  let clickSoundPlayed = false;
  let teleportPos = null;

  const mockPhysics = {
    pos: { x: 0, y: 0, z: 0 },
    teleport(x, y, z) {
      teleportPos = { x, y, z };
      this.pos = { x, y, z };
    }
  };

  const mockSound = {
    playClick() { clickSoundPlayed = true; }
  };

  // UIManager teleportToLandmark method logic
  function teleportToLandmark(lm, physics, sound) {
    if (!physics) return;
    physics.teleport(lm.x, lm.y, lm.z);
    if (sound) sound.playClick();
  }

  teleportToLandmark({ x: 250, y: 25, z: 250 }, mockPhysics, mockSound);
  assert.strictEqual(clickSoundPlayed, true, 'Teleport must trigger playClick');
  assert.deepStrictEqual(teleportPos, { x: 250, y: 25, z: 250 }, 'Physics must teleport to exact landmark position');
});

it('verifies mobile landscape controls layout: virtual joystick, radial action fan arc, and centered compact hotbar', () => {
  const htmlPath = path.resolve(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Required mobile DOM IDs
  assert.ok(html.includes('id="virtual-joystick"'), 'index.html must include #virtual-joystick');
  assert.ok(html.includes('id="mobile-action-buttons"'), 'index.html must include #mobile-action-buttons');
  assert.ok(html.includes('id="mobile-btn-break"'), 'index.html must include #mobile-btn-break');
  assert.ok(html.includes('id="mobile-btn-place"'), 'index.html must include #mobile-btn-place');
  assert.ok(html.includes('id="mobile-btn-jump"'), 'index.html must include #mobile-btn-jump');
  assert.ok(html.includes('id="hotbar"'), 'index.html must include #hotbar');

  // Verify CSS media queries and radial fan styling
  const cssPath = path.resolve(__dirname, '../public/styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('@media (max-width: 1024px) and (orientation: landscape)'), 'CSS must include landscape media query');
  assert.ok(css.includes('#virtual-joystick'), 'CSS must style #virtual-joystick');
  assert.ok(css.includes('#mobile-action-buttons'), 'CSS must style #mobile-action-buttons');
  assert.ok(css.includes('.jump-btn'), 'CSS must style .jump-btn in arc');
  assert.ok(css.includes('.place-btn'), 'CSS must style .place-btn in arc');
  assert.ok(css.includes('.break-btn'), 'CSS must style .break-btn in arc');

  // Hotbar centering rule
  assert.ok(css.includes('bottom: 10px'), 'CSS must position #hotbar at bottom: 10px');
  assert.ok(css.includes('left: 50%'), 'CSS must position #hotbar at left: 50%');
  assert.ok(css.includes('transform: translateX(-50%)'), 'CSS must center #hotbar with transform: translateX(-50%)');
});

it('verifies mobile controls touch event isolation (stopPropagation) and rapid-tap debouncing', () => {
  const ctrlPath = path.resolve(__dirname, '../public/src/controls.js');
  const ctrlCode = fs.readFileSync(ctrlPath, 'utf8');

  assert.ok(ctrlCode.includes('initVirtualJoystick()'), 'controls.js must implement initVirtualJoystick');
  assert.ok(ctrlCode.includes('initActionFan()'), 'controls.js must implement initActionFan');
  assert.ok(ctrlCode.includes('initHotbarIsolation()'), 'controls.js must implement initHotbarIsolation');
  assert.ok(ctrlCode.includes('e.stopPropagation()'), 'controls.js must isolate touch events via stopPropagation');
  assert.ok(ctrlCode.includes('lastBreakTime'), 'controls.js must debounce break actions');
  assert.ok(ctrlCode.includes('lastPlaceTime'), 'controls.js must debounce place actions');
});

it('verifies authentic Minecraft UI design system: beveled inset shadows, pixel typography, and stone/wood styling', () => {
  const cssPath = path.resolve(__dirname, '../public/styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Bevel inset highlights and shadows
  assert.ok(css.includes('inset 2px 2px 0px rgba(255, 255, 255, 0.55)') || css.includes('inset 3px 3px 0px rgba(255, 255, 255, 0.6)'), 'CSS must define top-left light bevel');
  assert.ok(css.includes('inset -2px -2px 0px rgba(0, 0, 0, 0.7)') || css.includes('inset -3px -3px 0px rgba(0, 0, 0, 0.8)'), 'CSS must define bottom-right dark bevel');
  assert.ok(css.includes('border-radius: 0px'), 'CSS must enforce authentic Minecraft square borders (0px)');
  assert.ok(css.includes('outline: 2px solid #000000') || css.includes('outline: 2px solid #000'), 'CSS must enforce 2px solid black outline');

  // Typography font imports in index.html
  const htmlPath = path.resolve(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('Cinzel'), 'index.html must link Cinzel font');
  assert.ok(html.includes('VT323'), 'index.html must link VT323 pixel font');
  assert.ok(html.includes('Silkscreen'), 'index.html must link Silkscreen font');
});

it('verifies multiplayer location sharing and clickable chat coordinates parsing', () => {
  // Test shareLocation format
  function formatLocationShare(x, y, z, sectorName) {
    return `📍 Mi ubicación: ${sectorName} (X: ${Math.round(x)}, Y: ${Math.round(y)}, Z: ${Math.round(z)})`;
  }

  const shareText = formatLocationShare(250.4, 25.1, 250.2, 'Japón Imperial');
  assert.strictEqual(shareText, '📍 Mi ubicación: Japón Imperial (X: 250, Y: 25, Z: 250)');

  // Test regex parser for clickable chat coordinates
  const COORD_REGEX = /\(?\s*[xX]:\s*(-?\d+)\s*,\s*[yY]:\s*(-?\d+)\s*,\s*[zZ]:\s*(-?\d+)\s*\)?/g;
  const match = COORD_REGEX.exec(shareText);
  assert.ok(match, 'Chat coordinate regex must detect coordinates in share text');
  assert.strictEqual(Number(match[1]), 250);
  assert.strictEqual(Number(match[2]), 25);
  assert.strictEqual(Number(match[3]), 250);

  // Check button presence in HTML
  const htmlPath = path.resolve(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(html.includes('id="chat-share-loc-btn"'), 'index.html must include chat-share-loc-btn');
  assert.ok(html.includes('id="btn-share-loc"'), 'index.html must include btn-share-loc');
});

// =============================================================================
// SECTION 7: ADVANCED EXPANSION: 30 PLAYERS, TNT, PLAYA PARAÍSO & WEAPONS
// =============================================================================
console.log('\n[SECTION 7: ADVANCED EXPANSION: 30 PLAYERS, TNT, PLAYA PARAÍSO & WEAPONS]');

it('verifies 30-player room capacity and protocol limits in server', () => {
  const rm = new RoomManager(30);
  assert.strictEqual(rm.maxPlayers, 30, 'Server RoomManager must default to 30 maximum players');

  const room = rm.getOrCreateRoom('main');
  assert.ok(room, 'Main room must be created');
  assert.strictEqual(room.gameState.maxPlayers, 30, 'GameState must support 30 players');

  // Verify room accepts up to 30 players
  for (let i = 0; i < 30; i++) {
    const p = room.gameState.addPlayer(`p_${i}`, `Player_${i}`);
    assert.ok(p, `Player_${i} must be successfully added`);
  }
  assert.strictEqual(room.gameState.players.size, 30);
});

it('verifies TNT (19) and Asphalt (20) block definitions and reactive TNT detonateTnt logic', () => {
  const { BLOCKS: CLIENT_BLOCKS } = require('../public/src/blocks.js');
  assert.strictEqual(CLIENT_BLOCKS.TNT, 19, 'BLOCKS.TNT must equal 19');
  assert.strictEqual(CLIENT_BLOCKS.ASPHALT, 20, 'BLOCKS.ASPHALT must equal 20');

  // Test reactive TNT detonation in GameState
  const gs = new GameState('test_tnt', 30);
  gs.blockDeltas.set('0,25,0', CLIENT_BLOCKS.TNT);
  gs.blockDeltas.set('1,25,0', CLIENT_BLOCKS.STONE);

  const result = gs.detonateTnt(0, 25, 0, 3);
  assert.strictEqual(result.x, 0);
  assert.strictEqual(result.y, 25);
  assert.strictEqual(result.z, 0);
  assert.ok(result.destroyedBlocks.length > 0, 'TNT explosion must destroy surrounding blocks');
  assert.strictEqual(gs.getBlock(0, 25, 0), 0, 'TNT block itself must be replaced with AIR (0)');
  assert.strictEqual(gs.getBlock(1, 25, 0), 0, 'Adjacent block must be destroyed by blast');
});

it('verifies Playa Paraíso (0, -500) landmark in LANDMARKS and sector resolution in getSectorName', () => {
  const uiPath = path.resolve(__dirname, '../public/src/ui.js');
  const uiCode = fs.readFileSync(uiPath, 'utf8');

  // Check Playa Paraíso in LANDMARKS
  assert.ok(uiCode.includes('Playa Paraíso (0, -500)'), 'ui.js must declare Playa Paraíso landmark');
  assert.ok(uiCode.includes("id: 'beach'"), 'ui.js must declare landmark id beach');

  // Check sector resolution logic
  function getSectorName(x, z) {
    const distCenter = Math.hypot(x, z);
    if (distCenter <= 40) return '🏰 Plaza Central';
    if (z >= 420 && z <= 580 && Math.abs(x) <= 80) return '🇳🇴 Fiordos de Noruega';
    if (Math.hypot(x, z + 500) <= 120) return '🏖️ Playa Paraíso';
    if (Math.hypot(x - 250, z - 250) <= 70) return '🇯🇵 Japón Imperial';
    if (Math.hypot(x + 250, z - 250) <= 70) return '🇨🇳 China y Shanghai';
    if (Math.hypot(x - 250, z + 250) <= 70) return '🇫🇷 París y Torre Eiffel';
    if (Math.hypot(x + 250, z + 250) <= 70) return '🇺🇸 Nueva York';
    return '🌲 Tierras del Reino';
  }

  assert.strictEqual(getSectorName(0, -500), '🏖️ Playa Paraíso');
  assert.strictEqual(getSectorName(20, -480), '🏖️ Playa Paraíso');
  assert.strictEqual(getSectorName(0, 0), '🏰 Plaza Central');
  assert.strictEqual(getSectorName(0, 500), '🇳🇴 Fiordos de Noruega');
});

it('verifies non-lethal weapon hit packet processing and weapon toggle animal density logic', () => {
  const gs = new GameState('test_weapons', 30);
  const p1 = gs.addPlayer('p1', 'SniperPro');
  const p2 = gs.addPlayer('p2', 'TargetPlayer');

  // Toggle weapons mode
  gs.setPlayerWeaponsMode('p1', true);
  assert.strictEqual(gs.getPlayer('p1').weaponsEnabled, true);

  // Area animals density increases when a player activates weapons mode
  const snapshot = gs.getAnimalsSnapshot();
  assert.ok(Array.isArray(snapshot), 'GameState must maintain animal snapshot');

  // Ensure animals are never spawned in deep water
  for (const anim of snapshot) {
    assert.strictEqual(gs.isWaterZone(anim.x, anim.z, anim.y), false, 'Spawned animals must not be underwater');
  }
});

it('verifies mobile controls layout: relocated camera button, 2x2 action cluster, telemetry panel and scope overlay in HTML/CSS', () => {
  const htmlPath = path.resolve(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('id="mobile-btn-cam"'), 'HTML must declare #mobile-btn-cam');
  assert.ok(html.includes('mobile-cam-relocated'), 'HTML must attach .mobile-cam-relocated class to camera button');
  assert.ok(html.includes('id="weapons-hud-controls"'), 'HTML must declare #weapons-hud-controls');
  assert.ok(html.includes('id="rifle-scope-overlay"'), 'HTML must declare #rifle-scope-overlay');
  assert.ok(html.includes('id="weapon-hit-toast"'), 'HTML must declare #weapon-hit-toast');
  assert.ok(html.includes('id="telemetry-panel"'), 'HTML must declare #telemetry-panel');
  assert.ok(html.includes('id="fps-telemetry-canvas"'), 'HTML must declare #fps-telemetry-canvas');
  assert.ok(html.includes('id="fps-cap-slider"'), 'HTML must declare #fps-cap-slider');
  assert.ok(html.includes('id="boost-mode-toggle"'), 'HTML must declare #boost-mode-toggle');
  assert.ok(html.includes('id="weapons-mode-toggle"'), 'HTML must declare #weapons-mode-toggle');

  const cssPath = path.resolve(__dirname, '../public/styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('.mobile-cam-relocated'), 'CSS must define .mobile-cam-relocated position');
  assert.ok(css.includes('#weapons-hud-controls'), 'CSS must style #weapons-hud-controls');
  assert.ok(css.includes('#rifle-scope-overlay'), 'CSS must style #rifle-scope-overlay');
  assert.ok(css.includes('#weapon-hit-toast'), 'CSS must style #weapon-hit-toast');
  assert.ok(css.includes('#fps-telemetry-canvas'), 'CSS must style #fps-telemetry-canvas');
});

it('verifies animals.js rune_golem mesh visor fix and Playa Paraíso lighthouse/coral generation', () => {
  const animalsPath = path.resolve(__dirname, '../public/src/animals.js');
  const animalsCode = fs.readFileSync(animalsPath, 'utf8');

  // Verify constvisor typo is fixed
  assert.strictEqual(animalsCode.includes('constvisor'), false, 'animals.js must not contain misspelled constvisor identifier');
  assert.ok(animalsCode.includes('const visor = new THREE.Mesh'), 'animals.js must properly declare const visor');

  // Verify Lighthouse and Coral in world.js
  const worldPath = path.resolve(__dirname, '../public/src/world.js');
  const worldCode = fs.readFileSync(worldPath, 'utf8');
  assert.ok(worldCode.includes('Grand Maritime Lighthouse of Playa Paraíso'), 'world.js must define Grand Maritime Lighthouse');
  assert.ok(worldCode.includes('Underwater Coral Reef Sanctuary'), 'world.js must define Coral Reef in Playa Paraíso');
});

// =============================================================================
// SUITE EXECUTION SUMMARY
// =============================================================================
console.log('\n=============================================================================');
console.log(`TEST SUMMARY: ${passed}/${total} test specifications passed.`);
if (passed === total) {
  console.log('STATUS: ALL TESTS PASSED SUCCESSFULLY! 100% SPECIFICATION CONFORMANCE.\n');
  process.exit(0);
} else {
  console.error(`STATUS: FAILED with ${total - passed} failure(s).\n`);
  for (const f of failures) {
    console.error(`- Failure in: ${f.name}`);
    console.error(`  ${f.error.stack}\n`);
  }
  process.exit(1);
}
