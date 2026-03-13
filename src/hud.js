import { state } from './state.js';

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

export function renderContacts() {
  const tbody = document.getElementById('contactBody');
  tbody.innerHTML = '';

  const detectedThreats = state.threats.filter(t => t.detected);

  for (const threat of detectedThreats) {
    const tr = document.createElement('tr');
    const isActive = threat.state === 'HOSTILE';
    const assigned = state.interceptors.filter(i => i.target === threat && i.state === 'AIRBORNE');

    if (isActive) {
      tr.className = 'hostile';
    } else {
      tr.className = 'neutralized';
    }
    if (state.selectedThreat === threat) tr.classList.add('selected');

    let statusText = threat.state;
    if (isActive && assigned.length > 0) {
      statusText = `INTCPT (${assigned.length})`;
    }

    tr.innerHTML = `
      <td>${threat.id}</td>
      <td>${threat.type}</td>
      <td>${isActive ? threat.hdgDeg : '---'}</td>
      <td>${isActive ? Math.round(threat.speed * 50000) : '---'}</td>
      <td>${isActive ? threat.altitude : '---'}</td>
      <td class="status-cell">${statusText}</td>
    `;

    if (isActive) {
      tr.addEventListener('click', () => {
        selectThreat(threat);
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

    // Group ready by type
    const readyByType = {};
    for (const i of base.interceptors) {
      if (i.state !== 'READY') continue;
      readyByType[i.type] = (readyByType[i.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(readyByType)) {
      html += `<div class="asset-line">${type} x${count} READY</div>`;
    }

    // Show airborne individually with fuel
    for (const interceptor of base.interceptors) {
      if (interceptor.state === 'READY') continue;
      if (interceptor.state === 'CRASHED') {
        html += `<div class="asset-line asset-crashed">${interceptor.id} CRASHED</div>`;
        continue;
      }
      const targetInfo = interceptor.target ? ` → ${interceptor.target.id}` : '';
      const capInfo = interceptor.state === 'CAP' ? ' CAP' : '';
      html += `<div class="asset-line">${interceptor.id} ${interceptor.state}${targetInfo}${capInfo} ${fuelBarHTML(interceptor)}</div>`;
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
    const assignedInterceptors = state.interceptors.filter(i => i.target === t && i.state === 'AIRBORNE');
    const dx = t.targetCity.x - t.x;
    const dy = t.targetCity.y - t.y;
    const distToTarget = Math.sqrt(dx * dx + dy * dy);
    const eta = Math.round(distToTarget / t.speed);

    let html = `<div class="detail-header">▶ ${t.id}</div>`;
    html += `<div class="detail-row"><span class="detail-label">TYPE</span><span class="detail-value hostile">${t.type}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">HDG</span><span class="detail-value">${t.hdgDeg}°</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">SPD</span><span class="detail-value">${Math.round(t.speed * 50000)} KTS</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">ALT</span><span class="detail-value">${t.altitude.toLocaleString()} FT</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">TARGET</span><span class="detail-value hostile">${t.targetCity.name}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">ETA</span><span class="detail-value hostile">${eta}s</span></div>`;

    if (assignedInterceptors.length > 0) {
      html += `<div class="detail-assigned">ASSIGNED: ${assignedInterceptors.map(i => `${i.id} (${i.type})`).join(', ')}</div>`;
    } else {
      html += `<div class="detail-assigned" style="color: var(--yellow-warn)">NO INTERCEPTOR ASSIGNED</div>`;
    }

    el.innerHTML = html;

  } else if (state.selectedInterceptor) {
    const i = state.selectedInterceptor;
    const fuelPct = Math.round((i.fuel / i.fuelMax) * 100);
    let html = `<div class="detail-header">▶ ${i.id}</div>`;
    html += `<div class="detail-row"><span class="detail-label">TYPE</span><span class="detail-value friendly">${i.spec.name}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">STATE</span><span class="detail-value">${i.state}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">FUEL</span><span class="detail-value ${fuelPct <= 25 ? 'hostile' : ''}">${fuelPct}%</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">WEAPONS</span><span class="detail-value">${i.weapons}x ${i.spec.weaponType || 'NONE'}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">BASE</span><span class="detail-value">${i.base.name}</span></div>`;

    if (i.target) {
      html += `<div class="detail-row"><span class="detail-label">TARGET</span><span class="detail-value hostile">${i.target.id}</span></div>`;
    }

    if (i.state !== 'RTB' && i.state !== 'CRASHED') {
      html += `<div class="detail-assigned" style="color: var(--yellow-warn)">CLICK AGAIN TO RTB | RIGHT-CLICK FOR CAP</div>`;
    }

    el.innerHTML = html;

  } else if (state.selectedBase) {
    const b = state.selectedBase;
    const ready = b.interceptors.filter(i => i.state === 'READY');
    const airborne = b.interceptors.filter(i => i.state !== 'READY' && i.state !== 'CRASHED');

    let html = `<div class="detail-header">▶ ${b.name}</div>`;

    // Show ready by type
    const readyByType = {};
    for (const i of ready) {
      readyByType[i.type] = (readyByType[i.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(readyByType)) {
      html += `<div class="detail-row"><span class="detail-label">READY</span><span class="detail-value friendly">${count}x ${type}</span></div>`;
    }

    html += `<div class="detail-row"><span class="detail-label">AIRBORNE</span><span class="detail-value">${airborne.length}</span></div>`;

    for (const i of airborne) {
      const targetInfo = i.target ? ` → ${i.target.id}` : '';
      const fuelPct = Math.round((i.fuel / i.fuelMax) * 100);
      html += `<div class="detail-assigned">${i.id} ${i.state}${targetInfo} FUEL:${fuelPct}%</div>`;
    }

    if (ready.length > 0) {
      html += `<div class="detail-assigned" style="color: var(--yellow-warn)">LEFT-CLICK HOSTILE TO SCRAMBLE</div>`;
      html += `<div class="detail-assigned" style="color: var(--yellow-warn)">RIGHT-CLICK RADAR FOR CAP ORBIT</div>`;
    }

    el.innerHTML = html;
  } else {
    el.innerHTML = '';
  }
}

// ═══════════════════════════════════════════
// SELECTION
// ═══════════════════════════════════════════

export function selectThreat(threat) {
  state.selectedThreat = threat;
  state.selectedInterceptor = null;

  if (state.selectedBase) {
    scrambleToTarget(state.selectedBase, threat);
  }
}

export function selectBase(base) {
  const readyCount = base.interceptors.filter(i => i.state === 'READY').length;
  if (readyCount === 0) {
    addLog(`${base.name} — NO AIRCRAFT AVAILABLE`, 'warn');
    return;
  }
  state.selectedBase = base;
  state.selectedThreat = null;
  state.selectedInterceptor = null;
  addLog(`${base.name} SELECTED — ${readyCount} AIRCRAFT READY`, '');
}

export function selectInterceptor(interceptor) {
  // If already selected, issue RTB
  if (state.selectedInterceptor === interceptor) {
    if (interceptor.state !== 'RTB' && interceptor.state !== 'CRASHED') {
      interceptor.state = 'RTB';
      interceptor.target = null;
      interceptor.capPoint = null;
      addLog(`${interceptor.id} — RTB ORDERED`, '');
    }
    state.selectedInterceptor = null;
    return;
  }

  state.selectedInterceptor = interceptor;
  state.selectedBase = null;
  state.selectedThreat = null;
}

function scrambleToTarget(base, threat) {
  const ready = base.interceptors.find(i => i.state === 'READY');
  if (!ready) {
    addLog(`${base.name} — NO AIRCRAFT AVAILABLE`, 'warn');
    state.selectedBase = null;
    return;
  }

  // AWACS can't engage
  if (ready.spec.weapons === 0) {
    // Skip to next ready with weapons
    const armed = base.interceptors.find(i => i.state === 'READY' && i.spec.weapons > 0);
    if (!armed) {
      addLog(`${base.name} — NO ARMED AIRCRAFT AVAILABLE`, 'warn');
      state.selectedBase = null;
      return;
    }
    armed.state = 'AIRBORNE';
    armed.target = threat;
    armed.x = base.x;
    armed.y = base.y;
    addLog(`SCRAMBLE ORDER: ${armed.id} (${armed.type}) ${base.name} → ${threat.id}`, 'alert');
  } else {
    ready.state = 'AIRBORNE';
    ready.target = threat;
    ready.x = base.x;
    ready.y = base.y;
    addLog(`SCRAMBLE ORDER: ${ready.id} (${ready.type}) ${base.name} → ${threat.id}`, 'alert');
  }

  state.selectedBase = null;
  state.selectedThreat = null;
}

// ═══════════════════════════════════════════
// STATUS BAR
// ═══════════════════════════════════════════

export function renderStatusBar() {
  const now = new Date();
  const h = String(now.getUTCHours()).padStart(2, '0');
  const m = String(now.getUTCMinutes()).padStart(2, '0');
  document.getElementById('utcClock').textContent = h + m + 'Z';

  const activeThreats = state.threats.filter(t => t.state === 'HOSTILE' && t.detected).length;
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
  } else if (activeThreats > 0) {
    statusEl.textContent = `■ ${activeThreats} ACTIVE THREAT${activeThreats > 1 ? 'S' : ''} ■`;
    statusEl.style.color = '#ff4444';
  } else {
    statusEl.textContent = '■ STANDING BY ■';
    statusEl.style.color = '#ffcc00';
  }
}
