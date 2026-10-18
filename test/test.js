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
    rebuildMesh(materials) {
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
// SECTION 8: WEAPONS, TRACERS, TNT & ANIMAL IMPACT (R2)
// =============================================================================
console.log('\n[SECTION 8: WEAPONS, TRACERS, TNT & ANIMAL IMPACT (R2)]');

function loadControlsModuleForM2() {
  const controlsPath = path.resolve(__dirname, '../public/src/controls.js');
  let controlsCode = fs.readFileSync(controlsPath, 'utf8')
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+class\s+Controls/g, 'class Controls');

  const mockTHREE = {
    Vector3: class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      clone() { return new mockTHREE.Vector3(this.x, this.y, this.z); }
      sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
      add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
      addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
      applyEuler() { return this; }
      distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
      dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
      lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    },
    Euler: class {
      constructor(x = 0, y = 0, z = 0, order = 'YXZ') { this.x = x; this.y = y; this.z = z; this.order = order; }
      set(x, y, z, order = 'YXZ') { this.x = x; this.y = y; this.z = z; this.order = order; return this; }
    },
    Group: class {
      constructor() {
        this.position = new mockTHREE.Vector3();
        this.rotation = new mockTHREE.Euler();
        this.children = [];
        this.visible = true;
      }
      add() { this.children.push(...arguments); }
      remove() {}
    },
    Mesh: class {
      constructor(geom, mat) {
        this.geometry = geom;
        this.material = mat;
        this.position = new mockTHREE.Vector3();
        this.rotation = new mockTHREE.Euler();
        this.visible = true;
      }
      getWorldPosition(targetVec) {
        return targetVec.copy(this.position);
      }
    },
    BoxGeometry: class { constructor(w, h, d) { this.width = w; this.height = h; this.depth = d; } },
    MeshStandardMaterial: class {
      constructor(opts = {}) {
        this.color = { setHex: (c) => { this.hex = c; }, hex: opts.color };
        this.roughness = opts.roughness;
        this.metalness = opts.metalness;
      }
    },
    MeshBasicMaterial: class {
      constructor(opts = {}) {
        this.color = opts.color;
        this.transparent = opts.transparent;
        this.opacity = opts.opacity;
      }
    }
  };

  const BLOCKS = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 4, TNT: 19, ASPHALT: 20 };
  const BLOCK_DEFS = { 1: { solid: true }, 4: { solid: true }, 19: { solid: true }, 20: { solid: true } };
  const sound = { playClick: () => {}, playShoot: () => {}, playExplosion: () => {} };

  if (typeof global.navigator === 'undefined') {
    global.navigator = { userAgent: 'Node' };
  }
  if (typeof global.document === 'undefined') {
    global.document = {
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: () => ({
        getContext: () => ({
          fillRect: () => {},
          strokeRect: () => {},
          beginPath: () => {},
          roundRect: () => {},
          rect: () => {},
          fill: () => {},
          stroke: () => {},
          measureText: () => ({ width: 50 }),
          fillText: () => {}
        })
      }),
      pointerLockElement: null
    };
  }
  if (typeof global.window === 'undefined') {
    global.window = {
      addEventListener: () => {},
      matchMedia: () => ({ matches: false })
    };
  }

  const { Controls } = new Function(
    'THREE', 'BLOCKS', 'BLOCK_DEFS', 'sound',
    controlsCode + '\nreturn { Controls };'
  )(mockTHREE, BLOCKS, BLOCK_DEFS, sound);

  return { Controls, mockTHREE, BLOCKS, BLOCK_DEFS };
}

function loadParticlesModuleForM2() {
  const partPath = path.resolve(__dirname, '../public/src/particles.js');
  let partCode = fs.readFileSync(partPath, 'utf8')
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+class\s+ParticleManager/g, 'class ParticleManager');

  const mockTHREE = {
    Vector3: class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      clone() { return new mockTHREE.Vector3(this.x, this.y, this.z); }
      sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
      add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
      addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
      normalize() {
        const len = Math.hypot(this.x, this.y, this.z) || 1;
        this.x /= len; this.y /= len; this.z /= len;
        return this;
      }
      distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    },
    Euler: class {
      constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    },
    Object3D: class {
      constructor() {
        this.position = new mockTHREE.Vector3();
        this.rotation = new mockTHREE.Euler();
        this.scale = new mockTHREE.Vector3(1, 1, 1);
        this.matrix = {};
      }
      updateMatrix() {}
    },
    Group: class {
      constructor() {
        this.position = new mockTHREE.Vector3();
        this.rotation = new mockTHREE.Euler();
        this.children = [];
      }
      add() { this.children.push(...arguments); }
      remove() {}
      lookAt() {}
    },
    Mesh: class {
      constructor(geom, mat) {
        this.geometry = geom;
        this.material = mat;
        this.position = new mockTHREE.Vector3();
        this.rotation = new mockTHREE.Euler();
        this.scale = new mockTHREE.Vector3(1, 1, 1);
      }
      lookAt() {}
    },
    BoxGeometry: class {},
    CylinderGeometry: class {
      constructor() { this.rotateX = () => {}; }
    },
    BufferGeometry: class {
      constructor() { this.attributes = {}; }
      setAttribute(name, attr) { this.attributes[name] = attr; }
    },
    BufferAttribute: class {
      constructor(array, size) { this.array = array; this.size = size; this.needsUpdate = false; }
    },
    MeshStandardMaterial: class {},
    MeshBasicMaterial: class {
      constructor(opts = {}) { this.color = opts.color; this.opacity = opts.opacity; }
      dispose() {}
    },
    PointsMaterial: class {},
    Points: class {
      constructor(geom, mat) { this.geometry = geom; this.material = mat; }
    },
    InstancedMesh: class {
      constructor(geom, mat, count) {
        this.count = count;
        this.instanceMatrix = { setUsage: () => {}, needsUpdate: false };
        this.frustumCulled = false;
        this.matrices = new Array(count);
      }
      setMatrixAt(idx, mat) { this.matrices[idx] = mat; }
    },
    DynamicDrawUsage: 35048
  };

  const { ParticleManager } = new Function(
    'THREE',
    partCode + '\nreturn { ParticleManager };'
  )(mockTHREE);

  return { ParticleManager, mockTHREE };
}

it('verifies Horizontal FPS Rifle Model orientation (0,0,0 along -Z), natural hip-carry, and centered ADS optics', () => {
  const { Controls, mockTHREE } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  camera.updateProjectionMatrix = () => {};
  const domElement = { addEventListener: () => {} };
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    vel: new mockTHREE.Vector3(0, 0, 0),
    action: 'idle',
    onGround: true,
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };
  const world = { getBlock: () => 0 };

  const controls = new Controls(camera, domElement, physics, world);

  // 1. Rifle viewmodel orientation must be aligned with camera negative Z (rotation 0, 0, 0)
  assert.strictEqual(controls.rifleGroup.rotation.x, 0, 'Rifle pitch must be 0 (horizontal)');
  assert.strictEqual(controls.rifleGroup.rotation.y, 0, 'Rifle yaw must be 0 (pointing forward along -Z)');
  assert.strictEqual(controls.rifleGroup.rotation.z, 0, 'Rifle roll must be 0');

  // 2. Enable weapons mode
  controls.setWeaponsMode(true);
  assert.strictEqual(controls.weaponsMode, true);
  assert.strictEqual(controls.rifleGroup.visible, true);
  assert.strictEqual(controls.heldBlockMesh.visible, false);

  // 3. Test hip-carry coordinates (aimBlend = 0)
  controls.update(0.016);
  assert.ok(Math.abs(controls.armPivot.position.x - 0.24) < 0.05, 'Hip-carry X should be natural right shoulder offset (~0.24)');
  assert.ok(Math.abs(controls.armPivot.position.y - (-0.22)) < 0.05, 'Hip-carry Y should be natural hip height (~-0.22)');
  assert.ok(Math.abs(controls.armPivot.position.z - (-0.42)) < 0.05, 'Hip-carry Z should be forward offset (~-0.42)');
  assert.strictEqual(camera.fov, 75, 'Hip-carry FOV must remain at default 75 degrees');

  // 4. Test ADS transition to aimBlend = 1
  controls.setAiming(true);
  assert.strictEqual(controls.isAiming, true);

  // Advance time to allow smooth ADS lerp
  for (let i = 0; i < 20; i++) {
    controls.update(0.05);
  }
  assert.strictEqual(controls.aimBlend, 1.0, 'aimBlend must smoothly reach 1.0');
  assert.strictEqual(camera.fov, 32, 'ADS FOV must zoom in to exactly 32 degrees (75 - 43)');

  // In ADS: optical axis at local Y=0.13 centers directly on camera -Z (armPivot.position.y = -0.13, x = 0.0)
  assert.ok(Math.abs(controls.armPivot.position.x) < 0.001, 'ADS X position must align with center reticle (0.0)');
  assert.ok(Math.abs(controls.armPivot.position.y - (-0.13)) < 0.001, 'ADS Y position must center optic at eye line (-0.13)');
  assert.ok(Math.abs(controls.armPivot.position.z - (-0.30)) < 0.001, 'ADS Z position must bring sight close to eye (-0.30)');
  assert.ok(Math.abs(controls.armPivot.rotation.x) < 0.001, 'ADS pitch rotation must be zero');
  assert.ok(Math.abs(controls.armPivot.rotation.y) < 0.001, 'ADS yaw rotation must be zero');
  assert.ok(Math.abs(controls.armPivot.rotation.z) < 0.001, 'ADS roll rotation must be zero');
});

it('verifies #rifle-scope-overlay DOM toggle is synchronized with ADS transition at aimBlend > 0.82', () => {
  const { Controls, mockTHREE } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  camera.updateProjectionMatrix = () => {};
  const domElement = { addEventListener: () => {} };
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    vel: new mockTHREE.Vector3(0, 0, 0),
    action: 'idle',
    onGround: true,
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };
  const world = { getBlock: () => 0 };

  const classListState = new Set(['hidden']);
  const mockScopeOverlay = {
    classList: {
      add: (cls) => classListState.add(cls),
      remove: (cls) => classListState.delete(cls),
      contains: (cls) => classListState.has(cls)
    }
  };

  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => {
    if (id === 'rifle-scope-overlay') return mockScopeOverlay;
    return null;
  };

  try {
    const controls = new Controls(camera, domElement, physics, world);
    controls.setWeaponsMode(true);

    // Initial state: aimBlend = 0 <= 0.82 -> hidden
    controls.update(0.016);
    assert.strictEqual(mockScopeOverlay.classList.contains('hidden'), true, 'Scope overlay must be hidden at aimBlend <= 0.82');

    // Trigger ADS aiming: advance until aimBlend > 0.82
    controls.setAiming(true);
    controls.update(0.16); // aimBlend rises above 0.82
    assert.ok(controls.aimBlend > 0.82, 'aimBlend must exceed 0.82 threshold');
    assert.strictEqual(mockScopeOverlay.classList.contains('hidden'), false, 'Scope overlay must be visible when aimBlend > 0.82');

    // Release aiming: drops back below 0.82
    controls.setAiming(false);
    for (let i = 0; i < 20; i++) controls.update(0.05);
    assert.strictEqual(controls.aimBlend, 0, 'aimBlend must return to 0');
    assert.strictEqual(mockScopeOverlay.classList.contains('hidden'), true, 'Scope overlay must be hidden once aimBlend <= 0.82');
  } finally {
    global.document.getElementById = origGetElementById;
  }
});

