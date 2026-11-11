// public/src/chess/chess_mcts.js
// AlphaZero-Style Monte Carlo Tree Search (MCTS) with PUCT Formula & Dirichlet Noise
// Fully conforms to Specifications 166-173 of CHESS_200_SPEC_PLAN.md.

import { ChessEngine } from './chess_engine.js';
import { ChessNN, moveToIndex } from './chess_nn.js';

/**
 * Sample Gamma(alpha, 1) using Marsaglia & Tsang's method
 */
function sampleGamma(alpha) {
  if (alpha < 1.0) {
    // Ahrens-Dieter boost for alpha < 1
    const u = Math.max(1e-12, Math.random());
    return sampleGamma(alpha + 1.0) * Math.pow(u, 1.0 / alpha);
  }

  const d = alpha - 1.0 / 3.0;
  const c = 1.0 / Math.sqrt(9.0 * d);
  while (true) {
    let z = 0;
    let v = 0;
    do {
      // Standard normal variable via Box-Muller
      const u1 = Math.max(1e-12, Math.random());
      const u2 = Math.random();
      z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      v = 1.0 + c * z;
    } while (v <= 0.0);

    v = v * v * v;
    const u = Math.random();
    if (u < 1.0 - 0.0331 * z * z * z * z) return d * v;
    if (Math.log(u) < 0.5 * z * z + d * (1.0 - v + Math.log(v))) return d * v;
  }
}

/**
 * Sample Dirichlet distribution array with parameter alpha
 */
function sampleDirichlet(n, alpha = 0.3) {
  const samples = new Float32Array(n);
  let sum = 0.0;
  for (let i = 0; i < n; i++) {
    const s = sampleGamma(alpha);
    samples[i] = s;
    sum += s;
  }
  if (sum > 0) {
    for (let i = 0; i < n; i++) {
      samples[i] /= sum;
    }
  } else {
    for (let i = 0; i < n; i++) {
      samples[i] = 1.0 / n;
    }
  }
  return samples;
}

/**
 * MCTS Tree Node
 */
export class MCTSNode {
  constructor(move = null, parent = null, prior = 0.0) {
    this.move = move; // { from: 'e2', to: 'e4', promotion: 'q' }
    this.moveKey = move ? `${move.from}-${move.to}${move.promotion ? '=' + move.promotion : ''}` : 'root';
    this.parent = parent;
    this.children = new Map(); // moveKey -> MCTSNode
    this.visitCount = 0;       // N(s, a)
    this.totalValue = 0.0;     // W(s, a)
    this.meanValue = 0.0;      // Q(s, a) = W / N
    this.prior = prior;        // P(s, a)
    this.isTerminal = false;
    this.terminalValue = 0.0;
    this.isExpanded = false;
  }

  /**
   * Adds child node
   */
  addChild(move, prior = 0.0) {
    const child = new MCTSNode(move, this, prior);
    this.children.set(child.moveKey, child);
    return child;
  }

  /**
   * Computes PUCT score for child selection
   */
  computePUCT(cpuct = 1.414, parentVisits = 1) {
    const u = cpuct * this.prior * (Math.sqrt(parentVisits) / (1.0 + this.visitCount));
    return this.meanValue + u;
  }
}

/**
 * Monte Carlo Tree Search Engine
 */
export class ChessMCTS {
  constructor(neuralNet = null, options = {}) {
    this.nn = neuralNet || new ChessNN();
    this.cpuct = options.cpuct || 1.414;
    this.dirichletAlpha = options.dirichletAlpha || 0.3;
    this.dirichletEpsilon = options.dirichletEpsilon || 0.25;
    this.nodesCreated = 0;
  }

