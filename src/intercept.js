import { CITY_IMPACT_RADIUS, THREAT_TYPES, CIVILIAN_KILL_PENALTY } from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';
import { isInProsecutionZone } from './sector.js';

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function resolveEngagements() {
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'AIRBORNE' || !interceptor.target) continue;

    // No weapons
    if (interceptor.weapons <= 0) {
      interceptor.target = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} WINCHESTER — NO WEAPONS — RTB`, 'warn');
      continue;
    }

    const contact = interceptor.target;
    if (contact.state !== 'ACTIVE') {
      interceptor.target = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} TARGET NEUTRALIZED — RTB`, '');
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

    const d = dist(interceptor, contact);
    const range = interceptor.spec.weaponsRange;
    if (d <= range) {
      const weaponName = interceptor.spec.weaponType;
      const callout = weaponName === 'GENIE' ? 'FOX ONE — GENIE' : 'FOX THREE';
      addLog(`${interceptor.id} WEAPONS RANGE ON ${contact.id} — ${callout}`, 'alert');

      interceptor.weapons--;
      contact.state = 'NEUTRALIZED';

      if (contact.isCivilian) {
        // CIVILIAN SHOOTDOWN
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
        addLog(`${contact.id} SPLASH — KILL CONFIRMED (${threatSpec.label})`, 'alert');
        state.effects.push({ x: contact.x, y: contact.y, type: 'kill', startTime: state.gameTime });
      }

      interceptor.target = null;
      if (interceptor.weapons <= 0) {
        interceptor.state = 'RTB';
        addLog(`${interceptor.id} WINCHESTER — RTB`, '');
      } else {
        interceptor.state = 'RTB';
        addLog(`${interceptor.id} ${interceptor.weapons} ${interceptor.spec.weaponType} REMAINING — RTB`, '');
      }
    }
  }

  // Check threats reaching cities (only non-civilian contacts with targets)
  for (const contact of state.contacts) {
    if (contact.state !== 'ACTIVE') continue;

    // Civilians and contacts without city targets don't impact cities
    if (contact.isCivilian || !contact.targetCity) continue;

    const d = dist(contact, contact.targetCity);
    if (d <= CITY_IMPACT_RADIUS) {
      contact.state = 'IMPACT';
      contact.targetCity.hp = 0;
      state.citiesHit++;

      // Reveal type on impact
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
    }

    // Off-map cleanup
    if (!isInProsecutionZone(contact.x, contact.y)) {
      contact.state = 'NEUTRALIZED';
    }
  }

  // Civilian exit cleanup — civilians that leave the sector
  for (const contact of state.contacts) {
    if (contact.state !== 'ACTIVE' || !contact.isCivilian) continue;
    if (!isInProsecutionZone(contact.x, contact.y)) {
      contact.state = 'NEUTRALIZED';
    }
  }
}

export function checkWinLose() {
  if (state.status !== 'ACTIVE') return;

  // Only count non-civilian active contacts for win condition
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
