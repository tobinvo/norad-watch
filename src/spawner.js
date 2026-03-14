import { WAVE_BREAK, WAVE_FIRST_DELAY } from './constants.js';
import { state } from './state.js';
import { createThreat } from './entities.js';
import { addLog } from './hud.js';
import { WAVES } from '../data/scenarios.js';
import { getSpawnPosition, pickSpawnEdge } from './sector.js';

export function trySpawnThreat(gameTime) {
  if (state.status !== 'ACTIVE') return;

  // All waves complete
  if (state.currentWave > WAVES.length) {
    state.wavesComplete = true;
    return;
  }

  // Pre-game delay
  if (state.currentWave === 0) {
    if (gameTime < WAVE_FIRST_DELAY) return;
    startNextWave(gameTime);
    return;
  }

  // Between waves — waiting for break to end
  if (!state.waveActive) {
    if (gameTime < state.waveBreakUntil) return;
    startNextWave(gameTime);
    return;
  }

  // Current wave — spawn next threat
  const wave = WAVES[state.currentWave - 1];
  if (state.waveSpawnIndex >= wave.threats.length) {
    // Wave fully spawned — wait for all threats resolved before next wave
    const activeThreats = state.contacts.filter(t => t.state === 'ACTIVE' && !t.isCivilian);
    if (activeThreats.length === 0) {
      if (state.currentWave >= WAVES.length) {
        state.wavesComplete = true;
        return;
      }
      state.waveActive = false;
      state.waveBreakUntil = gameTime + WAVE_BREAK;
      addLog(`WAVE ${state.currentWave} CLEAR — STAND BY FOR NEXT WAVE`, '');
    }
    return;
  }

  // Spawn delay between individual threats within a wave
  if (gameTime - state.lastSpawnTime < wave.spawnDelay) return;

  // Spawn
  const typeName = wave.threats[state.waveSpawnIndex];
  const livingCities = state.cities.filter(c => c.hp > 0);
  if (livingCities.length === 0) return;

  const targetCity = livingCities[Math.floor(Math.random() * livingCities.length)];
  const side = pickSpawnEdge();
  const spawn = getSpawnPosition(side);

  const threat = createThreat(spawn.x, spawn.y, targetCity, typeName);
  state.contacts.push(threat);
  state.totalSpawned++;
  state.waveSpawnIndex++;
  state.lastSpawnTime = gameTime;
}

function startNextWave(gameTime) {
  state.currentWave++;
  if (state.currentWave > WAVES.length) {
    state.wavesComplete = true;
    return;
  }
  state.waveActive = true;
  state.waveSpawnIndex = 0;
  state.lastSpawnTime = gameTime;
  addLog(`■ WAVE ${state.currentWave}/${WAVES.length} INCOMING ■`, 'alert');
}