  /**
   * Runs MCTS search from the current board state
   * @param {ChessEngine} engine - root game engine state
   * @param {object} options - { simulations: 400, temperature: 1.0, addNoise: false }
   * @returns {{bestMove: object, visitCounts: Map, probabilities: Map, rootValue: number, totalSimulations: number}}
   */
  search(engine, options = {}) {
    const simulations = options.simulations || 200;
    const temperature = options.temperature !== undefined ? options.temperature : 0.0;
    const addNoise = Boolean(options.addNoise);

    const legalMoves = engine.generateLegalMoves(engine.turn);
    if (legalMoves.length === 0) {
      return {
        bestMove: null,
        visitCounts: new Map(),
        probabilities: new Map(),
        rootValue: 0,
        totalSimulations: 0
      };
    }

    if (legalMoves.length === 1) {
      const singleMove = legalMoves[0];
      const fromStr = ChessEngine.coordsToSquare(singleMove.from.row, singleMove.from.col);
      const toStr = ChessEngine.coordsToSquare(singleMove.to.row, singleMove.to.col);
      return {
        bestMove: { from: fromStr, to: toStr, promotion: singleMove.promotion || 'q' },
        visitCounts: new Map([[`${fromStr}-${toStr}`, 1]]),
        probabilities: new Map([[`${fromStr}-${toStr}`, 1.0]]),
        rootValue: 0.0,
        totalSimulations: 1
      };
    }

    // Initialize root node
    const root = new MCTSNode(null, null, 1.0);
    this.expandNode(root, engine, legalMoves);

    // Inject Dirichlet noise at root during training/self-play
    if (addNoise && root.children.size > 0) {
      const childArray = Array.from(root.children.values());
      const noise = sampleDirichlet(childArray.length, this.dirichletAlpha);
      const eps = this.dirichletEpsilon;
      for (let i = 0; i < childArray.length; i++) {
        childArray[i].prior = (1.0 - eps) * childArray[i].prior + eps * noise[i];
      }
    }

    // Run simulation budget
    for (let sim = 0; sim < simulations; sim++) {
      let node = root;
      const simEngine = engine.clone();

      // 1. Selection: traverse down tree maximizing PUCT
      while (node.isExpanded && !node.isTerminal && node.children.size > 0) {
        let bestChild = null;
        let bestPUCT = -Infinity;
        const totalVisits = Math.max(1, node.visitCount);

        for (const child of node.children.values()) {
          const puct = child.computePUCT(this.cpuct, totalVisits);
          if (puct > bestPUCT) {
            bestPUCT = puct;
            bestChild = child;
          }
        }

        if (!bestChild) break;
        node = bestChild;
        simEngine.makeMove(node.move.from, node.move.to, node.move.promotion);
      }

      // 2. Expansion & Leaf Evaluation
      let leafValue = 0.0;
      if (node.isTerminal) {
        leafValue = node.terminalValue;
      } else {
        const moves = simEngine.generateLegalMoves(simEngine.turn);
        const status = simEngine.getGameStatus();

        if (status.isGameOver) {
          node.isTerminal = true;
          if (status.result === 'checkmate') {
            // Active player in simEngine has been checkmated
            node.terminalValue = -1.0;
            leafValue = -1.0;
          } else {
            // Draw
            node.terminalValue = 0.0;
            leafValue = 0.0;
          }
        } else {
          // Neural network evaluation
          const { value } = this.expandNode(node, simEngine, moves);
          leafValue = value;
        }
      }

      // 3. Backpropagation: traverse up the path negating value at alternating plies
      let curr = node;
      let val = curr === root ? leafValue : -leafValue;
      while (curr !== null) {
        curr.visitCount += 1;
        curr.totalValue += val;
        curr.meanValue = curr.totalValue / curr.visitCount;
        val = -val; // Invert value for parent's perspective
        curr = curr.parent;
      }
    }

    // Move Selection Strategy based on visit counts & temperature
    const childArray = Array.from(root.children.values());
    const visitCounts = new Map();
    const probabilities = new Map();

    let totalVisits = 0;
    for (const child of childArray) {
      visitCounts.set(child.moveKey, child.visitCount);
      totalVisits += child.visitCount;
    }

    let selectedChild = null;

    if (temperature <= 0.05) {
      // Argmax selection (competitive play)
      let maxVisits = -1;
      for (const child of childArray) {
        const prob = totalVisits > 0 ? child.visitCount / totalVisits : 0;
        probabilities.set(child.moveKey, prob);
        if (child.visitCount > maxVisits) {
          maxVisits = child.visitCount;
          selectedChild = child;
        }
      }
    } else {
      // Temperature-scaled probabilistic sampling
      let expVisitSum = 0.0;
      const expVisits = [];
      const invTemp = 1.0 / temperature;

      for (const child of childArray) {
        const count = Math.max(1e-4, child.visitCount);
        const ev = Math.pow(count, invTemp);
        expVisits.push(ev);
        expVisitSum += ev;
      }

      let r = Math.random() * expVisitSum;
      let accum = 0.0;
      for (let i = 0; i < childArray.length; i++) {
        const child = childArray[i];
        const prob = expVisitSum > 0 ? expVisits[i] / expVisitSum : 1.0 / childArray.length;
        probabilities.set(child.moveKey, prob);

        accum += expVisits[i];
        if (!selectedChild && accum >= r) {
          selectedChild = child;
        }
      }
      if (!selectedChild && childArray.length > 0) {
        selectedChild = childArray[childArray.length - 1];
      }
    }

    const chosenMove = selectedChild ? selectedChild.move : legalMoves[0];
    const fromStr = typeof chosenMove.from === 'string'
      ? chosenMove.from
      : ChessEngine.coordsToSquare(chosenMove.from.row, chosenMove.from.col);
    const toStr = typeof chosenMove.to === 'string'
      ? chosenMove.to
      : ChessEngine.coordsToSquare(chosenMove.to.row, chosenMove.to.col);

    return {
      bestMove: {
        from: fromStr,
        to: toStr,
        promotion: chosenMove.promotion || 'q'
      },
      visitCounts,
      probabilities,
      rootValue: root.meanValue,
      totalSimulations: simulations
    };
  }

  /**
   * Expands a node with legal moves and neural priors
   */
  expandNode(node, engine, legalMoves) {
    if (node.isExpanded) return { value: node.meanValue };

    const { moveProbabilities, value } = this.nn.predict(engine, legalMoves);
    node.isExpanded = true;
    this.nodesCreated += moveProbabilities.length;

    for (const item of moveProbabilities) {
      const fromStr = typeof item.move.from === 'string'
        ? item.move.from
        : ChessEngine.coordsToSquare(item.move.from.row, item.move.from.col);
      const toStr = typeof item.move.to === 'string'
        ? item.move.to
        : ChessEngine.coordsToSquare(item.move.to.row, item.move.to.col);

      const normalizedMove = {
        from: fromStr,
        to: toStr,
        promotion: item.move.promotion || 'q'
      };

      node.addChild(normalizedMove, Math.max(1e-5, item.prob));
    }

    return { value };
  }
}

// CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ChessMCTS,
    MCTSNode
  };
}
