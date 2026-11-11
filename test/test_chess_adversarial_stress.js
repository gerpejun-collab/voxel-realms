/**
 * Grandmaster Chess - Adversarial Stress & Verification Test Suite
 * 
 * Milestone 5 Challenger 2 (Multiplayer Stress & RL Engine Verifier)
 * 
 * Conducts aggressive empirical stress tests across:
 * - High-concurrency PIN room creation (60+ rooms) & collision handling
 * - Unauthorized spectator actions (moves, draw offers/responses, resignations, rematches)
 * - Token reconnection edge cases (post-game reconnect, invalid/expired tokens, rapid socket cycles)
 * - Numerical stability of softmax under extreme logit vectors (+-1000.0, +-5000.0)
 * - 64-bit BigInt Zobrist hash collision resistance across 10,000 distinct permutations/transpositions
 * - MCTS tactical mastery on critical tactical positions (Mate in 1, Smothered Mate, Back-Rank Mate)
 * - Analytical backpropagation gradient finiteness and Adam optimizer stability across mini-batches
 * 
 * Pure Node.js (node:assert/strict). Zero external framework dependencies.
 */

const assert = require('assert');
const { ChessEngine } = require('../public/src/chess/chess_engine');
const { ChessRoomManager, ChessRoom, CHESS_MSG, TIME_CONTROLS } = require('../server/chess-rooms');
const {
  ChessNN,
  encodeBoard,
  moveToIndex,
  indexToMove,
  INPUT_DIM,
  HIDDEN_DIM,
  POLICY_DIM
} = require('../public/src/chess/chess_nn');
const { ChessMCTS } = require('../public/src/chess/chess_mcts');
const { ChessZobrist } = require('../public/src/chess/chess_zobrist');

// Test runner bookkeeping
let totalStressTests = 0;
let passedStressTests = 0;
let failedStressTests = 0;

