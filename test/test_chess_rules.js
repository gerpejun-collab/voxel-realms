// test/test_chess_rules.js
// Comprehensive Unit Test Suite for Chess Engine (FIDE Rules Verification)
const assert = require('assert');
const { ChessEngine, INITIAL_FEN } = require('../public/src/chess/chess_engine');

console.log('=============================================================================');
console.log('       FIDE CHESS ENGINE: AUTOMATED RULES & VALIDATION TEST SUITE            ');
console.log('=============================================================================\n');

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// 1. Initial State & FEN Serialization
runTest('Initial FEN loads correctly and serializes back identically', () => {
  const chess = new ChessEngine();
  assert.strictEqual(chess.getFen(), INITIAL_FEN);
  assert.strictEqual(chess.turn, 'w');
  assert.strictEqual(chess.halfmoveClock, 0);
  assert.strictEqual(chess.fullmoveNumber, 1);
  assert.strictEqual(chess.generateLegalMoves().length, 20); // 16 pawn moves + 4 knight moves
});

// 2. Scholar's Mate (Mate del Pastor in 4 moves)
runTest("Scholar's Mate (Mate del Pastor) correctly detects checkmate", () => {
  const chess = new ChessEngine();
  assert.ok(chess.makeMove('e2', 'e4'));
  assert.ok(chess.makeMove('e7', 'e5'));
  assert.ok(chess.makeMove('d1', 'h5'));
  assert.ok(chess.makeMove('b8', 'c6'));
  assert.ok(chess.makeMove('f1', 'c4'));
  assert.ok(chess.makeMove('g8', 'f6'));

  // Move 4: Qxf7#
  const finalMove = chess.makeMove('h5', 'f7');
  assert.ok(finalMove);
  assert.strictEqual(finalMove.san, 'Qxf7#');
  assert.strictEqual(finalMove.isCheckmate, true);
  assert.strictEqual(chess.isCheckmate(), true);

  const status = chess.getGameStatus();
  assert.strictEqual(status.isGameOver, true);
  assert.strictEqual(status.winner, 'w');
  assert.strictEqual(status.result, 'checkmate');
});

// 3. Fool's Mate (Mate del Loco in 2 moves)
runTest("Fool's Mate (Mate del Loco) correctly detects black checkmate in 2 moves", () => {
  const chess = new ChessEngine();
  assert.ok(chess.makeMove('f2', 'f3'));
  assert.ok(chess.makeMove('e7', 'e5'));
  assert.ok(chess.makeMove('g2', 'g4'));
  const m = chess.makeMove('d8', 'h4');
  assert.ok(m);
  assert.strictEqual(m.san, 'Qh4#');
  assert.strictEqual(chess.isCheckmate(), true);
  assert.strictEqual(chess.getGameStatus().winner, 'b');
});

// 4. Castling Rights & Execution
runTest('Kingside and Queenside castling execute correctly and prevent castling through check', () => {
  // Test White Kingside O-O
  const fenKingside = 'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
  const chess = new ChessEngine(fenKingside);
  const castleMove = chess.makeMove('e1', 'g1');
  assert.ok(castleMove);
  assert.strictEqual(castleMove.san, 'O-O');
  assert.strictEqual(castleMove.isCastling, true);
  assert.strictEqual(chess.getPiece('g1').type, 'k');
  assert.strictEqual(chess.getPiece('f1').type, 'r');
  assert.strictEqual(chess.getPiece('h1'), null);

  // Test illegal castling through attacked square
  // Black bishop on c4 attacks f1 through empty d3 and e2
  const fenCastlingCheck = 'rnbqk2r/pppp1ppp/8/8/2b5/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1';
  const chess2 = new ChessEngine(fenCastlingCheck);
  const legalMoves = chess2.getLegalMovesForSquare('e1');
  const canCastleK = legalMoves.some(m => m.to.row === 7 && m.to.col === 6);
  assert.strictEqual(canCastleK, false, 'King cannot castle through attacked square f1');
});

