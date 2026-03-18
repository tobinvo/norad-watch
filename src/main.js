import { GAME_SPEED, AUTO_PAUSE_COOLDOWN, TIME_STEPS } from './constants.js';
import { state } from './state.js';
import { SECTOR, toCanvas, updateCanvasSize, resetView, getZoom } from './sector.js';
import { createBase, createCity, moveContact, moveInterceptor, moveMissile, updateTankerRefueling } from './entities.js';
import { drawMap } from './map.js';
import { drawRangeRings, drawRadarSites, drawSweep, drawContacts, drawInterceptors, drawMissiles, drawBases, drawCities, drawEffects, drawAwacsRange, initRadarSweeps, drawMissions, drawFormations } from './radar.js';
import { trySpawnThreat } from './spawner.js';
import { initCivilianTraffic, trySpawnCivilian } from './civilians.js';
import { resolveEngagements, checkWinLose, updatePatrolEngagement } from './intercept.js';
import { renderLog, renderContacts, renderAssets, renderStatusBar, renderSelectionDetail, addLog, showScoringOverlay, initHud } from './hud.js';
import { initInput } from './input.js';
import { updateDefcon, calculateFinalScore } from './scoring.js';
import { initAudio, resumeAudio, startAmbient, updateAmbient, stopAmbient, playMiss, playRadioChatter } from './audio.js';
import { getDifficulty } from './difficulty.js';

let canvas, ctx;
let scoreShown = false;
let sweepTime = 0;
let gameStarted = false;

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

  const diff = getDifficulty();
  addLog('NORAD WATCH STATION ONLINE — ALASKA ADIZ WESTERN SECTOR', '');
  addLog(`${state.radarSites.length} RADAR SITES ACTIVE — BERING SEA COVERAGE NORMAL`, '');
  if (diff.civilians) {
    addLog('CIVILIAN AIR TRAFFIC IN SECTOR — IFF ACTIVE', '');
  } else {
    addLog('CIVILIAN AIR TRAFFIC SUSPENDED — TRAINING MODE', '');
  }
  addLog(`DIFFICULTY: ${diff.label}`, '');
  addLog('LEFT-CLICK SELECT | RIGHT-CLICK ACTION | SPACE PAUSE', '');
  addLog('H = MARK HOSTILE | F = MARK FRIENDLY | G = RADAR HOT/COLD', '');
  addLog('M = DEFINE PATROL | SHIFT+R-CLICK = WAYPOINT | E = EMCON', '');
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
  state.nextMissileNum = 1;
  state.missiles = [];
  state.lastSpawnTime = 0;
  state.totalSpawned = 0;
  state.incidentsSpawned = [];
  state.nextIncidentIdx = 0;
  state.lastIncidentTime = 0;
  state.boardClearedAt = null;
  state.lastSpawnEdge = null;
  state.shiftComplete = false;
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
  state.emcon = 'ACTIVE';
  state.timeMultiplier = 1;
  state.lastAutoPause = 0;
  state._prevHostileDetected = 0;
  state.paused = false;
  state.status = 'ACTIVE';
  state.threatsNeutralized = 0;
  state.citiesHit = 0;
  state.civiliansKilled = 0;
  state.missilesExpended = 0;
  state.missilesMissed = 0;
  state.missions = [];
  state.nextMissionNum = 1;
  state.selectedMission = null;
  state.missionDefineMode = false;
  state.missionDefineBase = null;
  state.missionDefineWaypoints = [];
  state.nextFormationNum = 1;
  scoreShown = false;
  sweepTime = 0;
  resetView();
  startAmbient();

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
      stopAmbient();
      const scoreData = calculateFinalScore();
      showScoringOverlay(scoreData);
    }
    return;
  }

  // Track pre-update state for auto-pause detection
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

    if (!wasBingo && interceptor.bingo && interceptor.state === 'RTB') {
      playRadioChatter();
      addLog(`${interceptor.id} BINGO FUEL — RTB AUTHORIZED`, 'warn');
      autoPause('BINGO FUEL', timestamp);
    }

    if (wasAlive && interceptor.state === 'CRASHED') {
      playRadioChatter();
      addLog(`${interceptor.id} FUEL EXHAUSTION — AIRCRAFT LOST`, 'alert');
      autoPause('AIRCRAFT LOST', timestamp);
      if (interceptor.type === 'KC-135') {
        addLog(`TANKER ${interceptor.id} LOST — REFUELING CAPABILITY REDUCED`, 'alert');
      }
    }

    // Bingo + diverting to tanker
    if (!wasBingo && interceptor.bingo && interceptor.state === 'REFUELING') {
      playRadioChatter();
      addLog(`${interceptor.id} BINGO FUEL — DIVERTING TO TANKER ${interceptor.refuelTanker?.id}`, 'warn');
      autoPause('BINGO FUEL', timestamp);
    }
  }

  // Tanker passive refueling (fighters in CAP near on-station tankers)
  updateTankerRefueling(dSec);

  // Orphaned REFUELING fighters (tanker lost while they were en route)
  for (const interceptor of state.interceptors) {
    if (interceptor.state !== 'REFUELING' || !interceptor.refuelTanker) continue;
    const t = interceptor.refuelTanker;
    if (t.state === 'CRASHED' || t.state === 'RTB' || t.state === 'READY' ||
        t.state === 'TURNAROUND' || t.state === 'MAINTENANCE') {
      interceptor.refuelTanker = null;
      interceptor.preDivertState = null;
      interceptor.preDivertTarget = null;
      interceptor.preDivertCapPoint = null;
      interceptor.state = 'RTB';
      interceptor.bingo = true;
      addLog(`${interceptor.id} TANKER LOST — RTB`, 'warn');
    }
  }

  // Move missiles and resolve arrivals
  const prevMisses = state.missilesMissed;
  for (const missile of state.missiles) {
    moveMissile(missile, dSec);
  }
  // Cleanup resolved missiles after 3 game-seconds (keep briefly for rendering)
  state.missiles = state.missiles.filter(m => {
    if (m.state === 'FLIGHT') return true;
    return state.gameTime - m.resolveTime < 3000;
  });
  // Auto-pause on missile miss
  if (state.missilesMissed > prevMisses) {
    playMiss();
    autoPause('MISSILE MISS', timestamp);
  }

  // Patrol auto-engagement
  if (updatePatrolEngagement()) {
    autoPause('PATROL ENGAGING', timestamp);
  }

  const prevCitiesHit = state.citiesHit;
  const prevTracking = state.interceptors.filter(i => i.state === 'TRACKING').length;
  resolveEngagements();

  // Auto-pause: interceptor entered TRACKING (fire decision point)
  const newTracking = state.interceptors.filter(i => i.state === 'TRACKING').length;
  if (newTracking > prevTracking) {
    autoPause('TRACKING — AWAITING FIRE ORDER', timestamp);
  }
  updateDefcon();
  checkWinLose();

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

  if (!state.paused && gameStarted) {
    sweepTime += realDt * state.timeMultiplier;
    const gameDt = realDt * GAME_SPEED * state.timeMultiplier;
    state.gameTime += gameDt;
    update(gameDt, timestamp);
  }

  updateAmbient(state.timeMultiplier);

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
  drawMissions(ctx, sweepTime);
  drawFormations(ctx);
  drawContacts(ctx, sweepTime);
  drawInterceptors(ctx, sweepTime);
  drawMissiles(ctx);
  drawEffects(ctx, state.gameTime);

  // Zoom indicator
  const zoom = getZoom();
  if (zoom > 1) {
    ctx.font = '10px "Courier New", monospace';
    ctx.fillStyle = 'rgba(0, 255, 65, 0.5)';
    ctx.fillText(`ZOOM ${zoom.toFixed(1)}x — HOME TO RESET`, 8, h - 8);
  }

  renderContacts();
  renderAssets();
  renderSelectionDetail();
  renderLog();
  renderStatusBar();

  requestAnimationFrame(render);
}

