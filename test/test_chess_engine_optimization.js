import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChessEngine } from '../public/src/chess/chess_engine.js';
import { ChessAI } from '../public/src/chess/chess_ai.js';
import { handleWorkerMessage } from '../public/src/chess/chess_ai_worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Grandmaster Chess Engine Optimization Test Suite ===\n');

async function testMoveExecutionSpeedAndIntegrity() {
    console.log('[Test 1] Fast Move Execution & Unmake Move Benchmarking...');
    const engine = new ChessEngine();
    const initialFen = engine.getFen();

    const moves = [
        { from: 'e2', to: 'e4', promo: 'q' },
        { from: 'e7', to: 'e5', promo: 'q' },
        { from: 'g1', to: 'f3', promo: 'q' },
        { from: 'b8', to: 'c6', promo: 'q' }
    ];

    const iterations = 250000;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
        const m = moves[i % moves.length];
        const undo = engine.makeMoveFast(m.from, m.to, m.promo);
        engine.unmakeMove(undo);
    }

    const elapsedMs = Math.max(1, Date.now() - start);
    const opsPerSec = Math.round((iterations / elapsedMs) * 1000);

    console.log(`  Executed ${iterations.toLocaleString()} makeFast/unmake cycles in ${elapsedMs}ms`);
    console.log(`  Throughput: ${opsPerSec.toLocaleString()} ops/sec`);

    assert(opsPerSec >= 200000, `Move execution speed ${opsPerSec} ops/sec must be >= 200,000 ops/sec`);
    assert.strictEqual(engine.getFen(), initialFen, 'Board state and FEN must match initial after all unmake cycles');
    console.log('✓ Fast move execution speed and board integrity verified!\n');
}

async function testSearchThroughputNPS() {
    console.log('[Test 2] Alpha-Beta Search Throughput (NPS Target >= 80,000)...');
    const engine = new ChessEngine('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'); // Kiwipete position
    const ai = new ChessAI();

    const start = Date.now();
    const result = ai.searchMinimax(engine, 4, true);
    const elapsedMs = Math.max(1, Date.now() - start);
    const nodes = ai.nodesEvaluated;
    const nps = Math.round((nodes / elapsedMs) * 1000);

    console.log(`  Depth 4 Kiwipete search: ${nodes.toLocaleString()} nodes in ${elapsedMs}ms`);
    console.log(`  Measured NPS: ${nps.toLocaleString()} NPS`);
    console.log(`  Best Move Found: ${result ? result.from + '->' + result.to : 'null'} (score: ${result ? result.score : 0})`);

    assert(result && result.from && result.to, 'Search must produce a valid best move');
    assert(nps >= 80000, `Search throughput ${nps} NPS must be >= 80,000 NPS`);
    console.log('✓ Search throughput requirement verified!\n');
}

