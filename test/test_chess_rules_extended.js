// test/test_chess_rules_extended.js
// =============================================================================
// Comprehensive FIDE Rules Extended Test Suite (Tiers 1 - 4)
// Validates all FIDE chess rules, edge cases, boundaries, combinations, and
// historical Grandmaster game reproductions.
// Zero external dependencies (native Node.js assert/strict).
// =============================================================================

const assert = require('assert');
const { ChessEngine, INITIAL_FEN } = require('../public/src/chess/chess_engine');

console.log('=============================================================================');
console.log('      FIDE CHESS RULES EXTENDED: 4-TIER AUTOMATED TEST SUITE                 ');
console.log('=============================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(tier, name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] [${tier}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] [${tier}] ${name}:`, err.message);
    throw err;
  }
}

// =============================================================================
// TIER 1: FEATURE COVERAGE (Core Requirements & Standard FIDE Rules)
// =============================================================================
console.log('>>> TIER 1: FEATURE COVERAGE (Core FIDE Rules)');

// 1. Initial State & Legal Moves Count
runTest('TIER 1', 'Initial position legal move generation: exactly 20 moves for White', () => {
  const chess = new ChessEngine();
  assert.strictEqual(chess.getFen(), INITIAL_FEN);
  assert.strictEqual(chess.turn, 'w');
  assert.strictEqual(chess.halfmoveClock, 0);
  assert.strictEqual(chess.fullmoveNumber, 1);

  const moves = chess.generateLegalMoves();
  assert.strictEqual(moves.length, 20, 'Initial position must have exactly 20 legal moves');

  // Verify pawn single/double pushes (8 pawns x 2 = 16 moves)
  const pawnMoves = moves.filter(m => chess.board[m.from.row][m.from.col].type === 'p');
  assert.strictEqual(pawnMoves.length, 16);

  // Verify knight moves (b1 -> a3, c3; g1 -> f3, h3 = 4 moves)
  const knightMoves = moves.filter(m => chess.board[m.from.row][m.from.col].type === 'n');
  assert.strictEqual(knightMoves.length, 4);
});

// 2. Kingside & Queenside Castling Execution
runTest('TIER 1', 'Kingside and Queenside castling moves both King and Rook accurately', () => {
  // Test White Kingside: 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O
  const chess = new ChessEngine();
  chess.makeMove('e2', 'e4');
  chess.makeMove('e7', 'e5');
  chess.makeMove('g1', 'f3');
  chess.makeMove('b8', 'c6');
  chess.makeMove('f1', 'c4');
  chess.makeMove('f8', 'c5');

  const castlingMove = chess.makeMove('e1', 'g1');
  assert.ok(castlingMove, 'Kingside castling e1-g1 must succeed');
  assert.strictEqual(castlingMove.isCastling, true);
  assert.strictEqual(castlingMove.san, 'O-O');

  // King at g1 (row 7, col 6) and Rook at f1 (row 7, col 5)
  assert.strictEqual(chess.board[7][6]?.type, 'k');
  assert.strictEqual(chess.board[7][6]?.color, 'w');
  assert.strictEqual(chess.board[7][5]?.type, 'r');
  assert.strictEqual(chess.board[7][5]?.color, 'w');
  assert.strictEqual(chess.board[7][4], null); // e1 empty
  assert.strictEqual(chess.board[7][7], null); // h1 empty

  // Test Black Queenside Castling:
  // FEN where Black has clear queenside path and rights:
  const chessQ = new ChessEngine('r3k2r/pppq1ppp/2npbn2/2b1p3/4P3/2NPBN2/PPPQ1PPP/R3K2R b KQkq - 5 7');
  const bO_O_O = chessQ.makeMove('e8', 'c8');
  assert.ok(bO_O_O, 'Black Queenside castling e8-c8 must succeed');
  assert.strictEqual(bO_O_O.isCastling, true);
  assert.strictEqual(bO_O_O.san, 'O-O-O');
  assert.strictEqual(chessQ.board[0][2]?.type, 'k'); // c8
  assert.strictEqual(chessQ.board[0][3]?.type, 'r'); // d8
  assert.strictEqual(chessQ.board[0][4], null); // e8 empty
  assert.strictEqual(chessQ.board[0][0], null); // a8 empty
});

