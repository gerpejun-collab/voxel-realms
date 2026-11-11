// test/test_chess_rl.js
// Automated verification suite for Headless Reinforcement Learning Training Pipeline
// Conforms to Specifications 180-190 & 198 of CHESS_200_SPEC_PLAN.md.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChessNN } from '../public/src/chess/chess_nn.js';
import { playSelfPlayGame, runTraining, parseArgs } from '../scripts/train_chess_rl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing Reinforcement Learning Self-Play & Training Pipeline...');

async function runTests() {
  const nn = new ChessNN();

  // Test 1: Self-play Episode Execution & Trajectory Generation
  console.log('Test 1: Self-Play Episode Generation...');
  const episode = playSelfPlayGame(nn, { sims: 10, maxPlies: 20 });

  assert(episode.trajectory.length > 0, 'Trajectory must contain move steps');
  assert(episode.plyCount > 0, 'Ply count must be greater than 0');
  assert(typeof episode.reason === 'string', 'Reason must be string');

  const firstStep = episode.trajectory[0];
  assert(firstStep.x instanceof Float32Array, 'State tensor must be Float32Array');
  assert.strictEqual(firstStep.x.length, 896, 'State tensor dimension must be 896');
  assert(firstStep.pi instanceof Float32Array, 'Target policy must be Float32Array');
  assert.strictEqual(firstStep.pi.length, 4096, 'Policy dimension must be 4096');
  assert(firstStep.turn === 'w' || firstStep.turn === 'b', 'Turn must be valid color');
  assert(firstStep.legalIndices.length > 0, 'Must record legal move indices');
  console.log(`✓ Self-play episode completed: ${episode.plyCount} plies, ${episode.trajectory.length} samples collected.`);

  // Test 2: Argument Parsing
  console.log('Test 2: CLI Argument Parsing...');
  const parsed = parseArgs(['--games', '5', '--sims', '25', '--batch-size', '8', '--lr', '0.002', '--epochs', '3']);
  assert.strictEqual(parsed.games, 5, 'Games parsed correctly');
  assert.strictEqual(parsed.sims, 25, 'Sims parsed correctly');
  assert.strictEqual(parsed.batchSize, 8, 'Batch size parsed correctly');
  assert.strictEqual(parsed.lr, 0.002, 'Learning rate parsed correctly');
  assert.strictEqual(parsed.epochs, 3, 'Epochs parsed correctly');
  console.log('✓ CLI arguments parsed correctly.');

  // Test 3: Mini Training Run & Checkpoint Persistence
  console.log('Test 3: Full Training Pipeline with Temp Checkpoint...');
  const tempCheckpoint = path.resolve(__dirname, 'temp_test_weights.json');

  // Clean up any stale temp file
  if (fs.existsSync(tempCheckpoint)) fs.unlinkSync(tempCheckpoint);

  const trainRes = await runTraining({
    games: 2,
    sims: 10,
    batchSize: 8,
    lr: 0.001,
    epochs: 2,
    checkpoint: tempCheckpoint,
    maxPlies: 16,
    verbose: false
  });

  assert(trainRes.stats.totalPlies > 0, 'Should have played plies');
  assert(trainRes.losses.length === 2, 'Should have logged 2 epochs of losses');
  assert(!isNaN(trainRes.losses[0].valLoss), 'Epoch value loss must be a number');
  assert(!isNaN(trainRes.losses[0].polLoss), 'Epoch policy loss must be a number');

  // Verify checkpoint was written and is valid JSON
  assert(fs.existsSync(tempCheckpoint), 'Temp checkpoint file must exist on disk');
  const fileContent = fs.readFileSync(tempCheckpoint, 'utf8');
  const parsedWeights = JSON.parse(fileContent);
  assert(parsedWeights.architecture && parsedWeights.weights, 'Saved checkpoint must have architecture and weights');

  // Verify trained weights can be reloaded into ChessNN
  const reloadedNN = new ChessNN(parsedWeights);
  const sampleFwd = reloadedNN.forward(firstStep.x);
  assert(!isNaN(sampleFwd.value), 'Reloaded network must produce valid scalar');
  assert(!isNaN(sampleFwd.policyLogits[0]), 'Reloaded network must produce valid logits');
  console.log('✓ Training pipeline updated weights and saved valid checkpoint.');

  // Clean up temp file
  if (fs.existsSync(tempCheckpoint)) fs.unlinkSync(tempCheckpoint);
  console.log('✓ Temporary checkpoint cleaned up.');

  console.log('\nALL CHESS RL TESTS PASSED!');
}

runTests().catch(err => {
  console.error('Chess RL Test Failed:', err);
  process.exit(1);
});
