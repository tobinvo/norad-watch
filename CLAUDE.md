# NORAD WATCH

A browser-based cold-war NORAD air defense simulation. The player manages radar contacts, scrambles interceptors, and defends North American cities against escalating waves of airborne threats. Prioritizes the "control tower" feel — managing information and making decisions, not clicking frantically.

## Project Status
**Phase: 14A complete** — Phases 1-4 built arcade prototype. Phase 5 single-sector command post. Phase 6 IFF + civilians. Phase 7 WCS/ROE. Phase 8 time compression. Phase 9A-C resource pressure + missiles + missions. Phase 10 sensor depth. Phase 11A-C zoom/EW/formations. Phase 12A sound design. Phase 13 tactical overhaul: Alaska ADIZ sector (300nm), SCRAMBLING/TRACKING states, probe vs attack AI, shift-based spawning, ingress waypoints, radar hot/cold. Phase 14A difficulty scaling: pre-game menu, CADET/STANDARD/VETERAN presets, difficulty-selected incident schedules, auto-ID for CADET, score multipliers. Next: Phase 14B+ (scenario variety, debrief, weather).

## Tech Stack
- **Vanilla JavaScript** + **HTML5 Canvas** — no frameworks, no build step
- **ES modules** (`<script type="module">`) for multi-file organization
- **CSS Grid** for panel layout
- Local server for development (`npx serve` or `python -m http.server`)

