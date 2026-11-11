/**
 * Grandmaster Chess - Minimax AI Engine with Alpha-Beta Pruning & Quiescence Search
 * 5 Difficulty levels: Novice (1), Casual (2), Intermediate (3), Advanced (4), Master (5)
 */

import { ChessEngine, PIECE_VALUES } from './chess_engine.js';

// Piece-Square Tables (PST) from White's perspective (row 0 = rank 8, row 7 = rank 1)
const PAWN_PST = [
    0,   0,   0,   0,   0,   0,   0,   0,  // rank 8
   50,  50,  50,  50,  50,  50,  50,  50,  // rank 7
   10,  10,  20,  30,  30,  20,  10,  10,  // rank 6
    5,   5,  10,  25,  25,  10,   5,   5,  // rank 5
    0,   0,   0,  20,  20,   0,   0,   0,  // rank 4
    5,  -5, -10,   0,   0, -10,  -5,   5,  // rank 3
    5,  10,  10, -20, -20,  10,  10,   5,  // rank 2
    0,   0,   0,   0,   0,   0,   0,   0   // rank 1
];

const KNIGHT_PST = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20,   0,   0,   0,   0, -20, -40,
  -30,   0,  10,  15,  15,  10,   0, -30,
  -30,   5,  15,  20,  20,  15,   5, -30,
  -30,   0,  15,  20,  20,  15,   0, -30,
  -30,   5,  10,  15,  15,  10,   5, -30,
  -40, -20,   0,   5,   5,   0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50
];

const BISHOP_PST = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10,   0,   5,   0,   0,   5,   0, -10,
  -10,  10,  10,  10,  10,  10,  10, -10,
  -10,   0,  10,  10,  10,  10,   0, -10,
  -10,   5,   5,  10,  10,   5,   5, -10,
  -10,   0,   5,  10,  10,   5,   0, -10,
  -10,   5,   0,   0,   0,   0,   5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20
];

const ROOK_PST = [
    0,   0,   0,   0,   0,   0,   0,   0,
    5,  10,  10,  10,  10,  10,  10,   5,
   -5,   0,   0,   0,   0,   0,   0,  -5,
   -5,   0,   0,   0,   0,   0,   0,  -5,
   -5,   0,   0,   0,   0,   0,   0,  -5,
   -5,   0,   0,   0,   0,   0,   0,  -5,
   -5,   0,   0,   0,   0,   0,   0,  -5,
    0,   0,   0,   5,   5,   0,   0,   0
];

const QUEEN_PST = [
  -20, -10, -10,  -5,  -5, -10, -10, -20,
  -10,   0,   0,   0,   0,   0,   0, -10,
  -10,   0,   5,   5,   5,   5,   0, -10,
   -5,   0,   5,   5,   5,   5,   0,  -5,
    0,   0,   5,   5,   5,   5,   0,  -5,
  -10,   5,   5,   5,   5,   5,   0, -10,
  -10,   0,   5,   0,   0,   0,   0, -10,
  -20, -10, -10,  -5,  -5, -10, -10, -20
];

const KING_MID_PST = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
   20,  20,   0,   0,   0,   0,  20,  20,
   20,  30,  10,   0,   0,  10,  30,  20
];

const KING_END_PST = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10,   0,   0, -10, -20, -30,
  -30, -10,  20,  30,  30,  20, -10, -30,
  -30, -10,  30,  40,  40,  30, -10, -30,
  -30, -10,  30,  40,  40,  30, -10, -30,
  -30, -10,  20,  30,  30,  20, -10, -30,
  -30, -30,   0,   0,   0,   0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50
];

export class ChessAI {
    constructor() {
        this.transpositionTable = new Map();
        this.nodesEvaluated = 0;
    }

