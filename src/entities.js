import { AIRCRAFT_TYPES, THREAT_TYPES, ARRIVAL_THRESHOLD, ID_RANGE, ID_TIME, CIVILIAN_TYPES,
  MISSILE_TYPES, PK_TARGET_MODIFIERS, DAMAGE_DESTROY_CHANCE, MISSILE_ARRIVAL_DIST,
  TANKER_REFUEL_RANGE, TANKER_REFUEL_RATE, TANKER_REFUEL_TARGET,
  DATA_LINK_RANGE, FIGHTER_ORBIT_RATE, MIDCOURSE_LOST_PK_MOD } from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';

// ═══════════════════════════════════════════
// CITY
// ═══════════════════════════════════════════

export function createCity(name, x, y) {
  return { name, x, y, hp: 1 };
}

// ═══════════════════════════════════════════
// BASE
// ═══════════════════════════════════════════

export function createBase(name, x, y, roster) {
  const base = { id: name, name, x, y, interceptors: [] };

  for (const type of roster) {
    const interceptor = createInterceptor(base, type);
    base.interceptors.push(interceptor);
    state.interceptors.push(interceptor);
  }

  return base;
}

// ═══════════════════════════════════════════
// INTERCEPTOR
// ═══════════════════════════════════════════

// States: READY, AIRBORNE, CAP, RTB, ID_MISSION, REFUELING, CRASHED
export function createInterceptor(base, typeName) {
  const num = state.nextInterceptorNum++;
  const spec = AIRCRAFT_TYPES[typeName];

  return {
    id: `${spec.callsign}-${num}`,
    type: typeName,
    spec,
    x: base.x,
    y: base.y,
    speed: spec.speed,
    heading: 0,          // current facing direction (radians, nm space)
    state: 'READY',
    base,
    target: null,        // assigned contact for engagement
    capPoint: null,      // { x, y } for CAP orbit
    idTarget: null,      // contact being identified (ID_MISSION)
    idProgress: 0,       // game-seconds spent identifying
    fuel: spec.fuelCapacity,
    fuelMax: spec.fuelCapacity,
    weapons: spec.weapons,
    bingo: false,
    sorties: 0,          // completed sorties (max = spec.maxSorties)
    turnaroundUntil: 0,  // gameTime (ms) when turnaround completes
    // Tanker diversion state
    refuelTanker: null,       // reference to tanker being refueled from
    preDivertState: null,     // state before diverting to tanker
    preDivertTarget: null,    // engagement target before diverting
    preDivertCapPoint: null,  // CAP point before diverting
    // Mission / waypoint navigation
    mission: null,            // reference to assigned patrol mission
    missionLeg: 0,            // current waypoint index in mission
    waypoints: [],            // ad-hoc waypoints (shift+right-click)
    waypointIndex: 0,         // current index in ad-hoc waypoints
  };
}

// ═══════════════════════════════════════════
// CONTACT (unified: threats + civilians)
// ═══════════════════════════════════════════

// Contact states: ACTIVE, NEUTRALIZED, IMPACT
// Allegiance: UNKNOWN, FRIENDLY, HOSTILE
// Classification: UNKNOWN, CLASSIFIED, IDENTIFIED

export function createThreat(x, y, targetCity, typeName) {
  const num = state.nextContactNum++;
  const spec = THREAT_TYPES[typeName];
  const dx = targetCity.x - x;
  const dy = targetCity.y - y;
  const heading = Math.atan2(dy, dx);
  const hdgDeg = ((90 - heading * 180 / Math.PI) + 360) % 360;

  const contact = {
    id: `BOGIE-${num}`,
    type: typeName,
    typeLabel: spec.label,
    x,
    y,
    speed: spec.speed,
    heading,
    hdgDeg: Math.round(hdgDeg),
    targetCity,
    state: 'ACTIVE',
    detected: false,
    altitude: spec.altitudeMin + Math.floor(Math.random() * (spec.altitudeMax - spec.altitudeMin)),
    spawnTime: state.gameTime,

    // Phase 6 — IFF / classification
    isCivilian: false,
    transponder: false,
    allegiance: 'UNKNOWN',
    classification: 'UNKNOWN',
    classCategory: null,       // rough category after classification
    sweepsSeen: 0,
    damaged: false,             // crippled by missile hit (speed halved)
  };

  // Fighter evasion tracking
  if (spec.evasionChance) {
    contact.lastEvasionTime = 0;
  }

  // ICBM boost phase
  if (spec.boostDuration) {
    contact.boostEnd = state.gameTime + spec.boostDuration;
  }

  return contact;
}

