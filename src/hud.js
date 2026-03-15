import { state } from './state.js';
import { THREAT_TYPES, GAME_SPEED, CIVILIAN_KILL_PENALTY } from './constants.js';
import { WAVES } from '../data/scenarios.js';
import { ktsToMph } from './units.js';

// ═══════════════════════════════════════════
// EVENT LOG
// ═══════════════════════════════════════════

export function addLog(text, cls) {
  const now = new Date();
  const h = String(now.getUTCHours()).padStart(2, '0');
  const m = String(now.getUTCMinutes()).padStart(2, '0');
  state.logEntries.push({ text: `${h}${m}Z — ${text}`, cls: cls || '' });
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

  const detectedContacts = state.contacts.filter(t => t.detected);

  for (const contact of detectedContacts) {
    const tr = document.createElement('tr');
    const isActive = contact.state === 'ACTIVE';
    const assigned = state.interceptors.filter(i =>
      (i.target === contact && i.state === 'AIRBORNE') ||
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
      statusText = idAssigned ? 'ID' : `INTCPT (${assigned.length})`;
    }
    if (isActive && contact.damaged) {
      statusText = 'DMG ' + statusText;
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
      if (interceptor.state === 'TURNAROUND') {
        const remainMs = interceptor.turnaroundUntil - state.gameTime;
        const remainMin = Math.max(0, Math.ceil(remainMs / 1000 / 60));
        html += `<div class="asset-line" style="color: #888">${interceptor.id} TURN ${remainMin}min (${interceptor.sorties}/${interceptor.spec.maxSorties})</div>`;
        continue;
      }
      const targetInfo = interceptor.target ? ` → ${interceptor.target.id}` : '';
      const idInfo = interceptor.idTarget ? ` ID:${interceptor.idTarget.id}` : '';
      const capInfo = interceptor.state === 'CAP' ? ' CAP' : '';
      const mslTag = state.missiles.some(m => m.shooter === interceptor && m.state === 'FLIGHT') ? ' MSL' : '';
      const stateLabel = interceptor.state === 'ID_MISSION' ? 'ID' : interceptor.state;
      html += `<div class="asset-line">${interceptor.id} ${stateLabel}${targetInfo}${idInfo}${capInfo}${mslTag} ${fuelBarHTML(interceptor)}</div>`;
    }

    block.innerHTML = html;
    container.appendChild(block);
  }
}

// ═══════════════════════════════════════════
// SELECTION DETAIL PANEL
// ═══════════════════════════════════════════

