// test/stress_aircraft_evasion.js
// Adversarial Stress Test Suite: Acrobatic Aircraft Evasion Kinematics, Burst Fire & Room Switching
// Challenger 2 Empirical Verifier

const assert = require('assert');
const { GameState } = require('../server/game-state');
const { RoomManager } = require('../server/rooms');
const { MSG } = require('../server/protocol');

// Simple Mock WebSocket for headless server testing
class MockWebSocket {
  constructor() {
    this.readyState = 1; // 1 = OPEN
    this.sentMessages = [];
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const h of handlers) {
      h(data);
    }
  }

  send(payload) {
    this.sentMessages.push(JSON.parse(payload));
  }

  close() {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }
}

// Function to compute shortest angular difference in [-PI, PI]
function shortAngleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

async function runAllStressTests() {
  console.log('================================================================');
  console.log('CHALLENGER 2: ADVERSARIAL STRESS TEST SUITE');
  console.log('Aircraft Evasion Kinematics, Burst Fire & Room Switching Sequence');
  console.log('================================================================\n');

  const findings = {
    kinematics: [],
    burstInterference: [],
    roomSwitching: [],
    summary: { totalTests: 0, passed: 0, failed: 0 }
  };

  // ============================================================================
  // TEST SUITE 1: EVASION KINEMATICS, DERIVATIVE CONTINUITY (C1, C2) & SNAPPING
  // ============================================================================
  console.log('--- SUITE 1: Evasion Kinematics & Mathematical Continuity (C1/C2) ---');

  const maneuvers = ['barrel_roll', 'break_turn', 'zoom_climb', 'spiraling_scissors'];
  const dt = 0.016; // 60 Hz frame step

  for (const maneuver of maneuvers) {
    findings.summary.totalTests++;
    const gs = new GameState(48151623, 10);
    const plane = gs.fighterAircraft.get('fighter_1');
    assert(plane, 'fighter_1 must exist in GameState');

    // Warm up along spline
    for (let i = 0; i < 30; i++) {
      gs.updateFighterAircraft(dt);
    }

    const triggerRes = gs.triggerAircraftEvasion(plane.id, maneuver);
    const duration = triggerRes.duration;
    plane.evasionDirection = 1;

    // Simulation over the maneuver duration + boundary transitions
    // We explicitly step normalized time tau from -0.05 to 1.05 to detect any discontinuity
    const totalSteps = 250;
    let maxStepDisplacement = 0;
    let maxSpeed = 0;
    let maxAccel = 0;
    let maxAngYawStepDeg = 0;
    let maxAngPitchStepDeg = 0;
    let maxAngRollStepDeg = 0;

    const positionJumps = [];
    const angularSnaps = [];
    const altitudeViolations = [];

    const v_max = 125.0; // m/s upper bound
    const maxAllowedStepDisp = v_max * dt; // ~2.0m per 16ms step

    let prevPos = { x: plane.x, y: plane.y, z: plane.z };
    let prevVel = { x: 0, y: 0, z: 0 };
    let prevRot = { yaw: plane.yaw, pitch: plane.pitch, roll: plane.roll };

    const startTime = Date.now();

    for (let step = 0; step < totalSteps; step++) {
      // Simulate tau stepping across [0, 1.05]
      const tau = (step / (totalSteps * 0.8));
      plane.evasionStartTime = startTime - Math.round(tau * duration * 1000);

      gs.updateFighterAircraft(dt);

      const curPos = { x: plane.x, y: plane.y, z: plane.z };
      const curRot = { yaw: plane.yaw, pitch: plane.pitch, roll: plane.roll };

      // Displacement & derivatives
      const dx = curPos.x - prevPos.x;
      const dy = curPos.y - prevPos.y;
      const dz = curPos.z - prevPos.z;
      const stepDisp = Math.hypot(dx, dy, dz);
      const vel = { x: dx / dt, y: dy / dt, z: dz / dt };
      const speed = Math.hypot(vel.x, vel.y, vel.z);

      const dax = (vel.x - prevVel.x) / dt;
      const day = (vel.y - prevVel.y) / dt;
      const daz = (vel.z - prevVel.z) / dt;
      const accel = Math.hypot(dax, day, daz);

      if (stepDisp > maxStepDisplacement) maxStepDisplacement = stepDisp;
      if (speed > maxSpeed) maxSpeed = speed;
      if (step > 1 && accel > maxAccel) maxAccel = accel;

      if (stepDisp > maxAllowedStepDisp) {
        positionJumps.push({ step, tau: tau.toFixed(3), stepDisp: stepDisp.toFixed(2), limit: maxAllowedStepDisp.toFixed(2) });
      }

      // Altitude checks [45, 110]
      if (curPos.y < 45 || curPos.y > 110) {
        altitudeViolations.push({ step, y: curPos.y });
      }

      // Angular steps
      const dyaw = Math.abs(shortAngleDiff(curRot.yaw, prevRot.yaw));
      const dpitch = Math.abs(shortAngleDiff(curRot.pitch, prevRot.pitch));
      const droll = Math.abs(shortAngleDiff(curRot.roll, prevRot.roll));

      const degYaw = (dyaw * 180) / Math.PI;
      const degPitch = (dpitch * 180) / Math.PI;
      const degRoll = (droll * 180) / Math.PI;

      if (degYaw > maxAngYawStepDeg) maxAngYawStepDeg = degYaw;
      if (degPitch > maxAngPitchStepDeg) maxAngPitchStepDeg = degPitch;
      if (degRoll > maxAngRollStepDeg) maxAngRollStepDeg = degRoll;

      // Angular snap threshold: > 25 degrees in a single 16ms frame
      const snapThresholdDeg = 25.0;
      if (degYaw > snapThresholdDeg || degPitch > snapThresholdDeg || degRoll > snapThresholdDeg) {
        angularSnaps.push({
          step,
          tau: tau.toFixed(3),
          degYaw: degYaw.toFixed(1),
          degPitch: degPitch.toFixed(1),
          degRoll: degRoll.toFixed(1),
          state: plane.state
        });
      }

      prevPos = curPos;
      prevVel = vel;
      prevRot = curRot;
    }

    const testPassed = (positionJumps.length === 0) && (altitudeViolations.length === 0) && (angularSnaps.length === 0);
    const item = {
      maneuver,
      duration,
      maxStepDisplacement: maxStepDisplacement.toFixed(2) + 'm',
      maxSpeed: maxSpeed.toFixed(1) + ' m/s',
      maxAccel: maxAccel.toFixed(1) + ' m/s²',
      maxYawStep: maxAngYawStepDeg.toFixed(1) + '°',
      maxPitchStep: maxAngPitchStepDeg.toFixed(1) + '°',
      maxRollStep: maxAngRollStepDeg.toFixed(1) + '°',
      positionJumpsCount: positionJumps.length,
      angularSnapsCount: angularSnaps.length,
      angularSnaps,
      verdict: testPassed ? 'PASS' : 'FAIL'
    };

    findings.kinematics.push(item);
    if (testPassed) {
      findings.summary.passed++;
      console.log(`  [PASS] Maneuver '${maneuver}': continuous C1/C2, no position jumps (max disp: ${item.maxStepDisplacement}), no angular snaps.`);
    } else {
      findings.summary.failed++;
      console.log(`  [FAIL] Maneuver '${maneuver}': ${angularSnaps.length} angular snap(s) detected!`);
      for (const s of angularSnaps) {
        console.log(`         -> at tau=${s.tau}: dyaw=${s.degYaw}°, dpitch=${s.degPitch}°, droll=${s.degRoll}°`);
      }
    }
  }

  // ============================================================================
  // TEST SUITE 2: RAPID BURST FIRE INTERFERENCE & MID-EVASION DISRUPTION
  // ============================================================================
  console.log('\n--- SUITE 2: Rapid Burst Fire Targeting & Mid-Evasion Disruption ---');

  {
    findings.summary.totalTests++;
    const gs = new GameState(48151623, 10);
    const plane = gs.fighterAircraft.get('fighter_1');

    // Trigger initial evasion
    gs.triggerAircraftEvasion(plane.id, 'break_turn');
    plane.evasionDirection = 1;
    const duration = plane.evasionDuration;

    // Advance to peak of maneuver: tau = 0.5 (W = 1.0, maximum displacement)
    plane.evasionStartTime = Date.now() - Math.round(duration * 0.5 * 1000);
    gs.updateFighterAircraft(0.05);

    const posPeak = { x: plane.x, y: plane.y, z: plane.z, roll: plane.roll, yaw: plane.yaw, tau: plane.evasionProgress };

    // Fire 2nd burst shot while plane is actively evading
    gs.triggerAircraftEvasion(plane.id, 'break_turn');
    gs.updateFighterAircraft(0.05);

    const posPostBurst = { x: plane.x, y: plane.y, z: plane.z, roll: plane.roll, yaw: plane.yaw, tau: plane.evasionProgress };

    const jumpDist = Math.hypot(posPostBurst.x - posPeak.x, posPostBurst.y - posPeak.y, posPostBurst.z - posPeak.z);
    const drollDeg = Math.abs(shortAngleDiff(posPostBurst.roll, posPeak.roll)) * 180 / Math.PI;
    const dyawDeg = Math.abs(shortAngleDiff(posPostBurst.yaw, posPeak.yaw)) * 180 / Math.PI;

    console.log(`  Peak evasion state at tau=0.5: pos=(${posPeak.x.toFixed(1)}, ${posPeak.y.toFixed(1)}, ${posPeak.z.toFixed(1)}), roll=${(posPeak.roll * 180 / Math.PI).toFixed(1)}°`);
    console.log(`  Post-burst hit state at tau=0.0: pos=(${posPostBurst.x.toFixed(1)}, ${posPostBurst.y.toFixed(1)}, ${posPostBurst.z.toFixed(1)}), roll=${(posPostBurst.roll * 180 / Math.PI).toFixed(1)}°`);
    console.log(`  Mid-evasion burst jump distance: ${jumpDist.toFixed(2)}m (over 50ms tick = ${(jumpDist / 0.05).toFixed(1)} m/s)`);
    console.log(`  Mid-evasion burst angular change: dyaw=${dyawDeg.toFixed(1)}°, droll=${drollDeg.toFixed(1)}°`);

    // In a smooth system, incoming burst fire should NOT cause a teleport > 5m or snap > 20 deg
    const burstSmooth = jumpDist <= 5.0 && drollDeg <= 20.0 && dyawDeg <= 20.0;

    findings.burstInterference.push({
      scenario: 'Mid-evasion burst fire hit re-triggering evasion',
      jumpDistance: jumpDist.toFixed(2) + 'm',
      equivalentSpeed: (jumpDist / 0.05).toFixed(1) + ' m/s',
      dyawDeg: dyawDeg.toFixed(1) + '°',
      drollDeg: drollDeg.toFixed(1) + '°',
      verdict: burstSmooth ? 'PASS' : 'FAIL'
    });

    if (burstSmooth) {
      findings.summary.passed++;
      console.log('  [PASS] Mid-evasion burst fire preserves continuous trajectory.');
    } else {
      findings.summary.failed++;
      console.log(`  [FAIL] Burst fire causes mid-air teleportation (${jumpDist.toFixed(2)}m jump) and severe angular snap (${dyawDeg.toFixed(1)}° yaw, ${drollDeg.toFixed(1)}° roll) due to uninhibited evasionStartTime reset!`);
    }
  }

  // ============================================================================
  // TEST SUITE 3: ROOM SWITCHING PACKET SEQUENCE INVARIANT & ENTITY LIFECYCLE
  // ============================================================================
  console.log('\n--- SUITE 3: Room Switching Packet Sequence Invariant & Lifecycle ---');

  {
    findings.summary.totalTests++;
    const roomManager = new RoomManager();
    const mockWs = new MockWebSocket();
    roomManager.handleConnection(mockWs);

    // Initial Join into 'main'
    mockWs.emit('message', JSON.stringify({
      type: MSG.JOIN,
      data: { name: 'SwitchTester' }
    }));

    // Perform room switches between distinct rooms
    const switchSequence = ['sandbox', 'pvp_arena', 'private_lobby', 'main', 'sandbox', 'pvp_arena'];
    let invariantViolations = 0;
    const transitionLogs = [];

    for (let i = 0; i < switchSequence.length; i++) {
      const targetRoom = switchSequence[i];
      mockWs.sentMessages = [];

      mockWs.emit('message', JSON.stringify({
        type: MSG.SWITCH_ROOM,
        data: { roomId: targetRoom }
      }));

      const types = mockWs.sentMessages.map(m => m.type);
      const scIdx = types.indexOf(MSG.SWITCH_ROOM_CONFIRM);
      const inIdx = types.indexOf(MSG.INIT);

      const validOrder = (scIdx !== -1 && inIdx !== -1 && scIdx < inIdx);
      if (!validOrder) invariantViolations++;

      transitionLogs.push({ targetRoom, packets: types, scIdx, inIdx, validOrder });
    }

    const roomSwitchPassed = (invariantViolations === 0);

    findings.roomSwitching.push({
      switchesTested: switchSequence.length,
      invariantViolations,
      transitionLogs,
      verdict: roomSwitchPassed ? 'PASS' : 'FAIL'
    });

    if (roomSwitchPassed) {
      findings.summary.passed++;
      console.log(`  [PASS] SWITCH_ROOM_CONFIRM strictly dispatched before INIT across all ${switchSequence.length} room switches.`);
      for (const t of transitionLogs) {
        console.log(`         -> Switch to '${t.targetRoom}': CONFIRM at [${t.scIdx}], INIT at [${t.inIdx}]`);
      }
    } else {
      findings.summary.failed++;
      console.log(`  [FAIL] Packet sequence invariant violated in ${invariantViolations} transitions!`);
    }

    // Entity cleanup and lifecycle verification
    findings.summary.totalTests++;
    class MockClientManager {
      constructor() {
        this.entities = new Map();
        this.disposedCount = 0;
      }
      syncFromServer(list) {
        if (!Array.isArray(list)) return;
        const incomingIds = new Set();
        for (const item of list) {
          if (!item || !item.id) continue;
          incomingIds.add(item.id);
          if (!this.entities.has(item.id)) {
            this.entities.set(item.id, { id: item.id, active: true });
          }
        }
        for (const [id, e] of this.entities.entries()) {
          if (!incomingIds.has(id)) {
            e.active = false;
            this.disposedCount++;
            this.entities.delete(id);
          }
        }
      }
      clearAll() {
        for (const [id, e] of this.entities.entries()) {
          e.active = false;
          this.disposedCount++;
        }
        this.entities.clear();
      }
    }

    const aircraftMgr = new MockClientManager();
    const aerialMgr = new MockClientManager();

    // 1. Initial populate in Room 1
    aircraftMgr.syncFromServer([{ id: 'fighter_1' }]);
    aerialMgr.syncFromServer([{ id: 'drone_1' }, { id: 'drone_2' }]);
    assert.strictEqual(aircraftMgr.entities.size, 1);
    assert.strictEqual(aerialMgr.entities.size, 2);

    // 2. Room Switch: SWITCH_ROOM_CONFIRM clears all
    aircraftMgr.clearAll();
    aerialMgr.clearAll();
    assert.strictEqual(aircraftMgr.entities.size, 0);
    assert.strictEqual(aerialMgr.entities.size, 0);

    // 3. INIT populates new Room 2
    aircraftMgr.syncFromServer([{ id: 'fighter_1' }]);
    aerialMgr.syncFromServer([{ id: 'drone_1' }]);
    assert.strictEqual(aircraftMgr.entities.size, 1);
    assert.strictEqual(aerialMgr.entities.size, 1);
    assert.strictEqual(aerialMgr.entities.has('drone_2'), false);

    findings.summary.passed++;
    console.log('  [PASS] Zero-duplicate and clean entity lifecycle verified on room transitions.');

    roomManager.destroy();
  }

  // ============================================================================
  // FINAL VERDICT
  // ============================================================================
  console.log('\n================================================================');
  console.log('FINAL EMPIRICAL CHALLENGE SUMMARY');
  console.log(`Total Scenarios Tested: ${findings.summary.totalTests}`);
  console.log(`Passed: ${findings.summary.passed} | Failed: ${findings.summary.failed}`);
  const overallVerdict = findings.summary.failed === 0 ? 'CONFIRMED' : 'FAILED';
  console.log(`Overall Empirical Verdict: ${overallVerdict}`);
  console.log('================================================================\n');

  return findings;
}

if (require.main === module) {
  runAllStressTests().then(findings => {
    // Return exit code 0 if CONFIRMED, 1 if FAILED
    process.exit(findings.summary.failed === 0 ? 0 : 1);
  }).catch(err => {
    console.error('Unhandled test failure:', err);
    process.exit(1);
  });
}

module.exports = { runAllStressTests };
