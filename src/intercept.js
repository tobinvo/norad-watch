import { CITY_IMPACT_RADIUS, THREAT_TYPES, MISSILE_TYPES, PATROL_DETECT_RANGE, ARM_IMPACT_RANGE } from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';
import { isInProsecutionZone } from './sector.js';
import { createMissile, hasRadarTrack, getActiveAWACS, clearMission, getCurrentWeapon, totalWeapons } from './entities.js';
import { getEffectiveWCS } from './input.js';

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
  // ── Process interceptor missile launches ──
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'AIRBORNE' || !interceptor.target) continue;

    const contact = interceptor.target;

    // No weapons and no missile in flight — winchester
    if (totalWeapons(interceptor) <= 0 && !hasMissileInFlight(interceptor)) {
      interceptor.target = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} WINCHESTER — NO WEAPONS — RTB`, 'warn');
      continue;
    }

    // Target already neutralized — assess
    if (contact.state !== 'ACTIVE') {
      interceptor.target = null;
      if (totalWeapons(interceptor) > 0) {
        interceptor.state = 'CAP';
        if (interceptor.mission) {
          interceptor.capPoint = null;
          addLog(`${interceptor.id} TARGET DOWN — RESUMING ${interceptor.mission.name}`, '');
        } else {
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

    // Check range, radar track, and fire if no missile already in flight
    const weapon = getCurrentWeapon(interceptor);
    if (weapon && !hasMissileInFlight(interceptor) && hasRadarTrack(interceptor, contact)) {
      const d = dist(interceptor, contact);
      if (d <= weapon.range) {
        const mSpec = MISSILE_TYPES[weapon.type];
        const missile = createMissile(interceptor, contact, weapon.type, weapon.range);
        state.missiles.push(missile);
        if (weapon.isPrimary) {
          interceptor.weapons--;
        } else {
          interceptor.secondaryWeapons--;
        }
        state.missilesExpended++;
        addLog(`${interceptor.id} ${mSpec.callsign} — MISSILE AWAY ON ${contact.id}`, 'alert');
      }
    }
  }

  // ── Process missile resolution effects on interceptors ──
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'AIRBORNE' || !interceptor.target) continue;

    const contact = interceptor.target;

    // Target was destroyed (by our missile or someone else's)
    if (contact.state === 'NEUTRALIZED') {
      interceptor.target = null;
      if (totalWeapons(interceptor) > 0) {
        interceptor.state = 'CAP';
        if (interceptor.mission) {
          interceptor.capPoint = null;
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
    // Otherwise: target still active, interceptor keeps pursuing and will re-fire when in range
  }

  // ── Check ARM impacts on radar sites ──
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

// ── Patrol auto-engagement — patrolling interceptors detect and engage ──
export function updatePatrolEngagement() {
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'CAP') continue;
    if (totalWeapons(interceptor) <= 0) continue;
    if (interceptor.type === 'KC-135' || interceptor.type === 'E-3A') continue;

    const wcs = getEffectiveWCS(interceptor);
    if (wcs === 'HOLD') continue;

    // Already has a missile in flight — don't retask
    if (state.missiles.some(m => m.shooter === interceptor && m.state === 'FLIGHT')) continue;

    let nearest = null;
    let nearestDist = Infinity;

    for (const contact of state.contacts) {
      if (contact.state !== 'ACTIVE' || !contact.detected) continue;
      if (contact.allegiance === 'FRIENDLY') continue;
      if (wcs === 'TIGHT' && contact.allegiance !== 'HOSTILE') continue;

      const dx = contact.x - interceptor.x;
      const dy = contact.y - interceptor.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d <= PATROL_DETECT_RANGE && d < nearestDist) {
        nearest = contact;
        nearestDist = d;
      }
    }

    if (nearest) {
      interceptor.state = 'AIRBORNE';
      interceptor.target = nearest;
      // Keep mission reference — will return to patrol after kill
      const wcsLabel = nearest.allegiance === 'UNKNOWN' ? ' [WCS FREE]' : '';
      addLog(`${interceptor.mission.name} ${interceptor.id} ENGAGING ${nearest.id}${wcsLabel}`, 'alert');
      return true; // signal auto-pause
    }
  }
  return false;
}

export function checkWinLose() {
  if (state.status !== 'ACTIVE') return;

  const activeThreats = state.contacts.filter(t => t.state === 'ACTIVE' && !t.isCivilian);

  if (state.wavesComplete && activeThreats.length === 0) {
    const livingCities = state.cities.filter(c => c.hp > 0);
    if (livingCities.length > 0) {
      state.status = 'WON';
      addLog('ALL WAVES NEUTRALIZED — SECTOR CLEAR', 'alert');
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
