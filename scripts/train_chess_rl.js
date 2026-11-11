#!/usr/bin/env node
// scripts/train_chess_rl.js
// Headless Self-Play Reinforcement Learning Training Pipeline for Voxel Realms Chess
// Fully conforms to Specifications 180-190 of CHESS_200_SPEC_PLAN.md.
// Executes self-play episodes, computes analytical gradients in pure JS, and updates weights via Adam optimizer.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChessEngine } from '../public/src/chess/chess_engine.js';
import { ChessNN, encodeBoard, moveToIndex, POLICY_DIM } from '../public/src/chess/chess_nn.js';
import { ChessMCTS } from '../public/src/chess/chess_mcts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parses CLI arguments
 */
export function parseArgs(args) {
  const options = {
    games: 10,
    sims: 50,
    batchSize: 16,
    lr: 0.001,
    epochs: 2,
    checkpoint: path.resolve(__dirname, '../public/src/chess/chess_model_weights.json'),
    maxPlies: 120,
    verbose: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--games' && args[i + 1]) options.games = parseInt(args[++i], 10);
    else if (arg === '--sims' && args[i + 1]) options.sims = parseInt(args[++i], 10);
    else if (arg === '--batch-size' && args[i + 1]) options.batchSize = parseInt(args[++i], 10);
    else if (arg === '--lr' && args[i + 1]) options.lr = parseFloat(args[++i]);
    else if (arg === '--epochs' && args[i + 1]) options.epochs = parseInt(args[++i], 10);
    else if (arg === '--checkpoint' && args[i + 1]) options.checkpoint = path.resolve(process.cwd(), args[++i]);
    else if (arg === '--max-plies' && args[i + 1]) options.maxPlies = parseInt(args[++i], 10);
    else if (arg === '--quiet') options.verbose = false;
  }

  return options;
}

/**
 * Executes a single episode of self-play using MCTS
 * @param {ChessNN} nn
 * @param {object} options
 * @returns {{trajectory: Array<{x: Float32Array, pi: Float32Array, turn: string, legalIndices: Array}>, winner: string|null, reason: string, plyCount: number}}
 */
export function playSelfPlayGame(nn, options = {}) {
  const sims = options.sims || 50;
  const maxPlies = options.maxPlies || 120;
  const engine = new ChessEngine();
  const mcts = new ChessMCTS(nn, { cpuct: 1.414, dirichletAlpha: 0.3, dirichletEpsilon: 0.25 });

  const trajectory = [];
  let ply = 0;

  while (ply < maxPlies) {
    ply++;
    const turn = engine.turn;
    const x = encodeBoard(engine);

    // Dynamic temperature: tau = 1.0 for first 10 plies for opening variety, then tau -> 0.05
    const temperature = ply <= 10 ? 1.0 : 0.05;

    // Run MCTS search
    const searchRes = mcts.search(engine, {
      simulations: sims,
      temperature,
      addNoise: true
    });

    if (!searchRes.bestMove) {
      break;
    }

    // Convert search probabilities into target policy tensor Float32Array(4096)
    const pi = new Float32Array(POLICY_DIM);
    const legalIndices = [];

    for (const [key, prob] of searchRes.probabilities.entries()) {
      const parts = key.split('-');
      const from = parts[0];
      const rest = parts[1] || '';
      const to = rest.slice(0, 2);
      const promo = rest.includes('=') ? rest.split('=')[1] : 'q';
      const mIdx = moveToIndex({ from, to, promotion: promo });
      if (mIdx >= 0 && mIdx < POLICY_DIM) {
        pi[mIdx] = prob;
        legalIndices.push(mIdx);
      }
    }

    trajectory.push({
      x,
      pi,
      turn,
      legalIndices
    });

    // Make move in engine
    const executed = engine.makeMove(searchRes.bestMove.from, searchRes.bestMove.to, searchRes.bestMove.promotion);
    if (!executed) break;

    const status = engine.getGameStatus();
    if (status.isGameOver) {
      return {
        trajectory,
        winner: status.winner,
        reason: status.reason,
        plyCount: ply
      };
    }
  }

  // Draw by max plies limit
  return {
    trajectory,
    winner: null,
    reason: `Max plies reached (${maxPlies})`,
    plyCount: ply
  };
}

/**
 * Runs reinforcement learning self-play and training loop
 */