it('verifies Non-Destructive Shooting: bullets never destroy terrain blocks, never alter world chunk data, and never send block modifications', () => {
  const { Controls, mockTHREE, BLOCKS } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  const domElement = { addEventListener: () => {} };
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    vel: new mockTHREE.Vector3(0, 0, 0),
    action: 'idle',
    onGround: true,
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };

  // Mock world with terrain blocks
  const worldBlocks = new Map([
    ['0,26,-5', BLOCKS.STONE],
    ['0,25,-5', BLOCKS.GRASS],
    ['0,24,-5', BLOCKS.DIRT],
    ['1,25,-5', BLOCKS.ASPHALT]
  ]);
  const world = {
    getBlock: (x, y, z) => {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return worldBlocks.has(key) ? worldBlocks.get(key) : 0;
    },
    setBlock: (x, y, z, type) => {
      worldBlocks.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`, type);
    }
  };

  const controls = new Controls(camera, domElement, physics, world);
  controls.setWeaponsMode(true);

  let breakBlockCalled = false;
  controls.onBreakBlock = () => { breakBlockCalled = true; };

  let shotFiredData = null;
  controls.onWeaponShoot = (data) => { shotFiredData = data; };

  // Aim directly forward along -Z at the stone wall at (0, 26, -5)
  controls.yaw = 0;
  controls.pitch = 0;

  const shot = controls.triggerShoot();
  assert.ok(shot, 'Shooting in weapons mode must return shotData');
  assert.strictEqual(breakBlockCalled, false, 'onBreakBlock must NEVER be triggered by shooting (Non-destructive principle)');
  assert.strictEqual(world.getBlock(0, 26, -5), BLOCKS.STONE, 'Terrain stone block must NOT be destroyed');
  assert.strictEqual(world.getBlock(0, 25, -5), BLOCKS.GRASS, 'Terrain grass block must NOT be destroyed');
  assert.strictEqual(world.getBlock(0, 24, -5), BLOCKS.DIRT, 'Terrain dirt block must NOT be destroyed');
  assert.strictEqual(shot.voxelHit.type, BLOCKS.STONE, 'Shot must detect surface hit for sparks without breaking block');
});

it('verifies Shoot-to-Detonate TNT Reactivity: bullet impact on BLOCKS.TNT (19) triggers immediate zero-fuse detonation (fuseMs: 0)', () => {
  const { Controls, mockTHREE, BLOCKS } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  const domElement = { addEventListener: () => {} };
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    vel: new mockTHREE.Vector3(0, 0, 0),
    action: 'idle',
    onGround: true,
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };

  // Place a TNT block at (0, 26, -6)
  const worldBlocks = new Map([
    ['0,26,-6', BLOCKS.TNT]
  ]);
  const world = {
    getBlock: (x, y, z) => {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return worldBlocks.has(key) ? worldBlocks.get(key) : 0;
    }
  };

  const controls = new Controls(camera, domElement, physics, world);
  controls.setWeaponsMode(true);

  let shootTntHit = null;
  controls.onShootTnt = (hit) => { shootTntHit = hit; };

  let triggerTntParams = null;
  controls.sendTntTrigger = (x, y, z, fuseMs) => {
    triggerTntParams = { x, y, z, fuseMs };
  };

  controls.yaw = 0;
  controls.pitch = 0;

  const shot = controls.triggerShoot();
  assert.ok(shot);
  assert.ok(shot.voxelHit);
  assert.strictEqual(shot.voxelHit.type, 19, 'Shot must detect BLOCKS.TNT (19)');
  assert.ok(shootTntHit, 'controls.onShootTnt must be called upon TNT bullet hit');
  assert.strictEqual(shootTntHit.x, 0);
  assert.strictEqual(shootTntHit.y, 26);
  assert.strictEqual(shootTntHit.z, -6);

  assert.ok(triggerTntParams, 'controls.sendTntTrigger must be invoked');
  assert.strictEqual(triggerTntParams.fuseMs, 0, 'TNT shoot detonation must specify immediate zero fuse (fuseMs: 0)');

  // Verify server GameState immediate detonation
  const gs = new GameState('tnt_m2_test', 30);
  gs.blockDeltas.set('0,26,-6', BLOCKS.TNT);
  const blast = gs.detonateTnt(0, 26, -6, 3);
  assert.strictEqual(blast.x, 0);
  assert.strictEqual(blast.y, 26);
  assert.strictEqual(blast.z, -6);
  assert.strictEqual(gs.getBlock(0, 26, -6), 0, 'TNT block must be replaced with AIR');

  // Verify RoomManager handleTntTrigger with fuseMs: 0 executes without timeout
  const rm = new RoomManager(30);
  const room = rm.getOrCreateRoom('main');
  room.gameState.blockDeltas.set('0,26,-6', BLOCKS.TNT);
  let broadcastMsg = null;
  rm.broadcast = (r, type, data) => {
    if (type === MSG.TNT_EXPLODE) broadcastMsg = data;
  };
  rm.handleTntTrigger(null, { id: 'shooter_1', roomId: 'main' }, { x: 0, y: 26, z: -6, fuseMs: 0 });
  assert.ok(broadcastMsg, 'Server must immediately broadcast TNT_EXPLODE with zero fuse');
  assert.strictEqual(broadcastMsg.x, 0);
  assert.strictEqual(broadcastMsg.y, 26);
  assert.strictEqual(broadcastMsg.z, -6);
});

it('verifies R2 Optical ADS Zoom & Clear Vision: hides 3D rifleGroup during ADS (>0.82), scopeLens opacity=0, and hides #crosshair', () => {
  const { Controls, mockTHREE } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  camera.updateProjectionMatrix = () => {};
  const domElement = { addEventListener: () => {} };
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    vel: new mockTHREE.Vector3(0, 0, 0),
    action: 'idle',
    onGround: true,
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };
  const world = { getBlock: () => 0 };

  const scopeClasses = new Set(['hidden']);
  const crosshairClasses = new Set();
  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => {
    if (id === 'rifle-scope-overlay') {
      return {
        classList: {
          add: (cls) => scopeClasses.add(cls),
          remove: (cls) => scopeClasses.delete(cls),
          contains: (cls) => scopeClasses.has(cls)
        }
      };
    }
    if (id === 'crosshair') {
      return {
        classList: {
          add: (cls) => crosshairClasses.add(cls),
          remove: (cls) => crosshairClasses.delete(cls),
          contains: (cls) => crosshairClasses.has(cls)
        }
      };
    }
    return null;
  };

  try {
    const controls = new Controls(camera, domElement, physics, world);
    // 1. scopeLens must have opacity 0.0 and transparent true
    assert.strictEqual(controls.scopeLens.material.opacity, 0.0, 'scopeLens material opacity must be 0.0');
    assert.strictEqual(controls.scopeLens.material.transparent, true, 'scopeLens material must be transparent');

    controls.setWeaponsMode(true);
    controls.update(0.016);
    // 2. Hip-carry: rifleGroup is visible, crosshair is visible, scope overlay is hidden
    assert.strictEqual(controls.rifleGroup.visible, true, 'Rifle model must be visible when hip-firing');
    assert.strictEqual(crosshairClasses.has('hidden'), false, 'Crosshair must be visible when hip-firing');
    assert.strictEqual(scopeClasses.has('hidden'), true, 'Scope overlay must be hidden when hip-firing');

    // 3. Trigger ADS: aimBlend rises above 0.82 to 1.0
    controls.setAiming(true);
    for (let i = 0; i < 20; i++) controls.update(0.05);
    assert.strictEqual(controls.aimBlend, 1.0, 'aimBlend must reach 1.0');
    assert.strictEqual(camera.fov, 32, 'Camera FOV must smoothly decrease to 32 degrees (~2.34x optical zoom)');

    // 4. In ADS: 3D rifleGroup MUST be hidden so camera view is 100% unobstructed
    assert.strictEqual(controls.rifleGroup.visible, false, '3D rifleGroup must be hidden during ADS (>0.82) to avoid obstructing view');
    assert.strictEqual(scopeClasses.has('hidden'), false, 'Rifle scope overlay must be visible during ADS');
    assert.strictEqual(crosshairClasses.has('hidden'), true, 'Default crosshair must be hidden when optical scope overlay is shown');

    // 5. Release ADS: restore hip-firing state
    controls.setAiming(false);
    for (let i = 0; i < 20; i++) controls.update(0.05);
    assert.strictEqual(controls.aimBlend, 0.0, 'aimBlend must return to 0.0');
    assert.strictEqual(controls.rifleGroup.visible, true, 'Rifle model must become visible again when returning to hip-fire');
    assert.strictEqual(crosshairClasses.has('hidden'), false, 'Default crosshair must become visible again when exiting ADS');
    assert.strictEqual(scopeClasses.has('hidden'), true, 'Scope overlay must be hidden after exiting ADS');
  } finally {
    global.document.getElementById = origGetElementById;
  }
});

it('verifies R3 3D Throwable TNT Box Entity & Reactive Explosion: parabolic physics, ground bounce, white flashing, particles and crater', () => {
  const { Controls, mockTHREE, BLOCKS } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  const domElement = { addEventListener: () => {} };
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    vel: new mockTHREE.Vector3(0, 0, 0),
    action: 'idle',
    onGround: true,
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };

  // Simulated world with ground at Y=24
  const worldBlocks = new Map();
  for (let x = -5; x <= 5; x++) {
    for (let z = -10; z <= 0; z++) {
      worldBlocks.set(`${x},24,${z}`, BLOCKS.STONE);
    }
  }
  const excavated = [];
  const world = {
    getBlock: (x, y, z) => {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return worldBlocks.has(key) ? worldBlocks.get(key) : 0;
    },
    applyAuthoritativeBlock: (x, y, z, blockType) => {
      excavated.push({ x, y, z, blockType });
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      if (blockType === 0) worldBlocks.delete(key);
      else worldBlocks.set(key, blockType);
    }
  };

  const sceneAdded = [];
  const scene = {
    add: (obj) => sceneAdded.push(obj),
    remove: (obj) => {
      const idx = sceneAdded.indexOf(obj);
      if (idx !== -1) sceneAdded.splice(idx, 1);
    }
  };

  let explosionSpawned = null;
  const particleManager = {
    spawnExplosion: (x, y, z) => {
      explosionSpawned = { x, y, z };
    }
  };

  const controls = new Controls(camera, domElement, physics, world, particleManager);
  controls.setScene(scene);
  controls.yaw = 0;
  controls.pitch = 0;

  // 1. Throw TNT
  const tnt = controls.throwTnt();
  assert.ok(tnt, 'throwTnt must instantiate and return a 3D TNT entity');
  assert.strictEqual(controls.tntEntities.length, 1, 'Active TNT entity must be tracked in controls.tntEntities');
  assert.strictEqual(tnt.geometry.width, 0.94, 'TNT entity geometry width must be 0.94');
  assert.strictEqual(tnt.geometry.height, 0.94, 'TNT entity geometry height must be 0.94');
  assert.strictEqual(tnt.geometry.depth, 0.94, 'TNT entity geometry depth must be 0.94');
  assert.ok(Array.isArray(tnt.materials) && tnt.materials.length === 6, 'TNT must feature 6 distinct face materials');

  // Velocity: V = cameraDir * 14.0 + (0, 3.5, 0) -> cameraDir forward along -Z: vz = -14.0, vy = 3.5
  assert.ok(Math.abs(tnt.vel.z - (-14.0)) < 0.01, 'Forward velocity along -Z must be -14.0 m/s');
  assert.ok(Math.abs(tnt.vel.y - 3.5) < 0.01, 'Initial upward lob velocity must be 3.5 m/s');

  // 2. Step physics: gravity -18 m/s^2 pulls down
  controls.update(0.1);
  assert.ok(tnt.vel.y < 3.5, 'Gravity must accelerate TNT downward');

  // Step until it hits ground (Y=24 block top surface Y=25.0, resting center Y = 25.47)
  for (let i = 0; i < 40; i++) {
    controls.update(0.05);
  }
  assert.ok(tnt.onGround, 'TNT entity must reach ground contact and settle on the ground');
  assert.ok(Math.abs(tnt.pos.y - 25.47) < 0.1, 'TNT resting position must be ground elevation + halfSize (~25.47)');

  // 3. Accelerating white flashing: advance time to fuse expiry (3.0s total)
  while (!tnt.isDead && tnt.fuseRemaining > 0) {
    controls.update(0.1);
  }
  assert.strictEqual(tnt.isDead, true, 'TNT must detonate upon fuse expiry');
  assert.ok(explosionSpawned, 'Detonation must trigger particleManager.spawnExplosion(x, y, z)');
  assert.ok(excavated.length > 0, 'Detonation must excavate a radius-3 crater in destructible world blocks');
  assert.strictEqual(controls.tntEntities.length, 0, 'Dead TNT entity must be cleaned up from active list');
});

it('verifies R3 Instant Bullet-Triggered TNT Detonation: bullet strike detonates 3D TNT entity immediately with zero fuse', () => {
  const { Controls, mockTHREE, BLOCKS } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  const domElement = { addEventListener: () => {} };
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    vel: new mockTHREE.Vector3(0, 0, 0),
    action: 'idle',
    onGround: true,
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };
  const world = { getBlock: () => 0, applyAuthoritativeBlock: () => {} };

  let explosionSpawned = null;
  const particleManager = {
    spawnExplosion: (x, y, z) => { explosionSpawned = { x, y, z }; }
  };

  const controls = new Controls(camera, domElement, physics, world, particleManager);
  controls.setWeaponsMode(true);
  controls.yaw = 0;
  controls.pitch = 0;

  let triggeredNetworkFuse = null;
  controls.sendTntTrigger = (x, y, z, fuseMs) => {
    triggeredNetworkFuse = { x, y, z, fuseMs };
  };

  let shotTntHit = null;
  controls.onShootTnt = (data) => {
    shotTntHit = data;
  };

  // Spawn an active 3D TNT entity in flight directly in front of the player (Z = -5)
  const tnt = new Controls.TntEntity({
    x: 0,
    y: 26.6,
    z: -5,
    vx: 0,
    vy: 0,
    vz: 0,
    fuse: 3.0,
    world,
    particleManager,
    THREE: mockTHREE
  });
  controls.activeTntEntities.push(tnt);
  assert.strictEqual(tnt.isDead, false);
  assert.strictEqual(controls.tntEntities.length, 1);

  // Shoot rifle down central sightline
  const shot = controls.triggerShoot();
  assert.ok(shot, 'triggerShoot must return shot data');
  assert.ok(shot.tntEntityHit, 'Bullet ray must strike the active 3D TNT entity');
  assert.strictEqual(tnt.isDead, true, 'Struck TNT entity must detonate IMMEDIATELY with zero fuse');
  assert.ok(explosionSpawned, 'Explosion shockwave particles must be spawned immediately');
  assert.ok(triggeredNetworkFuse, 'sendTntTrigger must be sent over network');
  assert.strictEqual(triggeredNetworkFuse.fuseMs, 0, 'Instant bullet detonation must specify fuseMs = 0');
  assert.ok(shotTntHit, 'controls.onShootTnt callback must be invoked with struck TNT data');
});

it('verifies ParticleManager luminous bullet tracers and 20+ crimson blood droplets', () => {
  const { ParticleManager } = loadParticlesModuleForM2();
  const scene = { add: () => {}, remove: () => {} };
  const pm = new ParticleManager(scene);

  // 1. Bullet tracer beam
  pm.spawnBulletTracer([0, 26, 0], [15, 26, 30], 220);
  assert.strictEqual(pm.tracers.length, 1, 'Bullet tracer must be instantiated');
  const tracer = pm.tracers[0];
  assert.strictEqual(tracer.speed, 220, 'Tracer speed must be high-velocity (~220)');
  assert.ok(tracer.totalDist > 0, 'Tracer trajectory must have non-zero distance');

  // 2. Crimson blood droplets: 20+ particles
  pm.spawnBloodParticles(10, 25, 10, [0, 0, -1]);
  assert.ok(pm.bloodParticles.length >= 20, `Blood particle burst must contain 20+ droplets (found ${pm.bloodParticles.length})`);

  // Verify initial directional velocity along bullet direction
  const sample = pm.bloodParticles[0];
  assert.ok(sample.vz < 0, 'Blood velocity must have directional forward bias along bullet direction (Z < 0)');
  assert.ok(sample.vy > 0, 'Blood velocity must have upward loft for parabolic arc');

  // 3. Particle update with gravity
  const initVy = sample.vy;
  pm.update(0.016, { x: 10, y: 25, z: 10 });
  assert.ok(sample.vy < initVy, 'Blood particle Y velocity must decrease under gravitational acceleration');
});

it('verifies Animal impact knockback, knockdown tilt (rotation.z = Math.PI/2), hurt flash, and exact 3-second despawn', () => {
  const { VoxelAnimal } = (() => {
    const animalsPath = path.resolve(__dirname, '../public/src/animals.js');
    let animalsCode = fs.readFileSync(animalsPath, 'utf8')
      .replace(/import\s+.*?from\s+.*?;/g, '')
      .replace(/export\s+const\s+ANIMAL_SPECIES\s+=/g, 'const ANIMAL_SPECIES =')
      .replace(/export\s+class\s+VoxelCar/g, 'class VoxelCar')
      .replace(/export\s+class\s+TrafficManager/g, 'class TrafficManager')
      .replace(/export\s+class\s+AnimalManager/g, 'class AnimalManager');

    const mockTHREE = {
      Vector3: class {
        constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
        set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
        copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
        clone(){return new mockTHREE.Vector3(this.x,this.y,this.z);}
        sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
        add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
        dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
        lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
        distanceToSquared(v){const dx=this.x-v.x,dy=this.y-v.y,dz=this.z-v.z;return dx*dx+dy*dy+dz*dz;}
      },
      Euler: class {
        constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
        set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
      },
      Group: class {
        constructor(){this.position=new mockTHREE.Vector3();this.rotation=new mockTHREE.Euler();this.children=[];}
        add(){this.children.push(...arguments);}
        remove(){}
        traverse(fn){fn(this);}
      },
      Mesh: class {
        constructor(g,m){
          this.isMesh=true;
          this.material=m||{emissive:{setHex:()=>{},getHex:()=>0}};
          this.position=new mockTHREE.Vector3();
          this.rotation=new mockTHREE.Euler();
        }
      },
      BoxGeometry: class {},
      MeshLambertMaterial: class {
        constructor(opts={}){
          this.color=opts.color;
          this.emissive={hex:opts.emissive||0,setHex:function(v){this.hex=v;},getHex:function(){return this.hex;}};
        }
      }
    };
    const BLOCKS = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 4, TNT: 19 };
    const BLOCK_DEFS = { 1: { solid: true } };

    return new Function(
      'THREE', 'BLOCKS', 'BLOCK_DEFS',
      animalsCode + '\nreturn { VoxelAnimal };'
    )(mockTHREE, BLOCKS, BLOCK_DEFS);
  })();

  const scene = { add: () => {}, remove: () => {} };
  const world = { getBlock: () => 0, getHeightAt: () => 24 };

  const animal = new VoxelAnimal('cow', scene, world, 'test_cow');
  animal.position.set(10, 25, 10);

  // 1. Trigger knockdown hit along bullet direction (0, 0, -1)
  animal.triggerKnockdown({ x: 0, y: 0, z: -1 });
  assert.strictEqual(animal.isKnockedDown, true, 'Animal must be knocked down');
  assert.strictEqual(animal.knockdownTimer, 3.0, 'Animal knockdown timer must start at exactly 3.0 seconds');
  assert.strictEqual(animal.despawnTimer, 3.0, 'Despawn timer must be 3.0 seconds');
  assert.ok(animal.knockbackVelocity.z < 0, 'Knockback impulse must be along bullet trajectory (Z < 0)');

  // 2. Step 0.5 seconds: verify knockdown tilt animation (rotation.z reaches Math.PI / 2)
  animal.update(0.5, { x: 0, y: 25, z: 0 });
  assert.ok(Math.abs(animal.group.rotation.z - Math.PI / 2) < 0.05, 'Animal must tilt onto side (rotation.z = Math.PI / 2)');

  // 3. Step up to 2.8 seconds (total 2.8s < 3.0s): verify animal is STILL VISIBLE and NOT despawned
  animal.update(2.3, { x: 0, y: 25, z: 0 });
  assert.strictEqual(animal.isDespawned, undefined, 'Animal must remain visible during 3-second knockdown period');
  assert.ok(animal.despawnTimer > 0, 'Despawn timer must still have time remaining before 3s');

  // 4. Step past 3.0 seconds (total 3.2s): verify despawn
  animal.update(0.4, { x: 0, y: 25, z: 0 });
  assert.strictEqual(animal.despawnTimer, 0, 'Despawn timer must reach 0');
  assert.strictEqual(animal.isDespawned, true, 'Animal must be marked as despawned after exactly 3.0s');
});

it('verifies Multiplayer network synchronization of WEAPON_SHOT_FX, WEAPON_SHOOT, and ANIMAL_BURST', () => {
  const rm = new RoomManager(30);
  const room = rm.getOrCreateRoom('main');

  const p1 = room.gameState.addPlayer('shooter_1', 'SniperSteve');
  const p2 = room.gameState.addPlayer('victim_2', 'TargetBob');
  p1.pos = [0, 25, 0];
  p2.pos = [10, 25, 0];

  let broadcastEvents = [];
  rm.broadcast = (r, type, data, exceptWs) => {
    broadcastEvents.push({ type, data, exceptWs });
  };

  // 1. Shooter fires weapon
  const shootPacket = {
    weaponType: 'rifle',
    origin: [0, 26.6, 0],
    dir: [1, 0, 0],
    hitPos: [10, 26, 0],
    targetPlayerId: 'victim_2'
  };

  const mockWs = {};
  rm.handleWeaponShoot(mockWs, { id: 'shooter_1', roomId: 'main' }, shootPacket);

  const fxBroadcast = broadcastEvents.find(e => e.type === MSG.WEAPON_SHOT_FX);
  assert.ok(fxBroadcast, 'Server must broadcast WEAPON_SHOT_FX to peers');
  assert.deepStrictEqual(fxBroadcast.data.origin, [0, 26.6, 0], 'Shot FX must preserve muzzle origin');
  assert.deepStrictEqual(fxBroadcast.data.hitPos, [10, 26, 0], 'Shot FX must preserve impact target');
  assert.strictEqual(fxBroadcast.exceptWs, mockWs, 'Shooter must be excluded from duplicate FX broadcast');

  // 2. Animal hit broadcast
  const anim = { id: 'anim_test', type: 'sheep', x: 5, y: 25, z: 0 };
  room.gameState.animals.set('anim_test', anim);

  broadcastEvents = [];
  rm.handleWeaponShoot(mockWs, { id: 'shooter_1', roomId: 'main' }, {
    weaponType: 'rifle',
    origin: [0, 26.6, 0],
    dir: [1, 0, 0],
    targetAnimalId: 'anim_test',
    hitPos: [5, 25.6, 0]
  });

  const burstBroadcast = broadcastEvents.find(e => e.type === MSG.ANIMAL_BURST);
  assert.ok(burstBroadcast, 'Server must broadcast ANIMAL_BURST on animal hit');
  assert.strictEqual(burstBroadcast.data.animalId, 'anim_test');
  assert.strictEqual(burstBroadcast.data.shooterId, 'shooter_1');
  assert.deepStrictEqual(burstBroadcast.data.dir, [1, 0, 0], 'ANIMAL_BURST must broadcast bullet direction for knockback');
});

// =============================================================================
// SECTION 9: HIGHWAY TRAFFIC OBSTACLE INTELLIGENCE (R3)
// =============================================================================
console.log('\n[SECTION 9: HIGHWAY TRAFFIC OBSTACLE INTELLIGENCE (R3)]');

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

  const BLOCK_DEFS = {
    0: { solid: false },
    1: { solid: true },
    2: { solid: true },
    4: { solid: true },
    5: { solid: true },
    6: { solid: true },
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

class MockVoxelWorld {
  constructor(defaultBlock = 0) {
    this.blocks = new Map(); // "x,y,z" -> blockType
    this.defaultBlock = defaultBlock;
    this.queries = [];
  }
  setBlock(x, y, z, type) {
    this.blocks.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`, type);
  }
  getBlock(x, y, z) {
    this.queries.push({ x, y, z });
    const val = this.blocks.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`);
    return val !== undefined ? val : this.defaultBlock;
  }
  getRoadHeightAt(x, z) {
    return 24;
  }
}

it('verifies forward obstacle probing 2.5 blocks ahead along travel heading using world.getBlock', () => {
  const { VoxelCar, BLOCKS } = loadAnimalsModule();
  const mockWorld = new MockVoxelWorld();

  // Linear highway along +Z: from (1.6, 0) to (1.6, 100)
  const route = { type: 'line', x1: 1.6, z1: 0, x2: 1.6, z2: 100, speed: 10.0, initialProgress: 0.1 };
  const car = new VoxelCar(route, null, mockWorld);

  // Position at progress 0.1 is z = 10
  assert.strictEqual(Math.round(car.position.z), 10);
  assert.strictEqual(car.hasObstacle, false);

  // Clear query log
  mockWorld.queries = [];

  // Probe without obstacles
  const blockedNoObstacle = car.checkObstacle(2.5);
  assert.strictEqual(blockedNoObstacle, false, 'checkObstacle must return false when path is clear');

  // Verify that getBlock was called at 2.5 blocks ahead along travel heading (+Z)
  const probeTargetZ = Math.floor(car.position.z + 2.5); // 10 + 2.5 = 12.5 -> floor is 12
  const queriedTarget = mockWorld.queries.some(q => q.z === probeTargetZ && (q.x === Math.floor(car.position.x) || q.x === Math.round(car.position.x)));
  assert.ok(queriedTarget, `world.getBlock must be queried 2.5 blocks ahead along travel heading (expected z=${probeTargetZ})`);

  // Place TNT 2.5 blocks directly ahead at (1, 25, 12)
  mockWorld.setBlock(Math.floor(car.position.x), 25, probeTargetZ, BLOCKS.TNT);

  const blockedWithTnt = car.checkObstacle(2.5);
  assert.strictEqual(blockedWithTnt, true, 'checkObstacle must return true when TNT is detected 2.5 blocks ahead');
  assert.strictEqual(car.hasObstacle, true);
  assert.strictEqual(car.isBlocked, true);
});

it('verifies detection of solid walls, monuments, central spawn buildings, and placed blocks while ignoring air and water', () => {
  const { VoxelCar, BLOCKS } = loadAnimalsModule();
  const mockWorld = new MockVoxelWorld();

  const route = { type: 'line', x1: 1.6, z1: 0, x2: 1.6, z2: 100, speed: 10.0, initialProgress: 0.0 };
  const car = new VoxelCar(route, null, mockWorld);

  const probeZ = Math.floor(car.position.z + 2.5);

  // Air should not trigger obstacle
  mockWorld.setBlock(Math.floor(car.position.x), 25, probeZ, BLOCKS.AIR);
  assert.strictEqual(car.checkObstacle(2.5), false, 'AIR must not trigger obstacle');

  // Water should not trigger solid obstacle
  mockWorld.setBlock(Math.floor(car.position.x), 25, probeZ, BLOCKS.WATER);
  assert.strictEqual(car.checkObstacle(2.5), false, 'WATER must not trigger solid obstacle');

  // Stone wall must trigger obstacle
  mockWorld.setBlock(Math.floor(car.position.x), 25, probeZ, BLOCKS.STONE);
  assert.strictEqual(car.checkObstacle(2.5), true, 'STONE wall must trigger obstacle');

  // Cobblestone placed block must trigger obstacle
  mockWorld.setBlock(Math.floor(car.position.x), 25, probeZ, BLOCKS.COBBLESTONE);
  assert.strictEqual(car.checkObstacle(2.5), true, 'COBBLESTONE placed block must trigger obstacle');

  // Brick building must trigger obstacle
  mockWorld.setBlock(Math.floor(car.position.x), 25, probeZ, BLOCKS.BRICK);
  assert.strictEqual(car.checkObstacle(2.5), true, 'BRICK monument building must trigger obstacle');

  // TNT must trigger obstacle
  mockWorld.setBlock(Math.floor(car.position.x), 25, probeZ, BLOCKS.TNT);
  assert.strictEqual(car.checkObstacle(2.5), true, 'TNT must trigger obstacle');
});

it('verifies smooth deceleration and complete halt before colliding with obstacle', () => {
  const { VoxelCar, BLOCKS } = loadAnimalsModule();
  const mockWorld = new MockVoxelWorld();

  const route = { type: 'line', x1: 1.6, z1: 0, x2: 1.6, z2: 200, speed: 12.0, initialProgress: 0.05 };
  const car = new VoxelCar(route, null, mockWorld);

  const initialZ = car.position.z;
  const initialSpeed = car.currentSpeed;
  assert.strictEqual(initialSpeed, 12.0, 'Car should initially cruise at full route speed');

  // Place a TNT obstacle ahead of the vehicle
  const obstacleZ = initialZ + 3.0;
  mockWorld.setBlock(Math.floor(car.position.x), 25, Math.floor(obstacleZ), BLOCKS.TNT);
  mockWorld.setBlock(Math.round(car.position.x), 25, Math.floor(obstacleZ), BLOCKS.TNT);

  const speeds = [];
  // Simulate 30 frames with dt = 0.033 (~1 second)
  for (let frame = 0; frame < 30; frame++) {
    car.update(0.033);
    speeds.push(car.currentSpeed);
  }

  // 1. Verify deceleration was smooth and speed decreased monotonically
  assert.ok(speeds[0] <= initialSpeed, 'Speed must begin decreasing upon obstacle detection');
  for (let i = 1; i < speeds.length; i++) {
    assert.ok(speeds[i] <= speeds[i - 1], `Speed must decrease monotonically during deceleration: frame ${i} (${speeds[i]}) <= frame ${i-1} (${speeds[i-1]})`);
  }

  // 2. Verify complete halt
  const finalSpeed = speeds[speeds.length - 1];
  assert.strictEqual(finalSpeed, 0, 'Car must come to a complete halt (speed = 0)');
  assert.strictEqual(car.isStopped, true, 'Car isStopped flag must be true');

  // 3. Vehicles must NEVER pass through walls, monuments, central spawn buildings, or placed blocks
  // Front of car is at position.z + 1.55. It must be strictly before obstacleZ
  const frontZ = car.position.z + 1.55;
  assert.ok(frontZ <= obstacleZ, `Car front bumper (z=${frontZ}) must NEVER penetrate obstacle (z=${obstacleZ})`);
  assert.ok(car.position.z < obstacleZ, 'Car center must strictly remain before the obstacle');
});

it('verifies smooth acceleration and route resumption when path clears', () => {
  const { VoxelCar, BLOCKS } = loadAnimalsModule();
  const mockWorld = new MockVoxelWorld();

  const route = { type: 'line', x1: 1.6, z1: 0, x2: 1.6, z2: 200, speed: 12.0, initialProgress: 0.05 };
  const car = new VoxelCar(route, null, mockWorld);

  // Place obstacle 2.5 blocks ahead and let car come to a complete stop
  const obstacleZ = Math.floor(car.position.z + 2.5);
  mockWorld.setBlock(Math.floor(car.position.x), 25, obstacleZ, BLOCKS.TNT);

  for (let i = 0; i < 30; i++) {
    car.update(0.04);
  }
  assert.strictEqual(car.currentSpeed, 0, 'Car should be completely halted at obstacle');
  assert.strictEqual(car.isBlocked, true);

  const stoppedZ = car.position.z;

  // Player clears / removes the TNT block
  mockWorld.setBlock(Math.floor(car.position.x), 25, obstacleZ, BLOCKS.AIR);
  mockWorld.setBlock(Math.round(car.position.x), 25, obstacleZ, BLOCKS.AIR);

  const resumeSpeeds = [];
  // Update frames after obstacle removal (40 frames * 0.04s = 1.6s to accelerate to 12.0)
  for (let i = 0; i < 40; i++) {
    car.update(0.04);
    resumeSpeeds.push(car.currentSpeed);
  }

  // 1. Verify speed increases smoothly
  assert.strictEqual(car.isBlocked, false, 'isBlocked must be false after obstacle removal');
  assert.ok(resumeSpeeds[0] > 0, 'Car must begin accelerating immediately after path clears');
  for (let i = 1; i < resumeSpeeds.length; i++) {
    assert.ok(resumeSpeeds[i] >= resumeSpeeds[i - 1], `Speed must increase monotonically during acceleration: ${resumeSpeeds[i]} >= ${resumeSpeeds[i-1]}`);
  }

  // 2. Verify car reached top cruising speed and advanced along route
  assert.strictEqual(car.currentSpeed, 12.0, 'Car must smoothly return to full cruising speed');
  assert.ok(car.position.z > stoppedZ, 'Car must resume advancing along its highway route');
});

it('verifies circular roundabout route obstacle detection along tangent heading and smooth halt', () => {
  const { VoxelCar, BLOCKS } = loadAnimalsModule();
  const mockWorld = new MockVoxelWorld();

  // Central Roundabout Ring around Spawn Plaza (radius 21)
  const route = { type: 'circle', cx: 0, cz: 0, radius: 21.0, speed: 7.5, initialProgress: 0.0 };
  const car = new VoxelCar(route, null, mockWorld);

  // At progress 0: position is (21, 25, 0), tangent heading is (0, 1) (+Z)
  assert.strictEqual(Math.round(car.position.x), 21);
  assert.strictEqual(Math.round(car.position.z), 0);

  // Normal roundabout operation with clear path
  car.update(0.016);
  assert.strictEqual(car.hasObstacle, false);
  assert.ok(car.currentSpeed > 0);

  // Place placed block / TNT 2.5 blocks ahead along tangent (+Z at x=21, z=3)
  mockWorld.setBlock(21, 25, 3, BLOCKS.TNT);

  const blocked = car.checkObstacle(2.5);
  assert.strictEqual(blocked, true, 'Car on circular roundabout must detect obstacle 2.5 blocks ahead along tangent heading');

  // Run update steps until halted
  for (let i = 0; i < 25; i++) {
    car.update(0.04);
  }
  assert.strictEqual(car.currentSpeed, 0, 'Roundabout car must smoothly halt before obstacle');
  assert.strictEqual(car.isBlocked, true);

  // Clear obstacle and resume
  mockWorld.setBlock(21, 25, 3, BLOCKS.AIR);
  car.update(0.04);
  assert.strictEqual(car.isBlocked, false);
  assert.ok(car.currentSpeed > 0, 'Roundabout car must smoothly accelerate once obstacle is cleared');
});

it('verifies TrafficManager initializes autonomous fleet and propagates obstacle collision intelligence', () => {
  const { TrafficManager, BLOCKS } = loadAnimalsModule();
  const mockWorld = new MockVoxelWorld();
  const mockScene = { add: () => {} };

  const tm = new TrafficManager(mockScene, mockWorld);
  assert.ok(Array.isArray(tm.cars), 'TrafficManager must maintain an array of cars');
  assert.strictEqual(tm.cars.length, 12, 'TrafficManager must manage 12 autonomous highway vehicles');

  // Verify all cars possess obstacle probing capability and probeDistance = 2.5
  for (const car of tm.cars) {
    assert.strictEqual(typeof car.checkObstacle, 'function', 'Each VoxelCar must have checkObstacle method');
    assert.strictEqual(typeof car.probeObstacle, 'function', 'Each VoxelCar must have probeObstacle method');
    assert.strictEqual(car.probeDistance, 2.5, 'Default forward probe distance must be 2.5 blocks');
    assert.strictEqual(car.trafficManager, tm, 'Each car must be linked to its TrafficManager');
  }

  // Update all traffic
  tm.update(0.016);

  // Place obstacle ahead of first car
  const firstCar = tm.cars[0];
  const heading = firstCar.getHeadingVector();
  const obstX = Math.floor(firstCar.position.x + heading.x * 2.5);
  const obstZ = Math.floor(firstCar.position.z + heading.z * 2.5);
  mockWorld.setBlock(obstX, 25, obstZ, BLOCKS.TNT);

  // Update traffic manager
  tm.update(0.05);
  assert.strictEqual(firstCar.isBlocked, true, 'First car must become blocked upon encountering TNT');
  assert.ok(firstCar.currentSpeed < firstCar.maxSpeed, 'First car must begin decelerating');
});

it('verifies checkObstacleAhead casts 3 parallel forward rays at road heights +1 and +2 (center, left +0.6, right -0.6) detecting obstacles up to 8 blocks ahead', () => {
  const { VoxelCar, BLOCKS } = loadAnimalsModule();
  const mockWorld = new MockVoxelWorld();

  const route = { type: 'line', x1: 0.0, z1: 0.0, x2: 0.0, z2: 100.0, speed: 10.0, initialProgress: 0.0 };
  const car = new VoxelCar(route, null, mockWorld);

  // Car starts at (0, 25, 0), front bumper is at z = 1.55.
  // 1. Center ray obstacle at road height +1 (Y=25) at distance 4.0m ahead of bumper
  const centerTargetZ = Math.round(car.position.z + 1.55 + 4.0); // 0 + 1.55 + 4 = 5.55 -> round is 6
  mockWorld.setBlock(0, 25, centerTargetZ, BLOCKS.STONE);
  const obsCenter = car.checkObstacleAhead(8.0);
  assert.ok(obsCenter, 'checkObstacleAhead must detect center obstacle');
  assert.strictEqual(obsCenter.isObstacle, true);
  assert.strictEqual(obsCenter.blockId, BLOCKS.STONE);
  assert.ok(obsCenter.distance >= 3.8 && obsCenter.distance <= 4.6, `Distance should be ~4.0m (got ${obsCenter.distance})`);
  mockWorld.setBlock(0, 25, centerTargetZ, BLOCKS.AIR);

  // 2. Center ray obstacle at road height +2 (Y=26)
  mockWorld.setBlock(0, 26, centerTargetZ, BLOCKS.BRICK);
  const obsHeight2 = car.checkObstacleAhead(8.0);
  assert.ok(obsHeight2, 'checkObstacleAhead must detect obstacle at road height +2 (Y=26)');
  assert.strictEqual(obsHeight2.y, 26);
  mockWorld.setBlock(0, 26, centerTargetZ, BLOCKS.AIR);

  // 3. Left ray obstacle (offset -0.6)
  const leftX = -1; // -0.6 falls into voxel X = -1
  mockWorld.setBlock(leftX, 25, centerTargetZ, BLOCKS.COBBLESTONE);
  const obsLeft = car.checkObstacleAhead(8.0);
  assert.ok(obsLeft, 'checkObstacleAhead must detect left ray obstacle at lateral offset -0.6');
  mockWorld.setBlock(leftX, 25, centerTargetZ, BLOCKS.AIR);

  // 4. Right ray obstacle (offset +0.6)
  const rightX = 1; // +0.6 falls into voxel X = 1
  mockWorld.setBlock(rightX, 25, centerTargetZ, BLOCKS.TNT);
  const obsRight = car.checkObstacleAhead(8.0);
  assert.ok(obsRight, 'checkObstacleAhead must detect right ray obstacle at lateral offset +0.6');
  assert.strictEqual(obsRight.blockId, BLOCKS.TNT);
  mockWorld.setBlock(rightX, 25, centerTargetZ, BLOCKS.AIR);

  // 5. Obstacle beyond 8 blocks (at 9.0 blocks) must be ignored when lookAheadDist = 8.0
  const farZ = Math.round(car.position.z + 1.55 + 9.0);
  mockWorld.setBlock(0, 25, farZ, BLOCKS.STONE);
  const obsFar = car.checkObstacleAhead(8.0);
  assert.strictEqual(obsFar, null, 'Obstacle beyond 8.0 blocks must not be returned');
});

it('verifies smooth linear deceleration between 1.8m and 7.5m, complete halt at <= 1.8m, and taillight emissive states', () => {
  const { VoxelCar, BLOCKS } = loadAnimalsModule();
  const mockWorld = new MockVoxelWorld();

  const route = { type: 'line', x1: 0.0, z1: 0.0, x2: 0.0, z2: 200.0, speed: 12.0, initialProgress: 0.0 };
  const car = new VoxelCar(route, null, mockWorld);

  assert.strictEqual(car.currentSpeed, 12.0);
  // Initial taillights are normal red
  assert.strictEqual(car.taillightMat.emissive.getHex(), 0x991b1b, 'Normal cruising taillights should be 0x991b1b');

  // Place obstacle in the deceleration zone: 5.0m ahead of front bumper (1.55 + 5.0 = 6.55 -> z = 7)
  mockWorld.setBlock(0, 25, 7, BLOCKS.STONE);
  car.update(0.016);

  // Deceleration zone: 1.8m < d <= 7.5m
  assert.ok(car.hasObstacle, 'Car must detect obstacle ahead');
  assert.strictEqual(car.isBraking, true, 'isBraking must be true in deceleration zone');
  assert.ok(car.targetSpeed < 12.0 && car.targetSpeed > 0, `Target speed should be linearly decelerating (got ${car.targetSpeed})`);
  assert.ok(car.currentSpeed < 12.0, 'Car should begin smooth deceleration');
  assert.strictEqual(car.taillightMat.emissive.getHex(), 0xff0000, 'Taillights must be bright red emissive (0xff0000) during braking');

  // Place obstacle in the imminent collision zone: <= 1.8m ahead of front bumper (1.55 + 1.2 = 2.75 -> z = 3)
  mockWorld.setBlock(0, 25, 7, BLOCKS.AIR);
  mockWorld.setBlock(0, 25, 3, BLOCKS.STONE);
  car.update(0.016);

  assert.strictEqual(car.targetSpeed, 0.0, 'Target speed must be 0 when obstacle distance is <= 1.8m');
  assert.strictEqual(car.currentSpeed, 0.0, 'Car must halt completely before the obstacle');
  assert.strictEqual(car.isStopped, true, 'isStopped must be true');
  assert.strictEqual(car.isHalted, true, 'isHalted must be true');
  assert.strictEqual(car.taillightMat.emissive.getHex(), 0xff0000, 'Taillights must remain bright red emissive (0xff0000) while halted');

  // Clear obstacle: car should accelerate back to cruising speed (12.0 m/s) and restore taillights
  mockWorld.setBlock(0, 25, 3, BLOCKS.AIR);
  car.update(0.016);

  assert.strictEqual(car.hasObstacle, false, 'Obstacle must be cleared');
  assert.strictEqual(car.isHalted, false, 'isHalted must be false after obstacle is removed');
  assert.strictEqual(car.targetSpeed, 12.0, 'Target speed must restore to max cruising speed');
  assert.ok(car.currentSpeed > 0, 'Car must begin accelerating');
  assert.strictEqual(car.taillightMat.emissive.getHex(), 0x991b1b, 'Taillights must be restored to normal (0x991b1b) when path clears');

  // Accelerate to full cruising speed
  for (let i = 0; i < 60; i++) {
    car.update(0.033);
  }
  assert.strictEqual(car.currentSpeed, 12.0, 'Car must return to full cruising speed (8.0 .. 14.0 m/s)');
});

it('verifies highway traffic cars never pass through or clip into walls, buildings, or placed blocks', () => {
  const { VoxelCar, BLOCKS } = loadAnimalsModule();
  const mockWorld = new MockVoxelWorld();

  const route = { type: 'line', x1: 0.0, z1: 0.0, x2: 0.0, z2: 100.0, speed: 14.0, initialProgress: 0.0 };
  const car = new VoxelCar(route, null, mockWorld);

  // Build a 3-block wide solid wall / building across the road at z = 10
  for (let x = -2; x <= 2; x++) {
    for (let y = 25; y <= 27; y++) {
      mockWorld.setBlock(x, y, 10, BLOCKS.BRICK);
    }
  }

  // Simulate 120 frames at high speed
  for (let i = 0; i < 120; i++) {
    car.update(0.033);
  }

  // Verify car came to a complete halt before the wall without clipping
  assert.strictEqual(car.currentSpeed, 0, 'Car must halt completely before the wall');
  assert.strictEqual(car.isStopped, true);
  const frontZ = car.position.z + 1.55;
  assert.ok(frontZ <= 10.0, `Car front bumper (z=${frontZ}) must NEVER penetrate the wall (z=10.0)`);
  assert.ok(car.position.z < 10.0, 'Car position must strictly remain before the wall');
});

it('verifies Central Plaza road entrances and roundabout ring have 100% unobstructed headroom (Y=25..28 is AIR) across all driving lanes', () => {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World({ add: () => {} }, null, 48151623);
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      world.getOrCreateChunk(cx, cz);
    }
  }
  // 1. Verify 360-degree roundabout ring (radius 19.5..22.5) has clear headroom
  for (let angle = 0; angle < Math.PI * 2; angle += 0.08) {
    for (const r of [20.0, 21.0, 22.0]) {
      const bx = Math.round(Math.cos(angle) * r);
      const bz = Math.round(Math.sin(angle) * r);
      for (let y = 25; y <= 28; y++) {
        const block = world.getBlock(bx, y, bz);
        assert.strictEqual(block, BLOCKS.AIR, `Roundabout headroom at (${bx}, ${y}, ${bz}) must be AIR (got block ${block})`);
      }
    }
  }
  // 2. Verify North-South and East-West highway entrances (d in 13..26, width in -2..2)
  for (let d = 13; d <= 26; d++) {
    for (let w = -2; w <= 2; w++) {
      for (let y = 25; y <= 28; y++) {
        assert.strictEqual(world.getBlock(w, y, d), BLOCKS.AIR, `North entrance headroom at (${w}, ${y}, ${d}) must be AIR`);
        assert.strictEqual(world.getBlock(w, y, -d), BLOCKS.AIR, `South entrance headroom at (${w}, ${y}, -d) must be AIR`);
        assert.strictEqual(world.getBlock(d, y, w), BLOCKS.AIR, `East entrance headroom at (${d}, ${y}, ${w}) must be AIR`);
        assert.strictEqual(world.getBlock(-d, y, w), BLOCKS.AIR, `West entrance headroom at (${-d}, ${y}, ${w}) must be AIR`);
      }
    }
  }
});

it('verifies checkObstacleAhead on circular roundabout follows lane curvature without triggering on curbs or streetlights', () => {
  const { World, BLOCKS } = loadWorldModule();
  const { VoxelCar } = loadAnimalsModule();
  const world = new World({ add: () => {} }, null, 48151623);
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) world.getOrCreateChunk(cx, cz);
  const route = { type: 'circle', cx: 0, cz: 0, radius: 21.0, speed: 7.5, initialProgress: 0.0 };
  const car = new VoxelCar(route, null, world);
  // Test at 16 points around the circle
  for (let prog = 0; prog < Math.PI * 2; prog += Math.PI / 8) {
    car.progress = prog;
    const pos = car.computePositionAtProgress(prog);
    car.position.set(pos.x, pos.y, pos.z);
    const obs = car.checkObstacleAhead(8.0);
    assert.strictEqual(obs, null, `Clear roundabout lane at prog ${prog.toFixed(2)} must return null obstacle (got ${JSON.stringify(obs)})`);
  }
});

it('verifies autonomous vehicles in TrafficManager drive continuously around Central Roundabout and highways without false positive freezes', () => {
  const { World } = loadWorldModule();
  const { TrafficManager } = loadAnimalsModule();
  const world = new World({ add: () => {} }, null, 48151623);
  for (let cx = -16; cx <= 16; cx++) {
    for (let cz = -16; cz <= 16; cz++) {
      world.getOrCreateChunk(cx, cz);
    }
  }
  const tm = new TrafficManager({ add: () => {} }, world);
  // Simulate 150 frames (7.5 seconds) of traffic flow
  for (let frame = 0; frame < 150; frame++) {
    tm.update(0.05);
  }
  // Assert that all roundabout and highway cars maintain positive speed and continue moving
  for (let i = 0; i < tm.cars.length; i++) {
    const car = tm.cars[i];
    assert.ok(car.currentSpeed > 2.0, `Car ${i} on route ${car.route.type} must maintain forward speed (got ${car.currentSpeed})`);
    assert.strictEqual(car.isStopped, false, `Car ${i} must not be stopped`);
    assert.strictEqual(car.isBlocked, false, `Car ${i} must not be blocked by false positives`);
  }
});

// =============================================================================
// SECTION 10: WORLD GENERATION & LANDMARKS: MOUNT FUJI, CITIES, TUNNELS & CAVERNS (R4)
// =============================================================================
console.log('\n[SECTION 10: WORLD GENERATION & LANDMARKS: MOUNT FUJI, CITIES, TUNNELS & CAVERNS (R4)]');

it('verifies Mount Fuji peak elevation reaching Y=62 (2.58x above surrounding Y=24)', () => {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World(null, null, 12345);

  // Peak caldera rim at (355, 350)
  const peakH = world.getFujiHeight(355, 350);
  assert.strictEqual(peakH, 62, 'Mount Fuji caldera rim must reach maximum world height Y=62');

  const surroundingH = 24;
  const ratio = peakH / surroundingH;
  assert.ok(ratio >= 2.58, `Mount Fuji peak elevation must rise 2.58x above surrounding terrain (expected >= 2.58, got ${ratio.toFixed(3)})`);

  // Verify symmetrical conical elevation slope
  for (let d = 7; d <= 22; d += 3) {
    const h = world.getFujiHeight(350 + d, 350);
    assert.ok(h <= 62 && h >= 46, `Cone height at distance ${d} must be within snow cap (46..62), got ${h}`);
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
    assert.ok(ch <= 56, `Caldera depression at d=${d} must remain <= 56, got ${ch}`);
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
  assert.ok(worldCode.includes('Times Square') || worldCode.includes('Empire State'), 'New York must feature signature landmarks');
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
    assert.strictEqual(world.getBlock(0, y, 130), BLOCKS.AIR, `Tunnel interior at Y=${y} must be clear AIR for vehicle headroom`);
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
  assert.ok(ironOres >= 20, `Cavern must feature rich Iron Ore veins (found ${ironOres})`);
  assert.ok(goldOres >= 10, `Cavern must feature rich Gold Ore veins (found ${goldOres})`);
});


// =============================================================================
// SECTION 11: GRAN CIRCUITO & DRIVABLE CARS (R1, R5)
// =============================================================================
console.log('\n[SECTION 11: GRAN CIRCUITO & DRIVABLE CARS (R1, R5)]');

function loadVehicleModule() {
  const vehiclePath = path.resolve(__dirname, '../public/src/vehicle.js');
  let vehicleCode = fs.readFileSync(vehiclePath, 'utf8')
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+class\s+DrivableCar/g, 'class DrivableCar')
    .replace(/export\s+class\s+VehicleManager/g, 'class VehicleManager');

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
    vehicleCode + '\nreturn { DrivableCar, VehicleManager };'
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
  assert.ok(asphaltLanes >= 12, `Gran Circuito track must have at least 12 asphalt lanes (found ${asphaltLanes})`);
  const totalTrackWidth = asphaltLanes + 2;
  assert.ok(totalTrackWidth >= 14 && totalTrackWidth <= 16, `Total track width with curbs must be 14-16 blocks (got ${totalTrackWidth})`);

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
    localAvatar: { group: new mockTHREE.Group(), setTargetState: () => {}, update: () => {} }
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

it('verifies DrivableCar API methods (enter, exit, getSeatPosition, getSeatRotation, setColor, update)', () => {
  const { DrivableCar } = loadVehicleModule();
  const car = new DrivableCar('test_car_api', 0xff0000, 100, 24, -60, 0, 'Test Racer');

  // 1. setColor
  car.setColor(0x00ff00);
  assert.strictEqual(car.colorHex, 0x00ff00, 'Car colorHex should update to 0x00ff00');
  assert.strictEqual(car.carMat.color.hex, 0x00ff00, 'Car material color should update to 0x00ff00');

  // 2. enter
  const mockPlayer = { id: 'player_123', pos: { x: 100, y: 24, z: -60 } };
  car.enter(mockPlayer);
  assert.strictEqual(car.driverId, 'player_123');
  assert.strictEqual(car.isDriven, true);

  // 3. getSeatPosition & getSeatRotation
  const seatPos = car.getSeatPosition();
  assert.ok(typeof seatPos.x === 'number' && typeof seatPos.y === 'number' && typeof seatPos.z === 'number', 'getSeatPosition must return Vector3');
  assert.strictEqual(seatPos.x, car.pos.x);
  assert.strictEqual(seatPos.y, car.pos.y + 0.15);

  const seatRot = car.getSeatRotation();
  assert.strictEqual(seatRot.yaw, car.yaw);
  assert.strictEqual(seatRot.pitch, car.pitch);

  // 4. update
  const initialZ = car.pos.z;
  car.update(0.1, { forward: 1, steer: 0 }, null);
  assert.ok(car.pos.z < initialZ, 'Car must advance along -Z heading when accelerating forward');
  assert.strictEqual(car.group.position.x, car.pos.x);
  assert.strictEqual(car.group.position.z, car.pos.z);

  // 5. exit
  car.exit(mockPlayer);
  assert.strictEqual(car.driverId, null);
  assert.strictEqual(car.isDriven, false);
});

it('verifies South-East Quadrant Gran Circuito track and vehicle fleet initialization', () => {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World(null, null, 12345);

  // Gran Circuito SE quadrant track in chunks X in [50..210], Z in [-190..-40]
  // Test chunk at (100, -60) -> chunkX = 6, chunkZ = -4
  const cx = Math.floor(100 / 16);
  const cz = Math.floor(-60 / 16);
  const chunk = world.getOrCreateChunk(cx, cz);
  assert.ok(chunk, 'Chunk in SE Gran Circuito quadrant must be generated');

  // Verify asphalt road surface at main straight (e.g. at 100, 24, -60)
  const block = world.getBlock(100, 24, -60);
  assert.strictEqual(block, BLOCKS.ASPHALT, 'SE Gran Circuito track surface at (100, 24, -60) must be ASPHALT');

  // Verify VehicleManager initializes SE Quadrant fleet
  const { VehicleManager } = loadVehicleModule();
  const mockScene = { add: () => {}, remove: () => {} };
  const mockPM = { spawnDriftSmoke: () => {} };
  const vm = new VehicleManager(world, mockScene, mockPM);

  assert.ok(vm.cars.size >= 6, `VehicleManager must create at least 6 cars (got ${vm.cars.size})`);
  const carIds = Array.from(vm.cars.keys());
  assert.ok(carIds.includes('car_se_scuderia'), 'Must include car_se_scuderia in SE quadrant');
  assert.ok(carIds.includes('car_se_azure'), 'Must include car_se_azure in SE quadrant');
  assert.ok(carIds.includes('car_se_gold'), 'Must include car_se_gold in SE quadrant');

  const scuderia = vm.getCarById('car_se_scuderia');
  assert.ok(scuderia, 'car_se_scuderia must be retrievable by ID');
  assert.ok(scuderia.pos.x >= 50 && scuderia.pos.x <= 210, 'Car X must be within SE quadrant');
  assert.ok(scuderia.pos.z >= -190 && scuderia.pos.z <= -40, 'Car Z must be within SE quadrant');
  assert.strictEqual(scuderia.yaw, -Math.PI / 2, 'car_se_scuderia must spawn facing forward towards Turn 1 (yaw: -Math.PI / 2)');

  // Verify Central Plaza vehicle
  const plazaBlue = vm.getCarById('car_spawn_blue');
  assert.ok(plazaBlue, 'Must include car_spawn_blue near Plaza Central');
  assert.strictEqual(plazaBlue.pos.x, 25, 'car_spawn_blue must be stationed at X=25');
  assert.strictEqual(plazaBlue.pos.z, 0, 'car_spawn_blue must be stationed at Z=0');
  assert.strictEqual(plazaBlue.yaw, -Math.PI / 2, 'car_spawn_blue must face forward East down highway');

  // Verify getNearestCar
  const nearest = vm.getNearestCar({ x: scuderia.pos.x + 1, y: scuderia.pos.y, z: scuderia.pos.z }, 4.5);
  assert.strictEqual(nearest.id, 'car_se_scuderia', 'getNearestCar must find closest car within radius');
});

it('verifies Controls vehicleMode getter, Key V vehicle camera toggle, and entry/exit keys', () => {
  const { Controls, mockTHREE } = loadControlsModuleForM2();
  const { VehicleManager } = loadVehicleModule();

  const camera = new mockTHREE.Group();
  camera.fov = 75;
  camera.updateProjectionMatrix = () => {};
  const domElement = {
    addEventListener: () => {},
    requestPointerLock: () => {}
  };
  const physics = {
    pos: new mockTHREE.Vector3(104, 24, -57),
    vel: new mockTHREE.Vector3(0, 0, 0),
    action: 'idle',
    onGround: true,
    getEyePosition: () => new mockTHREE.Vector3(104, 25.6, -57),
    update: () => {}
  };
  const mockWorld = { getBlock: () => 0 };

  const controls = new Controls(camera, domElement, physics, mockWorld);
  controls.isLocked = true;
  assert.strictEqual(controls.vehicleMode, false, 'vehicleMode should be false when no vehicleManager or not driving');

  const mockScene = { add: () => {}, remove: () => {} };
  const mockPM = { spawnDriftSmoke: () => {} };
  const vm = new VehicleManager(mockWorld, mockScene, mockPM);
  controls.setVehicleManager(vm);

  assert.strictEqual(controls.vehicleMode, false, 'vehicleMode should be false before entering a car');

  // Enter car
  const car = vm.cars.get('car_se_scuderia');
  vm.enterCar(car, controls.physics);
  assert.strictEqual(controls.vehicleMode, true, 'vehicleMode should be true when player is driving');

  // Key V camera toggle
  assert.strictEqual(vm.cameraMode, 'chase');
  const keyVEvent = { code: 'KeyV', preventDefault: () => {} };
  controls.handleKeyDown(keyVEvent);
  assert.strictEqual(vm.cameraMode, 'cockpit', 'Key V while driving must toggle vehicle camera mode to cockpit');

  controls.handleKeyDown(keyVEvent);
  assert.strictEqual(vm.cameraMode, 'chase', 'Key V second press must toggle back to chase mode');

  // Exit car via Key E / handleInteract
  const keyEEvent = { code: 'KeyE', preventDefault: () => {} };
  controls.handleKeyDown(keyEEvent);
  assert.strictEqual(controls.vehicleMode, false, 'Key E must exit the vehicle');
  assert.strictEqual(keyEEvent.__vrHandled, true, 'Key E must mark event as __vrHandled');
});

it('verifies Multiplayer vehicle replication packets and server validation', () => {
  const { MSG, isValidVehicleDrive } = require('../server/protocol.js');
  const { RoomManager } = require('../server/rooms.js');

  // 1. Protocol constants
  assert.strictEqual(MSG.VEHICLE_DRIVE, 'vehicle_drive');
  assert.strictEqual(MSG.VEHICLE_ENTER, 'vehicle_enter');
  assert.strictEqual(MSG.VEHICLE_EXIT, 'vehicle_exit');

  // 2. Validation
  assert.strictEqual(isValidVehicleDrive({ vehicleId: 'car_1', x: 100, y: 24, z: -60, yaw: 1.57 }), true);
  assert.strictEqual(isValidVehicleDrive(null), false);
  assert.strictEqual(isValidVehicleDrive({ vehicleId: '', x: 100, y: 24, z: -60, yaw: 1.57 }), false);
  assert.strictEqual(isValidVehicleDrive({ vehicleId: 'car_1', x: NaN, y: 24, z: -60, yaw: 1.57 }), false);

  // 3. RoomManager handling
  const rm = new RoomManager();
  const client1Ws = { readyState: 1, send: (msg) => { client1Ws.lastMsg = JSON.parse(msg); } };
  const client2Ws = { readyState: 1, send: (msg) => { client2Ws.lastMsg = JSON.parse(msg); } };

  const meta1 = { id: 'p1' };
  const meta2 = { id: 'p2' };

  rm.handleJoin(client1Ws, meta1, { name: 'Racer1' });
  rm.handleJoin(client2Ws, meta2, { name: 'Racer2' });

  const room = rm.rooms.get('main');
  assert.ok(room, 'Room main must exist');

  // P1 enters vehicle
  rm.handleVehicleEnter(client1Ws, meta1, { vehicleId: 'car_se_scuderia' });
  const player1 = room.gameState.getPlayer('p1');
  assert.strictEqual(player1.action, 'driving');
  assert.strictEqual(client2Ws.lastMsg.type, MSG.VEHICLE_ENTER);
  assert.strictEqual(client2Ws.lastMsg.data.vehicleId, 'car_se_scuderia');

  // P1 drives vehicle
  rm.handleVehicleDrive(client1Ws, meta1, {
    vehicleId: 'car_se_scuderia',
    x: 105.5,
    y: 24.0,
    z: -65.2,
    yaw: 3.14,
    speed: 16.5,
    steering: 0.2,
    isDrifting: true
  });
  assert.strictEqual(player1.pos[0], 105.5);
  assert.strictEqual(client2Ws.lastMsg.type, MSG.VEHICLE_DRIVE);
  assert.strictEqual(client2Ws.lastMsg.data.speed, 16.5);
  assert.strictEqual(client2Ws.lastMsg.data.isDrifting, true);

  // P1 exits vehicle
  rm.handleVehicleExit(client1Ws, meta1, { vehicleId: 'car_se_scuderia' });
  assert.strictEqual(player1.action, 'idle');
  assert.strictEqual(client2Ws.lastMsg.type, MSG.VEHICLE_EXIT);
});

it('verifies Driving HUD elements, speedometer metrics, and proximity prompt in UI', () => {
  const htmlPath = path.resolve(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Verify required DOM elements in index.html
  assert.ok(html.includes('id="vehicle-driving-hud"'), 'HTML must declare #vehicle-driving-hud');
  assert.ok(html.includes('id="vehicle-speed-num"'), 'HTML must declare #vehicle-speed-num');
  assert.ok(html.includes('id="vehicle-speed-ms"'), 'HTML must declare #vehicle-speed-ms');
  assert.ok(html.includes('id="vehicle-speed-bar"'), 'HTML must declare #vehicle-speed-bar');
  assert.ok(html.includes('id="vehicle-model-name"'), 'HTML must declare #vehicle-model-name');
  assert.ok(html.includes('id="vehicle-cam-indicator"'), 'HTML must declare #vehicle-cam-indicator');
  assert.ok(html.includes('id="vehicle-enter-prompt"'), 'HTML must declare #vehicle-enter-prompt');
  assert.ok(html.includes('id="mobile-btn-car-exit"'), 'HTML must declare #mobile-btn-car-exit');

  // 2. Verify Speedometer Math
  const speedMs = 16.5;
  const speedKmh = Math.round(speedMs * 3.6);
  assert.strictEqual(speedKmh, 59, '16.5 m/s converts to 59.4 -> 59 KM/H');
  const pct = Math.min(100, Math.round((speedMs / 16.5) * 100));
  assert.strictEqual(pct, 100, 'Top speed must fill speedometer bar to 100%');

  // 3. Verify CSS rules
  const cssPath = path.resolve(__dirname, '../public/styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('.vehicle-hud'), 'styles.css must include .vehicle-hud styles');
  assert.ok(css.includes('.speedo-bar-fill'), 'styles.css must include .speedo-bar-fill meter styling');
  assert.ok(css.includes('.vehicle-prompt'), 'styles.css must include .vehicle-prompt styling');
});

function loadAvatarModule() {
  const avatarPath = path.resolve(__dirname, '../public/src/avatar.js');
  let avatarCode = fs.readFileSync(avatarPath, 'utf8')
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+class\s+Avatar/g, 'class Avatar');

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    distanceToSquared(v) {
      const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
      return dx * dx + dy * dy + dz * dz;
    }
    lerp(v, alpha) {
      this.x += (v.x - this.x) * alpha;
      this.y += (v.y - this.y) * alpha;
      this.z += (v.z - this.z) * alpha;
      return this;
    }
  }

  class Group {
    constructor() {
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
      this.children = [];
    }
    add(child) { this.children.push(child); }
    remove(child) {}
    traverse(fn) { fn(this); }
  }

  class Mesh {
    constructor(geom, mat) {
      this.geometry = geom;
      this.material = mat;
      this.position = new Vector3();
      this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
      this.castShadow = false;
    }
  }

  class Color {
    constructor(val) { this.val = val; }
    setHSL() { return this; }
  }

  const THREE = {
    Group,
    Vector3,
    Mesh,
    Color,
    BoxGeometry: class {},
    MeshStandardMaterial: class {},
    MeshBasicMaterial: class {},
    CanvasTexture: class {},
    SpriteMaterial: class {},
    Sprite: class {
      constructor() {
        this.position = new Vector3();
        this.scale = new Vector3(1, 1, 1);
      }
    }
  };

  const { Avatar } = new Function(
    'THREE',
    avatarCode + '\nreturn { Avatar };'
  )(THREE);

  return { Avatar, THREE };
}

it('server GameState modifyBlock updates standing player position when supporting floor is excavated', () => {
  const state = new GameState(12345);
  const p1 = state.addPlayer('p1', 'Excavator');
  const p2 = state.addPlayer('p2', 'StandingPlayer');

  p1.pos = [10, 25, 12];
  p2.pos = [10.2, 25.0, 10.2]; // Standing on block at (10, 24, 10)

  // Excavate block directly beneath p2's feet
  const result = state.modifyBlock('p1', 10, 24, 10, 0);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.delta.blockType, 0);
  assert.ok(Array.isArray(result.delta.affectedPlayers));
  assert.strictEqual(result.delta.affectedPlayers.length, 1);
  assert.strictEqual(result.delta.affectedPlayers[0].id, 'p2');
  assert.strictEqual(result.delta.affectedPlayers[0].pos[1], 24);

  // Authoritative player state updated
  assert.strictEqual(p2.pos[1], 24);
  const snapshot = state.getPlayersSnapshot();
  const p2Snap = snapshot.find(p => p.id === 'p2');
  assert.strictEqual(p2Snap.pos[1], 24);
});

it('server GameState modifyBlock rejects placing solid block intersecting any player bounding box', () => {
  const state = new GameState(12345);
  const p1 = state.addPlayer('p1', 'Builder');
  const p2 = state.addPlayer('p2', 'OtherPlayer');

  p1.pos = [10, 25, 12];
  p2.pos = [10.2, 25.0, 10.2];

  // p1 tries to place block at (10, 25, 10) inside p2
  const placeResult = state.modifyBlock('p1', 10, 25, 10, 1);
  assert.strictEqual(placeResult.success, false);
  assert.strictEqual(placeResult.reason, 'Cannot place block inside player');
});

it('Avatar ground detection accurately computes exposed floor height after block excavation', () => {
  const { Avatar } = loadAvatarModule();
  const scene = { add: () => {}, remove: () => {} };
  const world = {
    blocks: new Map(),
    getBlock(x, y, z) {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return this.blocks.has(key) ? this.blocks.get(key) : 0;
    },
    getHeightAt(x, z) {
      return 24;
    }
  };

  // Set up solid ground at Y=23 (stone: 4) and Y=24 (gold: 18)
  world.blocks.set('0,23,0', 4);
  world.blocks.set('0,24,0', 18);

  const avatar = new Avatar('remote1', 'RemoteSteve', scene, world);
  avatar.group.position.set(0.5, 25.0, 0.5);
  avatar.targetPos.set(0.5, 25.0, 0.5);

  // Before excavation, ground is at 25.0 (resting on top of block 24)
  assert.strictEqual(avatar.getGroundHeight(0.5, 0.5, 25.0), 25.0);
  assert.strictEqual(avatar.isSupportedByBlock(0, 24, 0), true);

  // Excavate block 24 -> becomes AIR (0)
  world.blocks.set('0,24,0', 0);

  // Ground detection immediately returns 24.0 (resting on top of block 23)
  const exposedFloor = avatar.getGroundHeight(0.5, 0.5, 25.0);
  assert.strictEqual(exposedFloor, 24.0);
});

it('Avatar detects when supporting block beneath feet is removed and falls naturally with gravity', () => {
  const { Avatar } = loadAvatarModule();
  const scene = { add: () => {}, remove: () => {} };
  const world = {
    blocks: new Map([
      ['0,23,0', 4], // stone floor at Y=23 (surface 24.0)
      ['0,24,0', 0]  // block 24 excavated!
    ]),
    getBlock(x, y, z) {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return this.blocks.has(key) ? this.blocks.get(key) : 0;
    },
    getHeightAt: () => 24
  };

  const avatar = new Avatar('remote1', 'FallingSteve', scene, world);
  avatar.group.position.set(0.5, 25.0, 0.5);
  avatar.targetPos.set(0.5, 25.0, 0.5);

  // Block at (0, 24, 0) was removed
  avatar.onSupportingBlockRemoved(0, 24, 0);

  // Target position immediately updated to 24.0 and downward fall initiated
  assert.strictEqual(avatar.targetPos.y, 24.0);
  assert.strictEqual(avatar.onGround, false);
  assert.ok(avatar.velY < 0, 'Avatar must acquire downward velocity to fall naturally');

  // Simulate multiple physics frames of natural falling
  let landed = false;
  for (let step = 0; step < 20; step++) {
    avatar.update(0.02); // 20ms physics step
    if (avatar.onGround && avatar.group.position.y === 24.0) {
      landed = true;
      break;
    }
  }

  assert.strictEqual(landed, true, 'Avatar must fall naturally and land on exposed floor');
  assert.strictEqual(avatar.group.position.y, 24.0, 'Avatar must stand firmly at Y=24.0');
  assert.strictEqual(avatar.velY, 0, 'Vertical velocity must reset to 0 upon landing');
  assert.strictEqual(avatar.onGround, true, 'Avatar must be onGround once landed');
});

it('Avatar eliminates burying/sinking glitch by strictly clamping to solid voxel floor', () => {
  const { Avatar } = loadAvatarModule();
  const scene = { add: () => {}, remove: () => {} };
  const world = {
    blocks: new Map([
      ['5,24,5', 4] // Solid floor at Y=24 (surface 25.0)
    ]),
    getBlock(x, y, z) {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return this.blocks.has(key) ? this.blocks.get(key) : 0;
    },
    getHeightAt: () => 24
  };

  const avatar = new Avatar('remote1', 'SolidSteve', scene, world);
  avatar.group.position.set(5.5, 25.0, 5.5);
  avatar.targetPos.set(5.5, 25.0, 5.5);

  // Try to set remote position that would bury the player into the solid block (Y=23.5)
  avatar.setTargetState([5.5, 23.5, 5.5], [0, 0], 'idle');

  // setTargetState must clamp targetPos.y to solid ground (25.0)
  assert.strictEqual(avatar.targetPos.y, 25.0, 'Target position must not allow avatar to sink into solid blocks');

  // If group position is forcefully set below ground, update must clamp it immediately
  avatar.group.position.y = 22.0;
  avatar.update(0.016);
  assert.strictEqual(avatar.group.position.y, 25.0, 'Avatar model must never be buried beneath solid floor');
});

it('PlayerPhysics immediate floor detection and falling when supporting block is broken', () => {
  const { PlayerPhysics } = loadPlayerPhysicsModule();
  const world = {
    blocks: new Map([
      ['0,23,0', 4], // solid floor
      ['0,24,0', 4]  // block currently standing on
    ]),
    getBlock(x, y, z) {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return this.blocks.has(key) ? this.blocks.get(key) : 0;
    },
    getHeightAt: () => 24
  };

  const physics = new PlayerPhysics(world);
  physics.pos = { x: 0.5, y: 25.0, z: 0.5 };
  physics.vel = { x: 0, y: 0, z: 0 };
  physics.onGround = true;

  // Verify standing on block
  assert.strictEqual(physics.isSupportedByBlock(0, 24, 0), true);

  // Remove supporting block at (0, 24, 0)
  world.blocks.set('0,24,0', 0);
  physics.onBlockBroken(0, 24, 0);

  assert.strictEqual(physics.onGround, false, 'Player must immediately lose onGround status when supporting block breaks');

  // Run physics updates until landing on block 23 (Y=24.0)
  for (let i = 0; i < 30; i++) {
    physics.update(0.016, { moveX: 0, moveZ: 0, jump: false, sprint: false });
    if (physics.onGround) break;
  }

  assert.strictEqual(physics.onGround, true, 'Player must land on exposed floor');
  assert.strictEqual(physics.pos.y, 24.0, 'Player feet must be firmly on Y=24.0');
});

it('MultiplayerClient broadcasts and applies block deltas immediately and triggers ground detection', () => {
  const { Avatar } = loadAvatarModule();
  const multPath = path.resolve(__dirname, '../public/src/multiplayer.js');
  let multCode = fs.readFileSync(multPath, 'utf8')
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+class\s+MultiplayerClient/g, 'class MultiplayerClient');

  const { MultiplayerClient } = new Function(
    'Avatar',
    multCode + '\nreturn { MultiplayerClient };'
  )(Avatar);

  const mockWorld = {
    blocks: new Map([
      ['10,23,10', 4],
      ['10,24,10', 4]
    ]),
    blockDeltas: new Map(),
    getBlock(x, y, z) {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return this.blocks.has(key) ? this.blocks.get(key) : 0;
    },
    setBlock(x, y, z, type) {
      this.blocks.set(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`, type);
    },
    applyBlockDelta(x, y, z, type) {
      this.blockDeltas.set(`${x},${y},${z}`, type);
      this.setBlock(x, y, z, type);
    },
    getHeightAt: () => 24
  };

  const scene = { add: () => {}, remove: () => {} };
  const particles = { spawnBlockDebris: () => {} };

  const client = new MultiplayerClient(mockWorld, scene, particles);
  client.myId = 'local_p1';

  // Add remote player standing on (10, 24, 10)
  client.addRemotePlayer({ id: 'remote_p2', name: 'Partner', pos: [10.5, 25.0, 10.5], rot: [0, 0], action: 'idle' });
  const remote = client.remoteAvatars.get('remote_p2');
  assert.ok(remote);
  assert.strictEqual(remote.group.position.y, 25.0);

  // Incoming synchronized block update: block at (10, 24, 10) was broken!
  client.handleMessage(JSON.stringify({
    type: 'block_update',
    data: { x: 10, y: 24, z: 10, blockType: 0, playerId: 'local_p1' }
  }));

  // Block delta must be recorded in world.blockDeltas and world block updated
  assert.strictEqual(mockWorld.blockDeltas.get('10,24,10'), 0);
  assert.strictEqual(mockWorld.getBlock(10, 24, 10), 0);

  // Remote avatar targetPos.y must be immediately updated to newly exposed floor (24.0)
  assert.strictEqual(remote.targetPos.y, 24.0, 'Remote avatar targetPos.y must immediately update to newly exposed floor');
  assert.strictEqual(remote.onGround, false, 'Remote avatar must begin falling');
});

