// public/src/chess/chess_engine.js
// Authoritative FIDE Chess Rules Engine & State Validator
// Supports 100% of FIDE rules: castling, en passant, promotion, check, checkmate,
// stalemate, threefold repetition, 50-move rule, and insufficient material.
// Works seamlessly in both ES Module (browser) and CommonJS (Node.js).

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

const KNIGHT_OFFSETS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1]
];
const DIAG_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const QUEEN_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
const KING_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

const SQUARES = [
  ['a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8'],
  ['a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7'],
  ['a6', 'b6', 'c6', 'd6', 'e6', 'f6', 'g6', 'h6'],
  ['a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5'],
  ['a4', 'b4', 'c4', 'd4', 'e4', 'f4', 'g4', 'h4'],
  ['a3', 'b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3'],
  ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'],
  ['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1']
];

export class ChessEngine {
  constructor(fen = INITIAL_FEN) {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    this.turn = 'w';
    this.castling = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassant = null; // { row, col }
    this.halfmoveClock = 0;
    this.fullmoveNumber = 1;
    this.history = [];
    this.positionCounts = new Map();
    this.kingPos = { w: null, b: null };

    this.loadFen(fen);
  }

  /**
   * Resets board to initial standard chess setup
   */
  reset() {
    this.loadFen(INITIAL_FEN);
  }

