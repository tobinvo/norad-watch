import { state } from './state.js';
import { selectBase, selectThreat, selectInterceptor, addLog, cycleDoctrine } from './hud.js';
import { toCanvas, fromCanvas, getZoom, getPan, setPan, zoomAtPoint, resetView } from './sector.js';
import { clearMission } from './entities.js';
import { playEmconShift, playScrambleSiren } from './audio.js';
import { SCRAMBLE_DELAY, GAME_SPEED, MISSION_TYPES, DOCTRINE_DEFAULTS, NATO_PHONETIC, ZONE_COLORS, ZONE_BORDER_COLORS, pointInPolygon } from './constants.js';
import { fireWeapon } from './intercept.js';

let canvasEl = null;

const BASE_HIT_RADIUS = 25;
const THREAT_HIT_RADIUS = 25;
const INTERCEPTOR_HIT_RADIUS = 20;

const WCS_CYCLE = ['FREE', 'TIGHT', 'HOLD'];
const EMCON_CYCLE = ['ACTIVE', 'REDUCED', 'SILENT'];

// Start scramble — puts aircraft in SCRAMBLING with a delay before going airborne
function startScramble(interceptor, order) {
  const delay = SCRAMBLE_DELAY[interceptor.type] || 600;
  interceptor.state = 'SCRAMBLING';
  interceptor.scrambleUntil = state.gameTime + delay * 1000;
  interceptor.scrambleOrder = order;
  interceptor.x = interceptor.base.x;
  interceptor.y = interceptor.base.y;
  const delaySec = Math.round(delay / GAME_SPEED);
  addLog(`${interceptor.id} SCRAMBLING — AIRBORNE IN ${delaySec}s`, 'alert');
  playScrambleSiren();
}

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
    if (['READY', 'CRASHED', 'TURNAROUND', 'MAINTENANCE', 'SCRAMBLING'].includes(interceptor.state)) continue;
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

  // Mission define/type menu mode — block normal selection
  if (state.missionDefineMode || state.missionTypeMenu) return;

  // Zone define mode — block normal selection
  if (state.zoneDefineMode) return;

  // Check airborne interceptors
  for (const interceptor of state.interceptors) {
    if (['READY', 'CRASHED', 'TURNAROUND', 'MAINTENANCE', 'SCRAMBLING'].includes(interceptor.state)) continue;
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

  // Check zones — click inside a zone polygon selects it
  const nmClick = fromCanvas(mx, my);
  for (const zone of state.zones) {
    if (pointInPolygon(nmClick.x, nmClick.y, zone.vertices)) {
      state.selectedZone = (state.selectedZone === zone) ? null : zone;
      state.selectedBase = null;
      state.selectedThreat = null;
      state.selectedInterceptor = null;
      state.selectedReadyInterceptor = null;
      return;
    }
  }

  // Clicked nothing — clear selection
  state.selectedBase = null;
  state.selectedThreat = null;
  state.selectedInterceptor = null;
  state.selectedReadyInterceptor = null;
  state.selectedZone = null;
}

// ═══════════════════════════════════════════
// RIGHT CLICK — CONTEXT ACTION
// ═══════════════════════════════════════════

