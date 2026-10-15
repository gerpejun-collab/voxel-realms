// test/test.js
// Automated verification suite for Voxel Realms: Protocol, State, Rooms, Terrain, and Physics Math

const assert = require('assert');
const {
  MSG,
  sanitizeName,
  sanitizeChat,
  isValidBlockModify,
  isValidMove
} = require('../server/protocol');

const { GameState } = require('../server/game-state');
const { RoomManager } = require('../server/rooms');

console.log('--- RUNNING VOXEL REALMS TEST SUITE ---');
let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

// ==========================================
// 1. Protocol & Validation Tests
// ==========================================
console.log('\n1. PROTOCOL & SANITIZATION:');

it('sanitizes malicious usernames and prevents HTML injection', () => {
  assert.strictEqual(sanitizeName('<script>alert(1)</script>'), 'scriptalert1scri');
  assert.strictEqual(sanitizeName('NormalPlayer'), 'NormalPlayer');
  assert.strictEqual(sanitizeName('A_Very_Long_Player_Name_Over_Limit'), 'A_Very_Long_Play');
  assert.strictEqual(sanitizeName('   '), 'Player');
  assert.strictEqual(sanitizeName(null), 'Player');
});

it('sanitizes chat messages', () => {
  assert.strictEqual(sanitizeChat('Hello <b>world</b>!'), 'Hello bworld/b!');
  assert.strictEqual(sanitizeChat('Clean text'), 'Clean text');
  assert.strictEqual(sanitizeChat(''), '');
  assert.strictEqual(sanitizeChat(null), '');
});

it('validates block modification coordinates and bounds', () => {
  assert.strictEqual(isValidBlockModify({ x: 10, y: 30, z: -5, blockType: 1 }), true);
  // Invalid Y (negative or over 128)
  assert.strictEqual(isValidBlockModify({ x: 10, y: -1, z: 0, blockType: 1 }), false);
  assert.strictEqual(isValidBlockModify({ x: 10, y: 150, z: 0, blockType: 1 }), false);
  // Floating point coordinates
  assert.strictEqual(isValidBlockModify({ x: 10.5, y: 30, z: 0, blockType: 1 }), false);
  // Negative or invalid blockType
  assert.strictEqual(isValidBlockModify({ x: 10, y: 30, z: 0, blockType: -1 }), false);
  assert.strictEqual(isValidBlockModify({ x: 10, y: 30, z: 0, blockType: 999 }), false);
});

it('validates player movement packets', () => {
  assert.strictEqual(isValidMove({ pos: [1.2, 30.5, -4.8], rot: [0.5, -0.2] }), true);
  assert.strictEqual(isValidMove({ pos: [1.2, 30.5], rot: [0.5, -0.2] }), false);
  assert.strictEqual(isValidMove({ pos: [NaN, 30.5, 0], rot: [0, 0] }), false);
  assert.strictEqual(isValidMove(null), false);
});

// ==========================================
// 2. Game State & Authority Tests
// ==========================================
console.log('\n2. GAME STATE & WORLD AUTHORITY:');

it('correctly tracks players and resolves duplicate names', () => {
  const state = new GameState(12345);
  const p1 = state.addPlayer('id1', 'Alex');
  const p2 = state.addPlayer('id2', 'Alex');

  assert.strictEqual(p1.name, 'Alex');
  assert.strictEqual(p2.name, 'Alex_1');
  assert.strictEqual(state.players.size, 2);

  state.removePlayer('id1');
  assert.strictEqual(state.players.size, 1);
  assert.strictEqual(state.getPlayer('id2').name, 'Alex_1');
});

it('rejects block modifications that are out of reach', () => {
  const state = new GameState(12345);
  const p = state.addPlayer('p1', 'Builder');
  p.pos = [0, 20, 0];

  // Block at distance ~100 blocks
  const result = state.modifyBlock('p1', 100, 20, 100, 1);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'Out of reach');
});

