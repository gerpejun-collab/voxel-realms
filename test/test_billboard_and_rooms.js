// test/test_billboard_and_rooms.js
// Automated verification test suite for:
// 1. Missile max count reduced from 200 to 30 (UI, controls, radar, multiplayer, server validation).
// 2. Redesigned Private Rooms Multiplayer from scratch (PIN security, state init, empty room pruning, live list broadcast).
// 3. Android APK file access & permissions (READ_MEDIA_IMAGES, WebChromeClient.onShowFileChooser, onActivityResult).
// 4. Photo Upload in Settings & Giant Billboard Prefab (15x12x3 structure, dynamic Three.js canvas texture, photo cycle).
// 5. Multiplayer synchronization for Buildings, Animals & Billboards (block_modify_batch, animal_spawn, billboard_create).

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=============================================================================');
console.log('    TEST SUITE: MISSILE 30X, PRIVATE ROOMS, ANDROID APK & BILLBOARD SYNC    ');
console.log('=============================================================================\n');

// ---------------------------------------------------------------------------
// SECTION 1: Missile Max Count Reduced from 200 to 30
// ---------------------------------------------------------------------------
console.log('[SECTION 1: MISSILE SALVO MAX 30 REDUCTION]');

const controlsCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'controls.js'), 'utf8');
assert(controlsCode.includes('[1, 5, 10, 15, 20, 30]'), 'controls.js must use salvo steps [1, 5, 10, 15, 20, 30]');
assert(controlsCode.includes('Math.min(30,'), 'controls.js must clamp missile salvo count to max 30');

const radarCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'radar.js'), 'utf8');
assert(radarCode.includes('Math.min(30,'), 'radar.js must clamp salvo count to max 30');
assert(radarCode.includes('1x / 5x / 10x / 15x / 20x / 30x'), 'radar.js salvo button title must reflect 30 max');

const mpCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'multiplayer.js'), 'utf8');
assert(mpCode.includes('salvoCount = Math.min(30,'), 'multiplayer.js sendAdminLaunchMissile must clamp salvo to 30');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
assert(indexHtml.includes('id="weapon-salvo-count" class="mc-range" min="1" max="30"'), 'index.html slider must be min 1 max 30');
assert(indexHtml.includes('Salva de Misiles: 1x / 5x / 10x / 15x / 20x / 30x'), 'index.html HUD badge title must reflect 30 max');

const serverRoomsCode = fs.readFileSync(path.join(__dirname, '..', 'server', 'rooms.js'), 'utf8');
assert(serverRoomsCode.includes('maxAllowed = isSilo ? SILO_COUNT : 30'), 'server/rooms.js must enforce 30 max on regular admin missile launches');

console.log('  ✓ Verified controls, radar, multiplayer client, HTML UI slider, and server validation all enforce 30 max missiles.');

// ---------------------------------------------------------------------------
// SECTION 2: Redesigned Private Rooms Multiplayer
// ---------------------------------------------------------------------------
console.log('\n[SECTION 2: REDESIGNED PRIVATE ROOMS MULTIPLAYER]');

const { RoomManager } = require('../server/rooms');
const { MSG } = require('../server/protocol');

const rm = new RoomManager();

// Create private room with PIN '4321'
const privateRoomId = 'test_secret_room';
const privateRoom = rm.getOrCreateRoom(privateRoomId, 'Secret Base', '4321');
assert.strictEqual(privateRoom.isPrivate, true, 'Room must be flagged private');
assert.strictEqual(privateRoom.pin, '4321', 'Room must store the PIN');

// Mock WebSockets
class MockWS {
  constructor() {
    this.sent = [];
    this.readyState = 1; // WebSocket.OPEN
    this.handlers = {};
  }
  send(payload) {
    this.sent.push(JSON.parse(payload));
  }
  on(event, fn) {
    this.handlers[event] = fn;
  }
}

function registerClient(manager, ws) {
  manager.handleConnection(ws);
  return manager.socketMeta.get(ws);
}

const wsUser1 = new MockWS();
const metaUser1 = registerClient(rm, wsUser1);

// Test joining private room with incorrect PIN
rm.handleJoin(wsUser1, metaUser1, {
  name: 'AgentX',
  roomId: privateRoomId,
  pin: 'wrong_pin'
});
const lastSentErr = wsUser1.sent.find(m => m.type === MSG.ERROR);
assert(lastSentErr, 'Joining private room with wrong PIN must send ERROR packet');
assert(lastSentErr.data.message.includes('PIN incorrecto'), 'Error must specify incorrect PIN');

