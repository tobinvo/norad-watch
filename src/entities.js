import { AIRCRAFT_TYPES, THREAT_TYPES, ARRIVAL_THRESHOLD, ID_RANGE, ID_TIME, CIVILIAN_TYPES } from './constants.js';
import { state } from './state.js';

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

// States: READY, AIRBORNE, CAP, RTB, ID_MISSION, CRASHED
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
// MOVEMENT
// All coordinates in nautical miles.
// dSec = game-seconds elapsed (already scaled by GAME_SPEED)
// Speed in knots (nm/hr), converted to nm/s: speed / 3600
// ═══════════════════════════════════════════

export function moveContact(contact, dSec) {
  if (contact.state !== 'ACTIVE') return;

  const nmPerSec = contact.speed / 3600;

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
  if (interceptor.state === 'READY') return;

  // Burn fuel (per game-second)
  interceptor.fuel -= interceptor.spec.fuelBurnRate * dSec;

  // Crash on empty
  if (interceptor.fuel <= 0) {
    interceptor.fuel = 0;
    interceptor.state = 'CRASHED';
    return;
  }

  // Smart bingo — calculate fuel needed to RTB from current position
  if (interceptor.state !== 'RTB' && interceptor.state !== 'READY') {
    const dx = interceptor.base.x - interceptor.x;
    const dy = interceptor.base.y - interceptor.y;
    const distToBase = Math.sqrt(dx * dx + dy * dy);
    const nmPerSec = interceptor.speed / 3600;
    const timeToBase = distToBase / nmPerSec;
    const fuelToBase = timeToBase * interceptor.spec.fuelBurnRate;
    const fuelWithMargin = fuelToBase * 1.15;

    if (interceptor.fuel <= fuelWithMargin) {
      interceptor.bingo = true;
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
  } else if (interceptor.state === 'CAP' && interceptor.capPoint) {
    targetX = interceptor.capPoint.x;
    targetY = interceptor.capPoint.y;
  } else if (interceptor.state === 'RTB') {
    targetX = interceptor.base.x;
    targetY = interceptor.base.y;
  } else {
    return;
  }

  const dx = targetX - interceptor.x;
  const dy = targetY - interceptor.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // ID_MISSION — close enough to identify
  if (interceptor.state === 'ID_MISSION' && dist <= ID_RANGE) {
    interceptor.idProgress += dSec;
    if (interceptor.idProgress >= ID_TIME) {
      completeIdentification(interceptor);
    }
    // Stay near the contact (match position loosely)
    return;
  }

  if (dist < ARRIVAL_THRESHOLD) {
    if (interceptor.state === 'RTB') {
      interceptor.state = 'READY';
      interceptor.x = interceptor.base.x;
      interceptor.y = interceptor.base.y;
      interceptor.fuel = interceptor.fuelMax;
      interceptor.weapons = interceptor.spec.weapons;
      interceptor.bingo = false;
      interceptor.idProgress = 0;
    }
    return;
  }

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
  } else {
    contact.allegiance = 'HOSTILE';
    const spec = THREAT_TYPES[contact.type];
    contact.classCategory = spec ? spec.label : contact.type;
  }

  interceptor.idTarget = null;
  interceptor.idProgress = 0;
  // Stay airborne — available for reassignment (don't auto-RTB)
  interceptor.state = 'CAP';
  interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
}

// ═══════════════════════════════════════════
// AWACS DETECTION
// ═══════════════════════════════════════════

export function getActiveAWACS() {
  return state.interceptors.filter(
    i => i.type === 'E-3A' && (i.state === 'AIRBORNE' || i.state === 'CAP')
  );
}
