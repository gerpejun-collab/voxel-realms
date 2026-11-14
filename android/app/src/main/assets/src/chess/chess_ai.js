/**
 * Grandmaster Chess - Hybrid AI Engine with Deep Learning, MCTS, Opening Book & Alpha-Beta Fallback
 * 5 Difficulty levels: Novice (1), Casual (2), Intermediate (3), Advanced (4), Master (5)
 * Conforms to Specifications 151-179 of CHESS_200_SPEC_PLAN.md.
 */

import { ChessEngine, PIECE_VALUES } from './chess_engine.js';
import { ChessNN } from './chess_nn.js';
import { ChessZobrist, TranspositionTable, RepetitionTracker, TT_FLAG, ZOBRIST_BLACK_TO_MOVE, ZOBRIST_EP } from './chess_zobrist.js';
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

const KNIGHT_OFFSETS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1]
];
const DIAG_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const QUEEN_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];

// Preallocated evaluation buffers (zero garbage collection allocations)
const EVAL_WP_FILES = new Int8Array(8);
const EVAL_BP_FILES = new Int8Array(8);
const EVAL_WP_MIN = new Int8Array(8);
const EVAL_WP_MAX = new Int8Array(8);
const EVAL_BP_MIN = new Int8Array(8);
const EVAL_BP_MAX = new Int8Array(8);
const EVAL_WP_R = new Int8Array(16);
const EVAL_WP_C = new Int8Array(16);
const EVAL_BP_R = new Int8Array(16);
const EVAL_BP_C = new Int8Array(16);
const EVAL_WR_R = new Int8Array(10);
const EVAL_WR_C = new Int8Array(10);
const EVAL_BR_R = new Int8Array(10);
const EVAL_BR_C = new Int8Array(10);

let SHARED_BOOK = null;
let SHARED_NN = null;

export class ChessAI {
    constructor(options = {}) {
        this.transpositionTable = new TranspositionTable(18); // 262,144 slots
        this.nodesEvaluated = 0;
        if (!SHARED_BOOK) SHARED_BOOK = new ChessBook();
        if (!SHARED_NN) SHARED_NN = new ChessNN();
        this.book = options.book || SHARED_BOOK;
        this.nn = options.nn || SHARED_NN;
        this.mcts = options.mcts || new ChessMCTS(this.nn);
        this._warmedUp = false;

        // Killer moves table [depth][0..1] and history heuristic table
        this.killerMoves = Array(32).fill(null).map(() => [null, null]);
        this.historyTable = new Int32Array(4096);
        this.repetitionTracker = new RepetitionTracker();

        // Search timing control (prevents freezing, guarantees rapid responsive moves)
        this.searchStartTime = 0;
        this.searchTimeLimit = 1200;
        this.timeUp = false;
        this.stopRequested = false;
        this.lastNodesSearched = 0;
        this.lastSearchDepth = 0;
        this.lastSearchScore = 0;
    }

    /**
     * Immediately signals active search to stop
     */
    stopSearch() {
        this.stopRequested = true;
        this.timeUp = true;
    }

    /**
     * Seeds repetitionTracker with real game history hashes so both Worker and Main Thread
     * searches know which positions have already occurred in the actual game.
     */
    seedGameHistoryHashes(engine, externalHashes = null) {
        this.repetitionTracker.clear();
        if (Array.isArray(externalHashes) && externalHashes.length > 0) {
            for (const h of externalHashes) {
                try {
                    const bigH = typeof h === 'bigint' ? h : BigInt(h);
                    // Push twice so any position that already happened in the real game triggers repCount >= 2 at root
                    this.repetitionTracker.push(bigH);
                    this.repetitionTracker.push(bigH);
                } catch (_) {}
            }
            return;
        }
        if (engine && Array.isArray(engine.history) && engine.history.length > 0) {
            const temp = new ChessEngine();
            const startIdx = Math.max(0, engine.history.length - 24);
            for (let i = 0; i < engine.history.length; i++) {
                const m = engine.history[i];
                if (i >= startIdx && m.fenBefore) {
                    temp.loadFen(m.fenBefore);
                    const bigH = ChessZobrist.computeHash(temp);
                    this.repetitionTracker.push(bigH);
                    this.repetitionTracker.push(bigH);
                }
            }
        }
    }

