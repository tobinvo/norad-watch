# NORAD WATCH

A browser-based cold-war NORAD air defense simulation. The player manages radar contacts, scrambles interceptors, and defends North American cities against escalating waves of airborne threats. Prioritizes the "control tower" feel — managing information and making decisions, not clicking frantically.

## Project Status
**Phase: 9B complete** — Phases 1-4 built arcade prototype on continent-wide map. Phase 5 transforms to single-sector command post. Phase 6 added IFF pipeline + civilian traffic. Phase 7 added WCS (FREE/TIGHT/HOLD), per-site radar sweeps, AWACS improvements. Phase 8 added time compression (1-16x), auto-pause on critical events, game clock. Phase 9A added turnaround time, sortie limits, fuel range envelopes. Phase 9B added missiles as map entities, Pk, damage model.

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
│   ├── constants.js      # Colors, speeds, ranges, timings
│   ├── state.js          # Game state object
│   ├── map.js            # North America coordinate data + drawing
│   ├── radar.js          # Sweep rendering, blip reveal/fade logic
│   ├── entities.js       # Base, Interceptor, Threat, City classes
│   ├── spawner.js        # Wave system, threat generation
│   ├── intercept.js      # Geometric intercept calculation, engagement
│   ├── fuel.js           # Fuel burn rates, bingo calculations
│   ├── input.js          # Click detection, selection, command dispatch
│   ├── hud.js            # DOM panel updates (contacts, assets, log)
│   └── scoring.js        # Score tracking, DEFCON system
└── data/
    └── scenarios.js      # Scenario definitions (waves, timing, mix)
