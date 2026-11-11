// test/test_chess_multiplayer.js
// Automated Test Suite for Chess Multiplayer, Matchmaking, PIN Rooms, Clocks & Namespace Segregation
const assert = require('assert');
const { ChessRoomManager, CHESS_MSG } = require('../server/chess-rooms');
const { RoomManager } = require('../server/rooms');

console.log('=============================================================================');
console.log('      CHESS MULTIPLAYER & NAMESPACE SEGREGATION VERIFICATION SUITE           ');
console.log('=============================================================================\n');

class MockSocket {
  constructor(id = 'ws') {
    this.id = id;
    this.readyState = 1; // OPEN
    this.messages = [];
    this.listeners = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  emit(event, ...args) {
    const list = this.listeners.get(event) || [];
    for (const fn of list) fn(...args);
  }

  send(data) {
    this.messages.push(typeof data === 'string' ? JSON.parse(data) : data);
  }

  getLastMessage(type) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === type) return this.messages[i];
    }
    return null;
  }

  clear() {
    this.messages = [];
  }
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// 1. Strict Isolation from Voxel Rooms
runTest('Invariable of Isolation: Chess packets are completely ignored by Voxel RoomManager', () => {
  const voxelRM = new RoomManager();
  const ws = new MockSocket('voxel_client');
  voxelRM.handleConnection(ws);

  // Send chess packet to Voxel RoomManager
  ws.clear();
  voxelRM.handleMessage(ws, JSON.stringify({
    type: CHESS_MSG.JOIN_QUEUE,
    data: { timeControl: 'blitz_3_2' }
  }));

  // Voxel RoomManager must not process it and must not alter room or player state
  assert.strictEqual(ws.messages.length, 0, 'Voxel RoomManager must drop chess packets silently');
  assert.strictEqual(voxelRM.getTotalOnlineCount(), 0, 'No players registered in Voxel rooms');
  voxelRM.destroy();
});

// 2. Public Matchmaking Pairing
runTest('Public Matchmaking: Two clients in queue are paired into a live game with clocks', () => {
  const chessRM = new ChessRoomManager();
  const p1Ws = new MockSocket('p1');
  const p2Ws = new MockSocket('p2');

  // Player 1 joins Blitz 3+2 queue
  chessRM.handleMessage(p1Ws, { type: CHESS_MSG.JOIN_QUEUE, data: { name: 'PlayerOne', timeControl: 'blitz_3_2' } });
  const status1 = p1Ws.getLastMessage(CHESS_MSG.QUEUE_STATUS);
  assert.ok(status1);
  assert.strictEqual(status1.data.status, 'waiting');

  // Player 2 joins same queue -> triggers instant pairing!
  chessRM.handleMessage(p2Ws, { type: CHESS_MSG.JOIN_QUEUE, data: { name: 'PlayerTwo', timeControl: 'blitz_3_2' } });

  const start1 = p1Ws.getLastMessage(CHESS_MSG.GAME_START);
  const start2 = p2Ws.getLastMessage(CHESS_MSG.GAME_START);

  assert.ok(start1, 'Player 1 must receive GAME_START');
  assert.ok(start2, 'Player 2 must receive GAME_START');
  assert.strictEqual(start1.data.roomId, start2.data.roomId);
  assert.ok(['w', 'b'].includes(start1.data.yourColor));
  assert.notStrictEqual(start1.data.yourColor, start2.data.yourColor, 'Colors must be opposite');
  assert.strictEqual(start1.data.whiteTime, 180);
  assert.strictEqual(start1.data.increment, 2);

  chessRM.destroy();
});