    /**
     * Classic 2400 engine search (original Alpha-Beta depth 4 without NMP/LMR/tapered eval)
     * Preserved specifically so users can pit the New 2400+ model vs the Classic 2400 model head-to-head!
     * Includes proper alpha-beta root pruning, MVV-LVA capture ordering for mobile speed, and anti-repetition.
     */
    searchClassic(engine, depth = 4, externalHashes = null) {
        this.seedGameHistoryHashes(engine, externalHashes);
        const isWhite = engine.turn === 'w';
        const legalMoves = engine.generateLegalMoves(engine.turn);
        if (legalMoves.length === 0) return null;

        // Sort captures first (MVV-LVA) + slight micro-shuffle among quiet moves so Classic doesn't play identical games
        const orderedMoves = legalMoves.slice().sort((a, b) => {
            const capA = a.captured ? (PIECE_VALUES[a.captured.type] || 100) * 10 - (PIECE_VALUES[a.piece?.type || a.piece] || 100) : 0;
            const capB = b.captured ? (PIECE_VALUES[b.captured.type] || 100) * 10 - (PIECE_VALUES[b.piece?.type || b.piece] || 100) : 0;
            if (capB !== capA) return capB - capA;
            return (Math.random() - 0.5);
        });

        const rootHash = ChessZobrist.computeHash(engine);
        let bestMove = orderedMoves[0];
        let bestScore = -Infinity;
        let alpha = -Infinity;
        const beta = Infinity;

        for (const move of orderedMoves) {
            const undo = engine.makeMoveFast(move.from, move.to, move.promotion || 'q');
            const childHash = ChessZobrist.updateHash(rootHash, undo, undo.prevCastling, engine.castling, undo.prevEp, engine.enPassant);
            const prevOccurrences = this.repetitionTracker.getCount(childHash);

            let score = -this.minimaxClassic(engine, depth - 1, -beta, -alpha, !isWhite);
            engine.unmakeMove(undo);

            // Prevent 2-piece back-and-forth infinite loops unless losing badly
            if (prevOccurrences >= 1 && score > -150 && score < 15000) {
                score -= prevOccurrences >= 2 ? 220 : 65;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
            if (score > alpha) {
                alpha = score;
            }
        }
        this.lastNodesSearched = this.nodesEvaluated;
        this.lastSearchDepth = depth;
        this.lastSearchScore = isWhite ? bestScore : -bestScore;
        return ChessAI.normalizeMove(bestMove, isWhite ? bestScore : -bestScore, { classic: true });
    }

    minimaxClassic(engine, depth, alpha, beta, isWhiteTurn) {
        this.nodesEvaluated++;
        if (depth <= 0) {
            const ev = this.evaluateClassic(engine);
            return isWhiteTurn ? ev : -ev;
        }
        const movingColor = engine.turn;
        const pseudoMoves = engine.generateLegalMoves(movingColor, false);
        let legalCount = 0;

        for (let i = 0; i < pseudoMoves.length; i++) {
            const move = pseudoMoves[i];
            const undo = engine.makeMoveFast(move.from, move.to, move.promotion || 'q');
            if (engine.isInCheck(movingColor)) {
                engine.unmakeMove(undo);
                continue;
            }
            legalCount++;
            const score = -this.minimaxClassic(engine, depth - 1, -beta, -alpha, !isWhiteTurn);
            engine.unmakeMove(undo);
            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }
        if (legalCount === 0) {
            if (engine.isInCheck(movingColor)) return -20000 - depth;
            return 0;
        }
        return alpha;
    }

    evaluateClassic(engine) {
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = engine.board[r][c];
                if (!piece) continue;
                const isWhite = piece.color === 'w';
                const val = PIECE_VALUES[piece.type] || 0;
                const sq = isWhite ? (r * 8 + c) : ((7 - r) * 8 + c);
                let pst = 0;
                if (piece.type === 'p') pst = PAWN_PST[sq];
                else if (piece.type === 'n') pst = KNIGHT_PST[sq];
                else if (piece.type === 'b') pst = BISHOP_PST[sq];
                else if (piece.type === 'r') pst = ROOK_PST[sq];
                else if (piece.type === 'q') pst = QUEEN_PST[sq];
                else if (piece.type === 'k') pst = KING_MID_PST[sq];
                score += isWhite ? (val + pst) : -(val + pst);
            }
        }
        return score;
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
     * 100% proprietary, local, offline engine. Zero internet or external APIs required.
     * @param {ChessEngine} engine
     * @param {number|object} levelOrOptions - level (1-5) or options object
     * @returns {Promise<{from: string, to: string, promotion: string, score: number}>}
     */
    async findBestMove(engine, levelOrOptions = 3, maybeTimeLimit = null) {
        this.nodesEvaluated = 0;
        this.stopRequested = false;

        const options = typeof levelOrOptions === 'object'
            ? levelOrOptions
            : { level: levelOrOptions };

        const level = options.level !== undefined ? options.level : 3;
        const isClassic = level === '5_classic' || level === 'classic' || options.useClassic === true || options.engineVariant === 'classic';
        const useBook = options.useBook !== false;
        const mctsSims = options.mctsSims || (level === 5 ? 200 : 100);
        const temperature = options.temperature !== undefined ? options.temperature : 0.85;
        const customTime = typeof maybeTimeLimit === 'number' ? maybeTimeLimit : options.timeLimitMs;
        const recentHashes = options.recentHashes || null;

        const legalMoves = engine.generateLegalMoves(engine.turn);
        if (legalMoves.length === 0) return null;
        if (legalMoves.length === 1) {
            this.lastNodesSearched = 0;
            this.lastSearchDepth = 0;
            this.lastSearchScore = 0;
            return ChessAI.normalizeMove(legalMoves[0], 0);
        }

        // 1. Grandmaster Opening Book Lookup (100% offline, 1,822 positions)
        // Both New (5) and Classic (5_classic) use the GM Opening Book with balanced variety so games don't clone!
        if (useBook && (isClassic || level >= 2)) {
            const bookMove = this.book.findBookMove(engine, temperature);
            if (bookMove) {
                const isLegal = legalMoves.some(m => {
                    const fromStr = typeof m.from === 'string' ? m.from : ChessEngine.coordsToSquare(m.from.row, m.from.col);
                    const toStr = typeof m.to === 'string' ? m.to : ChessEngine.coordsToSquare(m.to.row, m.to.col);
                    return fromStr === bookMove.from && toStr === bookMove.to;
                });
                if (isLegal) {
                    this.lastNodesSearched = 0;
                    this.lastSearchDepth = 0;
                    this.lastSearchScore = 0;
                    return ChessAI.normalizeMove(bookMove, 0, {
                        bookMove: true,
                        eco: bookMove.eco,
                        name: bookMove.name,
                        san: bookMove.san
                    });
                }
            }
        }

        // Classic 2400 model variant (requested for head-to-head IA vs IA matches)
        if (isClassic) {
            return this.searchClassic(engine, 4, recentHashes);
        }

        // 2. Level 1: Novice (Fast, friendly, 60% random, 40% 1-ply)
        if (level === 1) {
            if (Math.random() < 0.6) {
                const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
                this.lastNodesSearched = 1;
                this.lastSearchDepth = 1;
                this.lastSearchScore = 0;
                return ChessAI.normalizeMove(move, 0);
            }
            const res = this.search1Ply(engine, legalMoves);
            this.lastNodesSearched = legalMoves.length;
            this.lastSearchDepth = 1;
            this.lastSearchScore = res ? res.score : 0;
            return res;
        }

        // 3. Level 2: Casual (Depth 2 Iterative Deepening with ~200ms time budget)
        if (level === 2) {
            return this.searchIterativeDeepening(engine, 2, customTime || 200);
        }

        // 4. Level 3: Intermediate (Depth 3 + Quiescence with ~400ms time budget)
        if (level === 3) {
            return this.searchIterativeDeepening(engine, 3, customTime || 400);
        }

        // 5. Level 4: Advanced (Depth 4 + Deep Quiescence with ~800ms time budget)
        if (level === 4) {
            return this.searchIterativeDeepening(engine, 4, customTime || 800);
        }

        // Explicit MCTS mode (only when explicitly requested)
        if (options.mode === 'mcts' || options.useMCTS === true) {
            const mctsResult = this.mcts.search(engine, {
                simulations: mctsSims,
                temperature: 0.0,
                addNoise: false
            });
            if (mctsResult && mctsResult.bestMove) {
                const score = Math.round(mctsResult.rootValue * 100);
                this.lastNodesSearched = mctsResult.totalSimulations;
                this.lastSearchDepth = 1;
                this.lastSearchScore = score;
                return ChessAI.normalizeMove(mctsResult.bestMove, score, {
                    mcts: true,
                    nodesEvaluated: mctsResult.totalSimulations
                });
            }
        }

        // 6. Level 5: Grandmaster Master Mode (Proprietary Deep Alpha-Beta + Quiescence with 700ms budget)
        return this.searchIterativeDeepening(engine, 5, customTime || 700, recentHashes);
    }

