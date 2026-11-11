// test/test_chess_mcts.js
// Automated verification suite for AlphaZero-Style Monte Carlo Tree Search
// Conforms to Specifications 166-173 & 196 of CHESS_200_SPEC_PLAN.md.

import assert from 'assert';
import fs from 'fs';
import { ChessEngine } from '../public/src/chess/chess_engine.js';
import { ChessMCTS, MCTSNode } from '../public/src/chess/chess_mcts.js';
import { ChessNN } from '../public/src/chess/chess_nn.js';

console.log('Testing ChessMCTS (Monte Carlo Tree Search with PUCT)...');

async function runTests() {
  const weightsPath = new URL('../public/src/chess/chess_model_weights.json', import.meta.url);
  const weightsData = fs.existsSync(weightsPath) ? JSON.parse(fs.readFileSync(weightsPath, 'utf8')) : null;
  const nn = new ChessNN(weightsData);
  const mcts = new ChessMCTS(nn, { cpuct: 1.414 });

  // Test 1: Node Representation & PUCT Calculation
  console.log('Test 1: MCTS Node Representation & PUCT Formula...');
  const root = new MCTSNode(null, null, 1.0);
  const child1 = root.addChild({ from: 'e2', to: 'e4' }, 0.6);
  const child2 = root.addChild({ from: 'd2', to: 'd4' }, 0.4);

  assert.strictEqual(root.children.size, 2, 'Root should have 2 children');
  assert.strictEqual(child1.prior, 0.6, 'Child prior matches');

  // Verify PUCT formula: Q + cpuct * P * sqrt(parentN) / (1 + childN)
  root.visitCount = 10;
  child1.visitCount = 5;
  child1.totalValue = 2.5;
  child1.meanValue = 0.5;

  const expectedPUCT = 0.5 + 1.414 * 0.6 * (Math.sqrt(10) / (1 + 5));
  const computedPUCT = child1.computePUCT(1.414, 10);
  assert(Math.abs(computedPUCT - expectedPUCT) < 1e-4, 'PUCT computation must match theoretical formula');
  console.log(`✓ PUCT Formula verified: computed=${computedPUCT.toFixed(4)}, expected=${expectedPUCT.toFixed(4)}.`);

  // Test 2: Search from Initial Position
  console.log('Test 2: Search on Initial Board Setup...');
  const engine = new ChessEngine();
  const searchResult = mcts.search(engine, { simulations: 50, temperature: 0.0 });

  assert(searchResult.bestMove !== null, 'Search must return best move');
  assert(searchResult.bestMove.from && searchResult.bestMove.to, 'Best move must have from/to');
  assert(searchResult.visitCounts.size > 0, 'Must have recorded child visits');
  assert.strictEqual(searchResult.totalSimulations, 50, 'Total simulations should match budget');
  console.log(`✓ Initial position MCTS search selected: ${searchResult.bestMove.from} -> ${searchResult.bestMove.to}`);

  // Test 3: Tactical Win / Hanging Piece or Mate in 1
  console.log('Test 3: Tactical Mate-in-1 Detection...');
  // Scholar's Mate position: White queen at h5, White bishop at c4, Black king at e8, pawns at e5, d6
  const mateEngine = new ChessEngine();
  mateEngine.makeMove('e2', 'e4');
  mateEngine.makeMove('e7', 'e5');
  mateEngine.makeMove('d1', 'h5');
  mateEngine.makeMove('b8', 'c6');
  mateEngine.makeMove('f1', 'c4');
  mateEngine.makeMove('g8', 'f6'); // Black blunders: Qxf7# is immediate mate

  // White to move: MCTS should find Qxf7#
  const tacticalResult = mcts.search(mateEngine, { simulations: 150, temperature: 0.0 });
  assert.strictEqual(tacticalResult.bestMove.from, 'h5', 'From square must be h5');
  assert.strictEqual(tacticalResult.bestMove.to, 'f7', 'To square must be f7');
  console.log(`✓ Tactical Mate in 1 successfully solved: ${tacticalResult.bestMove.from} -> ${tacticalResult.bestMove.to}#`);

  // Test 4: Temperature-controlled Exploration
  console.log('Test 4: Temperature-Controlled Move Sampling...');
  const multiEngine = new ChessEngine();
  const seenMoves = new Set();
  let trialsRun = 0;
  for (let i = 0; i < 40; i++) {
    trialsRun++;
    const res = mcts.search(multiEngine, { simulations: 30, temperature: 1.0 });
    seenMoves.add(`${res.bestMove.from}-${res.bestMove.to}`);
    if (seenMoves.size >= 2) break;
  }
  assert(seenMoves.size >= 2, `Expected at least 2 distinct opening moves with tau=1.0, got ${seenMoves.size}`);
  console.log(`✓ Temperature sampling generated ${seenMoves.size} distinct moves across ${trialsRun} trials.`);

  console.log('\nALL CHESS MCTS TESTS PASSED!');
}

runTests().catch(err => {
  console.error('Chess MCTS Test Failed:', err);
  process.exit(1);
});