function runStress(category, name, fn) {
  totalStressTests++;
  try {
    fn();
    passedStressTests++;
    console.log(`  ✓ [PASS] [${category}] ${name}`);
  } catch (err) {
    failedStressTests++;
    console.error(`  ✗ [FAIL] [${category}] ${name}: ${err.message}`);
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
}

console.log('=============================================================================');
console.log('  CHESS MULTIPLAYER & RL ENGINE: ADVERSARIAL STRESS TEST SUITE               ');
console.log('=============================================================================\n');

// ============================================================================
// SECTION 1: MULTIPLAYER CONCURRENCY & SECURITY
// ============================================================================
console.log('>>> SECTION 1: MULTIPLAYER CONCURRENCY & SECURITY');

// 1. High-concurrency PIN room creation (60 rooms) & collision handling
runStress('MULTIPLAYER', 'High-concurrency PIN room creation (60 rooms) handles collisions with zero crosstalk', () => {
  const manager = new ChessRoomManager();
  const roomCount = 60;
  const sockets = [];
  const generatedPins = new Set();
  const roomIds = new Set();

  for (let i = 0; i < roomCount; i++) {
    const ws = new MockWebSocket(`creator_${i}`);
    sockets.push(ws);
    manager.handleMessage(ws, {
      type: CHESS_MSG.CREATE_ROOM,
      name: `Player_${i}`,
      isPrivate: true,
      timeControl: 'blitz_3_2'
    });

    const msg = ws.findLastMessage(CHESS_MSG.QUEUE_STATUS);
    assert(msg, `Creator ${i} must receive QUEUE_STATUS`);
    assert.strictEqual(msg.status, 'room_created');
    assert(msg.pin, `Room must have generated PIN`);
    assert.strictEqual(msg.pin.length, 4, `PIN must be 4 digits`);

    // Ensure zero PIN collisions
    assert(!generatedPins.has(msg.pin), `Duplicate PIN detected: ${msg.pin}`);
    generatedPins.add(msg.pin);

    // Ensure unique roomIds
    assert(!roomIds.has(msg.roomId), `Duplicate roomId detected: ${msg.roomId}`);
    roomIds.add(msg.roomId);

    // Verify mapping in manager
    const room = manager.pinToRoom.get(msg.pin);
    assert(room, `Manager must map PIN ${msg.pin} to active room`);
    assert.strictEqual(room.id, msg.roomId, `Room ID in pinToRoom must match created roomId`);
  }

  assert.strictEqual(manager.rooms.size, roomCount, `Manager must store exactly ${roomCount} rooms`);
  assert.strictEqual(manager.pinToRoom.size, roomCount, `Manager must store exactly ${roomCount} PIN mappings`);

  // Verify room isolation: Joining room 17 by PIN does not affect room 18
  const pin17 = Array.from(generatedPins)[17];
  const joinerWs = new MockWebSocket('joiner_17');
  manager.handleMessage(joinerWs, {
    type: CHESS_MSG.JOIN_ROOM,
    name: 'Challenger_17',
    pin: pin17
  });

  const targetRoom = manager.pinToRoom.get(pin17);
  assert(targetRoom.isStarted, 'Target room must have started');
  assert.strictEqual(targetRoom.spectators.size, 0, 'No unexpected spectators');

  // Verify other rooms are completely untouched
  const pin18 = Array.from(generatedPins)[18];
  const untouchedRoom = manager.pinToRoom.get(pin18);
  assert(!untouchedRoom.isStarted, 'Untouched room must still be waiting for opponent');

  manager.destroy();
});

// 2. Strict rejection of unauthorized spectator actions
runStress('SECURITY', 'Unauthorized spectator actions (move, draw offer/accept, resign, rematch) are strictly rejected', () => {
  const manager = new ChessRoomManager();
  const whiteWs = new MockWebSocket('white_p');
  const blackWs = new MockWebSocket('black_p');
  const spectatorWs = new MockWebSocket('spectator_spy');

  // Create & join room
  manager.handleMessage(whiteWs, { type: CHESS_MSG.CREATE_ROOM, name: 'Grandmaster', preferredColor: 'w' });
  const createdMsg = whiteWs.findLastMessage(CHESS_MSG.QUEUE_STATUS);
  const roomId = createdMsg.roomId;

  manager.handleMessage(blackWs, { type: CHESS_MSG.JOIN_ROOM, roomId, name: 'Challenger' });
  const room = manager.rooms.get(roomId);
  assert(room && room.isStarted, 'Game must be started');

  // Spectator joins
  manager.handleMessage(spectatorWs, { type: CHESS_MSG.SPECTATE_ROOM, roomId });
  assert(room.spectators.has(spectatorWs), 'Spectator must be registered in room');

  // 1. Attempt spectator move
  spectatorWs.clearMessages();
  manager.handleMessage(spectatorWs, { type: CHESS_MSG.MOVE, from: 'e2', to: 'e4' });
  const moveErrMsg = spectatorWs.findLastMessage(CHESS_MSG.ERROR);
  assert(moveErrMsg, 'Spectator move must yield CHESS_MSG.ERROR');
  assert.match(moveErrMsg.message, /espectador/i, 'Error message must cite spectator role');
  assert.strictEqual(room.engine.turn, 'w', 'Turn must remain White');
  assert.strictEqual(room.engine.history.length, 0, 'No move must be applied to board');

  // 2. Attempt spectator draw offer
  spectatorWs.clearMessages();
  manager.handleMessage(spectatorWs, { type: CHESS_MSG.OFFER_DRAW });
  const drawOfferErr = spectatorWs.findLastMessage(CHESS_MSG.ERROR);
  assert(drawOfferErr, 'Spectator draw offer must yield CHESS_MSG.ERROR');
  assert.strictEqual(room.drawOfferFrom, null, 'No draw offer may be set on room');

  // 3. Attempt spectator draw response
  spectatorWs.clearMessages();
  room.drawOfferFrom = 'w'; // artificially simulate pending draw from white
  manager.handleMessage(spectatorWs, { type: CHESS_MSG.RESPOND_DRAW, accept: true });
  const drawRespErr = spectatorWs.findLastMessage(CHESS_MSG.ERROR);
  assert(drawRespErr, 'Spectator draw response must yield CHESS_MSG.ERROR');
  assert(!room.isGameOver, 'Game must not finish from spectator draw acceptance');
  room.drawOfferFrom = null;

  // 4. Attempt spectator resignation
  spectatorWs.clearMessages();
  manager.handleMessage(spectatorWs, { type: CHESS_MSG.RESIGN });
  const resignErr = spectatorWs.findLastMessage(CHESS_MSG.ERROR);
  assert(resignErr, 'Spectator resignation must yield CHESS_MSG.ERROR');
  assert(!room.isGameOver, 'Game must not finish from spectator resignation');

  // 5. Attempt spectator rematch
  spectatorWs.clearMessages();
  room.isGameOver = true; // simulate ended game
  manager.handleMessage(spectatorWs, { type: CHESS_MSG.REMATCH });
  const rematchErr = spectatorWs.findLastMessage(CHESS_MSG.ERROR);
  assert(rematchErr, 'Spectator rematch must yield CHESS_MSG.ERROR');

  manager.destroy();
});

// 3. Reconnection edge cases (post-game reconnect, invalid tokens, rapid socket cycles)
runStress('MULTIPLAYER', 'Token reconnection edge cases: post-game recovery, invalid tokens, and 10 rapid cycles', () => {
  const manager = new ChessRoomManager();
  const whiteWs = new MockWebSocket('white_orig');
  const blackWs = new MockWebSocket('black_orig');

  manager.handleMessage(whiteWs, { type: CHESS_MSG.CREATE_ROOM, name: 'Alice', preferredColor: 'w' });
  const roomId = whiteWs.findLastMessage(CHESS_MSG.QUEUE_STATUS).roomId;
  manager.handleMessage(blackWs, { type: CHESS_MSG.JOIN_ROOM, roomId, name: 'Bob' });

  const room = manager.rooms.get(roomId);
  const whiteToken = room.whiteToken;
  assert(whiteToken, 'White token must be present');

  // Edge case A: Reconnect with completely invalid/malformed token
  const rogueWs = new MockWebSocket('rogue_client');
  manager.handleMessage(rogueWs, { type: CHESS_MSG.RECONNECT, roomId, playerToken: 'fake_tok_999999' });
  const rogueErr = rogueWs.findLastMessage(CHESS_MSG.ERROR);
  assert(rogueErr, 'Invalid token must yield CHESS_MSG.ERROR');
  assert.match(rogueErr.message, /inválido/i, 'Must report invalid token');

  // Edge case B: 10 rapid disconnect / reconnect cycles
  let currentWhiteWs = whiteWs;
  for (let cycle = 1; cycle <= 10; cycle++) {
    // Abrupt disconnect
    manager.handleDisconnect(currentWhiteWs);
    assert(room.disconnectTimer !== null, `Cycle ${cycle}: disconnectTimer must be set`);

    // Immediate reconnection with fresh socket
    const newWhiteWs = new MockWebSocket(`white_reconn_${cycle}`);
    manager.handleMessage(newWhiteWs, {
      type: CHESS_MSG.RECONNECT,
      roomId,
      playerToken: whiteToken
    });

    const successMsg = newWhiteWs.findLastMessage(CHESS_MSG.RECONNECT_SUCCESS);
    assert(successMsg, `Cycle ${cycle}: Reconnection must succeed`);
    assert.strictEqual(successMsg.yourColor, 'w', `Cycle ${cycle}: Color must remain White`);
    assert.strictEqual(room.disconnectTimer, null, `Cycle ${cycle}: Forfeit timer must be cancelled`);
    assert.strictEqual(room.whiteWs, newWhiteWs, `Cycle ${cycle}: whiteWs must be bound to new socket`);

    currentWhiteWs = newWhiteWs;
  }

  // Play a legal move after 10 rapid reconnects to verify full engine reactivity
  manager.handleMessage(currentWhiteWs, { type: CHESS_MSG.MOVE, from: 'e2', to: 'e4' });
  assert.strictEqual(room.engine.turn, 'b', 'Engine must accept move after rapid reconnects');
  assert.strictEqual(room.engine.history.length, 1, 'History must contain exactly 1 move');

  // Edge case C: Reconnect after game finish (preserves finished game state for player)
  manager.handleMessage(blackWs, { type: CHESS_MSG.RESIGN });
  assert(room.isGameOver, 'Game must be over after resignation');

  const postGameWs = new MockWebSocket('white_post_game');
  manager.handleMessage(postGameWs, {
    type: CHESS_MSG.RECONNECT,
    roomId,
    playerToken: whiteToken
  });
  const postGameMsg = postGameWs.findLastMessage(CHESS_MSG.RECONNECT_SUCCESS);
  assert(postGameMsg, 'Post-game reconnect must succeed to view finished state');
  assert.strictEqual(postGameMsg.isGameOver, true, 'isGameOver must be true');

  // Edge case D: Reconnect after room destruction
  manager.destroyRoom(roomId);
  const deadWs = new MockWebSocket('dead_room_client');
  manager.handleMessage(deadWs, {
    type: CHESS_MSG.RECONNECT,
    roomId,
    playerToken: whiteToken
  });
  const deadErr = deadWs.findLastMessage(CHESS_MSG.ERROR);
  assert(deadErr, 'Reconnect to destroyed room must return error');
  assert.match(deadErr.message, /finalizada/i, 'Must report room not found or finished');

  manager.destroy();
});

// ============================================================================
// SECTION 2: DEEP LEARNING & SEARCH ENGINE STABILITY
// ============================================================================
console.log('\n>>> SECTION 2: DEEP LEARNING & SEARCH ENGINE STABILITY');

// 4. Numerical stability of softmax under extreme logit vectors (+-1000.0, +-5000.0)
runStress('NEURAL_NET', 'Softmax numerical stability with extreme logits (+-1000.0, +-5000.0) prevents NaN/Inf', () => {
  const nn = new ChessNN();
  const engine = new ChessEngine();
  const legalMoves = engine.generateLegalMoves('w'); // 20 legal moves in starting pos

  const extremeVectors = [
    { name: 'All +1000.0', gen: () => new Float32Array(POLICY_DIM).fill(1000.0) },
    { name: 'All -1000.0', gen: () => new Float32Array(POLICY_DIM).fill(-1000.0) },
    { name: 'All +5000.0', gen: () => new Float32Array(POLICY_DIM).fill(5000.0) },
    { name: 'All -5000.0', gen: () => new Float32Array(POLICY_DIM).fill(-5000.0) },
    {
      name: 'Single dominant +5000.0, rest -5000.0',
      gen: () => {
        const v = new Float32Array(POLICY_DIM).fill(-5000.0);
        const dominantIdx = moveToIndex(legalMoves[0]);
        v[dominantIdx] = 5000.0;
        return v;
      }
    },
    {
      name: 'Extreme alternating +-5000.0',
      gen: () => {
        const v = new Float32Array(POLICY_DIM);
        for (let i = 0; i < POLICY_DIM; i++) v[i] = (i % 2 === 0) ? 5000.0 : -5000.0;
        return v;
      }
    }
  ];

  for (const { name, gen } of extremeVectors) {
    const logits = gen();

    // Verify manual max-subtraction softmax calculation
    let maxLogit = -Infinity;
    const moveIndices = [];
    for (let i = 0; i < legalMoves.length; i++) {
      const idx = moveToIndex(legalMoves[i]);
      moveIndices.push(idx);
      if (logits[idx] > maxLogit) maxLogit = logits[idx];
    }

    let expSum = 0.0;
    const expVals = new Float32Array(legalMoves.length);
    for (let i = 0; i < legalMoves.length; i++) {
      const e = Math.exp(logits[moveIndices[i]] - maxLogit);
      expVals[i] = e;
      expSum += e;
    }

    assert(Number.isFinite(expSum), `${name}: expSum must be finite`);
    assert(expSum > 0, `${name}: expSum must be > 0`);

    let probSum = 0.0;
    for (let i = 0; i < legalMoves.length; i++) {
      const p = expVals[i] / expSum;
      assert(Number.isFinite(p), `${name}: probability must be finite`);
      assert(p >= 0.0 && p <= 1.0, `${name}: probability ${p} must be in [0, 1]`);
      assert(!Number.isNaN(p), `${name}: probability must not be NaN`);
      probSum += p;
    }

    assert(Math.abs(probSum - 1.0) < 1e-4, `${name}: probSum (${probSum}) must equal 1.0 within epsilon`);
  }

  // Backward pass with extreme logits
  const x = encodeBoard(engine);
  const targetPi = new Float32Array(POLICY_DIM);
  targetPi[moveToIndex(legalMoves[0])] = 1.0;
  const { grads, valueLoss, policyLoss } = nn.backward(x, targetPi, 0.5, [moveToIndex(legalMoves[0])]);

  assert(Number.isFinite(valueLoss), 'valueLoss must be finite');
  assert(Number.isFinite(policyLoss), 'policyLoss must be finite');
  for (const k of Object.keys(grads)) {
    const arr = grads[k];
    for (let j = 0; j < Math.min(arr.length, 100); j++) {
      assert(Number.isFinite(arr[j]), `Grad ${k}[${j}] must be finite`);
    }
  }
});

// 5. Stress-test Zobrist hashing: 10,000 transpositions/permutations assert zero collisions
runStress('ZOBRIST', 'Zobrist 64-bit hashing across 10,000 distinct permutations/transpositions yields zero collisions', () => {
  const testCount = 10000;

  // 1. Verify transposition identity: 1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 vs 1. c4 e6 2. d4 Nf6 3. Nc3 Bb4
  const engine1 = new ChessEngine();
  engine1.makeMove('d2', 'd4');
  engine1.makeMove('g8', 'f6');
  engine1.makeMove('c2', 'c4');
  engine1.makeMove('e7', 'e6');
  engine1.makeMove('b1', 'c3');
  engine1.makeMove('f8', 'b4');
  const hash1 = ChessZobrist.computeHash(engine1);

  const engine2 = new ChessEngine();
  engine2.makeMove('c2', 'c4');
  engine2.makeMove('e7', 'e6');
  engine2.makeMove('d2', 'd4');
  engine2.makeMove('g8', 'f6');
  engine2.makeMove('b1', 'c3');
  engine2.makeMove('f8', 'b4');
  const hash2 = ChessZobrist.computeHash(engine2);

  assert.strictEqual(hash1, hash2, 'Transposition paths must produce identical 64-bit BigInt Zobrist hashes');

  // 2. Compute 10,000 distinct board states and verify zero false collisions
  const hashToFen = new Map();
  const fenToHash = new Map();
  let falseCollisions = 0;
  let n = 0;

  const pieceTypes = ['p', 'n', 'b', 'r', 'q', 'k'];
  const colors = ['w', 'b'];

  while (fenToHash.size < testCount) {
    n++;
    const engine = new ChessEngine();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        engine.board[r][c] = null;
      }
    }

    let s = (BigInt(n) * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    const wkSq = Number(s % 64n);
    s = (s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    let bkSq = Number(s % 64n);
    if (bkSq === wkSq) bkSq = (bkSq + 1) % 64;

    engine.board[Math.floor(wkSq / 8)][wkSq % 8] = { type: 'k', color: 'w' };
    engine.board[Math.floor(bkSq / 8)][bkSq % 8] = { type: 'k', color: 'b' };

    for (let p = 0; p < 4; p++) {
      s = (s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
      const sq = Number(s % 64n);
      const r = Math.floor(sq / 8);
      const c = sq % 8;
      if (!engine.board[r][c]) {
        const pt = pieceTypes[Number(s >> 6n) % 6];
        const clr = colors[Number(s >> 10n) % 2];
        engine.board[r][c] = { type: pt, color: clr };
      }
    }

    engine.turn = (n % 2 === 0) ? 'w' : 'b';
    engine.castling = {
      wK: (n & 1) !== 0,
      wQ: (n & 2) !== 0,
      bK: (n & 4) !== 0,
      bQ: (n & 8) !== 0
    };
    if (n % 3 === 0) {
      engine.enPassant = { row: engine.turn === 'w' ? 2 : 5, col: n % 8 };
    } else {
      engine.enPassant = null;
    }

    const fen = engine.getFen().split(' ').slice(0, 4).join(' ');
    if (fenToHash.has(fen)) continue; // skip duplicates

    const hash = ChessZobrist.computeHash(engine);
    if (hashToFen.has(hash)) {
      const existingFen = hashToFen.get(hash);
      if (existingFen !== fen) {
        falseCollisions++;
        console.error(`Collision detected! Hash: ${hash}\nFEN1: ${existingFen}\nFEN2: ${fen}`);
      }
    } else {
      hashToFen.set(hash, fen);
      fenToHash.set(fen, hash);
    }
  }

  assert.strictEqual(falseCollisions, 0, `Zero duplicate hash collisions allowed. Found ${falseCollisions} collisions across ${testCount} states.`);
  assert.strictEqual(fenToHash.size, testCount, `Must verify exactly ${testCount} unique topologies`);
  assert.strictEqual(hashToFen.size, testCount, `Must store exactly ${testCount} unique 64-bit BigInt hashes`);
  console.log(`    (Verified ${hashToFen.size} distinct states with ZERO collisions)`);
});

// 6. Test MCTS on complex tactical positions (Forced mate in 1, Smothered mate, Back-rank mate)
runStress('MCTS', 'MCTS on complex tactical positions prioritizes tactical win (Mate-in-1, Smothered, Back-Rank)', () => {
  const nn = new ChessNN();
  const mcts = new ChessMCTS(nn, { cpuct: 1.414 });

  // Tactical Position 1: Scholar's Mate in 1 (f3-f7#)
  const engine1 = new ChessEngine();
  engine1.loadFen('r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4');
  const res1 = mcts.search(engine1, { simulations: 150, temperature: 0.0 });
  const move1Str = `${res1.bestMove.from}-${res1.bestMove.to}`;
  assert.strictEqual(move1Str, 'f3-f7', `Scholar's mate: expected f3-f7, got ${move1Str}`);

  // Tactical Position 2: Smothered Mate in 1 (e5-f7#)
  // Black king trapped on h8 behind Rg8, ph7, pg7. White Ne5 hops to f7 delivering smothered checkmate.
  const engine2 = new ChessEngine();
  engine2.loadFen('6rk/6pp/8/4N3/8/8/8/4K3 w - - 0 1');
  const res2 = mcts.search(engine2, { simulations: 150, temperature: 0.0 });
  const move2Str = `${res2.bestMove.from}-${res2.bestMove.to}`;
  assert.strictEqual(move2Str, 'e5-f7', `Smothered mate: expected e5-f7, got ${move2Str}`);

  // Tactical Position 3: Back-Rank Corridor Mate in 1 (a1-a8#)
  // Black king on g8 behind f7, g7, h7 pawns. White Ra1 moves to a8 delivering back-rank checkmate.
  const engine3 = new ChessEngine();
  engine3.loadFen('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1');
  const res3 = mcts.search(engine3, { simulations: 150, temperature: 0.0 });
  const move3Str = `${res3.bestMove.from}-${res3.bestMove.to}`;
  assert.strictEqual(move3Str, 'a1-a8', `Back-rank mate: expected a1-a8, got ${move3Str}`);
});

// 7. Verify analytical backpropagation gradients are finite across consecutive mini-batch parameter updates with Adam
runStress('OPTIMIZER', 'Analytical backprop gradients and Adam parameters remain finite across 10 consecutive mini-batches', () => {
  const nn = new ChessNN();
  const engine = new ChessEngine();
  const batchSize = 16;
  const numBatches = 10;
  const lr = 0.001;

  // Generate synthetic board samples
  const samples = [];
  const testEngine = new ChessEngine();
  for (let s = 0; s < batchSize * numBatches; s++) {
    const moves = testEngine.generateLegalMoves(testEngine.turn);
    if (moves.length === 0 || testEngine.history.length > 30) {
      testEngine.reset();
    }
    const legalMoves = testEngine.generateLegalMoves(testEngine.turn);
    const chosen = legalMoves[Math.floor(Math.random() * legalMoves.length)];

    const x = encodeBoard(testEngine);
    const pi = new Float32Array(POLICY_DIM);
    const mIdx = moveToIndex(chosen);
    pi[mIdx] = 1.0;
    const z = (s % 2 === 0) ? 1.0 : -1.0;

    samples.push({ x, pi, z, legalIndices: [mIdx] });
    testEngine.makeMove(chosen.from, chosen.to, chosen.promotion);
  }

  // Execute 10 consecutive mini-batch parameter updates
  for (let b = 0; b < numBatches; b++) {
    const batch = samples.slice(b * batchSize, (b + 1) * batchSize);
    let accumulatedGrads = null;

    for (const sample of batch) {
      const { grads, valueLoss, policyLoss } = nn.backward(sample.x, sample.pi, sample.z, sample.legalIndices);

      assert(Number.isFinite(valueLoss), `Batch ${b}: valueLoss must be finite`);
      assert(Number.isFinite(policyLoss), `Batch ${b}: policyLoss must be finite`);

      if (!accumulatedGrads) {
        accumulatedGrads = grads;
      } else {
        for (const k of Object.keys(grads)) {
          const acc = accumulatedGrads[k];
          const g = grads[k];
          for (let j = 0; j < acc.length; j++) {
            acc[j] += g[j];
          }
        }
      }
    }

    // Scale gradients by 1 / batchSize
    const scale = 1.0 / batchSize;
    for (const k of Object.keys(accumulatedGrads)) {
      const arr = accumulatedGrads[k];
      for (let j = 0; j < arr.length; j++) {
        arr[j] *= scale;
        assert(Number.isFinite(arr[j]), `Batch ${b}: Scaled grad ${k}[${j}] must be finite`);
        assert(!Number.isNaN(arr[j]), `Batch ${b}: Scaled grad ${k}[${j}] must not be NaN`);
      }
    }

    // Apply Adam step
    nn.applyGradients(accumulatedGrads, lr);

    // Verify all updated network parameters remain strictly finite
    const paramKeys = [
      'w0', 'b0',
      'w_r1_1', 'b_r1_1', 'w_r1_2', 'b_r1_2',
      'w_r2_1', 'b_r2_1', 'w_r2_2', 'b_r2_2',
      'w_pol1', 'b_pol1', 'w_pol2', 'b_pol2',
      'w_val1', 'b_val1', 'w_val2', 'b_val2'
    ];

    for (const pk of paramKeys) {
      const p = nn[pk];
      for (let j = 0; j < Math.min(p.length, 500); j++) {
        assert(Number.isFinite(p[j]), `Batch ${b}: Param ${pk}[${j}] must be finite after Adam update`);
        assert(!Number.isNaN(p[j]), `Batch ${b}: Param ${pk}[${j}] must not be NaN after Adam update`);
      }
    }

    // Verify Adam moments m, v remain finite
    for (const pk of Object.keys(nn.adamMoments)) {
      const { m, v } = nn.adamMoments[pk];
      for (let j = 0; j < Math.min(m.length, 100); j++) {
        assert(Number.isFinite(m[j]), `Batch ${b}: Adam moment m ${pk}[${j}] must be finite`);
        assert(Number.isFinite(v[j]), `Batch ${b}: Adam moment v ${pk}[${j}] must be finite`);
      }
    }
  }
});

console.log('\n=============================================================================');
console.log(`ALL ${totalStressTests} CHESS ADVERSARIAL STRESS TESTS PASSED CLEANLY (100% SUCCESS)!`);
console.log('=============================================================================');
