import { state } from './state.js';
import { selectBase, selectThreat, selectInterceptor, addLog } from './hud.js';
import { toCanvas, fromCanvas } from './sector.js';

let canvasEl = null;

const BASE_HIT_RADIUS = 25;
const THREAT_HIT_RADIUS = 25;
const INTERCEPTOR_HIT_RADIUS = 20;

export function initInput(canvas) {
  canvasEl = canvas;

  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('contextmenu', handleRightClick);

  // Keyboard shortcuts for marking contacts
  window.addEventListener('keydown', handleKeyCommand);
}

// ═══════════════════════════════════════════
// LEFT CLICK — SELECT ONLY
// ═══════════════════════════════════════════

function handleCanvasClick(e) {
  const { mx, my } = getMousePos(e);

  // Check airborne interceptors
  for (const interceptor of state.interceptors) {
    if (interceptor.state === 'READY' || interceptor.state === 'CRASHED') continue;
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
      // Determine action based on contact allegiance
      if (picked.spec.weapons === 0) {
        // AWACS — orbit near contact
        picked.state = 'CAP';
        picked.capPoint = { x: contactUnder.x, y: contactUnder.y };
        picked.x = base.x;
        picked.y = base.y;
        addLog(`SCRAMBLE ORDER: ${picked.id} (${picked.type}) ${base.name} — ORBIT NEAR ${contactUnder.id}`, 'alert');
      } else if (contactUnder.allegiance === 'HOSTILE') {
        // Confirmed hostile — engage
        picked.state = 'AIRBORNE';
        picked.target = contactUnder;
        picked.x = base.x;
        picked.y = base.y;
        addLog(`SCRAMBLE ORDER: ${picked.id} (${picked.type}) ${base.name} → ${contactUnder.id}`, 'alert');
      } else if (contactUnder.allegiance === 'FRIENDLY') {
        addLog(`${contactUnder.id} IS FRIENDLY — ENGAGEMENT DENIED`, 'warn');
        return;
      } else {
        // Unknown allegiance — send on ID mission
        picked.state = 'ID_MISSION';
        picked.idTarget = contactUnder;
        picked.idProgress = 0;
        picked.x = base.x;
        picked.y = base.y;
        addLog(`${picked.id} SCRAMBLE — VISUAL ID ON ${contactUnder.id}`, 'alert');
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
    if (interceptor.state === 'CRASHED' || interceptor.state === 'READY') return;

    if (contactUnder && contactUnder.state === 'ACTIVE') {
      if (contactUnder.allegiance === 'HOSTILE') {
        // Engage confirmed hostile
        interceptor.state = 'AIRBORNE';
        interceptor.target = contactUnder;
        interceptor.idTarget = null;
        interceptor.capPoint = null;
        addLog(`${interceptor.id} RETASKED → ${contactUnder.id}`, 'alert');
      } else if (contactUnder.allegiance === 'FRIENDLY') {
        addLog(`${contactUnder.id} IS FRIENDLY — ENGAGEMENT DENIED`, 'warn');
        return;
      } else {
        // Unknown — send on ID mission
        interceptor.state = 'ID_MISSION';
        interceptor.idTarget = contactUnder;
        interceptor.idProgress = 0;
        interceptor.target = null;
        interceptor.capPoint = null;
        addLog(`${interceptor.id} — VISUAL ID ON ${contactUnder.id}`, 'alert');
      }
      state.selectedInterceptor = null;
    } else if (baseUnder) {
      interceptor.state = 'RTB';
      interceptor.target = null;
      interceptor.idTarget = null;
      interceptor.capPoint = null;
      addLog(`${interceptor.id} — RTB ORDERED`, '');
      state.selectedInterceptor = null;
    } else {
      interceptor.state = 'CAP';
      interceptor.target = null;
      interceptor.idTarget = null;
      interceptor.capPoint = { x: nmPos.x, y: nmPos.y };
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
  if (!state.selectedThreat || state.selectedThreat.state !== 'ACTIVE') return;

  const contact = state.selectedThreat;

  if (e.code === 'KeyH') {
    // Mark as HOSTILE
    if (contact.allegiance === 'HOSTILE') return;
    contact.allegiance = 'HOSTILE';
    addLog(`${contact.id} MANUALLY DESIGNATED HOSTILE`, 'alert');
  } else if (e.code === 'KeyF') {
    // Mark as FRIENDLY
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
