import { GAME_SPEED, AUTO_PAUSE_COOLDOWN, TIME_STEPS } from './constants.js';
import { state } from './state.js';
import { SECTOR, toCanvas, updateCanvasSize } from './sector.js';
import { createBase, createCity, moveContact, moveInterceptor } from './entities.js';
import { drawMap } from './map.js';
import { drawRangeRings, drawRadarSites, drawSweep, drawContacts, drawInterceptors, drawBases, drawCities, drawEffects, drawAwacsRange, initRadarSweeps } from './radar.js';
import { trySpawnThreat } from './spawner.js';
import { initCivilianTraffic, trySpawnCivilian } from './civilians.js';
import { resolveEngagements, checkWinLose } from './intercept.js';
import { renderLog, renderContacts, renderAssets, renderStatusBar, renderSelectionDetail, addLog, showScoringOverlay, initHud } from './hud.js';
import { initInput } from './input.js';
import { updateDefcon, calculateFinalScore } from './scoring.js';

let canvas, ctx;
let scoreShown = false;
let sweepTime = 0;

function setupCanvas() {
  canvas = document.getElementById('radarCanvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
}

function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width = container.clientWidth * window.devicePixelRatio;
  canvas.height = container.clientHeight * window.devicePixelRatio;
  canvas.style.width = container.clientWidth + 'px';
  canvas.style.height = container.clientHeight + 'px';
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

  const w = canvas.width / window.devicePixelRatio;
  const h = canvas.height / window.devicePixelRatio;
  updateCanvasSize(w, h);
}

function initGame() {
  // Create cities from sector definition
  for (const c of SECTOR.cities) {
    state.cities.push(createCity(c.name, c.x, c.y));
  }

  // Create bases from sector definition
  for (const b of SECTOR.bases) {
    state.bases.push(createBase(b.name, b.x, b.y, b.roster));
  }

  // Store radar sites in state
  state.radarSites = SECTOR.radarSites.map(r => ({ ...r }));

  // Spawn initial civilian traffic
  initCivilianTraffic();

  initRadarSweeps();

  addLog('NORAD WATCH STATION ONLINE — NORTHEAST ADIZ', '');
  addLog(`${state.radarSites.length} RADAR SITES ACTIVE — COVERAGE NORMAL`, '');
  addLog('CIVILIAN AIR TRAFFIC IN SECTOR — IFF ACTIVE', '');
  addLog('LEFT-CLICK SELECT | RIGHT-CLICK ACTION | SPACE PAUSE', '');
  addLog('H = MARK HOSTILE | F = MARK FRIENDLY (with contact selected)', '');
}

function resetGame() {
  state.lastTimestamp = 0;
  state.gameTime = 0;
  state.bases = [];
  state.contacts = [];
  state.interceptors = [];
  state.cities = [];
  state.radarSites = [];
  state.nextContactNum = 1;
  state.nextInterceptorNum = 1;
  state.lastSpawnTime = 0;
  state.totalSpawned = 0;
  state.currentWave = 0;
  state.waveSpawnIndex = 0;
  state.waveActive = false;
  state.waveBreakUntil = 0;
  state.wavesComplete = false;
  state.lastCivilianSpawn = 0;
  state.defcon = 5;
  state.score = 0;
  state.selectedBase = null;
  state.selectedThreat = null;
  state.selectedInterceptor = null;
  state.selectedReadyInterceptor = null;
  state.blipVisibility = {};
  state.logEntries = [];
  state.effects = [];
  state.wcs = 'TIGHT';
  state.timeMultiplier = 1;
  state.lastAutoPause = 0;
  state._prevHostileDetected = 0;
  state.paused = false;
  state.status = 'ACTIVE';
  state.threatsNeutralized = 0;
  state.citiesHit = 0;
  state.civiliansKilled = 0;
  scoreShown = false;
  sweepTime = 0;

  document.getElementById('eventLog').innerHTML = '';
  const overlay = document.getElementById('scoringOverlay');
  if (overlay) overlay.style.display = 'none';

  initGame();
}

function autoPause(reason, timestamp) {
  if (state.timeMultiplier <= 1) return; // no need at 1x
  if (timestamp - state.lastAutoPause < AUTO_PAUSE_COOLDOWN) return;
  state.paused = true;
  state.timeMultiplier = 1;
  state.lastAutoPause = timestamp;
  addLog(`■ AUTO-PAUSE: ${reason} ■`, 'warn');
}

