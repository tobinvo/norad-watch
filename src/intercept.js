import { CITY_IMPACT_RADIUS, MAX_THREATS_PER_WAVE } from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function resolveEngagements() {
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'AIRBORNE' || !interceptor.target) continue;

    // No weapons — can't engage (AWACS or spent aircraft)
    if (interceptor.weapons <= 0) {
      interceptor.target = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} WINCHESTER — NO WEAPONS — RTB`, 'warn');
      continue;
    }

    const threat = interceptor.target;
    if (threat.state !== 'HOSTILE') {
      interceptor.target = null;
      interceptor.state = 'RTB';
      addLog(`${interceptor.id} TARGET NEUTRALIZED — RTB`, '');
      continue;
    }

    const d = dist(interceptor, threat);
    const range = interceptor.spec.weaponsRange;
    if (d <= range) {
      const weaponName = interceptor.spec.weaponType;
      const callout = weaponName === 'GENIE' ? 'FOX ONE — GENIE' : 'FOX THREE';
      addLog(`${interceptor.id} WEAPONS RANGE ON ${threat.id} — ${callout}`, 'alert');

      interceptor.weapons--;
      threat.state = 'NEUTRALIZED';
      state.threatsNeutralized++;
      addLog(`${threat.id} SPLASH — KILL CONFIRMED`, 'alert');
      state.effects.push({ x: threat.x, y: threat.y, type: 'kill', startTime: state.gameTime });

      interceptor.target = null;
      // RTB if out of weapons, otherwise available for reassignment
      if (interceptor.weapons <= 0) {
        interceptor.state = 'RTB';
        addLog(`${interceptor.id} WINCHESTER — RTB`, '');
      } else {
        interceptor.state = 'RTB';
        addLog(`${interceptor.id} ${interceptor.weapons} ${interceptor.spec.weaponType} REMAINING — RTB`, '');
      }
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
      state.effects.push({ x: threat.targetCity.x, y: threat.targetCity.y, type: 'impact', startTime: state.gameTime });

      for (const i of state.interceptors) {
        if (i.target === threat) {
          i.target = null;
          i.state = 'RTB';
        }
      }
    }

    // Off-map cleanup
    if (threat.x < -0.05 || threat.x > 1.05 || threat.y < -0.05 || threat.y > 1.05) {
      threat.state = 'NEUTRALIZED';
    }
  }
}

export function checkWinLose() {
  if (state.status !== 'ACTIVE') return;

  const activeThreats = state.threats.filter(t => t.state === 'HOSTILE');
  const allSpawned = state.totalSpawned >= MAX_THREATS_PER_WAVE;

  if (allSpawned && activeThreats.length === 0) {
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
