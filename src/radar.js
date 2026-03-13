import {
  GREEN_BRIGHT, GREEN_MID, RED_ALERT, YELLOW_WARN,
  SWEEP_PERIOD, SWEEP_TRAIL_ANGLE, BLIP_FADE_TIME,
  RADAR_CENTER_X, RADAR_CENTER_Y,
  AWACS_RADAR_BONUS,
} from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';
import { getActiveAWACS } from './entities.js';

export function drawRangeRings(ctx, toCanvas) {
  const [cx, cy] = toCanvas(RADAR_CENTER_X, RADAR_CENTER_Y);
  const w = ctx.canvas.width / window.devicePixelRatio;
  const h = ctx.canvas.height / window.devicePixelRatio;
  const maxR = Math.max(w, h) * 0.5;

  ctx.strokeStyle = '#001a08';
  ctx.lineWidth = 0.5;

  for (let i = 1; i <= 6; i++) {
    const r = (maxR / 6) * i;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawSweep(ctx, toCanvas, timestamp) {
  const [cx, cy] = toCanvas(RADAR_CENTER_X, RADAR_CENTER_Y);
  const w = ctx.canvas.width / window.devicePixelRatio;
  const h = ctx.canvas.height / window.devicePixelRatio;
  const maxR = Math.max(w, h) * 0.6;

  state.sweepAngle = ((timestamp % SWEEP_PERIOD) / SWEEP_PERIOD) * Math.PI * 2;

  // Fading trail
  const trailSteps = 30;
  for (let i = 0; i < trailSteps; i++) {
    const frac = i / trailSteps;
    const angle = state.sweepAngle - (SWEEP_TRAIL_ANGLE * frac);
    const alpha = 0.12 * (1 - frac);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const stepAngle = SWEEP_TRAIL_ANGLE / trailSteps;
    ctx.arc(cx, cy, maxR, angle - stepAngle, angle);
    ctx.closePath();
    ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
    ctx.fill();
  }

  // Main sweep line
  const endX = cx + Math.cos(state.sweepAngle) * maxR;
  const endY = cy + Math.sin(state.sweepAngle) * maxR;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = GREEN_BRIGHT;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = GREEN_BRIGHT;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = GREEN_BRIGHT;
  ctx.shadowColor = GREEN_BRIGHT;
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function updateBlipVisibility(id, x, y, toCanvas, timestamp) {
  const [cx, cy] = toCanvas(RADAR_CENTER_X, RADAR_CENTER_Y);
  const [bx, by] = toCanvas(x, y);
  const blipAngle = Math.atan2(by - cy, bx - cx);

  let sweepNorm = ((state.sweepAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  let blipNorm = ((blipAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  let angleDiff = sweepNorm - blipNorm;
  if (angleDiff < 0) angleDiff += Math.PI * 2;

  if (angleDiff < 0.15) {
    state.blipVisibility[id] = { alpha: 1, lastSweepTime: timestamp };
  } else if (state.blipVisibility[id]) {
    const elapsed = timestamp - state.blipVisibility[id].lastSweepTime;
    state.blipVisibility[id].alpha = Math.max(0, 1 - (elapsed / BLIP_FADE_TIME));
  }

  return state.blipVisibility[id]?.alpha || 0;
}

export function drawThreats(ctx, toCanvas, timestamp) {
  for (const threat of state.threats) {
    if (threat.state === 'NEUTRALIZED' || threat.state === 'IMPACT') continue;

    const alpha = updateBlipVisibility(threat.id, threat.x, threat.y, toCanvas, timestamp);
    if (alpha <= 0) continue;

    // First detection — log it now that the sweep has revealed it
    if (!threat.detected) {
      threat.detected = true;
      addLog(`NEW CONTACT ${threat.id} — BEARING ${threat.hdgDeg} SPD ${Math.round(threat.speed * 50000)} ALT ${threat.altitude}`, 'warn');
      addLog(`${threat.id} CLASSIFIED ${threat.type} — WEAPONS FREE`, 'alert');
    }

    const [bx, by] = toCanvas(threat.x, threat.y);
    const color = RED_ALERT;
    const size = 5;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Diamond shape
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = alpha * 6;
    ctx.beginPath();
    ctx.moveTo(bx, by - size);
    ctx.lineTo(bx + size, by);
    ctx.lineTo(bx, by + size);
    ctx.lineTo(bx - size, by);
    ctx.closePath();
    ctx.fill();

    // ID label
    ctx.font = '9px "Courier New", monospace';
    ctx.shadowBlur = 0;
    ctx.fillText(threat.id, bx + size + 3, by + 3);

    // Projected path line toward target city
    const [tx, ty] = toCanvas(threat.targetCity.x, threat.targetCity.y);
    ctx.strokeStyle = `rgba(255, 68, 68, ${alpha * 0.2})`;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);

    // Selected highlight
    if (state.selectedThreat === threat) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(bx, by, size + 4, 0, Math.PI * 2);
      ctx.stroke();

      // Brighter path line when selected
      ctx.strokeStyle = `rgba(255, 68, 68, ${alpha * 0.5})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      // Target city highlight
      ctx.beginPath();
      ctx.arc(tx, ty, 8, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 68, 68, ${alpha * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }
}

export function drawInterceptors(ctx, toCanvas, timestamp) {
  for (const interceptor of state.interceptors) {
    if (interceptor.state === 'READY' || interceptor.state === 'CRASHED') continue;

    const [ix, iy] = toCanvas(interceptor.x, interceptor.y);
    const fuelPct = interceptor.fuel / interceptor.fuelMax;
    const isBingo = fuelPct <= 0.25;
    const isAWACS = interceptor.type === 'E-3A';
    const isSelected = state.selectedInterceptor === interceptor;
    const color = isBingo ? YELLOW_WARN : GREEN_BRIGHT;
    const size = isAWACS ? 6 : 4;

    ctx.save();

    if (isAWACS) {
      // Circle for AWACS
      ctx.beginPath();
      ctx.arc(ix, iy, size, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.stroke();
      // Inner dot
      ctx.beginPath();
      ctx.arc(ix, iy, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      // Chevron for fighters
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(ix - size, iy + size / 2);
      ctx.lineTo(ix, iy - size / 2);
      ctx.lineTo(ix + size, iy + size / 2);
      ctx.stroke();
    }

    // Selected ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(ix, iy, size + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.stroke();
    }

    // ID label + type
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = color;
    ctx.shadowBlur = 0;
    ctx.fillText(`${interceptor.id}`, ix + size + 3, iy + 3);

    // CAP orbit marker
    if (interceptor.state === 'CAP' && interceptor.capPoint) {
      const [cx, cy] = toCanvas(interceptor.capPoint.x, interceptor.capPoint.y);
      ctx.strokeStyle = 'rgba(0, 255, 65, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Line to target
    if (interceptor.target && interceptor.state === 'AIRBORNE') {
      const [tx, ty] = toCanvas(interceptor.target.x, interceptor.target.y);
      ctx.strokeStyle = 'rgba(0, 255, 65, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // RTB line
    if (interceptor.state === 'RTB') {
      const [bx, by] = toCanvas(interceptor.base.x, interceptor.base.y);
      ctx.strokeStyle = isBingo ? 'rgba(255, 204, 0, 0.2)' : 'rgba(0, 255, 65, 0.15)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}

// AWACS range visualization
export function drawAwacsRange(ctx, toCanvas) {
  const awacs = getActiveAWACS();
  for (const a of awacs) {
    const [ax, ay] = toCanvas(a.x, a.y);
    const w = ctx.canvas.width / window.devicePixelRatio;
    const h = ctx.canvas.height / window.devicePixelRatio;
    const rangeR = AWACS_RADAR_BONUS * Math.max(w, h);

    ctx.beginPath();
    ctx.arc(ax, ay, rangeR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill
    ctx.fillStyle = 'rgba(0, 255, 65, 0.02)';
    ctx.fill();
  }
}

const EFFECT_DURATION = 3000; // ms

export function drawEffects(ctx, toCanvas, gameTime) {
  // Remove expired effects
  state.effects = state.effects.filter(e => gameTime - e.startTime < EFFECT_DURATION);

  for (const effect of state.effects) {
    const [ex, ey] = toCanvas(effect.x, effect.y);
    const elapsed = gameTime - effect.startTime;
    const progress = elapsed / EFFECT_DURATION;
    const alpha = 1 - progress;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (effect.type === 'kill') {
      // Green expanding X with ring
      const size = 6 + progress * 12;
      ctx.strokeStyle = GREEN_BRIGHT;
      ctx.lineWidth = 2;
      ctx.shadowColor = GREEN_BRIGHT;
      ctx.shadowBlur = 8 * alpha;

      // X mark
      ctx.beginPath();
      ctx.moveTo(ex - size / 2, ey - size / 2);
      ctx.lineTo(ex + size / 2, ey + size / 2);
      ctx.moveTo(ex + size / 2, ey - size / 2);
      ctx.lineTo(ex - size / 2, ey + size / 2);
      ctx.stroke();

      // Expanding ring
      ctx.beginPath();
      ctx.arc(ex, ey, size, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.stroke();

      // "SPLASH" label
      if (progress < 0.6) {
        ctx.font = '9px "Courier New", monospace';
        ctx.fillStyle = GREEN_BRIGHT;
        ctx.shadowBlur = 0;
        ctx.fillText('SPLASH', ex + size + 4, ey + 3);
      }
    } else if (effect.type === 'impact') {
      // Red expanding rings — explosion effect
      const ring1 = 8 + progress * 30;
      const ring2 = 4 + progress * 20;
      ctx.strokeStyle = RED_ALERT;
      ctx.lineWidth = 2;
      ctx.shadowColor = RED_ALERT;
      ctx.shadowBlur = 12 * alpha;

      ctx.beginPath();
      ctx.arc(ex, ey, ring1, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(ex, ey, ring2, 0, Math.PI * 2);
      ctx.stroke();

      // Fill flash
      if (progress < 0.15) {
        ctx.fillStyle = `rgba(255, 68, 68, ${0.3 * alpha})`;
        ctx.beginPath();
        ctx.arc(ex, ey, ring1, 0, Math.PI * 2);
        ctx.fill();
      }

      // "IMPACT" label
      if (progress < 0.7) {
        ctx.font = 'bold 10px "Courier New", monospace';
        ctx.fillStyle = RED_ALERT;
        ctx.shadowBlur = 0;
        ctx.fillText('IMPACT', ex + ring1 + 4, ey + 3);
      }
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

export function drawBases(ctx, toCanvas) {
  for (const base of state.bases) {
    const [bx, by] = toCanvas(base.x, base.y);
    const size = 6;
    const isSelected = state.selectedBase === base;

    // Triangle
    ctx.beginPath();
    ctx.moveTo(bx, by - size);
    ctx.lineTo(bx + size, by + size);
    ctx.lineTo(bx - size, by + size);
    ctx.closePath();
    ctx.strokeStyle = isSelected ? '#00ff88' : GREEN_BRIGHT;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.shadowColor = GREEN_BRIGHT;
    ctx.shadowBlur = isSelected ? 8 : 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Selection ring + range envelope
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(bx, by + 2, size + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Range envelope — based on fastest ready aircraft
      const readyAircraft = base.interceptors.filter(i => i.state === 'READY');
      const fastestSpeed = Math.max(...readyAircraft.map(i => i.speed), 0);
      if (fastestSpeed > 0) {
        const cw = ctx.canvas.width / window.devicePixelRatio;
        const ch = ctx.canvas.height / window.devicePixelRatio;
        const rangeNorm = fastestSpeed * 15;
        const rangeR = rangeNorm * Math.max(cw, ch);
        ctx.beginPath();
        ctx.arc(bx, by, rangeR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Label
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = GREEN_MID;
    const readyCount = base.interceptors.filter(i => i.state === 'READY').length;
    ctx.fillText(`${base.name} [${readyCount}]`, bx + size + 3, by + 2);
  }
}

export function drawCities(ctx, toCanvas) {
  for (const city of state.cities) {
    const [cx, cy] = toCanvas(city.x, city.y);
    const alive = city.hp > 0;

    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = alive ? '#006622' : '#441111';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 1, 0, Math.PI * 2);
    ctx.fillStyle = alive ? '#006622' : '#441111';
    ctx.fill();

    ctx.font = '7px "Courier New", monospace';
    ctx.fillStyle = alive ? '#005519' : '#331111';
    ctx.fillText(city.name, cx + 5, cy + 2);
  }
}