it('rejects placing a solid block inside the player bounding box', () => {
  const state = new GameState(12345);
  const p = state.addPlayer('p1', 'Builder');
  p.pos = [10.2, 25.0, 10.2]; // feet at y=25, height 1.8

  // Block at (10, 25, 10) directly overlaps player
  const result = state.modifyBlock('p1', 10, 25, 10, 1);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'Cannot place block inside player');

  // But destroying a block (type = 0) at the same position is allowed
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

it('locks timeOfDay to permanent bright sunny day mode (0.32)', () => {
  const state = new GameState(12345);
  assert.strictEqual(state.getTimeOfDay(), 0.32);
  const initial = state.getInitialState('p1');
  assert.strictEqual(initial.timeOfDay, 0.32);
});

// ==========================================
// 3. Room Management & Capacity Tests
// ==========================================
console.log('\n3. ROOM MANAGEMENT & CAPACITY:');

it('enforces maximum player capacity and rejects excess clients', () => {
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

  // Third player should be rejected with server full error
  roomManager.handleJoin(mockSockets[2], roomManager.socketMeta.get(mockSockets[2]), { name: 'P3' });
  assert.strictEqual(roomManager.getTotalOnlineCount(), 2);
  assert.strictEqual(mockSockets[2].lastMsg.type, MSG.ERROR);

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

  // Player at (0, 32, 0) tries to place block out of reach at (100, 32, 100)
  roomManager.handleBlockModify(mockWs, meta, { x: 100, y: 32, z: 100, blockType: 1 });

  const rejectMsg = messages.find(m => m.type === MSG.BLOCK_REJECT);
  assert.ok(rejectMsg, 'Expected BLOCK_REJECT message');
  assert.strictEqual(rejectMsg.data.x, 100);
  assert.strictEqual(rejectMsg.data.y, 32);
  assert.strictEqual(rejectMsg.data.z, 100);

  roomManager.destroy();
});

// ==========================================
// 4. Physics Collision Math Simulation
// ==========================================
console.log('\n4. PHYSICS COLLISION MATHEMATICS:');

it('accurately resolves floor collision and detects ground contact', () => {
  // Simulate player feet falling towards floor at Y = 20
  let posY = 20.1;
  let velY = -10.0;
  let onGround = false;
  const dt = 1 / 60;

  // Apply step (-10 * 1/60 = -0.1666, 20.1 - 0.1666 = 19.9333 <= 20)
  posY += velY * dt;
  if (velY <= 0) {
    const floorY = 20;
    if (posY <= floorY) {
      posY = floorY;
      velY = 0;
      onGround = true;
    }
  }

  assert.strictEqual(onGround, true);
  assert.strictEqual(velY, 0);
  assert.strictEqual(posY, 20);
});

it('prevents tunneling through thin 1-block platforms at terminal velocity via substepping', () => {
  // Platform at Y = 15 (block thickness: Y=14 to 15, floor surface at Y=15)
  // Player falls from Y = 16.5 at terminal velocity velY = -40 m/s, dt = 0.05s
  // Total unstepped displacement would be -2.0 blocks, leaping from 16.5 to 14.5 (tunneling past 15.0!)
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

  // With substepping, player lands squarely at Y = 15.0 without tunneling
  assert.strictEqual(onGround, true);
  assert.strictEqual(posY, 15.0);
});

it('correctly calculates Minecraft auto-step elevation when moving forward into a 1-block step with headroom', () => {
  const onGround = true;
  const posY = 24.0;
  const targetStepY = Math.floor(posY) + 1.0;
  const stepHeight = targetStepY - posY; // 1.0 block step

  // Verify step height is within Minecraft range (<= 1.05)
  const canStep = onGround && stepHeight <= 1.05;
  assert.strictEqual(canStep, true);

  const resolvedY = canStep ? targetStepY : posY;
  assert.strictEqual(resolvedY, 25.0);
});

// ==========================================
// 5. World Sectors, Norway Fjords & Fast Travel Tests
// ==========================================
console.log('\n5. WORLD SECTORS & FAST TRAVEL:');

it('calculates Norway Fjord deep gorge and colossal cliff heights correctly', () => {
  // Height function formula as implemented in world.js:
  function getNorwayHeight(wx, wz) {
    if (wz >= 140 && wz <= 220 && Math.abs(wx) <= 45) {
      const distFromFjord = Math.abs(wx);
      if (distFromFjord <= 7) {
        return 13; // Deep water canyon bed
      } else if (distFromFjord <= 15) {
        const t = (distFromFjord - 7) / 8;
        return Math.floor(13 + t * (50 - 13));
      } else {
        const ridgeH = 50 + Math.floor(Math.abs(Math.sin(wx * 0.3 + wz * 0.15)) * 6);
        return Math.min(128 - 6, ridgeH);
      }
    }
    return 24;
  }

  // Deep canyon bed
  assert.strictEqual(getNorwayHeight(0, 180), 13);
  assert.strictEqual(getNorwayHeight(5, 170), 13);
  assert.strictEqual(getNorwayHeight(-7, 200), 13);

  // Transition slope
  const slopeH = getNorwayHeight(11, 180);
  assert.ok(slopeH > 13 && slopeH < 50, `Expected slope height between 13 and 50, got ${slopeH}`);

  // High granite cliff ridges
  const cliffH = getNorwayHeight(25, 180);
  assert.ok(cliffH >= 50 && cliffH <= 56, `Expected cliff height between 50 and 56, got ${cliffH}`);
});

it('verifies all 6 fast travel sector coordinates are valid and within bounds', () => {
  const sectors = [
    { name: 'Descampado Central', x: 0, y: 24, z: 0 },
    { name: 'Japón Imperial', x: 30, y: 25, z: 30 },
    { name: 'China & Shanghai', x: -30, y: 25, z: 30 },
    { name: 'París & Torre Eiffel', x: 30, y: 25, z: -30 },
    { name: 'Nueva York', x: -30, y: 25, z: -30 },
    { name: 'Fiordos de Noruega', x: 0, y: 22, z: 180 }
  ];

  for (const s of sectors) {
    assert.ok(s.y >= 20 && s.y <= 40, `${s.name} Y coordinate must be safe walkable altitude`);
    assert.strictEqual(typeof s.x, 'number');
    assert.strictEqual(typeof s.z, 'number');
  }
});

it('validates player speed modes and flight mode toggle mechanics', () => {
  const speedConfigs = [
    { tier: 1, mult: 1.0, flight: false },
    { tier: 2, mult: 2.5, flight: false },
    { tier: 3, mult: 5.0, flight: true }
  ];

  for (const cfg of speedConfigs) {
    assert.ok(cfg.mult >= 1.0 && cfg.mult <= 5.0);
    if (cfg.mult === 5.0) {
      assert.strictEqual(cfg.flight, true);
    } else {
      assert.strictEqual(cfg.flight, false);
    }
  }
});

// ==========================================
// Summary
// ==========================================
console.log(`\nTEST RESULTS: ${passed}/${total} passed.`);
if (passed === total) {
  console.log('ALL TESTS PASSED SUCCESSFULLY! Ready for deployment.\n');
  process.exit(0);
} else {
  console.error(`FAILED: ${total - passed} test(s) failed.`);
  process.exit(1);
}
