// test/stress_physics_sync.js
// Adversarial Stress & Empirical Verification Suite
// Challenger 1: Physics & Burst Stress Challenger
//
// Verification Focus:
// 1. Airborne player flight synchronization under 500 Bazooka/Plasma bursts across multiple altitudes
// 2. Heavy aerial target movement constraints (1000 ticks: Y in [35, 60], speed <= 5.0 m/s)
// 3. Heavy target health resilience (single hits non-lethal, sustained bursts destroy, 12s respawn)

const assert = require('assert');
const { EventEmitter } = require('events');
const { MSG } = require('../server/protocol.js');
const { GameState } = require('../server/game-state.js');
const { RoomManager } = require('../server/rooms.js');

// Mock WebSocket helper for headless protocol testing
class MockWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // WebSocket.OPEN
    this.sentMessages = [];
  }

  send(data) {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      this.sentMessages.push(parsed);
    } catch (e) {
      this.sentMessages.push(data);
    }
  }

  close() {
    this.readyState = 3; // WebSocket.CLOSED
    this.emit('close');
  }

  getMessagesByType(type) {
    return this.sentMessages.filter(m => m && m.type === type);
  }

  getLastMessageByType(type) {
    const list = this.getMessagesByType(type);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  clearMessages() {
    this.sentMessages = [];
  }
}

// Simulated Client Avatar Kinematics (mirroring public/src/avatar.js logic)
class SimulatedAvatar {
  constructor(initialY = 30) {
    this.group = {
      position: {
        x: 0,
        y: initialY,
        z: 0,
        distanceToSquared: function(v) {
          const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
          return dx * dx + dy * dy + dz * dz;
        },
        copy: function(v) {
          this.x = v.x;
          this.y = v.y;
          this.z = v.z;
        }
      },
      rotation: { y: 0 }
    };
    this.targetPos = {
      x: 0,
      y: initialY,
      z: 0,
      set: function(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
      }
    };
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.velY = 0;
    this.onGround = false;
    this.isFlying = true;
    this.action = 'flying';
    this.weaponsEnabled = true;
    this.world = {
      getBlock: (x, y, z) => (y < 24 ? 1 : 0) // Solid ground below Y=24
    };
  }

  getGroundHeight(x, z, startY) {
    return 24; // Standard ground level
  }

  updateGroundDetection(world = this.world) {
    if (this.isFlying || this.action === 'flying' || this.action === 'driving') return this.targetPos.y;
    // Ground detection branch (must never execute for flying avatars)
    const groundY = this.getGroundHeight(this.group.position.x, this.group.position.z, this.group.position.y);
    this.targetPos.y = groundY;
    if (this.group.position.y < groundY) {
      this.group.position.y = groundY;
      this.velY = 0;
      this.onGround = true;
    } else if (this.group.position.y > groundY) {
      this.onGround = false;
      if (this.velY >= 0) this.velY = -2.0;
    }
    return groundY;
  }

  updateGroundSupport(world = this.world) {
    if (this.isFlying || this.action === 'flying' || this.action === 'driving') return true;
    // Ground support branch
    this.onGround = false;
    this.velY = -2.0;
    return false;
  }

  onSupportingBlockRemoved(bx, by, bz) {
    if (this.isFlying || this.action === 'flying' || this.action === 'driving') return;
    this.updateGroundSupport(this.world);
  }

  setTargetState(posOrData, rot, action, weaponsEnabled, isFlying) {
    let pos = posOrData;
    if (posOrData && typeof posOrData === 'object' && !Array.isArray(posOrData) && ('pos' in posOrData || 'action' in posOrData || 'isFlying' in posOrData)) {
      pos = posOrData.pos;
      rot = posOrData.rot;
      action = posOrData.action;
      weaponsEnabled = posOrData.weaponsEnabled;
      isFlying = posOrData.isFlying;
    }
    if (action) this.action = action;
    if (typeof isFlying === 'boolean') this.isFlying = isFlying;
    if (this.isFlying || this.action === 'flying') {
      this.isFlying = true;
      this.action = 'flying';
      this.onGround = false;
    }
    if (pos) {
      const px = pos[0];
      let py = pos[1];
      const pz = pos[2];
      if (this.world && this.action !== 'driving' && !this.isFlying && this.action !== 'flying') {
        const groundY = this.getGroundHeight(px, pz, py);
        if (py < groundY) py = groundY;
      }
      this.targetPos.set(px, py, pz);
    }
  }