function handleRightClick(e) {
  e.preventDefault();
  const { mx, my } = getMousePos(e);
  const nmPos = fromCanvas(mx, my);

  // Block right-click during type menu
  if (state.missionTypeMenu) return;

  // Zone define mode — place vertex
  if (state.zoneDefineMode) {
    state.zoneDefineVertices.push({ x: nmPos.x, y: nmPos.y });
    addLog(`ZONE VERTEX ${state.zoneDefineVertices.length} PLACED`, '');
    return;
  }

  // Mission define mode — place waypoint
  if (state.missionDefineMode) {
    const typeDef = MISSION_TYPES[state.missionDefineType];
    if (state.missionDefineWaypoints.length >= typeDef.maxWaypoints) {
      if (typeDef.maxWaypoints === 1) {
        addLog('POINT ALREADY PLACED — PRESS M TO CONFIRM', 'warn');
      } else {
        addLog(`MAX ${typeDef.maxWaypoints} WAYPOINTS — PRESS M TO CONFIRM`, 'warn');
      }
      return;
    }
    state.missionDefineWaypoints.push({ x: nmPos.x, y: nmPos.y });
    if (typeDef.maxWaypoints === 1) {
      addLog('POINT PLACED — PRESS M TO CONFIRM', '');
    } else {
      addLog(`WAYPOINT ${state.missionDefineWaypoints.length} PLACED`, '');
    }
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

      if (picked.spec.weapons === 0 && !picked.spec.secondaryWeaponType) {
        // AWACS — orbit near contact
        startScramble(picked, { type: 'CAP', capPoint: { x: contactUnder.x, y: contactUnder.y } });
      } else if (contactUnder.allegiance === 'FRIENDLY') {
        addLog(`${contactUnder.id} IS FRIENDLY — ENGAGEMENT DENIED`, 'warn');
        return;
      } else if (wcs === 'HOLD') {
        addLog(`WEAPONS HOLD — ENGAGEMENT DENIED`, 'warn');
        return;
      } else if (canEngage(picked, contactUnder)) {
        // WCS allows engagement
        startScramble(picked, { type: 'ENGAGE', target: contactUnder });
      } else if (contactUnder.allegiance === 'UNKNOWN') {
        // TIGHT + unknown — send on ID mission
        startScramble(picked, { type: 'ID', target: contactUnder });
      } else {
        addLog(`WCS ${wcs} — CANNOT ENGAGE ${contactUnder.id}`, 'warn');
        return;
      }
      state.selectedBase = null;
      state.selectedThreat = null;
      state.selectedReadyInterceptor = null;
    } else {
      // CAP orbit at clicked point
      startScramble(picked, { type: 'CAP', capPoint: { x: nmPos.x, y: nmPos.y } });
      state.selectedBase = null;
      state.selectedThreat = null;
      state.selectedReadyInterceptor = null;
    }
    return;
  }

  // ── Interceptor selected: reassign, RTB, ID, or CAP ──
  if (state.selectedInterceptor) {
    const interceptor = state.selectedInterceptor;
    if (interceptor.state === 'CRASHED' || interceptor.state === 'READY' || interceptor.state === 'TURNAROUND' || interceptor.state === 'MAINTENANCE' || interceptor.state === 'SCRAMBLING') return;

    if (contactUnder && contactUnder.state === 'ACTIVE') {
      // TRACKING + right-click on tracked target = FIRE
      if (interceptor.state === 'TRACKING' && interceptor.target === contactUnder) {
        fireWeapon(interceptor);
        return;
      }

      const wcs = getEffectiveWCS(interceptor);

      if (contactUnder.allegiance === 'FRIENDLY') {
        addLog(`${contactUnder.id} IS FRIENDLY — ENGAGEMENT DENIED`, 'warn');
        return;
      } else if (wcs === 'HOLD') {
        addLog(`WEAPONS HOLD — ENGAGEMENT DENIED`, 'warn');
        return;
      } else if (canEngage(interceptor, contactUnder)) {
        // WCS allows engagement — keep mission so aircraft returns after kill
        interceptor.state = 'AIRBORNE';
        interceptor.target = contactUnder;
        interceptor.idTarget = null;
        interceptor.capPoint = null;
        interceptor.refuelTanker = null;
        interceptor.preDivertState = null;
        interceptor.preDivertTarget = null;
        interceptor.preDivertCapPoint = null;
        const wcsLabel = contactUnder.allegiance === 'UNKNOWN' ? ' [WCS FREE]' : '';
        const mLabel = interceptor.mission ? ` — WILL RESUME ${interceptor.mission.name}` : '';
        addLog(`${interceptor.id} RETASKED → ${contactUnder.id}${wcsLabel}${mLabel}`, 'alert');
      } else if (contactUnder.allegiance === 'UNKNOWN') {
        // TIGHT + unknown — send on ID mission, keep mission assignment
        interceptor.state = 'ID_MISSION';
        interceptor.idTarget = contactUnder;
        interceptor.idProgress = 0;
        interceptor.target = null;
        interceptor.capPoint = null;
        interceptor.refuelTanker = null;
        interceptor.preDivertState = null;
        interceptor.preDivertTarget = null;
        interceptor.preDivertCapPoint = null;
        const mLabel = interceptor.mission ? ` — WILL RESUME ${interceptor.mission.name}` : '';
        addLog(`${interceptor.id} — VISUAL ID ON ${contactUnder.id}${mLabel}`, 'alert');
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
  // Mission type menu — number keys to select type
  if (state.missionTypeMenu) {
    const typeKeys = Object.keys(MISSION_TYPES);
    const keyNum = parseInt(e.key);
    if (keyNum >= 1 && keyNum <= typeKeys.length) {
      const typeKey = typeKeys[keyNum - 1];
      const typeDef = MISSION_TYPES[typeKey];
      // Check aircraft filter — only show type if base has matching aircraft
      if (typeDef.aircraftFilter) {
        const hasType = state.missionDefineBase.interceptors.some(i =>
          typeDef.aircraftFilter.includes(i.type) && i.state !== 'CRASHED' && i.state !== 'MAINTENANCE'
        );
        if (!hasType) {
          addLog(`NO ${typeDef.aircraftFilter.join('/')} AT THIS BASE`, 'warn');
          return;
        }
      }
      state.missionTypeMenu = false;
      state.missionDefineMode = true;
      state.missionDefineType = typeKey;
      state.missionDefineWaypoints = [];
      const wpNote = typeDef.maxWaypoints === 1 ? 'R-CLICK TO PLACE POINT' : 'R-CLICK TO PLACE WAYPOINTS';
      addLog(`DEFINE ${typeDef.label} — ${wpNote} — M TO CONFIRM — ESC TO CANCEL`, '');
      return;
    }
    if (e.code === 'Escape') {
      state.missionTypeMenu = false;
      state.missionDefineBase = null;
      addLog('MISSION DEFINE CANCELLED', '');
      return;
    }
    return;
  }

  // Mission define mode — M to confirm, Escape to cancel
  if (e.code === 'KeyM') {
    if (state.missionDefineMode) {
      // Confirm mission
      const typeDef = MISSION_TYPES[state.missionDefineType];
      if (state.missionDefineWaypoints.length < typeDef.minWaypoints) {
        addLog(`NEED AT LEAST ${typeDef.minWaypoints} WAYPOINT${typeDef.minWaypoints > 1 ? 'S' : ''} — R-CLICK TO PLACE`, 'warn');
        return;
      }
      const num = state.nextMissionNum++;
      const prefix = state.missionDefineType.replace('_', '-');
      const doctrine = DOCTRINE_DEFAULTS[state.missionDefineType] || DOCTRINE_DEFAULTS.PATROL;
      const mission = {
        id: `${prefix}-${num}`,
        name: `${typeDef.label} ${String(num).padStart(2, '0')}`,
        type: state.missionDefineType,
        base: state.missionDefineBase,
        waypoints: [...state.missionDefineWaypoints],
        maxSlots: typeDef.maxSlots,
        assignedInterceptors: [],
        // Doctrine
        weaponsDiscipline: doctrine.weaponsDiscipline,
        threatPriority: doctrine.threatPriority,
        engagementMode: doctrine.engagementMode,
        pursuitLeash: doctrine.pursuitLeash,
        engagementRange: doctrine.engagementRange,
        emcon: doctrine.emcon,
        fuelPolicy: doctrine.fuelPolicy,
        notification: doctrine.notification,
      };
      state.missions.push(mission);
      state.missionDefineMode = false;
      // Keep base selected so player can immediately assign aircraft
      state.selectedBase = state.missionDefineBase;
      state.selectedMission = mission;
      state.missionDefineBase = null;
      state.missionDefineType = 'PATROL';
      state.missionDefineWaypoints = [];
      addLog(`${mission.name} DEFINED — SELECT AIRCRAFT THEN CLICK MISSION TO ASSIGN`, 'alert');
      return;
    }
    if (state.selectedBase) {
      // Open mission type picker menu
      state.missionTypeMenu = true;
      state.missionDefineBase = state.selectedBase;
      addLog('SELECT MISSION TYPE: 1=PATROL 2=ALERT CAP 3=BARRIER 4=TANKER 5=AWACS | ESC=CANCEL', '');
      return;
    }
    return;
  }

  if (e.code === 'Escape') {
    if (state.zoneDefineMode) {
      state.zoneDefineMode = false;
      state.zoneDefineVertices = [];
      addLog('ZONE DEFINE CANCELLED', '');
      return;
    }
    if (state.missionDefineMode) {
      state.missionDefineMode = false;
      state.missionDefineBase = null;
      state.missionDefineType = 'PATROL';
      state.missionDefineWaypoints = [];
      addLog('MISSION DEFINE CANCELLED', '');
      return;
    }
    // Clear selections
    state.selectedMission = null;
    state.selectedZone = null;
    return;
  }

  // Delete selected mission — D key
  if (e.code === 'KeyD' && state.selectedMission) {
    const mission = state.selectedMission;
    for (const interceptor of [...(mission.assignedInterceptors || [])]) {
      clearMission(interceptor);
    }
    state.missions = state.missions.filter(m => m !== mission);
    state.selectedMission = null;
    addLog(`${mission.name} DELETED`, 'warn');
    return;
  }

  // Doctrine keyboard shortcuts — 1-8 when mission selected
  if (state.selectedMission && !state.missionDefineMode && !state.missionTypeMenu) {
    const doctrineFields = ['weaponsDiscipline', 'threatPriority', 'engagementMode', 'pursuitLeash', 'engagementRange', 'emcon', 'fuelPolicy', 'notification'];
    const keyNum = parseInt(e.key);
    if (keyNum >= 1 && keyNum <= 8) {
      const field = doctrineFields[keyNum - 1];
      const direction = e.shiftKey ? -1 : 1;
      cycleDoctrine(state.selectedMission, field, direction);
      return;
    }
  }

  // Zone define mode — Z key
  if (e.code === 'KeyZ') {
    if (state.zoneDefineMode) {
      // Confirm zone — need at least 3 vertices
      if (state.zoneDefineVertices.length < 3) {
        addLog('NEED AT LEAST 3 VERTICES — R-CLICK TO PLACE', 'warn');
        return;
      }
      const idx = state.nextZoneNum;
      const name = NATO_PHONETIC[idx % NATO_PHONETIC.length];
      const zone = {
        id: `ZONE-${name}`,
        name,
        vertices: [...state.zoneDefineVertices],
        color: ZONE_COLORS[idx % ZONE_COLORS.length],
        borderColor: ZONE_BORDER_COLORS[idx % ZONE_BORDER_COLORS.length],
        engagementPolicy: state.wcs, // inherit current global WCS
        assignedMission: null,
      };
      state.zones.push(zone);
      state.nextZoneNum++;
      state.zoneDefineMode = false;
      state.zoneDefineVertices = [];
      addLog(`ZONE ${name} DEFINED — ${zone.vertices.length} VERTICES`, 'alert');
      return;
    }
    // Enter zone define mode (nothing selected, or zone selected)
    if (!state.missionDefineMode && !state.missionTypeMenu) {
      state.zoneDefineMode = true;
      state.zoneDefineVertices = [];
      state.selectedBase = null;
      state.selectedThreat = null;
      state.selectedInterceptor = null;
      state.selectedReadyInterceptor = null;
      state.selectedMission = null;
      addLog('DEFINE ZONE — R-CLICK TO PLACE VERTICES — Z TO CONFIRM — ESC TO CANCEL', '');
      return;
    }
    return;
  }

  // Zone-mission binding — B key (zone selected + mission selected)
  if (e.code === 'KeyB' && state.selectedZone) {
    if (state.selectedMission) {
      state.selectedZone.assignedMission = state.selectedZone.assignedMission === state.selectedMission ? null : state.selectedMission;
      const label = state.selectedZone.assignedMission ? state.selectedMission.name : 'NONE';
      addLog(`ZONE ${state.selectedZone.name} → ${label}`, '');
    } else {
      addLog('SELECT A MISSION FIRST (CLICK BASE → CLICK MISSION)', 'warn');
    }
    return;
  }

  // Zone engagement policy cycling — P key (zone selected)
  if (e.code === 'KeyP' && state.selectedZone) {
    const ZONE_WCS = ['FREE', 'TIGHT', 'HOLD'];
    const idx = ZONE_WCS.indexOf(state.selectedZone.engagementPolicy);
    state.selectedZone.engagementPolicy = ZONE_WCS[(idx + 1) % ZONE_WCS.length];
    addLog(`ZONE ${state.selectedZone.name} POLICY → ${state.selectedZone.engagementPolicy}`, '');
    return;
  }

  // Delete zone — D key (zone selected, no mission selected)
  if (e.code === 'KeyD' && state.selectedZone && !state.selectedMission) {
    const zone = state.selectedZone;
    state.zones = state.zones.filter(z => z !== zone);
    state.selectedZone = null;
    addLog(`ZONE ${zone.name} DELETED`, 'warn');
    return;
  }

  // WCS cycling — W key
  if (e.code === 'KeyW') {
    if (state.selectedInterceptor && !['CRASHED', 'READY', 'TURNAROUND', 'MAINTENANCE', 'SCRAMBLING'].includes(state.selectedInterceptor.state)) {
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
    playEmconShift(state.emcon);
    const labels = { ACTIVE: 'FULL EMISSION', REDUCED: 'REDUCED EMISSION', SILENT: 'EMISSIONS SILENT' };
    addLog(`EMCON → ${state.emcon} — ${labels[state.emcon]}`, state.emcon === 'SILENT' ? 'alert' : 'warn');
    return;
  }

  // G key — toggle radar hot/cold on selected interceptor
  if (e.code === 'KeyG') {
    if (state.selectedInterceptor && !['CRASHED', 'READY', 'TURNAROUND', 'MAINTENANCE', 'SCRAMBLING'].includes(state.selectedInterceptor.state)) {
      const i = state.selectedInterceptor;
      if (i.type === 'KC-135' || i.type === 'E-3A') return; // no radar toggle on support aircraft
      i.radarCold = !i.radarCold;
      addLog(`${i.id} RADAR ${i.radarCold ? 'COLD' : 'HOT'}`, i.radarCold ? '' : 'warn');
    }
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