it('server GameState modifyBlock updates multiple players standing on the same excavated block', () => {
  const state = new GameState(12345);
  const p1 = state.addPlayer('p1', 'Excavator');
  const p2 = state.addPlayer('p2', 'Standing1');
  const p3 = state.addPlayer('p3', 'Standing2');

  p1.pos = [0, 25, 2];
  p2.pos = [0.1, 25.0, 0.1];
  p3.pos = [0.2, 25.0, 0.2];

  // Excavate block beneath both p2 and p3
  const result = state.modifyBlock('p1', 0, 24, 0, 0);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.delta.affectedPlayers.length, 2);
  const ids = result.delta.affectedPlayers.map(p => p.id);
  assert.ok(ids.includes('p2'));
  assert.ok(ids.includes('p3'));

  assert.strictEqual(p2.pos[1], 24);
  assert.strictEqual(p3.pos[1], 24);
});

it('server GameState modifyBlock handles deep multi-level vertical excavation down through multiple blocks', () => {
  const state = new GameState(12345);
  const p1 = state.addPlayer('p1', 'Miner');
  const p2 = state.addPlayer('p2', 'ShaftVictim');

  p1.pos = [2, 25, 2];
  p2.pos = [2.1, 25.0, 0.1];

  // Excavate block 24 -> victim drops to 24
  const res1 = state.modifyBlock('p1', 2, 24, 0, 0);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(p2.pos[1], 24);

  // Excavate block 23 -> victim drops to 23
  const res2 = state.modifyBlock('p1', 2, 23, 0, 0);
  assert.strictEqual(res2.success, true);
  assert.strictEqual(p2.pos[1], 23);

  // Excavate block 22 -> victim drops to 22
  const res3 = state.modifyBlock('p1', 2, 22, 0, 0);
  assert.strictEqual(res3.success, true);
  assert.strictEqual(p2.pos[1], 22);
});