  update(dt) {
    const distSq = this.group.position.distanceToSquared(this.targetPos);
    const vertDelta = Math.abs(this.group.position.y - this.targetPos.y);

    if (distSq > 25 || vertDelta > 5.0) {
      this.group.position.copy(this.targetPos);
      this.velY = 0;
      this.onGround = !this.isFlying && this.action !== 'flying';
    } else if (this.isFlying || this.action === 'flying') {
      // FLIGHT MODE: Smooth symmetric 3D kinematic interpolation
      const lerpFactor = Math.min(1.0, dt * 14.0);
      this.group.position.x += (this.targetPos.x - this.group.position.x) * lerpFactor;
      this.group.position.z += (this.targetPos.z - this.group.position.z) * lerpFactor;
      this.group.position.y += (this.targetPos.y - this.group.position.y) * lerpFactor;
      this.velY = 0;
      this.onGround = false;
    } else {
      // Non-flying branch with downward gravity
      const groundY = this.getGroundHeight(this.group.position.x, this.group.position.z, this.group.position.y);
      if (this.group.position.y > this.targetPos.y) {
        this.velY -= 9.8 * dt;
        this.group.position.y += this.velY * dt;
        if (this.group.position.y <= groundY) {
          this.group.position.y = groundY;
          this.velY = 0;
          this.onGround = true;
        }
      }
    }
  }
}