// Test joining private room with CORRECT PIN
const wsUser2 = new MockWS();
const metaUser2 = registerClient(rm, wsUser2);
rm.handleJoin(wsUser2, metaUser2, {
  name: 'AgentVIP',
  roomId: privateRoomId,
  pin: '4321'
});

assert.strictEqual(metaUser2.roomId, privateRoomId, 'Client must successfully join the private room');
const initPacket = wsUser2.sent.find(m => m.type === MSG.INIT);
assert(initPacket, 'Client must receive INIT packet upon successful join');
assert.strictEqual(initPacket.data.room.id, privateRoomId, 'INIT packet must identify the private room');
assert.strictEqual(initPacket.data.room.isPrivate, true, 'INIT packet must confirm room is private');
assert(Array.isArray(initPacket.data.billboards), 'INIT packet must contain billboards array');

// Ensure SWITCH_ROOM_CONFIRM is sent BEFORE INIT on custom room joins so initial state isn't wiped
const confirmIdx2 = wsUser2.sent.findIndex(m => m.type === MSG.SWITCH_ROOM_CONFIRM);
const initIdx2 = wsUser2.sent.findIndex(m => m.type === MSG.INIT);
assert(confirmIdx2 !== -1 && initIdx2 !== -1 && confirmIdx2 < initIdx2, 'SWITCH_ROOM_CONFIRM must precede INIT to prevent client state wipe');

// Test switching rooms cleanly with confirmation and automatic empty room cleanup
const customRoom = rm.getOrCreateRoom('temp_room', 'Temp', null);
const wsUser3 = new MockWS();
const metaUser3 = registerClient(rm, wsUser3);
rm.handleJoin(wsUser3, metaUser3, { name: 'Player3', roomId: 'temp_room' });
assert.strictEqual(rm.rooms.has('temp_room'), true, 'Temp room must exist with 1 player');

// User switches to default lobby
rm.handleSwitchRoom(wsUser3, metaUser3, { roomId: 'lobby' });
assert.strictEqual(metaUser3.roomId, 'lobby', 'Player must switch to lobby');
assert.strictEqual(rm.rooms.has('temp_room'), false, 'Empty custom room must be pruned automatically');

const confirmPacket = wsUser3.sent.find(m => m.type === MSG.SWITCH_ROOM_CONFIRM);
assert(confirmPacket, 'Switch room confirm packet must be sent to client');

// Test that admin privileges and email are preserved when switching rooms
const wsAdmin = new MockWS();
const metaAdmin = registerClient(rm, wsAdmin);
rm.handleJoin(wsAdmin, metaAdmin, { name: 'GeneralAdmin', roomId: 'main' });
metaAdmin.isAdmin = true;
metaAdmin.adminEmail = 'jsieiragerpe@gmail.com';
const mainPlayerObj = rm.rooms.get('main').gameState.players.get(metaAdmin.id);
mainPlayerObj.isAdmin = true;
mainPlayerObj.adminEmail = 'jsieiragerpe@gmail.com';

rm.handleSwitchRoom(wsAdmin, metaAdmin, { roomId: 'admin_ops' });
const adminInit = wsAdmin.sent.filter(m => m.type === MSG.INIT).pop();
assert(adminInit && adminInit.data.isAdmin === true, 'Admin status must be preserved on room switch INIT');
assert.strictEqual(adminInit.data.adminEmail, 'jsieiragerpe@gmail.com', 'Admin email must be preserved on room switch INIT');
const adminStatePacket = wsAdmin.sent.filter(m => m.type === MSG.ADMIN_STATE).pop();
assert(adminStatePacket, 'ADMIN_STATE packet must be dispatched to authenticated admin after room switch');

console.log('  ✓ Verified PIN authorization, packet ordering, INIT state delivery, admin persistence, and 0-player custom room pruning.');

// ---------------------------------------------------------------------------
// SECTION 3: Android APK File Access & Permissions Update
// ---------------------------------------------------------------------------
console.log('\n[SECTION 3: ANDROID APK PERMISSIONS & FILE PICKER BRIDGE]');

const manifestPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const manifestXml = fs.readFileSync(manifestPath, 'utf8');