export function renderSelectionDetail() {
  const el = document.getElementById('selectionDetail');

  if (state.selectedThreat) {
    const t = state.selectedThreat;
    const assignedInterceptors = state.interceptors.filter(i =>
      (i.target === t && i.state === 'AIRBORNE') ||
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

    const stateLabel = i.state === 'ID_MISSION' ? 'ID MISSION' : i.state;
    html += `<div class="detail-row"><span class="detail-label">STATE</span><span class="detail-value">${stateLabel}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">FUEL</span><span class="detail-value ${fuelPct <= 25 ? 'hostile' : ''}">${fuelPct}%</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">WEAPONS</span><span class="detail-value">${i.weapons}x ${i.spec.weaponType || 'NONE'}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">SORTIES</span><span class="detail-value">${i.sorties}/${i.spec.maxSorties}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">BASE</span><span class="detail-value">${i.base.name}</span></div>`;

    // WCS
    const unitWcs = i.wcs || null;
    const effectiveWcs = unitWcs || state.wcs;
    const wcsColor = { FREE: 'hostile', TIGHT: '', HOLD: 'friendly' }[effectiveWcs] || '';
    const wcsLabel = unitWcs ? `${unitWcs} (OVERRIDE)` : `${state.wcs} (GLOBAL)`;
    html += `<div class="detail-row"><span class="detail-label">WCS</span><span class="detail-value ${wcsColor}">${wcsLabel}</span></div>`;

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

    if (!['RTB', 'CRASHED', 'TURNAROUND', 'MAINTENANCE'].includes(i.state)) {
      html += `<div class="detail-assigned" style="color: var(--yellow-warn)">R-CLICK: ENGAGE/ID/RTB | W = CYCLE WCS</div>`;
      html += `<div class="detail-actions"><button class="rtb-btn" data-interceptor-id="${i.id}">RTB</button></div>`;
    }

    el.innerHTML = html;

    // Bind RTB button
    const rtbBtn = el.querySelector('.rtb-btn');
    if (rtbBtn) {
      rtbBtn.addEventListener('click', () => {
        i.state = 'RTB';
        i.target = null;
        i.idTarget = null;
        i.capPoint = null;
        addLog(`${i.id} — RTB ORDERED`, '');
        state.selectedInterceptor = null;
      });
    }

  } else if (state.selectedBase) {
    const b = state.selectedBase;
    const ready = b.interceptors.filter(i => i.state === 'READY');
    const airborne = b.interceptors.filter(i =>
      i.state !== 'READY' && i.state !== 'CRASHED' && i.state !== 'TURNAROUND' && i.state !== 'MAINTENANCE'
    );
    const turning = b.interceptors.filter(i => i.state === 'TURNAROUND');
    const maint = b.interceptors.filter(i => i.state === 'MAINTENANCE');

    let html = `<div class="detail-header">▶ ${b.name}</div>`;

    for (const i of ready) {
      const isSelected = state.selectedReadyInterceptor === i;
      const selClass = isSelected ? ' aircraft-selected' : '';
      const weaponInfo = i.spec.weaponType ? `${i.weapons}x ${i.spec.weaponType}` : 'NO WEAPONS';
      const sortieInfo = `S${i.sorties}/${i.spec.maxSorties}`;
      html += `<div class="aircraft-row${selClass}" data-interceptor-id="${i.id}">`;
      html += `<span class="detail-label">${i.id}</span>`;
      html += `<span class="detail-value friendly">${i.type}</span>`;
      html += `<span class="detail-value">${weaponInfo}</span>`;
      html += `<span class="detail-value">${sortieInfo}</span>`;
      html += `</div>`;
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
        const fuelPct = Math.round((i.fuel / i.fuelMax) * 100);
        const stateLabel = i.state === 'ID_MISSION' ? 'ID' : i.state;
        html += `<div class="detail-assigned">${i.id} ${stateLabel}${targetInfo}${idInfo} FUEL:${fuelPct}%</div>`;
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
        html += `<div class="detail-row"><span class="detail-label">ARM</span><span class="detail-value">${sri.weapons}x ${s.weaponType}</span></div>`;
      }
      html += `<div class="detail-row"><span class="detail-label">SRT</span><span class="detail-value">${sri.sorties}/${s.maxSorties} (${Math.round(s.turnaroundTime / 60)}min turn)</span></div>`;
      html += `<div class="aircraft-desc">${s.desc}</div>`;
      html += `</div>`;
      html += `<div class="detail-assigned" style="color: var(--yellow-warn)">R-CLICK: HOSTILE=SCRAMBLE | UNKNOWN=ID | EMPTY=CAP</div>`;
    } else if (ready.length > 0) {
      html += `<div class="detail-assigned" style="color: var(--yellow-warn)">SELECT AN AIRCRAFT ABOVE</div>`;
    }

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
    if (interceptor) {
      state.selectedReadyInterceptor = (state.selectedReadyInterceptor === interceptor) ? null : interceptor;
    }
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
    statusEl.textContent = `■ ${activeContacts} ACTIVE THREAT${activeContacts > 1 ? 'S' : ''} ■`;
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

  const waveEl = document.getElementById('waveIndicator');
  if (waveEl) {
    if (state.currentWave > 0 && state.currentWave <= WAVES.length) {
      waveEl.textContent = `WAVE ${state.currentWave}/${WAVES.length}`;
    } else if (state.wavesComplete) {
      waveEl.textContent = 'FINAL';
    } else {
      waveEl.textContent = '';
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
  html += `<div class="scoring-defcon">FINAL DEFCON: ${state.defcon}</div>`;
  html += `<div class="scoring-hint">PRESS R TO RESTART</div>`;

  overlay.innerHTML = html;
  overlay.style.display = 'block';
}