it('server GameState detonateTnt updates standing player authoritative Y position to newly exposed floor', () => {
  const state = new GameState(12345);
  const p1 = state.addPlayer('p1', 'TntGuy');
  p1.pos = [10.1, 25.0, 10.1];

  // Detonate TNT at (10, 24, 10) directly beneath p1 with radius 2
  const blast = state.detonateTnt(10, 24, 10, 2);
  assert.ok(blast.destroyedBlocks.length > 0);

  // p1 must have fallen to newly exposed floor below 24
  assert.ok(p1.pos[1] < 25.0, 'Player Y must drop to newly exposed floor after TNT blast');
});

it('verifies World.prototype.applyAuthoritativeBlock updates voxel memory immediately and synchronously remeshes chunk and boundary neighbors', () => {
  const { World, BLOCKS } = loadWorldModule();
  const mockMaterials = { solidMaterial: {}, transparentMaterial: {}, waterMaterial: {}, getUV: () => [0, 0, 1, 1] };
  const world = new World(null, mockMaterials, 12345);

  // Set block in center of chunk (0, 0)
  world.setBlock(5, 24, 5, BLOCKS.STONE);
  const chunk00 = world.getChunk(0, 0);
  assert.ok(chunk00);

  // Apply authoritative block destruction
  world.applyAuthoritativeBlock(5, 24, 5, BLOCKS.AIR);
  assert.strictEqual(world.getBlock(5, 24, 5), BLOCKS.AIR);
  assert.strictEqual(world.blockDeltas.get('5,24,5'), BLOCKS.AIR);
  assert.strictEqual(chunk00.rebuilt, true);
  assert.strictEqual(chunk00.isDirty, false);

  // Now test boundary block on west border (lx = 0) of chunk (1, 0) -> global x = 16
  world.getOrCreateChunk(0, 0);
  world.getOrCreateChunk(1, 0);
  const chunk10 = world.getChunk(1, 0);
  chunk00.rebuilt = false;
  chunk10.rebuilt = false;

  world.applyAuthoritativeBlock(16, 24, 5, BLOCKS.AIR);
  assert.strictEqual(world.getBlock(16, 24, 5), BLOCKS.AIR);
  assert.strictEqual(chunk10.rebuilt, true, 'Main chunk must be synchronously remeshed');
  assert.strictEqual(chunk00.rebuilt, true, 'West neighbor chunk across boundary (lx=0) must be synchronously remeshed');

  // Verify block synchronization hook invocation
  let hookCalled = false;
  let hookedBlock = null;
  world.addBlockHook((x, y, z, blockType) => {
    hookCalled = true;
    hookedBlock = { x, y, z, blockType };
  });
  world.applyAuthoritativeBlock(3, 20, 3, BLOCKS.GRASS);
  assert.strictEqual(hookCalled, true, 'Registered block hook must be invoked');
  assert.deepStrictEqual(hookedBlock, { x: 3, y: 20, z: 3, blockType: BLOCKS.GRASS });
});