    /**
     * Converts a move's from/to coordinates into algebraic strings ('e2', 'e4')
     */
    static normalizeMove(move, score = 0) {
        if (!move) return null;
        const fromStr = typeof move.from === 'string' ? move.from : ChessEngine.coordsToSquare(move.from.row, move.from.col);
        const toStr = typeof move.to === 'string' ? move.to : ChessEngine.coordsToSquare(move.to.row, move.to.col);
        return {
            from: fromStr,
            to: toStr,
            promotion: move.promotion || 'q',
            score
        };
    }

    /**
     * Finds the best move for current active player
     * @param {ChessEngine} engine
     * @param {number} level 1 to 5
     * @returns {Promise<{from: string, to: string, promotion: string, score: number}>}
     */
    async findBestMove(engine, level = 3) {
        this.nodesEvaluated = 0;
        this.transpositionTable.clear();

        const legalMoves = engine.generateLegalMoves(engine.turn);
        if (legalMoves.length === 0) return null;

        // Level 1: Novice (Fast, casual, 60% random, 40% 1-ply)
        if (level === 1) {
            if (Math.random() < 0.6) {
                const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
                return ChessAI.normalizeMove(move, 0);
            }
            return this.search1Ply(engine, legalMoves);
        }

        // Level 2: Casual (Depth 2)
        if (level === 2) {
            return this.searchMinimax(engine, 2, false);
        }

        // Level 3: Intermediate (Depth 3 + Quiescence)
        if (level === 3) {
            return this.searchMinimax(engine, 3, true);
        }

        // Level 4: Advanced (Depth 4 + Quiescence)
        if (level === 4) {
            return this.searchMinimax(engine, 4, true);
        }

        // Level 5: Master (Depth 5 with iterative deepening)
        return this.searchIterativeDeepening(engine, 5);
    }

