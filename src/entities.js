import { AIRCRAFT_TYPES, THREAT_TYPES, ARRIVAL_THRESHOLD, MISSION_WAYPOINT_THRESHOLD, ID_RANGE, ID_TIME, CIVILIAN_TYPES,
  MISSILE_TYPES, PK_TARGET_MODIFIERS, DAMAGE_DESTROY_CHANCE, MISSILE_ARRIVAL_DIST,
  TANKER_REFUEL_RANGE, TANKER_REFUEL_RATE, TANKER_REFUEL_TARGET,
  DATA_LINK_RANGE, FIGHTER_ORBIT_RATE, MIDCOURSE_LOST_PK_MOD,
  ESCORT_OFFSET_DISTANCE, ESCORT_COHESION_RANGE, SCRAMBLE_DELAY,
  REATTACK_COOLDOWN } from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';
import { playSplash, playNuclearDetonation, playDamageHit, playProbeTurnBack } from './audio.js';
import { isInSector, isInProsecutionZone } from './sector.js';

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

// States: READY, SCRAMBLING, AIRBORNE, TRACKING, CAP, RTB, ID_MISSION, REFUELING, CRASHED
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
    secondaryWeapons: spec.secondaryWeapons || 0,
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
    missionDirection: 1,      // 1 or -1, for BARRIER back-and-forth
    waypoints: [],            // ad-hoc waypoints (shift+right-click)
    waypointIndex: 0,         // current index in ad-hoc waypoints
    // Scramble delay
    scrambleUntil: 0,         // gameTime (ms) when scramble completes
    scrambleOrder: null,      // { type: 'ENGAGE'|'ID'|'CAP'|'PATROL', target?, capPoint?, mission? }
    // Engagement model
    radarCold: false,         // G key toggle — cold = no radar emissions, can't fire SARH/ACTIVE
    reattackUntil: 0,         // gameTime (ms) — cooldown after miss before next fire
    holdingPastBingo: false,  // HOLD_UNTIL_RELIEVED — staying on station past bingo fuel
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

    // Phase 13 — probe/attack intent & waypoints
    intent: 'ATTACK',          // 'PROBE' or 'ATTACK' — set by spawner
    waypoints: [],              // ingress waypoints before city targeting
    waypointIndex: 0,           // current waypoint being flown to
    turnedBack: false,          // probe has reversed course
    turnBackRate: 0,            // radians/sec for gradual turn

    // Formation (set by spawner for grouped threats)
    formationId: null,          // e.g. 'STRIKE-1'
    formationRole: null,        // 'LEAD' or 'ESCORT'
    formationLead: null,        // reference to lead contact (escorts only)
    escorts: null,              // array of escort contacts (lead only)
    escortAngle: 0,             // relative angle offset from lead heading (escorts only)
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
// FORMATION HELPERS
// ═══════════════════════════════════════════

function breakFormation(escort) {
  // Restore original speed
  const spec = THREAT_TYPES[escort.type];
  if (spec && !escort.damaged) {
    escort.speed = spec.speed;
  }
  // Remove from lead's escort list
  if (escort.formationLead && escort.formationLead.escorts) {
    const idx = escort.formationLead.escorts.indexOf(escort);
    if (idx >= 0) escort.formationLead.escorts.splice(idx, 1);
  }
  escort.formationLead = null;
  escort.formationRole = null;
}

