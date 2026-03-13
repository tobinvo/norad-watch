import { state } from './state.js';
import { selectBase, selectThreat } from './hud.js';

let canvasEl = null;
let toCanvasFn = null;

const BASE_HIT_RADIUS = 25;
const THREAT_HIT_RADIUS = 25;

export function initInput(canvas, toCanvas) {
  canvasEl = canvas;
  toCanvasFn = toCanvas;

  canvas.addEventListener('click', handleCanvasClick);
}

function handleCanvasClick(e) {
  const rect = canvasEl.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Check bases first
  for (const base of state.bases) {
    const [bx, by] = toCanvasFn(base.x, base.y);
    const d = Math.sqrt((mx - bx) ** 2 + (my - by) ** 2);
    if (d < BASE_HIT_RADIUS) {
      selectBase(base);
      return;
    }
  }

  // Check threats — use actual position (they move between sweeps)
  // Sort by distance so closest to click wins
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
}
