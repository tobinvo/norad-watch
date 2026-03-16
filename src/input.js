import { state } from './state.js';
import { selectBase, selectThreat, selectInterceptor, addLog } from './hud.js';
import { toCanvas, fromCanvas, getZoom, getPan, setPan, zoomAtPoint, resetView } from './sector.js';
import { clearMission } from './entities.js';

let canvasEl = null;

const BASE_HIT_RADIUS = 25;
const THREAT_HIT_RADIUS = 25;
const INTERCEPTOR_HIT_RADIUS = 20;

const WCS_CYCLE = ['FREE', 'TIGHT', 'HOLD'];
const EMCON_CYCLE = ['ACTIVE', 'REDUCED', 'SILENT'];

// Get effective WCS for an interceptor (unit override or global)
export function getEffectiveWCS(interceptor) {
  return interceptor.wcs || state.wcs;
}

// Can this interceptor engage a contact given WCS?
function canEngage(interceptor, contact) {
  const wcs = getEffectiveWCS(interceptor);
  if (wcs === 'HOLD') return false;
  if (contact.allegiance === 'FRIENDLY') return false;
  if (wcs === 'FREE') return contact.allegiance !== 'FRIENDLY';
  // TIGHT — only confirmed hostile
  return contact.allegiance === 'HOSTILE';
}

// Pan drag state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartNmX = 0;
let panStartNmY = 0;
let didPan = false;

export function initInput(canvas) {
  canvasEl = canvas;

  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('contextmenu', handleRightClick);

  // Mouse wheel zoom
  canvas.addEventListener('wheel', handleWheel, { passive: false });

  // Middle-click drag to pan (or left-click drag when zoomed)
  canvas.addEventListener('mousedown', handlePanStart);
  window.addEventListener('mousemove', handlePanMove);
  window.addEventListener('mouseup', handlePanEnd);

  // Keyboard shortcuts for marking contacts
  window.addEventListener('keydown', handleKeyCommand);
}

function handleWheel(e) {
  e.preventDefault();
  const { mx, my } = getMousePos(e);
  const nmPos = fromCanvas(mx, my);
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  zoomAtPoint(nmPos.x, nmPos.y, factor);
}

function handlePanStart(e) {
  // Middle button always pans; left button pans when zoomed > 1
  if (e.button === 1 || (e.button === 0 && getZoom() > 1 && !e.shiftKey)) {
    // For left-button pan, only start if not clicking on a target
    if (e.button === 0) {
      const { mx, my } = getMousePos(e);
      if (findEntityAt(mx, my)) return; // clicking an entity, don't pan
    }
    isPanning = true;
    didPan = false;
    panStartX = e.clientX;
    panStartY = e.clientY;
    const pan = getPan();
    panStartNmX = pan.x;
    panStartNmY = pan.y;
    if (e.button === 1) e.preventDefault();
  }
}

function handlePanMove(e) {
  if (!isPanning) return;
  const dx = e.clientX - panStartX;
  const dy = e.clientY - panStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan = true;

  const nmPos1 = fromCanvas(0, 0);
  const nmPos2 = fromCanvas(dx, -dy); // convert pixel delta to nm delta
  const nmDx = nmPos2.x - nmPos1.x;
  const nmDy = nmPos2.y - nmPos1.y;

  setPan(panStartNmX - nmDx, panStartNmY + nmDy);
}

function handlePanEnd(e) {
  isPanning = false;
}