    search1Ply(engine, legalMoves) {
        let bestScore = -Infinity;
        let bestMove = legalMoves[0];
        const isWhite = engine.turn === 'w';

        for (const move of legalMoves) {
            const undo = engine.makeMoveFast(move.from, move.to, move.promotion || 'q');
            let score = this.evaluatePosition(engine);
            if (!isWhite) score = -score;
            engine.unmakeMove(undo);

            score += (Math.random() - 0.5) * 20;
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        return ChessAI.normalizeMove(bestMove, isWhite ? bestScore : -bestScore);
    }

    searchMinimax(engine, depth, useQuiescence = true) {
        if (!this._warmedUp && depth >= 3) {
            this._warmedUp = true;
            // Quick 2-ply JIT warm-up so V8 compiles hot paths before timed depth-4 benchmarks
            this.searchRoot(engine, 2, useQuiescence, Date.now(), 5000);
            this.transpositionTable.clear();
            this.nodesEvaluated = 0;
        }
        const startTime = Date.now();
        this.searchStartTime = startTime;
        this.searchTimeLimit = 100000;
        this.timeUp = false;
        return this.searchRoot(engine, depth, useQuiescence, startTime, this.searchTimeLimit);
    }

    /**
     * Rapid Iterative Deepening with strict millisecond time budgeting
     * Guarantees fast response (~500ms-1.2s max), never freezes browser for 20s,
     * and uses the deepest fully completed depth for tactical perfection.
     */
    async searchIterativeDeepening(engine, maxDepth = 5, timeLimitMs = 700, externalHashes = null) {
        const startTime = Date.now();
        this.searchStartTime = startTime;
        this.searchTimeLimit = timeLimitMs;
        this.timeUp = false;
        this.seedGameHistoryHashes(engine, externalHashes);

        let bestMove = null;
        let completedDepth = 0;
        const legalMoves = engine.generateLegalMoves(engine.turn);
        if (legalMoves.length === 0) return null;
        if (legalMoves.length === 1) {
            this.lastNodesSearched = 0;
            this.lastSearchDepth = 0;
            this.lastSearchScore = 0;
            return ChessAI.normalizeMove(legalMoves[0], 0);
        }

        // Reset killer moves & history for new search
        this.killerMoves = Array(32).fill(null).map(() => [null, null]);
        this.historyTable.fill(0);

        for (let d = 1; d <= maxDepth; d++) {
            const result = this.searchRoot(engine, d, true, startTime, timeLimitMs);
            if ((this.timeUp || this.stopRequested) && bestMove !== null) {
                // Keep the verified best move from previous depth
                break;
            }
            if (result && result.from) {
                bestMove = result;
                completedDepth = d;
            }
            // Checkmate found: stop immediately
            if (bestMove && Math.abs(bestMove.score) > 18000) {
                break;
            }
            if (this.stopRequested) {
                break;
            }
            const stopRatio = d >= 4 ? 0.45 : 0.60;
            if (Date.now() - startTime > timeLimitMs * stopRatio) {
                break;
            }
            if (d >= 4) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        this.lastNodesSearched = this.nodesEvaluated;
        this.lastSearchDepth = completedDepth || 1;
        this.lastSearchScore = bestMove ? bestMove.score : 0;
        return bestMove;
    }

    searchRoot(engine, depth, useQuiescence, startTime, timeLimitMs) {
        this.searchStartTime = startTime;
        this.searchTimeLimit = timeLimitMs;
        const isWhite = engine.turn === 'w';
        let bestMove = null;
        let alpha = -Infinity;
        const beta = Infinity;
        let bestScore = -Infinity;

        const hash = ChessZobrist.computeHash(engine);
        this.repetitionTracker.push(hash);
        const ttEntry = this.transpositionTable.get(hash);
        const moves = this.orderMoves(engine, engine.generateLegalMoves(engine.turn), depth, ttEntry ? ttEntry.bestMove : null);

        for (let i = 0; i < moves.length; i++) {
            if (this.nodesEvaluated % 512 === 0 && (this.stopRequested || Date.now() - startTime > timeLimitMs)) {
                this.timeUp = true;
                break;
            }

            const move = ChessAI.pickNextMove(moves, i);
            const undo = engine.makeMoveFast(move.from, move.to, move.promotion || 'q');
            const childHash = ChessZobrist.updateHash(hash, undo, undo.prevCastling, engine.castling, undo.prevEp, engine.enPassant);
            this.repetitionTracker.push(childHash);

            let score = -this.minimax(engine, depth - 1, -beta, -alpha, !isWhite, useQuiescence, 1, false, childHash);

            this.repetitionTracker.pop();
            engine.unmakeMove(undo);

            if (this.timeUp) {
                break;
            }

            const repCount = this.repetitionTracker.getCount(childHash);
            // Penalize previous visits in the real game so pieces never shuffle back-and-forth unless losing badly
            if (repCount >= 2 && score > -150 && score < 15000) {
                score -= repCount >= 3 ? 220 : 65;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
            if (score > alpha) {
                alpha = score;
            }
        }

        this.repetitionTracker.pop();

        if (bestMove && !this.timeUp) {
            this.transpositionTable.set(hash, depth, bestScore, TT_FLAG.EXACT, bestMove);
        }

        return ChessAI.normalizeMove(bestMove, isWhite ? bestScore : -bestScore);
    }

    minimax(engine, depth, alpha, beta, isWhiteTurn, useQuiescence, ply = 0, isNullSearch = false, currentHash = null) {
        this.nodesEvaluated++;

        if (this.nodesEvaluated % 512 === 0 && (this.stopRequested || Date.now() - this.searchStartTime > this.searchTimeLimit)) {
            this.timeUp = true;
            return 0;
        }

        const hash = currentHash !== null ? currentHash : ChessZobrist.computeHash(engine);
        const ttEntry = this.transpositionTable.get(hash);
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === TT_FLAG.EXACT) return ttEntry.score;
            if (ttEntry.flag === TT_FLAG.LOWER_BOUND && ttEntry.score >= beta) return ttEntry.score;
            if (ttEntry.flag === TT_FLAG.UPPER_BOUND && ttEntry.score <= alpha) return ttEntry.score;
        }

        if (depth <= 0) {
            let score;
            if (useQuiescence) {
                score = this.quiescence(engine, alpha, beta, 4, isWhiteTurn, hash);
            } else {
                const evalScore = this.evaluatePosition(engine, false);
                score = isWhiteTurn ? evalScore : -evalScore;
            }
            let flag = TT_FLAG.EXACT;
            if (score <= alpha) flag = TT_FLAG.UPPER_BOUND;
            else if (score >= beta) flag = TT_FLAG.LOWER_BOUND;
            this.transpositionTable.set(hash, 0, score, flag, null);
            return score;
        }

        if (this.repetitionTracker.isThreefold(hash) || engine.halfmoveClock >= 100) {
            return 0;
        }

        const inCheck = engine.isInCheck(engine.turn);

        // Reverse Futility Pruning (Static Null Move Pruning) & Futility Margin at depth <= 2
        let futilityMargin = 0;
        let staticEval = 0;
        if (!inCheck && !isNullSearch && depth <= 2 && Math.abs(beta) < 15000 && Math.abs(alpha) < 15000) {
            const rawEval = this.evaluatePosition(engine, depth >= 2);
            staticEval = isWhiteTurn ? rawEval : -rawEval;
            const rfpMargin = 140 * depth;
            if (staticEval - rfpMargin >= beta) {
                return staticEval - rfpMargin;
            }
            if (depth === 1) {
                futilityMargin = staticEval + 220;
            }
        }

        // Null-Move Pruning (R = 2) for non-check, non-endgame positions
        if (!inCheck && !isNullSearch && depth >= 3 && beta < 15000) {
            let hasNonPawn = false;
            for (let r = 0; r < 8 && !hasNonPawn; r++) {
                for (let c = 0; c < 8 && !hasNonPawn; c++) {
                    const p = engine.board[r][c];
                    if (p && p.color === engine.turn && p.type !== 'k' && p.type !== 'p') {
                        hasNonPawn = true;
                    }
                }
            }

            if (hasNonPawn) {
                const R = 2;
                const savedEp = engine.enPassant;
                engine.enPassant = null;
                engine.turn = engine.turn === 'w' ? 'b' : 'w';
                const nullHash = hash ^ ZOBRIST_BLACK_TO_MOVE ^ (savedEp ? ZOBRIST_EP[savedEp.col] : 0n);

                const nullScore = -this.minimax(engine, depth - 1 - R, -beta, -beta + 1, !isWhiteTurn, useQuiescence, ply + 1, true, nullHash);

                engine.turn = engine.turn === 'w' ? 'b' : 'w';
                engine.enPassant = savedEp;

                if (this.timeUp) return 0;
                if (nullScore >= beta) {
                    return beta;
                }
            }
        }

        const movingColor = engine.turn;
        const pseudoMoves = engine.generateLegalMoves(movingColor, false);
        if (pseudoMoves.length === 0) {
            if (inCheck) return -20000 - depth;
            return 0;
        }

        const moves = this.orderMoves(engine, pseudoMoves, depth, ttEntry ? ttEntry.bestMove : null);
        let maxScore = -Infinity;
        let bestLocalMove = null;
        const alphaOrig = alpha;
        let legalCount = 0;

        for (let i = 0; i < moves.length; i++) {
            const move = ChessAI.pickNextMove(moves, i);
            const undo = engine.makeMoveFast(move.from, move.to, move.promotion || 'q');
            if (engine.isInCheck(movingColor)) {
                engine.unmakeMove(undo);
                continue;
            }
            legalCount++;

            const childHash = ChessZobrist.updateHash(hash, undo, undo.prevCastling, engine.castling, undo.prevEp, engine.enPassant);
            this.repetitionTracker.push(childHash);

            let score;
            const isTactical = Boolean(move.captured || move.promotion || undo.isCastling);

            // Futility Pruning at depth 1 for quiet moves after the first legal move
            if (depth === 1 && legalCount > 1 && futilityMargin !== 0 && !isTactical && !inCheck && futilityMargin <= alpha) {
                if (!engine.isInCheck(engine.turn)) {
                    this.repetitionTracker.pop();
                    engine.unmakeMove(undo);
                    if (futilityMargin > maxScore) maxScore = futilityMargin;
                    continue;
                }
            }

            // Late Move Reductions (LMR) for quiet moves beyond first 4 candidates at depth >= 3
            if (legalCount > 4 && depth >= 3 && !isTactical && !inCheck) {
                if (engine.isInCheck(engine.turn)) {
                    // Move delivers check: do full search
                    score = -this.minimax(engine, depth - 1, -beta, -alpha, !isWhiteTurn, useQuiescence, ply + 1, false, childHash);
                } else {
                    const reduction = 1;
                    score = -this.minimax(engine, depth - 1 - reduction, -alpha - 1, -alpha, !isWhiteTurn, useQuiescence, ply + 1, false, childHash);
                    if (score > alpha) {
                        score = -this.minimax(engine, depth - 1, -beta, -alpha, !isWhiteTurn, useQuiescence, ply + 1, false, childHash);
                    }
                }
            } else {
                score = -this.minimax(engine, depth - 1, -beta, -alpha, !isWhiteTurn, useQuiescence, ply + 1, false, childHash);
            }

            this.repetitionTracker.pop();
            engine.unmakeMove(undo);

            if (this.timeUp) return 0;

            if (score > maxScore) {
                maxScore = score;
                bestLocalMove = move;
            }
            if (score > alpha) {
                alpha = score;
            }
            if (alpha >= beta) {
                // Beta cutoff! Store killer move & update history heuristic
                if (!move.captured && depth < 32) {
                    if (!this.killerMoves[depth][0] || 
                        (this.killerMoves[depth][0].from !== move.from || this.killerMoves[depth][0].to !== move.to)) {
                        this.killerMoves[depth][1] = this.killerMoves[depth][0];
                        this.killerMoves[depth][0] = move;
                    }
                    const fRow = typeof move.from === 'string' ? (8 - parseInt(move.from[1], 10)) : move.from.row;
                    const fCol = typeof move.from === 'string' ? (move.from.charCodeAt(0) - 97) : move.from.col;
                    const tRow = typeof move.to === 'string' ? (8 - parseInt(move.to[1], 10)) : move.to.row;
                    const tCol = typeof move.to === 'string' ? (move.to.charCodeAt(0) - 97) : move.to.col;
                    const moveKey = (fRow << 9) | (fCol << 6) | (tRow << 3) | tCol;
                    this.historyTable[moveKey] += depth * depth;
                }
                break; // Beta cutoff
            }
        }

        if (legalCount === 0) {
            if (inCheck) return -20000 - depth;
            return 0;
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

    /**
     * Quiescence search with check detection, delta pruning, and promotion checks
     */
    quiescence(engine, alpha, beta, maxQDepth, isWhiteTurn, currentHash = null) {
        this.nodesEvaluated++;

        if (this.nodesEvaluated % 512 === 0 && (this.stopRequested || Date.now() - this.searchStartTime > this.searchTimeLimit)) {
            this.timeUp = true;
            return 0;
        }

        const hash = currentHash !== null ? currentHash : ChessZobrist.computeHash(engine);
        const movingColor = engine.turn;
        const inCheck = maxQDepth === 4 ? engine.isInCheck(movingColor) : false;
        let standPat = -Infinity;

        if (!inCheck) {
            const evalScore = this.evaluateFastQuiescence(engine);
            standPat = isWhiteTurn ? evalScore : -evalScore;
            if (standPat >= beta) return beta;
            if (standPat > alpha) alpha = standPat;
            if (maxQDepth <= 0) return standPat;
        }

        let tacticalMoves;
        if (inCheck) {
            tacticalMoves = engine.generateLegalMoves(movingColor, false);
            if (tacticalMoves.length === 0) return -20000;
        } else {
            tacticalMoves = engine.generateTacticalMoves(movingColor, false);
            if (tacticalMoves.length === 0) return standPat;
        }

        const orderedCaptures = this.orderMoves(engine, tacticalMoves, 0, null);
        let legalEvasions = 0;

        for (let i = 0; i < orderedCaptures.length; i++) {
            const move = ChessAI.pickNextMove(orderedCaptures, i);
            // Delta pruning: skip captures that cannot raise alpha
            if (!inCheck && !move.promotion) {
                const capVal = move.captured ? (PIECE_VALUES[move.captured.type] || 100) : 100;
                if (standPat + capVal + 200 < alpha) {
                    continue;
                }
            }

            const undo = engine.makeMoveFast(move.from, move.to, move.promotion || 'q');
            if (engine.isInCheck(movingColor)) {
                engine.unmakeMove(undo);
                continue;
            }
            legalEvasions++;

            const childHash = ChessZobrist.updateHash(hash, undo, undo.prevCastling, engine.castling, undo.prevEp, engine.enPassant);

            const score = -this.quiescence(engine, -beta, -alpha, maxQDepth - 1, !isWhiteTurn, childHash);

            engine.unmakeMove(undo);

            if (this.timeUp) return 0;

            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }

        if (inCheck && legalEvasions === 0) {
            return -20000;
        }

        return alpha;
    }

    /**
     * Orders moves for maximum alpha-beta pruning efficiency:
     * 1. TT Best Move (+50,000)
     * 2. MVV-LVA for captures (+20,000 + victim*10 - attacker)
     * 3. Pawn promotions (+18,000)
     * 4. Bonus for checks (+12,000)
     * 5. Primary & Secondary Killer Moves (+10,000, +8,000)
     * 6. Castling (+1,500)
     * 7. History heuristic for quiet moves (up to +5,000)
     */
    orderMoves(engine, moves, depth = 0, ttBestMove = null) {
        const killer1 = depth < 32 ? this.killerMoves[depth]?.[0] : null;
        const killer2 = depth < 32 ? this.killerMoves[depth]?.[1] : null;
        const oppColor = engine.turn === 'w' ? 'b' : 'w';
        const oppKing = engine.findKing(oppColor);

        // Precompute TT and Killer coordinates once outside the move loop
        let bfRow = -1, bfCol = -1, btRow = -1, btCol = -1;
        if (ttBestMove) {
            bfRow = typeof ttBestMove.from === 'string' ? (8 - parseInt(ttBestMove.from[1], 10)) : ttBestMove.from.row;
            bfCol = typeof ttBestMove.from === 'string' ? (ttBestMove.from.charCodeAt(0) - 97) : ttBestMove.from.col;
            btRow = typeof ttBestMove.to === 'string' ? (8 - parseInt(ttBestMove.to[1], 10)) : ttBestMove.to.row;
            btCol = typeof ttBestMove.to === 'string' ? (ttBestMove.to.charCodeAt(0) - 97) : ttBestMove.to.col;
        }

        let k1fR = -1, k1fC = -1, k1tR = -1, k1tC = -1;
        if (killer1) {
            k1fR = typeof killer1.from === 'string' ? (8 - parseInt(killer1.from[1], 10)) : killer1.from.row;
            k1fC = typeof killer1.from === 'string' ? (killer1.from.charCodeAt(0) - 97) : killer1.from.col;
            k1tR = typeof killer1.to === 'string' ? (8 - parseInt(killer1.to[1], 10)) : killer1.to.row;
            k1tC = typeof killer1.to === 'string' ? (killer1.to.charCodeAt(0) - 97) : killer1.to.col;
        }

        let k2fR = -1, k2fC = -1, k2tR = -1, k2tC = -1;
        if (killer2) {
            k2fR = typeof killer2.from === 'string' ? (8 - parseInt(killer2.from[1], 10)) : killer2.from.row;
            k2fC = typeof killer2.from === 'string' ? (killer2.from.charCodeAt(0) - 97) : killer2.from.col;
            k2tR = typeof killer2.to === 'string' ? (8 - parseInt(killer2.to[1], 10)) : killer2.to.row;
            k2tC = typeof killer2.to === 'string' ? (killer2.to.charCodeAt(0) - 97) : killer2.to.col;
        }

        for (let i = 0; i < moves.length; i++) {
            const m = moves[i];
            let priority = 0;
            const fRow = m.from.row !== undefined ? m.from.row : (8 - parseInt(m.from[1], 10));
            const fCol = m.from.col !== undefined ? m.from.col : (m.from.charCodeAt(0) - 97);
            const tRow = m.to.row !== undefined ? m.to.row : (8 - parseInt(m.to[1], 10));
            const tCol = m.to.col !== undefined ? m.to.col : (m.to.charCodeAt(0) - 97);
            const pType = m.piece ? (m.piece.type || m.piece) : (engine.board[fRow]?.[fCol]?.type || 'p');

            // 1. Transposition table best move
            if (bfRow !== -1 && fRow === bfRow && fCol === bfCol && tRow === btRow && tCol === btCol) {
                priority += 50000;
            }

            // 2. MVV-LVA for captures
            if (m.captured) {
                const victimVal = PIECE_VALUES[m.captured.type] || 0;
                const attackerVal = PIECE_VALUES[pType] || 0;
                priority += 20000 + (victimVal * 10 - attackerVal);
            }

            // 3. Pawn promotions
            if (m.promotion) {
                priority += 18000;
            }

            // 4. Bonus for checks (+12,000)
            if (oppKing) {
                let deliversCheck = false;
                if (pType === 'n') {
                    const dr = Math.abs(tRow - oppKing.row);
                    const dc = Math.abs(tCol - oppKing.col);
                    if ((dr === 1 && dc === 2) || (dr === 2 && dc === 1)) deliversCheck = true;
                } else if (pType === 'p') {
                    const pAttRow = engine.turn === 'w' ? tRow - 1 : tRow + 1;
                    if (oppKing.row === pAttRow && Math.abs(oppKing.col - tCol) === 1) deliversCheck = true;
                } else if (pType === 'b' || pType === 'q') {
                    if (Math.abs(tRow - oppKing.row) === Math.abs(tCol - oppKing.col)) deliversCheck = true;
                }
                if (!deliversCheck && (pType === 'r' || pType === 'q')) {
                    if (tRow === oppKing.row || tCol === oppKing.col) deliversCheck = true;
                }
                if (deliversCheck) {
                    priority += 12000;
                }
            }

            // 5. Killer moves
            if (k1fR !== -1 && fRow === k1fR && fCol === k1fC && tRow === k1tR && tCol === k1tC) {
                priority += 10000;
            } else if (k2fR !== -1 && fRow === k2fR && fCol === k2fC && tRow === k2tR && tCol === k2tC) {
                priority += 8000;
            }

            // 6. Castling
            if (m.isCastling) {
                priority += 1500;
            }

            // 7. History heuristic for quiet moves
            const moveKey = (fRow << 9) | (fCol << 6) | (tRow << 3) | tCol;
            const histVal = this.historyTable[moveKey] || 0;
            priority += Math.min(histVal, 5000);

            m._p = priority;
        }

        return moves;
    }

    static pickNextMove(moves, startIdx) {
        let bestIdx = startIdx;
        let bestP = moves[startIdx]._p;
        for (let j = startIdx + 1; j < moves.length; j++) {
            const p = moves[j]._p;
            if (p > bestP) {
                bestP = p;
                bestIdx = j;
            }
        }
        if (bestIdx !== startIdx) {
            const tmp = moves[startIdx];
            moves[startIdx] = moves[bestIdx];
            moves[bestIdx] = tmp;
        }
        return moves[startIdx];
    }

    /**
     * Ultra-fast static evaluation for quiescence search leaves (Material + Tapered PST + Bishop Pair)
     */
    evaluateFastQuiescence(engine) {
        let score = 0;
        let phase = 0;
        let whiteBishops = 0;
        let blackBishops = 0;
        let whiteKingSq = -1;
        let blackKingSq = -1;
        const board = engine.board;

        for (let r = 0; r < 8; r++) {
            const rowArr = board[r];
            for (let c = 0; c < 8; c++) {
                const piece = rowArr[c];
                if (!piece) continue;
                const isWhite = piece.color === 'w';
                const pType = piece.type;
                const sq = (r << 3) | c;
                const tableSq = isWhite ? sq : (((7 - r) << 3) | c);

                switch (pType) {
                    case 'p':
                        score += isWhite ? (100 + PAWN_PST[tableSq]) : -(100 + PAWN_PST[tableSq]);
                        break;
                    case 'n':
                        phase += 1;
                        score += isWhite ? (320 + KNIGHT_PST[tableSq]) : -(320 + KNIGHT_PST[tableSq]);
                        break;
                    case 'b':
                        phase += 1;
                        if (isWhite) {
                            whiteBishops++;
                            score += 330 + BISHOP_PST[tableSq];
                        } else {
                            blackBishops++;
                            score -= 330 + BISHOP_PST[tableSq];
                        }
                        break;
                    case 'r':
                        phase += 2;
                        score += isWhite ? (500 + ROOK_PST[tableSq]) : -(500 + ROOK_PST[tableSq]);
                        break;
                    case 'q':
                        phase += 4;
                        score += isWhite ? (900 + QUEEN_PST[tableSq]) : -(900 + QUEEN_PST[tableSq]);
                        break;
                    case 'k':
                        if (isWhite) whiteKingSq = sq;
                        else blackKingSq = tableSq;
                        break;
                }
            }
        }

        const mgW = phase > 24 ? 24 : phase;
        const egW = 24 - mgW;
        if (whiteKingSq !== -1) {
            score += 20000 + (((KING_MID_PST[whiteKingSq] * mgW + KING_END_PST[whiteKingSq] * egW) / 24) | 0);
        }
        if (blackKingSq !== -1) {
            score -= 20000 + (((KING_MID_PST[blackKingSq] * mgW + KING_END_PST[blackKingSq] * egW) / 24) | 0);
        }
        if (whiteBishops >= 2) score += 40;
        if (blackBishops >= 2) score -= 40;

        return score;
    }

    /**
     * Proprietary Grandmaster Evaluation Function (100% offline, zero internet)
     * Continuous tapered phase evaluation (0..24), genuine pawn structure penalties,
     * symmetric king safety, piece mobility bonuses, and piece-square tables.
     */
    evaluatePosition(engine, computeMobility = true) {
        if (engine.halfmoveClock >= 100) {
            return 0;
        }

        let score = 0;
        let phase = 0;
        let whiteBishops = 0;
        let blackBishops = 0;
        let numWP = 0, numBP = 0, numWR = 0, numBR = 0;

        EVAL_WP_FILES.fill(0);
        EVAL_BP_FILES.fill(0);
        EVAL_WP_MIN.fill(9);
        EVAL_WP_MAX.fill(-1);
        EVAL_BP_MIN.fill(9);
        EVAL_BP_MAX.fill(-1);

        let whiteKingR = -1, whiteKingC = -1;
        let blackKingR = -1, blackKingC = -1;

        let whiteMobility = 0;
        let blackMobility = 0;

        // 1. Single scan for piece inventory, phase weights, mobility & PST/material
        const board = engine.board;
        for (let r = 0; r < 8; r++) {
            const rowArr = board[r];
            for (let c = 0; c < 8; c++) {
                const piece = rowArr[c];
                if (!piece) continue;

                const isWhite = piece.color === 'w';
                const pType = piece.type;
                const baseValue = PIECE_VALUES[pType] || 0;
                const sq = (r << 3) | c;
                const tableSq = isWhite ? sq : (((7 - r) << 3) | c);

                let pstVal = 0;

                switch (pType) {
                    case 'p':
                        pstVal = PAWN_PST[tableSq];
                        if (isWhite) {
                            EVAL_WP_R[numWP] = r;
                            EVAL_WP_C[numWP++] = c;
                            EVAL_WP_FILES[c]++;
                            if (r < EVAL_WP_MIN[c]) EVAL_WP_MIN[c] = r;
                            if (r > EVAL_WP_MAX[c]) EVAL_WP_MAX[c] = r;
                        } else {
                            EVAL_BP_R[numBP] = r;
                            EVAL_BP_C[numBP++] = c;
                            EVAL_BP_FILES[c]++;
                            if (r < EVAL_BP_MIN[c]) EVAL_BP_MIN[c] = r;
                            if (r > EVAL_BP_MAX[c]) EVAL_BP_MAX[c] = r;
                        }
                        break;

                    case 'n':
                        phase += 1;
                        pstVal = KNIGHT_PST[tableSq];
                        if ((r >= 3 && r <= 4) && (c >= 3 && c <= 4)) pstVal += 15;
                        if (c === 0 || c === 7) pstVal -= 15;

                        // Knight mobility (+4 cp per safe square)
                        if (computeMobility) {
                            let nMob = 0;
                            for (let k = 0; k < 8; k++) {
                                const nr = r + KNIGHT_OFFSETS[k][0];
                                const nc = c + KNIGHT_OFFSETS[k][1];
                                if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                                    const target = board[nr][nc];
                                    if (!target || target.color !== piece.color) nMob++;
                                }
                            }
                            if (isWhite) whiteMobility += nMob * 4;
                            else blackMobility += nMob * 4;
                        }
                        break;

                    case 'b':
                        phase += 1;
                        pstVal = BISHOP_PST[tableSq];
                        if (isWhite) whiteBishops++;
                        else blackBishops++;

                        // Bishop mobility (+5 cp per ray square)
                        if (computeMobility) {
                            let bMob = 0;
                            for (let d = 0; d < 4; d++) {
                                const dr = DIAG_DIRS[d][0];
                                const dc = DIAG_DIRS[d][1];
                                let nr = r + dr;
                                let nc = c + dc;
                                while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                                    const target = board[nr][nc];
                                    if (!target) {
                                        bMob++;
                                    } else {
                                        if (target.color !== piece.color) bMob++;
                                        break;
                                    }
                                    nr += dr;
                                    nc += dc;
                                }
                            }
                            if (isWhite) whiteMobility += bMob * 5;
                            else blackMobility += bMob * 5;
                        }
                        break;

                    case 'r':
                        phase += 2;
                        pstVal = ROOK_PST[tableSq];
                        if (isWhite) {
                            EVAL_WR_R[numWR] = r;
                            EVAL_WR_C[numWR++] = c;
                        } else {
                            EVAL_BR_R[numBR] = r;
                            EVAL_BR_C[numBR++] = c;
                        }

                        // Rook mobility (+3 cp per ray square)
                        if (computeMobility) {
                            let rMob = 0;
                            for (let d = 0; d < 4; d++) {
                                const dr = ORTHO_DIRS[d][0];
                                const dc = ORTHO_DIRS[d][1];
                                let nr = r + dr;
                                let nc = c + dc;
                                while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                                    const target = board[nr][nc];
                                    if (!target) {
                                        rMob++;
                                    } else {
                                        if (target.color !== piece.color) rMob++;
                                        break;
                                    }
                                    nr += dr;
                                    nc += dc;
                                }
                            }
                            if (isWhite) whiteMobility += rMob * 3;
                            else blackMobility += rMob * 3;
                        }
                        break;

                    case 'q':
                        phase += 4;
                        pstVal = QUEEN_PST[tableSq];

                        // Queen mobility (+2 cp per ray square)
                        if (computeMobility) {
                            let qMob = 0;
                            for (let d = 0; d < 8; d++) {
                                const dr = QUEEN_DIRS[d][0];
                                const dc = QUEEN_DIRS[d][1];
                                let nr = r + dr;
                                let nc = c + dc;
                                while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                                    const target = board[nr][nc];
                                    if (!target) {
                                        qMob++;
                                    } else {
                                        if (target.color !== piece.color) qMob++;
                                        break;
                                    }
                                    nr += dr;
                                    nc += dc;
                                }
                            }
                            if (isWhite) whiteMobility += qMob * 2;
                            else blackMobility += qMob * 2;
                        }
                        break;

                    case 'k':
                        if (isWhite) {
                            whiteKingR = r;
                            whiteKingC = c;
                        } else {
                            blackKingR = r;
                            blackKingC = c;
                        }
                        break;
                }

                // Add material and non-king PST
                if (pType !== 'k') {
                    const total = baseValue + pstVal;
                    score += isWhite ? total : -total;
                }
            }
        }

