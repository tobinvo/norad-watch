import { CITY_IMPACT_RADIUS, THREAT_TYPES, MISSILE_TYPES, PATROL_DETECT_RANGE, ARM_IMPACT_RANGE, ESCORT_PROTECT_RANGE, REATTACK_COOLDOWN, TRACKING_AUTOFIRE_DELAY, THREAT_PRIORITY_ORDER, pointInPolygon } from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';
import { isInProsecutionZone } from './sector.js';
import { createMissile, hasRadarTrack, getActiveAWACS, clearMission, getCurrentWeapon, totalWeapons, getActiveEscorts } from './entities.js';
import { getEffectiveWCS } from './input.js';
import { playMissileLaunch, playAlertKlaxon, playRadarDestroyed, playAwacsDown, playCityImpact, updateArmWarning, playRadioChatter } from './audio.js';

// ── Find nearest engageable target for retargeting after a kill ──
function findNearestTarget(interceptor, range) {
  const wcs = getEffectiveWCS(interceptor);
  if (wcs === 'HOLD') return null;

  let nearest = null;
  let nearestDist = Infinity;

  for (const contact of state.contacts) {
    if (contact.state !== 'ACTIVE' || !contact.detected) continue;
    if (contact.allegiance === 'FRIENDLY') continue;
    if (wcs === 'TIGHT' && contact.allegiance !== 'HOSTILE') continue;

    const dx = contact.x - interceptor.x;
    const dy = contact.y - interceptor.y;
    const d = Math.sqrt(dx * dx + dy * dy);

    if (d <= range && d < nearestDist) {
      // If escorted lead, prefer nearest escort
      if (contact.formationRole === 'LEAD') {
        const activeEscorts = getActiveEscorts(contact);
        if (activeEscorts.length > 0) {
          for (const e of activeEscorts) {
            const edx = e.x - interceptor.x;
            const edy = e.y - interceptor.y;
            const ed = Math.sqrt(edx * edx + edy * edy);
            if (ed < nearestDist) { nearest = e; nearestDist = ed; }
          }
          continue;
        }
      }
      nearest = contact;
      nearestDist = d;
    }
  }
  return nearest;
}

// ── Manual fire — called from input.js when player right-clicks a tracked target ──
export function fireWeapon(interceptor) {
  if (interceptor.state !== 'TRACKING' || !interceptor.target) return false;
  const contact = interceptor.target;
  if (contact.state !== 'ACTIVE') return false;

  // Reattack cooldown
  if (state.gameTime < interceptor.reattackUntil) {
    const remainSec = Math.ceil((interceptor.reattackUntil - state.gameTime) / 1000);
    addLog(`${interceptor.id} REATTACK COOLDOWN — ${remainSec}s`, 'warn');
    return false;
  }

  // Already have a missile in flight at this target
  if (hasMissileInFlight(interceptor)) {
    addLog(`${interceptor.id} MISSILE IN FLIGHT — WAIT FOR RESULT`, 'warn');
    return false;
  }

  const weapon = getCurrentWeapon(interceptor);
  if (!weapon) {
    addLog(`${interceptor.id} NO WEAPONS`, 'warn');
    return false;
  }

  // Radar cold check — can't fire radar-guided weapons cold
  const mSpec = MISSILE_TYPES[weapon.type];
  if (interceptor.radarCold && (mSpec.guidance === 'SARH' || mSpec.guidance === 'ACTIVE')) {
    // Try secondary IR weapon instead
    if (interceptor.secondaryWeapons > 0) {
      const secType = interceptor.spec.secondaryWeaponType;
      const secSpec = MISSILE_TYPES[secType];
      if (secSpec && (secSpec.guidance === 'IR' || secSpec.guidance === 'UNGUIDED')) {
        const d = dist(interceptor, contact);
        if (d > interceptor.spec.secondaryWeaponsRange) {
          addLog(`${interceptor.id} ${secType} OUT OF RANGE — ${Math.round(d)}NM`, 'warn');
          return false;
        }
        const missile = createMissile(interceptor, contact, secType, interceptor.spec.secondaryWeaponsRange);
        state.missiles.push(missile);
        interceptor.secondaryWeapons--;
        state.missilesExpended++;
        playMissileLaunch(secType);
        playRadioChatter();
        addLog(`${interceptor.id} ${secSpec.callsign} — MISSILE AWAY ON ${contact.id}`, 'alert');
        return true;
      }
    }
    addLog(`${interceptor.id} RADAR COLD — CANNOT FIRE ${weapon.type}`, 'warn');
    return false;
  }

  // Range check
  const d = dist(interceptor, contact);
  if (d > weapon.range) {
    addLog(`${interceptor.id} ${weapon.type} OUT OF RANGE — ${Math.round(d)}NM`, 'warn');
    return false;
  }

  // Radar track check (SARH/ACTIVE need target in radar cone)
  if (!hasRadarTrack(interceptor, contact)) {
    addLog(`${interceptor.id} NO RADAR TRACK — MANEUVER FOR LOCK`, 'warn');
    return false;
  }

  const missile = createMissile(interceptor, contact, weapon.type, weapon.range);
  state.missiles.push(missile);
  if (weapon.isPrimary) {
    interceptor.weapons--;
  } else {
    interceptor.secondaryWeapons--;
  }
  state.missilesExpended++;
  playMissileLaunch(weapon.type);
  playRadioChatter();
  addLog(`${interceptor.id} ${mSpec.callsign} — MISSILE AWAY ON ${contact.id}`, 'alert');
  return true;
}