export async function runTraining(options) {
  const { games, sims, batchSize, lr, epochs, checkpoint, maxPlies, verbose } = options;

  if (verbose) {
    console.log('=== Voxel Realms Chess AI: Self-Play RL Training ===');
    console.log(`Config: ${games} games | ${sims} sims/move | batch size ${batchSize} | lr ${lr} | epochs ${epochs}`);
    console.log(`Target checkpoint: ${checkpoint}`);
  }

  // Load existing weights if file exists
  let existingWeights = null;
  if (fs.existsSync(checkpoint)) {
    try {
      existingWeights = JSON.parse(fs.readFileSync(checkpoint, 'utf8'));
      if (verbose) console.log(`Loaded existing weights from ${path.basename(checkpoint)}`);
    } catch (err) {
      if (verbose) console.warn('Could not read existing weights file, initializing fresh model.');
    }
  }

  const nn = new ChessNN(existingWeights);

  const stats = {
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    totalPlies: 0
  };

  const replayBuffer = [];

  // Phase 1: Self-Play Data Generation
  if (verbose) console.log('\n--- Phase 1: Executing Self-Play Matches ---');
  const startTime = Date.now();

  for (let g = 1; g <= games; g++) {
    const gameStart = Date.now();
    const episode = playSelfPlayGame(nn, { sims, maxPlies });
    const gameDuration = ((Date.now() - gameStart) / 1000).toFixed(1);

    stats.totalPlies += episode.plyCount;

    // Assign final game outcome Z from White's perspective (+1 = White, -1 = Black, 0 = Draw)
    let Z = 0.0;
    if (episode.winner === 'w') {
      Z = 1.0;
      stats.whiteWins++;
    } else if (episode.winner === 'b') {
      Z = -1.0;
      stats.blackWins++;
    } else {
      Z = 0.0;
      stats.draws++;
    }

    // Attach outcome target z_t to each trajectory step relative to active player
    for (const step of episode.trajectory) {
      const z = step.turn === 'w' ? Z : -Z;
      replayBuffer.push({
        x: step.x,
        pi: step.pi,
        z,
        legalIndices: step.legalIndices
      });
    }

    if (verbose) {
      const outcomeStr = episode.winner ? `${episode.winner.toUpperCase()} won` : 'Draw';
      console.log(`[Game ${g}/${games}] ${episode.plyCount} plies in ${gameDuration}s -> ${outcomeStr} (${episode.reason})`);
    }
  }

  const selfPlayDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  if (verbose) {
    console.log(`\nSelf-Play Completed in ${selfPlayDuration}s:`);
    console.log(`  White Wins: ${stats.whiteWins} | Black Wins: ${stats.blackWins} | Draws: ${stats.draws}`);
    console.log(`  Total Samples Collected: ${replayBuffer.length}`);
  }

  if (replayBuffer.length === 0) {
    if (verbose) console.warn('No samples generated, skipping optimization.');
    return { stats, losses: [] };
  }

  // Phase 2: Analytical Backprop & Adam Optimization
  if (verbose) console.log('\n--- Phase 2: Analytical Backpropagation & Adam Optimizer ---');

  const lossHistory = [];

  for (let epoch = 1; epoch <= epochs; epoch++) {
    // Shuffle replay buffer
    for (let i = replayBuffer.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = replayBuffer[i];
      replayBuffer[i] = replayBuffer[j];
      replayBuffer[j] = temp;
    }

    let epochValLoss = 0.0;
    let epochPolLoss = 0.0;
    let batches = 0;

    for (let i = 0; i < replayBuffer.length; i += batchSize) {
      const batch = replayBuffer.slice(i, i + batchSize);
      if (batch.length === 0) continue;

      // Accumulate gradients across batch
      let accumulatedGrads = null;

      for (const sample of batch) {
        const { grads, valueLoss, policyLoss } = nn.backward(sample.x, sample.pi, sample.z, sample.legalIndices);
        epochValLoss += valueLoss;
        epochPolLoss += policyLoss;

        if (!accumulatedGrads) {
          accumulatedGrads = grads;
        } else {
          for (const k of Object.keys(grads)) {
            const acc = accumulatedGrads[k];
            const g = grads[k];
            for (let j = 0; j < acc.length; j++) {
              acc[j] += g[j];
            }
          }
        }
      }

      // Scale gradients by 1 / batch.length
      const scale = 1.0 / batch.length;
      for (const k of Object.keys(accumulatedGrads)) {
        const acc = accumulatedGrads[k];
        for (let j = 0; j < acc.length; j++) {
          acc[j] *= scale;
        }
      }

      // Apply Adam step
      nn.applyGradients(accumulatedGrads, lr);
      batches++;
    }

    const avgValLoss = (epochValLoss / replayBuffer.length).toFixed(4);
    const avgPolLoss = (epochPolLoss / replayBuffer.length).toFixed(4);
    lossHistory.push({ epoch, valLoss: parseFloat(avgValLoss), polLoss: parseFloat(avgPolLoss) });

    if (verbose) {
      console.log(`[Epoch ${epoch}/${epochs}] Batches: ${batches} | Value MSE Loss: ${avgValLoss} | Policy XEnt Loss: ${avgPolLoss}`);
    }
  }

  // Phase 3: Checkpoint Persistence
  if (verbose) console.log('\n--- Phase 3: Saving Model Weights ---');
  const exportData = nn.exportWeights({
    trainingGames: games,
    totalSamples: replayBuffer.length,
    finalValLoss: lossHistory.length ? lossHistory[lossHistory.length - 1].valLoss : 0,
    finalPolLoss: lossHistory.length ? lossHistory[lossHistory.length - 1].polLoss : 0,
    stats
  });

  // Round weights to 5 decimal places for clean footprint
  for (const k of Object.keys(exportData.weights)) {
    exportData.weights[k] = exportData.weights[k].map(v => Math.round(v * 100000) / 100000);
  }

  const dir = path.dirname(checkpoint);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(checkpoint, JSON.stringify(exportData));
  if (verbose) {
    const sizeMb = (fs.statSync(checkpoint).size / (1024 * 1024)).toFixed(2);
    console.log(`Successfully saved checkpoint: ${checkpoint} (${sizeMb} MB)`);
    console.log('Reinforcement learning training completed successfully!\n');
  }

  return {
    stats,
    losses: lossHistory,
    checkpoint
  };
}

// Direct CLI invocation
const isMain = process.argv[1] && (
  process.argv[1].endsWith('train_chess_rl.js') ||
  process.argv[1] === fileURLToPath(import.meta.url)
);

if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  runTraining(options).catch(err => {
    console.error('Training Error:', err);
    process.exit(1);
  });
}
