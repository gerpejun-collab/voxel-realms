// server/game-state.js
// In-memory authority for world state, player tracking, and block modifications

class GameState {
  constructor(seed = 48151623, maxPlayers = 30) {
    this.seed = Number(seed) || 48151623;
    this.maxPlayers = Number(maxPlayers) || 30;
    this.players = new Map(); // id -> player object
    this.blockDeltas = new Map(); // "x,y,z" -> blockType
    this.animals = new Map(); // animalId -> { id, type, x, y, z, yaw, state }
    this.animalTimers = new Map(); // animalId -> Timeout (kept off animal objects to prevent circular JSON!)
    this.nextAnimalId = 1;
    this.billboards = new Map(); // billboardId -> { id, x, y, z, rotation, photos }
    this.startTime = Date.now();
    this.dayDurationSeconds = 600; // 10 minute full day/night cycle
    this.animalTypes = ['sheep', 'pig', 'cow', 'chicken', 'wolf', 'horse'];

    this.aerialTargets = new Map(); // targetId -> { id, type, x, y, z, ... }
    this.targetRespawnTimers = new Map(); // targetId -> Timeout
    this.fighterAircraft = new Map(); // aircraftId -> { id, x, y, z, ... }
    this.aircraftRespawnTimers = new Map(); // aircraftId -> Timeout

    this.initAmbientAnimals();
    this.initAerialTargets();
    this.initFighterAircraft();
  }

  /**
   * Returns normalized day time from 0.0 (midnight) to 0.5 (noon) to 1.0 (midnight)
   * Fixed at 0.32 (perpetual bright sunny day mode) per strict user instruction.
   */
  getTimeOfDay() {
    return 0.32;
  }

  /**
   * Checks whether (wx, wz) is on a road, highway, bridge, or roundabout
   */
  isRoadAt(wx, wz) {
    const distCenter = Math.hypot(wx, wz);
    // Ring road around Central Plaza (radius 19..23)
    if (distCenter >= 18.5 && distCenter <= 23.5) return true;
    // North-South Main Highway (x in -3..3, z in -480..480) outside inner plaza
    if (Math.abs(wx) <= 3.5 && distCenter > 18 && Math.abs(wz) <= 485) return true;
    // East-West Arterial & Diagonal connectors to the 4 quadrants
    if (Math.abs(wz) <= 3.5 && distCenter > 18 && Math.abs(wx) <= 260) return true;
    // Diagonal highways to (+250,+250), (-250,+250), (+250,-250), (-250,-250)
    if (Math.abs(wx) >= 16 && Math.abs(wx) <= 245 && Math.abs(wz) >= 16 && Math.abs(wz) <= 245) {
      if (Math.abs(Math.abs(wx) - Math.abs(wz)) <= 3.5) return true;
    }
    // NYC / Shanghai / Paris / Japan internal avenues
    if (Math.hypot(wx + 250, wz + 250) <= 60 && (Math.abs((wx + 250) % 12) <= 1.5 || Math.abs((wz + 250) % 12) <= 1.5)) return true;
    return false;
  }

  /**
   * Checks whether (wx, wz) is in water, ocean, fjord gorge, or pond
   */
  isWaterZone(wx, wz, groundY = 24) {
    if (groundY <= 18) return true;
    // Norway Fjord gorge water channel
    if (wz >= 435 && wz <= 565 && Math.abs(wx) <= 10) return true;
    // Tropical Beach ocean water (south of z = -485)
    if (wz <= -485 && Math.abs(wx) <= 95) return true;
    // Japan Zen Pond & canal
    if (wx >= 236 && wx <= 246 && wz >= 248 && wz <= 256) return true;
    // Paris Reflecting Pool & Seine canal
    if (wx >= 247 && wx <= 253 && wz >= -242 && wz <= -238) return true;
    return false;
  }

  /**
   * Checks whether (wx, wz) is inside a solid monument building or rock structure
   */
  isInsideStructureOrRock(wx, wz) {
    // Central Plaza inner altar & guardian pedestals
    if (Math.hypot(wx, wz) <= 16) return true;
    // Major monument core footprints
    if (Math.hypot(wx - 250, wz - 250) <= 10) return true; // Pagoda
    if (Math.hypot(wx + 250, wz - 250) <= 12) return true; // Shanghai Tower
    if (Math.hypot(wx - 250, wz + 250) <= 10) return true; // Eiffel Tower
    if (Math.hypot(wx + 250, wz + 250) <= 12) return true; // Empire State
    // Check if a solid block delta was placed at ground level
    const b1 = this.getBlock(Math.floor(wx), 25, Math.floor(wz));
    const b2 = this.getBlock(Math.floor(wx), 26, Math.floor(wz));
    if ((b1 !== null && b1 > 0) || (b2 !== null && b2 > 0)) return true;
    return false;
  }

  /**
   * Validates if an animal is allowed to spawn at (wx, wz, groundY)
   * Never in water, never on roads, never inside rocks/buildings
   */
  isValidAnimalSpawn(wx, wz, groundY = 24) {
    if (typeof wx !== 'number' || typeof wz !== 'number' || !Number.isFinite(wx) || !Number.isFinite(wz)) return false;
    if (groundY <= 18 || groundY > 46) return false;
    if (this.isWaterZone(wx, wz, groundY)) return false;
    if (this.isRoadAt(wx, wz)) return false;
    if (this.isInsideStructureOrRock(wx, wz)) return false;
    return true;
  }

  initAmbientAnimals() {
    const seeds = [
      { type: 'sheep',   x: 28,  z: 14,  y: 25 },
      { type: 'sheep',   x: 32,  z: 18,  y: 25 },
      { type: 'cow',     x: 26,  z: -16, y: 25 },
      { type: 'cow',     x: -28, z: 16,  y: 25 },
      { type: 'pig',     x: -30, z: -14, y: 25 },
      { type: 'pig',     x: -34, z: 12,  y: 25 },
      { type: 'chicken', x: 25,  z: -28, y: 25 },
      { type: 'chicken', x: -25, z: 28,  y: 25 },
      { type: 'wolf',    x: 42,  z: 10,  y: 25 },
      { type: 'horse',   x: -40, z: -12, y: 25 },
      { type: 'sheep',   x: 226, z: 264, y: 25 },
      { type: 'horse',   x: 268, z: -232, y: 25 }
    ];

    for (const s of seeds) {
      if (this.isValidAnimalSpawn(s.x, s.z, s.y)) {
        const id = `anim_${this.nextAnimalId++}`;
        this.animals.set(id, {
          id,
          type: s.type,
          x: s.x,
          y: s.y,
          z: s.z,
          yaw: ((this.nextAnimalId * 1.37) % (Math.PI * 2)),
          state: 'idle'
        });
      }
    }
  }

