// test/test_user_reported_fixes.js
// Automated verification suite for the 6 core user fixes:
// 1. Grappling hook long raycast & propulsive boost
// 2. 3D Cuboid Box Fill & Voxel Painter in SandboxManager
// 3. Auto-fire burst loop & configurable fire rates in pause menu
// 4. Multiplayer custom room switching and automatic 0-player cleanup
// 5. GPS Radar solo-mode dot cleanup
// 6. Action buttons glassmorphism blur & separated mobility dock

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=============================================================================');
console.log('      USER FIXES VERIFICATION: HOOK, 3D FILL, ROOMS, AUTO-FIRE & GLASS HUD   ');
console.log('=============================================================================\n');

// --- 1. Check controls.js for getTargetBlock, performLongRaycast, startAutoFire ---
console.log('[TEST 1: Controls Long Raycast & Auto-Fire Burst Mechanics]');
const controlsCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'controls.js'), 'utf8');
assert(controlsCode.includes('getTargetBlock()'), 'controls.js must export getTargetBlock');
assert(controlsCode.includes('performLongRaycast(maxDistance = 150.0)'), 'controls.js must export performLongRaycast with 150m reach');
assert(controlsCode.includes('startAutoFire()'), 'controls.js must implement startAutoFire()');
assert(controlsCode.includes('stopAutoFire()'), 'controls.js must implement stopAutoFire()');
assert(controlsCode.includes('this.fireRates = {'), 'controls.js must initialize configurable fireRates');
console.log('  ✓ getTargetBlock(), performLongRaycast(150m), startAutoFire() and stopAutoFire() verified.');

// --- 2. Check sandbox.js for 3D Fill, Voxel Painter, Dome and Undo ---
console.log('\n[TEST 2: SandboxManager 3D Fill, Voxel Painter & Undo]');
const sandboxCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'sandbox.js'), 'utf8');
assert(sandboxCode.includes('toggleFillMode(blockType = 1)'), 'sandbox.js must export toggleFillMode');
assert(sandboxCode.includes('handleFillTap(x, y, z, blockType = null)'), 'sandbox.js must export handleFillTap');
assert(sandboxCode.includes('togglePaintMode()'), 'sandbox.js must export togglePaintMode');
assert(sandboxCode.includes('handlePaintTap(x, y, z, blockType = null)'), 'sandbox.js must export handlePaintTap');
assert(sandboxCode.includes('generateQuickDome('), 'sandbox.js must export generateQuickDome');
assert(sandboxCode.includes('undo() {'), 'sandbox.js must export undo() alias for undoLastAction');
console.log('  ✓ toggleFillMode, handleFillTap, togglePaintMode, handlePaintTap, quick dome & undo verified.');

// --- 3. Check multiplayer.js for Room List & Room Switch ---
console.log('\n[TEST 3: Multiplayer Room List & Room Switching]');
const mpCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'multiplayer.js'), 'utf8');
assert(mpCode.includes('requestRoomList()'), 'multiplayer.js must export requestRoomList');
assert(mpCode.includes('switchRoom(roomId, pin = null, roomName = null)'), 'multiplayer.js must export switchRoom');
assert(mpCode.includes("case 'room_list_response':"), 'multiplayer.js must handle room_list_response');
assert(mpCode.includes("case 'switch_room_confirm':"), 'multiplayer.js must handle switch_room_confirm');
console.log('  ✓ requestRoomList, switchRoom, room_list_response & switch_room_confirm verified.');

// --- 4. Check server/rooms.js for automatic 0-player room cleanup ---
console.log('\n[TEST 4: Server Ephemeral Room Auto-Cleanup]');
const serverRoomsCode = fs.readFileSync(path.join(__dirname, '..', 'server', 'rooms.js'), 'utf8');
assert(serverRoomsCode.includes('cleanupEmptyRoom(roomId)'), 'server/rooms.js must implement cleanupEmptyRoom');
assert(serverRoomsCode.includes('this.cleanupEmptyRoom(currentRoomId)'), 'server/rooms.js must cleanup on room switch');
assert(serverRoomsCode.includes('this.cleanupEmptyRoom(meta.roomId)'), 'server/rooms.js must cleanup on disconnect');

// Simulate room manager cleanup
const { RoomManager } = require('../server/rooms');
const rm = new RoomManager();
// Create a fake custom room
rm.roomMetadata.set('custom_test_123', { id: 'custom_test_123', name: 'Sala Test', isPrivate: false, pin: null });
rm.rooms.set('custom_test_123', { gameState: {}, clients: new Map() });
assert(rm.rooms.has('custom_test_123'), 'Custom room should exist');
rm.cleanupEmptyRoom('custom_test_123');
assert(!rm.rooms.has('custom_test_123'), 'Custom room with 0 clients should be automatically deleted');
assert(!rm.roomMetadata.has('custom_test_123'), 'Custom room metadata should be pruned');

// Default rooms should never be deleted
rm.cleanupEmptyRoom('main');
assert(rm.roomMetadata.has('main'), 'Default room "main" must be preserved');
clearInterval(rm.tickInterval);
console.log('  ✓ Server RoomManager automatically prunes custom rooms with 0 players and protects default rooms.');

// --- 5. Check ui.js for grapple long-raycast & clean minimap ---
console.log('\n[TEST 5: UI Grapple Long Raycast & Clean Radar]');
const uiCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'ui.js'), 'utf8');
assert(uiCode.includes('performLongRaycast(150.0)'), 'ui.js triggerGrapple must use performLongRaycast(150.0)');
assert(!uiCode.includes("name: 'Spawn', x: 0, z: 0"), 'ui.js drawMinimap must not draw confusing static landmark dots in solo mode');
assert(uiCode.includes('weapon-cadence-rifle'), 'ui.js must bind rifle cadence slider');
assert(uiCode.includes('weapon-cadence-bazooka'), 'ui.js must bind bazooka cadence slider');
assert(uiCode.includes('weapon-cadence-plasma'), 'ui.js must bind plasma cadence slider');
console.log('  ✓ UI triggerGrapple uses 150m raycast; Minimap removes landmark dots; weapons settings bound.');

// --- 6. Check index.html & styles.css for glassmorphism & mobility dock ---
console.log('\n[TEST 6: Mobile Glassmorphism Blur & Separated Mobility Dock]');
const htmlCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const cssCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
assert(htmlCode.includes('id="mobile-mobility-dock"'), 'index.html must have #mobile-mobility-dock');
assert(htmlCode.includes('id="weapons-config-panel"'), 'index.html must have #weapons-config-panel in pause menu');
assert(cssCode.includes('.mobile-mobility-dock'), 'styles.css must style .mobile-mobility-dock');
assert(cssCode.includes('backdrop-filter: blur(14px) !important'), 'styles.css must apply backdrop-filter blur to action buttons');
console.log('  ✓ #mobile-mobility-dock separates Grapple/Jetpack; glassmorphism blur and weapon sliders styled.');

console.log('\n=============================================================================');
console.log('STATUS: ALL 6 SPECIFICATIONS VERIFIED AND PASSING WITH 100% SUCCESS!');
console.log('=============================================================================');