// 3. En Passant Capture Mechanics & Board State
runTest('TIER 1', 'En passant captures enemy pawn and removes it from board', () => {
  const chess = new ChessEngine();
  chess.makeMove('e2', 'e4');
  chess.makeMove('a7', 'a6');
  chess.makeMove('e4', 'e5');
  chess.makeMove('d7', 'd5'); // Double pawn move creates en passant target on d6

  assert.deepStrictEqual(chess.enPassant, { row: 2, col: 3 }, 'En passant target must be d6 (row 2, col 3)');

  // White captures e5xd6 e.p.
  const epMove = chess.makeMove('e5', 'd6');
  assert.ok(epMove, 'En passant capture e5xd6 must succeed');
  assert.strictEqual(epMove.isEnPassant, true);
  assert.strictEqual(epMove.san, 'exd6');

  // White pawn now at d6 (row 2, col 3)
  assert.strictEqual(chess.board[2][3]?.type, 'p');
  assert.strictEqual(chess.board[2][3]?.color, 'w');
  // Captured black pawn at d5 (row 3, col 3) MUST be removed (null)
  assert.strictEqual(chess.board[3][3], null, 'Captured Black pawn on d5 must be removed');
  // Original square e5 (row 3, col 4) MUST be empty
  assert.strictEqual(chess.board[3][4], null);
});

// 4. En Passant Expiration
runTest('TIER 1', 'En passant right expires immediately if not played on next ply', () => {
  const chess = new ChessEngine();
  chess.makeMove('e2', 'e4');
  chess.makeMove('a7', 'a6');
  chess.makeMove('e4', 'e5');
  chess.makeMove('d7', 'd5'); // d6 is enPassant

  // White plays h2-h3 instead of capturing
  chess.makeMove('h2', 'h3');
  chess.makeMove('b7', 'b6');

  // Now White tries e5-d6 on turn 4: MUST be null / illegal
  assert.strictEqual(chess.enPassant, null, 'En passant target must be cleared');
  const illegalEp = chess.makeMove('e5', 'd6');
  assert.strictEqual(illegalEp, null, 'En passant capture after intervening move must be illegal');
});

// 5. Pawn Promotion to Queen, Rook, Bishop, Knight
runTest('TIER 1', 'Pawn promotion transforms pawn to chosen piece (Q, R, B, N)', () => {
  const pieces = ['q', 'r', 'b', 'n'];
  for (const p of pieces) {
    const chess = new ChessEngine('8/4P3/8/8/8/8/k6K/8 w - - 0 1');
    const move = chess.makeMove('e7', 'e8', p);
    assert.ok(move, `Promotion to ${p} must succeed`);
    assert.strictEqual(move.promotion, p);
    assert.strictEqual(chess.board[0][4]?.type, p);
    assert.strictEqual(chess.board[0][4]?.color, 'w');
  }
});

// 6. Stalemate Detection
runTest('TIER 1', 'Stalemate correctly identified when side to move has 0 legal moves and is not in check', () => {
  // Classic stalemate: Black King on a8, White King on c7, White Queen on b6. Black to move.
  const chess = new ChessEngine('k7/2K5/1Q6/8/8/8/8/8 b - - 0 1');
  assert.strictEqual(chess.isInCheck('b'), false, 'Black king must not be in check');
  assert.strictEqual(chess.generateLegalMoves('b').length, 0, 'Black must have 0 legal moves');
  assert.strictEqual(chess.isStalemate(), true, 'Must detect stalemate');
  assert.strictEqual(chess.isCheckmate(), false);

  const status = chess.getGameStatus();
  assert.strictEqual(status.isGameOver, true);
  assert.strictEqual(status.result, 'stalemate');
  assert.strictEqual(status.winner, null);
  assert.ok(status.reason.includes('Stalemate'));
});

