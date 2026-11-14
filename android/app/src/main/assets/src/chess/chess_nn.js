// public/src/chess/chess_nn.js
// Pure JavaScript Dual-Headed Policy/Value Neural Network with Residual Blocks & Analytical Backprop
// Fully conforms to Specifications 151-161 of CHESS_200_SPEC_PLAN.md.
// Zero native C++/node-gyp/Python dependencies. 100% cross-platform Float32Array implementation.

import { ChessEngine, PIECE_VALUES } from './chess_engine.js';

export const INPUT_DIM = 896;     // 8 x 8 x 14 feature planes
export const HIDDEN_DIM = 192;    // Residual block width
export const POLICY_DIM = 4096;   // 64 from-squares x 64 to-squares
export const HEAD_HIDDEN = 64;    // Intermediate head width

/**
 * Encodes a chess board into a Float32Array(896) tensor
 * Planes 0-5: White pieces [P, N, B, R, Q, K]
 * Planes 6-11: Black pieces [p, n, b, r, q, k]
 * Plane 12: Active turn (1.0 for White, 0.0 for Black)
 * Plane 13: Castling availability and En Passant rights
 */
export function encodeBoard(engine) {
  const tensor = new Float32Array(INPUT_DIM);
  if (!engine || !engine.board) return tensor;

  const pieceTypeMap = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = engine.board[r][c];
      if (!piece) continue;
      const typeIdx = pieceTypeMap[piece.type];
      if (typeIdx === undefined) continue;
      const plane = piece.color === 'w' ? typeIdx : typeIdx + 6;
      tensor[plane * 64 + (r * 8 + c)] = 1.0;
    }
  }

  // Plane 12: Active turn
  const turnVal = engine.turn === 'w' ? 1.0 : 0.0;
  const p12Offset = 12 * 64;
  for (let i = 0; i < 64; i++) {
    tensor[p12Offset + i] = turnVal;
  }

  // Plane 13: Castling rights & En Passant
  const p13Offset = 13 * 64;
  if (engine.castling) {
    if (engine.castling.wK) tensor[p13Offset + (7 * 8 + 7)] = 1.0; // h1
    if (engine.castling.wQ) tensor[p13Offset + (7 * 8 + 0)] = 1.0; // a1
    if (engine.castling.bK) tensor[p13Offset + (0 * 8 + 7)] = 1.0; // h8
    if (engine.castling.bQ) tensor[p13Offset + (0 * 8 + 0)] = 1.0; // a8
  }
  if (engine.enPassant) {
    const epSq = engine.enPassant.row * 8 + engine.enPassant.col;
    if (epSq >= 0 && epSq < 64) {
      tensor[p13Offset + epSq] = 1.0;
    }
  }

  return tensor;
}

/**
 * Converts a move object {from, to, promotion} to a 0..4095 policy index
 */
export function moveToIndex(move) {
  if (!move || !move.from || !move.to) return -1;
  const fromCoords = typeof move.from === 'string' ? ChessEngine.squareToCoords(move.from) : move.from;
  const toCoords = typeof move.to === 'string' ? ChessEngine.squareToCoords(move.to) : move.to;
  if (!fromCoords || !toCoords) return -1;
  const fromSq = fromCoords.row * 8 + fromCoords.col;
  const toSq = toCoords.row * 8 + toCoords.col;
  return fromSq * 64 + toSq;
}

/**
 * Converts a 0..4095 policy index back to {from: 'e2', to: 'e4', promotion: 'q'}
 */
export function indexToMove(index, promotion = 'q') {
  if (index < 0 || index >= 4096) return null;
  const fromSq = Math.floor(index / 64);
  const toSq = index % 64;
  const from = ChessEngine.coordsToSquare(Math.floor(fromSq / 8), fromSq % 8);
  const to = ChessEngine.coordsToSquare(Math.floor(toSq / 8), toSq % 8);
  return { from, to, promotion };
}

/**
 * Fast LeakyReLU activation and derivative
 */
