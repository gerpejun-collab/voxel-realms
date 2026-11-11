// test/test_chess_nn.js
// Automated verification suite for Pure JS Float32Array Neural Network
// Conforms to Specifications 151-161 & 195 of CHESS_200_SPEC_PLAN.md.

import assert from 'assert';
import fs from 'fs';
import { ChessEngine, INITIAL_FEN } from '../public/src/chess/chess_engine.js';
import { ChessNN, encodeBoard, moveToIndex, indexToMove, INPUT_DIM, POLICY_DIM } from '../public/src/chess/chess_nn.js';

console.log('Testing ChessNN (Pure JS Float32Array Neural Network)...');

async function runTests() {
  const weightsPath = new URL('../public/src/chess/chess_model_weights.json', import.meta.url);
  const weightsData = fs.existsSync(weightsPath) ? JSON.parse(fs.readFileSync(weightsPath, 'utf8')) : null;
  const engine = new ChessEngine();

  // Test 1: Tensor Shape and Initial Encoding
  console.log('Test 1: Tensor Shape and Board Encoding...');
  const tensor = encodeBoard(engine);
  assert.strictEqual(tensor.length, INPUT_DIM, `Tensor length must be exactly ${INPUT_DIM}`);
  assert(tensor instanceof Float32Array, 'Tensor must be Float32Array');

  let activeCount = 0;
  for (let i = 0; i < tensor.length; i++) {
    if (tensor[i] > 0) activeCount++;
  }
  // 32 pieces + 64 turn values for white + 4 castling squares = 100 active values
  assert(activeCount >= 96, `Expected at least 96 active features, got ${activeCount}`);
  console.log(`✓ Board encoded to Float32Array(${INPUT_DIM}) with ${activeCount} active bits.`);

  // Test 2: Move Indexing Roundtrip
  console.log('Test 2: Move Indexing (0..4095)...');
  const testMoves = [
    { from: 'e2', to: 'e4' },
    { from: 'd2', to: 'd4' },
    { from: 'g1', to: 'f3' },
    { from: 'e7', to: 'e8', promotion: 'q' }
  ];
  for (const m of testMoves) {
    const idx = moveToIndex(m);
    assert(idx >= 0 && idx < POLICY_DIM, `Index ${idx} must be in [0, 4095]`);
    const recovered = indexToMove(idx, m.promotion);
    assert.strictEqual(recovered.from, m.from, 'Recovered from-square matches');
    assert.strictEqual(recovered.to, m.to, 'Recovered to-square matches');
  }
  console.log('✓ Move indexing roundtrip verified.');

  // Test 3: Forward Pass Inference & Output Ranges
  console.log('Test 3: Forward Pass Output Sanity...');
  const nn = new ChessNN(weightsData);
  const fwd = nn.forward(tensor, false);
  assert(fwd.policyLogits instanceof Float32Array, 'Policy logits must be Float32Array');
  assert.strictEqual(fwd.policyLogits.length, POLICY_DIM, 'Policy logits length must be 4096');
  assert(typeof fwd.value === 'number', 'Value must be scalar number');
  assert(fwd.value >= -1.0 && fwd.value <= 1.0, `Value ${fwd.value} must be within [-1, 1]`);
  assert(!isNaN(fwd.value), 'Value must not be NaN');

  const pred = nn.predict(engine);
  assert(pred.moveProbabilities.length > 0, 'Must return move probabilities for initial position');
  let probSum = 0;
  for (const item of pred.moveProbabilities) {
    probSum += item.prob;
    assert(item.prob >= 0 && item.prob <= 1.0, 'Each move probability in [0, 1]');
  }
  assert(Math.abs(probSum - 1.0) < 1e-4, `Probabilities must sum to 1.0 (got ${probSum})`);
  console.log(`✓ Forward pass inference stable: value=${fwd.value.toFixed(4)}, sum(p)=${probSum.toFixed(4)}.`);

  // Test 4: Analytical Backpropagation and Adam Update
  console.log('Test 4: Analytical Backpropagation & Gradient Step...');
  const targetPolicy = new Float32Array(POLICY_DIM);
  targetPolicy[moveToIndex({ from: 'e2', to: 'e4' })] = 0.7;
  targetPolicy[moveToIndex({ from: 'd2', to: 'd4' })] = 0.3;
  const targetValue = 0.8;

  const legalIndices = [
    moveToIndex({ from: 'e2', to: 'e4' }),
    moveToIndex({ from: 'd2', to: 'd4' })
  ];

  const { grads, valueLoss, policyLoss } = nn.backward(tensor, targetPolicy, targetValue, legalIndices);
  assert(grads.w0 && grads.w_pol2 && grads.w_val2, 'Gradients must contain all layer keys');
  assert(!isNaN(valueLoss), 'Value loss must be finite');
  assert(!isNaN(policyLoss), 'Policy loss must be finite');

  // Verify non-zero gradients
  let gradSum = 0;
  for (let i = 0; i < grads.w0.length; i += 100) {
    gradSum += Math.abs(grads.w0[i]);
  }
  assert(gradSum > 0, 'Weight gradients must be non-zero');

  // Apply gradient step and verify loss decreases
  const initialLoss = valueLoss + policyLoss;
  nn.applyGradients(grads, 0.001);
  const fwdAfter = nn.backward(tensor, targetPolicy, targetValue, legalIndices);
  const newLoss = fwdAfter.valueLoss + fwdAfter.policyLoss;
  assert(newLoss < initialLoss, `Loss must decrease after gradient step: before=${initialLoss.toFixed(4)}, after=${newLoss.toFixed(4)}`);
  console.log(`✓ Analytical backprop verified: loss dropped from ${initialLoss.toFixed(4)} to ${newLoss.toFixed(4)}.`);

  // Test 5: Weight Serialization and Deserialization Roundtrip
  console.log('Test 5: Weights Serialization Roundtrip...');
  const exported = nn.exportWeights({ test: true });
  assert(exported.weights && exported.architecture, 'Exported weights must contain architecture and weights');

  const nn2 = new ChessNN();
  nn2.loadWeights(exported);

  const fwd1 = nn.forward(tensor);
  const fwd2 = nn2.forward(tensor);
  assert(Math.abs(fwd1.value - fwd2.value) < 1e-6, 'Reloaded network must produce identical value output');
  assert(Math.abs(fwd1.policyLogits[100] - fwd2.policyLogits[100]) < 1e-6, 'Reloaded network must produce identical policy output');
  console.log('✓ Weight serialization roundtrip identical to 1e-6 precision.');

  console.log('\nALL CHESS NN TESTS PASSED!');
}

runTests().catch(err => {
  console.error('Chess NN Test Failed:', err);
  process.exit(1);
});