## Aesthetic
- Dark background (#0a0a0a)
- Green phosphor radar palette (primary: #00ff41, dim: #003b0f, alert: #ff4444)
- Monospace font throughout (Courier New)
- Radar sweep line that rotates and reveals contacts
- Symbols and lines only — no sprites or art assets
- CRT scanline overlay effect (CSS)
- HUD panels on sides for status, contacts, asset management

## Project Structure
```
norad-watch/
├── CLAUDE.md
├── poc.html              # Visual mockup (standalone, no game logic)
├── index.html            # Main game entry point
├── style.css             # Layout, CRT effects, panel styling
├── src/
│   ├── main.js           # Game init, loop, resize handling
│   ├── constants.js      # Colors, speeds, ranges, aircraft/threat/missile specs
│   ├── state.js          # Game state object
│   ├── sector.js         # Alaska ADIZ sector definition, coordinate conversion
│   ├── map.js            # Coastline data + grid/boundary drawing
│   ├── radar.js          # Sweep rendering, blip reveal/fade, missiles, effects
│   ├── entities.js       # Base, Interceptor, Threat, Missile, City + movement
│   ├── spawner.js        # Wave system, threat generation
│   ├── civilians.js      # Civilian traffic corridors + spawning
│   ├── intercept.js      # Missile launch, engagement resolution, win/lose
│   ├── input.js          # Click detection, selection, command dispatch
│   ├── hud.js            # DOM panel updates (contacts, assets, log)
│   ├── units.js          # Unit conversions (knots↔mph)
│   ├── scoring.js        # Score tracking, DEFCON system
│   └── difficulty.js     # Difficulty presets (CADET/STANDARD/VETERAN)
└── data/
    └── scenarios.js      # Scenario definitions (waves, timing, mix)
```

## Build Plan

**Inspiration:** Command: Modern Operations (CMANO). The player makes decisions under uncertainty, not arcade actions. "Control room tension" — long quiet stretches punctuated by intense decision windows.

### Completed (Phases 1-5)
- HTML scaffold, canvas, CSS Grid panels, CRT aesthetic
- Game loop with delta-time, radar sweep with blip fade
- Entity system: Base, Interceptor, Threat, City
- 4 aircraft types: F-15A (4x AMRAAM), F-16C (3x AMRAAM), F-106A (1x Genie), E-3A AWACS
- Fuel system with bingo warning, crash on empty, CAP orbits, RTB
- Full UI panels: contact list, asset status, selection detail, event log
- Left-click select / right-click action input scheme
- 5 threat types: Bomber (ECM jammer), Fighter (evasion), Cruise Missile (reduced detection), ICBM (boost phase), ARM (homes on emitting radar sites)
- 5-wave escalation system, DEFCON 5→1, end-game scoring overlay, restart
- Aircraft selection on scramble (per-aircraft pick from base detail panel)
- **Phase 5:** Northeast ADIZ sector map (500nm across) with NE US coastline
- **Phase 5:** Nautical mile coordinate system (replaces broken 0-1 system)
- **Phase 5:** 3 radar sites (North Truro, Montauk, Gibbsboro) with detection coverage circles
- **Phase 5:** 3 bases (Otis ANGB, Griffiss AFB, Langley AFB) with sector-appropriate rosters
- **Phase 5:** 4 cities to defend (Boston, New York, Philadelphia, Washington DC)
- **Phase 5:** Sector boundary + prosecution zone (50nm buffer) with threat exit cleanup
- **Phase 5:** Threats spawn from weighted edges (east, north, northeast)
- **Phase 5:** GAME_SPEED=30 time scaling (knots→nm/s movement at playable pace)
- **Phase 5:** Radar site-based detection (threats only visible in radar range)
- **Phase 5:** Range/ETA display in contact detail panel
- **Phase 5:** 50nm grid, scale bar, range rings in nm
- **Phase 6:** Contact classification pipeline (UNKNOWN → CLASSIFIED → IDENTIFIED)
- **Phase 6:** Civilian air traffic (3 at start + periodic spawns, 5 air corridors)
- **Phase 6:** IFF transponder — civilians auto-classify FRIENDLY on detection
- **Phase 6:** Auto-classification after 3 radar sweeps (FAST MOVER, HEAVY, LOW RIDER, BALLISTIC)
- **Phase 6:** Visual ID missions — interceptor state ID_MISSION, flies within 5nm, 10s to ID
- **Phase 6:** Manual marking — H key = HOSTILE, F key = FRIENDLY (with contact selected)
- **Phase 6:** Engagement rules — can only engage HOSTILE contacts, FRIENDLY blocked
- **Phase 6:** UNKNOWN contacts → right-click sends ID mission (not engagement)
- **Phase 6:** Civilian shootdown = catastrophic penalty (-500 per kill, instant DEFCON 1)
- **Phase 6:** Allegiance-colored blips (amber=unknown, red=hostile, green=friendly)
- **Phase 6:** Classification-based blip shapes (dot→category shape→specific type)
- **Phase 6:** Fuel rebalanced (F-15A 83s, F-16C 119s, F-106A 51s, E-3A 238s real endurance)

### Phase 7: Rules of Engagement ✓
**Goal:** Consequences for trigger-happiness and hesitation

- **Phase 7:** Weapons Control States — FREE (engage anything not friendly), TIGHT (hostile only), HOLD (no engagement)
- **Phase 7:** Global WCS in top bar (color-coded: FREE=red, TIGHT=yellow, HOLD=green)
- **Phase 7:** Per-unit WCS override on airborne interceptors
- **Phase 7:** W key cycles WCS (global when nothing selected, per-unit when interceptor selected)
- **Phase 7:** Engagement logic gated on effective WCS — FREE allows engaging UNKNOWN contacts (risky)
- **Phase 7:** Log labels "[WCS FREE]" when engaging unidentified targets
- **Phase 7:** Per-site radar sweeps — each radar station has its own rotating sweep within its coverage circle (replaces old center sweep)
- **Phase 7:** AWACS detection circle visible with label, continuous tracking (0.85 alpha, no sweep)
- **Phase 7:** AWACS instant classification — superior signal processing auto-classifies contacts in range
- **Phase 7:** RTB button in interceptor detail panel

### Phase 8: Time Compression & Pacing ✓
**Goal:** Real watch-station rhythm — long quiet, sudden crisis

- **Phase 8:** Variable time compression — 1x, 2x, 4x, 8x, 16x via [ ] keys
- **Phase 8:** Speed indicator in top bar (color-coded: green=1x, yellow=2-4x, orange=8-16x)
- **Phase 8:** Game clock — mission elapsed time displayed as HH:MM in top bar
- **Phase 8:** Auto-pause on critical events: new contact, bingo fuel, aircraft lost, city impact, new wave
- **Phase 8:** Auto-pause snaps speed back to 1x for real-time decision windows
- **Phase 8:** Auto-pause cooldown (2s real-time) prevents spam
- **Phase 8:** Sweep speed scales with time compression (radar sweeps faster at higher speeds)

### Phase 9A: Resource Pressure ✓
**Goal:** Finite resources, vulnerability windows

- **Phase 9A:** Aircraft turnaround time — RTB landing → TURNAROUND state with countdown (F-16C 20s, F-15A 30s, F-106A 40s, E-3A 60s real at 1x). Visible in base panel and asset panel.
- **Phase 9A:** Sortie limits — per-type max sorties (F-16C: 5, F-15A: 4, F-106A: 3, E-3A: 2). Exhausted → MAINTENANCE (out of game). Sortie counter shown in detail panels.
- **Phase 9A:** Fuel range envelopes — one ring per aircraft type when base selected (color-coded by type). Airborne interceptor selected shows remaining range ring from current position.

### Phase 9B: Combat Overhaul ✓
**Goal:** Missiles as entities, uncertainty, consequences

- **Phase 9B:** Missiles as map entities — firing spawns visible AIM-120 AMRAAM (tracking, Mach 4) or AIR-2 Genie (unguided, Mach 3, nuclear) that fly to target with real flight time. Yellow dot with trail on radar.
- **Phase 9B:** Probability of kill — AMRAAM basePk 0.70, Genie 0.95. Modified by target type (fighter x0.65, cruise missile x0.50, ICBM x0.30), range, and damage state. Auto-pause on miss.
- **Phase 9B:** Damage model — hits can destroy or cripple. Crippled contacts (speed halved, orange "DAMAGED" effect) continue toward target. Second hit on damaged contact = guaranteed kill. Cruise missiles and ICBMs always destroy outright.
- **Phase 9B:** Post-kill behavior — interceptors with remaining weapons enter CAP (retaskable) instead of auto-RTB. Re-engagement is automatic if missile misses and weapons remain.
- **Phase 9B:** Missile efficiency scoring — bonus for high hit rate, penalty per wasted missile.

### Phase 9C: Mission Systems ✓
**Goal:** Delegation, logistics, tactical control

1. **Mission-based delegation** ✓ — M key defines patrol missions (2-8 waypoints, looping). Aircraft assigned via base detail panel. Patrolling interceptors auto-engage hostiles within 40nm (respects WCS), auto-pause on engagement. After kill with weapons remaining, return to patrol route. Missions shown on map (diamonds + dashed route). PATROL state label in HUD.
2. **Tanker support** ✓ — KC-135 Stratotanker (2 total: Otis + Langley). Scrambled like any aircraft, positioned at CAP orbit. Fighters within 5nm of on-station tanker get passive refueling. Auto-seek: bingo fighters divert to tanker instead of RTB (REFUELING state), refuel to 90%, then resume prior mission. Purple visual identity (circle with +), refuel range ring when selected.
3. **Waypoints / flight plans** ✓ — Shift+right-click appends waypoints to an ad-hoc route (interceptor selected). Aircraft flies through all waypoints in sequence, then CAPs at final point. Route visualized on map when interceptor selected. Manual retask (right-click) clears waypoints/missions. D key deletes selected mission.

### Phase 10: Sensor Depth ✓
**Goal:** Active/passive tradeoffs, radar physics

- **Phase 10:** Aircraft radars ✓ — Each fighter type has radar with range and cone (F-15A: 60nm/120°, F-16C: 40nm/90°, F-106A: 30nm/60°). Radar cone rendered on map when selected. Heading tracks movement direction; orbit rotation when holding CAP.
- **Phase 10:** Data links ✓ — Fighters within 200nm of AWACS share sensor data (contacts visible on shared picture). Without data link, fighters only see own radar cone. "NO LINK" indicator when disconnected. Green cone when linked, yellow when not.
- **Phase 10:** Missile seekers ✓ — AMRAAM has multi-phase guidance: mid-course (shooter radar guides) → terminal (seeker cone acquires). Seeker can lose lock if target outside 60° cone. Mid-course lost if shooter can't maintain radar track (0.5x Pk penalty). Genie unguided (fixed bearing, nuclear).
- **Phase 10:** Engagement radar track ✓ — Interceptors must have radar track (target in cone) to fire AMRAAM. Genie exempt (unguided). Prevents fire-and-forget from any angle.
- **Phase 10:** AWACS as critical asset ✓ — From Wave 3+, enemy fighters (40% chance) specifically hunt AWACS. Fighters home on nearest active AWACS, crash it on arrival. Losing AWACS creates immediate sensor gap + data link loss. Auto-pause on AWACS down.
- **Phase 10:** EMCON ✓ — E key cycles ground radar: ACTIVE (full range), REDUCED (50% range), SILENT (radar off). Indicator in top bar (green/yellow/red). Sweep and detection range scale with EMCON state. SILENT = no ground radar detection, relies on AWACS + fighter radars only.
- **Phase 10:** ESM ✓ — Passive detection of emitting threats (bombers, fighters) at 120nm range. Gives dim blip (0.35 alpha) — detected but uncertain. Cruise missiles and ICBMs don't emit, stay invisible to ESM. Works even in EMCON SILENT.
- **Phase 10:** HUD updates ✓ — Interceptor detail shows radar range/cone, data link status. EMCON indicator in top bar.
- **Deferred:** Radar horizon (altitude-based detection), terrain masking, altitude as full mechanic — pushed to future phase.

### Phase 11A: Map Zoom ✓
**Goal:** Core usability before adding more visual complexity

- **Phase 11A:** Mouse wheel zoom ✓ — Zoom toward cursor position (1x–6x). All rendering (blips, range rings, cones, labels, sweep) scales automatically via `toCanvas`/`nmToPixels`. Zoom indicator on canvas when zoomed.
- **Phase 11A:** Pan ✓ — Left-click drag to pan when zoomed (skips entities under cursor). Middle-click drag always pans. Pan clamped to sector bounds.
- **Phase 11A:** Hit detection ✓ — `fromCanvas` accounts for zoom+pan, so all click/right-click targeting works at any zoom level.
- **Phase 11A:** Home key resets zoom to 1x and pan to center. Auto-reset on game restart.

### Phase 11B: Electronic Warfare ✓
**Goal:** EMCON becomes a real tactical choice

- **Phase 11B:** ECM/Jamming ✓ — Bombers carry jammers (30nm radius). Ground radar contacts near a jammer get reduced alpha, position jitter (blips wobble), and slower classification (sweep counts at half rate). Burn-through at 40% of radar range overcomes jamming. "ECM ACTIVE" in status bar, "ECM" tag in contact list.
- **Phase 11B:** SEAD ✓ — New ARM (Anti-Radiation Missile) threat type: Mach 2.5, low altitude, homes on nearest emitting radar site. Spawns from Wave 3+ alongside bombers (35% chance) when EMCON is not SILENT. Impact permanently destroys the radar site (shown as "DESTROYED" on map, no coverage, no sweep). Auto-pause + alert on radar site loss.
- **Phase 11B:** EMCON tactical tension ✓ — EMCON ACTIVE = full radar but vulnerable to ARM. EMCON SILENT = safe from ARM but blind to non-emitting threats. EMCON REDUCED = middle ground. ESM still detects ARM (it emits seeker). Player must balance visibility vs survivability.
- **Dropped:** Decoys — not authentic to cold-war NORAD context per CMANO research.

### Phase 11C: Formation Tactics ✓
**Goal:** Layered, coordinated threats

- **Phase 11C:** Escort formations ✓ — Fighters spawn as escorts for bombers (same edge, offset positions). Escorts match bomber speed and maintain formation offset. Interceptors auto-redirected to nearest escort when targeting an escorted bomber. Escorts break formation when lead is killed or they stray >20nm.
- **Phase 11C:** Coordinated multi-axis strikes ✓ — Wave 5 spawns two formation packages from different edges (east + north) simultaneously. Forces player to split attention across axes.
- **Phase 11C:** Formation visuals ✓ — Dashed amber lines connect lead to escorts on radar. Contact list shows LDR/ESC tags. Detail panel shows formation ID, escort count, and "ENGAGE ESCORTS FIRST" warning.
- **Phase 11C:** Balanced waves ✓ — Escort fighters come from wave budget (not added on top). Total threat count stays manageable: W1 (3), W2 (4), W3 (5+ARM), W4 (6+ARM), W5 (6+ARM). Formation difficulty replaces raw volume.

### Phase 12A: Sound Design ✓
**Goal:** Biggest atmosphere impact. All procedural via Web Audio API — no external files.

- **Phase 12A:** Procedural audio engine ✓ — `src/audio.js` with Web Audio API synthesis. 17 sound functions.
- **Phase 12A:** Radar sweep tick ✓ — click when sweep crosses 12 o'clock per site. Polyrhythmic pulse.
- **Phase 12A:** Detection ping ✓ — pitch scales with proximity to nearest city (800-1400 Hz).
- **Phase 12A:** Alert klaxon ✓ — two-tone siren on BALLISTIC designation, city impact, AWACS down.
- **Phase 12A:** Missile launch tones ✓ — distinct tone burst per weapon type (AMRAAM chirp, GENIE low burst).
- **Phase 12A:** Splash / miss ✓ — confirmation pip on kill, flat buzz on miss.
- **Phase 12A:** ARM engagement warning ✓ — accelerating beeps as ARM closes on radar site.
- **Phase 12A:** EMCON shift tones ✓ — distinct per state (ACTIVE/REDUCED/SILENT).
- **Phase 12A:** Ambient hum ✓ — 60Hz + 120Hz harmonic, volume scales inversely with time compression.
- **Phase 12A:** Radio chatter ✓ — filtered noise bursts on scramble, RTB, bingo fuel events.
- **Phase 12A:** Nuclear detonation ✓ — deep rumble + white noise burst for Genie hits.
- **Phase 12A:** Volume slider ✓ — range input in top status bar, CRT-styled.

### Phase 13: Tactical Overhaul ✓
**Goal:** Transform from dispatcher to tactical commander. Most contacts are boundary probes that turn back. Real attacks are rare and terrifying.

- **Phase 13:** Alaska ADIZ sector ✓ — Replaced NE ADIZ (500nm) with Western Alaska ADIZ (300nm across). Bering Sea approaches. 3 coastal radar sites (Tin City, Cape Romanzof, Cape Newenham), 2 forward bases (Galena FOL, King Salmon AFS), 2 cities (Fairbanks, Anchorage). Threats spawn from west/northwest/north. Tighter sector makes engagement geometry visible on scope.
- **Phase 13:** SCRAMBLING state ✓ — Aircraft take 15-45s game-time to get airborne (varies by type: F-16C 15s, F-15A 20s, F-106A 25s, E-3A/KC-135 45s). Countdown in HUD. Scramble siren sound on launch.
- **Phase 13:** TRACKING state ✓ — Interceptors entering weapons range transition to TRACKING (follow target, maintain geometry). Auto-fire after 2s delay. Player can still fire early via right-click or prevent fire with radar cold (G key) / WCS HOLD.
- **Phase 13:** Radar hot/cold ✓ — G key toggles interceptor radar. Cold = can't fire SARH/ACTIVE weapons, auto-falls back to IR secondaries. Radar cone hidden when cold.
- **Phase 13:** Reattack cooldown ✓ — 5s game-time cooldown after missile miss before interceptor can fire again (no instant re-fire).
- **Phase 13:** Probe vs attack intent ✓ — Each contact spawns with hidden intent (PROBE ~70% early, ~40% late, or ATTACK). Cruise missiles/ICBMs/ARMs always ATTACK. Probes turn back when interceptor closes within 30nm — gradual visible turn on scope with descending tone. Log: "TURNING AWAY — POSSIBLE PROBE". Core tension: "this one isn't turning."
- **Phase 13:** Ingress waypoints ✓ — Threats spawn with 1-2 waypoints offset from direct path. Approach from unexpected angles instead of beelining at cities. Probes get 1 waypoint, attacks get 1-2.
- **Phase 13:** Shift-based spawning ✓ — Replaced 5-wave system with 45-minute game-time shift. 17 incidents at irregular intervals: solo probes, pair probes, formation probes, solo attacks, formation attacks, ARM strikes. Pacing: 3 min setup → routine probes → first real attack at ~15 min → tempo increase → final push with cruise missiles and ICBM. Shift countdown timer in status bar.
- **Phase 13:** Sound hooks ✓ — Probe turn-back (descending tone), scramble siren (rising tone). Detection ping only (removed per-contact wave alarm).

### Phase 14A: Difficulty Scaling ✓
**Goal:** On-ramp for new players, challenge mode for veterans

- **Phase 14A:** Pre-game menu screen ✓ — CRT-styled overlay with difficulty selection, shown on load and after game over (R key returns to menu instead of instant restart).
- **Phase 14A:** 3 difficulty levels ✓ — CADET (training: auto-ID all contacts, no civilians, 10 easy incidents, no ARM/SEAD, no AWACS hunting, 0.5x score), STANDARD (current baseline: full IFF, civilians, 16 incidents), VETERAN (hard: 20 incidents, compressed timing, 0.55 ARM chance, 0.6 AWACS hunt rate, 1.5x score).
- **Phase 14A:** Difficulty-selected incident schedules ✓ — `INCIDENTS_EASY`, `INCIDENTS` (standard), `INCIDENTS_HARD` in `data/scenarios.js`. Spawner selects list based on `getDifficulty().incidentFilter`.
- **Phase 14A:** CADET auto-ID ✓ — All non-civilian contacts auto-identified as HOSTILE on first detection (skips IFF pipeline). No civilian traffic spawned.
- **Phase 14A:** Score multiplier ✓ — Final score scaled by difficulty (CADET 0.5x, VETERAN 1.5x). Difficulty shown in scoring overlay and status bar.
- **Phase 14A:** `src/difficulty.js` ✓ — Difficulty presets + `getDifficulty()` accessor keyed off `state.difficulty`.

### Phase 14B+: Future (Deferred)
- **Scenario variety** — Additional sectors (NE ADIZ, Iceland-Faroes Gap, Korea), different geography/threats/assets
- **Post-scenario debrief** — Timeline replay showing all contacts, decisions, outcomes
- **Weather sectors** — Overlay zones degrading radar detection
- **Pre-mission asset placement** — Budget to position radar sites, SAM batteries, bases
- **Terrain masking** — blocked until altitude is a real mechanic
- **Altitude as full mechanic** — radar horizon, engagement envelopes, climb/descent time

### Phase Summary
| Phase | Delivers | Feel |
|-------|----------|------|
| 1-4   | Radar + map + aircraft + threats + waves + DEFCON | Arcade prototype (done) |
| 5     | Sector focus, realistic scale, radar coverage | "I'm responsible for THIS area" |
| 6     | Unknown contacts, civilian traffic, IFF pipeline | "Is that hostile?" |
| 7     | Weapons Control States, ROE consequences | "Do I shoot?" |
| 8     | Time compression, auto-pause, scenario clock | "Watch station rhythm" |
| 9A    | Turnaround, sortie limits, fuel range envelopes | "I'm running out of planes" |
| 9B    | Missiles-as-entities, Pk, damage model | "Will it hit?" |
| 9C    | CAP delegation, tankers, waypoints | "Set it and forget it" (done) |
| 10    | Aircraft radars, data links, missile seekers, EMCON, ESM, AWACS hunting | "I can't see everything" (done) |
| 11A   | Map zoom + pan | "Let me look closer" (done) |
| 11B   | ECM jamming, SEAD/ARM | "They're fighting back smart" (done) |
| 11C   | Formation tactics, coordinated strikes | "They're organized" (done) |
| 12A   | Sound design | "I can hear the tension" (done) |
| 13    | Alaska sector, scramble delay, tracking, probe/attack AI, shift-based pacing | "Is this one real?" (done) |
| 14A   | Difficulty levels, pre-game menu | "How hard do you want it?" (done) |
| 14B+  | New sectors, weather, debrief, asset placement | Full experience |

## Core Mechanics

### Radar
- Sweep rotates 360° every ~8 seconds
- Contacts only revealed when sweep passes — position updates on sweep, not continuously
- Blips fade after sweep moves past (~3.5s fade)
- AWACS extends detection radius when airborne
- Radar horizon limits detection of low-altitude targets
- Active radar tradeoff: emit and be seen, or go passive and be blind

### Contacts & IFF
- Contacts appear as UNKNOWN — must be classified and identified
- Classification: passive (radar signature analysis) or active (visual ID by fighter)
- Civilian traffic provides constant noise — not all contacts are threats
- Weapons Control States (FREE/TIGHT/HOLD) govern engagement authorization
- Wrong ID = catastrophic penalty

### Missiles & Engagement
- Interceptor reaches weapons range → fires missile (visible on radar)
- AMRAAM: active tracking (re-homes each frame), Mach 4, 25nm range, 70% base Pk
- GENIE: unguided (fixed bearing), Mach 3, 8nm range, 95% base Pk (nuclear)
- Pk modified by target type, range, damage state
- Hit outcomes: destroy or cripple (speed halved, second hit = guaranteed kill)
- Post-kill: interceptors CAP with remaining weapons (retaskable), not auto-RTB

### Fuel & Sortie Management
- Burn rate proportional to speed
- Bingo fuel warning triggers when insufficient fuel to RTB
- Aircraft that run dry crash (lost permanently)
- Turnaround time after landing — vulnerability windows
- Fuel range envelopes visualized on map
- Sortie limits create long-term resource pressure

### Scoring
- Threats neutralized: +points per type
- Cities preserved: % bonus
- Aircraft lost: penalty per crash
- Friendly fire: heavy penalty for engaging civilian tracks (-500)
- DEFCON: reaching DEFCON 1/2 = situation penalty
- Missile efficiency: bonus for high hit rate, penalty per wasted missile

### Aircraft States
- READY — on ground at base, available for scramble
- SCRAMBLING — on ground, preparing to launch (15-45s countdown by type). Transitions to ordered state (AIRBORNE/CAP/etc.)
- TURNAROUND — on ground, refueling/rearming (countdown timer, unavailable)
- MAINTENANCE — sortie limit reached, permanently out of game
- AIRBORNE — in flight, heading to target
- TRACKING — in weapons range, following target, auto-fires after 2s delay. Radar cold prevents radar-guided fire.
- RTB — returning to base
- CAP — orbiting patrol point, following waypoints, or flying patrol mission (also used post-kill with weapons remaining)
- ID_MISSION — closing on unknown contact for visual identification
- REFUELING — diverting to or refueling from KC-135 tanker
- CRASHED — fuel exhaustion, lost permanently

### Missions & Waypoints
- **Patrol missions:** M key (with base selected) defines looping patrol route (2-8 waypoints). Stored globally, associated with a base. Assigned interceptor loops waypoints continuously.
- **Ad-hoc waypoints:** Shift+right-click (with interceptor selected) appends waypoints. Aircraft flies through in order, CAPs at final point.
- **Patrol auto-engagement:** Patrolling interceptors auto-engage contacts within 40nm (per WCS rules). After kill, return to patrol route. Auto-pause on engagement.
- **Mission management:** Click mission in base panel to select. D key deletes. Click aircraft then mission row to assign & scramble. Manual retask (right-click) clears mission.

### Threat States
- UNKNOWN — unidentified, may be hostile or friendly
- CLASSIFIED — rough category known (fast mover, commercial, etc.)
- IDENTIFIED — specific type confirmed by visual ID
- HOSTILE — confirmed enemy
- FRIENDLY — confirmed civilian/allied
- NEUTRALIZED — destroyed by interceptor
- IMPACT — reached target

## Development Standards
Inherited from `C:\Users\tvano\Start\CLAUDE.md`. Key points for this project:

- **JavaScript** (not TypeScript) — no build step, vanilla ES modules
- **Indentation:** 2 spaces
- **Naming:** functions/variables `camelCase`, constants `UPPER_SNAKE_CASE`, classes `PascalCase`
- **Imports:** ES module `import/export`
- **Engine logic** in `src/` — pure functions where possible, separate from rendering
- **No backend** — everything client-side
- **Coordinates:** nautical miles from sector center (0,0). sector.js handles nm↔canvas conversion
- **Entity IDs:** sequential with NATO-style labels ("BOGIE-7", "EAGLE-3")
- **Testing:** open in browser, visual verification. No test framework planned
