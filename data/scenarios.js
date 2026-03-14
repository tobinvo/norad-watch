// ═══════════════════════════════════════════
// WAVE DEFINITIONS
// Each wave lists threat types to spawn and
// the delay (ms) between individual spawns.
// ═══════════════════════════════════════════

export const WAVES = [
  {
    threats: ['BOMBER', 'BOMBER', 'BOMBER'],
    spawnDelay: 7000,
  },
  {
    threats: ['BOMBER', 'BOMBER', 'FIGHTER', 'FIGHTER'],
    spawnDelay: 6000,
  },
  {
    threats: ['BOMBER', 'FIGHTER', 'FIGHTER', 'CRUISE_MISSILE', 'CRUISE_MISSILE'],
    spawnDelay: 5500,
  },
  {
    threats: ['BOMBER', 'BOMBER', 'FIGHTER', 'CRUISE_MISSILE', 'CRUISE_MISSILE', 'CRUISE_MISSILE'],
    spawnDelay: 5000,
  },
  {
    threats: ['BOMBER', 'FIGHTER', 'FIGHTER', 'CRUISE_MISSILE', 'CRUISE_MISSILE', 'ICBM'],
    spawnDelay: 4500,
  },
];
