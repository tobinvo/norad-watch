import { state } from './state.js';
import { THREAT_TYPES, GAME_SPEED, CIVILIAN_KILL_PENALTY, AIRCRAFT_TYPES, DATA_LINK_RANGE, AWACS_DETECTION_RANGE, SCRAMBLE_DELAY, MISSION_TYPES } from './constants.js';
import { SHIFT_DURATION } from '../data/scenarios.js';
import { ktsToMph } from './units.js';
import { playRadioChatter, playAlertKlaxon, getMasterVolume, setMasterVolume } from './audio.js';

// Inline clearMission to avoid circular import with entities.js
function clearMissionHud(interceptor) {
  if (interceptor.mission) {
    const m = interceptor.mission;
    m.assignedInterceptors = m.assignedInterceptors.filter(i => i !== interceptor);
    interceptor.mission = null;
  }
  interceptor.missionLeg = 0;
  interceptor.missionDirection = 1;
  interceptor.waypoints = [];
  interceptor.waypointIndex = 0;
}

// ═══════════════════════════════════════════
// DOCTRINE HELPERS
// ═══════════════════════════════════════════

function renderDoctrineRow(label, displayValue, field, colorMap) {
  const colorClass = colorMap[displayValue] || '';
  return `<div class="aircraft-row doctrine-row" data-doctrine-field="${field}" style="cursor: pointer; padding: 1px 4px"><span class="detail-label" style="font-size: 8px">${label}</span><span class="detail-value ${colorClass}" style="font-size: 8px">${displayValue}</span></div>`;
}

const DOCTRINE_CYCLES = {
  weaponsDiscipline: ['CONSERVATIVE', 'STANDARD', 'WEAPONS_FREE'],
  threatPriority: ['NEAREST', 'BY_TYPE', 'BY_CITY'],
  engagementMode: ['CONSOLIDATED', 'SPLIT'],
  emcon: ['HOT', 'COLD', 'AUTO'],
  fuelPolicy: ['RTB_AT_BINGO', 'HOLD_UNTIL_RELIEVED'],
  notification: ['AUTO_PAUSE', 'LOG_ONLY'],
};

export function cycleDoctrine(mission, field, direction) {
  if (!mission) return;
  if (field === 'pursuitLeash') {
    mission.pursuitLeash = Math.max(0, mission.pursuitLeash + direction * 10);
    return;
  }
  if (field === 'engagementRange') {
    mission.engagementRange = Math.max(0, mission.engagementRange + direction * 10);
    return;
  }
  const cycle = DOCTRINE_CYCLES[field];
  if (!cycle) return;
  const idx = cycle.indexOf(mission[field]);
  mission[field] = cycle[(idx + 1) % cycle.length];
}

// ═══════════════════════════════════════════
// EVENT LOG
// ═══════════════════════════════════════════

export function addLog(text, cls) {
  const now = new Date();
  const h = String(now.getUTCHours()).padStart(2, '0');
  const m = String(now.getUTCMinutes()).padStart(2, '0');
  state.logEntries.push({ text: `${h}${m}Z — ${text}`, cls: cls || '' });

  // Sound triggers based on log content
  if (text.includes('SCRAMBLE')) playRadioChatter();
  else if (text.includes('RTB ORDERED')) playRadioChatter();
  else if (text.includes('BALLISTIC') || text.includes('DEFENSE FAILURE')) playAlertKlaxon('critical');
}