// Get active escorts for a lead contact
export function getActiveEscorts(contact) {
  if (!contact.escorts) return [];
  return contact.escorts.filter(e => e.state === 'ACTIVE');
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
    const m = interceptor.mission;
    if (m.type === 'BARRIER') {
      // Back-and-forth: reverse direction at endpoints
      const leg = interceptor.missionLeg || 0;
      const next = leg + interceptor.missionDirection;
      if (next < 0 || next >= m.waypoints.length) {
        interceptor.missionDirection *= -1;
        interceptor.missionLeg = leg + interceptor.missionDirection;
      } else {
        interceptor.missionLeg = next;
      }
      return true;
    }
    // PATROL: modulo looping (default)
    interceptor.missionLeg = ((interceptor.missionLeg || 0) + 1) % m.waypoints.length;
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

// Calculate starting waypoint leg for phase-offset along a mission route
export function calculateStartingLeg(mission, slotIndex, totalAssigned) {
  const wps = mission.waypoints;
  if (!wps || wps.length <= 1 || totalAssigned <= 1) return { leg: 0, direction: 1 };

  // Calculate total route distance
  let totalDist = 0;
  const segDists = [];
  for (let i = 0; i < wps.length - 1; i++) {
    const dx = wps[i + 1].x - wps[i].x;
    const dy = wps[i + 1].y - wps[i].y;
    const d = Math.sqrt(dx * dx + dy * dy);
    segDists.push(d);
    totalDist += d;
  }
  // For PATROL, add closing segment back to start
  if (mission.type === 'PATROL') {
    const dx = wps[0].x - wps[wps.length - 1].x;
    const dy = wps[0].y - wps[wps.length - 1].y;
    const d = Math.sqrt(dx * dx + dy * dy);
    segDists.push(d);
    totalDist += d;
  }

  // Target offset distance for this slot
  const targetDist = (slotIndex / totalAssigned) * totalDist;

  // Walk segments to find the starting leg
  let walked = 0;
  for (let i = 0; i < segDists.length; i++) {
    if (walked + segDists[i] >= targetDist) {
      const leg = (mission.type === 'PATROL') ? (i % wps.length) : Math.min(i, wps.length - 1);
      return { leg, direction: 1 };
    }
    walked += segDists[i];
  }
  return { leg: 0, direction: 1 };
}

export function clearMission(interceptor) {
  if (interceptor.mission) {
    const m = interceptor.mission;
    m.assignedInterceptors = m.assignedInterceptors.filter(i => i !== interceptor);
    interceptor.mission = null;
  }
  interceptor.missionLeg = 0;
  interceptor.missionDirection = 1;
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
  if (interceptor.radarCold) return false;

  const dx = contact.x - interceptor.x;
  const dy = contact.y - interceptor.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > spec.radarRange) return false;

  const angleToContact = Math.atan2(dy, dx);
  const aDiff = normalizeAngle(angleToContact - (interceptor.heading || 0));
  return Math.abs(aDiff) <= spec.radarCone;
}

// Get current weapon info — primary first, then secondary
export function getCurrentWeapon(interceptor) {
  const spec = interceptor.spec;
  if (interceptor.weapons > 0) {
    return { type: spec.weaponType, range: spec.weaponsRange, isPrimary: true };
  }
  if (interceptor.secondaryWeapons > 0 && spec.secondaryWeaponType) {
    return { type: spec.secondaryWeaponType, range: spec.secondaryWeaponsRange, isPrimary: false };
  }
  return null;
}

// Total weapons remaining (primary + secondary)
export function totalWeapons(interceptor) {
  return interceptor.weapons + (interceptor.secondaryWeapons || 0);
}

// Can this interceptor fire on this contact? (needs radar track)
export function hasRadarTrack(interceptor, contact) {
  const weapon = getCurrentWeapon(interceptor);
  if (!weapon) return false;
  const mSpec = MISSILE_TYPES[weapon.type];
  // Unguided and IR don't need radar lock
  if (mSpec.guidance === 'UNGUIDED' || mSpec.guidance === 'IR') return true;
  // Radar cold — can't track with radar
  if (interceptor.radarCold) return false;
  // SARH and ACTIVE need radar lock (target in radar cone)
  return isInRadarCone(interceptor, contact);
}