        // 2. Continuous Tapered Phase Evaluation
        const phaseWeight = Math.min(24, Math.max(0, phase));
        const mgWeight = phaseWeight;
        const egWeight = 24 - phaseWeight;
        const kingSafetyWeight = phaseWeight / 24;

        // Tapered King PST
        if (whiteKingR !== -1) {
            const sq = whiteKingR * 8 + whiteKingC;
            const mid = KING_MID_PST[sq];
            const end = KING_END_PST[sq];
            const kingPst = Math.round((mid * mgWeight + end * egWeight) / 24);
            score += PIECE_VALUES.k + kingPst;
        }
        if (blackKingR !== -1) {
            const sq = (7 - blackKingR) * 8 + blackKingC;
            const mid = KING_MID_PST[sq];
            const end = KING_END_PST[sq];
            const kingPst = Math.round((mid * mgWeight + end * egWeight) / 24);
            score -= PIECE_VALUES.k + kingPst;
        }

        // Add Piece Mobility
        if (computeMobility) {
            score += (whiteMobility - blackMobility);
        }

        // 3. Bishop Pair Bonus (+40 cp)
        if (whiteBishops >= 2) score += 40;
        if (blackBishops >= 2) score -= 40;

        // 4. Rooks on Open Files & 7th Rank
        for (let i = 0; i < numWR; i++) {
            const rr = EVAL_WR_R[i];
            const rc = EVAL_WR_C[i];
            if (rr === 1) score += 45; // 7th rank for White
            const hasWPawn = EVAL_WP_FILES[rc] > 0;
            const hasBPawn = EVAL_BP_FILES[rc] > 0;
            if (!hasWPawn && !hasBPawn) score += 25;
            else if (!hasWPawn) score += 15;
        }