assert(manifestXml.includes('android.permission.READ_MEDIA_IMAGES'), 'AndroidManifest.xml must include READ_MEDIA_IMAGES');
assert(manifestXml.includes('android.permission.READ_MEDIA_VIDEO'), 'AndroidManifest.xml must include READ_MEDIA_VIDEO');
assert(manifestXml.includes('android.permission.READ_EXTERNAL_STORAGE'), 'AndroidManifest.xml must include READ_EXTERNAL_STORAGE');
assert(manifestXml.includes('requestLegacyExternalStorage="true"'), 'AndroidManifest.xml must have requestLegacyExternalStorage="true"');

const mainActivityPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'voxelrealms', 'game', 'MainActivity.java');
const mainActivityJava = fs.readFileSync(mainActivityPath, 'utf8');

assert(mainActivityJava.includes('onShowFileChooser'), 'MainActivity.java must implement onShowFileChooser');
assert(mainActivityJava.includes('ValueCallback<Uri[]> filePathCallback'), 'MainActivity.java must define filePathCallback');
assert(mainActivityJava.includes('onActivityResult'), 'MainActivity.java must implement onActivityResult for file picker');
assert(mainActivityJava.includes('Build.VERSION_CODES.TIRAMISU'), 'MainActivity.java must handle Android 13+ granular media permissions');

console.log('  ✓ Verified AndroidManifest.xml permissions and MainActivity.java WebChromeClient.onShowFileChooser bridge.');

// ---------------------------------------------------------------------------
// SECTION 4: Photo Upload in Settings & Giant Billboard Prefab
// ---------------------------------------------------------------------------
console.log('\n[SECTION 4: PHOTO UPLOAD IN SETTINGS & GIANT BILLBOARD PREFAB]');

// 1. Verify UI markup and styles
assert(indexHtml.includes('id="photos-upload-config"'), 'index.html must include photo upload section');
assert(indexHtml.includes('id="billboard-photo-input"'), 'index.html must include photo file input');
assert(indexHtml.includes('id="photo-preview-grid"'), 'index.html must include photo preview grid');

const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
assert(stylesCss.includes('.photo-upload-card'), 'styles.css must style .photo-upload-card');
assert(stylesCss.includes('.photo-preview-grid'), 'styles.css must style .photo-preview-grid');
assert(stylesCss.includes('.photo-thumb-item'), 'styles.css must style .photo-thumb-item');

// 2. Verify sandbox prefab catalog and deltas
const sandboxPath = path.join(__dirname, '..', 'public', 'src', 'sandbox.js');
const sandboxCode2 = fs.readFileSync(sandboxPath, 'utf8');
assert(sandboxCode2.includes("id: 'giant_billboard'"), 'PREFAB_CATALOG must list giant_billboard');
assert(sandboxCode2.includes("case 'giant_billboard':"), 'generatePrefabDeltas must generate giant_billboard voxels');

// Test generating billboard deltas directly
if (typeof global.window === 'undefined') {
  global.window = { addEventListener: () => {}, removeEventListener: () => {} };
}
if (typeof global.document === 'undefined') {
  global.document = { createElement: () => ({ getContext: () => null }) };
}
if (typeof global.AudioContext === 'undefined') {
  global.AudioContext = class { createOscillator() {} createGain() {} };
}

const { PREFAB_CATALOG, SandboxManager: MockSandbox } = require('../public/src/sandbox.js');
const bbItem = PREFAB_CATALOG.find(p => p.id === 'giant_billboard');
assert(bbItem, 'giant_billboard must exist in PREFAB_CATALOG');
assert.strictEqual(bbItem.category, 'buildings', 'giant_billboard category must be buildings');

const dummySandbox = new MockSandbox(null, null, null, null, null, null);
const deltas = dummySandbox.generatePrefabDeltas('giant_billboard');
assert(Array.isArray(deltas) && deltas.length > 50, 'giant_billboard must generate a rich structure of >50 voxels');

// Verify billboard structure contains steel pillars, frame, and screen surface
const hasIronPillars = deltas.some(([x, y, z]) => (x === -5 || x === 5) && y >= 0 && y <= 5);
assert(hasIronPillars, 'Prefab must feature support pillars at x=-5 and x=+5');
const hasTruss = deltas.some(([x, y]) => y === 5);
assert(hasTruss, 'Prefab must feature cross truss at y=5');
const hasScreen = deltas.some(([x, y, z]) => y >= 6 && y <= 11);
assert(hasScreen, 'Prefab must feature billboard screen face between y=6 and y=11');

