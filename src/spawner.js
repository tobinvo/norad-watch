import { ESCORT_OFFSET_DISTANCE } from './constants.js';
import { state } from './state.js';
import { createThreat, getActiveAWACS } from './entities.js';
import { addLog } from './hud.js';
import { INCIDENTS, INCIDENTS_EASY, INCIDENTS_HARD, SHIFT_DURATION } from '../data/scenarios.js';
import { getSpawnPosition, pickSpawnEdge } from './sector.js';
import { getDifficulty } from './difficulty.js';

function getIncidents() {
  const filter = getDifficulty().incidentFilter;
  if (filter === 'EASY') return INCIDENTS_EASY;
  if (filter === 'HARD') return INCIDENTS_HARD;
  return INCIDENTS;
}

// Track when the board last had active threats resolved
function boardIsClear() {
  return !state.contacts.some(c =>
    c.status !== 'NEUTRALIZED' && c.status !== 'IMPACT' && c.status !== 'EXITED' && !c.isCivilian
  );
}

export function trySpawnThreat(gameTime) {
  if (state.status !== 'ACTIVE') return;
  if (state.shiftComplete) return;

  // Check if shift time is up
  if (gameTime >= SHIFT_DURATION) {
    state.shiftComplete = true;
    return;
  }

  const incidents = getIncidents();
  const nextIdx = state.nextIncidentIdx || 0;
  if (nextIdx >= incidents.length) return;

  const incident = incidents[nextIdx];
  const lastSpawn = state.lastIncidentTime || 0;
  const timeSinceLastSpawn = gameTime - lastSpawn;

  // Condition 1: minimum delay since last spawn
  if (timeSinceLastSpawn < incident.minDelay) return;

  // Condition 2: if board is clear, require cooldown since it cleared
  if (incident.cooldown > 0 && boardIsClear()) {
    // Track when board became clear
    if (state.boardClearedAt === null || state.boardClearedAt === undefined) {
      state.boardClearedAt = gameTime;
    }
    const timeSinceClear = gameTime - state.boardClearedAt;
    if (timeSinceClear < incident.cooldown) return;
  }

  // Spawn this incident
  state.nextIncidentIdx = nextIdx + 1;
  state.lastIncidentTime = gameTime;
  state.boardClearedAt = null; // reset — new threats on the board
  spawnIncident(incident, gameTime);
}

function spawnIncident(incident, gameTime) {
  const livingCities = state.cities.filter(c => c.hp > 0);
  if (livingCities.length === 0) return;

  const targetCity = livingCities[Math.floor(Math.random() * livingCities.length)];
  const side = incident.edge || pickSpawnEdgeNoRepeat();

  const isProbe = incident.type.includes('PROBE');
  const isFormation = incident.type.includes('FORMATION');
  const isArm = incident.type === 'ARM_STRIKE';

  if (isFormation) {
    // Formation: first threat is lead, escorts from incident.escorts
    const leadType = incident.threats[0];
    const spawn = getSpawnPosition(side);
    const formationId = `STRIKE-${state.nextFormationNum++}`;

    const lead = createThreat(spawn.x, spawn.y, targetCity, leadType);
    lead.formationId = formationId;
    lead.formationRole = 'LEAD';
    lead.escorts = [];
    lead.intent = isProbe ? 'PROBE' : 'ATTACK';
    assignWaypoints(lead, spawn);
    state.contacts.push(lead);
    state.totalSpawned++;

    // Create escorts
    const escorts = incident.escorts || [];
    const escortAngles = getEscortAngles(escorts.length, lead.heading);
    for (let i = 0; i < escorts.length; i++) {
      const angle = escortAngles[i];
      const ex = spawn.x + Math.cos(angle) * ESCORT_OFFSET_DISTANCE;
      const ey = spawn.y + Math.sin(angle) * ESCORT_OFFSET_DISTANCE;

      const escort = createThreat(ex, ey, targetCity, escorts[i]);
      escort.formationId = formationId;
      escort.formationRole = 'ESCORT';
      escort.formationLead = lead;
      escort.escortAngle = angle - lead.heading;
      escort.intent = lead.intent; // escorts share lead's intent
      lead.escorts.push(escort);
      state.contacts.push(escort);
      state.totalSpawned++;
    }

    addLog(`FORMATION ${formationId} DETECTED — ${leadType} + ${escorts.length} ESCORT${escorts.length > 1 ? 'S' : ''}`, 'alert');

    // ARM accompaniment for attack formations
    if (!isProbe && state.emcon !== 'SILENT') {
      trySpawnARM(targetCity);
    }
  } else if (isArm) {
    // ARM strike: spawn bomber + ARM from same edge
    for (const typeName of incident.threats) {
      const spawn = getSpawnPosition(side);
      const threat = createThreat(spawn.x, spawn.y, targetCity, typeName);

      if (typeName === 'ARM') {
        threat.intent = 'ATTACK';
        // ARM homes on nearest radar site
        const activeSites = state.radarSites.filter(s => !s.destroyed);
        if (activeSites.length > 0 && state.emcon !== 'SILENT') {
          threat.targetSite = true;
          const targetSite = activeSites[Math.floor(Math.random() * activeSites.length)];
          const adx = targetSite.x - spawn.x;
          const ady = targetSite.y - spawn.y;
          threat.heading = Math.atan2(ady, adx);
          threat.hdgDeg = Math.round(((90 - threat.heading * 180 / Math.PI) + 360) % 360);
        }
      } else {
        threat.intent = 'ATTACK'; // bomber in ARM strike is always real
        assignWaypoints(threat, spawn);
      }

      state.contacts.push(threat);
      state.totalSpawned++;
    }
  } else {
    // Solo or pair — spawn each threat
    for (const typeName of incident.threats) {
      const spawn = getSpawnPosition(side);
      const threat = createThreat(spawn.x, spawn.y, targetCity, typeName);

      // Set intent based on incident type
      if (isProbe && (typeName === 'BOMBER' || typeName === 'FIGHTER')) {
        threat.intent = 'PROBE';
      } else {
        threat.intent = 'ATTACK';
      }

      assignWaypoints(threat, spawn);

      // Fighters in attack incidents may hunt AWACS
      if (typeName === 'FIGHTER' && threat.intent === 'ATTACK' && Math.random() < getDifficulty().awacsHuntChance) {
        const awacs = getActiveAWACS();
        if (awacs.length > 0) {
          threat.targetAWACS = true;
        }
      }

      state.contacts.push(threat);
      state.totalSpawned++;
    }
  }
}