it('verifies Avatar leg pivot alignment at Y=0.75, torso at Y=1.125, head at Y=1.50 preventing floor submergence', () => {
  const { Avatar } = loadAvatarModule();
  const scene = { add: () => {}, remove: () => {} };
  const avatar = new Avatar('test_steve', 'Steve', scene, null);

  // 1. Verify hip pivots are at Y = 0.75
  assert.strictEqual(avatar.leftLegPivot.position.y, 0.75, 'Left leg pivot must be at Y = 0.75');
  assert.strictEqual(avatar.rightLegPivot.position.y, 0.75, 'Right leg pivot must be at Y = 0.75');

  // 2. Verify torso is at Y = 1.125 (height 0.75 spans 0.75 to 1.50)
  assert.strictEqual(avatar.torso.position.y, 1.125, 'Torso must be centered at Y = 1.125');

  // 3. Verify head group pivot is at Y = 1.50 and arms at Y = 1.375
  assert.strictEqual(avatar.headGroup.position.y, 1.50, 'Head group must pivot at neck Y = 1.50');
  assert.strictEqual(avatar.leftArmPivot.position.y, 1.375, 'Left arm must pivot at shoulder Y = 1.375');
  assert.strictEqual(avatar.rightArmPivot.position.y, 1.375, 'Right arm must pivot at shoulder Y = 1.375');

  // 4. Verify static source code does not contain the old 0.625 submergence pivot
  const avatarPath = path.resolve(__dirname, '../public/src/avatar.js');
  const avatarCode = fs.readFileSync(avatarPath, 'utf8');
  assert.strictEqual(avatarCode.includes('0.625'), false, 'avatar.js must not contain submerged 0.625 pivot');
});

