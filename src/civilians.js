import { CIVILIAN_SPAWN_INTERVAL, CIVILIAN_START_COUNT } from './constants.js';
import { state } from './state.js';
import { createCivilian } from './entities.js';
import { SECTOR } from './sector.js';
import { getDifficulty } from './difficulty.js';

// ═══════════════════════════════════════════
// CIVILIAN TRAFFIC SPAWNER
// ═══════════════════════════════════════════

const ext = SECTOR.extentX;
const extY = SECTOR.extentY;
const margin = 30;

// Air corridors — entry/exit pairs (Alaska)
const CORRIDORS = [
  // Transpolar route (Asia → Anchorage/Fairbanks via north)
  { entry: () => ({ x: rand(-ext * 0.3, ext * 0.3), y: extY + margin }),
    exit:  () => ({ x: rand(ext * 0.4, ext * 0.8), y: rand(-extY * 0.5, extY * 0.5) }) },
  // Return — Fairbanks/Anchorage → Asia via north
  { entry: () => ({ x: rand(ext * 0.4, ext * 0.8), y: rand(-extY * 0.3, extY * 0.3) }),
    exit:  () => ({ x: rand(-ext * 0.3, ext * 0.3), y: extY + margin }) },
  // Great circle Pacific (east → west through sector)
  { entry: () => ({ x: ext + margin, y: rand(-extY * 0.4, extY * 0.2) }),
    exit:  () => ({ x: -ext - margin, y: rand(-extY * 0.2, extY * 0.4) }) },
  // Great circle Pacific return
  { entry: () => ({ x: -ext - margin, y: rand(-extY * 0.2, extY * 0.4) }),
    exit:  () => ({ x: ext + margin, y: rand(-extY * 0.4, extY * 0.2) }) },
  // Bush plane traffic (short hops, stays interior)
  { entry: () => ({ x: rand(-ext * 0.3, ext * 0.5), y: extY + margin }),
    exit:  () => ({ x: rand(-ext * 0.3, ext * 0.5), y: -extY - margin }) },
];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function spawnOneCivilian() {
  const corridor = CORRIDORS[Math.floor(Math.random() * CORRIDORS.length)];
  const entry = corridor.entry();
  const exit = corridor.exit();
  const civ = createCivilian(entry.x, entry.y, exit.x, exit.y);
  state.contacts.push(civ);
}

// Place civilians already in-transit at game start
export function initCivilianTraffic() {
  if (!getDifficulty().civilians) {
    state.lastCivilianSpawn = state.gameTime;
    return;
  }
  for (let i = 0; i < CIVILIAN_START_COUNT; i++) {
    const corridor = CORRIDORS[Math.floor(Math.random() * CORRIDORS.length)];
    const entry = corridor.entry();
    const exit = corridor.exit();

    // Place partway along the route (30-70% through)
    const progress = 0.3 + Math.random() * 0.4;
    const x = entry.x + (exit.x - entry.x) * progress;
    const y = entry.y + (exit.y - entry.y) * progress;

    const civ = createCivilian(x, y, exit.x, exit.y);
    state.contacts.push(civ);
  }
  state.lastCivilianSpawn = state.gameTime;
}

export function trySpawnCivilian(gameTime) {
  if (state.status !== 'ACTIVE') return;
  if (!getDifficulty().civilians) return;

  if (gameTime - state.lastCivilianSpawn < CIVILIAN_SPAWN_INTERVAL) return;

  spawnOneCivilian();
  state.lastCivilianSpawn = gameTime;
}
