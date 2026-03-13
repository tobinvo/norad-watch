# NORAD WATCH

A browser-based cold-war NORAD air defense simulation. The player manages radar contacts, scrambles interceptors, and defends North American cities against escalating waves of airborne threats. Prioritizes the "control tower" feel — managing information and making decisions, not clicking frantically.

## Project Status
**Phase: POC complete** — Visual mockup (`poc.html`) demonstrates the aesthetic: radar sweep, North America map, CRT scanline overlay, contact list, asset status, event log. No game logic yet. Next: Phase 1 (Foundation — playable prototype with one base, one aircraft type, one threat type).

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

### Phase 1: Foundation (playable prototype)
**Goal:** Radar sweep + map + one base + one threat type + scramble/intercept

1. HTML scaffold with `<canvas>` + CSS Grid panels (port from poc.html)
2. `requestAnimationFrame` game loop with delta-time tracking
3. North America vector map (reuse POC coordinates)
4. Radar sweep — contacts only visible on sweep pass, fade after
5. Entity system: `Base` (position, aircraft roster), `Threat` (position, heading, speed, altitude, type, ID), `Interceptor` (position, heading, speed, fuel, loadout, target, state)
6. Single bomber threat type spawning from map edges toward random city
7. Scramble mechanic — click base → select interceptor → click threat to assign
8. Intercept resolution — geometric distance check at weapons range
9. Basic win/lose — threats reaching cities vs all threats neutralized

### Phase 2: UI Panels
**Goal:** Information management feel

1. Left panel: CONTACT LIST — all radar tracks (ID, type, heading, speed, status)
2. Right panel: ASSET STATUS — bases, aircraft counts, airborne fuel bars
3. Bottom bar: EVENT LOG — scrolling military-time entries, auto-scroll
4. Selection system — click contact on radar or in list to highlight + show options
5. HUD overlays — range envelope circles, projected path lines

### Phase 3: Aircraft Types & Fuel
**Goal:** Meaningful resource management

1. **F-15 Eagle** — fast (900kts), long range (1800nm), 4 AMRAAMs
2. **F-16 Falcon** — medium (750kts), medium range (1200nm), 2 AMRAAMs
3. **F-106 Delta Dart** — fast (850kts), short range (800nm), 1 Genie OR 4 Falcons
4. **E-3 AWACS** — slow (350kts), long endurance, no weapons, extends radar range
5. Fuel system — burn rate by speed, bingo warning, crash on empty
6. CAP orbits — assign patrol point, orbit until reordered or bingo
7. RTB command — return to base anytime

### Phase 4: Threat Variety & Escalation
**Goal:** Tactical decision variety

1. **Bomber** — slow (500kts), high altitude, long straight track
2. **Fighter escort** — medium (800kts), may evade when interceptor closes
3. **Cruise missile** — fast (600kts), low altitude, delayed radar detection
4. **ICBM** — very fast (4000kts+), only interceptable in boost phase (~60s window)
5. Wave system — escalating waves with increasing threat mix
6. DEFCON system — 5→1 as threats increase / assets hit, affects spawn rates

### Phase 5: Realism & Polish
**Goal:** Depth and replayability

1. IFF / ROE — some unknowns are friendly, engaging = score penalty, must wait for visual-ID range
2. True radar sweep reveal — contacts only update position on sweep pass
3. Weather sectors — overlay zones degrading radar detection (optional toggle)
4. Protected assets — 5-8 cities + bases with HP, threat reaching city = damage
5. Scoring — threats neutralized, assets preserved %, fuel efficiency, friendly fire penalty
6. Scenario timer — 10-15 min fixed scenarios, end screen with breakdown
7. Sound — Web Audio API beeps/tones for sweep, alerts, intercepts (no external files)

### Phase Summary
| Phase | Delivers | Playable? |
|-------|----------|-----------|
| POC   | Visual mockup — aesthetic only | No |
| 1     | Radar + map + 1 base + 1 threat + scramble | Yes (minimal) |
| 2     | Full UI panels + selection + event log | Yes (feels like a game) |
| 3     | 4 aircraft types + fuel + CAP | Yes (real decisions) |
| 4     | 4 threat types + waves + DEFCON | Yes (escalating tension) |
| 5     | IFF/ROE + weather + scoring + polish | Yes (complete) |

## Core Mechanics

### Radar
- Sweep rotates 360° every ~8 seconds
- Contacts only revealed when sweep passes — position updates on sweep, not continuously
- Blips fade after sweep moves past (~3.5s fade)
- AWACS extends detection radius when airborne

### Intercept Geometry
- Compute intercept point given threat heading/speed and interceptor speed
- Interceptor flies to calculated intercept point
- Engagement when interceptor reaches weapons range of target
- Weapons range varies by aircraft type and loadout

### Fuel
- Burn rate proportional to speed
- Bingo fuel warning triggers when insufficient fuel to RTB
- Aircraft that run dry crash (lost permanently)
- Displayed as percentage in asset panel

### Scoring
- Threats neutralized: +points per type
- Assets preserved: multiplier based on % surviving
- Fuel efficiency: less total fuel burned = bonus
- Friendly fire: heavy penalty for engaging civilian tracks
- DEFCON: reaching DEFCON 1 = situation penalty

### Aircraft States
- READY — on ground at base, available for scramble
- AIRBORNE — in flight, heading to target or CAP point
- ENGAGED — in weapons range, engaging threat
- RTB — returning to base
- CAP — orbiting patrol point

### Threat States
- UNKNOWN — unidentified, may be hostile or friendly
- HOSTILE — confirmed enemy, weapons free
- NEUTRALIZED — destroyed by interceptor
- IMPACT — reached target city

## Development Standards
Inherited from `C:\Users\tvano\Start\CLAUDE.md`. Key points for this project:

- **JavaScript** (not TypeScript) — no build step, vanilla ES modules
- **Indentation:** 2 spaces
- **Naming:** functions/variables `camelCase`, constants `UPPER_SNAKE_CASE`, classes `PascalCase`
- **Imports:** ES module `import/export`
- **Engine logic** in `src/` — pure functions where possible, separate from rendering
- **No backend** — everything client-side
- **Coordinates:** normalized 0-1 space mapped to canvas size, handles resize
- **Entity IDs:** sequential with NATO-style labels ("BOGIE-7", "EAGLE-3")
- **Testing:** open in browser, visual verification. No test framework planned
