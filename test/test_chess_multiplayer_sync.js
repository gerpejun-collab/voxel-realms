/**
 * Grandmaster Chess - Multiplayer Synchronization Test Suite (Tiers 1-4)
 * 
 * Tests authoritative WebSocket multiplayer operations in server/chess-rooms.js:
 * - Tier 1: Feature Coverage (PIN rooms, joins, moves, spectator isolation, chat)
 * - Tier 2: Boundary & Corner Cases (Reconnection tokens, forfeit timers, spectator rejections)
 * - Tier 3: Cross-Feature Combinations (Matchmaking queue, Fischer clocks, draw offers, resignations)
 * - Tier 4: Real-World Workloads (Concurrent multi-room stress, mobile reconnect cycle, garbage collection)
 * 
 * Zero external test framework dependencies (pure Node.js assert/runner).
 */

const assert = require('assert');
const { ChessRoomManager, ChessRoom, CHESS_MSG, TIME_CONTROLS } = require('../server/chess-rooms');

// Test runner bookkeeping
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(tier, name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] [${tier}] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [FAIL] [${tier}] ${name}: ${err.message}`);
    throw err;
  }
}

// Mock WebSocket implementation for client simulation
class MockWebSocket {
  constructor(id = `ws_${Math.random().toString(36).substr(2, 6)}`) {
    this.id = id;
    this.readyState = 1; // 1 = OPEN
    this.sentMessages = [];
  }

  send(payload) {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    this.sentMessages.push(parsed);
  }

  getLastMessage() {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  findMessages(type) {
    return this.sentMessages.filter(m => m.type === type);
  }

  findLastMessage(type) {
    const list = this.findMessages(type);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  clearMessages() {
    this.sentMessages = [];
  }

  close() {
    this.readyState = 3; // CLOSED
  }
}

console.log('=============================================================================');
console.log('       CHESS MULTIPLAYER SYNCHRONIZATION: 4-TIER TEST SUITE                  ');
console.log('=============================================================================\n');

// ============================================================================
// TIER 1: FEATURE COVERAGE (PIN Rooms, Joins, Authoritative Moves & Spectators)
// ============================================================================
console.log('>>> TIER 1: FEATURE COVERAGE (PIN Matchmaking, Moves & Spectators)');

// 1. PIN Room Creation (Spec 102, 103)
runTest('TIER 1', 'Create private room with 4-digit PIN registers in pinToRoom and notifies creator', () => {
  const manager = new ChessRoomManager();
  const ws = new MockWebSocket('creator');
  const meta = { id: 'u_1', name: 'Alice', roomId: null, isSpectating: false };

  manager.handleMessage(ws, {
    type: CHESS_MSG.CREATE_ROOM,
    data: {
      name: 'Alice',
      pin: '7842',
      timeControl: 'blitz_5_3',
      isPrivate: true,
      allowSpectators: true
    }
  });

  const room = manager.pinToRoom.get('7842');
  assert.ok(room, 'Room must be indexed by 4-digit PIN in pinToRoom Map');
  assert.strictEqual(room.pin, '7842');
  assert.strictEqual(room.timeControl, 'blitz_5_3');
  assert.strictEqual(room.isPrivate, true);

  const response = ws.findLastMessage(CHESS_MSG.QUEUE_STATUS);
  assert.ok(response, 'Creator must receive QUEUE_STATUS packet');
  assert.strictEqual(response.status, 'room_created');
  assert.strictEqual(response.pin, '7842');

  manager.destroy();
});

// 2. PIN-only Room Join & Game Start (Spec 104)
runTest('TIER 1', 'Opponent joins room using 4-digit PIN alone without knowing internal roomId', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('alice');
  const ws2 = new MockWebSocket('bob');

  // Alice creates room with PIN
  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'Alice', pin: '4589', timeControl: 'rapid_10_0', isPrivate: true }
  });

  // Bob joins with PIN only
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'Bob', pin: '4589' }
  });

  const room = manager.pinToRoom.get('4589');
  assert.ok(room.isStarted, 'Room must be started after second player joins');
  assert.strictEqual(room.isGameOver, false);

  const start1 = ws1.findLastMessage(CHESS_MSG.GAME_START);
  const start2 = ws2.findLastMessage(CHESS_MSG.GAME_START);

  assert.ok(start1, 'Alice must receive GAME_START');
  assert.ok(start2, 'Bob must receive GAME_START');
  assert.notStrictEqual(start1.color, start2.color, 'Players must be assigned opposing colors');
  assert.ok(start1.playerToken, 'Player 1 must receive session reconnection token');
  assert.ok(start2.playerToken, 'Player 2 must receive session reconnection token');
  assert.strictEqual(start1.fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

  manager.destroy();
});

// 3. Authoritative Move Broadcast (Spec 109, 110)
runTest('TIER 1', 'Authoritative move updates server FEN, clocks, and broadcasts to both clients', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('alice');
  const ws2 = new MockWebSocket('bob');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'Alice', pin: '1122', timeControl: 'blitz_3_2', preferredColor: 'w' }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'Bob', pin: '1122' }
  });

  const room = manager.pinToRoom.get('1122');
  assert.strictEqual(room.engine.turn, 'w');

  // White makes move 1. e4
  manager.handleMessage(ws1, {
    type: CHESS_MSG.MOVE,
    data: { from: 'e2', to: 'e4' }
  });

  const bcast1 = ws1.findLastMessage(CHESS_MSG.MOVE_BROADCAST);
  const bcast2 = ws2.findLastMessage(CHESS_MSG.MOVE_BROADCAST);

  assert.ok(bcast1, 'White client must receive move broadcast');
  assert.ok(bcast2, 'Black client must receive move broadcast');
  assert.strictEqual(bcast1.san, 'e4');
  assert.strictEqual(bcast2.san, 'e4');
  assert.strictEqual(bcast1.turn, 'b', 'Turn must update to Black');
  assert.strictEqual(room.engine.turn, 'b');
  assert.strictEqual(room.whiteTime, 180 + 2, 'Fischer increment (2s) must be credited to White');

  manager.destroy();
});

// 4. Spectator Connection & Authoritative State Delivery (Spec 115)
runTest('TIER 1', 'Spectator connects and receives full authoritative state without polluting player slots', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('white');
  const ws2 = new MockWebSocket('black');
  const wsSpec = new MockWebSocket('spectator');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'WhitePlayer', pin: '3344', allowSpectators: true }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'BlackPlayer', pin: '3344' }
  });

  const room = manager.pinToRoom.get('3344');

  // Spectator connects
  manager.handleMessage(wsSpec, {
    type: CHESS_MSG.SPECTATE_ROOM,
    data: { roomId: room.id }
  });

  assert.strictEqual(room.spectators.size, 1);
  const specState = wsSpec.findLastMessage(CHESS_MSG.SPECTATE_STATE);
  assert.ok(specState, 'Spectator must receive full state payload');
  assert.strictEqual(specState.fen, room.engine.getFen());
  assert.strictEqual(specState.spectatorCount, 1);

  const countUpdate = ws1.findLastMessage(CHESS_MSG.SPECTATOR_COUNT_UPDATE);
  assert.ok(countUpdate, 'Active players must be notified of spectator join');
  assert.strictEqual(countUpdate.spectatorCount, 1);

  manager.destroy();
});

// 5. In-Game Chat Broadcast with Spectator Differentiation (Spec 118)
runTest('TIER 1', 'Chat messages broadcast to all room participants with spectator flag', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('p1');
  const ws2 = new MockWebSocket('p2');
  const wsSpec = new MockWebSocket('spec');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'Carlsen', pin: '9901' }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'Nakamura', pin: '9901' }
  });
  const room = manager.pinToRoom.get('9901');

  manager.handleMessage(wsSpec, {
    type: CHESS_MSG.SPECTATE_ROOM,
    data: { roomId: room.id }
  });

  // Spectator sends chat
  manager.handleMessage(wsSpec, {
    type: CHESS_MSG.CHAT,
    data: { text: 'Incredible tactical position!' }
  });

  const chatOnP1 = ws1.findLastMessage(CHESS_MSG.CHAT_BROADCAST);
  assert.ok(chatOnP1, 'Player 1 must receive chat');
  assert.strictEqual(chatOnP1.text, 'Incredible tactical position!');
  assert.strictEqual(chatOnP1.isSpectator, true, 'isSpectator must be flagged true');

  manager.destroy();
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (Reconnection, Timers & Security Rejections)
// ============================================================================
console.log('\n>>> TIER 2: BOUNDARY & CORNER CASES (Reconnection & Security Isolation)');

// 6. Token-Based Reconnection & Forfeit Timer Cancellation (Spec 107, 108)
runTest('TIER 2', 'Reconnecting player with valid session token recovers game state and cancels 60s forfeit', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('alice_old');
  const ws2 = new MockWebSocket('bob');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'Alice', pin: '5566', preferredColor: 'w' }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'Bob', pin: '5566' }
  });

  const room = manager.pinToRoom.get('5566');
  const aliceToken = room.whiteToken;
  assert.ok(aliceToken, 'Session token must be established');

  // Alice makes a move 1. d4
  manager.handleMessage(ws1, {
    type: CHESS_MSG.MOVE,
    data: { from: 'd2', to: 'd4' }
  });

  // Alice disconnects
  manager.handleDisconnect(ws1);
  assert.ok(room.disconnectTimer, '60s abandonment countdown timer must be active');

  const oppNotice = ws2.findLastMessage(CHESS_MSG.OPPONENT_DISCONNECTED);
  assert.ok(oppNotice, 'Bob must receive OPPONENT_DISCONNECTED packet');
  assert.strictEqual(oppNotice.timeoutSec, 60);

  // Alice reconnects with new socket using aliceToken
  const ws1New = new MockWebSocket('alice_new');
  manager.handleMessage(ws1New, {
    type: CHESS_MSG.RECONNECT,
    data: { roomId: room.id, playerToken: aliceToken }
  });

  assert.strictEqual(room.disconnectTimer, null, 'Reconnection must immediately cancel abandonment timer');
  assert.strictEqual(room.whiteWs, ws1New, 'Room whiteWs must point to newly reconnected socket');

  const reconSuccess = ws1New.findLastMessage(CHESS_MSG.RECONNECT_SUCCESS);
  assert.ok(reconSuccess, 'Alice must receive RECONNECT_SUCCESS');
  assert.strictEqual(reconSuccess.yourColor, 'w');
  assert.strictEqual(reconSuccess.fen, room.engine.getFen());
  assert.strictEqual(reconSuccess.history.length, 1);

  const bobNotice = ws2.findLastMessage(CHESS_MSG.OPPONENT_RECONNECTED);
  assert.ok(bobNotice, 'Bob must receive OPPONENT_RECONNECTED');

  manager.destroy();
});

// 7. Spectator Authority Rejection (Spec 116)
runTest('TIER 2', 'Spectator actions (move, draw, resign, rematch) are strictly rejected by server', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('w');
  const ws2 = new MockWebSocket('b');
  const wsSpec = new MockWebSocket('spec');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'W', pin: '6677' }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'B', pin: '6677' }
  });
  const room = manager.pinToRoom.get('6677');

  manager.handleMessage(wsSpec, {
    type: CHESS_MSG.SPECTATE_ROOM,
    data: { roomId: room.id }
  });

  // 1. Spectator attempts move
  manager.handleMessage(wsSpec, {
    type: CHESS_MSG.MOVE,
    data: { from: 'e2', to: 'e4' }
  });
  let err = wsSpec.findLastMessage(CHESS_MSG.ERROR);
  assert.ok(err.message.includes('espectadores'), 'Move must be rejected for spectator');

  // 2. Spectator attempts draw offer
  wsSpec.clearMessages();
  manager.handleMessage(wsSpec, { type: CHESS_MSG.OFFER_DRAW });
  err = wsSpec.findLastMessage(CHESS_MSG.ERROR);
  assert.ok(err.message.includes('espectadores'), 'Draw offer must be rejected for spectator');

  // 3. Spectator attempts resignation
  wsSpec.clearMessages();
  manager.handleMessage(wsSpec, { type: CHESS_MSG.RESIGN });
  err = wsSpec.findLastMessage(CHESS_MSG.ERROR);
  assert.ok(err.message.includes('espectadores'), 'Resign must be rejected for spectator');

  // 4. Spectator attempts rematch (after game over)
  room.isGameOver = true;
  wsSpec.clearMessages();
  manager.handleMessage(wsSpec, { type: CHESS_MSG.REMATCH });
  err = wsSpec.findLastMessage(CHESS_MSG.ERROR);
  assert.ok(err.message.includes('espectadores'), 'Rematch must be rejected for spectator');

  manager.destroy();
});

// 8. Turn Enforcement and Illegal Move Rejections
runTest('TIER 2', 'Out-of-turn moves and illegal moves produce explicit CHESS_MSG.ERROR responses', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('w');
  const ws2 = new MockWebSocket('b');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'W', pin: '8899', preferredColor: 'w' }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'B', pin: '8899' }
  });

  // Black tries to move on turn 1
  manager.handleMessage(ws2, {
    type: CHESS_MSG.MOVE,
    data: { from: 'e7', to: 'e5' }
  });
  const turnErr = ws2.findLastMessage(CHESS_MSG.ERROR);
  assert.ok(turnErr.message.includes('No es tu turno'));

  // White makes an illegal move
  manager.handleMessage(ws1, {
    type: CHESS_MSG.MOVE,
    data: { from: 'e2', to: 'e6' }
  });
  const illegalErr = ws1.findLastMessage(CHESS_MSG.ERROR);
  assert.ok(illegalErr.message.includes('Movimiento ilegal'));

  manager.destroy();
});

// 9. Spectator Forbidden on Private Room with allowSpectators: false
runTest('TIER 2', 'Private room with allowSpectators: false rejects spectator joins', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('w');
  const ws2 = new MockWebSocket('b');
  const wsSpec = new MockWebSocket('spec');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'W', pin: '1357', allowSpectators: false }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'B', pin: '1357' }
  });
  const room = manager.pinToRoom.get('1357');

  manager.handleMessage(wsSpec, {
    type: CHESS_MSG.SPECTATE_ROOM,
    data: { roomId: room.id }
  });

  const err = wsSpec.findLastMessage(CHESS_MSG.ERROR);
  assert.ok(err, 'Spectator must receive error');
  assert.ok(err.message.includes('no permite espectadores'));
  assert.strictEqual(room.spectators.size, 0);

  manager.destroy();
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (Matchmaking, Clocks, Draws & Rematches)
// ============================================================================
console.log('\n>>> TIER 3: CROSS-FEATURE COMBINATIONS (Queue, Clocks & Lifecycle)');

// 10. Public Matchmaking Pairing & Queue Cancellation (Spec 100, 101)
runTest('TIER 3', 'Matchmaking queue pairs players with same time control and cleans up on disconnect', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('q1');
  const ws2 = new MockWebSocket('q2');

  // Player 1 joins queue
  manager.handleMessage(ws1, {
    type: CHESS_MSG.JOIN_QUEUE,
    data: { name: 'QueuePlayer1', timeControl: 'blitz_3_2' }
  });

  const queue = manager.queues.get('blitz_3_2');
  assert.strictEqual(queue.length, 1);
  assert.strictEqual(ws1.findLastMessage(CHESS_MSG.QUEUE_STATUS).status, 'waiting');

  // Player 2 joins queue -> automatic match
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_QUEUE,
    data: { name: 'QueuePlayer2', timeControl: 'blitz_3_2' }
  });

  assert.strictEqual(queue.length, 0, 'Queue must be empty after pairing');
  assert.ok(ws1.findLastMessage(CHESS_MSG.GAME_START), 'Player 1 receives GAME_START');
  assert.ok(ws2.findLastMessage(CHESS_MSG.GAME_START), 'Player 2 receives GAME_START');

  // Player 3 joins queue and leaves
  const ws3 = new MockWebSocket('q3');
  manager.handleMessage(ws3, {
    type: CHESS_MSG.JOIN_QUEUE,
    data: { name: 'QueuePlayer3', timeControl: 'bullet_1_0' }
  });
  assert.strictEqual(manager.queues.get('bullet_1_0').length, 1);

  manager.handleDisconnect(ws3);
  assert.strictEqual(manager.queues.get('bullet_1_0').length, 0, 'Disconnect must prune queue entry');

  manager.destroy();
});

// 11. Fischer Clock Tick and Timeout Adjudication (Spec 111, 112)
runTest('TIER 3', 'Clock ticks down for active side and awards timeout victory to opponent', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('w');
  const ws2 = new MockWebSocket('b');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'White', pin: '4455', timeControl: 'bullet_1_0', preferredColor: 'w' }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'Black', pin: '4455' }
  });

  const room = manager.pinToRoom.get('4455');
  assert.strictEqual(room.engine.turn, 'w');

  // Manually fast-forward White's time to 0.1s
  room.whiteTime = 0.1;
  room.lastTick = Date.now() - 500; // 500ms elapsed

  manager.tickClocks();

  assert.strictEqual(room.isGameOver, true, 'Game must end on timeout');
  const gameOverMsg = ws1.findLastMessage(CHESS_MSG.GAME_OVER);
  assert.ok(gameOverMsg, 'GAME_OVER must be broadcast');
  assert.strictEqual(gameOverMsg.result, 'timeout');
  assert.strictEqual(gameOverMsg.winner, 'b', 'Opponent Black must be declared winner');

  manager.destroy();
});

// 12. Dynamic Clock Sync Frequency (5s normal, 1s low-time) (Spec 113)
runTest('TIER 3', 'Authoritative clock sync broadcasts at 5s intervals normally, 1s when time < 30s', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('w');
  const ws2 = new MockWebSocket('b');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'W', pin: '7788', timeControl: 'rapid_10_0' }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'B', pin: '7788' }
  });

  const room = manager.pinToRoom.get('7788');
  ws1.clearMessages();

  // 1. Normal play (time > 30s) -> 3 seconds elapsed does NOT trigger sync
  room.whiteTime = 500;
  room.blackTime = 500;
  room.lastClockSync = Date.now() - 3000;
  room.lastTick = Date.now();
  manager.tickClocks();
  assert.strictEqual(ws1.findMessages(CHESS_MSG.CLOCK_SYNC).length, 0);

  // 2. Normal play -> 5.1 seconds elapsed DOES trigger sync
  room.lastClockSync = Date.now() - 5100;
  manager.tickClocks();
  assert.strictEqual(ws1.findMessages(CHESS_MSG.CLOCK_SYNC).length, 1);

  // 3. Low-time mode (time < 30s) -> 1.2 seconds elapsed triggers sync
  ws1.clearMessages();
  room.whiteTime = 15; // < 30s
  room.lastClockSync = Date.now() - 1200;
  manager.tickClocks();
  assert.strictEqual(ws1.findMessages(CHESS_MSG.CLOCK_SYNC).length, 1);

  manager.destroy();
});

// 13. Mutual Draw Sequence (Offer, Accept, Decline) (Spec 114)
runTest('TIER 3', 'Draw offer flow completes with mutual agreement or explicit decline', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('w');
  const ws2 = new MockWebSocket('b');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'W', pin: '2468', preferredColor: 'w' }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'B', pin: '2468' }
  });

  const room = manager.pinToRoom.get('2468');

  // White offers draw
  manager.handleMessage(ws1, { type: CHESS_MSG.OFFER_DRAW });
  const offerToBlack = ws2.findLastMessage(CHESS_MSG.DRAW_OFFERED);
  assert.ok(offerToBlack, 'Black must receive DRAW_OFFERED');
  assert.strictEqual(offerToBlack.fromColor, 'w');

  // Black declines
  manager.handleMessage(ws2, {
    type: CHESS_MSG.RESPOND_DRAW,
    data: { accept: false }
  });
  const declineNotice = ws1.findLastMessage(CHESS_MSG.DRAW_DECLINED) || ws2.findLastMessage(CHESS_MSG.DRAW_DECLINED);
  assert.ok(declineNotice, 'DRAW_DECLINED packet must be dispatched');
  assert.strictEqual(room.drawOfferFrom, null, 'Pending draw offer must be reset on decline');
  assert.strictEqual(room.isGameOver, false);

  // Black offers draw, White accepts
  manager.handleMessage(ws2, { type: CHESS_MSG.OFFER_DRAW });
  manager.handleMessage(ws1, {
    type: CHESS_MSG.RESPOND_DRAW,
    data: { accept: true }
  });

  assert.strictEqual(room.isGameOver, true);
  const gameOver = ws1.findLastMessage(CHESS_MSG.GAME_OVER);
  assert.strictEqual(gameOver.result, 'mutual_agreement');
  assert.strictEqual(gameOver.winner, null);

  manager.destroy();
});

// 14. Resignation & Rematch Color Inversion (Spec 114, 117)
runTest('TIER 3', 'Resignation concludes game; Rematch swaps colors and re-initializes engine', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('p1');
  const ws2 = new MockWebSocket('p2');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'P1', pin: '5544', preferredColor: 'w' }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'P2', pin: '5544' }
  });

  const room = manager.pinToRoom.get('5544');
  assert.strictEqual(room.whiteWs, ws1);
  assert.strictEqual(room.blackWs, ws2);

  // Black resigns
  manager.handleMessage(ws2, { type: CHESS_MSG.RESIGN });

  assert.strictEqual(room.isGameOver, true);
  const overMsg = ws1.findLastMessage(CHESS_MSG.GAME_OVER);
  assert.strictEqual(overMsg.result, 'resignation');
  assert.strictEqual(overMsg.winner, 'w');

  // Player requests rematch -> Invert colors!
  manager.handleMessage(ws1, { type: CHESS_MSG.REMATCH });

  assert.strictEqual(room.isGameOver, false);
  assert.strictEqual(room.whiteWs, ws2, 'Old Black must now be White');
  assert.strictEqual(room.blackWs, ws1, 'Old White must now be Black');
  assert.strictEqual(room.engine.history.length, 0, 'Move history must be reset for new game');

  manager.destroy();
});

// ============================================================================
// TIER 4: REAL-WORLD WORKLOADS (Stress, Mobile Lifecycle & Memory Cleanup)
// ============================================================================
console.log('\n>>> TIER 4: REAL-WORLD WORKLOADS (Stress & Mobile Lifecycle)');

// 15. Concurrent 20-Room Matchmaking Stress Test
runTest('TIER 4', 'Manager simultaneously handles 20 concurrent PIN rooms without packet crosstalk', () => {
  const manager = new ChessRoomManager();
  const roomPairs = [];

  for (let i = 0; i < 20; i++) {
    const pin = String(1000 + i);
    const wWs = new MockWebSocket(`w_${i}`);
    const bWs = new MockWebSocket(`b_${i}`);

    manager.handleMessage(wWs, {
      type: CHESS_MSG.CREATE_ROOM,
      data: { name: `W_${i}`, pin, timeControl: 'blitz_3_0' }
    });
    manager.handleMessage(bWs, {
      type: CHESS_MSG.JOIN_ROOM,
      data: { name: `B_${i}`, pin }
    });

    roomPairs.push({ pin, wWs, bWs });
  }

  assert.strictEqual(manager.rooms.size, 20, '20 distinct rooms must exist in manager');
  assert.strictEqual(manager.pinToRoom.size, 20, '20 distinct PINs mapped');

  // Broadcast a move in Room 5
  const room5 = roomPairs[5];
  const r5 = manager.pinToRoom.get(room5.pin);
  const whiteSocket = r5.whiteWs;

  manager.handleMessage(whiteSocket, {
    type: CHESS_MSG.MOVE,
    data: { from: 'e2', to: 'e4' }
  });

  // Verify only Room 5 received the move
  assert.strictEqual(r5.whiteWs.findMessages(CHESS_MSG.MOVE_BROADCAST).length, 1);
  assert.strictEqual(r5.blackWs.findMessages(CHESS_MSG.MOVE_BROADCAST).length, 1);

  // Other rooms must have 0 move broadcasts
  for (let i = 0; i < 20; i++) {
    if (i !== 5) {
      assert.strictEqual(roomPairs[i].wWs.findMessages(CHESS_MSG.MOVE_BROADCAST).length, 0);
      assert.strictEqual(roomPairs[i].bWs.findMessages(CHESS_MSG.MOVE_BROADCAST).length, 0);
    }
  }

  manager.destroy();
});

// 16. Mobile Reconnect & Full Game Lifecycle
runTest('TIER 4', 'Mobile socket disruption simulates mid-game reconnection, continuation, and checkmate', () => {
  const manager = new ChessRoomManager();
  const ws1 = new MockWebSocket('m_w');
  const ws2 = new MockWebSocket('m_b');

  manager.handleMessage(ws1, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'AliceMobile', pin: '9988', preferredColor: 'w' }
  });
  manager.handleMessage(ws2, {
    type: CHESS_MSG.JOIN_ROOM,
    data: { name: 'BobMobile', pin: '9988' }
  });

  const room = manager.pinToRoom.get('9988');
  const whiteToken = room.whiteToken;

  // Move 1: 1. e4 e5
  manager.handleMessage(ws1, { type: CHESS_MSG.MOVE, data: { from: 'e2', to: 'e4' } });
  manager.handleMessage(ws2, { type: CHESS_MSG.MOVE, data: { from: 'e7', to: 'e5' } });

  // Move 2: 2. Qh5 Nc6
  manager.handleMessage(ws1, { type: CHESS_MSG.MOVE, data: { from: 'd1', to: 'h5' } });
  manager.handleMessage(ws2, { type: CHESS_MSG.MOVE, data: { from: 'b8', to: 'c6' } });

  // Mobile tunnel drop for White (tunnel reset)
  manager.handleDisconnect(ws1);
  assert.ok(room.disconnectTimer);

  // White re-establishes socket via 4G/5G reconnect
  const ws1Recon = new MockWebSocket('m_w_reconnected');
  manager.handleMessage(ws1Recon, {
    type: CHESS_MSG.RECONNECT,
    data: { roomId: room.id, playerToken: whiteToken }
  });

  assert.strictEqual(room.engine.history.length, 4);

  // Move 3: 3. Bc4 Nf6
  manager.handleMessage(ws1Recon, { type: CHESS_MSG.MOVE, data: { from: 'f1', to: 'c4' } });
  manager.handleMessage(ws2, { type: CHESS_MSG.MOVE, data: { from: 'g8', to: 'f6' } });

  // Move 4: 4. Qxf7# (Scholar's Mate)
  manager.handleMessage(ws1Recon, { type: CHESS_MSG.MOVE, data: { from: 'h5', to: 'f7' } });

  assert.strictEqual(room.isGameOver, true);
  const over = ws1Recon.findLastMessage(CHESS_MSG.GAME_OVER);
  assert.ok(over);
  assert.strictEqual(over.winner, 'w');
  assert.strictEqual(over.result, 'checkmate');

  manager.destroy();
});

// 17. Manager Cleanup & Memory Destruction
runTest('TIER 4', 'destroy() cleanly disposes intervals, rooms, queues, and PIN mappings', () => {
  const manager = new ChessRoomManager();
  const ws = new MockWebSocket('clean_test');

  manager.handleMessage(ws, {
    type: CHESS_MSG.CREATE_ROOM,
    data: { name: 'Clean', pin: '5555' }
  });
  manager.handleMessage(ws, {
    type: CHESS_MSG.JOIN_QUEUE,
    data: { name: 'CleanQ', timeControl: 'blitz_3_0' }
  });

  assert.strictEqual(manager.rooms.size, 1);
  assert.strictEqual(manager.pinToRoom.size, 1);
  assert.ok(manager.clockInterval !== null);

  manager.destroy();

  assert.strictEqual(manager.rooms.size, 0);
  assert.strictEqual(manager.pinToRoom.size, 0);
  assert.strictEqual(manager.socketMeta.size, 0);
  assert.strictEqual(manager.clockInterval, null);
});

console.log('\n=============================================================================');
console.log(`ALL ${totalTests} CHESS MULTIPLAYER SYNCHRONIZATION TESTS PASSED CLEANLY (100% SUCCESS)!`);
console.log('=============================================================================');