export function renderLog() {
  const logEl = document.getElementById('eventLog');
  const rendered = logEl.childElementCount;
  for (let i = rendered; i < state.logEntries.length; i++) {
    const entry = state.logEntries[i];
    const div = document.createElement('div');
    div.className = 'log-entry' + (entry.cls ? ' ' + entry.cls : '');
    div.textContent = entry.text;
    logEl.appendChild(div);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

// ═══════════════════════════════════════════
// CONTACT LIST (LEFT PANEL)
// ═══════════════════════════════════════════

function allegianceClass(contact) {
  if (contact.allegiance === 'HOSTILE') return 'hostile';
  if (contact.allegiance === 'FRIENDLY') return 'friendly';
  return 'unknown-contact';
}

function allegianceSymbol(contact) {
  if (contact.allegiance === 'HOSTILE') return '✕';
  if (contact.allegiance === 'FRIENDLY') return '▲';
  return '?';
}

function displayType(contact) {
  if (contact.classification === 'IDENTIFIED') {
    return contact.classCategory || contact.typeLabel;
  }
  if (contact.classification === 'CLASSIFIED') {
    return contact.classCategory || 'CLASSIFIED';
  }
  return 'UNKNOWN';
}

export function renderContacts() {
  const tbody = document.getElementById('contactBody');
  tbody.innerHTML = '';

  const detectedContacts = state.contacts.filter(t => t.detected && t.state === 'ACTIVE' && (t._blipAlpha || 0) > 0);

  for (const contact of detectedContacts) {
    const tr = document.createElement('tr');
    const isActive = contact.state === 'ACTIVE';
    const assigned = state.interceptors.filter(i =>
      (i.target === contact && (i.state === 'AIRBORNE' || i.state === 'TRACKING')) ||
      (i.idTarget === contact && i.state === 'ID_MISSION')
    );

    tr.className = allegianceClass(contact);
    if (!isActive) tr.classList.add('neutralized');
    if (state.selectedThreat === contact) tr.classList.add('selected');

    const hasMslInbound = state.missiles.some(m => m.target === contact && m.state === 'FLIGHT');
    let statusText = contact.state === 'NEUTRALIZED' ? 'KILL' : contact.state;
    if (isActive && hasMslInbound) {
      statusText = 'MSL';
    } else if (isActive && assigned.length > 0) {
      const idAssigned = assigned.some(i => i.state === 'ID_MISSION');
      const tracking = assigned.some(i => i.state === 'TRACKING');
      statusText = idAssigned ? 'ID' : tracking ? `TRACK (${assigned.length})` : `INTCPT (${assigned.length})`;
    }
    if (isActive && contact.damaged) {
      statusText = 'DMG ' + statusText;
    }
    if (isActive && !contact.isCivilian && THREAT_TYPES[contact.type]?.jamming) {
      statusText = 'ECM ' + statusText;
    }
    if (isActive && contact.formationId) {
      const roleTag = contact.formationRole === 'LEAD' ? 'LDR' : 'ESC';
      statusText = roleTag + ' ' + statusText;
    }

    tr.innerHTML = `
      <td>${contact.id}</td>
      <td>${allegianceSymbol(contact)}</td>
      <td>${displayType(contact)}</td>
      <td>${isActive ? contact.hdgDeg : '---'}</td>
      <td>${isActive ? ktsToMph(contact.speed) : '---'}</td>
      <td class="status-cell">${statusText}</td>
    `;

    if (isActive) {
      tr.addEventListener('click', () => {
        selectThreat(contact);
      });
    }
    tbody.appendChild(tr);
  }
}

// ═══════════════════════════════════════════
// ASSET STATUS (RIGHT PANEL)
// ═══════════════════════════════════════════

function fuelBarHTML(interceptor) {
  const pct = Math.round((interceptor.fuel / interceptor.fuelMax) * 100);
  let cls = 'fuel-ok';
  if (pct <= 25) cls = 'fuel-critical';
  else if (pct <= 50) cls = 'fuel-low';
  return `<span class="${cls}">${pct}%</span>`;
}

export function renderAssets() {
  const container = document.getElementById('assetList');
  container.innerHTML = '';

  for (const base of state.bases) {
    const block = document.createElement('div');
    block.className = 'base-block';

    let html = `<div class="base-name">${base.name} <span class="active-tag">[ACTIVE]</span></div>`;

    const readyByType = {};
    for (const i of base.interceptors) {
      if (i.state !== 'READY') continue;
      readyByType[i.type] = (readyByType[i.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(readyByType)) {
      html += `<div class="asset-line">${type} x${count} READY</div>`;
    }

    for (const interceptor of base.interceptors) {
      if (interceptor.state === 'READY') continue;
      if (interceptor.state === 'CRASHED') {
        html += `<div class="asset-line asset-crashed">${interceptor.id} CRASHED</div>`;
        continue;
      }
      if (interceptor.state === 'MAINTENANCE') {
        html += `<div class="asset-line asset-crashed">${interceptor.id} MAINT (${interceptor.sorties}/${interceptor.spec.maxSorties})</div>`;
        continue;
      }
      if (interceptor.state === 'SCRAMBLING') {
        const remainMs = interceptor.scrambleUntil - state.gameTime;
        const remainSec = Math.max(0, Math.ceil(remainMs / 1000 / GAME_SPEED));
        html += `<div class="asset-line" style="color: #ffcc00">${interceptor.id} SCRAMBLING ${remainSec}s</div>`;
        continue;
      }
      if (interceptor.state === 'TURNAROUND') {
        const remainMs = interceptor.turnaroundUntil - state.gameTime;
        const remainMin = Math.max(0, Math.ceil(remainMs / 1000 / 60));
        html += `<div class="asset-line" style="color: #888">${interceptor.id} TURN ${remainMin}min (${interceptor.sorties}/${interceptor.spec.maxSorties})</div>`;
        continue;
      }
      const targetInfo = interceptor.target ? ` → ${interceptor.target.id}` : '';
      const idInfo = interceptor.idTarget ? ` ID:${interceptor.idTarget.id}` : '';
      const capInfo = interceptor.state === 'CAP' ? ' CAP' : '';
      const refuelInfo = interceptor.state === 'REFUELING' ? ` TANK:${interceptor.refuelTanker?.id || '?'}` : '';
      const mslTag = state.missiles.some(m => m.shooter === interceptor && m.state === 'FLIGHT') ? ' MSL' : '';
      const isPatrol = interceptor.state === 'CAP' && interceptor.mission;
      const hasMission = interceptor.mission || (interceptor.scrambleOrder && interceptor.scrambleOrder.mission);
      const missionRef = interceptor.mission || interceptor.scrambleOrder?.mission;
      const stateLabel = interceptor.state === 'SCRAMBLING' ? 'SCRM' : interceptor.state === 'TRACKING' ? 'TRACK' : interceptor.state === 'ID_MISSION' ? 'ID' : interceptor.state === 'REFUELING' ? 'REFUEL' : isPatrol ? 'PATROL' : interceptor.state;
      const missionInfo = hasMission && missionRef ? ` ${missionRef.name}` : '';
      html += `<div class="asset-line">${interceptor.id} ${stateLabel}${missionInfo}${targetInfo}${idInfo}${capInfo}${refuelInfo}${mslTag} ${fuelBarHTML(interceptor)}</div>`;
    }

    block.innerHTML = html;
    container.appendChild(block);
  }
}

// ═══════════════════════════════════════════
// MISSION PANEL (RIGHT SIDEBAR)
// ═══════════════════════════════════════════

let missionPanelOpen = false;

export function renderMissionPanel() {
  const el = document.getElementById('missionPanel');
  if (!el) return;

  const hasMissions = state.missions.length > 0;
  const hasZones = state.zones.length > 0;
  const isDefining = state.missionDefineMode || state.missionTypeMenu || state.zoneDefineMode;

  // Auto-expand when there's content
  if (hasMissions || hasZones || isDefining) missionPanelOpen = true;

  // Always show header with toggle
  const chevron = missionPanelOpen ? '▼' : '▶';
  const countLabel = hasMissions || hasZones ? ` (${state.missions.length}M${hasZones ? ' ' + state.zones.length + 'Z' : ''})` : '';
  let html = `<div class="mission-panel-header mission-panel-toggle">${chevron} MISSION PLANNING${countLabel}</div>`;

  if (!missionPanelOpen) {
    el.innerHTML = html;
    return;
  }

  // Mission type picker (when defining)
  if (state.missionTypeMenu && state.missionDefineBase) {
    html += `<div style="color: #ffcc00; padding: 4px 0; font-size: 9px">NEW MISSION AT ${state.missionDefineBase.name}:</div>`;
    const typeKeys = Object.keys(MISSION_TYPES);
    for (let i = 0; i < typeKeys.length; i++) {
      const td = MISSION_TYPES[typeKeys[i]];
      html += `<div style="color: #ffcc00; font-size: 9px; padding: 1px 0">  ${i + 1}. ${td.label} (${td.description})</div>`;
    }
    html += `<div style="color: #555; font-size: 8px; padding: 2px 0">ESC = CANCEL</div>`;
  }

  // Mission define mode status
  if (state.missionDefineMode && state.missionDefineBase) {
    const typeDef = MISSION_TYPES[state.missionDefineType];
    const wpCount = state.missionDefineWaypoints.length;
    const canConfirm = wpCount >= typeDef.minWaypoints;
    html += `<div style="color: #ffcc00; font-size: 9px; padding: 4px 0">DEFINING ${typeDef.label} AT ${state.missionDefineBase.name} — ${wpCount} WPS</div>`;
    html += `<div style="color: #555; font-size: 8px">R-CLICK MAP TO PLACE WAYPOINTS</div>`;
    html += `<div class="detail-actions" style="margin-top: 4px">`;
    if (canConfirm) {
      html += `<button class="confirm-mission-btn" style="background:transparent;color:var(--green-bright);border:1px solid var(--green-bright);font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;padding:3px 12px;cursor:pointer">CONFIRM (M)</button>`;
    }
    html += `<button class="cancel-mission-btn" style="background:transparent;color:var(--yellow-warn);border:1px solid var(--yellow-warn);font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;padding:3px 12px;cursor:pointer;margin-left:6px">CANCEL (ESC)</button>`;
    html += `</div>`;
  }

  // All missions
  if (hasMissions) {
    for (const mission of state.missions) {
      const isSelected = state.selectedMission === mission;
      const selClass = isSelected ? ' mission-selected' : '';
      const assigned = mission.assignedInterceptors || [];
      const slots = mission.maxSlots || 1;
      const slotLabel = `${assigned.length}/${slots}`;
      const slotColor = assigned.length >= slots ? 'friendly' : assigned.length > 0 ? '' : 'hostile';
      const typeLabel = MISSION_TYPES[mission.type]?.label || mission.type;

      html += `<div class="mission-item${selClass}" data-mission-id="${mission.id}">`;
      html += `<div class="mission-item-header">`;
      html += `<span class="mission-name">${mission.name}</span>`;
      html += `<span class="mission-slots ${slotColor}">${slotLabel}</span>`;
      html += `</div>`;
      html += `<div class="mission-item-info">`;
      html += `<span class="mission-type">${typeLabel}</span>`;
      html += `<span class="mission-base">${mission.base.name}</span>`;
      html += `</div>`;
      if (assigned.length > 0) {
        html += `<div class="mission-item-crew">`;
        for (const a of assigned) {
          html += `<span class="crew-tag">${a.id} <span class="crew-remove" data-remove-id="${a.id}" data-remove-mission="${mission.id}">✕</span></span> `;
        }
        html += `</div>`;
      }
      html += `</div>`;

      // Doctrine panel for selected mission
      if (isSelected) {
        html += `<div class="doctrine-panel">`;
        html += renderDoctrineRow('WEAPONS', mission.weaponsDiscipline, 'weaponsDiscipline', { CONSERVATIVE: 'friendly', STANDARD: '', WEAPONS_FREE: 'hostile' });
        html += renderDoctrineRow('PRIORITY', mission.threatPriority, 'threatPriority', { NEAREST: '', BY_TYPE: '', BY_CITY: '' });
        html += renderDoctrineRow('ENGAGE', mission.engagementMode, 'engagementMode', { CONSOLIDATED: '', SPLIT: '' });
        html += renderDoctrineRow('LEASH', mission.pursuitLeash > 0 ? `${mission.pursuitLeash}NM` : 'OFF', 'pursuitLeash', {});
        html += renderDoctrineRow('RANGE', `${mission.engagementRange}NM`, 'engagementRange', {});
        html += renderDoctrineRow('EMCON', mission.emcon, 'emcon', { HOT: 'hostile', COLD: 'friendly', AUTO: '' });
        html += renderDoctrineRow('FUEL', mission.fuelPolicy === 'HOLD_UNTIL_RELIEVED' ? 'HOLD' : 'RTB', 'fuelPolicy', { RTB: '', HOLD: 'hostile' });
        html += renderDoctrineRow('NOTIFY', mission.notification === 'AUTO_PAUSE' ? 'PAUSE' : 'LOG', 'notification', { PAUSE: '', LOG: '' });
        html += `<div style="color: #555; font-size: 7px; padding: 2px 4px">CLICK ROW TO CYCLE | 1-8 KEYS | D = DELETE</div>`;
        html += `</div>`;
      }
    }
  }

  // Zones section
  if (hasZones || state.zoneDefineMode) {
    html += `<div style="color: var(--green-mid); font-size: 9px; letter-spacing: 1px; padding: 4px 0 2px 0; border-top: 1px solid var(--border-green); margin-top: 4px">ZONES</div>`;
  }

  if (state.zoneDefineMode) {
    html += `<div style="color: #ffcc00; font-size: 9px; padding: 4px 0">DEFINING ZONE — ${state.zoneDefineVertices.length} VERTICES</div>`;
    html += `<div style="color: #555; font-size: 8px">R-CLICK = VERTEX | Z = CONFIRM | ESC = CANCEL</div>`;
  }

  for (const zone of state.zones) {
    const isSelected = state.selectedZone === zone;
    const selClass = isSelected ? ' mission-selected' : '';
    const policyColors = { FREE: 'hostile', TIGHT: '', HOLD: 'friendly' };

    html += `<div class="mission-item zone-item${selClass}" data-zone-id="${zone.id}">`;
    html += `<div class="mission-item-header">`;
    html += `<span class="mission-name">${zone.name}</span>`;
    html += `<span class="mission-slots ${policyColors[zone.engagementPolicy] || ''}">${zone.engagementPolicy}</span>`;
    html += `</div>`;
    html += `<div class="mission-item-info">`;
    html += `<span class="mission-type">${zone.assignedMission ? zone.assignedMission.name : 'UNASSIGNED'}</span>`;
    html += `<span class="mission-base">${zone.vertices.length}V</span>`;
    html += `</div>`;
    html += `</div>`;

    if (isSelected) {
      const contactsInZone = state.contacts.filter(c => {
        if (c.state !== 'ACTIVE' || !c.detected) return false;
        let inside = false;
        for (let i = 0, j = zone.vertices.length - 1; i < zone.vertices.length; j = i++) {
          const xi = zone.vertices[i].x, yi = zone.vertices[i].y;
          const xj = zone.vertices[j].x, yj = zone.vertices[j].y;
          if (((yi > c.y) !== (yj > c.y)) && (c.x < (xj - xi) * (c.y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
      });
      if (contactsInZone.length > 0) {
        const hostile = contactsInZone.filter(c => c.allegiance === 'HOSTILE').length;
        const unknown = contactsInZone.filter(c => c.allegiance === 'UNKNOWN').length;
        html += `<div style="color: #ff4444; font-size: 9px; padding: 2px 4px">${contactsInZone.length} CONTACTS (${hostile}H ${unknown}U)</div>`;
      }
      html += `<div style="color: #555; font-size: 7px; padding: 2px 4px">P = POLICY | B = BIND MISSION | D = DELETE</div>`;
    }
  }

  // Hints when empty
  if (!hasMissions && !hasZones && !isDefining) {
    html += `<div style="color: #555; font-size: 9px; padding: 4px 0">SELECT BASE → M = NEW MISSION</div>`;
    html += `<div style="color: #555; font-size: 9px; padding: 2px 0">Z = DEFINE ZONE</div>`;
  }

  el.innerHTML = html;
}

// ═══════════════════════════════════════════
// SELECTION DETAIL PANEL
// ═══════════════════════════════════════════

export function renderSelectionDetail() {
  const el = document.getElementById('selectionDetail');

  if (state.selectedThreat) {
    const t = state.selectedThreat;
    const assignedInterceptors = state.interceptors.filter(i =>
      (i.target === t && (i.state === 'AIRBORNE' || i.state === 'TRACKING')) ||
      (i.idTarget === t && i.state === 'ID_MISSION')
    );

    let html = `<div class="detail-header">▶ ${t.id}</div>`;

    // Allegiance
    const allegColor = t.allegiance === 'HOSTILE' ? 'hostile' : t.allegiance === 'FRIENDLY' ? 'friendly' : '';
    html += `<div class="detail-row"><span class="detail-label">IFF</span><span class="detail-value ${allegColor}">${t.allegiance}</span></div>`;

    // Classification
    html += `<div class="detail-row"><span class="detail-label">CLASS</span><span class="detail-value">${displayType(t)}</span></div>`;

    html += `<div class="detail-row"><span class="detail-label">HDG</span><span class="detail-value">${t.hdgDeg}°</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">SPD</span><span class="detail-value">${ktsToMph(t.speed)} MPH</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">ALT</span><span class="detail-value">${t.altitude.toLocaleString()} FT</span></div>`;

    // Damage status
    if (t.damaged) {
      html += `<div class="detail-row"><span class="detail-label">STATUS</span><span class="detail-value" style="color: #ff8800">DAMAGED — SPEED REDUCED</span></div>`;
    }

    // Missile inbound
    const inboundMissiles = state.missiles.filter(m => m.target === t && m.state === 'FLIGHT');
    if (inboundMissiles.length > 0) {
      html += `<div class="detail-row"><span class="detail-label">INBOUND</span><span class="detail-value" style="color: #ffff00">${inboundMissiles.length}x MISSILE</span></div>`;
    }

    // Range + ETA to target (only for hostile with target city)
    if (t.targetCity && t.allegiance === 'HOSTILE') {
      const dx = t.targetCity.x - t.x;
      const dy = t.targetCity.y - t.y;
      const distToTarget = Math.sqrt(dx * dx + dy * dy);
      const etaGameSec = distToTarget / (t.speed / 3600);
      const etaRealSec = Math.round(etaGameSec / GAME_SPEED);

      html += `<div class="detail-row"><span class="detail-label">TARGET</span><span class="detail-value hostile">${t.targetCity.name}</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">RANGE</span><span class="detail-value">${Math.round(distToTarget)} NM</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">ETA</span><span class="detail-value hostile">${etaRealSec}s</span></div>`;
    }

    // Formation info
    if (t.formationRole === 'LEAD' && t.escorts) {
      const activeEsc = t.escorts.filter(e => e.state === 'ACTIVE');
      if (activeEsc.length > 0) {
        html += `<div class="detail-row"><span class="detail-label">FORMATION</span><span class="detail-value" style="color: #ff8800">${t.formationId}</span></div>`;
        html += `<div class="detail-row"><span class="detail-label">ESCORTS</span><span class="detail-value" style="color: #ff8800">${activeEsc.length} ACTIVE — ENGAGE ESCORTS FIRST</span></div>`;
      } else if (t.escorts.length > 0) {
        html += `<div class="detail-row"><span class="detail-label">FORMATION</span><span class="detail-value" style="color: #555">${t.formationId} — ESCORTS DOWN</span></div>`;
      }
    } else if (t.formationRole === 'ESCORT' && t.formationLead) {
      const lead = t.formationLead;
      html += `<div class="detail-row"><span class="detail-label">FORMATION</span><span class="detail-value" style="color: #ff8800">${t.formationId} — ESCORT</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">LEAD</span><span class="detail-value" style="color: #ff8800">${lead.id} ${lead.state === 'ACTIVE' ? lead.typeLabel : 'DOWN'}</span></div>`;
    }

    if (assignedInterceptors.length > 0) {
      html += `<div class="detail-assigned">ASSIGNED: ${assignedInterceptors.map(i => {
        const mission = i.state === 'ID_MISSION' ? ' (ID)' : '';
        return `${i.id}${mission}`;
      }).join(', ')}</div>`;
    } else if (t.state === 'ACTIVE') {
      if (t.allegiance === 'UNKNOWN') {
        html += `<div class="detail-assigned" style="color: var(--amber, #ff8800)">UNIDENTIFIED — SEND FIGHTER TO ID</div>`;
      } else if (t.allegiance === 'HOSTILE') {
        html += `<div class="detail-assigned" style="color: var(--yellow-warn)">HOSTILE — WEAPONS FREE</div>`;
      }
    }

    // Manual marking controls
    if (t.state === 'ACTIVE' && t.classification !== 'IDENTIFIED') {
      html += `<div class="mark-controls">`;
      html += `<span class="mark-hint">H = MARK HOSTILE | F = MARK FRIENDLY</span>`;
      html += `</div>`;
    }

    el.innerHTML = html;

  } else if (state.selectedInterceptor) {
    const i = state.selectedInterceptor;
    const fuelPct = Math.round((i.fuel / i.fuelMax) * 100);
    let html = `<div class="detail-header">▶ ${i.id}</div>`;
    html += `<div class="detail-row"><span class="detail-label">TYPE</span><span class="detail-value friendly">${i.spec.name}</span></div>`;

    const isPatrol = i.state === 'CAP' && i.mission;
    const stateLabel = i.state === 'SCRAMBLING' ? 'SCRAMBLING' : i.state === 'TRACKING' ? 'TRACKING' : i.state === 'ID_MISSION' ? 'ID MISSION' : i.state === 'REFUELING' ? 'REFUELING' : isPatrol ? 'PATROL' : i.state;
    const stateColor = i.state === 'TRACKING' ? ' style="color: #ffcc00"' : '';
    html += `<div class="detail-row"><span class="detail-label">STATE</span><span class="detail-value"${stateColor}>${stateLabel}</span></div>`;
    if (i.state === 'SCRAMBLING') {
      const remainMs = i.scrambleUntil - state.gameTime;
      const remainSec = Math.max(0, Math.ceil(remainMs / 1000 / GAME_SPEED));
      html += `<div class="detail-row"><span class="detail-label">AIRBORNE</span><span class="detail-value" style="color: #ffcc00">${remainSec}s</span></div>`;
    }
    if (i.state === 'TRACKING') {
      html += `<div class="detail-row"><span class="detail-label">STATUS</span><span class="detail-value" style="color: #ffcc00">WEAPONS FREE — AUTO-ENGAGE</span></div>`;
    }
    html += `<div class="detail-row"><span class="detail-label">FUEL</span><span class="detail-value ${fuelPct <= 25 ? 'hostile' : ''}">${fuelPct}%</span></div>`;
    if (i.holdingPastBingo) {
      html += `<div class="detail-row"><span class="detail-label">WARNING</span><span class="detail-value hostile">HOLDING PAST BINGO — CRASH RISK</span></div>`;
    }
    let weaponStr = i.spec.weaponType ? `${i.weapons}x ${i.spec.weaponType}` : 'NONE';
    if (i.spec.secondaryWeaponType) weaponStr += ` + ${i.secondaryWeapons}x ${i.spec.secondaryWeaponType}`;
    html += `<div class="detail-row"><span class="detail-label">WEAPONS</span><span class="detail-value">${weaponStr}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">SORTIES</span><span class="detail-value">${i.sorties}/${i.spec.maxSorties}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">BASE</span><span class="detail-value">${i.base.name}</span></div>`;

    // WCS
    const unitWcs = i.wcs || null;
    const effectiveWcs = unitWcs || state.wcs;
    const wcsColor = { FREE: 'hostile', TIGHT: '', HOLD: 'friendly' }[effectiveWcs] || '';
    const wcsLabel = unitWcs ? `${unitWcs} (OVERRIDE)` : `${state.wcs} (GLOBAL)`;
    html += `<div class="detail-row"><span class="detail-label">WCS</span><span class="detail-value ${wcsColor}">${wcsLabel}</span></div>`;

    // Radar info (fighters only)
    if (i.spec.radarRange && i.spec.radarCone) {
      const radarState = i.radarCold ? '<span style="color: #00aaff"> COLD</span>' : '';
      html += `<div class="detail-row"><span class="detail-label">RADAR</span><span class="detail-value">${i.spec.radarRange}NM / ${Math.round(i.spec.radarCone * 2 * 180 / Math.PI)}°${radarState}</span></div>`;

      // Data link status — inline check (avoids circular import)
      const awacsList = state.interceptors.filter(a => a.type === 'E-3A' && (a.state === 'AIRBORNE' || a.state === 'CAP'));
      const linked = awacsList.some(a => {
        const dx = a.x - i.x;
        const dy = a.y - i.y;
        return Math.sqrt(dx * dx + dy * dy) <= DATA_LINK_RANGE;
      });
      const linkColor = linked ? 'friendly' : '';
      const linkLabel = linked ? 'LINKED' : 'NO LINK';
      html += `<div class="detail-row"><span class="detail-label">DLINK</span><span class="detail-value ${linkColor}">${linkLabel}</span></div>`;
    }

    // Missile in flight indicator
    const activeMissiles = state.missiles.filter(m => m.shooter === i && m.state === 'FLIGHT');
    if (activeMissiles.length > 0) {
      html += `<div class="detail-row"><span class="detail-label">MISSILE</span><span class="detail-value" style="color: #ffff00">AWAY (${activeMissiles.length})</span></div>`;
    }

    if (i.target) {
      html += `<div class="detail-row"><span class="detail-label">TARGET</span><span class="detail-value hostile">${i.target.id}</span></div>`;
    }
    if (i.idTarget) {
      html += `<div class="detail-row"><span class="detail-label">ID TGT</span><span class="detail-value" style="color: #ff8800">${i.idTarget.id}</span></div>`;
    }

    // Tanker: show how many fighters are refueling nearby
    if (i.type === 'KC-135' && i.state === 'CAP') {
      const nearbyFighters = state.interceptors.filter(f => {
        if (f === i || f.type === 'KC-135' || f.type === 'E-3A') return false;
        const dx = f.x - i.x;
        const dy = f.y - i.y;
        return Math.sqrt(dx * dx + dy * dy) <= 5;
      });
      if (nearbyFighters.length > 0) {
        html += `<div class="detail-row"><span class="detail-label">REFUELING</span><span class="detail-value friendly">${nearbyFighters.length} AIRCRAFT</span></div>`;
      }
    }

    // Fighter diverting to tanker
    if (i.refuelTanker) {
      html += `<div class="detail-row"><span class="detail-label">TANKER</span><span class="detail-value" style="color: #c896ff">${i.refuelTanker.id}</span></div>`;
    }

    // Mission / waypoint info
    if (i.mission) {
      html += `<div class="detail-row"><span class="detail-label">MISSION</span><span class="detail-value friendly">${i.mission.name}</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">LEG</span><span class="detail-value">${(i.missionLeg || 0) + 1}/${i.mission.waypoints.length}</span></div>`;
    } else if (i.waypoints && i.waypoints.length > 0) {
      html += `<div class="detail-row"><span class="detail-label">ROUTE</span><span class="detail-value">${(i.waypointIndex || 0) + 1}/${i.waypoints.length} WPS</span></div>`;
    }

    if (!['RTB', 'CRASHED', 'TURNAROUND', 'MAINTENANCE', 'SCRAMBLING'].includes(i.state)) {
      // Check if a tanker is available for the REFUEL button
      const canRefuel = i.type !== 'KC-135' && i.type !== 'E-3A' && i.state !== 'REFUELING'
        && state.interceptors.some(t => t.type === 'KC-135' && t.state === 'CAP');
      html += `<div class="detail-assigned" style="color: var(--yellow-warn)">R-CLICK: ENGAGE/ID/RTB | G = RADAR HOT/COLD</div>`;
      html += `<div class="detail-actions"><button class="rtb-btn" data-interceptor-id="${i.id}">RTB</button>`;
      if (canRefuel) {
        html += `<button class="refuel-btn" data-interceptor-id="${i.id}">REFUEL</button>`;
      }
      html += `</div>`;
    }

    el.innerHTML = html;

  } else if (state.selectedBase) {
    const b = state.selectedBase;
    const ready = b.interceptors.filter(i => i.state === 'READY');
    const airborne = b.interceptors.filter(i =>
      !['READY', 'CRASHED', 'TURNAROUND', 'MAINTENANCE', 'SCRAMBLING'].includes(i.state)
    );
    const turning = b.interceptors.filter(i => i.state === 'TURNAROUND');
    const maint = b.interceptors.filter(i => i.state === 'MAINTENANCE');

    let html = `<div class="detail-header">▶ ${b.name}</div>`;

    // Show assignment mode banner when a mission is selected
    const assignMission = state.selectedMission && state.selectedMission.base === b ? state.selectedMission : null;
    if (assignMission) {
      const slotsLeft = (assignMission.maxSlots || 1) - (assignMission.assignedInterceptors || []).length;
      html += `<div style="background: rgba(0, 255, 65, 0.1); border: 1px solid var(--green-bright); padding: 4px 6px; margin-bottom: 4px; font-size: 9px">`;
      html += `<div style="color: var(--green-bright); font-weight: bold">ASSIGNING → ${assignMission.name}</div>`;
      html += `<div style="color: var(--green-mid)">${slotsLeft} SLOT${slotsLeft !== 1 ? 'S' : ''} OPEN — CLICK AIRCRAFT TO ASSIGN</div>`;
      html += `</div>`;
    }

    for (const i of ready) {
      const isSelected = state.selectedReadyInterceptor === i;
      const selClass = isSelected ? ' aircraft-selected' : '';
      let weaponInfo = i.spec.weaponType ? `${i.weapons}x ${i.spec.weaponType}` : 'NO WEAPONS';
      if (i.spec.secondaryWeaponType) weaponInfo += `+${i.secondaryWeapons}${i.spec.secondaryWeaponType.charAt(0)}`;
      const sortieInfo = `S${i.sorties}/${i.spec.maxSorties}`;
      html += `<div class="aircraft-row${selClass}" data-interceptor-id="${i.id}">`;
      html += `<span class="detail-label">${i.id}</span>`;
      html += `<span class="detail-value friendly">${i.type}</span>`;
      html += `<span class="detail-value">${weaponInfo}</span>`;
      html += `<span class="detail-value">${sortieInfo}</span>`;
      html += `</div>`;
    }

    const scrambling = b.interceptors.filter(i => i.state === 'SCRAMBLING');
    if (scrambling.length > 0) {
      for (const i of scrambling) {
        const remainMs = i.scrambleUntil - state.gameTime;
        const remainSec = Math.max(0, Math.ceil(remainMs / 1000 / GAME_SPEED));
        html += `<div class="detail-assigned" style="color: #ffcc00">${i.id} SCRAMBLING ${remainSec}s <button class="cancel-scramble-btn" data-interceptor-id="${i.id}">CANCEL</button></div>`;
      }
    }

    if (turning.length > 0) {
      for (const i of turning) {
        const remainMs = i.turnaroundUntil - state.gameTime;
        const remainMin = Math.max(0, Math.ceil(remainMs / 1000 / 60));
        html += `<div class="detail-assigned" style="color: #888">${i.id} TURNAROUND ${remainMin}min (S${i.sorties}/${i.spec.maxSorties})</div>`;
      }
    }

    if (maint.length > 0) {
      for (const i of maint) {
        html += `<div class="detail-assigned" style="color: #555">${i.id} MAINTENANCE — OUT</div>`;
      }
    }

    if (airborne.length > 0) {
      html += `<div class="detail-row"><span class="detail-label">AIRBORNE</span><span class="detail-value">${airborne.length}</span></div>`;
      for (const i of airborne) {
        const targetInfo = i.target ? ` → ${i.target.id}` : '';
        const idInfo = i.idTarget ? ` ID:${i.idTarget.id}` : '';
        const refuelInfo = i.state === 'REFUELING' ? ` TANK:${i.refuelTanker?.id || '?'}` : '';
        const fuelPct = Math.round((i.fuel / i.fuelMax) * 100);
        const isPatrol = i.state === 'CAP' && i.mission;
        const stateLabel = i.state === 'TRACKING' ? 'TRACK' : i.state === 'ID_MISSION' ? 'ID' : i.state === 'REFUELING' ? 'REFUEL' : isPatrol ? 'PATROL' : i.state;
        const missionInfo = isPatrol ? ` ${i.mission.name}` : '';
        html += `<div class="detail-assigned">${i.id} ${stateLabel}${missionInfo}${targetInfo}${idInfo}${refuelInfo} FUEL:${fuelPct}%</div>`;
      }
    }

    if (state.selectedReadyInterceptor) {
      const s = state.selectedReadyInterceptor.spec;
      const ratingBar = (n) => '█'.repeat(n) + '░'.repeat(3 - n);
      const sri = state.selectedReadyInterceptor;
      html += `<div class="aircraft-stats">`;
      html += `<div class="detail-row"><span class="detail-label">TYPE</span><span class="detail-value friendly">${s.name}</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">ROLE</span><span class="detail-value">${s.role}</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">SPD</span><span class="detail-value">${ratingBar(s.speedRating)}</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">RNG</span><span class="detail-value">${ratingBar(s.rangeRating)}</span></div>`;
      html += `<div class="detail-row"><span class="detail-label">END</span><span class="detail-value">${ratingBar(s.enduranceRating)}</span></div>`;
      if (s.weaponType) {
        let armStr = `${sri.weapons}x ${s.weaponType}`;
        if (s.secondaryWeaponType) armStr += ` + ${sri.secondaryWeapons}x ${s.secondaryWeaponType}`;
        html += `<div class="detail-row"><span class="detail-label">ARM</span><span class="detail-value">${armStr}</span></div>`;
      }
      html += `<div class="detail-row"><span class="detail-label">SRT</span><span class="detail-value">${sri.sorties}/${s.maxSorties} (${Math.round(s.turnaroundTime / 60)}min turn)</span></div>`;
      html += `<div class="aircraft-desc">${s.desc}</div>`;
      html += `</div>`;
      html += `<div class="detail-assigned" style="color: var(--yellow-warn)">R-CLICK: HOSTILE=SCRAMBLE | UNKNOWN=ID | EMPTY=CAP</div>`;
    } else if (ready.length > 0) {
      if (assignMission) {
        html += `<div class="detail-assigned" style="color: var(--green-bright)">CLICK AIRCRAFT ABOVE TO ASSIGN TO ${assignMission.name}</div>`;
      } else {
        html += `<div class="detail-assigned" style="color: var(--yellow-warn)">SELECT AN AIRCRAFT ABOVE</div>`;
      }
    }

    html += `<div class="detail-assigned" style="color: #555">M = NEW MISSION | SELECT MISSION IN PANEL → TO ASSIGN</div>`;

    el.innerHTML = html;
  } else {
    el.innerHTML = '';
  }
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════

let hudInitialized = false;

export function initHud() {
  if (hudInitialized) return;
  hudInitialized = true;

  const panel = document.querySelector('.left-panel');
  panel.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.aircraft-row');
    if (!row) return;
    e.stopPropagation();
    const id = row.dataset.interceptorId;
    if (!state.selectedBase) return;
    const interceptor = state.selectedBase.interceptors.find(i => i.id === id && i.state === 'READY');
    if (!interceptor) return;

    // If a mission is selected, clicking an aircraft assigns it directly
    const mission = state.selectedMission;
    if (mission && mission.base === interceptor.base) {
      const typeDef = MISSION_TYPES[mission.type];
      if (typeDef && typeDef.aircraftFilter && !typeDef.aircraftFilter.includes(interceptor.type)) {
        addLog(`${mission.name} REQUIRES ${typeDef.aircraftFilter.join('/')}`, 'warn');
        return;
      }
      const assigned = mission.assignedInterceptors || [];
      if (assigned.length >= (mission.maxSlots || 1)) {
        addLog(`${mission.name} — ALL SLOTS FILLED`, 'warn');
        state.selectedMission = null;
        return;
      }
      const delay = SCRAMBLE_DELAY[interceptor.type] || 600;
      interceptor.state = 'SCRAMBLING';
      interceptor.scrambleUntil = state.gameTime + delay * 1000;
      interceptor.scrambleOrder = { type: 'PATROL', mission };
      interceptor.x = interceptor.base.x;
      interceptor.y = interceptor.base.y;
      const delaySec = Math.round(delay / GAME_SPEED);
      addLog(`${interceptor.id} → ${mission.name} — AIRBORNE IN ${delaySec}s`, 'alert');
      state.selectedReadyInterceptor = null;
      // Keep base + mission selected so player can keep clicking aircraft
      return;
    }

    // Normal toggle selection
    state.selectedReadyInterceptor = (state.selectedReadyInterceptor === interceptor) ? null : interceptor;
  });

  // Mission panel (right side) — toggle, mission item click, doctrine click, zone click
  const missionPanelEl = document.getElementById('missionPanel');
  if (missionPanelEl) {
    // Toggle expand/collapse
    missionPanelEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.mission-panel-toggle')) {
        e.stopPropagation();
        missionPanelOpen = !missionPanelOpen;
      }
    });
    // Mission item click — select mission or assign aircraft
    missionPanelEl.addEventListener('mousedown', (e) => {
      const row = e.target.closest('.mission-item:not(.zone-item)');
      if (!row) return;
      e.stopPropagation();
      const missionId = row.dataset.missionId;
      const mission = state.missions.find(m => m.id === missionId);
      if (!mission) return;

      // If aircraft is selected, assign to mission immediately
      if (state.selectedReadyInterceptor && state.selectedBase === mission.base) {
        const picked = state.selectedReadyInterceptor;
        if (picked.state !== 'READY') return;

        // Check aircraft type filter
        const typeDef = MISSION_TYPES[mission.type];
        if (typeDef && typeDef.aircraftFilter && !typeDef.aircraftFilter.includes(picked.type)) {
          addLog(`${mission.name} REQUIRES ${typeDef.aircraftFilter.join('/')}`, 'warn');
          return;
        }

        // Check if mission has open slots
        const assigned = mission.assignedInterceptors || [];
        const slots = mission.maxSlots || 1;
        if (assigned.length >= slots) {
          addLog(`${mission.name} — ALL SLOTS FILLED`, 'warn');
          return;
        }

        const delay = SCRAMBLE_DELAY[picked.type] || 600;
        picked.state = 'SCRAMBLING';
        picked.scrambleUntil = state.gameTime + delay * 1000;
        picked.scrambleOrder = { type: 'PATROL', mission };
        picked.x = picked.base.x;
        picked.y = picked.base.y;
        const delaySec = Math.round(delay / GAME_SPEED);
        addLog(`${picked.id} SCRAMBLING — ${mission.name} — AIRBORNE IN ${delaySec}s`, 'alert');

        // Auto-select next ready aircraft at same base for rapid assignment
        const base = mission.base;
        const nextReady = base.interceptors.find(i => i.state === 'READY' && i !== picked);
        if (nextReady && (mission.assignedInterceptors.length + 1) < (mission.maxSlots || 1)) {
          state.selectedReadyInterceptor = nextReady;
          // Keep base selected for continued assignment
        } else {
          state.selectedBase = null;
          state.selectedReadyInterceptor = null;
          state.selectedMission = null;
        }
        return;
      }

      // Toggle mission selection
      state.selectedMission = (state.selectedMission === mission) ? null : mission;
      state.selectedZone = null;
    });

    // Zone item click — select zone
    missionPanelEl.addEventListener('mousedown', (e) => {
      const row = e.target.closest('.zone-item');
      if (!row) return;
      e.stopPropagation();
      const zoneId = row.dataset.zoneId;
      const zone = state.zones.find(z => z.id === zoneId);
      if (!zone) return;
      state.selectedZone = (state.selectedZone === zone) ? null : zone;
      state.selectedBase = null;
      state.selectedThreat = null;
      state.selectedInterceptor = null;
      state.selectedReadyInterceptor = null;
    });

    // Doctrine row click — cycle doctrine value
    missionPanelEl.addEventListener('mousedown', (e) => {
      const row = e.target.closest('.doctrine-row');
      if (!row || !state.selectedMission) return;
      e.stopPropagation();
      const field = row.dataset.doctrineField;
      if (field) cycleDoctrine(state.selectedMission, field, 1);
    });

    // Crew remove click — unassign aircraft from mission
    missionPanelEl.addEventListener('mousedown', (e) => {
      const removeBtn = e.target.closest('.crew-remove');
      if (!removeBtn) return;
      e.stopPropagation();
      const interceptorId = removeBtn.dataset.removeId;
      const missionId = removeBtn.dataset.removeMission;
      const mission = state.missions.find(m => m.id === missionId);
      if (!mission) return;
      const interceptor = mission.assignedInterceptors.find(i => i.id === interceptorId);
      if (interceptor) {
        clearMissionHud(interceptor);
        // Send aircraft back to base
        if (interceptor.state !== 'CRASHED' && interceptor.state !== 'READY' && interceptor.state !== 'TURNAROUND' && interceptor.state !== 'MAINTENANCE') {
          interceptor.state = 'RTB';
          interceptor.target = null;
          interceptor.capPoint = null;
        }
        addLog(`${interceptor.id} REMOVED FROM ${mission.name} — RTB`, '');
      }
    });

    // Confirm mission button
    missionPanelEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.confirm-mission-btn')) {
        e.stopPropagation();
        // Simulate M key press to confirm
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm' }));
      }
      if (e.target.closest('.cancel-mission-btn')) {
        e.stopPropagation();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
      }
    });
  }

  // Cancel scramble button
  panel.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('.cancel-scramble-btn');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.interceptorId;
    const interceptor = state.interceptors.find(i => i.id === id && i.state === 'SCRAMBLING');
    if (!interceptor) return;
    if (interceptor.scrambleOrder && interceptor.scrambleOrder.mission) {
      const mission = interceptor.scrambleOrder.mission;
      if (mission.assignedInterceptors) {
        mission.assignedInterceptors = mission.assignedInterceptors.filter(i => i !== interceptor);
      }
    }
    interceptor.state = 'READY';
    interceptor.scrambleOrder = null;
    interceptor.scrambleUntil = 0;
    addLog(`${interceptor.id} SCRAMBLE CANCELLED`, 'warn');
  });

  // RTB button — uses mousedown (not click) because innerHTML rebuilds every frame
  // can destroy the button between mousedown and mouseup, preventing click from firing
  const detailEl = document.getElementById('selectionDetail');
  detailEl.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('.rtb-btn');
    if (!btn) return;
    e.stopPropagation();
    const interceptor = state.selectedInterceptor;
    if (!interceptor || ['RTB', 'CRASHED', 'TURNAROUND', 'MAINTENANCE', 'SCRAMBLING'].includes(interceptor.state)) return;
    interceptor.state = 'RTB';
    interceptor.target = null;
    interceptor.idTarget = null;
    interceptor.capPoint = null;
    interceptor.refuelTanker = null;
    interceptor.preDivertState = null;
    interceptor.preDivertTarget = null;
    interceptor.preDivertCapPoint = null;
    clearMissionHud(interceptor);
    addLog(`${interceptor.id} — RTB ORDERED`, '');
    state.selectedInterceptor = null;
  });

  // Volume slider
  const volumeSlider = document.getElementById('volumeSlider');
  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      setMasterVolume(parseInt(e.target.value) / 100);
    });
  }

  // REFUEL button — divert to nearest on-station tanker
  detailEl.addEventListener('mousedown', (e) => {
    const btn = e.target.closest('.refuel-btn');
    if (!btn) return;
    e.stopPropagation();
    const interceptor = state.selectedInterceptor;
    if (!interceptor || ['RTB', 'CRASHED', 'TURNAROUND', 'MAINTENANCE', 'REFUELING', 'SCRAMBLING'].includes(interceptor.state)) return;
    if (interceptor.type === 'KC-135' || interceptor.type === 'E-3A') return;

    // Find nearest on-station tanker
    const ARRIVAL = 3;
    let bestTanker = null;
    let bestDist = Infinity;
    for (const t of state.interceptors) {
      if (t.type !== 'KC-135' || t.state !== 'CAP') continue;
      if (!t.capPoint) continue;
      const tdx = t.x - t.capPoint.x;
      const tdy = t.y - t.capPoint.y;
      if (Math.sqrt(tdx * tdx + tdy * tdy) > ARRIVAL) continue;
      const dx = t.x - interceptor.x;
      const dy = t.y - interceptor.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestTanker = t; bestDist = d; }
    }

    if (!bestTanker) {
      addLog(`${interceptor.id} — NO TANKER ON STATION`, 'warn');
      return;
    }

    // Check fuel to reach tanker
    const nmPerSec = interceptor.speed / 3600;
    const fuelNeeded = (bestDist / nmPerSec) * interceptor.spec.fuelBurnRate * 1.1;
    if (interceptor.fuel < fuelNeeded) {
      addLog(`${interceptor.id} — INSUFFICIENT FUEL TO REACH TANKER`, 'warn');
      return;
    }

    interceptor.preDivertState = interceptor.state;
    interceptor.preDivertTarget = interceptor.target;
    interceptor.preDivertCapPoint = interceptor.capPoint;
    interceptor.state = 'REFUELING';
    interceptor.refuelTanker = bestTanker;
    interceptor.target = null;
    interceptor.idTarget = null;
    interceptor.capPoint = null;
    addLog(`${interceptor.id} — DIVERTING TO TANKER ${bestTanker.id}`, '');
    state.selectedInterceptor = null;
  });
}

