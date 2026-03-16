// ═══════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════

export const GREEN_BRIGHT = '#00ff41';
export const GREEN_MID = '#00cc33';
export const GREEN_DIM = '#003b0f';
export const GREEN_MAP = '#005a1a';
export const GREEN_TEXT = '#00dd38';
export const RED_ALERT = '#ff4444';
export const YELLOW_WARN = '#ffcc00';
export const AMBER = '#ff8800';

// ═══════════════════════════════════════════
// TIMING
// ═══════════════════════════════════════════

export const SWEEP_PERIOD = 8000; // ms for full rotation (real-time)
export const SWEEP_TRAIL_ANGLE = Math.PI / 6; // 30 degrees
export const BLIP_FADE_TIME = 3500; // ms after sweep passes (real-time)

// Game time multiplier: 1 real second = GAME_SPEED game-seconds
export const GAME_SPEED = 30;

// Time compression steps
export const TIME_STEPS = [1, 2, 4, 8, 16];
export const AUTO_PAUSE_COOLDOWN = 2000; // real-ms between auto-pauses

// ═══════════════════════════════════════════
// GAME BALANCE (all distances in nautical miles)
// ═══════════════════════════════════════════

export const CITY_IMPACT_RADIUS = 5;
export const AWACS_DETECTION_RANGE = 200;
export const ARRIVAL_THRESHOLD = 3; // nm — "close enough" for RTB/CAP

// ═══════════════════════════════════════════
// CLASSIFICATION & IFF
// ═══════════════════════════════════════════

export const SWEEPS_TO_CLASSIFY = 3;    // radar sweeps before auto-classification
export const ID_RANGE = 5;              // nm — visual ID distance
export const ID_TIME = 10;             // game-seconds to complete visual ID
export const CIVILIAN_KILL_PENALTY = -500;

// ═══════════════════════════════════════════
// CIVILIAN TRAFFIC
// ═══════════════════════════════════════════

export const CIVILIAN_SPAWN_INTERVAL = 600000; // game-ms between spawns (~20s real at 30x)
export const CIVILIAN_START_COUNT = 3;          // civilians pre-placed at game start

export const CIVILIAN_TYPES = {
  AIRLINER: {
    speed: [450, 550],
    altitude: [33000, 41000],
    label: 'AIRLINER',
  },
  REGIONAL: {
    speed: [350, 430],
    altitude: [25000, 33000],
    label: 'REGIONAL JET',
  },
  CARGO: {
    speed: [420, 500],
    altitude: [30000, 39000],
    label: 'CARGO',
  },
};

// ═══════════════════════════════════════════
// THREAT TYPES — speeds in knots
// ═══════════════════════════════════════════

export const THREAT_TYPES = {
  BOMBER: {
    speed: 480,
    altitudeMin: 35000,
    altitudeMax: 45000,
    label: 'BOMBER',
    points: 100,
    emitting: true,           // carries radar/nav emissions — ESM detectable
    jamming: true,            // carries ECM jammer
    jamRange: 30,             // nm — jamming degrades radar within this radius
  },
  FIGHTER: {
    speed: 720,
    altitudeMin: 25000,
    altitudeMax: 35000,
    label: 'FIGHTER',
    points: 150,
    evasionChance: 0.5,
    evasionRange: 30,
    evasionCooldown: 3000,
    emitting: true,           // carries radar — ESM detectable
  },
  CRUISE_MISSILE: {
    speed: 550,
    altitudeMin: 100,
    altitudeMax: 500,
    label: 'CRSMSL',
    points: 200,
    detectionRange: 40,
    emitting: false,          // passive seeker — no emissions
  },
  ICBM: {
    speed: 15000,
    altitudeMin: 100000,
    altitudeMax: 300000,
    label: 'ICBM',
    points: 500,
    boostDuration: 45000,
    emitting: false,          // ballistic — no emissions
  },
  ARM: {
    speed: 900,
    altitudeMin: 500,
    altitudeMax: 5000,
    label: 'ARM',
    points: 250,
    detectionRange: 50,       // small radar cross-section — reduced detection range
    emitting: true,           // anti-radiation seeker emits — ESM detectable
    targetsSite: true,        // homes on radar sites, not cities
  },
};

// ═══════════════════════════════════════════
// WAVE SYSTEM (game-ms)
// ═══════════════════════════════════════════

export const WAVE_BREAK = 90000;
export const WAVE_FIRST_DELAY = 45000;

// ═══════════════════════════════════════════
// AIRCRAFT TYPES — speeds in knots
// Fuel rebalanced for nm-scale sector (500nm across)
// ═══════════════════════════════════════════