function weaponSummary(interceptor) {
  const parts = [];
  if (interceptor.weapons > 0) parts.push(`${interceptor.weapons}x ${interceptor.spec.weaponType}`);
  if (interceptor.secondaryWeapons > 0) parts.push(`${interceptor.secondaryWeapons}x ${interceptor.spec.secondaryWeaponType}`);
  return parts.join(' + ') || 'NONE';
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Check if this interceptor already has a missile in flight toward its target
function hasMissileInFlight(interceptor) {
  return state.missiles.some(m =>
    m.shooter === interceptor && m.target === interceptor.target && m.state === 'FLIGHT'
  );
}

export function resolveEngagements() {
  // ── Escort redirection — interceptors targeting an escorted lead get redirected ──
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'AIRBORNE' || !interceptor.target) continue;
    const contact = interceptor.target;
    if (contact.state !== 'ACTIVE') continue;

    // If targeting a formation lead with active escorts, redirect to nearest escort
    if (contact.formationRole === 'LEAD') {
      const activeEscorts = getActiveEscorts(contact);
      if (activeEscorts.length > 0) {
        let nearest = activeEscorts[0];
        let bestDist = Infinity;
        for (const escort of activeEscorts) {
          const dx = escort.x - interceptor.x;
          const dy = escort.y - interceptor.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < bestDist) { nearest = escort; bestDist = d; }
        }
        if (interceptor.target !== nearest) {
          addLog(`${interceptor.id} REDIRECTED — ${contact.id} ESCORTED — ENGAGING ${nearest.id}`, 'warn');
          interceptor.target = nearest;
        }
      }
    }
  }

  // ── Process interceptor state transitions (AIRBORNE → TRACKING) ──
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'AIRBORNE' && interceptor.state !== 'TRACKING') continue;
    if (!interceptor.target) continue;

    const contact = interceptor.target;

    // No weapons and no missile in flight — winchester
    if (totalWeapons(interceptor) <= 0 && !hasMissileInFlight(interceptor)) {
      interceptor.target = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} WINCHESTER — NO WEAPONS — RTB`, 'warn');
      continue;
    }

    // Target already neutralized — assess and retarget
    if (contact.state !== 'ACTIVE') {
      interceptor.target = null;
      if (totalWeapons(interceptor) > 0) {
        // Try to retarget nearest threat
        const retargetRange = (interceptor.mission && interceptor.mission.engagementRange != null) ? interceptor.mission.engagementRange : PATROL_DETECT_RANGE;
        const next = findNearestTarget(interceptor, retargetRange);
        if (next) {
          interceptor.state = 'AIRBORNE';
          interceptor.target = next;
          addLog(`${interceptor.id} TARGET DOWN — RETARGETING ${next.id}`, 'warn');
        } else if (interceptor.mission) {
          interceptor.state = 'CAP';
          interceptor.capPoint = null;
          if (interceptor.mission.emcon === 'AUTO') interceptor.radarCold = true;
          addLog(`${interceptor.id} TARGET DOWN — RESUMING ${interceptor.mission.name}`, '');
        } else {
          interceptor.state = 'CAP';
          interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
          addLog(`${interceptor.id} TARGET DOWN — ${weaponSummary(interceptor)} REMAINING — AWAITING ORDERS`, '');
        }
      } else {
        interceptor.state = 'RTB';
        addLog(`${interceptor.id} TARGET NEUTRALIZED — RTB`, '');
      }
      continue;
    }

    // ICBM boost phase check
    if (!contact.isCivilian) {
      const threatSpec = THREAT_TYPES[contact.type];
      if (threatSpec && threatSpec.boostDuration && state.gameTime > contact.boostEnd) {
        interceptor.target = null;
        interceptor.state = 'RTB';
        addLog(`${interceptor.id} — ${contact.id} BEYOND INTERCEPT ENVELOPE — RTB`, 'warn');
        continue;
      }
    }

    // AIRBORNE → TRACKING transition: enter tracking when in weapons range
    if (interceptor.state === 'AIRBORNE') {
      const weapon = getCurrentWeapon(interceptor);
      if (weapon) {
        const d = dist(interceptor, contact);
        if (d <= weapon.range) {
          interceptor.state = 'TRACKING';
          interceptor.trackingSince = state.gameTime;
          addLog(`${interceptor.id} TRACKING ${contact.id}`, 'warn');
        }
      }
    }

    // Auto-fire after brief TRACKING delay (modified by weapons discipline)
    if (interceptor.state === 'TRACKING' && interceptor.trackingSince) {
      const discipline = (interceptor.mission && interceptor.mission.weaponsDiscipline) || 'STANDARD';
      const fireDelay = discipline === 'WEAPONS_FREE' ? 0 : TRACKING_AUTOFIRE_DELAY;
      if (state.gameTime - interceptor.trackingSince >= fireDelay) {
        if (!hasMissileInFlight(interceptor) && state.gameTime >= interceptor.reattackUntil) {
          fireWeapon(interceptor);
        }
      }
    }
  }

  // ── Process missile resolution effects on interceptors ──
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'AIRBORNE' && interceptor.state !== 'TRACKING') continue;
    if (!interceptor.target) continue;

    const contact = interceptor.target;

    // Target was destroyed (by our missile or someone else's)
    if (contact.state === 'NEUTRALIZED') {
      interceptor.target = null;
      if (totalWeapons(interceptor) > 0) {
        interceptor.state = 'CAP';
        if (interceptor.mission) {
          interceptor.capPoint = null;
          // AUTO EMCON: go cold when returning to CAP
          if (interceptor.mission.emcon === 'AUTO') interceptor.radarCold = true;
          addLog(`${interceptor.id} SPLASH — RESUMING ${interceptor.mission.name}`, '');
        } else {
          interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
          addLog(`${interceptor.id} SPLASH — ${weaponSummary(interceptor)} REMAINING — AWAITING ORDERS`, '');
        }
      } else {
        interceptor.state = 'RTB';
        addLog(`${interceptor.id} WINCHESTER — RTB`, '');
      }
      continue;
    }

    // Target still active but we're out of ammo and no missile in flight
    if (totalWeapons(interceptor) <= 0 && !hasMissileInFlight(interceptor)) {
      interceptor.target = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} WINCHESTER — NO WEAPONS — RTB`, 'warn');
    }
  }

  // ── ARM warning beeps + impacts on radar sites ──
  // First pass: update warning beeps for all active ARMs
  for (const contact of state.contacts) {
    if (contact.type !== 'ARM' || !contact.targetSite) {
      updateArmWarning(contact.id, 0, false);
      continue;
    }
    if (contact.state !== 'ACTIVE') {
      updateArmWarning(contact.id, 0, false);
      continue;
    }
    let minDist = Infinity;
    for (const site of state.radarSites) {
      if (site.destroyed) continue;
      const dx = contact.x - site.x;
      const dy = contact.y - site.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }
    updateArmWarning(contact.id, minDist, minDist < 50);
  }
  // Second pass: check actual impacts
  for (const contact of state.contacts) {
    if (contact.state !== 'ACTIVE' || contact.type !== 'ARM' || !contact.targetSite) continue;
    for (const site of state.radarSites) {
      if (site.destroyed) continue;
      const dx = contact.x - site.x;
      const dy = contact.y - site.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= ARM_IMPACT_RANGE) {
        contact.state = 'NEUTRALIZED';
        contact.classification = 'IDENTIFIED';
        contact.allegiance = 'HOSTILE';
        contact.classCategory = 'ARM';
        site.destroyed = true;
        state.threatsNeutralized++;

        playRadarDestroyed();
        updateArmWarning(contact.id, 0, false);
        addLog(`■ ${contact.id} ARM IMPACT — ${site.name} DESTROYED ■`, 'alert');
        addLog(`■ RADAR COVERAGE DEGRADED ■`, 'alert');
        state.effects.push({ x: site.x, y: site.y, type: 'impact', startTime: state.gameTime });

        // Release interceptors targeting this contact
        for (const i of state.interceptors) {
          if (i.target === contact) { i.target = null; i.state = 'CAP'; i.capPoint = { x: i.x, y: i.y }; }
        }
        break;
      }
    }
  }

  // ── Check threats attacking AWACS ──
  for (const contact of state.contacts) {
    if (contact.state !== 'ACTIVE' || !contact.targetAWACS) continue;
    for (const awacs of getActiveAWACS()) {
      const d = dist(contact, awacs);
      if (d <= 5) { // 5nm — attack range
        contact.state = 'NEUTRALIZED';
        contact.classification = 'IDENTIFIED';
        contact.allegiance = 'HOSTILE';
        contact.classCategory = THREAT_TYPES[contact.type]?.label || contact.type;

        // AWACS takes damage — crashes
        awacs.fuel = 0;
        awacs.state = 'CRASHED';
        clearMission(awacs);
        state.threatsNeutralized++; // attacker is spent

        playAwacsDown();
        addLog(`■ ${contact.id} ATTACKED ${awacs.id} — AWACS DOWN ■`, 'alert');
        addLog(`■ DATA LINK COVERAGE DEGRADED ■`, 'alert');
        state.effects.push({ x: awacs.x, y: awacs.y, type: 'impact', startTime: state.gameTime });

        // Release any interceptors targeting this contact
        for (const i of state.interceptors) {
          if (i.target === contact) { i.target = null; i.state = 'CAP'; i.capPoint = { x: i.x, y: i.y }; }
        }
        break;
      }
    }
  }

  // ── Check threats reaching cities ──
  for (const contact of state.contacts) {
    if (contact.state !== 'ACTIVE') continue;
    if (!contact.isCivilian && contact.targetCity) {
      const d = dist(contact, contact.targetCity);
      if (d <= CITY_IMPACT_RADIUS) {
        contact.state = 'IMPACT';
        contact.targetCity.hp = 0;
        state.citiesHit++;

        contact.classification = 'IDENTIFIED';
        contact.allegiance = 'HOSTILE';
        const typeLabel = THREAT_TYPES[contact.type]?.label || contact.type;
        contact.classCategory = typeLabel;
        playCityImpact();
        addLog(`${contact.id} ${typeLabel} IMPACT — ${contact.targetCity.name} HIT`, 'alert');
        state.effects.push({ x: contact.targetCity.x, y: contact.targetCity.y, type: 'impact', startTime: state.gameTime });

        for (const i of state.interceptors) {
          if (i.target === contact) {
            i.target = null;
            i.state = 'RTB';
          }
          if (i.idTarget === contact) {
            i.idTarget = null;
            i.idProgress = 0;
            i.state = 'RTB';
          }
        }
        continue;
      }
    }

    // Off-map cleanup — all active contacts (threats AND civilians)
    if (!isInProsecutionZone(contact.x, contact.y)) {
      contact.state = 'NEUTRALIZED';
    }
  }
}

