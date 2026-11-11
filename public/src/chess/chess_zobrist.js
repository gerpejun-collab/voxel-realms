// public/src/chess/chess_zobrist.js
// 64-Bit BigInt Zobrist Hashing, Transposition Table & Threefold Repetition Cache
// Fully conforms to Specifications 162-165 of CHESS_200_SPEC_PLAN.md.

import { ChessEngine } from './chess_engine.js';

export const TT_FLAG = {
  EXACT: 0,
  LOWER_BOUND: 1, // Beta cutoff (fail-high)
  UPPER_BOUND: 2  // Alpha cutoff (fail-low)
};

/**
 * Deterministic SplitMix64 PRNG for 100% reproducible 64-bit BigInt keys
 */
class SplitMix64 {
  constructor(seed = 0x85437890abcdefn) {
    this.state = BigInt(seed);
    this.mask64 = (1n << 64n) - 1n;
  }

  next() {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & this.mask64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & this.mask64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & this.mask64;
    return (z ^ (z >> 31n)) & this.mask64;
  }
}

/**
 * Global Zobrist Keys Tables
 */
const prng = new SplitMix64(0x20261111_abcdef01n);

// 12 pieces x 64 squares: pieces indexed as:
// wP: 0, wN: 1, wB: 2, wR: 3, wQ: 4, wK: 5,
// bP: 6, bN: 7, bB: 8, bR: 9, bQ: 10, bK: 11
export const ZOBRIST_PIECES = Array(12).fill(null).map(() => {
  const sqs = new Array(64);
  for (let sq = 0; sq < 64; sq++) {
    sqs[sq] = prng.next();
  }
  return sqs;
});

// 16 castling combinations: (wK: 8, wQ: 4, bK: 2, bQ: 1)
export const ZOBRIST_CASTLING = Array(16).fill(null).map(() => prng.next());

// 8 en passant files (files a-h) + 1 for no EP
export const ZOBRIST_EP = Array(8).fill(null).map(() => prng.next());

// Side to move (XORed when Black to move)
export const ZOBRIST_BLACK_TO_MOVE = prng.next();

const PIECE_INDICES = {
  'w_p': 0, 'w_n': 1, 'w_b': 2, 'w_r': 3, 'w_q': 4, 'w_k': 5,
  'b_p': 6, 'b_n': 7, 'b_b': 8, 'b_r': 9, 'b_q': 10, 'b_k': 11
};

export class ChessZobrist {
  /**
   * Returns piece index 0..11
   */
  static getPieceIndex(type, color) {
    const key = `${color}_${type}`;
    return PIECE_INDICES[key] !== undefined ? PIECE_INDICES[key] : -1;
  }

  /**
   * Computes castling rights integer 0..15 from engine.castling object
   */
  static getCastlingInt(castling) {
    if (!castling) return 0;
    let val = 0;
    if (castling.wK) val |= 8;
    if (castling.wQ) val |= 4;
    if (castling.bK) val |= 2;
    if (castling.bQ) val |= 1;
    return val;
  }

