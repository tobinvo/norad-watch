import {
  GREEN_BRIGHT, GREEN_MID, GREEN_DIM, RED_ALERT, YELLOW_WARN, AMBER,
  SWEEP_PERIOD, SWEEP_TRAIL_ANGLE, BLIP_FADE_TIME,
  AWACS_DETECTION_RANGE, THREAT_TYPES, SWEEPS_TO_CLASSIFY,
} from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';
import { getActiveAWACS, getClassCategory } from './entities.js';
import { toCanvas, nmToPixels, SECTOR } from './sector.js';
import { ktsToMph } from './units.js';

// ═══════════════════════════════════════════
// RANGE RINGS
// ═══════════════════════════════════════════

export function drawRangeRings(ctx) {
  const [cx, cy] = toCanvas(0, 0);
  const pxPerNm = nmToPixels();
  const ringStep = 50;
  const maxRingNm = SECTOR.extentX;

  ctx.strokeStyle = '#001a08';
  ctx.lineWidth = 0.5;
  ctx.font = '8px "Courier New", monospace';
  ctx.fillStyle = '#0d2a10';

  for (let r = ringStep; r <= maxRingNm; r += ringStep) {
    const rPx = r * pxPerNm;
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(`${r}`, cx + 3, cy - rPx + 10);
  }
}

// ═══════════════════════════════════════════
// RADAR SITE COVERAGE
// ═══════════════════════════════════════════

export function drawRadarSites(ctx) {
  const pxPerNm = nmToPixels();

  for (const site of state.radarSites) {
    const [sx, sy] = toCanvas(site.x, site.y);
    const rPx = site.rangeNm * pxPerNm;

    ctx.beginPath();
    ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(0, 255, 65, 0.012)';
    ctx.fill();

    ctx.fillStyle = GREEN_DIM;
    ctx.fillRect(sx - 2, sy - 2, 4, 4);

    ctx.font = '7px "Courier New", monospace';
    ctx.fillStyle = '#0d3a12';
    ctx.fillText(`${site.name}`, sx + 5, sy - 4);
    ctx.fillText(`${site.rangeNm}NM`, sx + 5, sy + 5);
  }
}

// ═══════════════════════════════════════════
// ALLEGIANCE COLORS
// ═══════════════════════════════════════════

function getAllegianceColor(contact) {
  if (contact.allegiance === 'HOSTILE') return RED_ALERT;
  if (contact.allegiance === 'FRIENDLY') return GREEN_MID;
  return AMBER; // UNKNOWN
}

// ═══════════════════════════════════════════
// SWEEP — per-site rotating sweep lines
// ═══════════════════════════════════════════

export function initRadarSweeps() {
  // Offset each site's sweep so they don't all start in sync
  state.radarSites.forEach((site, i) => {
    site.sweepOffset = (i / state.radarSites.length) * SWEEP_PERIOD;
    site.sweepAngle = 0;
  });
}