export function createCivilian(x, y, exitX, exitY) {
  const num = state.nextContactNum++;
  const types = Object.keys(CIVILIAN_TYPES);
  const typeName = types[Math.floor(Math.random() * types.length)];
  const spec = CIVILIAN_TYPES[typeName];

  const dx = exitX - x;
  const dy = exitY - y;
  const heading = Math.atan2(dy, dx);
  const hdgDeg = ((90 - heading * 180 / Math.PI) + 360) % 360;

  const speed = spec.speed[0] + Math.random() * (spec.speed[1] - spec.speed[0]);
  const altitude = spec.altitude[0] + Math.floor(Math.random() * (spec.altitude[1] - spec.altitude[0]));

  return {
    id: `BOGIE-${num}`,
    type: typeName,
    typeLabel: spec.label,
    x,
    y,
    speed: Math.round(speed),
    heading,
    hdgDeg: Math.round(hdgDeg),
    targetCity: null,
    exitPoint: { x: exitX, y: exitY },
    state: 'ACTIVE',
    detected: false,
    altitude,
    spawnTime: state.gameTime,

    // Phase 6 — IFF / classification
    isCivilian: true,
    transponder: true,
    allegiance: 'UNKNOWN',       // starts unknown, IFF auto-classifies on detection
    classification: 'UNKNOWN',
    classCategory: null,
    sweepsSeen: 0,
  };
}

// ═══════════════════════════════════════════
// CLASSIFICATION
// ═══════════════════════════════════════════

export function getClassCategory(speed, altitude) {
  if (speed > 5000) return 'BALLISTIC';
  if (altitude < 1000) return 'LOW RIDER';
  if (speed > 650) return 'FAST MOVER';
  if (speed >= 350 && altitude >= 20000) return 'HEAVY';
  if (speed < 350) return 'SLOW MOVER';
  return 'UNKNOWN TYPE';
}

// ═══════════════════════════════════════════
// MISSION / WAYPOINT HELPERS
// ═══════════════════════════════════════════

export function getCurrentWaypoint(interceptor) {
  if (interceptor.mission && interceptor.mission.waypoints.length > 0) {
    return interceptor.mission.waypoints[interceptor.missionLeg || 0];
  }
  if (interceptor.waypoints && interceptor.waypoints.length > 0) {
    return interceptor.waypoints[interceptor.waypointIndex || 0];
  }
  return null;
}

function advanceWaypoint(interceptor) {
  if (interceptor.mission && interceptor.mission.waypoints.length > 1) {
    interceptor.missionLeg = ((interceptor.missionLeg || 0) + 1) % interceptor.mission.waypoints.length;
    return true;
  }
  if (interceptor.waypoints && interceptor.waypoints.length > 0) {
    const idx = interceptor.waypointIndex || 0;
    if (idx < interceptor.waypoints.length - 1) {
      interceptor.waypointIndex = idx + 1;
      return true;
    }
    // At last waypoint — convert to simple CAP at final point
    interceptor.capPoint = { ...interceptor.waypoints[idx] };
    interceptor.waypoints = [];
    interceptor.waypointIndex = 0;
    return false;
  }
  return false;
}

export function clearMission(interceptor) {
  if (interceptor.mission) {
    interceptor.mission.assignedInterceptor = null;
    interceptor.mission = null;
  }
  interceptor.missionLeg = 0;
  interceptor.waypoints = [];
  interceptor.waypointIndex = 0;
}

// ═══════════════════════════════════════════
// RADAR & DATA LINK
// ═══════════════════════════════════════════