function leakyRelu(x) {
  return x > 0 ? x : 0.01 * x;
}

function dLeakyRelu(x) {
  return x > 0 ? 1.0 : 0.01;
}

/**
 * He-style pseudo-random initialization
 */
function createWeights(rows, cols, scale = 1.0) {
  const arr = new Float32Array(rows * cols);
  const std = Math.sqrt(2.0 / cols) * scale;
  for (let i = 0; i < arr.length; i++) {
    // Box-Muller normal distribution
    const u1 = Math.max(1e-7, Math.random());
    const u2 = Math.random();
    arr[i] = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2) * std;
  }
  return arr;
}

export class ChessNN {
  constructor(weightsData = null) {
    this.inputDim = INPUT_DIM;
    this.hiddenDim = HIDDEN_DIM;
    this.headHidden = HEAD_HIDDEN;
    this.policyDim = POLICY_DIM;

    this.initWeights();
    if (weightsData) {
      this.loadWeights(weightsData);
    } else {
      this.initBaselineHeuristics();
    }

    // Adam optimizer moments cache
    this.adamMoments = null;
    this.adamStep = 0;
  }

  /**
   * Allocates weight buffers
   */
  initWeights() {
    // Projection: 896 -> 192
    this.w0 = createWeights(HIDDEN_DIM, INPUT_DIM);
    this.b0 = new Float32Array(HIDDEN_DIM);

    // Residual Block 1: 192 -> 192 -> 192
    this.w_r1_1 = createWeights(HIDDEN_DIM, HIDDEN_DIM);
    this.b_r1_1 = new Float32Array(HIDDEN_DIM);
    this.w_r1_2 = createWeights(HIDDEN_DIM, HIDDEN_DIM);
    this.b_r1_2 = new Float32Array(HIDDEN_DIM);

    // Residual Block 2: 192 -> 192 -> 192
    this.w_r2_1 = createWeights(HIDDEN_DIM, HIDDEN_DIM);
    this.b_r2_1 = new Float32Array(HIDDEN_DIM);
    this.w_r2_2 = createWeights(HIDDEN_DIM, HIDDEN_DIM);
    this.b_r2_2 = new Float32Array(HIDDEN_DIM);

    // Policy Head: 192 -> 64 -> 4096
    this.w_pol1 = createWeights(HEAD_HIDDEN, HIDDEN_DIM);
    this.b_pol1 = new Float32Array(HEAD_HIDDEN);
    this.w_pol2 = createWeights(POLICY_DIM, HEAD_HIDDEN, 0.5);
    this.b_pol2 = new Float32Array(POLICY_DIM);

    // Value Head: 192 -> 64 -> 1
    this.w_val1 = createWeights(HEAD_HIDDEN, HIDDEN_DIM);
    this.b_val1 = new Float32Array(HEAD_HIDDEN);
    this.w_val2 = createWeights(1, HEAD_HIDDEN, 0.5);
    this.b_val2 = new Float32Array(1);
  }

  /**
   * Initializes baseline positional heuristics into weights for immediate competence
   */
  initBaselineHeuristics() {
    // Value head weights capture fundamental material balance and center control
    const pieceWeights = [1.0, 3.2, 3.3, 5.0, 9.0, 20.0]; // P, N, B, R, Q, K
    for (let h = 0; h < this.hiddenDim; h++) {
      for (let p = 0; p < 6; p++) {
        const val = pieceWeights[p] * 0.05;
        // Friendly white pieces positive, black pieces negative
        for (let sq = 0; sq < 64; sq++) {
          this.w0[h * INPUT_DIM + (p * 64 + sq)] += val * ((h % 5 === 0) ? 1.0 : 0.2);
          this.w0[h * INPUT_DIM + ((p + 6) * 64 + sq)] -= val * ((h % 5 === 0) ? 1.0 : 0.2);
        }
      }
    }

    // Bias policy head toward central moves (e4, d4, c4, Nf3, etc.)
    const centerMoves = [
      moveToIndex({ from: 'e2', to: 'e4' }),
      moveToIndex({ from: 'd2', to: 'd4' }),
      moveToIndex({ from: 'c2', to: 'c4' }),
      moveToIndex({ from: 'g1', to: 'f3' }),
      moveToIndex({ from: 'b1', to: 'c3' }),
      moveToIndex({ from: 'e7', to: 'e5' }),
      moveToIndex({ from: 'c7', to: 'c5' }),
      moveToIndex({ from: 'd7', to: 'd5' }),
      moveToIndex({ from: 'g8', to: 'f6' }),
      moveToIndex({ from: 'b8', to: 'c6' })
    ];
    for (const mIdx of centerMoves) {
      if (mIdx >= 0 && mIdx < POLICY_DIM) {
        this.b_pol2[mIdx] += 1.5;
      }
    }
  }