function findEntityAt(mx, my) {
  for (const interceptor of state.interceptors) {
    if (interceptor.state === 'READY' || interceptor.state === 'CRASHED' || interceptor.state === 'TURNAROUND' || interceptor.state === 'MAINTENANCE') continue;
    const [ix, iy] = toCanvas(interceptor.x, interceptor.y);
    if (hitTest(mx, my, ix, iy, INTERCEPTOR_HIT_RADIUS)) return true;
  }
  for (const base of state.bases) {
    const [bx, by] = toCanvas(base.x, base.y);
    if (hitTest(mx, my, bx, by, BASE_HIT_RADIUS)) return true;
  }
  for (const contact of state.contacts) {
    if (contact.state !== 'ACTIVE' || !contact.detected) continue;
    const [tx, ty] = toCanvas(contact.x, contact.y);
    if (hitTest(mx, my, tx, ty, THREAT_HIT_RADIUS)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════
// LEFT CLICK — SELECT ONLY
// ═══════════════════════════════════════════

function handleCanvasClick(e) {
  // Suppress click after a pan drag
  if (didPan) { didPan = false; return; }

  const { mx, my } = getMousePos(e);

  // Mission define mode — block normal selection
  if (state.missionDefineMode) return;

  // Check airborne interceptors
  for (const interceptor of state.interceptors) {
    if (interceptor.state === 'READY' || interceptor.state === 'CRASHED' || interceptor.state === 'TURNAROUND' || interceptor.state === 'MAINTENANCE') continue;
    const [ix, iy] = toCanvas(interceptor.x, interceptor.y);
    if (hitTest(mx, my, ix, iy, INTERCEPTOR_HIT_RADIUS)) {
      selectInterceptor(interceptor);
      return;
    }
  }

  // Check bases
  for (const base of state.bases) {
    const [bx, by] = toCanvas(base.x, base.y);
    if (hitTest(mx, my, bx, by, BASE_HIT_RADIUS)) {
      selectBase(base);
      return;
    }
  }

  // Check contacts (threats + civilians)
  let closest = null;
  let closestDist = Infinity;
  for (const contact of state.contacts) {
    if (contact.state !== 'ACTIVE' || !contact.detected) continue;
    const [tx, ty] = toCanvas(contact.x, contact.y);
    const d = Math.sqrt((mx - tx) ** 2 + (my - ty) ** 2);
    if (d < THREAT_HIT_RADIUS && d < closestDist) {
      closest = contact;
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
  state.selectedReadyInterceptor = null;
}

// ═══════════════════════════════════════════
// RIGHT CLICK — CONTEXT ACTION
// ═══════════════════════════════════════════

function handleRightClick(e) {
  e.preventDefault();
  const { mx, my } = getMousePos(e);
  const nmPos = fromCanvas(mx, my);

  // Mission define mode — place waypoint
  if (state.missionDefineMode) {
    if (state.missionDefineWaypoints.length >= 8) {
      addLog('MAX 8 WAYPOINTS — PRESS M TO CONFIRM', 'warn');
      return;
    }
    state.missionDefineWaypoints.push({ x: nmPos.x, y: nmPos.y });
    addLog(`WAYPOINT ${state.missionDefineWaypoints.length} PLACED`, '');
    return;
  }

  const contactUnder = findContactAt(mx, my);
  const baseUnder = findBaseAt(mx, my);

  // ── Base selected: scramble, ID mission, or CAP ──
  if (state.selectedBase) {
    const base = state.selectedBase;
    const picked = state.selectedReadyInterceptor;

    if (!picked) {
      addLog(`${base.name} — SELECT AN AIRCRAFT FIRST`, 'warn');
      return;
    }

    if (picked.state !== 'READY' || picked.base !== base) {
      state.selectedReadyInterceptor = null;
      addLog(`${base.name} — AIRCRAFT NO LONGER AVAILABLE`, 'warn');
      return;
    }

    if (contactUnder) {
      const wcs = getEffectiveWCS(picked);

      if (picked.spec.weapons === 0) {
        // AWACS — orbit near contact
        picked.state = 'CAP';
        picked.capPoint = { x: contactUnder.x, y: contactUnder.y };
        picked.x = base.x;
        picked.y = base.y;
        addLog(`SCRAMBLE ORDER: ${picked.id} (${picked.type}) ${base.name} — ORBIT NEAR ${contactUnder.id}`, 'alert');
      } else if (contactUnder.allegiance === 'FRIENDLY') {
        addLog(`${contactUnder.id} IS FRIENDLY — ENGAGEMENT DENIED`, 'warn');
        return;
      } else if (wcs === 'HOLD') {
        addLog(`WEAPONS HOLD — ENGAGEMENT DENIED`, 'warn');
        return;
      } else if (canEngage(picked, contactUnder)) {
        // WCS allows engagement
        picked.state = 'AIRBORNE';
        picked.target = contactUnder;
        picked.x = base.x;
        picked.y = base.y;
        const wcsLabel = contactUnder.allegiance === 'UNKNOWN' ? ' [WCS FREE]' : '';
        addLog(`SCRAMBLE ORDER: ${picked.id} (${picked.type}) ${base.name} → ${contactUnder.id}${wcsLabel}`, 'alert');
      } else if (contactUnder.allegiance === 'UNKNOWN') {
        // TIGHT + unknown — send on ID mission
        picked.state = 'ID_MISSION';
        picked.idTarget = contactUnder;
        picked.idProgress = 0;
        picked.x = base.x;
        picked.y = base.y;
        addLog(`${picked.id} SCRAMBLE — VISUAL ID ON ${contactUnder.id}`, 'alert');
      } else {
        addLog(`WCS ${wcs} — CANNOT ENGAGE ${contactUnder.id}`, 'warn');
        return;
      }
      state.selectedBase = null;
      state.selectedThreat = null;
      state.selectedReadyInterceptor = null;
    } else {
      // CAP orbit at clicked point
      picked.state = 'CAP';
      picked.capPoint = { x: nmPos.x, y: nmPos.y };
      picked.x = base.x;
      picked.y = base.y;
      addLog(`${picked.id} ${base.name} — CAP ORBIT ASSIGNED`, '');
      state.selectedBase = null;
      state.selectedThreat = null;
      state.selectedReadyInterceptor = null;
    }
    return;
  }

  // ── Interceptor selected: reassign, RTB, ID, or CAP ──
  if (state.selectedInterceptor) {
    const interceptor = state.selectedInterceptor;
    if (interceptor.state === 'CRASHED' || interceptor.state === 'READY' || interceptor.state === 'TURNAROUND' || interceptor.state === 'MAINTENANCE') return;

    if (contactUnder && contactUnder.state === 'ACTIVE') {
      const wcs = getEffectiveWCS(interceptor);

      if (contactUnder.allegiance === 'FRIENDLY') {
        addLog(`${contactUnder.id} IS FRIENDLY — ENGAGEMENT DENIED`, 'warn');
        return;
      } else if (wcs === 'HOLD') {
        addLog(`WEAPONS HOLD — ENGAGEMENT DENIED`, 'warn');
        return;
      } else if (canEngage(interceptor, contactUnder)) {
        // WCS allows engagement
        interceptor.state = 'AIRBORNE';
        interceptor.target = contactUnder;
        interceptor.idTarget = null;
        interceptor.capPoint = null;
        interceptor.refuelTanker = null;
        interceptor.preDivertState = null;
        interceptor.preDivertTarget = null;
        interceptor.preDivertCapPoint = null;
        clearMission(interceptor);
        const wcsLabel = contactUnder.allegiance === 'UNKNOWN' ? ' [WCS FREE]' : '';
        addLog(`${interceptor.id} RETASKED → ${contactUnder.id}${wcsLabel}`, 'alert');
      } else if (contactUnder.allegiance === 'UNKNOWN') {
        // TIGHT + unknown — send on ID mission
        interceptor.state = 'ID_MISSION';
        interceptor.idTarget = contactUnder;
        interceptor.idProgress = 0;
        interceptor.target = null;
        interceptor.capPoint = null;
        interceptor.refuelTanker = null;
        interceptor.preDivertState = null;
        interceptor.preDivertTarget = null;
        interceptor.preDivertCapPoint = null;
        clearMission(interceptor);
        addLog(`${interceptor.id} — VISUAL ID ON ${contactUnder.id}`, 'alert');
      } else {
        addLog(`WCS ${wcs} — CANNOT ENGAGE ${contactUnder.id}`, 'warn');
        return;
      }
      state.selectedInterceptor = null;
    } else if (baseUnder) {
      interceptor.state = 'RTB';
      interceptor.target = null;
      interceptor.idTarget = null;
      interceptor.capPoint = null;
      interceptor.refuelTanker = null;
      interceptor.preDivertState = null;
      interceptor.preDivertTarget = null;
      interceptor.preDivertCapPoint = null;
      clearMission(interceptor);
      addLog(`${interceptor.id} — RTB ORDERED`, '');
      state.selectedInterceptor = null;
    } else if (e.shiftKey) {
      // Shift+right-click — append waypoint to route
      interceptor.waypoints.push({ x: nmPos.x, y: nmPos.y });
      if (interceptor.state !== 'CAP') {
        interceptor.state = 'CAP';
        interceptor.target = null;
        interceptor.idTarget = null;
        interceptor.refuelTanker = null;
        interceptor.preDivertState = null;
        interceptor.preDivertTarget = null;
        interceptor.preDivertCapPoint = null;
      }
      interceptor.capPoint = null;
      clearMission(interceptor);
      addLog(`${interceptor.id} — WAYPOINT ${interceptor.waypoints.length} ADDED`, '');
    } else {
      interceptor.state = 'CAP';
      interceptor.target = null;
      interceptor.idTarget = null;
      interceptor.capPoint = { x: nmPos.x, y: nmPos.y };
      interceptor.refuelTanker = null;
      interceptor.preDivertState = null;
      interceptor.preDivertTarget = null;
      interceptor.preDivertCapPoint = null;
      clearMission(interceptor);
      addLog(`${interceptor.id} — CAP ORBIT REASSIGNED`, '');
      state.selectedInterceptor = null;
    }
    return;
  }
}

// ═══════════════════════════════════════════
// KEYBOARD — MARK CONTACTS
// ═══════════════════════════════════════════

function handleKeyCommand(e) {
  // Mission define mode — M to start/confirm, Escape to cancel
  if (e.code === 'KeyM') {
    if (state.missionDefineMode) {
      // Confirm mission
      if (state.missionDefineWaypoints.length < 2) {
        addLog('NEED AT LEAST 2 WAYPOINTS — R-CLICK TO PLACE', 'warn');
        return;
      }
      const num = state.nextMissionNum++;
      const mission = {
        id: `PATROL-${num}`,
        name: `PATROL-${String(num).padStart(2, '0')}`,
        base: state.missionDefineBase,
        waypoints: [...state.missionDefineWaypoints],
        assignedInterceptor: null,
      };
      state.missions.push(mission);
      state.missionDefineMode = false;
      state.missionDefineBase = null;
      state.missionDefineWaypoints = [];
      addLog(`${mission.name} DEFINED — ${mission.waypoints.length} WAYPOINTS`, 'alert');
      return;
    }
    if (state.selectedBase) {
      // Enter mission define mode
      state.missionDefineMode = true;
      state.missionDefineBase = state.selectedBase;
      state.missionDefineWaypoints = [];
      addLog('DEFINE PATROL — R-CLICK TO PLACE WAYPOINTS — M TO CONFIRM — ESC TO CANCEL', '');
      return;
    }
    return;
  }

  if (e.code === 'Escape') {
    if (state.missionDefineMode) {
      state.missionDefineMode = false;
      state.missionDefineBase = null;
      state.missionDefineWaypoints = [];
      addLog('MISSION DEFINE CANCELLED', '');
      return;
    }
    // Clear selections
    state.selectedMission = null;
    return;
  }

  // Delete selected mission — D key
  if (e.code === 'KeyD' && state.selectedMission) {
    const mission = state.selectedMission;
    if (mission.assignedInterceptor) {
      clearMission(mission.assignedInterceptor);
    }
    state.missions = state.missions.filter(m => m !== mission);
    state.selectedMission = null;
    addLog(`${mission.name} DELETED`, 'warn');
    return;
  }

  // WCS cycling — W key
  if (e.code === 'KeyW') {
    if (state.selectedInterceptor && !['CRASHED', 'READY', 'TURNAROUND', 'MAINTENANCE'].includes(state.selectedInterceptor.state)) {
      // Cycle per-unit WCS override
      const i = state.selectedInterceptor;
      const current = i.wcs || null;
      if (!current) {
        i.wcs = 'FREE';
      } else {
        const idx = WCS_CYCLE.indexOf(current);
        const next = (idx + 1) % (WCS_CYCLE.length + 1);
        i.wcs = next < WCS_CYCLE.length ? WCS_CYCLE[next] : null;
      }
      const label = i.wcs || `GLOBAL (${state.wcs})`;
      addLog(`${i.id} WCS → ${label}`, '');
    } else {
      // Cycle global WCS
      const idx = WCS_CYCLE.indexOf(state.wcs);
      state.wcs = WCS_CYCLE[(idx + 1) % WCS_CYCLE.length];
      addLog(`SECTOR WCS → ${state.wcs}`, 'warn');
    }
    return;
  }

  // Reset zoom — Home key
  if (e.code === 'Home') {
    resetView();
    return;
  }

  // EMCON cycling — E key
  if (e.code === 'KeyE') {
    const idx = EMCON_CYCLE.indexOf(state.emcon);
    state.emcon = EMCON_CYCLE[(idx + 1) % EMCON_CYCLE.length];
    const labels = { ACTIVE: 'FULL EMISSION', REDUCED: 'REDUCED EMISSION', SILENT: 'EMISSIONS SILENT' };
    addLog(`EMCON → ${state.emcon} — ${labels[state.emcon]}`, state.emcon === 'SILENT' ? 'alert' : 'warn');
    return;
  }

  if (!state.selectedThreat || state.selectedThreat.state !== 'ACTIVE') return;

  const contact = state.selectedThreat;

  if (e.code === 'KeyH') {
    if (contact.allegiance === 'HOSTILE') return;
    contact.allegiance = 'HOSTILE';
    addLog(`${contact.id} MANUALLY DESIGNATED HOSTILE`, 'alert');
  } else if (e.code === 'KeyF') {
    if (contact.allegiance === 'FRIENDLY') return;
    contact.allegiance = 'FRIENDLY';
    addLog(`${contact.id} MANUALLY DESIGNATED FRIENDLY`, '');
  }
}

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function getMousePos(e) {
  const rect = canvasEl.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  return { mx, my };
}

function hitTest(mx, my, tx, ty, radius) {
  return Math.sqrt((mx - tx) ** 2 + (my - ty) ** 2) < radius;
}

function findContactAt(mx, my) {
  let closest = null;
  let closestDist = Infinity;
  for (const contact of state.contacts) {
    if (contact.state !== 'ACTIVE' || !contact.detected) continue;
    const [tx, ty] = toCanvas(contact.x, contact.y);
    const d = Math.sqrt((mx - tx) ** 2 + (my - ty) ** 2);
    if (d < THREAT_HIT_RADIUS && d < closestDist) {
      closest = contact;
      closestDist = d;
    }
  }
  return closest;
}

function findBaseAt(mx, my) {
  for (const base of state.bases) {
    const [bx, by] = toCanvas(base.x, base.y);
    if (hitTest(mx, my, bx, by, BASE_HIT_RADIUS)) return base;
  }
  return null;
}