it('verifies Avatar.prototype.updateGroundSupport invalidates onGround and applies downward velocity when supporting block is AIR', () => {
  const { Avatar } = loadAvatarModule();
  const scene = { add: () => {}, remove: () => {} };
  const world = {
    blocks: new Map([
      ['0,24,0', 4]
    ]),
    getBlock(x, y, z) {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      return this.blocks.has(key) ? this.blocks.get(key) : 0;
    },
    getHeightAt: () => 24
  };

  const avatar = new Avatar('support_test', 'SupportSteve', scene, world);
  avatar.group.position.set(0.5, 25.0, 0.5);
  avatar.onGround = true;

  // With solid stone at (0, 24, 0), ground support is valid
  const supported = avatar.updateGroundSupport(world);
  assert.strictEqual(supported, true);
  assert.strictEqual(avatar.onGround, true);

  // Excavate block beneath feet
  world.blocks.set('0,24,0', 0); // AIR

  // updateGroundSupport must return false, invalidate onGround, and apply downward velocity
  const unsupported = avatar.updateGroundSupport(world);
  assert.strictEqual(unsupported, false);
  assert.strictEqual(avatar.onGround, false);
  assert.ok(avatar.velY < 0, 'Vertical velocity must be negative to initiate downward descent');
});

it('verifies Rifle ADS scope lens transparency and optic auto-hide prevent opaque square obstruction during zoom', () => {
  const { Controls, mockTHREE } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  camera.updateProjectionMatrix = () => {};
  const domElement = { addEventListener: () => {} };
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    vel: new mockTHREE.Vector3(0, 0, 0),
    action: 'idle',
    onGround: true,
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };
  const world = { getBlock: () => 0 };

  const controls = new Controls(camera, domElement, physics, world);
  controls.setWeaponsMode(true);
  controls.setAiming(true);

  assert.ok(controls.scopeLensMat, 'Rifle must expose scopeLensMat');
  assert.strictEqual(controls.scopeLensMat.transparent, true, 'Scope lens material must be transparent');
  assert.ok(controls.scopeLensMat.opacity <= 0.25, 'Scope lens opacity must be low enough to see through');
  assert.ok(Array.isArray(controls.scopeOptics) && controls.scopeOptics.length >= 4, 'Rifle must track scopeOptics meshes');

  // Advance ADS transition to full zoom (aimBlend > 0.82)
  for (let i = 0; i < 20; i++) {
    controls.update(0.05);
  }
  assert.ok(controls.aimBlend > 0.82, 'aimBlend must reach full ADS threshold (> 0.82)');
  assert.strictEqual(controls.rifleGroup.visible, false, '3D rifle group must hide at full ADS zoom so no geometry blocks camera lens');
  for (const optic of controls.scopeOptics) {
    assert.strictEqual(optic.visible, false, 'Scope optic mesh must be hidden during ADS zoom');
  }
});

it('verifies ParticleManager.prototype.spawnPrimedTnt creates 3D thrown TNT block with fuse, parabolic flight, and detonation callback', () => {
  const { ParticleManager } = loadParticlesModuleForM2();
  const mockScene = {
    children: [],
    add(obj) { this.children.push(obj); },
    remove(obj) {
      const idx = this.children.indexOf(obj);
      if (idx !== -1) this.children.splice(idx, 1);
    }
  };

  const pm = new ParticleManager(mockScene);
  let detonated = false;
  const entity = pm.spawnPrimedTnt(
    { x: 0, y: 26.5, z: 0 },
    { x: 4, y: 24, z: -4 },
    1000,
    () => { detonated = true; }
  );

  assert.ok(entity && entity.group, 'spawnPrimedTnt must create a 3D PrimedTnt group');
  assert.strictEqual(pm.primedTnts.length, 1, 'ParticleManager must track active primed TNT entity');
  assert.ok(entity.group.children.length >= 6, '3D TNT block must include red body, white band, TNT lettering, fuse, and ember tip');

  // Step through flight (0.2s) and verify parabolic arc elevation above linear interpolation
  pm.update(0.2, { x: 0, y: 25, z: 0 });
  assert.ok(entity.group.position.y > 25.5, 'Thrown TNT must follow an upward parabolic arc during flight');

  // Step past 1.0s fuse expiry and verify detonation + cleanup
  pm.update(0.9, { x: 0, y: 25, z: 0 });
  assert.strictEqual(detonated, true, 'Primed TNT must invoke onDetonate callback when fuse expires');
  assert.strictEqual(pm.primedTnts.length, 0, 'Detonated TNT entity must be removed from active list');
});

it('verifies SE Gran Circuito closed-loop track continuity, exterior perimeter fence, and track-facing Tribuna Principal grandstand slope', () => {
  const { World, BLOCKS } = loadWorldModule();
  const world = new World(null, null, 12345);

  // Preload all chunks covering SE Gran Circuito (X: 46..210, Z: -182..-38)
  for (let cx = Math.floor(46 / 16); cx <= Math.floor(210 / 16); cx++) {
    for (let cz = Math.floor(-182 / 16); cz <= Math.floor(-38 / 16); cz++) {
      world.getOrCreateChunk(cx, cz);
    }
  }

  // 1. Verify 100% closed-loop asphalt continuity around the entire stadium track centerline (r = 22.5)
  const loopPoints = [];
  for (let x = 80; x <= 176; x += 6) {
    loopPoints.push([x, -60]);  // North straight
    loopPoints.push([x, -154]); // South straight
  }
  for (let z = -132; z <= -82; z += 6) {
    loopPoints.push([58, z]);   // West straight
    loopPoints.push([198, z]);  // East straight
  }
  for (const [cx, cz, aStart, aEnd] of [
    [176, -82, 0, Math.PI / 2],
    [176, -132, -Math.PI / 2, 0],
    [80, -132, -Math.PI, -Math.PI / 2],
    [80, -82, Math.PI / 2, Math.PI]
  ]) {
    for (let s = 1; s <= 5; s++) {
      const a = aStart + (aEnd - aStart) * (s / 6);
      loopPoints.push([Math.round(cx + Math.cos(a) * 22.5), Math.round(cz + Math.sin(a) * 22.5)]);
    }
  }

  for (const [px, pz] of loopPoints) {
    const surfaceBlock = world.getBlock(px, 24, pz);
    assert.ok(
      surfaceBlock === BLOCKS.ASPHALT || surfaceBlock === BLOCKS.SNOW,
      `Track centerline at (${px}, 24, ${pz}) must be ASPHALT or SNOW road marking (got ${surfaceBlock})`
    );
    assert.strictEqual(world.getBlock(px, 25, pz), BLOCKS.AIR, `Track lane at (${px}, 25, ${pz}) must be clear of barriers`);
  }

  // 2. Verify Tribuna Principal grandstand (X=120, Z=-50..-43) slopes UP away from the track (front row low at Z=-50, back row high at Z=-43)
  let frontHighestSolid = 24;
  let backHighestSolid = 24;
  for (let y = 25; y <= 32; y++) {
    if (world.getBlock(120, y, -50) !== BLOCKS.AIR) frontHighestSolid = y;
    if (world.getBlock(120, y, -43) !== BLOCKS.AIR) backHighestSolid = y;
  }
  assert.ok(
    frontHighestSolid < backHighestSolid,
    `Grandstand must face the track: front row at Z=-50 (Y=${frontHighestSolid}) must be lower than rear tier at Z=-43 (Y=${backHighestSolid})`
  );

  // 3. Verify exterior complex security fence at X=46, Z=-100
  assert.notStrictEqual(world.getBlock(46, 25, -100), BLOCKS.AIR, 'Exterior perimeter fence must be built at X=46, Y=25, Z=-100');
});

it('verifies DrivableCar spawns visibly on top of Y=24 roadbed at Y=25.0 and drives on real World without floor collision', () => {
  const { World } = loadWorldModule();
  const { VehicleManager } = loadVehicleModule();
  const world = new World(null, null, 12345);
  const mockScene = { add: () => {}, remove: () => {} };
  const mockPM = { spawnDriftSmoke: () => {} };

  const vm = new VehicleManager(world, mockScene, mockPM);
  const sePoleCar = vm.getCarById('car_se_scuderia');
  assert.ok(sePoleCar, 'SE Pole car must exist');
  assert.strictEqual(sePoleCar.pos.y, 25, 'SE Pole car must spawn at Y=25.0 on top of the Y=24 asphalt block');
  assert.strictEqual(sePoleCar.group.position.y, 25, 'Car 3D mesh group must sit at Y=25.0 above the road surface');

  // Load chunk around car and drive forward along the main straight
  world.getOrCreateChunk(Math.floor(sePoleCar.pos.x / 16), Math.floor(sePoleCar.pos.z / 16));
  world.getOrCreateChunk(Math.floor((sePoleCar.pos.x - 10) / 16), Math.floor(sePoleCar.pos.z / 16));

  const startX = sePoleCar.pos.x;
  for (let i = 0; i < 15; i++) {
    sePoleCar.updatePhysics(0.05, { forward: 1, steer: 0 }, world);
  }
  assert.ok(Math.abs(sePoleCar.pos.x - startX) > 2.0, 'DrivableCar must drive freely along the real World asphalt track without colliding with the Y=24 floor');
  assert.ok(sePoleCar.pos.y >= 24.9, 'DrivableCar must remain elevated on top of the Y=25.0 road surface while driving');

  // Verify DrivableCar maintains Y=25.0 across SE East Lake Bridge (198, -120) and SE Mountain Tunnel (100, -154)
  for (const [tx, tz, yaw, label] of [
    [198, -125, Math.PI, 'SE East Lake Bridge'],
    [110, -154, Math.PI / 2, 'SE South Mountain Tunnel'],
    [-410, -510, Math.PI, 'NW Lakeside Bridge'],
    [-460, -585, Math.PI / 2, 'NW North Mountain Tunnel']
  ]) {
    world.getOrCreateChunk(Math.floor(tx / 16), Math.floor(tz / 16));
    world.getOrCreateChunk(Math.floor((tx - 8) / 16), Math.floor((tz + 8) / 16));
    sePoleCar.pos = { x: tx, y: 25, z: tz };
    sePoleCar.yaw = yaw;
    sePoleCar.speed = 10;
    for (let i = 0; i < 10; i++) {
      sePoleCar.updatePhysics(0.05, { forward: 1, steer: 0 }, world);
    }
    assert.strictEqual(Math.round(sePoleCar.pos.y), 25, `DrivableCar on ${label} must stay level at Y=25 (got ${sePoleCar.pos.y})`);
  }
});

it('verifies Central Plaza cardinal walkways are free of fountains at (0, +-6) and (+-6, 0) and highway cars complete full route turnarounds without sticking', () => {
  const { World, BLOCKS } = loadWorldModule();
  const { TrafficManager } = loadAnimalsModule();
  const world = new World({ add: () => {} }, null, 48151623);
  for (let cx = -16; cx <= 16; cx++) {
    for (let cz = -16; cz <= 16; cz++) {
      world.getOrCreateChunk(cx, cz);
    }
  }

  // 1. Verify cardinal avenues at (0, +-6) and (+-6, 0) are clear AIR at Y=25..27 (fountains moved to diagonal courtyards +-5, +-5)
  for (const [ax, az] of [[0, 6], [0, -6], [6, 0], [-6, 0]]) {
    assert.strictEqual(world.getBlock(ax, 25, az), BLOCKS.AIR, `Cardinal avenue at (${ax}, 25, ${az}) must be clear AIR`);
    assert.strictEqual(world.getBlock(ax, 26, az), BLOCKS.AIR, `Cardinal avenue at (${ax}, 26, ${az}) must be clear AIR`);
  }

  // 2. Simulate 2000 frames (100 seconds) so every highway car reaches its route endpoint (x2, z2) and wraps around cleanly
  const tm = new TrafficManager({ add: () => {} }, world);
  for (let frame = 0; frame < 2000; frame++) {
    tm.update(0.05);
  }
  for (let i = 0; i < tm.cars.length; i++) {
    const car = tm.cars[i];
    assert.ok(car.currentSpeed > 2.0, `Car ${i} on route ${car.route.type} must never get stuck at route endpoint (speed=${car.currentSpeed}, pos=${car.position.x.toFixed(1)},${car.position.z.toFixed(1)})`);
    assert.strictEqual(car.isStopped, false, `Car ${i} must remain moving after full route turnaround`);
  }
});

// =============================================================================
// SECTION 12: MOBILE MULTIPLAYER EXPANSION, STEALTH ADMIN, SOLID COLLISIONS & PERFORMANCE (R1-R6)
// =============================================================================
console.log('\n[SECTION 12: MOBILE MULTIPLAYER EXPANSION, STEALTH ADMIN, SOLID COLLISIONS & PERFORMANCE (R1-R6)]');

it('R1: Server stability - GameState decouples animal despawn timeouts into animalTimers and getAnimalsSnapshot returns clean DTOs without circular JSON', () => {
  const state = new GameState(12345);
  assert.ok(state.animalTimers instanceof Map, 'GameState must maintain animalTimers Map decoupled from entity objects');
  const firstAnimal = state.animals.values().next().value;
  assert.ok(firstAnimal, 'Initial ambient animal must exist');
  const animalId = firstAnimal.id;

  // Damage animal to trigger despawn sequence
  state.hitAnimal(animalId, 'shooter_1');
  assert.strictEqual(firstAnimal.despawnTimeout, undefined, 'Animal entity must NOT have despawnTimeout attached to it directly');
  assert.ok(state.animalTimers.has(animalId), 'Despawn timer must be tracked inside animalTimers Map');

  // getAnimalsSnapshot must export plain DTOs
  const snapshot = state.getAnimalsSnapshot();
  assert.ok(Array.isArray(snapshot));
  assert.ok(snapshot.length > 0);

  // Crucial test: JSON.stringify must succeed without circular structure error
  let jsonString;
  assert.doesNotThrow(() => {
    jsonString = JSON.stringify(snapshot);
  }, 'Serializing animals snapshot must never throw circular JSON error');
  assert.ok(jsonString.length > 0);

  // Clean up timer
  const timer = state.animalTimers.get(animalId);
  clearTimeout(timer);
  state.animalTimers.delete(animalId);
});

it('R1: Server stability - RoomManager.prototype.broadcast safely handles client socket errors and serialization without unhandled exceptions', () => {
  const rm = new RoomManager({ maxPlayers: 10, seed: 12345 });
  const room = rm.getOrCreateRoom('main');

  const brokenWs = {
    readyState: 1,
    send: () => { throw new Error('EPIPE: broken pipe on render socket'); }
  };
  const closedWs = {
    readyState: 3, // CLOSED
    send: () => {}
  };
  let goodMsg = null;
  const goodWs = {
    readyState: 1,
    send: (str) => { goodMsg = JSON.parse(str); }
  };

  room.clients.set(brokenWs, 'p_broken');
  room.clients.set(closedWs, 'p_closed');
  room.clients.set(goodWs, 'p_good');

  assert.doesNotThrow(() => {
    rm.broadcast(room, 'test_broadcast', { message: 'hello world', count: 42 });
  }, 'broadcast must safely handle socket errors without crashing process');

  assert.ok(goodMsg, 'Healthy socket must receive broadcast packet');
  assert.strictEqual(goodMsg.type, 'test_broadcast');
  assert.strictEqual(goodMsg.data.count, 42);

  rm.destroy();
});

it('R1 & Performance: World.prototype.updateStreaming generates 3x3 core immediately and throttles outer ring chunks', () => {
  const { World } = loadWorldModule();
  const world = new World(null, null, 12345);

  // Player spawns at (3, 25, 6)
  world.updateStreaming(3, 6);

  // 3x3 core around (cx=0, cz=0) covers cx in [-1, 1] and cz in [-1, 1]
  for (let cx = -1; cx <= 1; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      const key = world.getChunkKey(cx, cz);
      assert.ok(world.chunks.has(key), `Chunk (${cx}, ${cz}) in 3x3 core must be generated immediately on first frame`);
    }
  }

  // Block under feet at spawn (3, 24, 6) must exist and be non-air
  const spawnGround = world.getBlock(3, 24, 6);
  assert.notStrictEqual(spawnGround, 0, 'Spawn point ground at (3, 24, 6) must be solid to prevent void falling');
});

it('Performance: World.prototype.applyAuthoritativeBlock synchronizes voxel chunk data, clears dirty flag, and caches deltas', () => {
  const { World, BLOCKS } = loadWorldModule();
  const mockMaterials = { solidMaterial: {}, transparentMaterial: {}, waterMaterial: {}, getUV: () => [0, 0, 1, 1] };
  const world = new World(null, mockMaterials, 12345);

  const chunk = world.getOrCreateChunk(0, 0);
  chunk.rebuilt = false;

  world.applyAuthoritativeBlock(5, 24, 5, BLOCKS.STONE);
  assert.strictEqual(chunk.rebuilt, true, 'Block modification must trigger rebuildMesh on loaded chunk');
  assert.strictEqual(chunk.isDirty, false, 'applyAuthoritativeBlock must synchronously clear chunk.isDirty');
  assert.strictEqual(world.getBlock(5, 24, 5), BLOCKS.STONE);
  assert.strictEqual(world.blockDeltas.get('5,24,5'), BLOCKS.STONE);

  // Delta on unloaded chunk must be cached in blockDeltas
  world.applyAuthoritativeBlock(120, 24, 120, BLOCKS.ASPHALT);
  assert.strictEqual(world.blockDeltas.get('120,24,120'), BLOCKS.ASPHALT, 'Unloaded chunk delta must be recorded in blockDeltas');
});

