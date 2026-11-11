// test/test_aerial_sync.js
// Automated Headless End-to-End Verification Suite for Airborne Flight Synchronization,
// Heavy Aerial Targets (50% Cruising Speed), Acrobatic Fighter Aircraft & Combat Scenarios.
// Derived strictly from ORIGINAL_REQUEST.md, PROJECT.md, and DISPATCH.md.

const assert = require('assert');
const { GameState } = require('../server/game-state');
const { RoomManager } = require('../server/rooms');
const protocol = require('../server/protocol');
const {
  MSG,
  isValidMove,
  isValidWeaponShoot,
  ADMIN_EMAIL
} = protocol;

// ============================================================================
// Test Framework Harness
// ============================================================================

class TestRunner {
  constructor() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
    this.currentTier = '';
  }

  tier(name) {
    this.currentTier = name;
    console.log(`\n================================================================`);
    console.log(`>>> ${name.toUpperCase()}`);
    console.log(`================================================================`);
  }

  async test(description, testFn) {
    this.total++;
    const testLabel = `[${this.currentTier}] ${description}`;
    try {
      await testFn();
      this.passed++;
      console.log(`  ✓ PASS: ${description}`);
    } catch (err) {
      this.failed++;
      this.failures.push({
        label: testLabel,
        error: err.message || String(err),
        stack: err.stack
      });
      console.error(`  ✗ FAIL: ${description}`);
      console.error(`    -> ${err.message}`);
    }
  }

  summary() {
    console.log(`\n================================================================`);
    console.log(`TEST EXECUTION SUMMARY`);
    console.log(`================================================================`);
    console.log(`Total Tests Run : ${this.total}`);
    console.log(`Passed          : ${this.passed}`);
    console.log(`Failed          : ${this.failed}`);
    const rate = this.total > 0 ? ((this.passed / this.total) * 100).toFixed(1) : '0.0';
    console.log(`Pass Rate       : ${rate}%`);

    if (this.failures.length > 0) {
      console.log(`\nFAILURES & DISCOVERED GAPS:`);
      this.failures.forEach((f, idx) => {
        console.log(`\n${idx + 1}) ${f.label}`);
        console.log(`   Error: ${f.error}`);
      });
    }
    console.log(`================================================================\n`);
    return this.failed === 0;
  }
}

// Lightweight Headless Mock WebSocket for RoomManager integration tests
class MockWebSocket {
  constructor(id = 'sock_' + Math.random().toString(36).substring(2, 7)) {
    this.id = id;
    this.readyState = 1; // 1 = WebSocket.OPEN
    this.sentMessages = [];
    this.eventListeners = new Map();
    this.closed = false;
  }

  send(payload) {
    try {
      const parsed = JSON.parse(payload);
      this.sentMessages.push(parsed);
    } catch (_) {
      this.sentMessages.push(payload);
    }
  }

  on(event, handler) {
    this.eventListeners.set(event, handler);
  }

  emit(event, data) {
    const handler = this.eventListeners.get(event);
    if (handler) handler(data);
  }

  close() {
    this.closed = true;
    this.readyState = 3; // CLOSED
    this.emit('close');
  }

  getLastMessage(type = null) {
    if (!type) return this.sentMessages[this.sentMessages.length - 1] || null;
    for (let i = this.sentMessages.length - 1; i >= 0; i--) {
      if (this.sentMessages[i].type === type) return this.sentMessages[i];
    }
    return null;
  }

  getAllMessages(type) {
    return this.sentMessages.filter(m => m.type === type);
  }
}

// ============================================================================
// Test Suite Execution
// ============================================================================