export function drawSweep(ctx, gameTime, sweepTime) {
  const pxPerNm = nmToPixels();

  for (const site of state.radarSites) {
    const adjustedTime = sweepTime + (site.sweepOffset || 0);
    site.sweepAngle = ((adjustedTime % SWEEP_PERIOD) / SWEEP_PERIOD) * Math.PI * 2;

    const [sx, sy] = toCanvas(site.x, site.y);
    const maxR = site.rangeNm * pxPerNm;

    // Clip to site coverage circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, maxR, 0, Math.PI * 2);
    ctx.clip();

    // Trail
    const trailSteps = 20;
    for (let i = 0; i < trailSteps; i++) {
      const frac = i / trailSteps;
      const angle = site.sweepAngle - (SWEEP_TRAIL_ANGLE * frac);
      const alpha = 0.08 * (1 - frac);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      const stepAngle = SWEEP_TRAIL_ANGLE / trailSteps;
      ctx.arc(sx, sy, maxR, angle - stepAngle, angle);
      ctx.closePath();
      ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
      ctx.fill();
    }

    // Sweep line
    const endX = sx + Math.cos(site.sweepAngle) * maxR;
    const endY = sy + Math.sin(site.sweepAngle) * maxR;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = GREEN_BRIGHT;
    ctx.lineWidth = 1;
    ctx.shadowColor = GREEN_BRIGHT;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center dot
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fillStyle = GREEN_BRIGHT;
    ctx.shadowColor = GREEN_BRIGHT;
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}

// ═══════════════════════════════════════════
// BLIP VISIBILITY
// ═══════════════════════════════════════════

function updateBlipVisibility(contact, sweepTime) {
  const spec = (!contact.isCivilian && contact.type) ? THREAT_TYPES[contact.type] : null;
  let maxAlpha = 0;
  let freshSweep = false;

  // Check each radar site's sweep
  for (const site of state.radarSites) {
    const dx = contact.x - site.x;
    const dy = contact.y - site.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const effectiveRange = (spec && spec.detectionRange)
      ? Math.min(site.rangeNm, spec.detectionRange)
      : site.rangeNm;

    if (dist > effectiveRange) continue;

    // Check if this site's sweep has passed over the contact
    const [sx, sy] = toCanvas(site.x, site.y);
    const [bx, by] = toCanvas(contact.x, contact.y);

    const blipAngle = Math.atan2(by - sy, bx - sx);
    const sweepNorm = ((site.sweepAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const blipNorm = ((blipAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let angleDiff = sweepNorm - blipNorm;
    if (angleDiff < 0) angleDiff += Math.PI * 2;

    const siteKey = `${contact.id}_${site.name}`;

    if (angleDiff < 0.15) {
      const prev = state.blipVisibility[siteKey];
      const wasZero = !prev || prev.alpha <= 0;
      state.blipVisibility[siteKey] = { alpha: 1, lastSweepTime: sweepTime };
      if (wasZero) freshSweep = true;
      maxAlpha = 1;
    } else if (state.blipVisibility[siteKey]) {
      const elapsed = sweepTime - state.blipVisibility[siteKey].lastSweepTime;
      const alpha = Math.max(0, 1 - (elapsed / BLIP_FADE_TIME));
      state.blipVisibility[siteKey].alpha = alpha;
      maxAlpha = Math.max(maxAlpha, alpha);
    }
  }

  // AWACS provides continuous detection — persistent track, instant classification
  for (const awacs of getActiveAWACS()) {
    const dx = contact.x - awacs.x;
    const dy = contact.y - awacs.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= AWACS_DETECTION_RANGE) {
      maxAlpha = Math.max(maxAlpha, 0.85);
      if (!contact.detected) freshSweep = true;
      // AWACS radar auto-classifies — superior signal processing
      if (contact.classification === 'UNKNOWN' && contact.detected) {
        contact.classification = 'CLASSIFIED';
        contact.classCategory = getClassCategory(contact.speed, contact.altitude);
        addLog(`${contact.id} AWACS CLASSIFIED — ${contact.classCategory}`, 'warn');
        if (contact.classCategory === 'BALLISTIC') {
          contact.allegiance = 'HOSTILE';
          addLog(`${contact.id} BALLISTIC TRACK — AUTO-DESIGNATED HOSTILE`, 'alert');
        }
      }
    }
  }

  // Count sweep passes for classification
  if (freshSweep && contact.detected) {
    contact.sweepsSeen++;
    checkAutoClassify(contact);
  }

  return maxAlpha;
}

function checkAutoClassify(contact) {
  // IFF transponder — auto-classify as FRIENDLY on first detection
  if (contact.transponder && contact.allegiance === 'UNKNOWN') {
    contact.allegiance = 'FRIENDLY';
    contact.classification = 'CLASSIFIED';
    contact.classCategory = 'IFF SQUAWK';
    addLog(`${contact.id} SQUAWKING IFF — CLASSIFIED FRIENDLY`, '');
    return;
  }

  // After enough sweeps, auto-classify based on observable characteristics
  if (contact.classification === 'UNKNOWN' && contact.sweepsSeen >= SWEEPS_TO_CLASSIFY) {
    contact.classification = 'CLASSIFIED';
    contact.classCategory = getClassCategory(contact.speed, contact.altitude);
    addLog(`${contact.id} CLASSIFIED — ${contact.classCategory}`, 'warn');

    // BALLISTIC auto-marks hostile (no ICBM is civilian)
    if (contact.classCategory === 'BALLISTIC') {
      contact.allegiance = 'HOSTILE';
      addLog(`${contact.id} BALLISTIC TRACK — AUTO-DESIGNATED HOSTILE`, 'alert');
    }
  }
}

// ═══════════════════════════════════════════
// CONTACTS
// ═══════════════════════════════════════════

export function drawContacts(ctx, sweepTime) {
  for (const contact of state.contacts) {
    if (contact.state === 'NEUTRALIZED' || contact.state === 'IMPACT') continue;

    const alpha = updateBlipVisibility(contact, sweepTime);
    if (alpha <= 0) continue;

    // First detection
    if (!contact.detected) {
      contact.detected = true;
      contact.sweepsSeen = 1;
      addLog(`NEW CONTACT ${contact.id} — HDG ${contact.hdgDeg} SPD ${ktsToMph(contact.speed)} ALT ${contact.altitude}`, 'warn');

      // IFF check on first detection
      if (contact.transponder) {
        contact.allegiance = 'FRIENDLY';
        contact.classification = 'CLASSIFIED';
        contact.classCategory = 'IFF SQUAWK';
        addLog(`${contact.id} SQUAWKING IFF — FRIENDLY`, '');
      }
    }

    const [bx, by] = toCanvas(contact.x, contact.y);
    const color = getAllegianceColor(contact);
    const size = 5;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = alpha * 6;

    // Shape based on classification level
    if (contact.classification === 'UNKNOWN') {
      // Simple dot — unknown contact
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (contact.classification === 'CLASSIFIED') {
      // Category-based shape
      drawClassifiedShape(ctx, bx, by, size, contact);
    } else if (contact.classification === 'IDENTIFIED') {
      // Specific type shape (only if hostile — use threat type shapes)
      if (!contact.isCivilian && THREAT_TYPES[contact.type]) {
        drawThreatShape(ctx, bx, by, size, contact, sweepTime);
      } else {
        // Identified friendly — circle
        ctx.beginPath();
        ctx.arc(bx, by, size - 1, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // ID label + classification
    ctx.font = '9px "Courier New", monospace';
    ctx.fillStyle = color;
    ctx.shadowBlur = 0;
    let label = contact.id;
    if (contact.classification === 'IDENTIFIED') {
      label += ` ${contact.classCategory || contact.typeLabel}`;
    } else if (contact.classification === 'CLASSIFIED') {
      label += ` ${contact.classCategory}`;
    }
    ctx.fillText(label, bx + size + 3, by + 3);

    // Projected path line toward target city (only for hostile contacts)
    if (contact.allegiance === 'HOSTILE' && contact.targetCity) {
      const [tx, ty] = toCanvas(contact.targetCity.x, contact.targetCity.y);
      ctx.strokeStyle = `rgba(255, 68, 68, ${alpha * 0.2})`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Selected highlight
    if (state.selectedThreat === contact) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(bx, by, size + 4, 0, Math.PI * 2);
      ctx.stroke();

      // Path line when selected
      if (contact.targetCity) {
        const [tx, ty] = toCanvas(contact.targetCity.x, contact.targetCity.y);
        ctx.strokeStyle = `rgba(255, 68, 68, ${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(tx, ty, 8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 68, 68, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

function drawClassifiedShape(ctx, bx, by, size, contact) {
  const cat = contact.classCategory;
  if (cat === 'FAST MOVER') {
    // Chevron pointing up (military-style)
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx - size, by + size * 0.4);
    ctx.lineTo(bx, by - size * 0.4);
    ctx.lineTo(bx + size, by + size * 0.4);
    ctx.stroke();
  } else if (cat === 'HEAVY' || cat === 'IFF SQUAWK') {
    // Circle (commercial/large aircraft)
    ctx.beginPath();
    ctx.arc(bx, by, size - 1, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (cat === 'LOW RIDER') {
    // Dash — low-profile
    ctx.lineWidth = 2;
    ctx.beginPath();
    const dx = Math.cos(contact.heading) * size;
    const dy = Math.sin(contact.heading) * size;
    ctx.moveTo(bx - dx, by - dy);
    ctx.lineTo(bx + dx, by + dy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (cat === 'BALLISTIC') {
    // Large X
    const s = size * 1.3;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bx - s, by - s);
    ctx.lineTo(bx + s, by + s);
    ctx.moveTo(bx + s, by - s);
    ctx.lineTo(bx - s, by + s);
    ctx.stroke();
  } else {
    // Default — small square
    ctx.fillRect(bx - 3, by - 3, 6, 6);
  }
}

function drawThreatShape(ctx, bx, by, size, contact, sweepTime) {
  if (contact.type === 'BOMBER') {
    ctx.beginPath();
    ctx.moveTo(bx, by - size);
    ctx.lineTo(bx + size, by);
    ctx.lineTo(bx, by + size);
    ctx.lineTo(bx - size, by);
    ctx.closePath();
    ctx.fill();
  } else if (contact.type === 'FIGHTER') {
    ctx.beginPath();
    ctx.moveTo(bx, by + size);
    ctx.lineTo(bx - size * 0.8, by - size * 0.6);
    ctx.lineTo(bx + size * 0.8, by - size * 0.6);
    ctx.closePath();
    ctx.fill();
  } else if (contact.type === 'CRUISE_MISSILE') {
    ctx.lineWidth = 2;
    ctx.beginPath();
    const dx = Math.cos(contact.heading) * size;
    const dy = Math.sin(contact.heading) * size;
    ctx.moveTo(bx - dx, by - dy);
    ctx.lineTo(bx + dx, by + dy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (contact.type === 'ICBM') {
    const s = size * 1.3;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bx - s, by - s);
    ctx.lineTo(bx + s, by + s);
    ctx.moveTo(bx + s, by - s);
    ctx.lineTo(bx - s, by + s);
    ctx.stroke();
    const pulse = 0.5 + 0.5 * Math.sin(sweepTime / 200);
    ctx.beginPath();
    ctx.arc(bx, by, s + 3 + pulse * 3, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.globalAlpha *= (0.4 + pulse * 0.4);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(bx, by - size);
    ctx.lineTo(bx + size, by);
    ctx.lineTo(bx, by + size);
    ctx.lineTo(bx - size, by);
    ctx.closePath();
    ctx.fill();
  }
}

// ═══════════════════════════════════════════
// INTERCEPTORS
// ═══════════════════════════════════════════

export function drawInterceptors(ctx, sweepTime) {
  for (const interceptor of state.interceptors) {
    if (interceptor.state === 'READY' || interceptor.state === 'CRASHED') continue;

    const [ix, iy] = toCanvas(interceptor.x, interceptor.y);
    const fuelPct = interceptor.fuel / interceptor.fuelMax;
    const isBingo = fuelPct <= 0.25;
    const isAWACS = interceptor.type === 'E-3A';
    const isSelected = state.selectedInterceptor === interceptor;
    const isIdMission = interceptor.state === 'ID_MISSION';
    const color = isBingo ? YELLOW_WARN : GREEN_BRIGHT;
    const size = isAWACS ? 6 : 4;

    ctx.save();

    if (isAWACS) {
      ctx.beginPath();
      ctx.arc(ix, iy, size, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ix, iy, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
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

    // ID mission indicator — pulsing ring
    if (isIdMission && interceptor.idTarget) {
      const pulse = 0.5 + 0.5 * Math.sin(sweepTime / 300);
      ctx.beginPath();
      ctx.arc(ix, iy, size + 3, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 136, 0, ${0.3 + pulse * 0.4})`;
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.stroke();
    }

    // ID label
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = color;
    ctx.shadowBlur = 0;
    const stateLabel = isIdMission ? ' ID' : '';
    ctx.fillText(`${interceptor.id}${stateLabel}`, ix + size + 3, iy + 3);

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

    // Line to ID target
    if (interceptor.idTarget && interceptor.state === 'ID_MISSION') {
      const [tx, ty] = toCanvas(interceptor.idTarget.x, interceptor.idTarget.y);
      ctx.strokeStyle = 'rgba(255, 136, 0, 0.3)';
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

// ═══════════════════════════════════════════
// AWACS RANGE
// ═══════════════════════════════════════════

export function drawAwacsRange(ctx) {
  const pxPerNm = nmToPixels();
  const awacs = getActiveAWACS();

  for (const a of awacs) {
    const [ax, ay] = toCanvas(a.x, a.y);
    const rangeR = AWACS_DETECTION_RANGE * pxPerNm;

    // Coverage fill
    ctx.beginPath();
    ctx.arc(ax, ay, rangeR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 255, 65, 0.03)';
    ctx.fill();

    // Coverage ring
    ctx.beginPath();
    ctx.arc(ax, ay, rangeR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label at top of circle
    ctx.font = '7px "Courier New", monospace';
    ctx.fillStyle = 'rgba(0, 255, 65, 0.25)';
    ctx.fillText(`AWACS ${AWACS_DETECTION_RANGE}NM`, ax + 5, ay - rangeR + 10);
  }
}

// ═══════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════

const EFFECT_DURATION_GAME = 90000; // game-ms

export function drawEffects(ctx, gameTime) {
  state.effects = state.effects.filter(e => gameTime - e.startTime < EFFECT_DURATION_GAME);

  for (const effect of state.effects) {
    const [ex, ey] = toCanvas(effect.x, effect.y);
    const elapsed = gameTime - effect.startTime;
    const progress = elapsed / EFFECT_DURATION_GAME;
    const alpha = 1 - progress;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (effect.type === 'kill') {
      const size = 6 + progress * 12;
      ctx.strokeStyle = GREEN_BRIGHT;
      ctx.lineWidth = 2;
      ctx.shadowColor = GREEN_BRIGHT;
      ctx.shadowBlur = 8 * alpha;

      ctx.beginPath();
      ctx.moveTo(ex - size / 2, ey - size / 2);
      ctx.lineTo(ex + size / 2, ey + size / 2);
      ctx.moveTo(ex + size / 2, ey - size / 2);
      ctx.lineTo(ex - size / 2, ey + size / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(ex, ey, size, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.stroke();

      if (progress < 0.6) {
        ctx.font = '9px "Courier New", monospace';
        ctx.fillStyle = GREEN_BRIGHT;
        ctx.shadowBlur = 0;
        ctx.fillText('SPLASH', ex + size + 4, ey + 3);
      }
    } else if (effect.type === 'impact') {
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

      if (progress < 0.15) {
        ctx.fillStyle = `rgba(255, 68, 68, ${0.3 * alpha})`;
        ctx.beginPath();
        ctx.arc(ex, ey, ring1, 0, Math.PI * 2);
        ctx.fill();
      }

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

// ═══════════════════════════════════════════
// BASES
// ═══════════════════════════════════════════

export function drawBases(ctx) {
  const pxPerNm = nmToPixels();

  for (const base of state.bases) {
    const [bx, by] = toCanvas(base.x, base.y);
    const size = 6;
    const isSelected = state.selectedBase === base;

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

    if (isSelected) {
      ctx.beginPath();
      ctx.arc(bx, by + 2, size + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1;
      ctx.stroke();

      const picked = state.selectedReadyInterceptor;
      const aircraft = picked || base.interceptors.find(i => i.state === 'READY');
      if (aircraft) {
        const enduranceSec = aircraft.fuel / aircraft.spec.fuelBurnRate;
        const rangeNm = (enduranceSec * aircraft.speed / 3600) / 2;
        const rangeR = rangeNm * pxPerNm;
        ctx.beginPath();
        ctx.arc(bx, by, rangeR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = GREEN_MID;
    const readyCount = base.interceptors.filter(i => i.state === 'READY').length;
    ctx.fillText(`${base.name} [${readyCount}]`, bx + size + 3, by + 2);
  }
}

// ═══════════════════════════════════════════
// CITIES
// ═══════════════════════════════════════════

export function drawCities(ctx) {
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