// Is this interceptor within data link range of any active AWACS?
export function hasDataLink(interceptor) {
  for (const awacs of getActiveAWACS()) {
    const dx = awacs.x - interceptor.x;
    const dy = awacs.y - interceptor.y;
    if (Math.sqrt(dx * dx + dy * dy) <= DATA_LINK_RANGE) return true;
  }
  return false;
}

// Normalize angle to [-PI, PI]
function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Is contact within interceptor's radar cone?
export function isInRadarCone(interceptor, contact) {
  const spec = AIRCRAFT_TYPES[interceptor.type];
  if (!spec.radarRange || !spec.radarCone) return false;

  const dx = contact.x - interceptor.x;
  const dy = contact.y - interceptor.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > spec.radarRange) return false;

  const angleToContact = Math.atan2(dy, dx);
  const aDiff = normalizeAngle(angleToContact - (interceptor.heading || 0));
  return Math.abs(aDiff) <= spec.radarCone;
}

// Can this interceptor fire on this contact? (needs radar track)
export function hasRadarTrack(interceptor, contact) {
  const spec = AIRCRAFT_TYPES[interceptor.type];
  // Genie doesn't need radar lock (unguided nuclear)
  if (spec.weaponType === 'GENIE') return true;
  return isInRadarCone(interceptor, contact);
}

// Update mid-course guidance for a missile
function updateMidcourse(missile) {
  if (!missile.midcourseActive) return;

  const shooter = missile.shooter;
  if (!shooter || shooter.state === 'CRASHED' || shooter.state === 'READY' ||
      shooter.state === 'TURNAROUND' || shooter.state === 'MAINTENANCE') {
    missile.midcourseActive = false;
    addLog(`${missile.id} LOST MID-COURSE — SHOOTER UNAVAILABLE`, 'warn');
    return;
  }

  const spec = AIRCRAFT_TYPES[shooter.type];
  if (!spec || !spec.radarRange) {
    missile.midcourseActive = false;
    return;
  }

  // Check if target is in shooter's radar cone
  const target = missile.target;
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const angleToTarget = Math.atan2(dy, dx);
  const aDiff = normalizeAngle(angleToTarget - (shooter.heading || 0));

  if (d > spec.radarRange || Math.abs(aDiff) > spec.radarCone) {
    missile.midcourseActive = false;
    addLog(`${missile.id} LOST MID-COURSE — GOING AUTONOMOUS`, 'warn');
  }
}

// ═══════════════════════════════════════════
// MOVEMENT
// All coordinates in nautical miles.
// dSec = game-seconds elapsed (already scaled by GAME_SPEED)
// Speed in knots (nm/hr), converted to nm/s: speed / 3600
// ═══════════════════════════════════════════

export function moveContact(contact, dSec) {
  if (contact.state !== 'ACTIVE') return;

  const nmPerSec = contact.speed / 3600;

  // AWACS hunting — re-home toward nearest active AWACS each tick
  if (contact.targetAWACS) {
    const awacs = getActiveAWACS();
    if (awacs.length > 0) {
      let nearest = awacs[0];
      let bestDist = Infinity;
      for (const a of awacs) {
        const dx = a.x - contact.x;
        const dy = a.y - contact.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) { nearest = a; bestDist = d; }
      }
      contact.heading = Math.atan2(nearest.y - contact.y, nearest.x - contact.x);
      contact.hdgDeg = Math.round(((90 - contact.heading * 180 / Math.PI) + 360) % 360);
    } else {
      // No AWACS airborne — revert to city targeting
      contact.targetAWACS = false;
    }
  }

  // Fighter evasion — jink when interceptor is closing
  if (!contact.isCivilian) {
    const spec = THREAT_TYPES[contact.type];
    if (spec && spec.evasionChance && state.gameTime - (contact.lastEvasionTime || 0) > spec.evasionCooldown) {
      for (const interceptor of state.interceptors) {
        if (interceptor.target !== contact || interceptor.state !== 'AIRBORNE') continue;
        const dx = interceptor.x - contact.x;
        const dy = interceptor.y - contact.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < spec.evasionRange && Math.random() < spec.evasionChance) {
          const jinkAngle = (Math.PI / 6 + Math.random() * Math.PI / 6) * (Math.random() < 0.5 ? 1 : -1);
          contact.heading += jinkAngle;
          contact.hdgDeg = Math.round(((90 - contact.heading * 180 / Math.PI) + 360) % 360);
          contact.lastEvasionTime = state.gameTime;
          break;
        }
      }
    }
  }

  contact.x += Math.cos(contact.heading) * nmPerSec * dSec;
  contact.y += Math.sin(contact.heading) * nmPerSec * dSec;
}