// ═══════════════════════════════════════════
// SELECTION
// ═══════════════════════════════════════════

export function selectThreat(contact) {
  state.selectedThreat = contact;
  state.selectedBase = null;
  state.selectedInterceptor = null;
  state.selectedReadyInterceptor = null;
}

export function selectBase(base) {
  const readyCount = base.interceptors.filter(i => i.state === 'READY').length;
  const turningCount = base.interceptors.filter(i => i.state === 'TURNAROUND').length;
  if (readyCount === 0) {
    const extra = turningCount > 0 ? ` (${turningCount} IN TURNAROUND)` : '';
    addLog(`${base.name} — NO AIRCRAFT AVAILABLE${extra}`, 'warn');
    return;
  }
  state.selectedBase = base;
  state.selectedThreat = null;
  state.selectedInterceptor = null;
  state.selectedReadyInterceptor = null;
  addLog(`${base.name} SELECTED — ${readyCount} AIRCRAFT READY`, '');
}

export function selectInterceptor(interceptor) {
  if (state.selectedInterceptor === interceptor) {
    state.selectedInterceptor = null;
    return;
  }

  state.selectedInterceptor = interceptor;
  state.selectedBase = null;
  state.selectedThreat = null;
  state.selectedReadyInterceptor = null;
}

// ═══════════════════════════════════════════
// STATUS BAR
// ═══════════════════════════════════════════