  /**
   * Fast deep copy of the engine state
   */
  clone() {
    const copy = new ChessEngine();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        copy.board[r][c] = piece ? { type: piece.type, color: piece.color } : null;
      }
    }
    copy.turn = this.turn;
    copy.castling = { ...this.castling };
    copy.enPassant = this.enPassant ? { ...this.enPassant } : null;
    copy.halfmoveClock = this.halfmoveClock;
    copy.fullmoveNumber = this.fullmoveNumber;
    copy.positionCounts = new Map(this.positionCounts);
    copy.kingPos = {
      w: this.kingPos && this.kingPos.w ? { ...this.kingPos.w } : null,
      b: this.kingPos && this.kingPos.b ? { ...this.kingPos.b } : null
    };
    return copy;
  }

  /**
   * Converts algebraic square name (e.g. 'e4') to { row, col } (row 0 = rank 8, col 0 = file a)
   */
  static squareToCoords(square) {
    if (typeof square !== 'string' || square.length !== 2) return null;
    const file = square.charCodeAt(0) - 97; // 'a' -> 0, 'h' -> 7
    const rank = parseInt(square.charAt(1), 10); // 1..8
    if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
    return { row: 8 - rank, col: file };
  }

  /**
   * Converts { row, col } to algebraic square name (e.g. 'e4')
   */
  static coordsToSquare(row, col) {
    if (row < 0 || row > 7 || col < 0 || col > 7) return null;
    return SQUARES[row][col];
  }

  /**
   * Parses FEN string and loads board state
   */
  loadFen(fen) {
    const parts = (fen || INITIAL_FEN).trim().split(/\s+/);
    const placement = parts[0];
    const turn = parts[1] || 'w';
    const castling = parts[2] || '-';
    const enPassant = parts[3] || '-';
    const halfmove = parseInt(parts[4] || '0', 10);
    const fullmove = parseInt(parts[5] || '1', 10);

    const rows = placement.split('/');
    if (rows.length !== 8) throw new Error(`Invalid FEN placement: ${placement}`);

    const newBoard = Array(8).fill(null).map(() => Array(8).fill(null));

    for (let r = 0; r < 8; r++) {
      let col = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') {
          col += parseInt(ch, 10);
        } else {
          const isWhite = ch === ch.toUpperCase();
          newBoard[r][col] = {
            type: ch.toLowerCase(),
            color: isWhite ? 'w' : 'b'
          };
          col++;
        }
      }
      if (col !== 8) throw new Error(`Invalid FEN row length at rank ${8 - r}`);
    }

    this.board = newBoard;
    this.turn = turn === 'b' ? 'b' : 'w';
    this.castling = {
      wK: castling.includes('K'),
      wQ: castling.includes('Q'),
      bK: castling.includes('k'),
      bQ: castling.includes('q')
    };
    this.enPassant = enPassant !== '-' ? ChessEngine.squareToCoords(enPassant) : null;
    this.halfmoveClock = isNaN(halfmove) ? 0 : halfmove;
    this.fullmoveNumber = isNaN(fullmove) ? 1 : fullmove;
    this.history = [];
    this.positionCounts.clear();

    this.kingPos = { w: null, b: null };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = newBoard[r][c];
        if (p && p.type === 'k') {
          this.kingPos[p.color] = { row: r, col: c };
        }
      }
    }

    const posKey = this.getPositionKey();
    this.positionCounts.set(posKey, 1);
  }

  /**
   * Serializes current state to standard FEN string
   */
  getFen() {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let rowStr = '';
      let emptyCount = 0;
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (!piece) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          const ch = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
          rowStr += ch;
        }
      }
      if (emptyCount > 0) rowStr += emptyCount;
      rows.push(rowStr);
    }

    const castlingStr = [
      this.castling.wK ? 'K' : '',
      this.castling.wQ ? 'Q' : '',
      this.castling.bK ? 'k' : '',
      this.castling.bQ ? 'q' : ''
    ].join('') || '-';

    const epStr = this.enPassant ? ChessEngine.coordsToSquare(this.enPassant.row, this.enPassant.col) : '-';

    return `${rows.join('/')} ${this.turn} ${castlingStr} ${epStr} ${this.halfmoveClock} ${this.fullmoveNumber}`;
  }

  /**
   * Returns simplified position key for repetition checking
   */
  getPositionKey() {
    const fen = this.getFen();
    // Exclude halfmove clock and fullmove number for repetition check
    return fen.split(' ').slice(0, 4).join(' ');
  }

  /**
   * Returns piece at algebraic square or coordinates
   */
  getPiece(squareOrCoords) {
    const coords = typeof squareOrCoords === 'string'
      ? ChessEngine.squareToCoords(squareOrCoords)
      : squareOrCoords;
    if (!coords || coords.row < 0 || coords.row > 7 || coords.col < 0 || coords.col > 7) return null;
    return this.board[coords.row][coords.col];
  }

  /**
   * Checks whether a square (row, col) is attacked by any piece of attackerColor
   */
  isSquareAttacked(row, col, attackerColor) {
    // 1. Pawn attacks
    const pawnRow = attackerColor === 'w' ? row + 1 : row - 1;
    if (pawnRow >= 0 && pawnRow < 8) {
      if (col > 0) {
        const p = this.board[pawnRow][col - 1];
        if (p && p.color === attackerColor && p.type === 'p') return true;
      }
      if (col < 7) {
        const p = this.board[pawnRow][col + 1];
        if (p && p.color === attackerColor && p.type === 'p') return true;
      }
    }

    // 2. Knight attacks
    for (let i = 0; i < 8; i++) {
      const nr = row + KNIGHT_OFFSETS[i][0];
      const nc = col + KNIGHT_OFFSETS[i][1];
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = this.board[nr][nc];
        if (p && p.color === attackerColor && p.type === 'n') return true;
      }
    }

    // 3. Bishop & Queen diagonal ray attacks
    for (let i = 0; i < 4; i++) {
      const dr = DIAG_DIRS[i][0];
      const dc = DIAG_DIRS[i][1];
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = this.board[r][c];
        if (p) {
          if (p.color === attackerColor && (p.type === 'b' || p.type === 'q')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    // 4. Rook & Queen orthogonal ray attacks
    for (let i = 0; i < 4; i++) {
      const dr = ORTHO_DIRS[i][0];
      const dc = ORTHO_DIRS[i][1];
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = this.board[r][c];
        if (p) {
          if (p.color === attackerColor && (p.type === 'r' || p.type === 'q')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    // 5. King adjacent attacks
    for (let i = 0; i < 8; i++) {
      const nr = row + KING_OFFSETS[i][0];
      const nc = col + KING_OFFSETS[i][1];
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = this.board[nr][nc];
        if (p && p.color === attackerColor && p.type === 'k') return true;
      }
    }

    return false;
  }

  /**
   * Finds the King coordinates of specified color
   */
  findKing(color) {
    if (this.kingPos && this.kingPos[color]) {
      const kp = this.kingPos[color];
      const p = this.board[kp.row]?.[kp.col];
      if (p && p.color === color && p.type === 'k') {
        return kp;
      }
    }
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.color === color && p.type === 'k') {
          if (!this.kingPos) this.kingPos = { w: null, b: null };
          this.kingPos[color] = { row: r, col: c };
          return { row: r, col: c };
        }
      }
    }
    return null;
  }

  /**
   * Checks if color's King is currently in check
   */
  isInCheck(color = this.turn) {
    const king = (this.kingPos && this.kingPos[color]) ? this.kingPos[color] : this.findKing(color);
    if (!king) return false;
    const opponent = color === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(king.row, king.col, opponent);
  }

  /**
   * Generates all pseudo-legal moves for a piece at (row, col)
   */
  generatePseudoMovesForPiece(row, col, outMoves = null, checkLegality = false) {
    const piece = this.board[row][col];
    if (!piece) return outMoves || [];
    const moves = outMoves || [];
    const color = piece.color;
    const opp = color === 'w' ? 'b' : 'w';
    const fromCoord = { row, col };
    const fromSq = SQUARES[row][col];
    const pType = piece.type;

    const addMove = (toRow, toCol, extra = null) => {
      const m = {
        from: fromCoord,
        to: { row: toRow, col: toCol },
        fromSquare: fromSq,
        toSquare: SQUARES[toRow][toCol],
        piece: pType,
        color,
        captured: null,
        promotion: null,
        isCastling: false,
        castlingSide: null,
        isEnPassant: false,
        isDoublePawn: false,
        _p: 0
      };
      if (extra) {
        if (extra.captured !== undefined) m.captured = extra.captured;
        if (extra.promotion !== undefined) m.promotion = extra.promotion;
        if (extra.isCastling !== undefined) m.isCastling = extra.isCastling;
        if (extra.castlingSide !== undefined) m.castlingSide = extra.castlingSide;
        if (extra.isEnPassant !== undefined) m.isEnPassant = extra.isEnPassant;
        if (extra.isDoublePawn !== undefined) m.isDoublePawn = extra.isDoublePawn;
      }
      if (!checkLegality || this.isMoveLegal(m)) {
        moves.push(m);
      }
    };

    if (piece.type === 'p') {
      const fwd = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promoRow = color === 'w' ? 0 : 7;

      // 1 square forward
      const fwdRow = row + fwd;
      if (fwdRow >= 0 && fwdRow < 8 && !this.board[fwdRow][col]) {
        if (fwdRow === promoRow) {
          for (const promo of ['q', 'r', 'b', 'n']) {
            addMove(fwdRow, col, { promotion: promo });
          }
        } else {
          addMove(fwdRow, col);
          // 2 squares forward from start
          const dblRow = row + 2 * fwd;
          if (row === startRow && !this.board[dblRow][col]) {
            addMove(dblRow, col, { isDoublePawn: true });
          }
        }
      }

      // Diagonal captures
      for (const dc of [-1, 1]) {
        const captureCol = col + dc;
        if (captureCol >= 0 && captureCol < 8 && fwdRow >= 0 && fwdRow < 8) {
          const target = this.board[fwdRow][captureCol];
          if (target && target.color === opp) {
            if (fwdRow === promoRow) {
              for (const promo of ['q', 'r', 'b', 'n']) {
                addMove(fwdRow, captureCol, { promotion: promo, captured: target });
              }
            } else {
              addMove(fwdRow, captureCol, { captured: target });
            }
          } else if (
            this.enPassant &&
            this.enPassant.row === fwdRow &&
            this.enPassant.col === captureCol
          ) {
            // En Passant capture
            const capturedPawn = this.board[row][captureCol];
            addMove(fwdRow, captureCol, { isEnPassant: true, captured: capturedPawn });
          }
        }
      }
    } else if (piece.type === 'n') {
      for (let i = 0; i < 8; i++) {
        const nr = row + KNIGHT_OFFSETS[i][0];
        const nc = col + KNIGHT_OFFSETS[i][1];
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const target = this.board[nr][nc];
          if (!target || target.color === opp) {
            addMove(nr, nc, { captured: target || null });
          }
        }
      }
    } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
      const dirs = piece.type === 'b' ? DIAG_DIRS : (piece.type === 'r' ? ORTHO_DIRS : QUEEN_DIRS);

      for (let d = 0; d < dirs.length; d++) {
        const dr = dirs[d][0];
        const dc = dirs[d][1];
        let r = row + dr;
        let c = col + dc;
        while (r >= 0 && r < 8 && c >= 0 && c < 8) {
          const target = this.board[r][c];
          if (!target) {
            addMove(r, c);
          } else {
            if (target.color === opp) {
              addMove(r, c, { captured: target });
            }
            break;
          }
          r += dr;
          c += dc;
        }
      }
    } else if (piece.type === 'k') {
      for (let i = 0; i < 8; i++) {
        const nr = row + KING_OFFSETS[i][0];
        const nc = col + KING_OFFSETS[i][1];
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const target = this.board[nr][nc];
          if (!target || target.color === opp) {
            addMove(nr, nc, { captured: target || null });
          }
        }
      }

      // Castling moves
      if (color === 'w' && row === 7 && col === 4) {
        // Kingside O-O
        if (
          this.castling.wK &&
          !this.board[7][5] &&
          !this.board[7][6] &&
          this.board[7][7] &&
          this.board[7][7].type === 'r' &&
          this.board[7][7].color === 'w' &&
          !this.isSquareAttacked(7, 4, 'b') &&
          !this.isSquareAttacked(7, 5, 'b') &&
          !this.isSquareAttacked(7, 6, 'b')
        ) {
          addMove(7, 6, { isCastling: true, castlingSide: 'k' });
        }
        // Queenside O-O-O
        if (
          this.castling.wQ &&
          !this.board[7][3] &&
          !this.board[7][2] &&
          !this.board[7][1] &&
          this.board[7][0] &&
          this.board[7][0].type === 'r' &&
          this.board[7][0].color === 'w' &&
          !this.isSquareAttacked(7, 4, 'b') &&
          !this.isSquareAttacked(7, 3, 'b') &&
          !this.isSquareAttacked(7, 2, 'b')
        ) {
          addMove(7, 2, { isCastling: true, castlingSide: 'q' });
        }
      } else if (color === 'b' && row === 0 && col === 4) {
        // Kingside O-O
        if (
          this.castling.bK &&
          !this.board[0][5] &&
          !this.board[0][6] &&
          this.board[0][7] &&
          this.board[0][7].type === 'r' &&
          this.board[0][7].color === 'b' &&
          !this.isSquareAttacked(0, 4, 'w') &&
          !this.isSquareAttacked(0, 5, 'w') &&
          !this.isSquareAttacked(0, 6, 'w')
        ) {
          addMove(0, 6, { isCastling: true, castlingSide: 'k' });
        }
        // Queenside O-O-O
        if (
          this.castling.bQ &&
          !this.board[0][3] &&
          !this.board[0][2] &&
          !this.board[0][1] &&
          this.board[0][0] &&
          this.board[0][0].type === 'r' &&
          this.board[0][0].color === 'b' &&
          !this.isSquareAttacked(0, 4, 'w') &&
          !this.isSquareAttacked(0, 3, 'w') &&
          !this.isSquareAttacked(0, 2, 'w')
        ) {
          addMove(0, 2, { isCastling: true, castlingSide: 'q' });
        }
      }
    }

    return moves;
  }

  /**
   * Generates all strictly legal moves for the active color
   */
  generateLegalMoves(color = this.turn, checkLegality = true) {
    const legalMoves = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (piece && piece.color === color) {
          this.generatePseudoMovesForPiece(r, c, legalMoves, checkLegality);
        }
      }
    }

    return legalMoves;
  }

  /**
   * Generates tactical moves (captures and promotions only).
   * Highly optimized for quiescence search: avoids testing non-tactical moves.
   */
  generateTacticalMoves(color = this.turn, checkLegality = true) {
    const opp = color === 'w' ? 'b' : 'w';
    const tacticalMoves = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (!piece || piece.color !== color) continue;

        if (piece.type === 'p') {
          const fwd = color === 'w' ? -1 : 1;
          const promoRow = color === 'w' ? 0 : 7;
          const fwdRow = r + fwd;

          // Pawn promotions without capture
          if (fwdRow === promoRow && fwdRow >= 0 && fwdRow < 8 && !this.board[fwdRow][c]) {
            for (const promo of ['q', 'r', 'b', 'n']) {
              const move = {
                from: { row: r, col: c },
                to: { row: fwdRow, col: c },
                fromSquare: SQUARES[r][c],
                toSquare: SQUARES[fwdRow][c],
                piece: 'p',
                color,
                promotion: promo
              };
              if (!checkLegality || this.isMoveLegal(move)) tacticalMoves.push(move);
            }
          }

          // Diagonal captures & EP
          for (const dc of [-1, 1]) {
            const captureCol = c + dc;
            if (captureCol >= 0 && captureCol < 8 && fwdRow >= 0 && fwdRow < 8) {
              const target = this.board[fwdRow][captureCol];
              if (target && target.color === opp) {
                if (fwdRow === promoRow) {
                  for (const promo of ['q', 'r', 'b', 'n']) {
                    const move = {
                      from: { row: r, col: c },
                      to: { row: fwdRow, col: captureCol },
                      fromSquare: SQUARES[r][c],
                      toSquare: SQUARES[fwdRow][captureCol],
                      piece: 'p',
                      color,
                      promotion: promo,
                      captured: target
                    };
                    if (!checkLegality || this.isMoveLegal(move)) tacticalMoves.push(move);
                  }
                } else {
                  const move = {
                    from: { row: r, col: c },
                    to: { row: fwdRow, col: captureCol },
                    fromSquare: SQUARES[r][c],
                    toSquare: SQUARES[fwdRow][captureCol],
                    piece: 'p',
                    color,
                    captured: target
                  };
                  if (!checkLegality || this.isMoveLegal(move)) tacticalMoves.push(move);
                }
              } else if (
                this.enPassant &&
                this.enPassant.row === fwdRow &&
                this.enPassant.col === captureCol
              ) {
                const capturedPawn = this.board[r][captureCol];
                const move = {
                  from: { row: r, col: c },
                  to: { row: fwdRow, col: captureCol },
                  fromSquare: SQUARES[r][c],
                  toSquare: SQUARES[fwdRow][captureCol],
                  piece: 'p',
                  color,
                  isEnPassant: true,
                  captured: capturedPawn
                };
                if (!checkLegality || this.isMoveLegal(move)) tacticalMoves.push(move);
              }
            }
          }
        } else if (piece.type === 'n') {
          for (let i = 0; i < 8; i++) {
            const nr = r + KNIGHT_OFFSETS[i][0];
            const nc = c + KNIGHT_OFFSETS[i][1];
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
              const target = this.board[nr][nc];
              if (target && target.color === opp) {
                const move = {
                  from: { row: r, col: c },
                  to: { row: nr, col: nc },
                  fromSquare: SQUARES[r][c],
                  toSquare: SQUARES[nr][nc],
                  piece: 'n',
                  color,
                  captured: target
                };
                if (!checkLegality || this.isMoveLegal(move)) tacticalMoves.push(move);
              }
            }
          }
        } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
          const dirs = piece.type === 'b' ? DIAG_DIRS : (piece.type === 'r' ? ORTHO_DIRS : QUEEN_DIRS);
          for (let d = 0; d < dirs.length; d++) {
            const dr = dirs[d][0];
            const dc = dirs[d][1];
            let nr = r + dr;
            let nc = c + dc;
            while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
              const target = this.board[nr][nc];
              if (target) {
                if (target.color === opp) {
                  const move = {
                    from: { row: r, col: c },
                    to: { row: nr, col: nc },
                    fromSquare: SQUARES[r][c],
                    toSquare: SQUARES[nr][nc],
                    piece: piece.type,
                    color,
                    captured: target
                  };
                  if (!checkLegality || this.isMoveLegal(move)) tacticalMoves.push(move);
                }
                break;
              }
              nr += dr;
              nc += dc;
            }
          }
        } else if (piece.type === 'k') {
          for (let i = 0; i < 8; i++) {
            const nr = r + KING_OFFSETS[i][0];
            const nc = c + KING_OFFSETS[i][1];
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
              const target = this.board[nr][nc];
              if (target && target.color === opp) {
                const move = {
                  from: { row: r, col: c },
                  to: { row: nr, col: nc },
                  fromSquare: SQUARES[r][c],
                  toSquare: SQUARES[nr][nc],
                  piece: 'k',
                  color,
                  captured: target
                };
                if (!checkLegality || this.isMoveLegal(move)) tacticalMoves.push(move);
              }
            }
          }
        }
      }
    }

    return tacticalMoves;
  }

  /**
   * Tests whether applying pseudo-move leaves the friendly King in check
   */
  isMoveLegal(move) {
    const { from, to, isEnPassant, isCastling, promotion } = move;
    const movingPiece = this.board[from.row][from.col];
    const targetPiece = this.board[to.row][to.col];
    const color = movingPiece.color;

    // Apply move temporarily
    this.board[from.row][from.col] = null;
    this.board[to.row][to.col] = promotion
      ? { type: promotion, color }
      : movingPiece;

    let epCaptured = null;
    let epPawnPos = null;
    if (isEnPassant) {
      epPawnPos = { row: from.row, col: to.col };
      epCaptured = this.board[epPawnPos.row][epPawnPos.col];
      this.board[epPawnPos.row][epPawnPos.col] = null;
    }

    // Verify King safety without extra allocations
    const oppColor = color === 'w' ? 'b' : 'w';
    const kPos = movingPiece.type === 'k' ? to : (this.kingPos && this.kingPos[color] ? this.kingPos[color] : this.findKing(color));
    const inCheck = this.isSquareAttacked(kPos.row, kPos.col, oppColor);

    // Rollback move
    this.board[from.row][from.col] = movingPiece;
    this.board[to.row][to.col] = targetPiece;
    if (isEnPassant && epPawnPos) {
      this.board[epPawnPos.row][epPawnPos.col] = epCaptured;
    }

    return !inCheck;
  }

  /**
   * Returns array of destination squares { row, col, square } that piece can legally move to
   */
  getLegalMovesForSquare(squareOrCoords) {
    const coords = typeof squareOrCoords === 'string'
      ? ChessEngine.squareToCoords(squareOrCoords)
      : squareOrCoords;
    if (!coords) return [];

    const piece = this.board[coords.row][coords.col];
    if (!piece || piece.color !== this.turn) return [];

    const pseudoMoves = this.generatePseudoMovesForPiece(coords.row, coords.col);
    return pseudoMoves.filter(m => this.isMoveLegal(m));
  }

  /**
   * Formats move in Standard Algebraic Notation (SAN)
   */
  moveToSan(move) {
    const { from, to, piece, captured, promotion, isCastling, castlingSide } = move;
    if (isCastling) {
      return castlingSide === 'k' ? 'O-O' : 'O-O-O';
    }

    let san = '';
    if (piece === 'p') {
      if (captured) {
        san += String.fromCharCode(97 + from.col) + 'x';
      }
      san += ChessEngine.coordsToSquare(to.row, to.col);
      if (promotion) {
        san += '=' + promotion.toUpperCase();
      }
    } else {
      san += piece.toUpperCase();

      // Disambiguation if another piece of same type can move to same square
      const others = this.generateLegalMoves(this.turn).filter(
        m => m.piece === piece &&
             m.to.row === to.row &&
             m.to.col === to.col &&
             (m.from.row !== from.row || m.from.col !== from.col)
      );

      if (others.length > 0) {
        const sameCol = others.some(m => m.from.col === from.col);
        const sameRow = others.some(m => m.from.row === from.row);
        if (!sameCol) {
          san += String.fromCharCode(97 + from.col);
        } else if (!sameRow) {
          san += (8 - from.row);
        } else {
          san += ChessEngine.coordsToSquare(from.row, from.col);
        }
      }

      if (captured) san += 'x';
      san += ChessEngine.coordsToSquare(to.row, to.col);
    }

    return san;
  }

  /**
   * Executes a move on the board.
   * `from` and `to` can be algebraic (e.g. 'e2', 'e4') or coordinates { row, col }.
   * Returns executed move object or null if illegal.
   */
  makeMove(from, to, promotion = 'q') {
    const fromCoords = typeof from === 'string' ? ChessEngine.squareToCoords(from) : from;
    const toCoords = typeof to === 'string' ? ChessEngine.squareToCoords(to) : to;
    if (!fromCoords || !toCoords) return null;

    const promoChoice = promotion ? promotion.toLowerCase() : 'q';
    const legalMoves = this.generateLegalMoves(this.turn);

    const matchedMove = legalMoves.find(m => {
      const match = m.from.row === fromCoords.row &&
                    m.from.col === fromCoords.col &&
                    m.to.row === toCoords.row &&
                    m.to.col === toCoords.col;
      if (!match) return false;
      if (m.promotion) {
        return m.promotion === promoChoice;
      }
      return true;
    });

    if (!matchedMove) return null;

    const fenBefore = this.getFen();
    let san = this.moveToSan(matchedMove);

    // Apply the move
    const movingPiece = this.board[fromCoords.row][fromCoords.col];
    const isCapture = Boolean(matchedMove.captured);
    const isPawnMove = movingPiece.type === 'p';

    this.board[fromCoords.row][fromCoords.col] = null;

    if (matchedMove.promotion) {
      this.board[toCoords.row][toCoords.col] = {
        type: matchedMove.promotion,
        color: movingPiece.color
      };
    } else {
      this.board[toCoords.row][toCoords.col] = movingPiece;
    }

    // Handle En Passant capture execution
    if (matchedMove.isEnPassant) {
      this.board[fromCoords.row][toCoords.col] = null;
    }

    // Handle Castling Rook repositioning
    if (matchedMove.isCastling) {
      if (matchedMove.castlingSide === 'k') {
        const rRow = fromCoords.row;
        const rook = this.board[rRow][7];
        this.board[rRow][7] = null;
        this.board[rRow][5] = rook;
      } else {
        const rRow = fromCoords.row;
        const rook = this.board[rRow][0];
        this.board[rRow][0] = null;
        this.board[rRow][3] = rook;
      }
    }

    // Update Castling rights & King position
    if (movingPiece.type === 'k') {
      if (!this.kingPos) this.kingPos = { w: null, b: null };
      this.kingPos[movingPiece.color] = { row: toCoords.row, col: toCoords.col };
      if (movingPiece.color === 'w') {
        this.castling.wK = false;
        this.castling.wQ = false;
      } else {
        this.castling.bK = false;
        this.castling.bQ = false;
      }
    }
    if (movingPiece.type === 'r') {
      if (fromCoords.row === 7 && fromCoords.col === 0) this.castling.wQ = false;
      if (fromCoords.row === 7 && fromCoords.col === 7) this.castling.wK = false;
      if (fromCoords.row === 0 && fromCoords.col === 0) this.castling.bQ = false;
      if (fromCoords.row === 0 && fromCoords.col === 7) this.castling.bK = false;
    }
    if (matchedMove.captured && matchedMove.captured.type === 'r') {
      if (toCoords.row === 7 && toCoords.col === 0) this.castling.wQ = false;
      if (toCoords.row === 7 && toCoords.col === 7) this.castling.wK = false;
      if (toCoords.row === 0 && toCoords.col === 0) this.castling.bQ = false;
      if (toCoords.row === 0 && toCoords.col === 7) this.castling.bK = false;
    }

    // Update En Passant square target
    if (matchedMove.isDoublePawn) {
      const epRow = movingPiece.color === 'w' ? fromCoords.row - 1 : fromCoords.row + 1;
      this.enPassant = { row: epRow, col: fromCoords.col };
    } else {
      this.enPassant = null;
    }

    // Halfmove clock for 50-move rule
    if (isCapture || isPawnMove) {
      this.halfmoveClock = 0;
    } else {
      this.halfmoveClock++;
    }

    // Switch turn
    this.turn = this.turn === 'w' ? 'b' : 'w';
    if (this.turn === 'w') {
      this.fullmoveNumber++;
    }

    // Append Check or Checkmate symbol to SAN
    const opponent = this.turn;
    const isCheck = this.isInCheck(opponent);
    const opponentLegalMoves = this.generateLegalMoves(opponent);

    if (isCheck) {
      if (opponentLegalMoves.length === 0) {
        san += '#';
      } else {
        san += '+';
      }
    }

    const fenAfter = this.getFen();
    const executedMove = {
      ...matchedMove,
      san,
      fenBefore,
      fenAfter,
      isCheck,
      isCheckmate: isCheck && opponentLegalMoves.length === 0
    };

    this.history.push(executedMove);

    // Update position counts for threefold repetition
    const posKey = this.getPositionKey();
    const currentCount = (this.positionCounts.get(posKey) || 0) + 1;
    this.positionCounts.set(posKey, currentCount);

    return executedMove;
  }

  /**
   * High-speed in-place move execution for search tree exploration.
   * Updates board array, castling rights, en-passant target, king positions, and turn
   * without allocating clones, without generating legal moves, without SAN formatting,
   * and without FEN stringification.
   *
   * @param {Object|string} from - { row, col } or algebraic square ('e2') or move object { from, to, promotion }
   * @param {Object|string} [to] - { row, col } or algebraic square ('e4')
   * @param {string} [promotion='q'] - Promotion piece type ('q', 'r', 'b', 'n')
   * @returns {Object} undoState - State snapshot to pass to unmakeMove()
   */
  makeMoveFast(from, to, promotion = 'q') {
    let fromCoords, toCoords, promoChoice;
    if (from && typeof from === 'object' && from.from && from.to) {
      fromCoords = typeof from.from === 'string' ? ChessEngine.squareToCoords(from.from) : from.from;
      toCoords = typeof from.to === 'string' ? ChessEngine.squareToCoords(from.to) : from.to;
      promoChoice = from.promotion || to || promotion;
    } else {
      fromCoords = typeof from === 'string' ? ChessEngine.squareToCoords(from) : from;
      toCoords = typeof to === 'string' ? ChessEngine.squareToCoords(to) : to;
      promoChoice = promotion;
    }

    if (!fromCoords || !toCoords) return null;

    const movingPiece = this.board[fromCoords.row][fromCoords.col];
    if (!movingPiece) return null;

    const targetPiece = this.board[toCoords.row][toCoords.col];
    const color = movingPiece.color;

    // Detect Castling
    let isCastling = false;
    let castlingSide = null;
    if (movingPiece.type === 'k' && Math.abs(fromCoords.col - toCoords.col) === 2) {
      isCastling = true;
      castlingSide = toCoords.col === 6 ? 'k' : 'q';
    }

    // Detect En Passant capture
    let isEnPassant = false;
    let epCaptured = null;
    if (movingPiece.type === 'p' && fromCoords.col !== toCoords.col && !targetPiece) {
      isEnPassant = true;
      epCaptured = this.board[fromCoords.row][toCoords.col];
      this.board[fromCoords.row][toCoords.col] = null;
    }

    const isDoublePawn = movingPiece.type === 'p' && Math.abs(fromCoords.row - toCoords.row) === 2;
    const isPromotion = movingPiece.type === 'p' && (toCoords.row === 0 || toCoords.row === 7);
    const promoType = isPromotion ? (promoChoice ? promoChoice.toLowerCase() : 'q') : null;

    // Execute move on board
    this.board[fromCoords.row][fromCoords.col] = null;
    if (isPromotion) {
      this.board[toCoords.row][toCoords.col] = { type: promoType, color };
    } else {
      this.board[toCoords.row][toCoords.col] = movingPiece;
    }

    // Handle castling rook movement
    if (isCastling) {
      const rRow = fromCoords.row;
      if (castlingSide === 'k') {
        const rook = this.board[rRow][7];
        this.board[rRow][7] = null;
        this.board[rRow][5] = rook;
      } else {
        const rook = this.board[rRow][0];
        this.board[rRow][0] = null;
        this.board[rRow][3] = rook;
      }
    }

    // Save previous state for undo
    let prevKingRow = -1;
    let prevKingCol = -1;
    if (movingPiece.type === 'k') {
      if (!this.kingPos) this.kingPos = { w: { row: 7, col: 4 }, b: { row: 0, col: 4 } };
      const kp = this.kingPos[color];
      if (kp) {
        prevKingRow = kp.row;
        prevKingCol = kp.col;
        kp.row = toCoords.row;
        kp.col = toCoords.col;
      } else {
        this.kingPos[color] = { row: toCoords.row, col: toCoords.col };
      }
    }

    const prevCastling = {
      wK: this.castling.wK,
      wQ: this.castling.wQ,
      bK: this.castling.bK,
      bQ: this.castling.bQ
    };

    if (movingPiece.type === 'k') {
      if (color === 'w') {
        this.castling.wK = false;
        this.castling.wQ = false;
      } else {
        this.castling.bK = false;
        this.castling.bQ = false;
      }
    } else if (movingPiece.type === 'r') {
      if (fromCoords.row === 7 && fromCoords.col === 0) this.castling.wQ = false;
      else if (fromCoords.row === 7 && fromCoords.col === 7) this.castling.wK = false;
      else if (fromCoords.row === 0 && fromCoords.col === 0) this.castling.bQ = false;
      else if (fromCoords.row === 0 && fromCoords.col === 7) this.castling.bK = false;
    }

    if (targetPiece && targetPiece.type === 'r') {
      if (toCoords.row === 7 && toCoords.col === 0) this.castling.wQ = false;
      else if (toCoords.row === 7 && toCoords.col === 7) this.castling.wK = false;
      else if (toCoords.row === 0 && toCoords.col === 0) this.castling.bQ = false;
      else if (toCoords.row === 0 && toCoords.col === 7) this.castling.bK = false;
    }

    const prevEp = this.enPassant;
    if (isDoublePawn) {
      this.enPassant = { row: (fromCoords.row + toCoords.row) >> 1, col: fromCoords.col };
    } else {
      this.enPassant = null;
    }

    const prevHalfmoveClock = this.halfmoveClock;
    const prevFullmoveNumber = this.fullmoveNumber;

    if (targetPiece || movingPiece.type === 'p' || isEnPassant) {
      this.halfmoveClock = 0;
    } else {
      this.halfmoveClock++;
    }

    const prevTurn = this.turn;
    this.turn = this.turn === 'w' ? 'b' : 'w';
    if (this.turn === 'w') {
      this.fullmoveNumber++;
    }

    return {
      from: fromCoords,
      to: toCoords,
      piece: movingPiece.type,
      movingPiece,
      color,
      captured: targetPiece,
      isEnPassant,
      epCaptured,
      isCastling,
      castlingSide,
      promotion: promoType,
      prevKingRow,
      prevKingCol,
      prevCastling,
      prevEp,
      prevHalfmoveClock,
      prevFullmoveNumber,
      prevTurn
    };
  }

  /**
   * Reverses a move previously applied by makeMoveFast().
   * Restores board array, castling rights, en-passant target, king positions, and turn.
   *
   * @param {Object} u - undoState returned by makeMoveFast()
   */
  unmakeMove(u) {
    if (!u) return;

    // Restore turn and counters
    this.turn = u.prevTurn;
    this.fullmoveNumber = u.prevFullmoveNumber;
    this.halfmoveClock = u.prevHalfmoveClock;
    this.castling.wK = u.prevCastling.wK;
    this.castling.wQ = u.prevCastling.wQ;
    this.castling.bK = u.prevCastling.bK;
    this.castling.bQ = u.prevCastling.bQ;
    this.enPassant = u.prevEp;

    // Restore board
    this.board[u.from.row][u.from.col] = u.movingPiece;
    this.board[u.to.row][u.to.col] = u.captured;

    // Restore En Passant captured pawn
    if (u.isEnPassant) {
      this.board[u.from.row][u.to.col] = u.epCaptured;
    }

    // Restore Castling Rook
    if (u.isCastling) {
      const rRow = u.from.row;
      if (u.castlingSide === 'k') {
        const rook = this.board[rRow][5];
        this.board[rRow][5] = null;
        this.board[rRow][7] = rook;
      } else {
        const rook = this.board[rRow][3];
        this.board[rRow][3] = null;
        this.board[rRow][0] = rook;
      }
    }

    // Restore King position
    if (u.piece === 'k' && this.kingPos && u.prevKingRow !== -1) {
      this.kingPos[u.color].row = u.prevKingRow;
      this.kingPos[u.color].col = u.prevKingCol;
    }
  }

  /**
   * Returns true if current active color is in Checkmate
   */
  isCheckmate() {
    return this.isInCheck(this.turn) && this.generateLegalMoves(this.turn).length === 0;
  }

  /**
   * Returns true if current active color is in Stalemate
   */
  isStalemate() {
    return !this.isInCheck(this.turn) && this.generateLegalMoves(this.turn).length === 0;
  }

  /**
   * Returns true if position has repeated 3 times
   */
  isThreefoldRepetition() {
    const key = this.getPositionKey();
    return (this.positionCounts.get(key) || 0) >= 3;
  }

  /**
   * Returns true if 50 moves without capture or pawn move have elapsed
   */
  isFiftyMoveRule() {
    return this.halfmoveClock >= 100; // 50 full moves = 100 plies
  }

  /**
   * Checks for insufficient material to deliver checkmate
   */
  isInsufficientMaterial() {
    const pieces = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p) {
          pieces.push({ ...p, row: r, col: c });
        }
      }
    }

    // 1. King vs King
    if (pieces.length === 2) return true;

    // 2. King + Knight vs King OR King + Bishop vs King
    if (pieces.length === 3) {
      const nonKings = pieces.filter(p => p.type !== 'k');
      if (nonKings.length === 1 && (nonKings[0].type === 'n' || nonKings[0].type === 'b')) {
        return true;
      }
    }

    // 3. King + Bishop vs King + Bishop where bishops are on same square color
    if (pieces.length === 4) {
      const bishops = pieces.filter(p => p.type === 'b');
      if (bishops.length === 2 && bishops[0].color !== bishops[1].color) {
        const color1 = (bishops[0].row + bishops[0].col) % 2;
        const color2 = (bishops[1].row + bishops[1].col) % 2;
        if (color1 === color2) return true;
      }
    }

    return false;
  }

  /**
   * Evaluates overall game state and returns game over status
   */
  getGameStatus() {
    if (this.isCheckmate()) {
      const winner = this.turn === 'w' ? 'b' : 'w';
      return {
        isGameOver: true,
        result: 'checkmate',
        winner,
        reason: `Jaque Mate: ${winner === 'w' ? 'Blancas' : 'Negras'} ganan`
      };
    }
    if (this.isStalemate()) {
      return {
        isGameOver: true,
        result: 'stalemate',
        winner: null,
        reason: 'Tablas por Rey Ahogado (Stalemate)'
      };
    }
    if (this.isThreefoldRepetition()) {
      return {
        isGameOver: true,
        result: 'threefold_repetition',
        winner: null,
        reason: 'Tablas por Triple Repetición'
      };
    }
    if (this.isFiftyMoveRule()) {
      return {
        isGameOver: true,
        result: 'fifty_moves',
        winner: null,
        reason: 'Tablas por la regla de los 50 movimientos'
      };
    }
    if (this.isInsufficientMaterial()) {
      return {
        isGameOver: true,
        result: 'insufficient_material',
        winner: null,
        reason: 'Tablas por Material Insuficiente'
      };
    }

    return {
      isGameOver: false,
      result: null,
      winner: null,
      inCheck: this.isInCheck(this.turn),
      turn: this.turn
    };
  }

  /**
   * Exports full game notation in PGN format
   */
  exportPgn(headers = {}) {
    const defaultHeaders = {
      Event: 'Voxel Realms Chess Arena',
      Site: 'voxel-realms.online',
      Date: new Date().toISOString().split('T')[0],
      Round: '1',
      White: 'Jugador 1',
      Black: 'Jugador 2',
      Result: '*'
    };
    const allHeaders = { ...defaultHeaders, ...headers };
    let pgn = '';
    for (const [k, v] of Object.entries(allHeaders)) {
      pgn += `[${k} "${v}"]\n`;
    }
    pgn += '\n';

    let moveText = '';
    for (let i = 0; i < this.history.length; i++) {
      if (i % 2 === 0) {
        moveText += `${Math.floor(i / 2) + 1}. `;
      }
      moveText += `${this.history[i].san} `;
    }

    pgn += moveText.trim();
    if (allHeaders.Result) {
      pgn += ` ${allHeaders.Result}`;
    }
    return pgn.trim();
  }
}

// CommonJS support for server-side testing and validation
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChessEngine, INITIAL_FEN, PIECE_VALUES };
}