function update(gameDt, timestamp) {
  if (state.status !== 'ACTIVE') {
    if (!scoreShown) {
      scoreShown = true;
      const scoreData = calculateFinalScore();
      showScoringOverlay(scoreData);
    }
    return;
  }

  // Track pre-update state for auto-pause detection
  const prevWave = state.currentWave;
  const contactCountBefore = state.contacts.filter(c => c.detected).length;

  // Spawn threats and civilians
  trySpawnThreat(state.gameTime);
  trySpawnCivilian(state.gameTime);

  const dSec = gameDt / 1000;

  // Move all contacts (threats + civilians)
  for (const contact of state.contacts) {
    moveContact(contact, dSec);
  }

  // Move interceptors
  for (const interceptor of state.interceptors) {
    const wasBingo = interceptor.bingo;
    const wasAlive = interceptor.state !== 'CRASHED';

    moveInterceptor(interceptor, dSec);

    if (!wasBingo && interceptor.bingo) {
      addLog(`${interceptor.id} BINGO FUEL — RTB AUTHORIZED`, 'warn');
      autoPause('BINGO FUEL', timestamp);
    }

    if (wasAlive && interceptor.state === 'CRASHED') {
      addLog(`${interceptor.id} FUEL EXHAUSTION — AIRCRAFT LOST`, 'alert');
      autoPause('AIRCRAFT LOST', timestamp);
    }
  }

  const prevCitiesHit = state.citiesHit;
  resolveEngagements();
  updateDefcon();
  checkWinLose();

  // Auto-pause: new wave
  if (state.currentWave > prevWave && state.currentWave > 1) {
    autoPause('NEW WAVE INCOMING', timestamp);
  }

  // Auto-pause: new non-civilian contact detected
  const newDetected = state.contacts.filter(c => c.detected && !c.isCivilian).length;
  const oldDetected = state._prevHostileDetected || 0;
  if (newDetected > oldDetected) {
    autoPause('NEW CONTACT', timestamp);
  }
  state._prevHostileDetected = newDetected;

  // Auto-pause: city hit
  if (state.citiesHit > prevCitiesHit) {
    autoPause('CITY IMPACT', timestamp);
  }
}

function render(timestamp) {
  const realDt = state.lastTimestamp ? timestamp - state.lastTimestamp : 0;
  state.lastTimestamp = timestamp;

  if (!state.paused) {
    sweepTime += realDt * state.timeMultiplier;
    const gameDt = realDt * GAME_SPEED * state.timeMultiplier;
    state.gameTime += gameDt;
    update(gameDt, timestamp);
  }

  const w = canvas.width / window.devicePixelRatio;
  const h = canvas.height / window.devicePixelRatio;
  ctx.clearRect(0, 0, w, h);

  drawRangeRings(ctx);
  drawMap(ctx);
  drawRadarSites(ctx);
  drawCities(ctx);
  drawAwacsRange(ctx);
  drawBases(ctx);
  drawSweep(ctx, state.gameTime, sweepTime);
  drawContacts(ctx, sweepTime);
  drawInterceptors(ctx, sweepTime);
  drawEffects(ctx, state.gameTime);

  renderContacts();
  renderAssets();
  renderSelectionDetail();
  renderLog();
  renderStatusBar();

  requestAnimationFrame(render);
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════

window.addEventListener('load', () => {
  setupCanvas();
  initInput(canvas);
  initHud();
  initGame();
  requestAnimationFrame(render);
});

window.addEventListener('resize', resizeCanvas);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    state.paused = !state.paused;
  }
  if (e.code === 'KeyR' && (state.status === 'WON' || state.status === 'LOST')) {
    resetGame();
  }
  // Time compression: [ slower, ] faster
  if (e.code === 'BracketLeft') {
    const idx = TIME_STEPS.indexOf(state.timeMultiplier);
    if (idx > 0) {
      state.timeMultiplier = TIME_STEPS[idx - 1];
      addLog(`TIME COMPRESSION: ${state.timeMultiplier}x`, '');
    }
  }
  if (e.code === 'BracketRight') {
    const idx = TIME_STEPS.indexOf(state.timeMultiplier);
    if (idx < TIME_STEPS.length - 1) {
      state.timeMultiplier = TIME_STEPS[idx + 1];
      addLog(`TIME COMPRESSION: ${state.timeMultiplier}x`, '');
    }
  }
});