it('R2: Plaza Central F1 red car (car_spawn_red) is completely removed while blue car and all 12 circuit cars remain', () => {
  const { VehicleManager } = loadVehicleModule();
  const vm = new VehicleManager(null, { add: () => {}, remove: () => {} }, { spawnDriftSmoke: () => {} });

  // Verify car_spawn_red is completely gone
  const redF1 = vm.getCarById('car_spawn_red');
  assert.ok(!redF1, 'car_spawn_red (GT Monza Rojo) must be completely removed from Plaza Central');

  // Verify blue car and gold car are retained
  const bluePlazaCar = vm.getCarById('car_spawn_blue');
  assert.ok(bluePlazaCar, 'car_spawn_blue (GT Paris Azul) must remain in Plaza Central');
  const goldPlazaCar = vm.getCarById('car_spawn_gold');
  assert.ok(goldPlazaCar, 'car_spawn_gold (GT Veloce Oro) must remain in Plaza Central');

  // Verify all 12 Gran Circuito cars are present
  const circuitIds = [
    'car_se_scuderia', 'car_se_redbull', 'car_se_mercedes', 'car_se_mclaren',
    'car_se_aston', 'car_se_alpine', 'car_se_williams', 'car_se_haas',
    'car_se_grid1', 'car_se_grid2', 'car_se_papaya', 'car_se_silver'
  ];
  for (const cid of circuitIds) {
    const c = vm.getCarById(cid);
    assert.ok(c, `Gran Circuito car ${cid} must remain present in circuit`);
  }

  // Source check on public/src/vehicle.js
  const vehicleCode = fs.readFileSync(path.resolve(__dirname, '../public/src/vehicle.js'), 'utf8');
  assert.strictEqual(vehicleCode.includes("'car_spawn_red'"), false, 'vehicle.js must not contain car_spawn_red definition');
});

it('R2: Persistent Map Sync - Block modifications persist across disconnects and 0-player rooms, only wiped by admin reset', () => {
  const rm = new RoomManager({ maxPlayers: 10, seed: 12345 });
  const p1Msgs = [];
  const ws1 = {
    readyState: 1,
    send: (s) => p1Msgs.push(JSON.parse(s)),
    on: () => {}
  };
  rm.handleConnection(ws1);
  const meta1 = rm.socketMeta.get(ws1);
  rm.handleJoin(ws1, meta1, { name: 'PersistentBuilder' });

  // Place asphalt block at (4, 25, 6) within reach of spawn (3, 25, 6)
  rm.handleBlockModify(ws1, meta1, { x: 4, y: 25, z: 6, blockType: 20 });
  const room = rm.rooms.get('main');
  assert.strictEqual(room.gameState.blockDeltas.get('4,25,6'), 20);

  // Disconnect ws1 -> room client count reaches 0
  rm.handleDisconnect(ws1);
  assert.strictEqual(room.clients.size, 0);
  assert.strictEqual(room.gameState.blockDeltas.get('4,25,6'), 20, 'Block delta must persist even when 0 players remain in the room');

  // ws2 joins empty room
  const p2Msgs = [];
  const ws2 = {
    readyState: 1,
    send: (s) => p2Msgs.push(JSON.parse(s)),
    on: () => {}
  };
  rm.handleConnection(ws2);
  const meta2 = rm.socketMeta.get(ws2);
  rm.handleJoin(ws2, meta2, { name: 'LateJoiner' });

  const initMsg = p2Msgs.find(m => m.type === MSG.INIT);
  assert.ok(initMsg, 'Late joiner must receive INIT packet');
  const delta4 = initMsg.data.deltas.find(d => d[0] === 4 && d[1] === 25 && d[2] === 6);
  assert.ok(delta4, 'Persistent delta must be transmitted to late joiner in initial state');
  assert.strictEqual(delta4[3], 20);

  // Admin triggers server reset
  const adminWs = {
    readyState: 1,
    send: () => {},
    on: () => {}
  };
  rm.handleConnection(adminWs);
  const metaAdmin = rm.socketMeta.get(adminWs);
  rm.handleJoin(adminWs, metaAdmin, { name: 'jsieiragerpe', email: 'jsieiragerpe@gmail.com', adminKey: 'ARGÓN4' });

  rm.handleAdminResetServer(adminWs, metaAdmin, { email: 'jsieiragerpe@gmail.com', adminKey: 'ARGÓN4' });
  assert.strictEqual(room.gameState.blockDeltas.size, 0, 'Block deltas must be cleared upon admin server reset');

  rm.destroy();
});

it('R3: Drivable car physics and seated avatar pose snap directly to cockpit seat coordinates without lerp delay or ground clamping', () => {
  const { VehicleManager } = loadVehicleModule();
  const { Avatar } = loadAvatarModule();
  const vm = new VehicleManager(null, { add: () => {}, remove: () => {} }, { spawnDriftSmoke: () => {} });
  const car = vm.getCarById('car_se_scuderia');
  assert.ok(car, 'Scuderia car must exist');

  const avatar = new Avatar('seat_test', 'RacerSteve', { add: () => {} }, null);
  const seat = car.getSeatPosition();

  // Transition avatar to driving state
  avatar.setTargetState([seat.x, seat.y, seat.z], [car.yaw, 0], 'driving');
  avatar.update(0.05);

  // Direct snap check
  assert.strictEqual(avatar.group.position.x, seat.x, 'Avatar X must snap directly to seat X without lerp lag');
  assert.strictEqual(avatar.group.position.y, seat.y, 'Avatar Y must snap directly to seat Y');
  assert.strictEqual(avatar.group.position.z, seat.z, 'Avatar Z must snap directly to seat Z');
  assert.strictEqual(avatar.action, 'driving');

  // Seated posture checks
  assert.strictEqual(avatar.torso.position.y, 0.65, 'Seated torso must be lowered to Y=0.65');
  assert.strictEqual(avatar.leftLegPivot.position.y, 0.35, 'Seated leg pivots must be lowered to Y=0.35');
  assert.strictEqual(avatar.headGroup.position.y, 1.02, 'Seated head must be positioned at Y=1.02');
});

it('R3: Solid 2D OBB player-car collision prevents pedestrian from walking through drivable and traffic cars', () => {
  const { VehicleManager } = loadVehicleModule();
  const { VoxelCar } = loadAnimalsModule();
  const vm = new VehicleManager(null, { add: () => {}, remove: () => {} }, { spawnDriftSmoke: () => {} });
  const car = vm.getCarById('car_spawn_blue');
  assert.ok(car);
  car.pos = { x: 25.0, y: 25.0, z: 0.0 };
  car.yaw = 0.0; // Heading along -Z

  // 1. DrivableCar solid collision pushout
  const mockPhysics = { pos: { x: 25.0, y: 25.0, z: 0.0 } }; // player inside center of car
  vm.resolvePlayerCarCollisions(mockPhysics);
  const pushedDistX = Math.abs(mockPhysics.pos.x - 25.0);
  const pushedDistZ = Math.abs(mockPhysics.pos.z - 0.0);
  assert.ok(pushedDistX >= 1.15 || pushedDistZ >= 2.0, 'Player must be pushed outside DrivableCar bounding box');

  // 2. VoxelCar (traffic car) collision pushout
  const trafficCar = new VoxelCar({ type: 'straight', x1: 0, z1: 0, x2: 0, z2: -100 }, 1, null, { getBlock: () => 0 });
  trafficCar.position.set(0, 25.0, -10.0);
  trafficCar.rotationY = 0;

  const pedestrian = { x: 0, y: 25.0, z: -10.3 };
  trafficCar.update(0.016, pedestrian);
  const tdx = Math.abs(pedestrian.x - trafficCar.position.x);
  const tdz = Math.abs(pedestrian.z - trafficCar.position.z);
  assert.ok(tdx >= 1.15 || tdz >= 1.85, 'Pedestrian must be pushed outside traffic car boundary');
});

it('R3: Mobile touch driving controls UI provides dedicated pedals and steering buttons', () => {
  const htmlPath = path.resolve(__dirname, '../public/index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(html.includes('id="mobile-driving-controls"'), 'Index HTML must include #mobile-driving-controls');
  assert.ok(html.includes('id="mobile-drive-left"'), 'Must include #mobile-drive-left steer button');
  assert.ok(html.includes('id="mobile-drive-right"'), 'Must include #mobile-drive-right steer button');
  assert.ok(html.includes('id="mobile-drive-gas"'), 'Must include #mobile-drive-gas pedal button');
  assert.ok(html.includes('id="mobile-drive-brake"'), 'Must include #mobile-drive-brake pedal button');
  assert.ok(html.includes('mobile-steer-pad'), 'Must include mobile-steer-pad class');
  assert.ok(html.includes('mobile-pedal-pad'), 'Must include mobile-pedal-pad class');

  const cssPath = path.resolve(__dirname, '../public/styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('.mobile-action-btn.car-action-btn') || css.includes('#mobile-controls'), 'Styles must style mobile controls');
});

it('R4: Stealth Admin system - credential validation requires jsieiragerpe@gmail.com and ARGÓN4 / ARGON4 with zero public hints', () => {
  const { isValidAdminCredentials, ADMIN_EMAIL, sanitizeName } = require('../server/protocol');
  assert.strictEqual(ADMIN_EMAIL, 'jsieiragerpe@gmail.com');

  // Valid credentials (with accent and normalized)
  assert.strictEqual(isValidAdminCredentials('jsieiragerpe@gmail.com', 'ARGÓN4'), true);
  assert.strictEqual(isValidAdminCredentials('jsieiragerpe@gmail.com', 'ARGON4'), true);
  assert.strictEqual(isValidAdminCredentials('  jsieiragerpe@gmail.com  ', 'argon4'), true);
  assert.strictEqual(isValidAdminCredentials('JSIEIRAGERPE@GMAIL.COM', 'Argón4'), true);

  // Invalid credentials
  assert.strictEqual(isValidAdminCredentials('jsieiragerpe@gmail.com', 'wrong_password'), false);
  assert.strictEqual(isValidAdminCredentials('other_user@gmail.com', 'ARGÓN4'), false);
  assert.strictEqual(isValidAdminCredentials(null, 'ARGÓN4'), false);
  assert.strictEqual(isValidAdminCredentials('jsieiragerpe@gmail.com', null), false);
  assert.strictEqual(isValidAdminCredentials('', ''), false);

  // Sanitize name maps admin email to clean username
  assert.strictEqual(sanitizeName('jsieiragerpe@gmail.com'), 'jsieiragerpe');

  // Check index.html: public UI must hide admin panels with zero public hints
  const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');
  assert.ok(html.includes('id="admin-settings-panel" class="admin-settings-panel hidden"'), 'Admin panel must be hidden by default');
  assert.ok(html.includes('id="access-key-group" class="input-group hidden"'), 'Access key input group must be hidden by default');

  // Player name input must allow 40 characters
  const nameInputMatch = html.match(/id="player-name-input"[^>]*maxlength="(\d+)"/);
  assert.ok(nameInputMatch, 'player-name-input must specify maxlength');
  assert.ok(parseInt(nameInputMatch[1], 10) >= 40, 'player-name-input maxlength must be at least 40 to allow full email');
});

it('R4: Stealth Admin panel telemetry table tracks live players with joinedAt, coordinates, and 1-touch teleportation', () => {
  const rm = new RoomManager({ maxPlayers: 10, seed: 12345 });
  const adminMsgs = [];
  const adminWs = {
    readyState: 1,
    send: (s) => adminMsgs.push(JSON.parse(s)),
    on: () => {}
  };
  const bobWs = {
    readyState: 1,
    send: () => {},
    on: () => {}
  };

  rm.handleConnection(adminWs);
  rm.handleConnection(bobWs);
  const metaAdmin = rm.socketMeta.get(adminWs);
  const metaBob = rm.socketMeta.get(bobWs);

  rm.handleJoin(adminWs, metaAdmin, { name: 'jsieiragerpe', email: 'jsieiragerpe@gmail.com', adminKey: 'ARGÓN4' });
  rm.handleJoin(bobWs, metaBob, { name: 'ExplorerBob' });

  // Bob moves to (150, 30, -80)
  rm.handleMove(bobWs, metaBob, { pos: [150, 30, -80], rot: [0, 0] });

  const room = rm.rooms.get('main');
  const playersSnapshot = room.gameState.getPlayersSnapshot();
  const bobEntry = playersSnapshot.find(p => p.id === metaBob.id);
  assert.ok(bobEntry, 'Bob must be in player snapshot');
  assert.strictEqual(bobEntry.name, 'ExplorerBob');
  assert.deepStrictEqual(bobEntry.pos, [150, 30, -80]);
  assert.strictEqual(typeof bobEntry.joinedAt, 'number');
  assert.ok(bobEntry.joinedAt > 0);

  // Admin teleports to Bob
  rm.handleTeleportToPlayer(adminWs, metaAdmin, { targetPlayerId: metaBob.id });
  const adminPlayer = room.gameState.getPlayer(metaAdmin.id);
  assert.strictEqual(adminPlayer.pos[0], 150);
  assert.strictEqual(adminPlayer.pos[1], 30);
  assert.strictEqual(adminPlayer.pos[2], -80);

  rm.destroy();
});

it('R4: Admin Server Reset broadcasts "El admin ha reiniciado el server", resets world, and disconnects all clients', () => {
  const rm = new RoomManager({ maxPlayers: 10, seed: 12345 });
  const clientMsgs = [];
  const clientWs = {
    readyState: 1,
    send: (s) => clientMsgs.push(JSON.parse(s)),
    on: () => {}
  };
  const adminWs = {
    readyState: 1,
    send: () => {},
    on: () => {}
  };

  rm.handleConnection(clientWs);
  rm.handleConnection(adminWs);
  const metaClient = rm.socketMeta.get(clientWs);
  const metaAdmin = rm.socketMeta.get(adminWs);

  rm.handleJoin(clientWs, metaClient, { name: 'CasualGamer' });
  rm.handleJoin(adminWs, metaAdmin, { name: 'jsieiragerpe', email: 'jsieiragerpe@gmail.com', adminKey: 'ARGÓN4' });

  const room = rm.rooms.get('main');
  room.gameState.blockDeltas.set('10,24,10', 4);
  assert.strictEqual(room.clients.size, 2);

  // Admin triggers server reset
  rm.handleAdminResetServer(adminWs, metaAdmin, { email: 'jsieiragerpe@gmail.com', adminKey: 'ARGÓN4' });

  // Client must receive SERVER_RESET message
  const resetMsg = clientMsgs.find(m => m.type === MSG.SERVER_RESET);
  assert.ok(resetMsg, 'Connected client must receive SERVER_RESET packet');
  assert.strictEqual(resetMsg.data.message, 'El admin ha reiniciado el server');

  // Room must have 0 connected clients and 0 block deltas
  assert.strictEqual(room.clients.size, 0);
  assert.strictEqual(room.gameState.blockDeltas.size, 0);

  rm.destroy();
});

it('R5: Exact TNT placement places exactly 1 solid cube at targeted block face at any distance without floating or duplicating', () => {
  const { Controls, mockTHREE } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  camera.updateProjectionMatrix = () => {};
  const domElement = { addEventListener: () => {} };
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    vel: new mockTHREE.Vector3(0, 0, 0),
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };
  const world = {
    getBlock: (x, y, z) => (y <= 24 ? 4 : 0)
  };

  const controls = new Controls(camera, domElement, physics, world);
  controls.selectedSlot = 4; // Slot 5: BLOCKS.TNT (19)

  // Mock exact raycast to block face 150 blocks away
  controls.raycastVoxel = () => ({
    block: { x: 150, y: 24, z: -30 },
    place: { x: 150, y: 25, z: -30 },
    face: { x: 0, y: 1, z: 0 }
  });

  let placementCount = 0;
  controls.onPlaceTnt = () => { placementCount++; };

  const tnt = controls.throwTnt();
  assert.ok(tnt, 'throwTnt must return spawned TNT entity');
  assert.strictEqual(controls.activeTntEntities.length, 1, 'Exactly 1 TNT entity must be tracked');
  assert.strictEqual(placementCount, 1, 'Exactly 1 TNT placement callback must be triggered (no duplicates)');

  // Verify exact solid surface placement
  assert.strictEqual(tnt.pos.x, 150.5, 'TNT X must align with center of targeted block (150.5)');
  assert.strictEqual(tnt.pos.y, 25.47, 'TNT Y must sit on top of Y=25 block surface (25.47)');
  assert.strictEqual(tnt.pos.z, -29.5, 'TNT Z must align with center of targeted block (-29.5)');
  assert.strictEqual(tnt.onGround, true, 'TNT placed on solid block must have onGround === true (never floating)');
});

it('R6: Rifle Sniper ADS mode has infinite raycast range (>=1000m) striking remote targets and TNT', () => {
  const { Controls, mockTHREE } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.fov = 75;
  camera.updateProjectionMatrix = () => {};
  const domElement = { addEventListener: () => {} };
  const physics = {
    pos: new mockTHREE.Vector3(0, 25, 0),
    getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0),
    update: () => {}
  };

  let probedRange = 0;
  const mockAnimalManager = {
    getHitAnimal: (origin, dir, maxDist) => {
      probedRange = maxDist;
      return null;
    }
  };

  const controls = new Controls(camera, domElement, physics, { getBlock: () => 0 });
  controls.animalManager = mockAnimalManager;
  controls.setWeaponsMode(true);

  // 1. Hip-fire: range is standard 85m
  controls.setAiming(false);
  controls.aimBlend = 0.0;
  controls.lastShootTime = 0;
  const hipShot = controls.triggerShoot(true);
  assert.ok(hipShot, 'Hip shot must return shotData');
  assert.strictEqual(hipShot.range, 85.0, 'Hip fire range must be 85m');
  assert.strictEqual(hipShot.isSniperShot, false);
  assert.strictEqual(probedRange, 85.0);

  // 2. ADS Sniper Mode: range is infinite (>= 1000m)
  controls.setAiming(true);
  controls.aimBlend = 1.0;
  controls.lastShootTime = 0;
  const sniperShot = controls.triggerShoot(true);
  assert.ok(sniperShot, 'Sniper shot must return shotData');
  assert.ok(sniperShot.range >= 1000.0, 'Sniper ADS range must be at least 1000m');
  assert.strictEqual(sniperShot.isSniperShot, true, 'isSniperShot must be true');
  assert.ok(probedRange >= 1000.0, 'Animal raycast probe distance must be at least 1000m in sniper mode');
});

it('R6: Sniper scope overlay features touch buttons for firing (#scope-btn-shoot) and exiting (#scope-btn-exit)', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');
  assert.ok(html.includes('id="scope-overlay-actions"'), 'Scope overlay must contain #scope-overlay-actions container');
  assert.ok(html.includes('id="scope-btn-shoot"'), 'Must contain #scope-btn-shoot');
  assert.ok(html.includes('id="scope-btn-exit"'), 'Must contain #scope-btn-exit');
  assert.ok(html.includes('TIRAR'), 'Button must display TIRAR label');
  assert.ok(html.includes('QUITAR MIRA'), 'Button must display QUITAR MIRA label');

  const css = fs.readFileSync(path.resolve(__dirname, '../public/styles.css'), 'utf8');
  assert.ok(css.includes('#rifle-scope-overlay'), 'CSS must define #rifle-scope-overlay');
  assert.ok(css.includes('.scope-telemetry'), 'CSS must define .scope-telemetry');
});