  /**
   * Computes full 64-bit BigInt Zobrist hash of current board state
   * @param {ChessEngine} engine
   * @returns {bigint} 64-bit BigInt hash
   */
  static computeHash(engine) {
    if (!engine || !engine.board) return 0n;
    let hash = 0n;

    // 1. Pieces on board
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = engine.board[r][c];
        if (!p) continue;
        const pIdx = this.getPieceIndex(p.type, p.color);
        if (pIdx >= 0) {
          const sq = r * 8 + c;
          hash ^= ZOBRIST_PIECES[pIdx][sq];
        }
      }
    }

    // 2. Castling rights
    const castlingInt = this.getCastlingInt(engine.castling);
    hash ^= ZOBRIST_CASTLING[castlingInt];

    // 3. En Passant target file
    if (engine.enPassant && engine.enPassant.col >= 0 && engine.enPassant.col < 8) {
      hash ^= ZOBRIST_EP[engine.enPassant.col];
    }

    // 4. Side to move
    if (engine.turn === 'b') {
      hash ^= ZOBRIST_BLACK_TO_MOVE;
    }

    return hash;
  }

  /**
   * Incremental Zobrist update for move execution
   * @param {bigint} currentHash
   * @param {object} move - legal move object
   * @param {object} prevCastling - castling rights before move
   * @param {object} nextCastling - castling rights after move
   * @param {object} prevEp - en passant before move
   * @param {object} nextEp - en passant after move
   * @returns {bigint}
   */
  static updateHash(currentHash, move, prevCastling, nextCastling, prevEp, nextEp) {
    let hash = currentHash;
    const { from, to, piece, color, captured, promotion, isCastling, castlingSide, isEnPassant } = move;

    const fromSq = from.row * 8 + from.col;
    const toSq = to.row * 8 + to.col;
    const movingIdx = this.getPieceIndex(piece, color);

    // XOR out moving piece from source
    hash ^= ZOBRIST_PIECES[movingIdx][fromSq];

    // XOR in piece at target (either promoted or moving)
    if (promotion) {
      const promoIdx = this.getPieceIndex(promotion, color);
      hash ^= ZOBRIST_PIECES[promoIdx][toSq];
    } else {
      hash ^= ZOBRIST_PIECES[movingIdx][toSq];
    }

    // XOR out captured piece
    if (isEnPassant) {
      const epCapturedIdx = this.getPieceIndex('p', color === 'w' ? 'b' : 'w');
      const epSq = from.row * 8 + to.col;
      hash ^= ZOBRIST_PIECES[epCapturedIdx][epSq];
    } else if (captured) {
      const capIdx = this.getPieceIndex(captured.type, captured.color);
      hash ^= ZOBRIST_PIECES[capIdx][toSq];
    }

    // Castling rook repositioning
    if (isCastling) {
      const rRow = from.row;
      const rookIdx = this.getPieceIndex('r', color);
      if (castlingSide === 'k') {
        hash ^= ZOBRIST_PIECES[rookIdx][rRow * 8 + 7]; // remove from h-file
        hash ^= ZOBRIST_PIECES[rookIdx][rRow * 8 + 5]; // place on f-file
      } else {
        hash ^= ZOBRIST_PIECES[rookIdx][rRow * 8 + 0]; // remove from a-file
        hash ^= ZOBRIST_PIECES[rookIdx][rRow * 8 + 3]; // place on d-file
      }
    }

    // Castling rights update
    const prevCInt = this.getCastlingInt(prevCastling);
    const nextCInt = this.getCastlingInt(nextCastling);
    if (prevCInt !== nextCInt) {
      hash ^= ZOBRIST_CASTLING[prevCInt];
      hash ^= ZOBRIST_CASTLING[nextCInt];
    }

    // En Passant target update
    if (prevEp && prevEp.col >= 0 && prevEp.col < 8) {
      hash ^= ZOBRIST_EP[prevEp.col];
    }
    if (nextEp && nextEp.col >= 0 && nextEp.col < 8) {
      hash ^= ZOBRIST_EP[nextEp.col];
    }

    // Turn toggle
    hash ^= ZOBRIST_BLACK_TO_MOVE;

    return hash;
  }
}

/**
 * High-performance fixed-size Transposition Table ($2^{18} = 262,144$ entries)
 */
export class TranspositionTable {
  constructor(sizePower = 18) {
    this.size = 1 << sizePower;
    this.mask = BigInt(this.size - 1);
    this.table = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      this.table[i] = null;
    }
    this.hits = 0;
    this.collisions = 0;
    this.overwrites = 0;
  }

  clear() {
    for (let i = 0; i < this.size; i++) {
      this.table[i] = null;
    }
    this.hits = 0;
    this.collisions = 0;
    this.overwrites = 0;
  }

  get(hash) {
    const idx = Number(hash & this.mask);
    const entry = this.table[idx];
    if (entry && entry.hash === hash) {
      this.hits++;
      return entry;
    }
    return null;
  }

  set(hash, depth, score, flag, bestMove = null) {
    const idx = Number(hash & this.mask);
    const existing = this.table[idx];

    if (existing) {
      if (existing.hash !== hash) {
        this.collisions++;
      }
      // Depth-preferred replacement policy
      if (depth >= existing.depth || existing.hash !== hash) {
        this.overwrites++;
        this.table[idx] = { hash, depth, score, flag, bestMove };
      }
    } else {
      this.table[idx] = { hash, depth, score, flag, bestMove };
    }
  }
}

/**
 * Threefold Repetition Tracker using 64-bit Zobrist hashes
 */
export class RepetitionTracker {
  constructor() {
    this.history = [];
    this.counts = new Map();
  }

  clear() {
    this.history = [];
    this.counts.clear();
  }

  push(hash) {
    this.history.push(hash);
    const c = (this.counts.get(hash) || 0) + 1;
    this.counts.set(hash, c);
    return c;
  }

  pop() {
    const hash = this.history.pop();
    if (hash !== undefined) {
      const c = this.counts.get(hash) || 1;
      if (c <= 1) {
        this.counts.delete(hash);
      } else {
        this.counts.set(hash, c - 1);
      }
    }
    return hash;
  }

  isThreefold(hash) {
    return (this.counts.get(hash) || 0) >= 3;
  }

  getCount(hash) {
    return this.counts.get(hash) || 0;
  }
}

// CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ChessZobrist,
    TranspositionTable,
    RepetitionTracker,
    TT_FLAG,
    ZOBRIST_PIECES,
    ZOBRIST_CASTLING,
    ZOBRIST_EP,
    ZOBRIST_BLACK_TO_MOVE
  };
}
