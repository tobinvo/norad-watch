import { BOMBER_SPEED, SPAWN_INTERVAL, MAX_THREATS_PER_WAVE } from './constants.js';
import { state } from './state.js';
import { createThreat } from './entities.js';

// Spawn points along the northern edge / ocean edges
const SPAWN_ZONES = [
  // North (over Canada/Arctic)
  { x: 0.20, y: 0.02 },
  { x: 0.35, y: 0.01 },
  { x: 0.50, y: 0.02 },
  { x: 0.65, y: 0.03 },
  // Northwest (Pacific)
  { x: 0.04, y: 0.15 },
  { x: 0.03, y: 0.30 },
  // Northeast (Atlantic)
  { x: 0.78, y: 0.15 },
  { x: 0.80, y: 0.25 },
];

export function trySpawnThreat(timestamp) {
  if (state.status !== 'ACTIVE') return;
  if (state.totalSpawned >= MAX_THREATS_PER_WAVE) return;
  if (timestamp - state.lastSpawnTime < SPAWN_INTERVAL) return;

  const livingCities = state.cities.filter(c => c.hp > 0);
  if (livingCities.length === 0) return;

  const targetCity = livingCities[Math.floor(Math.random() * livingCities.length)];
  const spawn = SPAWN_ZONES[Math.floor(Math.random() * SPAWN_ZONES.length)];

  const threat = createThreat(spawn.x, spawn.y, targetCity, BOMBER_SPEED);
  state.threats.push(threat);
  state.totalSpawned++;
  state.lastSpawnTime = timestamp;
}