function trySpawnARM(targetCity) {
  const activeSites = state.radarSites.filter(s => !s.destroyed);
  if (activeSites.length > 0 && Math.random() < getDifficulty().armSpawnChance) {
    const armSpawn = getSpawnPosition(pickSpawnEdge());
    const targetSite = activeSites[Math.floor(Math.random() * activeSites.length)];
    const arm = createThreat(armSpawn.x, armSpawn.y, targetCity, 'ARM');
    arm.intent = 'ATTACK';
    arm.targetSite = true;
    const adx = targetSite.x - armSpawn.x;
    const ady = targetSite.y - armSpawn.y;
    arm.heading = Math.atan2(ady, adx);
    arm.hdgDeg = Math.round(((90 - arm.heading * 180 / Math.PI) + 360) % 360);
    state.contacts.push(arm);
  }
}

// Pick a spawn edge, avoiding the same edge twice in a row
function pickSpawnEdgeNoRepeat() {
  let edge = pickSpawnEdge();
  // If same as last, re-roll once
  if (edge === state.lastSpawnEdge) {
    edge = pickSpawnEdge();
  }
  state.lastSpawnEdge = edge;
  return edge;
}

// Distribute escorts around lead — flanking positions perpendicular to heading
function getEscortAngles(count, leadHeading) {
  const perpendicular = leadHeading + Math.PI / 2;
  if (count === 1) {
    return [leadHeading + Math.PI * 0.75];
  }
  if (count === 2) {
    return [perpendicular, perpendicular + Math.PI];
  }
  const angles = [];
  const spread = Math.PI * 0.8;
  const startAngle = leadHeading + Math.PI - spread / 2;
  for (let i = 0; i < count; i++) {
    angles.push(startAngle + (spread / (count - 1)) * i);
  }
  return angles;
}

// ── Ingress waypoints — offset from direct path for unpredictable approach angles ──
function assignWaypoints(threat, spawn) {
  if (threat.targetSite || threat.targetAWACS) return;
  const count = threat.intent === 'PROBE' ? 1 : (Math.random() < 0.5 ? 1 : 2);
  const city = threat.targetCity;
  if (!city) return;

  const dx = city.x - spawn.x;
  const dy = city.y - spawn.y;

  for (let i = 0; i < count; i++) {
    const t = (0.3 + (i * 0.25)) + (Math.random() * 0.1);
    const baseX = spawn.x + dx * t;
    const baseY = spawn.y + dy * t;

    const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
    const offset = (20 + Math.random() * 30) * (Math.random() < 0.5 ? 1 : -1);
    threat.waypoints.push({
      x: baseX + Math.cos(perpAngle) * offset,
      y: baseY + Math.sin(perpAngle) * offset,
    });
  }

  const wp = threat.waypoints[0];
  threat.heading = Math.atan2(wp.y - threat.y, wp.x - threat.x);
  threat.hdgDeg = Math.round(((90 - threat.heading * 180 / Math.PI) + 360) % 360);
}