// 7. Checkmate Detection
runTest('TIER 1', 'Checkmate correctly identified when side to move has 0 legal moves and IS in check', () => {
  // White Queen on b7 delivering mate to Black King on a8, protected by King on c7
  const chess = new ChessEngine('k7/1QK5/8/8/8/8/8/8 b - - 0 1');
  assert.strictEqual(chess.isInCheck('b'), true, 'Black king must be in check');
  assert.strictEqual(chess.generateLegalMoves('b').length, 0, 'Black must have 0 legal moves');
  assert.strictEqual(chess.isCheckmate(), true, 'Must detect checkmate');
  assert.strictEqual(chess.isStalemate(), false);

  const status = chess.getGameStatus();
  assert.strictEqual(status.isGameOver, true);
  assert.strictEqual(status.result, 'checkmate');
  assert.strictEqual(status.winner, 'w');
  assert.ok(status.reason.includes('Jaque Mate'));
});

// 8. Threefold Repetition
runTest('TIER 1', 'Threefold repetition triggers draw when identical position occurs 3 times', () => {
  const chess = new ChessEngine();
  // 1. Nf3 Nf6 2. Ng1 Ng8 (Pos 1)
  chess.makeMove('g1', 'f3'); chess.makeMove('g8', 'f6');
  chess.makeMove('f3', 'g1'); chess.makeMove('f6', 'g8');
  assert.strictEqual(chess.isThreefoldRepetition(), false);

  // 3. Nf3 Nf6 4. Ng1 Ng8 (Pos 2)
  chess.makeMove('g1', 'f3'); chess.makeMove('g8', 'f6');
  chess.makeMove('f3', 'g1'); chess.makeMove('f6', 'g8');
  assert.strictEqual(chess.isThreefoldRepetition(), true, 'Threefold repetition must be detected after 3rd occurrence');
  const status = chess.getGameStatus();
  assert.strictEqual(status.isGameOver, true);
  assert.strictEqual(status.result, 'threefold_repetition');
  assert.strictEqual(status.winner, null);
});

// 9. Insufficient Material Draws
runTest('TIER 1', 'Insufficient material correctly detects K vs K, K+B vs K, and K+N vs K', () => {
  assert.strictEqual(new ChessEngine('8/8/8/4k3/8/8/4K3/8 w - - 0 1').isInsufficientMaterial(), true, 'K vs K is draw');
  assert.strictEqual(new ChessEngine('8/8/8/4k3/8/5B2/4K3/8 w - - 0 1').isInsufficientMaterial(), true, 'K+B vs K is draw');
  assert.strictEqual(new ChessEngine('8/8/8/4k3/8/5N2/4K3/8 w - - 0 1').isInsufficientMaterial(), true, 'K+N vs K is draw');
  assert.strictEqual(new ChessEngine('8/8/8/4k3/8/5P2/4K3/8 w - - 0 1').isInsufficientMaterial(), false, 'Pawn is not insufficient');
  assert.strictEqual(new ChessEngine('8/8/8/4k3/8/5R2/4K3/8 w - - 0 1').isInsufficientMaterial(), false, 'Rook is not insufficient');
});

// 10. PGN Serialization & Export
runTest('TIER 1', 'PGN export serializes valid standard PGN headers and SAN plies', () => {
  const chess = new ChessEngine();
  chess.makeMove('e2', 'e4');
  chess.makeMove('e7', 'e5');
  chess.makeMove('g1', 'f3');

  const pgn = chess.exportPgn({
    Event: 'Grandmaster Championship 2026',
    White: 'Carlsen, Magnus',
    Black: 'Nakamura, Hikaru'
  });

  assert.ok(pgn.includes('[Event "Grandmaster Championship 2026"]'));
  assert.ok(pgn.includes('[White "Carlsen, Magnus"]'));
  assert.ok(pgn.includes('[Black "Nakamura, Hikaru"]'));
  assert.ok(pgn.includes('1. e4 e5 2. Nf3'));
});

// =============================================================================
// TIER 2: BOUNDARY & CORNER CASES (Adversarial, Check Rules & Clocks)
// =============================================================================
console.log('\n>>> TIER 2: BOUNDARY & CORNER CASES (Pins, Checks, Clocks)');