// Update mid-course guidance for a missile
function updateMidcourse(missile) {
  if (!missile.midcourseActive) return;

  const shooter = missile.shooter;
  if (!shooter || ['CRASHED', 'READY', 'TURNAROUND', 'MAINTENANCE', 'SCRAMBLING'].includes(shooter.state)) {
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

  // ARM homing — re-home toward nearest emitting radar site
  if (contact.targetSite) {
    const emittingSites = state.radarSites.filter(s => !s.destroyed && state.emcon !== 'SILENT');
    if (emittingSites.length > 0) {
      let nearest = emittingSites[0];
      let bestDist = Infinity;
      for (const s of emittingSites) {
        const dx = s.x - contact.x;
        const dy = s.y - contact.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) { nearest = s; bestDist = d; }
      }
      contact.heading = Math.atan2(nearest.y - contact.y, nearest.x - contact.x);
      contact.hdgDeg = Math.round(((90 - contact.heading * 180 / Math.PI) + 360) % 360);
    } else {
      // No emitting sites — ARM goes ballistic (fixed heading)
      contact.targetSite = false;
    }
  }

  // Escort formation movement — escorts follow their lead
  if (contact.formationRole === 'ESCORT' && contact.formationLead) {
    const lead = contact.formationLead;
    if (lead.state === 'ACTIVE') {
      const dx = lead.x - contact.x;
      const dy = lead.y - contact.y;
      const distToLead = Math.sqrt(dx * dx + dy * dy);

      if (distToLead < ESCORT_COHESION_RANGE) {
        // In formation — fly toward offset position relative to lead
        const absAngle = lead.heading + contact.escortAngle;
        const targetX = lead.x + Math.cos(absAngle) * ESCORT_OFFSET_DISTANCE;
        const targetY = lead.y + Math.sin(absAngle) * ESCORT_OFFSET_DISTANCE;
        contact.heading = Math.atan2(targetY - contact.y, targetX - contact.x);
        contact.hdgDeg = Math.round(((90 - contact.heading * 180 / Math.PI) + 360) % 360);

        // Match lead's speed (bomber is slower, escorts throttle down)
        contact.speed = lead.speed;
      } else {
        // Too far — broken formation, revert to independent city targeting
        breakFormation(contact);
      }
    } else {
      // Lead destroyed — break formation
      breakFormation(contact);
    }
  }

  // Probe turn-back — probe reverses course when interceptor closes within 30nm
  if (!contact.isCivilian && contact.intent === 'PROBE' && !contact.turnedBack) {
    const PROBE_TURN_DIST = 30; // nm — interceptor proximity triggers turn-back
    for (const interceptor of state.interceptors) {
      if (interceptor.state === 'CRASHED' || interceptor.state === 'READY' ||
          interceptor.state === 'SCRAMBLING' || interceptor.state === 'TURNAROUND' ||
          interceptor.state === 'MAINTENANCE') continue;
      if (interceptor.type === 'E-3A' || interceptor.type === 'KC-135') continue;
      const dx = interceptor.x - contact.x;
      const dy = interceptor.y - contact.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < PROBE_TURN_DIST) {
        contact.turnedBack = true;
        // Turn rate: ~3°/sec in game time — gradual visible turn
        contact.turnBackRate = (3 * Math.PI / 180);
        // Target heading: roughly back the way they came (±30° randomness)
        contact.turnBackTarget = contact.heading + Math.PI + (Math.random() - 0.5) * (Math.PI / 3);
        contact.turnBackRemaining = Math.PI; // ~180° to turn
        if (contact.detected) {
          addLog(`${contact.id} TURNING AWAY — POSSIBLE PROBE`, '');
          playProbeTurnBack();
        }
        break;
      }
    }
  }

  // Execute gradual turn-back (probes)
  if (contact.turnedBack && contact.turnBackRemaining > 0) {
    const turnStep = contact.turnBackRate * dSec;
    const remaining = contact.turnBackRemaining;
    const step = Math.min(turnStep, remaining);
    // Turn toward target heading
    const diff = contact.turnBackTarget - contact.heading;
    const sign = Math.sin(diff) >= 0 ? 1 : -1;
    contact.heading += sign * step;
    contact.turnBackRemaining -= step;
    contact.hdgDeg = Math.round(((90 - contact.heading * 180 / Math.PI) + 360) % 360);
  }

  // Waypoint following — fly to waypoints before heading for target city
  if (!contact.isCivilian && !contact.turnedBack && contact.waypoints && contact.waypoints.length > 0
      && contact.waypointIndex < contact.waypoints.length) {
    const wp = contact.waypoints[contact.waypointIndex];
    const dx = wp.x - contact.x;
    const dy = wp.y - contact.y;
    const distToWp = Math.sqrt(dx * dx + dy * dy);
    if (distToWp < 5) {
      // Reached waypoint — advance to next
      contact.waypointIndex++;
      // If all waypoints done, heading will revert to city targeting below
    } else {
      // Steer toward waypoint
      contact.heading = Math.atan2(dy, dx);
      contact.hdgDeg = Math.round(((90 - contact.heading * 180 / Math.PI) + 360) % 360);
    }
  }
  // Re-home on target city if waypoints done and not turning back
  else if (!contact.isCivilian && !contact.turnedBack && contact.targetCity
           && !contact.targetAWACS && !contact.targetSite
           && contact.formationRole !== 'ESCORT') {
    const dx = contact.targetCity.x - contact.x;
    const dy = contact.targetCity.y - contact.y;
    contact.heading = Math.atan2(dy, dx);
    contact.hdgDeg = Math.round(((90 - contact.heading * 180 / Math.PI) + 360) % 360);
  }

  // Fighter evasion — jink when interceptor is closing
  if (!contact.isCivilian && !contact.turnedBack) {
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

// Compute lead intercept point — where to fly to meet a moving target
function computeInterceptPoint(interceptor, target) {
  if (target.state !== 'ACTIVE') return { x: target.x, y: target.y };

  const dx = target.x - interceptor.x;
  const dy = target.y - interceptor.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const iSpeed = interceptor.speed / 3600; // nm/s
  const tSpeed = target.speed / 3600;

  // If interceptor is faster, compute lead point
  // Use iterative approximation: estimate time to intercept, predict target position
  if (iSpeed > 0 && dist > 0) {
    // First estimate: time = distance / closing speed
    let timeEst = dist / iSpeed;

    // Refine twice — predict target pos, recalculate time
    for (let i = 0; i < 2; i++) {
      const predX = target.x + Math.cos(target.heading) * tSpeed * timeEst;
      const predY = target.y + Math.sin(target.heading) * tSpeed * timeEst;
      const pdx = predX - interceptor.x;
      const pdy = predY - interceptor.y;
      const predDist = Math.sqrt(pdx * pdx + pdy * pdy);
      timeEst = predDist / iSpeed;
    }

    // Final predicted position
    const predX = target.x + Math.cos(target.heading) * tSpeed * timeEst;
    const predY = target.y + Math.sin(target.heading) * tSpeed * timeEst;

    // Don't lead too far — cap at 2x current distance (prevents overshooting on very slow closures)
    const leadDx = predX - target.x;
    const leadDy = predY - target.y;
    const leadDist = Math.sqrt(leadDx * leadDx + leadDy * leadDy);
    if (leadDist > dist * 2) {
      // Too far ahead — fall back to pure pursuit
      return { x: target.x, y: target.y };
    }

    return { x: predX, y: predY };
  }

  return { x: target.x, y: target.y };
}

export function moveInterceptor(interceptor, dSec) {
  if (interceptor.state === 'READY' || interceptor.state === 'MAINTENANCE') return;

  // Scrambling — waiting on ground, countdown to airborne
  if (interceptor.state === 'SCRAMBLING') {
    if (state.gameTime >= interceptor.scrambleUntil) {
      const order = interceptor.scrambleOrder;
      interceptor.scrambleOrder = null;
      interceptor.scrambleUntil = 0;

      if (order && order.type === 'ENGAGE' && order.target && order.target.state === 'ACTIVE') {
        interceptor.state = 'AIRBORNE';
        interceptor.target = order.target;
      } else if (order && order.type === 'ID' && order.target && order.target.state === 'ACTIVE') {
        interceptor.state = 'ID_MISSION';
        interceptor.idTarget = order.target;
        interceptor.idProgress = 0;
      } else if (order && order.type === 'PATROL' && order.mission) {
        interceptor.state = 'CAP';
        interceptor.mission = order.mission;
        interceptor.capPoint = null;
        order.mission.assignedInterceptors.push(interceptor);
        // Phase-offset: distribute aircraft along route
        const slotIdx = order.mission.assignedInterceptors.length - 1;
        const total = order.mission.assignedInterceptors.length;
        const start = calculateStartingLeg(order.mission, slotIdx, total);
        interceptor.missionLeg = start.leg;
        interceptor.missionDirection = start.direction;
        // EMCON per mission doctrine
        if (order.mission.emcon === 'COLD' || order.mission.emcon === 'AUTO') {
          interceptor.radarCold = true;
        } else {
          interceptor.radarCold = false;
        }
      } else if (order && order.type === 'CAP' && order.capPoint) {
        interceptor.state = 'CAP';
        interceptor.capPoint = order.capPoint;
      } else {
        // Fallback — CAP at base
        interceptor.state = 'CAP';
        interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
      }
      addLog(`${interceptor.id} AIRBORNE`, '');
    }
    return;
  }

  // Turnaround — check if complete
  if (interceptor.state === 'TURNAROUND') {
    if (state.gameTime >= interceptor.turnaroundUntil) {
      interceptor.state = 'READY';
      interceptor.fuel = interceptor.fuelMax;
      interceptor.weapons = interceptor.spec.weapons;
      interceptor.secondaryWeapons = interceptor.spec.secondaryWeapons || 0;
      addLog(`${interceptor.id} TURNAROUND COMPLETE — READY`, '');
    }
    return;
  }

  // Variable speed based on state
  const isPatrolling = interceptor.state === 'CAP';
  const isIntercepting = interceptor.state === 'AIRBORNE' || interceptor.state === 'TRACKING' || interceptor.state === 'ID_MISSION';
  if (isPatrolling && interceptor.spec.patrolSpeed) {
    interceptor.speed = interceptor.spec.patrolSpeed;
  } else if (isIntercepting && interceptor.spec.interceptSpeed) {
    interceptor.speed = interceptor.spec.interceptSpeed;
  } else {
    interceptor.speed = interceptor.spec.speed;
  }

  // Burn fuel — scales with speed ratio (patrol saves fuel, afterburner burns more)
  const speedRatio = interceptor.speed / interceptor.spec.speed;
  interceptor.fuel -= interceptor.spec.fuelBurnRate * speedRatio * dSec;

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

      // HOLD_UNTIL_RELIEVED: stay on station past bingo (risk crash)
      const holdPolicy = interceptor.mission && interceptor.mission.fuelPolicy === 'HOLD_UNTIL_RELIEVED';
      if (holdPolicy) {
        interceptor.holdingPastBingo = true;
        // Critical fuel override — force RTB at 5% to avoid crash
        if (interceptor.fuel / interceptor.fuelMax <= 0.05) {
          interceptor.holdingPastBingo = false;
          interceptor.state = 'RTB';
          interceptor.target = null;
          interceptor.idTarget = null;
          interceptor.capPoint = null;
          addLog(`${interceptor.id} FUEL CRITICAL — FORCED RTB`, 'alert');
          return;
        }
        return; // stay on station
      }

      interceptor.state = 'RTB';
      interceptor.target = null;
      interceptor.idTarget = null;
      interceptor.capPoint = null;
      return;
    }
  }

  let targetX, targetY;

  if ((interceptor.state === 'AIRBORNE' || interceptor.state === 'TRACKING') && interceptor.target) {
    const t = interceptor.target;
    // Target destroyed — revert to CAP at current position
    if (t.state !== 'ACTIVE') {
      interceptor.target = null;
      interceptor.state = 'CAP';
      interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
      return;
    }
    // Target left the prosecution zone — break off, don't chase off-screen
    if (!isInProsecutionZone(t.x, t.y)) {
      interceptor.target = null;
      interceptor.state = 'RTB';
      return;
    }
    const ip = computeInterceptPoint(interceptor, t);
    targetX = ip.x;
    targetY = ip.y;
  } else if (interceptor.state === 'ID_MISSION' && interceptor.idTarget) {
    const t = interceptor.idTarget;
    // ID target left prosecution zone — break off
    if (!isInProsecutionZone(t.x, t.y)) {
      interceptor.idTarget = null;
      interceptor.idProgress = 0;
      if (interceptor.mission) {
        interceptor.state = 'CAP';
        interceptor.capPoint = null;
      } else {
        interceptor.state = 'RTB';
      }
      return;
    }
    const ip = computeInterceptPoint(interceptor, t);
    targetX = ip.x;
    targetY = ip.y;
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
  } else if ((interceptor.state === 'AIRBORNE' || interceptor.state === 'TRACKING') && !interceptor.target) {
    // Lost target — revert to CAP
    interceptor.state = 'CAP';
    interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
    return;
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
  const wpThreshold = (interceptor.mission || (interceptor.waypoints && interceptor.waypoints.length > 0)) ? MISSION_WAYPOINT_THRESHOLD : ARRIVAL_THRESHOLD;
  if (interceptor.state === 'CAP' && dist < wpThreshold) {
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
      interceptor.holdingPastBingo = false;
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
      return;
    }
    // AIRBORNE/TRACKING with target — keep pursuing, don't stop at intercept point
    if ((interceptor.state === 'AIRBORNE' || interceptor.state === 'TRACKING') && interceptor.target) {
      // Recalculate — target is moving, keep closing
    } else {
      // Orbiting at a point — rotate radar heading
      if (interceptor.state === 'CAP') {
        interceptor.heading = (interceptor.heading || 0) + FIGHTER_ORBIT_RATE * dSec;
      }
      return;
    }
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
  if (contact.allegiance === 'HOSTILE' && (interceptor.weapons > 0 || interceptor.secondaryWeapons > 0)) {
    interceptor.state = 'AIRBORNE';
    interceptor.target = contact;
    addLog(`${interceptor.id} ENGAGING ${contact.id}`, 'alert');
    return;
  }

  // Friendly or no weapons — return to mission or orbit
  interceptor.state = 'CAP';
  if (interceptor.mission) {
    interceptor.capPoint = null; // resume mission waypoints
    addLog(`${interceptor.id} RESUMING ${interceptor.mission.name}`, '');
  } else {
    interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
  }
}

