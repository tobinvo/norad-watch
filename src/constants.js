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
// A bomber takes ~40s to cross the map vertically
export const BOMBER_SPEED = 0.018;
// Interceptors are ~2.5x faster than bombers
export const INTERCEPTOR_SPEED = 0.045;

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

// ═══════════════════════════════════════════
// ENTITY COUNTS
// ═══════════════════════════════════════════

export const INTERCEPTORS_PER_BASE = 4;
