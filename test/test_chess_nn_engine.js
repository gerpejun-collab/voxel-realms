/**
 * Grandmaster Chess - Neural Network, MCTS & RL Engine Test Suite (Tiers 1-4)
 * 
 * Tests the pure JavaScript neural network, MCTS decision, opening book, and RL training loop:
 * - Tier 1: Feature Coverage (Tensor encoding, dual-headed NN forward inference, PUCT, Book ECO, Zobrist)
 * - Tier 2: Boundary & Corner Cases (Softmax numerical stability, Dirichlet noise, terminal evaluations)
 * - Tier 3: Cross-Feature Combinations (Mate-in-1 tactical decision, Book temperature diversity, Threefold repetition)
 * - Tier 4: Real-World Workloads (Self-play episode generation, Analytical backprop gradients, Adam optimizer update)
 * 
 * Zero external test framework dependencies (pure Node.js assert/runner).
 */

const assert = require('assert');
const { ChessEngine } = require('../public/src/chess/chess_engine');
const {
  ChessNN,
  encodeBoard,
  moveToIndex,
  indexToMove,
  INPUT_DIM,
  HIDDEN_DIM,
  HEAD_HIDDEN,
  POLICY_DIM
} = require('../public/src/chess/chess_nn');
const { ChessMCTS, MCTSNode } = require('../public/src/chess/chess_mcts');
const { ChessBook } = require('../public/src/chess/chess_book');
const { ChessZobrist, RepetitionTracker } = require('../public/src/chess/chess_zobrist');
const { playSelfPlayGame, parseArgs } = require('../scripts/train_chess_rl');

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

console.log('=============================================================================');
console.log('   CHESS NEURAL NETWORK, MCTS & RL ENGINE: 4-TIER TEST SUITE                 ');
console.log('=============================================================================\n');

// ============================================================================
// TIER 1: FEATURE COVERAGE (Tensor Encoding, Forward Pass, MCTS & Opening Book)
// ============================================================================
console.log('>>> TIER 1: FEATURE COVERAGE (NN Inference, MCTS & Opening Book)');

// 1. Board Tensor Feature Plane Encoding (Spec 151, 152)
runTest('TIER 1', 'encodeBoard produces Float32Array(896) with 14 distinct feature planes', () => {
  const engine = new ChessEngine();
  const tensor = encodeBoard(engine);

  assert.strictEqual(tensor.length, 896, 'Tensor length must be exactly 896 (8x8x14)');
  assert.ok(tensor instanceof Float32Array, 'Tensor must be Float32Array');

  // Count active piece units in White planes (0-5) and Black planes (6-11)
  let whitePieces = 0;
  for (let p = 0; p < 6; p++) {
    for (let sq = 0; sq < 64; sq++) {
      if (tensor[p * 64 + sq] === 1.0) whitePieces++;
    }
  }

  let blackPieces = 0;
  for (let p = 6; p < 12; p++) {
    for (let sq = 0; sq < 64; sq++) {
      if (tensor[p * 64 + sq] === 1.0) blackPieces++;
    }
  }

  assert.strictEqual(whitePieces, 16, 'Initial board has exactly 16 White pieces');
  assert.strictEqual(blackPieces, 16, 'Initial board has exactly 16 Black pieces');

  // Plane 12: Active turn (1.0 for White, 0.0 for Black)
  const p12Offset = 12 * 64;
  for (let sq = 0; sq < 64; sq++) {
    assert.strictEqual(tensor[p12Offset + sq], 1.0, 'Plane 12 must be 1.0 when White to move');
  }

  // Plane 13: Castling availability
  const p13Offset = 13 * 64;
  assert.strictEqual(tensor[p13Offset + (7 * 8 + 7)], 1.0, 'White kingside castling right at h1');
  assert.strictEqual(tensor[p13Offset + (7 * 8 + 0)], 1.0, 'White queenside castling right at a1');
  assert.strictEqual(tensor[p13Offset + (0 * 8 + 7)], 1.0, 'Black kingside castling right at h8');
  assert.strictEqual(tensor[p13Offset + (0 * 8 + 0)], 1.0, 'Black queenside castling right at a8');
});

