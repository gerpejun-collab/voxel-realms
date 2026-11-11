// test/test_chess_book.js
// Automated verification suite for Grandmaster Opening Book
// Conforms to Specifications 174-179 & 197 of CHESS_200_SPEC_PLAN.md.

import assert from 'assert';
import { ChessEngine } from '../public/src/chess/chess_engine.js';
import { ChessBook } from '../public/src/chess/chess_book.js';

console.log('Testing ChessBook (Grandmaster Opening Book)...');

async function runTests() {
  const book = new ChessBook();

  // Test 1: Book Size Requirement (Must have >= 1,200 distinct GM positions)
  console.log('Test 1: Opening Book Size Verification...');
  console.log(`Total indexed positions in opening book: ${book.size}`);
  assert(book.size >= 1200, `Book must contain at least 1,200 positions (got ${book.size})`);
  console.log(`✓ 1,200+ requirement satisfied: ${book.size} positions.`);

  // Test 2: Initial Position Standard Openings
  console.log('Test 2: Initial Position Candidate Retrieval...');
  const engine = new ChessEngine();
  const candidates = book.getCandidates(engine);
  assert(candidates && candidates.length >= 4, 'Initial position must have at least 4 opening moves');

  const movesList = candidates.map(c => `${c.from}${c.to}`);
  assert(movesList.includes('e2e4'), 'Initial position must include 1.e4');
  assert(movesList.includes('d2d4'), 'Initial position must include 1.d4');
  assert(movesList.includes('c2c4'), 'Initial position must include 1.c4');
  assert(movesList.includes('g1f3'), 'Initial position must include 1.Nf3');
  console.log('✓ Initial position features classical GM moves:', movesList.join(', '));

  // Test 3: Opening Diversity Across 50 Iterations
  console.log('Test 3: Non-Repetitive Weighted Sampling...');
  const sampledMoves = new Set();
  for (let i = 0; i < 50; i++) {
    const move = book.findBookMove(engine, 1.0);
    assert(move !== null, 'Must sample a valid move');
    sampledMoves.add(`${move.from}${move.to}`);
  }
  assert(sampledMoves.size >= 3, `Expected at least 3 distinct opening moves from start position, got ${sampledMoves.size}`);
  console.log(`✓ Diverse opening sampling: generated ${sampledMoves.size} distinct opening moves across 50 trials.`);

  // Test 4: Specific Opening Systems & ECO Classification
  console.log('Test 4: ECO System Retrieval Across Volumes A-E...');
  // 1. e4 c5 -> Sicilian (B20)
  const sicilianEngine = new ChessEngine();
  sicilianEngine.makeMove('e2', 'e4');
  sicilianEngine.makeMove('c7', 'c5');
  const sicInfo = book.getOpeningInfo(sicilianEngine);
  assert(sicInfo && sicInfo.eco.startsWith('B'), `Sicilian must map to ECO Bxx (got ${sicInfo ? sicInfo.eco : 'null'})`);
  console.log(`✓ 1.e4 c5 classified as: [${sicInfo.eco}] ${sicInfo.name}`);

  // 1. e4 e5 2. Nf3 Nc6 3. Bb5 -> Ruy Lopez (C60-C99)
  const ruyEngine = new ChessEngine();
  ruyEngine.makeMove('e2', 'e4');
  ruyEngine.makeMove('e7', 'e5');
  ruyEngine.makeMove('g1', 'f3');
  ruyEngine.makeMove('b8', 'c6');
  ruyEngine.makeMove('f1', 'b5');
  const ruyInfo = book.getOpeningInfo(ruyEngine);
  assert(ruyInfo && ruyInfo.eco.startsWith('C'), `Ruy Lopez must map to ECO Cxx (got ${ruyInfo ? ruyInfo.eco : 'null'})`);
  console.log(`✓ Ruy Lopez classified as: [${ruyInfo.eco}] ${ruyInfo.name}`);

  // 1. d4 d5 2. c4 -> Queen's Gambit (D06)
  const qgEngine = new ChessEngine();
  qgEngine.makeMove('d2', 'd4');
  qgEngine.makeMove('d7', 'd5');
  qgEngine.makeMove('c2', 'c4');
  const qgInfo = book.getOpeningInfo(qgEngine);
  assert(qgInfo && qgInfo.eco.startsWith('D'), `Queen's Gambit must map to ECO Dxx (got ${qgInfo ? qgInfo.eco : 'null'})`);
  console.log(`✓ Queen's Gambit classified as: [${qgInfo.eco}] ${qgInfo.name}`);

  // 1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 -> King's Indian (E60/E97)
  const kidEngine = new ChessEngine();
  kidEngine.makeMove('d2', 'd4');
  kidEngine.makeMove('g8', 'f6');
  kidEngine.makeMove('c2', 'c4');
  kidEngine.makeMove('g7', 'g6');
  kidEngine.makeMove('b1', 'c3');
  kidEngine.makeMove('f8', 'g7');
  kidEngine.makeMove('e2', 'e4');
  kidEngine.makeMove('d7', 'd6');
  const kidInfo = book.getOpeningInfo(kidEngine);
  assert(kidInfo && kidInfo.eco.startsWith('E'), `King's Indian must map to ECO Exx (got ${kidInfo ? kidInfo.eco : 'null'})`);
  console.log(`✓ King's Indian classified as: [${kidInfo.eco}] ${kidInfo.name}`);

  // 1. c4 -> English (A10)
  const engEngine = new ChessEngine();
  engEngine.makeMove('c2', 'c4');
  const engInfo = book.getOpeningInfo(engEngine);
  assert(engInfo && engInfo.eco.startsWith('A'), `English Opening must map to ECO Axx (got ${engInfo ? engInfo.eco : 'null'})`);
  console.log(`✓ English Opening classified as: [${engInfo.eco}] ${engInfo.name}`);

  // Test 5: Out of Book Seamless Handover
  console.log('Test 5: Out-of-Book Graceful Fallback...');
  const oddEngine = new ChessEngine();
  oddEngine.makeMove('a2', 'a4');
  oddEngine.makeMove('h7', 'h5');
  oddEngine.makeMove('h2', 'h4');
  oddEngine.makeMove('a7', 'a5');
  const oddCandidate = book.findBookMove(oddEngine);
  assert.strictEqual(oddCandidate, null, 'Non-theoretical moves must return null for engine handover');
  console.log('✓ Out-of-book position correctly returned null.');

  console.log('\nALL CHESS BOOK TESTS PASSED!');
}

runTests().catch(err => {
  console.error('Chess Book Test Failed:', err);
  process.exit(1);
});