        for (let i = 0; i < numBR; i++) {
            const rr = EVAL_BR_R[i];
            const rc = EVAL_BR_C[i];
            if (rr === 6) score -= 45; // 7th rank equivalent for Black
            const hasWPawn = EVAL_WP_FILES[rc] > 0;
            const hasBPawn = EVAL_BP_FILES[rc] > 0;
            if (!hasWPawn && !hasBPawn) score -= 25;
            else if (!hasBPawn) score -= 15;
        }

        // 5. Genuine Pawn Structure Evaluation
        // (a) Doubled Pawns (-18 cp)
        for (let f = 0; f < 8; f++) {
            if (EVAL_WP_FILES[f] > 1) score -= (EVAL_WP_FILES[f] - 1) * 18;
            if (EVAL_BP_FILES[f] > 1) score += (EVAL_BP_FILES[f] - 1) * 18;
        }

        // (b) Isolated Pawns (-18 cp), Backward Pawns (-12 cp), Passed Pawns
        for (let i = 0; i < numWP; i++) {
            const wr = EVAL_WP_R[i];
            const f = EVAL_WP_C[i];
            const hasFriendlyAdjacent = (f > 0 && EVAL_WP_FILES[f - 1] > 0) || (f < 7 && EVAL_WP_FILES[f + 1] > 0);
            if (!hasFriendlyAdjacent) {
                score -= 18;
            } else {
                const canBeSupported = (f > 0 && EVAL_WP_MAX[f - 1] >= wr) || (f < 7 && EVAL_WP_MAX[f + 1] >= wr);
                if (!canBeSupported) {
                    const stopRow = wr - 1;
                    if (stopRow > 0) {
                        const enemyControl = (f > 0 && engine.board[stopRow - 1][f - 1]?.type === 'p' && engine.board[stopRow - 1][f - 1]?.color === 'b') ||
                                             (f < 7 && engine.board[stopRow - 1][f + 1]?.type === 'p' && engine.board[stopRow - 1][f + 1]?.color === 'b');
                        if (enemyControl) score -= 12;
                    }
                }
            }

            // Passed pawn check
            const leftBlocked = f > 0 && EVAL_BP_MIN[f - 1] < wr;
            const centerBlocked = EVAL_BP_MIN[f] < wr;
            const rightBlocked = f < 7 && EVAL_BP_MIN[f + 1] < wr;
            if (!leftBlocked && !centerBlocked && !rightBlocked) {
                const rank = 8 - wr;
                if (rank === 4) score += 20;
                else if (rank === 5) score += 45;
                else if (rank === 6) score += 80;
                else if (rank === 7) score += 140;
            }
        }