// ═══════════════════════════════════════════
// MENU
// ═══════════════════════════════════════════

let hasPlayedBefore = false;

function showMenu() {
  const menu = document.getElementById('menuOverlay');
  menu.classList.remove('hidden');
  gameStarted = false;
}

function hideMenu() {
  const menu = document.getElementById('menuOverlay');
  menu.classList.add('hidden');
}

function initMenu() {
  const options = document.querySelectorAll('.menu-option');
  const startBtn = document.getElementById('menuStart');

  // Difficulty selection
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  // Begin shift
  startBtn.addEventListener('click', () => {
    const selected = document.querySelector('.menu-option.selected');
    const difficulty = selected?.dataset.difficulty || 'STANDARD';
    state.difficulty = difficulty;

    hideMenu();

    if (hasPlayedBefore) {
      // Restart from menu after game over
      resetGame();
    } else {
      // First start
      initGame();
      startAmbient();
      hasPlayedBefore = true;
    }
    gameStarted = true;
  });
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════

window.addEventListener('load', () => {
  setupCanvas();
  initInput(canvas);
  initHud();
  initMenu();
  requestAnimationFrame(render);

  // Audio init on first user gesture (browser autoplay policy)
  const startAudioOnGesture = () => {
    initAudio();
    resumeAudio();
    window.removeEventListener('click', startAudioOnGesture);
    window.removeEventListener('keydown', startAudioOnGesture);
  };
  window.addEventListener('click', startAudioOnGesture);
  window.addEventListener('keydown', startAudioOnGesture);
});

window.addEventListener('resize', resizeCanvas);

window.addEventListener('keydown', (e) => {
  if (!gameStarted) return; // ignore game keys while menu is showing

  if (e.code === 'Space') {
    e.preventDefault();
    state.paused = !state.paused;
  }
  if (e.code === 'KeyR' && (state.status === 'WON' || state.status === 'LOST')) {
    showMenu();
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
