import { state } from './state.js';
import { selectBase, selectThreat, selectInterceptor, addLog } from './hud.js';

let canvasEl = null;
let toCanvasFn = null;

const BASE_HIT_RADIUS = 25;
const THREAT_HIT_RADIUS = 25;
const INTERCEPTOR_HIT_RADIUS = 20;

export function initInput(canvas, toCanvas) {
  canvasEl = canvas;
  toCanvasFn = toCanvas;

  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('contextmenu', handleRightClick);
}

function handleCanvasClick(e) {
  const rect = canvasEl.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Check airborne interceptors (for RTB command)
  for (const interceptor of state.interceptors) {
    if (interceptor.state === 'READY' || interceptor.state === 'CRASHED') continue;
    const [ix, iy] = toCanvasFn(interceptor.x, interceptor.y);
    const d = Math.sqrt((mx - ix) ** 2 + (my - iy) ** 2);
    if (d < INTERCEPTOR_HIT_RADIUS) {
      selectInterceptor(interceptor);
      return;
    }
  }

  // Check bases
  for (const base of state.bases) {
    const [bx, by] = toCanvasFn(base.x, base.y);
    const d = Math.sqrt((mx - bx) ** 2 + (my - by) ** 2);
    if (d < BASE_HIT_RADIUS) {
      selectBase(base);
      return;
    }
  }

  // Check threats
  let closest = null;
  let closestDist = Infinity;
  for (const threat of state.threats) {
    if (threat.state !== 'HOSTILE' || !threat.detected) continue;
    const [tx, ty] = toCanvasFn(threat.x, threat.y);
    const d = Math.sqrt((mx - tx) ** 2 + (my - ty) ** 2);
    if (d < THREAT_HIT_RADIUS && d < closestDist) {
      closest = threat;
      closestDist = d;
    }
  }
  if (closest) {
    selectThreat(closest);
    return;
  }

  // Clicked nothing — clear selection
  state.selectedBase = null;
  state.selectedThreat = null;
  state.selectedInterceptor = null;
}

function handleRightClick(e) {
  e.preventDefault();

  // Right-click with a base selected: set CAP point
  if (state.selectedBase) {
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Convert back to normalized coords
    const w = canvasEl.width / window.devicePixelRatio;
    const h = canvasEl.height / window.devicePixelRatio;
    const nx = mx / w;
    const ny = my / h;

    const base = state.selectedBase;
    const ready = base.interceptors.find(i => i.state === 'READY');
    if (!ready) {
      addLog(`${base.name} — NO AIRCRAFT AVAILABLE`, 'warn');
      state.selectedBase = null;
      return;
    }

    // AWACS can't attack but can CAP
    ready.state = 'CAP';
    ready.capPoint = { x: nx, y: ny };
    ready.x = base.x;
    ready.y = base.y;

    addLog(`${ready.id} ${base.name} — CAP ORBIT ASSIGNED`, '');
    state.selectedBase = null;
    state.selectedThreat = null;
    return;
  }

  // Right-click with an interceptor selected: set CAP point for it
  if (state.selectedInterceptor) {
    const interceptor = state.selectedInterceptor;
    if (interceptor.state === 'CRASHED' || interceptor.state === 'READY') return;

    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const w = canvasEl.width / window.devicePixelRatio;
    const h = canvasEl.height / window.devicePixelRatio;

    interceptor.state = 'CAP';
    interceptor.target = null;
    interceptor.capPoint = { x: mx / w, y: my / h };

    addLog(`${interceptor.id} — CAP ORBIT REASSIGNED`, '');
    state.selectedInterceptor = null;
    return;
  }
}
