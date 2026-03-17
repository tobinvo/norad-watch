// ═══════════════════════════════════════════
// WESTERN ALASKA ADIZ SECTOR DEFINITION
// All positions in nautical miles from sector center
// Sector center: ~63°N, 157°W (interior western Alaska)
// Bering Sea approaches — Soviet bomber/recon corridor
// ═══════════════════════════════════════════

export const SECTOR = {
  name: 'ALASKA ADIZ — WESTERN SECTOR',
  centerLat: 63.0,
  centerLon: -157.0,

  // Viewport bounds in nm from center
  extentX: 150,  // -150 to +150 nm east-west (300nm across)
  extentY: 150,  // -150 to +150 nm north-south

  // Prosecution boundary — how far outside sector fighters can chase
  prosecutionBuffer: 40,

  // Radar sites (x = nm east, y = nm north from center)
  // Coastal early warning line facing the Bering Sea
  radarSites: [
    { name: 'TIN CITY AFS', x: -120, y: 115, rangeNm: 180 },       // NW — Bering Strait watch
    { name: 'CAPE ROMANZOF AFS', x: -130, y: 5, rangeNm: 170 },    // W — central coast
    { name: 'CAPE NEWENHAM AFS', x: -110, y: -95, rangeNm: 160 },   // SW — Bristol Bay
  ],

  // Bases — interior, between coast and cities
  bases: [
    { name: 'GALENA FOL', x: -30, y: 85, roster: ['F-15A', 'F-15A', 'F-15A', 'F-16C', 'F-16C', 'E-3A', 'KC-135'] },
    { name: 'KING SALMON AFS', x: -10, y: -105, roster: ['F-16C', 'F-16C', 'F-16C', 'F-106A', 'F-106A', 'E-3A', 'KC-135'] },
  ],

  // Cities to defend — eastern side of sector
  cities: [
    { name: 'FAIRBANKS', x: 110, y: 75 },
    { name: 'ANCHORAGE', x: 100, y: -85 },
  ],

  // Spawn edges — threats enter from these sides
  spawnEdges: [
    { side: 'west', weight: 5 },      // primary — Bering Sea approaches
    { side: 'northwest', weight: 3 },  // Bering Strait / Chukchi Sea
    { side: 'north', weight: 2 },      // polar route over Arctic
  ],
};

// ═══════════════════════════════════════════
// WESTERN ALASKA COASTLINE — simplified polyline in nm from sector center
// Seward Peninsula → Norton Sound → Yukon-Kuskokwim Delta → Bristol Bay
// x = east (+), y = north (+)
// ═══════════════════════════════════════════

export const COASTLINE = [
  // Seward Peninsula — north coast (Bering Strait)
  [-95, 150],
  [-105, 145],
  [-115, 138],
  [-125, 130],
  // Cape Prince of Wales / Tin City area
  [-135, 122],
  [-140, 115],
  // Seward Peninsula — south coast curving into Norton Sound
  [-138, 105],
  [-132, 95],
  [-125, 85],
  // Nome area
  [-118, 78],
  [-110, 72],
  // Norton Sound — curves east then south
  [-100, 65],
  [-92, 58],
  [-88, 50],
  [-92, 42],
  [-98, 35],
  // St. Michael / Yukon Delta north
  [-105, 28],
  [-112, 20],
  [-120, 12],
  // Cape Romanzof area
  [-130, 5],
  [-135, -2],
  // Yukon-Kuskokwim Delta — broad, marshy coast
  [-138, -12],
  [-140, -25],
  [-138, -38],
  [-135, -48],
  [-130, -58],
  // Kuskokwim Bay
  [-125, -68],
  [-120, -75],
  [-115, -82],
  // Cape Newenham
  [-118, -92],
  [-122, -100],
  // Bristol Bay — curves east
  [-115, -108],
  [-105, -115],
  [-95, -120],
  [-85, -128],
  [-75, -135],
  [-65, -140],
  [-55, -145],
  [-45, -148],
  [-35, -150],
];

// ═══════════════════════════════════════════
// COORDINATE CONVERSION
// ═══════════════════════════════════════════

let canvasW = 0;
let canvasH = 0;

// Zoom & pan state
let zoomLevel = 1;       // 1 = full sector view
let panX = 0;            // nm offset (east+)
let panY = 0;            // nm offset (north+)

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.15;  // per wheel tick