    search1Ply(engine, legalMoves) {
        let bestScore = -Infinity;
        let bestMove = legalMoves[0];
        const isWhite = engine.turn === 'w';

        for (const move of legalMoves) {
            const clone = engine.clone();
            clone.makeMove(move.from, move.to, move.promotion || 'q');
            let score = this.evaluatePosition(clone);
            if (!isWhite) score = -score;
            score += (Math.random() - 0.5) * 20; // Human-like variance
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        return ChessAI.normalizeMove(bestMove, isWhite ? bestScore : -bestScore);
    }

    searchMinimax(engine, depth, useQuiescence = true) {
        const isWhite = engine.turn === 'w';
        let bestMove = null;
        let alpha = -Infinity;
        let beta = Infinity;

        const moves = this.orderMoves(engine, engine.generateLegalMoves(engine.turn));
        let bestScore = -Infinity;

        for (const move of moves) {
            const clone = engine.clone();
            clone.makeMove(move.from, move.to, move.promotion || 'q');

            const score = -this.minimax(clone, depth - 1, -beta, -alpha, !isWhite, useQuiescence);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
            if (score > alpha) {
                alpha = score;
            }
        }

        return ChessAI.normalizeMove(bestMove, isWhite ? bestScore : -bestScore);
    }

    async searchIterativeDeepening(engine, maxDepth = 5) {
        let bestMove = null;

        for (let d = 1; d <= maxDepth; d++) {
            const result = this.searchMinimax(engine, d, true);
            bestMove = result;
            if (d >= 4) {
                await new Promise(r => setTimeout(r, 0));
            }
        }
        return bestMove;
    }

    minimax(engine, depth, alpha, beta, isWhiteTurn, useQuiescence) {
        this.nodesEvaluated++;

        if (depth <= 0) {
            if (useQuiescence) {
                return this.quiescence(engine, alpha, beta, 3, isWhiteTurn);
            }
            const evalScore = this.evaluatePosition(engine);
            return isWhiteTurn ? evalScore : -evalScore;
        }

        if (engine.isCheckmate()) {
            return -20000 - depth;
        }
        if (engine.isStalemate() || engine.isThreefoldRepetition() || engine.isFiftyMoveRule()) {
            return 0;
        }

        const moves = this.orderMoves(engine, engine.generateLegalMoves(engine.turn));
        if (moves.length === 0) {
            if (engine.isInCheck(engine.turn)) return -20000 - depth;
            return 0;
        }

        let maxScore = -Infinity;

        for (const move of moves) {
            const clone = engine.clone();
            clone.makeMove(move.from, move.to, move.promotion || 'q');

            const score = -this.minimax(clone, depth - 1, -beta, -alpha, !isWhiteTurn, useQuiescence);

            if (score > maxScore) {
                maxScore = score;
            }
            if (score > alpha) {
                alpha = score;
            }
            if (alpha >= beta) {
                break; // Beta cutoff
            }
        }

        return maxScore;
    }

    quiescence(engine, alpha, beta, qdepth, isWhiteTurn) {
        this.nodesEvaluated++;

        const standPat = isWhiteTurn ? this.evaluatePosition(engine) : -this.evaluatePosition(engine);
        if (qdepth <= 0) return standPat;

        if (standPat >= beta) return beta;
        if (standPat > alpha) alpha = standPat;

        const captures = engine.generateLegalMoves(engine.turn).filter(m => Boolean(m.captured) || m.promotion);
        const ordered = this.orderMoves(engine, captures);

        for (const move of ordered) {
            const clone = engine.clone();
            clone.makeMove(move.from, move.to, move.promotion || 'q');

            const score = -this.quiescence(clone, -beta, -alpha, qdepth - 1, !isWhiteTurn);

            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }

        return alpha;
    }

    orderMoves(engine, moves) {
        return moves.sort((a, b) => {
            const scoreA = this.scoreMoveForOrdering(a);
            const scoreB = this.scoreMoveForOrdering(b);
            return scoreB - scoreA;
        });
    }

    scoreMoveForOrdering(move) {
        let score = 0;
        if (move.captured) {
            const victimVal = PIECE_VALUES[move.captured.type] || 0;
            const attackerVal = PIECE_VALUES[move.piece ? move.piece.type : 'p'] || 0;
            score += 1000 + (victimVal * 10 - attackerVal);
        }
        if (move.promotion) {
            score += 900;
        }
        if (move.isCastling) {
            score += 60;
        }
        return score;
    }

    evaluatePosition(engine) {
        if (engine.isCheckmate()) {
            return engine.turn === 'w' ? -20000 : 20000;
        }
        if (engine.isStalemate() || engine.isThreefoldRepetition() || engine.isFiftyMoveRule()) {
            return 0;
        }

        let score = 0;
        let whitePiecesCount = 0;
        let blackPiecesCount = 0;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = engine.board[r][c];
                if (piece) {
                    if (piece.color === 'w') whitePiecesCount++;
                    else blackPiecesCount++;
                }
            }
        }
        const isEndgame = (whitePiecesCount + blackPiecesCount) <= 12;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = engine.board[r][c];
                if (!piece) continue;

                const isWhite = piece.color === 'w';
                const pType = piece.type;
                const baseValue = PIECE_VALUES[pType] || 0;

                const sq = r * 8 + c;
                const tableSq = isWhite ? sq : ((7 - r) * 8 + c);
                let pstVal = 0;

                switch (pType) {
                    case 'p':
                        pstVal = PAWN_PST[tableSq];
                        break;
                    case 'n':
                        pstVal = KNIGHT_PST[tableSq];
                        break;
                    case 'b':
                        pstVal = BISHOP_PST[tableSq];
                        break;
                    case 'r':
                        pstVal = ROOK_PST[tableSq];
                        break;
                    case 'q':
                        pstVal = QUEEN_PST[tableSq];
                        break;
                    case 'k':
                        pstVal = isEndgame ? KING_END_PST[tableSq] : KING_MID_PST[tableSq];
                        break;
                }

                const total = baseValue + pstVal;
                score += isWhite ? total : -total;
            }
        }

        return score;
    }
}