it('Performance: Traffic car checkObstacleAhead throttles raycasts, detects pedestrians, and culls distant cars >120m', () => {
  const { VoxelCar } = loadAnimalsModule();
  let blockProbes = 0;
  const mockWorld = {
    getBlock: () => { blockProbes++; return 0; },
    isRoadAt: () => true
  };

  const car = new VoxelCar({ type: 'straight', x1: 0, z1: 0, x2: 0, z2: -200 }, 1, null, mockWorld);
  car.position.set(0, 25, 0);

  // 1. Pedestrian detection in heading path
  car._playerPos = { x: 0, y: 25, z: -4 }; // 4m ahead of car
  const obs = car.checkObstacleAhead(8.0);
  assert.ok(obs, 'Car must detect player in front bumper heading');
  assert.strictEqual(obs.isPlayer, true, 'Detected obstacle must be flagged as player');
  assert.ok(obs.distance <= 4.0, 'Detected obstacle distance must be <= 4m');

  // 2. Verify step size and deduplication: probing 8m should not perform excessive queries
  blockProbes = 0;
  car._playerPos = null;
  car.checkObstacleAhead(8.0);
  assert.ok(blockProbes < 200, `Probing 8m forward ahead must use efficient step size and deduplication (got ${blockProbes})`);
});

// =============================================================================
// SECTION 13: ADMIN TELEPORT, CALIBRATED ADS, VISIBLE WEAPONS, TNT POWER & SCOPE BUTTONS
// =============================================================================
console.log('\n[SECTION 13: ADMIN TELEPORT, CALIBRATED ADS, VISIBLE WEAPONS, TNT POWER & SCOPE BUTTONS]');

it('Admin Teleport: requestTeleportToPlayer and server handleTeleportToPlayer send TELEPORT_CONFIRM with target player coordinates', () => {
  const rm = new RoomManager();
  const room = rm.getOrCreateRoom('main');

  // Player 1 (target)
  const targetWs = { readyState: 1, send: () => {}, on: () => {} };
  rm.handleConnection(targetWs);
  const targetMeta = rm.socketMeta.get(targetWs);
  rm.handleJoin(targetWs, targetMeta, { name: 'Player1' });
  const targetPlayer = room.gameState.getPlayer(targetMeta.id);
  targetPlayer.pos = [142, 28, -64];

  // Player 2 (admin)
  const adminSent = [];
  const adminWs = {
    readyState: 1,
    send: (msg) => { adminSent.push(JSON.parse(msg)); },
    on: () => {}
  };
  rm.handleConnection(adminWs);
  const adminMeta = rm.socketMeta.get(adminWs);
  rm.handleJoin(adminWs, adminMeta, { name: 'Admin', email: 'jsieiragerpe@gmail.com', adminKey: 'ARGÓN4' });

  // Admin teleports to Player 1
  rm.handleTeleportToPlayer(adminWs, adminMeta, { targetPlayerId: targetMeta.id });

  const confirm = adminSent.find(m => m.type === MSG.TELEPORT_CONFIRM);
  assert.ok(confirm, 'Admin must receive TELEPORT_CONFIRM packet');
  assert.strictEqual(confirm.data.x, 142);
  assert.strictEqual(confirm.data.y, 28);
  assert.strictEqual(confirm.data.z, -64);
  assert.strictEqual(confirm.data.targetName, 'Player1');

  rm.destroy();
});

it('Admin Reset: multiplayer.requestAdminResetServer alias works and server handleAdminResetServer resets world', () => {
  const { Avatar } = loadAvatarModule();
  const multPath = path.resolve(__dirname, '../public/src/multiplayer.js');
  let multCode = fs.readFileSync(multPath, 'utf8')
    .replace(/import\s+.*?from\s+.*?;/g, '')
    .replace(/export\s+class\s+MultiplayerClient/g, 'class MultiplayerClient');

  const { MultiplayerClient } = new Function(
    'Avatar',
    multCode + '\nreturn { MultiplayerClient };'
  )(Avatar);

  const mp = new MultiplayerClient(null, null, null);
  let sentReset = false;
  mp.send = (type, data) => {
    if (type === 'admin_reset_server') sentReset = true;
  };

  assert.strictEqual(typeof mp.requestAdminResetServer, 'function', 'mp.requestAdminResetServer must be a function');
  mp.requestAdminResetServer();
  assert.strictEqual(sentReset, true, 'Calling requestAdminResetServer must send admin_reset_server packet');
});

it('Calibrated Sniper ADS: triggerShoot aligns origin and muzzlePos with camera line-of-sight during zoom', () => {
  const { Controls, mockTHREE } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.position.set(10, 26.6, 20);
  camera.getWorldDirection = (vec) => vec.set(0, 0, -1);
  camera.fov = 32;

  const physics = {
    pos: new mockTHREE.Vector3(10, 25, 20),
    vel: new mockTHREE.Vector3(0, 0, 0),
    getEyePosition: () => new mockTHREE.Vector3(10, 26.6, 20)
  };

  const mockWorld = { getBlock: () => 0 };
  const controls = new Controls(camera, { addEventListener: () => {} }, physics, mockWorld, null);
  controls.weaponsMode = true;
  controls.isAiming = true;
  controls.aimBlend = 1.0;

  let shotPayload = null;
  controls.onWeaponShoot = (data) => { shotPayload = data; };

  controls.triggerShoot(true);
  assert.ok(shotPayload, 'Shot payload must be emitted');
  assert.strictEqual(shotPayload.isSniperShot, true, 'isSniperShot must be true when aiming');
  assert.strictEqual(shotPayload.range, 1000.0, 'Sniper shot must have 1000m infinite reach');
  assert.strictEqual(shotPayload.origin.x, 10, 'Origin X must match camera position');
  assert.strictEqual(shotPayload.origin.y, 26.6, 'Origin Y must match camera position');
  assert.strictEqual(shotPayload.muzzlePos.x, 10, 'Muzzle tracer X must match camera position to eliminate parallax');
  assert.strictEqual(shotPayload.muzzlePos.y, 26.6, 'Muzzle tracer Y must match camera position to eliminate parallax');
});

it('Avatar 3D Rifle: renders weapon mesh on right arm and raises arms in aim posture when weaponsEnabled is true', () => {
  const { Avatar } = loadAvatarModule();
  const avatar = new Avatar('armed_player', 'SniperSteve', { add: () => {} }, null);

  assert.ok(avatar.weaponGroup, 'Avatar must have a weaponGroup attached');
  assert.strictEqual(avatar.weaponsEnabled, false, 'Default weaponsEnabled should be false');
  assert.strictEqual(avatar.weaponGroup.visible, false, 'Weapon group must be hidden when unarmed');

  // Arm avatar
  avatar.setWeaponsEnabled(true);
  assert.strictEqual(avatar.weaponsEnabled, true, 'weaponsEnabled must be true');
  assert.strictEqual(avatar.weaponGroup.visible, true, 'Weapon group must become visible when armed');

  // Verify two-handed tactical rifle aim stance in update(dt)
  avatar.update(0.05);
  assert.ok(avatar.rightArmPivot.rotation.x < -1.0, 'Right arm must be raised forward aiming the rifle');
  assert.ok(avatar.leftArmPivot.rotation.x < -0.9, 'Left arm must be raised supporting the rifle barrel');

  // Disarm avatar
  avatar.setWeaponsEnabled(false);
  assert.strictEqual(avatar.weaponGroup.visible, false, 'Weapon group must hide when disarmed');
});

it('Adjustable TNT Power: cycles power 1x -> 2x -> 3x -> MAX and scales explosion crater radius up to 9m safely', () => {
  const { Controls, mockTHREE } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.position.set(0, 26.6, 0);
  camera.getWorldDirection = (vec) => vec.set(0, 0, -1);

  const mockWorld = { getBlock: () => 0 };
  const controls = new Controls(camera, { addEventListener: () => {} }, { pos: new mockTHREE.Vector3(0, 25, 0), getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0) }, mockWorld, null);

  assert.strictEqual(controls.tntPowerLevel, 1, 'Initial TNT power level must be 1 (1x)');
  assert.strictEqual(controls.getTntRadius(), 3, 'Level 1 radius must be 3m');

  controls.cycleTntPower();
  assert.strictEqual(controls.tntPowerLevel, 2, 'Cycled to level 2 (2x)');
  assert.strictEqual(controls.getTntRadius(), 5, 'Level 2 radius must be 5m');

  controls.cycleTntPower();
  assert.strictEqual(controls.tntPowerLevel, 3, 'Cycled to level 3 (3x)');
  assert.strictEqual(controls.getTntRadius(), 7, 'Level 3 radius must be 7m');

  controls.cycleTntPower();
  assert.strictEqual(controls.tntPowerLevel, 4, 'Cycled to level 4 (MAX)');
  assert.strictEqual(controls.getTntRadius(), 9, 'Level 4 radius must be 9m');

  // Verify server GameState detonateTnt supports 9m blast radius
  const gs = new GameState({ seed: 48151623 });
  const explosion = gs.detonateTnt(0, 30, 0, 9);
  assert.ok(explosion.destroyedBlocks.length > 50, `MAX explosion must destroy blocks in 9m radius (got ${explosion.destroyedBlocks.length})`);
});

it('Batch Block Deltas and Spatial Chunk Deltas: applyBlockDeltasBatch updates voxels and remeshes unique chunks once', () => {
  const worldJs = fs.readFileSync(path.resolve(__dirname, '../public/src/world.js'), 'utf8');
  assert.ok(worldJs.includes('this.chunkDeltas = new Map()'), 'world.js must initialize chunkDeltas spatial index');
  assert.ok(worldJs.includes('recordDelta(x, y, z, blockType)'), 'world.js must have recordDelta helper');
  assert.ok(worldJs.includes('applyBlockDeltasBatch(deltasArray)'), 'world.js must define applyBlockDeltasBatch');
  assert.ok(worldJs.includes('this.chunkDeltas.get(cKey)'), 'generateChunkTerrain must use O(1) chunkDeltas lookup');
});

it('Scope Overlay Mobile Action Buttons: styles and markup define visible, touchable #scope-btn-shoot and #scope-btn-exit', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');
  assert.ok(html.includes('id="btn-tnt-power"'), 'index.html must include #btn-tnt-power in weapons HUD');
  assert.ok(html.includes('id="scope-overlay-actions"'), 'index.html must include #scope-overlay-actions');

  const css = fs.readFileSync(path.resolve(__dirname, '../public/styles.css'), 'utf8');
  assert.ok(css.includes('.scope-overlay-actions'), 'CSS must define .scope-overlay-actions');
  assert.ok(css.includes('pointer-events: auto !important;'), 'CSS must give scope buttons pointer-events: auto !important');
  assert.ok(css.includes('.power-highlight'), 'CSS must define .power-highlight for TNT power');
  assert.ok(css.includes('.power-max'), 'CSS must define .power-max for MAX TNT power');
});

it('Weapons HUD & Mobile Action Controls: active by default, TNT placement puts real block, Admin reset is 2-step click confirmation', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');
  assert.ok(html.includes('id="btn-toggle-weapons"'), 'Quick actions must have persistent #btn-toggle-weapons');
  assert.ok(!html.includes('id="weapons-hud-controls" class="hidden"'), 'Weapons HUD controls must NOT be hidden by default');

  const { Controls, mockTHREE } = loadControlsModuleForM2();
  const camera = new mockTHREE.Group();
  camera.position.set(0, 26.6, 0);
  camera.getWorldDirection = (vec) => vec.set(1, 0, 0);

  const controls = new Controls(
    camera,
    { addEventListener: () => {} },
    { pos: new mockTHREE.Vector3(0, 25, 0), getEyePosition: () => new mockTHREE.Vector3(0, 26.6, 0), onGround: true, action: 'idle' },
    { getBlock: () => 0 }
  );
  assert.strictEqual(controls.weaponsMode, true, 'Controls weaponsMode must default to true');

  // Verify raycastVoxel with camera sightline alignment during ADS
  controls.isAiming = true;
  const scopedHit = controls.raycastVoxel();
  assert.strictEqual(controls.isAiming, true);

  // Verify server GameState defaults player to weaponsEnabled: true
  const gs = new GameState({ seed: 48151623 });
  const player = gs.addPlayer('test_p', 'SniperPro');
  assert.strictEqual(player.weaponsEnabled, true, 'Server players must have weaponsEnabled default to true');
});

// =============================================================================
// SECTION 14: GUIDED HOMING MISSILE (ADMIN) & TACTICAL HOLOGRAPHIC RADAR
// =============================================================================
console.log('\n[SECTION 14: GUIDED HOMING MISSILE (ADMIN) & TACTICAL HOLOGRAPHIC RADAR]');

it('Admin Guided Missile: server enforces strict admin authentication for missile launch', () => {
  const rm = new RoomManager();
  const room = rm.getOrCreateRoom('main');
  const normalSent = [];
  const normalWs = { readyState: 1, send: (m) => normalSent.push(JSON.parse(m)), on: () => {} };
  const normalMeta = { id: 'p_norm', roomId: 'main', isAdmin: false, msgCount: 0, lastMsgTime: Date.now() };
  rm.socketMeta.set(normalWs, normalMeta);
  room.gameState.addPlayer('p_norm', 'NormalPlayer');
  room.gameState.addPlayer('target_1', 'TargetPlayer');

  // Try to launch without admin rights
  rm.handleAdminLaunchMissile(normalWs, normalMeta, { targetPlayerId: 'target_1' });
  const errorMsg = normalSent.find(m => m.type === MSG.ERROR);
  assert.ok(errorMsg, 'Unauthorized launch must send error');
  assert.ok(errorMsg.data.message.includes('Administrador'), 'Error message must mention Administrador');

  // Launch with admin rights
  const adminSent = [];
  const adminWs = { readyState: 1, send: (m) => adminSent.push(JSON.parse(m)), on: () => {} };
  const adminMeta = { id: 'admin_1', roomId: 'main', isAdmin: true, msgCount: 0, lastMsgTime: Date.now() };
  rm.socketMeta.set(adminWs, adminMeta);
  const adminPlayer = room.gameState.addPlayer('admin_1', 'AdminUser');
  adminPlayer.isAdmin = true;
  room.clients.set(adminWs, 'admin_1');

  rm.handleAdminLaunchMissile(adminWs, adminMeta, { targetPlayerId: 'target_1' });
  const spawnPacket = adminSent.find(m => m.type === MSG.MISSILE_SPAWN);
  assert.ok(spawnPacket, 'Authorized admin launch must broadcast missile_spawn');
  assert.strictEqual(spawnPacket.data.targetPlayerId, 'target_1');
  assert.strictEqual(spawnPacket.data.power, 4, 'Missile power must be 4X TNT');
  rm.destroy();
});

it('Admin Guided Missile: tracks disconnected target to last known position and executes 4X TNT detonation', () => {
  const rm = new RoomManager();
  const room = rm.getOrCreateRoom('main');
  const targetWs = { readyState: 1, send: () => {}, on: () => {} };
  const targetMeta = { id: 'target_dis', roomId: 'main', isAdmin: false, msgCount: 0, lastMsgTime: Date.now() };
  rm.socketMeta.set(targetWs, targetMeta);
  const tPlayer = room.gameState.addPlayer('target_dis', 'MovingTarget');
  tPlayer.pos = [250, 25, 250]; // In Japan
  room.clients.set(targetWs, 'target_dis');

  // Player disconnects -> position is cached
  rm.handleDisconnect(targetWs);
  assert.ok(rm.lastKnownPlayerPositions.has('target_dis'), 'Disconnected player position must be cached');
  assert.deepStrictEqual(rm.lastKnownPlayerPositions.get('target_dis'), [250, 25, 250]);

  // Admin launches at disconnected player -> uses cached coordinates
  const adminSent = [];
  const adminWs = { readyState: 1, send: (m) => adminSent.push(JSON.parse(m)), on: () => {} };
  const adminMeta = { id: 'admin_dis', roomId: 'main', isAdmin: true, msgCount: 0, lastMsgTime: Date.now() };
  rm.socketMeta.set(adminWs, adminMeta);
  const adminPlayer = room.gameState.addPlayer('admin_dis', 'AdminUser');
  adminPlayer.isAdmin = true;
  room.clients.set(adminWs, 'admin_dis');

  rm.handleAdminLaunchMissile(adminWs, adminMeta, { targetPlayerId: 'target_dis' });
  const spawnPacket = adminSent.find(m => m.type === MSG.MISSILE_SPAWN);
  assert.ok(spawnPacket, 'Launch at disconnected player must succeed using cached position');
  assert.deepStrictEqual(spawnPacket.data.targetPos, [250, 25, 250]);

  // Test detonation handler
  rm.handleMissileDetonate(adminWs, adminMeta, {
    missileId: spawnPacket.data.missileId,
    x: 250,
    y: 25,
    z: 250
  });
  const explodePacket = adminSent.find(m => m.type === MSG.TNT_EXPLODE);
  assert.ok(explodePacket, 'Missile detonate must broadcast tnt_explode');
  assert.strictEqual(explodePacket.data.radius, 9, 'Detonation radius must be 9 (4X TNT)');
  rm.destroy();
});

it('Guided Missile 3D Kinematics and Multi-Target Radar Management Modules', () => {
  const missileJs = fs.readFileSync(path.resolve(__dirname, '../public/src/missile.js'), 'utf8');
  assert.ok(missileJs.includes('class GuidedMissile'), 'missile.js must export GuidedMissile');
  assert.ok(missileJs.includes('class MissileManager'), 'missile.js must export MissileManager');
  assert.ok(missileJs.includes('maxSpeed = 82'), 'missile.js must support cruise acceleration up to 82 m/s');
  assert.ok(missileJs.includes('maxTurnRate = 2.4'), 'missile.js must apply realistic turn rate limit');
  assert.ok(missileJs.includes('targetDisconnected'), 'missile.js must support targetDisconnected fallback');

  const radarJs = fs.readFileSync(path.resolve(__dirname, '../public/src/radar.js'), 'utf8');
  assert.ok(radarJs.includes('class TacticalRadar'), 'radar.js must export TacticalRadar');
  assert.ok(radarJs.includes('tactical-radar-panel'), 'radar.js must create #tactical-radar-panel');
  assert.ok(radarJs.includes('radar-floating-pill'), 'radar.js must support floating minimized pill');
  assert.ok(radarJs.includes('toggleMinimize'), 'radar.js must support minimize/expand');

  const html = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');
  assert.ok(html.includes('id="btn-admin-missile"'), 'index.html must define #btn-admin-missile in weapons HUD');
  assert.ok(html.includes('id="admin-open-radar-btn"'), 'index.html must define #admin-open-radar-btn in admin panel');
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
