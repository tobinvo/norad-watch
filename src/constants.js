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

// ═══════════════════════════════════════════
// TIMING
// ═══════════════════════════════════════════

export const SWEEP_PERIOD = 8000; // ms for full rotation
export const SWEEP_TRAIL_ANGLE = Math.PI / 6; // 30 degrees
export const BLIP_FADE_TIME = 3500; // ms after sweep passes

// ═══════════════════════════════════════════
// GAME BALANCE
// ═══════════════════════════════════════════

// Speeds in normalized units per second (map is 0-1)
export const BOMBER_SPEED = 0.012;

// Weapons engagement range (normalized distance)
export const WEAPONS_RANGE = 0.025;

// City damage radius — threat "impacts" when this close
export const CITY_IMPACT_RADIUS = 0.015;

// Spawn timing
export const SPAWN_INTERVAL = 8000; // ms between bomber spawns
export const MAX_THREATS_PER_WAVE = 5;

// Radar center (roughly center of CONUS)
export const RADAR_CENTER_X = 0.42;
export const RADAR_CENTER_Y = 0.46;

// Base radar range (normalized) — default detection radius
export const BASE_RADAR_RANGE = 0.55;
// AWACS extends this by:
export const AWACS_RADAR_BONUS = 0.25;

// Fuel
export const BINGO_FUEL_THRESHOLD = 0.25; // 25% triggers bingo warning

// ═══════════════════════════════════════════
// AIRCRAFT TYPES
// ═══════════════════════════════════════════

export const AIRCRAFT_TYPES = {
  'F-15A': {
    name: 'F-15A Eagle',
    callsign: 'EAGLE',
    speed: 0.035,          // fast
    fuelCapacity: 100,     // max fuel
    fuelBurnRate: 1.2,     // fuel/sec at cruise
    weapons: 4,            // AMRAAMs
    weaponType: 'AMRAAM',
    weaponsRange: 0.025,
  },
  'F-16C': {
    callsign: 'VIPER',
    name: 'F-16C Falcon',
    speed: 0.028,          // medium
    fuelCapacity: 100,
    fuelBurnRate: 1.0,     // better fuel economy
    weapons: 2,            // AMRAAMs
    weaponType: 'AMRAAM',
    weaponsRange: 0.025,
  },
  'F-106A': {
    name: 'F-106A Delta Dart',
    callsign: 'DART',
    speed: 0.032,          // fast
    fuelCapacity: 100,
    fuelBurnRate: 1.8,     // thirsty
    weapons: 1,            // Genie nuclear rocket
    weaponType: 'GENIE',
    weaponsRange: 0.018,   // shorter range
  },
  'E-3A': {
    name: 'E-3A Sentry AWACS',
    callsign: 'SENTRY',
    speed: 0.015,          // slow
    fuelCapacity: 100,
    fuelBurnRate: 0.5,     // long endurance
    weapons: 0,            // no weapons
    weaponType: null,
    weaponsRange: 0,
  },
};

// ═══════════════════════════════════════════
// BASE ROSTERS
// ═══════════════════════════════════════════

export const BASE_ROSTERS = {
  'PETERSON AFB':  ['F-15A', 'F-15A', 'F-16C', 'F-16C', 'E-3A'],
  'LANGLEY AFB':   ['F-15A', 'F-15A', 'F-15A', 'F-106A'],
  'OTIS ANGB':     ['F-16C', 'F-16C', 'F-106A'],
  'ELMENDORF AFB': ['F-15A', 'F-15A', 'F-106A', 'E-3A'],
};