// ═══════════════════════════════════════════
// MISSILES
// ═══════════════════════════════════════════

function distXY(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function createMissile(interceptor, contact, weaponType, weaponRange) {
  const num = state.nextMissileNum++;
  const mSpec = MISSILE_TYPES[weaponType];

  // Lead calculation — predict where target will be at intercept time
  let heading;
  if (mSpec.guidance === 'UNGUIDED') {
    // Iterative fire control solution for unguided weapons
    const dx = contact.x - interceptor.x;
    const dy = contact.y - interceptor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mslSpeed = mSpec.speed / 3600; // nm/s
    const tgtSpeed = contact.speed / 3600;

    // Iterative refinement — 3 passes to converge on intercept point
    let timeEst = dist / mslSpeed;
    for (let i = 0; i < 3; i++) {
      const predX = contact.x + Math.cos(contact.heading) * tgtSpeed * timeEst;
      const predY = contact.y + Math.sin(contact.heading) * tgtSpeed * timeEst;
      const predDist = Math.sqrt((predX - interceptor.x) ** 2 + (predY - interceptor.y) ** 2);
      timeEst = predDist / mslSpeed;
    }

    const predictX = contact.x + Math.cos(contact.heading) * tgtSpeed * timeEst;
    const predictY = contact.y + Math.sin(contact.heading) * tgtSpeed * timeEst;
    heading = Math.atan2(predictY - interceptor.y, predictX - interceptor.x);
  } else {
    heading = Math.atan2(contact.y - interceptor.y, contact.x - interceptor.x);
  }

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
    maxRange: weaponRange,
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
        setReattackCooldown(missile);
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
  } else if (missile.guidance === 'SARH') {
    // Semi-active radar homing — shooter must illuminate target for entire flight
    const tdx = target.x - missile.x;
    const tdy = target.y - missile.y;

    // Check if shooter is still illuminating the target
    updateMidcourse(missile);
    if (missile.midcourseActive) {
      // Shooter has lock — missile tracks reflected energy
      missile.heading = Math.atan2(tdy, tdx);
      missile.lastKnownTargetPos = { x: target.x, y: target.y };
    } else {
      // Shooter lost lock — SARH missile goes blind immediately (no terminal seeker)
      missile.state = 'MISS';
      missile.resolveTime = state.gameTime;
      state.missilesMissed++;
      setReattackCooldown(missile);
      addLog(`${missile.id} SPARROW LOST ILLUMINATION — MISS`, 'warn');
      return;
    }
  } else if (missile.guidance === 'IR') {
    // IR heat-seeking — continuous tracking, no mid-course phase
    const tdx = target.x - missile.x;
    const tdy = target.y - missile.y;
    const distToTarget = Math.sqrt(tdx * tdx + tdy * tdy);
    const mSpec = MISSILE_TYPES[missile.type];

    if (mSpec.seekerRange && distToTarget <= mSpec.seekerRange) {
      const angleToTarget = Math.atan2(tdy, tdx);
      const aDiff = normalizeAngle(angleToTarget - missile.heading);
      if (Math.abs(aDiff) <= mSpec.seekerCone) {
        missile.heading = angleToTarget;
      } else {
        missile.state = 'MISS';
        missile.resolveTime = state.gameTime;
        state.missilesMissed++;
        setReattackCooldown(missile);
        addLog(`${missile.id} IR SEEKER LOST — ${target.id} EVADED`, 'warn');
        return;
      }
    } else {
      // Beyond seeker range — fly straight (will acquire when closer)
      missile.heading = Math.atan2(tdy, tdx);
    }
  }
  // UNGUIDED — heading stays fixed from launch

  const nmPerSec = missile.speed / 3600;
  const moveAmt = nmPerSec * dSec;
  missile.x += Math.cos(missile.heading) * moveAmt;
  missile.y += Math.sin(missile.heading) * moveAmt;

  // Check arrival — use detonation radius if specified (nuclear Genie = larger)
  const mSpecArrival = MISSILE_TYPES[missile.type];
  const arrivalDist = mSpecArrival.detonationRadius || MISSILE_ARRIVAL_DIST;
  const d = distXY(missile, target);
  if (d <= arrivalDist) {
    resolveMissileArrival(missile);
    return;
  }

  // Timeout — generous time limit based on weapon type
  // Unguided weapons get extra time (fire control lead may require longer flight)
  const timeoutMult = missile.guidance === 'UNGUIDED' ? 4 : 2;
  const maxFlightSec = (missile.maxRange * timeoutMult) / nmPerSec;
  const flightElapsed = (state.gameTime - missile.launchTime) / 1000;
  if (flightElapsed > maxFlightSec) {
    missile.state = 'MISS';
    missile.resolveTime = state.gameTime;
    state.missilesMissed++;
    setReattackCooldown(missile);
    addLog(`${missile.id} ${missile.type} LOST TRACK — MISS`, 'warn');
  }
}

