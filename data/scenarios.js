// ═══════════════════════════════════════════
// WAVE DEFINITIONS
// Each wave lists loose threats to spawn sequentially
// and optional formations (groups spawned together).
// Formations: lead bomber + escort fighters from same edge.
// ═══════════════════════════════════════════

export const WAVES = [
  // Wave 1: Probing bombers — no formations, learn the basics
  {
    threats: ['BOMBER', 'BOMBER', 'BOMBER'],
    formations: [],
    spawnDelay: 7000,
  },
  // Wave 2: First escort formation — 1 bomber with 2 fighter escorts + 1 loose bomber
  {
    threats: ['BOMBER'],
    formations: [
      { lead: 'BOMBER', escorts: ['FIGHTER', 'FIGHTER'] },
    ],
    spawnDelay: 6000,
  },
  // Wave 3: Mixed — escorted bomber + loose cruise missiles
  {
    threats: ['CRUISE_MISSILE', 'CRUISE_MISSILE', 'FIGHTER'],
    formations: [
      { lead: 'BOMBER', escorts: ['FIGHTER'] },
    ],
    spawnDelay: 5500,
  },
  // Wave 4: Heavier escort + cruise missile pressure
  {
    threats: ['BOMBER', 'CRUISE_MISSILE', 'CRUISE_MISSILE'],
    formations: [
      { lead: 'BOMBER', escorts: ['FIGHTER', 'FIGHTER'] },
    ],
    spawnDelay: 5000,
  },
  // Wave 5: Coordinated multi-axis — two formations from different edges + ICBM
  {
    threats: ['CRUISE_MISSILE', 'ICBM'],
    formations: [
      { lead: 'BOMBER', escorts: ['FIGHTER'], edge: 'east' },
      { lead: 'BOMBER', escorts: ['FIGHTER'], edge: 'north' },
    ],
    spawnDelay: 4500,
  },
];
