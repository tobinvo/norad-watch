// ═══════════════════════════════════════════
// NORTHEAST ADIZ SECTOR DEFINITION
// All positions in nautical miles from sector center
// Sector center: ~41°N, 71°W (south of Cape Cod)
// ═══════════════════════════════════════════

export const SECTOR = {
  name: 'NORTHEAST ADIZ',
  centerLat: 41.0,
  centerLon: -71.0,

  // Viewport bounds in nm from center
  extentX: 250,  // -250 to +250 nm east-west
  extentY: 250,  // -250 to +250 nm north-south

  // Prosecution boundary — how far outside sector fighters can chase
  prosecutionBuffer: 50,

  // Radar sites (x = nm east, y = nm north from center)
  radarSites: [
    { name: 'NORTH TRURO AFS', x: 30, y: 60, rangeNm: 200 },
    { name: 'MONTAUK AFS', x: -20, y: -10, rangeNm: 180 },
    { name: 'GIBBSBORO AFS', x: -100, y: -80, rangeNm: 170 },
  ],

  // Bases
  bases: [
    { name: 'OTIS ANGB', x: 25, y: 55, roster: ['F-106A', 'F-106A', 'F-16C', 'F-16C', 'KC-135'] },
    { name: 'GRIFFISS AFB', x: -150, y: 120, roster: ['F-16C', 'F-16C', 'E-3A'] },
    { name: 'LANGLEY AFB', x: -110, y: -190, roster: ['F-15A', 'F-15A', 'F-15A', 'F-106A', 'KC-135'] },
  ],

  // Cities to defend
  cities: [
    { name: 'BOSTON', x: 20, y: 80 },
    { name: 'NEW YORK', x: -50, y: -10 },
    { name: 'PHILADELPHIA', x: -85, y: -60 },
    { name: 'WASHINGTON DC', x: -130, y: -140 },
  ],

  // Spawn edges — threats enter from these sides
  // Each has a side and heading range (radians, 0 = east, pi/2 = north)
  spawnEdges: [
    { side: 'east', weight: 4 },     // primary — Atlantic approaches
    { side: 'north', weight: 2 },     // polar route
    { side: 'northeast', weight: 3 }, // North Atlantic
  ],
};

// ═══════════════════════════════════════════
// NE US COASTLINE — simplified polyline in nm from sector center
// Traced from Virginia Beach up to Maine
// x = east (+), y = north (+)
// ═══════════════════════════════════════════

export const COASTLINE = [
  // Virginia Beach / Chesapeake Bay entrance
  [-120, -195],
  [-115, -185],
  [-120, -175],
  // Chesapeake Bay mouth (east side)
  [-110, -170],
  [-105, -160],
  // Eastern Shore / Delmarva
  [-100, -150],
  [-95, -135],
  [-90, -120],
  // Delaware Bay
  [-85, -110],
  [-80, -100],
  // New Jersey coast
  [-75, -90],
  [-70, -75],
  [-65, -60],
  [-60, -50],
  // Sandy Hook / NY Harbor
  [-55, -25],
  [-50, -15],
  // Long Island south shore
  [-45, -10],
  [-35, -8],
  [-20, -6],
  [-5, -5],
  // Montauk Point
  [5, -2],
  // Block Island Sound → Rhode Island
  [10, 5],
  [5, 15],
  // Narragansett Bay
  [0, 25],
  [5, 35],
  // Buzzards Bay
  [10, 40],
  // Cape Cod — south coast
  [15, 42],
  [20, 43],
  [25, 44],
  // Cape Cod — elbow
  [30, 45],
  [35, 48],
  // Cape Cod — forearm going north
  [38, 52],
  [40, 58],
  // Cape Cod — fist (Provincetown)
  [38, 65],
  [35, 68],
  [32, 67],
  // Cape Cod Bay (west side of Cape)
  [28, 60],
  [22, 55],
  [18, 52],
  // Plymouth / South Shore
  [15, 55],
  [12, 65],
  [10, 75],
  // Boston Harbor
  [15, 80],
  [18, 85],
  // North Shore
  [20, 90],
  [22, 95],
  // Cape Ann
  [25, 100],
  [22, 105],
  // NH coast
  [18, 115],
  [15, 125],
  // Maine — southern coast
  [12, 135],
  [10, 145],
  [15, 155],
  [20, 165],
  // Maine — midcoast
  [25, 175],
  [30, 185],
  [35, 195],
  [40, 205],
];

// Long Island — separate polyline (south shore already in main coastline)
export const LONG_ISLAND = [
  // North shore (west to east)
  [-50, -10],
  [-45, -3],
  [-35, 0],
  [-20, 2],
  [-5, 3],
  [5, -2],    // meets Montauk
];

// ═══════════════════════════════════════════
// COORDINATE CONVERSION
// ═══════════════════════════════════════════

let canvasW = 0;
let canvasH = 0;

export function updateCanvasSize(w, h) {
  canvasW = w;
  canvasH = h;
}

// Convert nm coordinates to canvas pixels
// x = nm east of center, y = nm north of center
// Canvas: x goes right, y goes DOWN
export function toCanvas(nmX, nmY) {
  const scaleX = canvasW / (SECTOR.extentX * 2);
  const scaleY = canvasH / (SECTOR.extentY * 2);
  const scale = Math.min(scaleX, scaleY);

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  return [
    cx + nmX * scale,
    cy - nmY * scale,  // flip Y — north is up on screen
  ];
}

// Convert canvas pixels to nm coordinates
export function fromCanvas(px, py) {
  const scaleX = canvasW / (SECTOR.extentX * 2);
  const scaleY = canvasH / (SECTOR.extentY * 2);
  const scale = Math.min(scaleX, scaleY);

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  return {
    x: (px - cx) / scale,
    y: (cy - py) / scale,  // flip Y
  };
}

// Pixels per nautical mile at current canvas size
export function nmToPixels() {
  const scaleX = canvasW / (SECTOR.extentX * 2);
  const scaleY = canvasH / (SECTOR.extentY * 2);
  return Math.min(scaleX, scaleY);
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
  const margin = 20; // spawn just outside the boundary

  switch (side) {
    case 'east':
      return { x: ext + margin, y: (Math.random() - 0.5) * extY * 1.4 };
    case 'north':
      return { x: (Math.random() - 0.5) * ext * 1.4, y: extY + margin };
    case 'northeast':
      // Random along the NE corner arc
      if (Math.random() < 0.5) {
        return { x: ext + margin, y: extY * (0.2 + Math.random() * 0.8) };
      } else {
        return { x: ext * (0.2 + Math.random() * 0.8), y: extY + margin };
      }
    default:
      return { x: ext + margin, y: (Math.random() - 0.5) * extY };
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