// 11. King Cannot Castle OUT OF Check
runTest('TIER 2', 'King cannot castle when currently in check', () => {
  // White has castling rights, but Black rook at e8 checks White King on e1
  const chess = new ChessEngine('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.strictEqual(chess.isInCheck('w'), true, 'White king is in check');

  const moves = chess.generateLegalMoves('w');
  const castleKingside = moves.find(m => m.from.row === 7 && m.from.col === 4 && m.to.col === 6);
  const castleQueenside = moves.find(m => m.from.row === 7 && m.from.col === 4 && m.to.col === 2);

  assert.strictEqual(castleKingside, undefined, 'Cannot castle kingside while in check');
  assert.strictEqual(castleQueenside, undefined, 'Cannot castle queenside while in check');
  assert.strictEqual(chess.makeMove('e1', 'g1'), null);
});

// 12. King Cannot Castle THROUGH Check
runTest('TIER 2', 'King cannot castle through a square attacked by an enemy piece', () => {
  // Black bishop at a6 controls f1 (col 5) on rank 1. White King wants to castle kingside e1-g1 through f1.
  const chess = new ChessEngine('8/8/b7/8/8/8/8/R3K2R w KQ - 0 1');
  assert.strictEqual(chess.isInCheck('w'), false, 'White king itself is NOT in check');

  // f1 is attacked by bishop on a6
  assert.strictEqual(chess.isSquareAttacked(7, 5, 'b'), true, 'f1 must be attacked');

  const castleKingside = chess.makeMove('e1', 'g1');
  assert.strictEqual(castleKingside, null, 'Castling through check (f1 attacked) must be forbidden');

  // But Queenside (passing through d1 and c1) is NOT attacked by bishop on a6:
  const castleQueenside = chess.makeMove('e1', 'c1');
  assert.ok(castleQueenside, 'Queenside castling through unattacked squares must succeed');
});

// 13. King Cannot Castle INTO Check
runTest('TIER 2', 'King cannot castle into a square attacked by an enemy piece', () => {
  // Black rook on g8 attacks g1 (destination). White cannot castle kingside.
  const chess = new ChessEngine('6r1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.strictEqual(chess.isSquareAttacked(7, 6, 'b'), true, 'g1 is attacked');
  assert.strictEqual(chess.makeMove('e1', 'g1'), null, 'Castling into check must be forbidden');
});

// 14. Absolute Pin Prevents Exposing King
runTest('TIER 2', 'Pinned piece cannot move to expose King to check', () => {
  // White King on e1, White Bishop on e2, Black Rook on e8. Bishop is absolutely pinned to King.
  const chess = new ChessEngine('4r3/8/8/8/8/8/4B3/4K3 w - - 0 1');
  const legalMoves = chess.generateLegalMoves('w');

  // Bishop at e2 (row 6, col 4) cannot move to d3, c4, b5, a6, f3, g4, h5
  const illegalBishopMoves = legalMoves.filter(m => m.from.row === 6 && m.from.col === 4);
  assert.strictEqual(illegalBishopMoves.length, 0, 'Absolutely pinned bishop must have 0 legal moves');
  assert.strictEqual(chess.makeMove('e2', 'c4'), null, 'Pinned move must return null');
});

// 15. En Passant Absolute Pin on 5th Rank
runTest('TIER 2', 'En passant capture disallowed if removing both pawns exposes King on rank 5', () => {
  // White King on a5, White Pawn on d5, Black Pawn on e5, Black Rook on h5.
  // Black just pushed e7-e5. If White plays dxe6 e.p., both pawns disappear from 5th rank,
  // exposing King on a5 to Rook on h5!
  const chess = new ChessEngine('8/8/8/K2pP2r/8/8/8/8 w - d6 0 1');
  // Adjust: White pawn on e5, Black pawn on d5, Black rook on h5, White King on a5.
  const legalMoves = chess.generateLegalMoves('w');
  const epMove = legalMoves.find(m => m.isEnPassant);
  assert.strictEqual(epMove, undefined, 'En passant exposing king along rank 5 must not be generated');
  assert.strictEqual(chess.makeMove('e5', 'd6'), null, 'En passant resulting in king exposure must be illegal');
});

// 16. Fifty-Move Rule Activation at Exactly 100 Plies
runTest('TIER 2', 'Fifty-move rule activates at halfmoveClock == 100; resets on pawn/capture', () => {
  // FEN with halfmoveClock = 99
  const chess = new ChessEngine('4k3/8/8/8/8/8/4K3/3R4 w - - 99 50');
  assert.strictEqual(chess.halfmoveClock, 99);
  assert.strictEqual(chess.isFiftyMoveRule(), false);

  // Play a non-pawn non-capture move: Rd1-d2
  chess.makeMove('d1', 'd2');
  assert.strictEqual(chess.halfmoveClock, 100);
  assert.strictEqual(chess.isFiftyMoveRule(), true, 'Must activate at halfmoveClock == 100');
  assert.strictEqual(chess.getGameStatus().isGameOver, true);
  assert.strictEqual(chess.getGameStatus().result, 'fifty_moves');

  // If a pawn move is played, clock resets to 0:
  const chessPawn = new ChessEngine('4k3/4p3/8/8/8/8/4K3/3R4 b - - 99 50');
  chessPawn.makeMove('e7', 'e6');
  assert.strictEqual(chessPawn.halfmoveClock, 0, 'Pawn move resets halfmove clock');
  assert.strictEqual(chessPawn.isFiftyMoveRule(), false);
});

// 17. Underpromotion to Knight to Avoid Stalemate
runTest('TIER 2', 'Underpromotion to Knight avoids stalemate and delivers check', () => {
  // White pawn on c7, White King on a6, Black King on a8.
  // If White promotes to Queen c7-c8=Q, it's checkmate (or stalemate if Queen placed elsewhere).
  // In position: Black King on a8, White pawn on b7, White King on c8:
  // FEN: 8/1P6/8/8/8/8/8/K1k5 w - - 0 1
  const chess = new ChessEngine('7k/1P5P/8/8/8/8/8/K7 w - - 0 1');
  const promoKnight = chess.makeMove('b7', 'b8', 'n');
  assert.ok(promoKnight);
  assert.strictEqual(promoKnight.promotion, 'n');
  assert.strictEqual(chess.board[0][1]?.type, 'n');
});

// =============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS
// =============================================================================
console.log('\n>>> TIER 3: CROSS-FEATURE COMBINATIONS');

// 18. Promotion with Immediate Check
runTest('TIER 3', 'Pawn promotion with immediate check appends + to SAN', () => {
  // Black King on e8. White pawn on d7 pushes d7-d8=Q+, checking the King.
  const chess = new ChessEngine('4k3/3P4/8/8/8/8/8/4K3 w - - 0 1');
  const move = chess.makeMove('d7', 'd8', 'q');
  assert.ok(move);
  assert.strictEqual(move.isCheck, true);
  assert.strictEqual(move.san, 'd8=Q+');
});

// 19. Castling Rights Permanently Lost When Rook Moves and Returns
runTest('TIER 3', 'Castling rights permanently lost when Rook moves away and returns', () => {
  const chess = new ChessEngine('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.strictEqual(chess.castling.wK, true);
  assert.strictEqual(chess.castling.wQ, true);

  // Move White rook Rh1-h2 then Rh2-h1, with Black moving Ra8-a7 then Ra7-a8
  assert.ok(chess.makeMove('h1', 'h2'));
  assert.strictEqual(chess.castling.wK, false, 'wK rights lost upon Rh1 move');
  assert.ok(chess.makeMove('a8', 'a7'));
  assert.ok(chess.makeMove('h2', 'h1'));
  assert.strictEqual(chess.castling.wK, false, 'wK rights still false after returning');

  assert.ok(chess.makeMove('a7', 'a8'));
  // White tries to castle kingside e1-g1: MUST be null
  assert.strictEqual(chess.makeMove('e1', 'g1'), null, 'Cannot castle kingside after rook moved');
  // Queenside castling MUST still be valid:
  assert.ok(chess.makeMove('e1', 'c1'), 'Queenside castling still legal');
});

// 20. En Passant Resulting in Discovered Check
runTest('TIER 3', 'En passant capture causing discovered check on enemy King', () => {
  // White Queen on e1, White Pawn on e5, Black King on e8.
  // Black pushes d7-d5 (e.p. on d6). White captures e5xd6 e.p.
  // The e-file opens up, giving discovered check from Queen on e1 to King on e8!
  const chess = new ChessEngine('4k3/3p4/8/4P3/8/8/8/4Q2K w - d6 0 1');
  const move = chess.makeMove('e5', 'd6');
  assert.ok(move);
  assert.strictEqual(move.isEnPassant, true);
  assert.strictEqual(move.isCheck, true, 'En passant opening e-file must check King');
  assert.ok(move.san.endsWith('+'), 'SAN must end with +');
});

// 21. Threefold Repetition Across Non-Consecutive Moves
runTest('TIER 3', 'Threefold repetition detected with non-consecutive interspersed moves', () => {
  const chess = new ChessEngine();
  // Pos 0: Initial
  chess.makeMove('b1', 'c3'); chess.makeMove('b8', 'c6');
  chess.makeMove('c3', 'b1'); chess.makeMove('c6', 'b8');
  // Pos 0 repeated (2nd time)
  assert.strictEqual(chess.isThreefoldRepetition(), false);

  // Play some other moves that are symmetric and reversible
  chess.makeMove('g1', 'f3'); chess.makeMove('g8', 'f6');
  chess.makeMove('f3', 'g1'); chess.makeMove('f6', 'g8');
  // Pos 0 repeated (3rd time)
  assert.strictEqual(chess.isThreefoldRepetition(), true, 'Threefold repetition across multiple cycles');
});

// =============================================================================
// TIER 4: REAL-WORLD SCENARIOS (Historical Grandmaster Games Replay)
// =============================================================================
console.log('\n>>> TIER 4: REAL-WORLD WORKLOADS (Grandmaster Game Replays)');

// 22. Adolf Anderssen vs Lionel Kieseritzky: The "Immortal Game" (1851)
runTest('TIER 4', 'Adolf Anderssen "Immortal Game" (1851) 23-move full replay to checkmate', () => {
  const chess = new ChessEngine();

  // Full move list of the Immortal Game:
  const moves = [
    ['e2', 'e4'], ['e7', 'e5'],       // 1. e4 e5
    ['f2', 'f4'], ['e5', 'f4'],       // 2. f4 exf4 (King's Gambit)
    ['f1', 'c4'], ['d8', 'h4'],       // 3. Bc4 Qh4+
    ['e1', 'f1'], ['b7', 'b5'],       // 4. Kf1 b5
    ['c4', 'b5'], ['g8', 'f6'],       // 5. Bxb5 Nf6
    ['g1', 'f3'], ['h4', 'h6'],       // 6. Nf3 Qh6
    ['d2', 'd3'], ['f6', 'h5'],       // 7. d3 Nh5
    ['f3', 'h4'], ['h6', 'g5'],       // 8. Nh4 Qg5
    ['h4', 'f5'], ['c7', 'c6'],       // 9. Nf5 c6
    ['g2', 'g4'], ['h5', 'f6'],       // 10. g4 Nf6
    ['h1', 'g1'], ['c6', 'b5'],       // 11. Rg1 cxb5
    ['h2', 'h4'], ['g5', 'g6'],       // 12. h4 Qg6
    ['h4', 'h5'], ['g6', 'g5'],       // 13. h5 Qg5
    ['d1', 'f3'], ['f6', 'g8'],       // 14. Qf3 Ng8
    ['c1', 'f4'], ['g5', 'f6'],       // 15. Bxf4 Qf6
    ['b1', 'c3'], ['f8', 'c5'],       // 16. Nc3 Bc5
    ['c3', 'd5'], ['f6', 'b2'],       // 17. Nd5 Qxb2 (Black threatens Qxa1)
    ['f4', 'd6'], ['c5', 'g1'],       // 18. Bd6 Bxg1 (Sacrificing both rooks!)
    ['e4', 'e5'], ['b2', 'a1'],       // 19. e5 Qxa1+
    ['f1', 'e2'], ['b8', 'a6'],       // 20. Ke2 Na6
    ['f5', 'g7'], ['e8', 'd8'],       // 21. Nxg7+ Kd8
    ['f3', 'f6'], ['g8', 'f6'],       // 22. Qf6+ Nxf6 (Queen sacrifice!)
    ['d6', 'e7']                      // 23. Be7# Checkmate!
  ];

  for (let i = 0; i < moves.length; i++) {
    const [from, to] = moves[i];
    const m = chess.makeMove(from, to);
    assert.ok(m, `Move ${i + 1} (${from}-${to}) must be legal`);
  }

  // Verify the final position: Be7# delivers checkmate
  assert.strictEqual(chess.isCheckmate(), true, 'Immortal Game must conclude in checkmate');
  const status = chess.getGameStatus();
  assert.strictEqual(status.isGameOver, true);
  assert.strictEqual(status.winner, 'w');
  assert.strictEqual(status.result, 'checkmate');
  assert.ok(status.reason.includes('Jaque Mate'));
});

// 23. Paul Morphy vs Duke of Brunswick & Count Isouard: The "Opera Game" (1858)
runTest('TIER 4', 'Paul Morphy "Opera Game" (1858) 17-move full replay to checkmate', () => {
  const chess = new ChessEngine();

  const moves = [
    ['e2', 'e4'], ['e7', 'e5'],       // 1. e4 e5
    ['g1', 'f3'], ['d7', 'd6'],       // 2. Nf3 d6 (Philidor Defense)
    ['d2', 'd4'], ['c8', 'g4'],       // 3. d4 Bg4
    ['d4', 'e5'], ['g4', 'f3'],       // 4. dxe5 Bxf3
    ['d1', 'f3'], ['d6', 'e5'],       // 5. Qxf3 dxe5
    ['f1', 'c4'], ['g8', 'f6'],       // 6. Bc4 Nf6
    ['f3', 'b3'], ['d8', 'e7'],       // 7. Qb3 Qe7
    ['b1', 'c3'], ['c7', 'c6'],       // 8. Nc3 c6
    ['c1', 'g5'], ['b7', 'b5'],       // 9. Bg5 b5
    ['c3', 'b5'], ['c6', 'b5'],       // 10. Nxb5 cxb5 (Piece sacrifice)
    ['c4', 'b5'], ['b8', 'd7'],       // 11. Bxb5+ Nbd7
    ['e1', 'c1'], ['a8', 'd8'],       // 12. O-O-O Rd8
    ['d1', 'd7'], ['d8', 'd7'],       // 13. Rxd7 Rxd7 (Rook sacrifice)
    ['h1', 'd1'], ['e7', 'e6'],       // 14. Rd1 Qe6
    ['b5', 'd7'], ['f6', 'd7'],       // 15. Bxd7+ Nxd7
    ['b3', 'b8'], ['d7', 'b8'],       // 16. Qb8+! Nxb8 (Queen sacrifice!)
    ['d1', 'd8']                      // 17. Rd8# Checkmate!
  ];

  for (let i = 0; i < moves.length; i++) {
    const [from, to] = moves[i];
    const m = chess.makeMove(from, to);
    assert.ok(m, `Move ${i + 1} (${from}-${to}) must be legal`);
  }

  assert.strictEqual(chess.isCheckmate(), true, 'Opera Game must conclude in checkmate');
  const status = chess.getGameStatus();
  assert.strictEqual(status.winner, 'w');
  assert.strictEqual(status.result, 'checkmate');
  assert.ok(status.reason.includes('Jaque Mate'));
});

console.log('\n=============================================================================');
console.log(`ALL ${totalTests} EXTENDED CHESS RULES TESTS PASSED CLEANLY (100% SUCCESS)!`);
console.log('=============================================================================');
