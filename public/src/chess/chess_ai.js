/**
 * Grandmaster Chess - Hybrid AI Engine with Deep Learning, MCTS, Opening Book & Alpha-Beta Fallback
 * 5 Difficulty levels: Novice (1), Casual (2), Intermediate (3), Advanced (4), Master (5)
 * Conforms to Specifications 151-179 of CHESS_200_SPEC_PLAN.md.
 */

import { ChessEngine, PIECE_VALUES } from './chess_engine.js';
import { ChessNN } from './chess_nn.js';
import { ChessZobrist, TranspositionTable, TT_FLAG } from './chess_zobrist.js';
import { ChessMCTS } from './chess_mcts.js';
import { ChessBook } from './chess_book.js';

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
    constructor(options = {}) {
        this.transpositionTable = new TranspositionTable(18); // 262,144 slots
        this.nodesEvaluated = 0;
        this.book = options.book || new ChessBook();
        this.nn = options.nn || new ChessNN();
        this.mcts = options.mcts || new ChessMCTS(this.nn);
    }

    /**
     * Converts a move's from/to coordinates into algebraic strings ('e2', 'e4')
     */
    static normalizeMove(move, score = 0, meta = {}) {
        if (!move) return null;
        const fromStr = typeof move.from === 'string' ? move.from : ChessEngine.coordsToSquare(move.from.row, move.from.col);
        const toStr = typeof move.to === 'string' ? move.to : ChessEngine.coordsToSquare(move.to.row, move.to.col);
        return {
            from: fromStr,
            to: toStr,
            promotion: move.promotion || 'q',
            score,
            ...meta
        };
    }

    /**
     * Finds the best move for current active player
     * @param {ChessEngine} engine
     * @param {number|object} levelOrOptions - level (1-5) or options object
     * @returns {Promise<{from: string, to: string, promotion: string, score: number}>}
     */
    async findBestMove(engine, levelOrOptions = 3) {
        this.nodesEvaluated = 0;

        const options = typeof levelOrOptions === 'object'
            ? levelOrOptions
            : { level: levelOrOptions };

        const level = options.level !== undefined ? options.level : 3;
        const useBook = options.useBook !== false;
        const useNN = options.useNN !== false;
        const mctsSims = options.mctsSims || (level === 5 ? 200 : 100);
        const temperature = options.temperature !== undefined ? options.temperature : 0.8;

        const legalMoves = engine.generateLegalMoves(engine.turn);
        if (legalMoves.length === 0) return null;

        // 1. Opening Book Lookup (Level >= 2 and useBook enabled)
        if (useBook && level >= 2) {
            const bookMove = this.book.findBookMove(engine, temperature);
            if (bookMove) {
                // Verify move is strictly legal in current position
                const isLegal = legalMoves.some(m => {
                    const fromStr = typeof m.from === 'string' ? m.from : ChessEngine.coordsToSquare(m.from.row, m.from.col);
                    const toStr = typeof m.to === 'string' ? m.to : ChessEngine.coordsToSquare(m.to.row, m.to.col);
                    return fromStr === bookMove.from && toStr === bookMove.to;
                });
                if (isLegal) {
                    return ChessAI.normalizeMove(bookMove, 0, {
                        bookMove: true,
                        eco: bookMove.eco,
                        name: bookMove.name,
                        san: bookMove.san
                    });
                }
            }
        }

        // 2. Level 1: Novice (Fast, casual, 60% random, 40% 1-ply)
        if (level === 1) {
            if (Math.random() < 0.6) {
                const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
                return ChessAI.normalizeMove(move, 0);
            }
            return this.search1Ply(engine, legalMoves);
        }

        // 3. Level 2: Casual (Depth 2 Minimax)
        if (level === 2) {
            return this.searchMinimax(engine, 2, false);
        }

        // 4. Level 3: Intermediate (Depth 3 + Quiescence)
        if (level === 3) {
            return this.searchMinimax(engine, 3, true);
        }

        // 5. Level 4: Advanced (Depth 4 + Quiescence)
        if (level === 4) {
            return this.searchMinimax(engine, 4, true);
        }

        // 6. Level 5: Master Mode (Deep MCTS with Neural Network or Alpha-Beta fallback)
        if (useNN) {
            const mctsResult = this.mcts.search(engine, {
                simulations: mctsSims,
                temperature: 0.0,
                addNoise: false
            });
            if (mctsResult && mctsResult.bestMove) {
                const score = Math.round(mctsResult.rootValue * 100);
                return ChessAI.normalizeMove(mctsResult.bestMove, score, {
                    mcts: true,
                    nodesEvaluated: mctsResult.totalSimulations
                });
            }
        }

        // Fallback to Iterative Deepening Minimax
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

        const hash = ChessZobrist.computeHash(engine);
        const ttEntry = this.transpositionTable.get(hash);
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === TT_FLAG.EXACT) return ttEntry.score;
            if (ttEntry.flag === TT_FLAG.LOWER_BOUND && ttEntry.score >= beta) return ttEntry.score;
            if (ttEntry.flag === TT_FLAG.UPPER_BOUND && ttEntry.score <= alpha) return ttEntry.score;
        }

        if (depth <= 0) {
            let score;
            if (useQuiescence) {
                score = this.quiescence(engine, alpha, beta, 3, isWhiteTurn);
            } else {
                const evalScore = this.evaluatePosition(engine);
                score = isWhiteTurn ? evalScore : -evalScore;
            }
            this.transpositionTable.set(hash, depth, score, TT_FLAG.EXACT, null);
            return score;
        }

        if (engine.isCheckmate()) {
            return -20000 - depth;
        }
        if (engine.isStalemate() || engine.isThreefoldRepetition() || engine.isFiftyMoveRule()) {
            return 0;
        }

        const moves = this.orderMoves(engine, engine.generateLegalMoves(engine.turn), ttEntry ? ttEntry.bestMove : null);
        if (moves.length === 0) {
            if (engine.isInCheck(engine.turn)) return -20000 - depth;
            return 0;
        }

        let maxScore = -Infinity;
        let bestLocalMove = null;
        const alphaOrig = alpha;

        for (const move of moves) {
            const clone = engine.clone();
            clone.makeMove(move.from, move.to, move.promotion || 'q');

            const score = -this.minimax(clone, depth - 1, -beta, -alpha, !isWhiteTurn, useQuiescence);

            if (score > maxScore) {
                maxScore = score;
                bestLocalMove = move;
            }
            if (score > alpha) {
                alpha = score;
            }
            if (alpha >= beta) {
                break; // Beta cutoff
            }
        }

        let flag = TT_FLAG.EXACT;
        if (maxScore <= alphaOrig) {
            flag = TT_FLAG.UPPER_BOUND;
        } else if (maxScore >= beta) {
            flag = TT_FLAG.LOWER_BOUND;
        }
        this.transpositionTable.set(hash, depth, maxScore, flag, bestLocalMove);

        return maxScore;
    }

    quiescence(engine, alpha, beta, maxQDepth, isWhiteTurn) {
        this.nodesEvaluated++;

        const standPat = isWhiteTurn ? this.evaluatePosition(engine) : -this.evaluatePosition(engine);
        if (standPat >= beta) return beta;
        if (alpha < standPat) alpha = standPat;
        if (maxQDepth <= 0) return standPat;

        const legal = engine.generateLegalMoves(engine.turn);
        const captures = legal.filter(m => Boolean(m.captured));
        const orderedCaptures = this.orderMoves(engine, captures);

        for (const move of orderedCaptures) {
            const clone = engine.clone();
            clone.makeMove(move.from, move.to, move.promotion || 'q');

            const score = -this.quiescence(clone, -beta, -alpha, maxQDepth - 1, !isWhiteTurn);

            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }

        return alpha;
    }

    /**
     * Orders moves for maximum alpha-beta pruning efficiency
     * Checks TT best move, MVV-LVA for captures, promotions, and checks
     */
    orderMoves(engine, moves, ttBestMove = null) {
        return moves.map(m => {
            let priority = 0;

            if (ttBestMove) {
                const fStr = typeof m.from === 'string' ? m.from : ChessEngine.coordsToSquare(m.from.row, m.from.col);
                const tStr = typeof m.to === 'string' ? m.to : ChessEngine.coordsToSquare(m.to.row, m.to.col);
                const bfStr = typeof ttBestMove.from === 'string' ? ttBestMove.from : ChessEngine.coordsToSquare(ttBestMove.from.row, ttBestMove.from.col);
                const btStr = typeof ttBestMove.to === 'string' ? ttBestMove.to : ChessEngine.coordsToSquare(ttBestMove.to.row, ttBestMove.to.col);
                if (fStr === bfStr && tStr === btStr) {
                    priority += 10000;
                }
            }

            if (m.captured) {
                const victimVal = PIECE_VALUES[m.captured.type] || 0;
                const attackerVal = PIECE_VALUES[m.piece] || 0;
                priority += 1000 + (victimVal * 10 - attackerVal);
            }

            if (m.promotion) {
                priority += 900;
            }

            if (m.isCastling) {
                priority += 60;
            }

            return { move: m, priority };
        })
        .sort((a, b) => b.priority - a.priority)
        .map(item => item.move);
    }

    /**
     * Classical & Positional board evaluation
     * Material + Piece Square Tables + Positional heuristics (Bishop pair, open files, mobility)
     * Positive = advantage for White, Negative = advantage for Black
     */
    evaluatePosition(engine) {
        let score = 0;
        let whitePiecesCount = 0;
        let blackPiecesCount = 0;

        let whiteBishops = 0;
        let blackBishops = 0;
        const whiteRookFiles = [];
        const blackRookFiles = [];

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = engine.board[r][c];
                if (p) {
                    if (p.color === 'w') {
                        whitePiecesCount++;
                        if (p.type === 'b') whiteBishops++;
                        if (p.type === 'r') whiteRookFiles.push(c);
                    } else {
                        blackPiecesCount++;
                        if (p.type === 'b') blackBishops++;
                        if (p.type === 'r') blackRookFiles.push(c);
                    }
                }
            }
        }
        const isEndgame = (whitePiecesCount + blackPiecesCount) <= 12;

        // Bishop pair bonus (+35 cp)
        if (whiteBishops >= 2) score += 35;
        if (blackBishops >= 2) score -= 35;

        // Rook on open / semi-open files (+20 cp)
        for (const file of whiteRookFiles) {
            let hasWhitePawn = false;
            let hasBlackPawn = false;
            for (let r = 0; r < 8; r++) {
                const piece = engine.board[r][file];
                if (piece && piece.type === 'p') {
                    if (piece.color === 'w') hasWhitePawn = true;
                    else hasBlackPawn = true;
                }
            }
            if (!hasWhitePawn && !hasBlackPawn) score += 25; // Open file
            else if (!hasWhitePawn) score += 15;            // Semi-open file
        }

        for (const file of blackRookFiles) {
            let hasWhitePawn = false;
            let hasBlackPawn = false;
            for (let r = 0; r < 8; r++) {
                const piece = engine.board[r][file];
                if (piece && piece.type === 'p') {
                    if (piece.color === 'w') hasWhitePawn = true;
                    else hasBlackPawn = true;
                }
            }
            if (!hasWhitePawn && !hasBlackPawn) score -= 25;
            else if (!hasBlackPawn) score -= 15;
        }

        // Material & Piece-Square Tables
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

// CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ChessAI
    };
}