export function moveInterceptor(interceptor, dSec) {
  if (interceptor.state === 'READY' || interceptor.state === 'MAINTENANCE') return;

  // Turnaround — check if complete
  if (interceptor.state === 'TURNAROUND') {
    if (state.gameTime >= interceptor.turnaroundUntil) {
      interceptor.state = 'READY';
      interceptor.fuel = interceptor.fuelMax;
      interceptor.weapons = interceptor.spec.weapons;
      addLog(`${interceptor.id} TURNAROUND COMPLETE — READY`, '');
    }
    return;
  }

  // Burn fuel (per game-second)
  interceptor.fuel -= interceptor.spec.fuelBurnRate * dSec;

  // Crash on empty
  if (interceptor.fuel <= 0) {
    interceptor.fuel = 0;
    interceptor.state = 'CRASHED';
    clearMission(interceptor);
    return;
  }

  // Smart bingo — calculate fuel needed to RTB from current position
  if (interceptor.state !== 'RTB' && interceptor.state !== 'READY' && interceptor.state !== 'REFUELING') {
    const dx = interceptor.base.x - interceptor.x;
    const dy = interceptor.base.y - interceptor.y;
    const distToBase = Math.sqrt(dx * dx + dy * dy);
    const nmPerSec = interceptor.speed / 3600;
    const timeToBase = distToBase / nmPerSec;
    const fuelToBase = timeToBase * interceptor.spec.fuelBurnRate;
    const fuelWithMargin = fuelToBase * 1.15;

    if (interceptor.fuel <= fuelWithMargin) {
      interceptor.bingo = true;

      // Try to divert to a tanker instead of RTB
      const tanker = findReachableTanker(interceptor);
      if (tanker) {
        interceptor.preDivertState = interceptor.state;
        interceptor.preDivertTarget = interceptor.target;
        interceptor.preDivertCapPoint = interceptor.capPoint;
        interceptor.state = 'REFUELING';
        interceptor.refuelTanker = tanker;
        interceptor.target = null;
        interceptor.idTarget = null;
        interceptor.capPoint = null;
        return;
      }

      interceptor.state = 'RTB';
      interceptor.target = null;
      interceptor.idTarget = null;
      interceptor.capPoint = null;
      return;
    }
  }

  let targetX, targetY;

  if (interceptor.state === 'AIRBORNE' && interceptor.target) {
    targetX = interceptor.target.x;
    targetY = interceptor.target.y;
  } else if (interceptor.state === 'ID_MISSION' && interceptor.idTarget) {
    targetX = interceptor.idTarget.x;
    targetY = interceptor.idTarget.y;
  } else if (interceptor.state === 'CAP') {
    const wp = getCurrentWaypoint(interceptor);
    if (wp) {
      targetX = wp.x;
      targetY = wp.y;
    } else if (interceptor.capPoint) {
      targetX = interceptor.capPoint.x;
      targetY = interceptor.capPoint.y;
    } else {
      return;
    }
  } else if (interceptor.state === 'REFUELING' && interceptor.refuelTanker) {
    targetX = interceptor.refuelTanker.x;
    targetY = interceptor.refuelTanker.y;
  } else if (interceptor.state === 'RTB') {
    targetX = interceptor.base.x;
    targetY = interceptor.base.y;
  } else {
    return;
  }

  let dx = targetX - interceptor.x;
  let dy = targetY - interceptor.y;
  let dist = Math.sqrt(dx * dx + dy * dy);

  // ID_MISSION — close enough to identify
  if (interceptor.state === 'ID_MISSION' && dist <= ID_RANGE) {
    interceptor.idProgress += dSec;
    if (interceptor.idProgress >= ID_TIME) {
      completeIdentification(interceptor);
    }
    // Stay near the contact (match position loosely)
    return;
  }

  // REFUELING — check tanker proximity and refuel
  if (interceptor.state === 'REFUELING' && interceptor.refuelTanker) {
    const tanker = interceptor.refuelTanker;

    // Tanker gone — fall back to RTB
    if (tanker.state === 'CRASHED' || tanker.state === 'RTB' || tanker.state === 'READY' ||
        tanker.state === 'TURNAROUND' || tanker.state === 'MAINTENANCE') {
      interceptor.refuelTanker = null;
      interceptor.preDivertState = null;
      interceptor.preDivertTarget = null;
      interceptor.preDivertCapPoint = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} TANKER UNAVAILABLE — RTB`, 'warn');
      return;
    }

    if (dist <= TANKER_REFUEL_RANGE) {
      // Receiving fuel — don't move, just refuel
      interceptor.fuel = Math.min(
        interceptor.fuelMax * TANKER_REFUEL_TARGET,
        interceptor.fuel + TANKER_REFUEL_RATE * dSec
      );

      // Done refueling?
      if (interceptor.fuel >= interceptor.fuelMax * TANKER_REFUEL_TARGET) {
        interceptor.bingo = false;
        addLog(`${interceptor.id} REFUEL COMPLETE — RESUMING MISSION`, '');

        const prevState = interceptor.preDivertState;
        const prevTarget = interceptor.preDivertTarget;
        const prevCap = interceptor.preDivertCapPoint;

        interceptor.refuelTanker = null;
        interceptor.preDivertState = null;
        interceptor.preDivertTarget = null;
        interceptor.preDivertCapPoint = null;

        if (prevState === 'AIRBORNE' && prevTarget && prevTarget.state === 'ACTIVE') {
          interceptor.state = 'AIRBORNE';
          interceptor.target = prevTarget;
        } else if (prevState === 'CAP') {
          interceptor.state = 'CAP';
          // Mission/waypoints are preserved on the interceptor — they'll resume automatically
          if (!interceptor.mission && !(interceptor.waypoints && interceptor.waypoints.length > 0)) {
            interceptor.capPoint = prevCap || { x: interceptor.x, y: interceptor.y };
          }
        } else {
          interceptor.state = 'CAP';
          if (!interceptor.mission && !(interceptor.waypoints && interceptor.waypoints.length > 0)) {
            interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
          }
        }
      }
      return; // Don't move while refueling in range
    }
    // Not in range yet — fall through to normal movement
  }

  // Waypoint advancement — if CAP and close to current waypoint, advance to next
  if (interceptor.state === 'CAP' && dist < ARRIVAL_THRESHOLD) {
    if (advanceWaypoint(interceptor)) {
      const wp = getCurrentWaypoint(interceptor);
      if (wp) {
        const dx2 = wp.x - interceptor.x;
        const dy2 = wp.y - interceptor.y;
        dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        dx = dx2;
        dy = dy2;
      }
    }
  }

  if (dist < ARRIVAL_THRESHOLD) {
    if (interceptor.state === 'RTB') {
      interceptor.x = interceptor.base.x;
      interceptor.y = interceptor.base.y;
      interceptor.bingo = false;
      interceptor.idProgress = 0;
      interceptor.target = null;
      interceptor.idTarget = null;
      interceptor.capPoint = null;
      clearMission(interceptor);
      interceptor.sorties++;

      if (interceptor.sorties >= interceptor.spec.maxSorties) {
        interceptor.state = 'MAINTENANCE';
        addLog(`${interceptor.id} SORTIE LIMIT — EXTENDED MAINTENANCE`, 'warn');
      } else {
        interceptor.state = 'TURNAROUND';
        interceptor.turnaroundUntil = state.gameTime + interceptor.spec.turnaroundTime * 1000;
        addLog(`${interceptor.id} LANDED — TURNAROUND ${Math.round(interceptor.spec.turnaroundTime / 60)}min`, '');
      }
    }
    // Orbiting at a point — rotate radar heading
    if (interceptor.state === 'CAP') {
      interceptor.heading = (interceptor.heading || 0) + FIGHTER_ORBIT_RATE * dSec;
    }
    return;
  }

  // Update heading from movement direction
  interceptor.heading = Math.atan2(dy, dx);

  const nmPerSec = interceptor.speed / 3600;
  const moveAmt = nmPerSec * dSec;
  interceptor.x += (dx / dist) * Math.min(moveAmt, dist);
  interceptor.y += (dy / dist) * Math.min(moveAmt, dist);
}

function completeIdentification(interceptor) {
  const contact = interceptor.idTarget;
  if (!contact || contact.state !== 'ACTIVE') {
    interceptor.idTarget = null;
    interceptor.idProgress = 0;
    interceptor.state = 'RTB';
    return;
  }

  contact.classification = 'IDENTIFIED';

  if (contact.isCivilian) {
    contact.allegiance = 'FRIENDLY';
    contact.classCategory = contact.typeLabel;
    addLog(`${interceptor.id} VISUAL ID — ${contact.id} IS ${contact.classCategory} — FRIENDLY`, '');
  } else {
    contact.allegiance = 'HOSTILE';
    const spec = THREAT_TYPES[contact.type];
    contact.classCategory = spec ? spec.label : contact.type;
    addLog(`${interceptor.id} VISUAL ID — ${contact.id} IS ${contact.classCategory} — HOSTILE`, 'alert');
  }

  interceptor.idTarget = null;
  interceptor.idProgress = 0;

  // Hostile + has weapons → auto-engage
  if (contact.allegiance === 'HOSTILE' && interceptor.weapons > 0) {
    interceptor.state = 'AIRBORNE';
    interceptor.target = contact;
    addLog(`${interceptor.id} ENGAGING ${contact.id}`, 'alert');
    return;
  }

  // Friendly or no weapons — orbit here
  interceptor.state = 'CAP';
  interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
}

// ═══════════════════════════════════════════
// MISSILES
// ═══════════════════════════════════════════

function distXY(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function createMissile(interceptor, contact) {
  const num = state.nextMissileNum++;
  const weaponType = interceptor.spec.weaponType;
  const mSpec = MISSILE_TYPES[weaponType];
  const heading = Math.atan2(contact.y - interceptor.y, contact.x - interceptor.x);

  return {
    id: `MSL-${num}`,
    type: weaponType,
    x: interceptor.x,
    y: interceptor.y,
    speed: mSpec.speed,
    heading,
    guidance: mSpec.guidance,
    target: contact,
    shooter: interceptor,
    launchRange: distXY(interceptor, contact),
    maxRange: interceptor.spec.weaponsRange,
    launchTime: state.gameTime,
    state: 'FLIGHT',        // FLIGHT | HIT | MISS | EXPIRED
    resolveTime: 0,
    // Mid-course guidance tracking
    midcourseActive: true,
    lastKnownTargetPos: { x: contact.x, y: contact.y },
  };
}

export function moveMissile(missile, dSec) {
  if (missile.state !== 'FLIGHT') return;

  const target = missile.target;

  // Target already gone — expire
  if (!target || target.state !== 'ACTIVE') {
    missile.state = 'EXPIRED';
    missile.resolveTime = state.gameTime;
    return;
  }

  // ACTIVE guidance — multi-phase tracking (mid-course + terminal seeker)
  if (missile.guidance === 'ACTIVE') {
    const mSpec = MISSILE_TYPES[missile.type];
    const tdx = target.x - missile.x;
    const tdy = target.y - missile.y;
    const distToTarget = Math.sqrt(tdx * tdx + tdy * tdy);

    // Update mid-course guidance status
    updateMidcourse(missile);

    // Terminal phase — seeker active
    if (mSpec.seekerRange && distToTarget <= mSpec.seekerRange) {
      const angleToTarget = Math.atan2(tdy, tdx);
      const aDiff = normalizeAngle(angleToTarget - missile.heading);

      if (Math.abs(aDiff) <= mSpec.seekerCone) {
        // Target in seeker cone — track it
        missile.heading = angleToTarget;
      } else {
        // Seeker can't acquire — lost lock
        missile.state = 'MISS';
        missile.resolveTime = state.gameTime;
        state.missilesMissed++;
        addLog(`${missile.id} SEEKER LOST LOCK — ${target.id} EVADED`, 'warn');
        return;
      }
    } else if (missile.midcourseActive) {
      // Mid-course — home toward target (shooter is guiding)
      missile.heading = Math.atan2(tdy, tdx);
      missile.lastKnownTargetPos = { x: target.x, y: target.y };
    } else {
      // No guidance — fly toward last known position
      const lkp = missile.lastKnownTargetPos;
      if (lkp) {
        missile.heading = Math.atan2(lkp.y - missile.y, lkp.x - missile.x);
      }
    }
  }
  // UNGUIDED — heading stays fixed from launch

  const nmPerSec = missile.speed / 3600;
  const moveAmt = nmPerSec * dSec;
  missile.x += Math.cos(missile.heading) * moveAmt;
  missile.y += Math.sin(missile.heading) * moveAmt;

  // Check arrival
  const d = distXY(missile, target);
  if (d <= MISSILE_ARRIVAL_DIST) {
    resolveMissileArrival(missile);
    return;
  }

  // Timeout — missile flew beyond 1.5x max range from launch point without arriving
  const distFromLaunch = Math.sqrt(
    (missile.x - missile.shooter.x) ** 2 + (missile.y - missile.shooter.y) ** 2
  );
  // Use a generous timeout based on flight time at missile speed
  const maxFlightSec = (missile.maxRange * 2) / nmPerSec;
  const flightElapsed = (state.gameTime - missile.launchTime) / 1000;
  if (flightElapsed > maxFlightSec) {
    missile.state = 'MISS';
    missile.resolveTime = state.gameTime;
    state.missilesMissed++;
    addLog(`${missile.id} ${missile.type} LOST TRACK — MISS`, 'warn');
  }
}

function resolveMissileArrival(missile) {
  const contact = missile.target;
  const mSpec = MISSILE_TYPES[missile.type];

  // Calculate Pk
  let pk = mSpec.basePk;

  // Target type modifier
  const targetMod = PK_TARGET_MODIFIERS[contact.type] || 1.0;
  pk *= targetMod;

  // Range modifier — based on launch range vs max range
  const rangePct = missile.launchRange / missile.maxRange;
  if (rangePct > 0.80) {
    pk *= 0.75;   // long shot
  } else if (rangePct < 0.40) {
    pk *= 1.15;   // close range bonus
  }

  // Mid-course guidance lost — missile had to find target autonomously
  if (!missile.midcourseActive && missile.guidance === 'ACTIVE') {
    pk *= MIDCOURSE_LOST_PK_MOD;
  }

  // Already damaged — guaranteed kill
  if (contact.damaged) {
    pk = 1.0;
  }

  // Clamp
  pk = Math.max(0.05, Math.min(1.0, pk));

  // Roll for hit
  if (Math.random() < pk) {
    // HIT — determine destroy or cripple
    const destroyChance = DAMAGE_DESTROY_CHANCE[contact.type] || 0.55;

    if (contact.damaged || Math.random() < destroyChance) {
      // DESTROY
      missile.state = 'HIT';
      missile.resolveTime = state.gameTime;
      contact.state = 'NEUTRALIZED';

      if (contact.isCivilian) {
        state.civiliansKilled++;
        contact.classification = 'IDENTIFIED';
        contact.allegiance = 'FRIENDLY';
        contact.classCategory = contact.typeLabel;
        addLog(`■ CIVILIAN AIRCRAFT DESTROYED — ${contact.id} WAS ${contact.typeLabel} ■`, 'alert');
        addLog(`■ CATASTROPHIC ERROR — CIVILIAN SHOOTDOWN ■`, 'alert');
        state.effects.push({ x: contact.x, y: contact.y, type: 'impact', startTime: state.gameTime });
      } else {
        state.threatsNeutralized++;
        const threatSpec = THREAT_TYPES[contact.type];
        const dmgLabel = contact.damaged ? ' (DAMAGED)' : '';
        addLog(`${missile.id} HIT — ${contact.id} SPLASH${dmgLabel} (${threatSpec.label})`, 'alert');
        state.effects.push({ x: contact.x, y: contact.y, type: 'kill', startTime: state.gameTime });
      }
    } else {
      // CRIPPLE
      missile.state = 'HIT';
      missile.resolveTime = state.gameTime;
      contact.damaged = true;
      contact.speed = Math.round(contact.speed * 0.5);
      const threatSpec = THREAT_TYPES[contact.type];
      addLog(`${missile.id} HIT — ${contact.id} DAMAGED (${threatSpec.label}) — SPEED REDUCED`, 'warn');
      state.effects.push({ x: contact.x, y: contact.y, type: 'damage', startTime: state.gameTime });
    }
  } else {
    // MISS
    missile.state = 'MISS';
    missile.resolveTime = state.gameTime;
    state.missilesMissed++;
    addLog(`${missile.id} ${missile.type} MISS — ${contact.id} EVADED`, 'warn');
  }
}

// ═══════════════════════════════════════════
// AWACS DETECTION
// ═══════════════════════════════════════════

export function getActiveAWACS() {
  return state.interceptors.filter(
    i => i.type === 'E-3A' && (i.state === 'AIRBORNE' || i.state === 'CAP')
  );
}

// ═══════════════════════════════════════════
// TANKER REFUELING
// ═══════════════════════════════════════════

export function getActiveTankers() {
  return state.interceptors.filter(
    i => i.type === 'KC-135' && i.state === 'CAP'
  );
}

// Is this tanker on station (arrived at its orbit point)?
function isTankerOnStation(tanker) {
  if (!tanker.capPoint) return false;
  const dx = tanker.x - tanker.capPoint.x;
  const dy = tanker.y - tanker.capPoint.y;
  return Math.sqrt(dx * dx + dy * dy) <= ARRIVAL_THRESHOLD;
}

function findReachableTanker(interceptor) {
  // Don't let tankers/AWACS seek tankers
  if (interceptor.type === 'KC-135' || interceptor.type === 'E-3A') return null;

  const tankers = getActiveTankers();
  let best = null;
  let bestDist = Infinity;

  for (const tanker of tankers) {
    if (!isTankerOnStation(tanker)) continue;

    const dx = tanker.x - interceptor.x;
    const dy = tanker.y - interceptor.y;
    const distToTanker = Math.sqrt(dx * dx + dy * dy);
    const nmPerSec = interceptor.speed / 3600;
    const timeToTanker = distToTanker / nmPerSec;
    const fuelToTanker = timeToTanker * interceptor.spec.fuelBurnRate;

    if (interceptor.fuel > fuelToTanker * 1.1 && distToTanker < bestDist) {
      best = tanker;
      bestDist = distToTanker;
    }
  }
  return best;
}

// Passive refueling — fighters in CAP near an on-station tanker get fuel topped up
export function updateTankerRefueling(dSec) {
  const tankers = getActiveTankers();
  for (const tanker of tankers) {
    if (!isTankerOnStation(tanker)) continue;

    for (const fighter of state.interceptors) {
      if (fighter === tanker || fighter.type === 'KC-135' || fighter.type === 'E-3A') continue;
      if (fighter.state !== 'CAP') continue;
      if (fighter.fuel >= fighter.fuelMax * TANKER_REFUEL_TARGET) continue;

      const dx = fighter.x - tanker.x;
      const dy = fighter.y - tanker.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= TANKER_REFUEL_RANGE) {
        fighter.fuel = Math.min(
          fighter.fuelMax * TANKER_REFUEL_TARGET,
          fighter.fuel + TANKER_REFUEL_RATE * dSec
        );
      }
    }
  }
}
