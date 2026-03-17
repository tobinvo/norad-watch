// ═══════════════════════════════════════════
// SHIFT-BASED INCIDENT SCHEDULE
// One "shift" = ~45 min game-time.
// Incidents spawn at scheduled game-time offsets.
// Each incident defines what contacts appear.
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

// ── STANDARD — current baseline (16 incidents) ──
export const INCIDENTS = [
  // ── Phase 1: Setup period (0-3 min) — no contacts, establish CAP ──

  // ── Phase 2: Routine probes (3-15 min) — build the rhythm ──
  { time: 180000,  type: 'SOLO_PROBE',      threats: ['BOMBER'] },
  { time: 330000,  type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { time: 520000,  type: 'PAIR_PROBE',      threats: ['BOMBER', 'BOMBER'] },
  { time: 700000,  type: 'SOLO_PROBE',      threats: ['BOMBER'] },

  // ── Phase 3: First real attack mixed in (15-25 min) — "this one isn't turning" ──
  { time: 900000,  type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { time: 1050000, type: 'SOLO_ATTACK',     threats: ['BOMBER'] },
  { time: 1200000, type: 'SOLO_PROBE',      threats: ['BOMBER'] },
  { time: 1400000, type: 'FORMATION_PROBE', threats: ['BOMBER'], escorts: ['FIGHTER'] },

  // ── Phase 4: Tempo increase (25-37 min) — more attacks, SEAD, shorter gaps ──
  { time: 1550000, type: 'SOLO_ATTACK',     threats: ['CRUISE_MISSILE'] },
  { time: 1650000, type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { time: 1800000, type: 'FORMATION_ATTACK', threats: ['BOMBER'], escorts: ['FIGHTER', 'FIGHTER'] },
  { time: 1950000, type: 'ARM_STRIKE',      threats: ['BOMBER', 'ARM'] },
  { time: 2100000, type: 'SOLO_PROBE',      threats: ['BOMBER'] },

  // ── Phase 5: Final push (37-45 min) — defenses stretched ──
  { time: 2250000, type: 'FORMATION_ATTACK', threats: ['BOMBER'], escorts: ['FIGHTER'], edge: 'northwest' },
  { time: 2350000, type: 'SOLO_ATTACK',     threats: ['CRUISE_MISSILE'] },
  { time: 2500000, type: 'SOLO_ATTACK',     threats: ['ICBM'] },
];

// ── EASY — training mode (10 incidents, no ARM, no formations, wider gaps) ──
export const INCIDENTS_EASY = [
  // Slow start, generous spacing
  { time: 240000,  type: 'SOLO_PROBE',  threats: ['BOMBER'] },
  { time: 480000,  type: 'SOLO_PROBE',  threats: ['FIGHTER'] },
  { time: 720000,  type: 'SOLO_PROBE',  threats: ['BOMBER'] },

  // First attack late and solo
  { time: 1050000, type: 'SOLO_PROBE',  threats: ['BOMBER'] },
  { time: 1350000, type: 'SOLO_ATTACK', threats: ['BOMBER'] },
  { time: 1600000, type: 'SOLO_PROBE',  threats: ['FIGHTER'] },

  // Light final stretch
  { time: 1900000, type: 'SOLO_ATTACK', threats: ['BOMBER'] },
  { time: 2100000, type: 'SOLO_PROBE',  threats: ['BOMBER'] },
  { time: 2300000, type: 'SOLO_ATTACK', threats: ['CRUISE_MISSILE'] },
  { time: 2500000, type: 'SOLO_PROBE',  threats: ['FIGHTER'] },
];

// ── HARD — veteran mode (20 incidents, more attacks, compressed timing, extra SEAD) ──
export const INCIDENTS_HARD = [
  // Quick probes, shorter setup window
  { time: 120000,  type: 'SOLO_PROBE',      threats: ['BOMBER'] },
  { time: 250000,  type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { time: 400000,  type: 'PAIR_PROBE',      threats: ['BOMBER', 'BOMBER'] },

  // Early first attack
  { time: 600000,  type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { time: 750000,  type: 'SOLO_ATTACK',     threats: ['BOMBER'] },
  { time: 900000,  type: 'FORMATION_PROBE', threats: ['BOMBER'], escorts: ['FIGHTER'] },
  { time: 1050000, type: 'SOLO_ATTACK',     threats: ['CRUISE_MISSILE'] },

  // Sustained pressure
  { time: 1200000, type: 'SOLO_PROBE',      threats: ['FIGHTER'] },
  { time: 1350000, type: 'FORMATION_ATTACK', threats: ['BOMBER'], escorts: ['FIGHTER', 'FIGHTER'] },
  { time: 1450000, type: 'ARM_STRIKE',      threats: ['BOMBER', 'ARM'] },
  { time: 1550000, type: 'SOLO_PROBE',      threats: ['BOMBER'] },
  { time: 1650000, type: 'SOLO_ATTACK',     threats: ['BOMBER'] },

  // Multi-axis assault
  { time: 1800000, type: 'FORMATION_ATTACK', threats: ['BOMBER'], escorts: ['FIGHTER'], edge: 'northwest' },
  { time: 1850000, type: 'SOLO_ATTACK',     threats: ['CRUISE_MISSILE'] },
  { time: 1950000, type: 'ARM_STRIKE',      threats: ['BOMBER', 'ARM'] },
  { time: 2050000, type: 'SOLO_PROBE',      threats: ['FIGHTER'] },

  // Final push — everything at once
  { time: 2200000, type: 'FORMATION_ATTACK', threats: ['BOMBER'], escorts: ['FIGHTER', 'FIGHTER'], edge: 'north' },
  { time: 2300000, type: 'SOLO_ATTACK',     threats: ['CRUISE_MISSILE'] },
  { time: 2400000, type: 'ARM_STRIKE',      threats: ['BOMBER', 'ARM'] },
  { time: 2550000, type: 'SOLO_ATTACK',     threats: ['ICBM'] },
];