  /**
   * Initializes server-synchronized heavy aerial targets (flying practice drones/missiles)
   * Clamped strictly to mid-altitude (Y: 35-60) and 50% reduced cruising speed (<= 5.0 m/s)
   * 3x enlarged hull and destroyed after receiving 90 bullet hits in the air.
   */
  initAerialTargets() {
    const targets = [
      {
        id: 'target_drone_1',
        type: 'drone_heavy',
        cx: 0,
        cz: 0,
        rx: 80,
        rz: 60,
        baseY: 45,
        ampY: 6,
        omega: 0.055, // ~3.8 m/s calm cruising speed (strictly <= 5.0 m/s)
        phase: 0,
        health: 90,
        maxHealth: 90,
        speed: 3.8,
        state: 'patrol'
      },
      {
        id: 'target_drone_2',
        type: 'drone_heavy',
        cx: -250,
        cz: 250,
        rx: 70,
        rz: 70,
        baseY: 48,
        ampY: 5,
        omega: 0.055, // 3.8 m/s calm cruising speed
        phase: Math.PI * 0.5,
        health: 90,
        maxHealth: 90,
        speed: 3.8,
        state: 'patrol'
      },
      {
        id: 'target_drone_nyc',
        type: 'drone_heavy',
        cx: -250,
        cz: -250,
        rx: 65,
        rz: 65,
        baseY: 46,
        ampY: 5,
        omega: 0.055,
        phase: Math.PI,
        health: 90,
        maxHealth: 90,
        speed: 3.8,
        state: 'patrol'
      },
      {
        id: 'target_drone_paris',
        type: 'drone_heavy',
        cx: 250,
        cz: -250,
        rx: 70,
        rz: 60,
        baseY: 47,
        ampY: 5,
        omega: 0.055,
        phase: Math.PI * 1.5,
        health: 90,
        maxHealth: 90,
        speed: 3.8,
        state: 'patrol'
      },
      {
        id: 'target_drone_japan',
        type: 'drone_heavy',
        cx: 250,
        cz: 250,
        rx: 65,
        rz: 65,
        baseY: 49,
        ampY: 5,
        omega: 0.055,
        phase: Math.PI * 0.25,
        health: 90,
        maxHealth: 90,
        speed: 3.8,
        state: 'patrol'
      },
      {
        id: 'target_drone_norway',
        type: 'drone_heavy',
        cx: 0,
        cz: 500,
        rx: 75,
        rz: 65,
        baseY: 50,
        ampY: 6,
        omega: 0.055,
        phase: Math.PI * 0.75,
        health: 90,
        maxHealth: 90,
        speed: 3.8,
        state: 'patrol'
      },
      {
        id: 'target_drone_bunker',
        type: 'drone_heavy',
        cx: -450,
        cz: 200,
        rx: 70,
        rz: 60,
        baseY: 48,
        ampY: 5,
        omega: 0.055,
        phase: Math.PI * 1.25,
        health: 90,
        maxHealth: 90,
        speed: 3.8,
        state: 'patrol'
      },
      {
        id: 'target_drone_ocean',
        type: 'drone_heavy',
        cx: 0,
        cz: -450,
        rx: 75,
        rz: 65,
        baseY: 45,
        ampY: 5,
        omega: 0.055,
        phase: Math.PI * 1.75,
        health: 90,
        maxHealth: 90,
        speed: 3.8,
        state: 'patrol'
      }
    ];

    for (const t of targets) {
      const initX = t.cx + t.rx * Math.cos(t.phase);
      const initZ = t.cz + t.rz * Math.sin(t.phase);
      const initY = Math.max(35, Math.min(60, t.baseY + t.ampY * Math.sin(0.4 * t.phase)));
      const initYaw = Math.atan2(-t.rx * Math.sin(t.phase), t.rz * Math.cos(t.phase));

      this.aerialTargets.set(t.id, {
        ...t,
        time: 0,
        x: initX,
        y: initY,
        z: initZ,
        yaw: initYaw,
        pitch: 0,
        roll: 0,
        speed: t.speed || 4.2
      });
    }
  }

  /**
   * Updates aerial targets trajectories smoothly at 50% cruising speed, strictly bounded to Y: 35-60
   */
  updateAerialTargets(dt = 0.05) {
    const delta = typeof dt === 'number' && Number.isFinite(dt) && dt > 0 ? dt : 0.05;
    for (const target of this.aerialTargets.values()) {
      if (target.state !== 'patrol') continue;
      target.time = (target.time || 0) + delta;
      const t = target.time * (target.omega || 0.06) + (target.phase || 0);
      const nextX = target.cx + target.rx * Math.cos(t);
      const nextZ = target.cz + target.rz * Math.sin(t);
      const nextY = target.baseY + target.ampY * Math.sin(0.4 * t);

      // Clamped strictly to mid-altitude (Y: 35-60)
      target.y = Math.max(35, Math.min(60, nextY));

      const dx = nextX - target.x;
      const dz = nextZ - target.z;
      if (dx !== 0 || dz !== 0) {
        target.yaw = Math.atan2(dx, dz);
      }

      target.x = nextX;
      target.z = nextZ;
    }
  }