export const AIRCRAFT_TYPES = {
  'F-15A': {
    name: 'F-15A Eagle',
    callsign: 'EAGLE',
    role: 'AIR SUPERIORITY',
    desc: 'Fast, heavy loadout. 4 Sparrows (must hold lock) + 4 Sidewinders. Best radar. Burns fuel.',
    speed: 900,
    fuelCapacity: 100,
    fuelBurnRate: 0.04,     // ~83s real endurance, 300nm round trip
    weapons: 4,
    weaponType: 'SPARROW',
    weaponsRange: 20,
    secondaryWeapons: 4,
    secondaryWeaponType: 'SIDEWINDER',
    secondaryWeaponsRange: 10,
    radarRange: 60,                   // nm — AN/APG-63
    radarCone: Math.PI / 3,           // 60° half-angle = 120° total
    radarClassifyTime: 5,             // game-seconds to classify a contact in radar cone
    speedRating: 3,
    rangeRating: 2,
    enduranceRating: 2,
    turnaroundTime: 900,    // game-seconds (~30s real at 1x)
    maxSorties: 4,
  },
  'F-16C': {
    name: 'F-16C Falcon',
    callsign: 'VIPER',
    role: 'MULTIROLE',
    desc: 'Fire-and-forget AMRAAMs + Sidewinder backup. Good endurance. Reliable workhorse.',
    speed: 780,
    fuelCapacity: 100,
    fuelBurnRate: 0.028,    // ~119s real endurance, 390nm round trip
    weapons: 2,
    weaponType: 'AMRAAM',
    weaponsRange: 25,
    secondaryWeapons: 4,
    secondaryWeaponType: 'SIDEWINDER',
    secondaryWeaponsRange: 10,
    radarRange: 40,                   // nm — AN/APG-68
    radarCone: Math.PI / 4,           // 45° half-angle = 90° total
    radarClassifyTime: 8,             // game-seconds to classify a contact in radar cone
    speedRating: 2,
    rangeRating: 2,
    enduranceRating: 3,
    turnaroundTime: 600,    // game-seconds (~20s real at 1x)
    maxSorties: 5,
  },
  'F-106A': {
    name: 'F-106A Delta Dart',
    callsign: 'DART',
    role: 'INTERCEPTOR',
    desc: 'Fast interceptor. 1 nuclear Genie + 2 IR Falcons. Fire control computes lead. Old radar.',
    speed: 850,
    fuelCapacity: 100,
    fuelBurnRate: 0.065,    // ~51s real endurance, 177nm round trip
    weapons: 1,
    weaponType: 'GENIE',
    weaponsRange: 8,
    secondaryWeapons: 2,
    secondaryWeaponType: 'FALCON',
    secondaryWeaponsRange: 5,
    radarRange: 30,                   // nm — MA-1 (old tech)
    radarCone: Math.PI / 6,           // 30° half-angle = 60° total
    radarClassifyTime: 12,            // game-seconds to classify (old radar, slow)
    speedRating: 3,
    rangeRating: 1,
    enduranceRating: 1,
    turnaroundTime: 1200,   // game-seconds (~40s real at 1x)
    maxSorties: 3,
  },
  'E-3A': {
    name: 'E-3A Sentry AWACS',
    callsign: 'SENTRY',
    role: 'EARLY WARNING',
    desc: 'No weapons. 200nm radar + data link hub. Losing it blinds forward fighters.',
    speed: 360,
    fuelCapacity: 100,
    fuelBurnRate: 0.014,    // ~238s real endurance, 360nm round trip
    weapons: 0,
    weaponType: null,
    weaponsRange: 0,
    radarRange: 0,                    // AWACS detection handled separately
    radarCone: 0,
    speedRating: 1,
    rangeRating: 0,
    enduranceRating: 3,
    turnaroundTime: 1800,   // game-seconds (~60s real at 1x)
    maxSorties: 2,
  },
  'KC-135': {
    name: 'KC-135 Stratotanker',
    callsign: 'TEXACO',
    role: 'AERIAL REFUELING',
    desc: 'No weapons, no radar. Extends fighter endurance. Position carefully.',
    speed: 450,
    fuelCapacity: 100,
    fuelBurnRate: 0.012,    // ~277s real endurance
    weapons: 0,
    weaponType: null,
    weaponsRange: 0,
    radarRange: 0,
    radarCone: 0,
    speedRating: 1,
    rangeRating: 0,
    enduranceRating: 3,
    turnaroundTime: 1800,   // game-seconds (~60s real at 1x)
    maxSorties: 2,
  },
};

// ═══════════════════════════════════════════
// MISSILE TYPES
// ═══════════════════════════════════════════

