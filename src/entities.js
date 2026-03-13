import { INTERCEPTOR_SPEED, INTERCEPTORS_PER_BASE } from './constants.js';
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

export function createBase(name, x, y) {
  const base = { id: name, name, x, y, interceptors: [] };

  for (let i = 0; i < INTERCEPTORS_PER_BASE; i++) {
    const interceptor = createInterceptor(base);
    base.interceptors.push(interceptor);
    state.interceptors.push(interceptor);
  }

  return base;
}

// ═══════════════════════════════════════════
// INTERCEPTOR
// ═══════════════════════════════════════════

// States: READY, AIRBORNE, ENGAGED, RTB
export function createInterceptor(base) {
  const num = state.nextInterceptorNum++;
  return {
    id: `EAGLE-${num}`,
    type: 'F-15A',
    x: base.x,
    y: base.y,
    speed: INTERCEPTOR_SPEED,
    state: 'READY',
    base,
    target: null, // assigned threat
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
  const dist = Math.sqrt(dx * dx + dy * dy);
  const heading = Math.atan2(dy, dx);
  const hdgDeg = ((90 - heading * 180 / Math.PI) + 360) % 360;

  return {
    id: `BOGIE-${num}`,
    type: 'BOMBER',
    x,
    y,
    speed,
    heading, // radians
    hdgDeg: Math.round(hdgDeg),
    targetCity,
    state: 'HOSTILE',
    detected: false, // true once radar sweep reveals it
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
  let targetX, targetY;

  if (interceptor.state === 'AIRBORNE' && interceptor.target) {
    targetX = interceptor.target.x;
    targetY = interceptor.target.y;
  } else if (interceptor.state === 'RTB') {
    targetX = interceptor.base.x;
    targetY = interceptor.base.y;
  } else {
    return;
  }

  const dx = targetX - interceptor.x;
  const dy = targetY - interceptor.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 0.002) {
    if (interceptor.state === 'RTB') {
      interceptor.state = 'READY';
      interceptor.x = interceptor.base.x;
      interceptor.y = interceptor.base.y;
    }
    return;
  }

  // Move toward target
  const moveAmt = interceptor.speed * dSec;
  interceptor.x += (dx / dist) * Math.min(moveAmt, dist);
  interceptor.y += (dy / dist) * Math.min(moveAmt, dist);
}