function setReattackCooldown(missile) {
  if (missile.shooter) {
    // CONSERVATIVE discipline: break off after miss, return to CAP
    const shooter = missile.shooter;
    if (shooter.mission && shooter.mission.weaponsDiscipline === 'CONSERVATIVE') {
      shooter.target = null;
      shooter.state = 'CAP';
      shooter.capPoint = null; // resume mission waypoints
      addLog(`${shooter.id} MISS — CONSERVATIVE ROE — RETURNING TO ${shooter.mission.name}`, '');
      return;
    }
    shooter.reattackUntil = state.gameTime + REATTACK_COOLDOWN;
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

      // Clean up formation references
      if (contact.formationRole === 'ESCORT') {
        breakFormation(contact);
      }
      if (contact.formationRole === 'LEAD' && contact.escorts) {
        // Lead destroyed — all escorts break formation
        for (const escort of [...contact.escorts]) {
          if (escort.state === 'ACTIVE') breakFormation(escort);
        }
        addLog(`${contact.formationId || 'FORMATION'} LEAD DOWN — ESCORTS BREAKING`, 'warn');
      }

      if (contact.isCivilian) {
        state.civiliansKilled++;
        contact.classification = 'IDENTIFIED';
        contact.allegiance = 'FRIENDLY';
        contact.classCategory = contact.typeLabel;
        addLog(`■ CIVILIAN AIRCRAFT DESTROYED — ${contact.id} WAS ${contact.typeLabel} ■`, 'alert');
        addLog(`■ CATASTROPHIC ERROR — CIVILIAN SHOOTDOWN ■`, 'alert');
        state.effects.push({ x: contact.x, y: contact.y, type: 'impact', startTime: state.gameTime });
      } else {
        // Nuclear detonation for Genie, standard splash for others
        if (missile.type === 'GENIE') {
          playNuclearDetonation();
        } else {
          playSplash();
        }
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
      playDamageHit();
      const threatSpec = THREAT_TYPES[contact.type];
      addLog(`${missile.id} HIT — ${contact.id} DAMAGED (${threatSpec.label}) — SPEED REDUCED`, 'warn');
      state.effects.push({ x: contact.x, y: contact.y, type: 'damage', startTime: state.gameTime });
    }
  } else {
    // MISS
    missile.state = 'MISS';
    missile.resolveTime = state.gameTime;
    state.missilesMissed++;
    setReattackCooldown(missile);
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
