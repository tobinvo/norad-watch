import { state } from './state.js';
import { THREAT_TYPES, CIVILIAN_KILL_PENALTY } from './constants.js';
import { addLog } from './hud.js';

// ═══════════════════════════════════════════
// DEFCON SYSTEM
// ═══════════════════════════════════════════

export function updateDefcon() {
  const activeThreats = state.contacts.filter(t => t.state === 'ACTIVE' && t.detected && !t.isCivilian).length;
  const oldDefcon = state.defcon;
  let newDefcon = 5;

  if (state.citiesHit >= 2 || state.civiliansKilled > 0) {
    newDefcon = 1;
  } else if (state.citiesHit >= 1 || activeThreats >= 5) {
    newDefcon = 2;
  } else if (activeThreats >= 3 || state.currentWave >= 3) {
    newDefcon = 3;
  } else if (activeThreats >= 1 || state.currentWave >= 1) {
    newDefcon = 4;
  }

  if (newDefcon < state.defcon) {
    state.defcon = newDefcon;
    addLog(`DEFCON ${state.defcon} — ${defconLabel(state.defcon)}`, 'alert');
  }
}

function defconLabel(level) {
  switch (level) {
    case 5: return 'NORMAL READINESS';
    case 4: return 'INCREASED READINESS';
    case 3: return 'ROUND THE CLOCK VIGILANCE';
    case 2: return 'ARMED FORCES READY TO DEPLOY';
    case 1: return 'MAXIMUM FORCE READINESS';
    default: return '';
  }
}

// ═══════════════════════════════════════════
// SCORE CALCULATION
// ═══════════════════════════════════════════

export function calculateFinalScore() {
  let score = 0;
  const breakdown = [];

  // Points per neutralized threat (by type)
  let threatPoints = 0;
  for (const contact of state.contacts) {
    if (contact.state === 'NEUTRALIZED' && !contact.isCivilian) {
      const typeData = THREAT_TYPES[contact.type];
      threatPoints += typeData ? typeData.points : 100;
    }
  }
  score += threatPoints;
  breakdown.push({ label: 'THREATS NEUTRALIZED', value: threatPoints });

  // Cities preserved bonus
  const citiesAlive = state.cities.filter(c => c.hp > 0).length;
  const cityPct = citiesAlive / state.cities.length;
  const cityBonus = Math.round(cityPct * 500);
  score += cityBonus;
  breakdown.push({ label: `CITIES PRESERVED (${citiesAlive}/${state.cities.length})`, value: cityBonus });

  // Aircraft lost penalty
  const crashed = state.interceptors.filter(i => i.state === 'CRASHED').length;
  const crashPenalty = crashed * -75;
  if (crashPenalty < 0) {
    score += crashPenalty;
    breakdown.push({ label: `AIRCRAFT LOST (${crashed})`, value: crashPenalty });
  }

  // Civilian kills — catastrophic penalty
  if (state.civiliansKilled > 0) {
    const civPenalty = state.civiliansKilled * CIVILIAN_KILL_PENALTY;
    score += civPenalty;
    breakdown.push({ label: `CIVILIAN SHOOTDOWN (${state.civiliansKilled})`, value: civPenalty });
  }

  // DEFCON penalty
  if (state.defcon <= 2) {
    const defconPenalty = state.defcon === 1 ? -200 : -100;
    score += defconPenalty;
    breakdown.push({ label: `DEFCON ${state.defcon} PENALTY`, value: defconPenalty });
  }

  // Missile efficiency
  if (state.missilesExpended > 0) {
    const hitRate = (state.missilesExpended - state.missilesMissed) / state.missilesExpended;
    const efficiencyBonus = Math.round(hitRate * 100);
    score += efficiencyBonus;
    breakdown.push({ label: `MISSILE EFFICIENCY (${Math.round(hitRate * 100)}%)`, value: efficiencyBonus });
  }

  // Wasted missiles penalty
  if (state.missilesMissed > 0) {
    const wastePenalty = state.missilesMissed * -15;
    score += wastePenalty;
    breakdown.push({ label: `WASTED MISSILES (${state.missilesMissed})`, value: wastePenalty });
  }

  state.score = Math.max(0, score);
  return { score: state.score, breakdown };
}