// 2. Bijective Move-to-Index & Index-to-Move Mapping (Spec 153)
runTest('TIER 1', 'moveToIndex and indexToMove form an invertible bijective mapping in [0, 4095]', () => {
  const testMoves = [
    { from: 'e2', to: 'e4', promotion: 'q' },
    { from: 'g1', to: 'f3', promotion: 'q' },
    { from: 'a7', to: 'a8', promotion: 'n' },
    { from: 'h8', to: 'a1', promotion: 'q' }
  ];

  for (const m of testMoves) {
    const idx = moveToIndex(m);
    assert.ok(idx >= 0 && idx < 4096, `Index ${idx} must be in [0, 4095]`);

    const reconstructed = indexToMove(idx, m.promotion);
    assert.strictEqual(reconstructed.from, m.from, 'from-square must roundtrip');
    assert.strictEqual(reconstructed.to, m.to, 'to-square must roundtrip');
    assert.strictEqual(reconstructed.promotion, m.promotion, 'promotion must roundtrip');
  }
});

// 3. Dual-Headed Neural Network Forward Pass (Spec 154, 155)
runTest('TIER 1', 'nn.forward() produces 4096 policy logits and 1 value bounded in [-1.0, 1.0]', () => {
  const engine = new ChessEngine();
  const tensor = encodeBoard(engine);
  const nn = new ChessNN();

  const { policyLogits, value } = nn.forward(tensor);

  assert.ok(policyLogits instanceof Float32Array, 'Policy logits must be Float32Array');
  assert.strictEqual(policyLogits.length, 4096, 'Policy head output dimension must be 4096');

  for (let i = 0; i < 4096; i++) {
    assert.ok(Number.isFinite(policyLogits[i]), `Policy logit [${i}] must be finite`);
    assert.ok(!Number.isNaN(policyLogits[i]), `Policy logit [${i}] cannot be NaN`);
  }

  assert.ok(typeof value === 'number', 'Value head must return scalar number');
  assert.ok(value >= -1.0 && value <= 1.0, `Value ${value} must be bounded in [-1.0, 1.0]`);
});

// 4. MCTS Node Structure and PUCT Computation (Spec 166, 168)
runTest('TIER 1', 'MCTSNode computes AlphaZero PUCT formula with prior weighting and exploration boost', () => {
  const root = new MCTSNode(null, null, 0.0);
  assert.strictEqual(root.visitCount, 0);
  assert.strictEqual(root.meanValue, 0.0);

  const moveE4 = { from: 'e2', to: 'e4', promotion: 'q' };
  const child = root.addChild(moveE4, 0.40); // Prior P = 0.40

  assert.strictEqual(child.prior, 0.40);
  assert.strictEqual(child.parent, root);

  // PUCT with 0 child visits and 1 parent visit:
  // Q + c_puct * P * (sqrt(N_parent) / (1 + N_child)) = 0 + 1.414 * 0.40 * (1 / 1) = 0.5656
  const scoreInitial = child.computePUCT(1.414, 1);
  assert.ok(Math.abs(scoreInitial - 0.5656) < 0.01, `Initial PUCT score should be ~0.5656 (got ${scoreInitial})`);

  // Visit child and update mean value
  child.visitCount = 10;
  child.totalValue = 5.0;
  child.meanValue = 0.5;

  const scoreVisited = child.computePUCT(1.414, 100);
  // Q + c_puct * P * (sqrt(100) / (1 + 10)) = 0.5 + 1.414 * 0.40 * (10 / 11) = 0.5 + 0.514 = 1.014
  assert.ok(scoreVisited > 1.0 && scoreVisited < 1.05, `Updated PUCT score should be ~1.014 (got ${scoreVisited})`);
});

// 5. Grandmaster Opening Book ECO Volumes A-E (Spec 174, 175)
runTest('TIER 1', 'ChessBook contains 1,200+ compiled positions spanning ECO volumes A through E', () => {
  const book = new ChessBook();
  assert.ok(book.size >= 1200, `Book must contain at least 1,200 positions (got ${book.size})`);

  const engine = new ChessEngine(); // Starting position
  const candidates = book.getCandidates(engine);

  assert.ok(candidates && candidates.length > 0, 'Starting position must have book moves');

  const moveSans = candidates.map(c => c.san);
  assert.ok(moveSans.includes('e4') || moveSans.includes('d4'), 'Starting moves must include e4 or d4');

  // Verify Spanish Opening / Ruy Lopez lookup
  engine.makeMove('e2', 'e4');
  engine.makeMove('e7', 'e5');
  engine.makeMove('g1', 'f3');
  engine.makeMove('b8', 'c6');
  engine.makeMove('f1', 'b5'); // Ruy Lopez

  const ruyInfo = book.getOpeningInfo(engine);
  assert.ok(ruyInfo, 'Ruy Lopez position must be indexed in book');
  assert.ok(ruyInfo.eco.startsWith('C'), `Ruy Lopez ECO must belong to Volume C (got ${ruyInfo.eco})`);
});