// 3. Private Rooms with 4-Digit PIN
runTest('Private Room: Creation with 4-digit PIN enforces correct authentication for challenger', () => {
  const chessRM = new ChessRoomManager();
  const hostWs = new MockSocket('host');
  const guestWs = new MockSocket('guest');

  // Host creates private room with PIN 4826
  chessRM.handleMessage(hostWs, {
    type: CHESS_MSG.CREATE_ROOM,
    data: {
      name: 'HostMaster',
      roomId: 'amigos2026',
      pin: '4826',
      timeControl: 'blitz_5_3',
      preferredColor: 'w'
    }
  });

  const created = hostWs.getLastMessage(CHESS_MSG.QUEUE_STATUS);
  assert.ok(created);
  assert.strictEqual(created.data.status, 'room_created');
  assert.strictEqual(created.data.pin, '4826');

  // Guest tries to join with wrong PIN -> Rejected
  chessRM.handleMessage(guestWs, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'GuestUser', roomId: 'amigos2026', pin: '9999' }
  });
  const err = guestWs.getLastMessage(CHESS_MSG.ERROR);
  assert.ok(err);
  assert.ok(err.data.message.includes('PIN de acceso incorrecto'));

  // Guest joins with correct PIN 4826 -> Starts game!
  guestWs.clear();
  hostWs.clear();
  chessRM.handleMessage(guestWs, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'GuestUser', roomId: 'amigos2026', pin: '4826' }
  });

  const gameStart = guestWs.getLastMessage(CHESS_MSG.GAME_START);
  assert.ok(gameStart, 'Game must start upon correct PIN entry');
  assert.strictEqual(gameStart.data.yourColor, 'b', 'Guest gets black as host requested white');

  chessRM.destroy();
});

// 4. In-Game Moves & Clock Increments
runTest('Live Game: Legal move broadcasts updated FEN, switches active clock and applies increment', () => {
  const chessRM = new ChessRoomManager();
  const wWs = new MockSocket('white');
  const bWs = new MockSocket('black');

  chessRM.handleMessage(wWs, { type: CHESS_MSG.CREATE_ROOM, data: { roomId: 'test_game', preferredColor: 'w', timeControl: 'blitz_3_2' } });
  chessRM.handleMessage(bWs, { type: CHESS_MSG.JOIN_ROOM, data: { roomId: 'test_game' } });

  wWs.clear();
  bWs.clear();

  // White plays 1. e4
  chessRM.handleMessage(wWs, {
    type: CHESS_MSG.MOVE,
    data: { from: 'e2', to: 'e4' }
  });

  const moveBroadcast = bWs.getLastMessage(CHESS_MSG.MOVE_BROADCAST);
  assert.ok(moveBroadcast, 'Black must receive MOVE_BROADCAST');
  assert.strictEqual(moveBroadcast.data.move.san, 'e4');
  assert.strictEqual(moveBroadcast.data.turn, 'b');
  // White time had 180s + 2s increment = 182s
  assert.ok(moveBroadcast.data.whiteTime >= 181.5, `White time was ${moveBroadcast.data.whiteTime}`);

  chessRM.destroy();
});

// 5. Spectator Broadcasting & Live Feed
runTest('Spectator Mode: Spectator connects to active room, receives state and live moves', () => {
  const chessRM = new ChessRoomManager();
  const wWs = new MockSocket('white');
  const bWs = new MockSocket('black');
  const specWs = new MockSocket('spectator');

  chessRM.handleMessage(wWs, { type: CHESS_MSG.CREATE_ROOM, data: { roomId: 'broadcast_room', allowSpectators: true, preferredColor: 'w' } });
  chessRM.handleMessage(bWs, { type: CHESS_MSG.JOIN_ROOM, data: { roomId: 'broadcast_room' } });

  // Spectator joins room
  chessRM.handleMessage(specWs, {
    type: CHESS_MSG.SPECTATE_ROOM,
    data: { roomId: 'broadcast_room' }
  });

  const specState = specWs.getLastMessage(CHESS_MSG.SPECTATE_STATE);
  assert.ok(specState, 'Spectator must receive initial SPECTATE_STATE');
  assert.strictEqual(specState.data.spectatorCount, 1);

  // White plays 1. d4 -> Spectator receives live move
  specWs.clear();
  chessRM.handleMessage(wWs, { type: CHESS_MSG.MOVE, data: { from: 'd2', to: 'd4' } });

  const specMove = specWs.getLastMessage(CHESS_MSG.MOVE_BROADCAST);
  assert.ok(specMove, 'Spectator must receive live MOVE_BROADCAST');
  assert.strictEqual(specMove.data.move.san, 'd4');

  chessRM.destroy();
});

console.log('\n=============================================================================');
console.log('ALL 5 CHESS MULTIPLAYER SPECIFICATIONS PASSED WITH 100% SUCCESS!');
console.log('=============================================================================');
