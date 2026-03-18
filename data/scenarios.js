// ═══════════════════════════════════════════
// SHIFT-BASED INCIDENT SCHEDULE
// One "shift" = ~45 min game-time.
// Incidents spawn sequentially with minimum delays.
// Each incident waits for: (1) minDelay since last spawn, AND
// (2) if board is clear, an extra cooldown after last threat resolved.
// ═══════════════════════════════════════════

// Incident types:
// SOLO_PROBE     — single bomber/fighter, turns back when intercepted
// PAIR_PROBE     — two contacts from same edge, both probes
// FORMATION_PROBE — escorted bomber, whole formation turns back
// SOLO_ATTACK    — single real attack (bomber, cruise missile, or fighter)
// FORMATION_ATTACK — escorted bomber, keeps coming
// ARM_STRIKE     — ARM launched alongside a bomber (targets radar sites)

// Game-time is in game-ms. At GAME_SPEED=30, 1 real second = 30,000 game-ms.
// 45 min game-time = 2,700,000 game-ms = ~90 real seconds at 1x.

export const SHIFT_DURATION = 2700000; // 45 min game-time

// cooldown: game-ms to wait after board clears before this incident spawns
// minDelay: minimum game-ms since previous incident spawned (pacing floor)

// ── STANDARD — current baseline (16 incidents) ──
export const INCIDENTS = [
  // ── Phase 1: Setup period — first contact after ~10s real ──

  // ── Phase 2: Routine probes — one at a time, breathing room after each ──
  { minDelay: 300000,  cooldown: 120000, type: 'SOLO_PROBE',      threats: ['BOMBER'] },
  { minDelay: 240000,  cooldown: 120000, type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { minDelay: 240000,  cooldown: 120000, type: 'SOLO_PROBE',      threats: ['BOMBER'] },
  { minDelay: 220000,  cooldown: 90000,  type: 'PAIR_PROBE',      threats: ['BOMBER', 'BOMBER'] },

  // ── Phase 3: First real attack mixed in — "this one isn't turning" ──
  { minDelay: 200000,  cooldown: 90000,  type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { minDelay: 200000,  cooldown: 90000,  type: 'SOLO_ATTACK',     threats: ['BOMBER'] },
  { minDelay: 200000,  cooldown: 90000,  type: 'SOLO_PROBE',      threats: ['BOMBER'] },
  { minDelay: 200000,  cooldown: 60000,  type: 'FORMATION_PROBE', threats: ['BOMBER'], escorts: ['FIGHTER'] },

  // ── Phase 4: Tempo increase — shorter gaps, overlaps possible ──
  { minDelay: 180000,  cooldown: 60000,  type: 'SOLO_ATTACK',     threats: ['CRUISE_MISSILE'] },
  { minDelay: 150000,  cooldown: 60000,  type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { minDelay: 150000,  cooldown: 60000,  type: 'FORMATION_ATTACK', threats: ['BOMBER'], escorts: ['FIGHTER', 'FIGHTER'] },
  { minDelay: 150000,  cooldown: 45000,  type: 'ARM_STRIKE',      threats: ['BOMBER', 'ARM'] },

  // ── Phase 5: Final push — defenses stretched ──
  { minDelay: 120000,  cooldown: 45000,  type: 'SOLO_PROBE',      threats: ['BOMBER'] },
  { minDelay: 120000,  cooldown: 30000,  type: 'FORMATION_ATTACK', threats: ['BOMBER'], escorts: ['FIGHTER'], edge: 'northwest' },
  { minDelay: 100000,  cooldown: 30000,  type: 'SOLO_ATTACK',     threats: ['CRUISE_MISSILE'] },
  { minDelay: 100000,  cooldown: 0,      type: 'SOLO_ATTACK',     threats: ['ICBM'] },
];

// ── EASY — training mode (10 incidents, no ARM, no formations, generous gaps) ──
export const INCIDENTS_EASY = [
  { minDelay: 360000,  cooldown: 180000, type: 'SOLO_PROBE',  threats: ['BOMBER'] },
  { minDelay: 300000,  cooldown: 150000, type: 'SOLO_PROBE',  threats: ['FIGHTER'] },
  { minDelay: 300000,  cooldown: 150000, type: 'SOLO_PROBE',  threats: ['BOMBER'] },

  { minDelay: 280000,  cooldown: 120000, type: 'SOLO_PROBE',  threats: ['BOMBER'] },
  { minDelay: 260000,  cooldown: 120000, type: 'SOLO_ATTACK', threats: ['BOMBER'] },
  { minDelay: 260000,  cooldown: 120000, type: 'SOLO_PROBE',  threats: ['FIGHTER'] },

  { minDelay: 240000,  cooldown: 90000,  type: 'SOLO_ATTACK', threats: ['BOMBER'] },
  { minDelay: 240000,  cooldown: 90000,  type: 'SOLO_PROBE',  threats: ['BOMBER'] },
  { minDelay: 220000,  cooldown: 90000,  type: 'SOLO_ATTACK', threats: ['CRUISE_MISSILE'] },
  { minDelay: 220000,  cooldown: 60000,  type: 'SOLO_PROBE',  threats: ['FIGHTER'] },
];

// ── HARD — veteran mode (20 incidents, tight gaps, less breathing room) ──
export const INCIDENTS_HARD = [
  { minDelay: 180000,  cooldown: 60000,  type: 'SOLO_PROBE',      threats: ['BOMBER'] },
  { minDelay: 150000,  cooldown: 60000,  type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { minDelay: 150000,  cooldown: 45000,  type: 'PAIR_PROBE',      threats: ['BOMBER', 'BOMBER'] },

  { minDelay: 150000,  cooldown: 45000,  type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { minDelay: 140000,  cooldown: 45000,  type: 'SOLO_ATTACK',     threats: ['BOMBER'] },
  { minDelay: 140000,  cooldown: 30000,  type: 'FORMATION_PROBE', threats: ['BOMBER'], escorts: ['FIGHTER'] },
  { minDelay: 130000,  cooldown: 30000,  type: 'SOLO_ATTACK',     threats: ['CRUISE_MISSILE'] },

  { minDelay: 130000,  cooldown: 30000,  type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { minDelay: 120000,  cooldown: 30000,  type: 'FORMATION_ATTACK', threats: ['BOMBER'], escorts: ['FIGHTER', 'FIGHTER'] },
  { minDelay: 120000,  cooldown: 20000,  type: 'ARM_STRIKE',      threats: ['BOMBER', 'ARM'] },
  { minDelay: 110000,  cooldown: 20000,  type: 'SOLO_PROBE',      threats: ['BOMBER'] },
  { minDelay: 110000,  cooldown: 20000,  type: 'SOLO_ATTACK',     threats: ['BOMBER'] },

  { minDelay: 100000,  cooldown: 15000,  type: 'FORMATION_ATTACK', threats: ['BOMBER'], escorts: ['FIGHTER'], edge: 'northwest' },
  { minDelay: 100000,  cooldown: 15000,  type: 'SOLO_ATTACK',     threats: ['CRUISE_MISSILE'] },
  { minDelay: 90000,   cooldown: 15000,  type: 'ARM_STRIKE',      threats: ['BOMBER', 'ARM'] },
  { minDelay: 90000,   cooldown: 10000,  type: 'SOLO_PROBE',      threats: ['FIGHTER'] },

  { minDelay: 80000,   cooldown: 10000,  type: 'FORMATION_ATTACK', threats: ['BOMBER'], escorts: ['FIGHTER', 'FIGHTER'], edge: 'north' },
  { minDelay: 80000,   cooldown: 10000,  type: 'SOLO_ATTACK',     threats: ['CRUISE_MISSILE'] },
  { minDelay: 70000,   cooldown: 0,      type: 'ARM_STRIKE',      threats: ['BOMBER', 'ARM'] },
  { minDelay: 60000,   cooldown: 0,      type: 'SOLO_ATTACK',     threats: ['ICBM'] },
];