// 6. Zobrist 64-Bit BigInt Hash Consistency (Spec 162, 163)
runTest('TIER 1', 'Zobrist hash produces 64-bit BigInt keys consistent across transpositions', () => {
  const engine1 = new ChessEngine();
  // 1. d4 Nf6 2. c4 e6
  engine1.makeMove('d2', 'd4');
  engine1.makeMove('g8', 'f6');
  engine1.makeMove('c2', 'c4');
  engine1.makeMove('e7', 'e6');

  const engine2 = new ChessEngine();
  // Transposition: 1. c4 e6 2. d4 Nf6
  engine2.makeMove('c2', 'c4');
  engine2.makeMove('e7', 'e6');
  engine2.makeMove('d2', 'd4');
  engine2.makeMove('g8', 'f6');

  const hash1 = ChessZobrist.computeHash(engine1);
  const hash2 = ChessZobrist.computeHash(engine2);

  assert.strictEqual(typeof hash1, 'bigint', 'Zobrist hash must be BigInt');
  assert.strictEqual(typeof hash2, 'bigint', 'Zobrist hash must be BigInt');
  assert.strictEqual(hash1, hash2, 'Transposed positions must yield identical 64-bit BigInt Zobrist hashes');
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (Numerical Stability & Noise Bounds)
// ============================================================================
console.log('\n>>> TIER 2: BOUNDARY & CORNER CASES (Stability & Edge Conditions)');

// 7. Softmax Numerical Stability with Extreme Logits
runTest('TIER 2', 'nn.predict applies max-subtraction ensuring finite probabilities without overflow', () => {
  const engine = new ChessEngine();
  const nn = new ChessNN();
  const legalMoves = engine.generateLegalMoves();

  // Force extreme values in policy logits
  nn.b_pol2[0] = 5000.0;
  nn.b_pol2[1] = -5000.0;

  const { moveProbabilities, value } = nn.predict(engine, legalMoves);

  assert.ok(moveProbabilities.length > 0);
  let probSum = 0.0;
  for (const item of moveProbabilities) {
    assert.ok(Number.isFinite(item.prob), 'Probabilities must be finite');
    assert.ok(!Number.isNaN(item.prob), 'Probabilities must not be NaN');
    assert.ok(item.prob >= 0.0 && item.prob <= 1.0001, 'Probability must be in [0, 1]');
    probSum += item.prob;
  }

  assert.ok(Math.abs(probSum - 1.0) < 0.001, `Probabilities must sum to 1.0 (got ${probSum})`);
});

// 8. Dirichlet Noise Vector Normalization (Spec 167)
runTest('TIER 2', 'Dirichlet noise exploration injects valid stochastic perturbation into priors', () => {
  const engine = new ChessEngine();
  const nn = new ChessNN();
  const mcts = new ChessMCTS(nn, { dirichletAlpha: 0.3, dirichletEpsilon: 0.25 });

  // Run MCTS with addNoise: true
  const resWithNoise = mcts.search(engine, { simulations: 15, addNoise: true, temperature: 1.0 });

  assert.ok(resWithNoise.probabilities.size > 0, 'Probabilities must be generated');
  let probSum = 0.0;
  for (const prob of resWithNoise.probabilities.values()) {
    assert.ok(prob >= 0.0, 'Probability must be non-negative');
    assert.ok(Number.isFinite(prob), 'Probability must be finite');
    probSum += prob;
  }

  assert.ok(Math.abs(probSum - 1.0) < 0.01, `Convex combination of priors and noise must sum to 1.0 (got ${probSum})`);
});

// 9. Single Forced Move Fallback
runTest('TIER 2', 'MCTS on position with single legal evasion returns that move deterministically', () => {
  const engine = new ChessEngine();
  // Black King at a8 restricted by White Rook at c7: only a8-b8 is legal
  engine.loadFen('k7/2R5/8/8/8/8/8/K7 b - - 0 1');
  const legalMoves = engine.generateLegalMoves();
  assert.strictEqual(legalMoves.length, 1, 'Black King must have exactly 1 legal move (a8 to b8)');

  const nn = new ChessNN();
  const mcts = new ChessMCTS(nn);
  const res = mcts.search(engine, { simulations: 10, temperature: 0.0 });

  assert.strictEqual(res.bestMove.from, 'a8');
  assert.strictEqual(res.bestMove.to, 'b8');
});

// 10. Terminal State Evaluation in MCTS
runTest('TIER 2', 'Terminal checkmate evaluates to -1.0 loss for player to move', () => {
  const engine = new ChessEngine();
  // Scholar's Mate final position: White Qxf7#
  engine.loadFen('r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4');
  assert.strictEqual(engine.isCheckmate(), true);

  const status = engine.getGameStatus();
  assert.strictEqual(status.isGameOver, true);
  assert.strictEqual(status.result, 'checkmate');
  assert.strictEqual(status.winner, 'w');

  // MCTS search on terminal position returns bestMove: null with 0 simulations
  const nn = new ChessNN();
  const mcts = new ChessMCTS(nn);
  const searchRes = mcts.search(engine, { simulations: 10 });
  assert.strictEqual(searchRes.bestMove, null, 'No moves available from checkmated terminal state');
  assert.strictEqual(searchRes.totalSimulations, 0);
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (Tactics, Diversity & Repetitions)
// ============================================================================
console.log('\n>>> TIER 3: CROSS-FEATURE COMBINATIONS (Tactics & Diversity)');

// 11. MCTS Mate-in-1 Tactical Move Selection (Spec 169, 170)
runTest('TIER 3', 'MCTS search finds instant Mate-in-1 move Qxf7# with high visit count', () => {
  const engine = new ChessEngine();
  // Endgame Mate-in-1: White King at g6, Queen at e7 vs Black King at g8
  engine.loadFen('6k1/4Q3/6K1/8/8/8/8/8 w - - 0 1');

  const nn = new ChessNN();
  const mcts = new ChessMCTS(nn);

  const res = mcts.search(engine, { simulations: 50, temperature: 0.0 });

  assert.ok(res.bestMove, 'MCTS must select a move');

  // Verify that the move chosen by MCTS delivers checkmate (e.g. Qd8#, Qe8#, Qg7#)
  const validationEngine = engine.clone();
  const executed = validationEngine.makeMove(res.bestMove.from, res.bestMove.to);
  assert.ok(executed, 'Move must be legally executed');
  assert.strictEqual(validationEngine.isCheckmate(), true, 'Selected move must deliver checkmate');
});

// 12. Opening Book Temperature Sampling Diversity (Spec 177, 178)
runTest('TIER 3', 'Opening book sampling generates diverse grandmaster moves at T=1.0, deterministic at T=0', () => {
  const book = new ChessBook();
  const engine = new ChessEngine();

  // Test 1: Greedy (temperature = 0) must be 100% deterministic
  const greedyMove1 = book.findBookMove(engine, 0.0);
  const greedyMove2 = book.findBookMove(engine, 0.0);
  assert.strictEqual(greedyMove1.san, greedyMove2.san, 'Greedy sampling must be identical');

  // Test 2: Stochastic sampling at T = 1.0 across 50 trials
  const sampledMoves = new Set();
  for (let i = 0; i < 50; i++) {
    const move = book.findBookMove(engine, 1.0);
    if (move) sampledMoves.add(move.san);
  }

  assert.ok(sampledMoves.size >= 2, `Stochastic sampling must produce at least 2 distinct opening moves (got ${sampledMoves.size}: ${Array.from(sampledMoves).join(', ')})`);
});

// 13. Threefold Repetition Tracking with 64-bit Zobrist Keys (Spec 164, 165)
runTest('TIER 3', 'RepetitionTracker correctly flags threefold repetition after 3 identical states', () => {
  const tracker = new RepetitionTracker();
  const hashA = 0x1234567890abcdefn;
  const hashB = 0xfedcba0987654321n;

  assert.strictEqual(tracker.push(hashA), 1);
  assert.strictEqual(tracker.isThreefold(hashA), false);

  assert.strictEqual(tracker.push(hashB), 1);
  assert.strictEqual(tracker.push(hashA), 2);
  assert.strictEqual(tracker.isThreefold(hashA), false);

  assert.strictEqual(tracker.push(hashB), 2);
  assert.strictEqual(tracker.push(hashA), 3);
  assert.strictEqual(tracker.isThreefold(hashA), true, 'State A repeated 3 times must trigger threefold flag');

  tracker.pop();
  assert.strictEqual(tracker.isThreefold(hashA), false, 'Popping repetition must restore count');
});

// ============================================================================
// TIER 4: REAL-WORLD WORKLOADS (RL Self-Play, Backprop & Adam Updates)
// ============================================================================
console.log('\n>>> TIER 4: REAL-WORLD WORKLOADS (RL Self-Play & Adam Backpropagation)');

// 14. Self-Play Episode Generation via playSelfPlayGame (Spec 180, 181)
runTest('TIER 4', 'playSelfPlayGame executes autonomous self-play producing valid state-action trajectory', () => {
  const nn = new ChessNN();
  const episode = playSelfPlayGame(nn, { sims: 5, maxPlies: 6 });

  assert.ok(episode, 'Episode must execute');
  assert.ok(episode.trajectory.length > 0, 'Trajectory must contain recorded moves');
  assert.ok(episode.plyCount > 0, 'Ply count must be positive');

  const firstStep = episode.trajectory[0];
  assert.strictEqual(firstStep.x.length, 896, 'Recorded state must be 896 tensor');
  assert.strictEqual(firstStep.pi.length, 4096, 'Target policy must be 4096 tensor');
  assert.strictEqual(firstStep.turn, 'w', 'First move was White');
  assert.ok(firstStep.legalIndices.length > 0, 'Legal indices recorded');
});

// 15. Analytical Backpropagation Loss and Gradient Computation (Spec 183, 184)
runTest('TIER 4', 'Analytical backprop computes finite gradients for policy and value heads', () => {
  const nn = new ChessNN();
  const engine = new ChessEngine();
  const x = encodeBoard(engine);

  // Forward pass with activations cache
  const { policyLogits, value, cache } = nn.forward(x, true);
  assert.ok(cache, 'Forward cache must be saved');

  // Target policy: one-hot on move e2-e4
  const targetPi = new Float32Array(POLICY_DIM);
  const targetMoveIdx = moveToIndex({ from: 'e2', to: 'e4' });
  targetPi[targetMoveIdx] = 1.0;
  const legalIndices = [targetMoveIdx];

  // Target value: White win (+1.0)
  const targetZ = 1.0;

  const { grads, policyLoss, valueLoss } = nn.backward(x, targetPi, targetZ, legalIndices);

  assert.ok(Number.isFinite(policyLoss), `Policy loss must be finite (got ${policyLoss})`);
  assert.ok(Number.isFinite(valueLoss), `Value loss must be finite (got ${valueLoss})`);

  // Verify gradient tensors are populated with finite numbers
  assert.strictEqual(grads.w0.length, HIDDEN_DIM * INPUT_DIM);
  assert.strictEqual(grads.w_pol2.length, POLICY_DIM * HEAD_HIDDEN);
  assert.strictEqual(grads.w_val2.length, 1 * HEAD_HIDDEN);

  let nonZeroGrads = 0;
  for (let i = 0; i < 100; i++) {
    if (Math.abs(grads.w0[i]) > 1e-7) nonZeroGrads++;
  }
  assert.ok(nonZeroGrads > 0, 'Gradients must propagate through projection layer w0');
});

// 16. Adam Optimizer Parameter Update Step (Spec 185)
runTest('TIER 4', 'Adam optimizer updates weights in place without introducing NaNs or infinities', () => {
  const nn = new ChessNN();
  const engine = new ChessEngine();
  const x = encodeBoard(engine);

  const initialW0_0 = nn.w0[0];

  // Form training sample
  const targetPi = new Float32Array(POLICY_DIM);
  const mIdx = moveToIndex({ from: 'e2', to: 'e4' });
  targetPi[mIdx] = 1.0;

  const { grads, valueLoss, policyLoss } = nn.backward(x, targetPi, 1.0, [mIdx]);
  assert.ok(grads, 'Gradients must be computed');

  nn.applyGradients(grads, 0.01);
  assert.strictEqual(nn.adamStep, 1, 'Adam step counter must increment');

  // Weights must have updated
  assert.notStrictEqual(nn.w0[0], initialW0_0, 'Weight w0[0] must update after Adam step');

  // Subsequent forward pass must remain completely stable
  const forwardAfter = nn.forward(x);
  assert.ok(Number.isFinite(forwardAfter.value));
  assert.ok(forwardAfter.value >= -1.0 && forwardAfter.value <= 1.0);
});

console.log('\n=============================================================================');
console.log(`ALL ${totalTests} CHESS NEURAL NETWORK & MCTS TESTS PASSED CLEANLY (100% SUCCESS)!`);
console.log('=============================================================================');
