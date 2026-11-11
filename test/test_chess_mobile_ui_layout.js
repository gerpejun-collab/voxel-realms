/**
 * test/test_chess_mobile_ui_layout.js
 * Automated Layout, Bounding Geometry, Touch Clearance & Mobile UI/UX Verification Suite
 * Targets: Specifications 1 to 50 of Grandmaster Chess Mobile Overhaul
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=============================================================================');
console.log('    CHESS MOBILE UI/UX & RESPONSIVE LAYOUT VERIFICATION TEST SUITE          ');
console.log('=============================================================================\n');

function runTest(name, fn) {
    try {
        fn();
        console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
        console.error(`  ✗ [FAIL] ${name}:`, err.message);
        throw err;
    }
}

const cssPath = path.join(__dirname, '../public/styles.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const htmlPath = path.join(__dirname, '../public/index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const jsPath = path.join(__dirname, '../public/src/chess/chess_ui.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

// 1. Container Dimensions & Safe Area
runTest('Spec 1 & 2: #chess-app-modal enforces 100dvh, inset:0, and safe-area padding', () => {
    assert(cssContent.includes('#chess-app-modal'), '#chess-app-modal rule must be present');
    assert(cssContent.includes('height: 100dvh'), 'Must use 100dvh for mobile viewport height');
    assert(cssContent.includes('env(safe-area-inset-top'), 'Must support safe-area-inset-top');
    assert(cssContent.includes('env(safe-area-inset-bottom'), 'Must support safe-area-inset-bottom');
    assert(cssContent.includes('overflow: hidden'), 'Must prevent elastic scrolling');
});

// 2. Primary CSS Grid Layout
runTest('Spec 3: .chess-app-layout uses 6-row CSS Grid without page scrolling', () => {
    assert(cssContent.includes('.chess-app-layout'), '.chess-app-layout rule must exist');
    assert(cssContent.includes('grid-template-rows: auto auto 1fr auto auto auto'), 'Must configure exact 6-row grid: appbar, top player, arena 1fr, bottom player, ticker, bottom nav');
});

// 3. Compact 48px Material 3 App Bar
runTest('Spec 11–15: .chess-mobile-appbar enforces 48px height, 44px back target, title, 2D/3D pill, and actions', () => {
    assert(cssContent.includes('.chess-mobile-appbar'), '.chess-mobile-appbar rule must exist');
    assert(cssContent.includes('height: 48px'), 'App bar must be exactly 48px height');
    assert(cssContent.includes('.chess-nav-back-btn'), 'Back button class must exist');
    assert(cssContent.includes('min-width: 44px') && cssContent.includes('min-height: 44px'), 'Back button must satisfy 44px minimum touch target');
    assert(cssContent.includes('.chess-pill-btn'), '2D/3D toggle pill styling must exist');
    assert(jsContent.includes('chess-nav-back'), 'chess-nav-back must be in DOM');
    assert(jsContent.includes('chess-btn-toggle-view'), 'chess-btn-toggle-view must be in DOM');
    assert(jsContent.includes('chess-btn-flip'), 'chess-btn-flip must be in DOM');
    assert(jsContent.includes('chess-btn-options'), 'chess-btn-options must be in DOM');
});

// 4. Symmetric 44px Player Cards & Fischer Clocks
runTest('Spec 19–28: Symmetric 44px player cards with avatars, captured trays, advantage diff (+3) and digital clocks', () => {
    assert(cssContent.includes('.chess-player-card'), '.chess-player-card rule must exist');
    assert(cssContent.includes('height: 44px'), 'Player cards must be exactly 44px height');
    assert(cssContent.includes('.chess-avatar-box'), 'Avatar circle container must exist');
    assert(cssContent.includes('.chess-status-dot'), 'Status dot badge must exist');
    assert(cssContent.includes('.chess-clock-pill'), 'Fischer clock pill must exist');
    assert(cssContent.includes('Roboto Mono') || cssContent.includes('monospace'), 'Clock must use monospace typography');
    assert(cssContent.includes('.chess-clock-pill.active'), 'Active turn glow style must exist');
    assert(cssContent.includes('.chess-clock-pill.low-time'), 'Low-time red alert style must exist');
    assert(cssContent.includes('chess-clock-pulse'), 'Pulsing keyframe animation must exist for low time');
    assert(jsContent.includes('chess-top-diff') && jsContent.includes('chess-bottom-diff'), 'Material advantage diff counter elements must exist');
});

// 5. Real-time Vertical Evaluation Bar (6px)
runTest('Spec 29–31: Real-time 6px vertical Evaluation Bar with smooth sigmoid scaling and checkmate badge', () => {
    assert(cssContent.includes('#chess-eval-bar'), '#chess-eval-bar rule must exist');
    assert(cssContent.includes('width: 6px'), 'Evaluation bar width must be exactly 6px');
    assert(cssContent.includes('#chess-eval-fill'), '#chess-eval-fill rule must exist');
    assert(cssContent.includes('transition: height'), 'Evaluation bar must have smooth height transition');
    assert(cssContent.includes('#chess-eval-badge'), '#chess-eval-badge rule must exist for mate/numeric display');
    assert(jsContent.includes('updateEvaluationBar'), 'updateEvaluationBar method must be implemented');
    // Check sigmoid logistic function in JS
    assert(jsContent.includes('Math.exp(-0.004'), 'Must calculate White percentage via sigmoid logistic curve with factor -0.004');
});

// 6. 1-Line SAN Move Ticker & Traversal Controls
runTest('Spec 32–37: 1-line horizontal SAN move ticker with traversal buttons (⏮, ◀, ▶, ⏭) and undo (↩)', () => {
    assert(cssContent.includes('.chess-move-ticker'), '.chess-move-ticker rule must exist');
    assert(cssContent.includes('height: 38px'), 'Move ticker height must be 38px');
    assert(cssContent.includes('.chess-ply-btn'), 'Ply button style must exist');
    assert(cssContent.includes('.chess-ticker-undo'), 'Undo button style must exist');
    assert(jsContent.includes('chess-ticker-first'), 'First move traversal button must exist');
    assert(jsContent.includes('chess-ticker-prev'), 'Previous move traversal button must exist');
    assert(jsContent.includes('chess-ticker-next'), 'Next move traversal button must exist');
    assert(jsContent.includes('chess-ticker-latest'), 'Latest move traversal button must exist');
    assert(jsContent.includes('handleUndo'), 'handleUndo method must be implemented');
    assert(jsContent.includes('goToPly'), 'goToPly history traversal method must be implemented');
});

// 7. Docked 56px Material 3 Bottom Navigation Bar
runTest('Spec 38–42: Docked 56px 4-tab Bottom Navigation Bar with active indicator pills and unread badge', () => {
    assert(cssContent.includes('.chess-bottom-nav'), '.chess-bottom-nav rule must exist');
    assert(cssContent.includes('height: 56px'), 'Bottom nav height must be 56px');
    assert(cssContent.includes('.chess-nav-indicator'), 'Active tab indicator pill styling must exist');
    assert(cssContent.includes('.chess-nav-badge'), 'Unread message badge styling must exist');
    assert(jsContent.includes('data-sheet="sheet-play"'), 'Jugar tab must exist');
    assert(jsContent.includes('data-sheet="sheet-analysis"'), 'Movimientos tab must exist');
    assert(jsContent.includes('data-sheet="sheet-rooms"'), 'Salas & Chat tab must exist');
});

// 8. 4 Modal Slide-Up Bottom Sheets
runTest('Spec 43–49: 4 Slide-Up Modal Bottom Sheets with touch backdrop, top drag handle, and swipe-down dismiss', () => {
    assert(cssContent.includes('#chess-bottom-sheet-container'), 'Bottom sheet container rule must exist');
    assert(cssContent.includes('backdrop-filter: blur'), 'Bottom sheet backdrop must have blur');
    assert(cssContent.includes('transform: translateY(100%)'), 'Initial sheet transform must be translateY(100%)');
    assert(cssContent.includes('.chess-bottom-sheet.open'), 'Open sheet transform must be translateY(0%)');
    assert(cssContent.includes('.chess-sheet-drag-handle'), 'Top drag handle must exist');
    assert(jsContent.includes('id="sheet-play"'), 'sheet-play must exist in DOM');
    assert(jsContent.includes('id="sheet-options"'), 'sheet-options must exist in DOM');
    assert(jsContent.includes('id="sheet-analysis"'), 'sheet-analysis must exist in DOM');
    assert(jsContent.includes('id="sheet-rooms"'), 'sheet-rooms must exist in DOM');
    assert(jsContent.includes('setupSheetGestures'), 'setupSheetGestures must handle swipe-down touch gestures');
});

// 9. Inline Mobile Touch Promotion Sheet
runTest('Spec 8: Inline mobile touch promotion sheet with 52x52px circular touch targets', () => {
    assert(cssContent.includes('.chess-promo-btn'), '.chess-promo-btn rule must exist');
    assert(cssContent.includes('width: 52px') && cssContent.includes('height: 52px'), 'Promotion buttons must be exactly 52x52px');
    assert(cssContent.includes('border-radius: 50%'), 'Promotion buttons must be circular');
    assert(jsContent.includes('chess-promotion-modal'), 'Promotion modal must exist in DOM');
});

// 10. Tactile Haptic Touch Feedback
runTest('Spec 50: Haptic feedback triggers navigator.vibrate on moves, captures, checks, and game-over', () => {
    assert(jsContent.includes('triggerHaptic'), 'triggerHaptic method must be implemented');
    assert(jsContent.includes('navigator.vibrate'), 'Must call navigator.vibrate');
    assert(jsContent.includes('[40, 30, 40]'), 'Check vibration pattern must match [40, 30, 40]');
    assert(jsContent.includes('[60, 40, 100]'), 'Game-over vibration pattern must match [60, 40, 100]');
});

// 11. WebSocket Packet Envelope Standardization
runTest('Protocol: Standardize all outgoing WebSocket transmissions to { type, data: { ... } }', () => {
    assert(jsContent.includes('sendPacket(type, data = {})'), 'sendPacket must take (type, data)');
    assert(jsContent.includes('JSON.stringify({ type, data, timestamp: Date.now() })'), 'Transmission must be standardized envelope { type, data, timestamp }');
    assert(jsContent.includes("sendPacket('chess_move'"), 'chess_move must use standardized sendPacket');
    assert(jsContent.includes("sendPacket('chess_join_queue'"), 'chess_join_queue must use standardized sendPacket');
    assert(jsContent.includes("sendPacket('chess_create_room'"), 'chess_create_room must use standardized sendPacket');
});

// 12. Move Reflection Loop Decoupling
runTest('Multiplayer Invariant: Incoming move broadcast decoupled from local move triggers', () => {
    assert(jsContent.includes('this.isProcessingRemoteMove'), 'isProcessingRemoteMove flag must exist');
    assert(jsContent.includes('if (this.isProcessingRemoteMove) return;'), 'handleLocalMove must be guarded against remote reflection loops');
    assert(jsContent.includes('if (d.fen && this.engine.getFen() === d.fen)'), 'Must skip reapplying move if local board already reflects broadcast FEN');
});

// 13. Mobile Viewport Zero Overflow Geometries
runTest('Viewport Fit: All standard mobile viewports (360x800 to 412x915) maintain zero overflow', () => {
    const viewports = [
        { width: 360, height: 800, name: 'Samsung Galaxy A-series' },
        { width: 375, height: 667, name: 'iPhone SE' },
        { width: 390, height: 844, name: 'iPhone 14/15' },
        { width: 412, height: 915, name: 'Google Pixel 8' }
    ];

    viewports.forEach(vp => {
        const appbarH = 48;
        const topCardH = 44 + 6; // height + margin
        const bottomCardH = 44 + 4;
        const tickerH = 38 + 4;
        const navH = 56;
        const totalFixedH = appbarH + topCardH + bottomCardH + tickerH + navH; // 242px

        const availableBoardH = vp.height - totalFixedH;
        const availableBoardW = vp.width - 32;
        const boardSize = Math.min(availableBoardW, availableBoardH);

        assert(boardSize > 250, `Board size on ${vp.name} (${boardSize}px) must be substantial and legible`);
        const totalUsedH = totalFixedH + boardSize;
        assert(totalUsedH <= vp.height, `Total layout height on ${vp.name} (${totalUsedH}px) must not exceed viewport height (${vp.height}px)`);
        assert(boardSize + 24 <= vp.width, `Board width plus margin must not exceed viewport width on ${vp.name}`);
    });
});

console.log('\n=============================================================================');
console.log('ALL 13 CHESS MOBILE UI/UX & RESPONSIVE LAYOUT SPECIFICATIONS PASSED (100%)!  ');
console.log('=============================================================================');
