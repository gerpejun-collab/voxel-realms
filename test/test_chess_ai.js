import { ChessEngine } from '../public/src/chess/chess_engine.js';
import { ChessAI } from '../public/src/chess/chess_ai.js';
import assert from 'assert';

console.log('Testing ChessAI...');

async function testAI() {
    const engine = new ChessEngine();
    const ai = new ChessAI();

    // 1. Initial position move check
    const moveL1 = await ai.findBestMove(engine, 1);
    assert(moveL1 && moveL1.from && moveL1.to, 'Level 1 must return valid move');
    console.log('✓ Level 1 move:', moveL1.from, '->', moveL1.to);

    const moveL3 = await ai.findBestMove(engine, 3);
    assert(moveL3 && moveL3.from && moveL3.to, 'Level 3 must return valid move');
    console.log('✓ Level 3 move:', moveL3.from, '->', moveL3.to);

    // 2. Scholar's mate defense or tactical check: White plays 1. e4 e5 2. Qh5 Nc6 3. Bc4
    // Black must defend f7 (e.g. g6 or Qe7 or Qf6 or Nf6)
    const tacticalEngine = new ChessEngine();
    tacticalEngine.makeMove('e2', 'e4');
    tacticalEngine.makeMove('e7', 'e5');
    tacticalEngine.makeMove('d1', 'h5');
    tacticalEngine.makeMove('b8', 'c6');
    tacticalEngine.makeMove('f1', 'c4'); // Threats Qxf7#
    
    // It is Black's turn. Let AI search at Level 4
    const defMove = await ai.findBestMove(tacticalEngine, 4);
    console.log('✓ Level 4 defends against Scholar mate threat with:', defMove.from, '->', defMove.to);
    
    // Make Black's move
    tacticalEngine.makeMove(defMove.from, defMove.to, defMove.promotion);
    
    // Now verify White cannot play Qxf7# immediately
    const legalWhite = tacticalEngine.generateLegalMoves();
    const mateMove = legalWhite.find(m => m.from === 'h5' && m.to === 'f7');
    if (mateMove) {
        const testClone = tacticalEngine.clone();
        testClone.makeMove('h5', 'f7');
        assert(!testClone.isCheckmate, 'Black defense prevented checkmate');
    }
    console.log('✓ Defense verified!');
    console.log('ALL CHESS AI TESTS PASSED!');
}

testAI().catch(err => {
    console.error('AI Test Failed:', err);
    process.exit(1);
});
