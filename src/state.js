// ═══════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════

export const state = {
  // Timing
  sweepAngle: 0,
  lastTimestamp: 0,
  gameTime: 0, // total elapsed ms

  // Entities
  bases: [],
  threats: [],
  interceptors: [],
  cities: [],

  // Counters for ID generation
  nextThreatNum: 1,
  nextInterceptorNum: 1,

  // Spawning
  lastSpawnTime: 0,
  totalSpawned: 0,

  // Selection state
  selectedBase: null,    // base object or null
  selectedThreat: null,  // threat object or null

  // Radar blip visibility (keyed by entity id)
  blipVisibility: {},

  // Event log entries
  logEntries: [],

  // Game status
  paused: false,
  status: 'ACTIVE', // ACTIVE, WON, LOST
  threatsNeutralized: 0,
  citiesHit: 0,
};