// ── Helper: distance between two entities ──
function distBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Helper: distance from an interceptor to its nearest mission waypoint ──
function distToMissionStation(interceptor) {
  if (!interceptor.mission || !interceptor.mission.waypoints.length) return 0;
  let minD = Infinity;
  for (const wp of interceptor.mission.waypoints) {
    const dx = interceptor.x - wp.x;
    const dy = interceptor.y - wp.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < minD) minD = d;
  }
  return minD;
}

// ── Helper: distance from a contact to its nearest city ──
function distToNearestCity(contact) {
  let minD = Infinity;
  for (const city of state.cities) {
    const dx = contact.x - city.x;
    const dy = contact.y - city.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < minD) minD = d;
  }
  return minD;
}

// ── Helper: sort contacts by mission threat priority ──
function sortByPriority(contacts, priority, interceptor) {
  if (priority === 'BY_TYPE') {
    contacts.sort((a, b) => {
      const aIdx = THREAT_PRIORITY_ORDER.indexOf(a.type);
      const bIdx = THREAT_PRIORITY_ORDER.indexOf(b.type);
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });
  } else if (priority === 'BY_CITY') {
    contacts.sort((a, b) => distToNearestCity(a) - distToNearestCity(b));
  } else {
    // NEAREST (default)
    contacts.sort((a, b) => distBetween(a, interceptor) - distBetween(b, interceptor));
  }
}

