import { WAVE_BREAK, WAVE_FIRST_DELAY, ARM_SPAWN_CHANCE, ESCORT_OFFSET_DISTANCE } from './constants.js';
import { state } from './state.js';
import { createThreat, getActiveAWACS } from './entities.js';
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
  const totalLoose = wave.threats.length;
  const formationsToSpawn = wave.formations || [];

  // Spawn formations first (all at once when wave starts)
  if (!state.waveFormationsSpawned) {
    state.waveFormationsSpawned = true;
    if (formationsToSpawn.length > 0) {
      spawnFormations(formationsToSpawn, gameTime);
      // Reset spawn timer so loose threats wait their spawnDelay
      state.lastSpawnTime = gameTime;
      return;
    }
  }

  if (state.waveSpawnIndex >= totalLoose) {
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

  // Spawn loose threat
  const typeName = wave.threats[state.waveSpawnIndex];
  const livingCities = state.cities.filter(c => c.hp > 0);
  if (livingCities.length === 0) return;

  const targetCity = livingCities[Math.floor(Math.random() * livingCities.length)];
  const side = pickSpawnEdge();
  const spawn = getSpawnPosition(side);

  const threat = createThreat(spawn.x, spawn.y, targetCity, typeName);

  // Wave 3+ FIGHTERS may specifically hunt AWACS
  if (state.currentWave >= 3 && typeName === 'FIGHTER' && Math.random() < 0.4) {
    const awacs = getActiveAWACS();
    if (awacs.length > 0) {
      threat.targetAWACS = true; // flag for moveContact to home on AWACS
    }
  }

  state.contacts.push(threat);

  // Wave 3+ BOMBERS may spawn an accompanying ARM when radar is emitting
  if (state.currentWave >= 3 && typeName === 'BOMBER' && state.emcon !== 'SILENT') {
    trySpawnARM(targetCity, gameTime);
  }

  state.totalSpawned++;
  state.waveSpawnIndex++;
  state.lastSpawnTime = gameTime;
}

function spawnFormations(formations, gameTime) {
  const livingCities = state.cities.filter(c => c.hp > 0);
  if (livingCities.length === 0) return;

  for (const formation of formations) {
    const formationId = `STRIKE-${state.nextFormationNum++}`;
    const targetCity = livingCities[Math.floor(Math.random() * livingCities.length)];
    const side = formation.edge || pickSpawnEdge();
    const spawn = getSpawnPosition(side);

    // Create lead
    const lead = createThreat(spawn.x, spawn.y, targetCity, formation.lead);
    lead.formationId = formationId;
    lead.formationRole = 'LEAD';
    lead.escorts = [];
    state.contacts.push(lead);
    state.totalSpawned++;

    // Create escorts at offset positions around lead
    const escortAngles = getEscortAngles(formation.escorts.length, lead.heading);
    for (let i = 0; i < formation.escorts.length; i++) {
      const angle = escortAngles[i];
      const ex = spawn.x + Math.cos(angle) * ESCORT_OFFSET_DISTANCE;
      const ey = spawn.y + Math.sin(angle) * ESCORT_OFFSET_DISTANCE;

      const escort = createThreat(ex, ey, targetCity, formation.escorts[i]);
      escort.formationId = formationId;
      escort.formationRole = 'ESCORT';
      escort.formationLead = lead;
      escort.escortAngle = angle - lead.heading; // relative angle from lead's heading

      // Escorts don't independently hunt AWACS while in formation
      lead.escorts.push(escort);
      state.contacts.push(escort);
      state.totalSpawned++;
    }

    addLog(`FORMATION ${formationId} DETECTED — ${formation.lead} + ${formation.escorts.length} ESCORT${formation.escorts.length > 1 ? 'S' : ''}`, 'alert');

    // Formation lead bombers can also trigger ARM spawns
    if (state.currentWave >= 3 && formation.lead === 'BOMBER' && state.emcon !== 'SILENT') {
      trySpawnARM(targetCity, gameTime);
    }
  }
}

function trySpawnARM(targetCity, gameTime) {
  const activeSites = state.radarSites.filter(s => !s.destroyed);
  if (activeSites.length > 0 && Math.random() < ARM_SPAWN_CHANCE) {
    const armSpawn = getSpawnPosition(pickSpawnEdge());
    const targetSite = activeSites[Math.floor(Math.random() * activeSites.length)];
    const arm = createThreat(armSpawn.x, armSpawn.y, targetCity, 'ARM');
    arm.targetSite = true;
    const adx = targetSite.x - armSpawn.x;
    const ady = targetSite.y - armSpawn.y;
    arm.heading = Math.atan2(ady, adx);
    arm.hdgDeg = Math.round(((90 - arm.heading * 180 / Math.PI) + 360) % 360);
    state.contacts.push(arm);
  }
}

// Distribute escorts around lead — flanking positions perpendicular to heading
function getEscortAngles(count, leadHeading) {
  const perpendicular = leadHeading + Math.PI / 2;
  if (count === 1) {
    // Single escort: slightly behind and to one side
    return [leadHeading + Math.PI * 0.75];
  }
  if (count === 2) {
    // Two escorts: flanking left and right
    return [perpendicular, perpendicular + Math.PI];
  }
  // 3+: fan out behind
  const angles = [];
  const spread = Math.PI * 0.8;
  const startAngle = leadHeading + Math.PI - spread / 2;
  for (let i = 0; i < count; i++) {
    angles.push(startAngle + (spread / (count - 1)) * i);
  }
  return angles;
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
  state.waveAnnounced = false;
  state.waveFormationsSpawned = false;
}