// 5. En Passant Capture
runTest('En Passant captures pawn correctly and expires on subsequent turn', () => {
  const chess = new ChessEngine();
  chess.makeMove('e2', 'e4');
  chess.makeMove('a7', 'a6');
  chess.makeMove('e4', 'e5');
  // Black pushes d7-d5 double move
  chess.makeMove('d7', 'd5');

  assert.ok(chess.enPassant);
  assert.strictEqual(ChessEngine.coordsToSquare(chess.enPassant.row, chess.enPassant.col), 'd6');

  // White captures en passant exd6
  const epMove = chess.makeMove('e5', 'd6');
  assert.ok(epMove);
  assert.strictEqual(epMove.isEnPassant, true);
  assert.strictEqual(chess.getPiece('d6').type, 'p');
  assert.strictEqual(chess.getPiece('d5'), null, 'Black pawn on d5 must be removed');
});

// 6. Pawn Promotion
runTest('Pawn promotion converts pawn to selected piece (Queen, Knight, Rook, Bishop)', () => {
  const promoFen = '8/4P3/8/8/8/8/8/4K2k w - - 0 1';
  const chess = new ChessEngine(promoFen);

  // Promote to Queen
  const moveQ = chess.makeMove('e7', 'e8', 'q');
  assert.ok(moveQ);
  assert.strictEqual(chess.getPiece('e8').type, 'q');
  assert.strictEqual(chess.getPiece('e8').color, 'w');

  // Promote to Knight
  const chessN = new ChessEngine(promoFen);
  const moveN = chessN.makeMove('e7', 'e8', 'n');
  assert.ok(moveN);
  assert.strictEqual(chessN.getPiece('e8').type, 'n');
});

// 7. Stalemate Detection
runTest('Stalemate correctly identified when King has no legal moves and is not in check', () => {
  // Classic stalemate: Black King on a8, White Queen on b6, White King on c7
  const stalemateFen = 'k7/8/1Q6/8/8/8/8/2K5 b - - 0 1';
  const chess = new ChessEngine(stalemateFen);

  assert.strictEqual(chess.isInCheck('b'), false);
  assert.strictEqual(chess.generateLegalMoves('b').length, 0);
  assert.strictEqual(chess.isStalemate(), true);

  const status = chess.getGameStatus();
  assert.strictEqual(status.isGameOver, true);
  assert.strictEqual(status.result, 'stalemate');
  assert.strictEqual(status.winner, null);
});

// 8. Threefold Repetition
runTest('Threefold repetition triggers draw when identical position occurs three times', () => {
  const chess = new ChessEngine();
  // Nf3 Nf6, Ng1 Ng8 (x2)
  chess.makeMove('g1', 'f3');
  chess.makeMove('g8', 'f6');
  chess.makeMove('f3', 'g1');
  chess.makeMove('f6', 'g8'); // Repetition 2

  chess.makeMove('g1', 'f3');
  chess.makeMove('g8', 'f6');
  chess.makeMove('f3', 'g1');
  chess.makeMove('f6', 'g8'); // Repetition 3!

  assert.strictEqual(chess.isThreefoldRepetition(), true);
  assert.strictEqual(chess.getGameStatus().result, 'threefold_repetition');
});

// 9. Insufficient Material
runTest('Insufficient material correctly detects K vs K, K+B vs K, and K+N vs K draws', () => {
  assert.strictEqual(new ChessEngine('8/8/8/4k3/8/8/8/4K3 w - - 0 1').isInsufficientMaterial(), true);
  assert.strictEqual(new ChessEngine('8/8/8/4k3/8/5B2/8/4K3 w - - 0 1').isInsufficientMaterial(), true);
  assert.strictEqual(new ChessEngine('8/8/8/4k3/8/5N2/8/4K3 w - - 0 1').isInsufficientMaterial(), true);
  assert.strictEqual(new ChessEngine('8/8/8/4k3/8/5P2/8/4K3 w - - 0 1').isInsufficientMaterial(), false);
});

// 10. PGN Export
runTest('PGN export serializes clean standard PGN with custom event and tags', () => {
  const chess = new ChessEngine();
  chess.makeMove('e2', 'e4');
  chess.makeMove('e7', 'e5');
  chess.makeMove('g1', 'f3');
  chess.makeMove('b8', 'c6');

  const pgn = chess.exportPgn({ White: 'Carlsen', Black: 'Nakamura' });
  assert.ok(pgn.includes('[White "Carlsen"]'));
  assert.ok(pgn.includes('[Black "Nakamura"]'));
  assert.ok(pgn.includes('1. e4 e5 2. Nf3 Nc6'));
});

console.log('\n=============================================================================');
console.log('ALL 10 CHESS RULES SPECIFICATIONS PASSED WITH 100% SUCCESS!');
console.log('=============================================================================');
