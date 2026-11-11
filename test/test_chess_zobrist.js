// test/test_chess_zobrist.js
// Automated verification suite for 64-Bit BigInt Zobrist Hashing & Transposition Table
// Conforms to Specifications 162-165 of CHESS_200_SPEC_PLAN.md.

import assert from 'assert';
import { ChessEngine } from '../public/src/chess/chess_engine.js';
import { ChessZobrist, TranspositionTable, RepetitionTracker, TT_FLAG } from '../public/src/chess/chess_zobrist.js';

console.log('Testing ChessZobrist & TranspositionTable...');

async function runTests() {
  const engine = new ChessEngine();

  // Test 1: 64-bit BigInt Keys Generation & Determinism
  console.log('Test 1: 64-Bit BigInt Key Properties...');
  const hash1 = ChessZobrist.computeHash(engine);
  assert(typeof hash1 === 'bigint', 'Hash must be BigInt');
  assert(hash1 > 0n, 'Initial position hash must be non-zero');

  // Verify determinism across new engine instances
  const engine2 = new ChessEngine();
  const hash2 = ChessZobrist.computeHash(engine2);
  assert.strictEqual(hash1, hash2, 'Identical positions must produce identical Zobrist hashes');
  console.log(`✓ Initial board 64-bit hash: 0x${hash1.toString(16)}n`);

  // Test 2: Incremental Hash Update vs Full Recomputation
  console.log('Test 2: Incremental Hash vs Full Recomputation...');
  const moves = [
    { from: 'e2', to: 'e4' },
    { from: 'c7', to: 'c5' },
    { from: 'g1', to: 'f3' },
    { from: 'd7', to: 'd6' },
    { from: 'd2', to: 'd4' },
    { from: 'c5', to: 'd4' }
  ];

  for (const m of moves) {
    const prevCastling = { ...engine.castling };
    const prevEp = engine.enPassant ? { ...engine.enPassant } : null;
    const hashBefore = ChessZobrist.computeHash(engine);

    const executed = engine.makeMove(m.from, m.to);
    assert(executed, `Move ${m.from}-${m.to} must be legal`);

    const nextCastling = { ...engine.castling };
    const nextEp = engine.enPassant ? { ...engine.enPassant } : null;

    const incrementalHash = ChessZobrist.updateHash(
      hashBefore,
      executed,
      prevCastling,
      nextCastling,
      prevEp,
      nextEp
    );

    const recomputedHash = ChessZobrist.computeHash(engine);
    assert.strictEqual(
      incrementalHash,
      recomputedHash,
      `Incremental hash must match recomputed hash after ${executed.san}`
    );
  }
  console.log('✓ Incremental hash updates verified over multiple plies.');

  // Test 3: Transposition Table Replacement & Flag Verification
  console.log('Test 3: Transposition Table Sizing, Storage & Retrieval...');
  const tt = new TranspositionTable(10); // 1024 slots for testing

  const mockHash = 0x123456789abcdef0n;
  const mockMove = { from: 'e2', to: 'e4' };

  tt.set(mockHash, 4, 150, TT_FLAG.EXACT, mockMove);
  const entry = tt.get(mockHash);

  assert(entry !== null, 'Transposition table must find stored entry');
  assert.strictEqual(entry.depth, 4, 'Depth must match stored value');
  assert.strictEqual(entry.score, 150, 'Score must match stored value');
  assert.strictEqual(entry.flag, TT_FLAG.EXACT, 'Flag must match EXACT');
  assert.strictEqual(entry.bestMove.from, 'e2', 'Best move must match');

  // Verify non-existent hash returns null
  assert.strictEqual(tt.get(0x9999999999999999n), null, 'Unseen hash must return null');
  console.log('✓ Transposition Table get/set verified.');

  // Test 4: Threefold Repetition Tracker
  console.log('Test 4: Threefold Repetition Cache...');
  const repTracker = new RepetitionTracker();
  const posHash = ChessZobrist.computeHash(engine);

  repTracker.push(posHash);
  assert(!repTracker.isThreefold(posHash), 'Should not be threefold on 1st occurrence');
  repTracker.push(posHash);
  assert(!repTracker.isThreefold(posHash), 'Should not be threefold on 2nd occurrence');
  repTracker.push(posHash);
  assert(repTracker.isThreefold(posHash), 'Must detect threefold on 3rd occurrence');

  repTracker.pop();
  assert(!repTracker.isThreefold(posHash), 'Must clear threefold after pop');
  console.log('✓ Repetition tracker successfully detected threefold repetition.');

  console.log('\nALL CHESS ZOBRIST TESTS PASSED!');
}

runTests().catch(err => {
  console.error('Chess Zobrist Test Failed:', err);
  process.exit(1);
});