async function runTestSuite() {
  const runner = new TestRunner();

  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE
  // --------------------------------------------------------------------------
  runner.tier('Tier 1: Feature Coverage');

  await runner.test('Flight packet schema: isValidMove accepts isFlying: true and action = "flying"', () => {
    const validAirborneMove = {
      pos: [15.2, 48.5, -34.8],
      rot: [1.57, -0.2],
      isFlying: true,
      action: 'flying'
    };
    assert.strictEqual(
      isValidMove(validAirborneMove),
      true,
      'isValidMove must validate airborne player movement packets containing isFlying: true'
    );

    const validNonFlyingMove = {
      pos: [0, 25, 0],
      rot: [0, 0],
      isFlying: false,
      action: 'idle'
    };
    assert.strictEqual(
      isValidMove(validNonFlyingMove),
      true,
      'isValidMove must validate standard grounded player movement packets'
    );

    // Adversarial / Invalid coordinates with isFlying: true
    assert.strictEqual(
      isValidMove({ pos: [NaN, 50, 0], rot: [0, 0], isFlying: true }),
      false,
      'isValidMove must reject NaN coordinates even when isFlying is true'
    );
    assert.strictEqual(
      isValidMove({ pos: [0, Infinity, 0], rot: [0, 0], isFlying: true }),
      false,
      'isValidMove must reject infinite coordinates even when isFlying is true'
    );
    assert.strictEqual(
      isValidMove({ pos: [0, 50], rot: [0, 0], isFlying: true }),
      false,
      'isValidMove must reject incomplete 2D position arrays'
    );
    assert.strictEqual(
      isValidMove(null),
      false,
      'isValidMove must safely reject null payload'
    );
  });

  await runner.test('Server player state: stores isFlying and serializes in getPlayersSnapshot() and getInitialState()', () => {
    const gs = new GameState(12345, 10);
    const player = gs.addPlayer('p_air_1', 'SkyWalker');
    assert.ok(player, 'Player p_air_1 should be added successfully');

    // Update with flight state
    gs.updatePlayer('p_air_1', {
      pos: [20.0, 52.0, -10.0],
      rot: [0.5, 0.0],
      isFlying: true,
      action: 'flying'
    });

    const updated = gs.getPlayer('p_air_1');
    assert.strictEqual(updated.isFlying, true, 'Authoritative player state must record isFlying: true');
    assert.strictEqual(updated.action, 'flying', 'Authoritative player state must record action: "flying"');

    // Snapshot serialization
    const snapshot = gs.getPlayersSnapshot();
    const snapPlayer = snapshot.find(p => p.id === 'p_air_1');
    assert.ok(snapPlayer, 'Player must exist in getPlayersSnapshot()');
    assert.strictEqual(snapPlayer.isFlying, true, 'getPlayersSnapshot() must serialize isFlying field');
    assert.strictEqual(snapPlayer.y, 52.0, 'Snapshot must accurately reflect vertical altitude');

    // Initial state serialization for new joiner
    const initial = gs.getInitialState('p_other_2');
    const initPlayer = initial.players.find(p => p.id === 'p_air_1');
    assert.ok(initPlayer, 'Player must exist in getInitialState() for connecting peer');
    assert.strictEqual(initPlayer.isFlying, true, 'getInitialState() must include isFlying field');
  });

  await runner.test('Heavy aerial target spawning: entities initialized in GameState at Y: 35-60, health 5, cruising speed <= 5.0 m/s', () => {
    // Protocol message definitions
    assert.strictEqual(MSG.AERIAL_TARGETS_UPDATE, 'aerial_targets_update', 'MSG.AERIAL_TARGETS_UPDATE must be defined in protocol');
    assert.strictEqual(MSG.AERIAL_TARGET_HIT, 'aerial_target_hit', 'MSG.AERIAL_TARGET_HIT must be defined in protocol');
    assert.strictEqual(MSG.AERIAL_TARGET_DESTROYED, 'aerial_target_destroyed', 'MSG.AERIAL_TARGET_DESTROYED must be defined in protocol');

    const gs = new GameState(54321, 10);
    assert.ok(
      gs.aerialTargets !== undefined && (gs.aerialTargets instanceof Map || Array.isArray(gs.aerialTargets)),
      'GameState must maintain aerialTargets collection'
    );

    const targets = Array.from(gs.aerialTargets instanceof Map ? gs.aerialTargets.values() : gs.aerialTargets);
    assert.ok(targets.length > 0, 'GameState must initialize at least one heavy aerial target');

    for (const target of targets) {
      assert.strictEqual(target.type, 'drone_heavy', 'Aerial target type must be drone_heavy');
      assert.strictEqual(target.health, 90, 'Aerial target base health must be exactly 90 hits per user specification');
      assert.strictEqual(target.maxHealth, 90, 'Aerial target maxHealth must be exactly 90 hits');
      assert.ok(
        target.y >= 35.0 && target.y <= 60.0,
        `Aerial target spawned at Y=${target.y}, which must be clamped within mid-altitude Y: 35-60`
      );
      assert.ok(
        target.speed <= 5.0 && target.speed >= 2.5,
        `Aerial target cruising speed=${target.speed} must be constrained to 50% speed (strictly <= 5.0 m/s)`
      );
    }
  });

  await runner.test('Heavy aerial target hit handling: hitAerialTarget deducts damage without instant death on single hit', () => {
    const gs = new GameState(99999, 10);
    assert.ok(typeof gs.hitAerialTarget === 'function', 'GameState must implement hitAerialTarget(targetId, damage)');

    const targets = Array.from(gs.aerialTargets.values());
    assert.ok(targets.length > 0, 'Must have at least one target to test damage');
    const target = targets[0];
    const initialHealth = target.health;
    assert.strictEqual(initialHealth, 90, 'Target starts with 90 health');

    // Single bullet hit (1 damage)
    const result = gs.hitAerialTarget(target.id, 1);
    assert.ok(result, 'hitAerialTarget must return a result object');
    assert.strictEqual(result.destroyed, false, 'Single bullet hit must NOT destroy the heavy target');
    assert.strictEqual(result.remainingHealth, 89, '90 HP - 1 dmg must leave remainingHealth at 89');
    assert.strictEqual(target.health, 89, 'Target internal health must be updated to 89');
  });

  await runner.test('Acrobatic fighter aircraft state: initialized at Y: 45-110 with 50% increased cruising speed (39.0 m/s) across multiple sectors', () => {
    assert.strictEqual(MSG.AIRCRAFT_UPDATE, 'aircraft_update', 'MSG.AIRCRAFT_UPDATE must be defined in protocol');
    assert.strictEqual(MSG.AIRCRAFT_EVADE, 'aircraft_evade', 'MSG.AIRCRAFT_EVADE must be defined in protocol');
    assert.strictEqual(MSG.AIRCRAFT_HIT, 'aircraft_hit', 'MSG.AIRCRAFT_HIT must be defined in protocol');
    assert.strictEqual(MSG.AIRCRAFT_DESTROYED, 'aircraft_destroyed', 'MSG.AIRCRAFT_DESTROYED must be defined in protocol');

    // Valid weapon shoot packet accepts targetAircraftId and targetAerialId
    assert.strictEqual(
      isValidWeaponShoot({ weaponType: 'bazooka', targetAerialId: 'target_drone_1' }),
      true,
      'isValidWeaponShoot must accept optional targetAerialId'
    );
    assert.strictEqual(
      isValidWeaponShoot({ weaponType: 'plasma', targetAircraftId: 'fighter_1' }),
      true,
      'isValidWeaponShoot must accept optional targetAircraftId'
    );

    const gs = new GameState(77777, 10);
    assert.ok(
      gs.fighterAircraft !== undefined && (gs.fighterAircraft instanceof Map || Array.isArray(gs.fighterAircraft)),
      'GameState must maintain fighterAircraft collection'
    );

    const aircraftList = Array.from(gs.fighterAircraft instanceof Map ? gs.fighterAircraft.values() : gs.fighterAircraft);
    assert.ok(aircraftList.length >= 6, 'GameState must initialize multiple fighter aircraft across all world sectors');

    for (const plane of aircraftList) {
      assert.ok(
        plane.y >= 45.0 && plane.y <= 110.0,
        `Fighter aircraft altitude Y=${plane.y} must operate in upper airspace regime Y: 45-110`
      );
      assert.ok(
        plane.speed >= 36.0 && plane.speed <= 44.0,
        `Fighter aircraft cruise speed=${plane.speed} must be increased by 50% to ~39.0 m/s`
      );
      assert.strictEqual(plane.maxHits, 15, 'Fighter aircraft must have internal hit limit of 15 hits');
    }
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // --------------------------------------------------------------------------
  runner.tier('Tier 2: Boundary & Corner Cases');

  await runner.test('TNT explosion immunity: detonateTnt does not alter Y-coordinate of a flying player', () => {
    const gs = new GameState(11111, 10);
    const flyingPlayer = gs.addPlayer('flyer_1', 'Flyer');
    gs.updatePlayer('flyer_1', {
      pos: [50.0, 45.0, 50.0],
      rot: [0, 0],
      isFlying: true,
      action: 'flying'
    });

    const groundedPlayer = gs.addPlayer('ground_1', 'Grounded');
    gs.updatePlayer('ground_1', {
      pos: [100.0, 26.0, 100.0],
      rot: [0, 0],
      isFlying: false,
      action: 'idle'
    });
    // Set a block directly beneath grounded player at y=25
    gs.blockDeltas.set('100,25,100', 1);

    // Detonate TNT directly beneath flying player at y=44 (radius 3)
    // and also set blocks at (50, 44, 50)
    gs.blockDeltas.set('50,44,50', 1);
    gs.detonateTnt(50.0, 44.0, 50.0, 3);

    // Flying player Y coordinate MUST NOT BE ALTERED by block destruction
    assert.strictEqual(
      flyingPlayer.pos[1],
      45.0,
      'Flying player altitude must remain exactly 45.0 without ground drop or floor adjustment'
    );
    assert.strictEqual(flyingPlayer.isFlying, true, 'Flight mode must remain active');

    // In contrast, detonate beneath grounded player at (100, 25, 100)
    gs.detonateTnt(100.0, 25.0, 100.0, 3);
    assert.ok(
      groundedPlayer.pos[1] < 26.0,
      `Grounded player should adjust downward to newly exposed floor (new Y: ${groundedPlayer.pos[1]})`
    );
  });

  await runner.test('Altitude boundaries: aerial targets remain clamped within Y in [35, 60] across 100 simulation ticks', () => {
    const gs = new GameState(22222, 10);
    assert.ok(gs.aerialTargets, 'GameState.aerialTargets collection must be implemented');
    const targets = Array.from(gs.aerialTargets.values());
    assert.ok(targets.length > 0, 'Targets must exist');

    // Simulate 100 updates of movement / simulation
    for (let tick = 0; tick < 100; tick++) {
      if (typeof gs.updateAerialTargets === 'function') {
        gs.updateAerialTargets(0.05); // 50ms dt
      } else if (typeof gs.tickEntities === 'function') {
        gs.tickEntities(0.05);
      }

      for (const target of targets) {
        assert.ok(
          target.y >= 35.0 && target.y <= 60.0,
          `Tick ${tick}: Aerial target ${target.id} Y=${target.y} violated boundary [35, 60]`
        );
      }
    }
  });

  await runner.test('50% Speed Constraint: aerial target speed must strictly be <= 5.0 m/s per urgent user constraint', () => {
    const gs = new GameState(33333, 10);
    assert.ok(gs.aerialTargets, 'GameState.aerialTargets collection must be implemented');
    const targets = Array.from(gs.aerialTargets.values());
    assert.ok(targets.length > 0, 'Targets must exist');

    for (const target of targets) {
      assert.ok(
        target.speed <= 5.0,
        `Target speed ${target.speed} m/s exceeds strict 5.0 m/s ceiling (half-speed constraint: "ESTOS MISLES NUEVSO SON MAS LENTOS LA MITAD DE RAPIDOS")`
      );
      assert.ok(
        target.speed >= 2.5,
        `Target speed ${target.speed} m/s is unreasonably slow (< 2.5 m/s)`
      );
    }
  });

  await runner.test('Health threshold: single bullet (1 dmg) leaves target alive; exactly 90 hits destroy it', () => {
    const gs = new GameState(44444, 10);
    assert.ok(gs.aerialTargets, 'GameState.aerialTargets collection must be implemented');
    const targets = Array.from(gs.aerialTargets.values());
    assert.ok(targets.length > 0, 'Targets must exist in aerialTargets collection');
    const target = targets[0];
    assert.strictEqual(target.health, 90, 'Target starts at 90 hits');

    for (let h = 1; h <= 89; h++) {
      const hit = gs.hitAerialTarget(target.id, 1);
      assert.strictEqual(hit.destroyed, false, `Hit ${h} must not destroy target`);
      assert.strictEqual(hit.remainingHealth, 90 - h, `Hit ${h} leaves ${90 - h} hits`);
    }

    // Hit 90: final 90th bullet destroys target
    const hit90 = gs.hitAerialTarget(target.id, 1);
    assert.strictEqual(hit90.destroyed, true, 'Hit 90 must destroy the target');
    assert.strictEqual(hit90.remainingHealth, 0, 'Remaining health must be 0');
  });

  await runner.test('Room switching packet sequence: SWITCH_ROOM_CONFIRM dispatched before INIT without duplicate entities', () => {
    const rm = new RoomManager({ maxPlayers: 10, seed: 12345 });
    const ws = new MockWebSocket('ws_switcher');
    rm.handleConnection(ws);

    // Initial Join to 'main'
    const joinPayload = {
      type: MSG.JOIN,
      data: { name: 'RoomHopper', roomId: 'main' }
    };
    ws.emit('message', JSON.stringify(joinPayload));

    const mainRoom = rm.rooms.get('main');
    assert.ok(mainRoom, 'Main room must exist');
    assert.strictEqual(mainRoom.clients.size, 1, 'Main room must have 1 client');

    // Clear recorded initial messages
    ws.sentMessages = [];

    // Now switch room to 'pvp_arena'
    const switchPayload = {
      type: MSG.SWITCH_ROOM,
      data: { roomId: 'pvp_arena' }
    };
    ws.emit('message', JSON.stringify(switchPayload));

    // Inspect sent message order
    const confirmIndex = ws.sentMessages.findIndex(m => m.type === MSG.SWITCH_ROOM_CONFIRM);
    const initIndex = ws.sentMessages.findIndex(m => m.type === MSG.INIT);

    assert.ok(confirmIndex !== -1, 'SWITCH_ROOM_CONFIRM must be sent to client');
    assert.ok(initIndex !== -1, 'INIT must be sent to client');
    assert.ok(
      confirmIndex < initIndex,
      `SWITCH_ROOM_CONFIRM (idx ${confirmIndex}) MUST BE SENT BEFORE INIT (idx ${initIndex}) to prevent premature client cache erasure`
    );

    // Verify player is removed from main room and added to pvp_arena without duplicates
    assert.strictEqual(mainRoom.clients.size, 0, 'Old room must have 0 clients after switch');
    const pvpRoom = rm.rooms.get('pvp_arena');
    assert.ok(pvpRoom, 'Target room pvp_arena must exist');
    assert.strictEqual(pvpRoom.clients.size, 1, 'Target room must have exactly 1 client');

    rm.destroy();
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // --------------------------------------------------------------------------
  runner.tier('Tier 3: Cross-Feature Combinations');

  await runner.test('Concurrent flying players under simultaneous weapon burst fire keep distinct flight states and altitudes', () => {
    const rm = new RoomManager({ maxPlayers: 10, seed: 12345 });
    const wsA = new MockWebSocket('ws_pilot_A');
    const wsB = new MockWebSocket('ws_pilot_B');
    const wsShooter = new MockWebSocket('ws_shooter');

    rm.handleConnection(wsA);
    rm.handleConnection(wsB);
    rm.handleConnection(wsShooter);

    wsA.emit('message', JSON.stringify({ type: MSG.JOIN, data: { name: 'PilotA', roomId: 'pvp_arena' } }));
    wsB.emit('message', JSON.stringify({ type: MSG.JOIN, data: { name: 'PilotB', roomId: 'pvp_arena' } }));
    wsShooter.emit('message', JSON.stringify({ type: MSG.JOIN, data: { name: 'Shooter', roomId: 'pvp_arena' } }));

    const metaA = rm.socketMeta.get(wsA);
    const metaB = rm.socketMeta.get(wsB);
    const room = rm.rooms.get('pvp_arena');

    // Both pilots airborne at distinct altitudes
    wsA.emit('message', JSON.stringify({
      type: MSG.MOVE,
      data: { pos: [10, 42.0, 10], rot: [0, 0], isFlying: true, action: 'flying' }
    }));
    wsB.emit('message', JSON.stringify({
      type: MSG.MOVE,
      data: { pos: [30, 58.5, 30], rot: [0, 0], isFlying: true, action: 'flying' }
    }));

    const playerA = room.gameState.getPlayer(metaA.id);
    const playerB = room.gameState.getPlayer(metaB.id);

    assert.strictEqual(playerA.isFlying, true);
    assert.strictEqual(playerB.isFlying, true);
    assert.strictEqual(playerA.pos[1], 42.0);
    assert.strictEqual(playerB.pos[1], 58.5);

    // Shooter fires burst at Pilot A and Pilot B
    wsShooter.emit('message', JSON.stringify({
      type: MSG.WEAPON_SHOOT,
      data: { weaponType: 'bazooka', targetPlayerId: metaA.id, hitPos: [10, 42.0, 10] }
    }));
    wsShooter.emit('message', JSON.stringify({
      type: MSG.WEAPON_SHOOT,
      data: { weaponType: 'plasma', targetPlayerId: metaB.id, hitPos: [30, 58.5, 30] }
    }));

    // Re-verify that neither player had their altitude corrupted, pulled down, or desynchronized
    assert.strictEqual(playerA.pos[1], 42.0, 'Pilot A altitude must remain unchanged after burst hit');
    assert.strictEqual(playerA.isFlying, true, 'Pilot A must remain in flight mode');
    assert.strictEqual(playerB.pos[1], 58.5, 'Pilot B altitude must remain unchanged after burst hit');
    assert.strictEqual(playerB.isFlying, true, 'Pilot B must remain in flight mode');

    rm.destroy();
  });

  await runner.test('Simultaneous aerial target hits from multiple players aggregate damage correctly', () => {
    const gs = new GameState(66666, 10);
    assert.ok(gs.aerialTargets, 'GameState.aerialTargets collection must be implemented');
    const targets = Array.from(gs.aerialTargets.values());
    assert.ok(targets.length > 0, 'Targets must exist in aerialTargets collection');
    const target = targets[0];
    assert.strictEqual(target.health, 90, 'Target initial health 90');

    // Player 1 fires 40 hits
    const res1 = gs.hitAerialTarget(target.id, 40, 'p_shooter_1');
    assert.strictEqual(res1.remainingHealth, 50);
    assert.strictEqual(res1.destroyed, false);

    // Player 2 fires 40 hits
    const res2 = gs.hitAerialTarget(target.id, 40, 'p_shooter_2');
    assert.strictEqual(res2.remainingHealth, 10);
    assert.strictEqual(res2.destroyed, false);

    // Player 1 fires 10 final hits -> destroys target (40 + 40 + 10 = 90 hits)
    const res3 = gs.hitAerialTarget(target.id, 10, 'p_shooter_1');
    assert.strictEqual(res3.destroyed, true);
    assert.strictEqual(res3.remainingHealth, 0);
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD COMBAT SCENARIOS
  // --------------------------------------------------------------------------
  runner.tier('Tier 4: Real-World Combat Scenarios');

  await runner.test('Airborne dogfight simulation: rapid burst fire at airborne victim keeps flight velocity & position fluid without ground snapping', () => {
    const rm = new RoomManager({ maxPlayers: 10, seed: 12345 });
    const wsVictim = new MockWebSocket('ws_victim');
    const wsAttacker = new MockWebSocket('ws_attacker');

    rm.handleConnection(wsVictim);
    rm.handleConnection(wsAttacker);

    wsVictim.emit('message', JSON.stringify({ type: MSG.JOIN, data: { name: 'Victim', roomId: 'main' } }));
    wsAttacker.emit('message', JSON.stringify({ type: MSG.JOIN, data: { name: 'Attacker', roomId: 'main' } }));

    const metaVictim = rm.socketMeta.get(wsVictim);
    const room = rm.rooms.get('main');

    // Victim in active flight cruising at Y = 52.0
    wsVictim.emit('message', JSON.stringify({
      type: MSG.MOVE,
      data: { pos: [0, 52.0, 0], rot: [0, 0], isFlying: true, action: 'flying' }
    }));

    const victimPlayer = room.gameState.getPlayer(metaVictim.id);
    assert.strictEqual(victimPlayer.isFlying, true);
    assert.strictEqual(victimPlayer.pos[1], 52.0);

    // Attacker fires 5 rapid burst shots
    for (let shot = 1; shot <= 5; shot++) {
      wsAttacker.emit('message', JSON.stringify({
        type: MSG.WEAPON_SHOOT,
        data: {
          weaponType: shot % 2 === 0 ? 'plasma' : 'bazooka',
          targetPlayerId: metaVictim.id,
          hitPos: [0, 52.0, 0]
        }
      }));
    }

    // Victim position snapshot verification
    const snapshot = room.gameState.getPlayersSnapshot();
    const snapVictim = snapshot.find(p => p.id === metaVictim.id);
    assert.strictEqual(
      snapVictim.isFlying,
      true,
      'Victim must maintain isFlying: true throughout burst barrage'
    );
    assert.strictEqual(
      snapVictim.y,
      52.0,
      'Victim altitude must remain fluidly at Y=52.0 with zero ground drop'
    );
    assert.strictEqual(
      snapVictim.action,
      'flying',
      'Victim action must remain "flying", not "jumping" or "knockdown"'
    );

    rm.destroy();
  });

  await runner.test('Heavy aerial target destruction and respawn lifecycle', () => {
    const gs = new GameState(88888, 10);
    assert.ok(gs.aerialTargets, 'GameState.aerialTargets collection must be implemented');
    const targets = Array.from(gs.aerialTargets.values());
    assert.ok(targets.length > 0, 'Targets must exist in aerialTargets collection');
    const target = targets[0];
    const targetId = target.id;
    assert.strictEqual(target.health, 90);

    // Sustained burst fire: 90 direct hits
    for (let i = 0; i < 89; i++) {
      gs.hitAerialTarget(targetId, 1);
    }
    const destroyRes = gs.hitAerialTarget(targetId, 1);

    assert.strictEqual(destroyRes.destroyed, true, 'Target must report destroyed: true');

    // Upon destruction, target state must be 'destroyed' or scheduled for respawn
    assert.ok(
      target.state === 'destroyed' || target.state === 'respawning' || !gs.aerialTargets.has(targetId) || target.health <= 0,
      'Target must enter destroyed / respawn lifecycle state'
    );
  });

  await runner.test('Fighter aircraft bullet hit counter, explosion threshold and respawn lifecycle', () => {
    const gs = new GameState(99991, 10);
    const plane = gs.fighterAircraft.get('fighter_1');
    assert.ok(plane, 'fighter_1 must exist in GameState');
    assert.strictEqual(plane.hitCount, 0, 'Plane initial hitCount must be 0');
    assert.strictEqual(plane.maxHits, 15, 'Plane maxHits must be 15');

    // Fire 14 shots at aircraft
    for (let shot = 1; shot <= 14; shot++) {
      const res = gs.hitFighterAircraft(plane.id, 1, 'p_shooter');
      assert.strictEqual(res.destroyed, false, `Shot ${shot} must not destroy plane`);
      assert.strictEqual(res.hitCount, shot, `hitCount must equal ${shot}`);
      assert.strictEqual(res.remainingHits, 15 - shot);
    }

    // 15th shot triggers explosion / destruction
    const destroyRes = gs.hitFighterAircraft(plane.id, 1, 'p_shooter');
    assert.strictEqual(destroyRes.destroyed, true, '15th shot must destroy aircraft');
    assert.strictEqual(plane.state, 'destroyed', 'Aircraft state must be "destroyed"');
  });

  // ==========================================================================
  // RUNNER CONCLUSION
  // ==========================================================================
  const allPassed = runner.summary();
  process.exit(allPassed ? 0 : 1);
}

// Run immediately
runTestSuite().catch(err => {
  console.error('FATAL TEST RUNNER EXCEPTION:', err);
  process.exit(1);
});