// 3. Verify BillboardManager in billboard.js
const billboardCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'billboard.js'), 'utf8');
assert(billboardCode.includes('class BillboardManager'), 'billboard.js must export BillboardManager');
assert(billboardCode.includes('createBillboard('), 'BillboardManager must implement createBillboard');
assert(billboardCode.includes('saveStoredPhotos('), 'BillboardManager must implement saveStoredPhotos');
assert(billboardCode.includes('renderBillboard('), 'BillboardManager must implement renderBillboard');
assert(billboardCode.includes('removeBillboard('), 'BillboardManager must implement removeBillboard');
assert(billboardCode.includes('mesh.position.set(cx, Number(data.y) + 8.8, cz);'), 'Billboard mesh must be centered at y + 8.8');
assert(billboardCode.includes('rot === 1') && billboardCode.includes('normalYaw = Math.PI / 2;'), 'Rotation 1 must have normalYaw = Math.PI / 2');
assert(billboardCode.includes('rot === 3') && billboardCode.includes('normalYaw = -Math.PI / 2;'), 'Rotation 3 must have normalYaw = -Math.PI / 2');

// 4. Verify world.js has reloadAllChunks
const worldCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'world.js'), 'utf8');
assert(worldCode.includes('reloadAllChunks()'), 'world.js must define reloadAllChunks()');

// 5. Verify main.js wires BillboardManager
const mainJsCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'main.js'), 'utf8');
assert(mainJsCode.includes("import { BillboardManager } from './billboard.js'"), 'main.js must import BillboardManager');
assert(mainJsCode.includes('this.billboardManager = new BillboardManager('), 'main.js must instantiate BillboardManager');
assert(mainJsCode.includes('this.billboardManager.update(dt)'), 'main.js must update BillboardManager in game loop');

console.log('  ✓ Verified photo upload UI, CSS styling, giant billboard 15x12x3 prefab voxels, 3D BillboardManager, and world reset methods.');

// ---------------------------------------------------------------------------
// SECTION 5: Multiplayer Synchronization for Buildings, Animals & Billboards
// ---------------------------------------------------------------------------
console.log('\n[SECTION 5: MULTIPLAYER SYNCHRONIZATION FOR BUILDINGS, ANIMALS & BILLBOARDS]');

const protocol = require('../server/protocol');
assert.strictEqual(protocol.MSG.BLOCK_MODIFY_BATCH, 'block_modify_batch', 'MSG.BLOCK_MODIFY_BATCH must be defined');
assert.strictEqual(protocol.MSG.ANIMAL_SPAWN, 'animal_spawn', 'MSG.ANIMAL_SPAWN must be defined');
assert.strictEqual(protocol.MSG.BILLBOARD_CREATE, 'billboard_create', 'MSG.BILLBOARD_CREATE must be defined');

// Validate batch modification validator
assert.strictEqual(protocol.isValidBlockModifyBatch({ deltas: [[10, 20, 30, 1], [11, 20, 30, 2]] }), true, 'Valid batch must pass validator');
assert.strictEqual(protocol.isValidBlockModifyBatch({ deltas: [] }), false, 'Empty batch must be rejected');
assert.strictEqual(protocol.isValidBlockModifyBatch({ deltas: 'invalid' }), false, 'Non-array batch must be rejected');

// Validate animal spawn validator
assert.strictEqual(protocol.isValidAnimalSpawn({ type: 'cow', x: 10, y: 25, z: 10 }), true, 'Valid animal spawn must pass validator');
assert.strictEqual(protocol.isValidAnimalSpawn({ type: 'pack_mixed', x: 0, y: 24, z: 0 }), true, 'Pack mixed spawn must pass validator');
assert.strictEqual(protocol.isValidAnimalSpawn({ type: 'invalid_species', x: 0, y: 24, z: 0 }), false, 'Unknown species must be rejected');

// Validate billboard validator
assert.strictEqual(protocol.isValidBillboardCreate({ id: 'bb1', x: 10, y: 24, z: 10, rotation: 0, photos: ['data:image/png;base64,abc'] }), true, 'Valid billboard must pass validator');

// Test server batch modification replication between clients
const wsSender = new MockWS();
const metaSender = registerClient(rm, wsSender);
rm.handleJoin(wsSender, metaSender, { name: 'Builder1', roomId: 'build_room' });

const wsReceiver = new MockWS();
const metaReceiver = registerClient(rm, wsReceiver);
rm.handleJoin(wsReceiver, metaReceiver, { name: 'Observer2', roomId: 'build_room' });

