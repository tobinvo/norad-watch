import { AIRCRAFT_TYPES, THREAT_TYPES, ARRIVAL_THRESHOLD, ID_RANGE, ID_TIME, CIVILIAN_TYPES,
  MISSILE_TYPES, PK_TARGET_MODIFIERS, DAMAGE_DESTROY_CHANCE, MISSILE_ARRIVAL_DIST,
  TANKER_REFUEL_RANGE, TANKER_REFUEL_RATE, TANKER_REFUEL_TARGET } from './constants.js';
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
  } else if (interceptor.state === 'CAP' && interceptor.capPoint) {
    targetX = interceptor.capPoint.x;
    targetY = interceptor.capPoint.y;
  } else if (interceptor.state === 'REFUELING' && interceptor.refuelTanker) {
    targetX = interceptor.refuelTanker.x;
    targetY = interceptor.refuelTanker.y;
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
        } else if (prevState === 'CAP' && prevCap) {
          interceptor.state = 'CAP';
          interceptor.capPoint = prevCap;
        } else {
          interceptor.state = 'CAP';
          interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
        }
      }
      return; // Don't move while refueling in range
    }
    // Not in range yet — fall through to normal movement
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

  // ACTIVE guidance — re-home toward target's current position
  if (missile.guidance === 'ACTIVE') {
    missile.heading = Math.atan2(target.y - missile.y, target.x - missile.x);
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