export function renderStatusBar() {
  const now = new Date();
  const h = String(now.getUTCHours()).padStart(2, '0');
  const m = String(now.getUTCMinutes()).padStart(2, '0');
  document.getElementById('utcClock').textContent = h + m + 'Z';

  const activeContacts = state.contacts.filter(t => t.state === 'ACTIVE' && t.detected && !t.isCivilian).length;
  const unknownContacts = state.contacts.filter(t => t.state === 'ACTIVE' && t.detected && t.allegiance === 'UNKNOWN').length;
  const activeJammers = state.contacts.some(t => t.state === 'ACTIVE' && !t.isCivilian && THREAT_TYPES[t.type]?.jamming);
  const statusEl = document.getElementById('gameStatus');

  if (state.paused) {
    statusEl.textContent = '■ PAUSED ■';
    statusEl.style.color = '#ffcc00';
  } else if (state.status === 'WON') {
    statusEl.textContent = '■ SECTOR CLEAR ■';
    statusEl.style.color = '#00ff41';
  } else if (state.status === 'LOST') {
    statusEl.textContent = '■ DEFENSE FAILURE ■';
    statusEl.style.color = '#ff4444';
  } else if (unknownContacts > 0) {
    statusEl.textContent = `■ ${unknownContacts} UNKNOWN CONTACT${unknownContacts > 1 ? 'S' : ''} ■`;
    statusEl.style.color = '#ff8800';
  } else if (activeContacts > 0) {
    const jamLabel = activeJammers ? ' — ECM ACTIVE' : '';
    statusEl.textContent = `■ ${activeContacts} ACTIVE THREAT${activeContacts > 1 ? 'S' : ''}${jamLabel} ■`;
    statusEl.style.color = '#ff4444';
  } else {
    statusEl.textContent = '■ STANDING BY ■';
    statusEl.style.color = '#ffcc00';
  }

  const defconEl = document.getElementById('defconLevel');
  if (defconEl) {
    defconEl.textContent = `DEFCON ${state.defcon}`;
    const defconColors = { 5: '#00ff41', 4: '#00cc33', 3: '#ffcc00', 2: '#ff8800', 1: '#ff4444' };
    defconEl.style.color = defconColors[state.defcon] || '#ffcc00';
    defconEl.style.textShadow = `0 0 8px ${defconColors[state.defcon]}44`;
  }

  // Speed indicator
  const speedEl = document.getElementById('speedIndicator');
  if (speedEl) {
    const m = state.timeMultiplier;
    speedEl.textContent = `${m}x`;
    if (m > 1) {
      speedEl.style.color = m >= 8 ? '#ff8800' : '#ffcc00';
      speedEl.style.borderColor = m >= 8 ? '#ff8800' : '#ffcc00';
    } else {
      speedEl.style.color = '#00cc33';
      speedEl.style.borderColor = '#004d14';
    }
  }

  // Game clock (mission elapsed time)
  const clockEl = document.getElementById('gameClock');
  if (clockEl) {
    const totalGameSec = state.gameTime / 1000;
    const hours = Math.floor(totalGameSec / 3600);
    const minutes = Math.floor((totalGameSec % 3600) / 60);
    clockEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // WCS indicator
  const wcsEl = document.getElementById('wcsIndicator');
  if (wcsEl) {
    wcsEl.textContent = `WCS ${state.wcs}`;
    const wcsColors = { FREE: '#ff4444', TIGHT: '#ffcc00', HOLD: '#00ff41' };
    const color = wcsColors[state.wcs];
    wcsEl.style.color = color;
    wcsEl.style.borderColor = color;
    wcsEl.style.textShadow = `0 0 6px ${color}44`;
  }

  // EMCON indicator
  const emconEl = document.getElementById('emconIndicator');
  if (emconEl) {
    emconEl.textContent = `EMCON ${state.emcon}`;
    const emconColors = { ACTIVE: '#00ff41', REDUCED: '#ffcc00', SILENT: '#ff4444' };
    const eColor = emconColors[state.emcon] || '#ffcc00';
    emconEl.style.color = eColor;
    emconEl.style.borderColor = eColor;
    emconEl.style.textShadow = `0 0 6px ${eColor}44`;
  }

  const waveEl = document.getElementById('waveIndicator');
  if (waveEl) {
    // Show shift time remaining + difficulty
    const remainMs = Math.max(0, SHIFT_DURATION - state.gameTime);
    const remainMin = Math.floor(remainMs / 60000);
    const remainSec = Math.floor((remainMs % 60000) / 1000);
    const diffLabel = state.difficulty !== 'STANDARD' ? ` [${state.difficulty}]` : '';
    if (state.shiftComplete) {
      waveEl.textContent = `SHIFT COMPLETE${diffLabel}`;
    } else {
      waveEl.textContent = `SHIFT -${String(remainMin).padStart(2, '0')}:${String(remainSec).padStart(2, '0')}${diffLabel}`;
    }
  }
}

// ═══════════════════════════════════════════
// END-GAME SCORING OVERLAY
// ═══════════════════════════════════════════

export function showScoringOverlay(scoreData) {
  const overlay = document.getElementById('scoringOverlay');
  if (!overlay) return;

  const isWin = state.status === 'WON';
  let html = `<div class="scoring-title">${isWin ? 'SECTOR CLEAR' : 'DEFENSE FAILURE'}</div>`;
  html += `<div class="scoring-line"></div>`;

  for (const item of scoreData.breakdown) {
    const sign = item.value >= 0 ? '+' : '';
    const cls = item.value < 0 ? 'hostile' : '';
    html += `<div class="scoring-row"><span>${item.label}</span><span class="${cls}">${sign}${item.value}</span></div>`;
  }

  html += `<div class="scoring-line"></div>`;
  html += `<div class="scoring-total">TOTAL SCORE: ${scoreData.score}</div>`;
  html += `<div class="scoring-defcon">FINAL DEFCON: ${state.defcon}${scoreData.difficulty ? ` — ${scoreData.difficulty}` : ''}</div>`;
  html += `<div class="scoring-hint">PRESS R TO RETURN TO MENU</div>`;

  overlay.innerHTML = html;
  overlay.style.display = 'block';
}
