import { state } from './state.js';
import { BASE_ROSTERS } from './constants.js';
import { createBase, createCity, moveThreat, moveInterceptor } from './entities.js';
import { drawMap } from './map.js';
import { drawRangeRings, drawSweep, drawThreats, drawInterceptors, drawBases, drawCities, drawEffects, drawAwacsRange } from './radar.js';
import { trySpawnThreat } from './spawner.js';
import { resolveEngagements, checkWinLose } from './intercept.js';
import { renderLog, renderContacts, renderAssets, renderStatusBar, renderSelectionDetail, addLog } from './hud.js';
import { initInput } from './input.js';

let canvas, ctx;

function toCanvas(nx, ny) {
  const w = canvas.width / window.devicePixelRatio;
  const h = canvas.height / window.devicePixelRatio;
  return [nx * w, ny * h];
}

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
}

function initGame() {
  // Create cities
  state.cities.push(
    createCity('NEW YORK', 0.70, 0.42),
    createCity('CHICAGO', 0.52, 0.38),
    createCity('LOS ANGELES', 0.11, 0.60),
    createCity('WASHINGTON DC', 0.68, 0.50),
    createCity('HOUSTON', 0.38, 0.68),
  );

  // Create bases with mixed rosters
  state.bases.push(
    createBase('PETERSON AFB', 0.30, 0.48, BASE_ROSTERS['PETERSON AFB']),
    createBase('LANGLEY AFB', 0.66, 0.54, BASE_ROSTERS['LANGLEY AFB']),
    createBase('OTIS ANGB', 0.72, 0.38, BASE_ROSTERS['OTIS ANGB']),
    createBase('ELMENDORF AFB', 0.06, 0.17, BASE_ROSTERS['ELMENDORF AFB']),
  );

  addLog('NORAD WATCH STATION ONLINE — ALL SECTORS NOMINAL', '');
  addLog('DEW LINE STATIONS REPORTING — COVERAGE NORMAL', '');
  addLog('CLICK BASE → CLICK HOSTILE TO SCRAMBLE | RIGHT-CLICK RADAR FOR CAP', '');
}

function update(timestamp, dt) {
  if (state.status !== 'ACTIVE') return;

  // Spawn threats
  trySpawnThreat(state.gameTime);

  // Move entities
  for (const threat of state.threats) {
    moveThreat(threat, dt);
  }

  // Track bingo/crash events before movement
  for (const interceptor of state.interceptors) {
    const wasBingo = interceptor.bingo;
    const wasAlive = interceptor.state !== 'CRASHED';

    moveInterceptor(interceptor, dt);

    // Log bingo warning
    if (!wasBingo && interceptor.bingo) {
      addLog(`${interceptor.id} BINGO FUEL — RTB AUTHORIZED`, 'warn');
    }

    // Log crash
    if (wasAlive && interceptor.state === 'CRASHED') {
      addLog(`${interceptor.id} FUEL EXHAUSTION — AIRCRAFT LOST`, 'alert');
    }
  }

  // Resolve combat
  resolveEngagements();
  checkWinLose();
}

function render(timestamp) {
  const dt = state.lastTimestamp ? timestamp - state.lastTimestamp : 0;
  state.lastTimestamp = timestamp;

  if (!state.paused) {
    state.gameTime += dt;
    update(timestamp, dt);
  }

  // Clear canvas
  const w = canvas.width / window.devicePixelRatio;
  const h = canvas.height / window.devicePixelRatio;
  ctx.clearRect(0, 0, w, h);

  // Draw layers
  drawRangeRings(ctx, toCanvas);
  drawMap(ctx, toCanvas);
  drawCities(ctx, toCanvas);
  drawAwacsRange(ctx, toCanvas);
  drawBases(ctx, toCanvas);
  drawSweep(ctx, toCanvas, state.gameTime);
  drawThreats(ctx, toCanvas, state.gameTime);
  drawInterceptors(ctx, toCanvas, state.gameTime);
  drawEffects(ctx, toCanvas, state.gameTime);

  // Update HUD panels
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
  initInput(canvas, toCanvas);
  initGame();
  requestAnimationFrame(render);
});

window.addEventListener('resize', resizeCanvas);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    state.paused = !state.paused;
  }
});
