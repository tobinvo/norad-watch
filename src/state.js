// ═══════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════

export const state = {
  // Timing
  lastTimestamp: 0,
  gameTime: 0, // total elapsed game-ms

  // Entities
  bases: [],
  contacts: [],           // ALL radar contacts (threats + civilians)
  interceptors: [],
  cities: [],
  radarSites: [],         // { name, x, y, rangeNm }

  // Missiles in flight
  missiles: [],

  // Counters for ID generation
  nextContactNum: 1,
  nextInterceptorNum: 1,
  nextMissileNum: 1,

  // Spawning / Shift
  lastSpawnTime: 0,
  totalSpawned: 0,
  incidentsSpawned: [],   // boolean array tracking which incidents have spawned
  shiftComplete: false,

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

  // Time compression
  timeMultiplier: 1,       // 1x, 2x, 4x, 8x, 16x
  lastAutoPause: 0,        // real timestamp of last auto-pause (cooldown)

  // Weapons Control State
  wcs: 'TIGHT',  // Global: 'FREE', 'TIGHT', 'HOLD'

  // EMCON (Emissions Control) — ground radar state
  emcon: 'ACTIVE',  // 'ACTIVE' (full), 'REDUCED' (50% range), 'SILENT' (off)

  // Game status
  paused: false,
  status: 'ACTIVE',
  threatsNeutralized: 0,
  citiesHit: 0,
  civiliansKilled: 0,
  missilesExpended: 0,
  missilesMissed: 0,

  // Missions (patrol routes)
  missions: [],
  nextMissionNum: 1,
  selectedMission: null,

  // Mission definition mode
  missionDefineMode: false,
  missionDefineBase: null,
  missionDefineWaypoints: [],

  // Formations
  nextFormationNum: 1,

  // Difficulty
  difficulty: 'STANDARD',
};