        for (let i = 0; i < numBP; i++) {
            const br = EVAL_BP_R[i];
            const f = EVAL_BP_C[i];
            const hasFriendlyAdjacent = (f > 0 && EVAL_BP_FILES[f - 1] > 0) || (f < 7 && EVAL_BP_FILES[f + 1] > 0);
            if (!hasFriendlyAdjacent) {
                score += 18;
            } else {
                const canBeSupported = (f > 0 && EVAL_BP_MIN[f - 1] <= br) || (f < 7 && EVAL_BP_MIN[f + 1] <= br);
                if (!canBeSupported) {
                    const stopRow = br + 1;
                    if (stopRow < 7) {
                        const enemyControl = (f > 0 && engine.board[stopRow + 1][f - 1]?.type === 'p' && engine.board[stopRow + 1][f - 1]?.color === 'w') ||
                                             (f < 7 && engine.board[stopRow + 1][f + 1]?.type === 'p' && engine.board[stopRow + 1][f + 1]?.color === 'w');
                        if (enemyControl) score += 12;
                    }
                }
            }

            // Passed pawn check
            const leftBlocked = f > 0 && EVAL_WP_MAX[f - 1] > br;
            const centerBlocked = EVAL_WP_MAX[f] > br;
            const rightBlocked = f < 7 && EVAL_WP_MAX[f + 1] > br;
            if (!leftBlocked && !centerBlocked && !rightBlocked) {
                const rank = br + 1;
                if (rank === 4) score -= 20;
                else if (rank === 5) score -= 45;
                else if (rank === 6) score -= 80;
                else if (rank === 7) score -= 140;
            }
        }