// ── Patrol auto-engagement — patrolling interceptors detect and engage ──
export function updatePatrolEngagement() {
  // Group mission aircraft for SPLIT coordination
  const missionEngagements = new Map(); // missionId → Set of contacted target ids already claimed

  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'CAP') continue;
    if (totalWeapons(interceptor) <= 0) continue;
    if (interceptor.type === 'KC-135' || interceptor.type === 'E-3A') continue;

    const baseWcs = getEffectiveWCS(interceptor);
    if (baseWcs === 'HOLD') continue;

    // Already has a missile in flight — don't retask
    if (state.missiles.some(m => m.shooter === interceptor && m.state === 'FLIGHT')) continue;

    // Determine engagement range — mission doctrine or global default
    const mission = interceptor.mission;
    const engageRange = (mission && mission.engagementRange != null) ? mission.engagementRange : PATROL_DETECT_RANGE;
    if (engageRange <= 0) continue; // tanker/AWACS orbits with range=0 don't engage

    // Collect all valid contacts in engagement range
    // Doctrine cascade: per-unit WCS → zone policy → global WCS
    const candidates = [];
    for (const contact of state.contacts) {
      if (contact.state !== 'ACTIVE' || !contact.detected) continue;
      if (contact.allegiance === 'FRIENDLY') continue;

      // Check zone-specific engagement policy for this contact
      let effectiveWcs = baseWcs;
      for (const zone of state.zones) {
        if (zone.assignedMission && mission && zone.assignedMission === mission) {
          if (pointInPolygon(contact.x, contact.y, zone.vertices)) {
            effectiveWcs = zone.engagementPolicy;
            break;
          }
        }
      }
      if (effectiveWcs === 'HOLD') continue;
      if (effectiveWcs === 'TIGHT' && contact.allegiance !== 'HOSTILE') continue;

      const d = distBetween(contact, interceptor);
      if (d <= engageRange) {
        candidates.push(contact);
      }
    }

    if (candidates.length === 0) continue;

    // Sort by mission threat priority
    const priority = (mission && mission.threatPriority) || 'NEAREST';
    sortByPriority(candidates, priority, interceptor);

    // SPLIT mode: skip targets already claimed by mission-mates
    let chosen = null;
    if (mission && mission.engagementMode === 'SPLIT') {
      if (!missionEngagements.has(mission.id)) missionEngagements.set(mission.id, new Set());
      const claimed = missionEngagements.get(mission.id);
      for (const c of candidates) {
        if (!claimed.has(c.id)) {
          chosen = c;
          claimed.add(c.id);
          break;
        }
      }
      if (!chosen) chosen = candidates[0]; // all claimed, double up on highest priority
    } else {
      // CONSOLIDATED or no mission: pick top priority
      chosen = candidates[0];
    }

    if (!chosen) continue;

    // If target is an escorted lead, redirect to nearest escort
    let actualTarget = chosen;
    if (chosen.formationRole === 'LEAD') {
      const activeEscorts = getActiveEscorts(chosen);
      if (activeEscorts.length > 0) {
        let best = activeEscorts[0];
        let bestD = Infinity;
        for (const e of activeEscorts) {
          const d = distBetween(e, interceptor);
          if (d < bestD) { best = e; bestD = d; }
        }
        actualTarget = best;
      }
    }

    interceptor.state = 'AIRBORNE';
    interceptor.target = actualTarget;
    // AUTO EMCON: go hot when engaging
    if (mission && mission.emcon === 'AUTO') interceptor.radarCold = false;
    // Keep mission reference — will return to patrol after kill
    const wcsLabel = actualTarget.allegiance === 'UNKNOWN' ? ' [WCS FREE]' : '';
    const missionLabel = mission ? `${mission.name} ` : '';
    addLog(`${missionLabel}${interceptor.id} ENGAGING ${actualTarget.id}${wcsLabel}`, 'alert');

    // Notification threshold — mission doctrine controls auto-pause
    const shouldPause = !mission || mission.notification !== 'LOG_ONLY';
    if (shouldPause) return true; // signal auto-pause
  }
  return false;
}

