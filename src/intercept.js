import { CITY_IMPACT_RADIUS, THREAT_TYPES, MISSILE_TYPES } from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';
import { isInProsecutionZone } from './sector.js';
import { createMissile } from './entities.js';

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
    if (interceptor.weapons <= 0 && !hasMissileInFlight(interceptor)) {
      interceptor.target = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} WINCHESTER — NO WEAPONS — RTB`, 'warn');
      continue;
    }

    // Target already neutralized — assess
    if (contact.state !== 'ACTIVE') {
      interceptor.target = null;
      if (interceptor.weapons > 0) {
        // Still armed — CAP at current position, available for retasking
        interceptor.state = 'CAP';
        interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
        addLog(`${interceptor.id} TARGET DOWN — ${interceptor.weapons}x ${interceptor.spec.weaponType} REMAINING — AWAITING ORDERS`, '');
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

    // Check range and fire if no missile already in flight
    const d = dist(interceptor, contact);
    const range = interceptor.spec.weaponsRange;
    if (d <= range && !hasMissileInFlight(interceptor)) {
      const mSpec = MISSILE_TYPES[interceptor.spec.weaponType];
      const missile = createMissile(interceptor, contact);
      state.missiles.push(missile);
      interceptor.weapons--;
      state.missilesExpended++;
      addLog(`${interceptor.id} ${mSpec.callsign} — MISSILE AWAY ON ${contact.id}`, 'alert');
    }
  }

  // ── Process missile resolution effects on interceptors ──
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'AIRBORNE' || !interceptor.target) continue;

    const contact = interceptor.target;

    // Target was destroyed (by our missile or someone else's)
    if (contact.state === 'NEUTRALIZED') {
      interceptor.target = null;
      if (interceptor.weapons > 0) {
        interceptor.state = 'CAP';
        interceptor.capPoint = { x: interceptor.x, y: interceptor.y };
        addLog(`${interceptor.id} SPLASH — ${interceptor.weapons}x ${interceptor.spec.weaponType} REMAINING — AWAITING ORDERS`, '');
      } else {
        interceptor.state = 'RTB';
        addLog(`${interceptor.id} WINCHESTER — RTB`, '');
      }
      continue;
    }

    // Target still active but we're out of ammo and no missile in flight
    if (interceptor.weapons <= 0 && !hasMissileInFlight(interceptor)) {
      interceptor.target = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} WINCHESTER — NO WEAPONS — RTB`, 'warn');
    }
    // Otherwise: target still active, interceptor keeps pursuing and will re-fire when in range
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