  /**
   * Deducts damage from heavy aerial target. Base health: 90 hits.
   * Single bullet deducts 1 hit. On receiving 90 hits (health <= 0),
   * marks state = 'destroyed', returns { destroyed: true, remainingHealth: 0 },
   * and schedules authoritative 12-second respawn.
   */
  hitAerialTarget(targetId, damage = 1, shooterId = null) {
    const target = this.aerialTargets.get(targetId);
    if (!target || target.state !== 'patrol') return null;

    const dmg = typeof damage === 'number' && Number.isFinite(damage) ? damage : 1;
    target.health = Math.max(0, target.health - dmg);

    if (target.health <= 0) {
      target.state = 'destroyed';
      target.destroyedAt = Date.now();

      // Schedule authoritative respawn after 12 seconds
      if (!this.targetRespawnTimers.has(targetId)) {
        const timer = setTimeout(() => {
          this.targetRespawnTimers.delete(targetId);
          target.health = target.maxHealth;
          target.state = 'patrol';
          if (typeof this.onTargetRespawn === 'function') {
            this.onTargetRespawn(target);
          }
        }, 12000);
        this.targetRespawnTimers.set(targetId, timer);
      }

      return { destroyed: true, target, damage: dmg, remainingHealth: 0, shooterId };
    }

    return { destroyed: false, target, damage: dmg, remainingHealth: target.health, shooterId };
  }

  /**
   * Serializes aerial targets snapshot for WebSocket broadcast
   */
  getAerialTargetsSnapshot() {
    const list = [];
    for (const t of this.aerialTargets.values()) {
      list.push({
        id: t.id,
        type: t.type || 'drone_heavy',
        x: Math.round(t.x * 100) / 100,
        y: Math.round(t.y * 100) / 100,
        z: Math.round(t.z * 100) / 100,
        yaw: Math.round((t.yaw || 0) * 100) / 100,
        pitch: Math.round((t.pitch || 0) * 100) / 100,
        roll: Math.round((t.roll || 0) * 100) / 100,
        speed: t.speed || 3.8,
        health: t.health,
        maxHealth: t.maxHealth || 90,
        state: t.state || 'patrol'
      });
    }
    return list;
  }