// ── Patrol auto-ID — CAP aircraft auto-ID nearby UNKNOWN contacts ──
export function updatePatrolAutoID() {
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'CAP') continue;
    if (interceptor.type === 'KC-135' || interceptor.type === 'E-3A') continue;

    // Determine engagement range — mission doctrine or global default
    const mission = interceptor.mission;
    const engageRange = (mission && mission.engagementRange != null) ? mission.engagementRange : PATROL_DETECT_RANGE;
    if (engageRange <= 0) continue;

    // Check if anyone is already ID-ing a contact — avoid double-teaming
    const alreadyBeingIDed = new Set();
    for (const i of state.interceptors) {
      if (i.state === 'ID_MISSION' && i.idTarget) alreadyBeingIDed.add(i.idTarget.id);
    }

    // Find nearest UNKNOWN contact within engagement range
    let nearest = null;
    let nearestDist = Infinity;
    for (const contact of state.contacts) {
      if (contact.state !== 'ACTIVE' || !contact.detected) continue;
      if (contact.allegiance !== 'UNKNOWN') continue;
      if (alreadyBeingIDed.has(contact.id)) continue;

      const d = distBetween(contact, interceptor);
      if (d <= engageRange && d < nearestDist) {
        nearest = contact;
        nearestDist = d;
      }
    }

    if (!nearest) continue;

    interceptor.state = 'ID_MISSION';
    interceptor.idTarget = nearest;
    interceptor.idProgress = 0;
    const missionLabel = mission ? `${mission.name} ` : '';
    addLog(`${missionLabel}${interceptor.id} INVESTIGATING ${nearest.id}`, 'warn');
    return true; // signal auto-pause
  }
  return false;
}