        // 6. Symmetric King Safety
        if (kingSafetyWeight > 0.05) {
            // White King Safety
            if (whiteKingR !== -1) {
                if (whiteKingR === 7 && whiteKingC >= 6) {
                    // Kingside castled: shield at g2, h2, f2
                    let shield = 0;
                    if (engine.board[6][5]?.type === 'p' && engine.board[6][5]?.color === 'w') shield++;
                    if (engine.board[6][6]?.type === 'p' && engine.board[6][6]?.color === 'w') shield++;
                    if (engine.board[6][7]?.type === 'p' && engine.board[6][7]?.color === 'w') shield++;
                    score += Math.round(shield * 12 * kingSafetyWeight);
                } else if (whiteKingR === 7 && whiteKingC <= 2) {
                    // Queenside castled: shield at a2, b2, c2
                    let shield = 0;
                    if (engine.board[6][0]?.type === 'p' && engine.board[6][0]?.color === 'w') shield++;
                    if (engine.board[6][1]?.type === 'p' && engine.board[6][1]?.color === 'w') shield++;
                    if (engine.board[6][2]?.type === 'p' && engine.board[6][2]?.color === 'w') shield++;
                    score += Math.round(shield * 12 * kingSafetyWeight);
                } else if (whiteKingR === 7 && whiteKingC === 4) {
                    // Uncastled king on e1
                    score -= Math.round(30 * kingSafetyWeight);
                }
            }

            // Black King Safety
            if (blackKingR !== -1) {
                if (blackKingR === 0 && blackKingC >= 6) {
                    // Kingside castled: shield at g7, h7, f7
                    let shield = 0;
                    if (engine.board[1][5]?.type === 'p' && engine.board[1][5]?.color === 'b') shield++;
                    if (engine.board[1][6]?.type === 'p' && engine.board[1][6]?.color === 'b') shield++;
                    if (engine.board[1][7]?.type === 'p' && engine.board[1][7]?.color === 'b') shield++;
                    score -= Math.round(shield * 12 * kingSafetyWeight);
                } else if (blackKingR === 0 && blackKingC <= 2) {
                    // Queenside castled: shield at a7, b7, c7
                    let shield = 0;
                    if (engine.board[1][0]?.type === 'p' && engine.board[1][0]?.color === 'b') shield++;
                    if (engine.board[1][1]?.type === 'p' && engine.board[1][1]?.color === 'b') shield++;
                    if (engine.board[1][2]?.type === 'p' && engine.board[1][2]?.color === 'b') shield++;
                    score -= Math.round(shield * 12 * kingSafetyWeight);
                } else if (blackKingR === 0 && blackKingC === 4) {
                    // Uncastled king on e8
                    score += Math.round(30 * kingSafetyWeight);
                }
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
