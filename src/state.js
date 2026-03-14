// ═══════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════

export const state = {
  // Timing
  sweepAngle: 0,
  lastTimestamp: 0,
  gameTime: 0, // total elapsed game-ms

  // Entities
  bases: [],
  contacts: [],           // ALL radar contacts (threats + civilians)
  interceptors: [],
  cities: [],
  radarSites: [],         // { name, x, y, rangeNm }

  // Counters for ID generation
  nextContactNum: 1,
  nextInterceptorNum: 1,

  // Spawning / Waves
  lastSpawnTime: 0,
  totalSpawned: 0,
  currentWave: 0,
  waveSpawnIndex: 0,
  waveActive: false,
  waveBreakUntil: 0,
  wavesComplete: false,

  // Civilian traffic
  lastCivilianSpawn: 0,

  // DEFCON
  defcon: 5,

  // Scoring
  score: 0,

  // Selection state
  selectedBase: null,
  selectedThreat: null,          // selected contact (threat or civilian)
  selectedInterceptor: null,
  selectedReadyInterceptor: null,

  // Radar blip visibility (keyed by entity id)
  blipVisibility: {},

  // Event log entries
  logEntries: [],

  // Visual effects
  effects: [],

  // Game status
  paused: false,
  status: 'ACTIVE',
  threatsNeutralized: 0,
  citiesHit: 0,
  civiliansKilled: 0,
};