export function getZoom() { return zoomLevel; }
export function getPan() { return { x: panX, y: panY }; }

export function setZoom(z) {
  zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  clampPan();
}

export function setPan(x, y) {
  panX = x;
  panY = y;
  clampPan();
}

export function resetView() {
  zoomLevel = 1;
  panX = 0;
  panY = 0;
}

// Zoom toward a point in nm space
export function zoomAtPoint(nmX, nmY, factor) {
  const oldZoom = zoomLevel;
  zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel * factor));
  const zoomRatio = zoomLevel / oldZoom;

  // Adjust pan so the nm point stays under the cursor
  panX = nmX - (nmX - panX) / zoomRatio;
  panY = nmY - (nmY - panY) / zoomRatio;
  clampPan();
}

function clampPan() {
  // How much of the sector is visible at current zoom
  const halfVisibleX = SECTOR.extentX / zoomLevel;
  const halfVisibleY = SECTOR.extentY / zoomLevel;

  // Allow panning up to sector edge
  const maxPanX = SECTOR.extentX - halfVisibleX;
  const maxPanY = SECTOR.extentY - halfVisibleY;

  panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
  panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
}

export function updateCanvasSize(w, h) {
  canvasW = w;
  canvasH = h;
}

// Base scale (pixels per nm at zoom 1)
function baseScale() {
  const scaleX = canvasW / (SECTOR.extentX * 2);
  const scaleY = canvasH / (SECTOR.extentY * 2);
  return Math.min(scaleX, scaleY);
}

// Convert nm coordinates to canvas pixels
// x = nm east of center, y = nm north of center
// Canvas: x goes right, y goes DOWN
export function toCanvas(nmX, nmY) {
  const scale = baseScale() * zoomLevel;
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  return [
    cx + (nmX - panX) * scale,
    cy - (nmY - panY) * scale,  // flip Y — north is up on screen
  ];
}

// Convert canvas pixels to nm coordinates
export function fromCanvas(px, py) {
  const scale = baseScale() * zoomLevel;
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  return {
    x: (px - cx) / scale + panX,
    y: (cy - py) / scale + panY,  // flip Y
  };
}

// Pixels per nautical mile at current canvas size and zoom
export function nmToPixels() {
  return baseScale() * zoomLevel;
}

// Is position within sector boundary?
export function isInSector(nmX, nmY) {
  return Math.abs(nmX) <= SECTOR.extentX && Math.abs(nmY) <= SECTOR.extentY;
}

// Is position within prosecution zone? (sector + buffer)
export function isInProsecutionZone(nmX, nmY) {
  const limit = SECTOR.extentX + SECTOR.prosecutionBuffer;
  const limitY = SECTOR.extentY + SECTOR.prosecutionBuffer;
  return Math.abs(nmX) <= limit && Math.abs(nmY) <= limitY;
}

// Get a spawn position along a sector edge
export function getSpawnPosition(side) {
  const ext = SECTOR.extentX;
  const extY = SECTOR.extentY;
  const margin = 40; // spawn well outside the boundary

  switch (side) {
    case 'east':
      return { x: ext + margin, y: (Math.random() - 0.5) * extY * 1.4 };
    case 'west':
      return { x: -ext - margin, y: (Math.random() - 0.5) * extY * 1.4 };
    case 'north':
      return { x: (Math.random() - 0.5) * ext * 1.4, y: extY + margin };
    case 'south':
      return { x: (Math.random() - 0.5) * ext * 1.4, y: -extY - margin };
    case 'northeast':
      if (Math.random() < 0.5) {
        return { x: ext + margin, y: extY * (0.2 + Math.random() * 0.8) };
      } else {
        return { x: ext * (0.2 + Math.random() * 0.8), y: extY + margin };
      }
    case 'northwest':
      // Random along the NW corner — Bering Strait approaches
      if (Math.random() < 0.5) {
        return { x: -ext - margin, y: extY * (0.2 + Math.random() * 0.8) };
      } else {
        return { x: -ext * (0.2 + Math.random() * 0.8), y: extY + margin };
      }
    default:
      return { x: -ext - margin, y: (Math.random() - 0.5) * extY };
  }
}

// Pick a random spawn edge based on weights
export function pickSpawnEdge() {
  const edges = SECTOR.spawnEdges;
  const totalWeight = edges.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const edge of edges) {
    r -= edge.weight;
    if (r <= 0) return edge.side;
  }
  return edges[0].side;
}