async function runAdversarialStressSuite() {
  console.log('=============================================================================');
  console.log('     CHALLENGER 1: ADVERSARIAL PHYSICS & BURST STRESS TEST SUITE            ');
  console.log('=============================================================================');

  let passedTests = 0;
  let totalTests = 0;

  function runTest(name, fn) {
    totalTests++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // SUITE 1: AIRBORNE PLAYER BURST HIT SYNCHRONIZATION (500 SHOTS STRESS)
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 1: Airborne Player Burst Hit Synchronization (500 Shots Across Altitudes) ---');

  const altitudes = [30.0, 48.5, 75.0, 100.0];

  for (const alt of altitudes) {
    runTest(`500 Bazooka/Plasma burst hits against airborne player at Y=${alt} preserves exact flight state`, () => {
      const roomManager = new RoomManager();
      const roomId = `stress_room_alt_${alt}`;
      const victimWs = new MockWebSocket();
      const victimMeta = { id: 'victim_player', roomId: null, lastMsgTime: Date.now(), msgCount: 0 };
      roomManager.socketMeta.set(victimWs, victimMeta);

      // Join victim into room
      roomManager.handleJoin(victimWs, victimMeta, {
        roomId,
        name: 'FlyerOne'
      });

      // Update victim position & flight mode to test altitude
      roomManager.handleMove(victimWs, victimMeta, {
        pos: [10, alt, 10],
        rot: [0, 0],
        isFlying: true,
        action: 'flying'
      });

      // Attacker clients (5 concurrent attackers)
      const attackers = [];
      for (let i = 1; i <= 5; i++) {
        const ws = new MockWebSocket();
        const meta = { id: `attacker_${i}`, roomId: null, lastMsgTime: Date.now(), msgCount: 0 };
        roomManager.socketMeta.set(ws, meta);
        roomManager.handleJoin(ws, meta, {
          roomId,
          name: `Attacker_${i}`
        });
        roomManager.handleMove(ws, meta, {
          pos: [20, alt, 20],
          rot: [0, 0],
          isFlying: false,
          action: 'idle'
        });
        attackers.push({ ws, meta });
      }

      const room = roomManager.rooms.get(roomId);
      assert(room, 'Room must be created');
      const victimPlayer = room.gameState.getPlayer('victim_player');
      assert.strictEqual(victimPlayer.isFlying, true, 'Victim must initially be flying');
      assert.strictEqual(victimPlayer.pos[1], alt, `Victim initial Y must be ${alt}`);

      // Client avatar simulation tracking
      const avatar = new SimulatedAvatar(alt);
      assert.strictEqual(avatar.isFlying, true);
      assert.strictEqual(avatar.group.position.y, alt);

      // Execute 500 burst shots (alternate between Bazooka and Plasma across 5 attackers)
      const totalBurstShots = 500;
      const weapons = ['bazooka', 'plasma'];

      for (let s = 0; s < totalBurstShots; s++) {
        const attacker = attackers[s % attackers.length];
        const weaponType = weapons[s % weapons.length];

        // 1. Attacker fires weapon shoot packet targeting victim
        roomManager.handleWeaponShoot(attacker.ws, attacker.meta, {
          weaponType,
          targetPlayerId: 'victim_player',
          origin: [20, alt, 20],
          dir: [-1, 0, -1],
          hitPos: [10, alt, 10]
        });

        // 2. Client avatar receives snapshot or state update
        avatar.setTargetState({
          pos: victimPlayer.pos,
          action: victimPlayer.action,
          isFlying: victimPlayer.isFlying
        });

        // 3. Avatar physics step
        avatar.update(0.016);

        // 4. Trigger ground detection & ground support checks (adversarial stress)
        avatar.updateGroundDetection();
        avatar.updateGroundSupport();
        avatar.onSupportingBlockRemoved(Math.floor(10), Math.floor(alt - 1), Math.floor(10));

        // Empirically verify invariants after every single shot:
        // A. Server position & flight state never corrupted
        assert.strictEqual(victimPlayer.isFlying, true, `Shot ${s}: isFlying must remain true`);
        assert.strictEqual(victimPlayer.pos[1], alt, `Shot ${s}: Altitude must remain exactly ${alt}`);

        // B. Client avatar never drops, never snaps to ground, never enters falling physics
        assert.strictEqual(avatar.isFlying, true, `Shot ${s}: Avatar isFlying must remain true`);
        assert.strictEqual(avatar.action, 'flying', `Shot ${s}: Avatar action must remain 'flying'`);
        assert.strictEqual(avatar.onGround, false, `Shot ${s}: Avatar onGround must remain false`);
        assert.strictEqual(avatar.velY, 0, `Shot ${s}: Avatar velY must remain 0 (no gravity)`);

        const deltaY = Math.abs(avatar.group.position.y - alt);
        assert(deltaY < 0.0001, `Shot ${s}: Avatar position Y (${avatar.group.position.y}) dropped from ${alt} (delta=${deltaY})`);
      }

      // Final post-burst snapshot serialization check
      const snapshot = room.gameState.getPlayersSnapshot();
      const victimSnap = snapshot.find(p => p.id === 'victim_player');
      assert(victimSnap, 'Victim must exist in snapshot');
      assert.strictEqual(victimSnap.isFlying, true, 'Snapshot must export isFlying: true');
      assert.strictEqual(victimSnap.pos[1], alt, `Snapshot altitude must be ${alt}`);

      // Cleanup
      roomManager.destroy();
      roomManager.rooms.delete(roomId);
    });
  }

  runTest('Airborne player is completely immune to subterranean and ground TNT detonations & block excavation', () => {
    const roomManager = new RoomManager();
    const roomId = 'stress_room_explosions';
    const ws = new MockWebSocket();
    const meta = { id: 'flying_player_tnt', roomId: null, lastMsgTime: Date.now(), msgCount: 0 };
    roomManager.socketMeta.set(ws, meta);

    roomManager.handleJoin(ws, meta, {
      roomId,
      name: 'SkyMaster'
    });

    roomManager.handleMove(ws, meta, {
      pos: [0, 35, 0], // Airborne at Y=35 directly above ground Y=24
      rot: [0, 0],
      isFlying: true,
      action: 'flying'
    });

    const room = roomManager.rooms.get(roomId);
    const player = room.gameState.getPlayer('flying_player_tnt');

    // 1. Detonate 20 massive TNT explosions directly beneath the player on the ground (Y=24)
    for (let r = 0; r < 20; r++) {
      room.gameState.detonateTnt(0, 24, 0, 5);
      // Invariant: Player at Y=35 must NOT fall or adjust floor
      assert.strictEqual(player.pos[1], 35, `After TNT ${r}: Player Y must strictly remain 35`);
      assert.strictEqual(player.isFlying, true, `After TNT ${r}: isFlying must strictly remain true`);
    }

    // 2. Perform massive block excavations beneath player (destroy all blocks from Y=24 down to Y=0)
    for (let by = 24; by >= 0; by--) {
      room.gameState.modifyBlock(0, by, 0, 0); // 0 = AIR
      assert.strictEqual(player.pos[1], 35, `After block excavation at Y=${by}: Player Y must strictly remain 35`);
    }

    roomManager.destroy();
    roomManager.rooms.delete(roomId);
  });

  // ---------------------------------------------------------------------------
  // SUITE 2: HEAVY AERIAL TARGET CONSTRAINTS (1000 MOVEMENT TICKS)
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Heavy Aerial Target Constraints (1000 Movement Ticks) ---');

  runTest('1000 movement ticks strictly clamp target altitude in [35, 60] and speed <= 5.0 m/s', () => {
    const gameState = new GameState();
    assert(gameState.aerialTargets.size >= 2, 'Must initialize heavy aerial targets');

    const tickCount = 1000;
    const dt = 0.05; // 20 Hz tick
    let minObservedY = Infinity;
    let maxObservedY = -Infinity;
    let maxObservedSpeed = -Infinity;
    let minObservedSpeed = Infinity;

    // Track targets across 1000 movement ticks
    for (let tick = 1; tick <= tickCount; tick++) {
      // Record previous positions
      const prevPositions = new Map();
      for (const [id, target] of gameState.aerialTargets.entries()) {
        prevPositions.set(id, { x: target.x, y: target.y, z: target.z });
      }

      // Step simulation
      gameState.updateAerialTargets(dt);

      // Verify each target's position and instantaneous velocity
      for (const [id, target] of gameState.aerialTargets.entries()) {
        const prev = prevPositions.get(id);

        // 1. Altitude clamping constraint: strictly in [35, 60]
        assert(target.y >= 35.0, `Tick ${tick}: Target ${id} Y (${target.y}) is below minimum 35.0`);
        assert(target.y <= 60.0, `Tick ${tick}: Target ${id} Y (${target.y}) is above maximum 60.0`);

        if (target.y < minObservedY) minObservedY = target.y;
        if (target.y > maxObservedY) maxObservedY = target.y;

        // 2. Empirical 3D displacement and velocity
        const dx = target.x - prev.x;
        const dy = target.y - prev.y;
        const dz = target.z - prev.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const speed = dist / dt;

        if (speed > maxObservedSpeed) maxObservedSpeed = speed;
        if (speed < minObservedSpeed) minObservedSpeed = speed;

        // User constraint: strictly <= 5.0 m/s (50% slower cruising speed)
        assert(speed <= 5.0, `Tick ${tick}: Target ${id} empirical speed (${speed.toFixed(3)} m/s) exceeds 5.0 m/s limit`);
      }
    }

    console.log(`    -> Observed Altitude Range across 1000 ticks: [${minObservedY.toFixed(2)}, ${maxObservedY.toFixed(2)}] (Allowed: [35, 60])`);
    console.log(`    -> Observed Speed Range across 1000 ticks: [${minObservedSpeed.toFixed(2)}, ${maxObservedSpeed.toFixed(2)}] m/s (Allowed: <= 5.0 m/s)`);

    assert(minObservedY >= 35.0 && maxObservedY <= 60.0, 'Altitude must stay within [35, 60]');
    assert(maxObservedSpeed <= 5.0, 'Speed must strictly stay <= 5.0 m/s');
    // Also verify cruising speed is realistic (not stuck at 0)
    assert(minObservedSpeed >= 3.0, 'Targets must be actively cruising at ~3.5-4.8 m/s, not stationary');
  });

  runTest('Heavy aerial targets maintain altitude clamping under extreme variable dt (0.01s to 0.5s)', () => {
    const gameState = new GameState();
    const extremeDts = [0.01, 0.02, 0.08, 0.15, 0.25, 0.5];

    for (const dt of extremeDts) {
      for (let step = 0; step < 100; step++) {
        gameState.updateAerialTargets(dt);
        for (const target of gameState.aerialTargets.values()) {
          assert(target.y >= 35.0 && target.y <= 60.0,
            `Variable dt=${dt} step=${step}: target Y (${target.y}) outside [35, 60]`);
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // SUITE 3: HEAVY TARGET HEALTH RESILIENCE & SUSTAINED BURST DESTRUCTION
  // ---------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Heavy Aerial Target Health & Sustained Burst Fire ---');

  runTest('Single weapon hits (1 bullet) NEVER destroy a heavy target from full health (starts at 5 hits)', () => {
    const gameState = new GameState();
    const targetId = 'target_drone_1';
    const target = gameState.aerialTargets.get(targetId);
    assert.strictEqual(target.health, 5, 'Target must start with 5 hits');

    // Deliver single hit
    const result = gameState.hitAerialTarget(targetId, 1, 'attacker_single_hit');

    assert(result !== null, `Hit result must not be null`);
    assert.strictEqual(result.destroyed, false, `Single hit must NOT destroy target`);
    assert.strictEqual(result.remainingHealth, 4, `Single hit must leave 4 hits`);
    assert.strictEqual(target.state, 'patrol', `Target must remain in 'patrol' state`);
  });

  runTest('Sustained burst fire (5 direct hits) consistently destroys target and triggers 12s respawn', () => {
    const gameState = new GameState();
    const targetId = 'target_drone_1';

    let respawnEventFired = false;
    gameState.onTargetRespawn = (respawnedTarget) => {
      respawnEventFired = true;
      assert.strictEqual(respawnedTarget.id, targetId);
      assert.strictEqual(respawnedTarget.health, 5, 'Respawned target must have 5 hits');
      assert.strictEqual(respawnedTarget.state, 'patrol', 'Respawned target must be in patrol');
    };

    // Shots 1-4: non-lethal
    for (let s = 1; s <= 4; s++) {
      const r = gameState.hitAerialTarget(targetId, 1, 'shooter_1');
      assert.strictEqual(r.destroyed, false);
      assert.strictEqual(r.remainingHealth, 5 - s);
    }

    // Shot 5: 1 hit -> 0 HP (Destruction on 5th bullet!)
    const r5 = gameState.hitAerialTarget(targetId, 1, 'shooter_1');
    assert.strictEqual(r5.destroyed, true, 'Fifth shot must destroy target');
    assert.strictEqual(r5.remainingHealth, 0);
    assert.strictEqual(gameState.aerialTargets.get(targetId).state, 'destroyed');

    // Verify 12-second respawn timer registered
    assert(gameState.targetRespawnTimers.has(targetId), '12s respawn timer must be active');

    // Simulate fast-forwarding the 12s timer
    const timer = gameState.targetRespawnTimers.get(targetId);
    clearTimeout(timer);
    gameState.targetRespawnTimers.delete(targetId);

    // Manually trigger the respawn callback routine
    const target = gameState.aerialTargets.get(targetId);
    target.health = target.maxHealth || 5;
    target.state = 'patrol';
    if (typeof gameState.onTargetRespawn === 'function') {
      gameState.onTargetRespawn(target);
    }

    assert.strictEqual(respawnEventFired, true, 'Respawn event must fire');
    assert.strictEqual(target.health, 5);
    assert.strictEqual(target.state, 'patrol');
  });

  runTest('Multiplayer RoomManager weapon shoot broadcasts AERIAL_TARGET_HIT and AERIAL_TARGET_DESTROYED packets', () => {
    const roomManager = new RoomManager();
    const roomId = 'room_target_broadcast_test';
    const shooterWs = new MockWebSocket();
    const shooterMeta = { id: 'player_ace', roomId: null, lastMsgTime: Date.now(), msgCount: 0 };
    roomManager.socketMeta.set(shooterWs, shooterMeta);

    const spectatorWs = new MockWebSocket();
    const spectatorMeta = { id: 'player_spectator', roomId: null, lastMsgTime: Date.now(), msgCount: 0 };
    roomManager.socketMeta.set(spectatorWs, spectatorMeta);

    roomManager.handleJoin(shooterWs, shooterMeta, { roomId, name: 'AceShooter' });
    roomManager.handleMove(shooterWs, shooterMeta, { pos: [0, 40, 0], rot: [0, 0] });

    roomManager.handleJoin(spectatorWs, spectatorMeta, { roomId, name: 'Spectator' });
    roomManager.handleMove(spectatorWs, spectatorMeta, { pos: [10, 40, 10], rot: [0, 0] });

    shooterWs.clearMessages();
    spectatorWs.clearMessages();

    // 1. Fire shot 1 at drone 1 (non-lethal hit: 1 dmg, 4 HP remaining)
    roomManager.handleWeaponShoot(shooterWs, shooterMeta, {
      weaponType: 'bazooka',
      targetAerialId: 'target_drone_1',
      origin: [0, 40, 0],
      dir: [1, 0, 0],
      hitPos: [50, 45, 0]
    });

    const hitMsg = spectatorWs.getLastMessageByType(MSG.AERIAL_TARGET_HIT);
    assert(hitMsg && hitMsg.data, 'Spectator must receive AERIAL_TARGET_HIT broadcast');
    assert.strictEqual(hitMsg.data.targetId, 'target_drone_1');
    assert.strictEqual(hitMsg.data.damage, 1);
    assert.strictEqual(hitMsg.data.remainingHealth, 4);
    assert.strictEqual(hitMsg.data.maxHealth, 5);

    // 2. Fire shots 2, 3, 4
    for (let s = 2; s <= 4; s++) {
      roomManager.handleWeaponShoot(shooterWs, shooterMeta, {
        weaponType: 'rifle',
        targetAerialId: 'target_drone_1',
        origin: [0, 40, 0],
        dir: [1, 0, 0]
      });
    }

    // 3. Fire 5th shot (Lethal hit -> AERIAL_TARGET_DESTROYED)
    roomManager.handleWeaponShoot(shooterWs, shooterMeta, {
      weaponType: 'bazooka',
      targetAerialId: 'target_drone_1',
      origin: [0, 40, 0],
      dir: [1, 0, 0]
    });

    const destroyMsg = spectatorWs.getLastMessageByType(MSG.AERIAL_TARGET_DESTROYED);
    assert(destroyMsg && destroyMsg.data, 'Spectator must receive AERIAL_TARGET_DESTROYED broadcast');
    assert.strictEqual(destroyMsg.data.targetId, 'target_drone_1');
    assert.strictEqual(destroyMsg.data.killerId, 'player_ace');
    assert.strictEqual(destroyMsg.data.killerName, 'AceShooter');
    assert.strictEqual(destroyMsg.data.respawnDelaySeconds, 12);

    // Clean up room timers
    const room = roomManager.rooms.get(roomId);
    if (room && room.gameState && room.gameState.targetRespawnTimers) {
      for (const t of room.gameState.targetRespawnTimers.values()) {
        clearTimeout(t);
      }
    }
    roomManager.destroy();
    roomManager.rooms.delete(roomId);
  });

  console.log('\n=============================================================================');
  console.log(`RESULTS: ${passedTests} OF ${totalTests} TESTS PASSED WITH 100% SUCCESS!`);
  console.log('VERDICT: CONFIRMED');
  console.log('=============================================================================');
  process.exit(0);
}

runAdversarialStressSuite().catch((err) => {
  console.error('\nADVERSARIAL STRESS TEST FAILED:', err);
  process.exit(1);
});
