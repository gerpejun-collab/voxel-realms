/**
 * Grandmaster Chess - Web Worker for Asynchronous Chess AI Search
 * Decouples heavy Alpha-Beta / Quiescence tree search from the browser UI thread,
 * ensuring silky smooth 60 FPS rendering and zero input stutter.
 */

import { ChessEngine } from './chess_engine.js';
import { ChessAI } from './chess_ai.js';

let engineInstance = null;
let aiInstance = null;

function getAI() {
    if (!aiInstance) {
        aiInstance = new ChessAI();
    }
    return aiInstance;
}

function getEngine() {
    if (!engineInstance) {
        engineInstance = new ChessEngine();
    }
    return engineInstance;
}

/**
 * Handles incoming search and control messages
 * @param {object} data
 * @param {Function} postMessageFn
 */
export async function handleWorkerMessage(data, postMessageFn = (msg) => {
    if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
        self.postMessage(msg);
    }
}) {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'STOP') {
        const ai = getAI();
        ai.stopSearch();
        return;
    }

    if (data.type === 'SEARCH') {
        const { fen, level = 3, timeLimitMs = null, id = null } = data;
        const ai = getAI();
        const engine = getEngine();

        try {
            if (fen) {
                engine.loadFen(fen);
            }
            const startTime = Date.now();
            const bestMove = await ai.findBestMove(engine, level, timeLimitMs);
            const elapsedMs = Math.max(1, Date.now() - startTime);
            const nodes = ai.lastNodesSearched || ai.nodesEvaluated || 0;
            const nps = Math.round((nodes / elapsedMs) * 1000);
            const depth = ai.lastSearchDepth || (bestMove ? 1 : 0);
            const score = ai.lastSearchScore || (bestMove ? bestMove.score : 0);

            postMessageFn({
                type: 'SEARCH_RESULT',
                id,
                bestMove,
                score,
                depth,
                nodes,
                nps,
                elapsedMs
            });
        } catch (err) {
            postMessageFn({
                type: 'SEARCH_ERROR',
                id,
                error: err ? err.message : 'Unknown search error'
            });
        }
    }
}

// Attach listener in browser Web Worker context
if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
    self.addEventListener('message', async (event) => {
        await handleWorkerMessage(event.data, (msg) => self.postMessage(msg));
    });
}