```

## Build Plan

**Inspiration:** Command: Modern Operations (CMANO). The player makes decisions under uncertainty, not arcade actions. "Control room tension" — long quiet stretches punctuated by intense decision windows.

### Completed (Phases 1-5)
- HTML scaffold, canvas, CSS Grid panels, CRT aesthetic
- Game loop with delta-time, radar sweep with blip fade
- Entity system: Base, Interceptor, Threat, City
- 4 aircraft types: F-15A, F-16C, F-106A, E-3A AWACS
- Fuel system with bingo warning, crash on empty, CAP orbits, RTB
- Full UI panels: contact list, asset status, selection detail, event log
- Left-click select / right-click action input scheme
- 4 threat types: Bomber, Fighter (evasion), Cruise Missile (reduced detection), ICBM (boost phase)
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

### Phase 9C: Mission Systems — Define patrol zones, assign aircraft to CAP missions. AI flies the pattern. Player intervenes on key decisions only (engage? redirect?). Prevents RTS micro.
5. **Tanker support** — KC-135 tanker orbits extend fighter endurance. Losing the tanker shortens your reach.
6. **Missiles as map entities** — Firing a weapon spawns a visible missile entity that flies to the target with real flight time and speed. No more instant kills at weapons range. Player sees the missile track on radar, watches it close. Missile types (AIM-120 AMRAAM, AIM-7 Sparrow, AIR-2 Genie) have different speeds, ranges, and guidance.
7. **Probability of kill (Pk)** — Missiles aren't guaranteed hits. Pk affected by target type, aspect angle, ECM, and range at launch. A miss means deciding whether to re-engage (spend another missile) or let it go.
8. **Damage model** — Not everything is a one-hit kill. A missile hit may destroy, cripple (reduced speed, lost weapons), or miss. Damaged bombers limp on at reduced speed toward target. Damaged interceptors may lose radar or weapons but still fly. Creates harder decisions: re-engage the wounded bomber or trust it won't make it?
9. **Waypoints / flight plans** — Plot multi-leg routes instead of just "go to target." Set approach corridors, define patrol boxes with specific legs, create holding patterns. Enables tactical positioning — approach from the south, set up a barrier CAP across a threat axis.

### Phase 10: Sensor Depth
**Goal:** Active/passive tradeoffs, radar physics

1. **Active radar dilemma** — Ground radar ON = see further, but enemies can detect your emissions and target with anti-radiation missiles. EMCON (emissions control) = shorter detection, but invisible.
2. **Radar horizon** — Detection range depends on antenna height + target altitude. Low-flying cruise missiles invisible until ~20nm. High-altitude bombers detectable at 200nm. Earth's curvature matters.
3. **Passive ESM** — Detect enemy radar/jammer emissions without revealing yourself. Gives bearing but poor range accuracy.
4. **AWACS as critical asset** — Extends detection envelope for entire sector. Losing it creates a sudden, massive gap. Enemies may target it specifically.
5. **Terrain masking** — Mountains/terrain block radar in certain directions (if sector has terrain features).
6. **Altitude as a real mechanic** — Altitude affects radar detection (low = hidden longer behind radar horizon), missile engagement envelopes (minimum/maximum launch altitude, look-down/shoot-down capability), fuel burn rate (higher = more efficient cruise), and climb/descent takes real time. Fighters must climb to engage high-altitude targets or dive to catch terrain-huggers.
7. **Aircraft radars** — Each fighter has its own radar with detection range, scan cone, and search/track modes. Fighter radar range << ground radar but provides autonomous detection when out of data link range. AWACS radar is wide-area search; fighter radar is narrow focused cone.
8. **Data links** — Units share sensor data through AWACS as a network hub. With data link, all friendly units see what AWACS sees. Lose the AWACS (or fly out of link range), and each fighter only sees what its own radar covers. Creates urgent incentive to protect AWACS and stay within link range. Fog of war degrades gracefully as network nodes go down.

### Phase 11: Threat Sophistication
**Goal:** Adversaries that think, not just fly in straight lines

1. **ECM/Jamming** — Threat aircraft carry jammers that degrade your radar. Contacts appear fuzzy, uncertain position, possible false tracks.
2. **Decoys** — Threats launch decoys that appear as additional contacts on radar. Must be sorted from real threats.
3. **Formation tactics** — Fighters fly escort for bombers. Must defeat escorts to reach bombers.
4. **Terrain-hugging routes** — Threats exploit terrain masking and low altitude to delay detection.
5. **SEAD threats** — Anti-radiation missiles that target your radar stations if they're emitting.

### Phase 12: Polish & Atmosphere
**Goal:** Complete experience

1. **Sound design** — Web Audio API: radar sweep tone, detection ping, alert klaxon, radio chatter fragments, engagement sounds. No external files.
2. **Weather sectors** — Overlay zones degrading radar detection
3. **Scenario variety** — Multiple sectors (Alaska, Northeast, Pacific), each with different geography, threat axes, and asset mix
4. **Difficulty scaling** — Cadet (auto-ID, no civilians) → Veteran (full IFF pipeline, civilian traffic, SEAD threats)
5. **Post-scenario debrief** — Timeline replay showing all contacts, your decisions, outcomes. "What you missed" reveal.
6. **Communication delays** — Detection → authorization → scramble has a time cost. Not instant.
7. **Crew proficiency** — Affects reaction times, ID speed, engagement accuracy
8. **Map zoom** — Mouse wheel zoom in/out on the radar map. Zoom toward cursor position. Maintains nm coordinate accuracy at all zoom levels. Pan with click-drag when zoomed in.

### Phase Summary
| Phase | Delivers | Feel |
|-------|----------|------|
| 1-4   | Radar + map + aircraft + threats + waves + DEFCON | Arcade prototype (done) |
| 5     | Sector focus, realistic scale, radar coverage | "I'm responsible for THIS area" |
| 6     | Unknown contacts, civilian traffic, IFF pipeline | "Is that hostile?" |
| 7     | Weapons Control States, ROE consequences | "Do I shoot?" |
| 8     | Time compression, auto-pause, scenario clock | "Watch station rhythm" |
| 9     | Turnaround, sortie limits, missiles-as-entities, Pk, damage model, waypoints | "I'm running out of planes" |
| 10    | Active/passive sensors, radar horizon, altitude, aircraft radars, data links | "I can't see everything" |
| 11    | ECM, decoys, SEAD, formation tactics | "They're fighting back smart" |
| 12    | Sound, weather, scenarios, difficulty, debrief | Complete experience |

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

### Intercept Geometry
- Compute intercept point given threat heading/speed and interceptor speed
- Interceptor flies to calculated intercept point
- Engagement when interceptor reaches weapons range of target
- Weapons range varies by aircraft type and loadout

### Fuel & Sortie Management
- Burn rate proportional to speed
- Bingo fuel warning triggers when insufficient fuel to RTB
- Aircraft that run dry crash (lost permanently)
- Turnaround time after landing — vulnerability windows
- Fuel range envelopes visualized on map
- Sortie limits create long-term resource pressure

### Scoring
- Threats neutralized: +points per type
- Assets preserved: multiplier based on % surviving
- Fuel efficiency: less total fuel burned = bonus
- Friendly fire: heavy penalty for engaging civilian tracks
- DEFCON: reaching DEFCON 1 = situation penalty

### Aircraft States
- READY — on ground at base, available for scramble
- TURNAROUND — on ground, refueling/rearming (countdown timer, unavailable)
- MAINTENANCE — sortie limit reached, permanently out of game
- AIRBORNE — in flight, heading to target or CAP point
- ENGAGED — in weapons range, engaging threat
- RTB — returning to base
- CAP — orbiting patrol point
- ID_MISSION — closing on unknown contact for visual identification

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