export const MISSILE_TYPES = {
  SPARROW: {
    name: 'AIM-7 Sparrow',
    speed: 1100,          // ~Mach 3.5
    guidance: 'SARH',     // semi-active radar homing — shooter must maintain radar lock throughout
    basePk: 0.55,
    callsign: 'FOX ONE',
    seekerRange: 10,      // nm — seeker tracks reflected radar energy
    seekerCone: Math.PI / 5, // 36° half-angle
  },
  AMRAAM: {
    name: 'AIM-120 AMRAAM',
    speed: 1200,          // ~Mach 4
    guidance: 'ACTIVE',   // mid-course from shooter, terminal active seeker — fire and forget
    basePk: 0.70,
    callsign: 'FOX THREE',
    seekerRange: 15,      // nm — seeker activates for terminal guidance
    seekerCone: Math.PI / 6, // 30° half-angle
  },
  SIDEWINDER: {
    name: 'AIM-9 Sidewinder',
    speed: 1000,          // ~Mach 2.5
    guidance: 'IR',       // infrared heat-seeking — no radar lock needed
    basePk: 0.65,
    callsign: 'FOX TWO',
    seekerRange: 8,       // nm — IR seeker acquisition
    seekerCone: Math.PI / 4, // 45° half-angle (wide IR FOV)
  },
  GENIE: {
    name: 'AIR-2 Genie',
    speed: 800,           // ~Mach 3 (slower visual speed for playability)
    guidance: 'UNGUIDED', // fixed bearing from launch, nuclear detonation by proximity
    basePk: 0.95,         // nuclear warhead
    callsign: 'FOX ONE — GENIE',
    seekerRange: 0,
    seekerCone: 0,
    detonationRadius: 3,  // nm — nuclear proximity detonation
  },
  FALCON: {
    name: 'AIM-4 Falcon',
    speed: 1000,          // ~Mach 3
    guidance: 'IR',       // infrared heat-seeking — historically unreliable
    basePk: 0.40,
    callsign: 'FOX TWO — FALCON',
    seekerRange: 5,       // nm — IR seeker acquisition
    seekerCone: Math.PI / 4, // 45° half-angle
  },
};

// Pk modifiers by target type
export const PK_TARGET_MODIFIERS = {
  BOMBER: 1.0,
  FIGHTER: 0.65,
  CRUISE_MISSILE: 0.50,
  ICBM: 0.30,
  ARM: 0.40,              // small, fast — hard to hit
};

// Destroy vs cripple chance on hit (chance to destroy outright)
export const DAMAGE_DESTROY_CHANCE = {
  BOMBER: 0.55,
  FIGHTER: 0.75,
  CRUISE_MISSILE: 1.0,   // always destroy
  ICBM: 1.0,             // always destroy
  ARM: 1.0,              // always destroy (small missile)
};

export const MISSILE_ARRIVAL_DIST = 1.5; // nm — missile "arrives" at target

// ═══════════════════════════════════════════
// TANKER REFUELING
// ═══════════════════════════════════════════

export const PATROL_DETECT_RANGE = 40;    // nm — patrolling interceptors auto-engage within this range

// EMCON range multipliers
export const EMCON_RANGE_MULT = { ACTIVE: 1.0, REDUCED: 0.5, SILENT: 0 };

// ESM (Electronic Support Measures) — passive detection of emitting threats
export const ESM_DETECT_RANGE = 120;      // nm — passive detection range for emitting threats
export const ESM_ALPHA = 0.35;            // blip visibility for ESM-only contacts (dim, uncertain)

// ECM (Electronic Countermeasures) — jamming
export const JAM_ALPHA_MULT = 0.5;        // blip alpha multiplied when jammed
export const JAM_CLASSIFY_MULT = 0.5;     // sweep classification counts at half rate when jammed
export const JAM_BURNTHROUGH = 0.4;       // at 40% of radar range, jamming is overcome
export const JAM_POSITION_JITTER = 8;     // nm — max position error on jammed contacts

// SEAD
export const ARM_IMPACT_RANGE = 3;        // nm — ARM destroys radar site within this range
export const ARM_SPAWN_CHANCE = 0.35;     // chance per wave 3+ bomber spawn to also spawn an ARM

// Formations
export const ESCORT_OFFSET_DISTANCE = 8;  // nm — how far escorts fly from lead
export const ESCORT_COHESION_RANGE = 20;  // nm — escorts beyond this from lead are "broken"
export const ESCORT_PROTECT_RANGE = 15;   // nm — interceptors within this of lead get redirected to escorts

// Data link & radar
export const DATA_LINK_RANGE = 200;        // nm from AWACS — fighters within this share sensor data
export const FIGHTER_ORBIT_RATE = Math.PI / 4; // rads/game-sec — radar sweep rate when orbiting CAP point
export const MIDCOURSE_LOST_PK_MOD = 0.5;  // Pk multiplier when mid-course guidance is lost

export const TANKER_REFUEL_RANGE = 5;       // nm — fighters within this of an on-station tanker get fuel
export const TANKER_REFUEL_RATE = 0.15;     // fuel units per game-second restored to receiving fighter
export const TANKER_REFUEL_TARGET = 0.90;   // refuel to 90% of fuelMax