  /**
   * Generates smooth closed-loop patrol waypoints centered around (cx, cz)
   */
  generateAircraftSectorWaypoints(cx, cz, baseY = 72, radius = 90) {
    const pts = [];
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const wave = Math.sin(angle * 2) * 5;
      const y = Math.max(50, Math.min(105, baseY + wave));
      const r = radius * (1 + 0.12 * Math.sin(angle * 3));
      pts.push({
        x: Math.round(cx + Math.cos(angle) * r),
        y: Math.round(y * 10) / 10,
        z: Math.round(cz + Math.sin(angle) * r)
      });
    }
    return pts;
  }

  /**
   * Initializes server-synchronized acrobatic fighter aircraft across ALL world sectors
   * Operating at 50% increased cruising speed (39.0 m/s, sprint 61.5 m/s) with 2x model size,
   * high model variety across sectors, and internal bullet hit counters (15 hits to destroy).
   */
  initFighterAircraft() {
    const sectorConfigs = [
      { id: 'fighter_1', variant: 'stealth_raptor', cx: 0, cz: 0, baseY: 72, radius: 95, phase: 0 },
      { id: 'fighter_shanghai', variant: 'cyber_phantom', cx: -250, cz: 250, baseY: 78, radius: 85, phase: 0.25 },
      { id: 'fighter_nyc', variant: 'delta_mirage', cx: -250, cz: -250, baseY: 76, radius: 85, phase: 0.5 },
      { id: 'fighter_paris', variant: 'euro_canard', cx: 250, cz: -250, baseY: 76, radius: 85, phase: 0.75 },
      { id: 'fighter_japan', variant: 'forward_swept', cx: 250, cz: 250, baseY: 78, radius: 85, phase: 0.125 },
      { id: 'fighter_norway', variant: 'arctic_ghost', cx: 0, cz: 500, baseY: 84, radius: 95, phase: 0.375 },
      { id: 'fighter_bunker', variant: 'heavy_fortress', cx: -450, cz: 200, baseY: 88, radius: 90, phase: 0.625 },
      { id: 'fighter_ocean', variant: 'naval_corsair', cx: 0, cz: -450, baseY: 70, radius: 95, phase: 0.875 }
    ];

    for (const cfg of sectorConfigs) {
      const waypoints = this.generateAircraftSectorWaypoints(cfg.cx, cfg.cz, cfg.baseY, cfg.radius);
      const segmentDistances = [];
      let totalLength = 0;
      for (let i = 0; i < waypoints.length; i++) {
        const nextIdx = (i + 1) % waypoints.length;
        const dx = waypoints[nextIdx].x - waypoints[i].x;
        const dy = waypoints[nextIdx].y - waypoints[i].y;
        const dz = waypoints[nextIdx].z - waypoints[i].z;
        const dist = Math.hypot(dx, dy, dz);
        segmentDistances.push(dist);
        totalLength += dist;
      }

      const plane = {
        id: cfg.id,
        variant: cfg.variant || 'stealth_raptor',
        speed: 39.0, // 50% increased cruising speed (39.0 m/s base)
        baseSpeed: 39.0,
        sprintSpeed: 61.5,
        hitCount: 0,
        maxHits: 15,
        state: 'patrol',
        waypoints,
        segmentDistances,
        totalLength,
        pathDistance: (cfg.phase || 0) * totalLength,
        x: waypoints[0].x,
        y: waypoints[0].y,
        z: waypoints[0].z,
        yaw: 0,
        pitch: 0,
        roll: 0,
        bankRoll: 0,
        baseYaw: 0,
        evasionManeuver: null,
        evasionStartTime: 0,
        evasionDuration: 0,
        evasionDirection: 1,
        evasionProgress: 0
      };

      this.fighterAircraft.set(plane.id, plane);
    }
  }

  /**
   * Evaluates Centripetal Catmull-Rom spline at distance `s` along closed loop
   */
  evaluateCatmullRom(waypoints, segmentDistances, totalLength, s) {
    const N = waypoints.length;
    let dist = ((s % totalLength) + totalLength) % totalLength;

    let segIdx = 0;
    let accum = 0;
    while (segIdx < N - 1 && accum + segmentDistances[segIdx] <= dist) {
      accum += segmentDistances[segIdx];
      segIdx++;
    }

    const segLen = Math.max(0.001, segmentDistances[segIdx]);
    const u = Math.max(0, Math.min(1, (dist - accum) / segLen));

    const p0 = waypoints[(segIdx - 1 + N) % N];
    const p1 = waypoints[segIdx];
    const p2 = waypoints[(segIdx + 1) % N];
    const p3 = waypoints[(segIdx + 2) % N];

    // Centripetal Catmull-Rom formulation
    const evalCoord = (c) => {
      const v0 = (p2[c] - p0[c]) * 0.5;
      const v1 = (p3[c] - p1[c]) * 0.5;
      const u2 = u * u;
      const u3 = u2 * u;
      return (2 * p1[c] - 2 * p2[c] + v0 + v1) * u3 +
             (-3 * p1[c] + 3 * p2[c] - 2 * v0 - v1) * u2 +
             v0 * u + p1[c];
    };

    const evalDeriv = (c) => {
      const v0 = (p2[c] - p0[c]) * 0.5;
      const v1 = (p3[c] - p1[c]) * 0.5;
      const u2 = u * u;
      return 3 * (2 * p1[c] - 2 * p2[c] + v0 + v1) * u2 +
             2 * (-3 * p1[c] + 3 * p2[c] - 2 * v0 - v1) * u +
             v0;
    };

    const posX = evalCoord('x');
    const posY = evalCoord('y');
    const posZ = evalCoord('z');

    const dirX = evalDeriv('x');
    const dirY = evalDeriv('y');
    const dirZ = evalDeriv('z');

    return { posX, posY, posZ, dirX, dirY, dirZ };
  }

  /**
   * Advances smooth Centripetal Catmull-Rom spline trajectory with roll banking and quintic evasion
   */
  updateFighterAircraft(dt = 0.05) {
    const delta = typeof dt === 'number' && Number.isFinite(dt) && dt > 0 ? dt : 0.05;
    const now = Date.now();

    for (const aircraft of this.fighterAircraft.values()) {
      if (aircraft.state === 'destroyed') continue;

      // 1. Advance distance along spline (39.0 m/s cruise, 61.5 m/s sprint)
      const currentSpeed = aircraft.state === 'evading' ? (aircraft.sprintSpeed || 61.5) : (aircraft.baseSpeed || 39.0);
      aircraft.speed = currentSpeed;
      aircraft.pathDistance = (aircraft.pathDistance + currentSpeed * delta) % aircraft.totalLength;

      // 2. Evaluate base position and tangent from Centripetal Catmull-Rom spline
      const spline = this.evaluateCatmullRom(
        aircraft.waypoints,
        aircraft.segmentDistances,
        aircraft.totalLength,
        aircraft.pathDistance
      );

      const tanLen = Math.max(0.0001, Math.hypot(spline.dirX, spline.dirY, spline.dirZ));
      const tx = spline.dirX / tanLen;
      const ty = spline.dirY / tanLen;
      const tz = spline.dirZ / tanLen;

      const baseYaw = Math.atan2(tx, tz);
      const basePitch = Math.asin(Math.max(-1, Math.min(1, ty)));

      // Horizontal turn rate (for coordinated roll banking: tan(phi) = v^2 * kappa / g)
      const prevBaseYaw = typeof aircraft.baseYaw === 'number' ? aircraft.baseYaw : (aircraft.yaw || 0);
      let yawDiff = baseYaw - prevBaseYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const yawRate = yawDiff / delta;
      aircraft.baseYaw = baseYaw;

      const targetBank = Math.max(-1.13, Math.min(1.13, Math.atan((currentSpeed * yawRate) / 9.81)));
      aircraft.bankRoll = (aircraft.bankRoll || 0) + (targetBank - (aircraft.bankRoll || 0)) * Math.min(1.0, delta * 4.5);
      const baseRoll = aircraft.bankRoll;

      // 3. Evasive Maneuver Calculation with Quintic Smoothstep Blending
      let offsetPosX = 0;
      let offsetPosY = 0;
      let offsetPosZ = 0;
      let offsetYaw = 0;
      let offsetPitch = 0;
      let offsetRoll = 0;

      if (aircraft.state === 'evading') {
        const elapsed = (now - aircraft.evasionStartTime) / 1000;
        const duration = Math.max(0.1, aircraft.evasionDuration || 2.0);
        const tau = Math.max(0, Math.min(1, elapsed / duration));
        aircraft.evasionProgress = tau;

        if (tau >= 1.0) {
          // Evasion maneuver completed cleanly
          aircraft.state = 'patrol';
          aircraft.evasionManeuver = null;
          aircraft.speed = aircraft.baseSpeed || 39.0;
        } else {
          // Quintic smoothstep S(tau) = 6*tau^5 - 15*tau^4 + 10*tau^3
          const tau2 = tau * tau;
          const tau3 = tau2 * tau;
          const tau4 = tau3 * tau;
          const tau5 = tau4 * tau;
          const S = 6 * tau5 - 15 * tau4 + 10 * tau3;

          // Symmetric quintic bell window W(tau) where W(0)=0, W(0.5)=1, W(1)=0, and W'(0)=W'(1)=0
          const subTau = tau < 0.5 ? 2 * tau : 2 * (1 - tau);
          const st2 = subTau * subTau;
          const st3 = st2 * subTau;
          const st4 = st3 * subTau;
          const st5 = st4 * subTau;
          const W = 6 * st5 - 15 * st4 + 10 * st3;

          const dir = aircraft.evasionDirection || 1;
          const maneuver = aircraft.evasionManeuver || 'barrel_roll';

          // Lateral (right) unit vector in horizontal plane: normal to forward vector
          const rx = tz;
          const rz = -tx;

          if (maneuver === 'barrel_roll') {
            // 360-degree helical roll
            offsetRoll = dir * Math.PI * 2 * S;
            const helixR = 4.5;
            offsetPosY = W * helixR * (1 - Math.cos(Math.PI * 2 * tau));
            offsetPosX = W * helixR * Math.sin(Math.PI * 2 * tau) * rx;
            offsetPosZ = W * helixR * Math.sin(Math.PI * 2 * tau) * rz;
          } else if (maneuver === 'break_turn') {
            // High-G knife-edge break away
            offsetRoll = dir * 1.39 * W; // ~80 degrees bank
            offsetYaw = dir * 1.13 * W;  // ~65 degrees heading break windowed with W(tau)
            offsetPosX = W * 16.0 * dir * rx;
            offsetPosZ = W * 16.0 * dir * rz;
            offsetPosY = W * 3.5;
          } else if (maneuver === 'zoom_climb') {
            // Vertical pitch-up zoom climb
            offsetPitch = 0.96 * W; // ~55 degrees pitch up
            offsetPosY = W * 24.0;  // steep climb
            if (tau > 0.5) {
              const recTau = (tau - 0.5) * 2; // [0, 1]
              const rt2 = recTau * recTau;
              const rt3 = rt2 * recTau;
              const rt4 = rt3 * recTau;
              const rt5 = rt4 * recTau;
              const recS = 6 * rt5 - 15 * rt4 + 10 * rt3;
              offsetRoll = dir * Math.PI * 2 * recS; // continuous smoothstep inverted recovery
            }
          } else if (maneuver === 'spiraling_scissors') {
            // Decaying oscillatory weaving jink
            const freq = 1.4;
            const wave = Math.sin(Math.PI * 2 * freq * tau * duration);
            const cosWave = Math.cos(Math.PI * 2 * freq * tau * duration);
            offsetRoll = dir * 1.13 * wave * W;
            offsetPosY = W * 5.0 * cosWave;
            offsetPosX = W * 5.0 * wave * rx;
            offsetPosZ = W * 5.0 * wave * rz;
          }
        }
      }

      // 4. Update aircraft transforms with altitude clamping strictly between Y: 45 and Y: 110
      aircraft.x = spline.posX + offsetPosX;
      aircraft.y = Math.max(45, Math.min(110, spline.posY + offsetPosY));
      aircraft.z = spline.posZ + offsetPosZ;
      aircraft.yaw = baseYaw + offsetYaw;
      aircraft.pitch = basePitch + offsetPitch;
      aircraft.roll = baseRoll + offsetRoll;
    }
  }

  /**
   * Triggers evasive maneuver for fighter aircraft under weapon burst fire
   * Supported maneuvers: 'barrel_roll', 'break_turn', 'zoom_climb', 'spiraling_scissors'
   */
  triggerAircraftEvasion(aircraftId, threatSource = null) {
    let aircraft = this.fighterAircraft.get(aircraftId);
    if (!aircraft && this.fighterAircraft.size > 0) {
      aircraft = this.fighterAircraft.values().next().value;
    }
    if (!aircraft || aircraft.state === 'destroyed') return null;

    // Guard against burst fire retriggering: if aircraft is already actively evading,
    // do not interrupt or reset evasionStartTime to prevent mid-air teleportation
    if (aircraft.state === 'evading') {
      const elapsed = (Date.now() - (aircraft.evasionStartTime || 0)) / 1000;
      const duration = Math.max(0.1, aircraft.evasionDuration || 2.0);
      const tau = elapsed / duration;
      const progress = typeof aircraft.evasionProgress === 'number' ? aircraft.evasionProgress : tau;
      if (progress < 0.9 || tau < 0.9) {
        return null;
      }
    }

    // Determine maneuver based on incoming threat or cycle
    const maneuvers = ['barrel_roll', 'break_turn', 'zoom_climb', 'spiraling_scissors'];
    let chosenManeuver = null;

    if (threatSource && typeof threatSource === 'object') {
      if (threatSource.weaponType === 'bazooka') {
        chosenManeuver = 'break_turn';
      } else if (threatSource.weaponType === 'plasma') {
        chosenManeuver = 'barrel_roll';
      } else if (threatSource.weaponType === 'sniper' || threatSource.weaponType === 'rifle') {
        chosenManeuver = 'spiraling_scissors';
      }
    } else if (typeof threatSource === 'string' && maneuvers.includes(threatSource)) {
      chosenManeuver = threatSource;
    }

    if (!chosenManeuver) {
      chosenManeuver = maneuvers[Math.floor(Math.random() * maneuvers.length)];
    }

    const durationTable = {
      barrel_roll: 1.8,
      break_turn: 2.4,
      zoom_climb: 3.2,
      spiraling_scissors: 2.8
    };

    const duration = durationTable[chosenManeuver] || 2.2;
    const direction = (Math.random() > 0.5 ? 1 : -1);

    aircraft.state = 'evading';
    aircraft.evasionManeuver = chosenManeuver;
    aircraft.evasionStartTime = Date.now();
    aircraft.evasionDuration = duration;
    aircraft.evasionDirection = direction;
    aircraft.evasionProgress = 0;
    aircraft.speed = aircraft.sprintSpeed || 61.5;

    return {
      aircraftId: aircraft.id,
      maneuver: chosenManeuver,
      startTime: aircraft.evasionStartTime,
      duration,
      direction
    };
  }

  /**
   * Registers a bullet hit against fighter aircraft.
   * Increments internal hit counter. When hitCount reaches maxHits (15 hits),
   * aircraft is destroyed, enters 'destroyed' state, and schedules 12s respawn.
   */
  hitFighterAircraft(aircraftId, damage = 1, shooterId = null) {
    let aircraft = this.fighterAircraft.get(aircraftId);
    if (!aircraft && this.fighterAircraft.size > 0) {
      aircraft = this.fighterAircraft.values().next().value;
    }
    if (!aircraft || aircraft.state === 'destroyed') return null;

    const dmg = typeof damage === 'number' && Number.isFinite(damage) ? damage : 1;
    aircraft.hitCount = (aircraft.hitCount || 0) + dmg;
    const maxHits = aircraft.maxHits || 15;

    if (aircraft.hitCount >= maxHits) {
      aircraft.state = 'destroyed';
      aircraft.destroyedAt = Date.now();

      // Schedule authoritative respawn after 12 seconds
      if (!this.aircraftRespawnTimers.has(aircraft.id)) {
        const timer = setTimeout(() => {
          this.aircraftRespawnTimers.delete(aircraft.id);
          aircraft.hitCount = 0;
          aircraft.state = 'patrol';
          aircraft.evasionManeuver = null;
          aircraft.speed = aircraft.baseSpeed || 39.0;
          if (typeof this.onAircraftRespawn === 'function') {
            this.onAircraftRespawn(aircraft);
          }
        }, 12000);
        this.aircraftRespawnTimers.set(aircraft.id, timer);
      }

      return {
        destroyed: true,
        aircraft,
        damage: dmg,
        hitCount: aircraft.hitCount,
        maxHits,
        remainingHits: 0,
        shooterId
      };
    }

    return {
      destroyed: false,
      aircraft,
      damage: dmg,
      hitCount: aircraft.hitCount,
      maxHits,
      remainingHits: Math.max(0, maxHits - aircraft.hitCount),
      shooterId
    };
  }

  /**
   * Serializes fighter aircraft snapshot for WebSocket broadcast
   */
  getAircraftSnapshot() {
    const list = [];
    for (const a of this.fighterAircraft.values()) {
      list.push({
        id: a.id,
        variant: a.variant || 'stealth_raptor',
        type: a.variant || 'stealth_raptor',
        x: Math.round(a.x * 100) / 100,
        y: Math.round(a.y * 100) / 100,
        z: Math.round(a.z * 100) / 100,
        yaw: Math.round((a.yaw || 0) * 100) / 100,
        pitch: Math.round((a.pitch || 0) * 100) / 100,
        roll: Math.round((a.roll || 0) * 100) / 100,
        speed: Math.round((a.speed || 39.0) * 10) / 10,
        baseSpeed: a.baseSpeed || 39.0,
        sprintSpeed: a.sprintSpeed || 61.5,
        state: a.state || 'patrol',
        hitCount: a.hitCount || 0,
        maxHits: a.maxHits || 15,
        evasionManeuver: a.evasionManeuver || null,
        evasionStartTime: a.evasionStartTime || 0,
        evasionDuration: a.evasionDuration || 0,
        evasionProgress: Math.round((a.evasionProgress || 0) * 100) / 100,
        pos: [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100, Math.round(a.z * 100) / 100],
        rot: [Math.round((a.yaw || 0) * 100) / 100, Math.round((a.pitch || 0) * 100) / 100, Math.round((a.roll || 0) * 100) / 100]
      });
    }
    return list;
  }

  addPlayer(id, name, options = {}) {
    // Generate safe unique name if duplicate
    let finalName = name;
    const existingNames = new Set(Array.from(this.players.values()).map(p => p.name.toLowerCase()));
    let counter = 1;
    while (existingNames.has(finalName.toLowerCase())) {
      finalName = `${name}_${counter++}`;
    }

    const player = {
      id,
      name: finalName,
      pos: [0, 25, 0], // Default spawn point at central plaza
      rot: [0, 0],     // [yaw, pitch]
      action: (options && options.action) ? options.action : 'idle',
      isFlying: Boolean(options && options.isFlying),
      weaponsEnabled: true,
      isAdmin: false,
      joinedAt: Date.now(),
      lastUpdate: Date.now()
    };

    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    this.players.delete(id);
    return player;
  }

  getPlayer(id) {
    return this.players.get(id);
  }

  updatePlayer(id, data) {
    const player = this.players.get(id);
    if (!player) return null;

    if (data.pos) {
      player.pos[0] = data.pos[0];
      player.pos[1] = data.pos[1];
      player.pos[2] = data.pos[2];
    }
    if (data.rot) {
      player.rot[0] = data.rot[0];
      player.rot[1] = data.rot[1];
    }
    if (data.action) {
      player.action = data.action;
    }
    if (typeof data.isFlying === 'boolean') {
      player.isFlying = data.isFlying;
    }
    if (typeof data.weaponsEnabled === 'boolean') {
      player.weaponsEnabled = data.weaponsEnabled;
    }
    player.lastUpdate = Date.now();
    return player;
  }

  /**
   * Toggle weapons mode for a player and reconcile shared area animal density without duplication
   */
  setPlayerWeaponsMode(playerId, enabled) {
    const player = this.players.get(playerId);
    if (!player) return null;
    player.weaponsEnabled = !!enabled;
    this.reconcileAreaAnimals();
    return player;
  }

  /**
   * Ensures armed players have higher nearby animal probability on valid land
   * while guaranteeing NO duplication if another player is within the same area range (45 blocks)
   */
  reconcileAreaAnimals() {
    const AREA_RADIUS = 45;
    const BASE_AREA_CAP = 5;
    const ARMED_AREA_CAP = 9;

    const visitedPlayers = new Set();
    const clusters = [];

    for (const p of this.players.values()) {
      if (visitedPlayers.has(p.id)) continue;
      visitedPlayers.add(p.id);

      const clusterPlayers = [p];
      let sumX = p.pos[0];
      let sumY = p.pos[1];
      let sumZ = p.pos[2];
      let anyArmed = !!p.weaponsEnabled;

      for (const other of this.players.values()) {
        if (visitedPlayers.has(other.id)) continue;
        const dist = Math.hypot(other.pos[0] - p.pos[0], other.pos[2] - p.pos[2]);
        if (dist <= AREA_RADIUS) {
          visitedPlayers.add(other.id);
          clusterPlayers.push(other);
          sumX += other.pos[0];
          sumY += other.pos[1];
          sumZ += other.pos[2];
          if (other.weaponsEnabled) anyArmed = true;
        }
      }

      clusters.push({
        cx: sumX / clusterPlayers.length,
        cy: sumY / clusterPlayers.length,
        cz: sumZ / clusterPlayers.length,
        anyArmed,
        players: clusterPlayers
      });
    }

    const spawnedAnimals = [];

    for (const cluster of clusters) {
      // If cluster center itself is underwater, do not spawn extra animals around swimmer
      if (this.isWaterZone(cluster.cx, cluster.cz, cluster.cy)) {
        continue;
      }

      const targetCap = cluster.anyArmed ? ARMED_AREA_CAP : BASE_AREA_CAP;

      // Count how many animals already exist within AREA_RADIUS of this cluster
      let existingInArea = 0;
      for (const anim of this.animals.values()) {
        if (Math.hypot(anim.x - cluster.cx, anim.z - cluster.cz) <= AREA_RADIUS) {
          existingInArea++;
        }
      }

      const needed = Math.max(0, targetCap - existingInArea);
      let attempts = 0;
      let added = 0;

      while (added < needed && attempts < 36) {
        attempts++;
        const angle = ((this.nextAnimalId * 2.39996) + attempts * 0.785) % (Math.PI * 2);
        const dist = 16 + ((this.nextAnimalId * 7 + attempts * 5) % 24); // Ring 16..40 blocks away (never under feet)
        const sx = Math.round(cluster.cx + Math.cos(angle) * dist);
        const sz = Math.round(cluster.cz + Math.sin(angle) * dist);
        const sy = 25;

        if (!this.isValidAnimalSpawn(sx, sz, sy)) continue;

        // Ensure not too close to existing animals
        let tooClose = false;
        for (const anim of this.animals.values()) {
          if (Math.hypot(anim.x - sx, anim.z - sz) < 4.0) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;

        const id = `anim_${this.nextAnimalId++}`;
        const type = this.animalTypes[this.nextAnimalId % this.animalTypes.length];
        const newAnim = {
          id,
          type,
          x: sx,
          y: sy,
          z: sz,
          yaw: Math.round(angle * 100) / 100,
          state: 'walking'
        };
        this.animals.set(id, newAnim);
        spawnedAnimals.push(newAnim);
        added++;
      }
    }

    return spawnedAnimals;
  }

  /**
   * Burst/destroy an animal when hit by weapon or TNT
   */
  damageAnimal(animalId, damage = 10, shooterId = null) {
    return this.hitAnimal(animalId, shooterId);
  }

  hitAnimal(animalId, shooterId = null) {
    const anim = this.animals.get(animalId);
    if (!anim) {
      return {
        animalId,
        shooterId
      };
    }
    // Mark animal as dying with 3-second despawn delay
    anim.state = 'dying';
    anim.despawnAt = Date.now() + 3000;
    anim.shooterId = shooterId;

    if (!this.animalTimers.has(animalId)) {
      const timer = setTimeout(() => {
        this.animalTimers.delete(animalId);
        this.animals.delete(animalId);
        this.reconcileAreaAnimals();
      }, 3000);
      this.animalTimers.set(animalId, timer);
    }

    return {
      animalId: anim.id,
      type: anim.type,
      x: anim.x,
      y: anim.y,
      z: anim.z,
      shooterId
    };
  }

  /**
   * Detonate a reactive TNT at (x, y, z), destroying blocks in radius and bursting nearby animals
   */
  detonateTnt(x, y, z, radius = 3) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rz = Math.round(z);
    const destroyedBlocks = [];

    // Clear the TNT block itself and surrounding blocks above bedrock (y >= 19)
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dy * dy + dz * dz <= radius * radius) {
            const bx = rx + dx;
            const by = ry + dy;
            const bz = rz + dz;
            if (by >= 1 && by < 120) {
              const key = `${bx},${by},${bz}`;
              this.blockDeltas.set(key, 0);
              destroyedBlocks.push([bx, by, bz]);
            }
          }
        }
      }
    }

    // Adjust any players standing on destroyed blocks
    for (const p of this.players.values()) {
      if (p.isFlying || p.action === 'flying') continue;
      const px = p.pos[0];
      const py = p.pos[1];
      const pz = p.pos[2];
      const pMinX = px - 0.3, pMaxX = px + 0.3;
      const pMinZ = pz - 0.3, pMaxZ = pz + 0.3;
      for (const [bx, by, bz] of destroyedBlocks) {
        if (bx + 1 > pMinX && bx < pMaxX && bz + 1 > pMinZ && bz < pMaxZ) {
          if (Math.abs(py - (by + 1)) < 0.25) {
            let newFloorY = by;
            while (newFloorY > 0 && this.getBlock(bx, newFloorY - 1, bz) === 0) {
              newFloorY--;
            }
            p.pos[1] = newFloorY;
            p.lastUpdate = Date.now();
            break;
          }
        }
      }
    }

    // Burst any animals within blast radius (radius + 3)
    const hitAnimals = [];
    const blastRange = radius + 3.5;
    for (const [id, anim] of this.animals.entries()) {
      const dist = Math.hypot(anim.x - rx, (anim.y || 25) - ry, anim.z - rz);
      if (dist <= blastRange) {
        if (this.animalTimers.has(id)) {
          clearTimeout(this.animalTimers.get(id));
          this.animalTimers.delete(id);
        }
        hitAnimals.push({
          id: anim.id,
          type: anim.type,
          x: anim.x,
          y: anim.y,
          z: anim.z,
          yaw: anim.yaw,
          state: 'dying'
        });
        this.animals.delete(id);
      }
    }

    if (hitAnimals.length > 0) {
      this.reconcileAreaAnimals();
    }

    return {
      x: rx,
      y: ry,
      z: rz,
      radius,
      destroyedBlocks,
      hitAnimalIds: hitAnimals.map(a => a.id),
      hitAnimals
    };
  }

  getAnimalsSnapshot() {
    const list = [];
    for (const anim of this.animals.values()) {
      const isDead = anim.state === 'dying' || anim.state === 'dead';
      const isKnockedDown = anim.state === 'dying' || anim.state === 'knockdown';
      list.push({
        id: anim.id,
        type: anim.type,
        x: anim.x,
        y: anim.y,
        z: anim.z,
        pos: [anim.x, anim.y, anim.z],
        yaw: typeof anim.yaw === 'number' ? anim.yaw : 0,
        health: isDead ? 0 : 10,
        isDead: Boolean(isDead),
        isKnockedDown: Boolean(isKnockedDown),
        state: anim.state || 'idle',
        despawnAt: anim.despawnAt || undefined,
        shooterId: anim.shooterId || undefined
      });
    }
    return list;
  }

  /**
   * Reset all block modifications and restore initial world state (admin action)
   */
  resetWorld() {
    this.blockDeltas.clear();
    this.blockDeltas = new Map();
    for (const timer of this.animalTimers.values()) {
      clearTimeout(timer);
    }
    this.animalTimers.clear();
    this.animals.clear();
    this.billboards.clear();
    this.nextAnimalId = 1;
    this.initAmbientAnimals();

    for (const timer of this.targetRespawnTimers.values()) {
      clearTimeout(timer);
    }
    this.targetRespawnTimers.clear();
    this.aerialTargets.clear();
    this.initAerialTargets();

    for (const timer of this.aircraftRespawnTimers.values()) {
      clearTimeout(timer);
    }
    this.aircraftRespawnTimers.clear();
    this.fighterAircraft.clear();
    this.initFighterAircraft();
  }

  spawnAnimal(type, x, y, z) {
    const id = `anim_${this.nextAnimalId++}`;
    const anim = {
      id,
      type: type || 'sheep',
      x: Math.round(Number(x) * 100) / 100,
      y: Math.round(Number(y) * 100) / 100,
      z: Math.round(Number(z) * 100) / 100,
      yaw: (Math.random() * Math.PI * 2),
      state: 'walk'
    };
    this.animals.set(id, anim);
    return anim;
  }

  addBillboard(data) {
    if (!data) return null;
    const id = data.id || `bb_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const billboard = {
      id,
      x: Number(data.x) || 0,
      y: Number(data.y) || 25,
      z: Number(data.z) || 0,
      rotation: Number(data.rotation) || 0,
      photos: Array.isArray(data.photos) ? data.photos.slice(0, 10) : [],
      createdAt: Date.now()
    };
    this.billboards.set(id, billboard);
    return billboard;
  }

  removeBillboard(id) {
    if (!id || !this.billboards.has(id)) return false;
    this.billboards.delete(id);
    return true;
  }

  getBillboardsSnapshot() {
    return Array.from(this.billboards.values());
  }

  /**
   * Apply a block modification if valid.
   * Player must be within reach distance (max 10 blocks, or extended for TNT/admin) of target.
   */
  modifyBlock(playerId, x, y, z, blockType) {
    const player = this.players.get(playerId);
    if (player) {
      const dx = player.pos[0] - (x + 0.5);
      const dy = player.pos[1] - (y + 0.5);
      const dz = player.pos[2] - (z + 0.5);
      const distSq = dx * dx + dy * dy + dz * dz;
      // Allow up to 100 blocks distance for standard blocks, or up to 1000 blocks for TNT (blockType 19) / admin
      const maxDistSq = (blockType === 19 || player.isAdmin) ? (1000 * 1000) : (100 * 100);
      if (distSq > maxDistSq) {
        return { success: false, reason: 'Out of reach' };
      }

      // Check if placing a block inside any player's bounding box
      if (blockType > 0) {
        for (const p of this.players.values()) {
          const px = p.pos[0];
          const py = p.pos[1];
          const pz = p.pos[2];
          const pMinX = px - 0.3, pMaxX = px + 0.3;
          const pMinY = py, pMaxY = py + 1.8;
          const pMinZ = pz - 0.3, pMaxZ = pz + 0.3;

          const bMinX = x, bMaxX = x + 1;
          const bMinY = y, bMaxY = y + 1;
          const bMinZ = z, bMaxZ = z + 1;

          const intersects = (pMinX < bMaxX && pMaxX > bMinX) &&
                             (pMinY < bMaxY && pMaxY > bMinY) &&
                             (pMinZ < bMaxZ && pMaxZ > bMinZ);
          if (intersects) {
            return { success: false, reason: 'Cannot place block inside player' };
          }
        }
      }
    }

    const key = `${x},${y},${z}`;
    this.blockDeltas.set(key, blockType);

    // If a block beneath any player is broken, adjust their authoritative ground Y position
    const affectedPlayers = [];
    if (blockType === 0) {
      for (const p of this.players.values()) {
        if (p.isFlying || p.action === 'flying') continue;
        const px = p.pos[0];
        const py = p.pos[1];
        const pz = p.pos[2];
        const pMinX = px - 0.3, pMaxX = px + 0.3;
        const pMinZ = pz - 0.3, pMaxZ = pz + 0.3;
        // Check horizontal overlap with excavated block
        if (x + 1 > pMinX && x < pMaxX && z + 1 > pMinZ && z < pMaxZ) {
          // If player's feet were resting on this block (y + 1)
          if (Math.abs(py - (y + 1)) < 0.25) {
            let newFloorY = y;
            while (newFloorY > 0 && this.getBlock(x, newFloorY - 1, z) === 0) {
              newFloorY--;
            }
            p.pos[1] = newFloorY;
            p.lastUpdate = Date.now();
            affectedPlayers.push({ id: p.id, pos: [...p.pos] });
          }
        }
      }
    }

    return {
      success: true,
      delta: { x, y, z, blockType, playerId, affectedPlayers }
    };
  }

  /**
   * Get delta block at coordinate if present
   */
  getBlock(x, y, z) {
    const key = `${x},${y},${z}`;
    return this.blockDeltas.has(key) ? this.blockDeltas.get(key) : null;
  }

  /**
   * Snapshot for a newly connecting client
   */
  getInitialState(forPlayerId) {
    const playerList = [];
    for (const [id, p] of this.players.entries()) {
      if (id !== forPlayerId) {
        playerList.push({
          id: p.id,
          name: p.name,
          pos: p.pos,
          rot: p.rot,
          action: p.action,
          isFlying: Boolean(p.isFlying),
          weaponsEnabled: !!p.weaponsEnabled,
          joinedAt: p.joinedAt || Date.now()
        });
      }
    }

    // Convert block deltas map to array of [x, y, z, type]
    const deltas = [];
    for (const [key, type] of this.blockDeltas.entries()) {
      const [x, y, z] = key.split(',').map(Number);
      deltas.push([x, y, z, type]);
    }

    return {
      seed: this.seed,
      players: playerList,
      deltas: deltas,
      animals: this.getAnimalsSnapshot(),
      billboards: this.getBillboardsSnapshot(),
      aerialTargets: this.getAerialTargetsSnapshot(),
      fighterAircraft: this.getAircraftSnapshot(),
      aircraft: this.getAircraftSnapshot(),
      timeOfDay: this.getTimeOfDay()
    };
  }

  /**
   * Broadcast payload of all player positions
   */
  getPlayersSnapshot() {
    const list = [];
    for (const [id, p] of this.players.entries()) {
      const rx = Math.round(p.pos[0] * 100) / 100;
      const ry = Math.round(p.pos[1] * 100) / 100;
      const rz = Math.round(p.pos[2] * 100) / 100;
      list.push({
        id: p.id,
        name: p.name,
        pos: [rx, ry, rz],
        x: rx,
        y: ry,
        z: rz,
        rot: [
          Math.round(p.rot[0] * 100) / 100,
          Math.round(p.rot[1] * 100) / 100
        ],
        action: p.action,
        isFlying: Boolean(p.isFlying),
        weaponsEnabled: !!p.weaponsEnabled,
        isAdmin: !!p.isAdmin,
        joinedAt: p.joinedAt || Date.now()
      });
    }
    return list;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameState };
}