// ── Pursuit leash check — break off retreating contacts beyond leash distance ──
export function checkPursuitLeash() {
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'AIRBORNE' && interceptor.state !== 'TRACKING') continue;
    if (!interceptor.target || !interceptor.mission) continue;

    const mission = interceptor.mission;
    if (!mission.pursuitLeash || mission.pursuitLeash <= 0) continue;

    // Only leash on retreating contacts (probes turning back)
    if (!interceptor.target.turnedBack) continue;

    const stationDist = distToMissionStation(interceptor);
    if (stationDist > mission.pursuitLeash) {
      interceptor.target = null;
      interceptor.state = 'CAP';
      interceptor.capPoint = null; // resume mission waypoints
      addLog(`${interceptor.id} BREAKING PURSUIT — RETURNING TO ${mission.name}`, '');
    }
  }
}

export function checkWinLose() {
  if (state.status !== 'ACTIVE') return;

  const activeThreats = state.contacts.filter(t => t.state === 'ACTIVE' && !t.isCivilian);

  if (state.shiftComplete && activeThreats.length === 0) {
    const livingCities = state.cities.filter(c => c.hp > 0);
    if (livingCities.length > 0) {
      state.status = 'WON';
      addLog('SHIFT COMPLETE — SECTOR SECURE', 'alert');
      addLog(`CITIES PRESERVED: ${livingCities.length}/${state.cities.length}`, '');
    } else {
      state.status = 'LOST';
      addLog('ALL CITIES DESTROYED — DEFENSE FAILURE', 'alert');
    }
  }

  const livingCities = state.cities.filter(c => c.hp > 0);
  if (livingCities.length === 0 && state.cities.length > 0) {
    state.status = 'LOST';
    addLog('ALL CITIES DESTROYED — DEFENSE FAILURE', 'alert');
  }
}
