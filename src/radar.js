import {
  GREEN_BRIGHT, GREEN_MID, GREEN_DIM, RED_ALERT, YELLOW_WARN, AMBER,
  SWEEP_PERIOD, SWEEP_TRAIL_ANGLE, BLIP_FADE_TIME,
  AWACS_DETECTION_RANGE, THREAT_TYPES, SWEEPS_TO_CLASSIFY, AIRCRAFT_TYPES,
  TANKER_REFUEL_RANGE, DATA_LINK_RANGE,
  EMCON_RANGE_MULT, ESM_DETECT_RANGE, ESM_ALPHA,
  JAM_ALPHA_MULT, JAM_CLASSIFY_MULT, JAM_BURNTHROUGH, JAM_POSITION_JITTER,
} from './constants.js';
import { state } from './state.js';
import { addLog } from './hud.js';
import { getActiveAWACS, getClassCategory, hasDataLink, isInRadarCone } from './entities.js';
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
  const emconMult = EMCON_RANGE_MULT[state.emcon] || 1.0;

  for (const site of state.radarSites) {
    const [sx, sy] = toCanvas(site.x, site.y);

    // Destroyed site — show wreckage
    if (site.destroyed) {
      ctx.fillStyle = '#441111';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
      ctx.font = '7px "Courier New", monospace';
      ctx.fillStyle = '#661111';
      ctx.fillText(`${site.name}`, sx + 5, sy - 4);
      ctx.fillText('DESTROYED', sx + 5, sy + 5);
      continue;
    }

    const effectiveRange = site.rangeNm * emconMult;
    const rPx = effectiveRange * pxPerNm;

    if (emconMult > 0) {
      ctx.beginPath();
      ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
      const emconAlpha = state.emcon === 'REDUCED' ? 0.04 : 0.06;
      ctx.strokeStyle = `rgba(0, 255, 65, ${emconAlpha})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = `rgba(0, 255, 65, ${emconAlpha * 0.2})`;
      ctx.fill();
    }

    ctx.fillStyle = emconMult > 0 ? GREEN_DIM : '#331100';
    ctx.fillRect(sx - 2, sy - 2, 4, 4);

    ctx.font = '7px "Courier New", monospace';
    ctx.fillStyle = emconMult > 0 ? '#0d3a12' : '#331100';
    ctx.fillText(`${site.name}`, sx + 5, sy - 4);
    if (emconMult > 0) {
      ctx.fillText(`${Math.round(effectiveRange)}NM`, sx + 5, sy + 5);
    } else {
      ctx.fillText('SILENT', sx + 5, sy + 5);
    }
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
  const emconMult = EMCON_RANGE_MULT[state.emcon] || 1.0;

  for (const site of state.radarSites) {
    const adjustedTime = sweepTime + (site.sweepOffset || 0);
    site.sweepAngle = ((adjustedTime % SWEEP_PERIOD) / SWEEP_PERIOD) * Math.PI * 2;

    if (emconMult <= 0 || site.destroyed) continue; // SILENT or destroyed — no sweep

    const [sx, sy] = toCanvas(site.x, site.y);
    const maxR = site.rangeNm * emconMult * pxPerNm;

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

// Check if a position is being jammed by any active jammer
// Returns jamming strength 0-1 (0 = no jamming, 1 = full jamming)
function getJammingAt(x, y, radarX, radarY, radarRange) {
  let maxJam = 0;
  for (const contact of state.contacts) {
    if (contact.state !== 'ACTIVE' || contact.isCivilian) continue;
    const spec = THREAT_TYPES[contact.type];
    if (!spec || !spec.jamming) continue;

    // Jammer affects contacts near itself
    const dx = x - contact.x;
    const dy = y - contact.y;
    const distToJammer = Math.sqrt(dx * dx + dy * dy);
    if (distToJammer > spec.jamRange) continue;

    // Burn-through: jamming ineffective at close radar range
    const rdx = x - radarX;
    const rdy = y - radarY;
    const distToRadar = Math.sqrt(rdx * rdx + rdy * rdy);
    if (distToRadar < radarRange * JAM_BURNTHROUGH) continue;

    // Jamming strength — stronger closer to jammer
    const jamStrength = 1 - (distToJammer / spec.jamRange);
    maxJam = Math.max(maxJam, jamStrength);
  }
  return maxJam;
}

function updateBlipVisibility(contact, sweepTime) {
  const spec = (!contact.isCivilian && contact.type) ? THREAT_TYPES[contact.type] : null;
  let maxAlpha = 0;
  let freshSweep = false;
  let isJammed = false;
  const emconMult = EMCON_RANGE_MULT[state.emcon] || 1.0;

  // Check each radar site's sweep (affected by EMCON)
  for (const site of state.radarSites) {
    if (emconMult <= 0) break; // SILENT — no ground radar detection
    if (site.destroyed) continue; // SEAD destroyed this site

    const dx = contact.x - site.x;
    const dy = contact.y - site.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const baseRange = (spec && spec.detectionRange)
      ? Math.min(site.rangeNm, spec.detectionRange)
      : site.rangeNm;
    const effectiveRange = baseRange * emconMult;

    if (dist > effectiveRange) continue;

    // Check jamming at this contact's position relative to this radar
    const jamStrength = getJammingAt(contact.x, contact.y, site.x, site.y, effectiveRange);

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
      // Jamming reduces peak alpha
      const peakAlpha = jamStrength > 0 ? Math.max(0.3, 1 - jamStrength * JAM_ALPHA_MULT) : 1;
      state.blipVisibility[siteKey] = { alpha: peakAlpha, lastSweepTime: sweepTime };
      if (wasZero) freshSweep = true;
      if (jamStrength > 0) isJammed = true;
      maxAlpha = Math.max(maxAlpha, peakAlpha);
    } else if (state.blipVisibility[siteKey]) {
      const elapsed = sweepTime - state.blipVisibility[siteKey].lastSweepTime;
      const alpha = Math.max(0, 1 - (elapsed / BLIP_FADE_TIME));
      state.blipVisibility[siteKey].alpha = alpha;
      maxAlpha = Math.max(maxAlpha, alpha);
    }
  }

  // Track jamming state on contact for rendering jitter
  contact._jammed = isJammed;

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

  // Fighter radar detection — data-linked fighters contribute to shared picture
  // Also: fighter radar can classify contacts over time
  let bestClassifyRate = 0;
  for (const interceptor of state.interceptors) {
    if (!['AIRBORNE', 'CAP', 'ID_MISSION', 'REFUELING'].includes(interceptor.state)) continue;
    if (isInRadarCone(interceptor, contact)) {
      // Only add to shared picture if data-linked or if this fighter is selected
      if (hasDataLink(interceptor) || state.selectedInterceptor === interceptor) {
        maxAlpha = Math.max(maxAlpha, 0.7);
        if (!contact.detected) freshSweep = true;
      }
      // Track best radar classify rate among fighters with this contact in cone
      const classifyTime = AIRCRAFT_TYPES[interceptor.type]?.radarClassifyTime;
      if (classifyTime) {
        bestClassifyRate = Math.max(bestClassifyRate, 1 / classifyTime);
      }
    }
  }

  // Fighter radar classification — accumulate progress toward CLASSIFIED
  if (bestClassifyRate > 0 && contact.detected && contact.classification === 'UNKNOWN') {
    const now = state.gameTime;
    const lastUpdate = contact._radarClassifyLast || now;
    const dSec = (now - lastUpdate) / 1000;
    contact._radarClassifyLast = now;

    if (dSec > 0 && dSec < 5) { // sanity cap
      // Jamming halves classification rate
      const jamMult = isJammed ? JAM_CLASSIFY_MULT : 1;
      contact._radarClassifyProgress = (contact._radarClassifyProgress || 0) + bestClassifyRate * dSec * jamMult;

      if (contact._radarClassifyProgress >= 1) {
        contact.classification = 'CLASSIFIED';
        contact.classCategory = getClassCategory(contact.speed, contact.altitude);
        addLog(`${contact.id} RADAR CLASSIFIED — ${contact.classCategory}`, 'warn');
        if (contact.classCategory === 'BALLISTIC') {
          contact.allegiance = 'HOSTILE';
          addLog(`${contact.id} BALLISTIC TRACK — AUTO-DESIGNATED HOSTILE`, 'alert');
        }
      }
    }
  } else if (bestClassifyRate === 0) {
    contact._radarClassifyLast = state.gameTime; // reset timer when not in any cone
  }

  // ESM — passive detection of emitting threats (bearing only, dim track)
  if (spec && spec.emitting && !contact.isCivilian) {
    for (const site of state.radarSites) {
      const dx = contact.x - site.x;
      const dy = contact.y - site.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= ESM_DETECT_RANGE) {
        maxAlpha = Math.max(maxAlpha, ESM_ALPHA);
        if (!contact.detected) freshSweep = true;
        break; // one ESM detection is enough
      }
    }
  }

  // Count sweep passes for classification (jammed = half rate)
  if (freshSweep && contact.detected) {
    if (isJammed) {
      contact._jamSweepAccum = (contact._jamSweepAccum || 0) + JAM_CLASSIFY_MULT;
      if (contact._jamSweepAccum >= 1) {
        contact._jamSweepAccum -= 1;
        contact.sweepsSeen++;
        checkAutoClassify(contact);
      }
    } else {
      contact.sweepsSeen++;
      checkAutoClassify(contact);
    }
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

    let [bx, by] = toCanvas(contact.x, contact.y);
    const color = getAllegianceColor(contact);
    const size = 5;

    // Jamming jitter — wobble blip position
    if (contact._jammed) {
      const pxPerNm = nmToPixels();
      const jitterNm = JAM_POSITION_JITTER * 0.5; // visual jitter (half max for readability)
      const t = sweepTime * 0.003 + contact.id.charCodeAt(contact.id.length - 1);
      bx += Math.sin(t * 2.3) * jitterNm * pxPerNm * 0.3;
      by += Math.cos(t * 1.7) * jitterNm * pxPerNm * 0.3;
    }

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
// MISSIONS & WAYPOINTS
// ═══════════════════════════════════════════

export function drawMissions(ctx, sweepTime) {
  // Draw mission define mode waypoints (bright, pulsing)
  if (state.missionDefineMode && state.missionDefineWaypoints.length > 0) {
    const wps = state.missionDefineWaypoints;
    const pulse = 0.6 + 0.4 * Math.sin(sweepTime / 300);
    ctx.save();

    // Lines between waypoints
    if (wps.length > 1) {
      ctx.strokeStyle = `rgba(255, 204, 0, ${0.5 * pulse})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const [fx, fy] = toCanvas(wps[0].x, wps[0].y);
      ctx.moveTo(fx, fy);
      for (let i = 1; i < wps.length; i++) {
        const [wx, wy] = toCanvas(wps[i].x, wps[i].y);
        ctx.lineTo(wx, wy);
      }
      // Show loop line back to start
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Waypoint diamonds
    for (let i = 0; i < wps.length; i++) {
      const [wx, wy] = toCanvas(wps[i].x, wps[i].y);
      const s = 5;
      ctx.fillStyle = `rgba(255, 204, 0, ${0.8 * pulse})`;
      ctx.beginPath();
      ctx.moveTo(wx, wy - s);
      ctx.lineTo(wx + s, wy);
      ctx.lineTo(wx, wy + s);
      ctx.lineTo(wx - s, wy);
      ctx.closePath();
      ctx.fill();

      ctx.font = '8px "Courier New", monospace';
      ctx.fillStyle = `rgba(255, 204, 0, ${pulse})`;
      ctx.fillText(`${i + 1}`, wx + s + 2, wy + 3);
    }

    ctx.restore();
  }

  // Draw existing missions for selected base (dim)
  if (state.selectedBase) {
    const baseMissions = state.missions.filter(m => m.base === state.selectedBase);
    for (const mission of baseMissions) {
      if (mission.waypoints.length < 2) continue;
      const isSelected = state.selectedMission === mission;
      const alpha = isSelected ? 0.5 : 0.2;
      const color = isSelected ? '#00ff88' : '#00cc33';

      ctx.save();
      ctx.strokeStyle = `${color}`;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = isSelected ? 1.5 : 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const [fx, fy] = toCanvas(mission.waypoints[0].x, mission.waypoints[0].y);
      ctx.moveTo(fx, fy);
      for (let i = 1; i < mission.waypoints.length; i++) {
        const [wx, wy] = toCanvas(mission.waypoints[i].x, mission.waypoints[i].y);
        ctx.lineTo(wx, wy);
      }
      ctx.lineTo(fx, fy); // loop
      ctx.stroke();
      ctx.setLineDash([]);

      // Waypoint diamonds
      for (let i = 0; i < mission.waypoints.length; i++) {
        const [wx, wy] = toCanvas(mission.waypoints[i].x, mission.waypoints[i].y);
        const s = 4;
        ctx.globalAlpha = alpha * 1.5;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(wx, wy - s);
        ctx.lineTo(wx + s, wy);
        ctx.lineTo(wx, wy + s);
        ctx.lineTo(wx - s, wy);
        ctx.closePath();
        ctx.fill();
      }

      // Mission label at first waypoint
      ctx.globalAlpha = alpha * 2;
      ctx.font = '7px "Courier New", monospace';
      ctx.fillStyle = color;
      ctx.fillText(mission.name, fx + 6, fy - 6);

      ctx.restore();
    }
  }

  // Draw waypoints for selected interceptor (ad-hoc or mission)
  if (state.selectedInterceptor) {
    const i = state.selectedInterceptor;
    let wps = null;
    let currentIdx = 0;
    let loop = false;

    if (i.mission && i.mission.waypoints.length > 0) {
      wps = i.mission.waypoints;
      currentIdx = i.missionLeg || 0;
      loop = true;
    } else if (i.waypoints && i.waypoints.length > 0) {
      wps = i.waypoints;
      currentIdx = i.waypointIndex || 0;
    }

    if (wps && wps.length > 0) {
      ctx.save();

      // Route lines
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();

      // Line from interceptor to current waypoint
      const [ix, iy] = toCanvas(i.x, i.y);
      const [cwx, cwy] = toCanvas(wps[currentIdx].x, wps[currentIdx].y);
      ctx.moveTo(ix, iy);
      ctx.lineTo(cwx, cwy);

      // Lines between remaining waypoints
      let idx = currentIdx;
      for (let n = 0; n < wps.length - 1; n++) {
        const nextIdx = (idx + 1) % wps.length;
        if (!loop && nextIdx <= idx) break;
        const [wx, wy] = toCanvas(wps[nextIdx].x, wps[nextIdx].y);
        ctx.lineTo(wx, wy);
        idx = nextIdx;
      }
      if (loop) {
        const [fx, fy] = toCanvas(wps[currentIdx].x, wps[currentIdx].y);
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Waypoint diamonds
      for (let w = 0; w < wps.length; w++) {
        const [wx, wy] = toCanvas(wps[w].x, wps[w].y);
        const s = w === currentIdx ? 5 : 3;
        const alpha = w === currentIdx ? 0.8 : 0.4;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.moveTo(wx, wy - s);
        ctx.lineTo(wx + s, wy);
        ctx.lineTo(wx, wy + s);
        ctx.lineTo(wx - s, wy);
        ctx.closePath();
        ctx.fill();

        ctx.font = '7px "Courier New", monospace';
        ctx.fillText(`${w + 1}`, wx + s + 2, wy + 3);
      }

      ctx.restore();
    }
  }
}

// ═══════════════════════════════════════════
// INTERCEPTORS
// ═══════════════════════════════════════════

export function drawInterceptors(ctx, sweepTime) {
  for (const interceptor of state.interceptors) {
    if (interceptor.state === 'READY' || interceptor.state === 'CRASHED' || interceptor.state === 'TURNAROUND' || interceptor.state === 'MAINTENANCE') continue;

    const [ix, iy] = toCanvas(interceptor.x, interceptor.y);
    const fuelPct = interceptor.fuel / interceptor.fuelMax;
    const isBingo = fuelPct <= 0.25;
    const isAWACS = interceptor.type === 'E-3A';
    const isTanker = interceptor.type === 'KC-135';
    const isSelected = state.selectedInterceptor === interceptor;
    const isIdMission = interceptor.state === 'ID_MISSION';
    const isRefueling = interceptor.state === 'REFUELING';
    const color = isBingo ? YELLOW_WARN : isTanker ? '#c896ff' : GREEN_BRIGHT;
    const size = (isAWACS || isTanker) ? 6 : 4;

    ctx.save();

    if (isTanker) {
      // Tanker symbol: circle with + inside
      ctx.beginPath();
      ctx.arc(ix, iy, size, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ix - size * 0.5, iy);
      ctx.lineTo(ix + size * 0.5, iy);
      ctx.moveTo(ix, iy - size * 0.5);
      ctx.lineTo(ix, iy + size * 0.5);
      ctx.stroke();
    } else if (isAWACS) {
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

    // Selected ring + fuel range envelope from current position
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(ix, iy, size + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.stroke();

      // Remaining fuel range ring
      const remainSec = interceptor.fuel / interceptor.spec.fuelBurnRate;
      const remainNm = (remainSec * interceptor.speed / 3600) / 2;
      const remainR = remainNm * nmToPixels();
      ctx.beginPath();
      ctx.arc(ix, iy, remainR, 0, Math.PI * 2);
      ctx.strokeStyle = isBingo ? 'rgba(255, 204, 0, 0.15)' : 'rgba(0, 255, 136, 0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tanker refuel range ring
      if (isTanker) {
        const refuelR = TANKER_REFUEL_RANGE * nmToPixels();
        ctx.beginPath();
        ctx.arc(ix, iy, refuelR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200, 150, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '7px "Courier New", monospace';
        ctx.fillStyle = 'rgba(200, 150, 255, 0.5)';
        ctx.fillText(`REFUEL ${TANKER_REFUEL_RANGE}NM`, ix + refuelR + 3, iy - 3);
      }

      // Radar cone (fighters only)
      const radarSpec = interceptor.spec;
      if (radarSpec.radarRange && radarSpec.radarCone && !isAWACS && !isTanker) {
        const pxPerNm = nmToPixels();
        const radarR = radarSpec.radarRange * pxPerNm;
        // Convert nm heading to canvas angle (Y is flipped)
        const canvasHeading = -(interceptor.heading || 0);
        const linked = hasDataLink(interceptor);
        const coneColor = linked ? 'rgba(0, 255, 100, 0.04)' : 'rgba(255, 200, 0, 0.04)';
        const edgeColor = linked ? 'rgba(0, 255, 100, 0.2)' : 'rgba(255, 200, 0, 0.2)';

        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.arc(ix, iy, radarR, canvasHeading - radarSpec.radarCone, canvasHeading + radarSpec.radarCone);
        ctx.closePath();
        ctx.fillStyle = coneColor;
        ctx.fill();
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Radar range label
        ctx.font = '7px "Courier New", monospace';
        ctx.fillStyle = edgeColor;
        const labelAngle = canvasHeading;
        const labelX = ix + Math.cos(labelAngle) * (radarR + 5);
        const labelY = iy + Math.sin(labelAngle) * (radarR + 5);
        ctx.fillText(`${radarSpec.radarRange}NM`, labelX, labelY);

        // Data link status indicator
        if (!linked) {
          ctx.font = '8px "Courier New", monospace';
          ctx.fillStyle = 'rgba(255, 200, 0, 0.6)';
          ctx.fillText('NO LINK', ix + size + 3, iy + 12);
        }
      }
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
    const isPatrol = interceptor.state === 'CAP' && interceptor.mission;
    const stateLabel = isIdMission ? ' ID' : isRefueling ? ' REFUEL' : isPatrol ? ' PATROL' : '';
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

    // Refueling line to tanker
    if (isRefueling && interceptor.refuelTanker) {
      const [tx, ty] = toCanvas(interceptor.refuelTanker.x, interceptor.refuelTanker.y);
      ctx.strokeStyle = 'rgba(200, 150, 255, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }
}

// ═══════════════════════════════════════════
// MISSILES
// ═══════════════════════════════════════════

export function drawMissiles(ctx) {
  for (const missile of state.missiles) {
    const [mx, my] = toCanvas(missile.x, missile.y);

    ctx.save();

    if (missile.state === 'FLIGHT') {
      // In-flight: bright yellow dot with trail
      const color = '#ffff00';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;

      ctx.beginPath();
      ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.fill();

      // Trail behind missile (canvas Y is flipped: north=up, sin inverted)
      const trailLen = 10;
      const tx = mx - Math.cos(missile.heading) * trailLen;
      const ty = my + Math.sin(missile.heading) * trailLen;
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // Line from missile to target
      if (missile.target && missile.target.state === 'ACTIVE') {
        const [ttx, tty] = toCanvas(missile.target.x, missile.target.y);
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.15)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(ttx, tty);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (missile.resolveTime) {
      // Resolved: brief flash
      const elapsed = state.gameTime - missile.resolveTime;
      const progress = elapsed / 3000;
      if (progress < 1) {
        const alpha = 1 - progress;
        const isHit = missile.state === 'HIT';
        const color = isHit ? GREEN_BRIGHT : RED_ALERT;
        const size = 4 + progress * 8;

        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4 * alpha;

        ctx.beginPath();
        ctx.arc(mx, my, size, 0, Math.PI * 2);
        ctx.stroke();

        if (!isHit) {
          // Miss — small X
          ctx.beginPath();
          ctx.moveTo(mx - 3, my - 3);
          ctx.lineTo(mx + 3, my + 3);
          ctx.moveTo(mx + 3, my - 3);
          ctx.lineTo(mx - 3, my + 3);
          ctx.stroke();
        }
      }
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
    } else if (effect.type === 'damage') {
      // Cripple hit — orange flash
      const size = 5 + progress * 8;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = AMBER;
      ctx.shadowBlur = 6 * alpha;

      ctx.beginPath();
      ctx.arc(ex, ey, size, 0, Math.PI * 2);
      ctx.stroke();

      if (progress < 0.5) {
        ctx.font = '9px "Courier New", monospace';
        ctx.fillStyle = AMBER;
        ctx.shadowBlur = 0;
        ctx.fillText('DAMAGED', ex + size + 4, ey + 3);
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

      // Fuel range envelopes — one ring per aircraft type with ready aircraft
      const typesSeen = new Set();
      const typeColors = {
        'F-15A': 'rgba(255, 100, 100, 0.18)',
        'F-16C': 'rgba(100, 255, 100, 0.18)',
        'F-106A': 'rgba(100, 100, 255, 0.18)',
        'E-3A': 'rgba(255, 200, 100, 0.18)',
        'KC-135': 'rgba(200, 150, 255, 0.18)',
      };
      for (const aircraft of base.interceptors) {
        if (aircraft.state !== 'READY') continue;
        if (typesSeen.has(aircraft.type)) continue;
        typesSeen.add(aircraft.type);

        const enduranceSec = aircraft.fuel / aircraft.spec.fuelBurnRate;
        const rangeNm = (enduranceSec * aircraft.speed / 3600) / 2;
        const rangeR = rangeNm * pxPerNm;
        const color = typeColors[aircraft.type] || 'rgba(0, 255, 136, 0.15)';

        ctx.beginPath();
        ctx.arc(bx, by, rangeR, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label at top of ring
        ctx.font = '7px "Courier New", monospace';
        ctx.fillStyle = color.replace('0.18', '0.5');
        ctx.fillText(`${aircraft.type} ${Math.round(rangeNm)}nm`, bx + 5, by - rangeR + 10);
      }
    }

    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = GREEN_MID;
    const readyCount = base.interceptors.filter(i => i.state === 'READY').length;
    const turnCount = base.interceptors.filter(i => i.state === 'TURNAROUND').length;
    const turnLabel = turnCount > 0 ? ` T:${turnCount}` : '';
    ctx.fillText(`${base.name} [${readyCount}]${turnLabel}`, bx + size + 3, by + 2);
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
