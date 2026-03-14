import { GREEN_MAP, GREEN_DIM, GREEN_MID } from './constants.js';
import { SECTOR, COASTLINE, LONG_ISLAND, toCanvas, nmToPixels } from './sector.js';

// ═══════════════════════════════════════════
// SECTOR MAP DRAWING
// ═══════════════════════════════════════════

function drawPolyline(ctx, points, toCanvasFn, color, lineWidth) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  const [sx, sy] = toCanvasFn(points[0][0], points[0][1]);
  ctx.moveTo(sx, sy);
  for (let i = 1; i < points.length; i++) {
    const [px, py] = toCanvasFn(points[i][0], points[i][1]);
    ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function drawSectorBoundary(ctx) {
  const ext = SECTOR.extentX;
  const extY = SECTOR.extentY;

  // Sector boundary — dashed green
  const corners = [
    toCanvas(-ext, extY),
    toCanvas(ext, extY),
    toCanvas(ext, -extY),
    toCanvas(-ext, -extY),
  ];

  ctx.strokeStyle = GREEN_DIM;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(corners[0][0], corners[0][1]);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i][0], corners[i][1]);
  }
  ctx.closePath();
  ctx.stroke();

  // Prosecution boundary — dimmer dashed
  const buf = SECTOR.prosecutionBuffer;
  const pCorners = [
    toCanvas(-ext - buf, extY + buf),
    toCanvas(ext + buf, extY + buf),
    toCanvas(ext + buf, -extY - buf),
    toCanvas(-ext - buf, -extY - buf),
  ];

  ctx.strokeStyle = '#001a08';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.moveTo(pCorners[0][0], pCorners[0][1]);
  for (let i = 1; i < pCorners.length; i++) {
    ctx.lineTo(pCorners[i][0], pCorners[i][1]);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGrid(ctx) {
  const ext = SECTOR.extentX;
  const extY = SECTOR.extentY;
  const step = 50; // nm grid lines

  ctx.strokeStyle = '#0a1a0d';
  ctx.lineWidth = 0.3;

  // Vertical lines
  for (let x = -ext; x <= ext; x += step) {
    const [px1, py1] = toCanvas(x, extY);
    const [px2, py2] = toCanvas(x, -extY);
    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = -extY; y <= extY; y += step) {
    const [px1, py1] = toCanvas(-ext, y);
    const [px2, py2] = toCanvas(ext, y);
    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.stroke();
  }

  // Grid labels (every 100nm)
  ctx.font = '8px "Courier New", monospace';
  ctx.fillStyle = '#0d2a10';
  for (let x = -200; x <= 200; x += 100) {
    if (x === 0) continue;
    const [px, py] = toCanvas(x, -extY);
    ctx.fillText(`${x}`, px - 10, py - 4);
  }
  for (let y = -200; y <= 200; y += 100) {
    if (y === 0) continue;
    const [px, py] = toCanvas(-ext, y);
    ctx.fillText(`${y}`, px + 4, py + 3);
  }
}

function drawScaleBar(ctx, canvasW, canvasH) {
  const pxPerNm = nmToPixels();
  const barNm = 50;
  const barPx = barNm * pxPerNm;

  const x = canvasW - barPx - 20;
  const y = canvasH - 20;

  ctx.strokeStyle = GREEN_DIM;
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Main bar
  ctx.moveTo(x, y);
  ctx.lineTo(x + barPx, y);
  // End ticks
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y + 4);
  ctx.moveTo(x + barPx, y - 4);
  ctx.lineTo(x + barPx, y + 4);
  // Midpoint tick
  ctx.moveTo(x + barPx / 2, y - 2);
  ctx.lineTo(x + barPx / 2, y + 2);
  ctx.stroke();

  ctx.font = '8px "Courier New", monospace';
  ctx.fillStyle = GREEN_DIM;
  ctx.fillText(`${barNm} NM`, x + barPx / 2 - 12, y - 6);
}

function drawSectorLabel(ctx) {
  const [cx, cy] = toCanvas(0, SECTOR.extentY);
  ctx.font = '9px "Courier New", monospace';
  ctx.fillStyle = '#0d3a12';
  ctx.fillText(SECTOR.name, cx - 40, cy + 14);
}

export function drawMap(ctx) {
  const w = ctx.canvas.width / window.devicePixelRatio;
  const h = ctx.canvas.height / window.devicePixelRatio;

  drawGrid(ctx);
  drawSectorBoundary(ctx);

  // Coastline
  drawPolyline(ctx, COASTLINE, toCanvas, GREEN_MAP, 1.2);
  drawPolyline(ctx, LONG_ISLAND, toCanvas, GREEN_MAP, 1.0);

  drawScaleBar(ctx, w, h);
  drawSectorLabel(ctx);
}
