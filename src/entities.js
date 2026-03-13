import { AIRCRAFT_TYPES, BINGO_FUEL_THRESHOLD } from './constants.js';
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

// States: READY, AIRBORNE, CAP, RTB
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
    target: null,        // assigned threat
    capPoint: null,      // { x, y } for CAP orbit
    fuel: spec.fuelCapacity,
    fuelMax: spec.fuelCapacity,
    weapons: spec.weapons,
    bingo: false,        // true when fuel warning triggered
  };
}

// ═══════════════════════════════════════════
// THREAT
// ═══════════════════════════════════════════

// States: HOSTILE, NEUTRALIZED, IMPACT
export function createThreat(x, y, targetCity, speed) {
  const num = state.nextThreatNum++;
  const dx = targetCity.x - x;
  const dy = targetCity.y - y;
  const heading = Math.atan2(dy, dx);
  const hdgDeg = ((90 - heading * 180 / Math.PI) + 360) % 360;

  return {
    id: `BOGIE-${num}`,
    type: 'BOMBER',
    x,
    y,
    speed,
    heading,
    hdgDeg: Math.round(hdgDeg),
    targetCity,
    state: 'HOSTILE',
    detected: false,
    altitude: 35000 + Math.floor(Math.random() * 10000),
  };
}

// ═══════════════════════════════════════════
// MOVEMENT
// ═══════════════════════════════════════════

export function moveThreat(threat, dt) {
  if (threat.state !== 'HOSTILE') return;
  const dSec = dt / 1000;
  threat.x += Math.cos(threat.heading) * threat.speed * dSec;
  threat.y += Math.sin(threat.heading) * threat.speed * dSec;
}

export function moveInterceptor(interceptor, dt) {
  if (interceptor.state === 'READY') return;

  const dSec = dt / 1000;

  // Burn fuel
  interceptor.fuel -= interceptor.spec.fuelBurnRate * dSec;

  // Bingo warning
  if (!interceptor.bingo && interceptor.fuel / interceptor.fuelMax <= BINGO_FUEL_THRESHOLD) {
    interceptor.bingo = true;
    // Auto-RTB on bingo if not already heading home
    if (interceptor.state !== 'RTB') {
      interceptor.state = 'RTB';
      interceptor.target = null;
      interceptor.capPoint = null;
      return; // will log in main update
    }
  }

  // Crash on empty
  if (interceptor.fuel <= 0) {
    interceptor.fuel = 0;
    interceptor.state = 'CRASHED';
    return;
  }

  let targetX, targetY;

  if (interceptor.state === 'AIRBORNE' && interceptor.target) {
    targetX = interceptor.target.x;
    targetY = interceptor.target.y;
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

  if (dist < 0.003) {
    if (interceptor.state === 'RTB') {
      interceptor.state = 'READY';
      interceptor.x = interceptor.base.x;
      interceptor.y = interceptor.base.y;
      interceptor.fuel = interceptor.fuelMax;
      interceptor.weapons = interceptor.spec.weapons;
      interceptor.bingo = false;
    }
    // CAP: arrived at orbit point — just stay here (tiny orbit simulated by not moving)
    return;
  }

  const moveAmt = interceptor.speed * dSec;
  interceptor.x += (dx / dist) * Math.min(moveAmt, dist);
  interceptor.y += (dy / dist) * Math.min(moveAmt, dist);
}

// ═══════════════════════════════════════════
// AWACS DETECTION
// ═══════════════════════════════════════════

export function getActiveAWACS() {
  return state.interceptors.filter(
    i => i.type === 'E-3A' && (i.state === 'AIRBORNE' || i.state === 'CAP')
  );
}