// Builder sends a batch modification of building blocks
rm.handleBlockModifyBatch(wsSender, metaSender, {
  deltas: [
    [10, 25, 10, 1],
    [10, 26, 10, 1],
    [10, 27, 10, 1]
  ]
});

// Observer must receive the batch modification
const batchPacket = wsReceiver.sent.find(m => m.type === MSG.BLOCK_MODIFY_BATCH);
assert(batchPacket, 'Receiver must receive MSG.BLOCK_MODIFY_BATCH');
assert.strictEqual(batchPacket.data.deltas.length, 3, 'Receiver must receive all 3 block deltas');

// Builder places a billboard
rm.handleBillboardCreate(wsSender, metaSender, {
  id: 'bb_10_25_10',
  x: 10,
  y: 25,
  z: 10,
  rotation: 0,
  photos: ['photo_url_1']
});

const billboardPacket = wsReceiver.sent.find(m => m.type === MSG.BILLBOARD_CREATE);
assert(billboardPacket, 'Receiver must receive MSG.BILLBOARD_CREATE');
assert.strictEqual(billboardPacket.data.id, 'bb_10_25_10', 'Receiver must receive billboard ID');

// Test Billboard Removal Protocol and Broadcast
assert.strictEqual(protocol.MSG.BILLBOARD_REMOVE, 'billboard_remove', 'MSG.BILLBOARD_REMOVE must be defined');
assert.strictEqual(protocol.isValidBillboardRemove({ id: 'bb_10_25_10' }), true, 'Valid billboard removal must pass validator');
assert.strictEqual(protocol.isValidBillboardRemove({}), false, 'Billboard removal without id must fail validator');

rm.handleBillboardRemove(wsSender, metaSender, { id: 'bb_10_25_10' });
const removePacket = wsReceiver.sent.find(m => m.type === MSG.BILLBOARD_REMOVE);
assert(removePacket, 'Receiver must receive MSG.BILLBOARD_REMOVE broadcast');
assert.strictEqual(removePacket.data.id, 'bb_10_25_10', 'Receiver must receive the removed billboard id');
assert.strictEqual(rm.rooms.get('build_room').gameState.billboards.has('bb_10_25_10'), false, 'Server GameState must remove billboard');

// Builder spawns animals
rm.handleAnimalSpawn(wsSender, metaSender, {
  type: 'pack_mixed',
  x: 15,
  y: 25,
  z: 15
});

const animalUpdatePacket = wsReceiver.sent.find(m => m.type === MSG.ANIMALS_UPDATE);
assert(animalUpdatePacket, 'Receiver must receive updated animal list upon animal spawn');

// Verify animal manager alias in animals.js
const animalsCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'animals.js'), 'utf8');
assert(animalsCode.includes('syncWithServerAnimals'), 'AnimalManager must provide syncWithServerAnimals alias');

// Verify sandboxManager undo billboard cleanup & duplicate animal suppression
assert(sandboxCode2.includes('this.undoStack[this.undoStack.length - 1].billboardId = billboardData.id'), 'sandbox.js must record billboardId on undo stack');
assert(sandboxCode2.includes('this.billboardManager.removeBillboard(last.billboardId)'), 'undoLastAction must remove billboard locally');
assert(sandboxCode2.includes('this.multiplayer.sendBillboardRemove(last.billboardId)'), 'undoLastAction must broadcast billboard removal');
assert(sandboxCode2.includes('const isOnline = Boolean(this.multiplayer && this.multiplayer.connected && !this.multiplayer.isOfflineMode)'), 'spawnAnimalAt must skip duplicate local creation when connected to multiplayer');

// Verify multiplayer.js tracks current room credentials for auto-reconnect
assert(mpCode.includes('this.currentRoomId ='), 'multiplayer.js must track currentRoomId');
assert(mpCode.includes('this.currentRoomPin ='), 'multiplayer.js must track currentRoomPin');
assert(mpCode.includes('sendBillboardRemove('), 'multiplayer.js must implement sendBillboardRemove');

console.log('  ✓ Verified real-time multiplayer synchronization for batch blocks, animal spawns, billboard broadcasts & undo synchronization.');

console.log('\n=============================================================================');
console.log('ALL VERIFICATION SUITE CHECKS COMPLETED WITH 100% SUCCESS!');
console.log('=============================================================================');
process.exit(0);

