import { WEAPONS_RANGE, CITY_IMPACT_RADIUS } from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function resolveEngagements() {
  // Check interceptor-threat engagements
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'AIRBORNE' || !interceptor.target) continue;
    const threat = interceptor.target;
    if (threat.state !== 'HOSTILE') {
      // Target already dead — RTB
      interceptor.target = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} TARGET NEUTRALIZED — RTB`, '');
      continue;
    }

    const d = dist(interceptor, threat);
    if (d <= WEAPONS_RANGE) {
      // Engagement — destroy threat
      addLog(`${interceptor.id} WEAPONS RANGE ON ${threat.id} — FOX THREE`, 'alert');
      threat.state = 'NEUTRALIZED';
      state.threatsNeutralized++;
      addLog(`${threat.id} SPLASH — KILL CONFIRMED`, 'alert');

      // Interceptor RTBs after kill
      interceptor.target = null;
      interceptor.state = 'RTB';
    }
  }

  // Check threats reaching cities
  for (const threat of state.threats) {
    if (threat.state !== 'HOSTILE') continue;

    const d = dist(threat, threat.targetCity);
    if (d <= CITY_IMPACT_RADIUS) {
      threat.state = 'IMPACT';
      threat.targetCity.hp = 0;
      state.citiesHit++;
      addLog(`${threat.id} IMPACT — ${threat.targetCity.name} HIT`, 'alert');

      // Any interceptor chasing this threat RTBs
      for (const i of state.interceptors) {
        if (i.target === threat) {
          i.target = null;
          i.state = 'RTB';
        }
      }
    }

    // Also check if threat has gone off-map (missed somehow)
    if (threat.x < -0.05 || threat.x > 1.05 || threat.y < -0.05 || threat.y > 1.05) {
      threat.state = 'NEUTRALIZED'; // just remove it
    }
  }
}

export function checkWinLose() {
  if (state.status !== 'ACTIVE') return;

  const activeThreats = state.threats.filter(t => t.state === 'HOSTILE');
  const allSpawned = state.totalSpawned >= 5; // MAX_THREATS_PER_WAVE

  if (allSpawned && activeThreats.length === 0) {
    // Check if any interceptors are still engaging (shouldn't be, but just in case)
    const livingCities = state.cities.filter(c => c.hp > 0);
    if (livingCities.length > 0) {
      state.status = 'WON';
      addLog('ALL THREATS NEUTRALIZED — SECTOR CLEAR', 'alert');
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