  /**
   * Forward pass through the neural network
   * @param {Float32Array} x - Float32Array(896) input tensor
   * @param {boolean} recordActivations - whether to save intermediate layers for backprop
   * @returns {{policyLogits: Float32Array, value: number, cache?: object}}
   */
  forward(x, recordActivations = false) {
    const H = this.hiddenDim;
    const HH = this.headHidden;

    // Layer 0: 896 -> 192
    const z0 = new Float32Array(H);
    const h0 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      let sum = this.b0[i];
      const rowOffset = i * INPUT_DIM;
      for (let j = 0; j < INPUT_DIM; j++) {
        sum += this.w0[rowOffset + j] * x[j];
      }
      z0[i] = sum;
      h0[i] = leakyRelu(sum);
    }

    // Residual Block 1
    const z_r1_1 = new Float32Array(H);
    const a_r1_1 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      let sum = this.b_r1_1[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        sum += this.w_r1_1[rowOffset + j] * h0[j];
      }
      z_r1_1[i] = sum;
      a_r1_1[i] = leakyRelu(sum);
    }

    const z_r1_2 = new Float32Array(H);
    const h1 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      let sum = this.b_r1_2[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        sum += this.w_r1_2[rowOffset + j] * a_r1_1[j];
      }
      z_r1_2[i] = sum;
      h1[i] = leakyRelu(sum) + h0[i]; // Skip connection
    }

    // Residual Block 2
    const z_r2_1 = new Float32Array(H);
    const a_r2_1 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      let sum = this.b_r2_1[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        sum += this.w_r2_1[rowOffset + j] * h1[j];
      }
      z_r2_1[i] = sum;
      a_r2_1[i] = leakyRelu(sum);
    }

    const z_r2_2 = new Float32Array(H);
    const h2 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      let sum = this.b_r2_2[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        sum += this.w_r2_2[rowOffset + j] * a_r2_1[j];
      }
      z_r2_2[i] = sum;
      h2[i] = leakyRelu(sum) + h1[i]; // Skip connection
    }

    // Policy Head: 192 -> 64 -> 4096
    const z_pol1 = new Float32Array(HH);
    const h_pol = new Float32Array(HH);
    for (let i = 0; i < HH; i++) {
      let sum = this.b_pol1[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        sum += this.w_pol1[rowOffset + j] * h2[j];
      }
      z_pol1[i] = sum;
      h_pol[i] = leakyRelu(sum);
    }

    const policyLogits = new Float32Array(POLICY_DIM);
    for (let i = 0; i < POLICY_DIM; i++) {
      let sum = this.b_pol2[i];
      const rowOffset = i * HH;
      for (let j = 0; j < HH; j++) {
        sum += this.w_pol2[rowOffset + j] * h_pol[j];
      }
      policyLogits[i] = sum;
    }

    // Value Head: 192 -> 64 -> 1
    const z_val1 = new Float32Array(HH);
    const h_val = new Float32Array(HH);
    for (let i = 0; i < HH; i++) {
      let sum = this.b_val1[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        sum += this.w_val1[rowOffset + j] * h2[j];
      }
      z_val1[i] = sum;
      h_val[i] = leakyRelu(sum);
    }

    let valSum = this.b_val2[0];
    for (let j = 0; j < HH; j++) {
      valSum += this.w_val2[j] * h_val[j];
    }
    const value = Math.tanh(valSum);

    const result = { policyLogits, value };

    if (recordActivations) {
      result.cache = {
        x,
        z0, h0,
        z_r1_1, a_r1_1, z_r1_2, h1,
        z_r2_1, a_r2_1, z_r2_2, h2,
        z_pol1, h_pol, policyLogits,
        z_val1, h_val, valSum, value
      };
    }

    return result;
  }

  /**
   * Evaluates legal moves using masked softmax
   * @param {ChessEngine} engine
   * @param {Array} legalMoves
   * @returns {{moveProbabilities: Array<{move: object, prob: number, index: number}>, value: number, policy: Float32Array}}
   */
  predict(engine, legalMoves = null) {
    const x = encodeBoard(engine);
    const { policyLogits, value } = this.forward(x, false);

    const moves = legalMoves || engine.generateLegalMoves(engine.turn);
    if (!moves || moves.length === 0) {
      return {
        moveProbabilities: [],
        value,
        policy: new Float32Array(POLICY_DIM)
      };
    }

    // Find max logit among legal moves for numerical stability
    let maxLogit = -Infinity;
    const moveIndices = [];
    for (let i = 0; i < moves.length; i++) {
      const idx = moveToIndex(moves[i]);
      moveIndices.push(idx);
      if (idx >= 0 && idx < POLICY_DIM) {
        if (policyLogits[idx] > maxLogit) maxLogit = policyLogits[idx];
      }
    }

    // Masked Softmax over legal moves
    let expSum = 0.0;
    const expVals = new Float32Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const idx = moveIndices[i];
      if (idx >= 0 && idx < POLICY_DIM) {
        const e = Math.exp(policyLogits[idx] - maxLogit);
        expVals[i] = e;
        expSum += e;
      } else {
        expVals[i] = 1e-4;
        expSum += 1e-4;
      }
    }

    const policyFull = new Float32Array(POLICY_DIM);
    const moveProbabilities = [];
    for (let i = 0; i < moves.length; i++) {
      const prob = expSum > 0 ? expVals[i] / expSum : 1.0 / moves.length;
      const idx = moveIndices[i];
      if (idx >= 0 && idx < POLICY_DIM) {
        policyFull[idx] = prob;
      }
      moveProbabilities.push({
        move: moves[i],
        prob,
        index: idx
      });
    }

    return {
      moveProbabilities,
      value,
      policy: policyFull
    };
  }

  /**
   * Computes analytical gradients for a single training sample (s, pi_target, z_target)
   * Loss = (V - z)^2 - sum(pi * log(p)) + c_reg * ||theta||^2
   * @param {Float32Array} x - Input board tensor Float32Array(896)
   * @param {Float32Array} targetPolicy - Target probability distribution Float32Array(4096)
   * @param {number} targetValue - Outcome scalar in [-1, 1]
   * @param {Array<number>} legalIndices - Array of legal move indices
   * @returns {{grads: object, valueLoss: number, policyLoss: number}}
   */
  backward(x, targetPolicy, targetValue, legalIndices = null) {
    const { cache } = this.forward(x, true);
    const H = this.hiddenDim;
    const HH = this.headHidden;

    // 1. Value Loss & Gradient
    const v = cache.value;
    const valueLoss = (v - targetValue) * (v - targetValue);
    // dL/dv = 2 * (v - z); d(v)/d(valSum) = 1 - v^2
    const dValSum = 2.0 * (v - targetValue) * (1.0 - v * v);

    // 2. Policy Loss & Gradient (Masked Softmax + Cross Entropy)
    let maxLogit = -Infinity;
    const indices = legalIndices || [];
    if (indices.length === 0) {
      for (let i = 0; i < POLICY_DIM; i++) {
        if (targetPolicy[i] > 0) indices.push(i);
      }
    }
    for (const idx of indices) {
      if (cache.policyLogits[idx] > maxLogit) maxLogit = cache.policyLogits[idx];
    }

    let expSum = 0.0;
    const p = new Float32Array(POLICY_DIM);
    for (const idx of indices) {
      const e = Math.exp(cache.policyLogits[idx] - maxLogit);
      p[idx] = e;
      expSum += e;
    }

    let policyLoss = 0.0;
    const dLogits = new Float32Array(POLICY_DIM);
    for (const idx of indices) {
      p[idx] = expSum > 0 ? p[idx] / expSum : 1.0 / indices.length;
      const target = targetPolicy[idx] || 0.0;
      if (target > 0) {
        policyLoss -= target * Math.log(Math.max(1e-7, p[idx]));
      }
      dLogits[idx] = p[idx] - target; // d(CrossEntropy)/d(logit)
    }

    // Allocate gradient structures
    const grads = {
      w0: new Float32Array(this.w0.length),
      b0: new Float32Array(this.b0.length),
      w_r1_1: new Float32Array(this.w_r1_1.length),
      b_r1_1: new Float32Array(this.b_r1_1.length),
      w_r1_2: new Float32Array(this.w_r1_2.length),
      b_r1_2: new Float32Array(this.b_r1_2.length),
      w_r2_1: new Float32Array(this.w_r2_1.length),
      b_r2_1: new Float32Array(this.b_r2_1.length),
      w_r2_2: new Float32Array(this.w_r2_2.length),
      b_r2_2: new Float32Array(this.b_r2_2.length),
      w_pol1: new Float32Array(this.w_pol1.length),
      b_pol1: new Float32Array(this.b_pol1.length),
      w_pol2: new Float32Array(this.w_pol2.length),
      b_pol2: new Float32Array(this.b_pol2.length),
      w_val1: new Float32Array(this.w_val1.length),
      b_val1: new Float32Array(this.b_val1.length),
      w_val2: new Float32Array(this.w_val2.length),
      b_val2: new Float32Array(this.b_val2.length)
    };

    // --- Backprop Policy Head ---
    // w_pol2: (4096, 64)
    const dh_pol = new Float32Array(HH);
    for (let i = 0; i < POLICY_DIM; i++) {
      const dl = dLogits[i];
      if (dl === 0.0) continue;
      grads.b_pol2[i] = dl;
      const rowOffset = i * HH;
      for (let j = 0; j < HH; j++) {
        grads.w_pol2[rowOffset + j] = dl * cache.h_pol[j];
        dh_pol[j] += this.w_pol2[rowOffset + j] * dl;
      }
    }

    // LeakyReLU on z_pol1: 64
    const dz_pol1 = new Float32Array(HH);
    for (let i = 0; i < HH; i++) {
      dz_pol1[i] = dh_pol[i] * dLeakyRelu(cache.z_pol1[i]);
      grads.b_pol1[i] = dz_pol1[i];
    }

    // w_pol1: (64, 192) -> dh2_pol: 192
    const dh2 = new Float32Array(H);
    for (let i = 0; i < HH; i++) {
      const dz = dz_pol1[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        grads.w_pol1[rowOffset + j] = dz * cache.h2[j];
        dh2[j] += this.w_pol1[rowOffset + j] * dz;
      }
    }

    // --- Backprop Value Head ---
    // w_val2: (1, 64)
    grads.b_val2[0] = dValSum;
    const dh_val = new Float32Array(HH);
    for (let j = 0; j < HH; j++) {
      grads.w_val2[j] = dValSum * cache.h_val[j];
      dh_val[j] = this.w_val2[j] * dValSum;
    }

    // LeakyReLU on z_val1: 64
    const dz_val1 = new Float32Array(HH);
    for (let i = 0; i < HH; i++) {
      dz_val1[i] = dh_val[i] * dLeakyRelu(cache.z_val1[i]);
      grads.b_val1[i] = dz_val1[i];
    }

    // w_val1: (64, 192) -> accumulate to dh2
    for (let i = 0; i < HH; i++) {
      const dz = dz_val1[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        grads.w_val1[rowOffset + j] = dz * cache.h2[j];
        dh2[j] += this.w_val1[rowOffset + j] * dz;
      }
    }

    // --- Backprop Residual Block 2 ---
    // h2 = LeakyReLU(z_r2_2) + h1
    const dh1 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      dh1[i] = dh2[i]; // Skip connection gradient to h1
    }

    const dz_r2_2 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      dz_r2_2[i] = dh2[i] * dLeakyRelu(cache.z_r2_2[i]);
      grads.b_r2_2[i] = dz_r2_2[i];
    }

    const da_r2_1 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      const dz = dz_r2_2[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        grads.w_r2_2[rowOffset + j] = dz * cache.a_r2_1[j];
        da_r2_1[j] += this.w_r2_2[rowOffset + j] * dz;
      }
    }

    const dz_r2_1 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      dz_r2_1[i] = da_r2_1[i] * dLeakyRelu(cache.z_r2_1[i]);
      grads.b_r2_1[i] = dz_r2_1[i];
    }

    for (let i = 0; i < H; i++) {
      const dz = dz_r2_1[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        grads.w_r2_1[rowOffset + j] = dz * cache.h1[j];
        dh1[j] += this.w_r2_1[rowOffset + j] * dz;
      }
    }

    // --- Backprop Residual Block 1 ---
    // h1 = LeakyReLU(z_r1_2) + h0
    const dh0 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      dh0[i] = dh1[i]; // Skip connection gradient to h0
    }

    const dz_r1_2 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      dz_r1_2[i] = dh1[i] * dLeakyRelu(cache.z_r1_2[i]);
      grads.b_r1_2[i] = dz_r1_2[i];
    }

    const da_r1_1 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      const dz = dz_r1_2[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        grads.w_r1_2[rowOffset + j] = dz * cache.a_r1_1[j];
        da_r1_1[j] += this.w_r1_2[rowOffset + j] * dz;
      }
    }

    const dz_r1_1 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      dz_r1_1[i] = da_r1_1[i] * dLeakyRelu(cache.z_r1_1[i]);
      grads.b_r1_1[i] = dz_r1_1[i];
    }

    for (let i = 0; i < H; i++) {
      const dz = dz_r1_1[i];
      const rowOffset = i * H;
      for (let j = 0; j < H; j++) {
        grads.w_r1_1[rowOffset + j] = dz * cache.h0[j];
        dh0[j] += this.w_r1_1[rowOffset + j] * dz;
      }
    }

    // --- Backprop Projection Layer ---
    // h0 = LeakyReLU(z0)
    const dz0 = new Float32Array(H);
    for (let i = 0; i < H; i++) {
      dz0[i] = dh0[i] * dLeakyRelu(cache.z0[i]);
      grads.b0[i] = dz0[i];
    }

    for (let i = 0; i < H; i++) {
      const dz = dz0[i];
      const rowOffset = i * INPUT_DIM;
      for (let j = 0; j < INPUT_DIM; j++) {
        grads.w0[rowOffset + j] = dz * x[j];
      }
    }

    return {
      grads,
      valueLoss,
      policyLoss
    };
  }

  /**
   * Applies Adam optimizer update with computed gradients
   */
  applyGradients(grads, lr = 0.001, beta1 = 0.9, beta2 = 0.999, eps = 1e-8, weightDecay = 1e-4) {
    if (!this.adamMoments) {
      this.adamMoments = {};
      const keys = Object.keys(grads);
      for (const k of keys) {
        this.adamMoments[k] = {
          m: new Float32Array(this[k].length),
          v: new Float32Array(this[k].length)
        };
      }
    }

    this.adamStep++;
    const t = this.adamStep;
    const biasCorrection1 = 1.0 - Math.pow(beta1, t);
    const biasCorrection2 = 1.0 - Math.pow(beta2, t);

    const keys = Object.keys(grads);
    for (const k of keys) {
      const param = this[k];
      const g = grads[k];
      const { m, v } = this.adamMoments[k];
      const isWeight = k.startsWith('w');

      for (let i = 0; i < param.length; i++) {
        const gradVal = g[i];

        if (gradVal !== 0.0) {
          m[i] = beta1 * m[i] + (1.0 - beta1) * gradVal;
          v[i] = beta2 * v[i] + (1.0 - beta2) * (gradVal * gradVal);

          const mHat = m[i] / biasCorrection1;
          const vHat = v[i] / biasCorrection2;

          param[i] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
        }

        if (isWeight && weightDecay > 0) {
          param[i] -= lr * weightDecay * param[i];
        }
      }
    }
  }

  /**
   * Exports model weights to plain serializable JS object
   */
  exportWeights(meta = {}) {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      architecture: {
        inputDim: this.inputDim,
        hiddenDim: this.hiddenDim,
        headHidden: this.headHidden,
        policyDim: this.policyDim
      },
      meta,
      weights: {
        w0: Array.from(this.w0),
        b0: Array.from(this.b0),
        w_r1_1: Array.from(this.w_r1_1),
        b_r1_1: Array.from(this.b_r1_1),
        w_r1_2: Array.from(this.w_r1_2),
        b_r1_2: Array.from(this.b_r1_2),
        w_r2_1: Array.from(this.w_r2_1),
        b_r2_1: Array.from(this.b_r2_1),
        w_r2_2: Array.from(this.w_r2_2),
        b_r2_2: Array.from(this.b_r2_2),
        w_pol1: Array.from(this.w_pol1),
        b_pol1: Array.from(this.b_pol1),
        w_pol2: Array.from(this.w_pol2),
        b_pol2: Array.from(this.b_pol2),
        w_val1: Array.from(this.w_val1),
        b_val1: Array.from(this.b_val1),
        w_val2: Array.from(this.w_val2),
        b_val2: Array.from(this.b_val2)
      }
    };
  }

  /**
   * Imports weights from JS object or JSON
   */
  loadWeights(data) {
    const obj = typeof data === 'string' ? JSON.parse(data) : data;
    if (!obj || !obj.weights) return false;
    const w = obj.weights;

    const copyArray = (target, src) => {
      if (!src) return;
      for (let i = 0; i < target.length && i < src.length; i++) {
        target[i] = src[i];
      }
    };

    copyArray(this.w0, w.w0);
    copyArray(this.b0, w.b0);
    copyArray(this.w_r1_1, w.w_r1_1);
    copyArray(this.b_r1_1, w.b_r1_1);
    copyArray(this.w_r1_2, w.w_r1_2);
    copyArray(this.b_r1_2, w.b_r1_2);
    copyArray(this.w_r2_1, w.w_r2_1);
    copyArray(this.b_r2_1, w.b_r2_1);
    copyArray(this.w_r2_2, w.w_r2_2);
    copyArray(this.b_r2_2, w.b_r2_2);
    copyArray(this.w_pol1, w.w_pol1);
    copyArray(this.b_pol1, w.b_pol1);
    copyArray(this.w_pol2, w.w_pol2);
    copyArray(this.b_pol2, w.b_pol2);
    copyArray(this.w_val1, w.w_val1);
    copyArray(this.b_val1, w.b_val1);
    copyArray(this.w_val2, w.w_val2);
    copyArray(this.b_val2, w.b_val2);

    return true;
  }
}

// CommonJS compatibility for Node.js test runners
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ChessNN,
    encodeBoard,
    moveToIndex,
    indexToMove,
    INPUT_DIM,
    HIDDEN_DIM,
    HEAD_HIDDEN,
    POLICY_DIM
  };
}