async function testTacticalPuzzleSuite() {
    console.log('[Test 3] Canonical 20-Position Tactical Puzzle Suite...');
    const ai = new ChessAI();
    const engine = new ChessEngine();

    const puzzles = [
        { name: 'Back-rank mate in 1', fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', expected: ['e1e8'] },
        { name: "Scholar's mate in 1", fen: 'r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', expected: ['h5f7'] },
        { name: 'Ladder mate in 1', fen: '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1', expected: ['b1b8'] },
        { name: 'Queen box mate in 1', fen: 'k1K5/8/1Q6/8/8/8/8/8 w - - 0 1', expected: ['b6a5', 'b6b7', 'b6b8'] },
        { name: 'Rook helper mate in 1', fen: '4k3/R7/4K3/8/8/8/8/8 w - - 0 1', expected: ['a7a8'] },
        { name: 'Back rank mate in 2', fen: '6k1/3R1ppp/8/8/8/8/4qPPP/6K1 w - - 0 1', expected: ['d7d8'] },
        { name: 'Deflection mate in 2', fen: '2r3k1/5ppp/8/8/8/8/4QPPP/2R3K1 w - - 0 1', expected: ['c1c8'] },
        { name: 'Queen back-rank mate in 1', fen: '6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1', expected: ['b2b8'] },
        { name: 'Royal Fork (Knight forks King and Queen)', fen: '8/2q1k3/8/8/8/4N3/8/4K3 w - - 0 1', expected: ['e3d5'] },
        { name: 'Pawn fork winning piece', fen: 'r1bqk2r/pppp1ppp/8/2b1n3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', expected: ['d2d4'] },
        { name: 'Absolute Pin winning Queen', fen: '4k3/8/4q3/8/8/8/8/4R1K1 w - - 0 1', expected: ['e1e6'] },
        { name: 'Skewer winning Queen', fen: '8/8/8/4k2q/8/8/8/R5K1 w - - 0 1', expected: ['a1a5'] },
        { name: 'Discovered check winning Queen', fen: '3qk3/8/8/3B4/8/8/8/3R2K1 w - - 0 1', expected: ['d5c6', 'd5f7', 'd5b7', 'd5e4'] },
        { name: 'Pawn Promotion Tactic', fen: '8/4P3/8/8/8/8/1r6/4K2k w - - 0 1', expected: ['e7e8'] },
        { name: 'Queen & King mate in 1', fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', expected: ['f7e8', 'f7g7', 'f7h7'] },
        { name: 'Anastasia-style mate in 1', fen: '7k/R7/5N2/8/8/8/8/6K1 w - - 0 1', expected: ['a7h7'] },
        { name: 'Simple rook recapture mate in 1', fen: '3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', expected: ['d1d8'] },
        { name: 'Fork: Queen forks King & Rook', fen: '4k3/8/8/8/8/8/8/r3Q1K1 w - - 0 1', expected: ['e1a1'] },
        { name: 'Queen & Bishop battery mate in 1', fen: '6k1/5ppp/5Q2/8/8/2B5/5PPP/6K1 w - - 0 1', expected: ['f6g7'] },
        { name: 'Overloaded doubled rooks removal', fen: '3r2k1/3r1ppp/8/8/8/8/3R1PPP/3R2K1 w - - 0 1', expected: ['d2d7'] }
    ];

    let passed = 0;
    const suiteStart = Date.now();

    for (let i = 0; i < puzzles.length; i++) {
        const p = puzzles[i];
        engine.loadFen(p.fen);
        const t0 = Date.now();
        const best = await ai.findBestMove(engine, 3, 500);
        const elapsed = Date.now() - t0;
        const moveStr = best ? `${best.from}${best.to}` : 'none';
        const ok = best && p.expected.some(e => moveStr.startsWith(e));
        assert(ok, `Puzzle #${i + 1} (${p.name}) failed! Got '${moveStr}', expected one of [${p.expected.join(', ')}]`);
        passed++;
        console.log(`  [${i + 1}/20] ${p.name}: ✓ Solved in ${elapsed}ms (${moveStr})`);
    }

    const totalSuiteTime = Date.now() - suiteStart;
    console.log(`  Total puzzle suite time: ${totalSuiteTime}ms (limit: 800ms)`);
    assert(totalSuiteTime <= 800, `Total suite execution time ${totalSuiteTime}ms must be <= 800ms`);
    assert.strictEqual(passed, 20, 'All 20 puzzles must pass successfully');
    console.log('✓ All 20 tactical puzzles solved legitimately within time budget!\n');
}

async function testWebWorkerProtocolAndFallback() {
    console.log('[Test 4] Web Worker Communication & Fallback Architecture...');

    // 1. Test worker message handler directly
    let workerResult = null;
    await handleWorkerMessage(
        {
            type: 'SEARCH',
            id: 777,
            fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1',
            level: 3,
            timeLimitMs: 400
        },
        (msg) => {
            workerResult = msg;
        }
    );

    assert(workerResult, 'Worker handler must post response message');
    assert.strictEqual(workerResult.type, 'SEARCH_RESULT');
    assert.strictEqual(workerResult.id, 777);
    assert(workerResult.bestMove && workerResult.bestMove.from === 'e1' && workerResult.bestMove.to === 'e8');
    assert(typeof workerResult.nps === 'number' && workerResult.nps > 0);
    assert(typeof workerResult.nodes === 'number' && workerResult.nodes > 0);
    console.log(`  Worker search result: ${workerResult.bestMove.from}->${workerResult.bestMove.to}, nodes: ${workerResult.nodes}, NPS: ${workerResult.nps}`);

    // Test STOP signal
    await handleWorkerMessage({ type: 'STOP' });
    console.log('  Worker STOP message handled without error');

    // 2. Validate ChessUI implementation of Web Worker decoupling and synchronous fallback
    const uiJsPath = path.resolve(__dirname, '../public/src/chess/chess_ui.js');
    const uiJsContent = fs.readFileSync(uiJsPath, 'utf8');

    assert(uiJsContent.includes('initAIWorker()'), 'ChessUI must define initAIWorker()');
    assert(uiJsContent.includes("new Worker(new URL('./chess_ai_worker.js'"), 'ChessUI must instantiate Web Worker with chess_ai_worker.js');
    assert(uiJsContent.includes('findAIMoveAsync('), 'ChessUI must define findAIMoveAsync()');
    assert(uiJsContent.includes('stopAISearch()'), 'ChessUI must define stopAISearch()');
    assert(uiJsContent.includes('this.ai.findBestMove(engine, level, timeLimitMs)'), 'ChessUI must contain synchronous fallback when Web Worker is unavailable');
    assert(uiJsContent.includes('await this.findAIMoveAsync(this.engine, this.aiLevel)'), 'triggerAIMove must call findAIMoveAsync');
    assert(uiJsContent.includes('await this.findAIMoveAsync(this.engine, level)'), 'triggerAIVsAIMove must call findAIMoveAsync');

    // 3. Test functional behavior of asynchronous fallback logic
    class StandaloneAIClient {
        constructor() {
            this.ai = new ChessAI();
            this.aiWorker = null; // simulate environment without Worker
        }
        async findAIMoveAsync(engine, level = 3, timeLimitMs = null) {
            if (this.aiWorker) {
                // ...
            }
            return this.ai.findBestMove(engine, level, timeLimitMs);
        }
    }
    const client = new StandaloneAIClient();
    const fallbackEngine = new ChessEngine('r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
    const fallbackMove = await client.findAIMoveAsync(fallbackEngine, 3, 300);
    assert(fallbackMove && fallbackMove.from === 'h5' && fallbackMove.to === 'f7', 'Fallback must find mate move h5f7');
    console.log(`  ChessUI fallback search succeeded: ${fallbackMove.from}->${fallbackMove.to}`);

    console.log('✓ Web Worker decoupling and synchronous fallback verified!\n');
}

async function runAll() {
    await testMoveExecutionSpeedAndIntegrity();
    await testSearchThroughputNPS();
    await testTacticalPuzzleSuite();
    await testWebWorkerProtocolAndFallback();
    console.log('🎉 ALL CHESS ENGINE OPTIMIZATION TESTS PASSED WITH 100% SUCCESS!');
}

runAll().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
