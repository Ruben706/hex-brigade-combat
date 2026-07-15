import type { BrigadeDto, GameStateDto } from '../types/game';
import { PLAYER_COLORS, TERRAIN_COLORS, UNIT_LABELS } from '../types/game';
import {
  eachOffsetHex,
  isOnOffsetGrid,
  isOnOffsetGridCoord,
  manhattanDistance,
  offsetDistance,
  offsetWithinRange,
  orthogonalNeighbors,
} from '../map/hexOffset';
import { isBrigadeVisible, isHexVisible } from '../vision/fogOfWar';

export interface HexCoord {
  q: number;
  r: number;
}

export interface RenderOptions {
  selectedBrigadeId: string | null;
  highlightHexes: HexCoord[];
  attackHexes: HexCoord[];
  rangeHexes: HexCoord[];
  visibleHexes: Set<string> | null;
  viewingPlayerId: number;
  terrain: Map<string, string>;
  damagePopups: DamagePopup[];
}

export interface DamagePopup {
  q: number;
  r: number;
  text: string;
  opacity: number;
}

const DEFAULT_TILE_SIZE = 32;
const TILE_GAP = 2;
const BRIGADE_HIT_SCALE = 0.85;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 3.5;
const ZOOM_WHEEL_FACTOR = 1.12;
const MOVE_FILL = 'rgba(90, 170, 255, 0.2)';
const MOVE_CONTOUR = '#8fd3ff';
const MOVE_CONTOUR_GLOW = 'rgba(90, 170, 255, 0.35)';
const ATTACK_RANGE_FILL = 'rgba(255, 180, 90, 0.18)';
const ATTACK_RANGE_CONTOUR = '#ffc866';
const ATTACK_RANGE_GLOW = 'rgba(255, 200, 100, 0.4)';
const ATTACK_TARGET_FILL = 'rgba(255, 90, 90, 0.32)';

interface BoundarySegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  horizontal: boolean;
}

function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Collect exterior edges of a tile region in world space, merged across tile gaps. */
function collectRegionBoundarySegments(
  hexes: HexCoord[],
  tileSize: number,
  gap: number,
): BoundarySegment[] {
  const keys = new Set(hexes.map((h) => hexKey(h.q, h.r)));
  const stride = tileSize + gap;
  const segments: BoundarySegment[] = [];

  for (const { q, r } of hexes) {
    const x0 = q * stride;
    const y0 = r * stride;
    const x1 = x0 + tileSize;
    const y1 = y0 + tileSize;

    if (!keys.has(hexKey(q, r - 1))) {
      segments.push({ x1: x0, y1: y0, x2: x1, y2: y0, horizontal: true });
    }
    if (!keys.has(hexKey(q, r + 1))) {
      segments.push({ x1: x0, y1: y1, x2: x1, y2: y1, horizontal: true });
    }
    if (!keys.has(hexKey(q - 1, r))) {
      segments.push({ x1: x0, y1: y0, x2: x0, y2: y1, horizontal: false });
    }
    if (!keys.has(hexKey(q + 1, r))) {
      segments.push({ x1: x1, y1: y0, x2: x1, y2: y1, horizontal: false });
    }
  }

  return mergeBoundarySegments(segments, gap);
}

function mergeBoundarySegments(segments: BoundarySegment[], gap: number): BoundarySegment[] {
  const horizontal = new Map<number, BoundarySegment[]>();
  const vertical = new Map<number, BoundarySegment[]>();

  for (const segment of segments) {
    if (segment.horizontal) {
      const y = segment.y1;
      const list = horizontal.get(y) ?? [];
      list.push({
        x1: Math.min(segment.x1, segment.x2),
        y1: y,
        x2: Math.max(segment.x1, segment.x2),
        y2: y,
        horizontal: true,
      });
      horizontal.set(y, list);
    } else {
      const x = segment.x1;
      const list = vertical.get(x) ?? [];
      list.push({
        x1: x,
        y1: Math.min(segment.y1, segment.y2),
        x2: x,
        y2: Math.max(segment.y1, segment.y2),
        horizontal: false,
      });
      vertical.set(x, list);
    }
  }

  const merged: BoundarySegment[] = [];
  for (const [y, list] of horizontal) {
    merged.push(...mergeCollinearSegments(list, gap, true, y));
  }
  for (const [x, list] of vertical) {
    merged.push(...mergeCollinearSegments(list, gap, false, x));
  }
  return merged;
}

function mergeCollinearSegments(
  segments: BoundarySegment[],
  gap: number,
  horizontal: boolean,
  fixedCoord: number,
): BoundarySegment[] {
  const sorted = [...segments].sort((a, b) => (horizontal ? a.x1 - b.x1 : a.y1 - b.y1));
  if (sorted.length === 0) return [];

  const merged: BoundarySegment[] = [];
  let current = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    const currentEnd = horizontal ? current.x2 : current.y2;
    const nextStart = horizontal ? next.x1 : next.y1;

    if (nextStart <= currentEnd + gap + 0.001) {
      if (horizontal) {
        current = { ...current, x2: Math.max(current.x2, next.x2) };
      } else {
        current = { ...current, y2: Math.max(current.y2, next.y2) };
      }
    } else {
      merged.push(
        horizontal
          ? { x1: current.x1, y1: fixedCoord, x2: current.x2, y2: fixedCoord, horizontal: true }
          : { x1: fixedCoord, y1: current.y1, x2: fixedCoord, y2: current.y2, horizontal: false },
      );
      current = next;
    }
  }

  merged.push(
    horizontal
      ? { x1: current.x1, y1: fixedCoord, x2: current.x2, y2: fixedCoord, horizontal: true }
      : { x1: fixedCoord, y1: current.y1, x2: fixedCoord, y2: current.y2, horizontal: false },
  );
  return merged;
}

function segmentEndpoints(segment: BoundarySegment): [[number, number], [number, number]] {
  return [
    [segment.x1, segment.y1],
    [segment.x2, segment.y2],
  ];
}

function pointsEqual(a: [number, number], b: [number, number], epsilon = 0.001): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function turnAngle(
  prev: [number, number],
  tip: [number, number],
  next: [number, number],
): number {
  const v1x = tip[0] - prev[0];
  const v1y = tip[1] - prev[1];
  const v2x = next[0] - tip[0];
  const v2y = next[1] - tip[1];
  return Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);
}

/** Stitch merged boundary segments into closed loops (counter-clockwise). */
function traceBoundaryLoops(segments: BoundarySegment[]): [number, number][][] {
  const unused = new Set(segments);
  const loops: [number, number][][] = [];

  while (unused.size > 0) {
    const startSegment = unused.values().next().value!;
    unused.delete(startSegment);

    const loop: [number, number][] = [[startSegment.x1, startSegment.y1], [startSegment.x2, startSegment.y2]];
    let prev = loop[0]!;
    let tip = loop[1]!;

    while (!pointsEqual(tip, loop[0]!)) {
      let bestSegment: BoundarySegment | null = null;
      let bestNext: [number, number] | null = null;
      let bestTurn = Infinity;

      for (const candidate of unused) {
        const [a, b] = segmentEndpoints(candidate);
        for (const nextTip of [a, b]) {
          if (!pointsEqual(nextTip, tip)) continue;
          const nextEnd = pointsEqual(nextTip, a) ? b : a;
          const angle = turnAngle(prev, tip, nextEnd);
          const normalized = angle <= 0 ? angle + Math.PI * 2 : angle;
          if (normalized < bestTurn) {
            bestTurn = normalized;
            bestSegment = candidate;
            bestNext = nextEnd;
          }
        }
      }

      if (!bestSegment || !bestNext) break;

      unused.delete(bestSegment);
      loop.push(bestNext);
      prev = tip;
      tip = bestNext;
    }

    if (loop.length >= 3) {
      loops.push(loop);
    }
  }

  return loops;
}

function terrainMovementCost(terrain: string): number {
  switch (terrain) {
    case 'Plains':
      return 1;
    case 'Forest':
    case 'ShallowWater':
      return 2;
    case 'Hill':
      return 3;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

function isPassableTerrain(terrain: string): boolean {
  return terrain !== 'DeepWater' && terrain !== 'Mountain';
}

export class HexRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private gridWidth = 0;
  private gridHeight = 0;
  private fitTileSize = DEFAULT_TILE_SIZE;
  private scale = 1;
  private translateX = 0;
  private translateY = 0;
  private layoutReady = false;
  private lastLayoutCanvasW = 0;
  private lastLayoutCanvasH = 0;
  private lastLayoutGridW = 0;
  private lastLayoutGridH = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.ctx = ctx;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  private worldTileStride(): number {
    return this.fitTileSize + TILE_GAP;
  }

  private screenTileSize(): number {
    return this.fitTileSize * this.scale;
  }

  private worldTileCenter(q: number, r: number): { x: number; y: number } {
    const stride = this.worldTileStride();
    return {
      x: q * stride + this.fitTileSize / 2,
      y: r * stride + this.fitTileSize / 2,
    };
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this.scale + this.translateX,
      y: wy * this.scale + this.translateY,
    };
  }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.translateX) / this.scale,
      y: (sy - this.translateY) / this.scale,
    };
  }

  private computeFitTileSize(gridWidth: number, gridHeight: number): number {
    const stride = (size: number) => size + TILE_GAP;
    const fitW = (this.width - 40) / (gridWidth * stride(1));
    const fitH = (this.height - 40) / (gridHeight * stride(1));
    return Math.max(18, Math.min(DEFAULT_TILE_SIZE, Math.floor(Math.min(fitW, fitH))));
  }

  private centerMap(): void {
    const stride = this.worldTileStride();
    const mapW = this.gridWidth * stride - TILE_GAP;
    const mapH = this.gridHeight * stride - TILE_GAP;
    this.translateX = (this.width - mapW * this.scale) / 2;
    this.translateY = (this.height - mapH * this.scale) / 2;
  }

  /** Recompute tile fit for the grid; resets camera only when grid dimensions change. */
  updateLayout(gridWidth: number, gridHeight: number, resetCamera = false): void {
    const gridChanged = gridWidth !== this.lastLayoutGridW || gridHeight !== this.lastLayoutGridH;
    const canvasChanged = this.width !== this.lastLayoutCanvasW || this.height !== this.lastLayoutCanvasH;
    if (this.layoutReady && !gridChanged && !canvasChanged && !resetCamera) {
      return;
    }

    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.fitTileSize = this.computeFitTileSize(gridWidth, gridHeight);
    this.lastLayoutCanvasW = this.width;
    this.lastLayoutCanvasH = this.height;
    this.lastLayoutGridW = gridWidth;
    this.lastLayoutGridH = gridHeight;

    if (!this.layoutReady || resetCamera || gridChanged) {
      this.scale = 1;
      this.centerMap();
      this.layoutReady = true;
      return;
    }

    // Canvas resized: refit tile size and re-center, preserving zoom level.
    this.centerMap();
  }

  panBy(dx: number, dy: number): void {
    this.translateX += dx;
    this.translateY += dy;
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const world = this.screenToWorld(screenX, screenY);
    const nextScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.scale * factor));
    if (nextScale === this.scale) {
      return;
    }

    this.scale = nextScale;
    this.translateX = screenX - world.x * this.scale;
    this.translateY = screenY - world.y * this.scale;
  }

  zoomWheel(screenX: number, screenY: number, deltaY: number): void {
    const factor = deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
    this.zoomAt(screenX, screenY, factor);
  }

  /** Center of tile in canvas space. q = column, r = row. */
  hexToPixel(q: number, r: number): { x: number; y: number } {
    const world = this.worldTileCenter(q, r);
    return this.worldToScreen(world.x, world.y);
  }

  pixelToHex(x: number, y: number): HexCoord {
    const { x: wx, y: wy } = this.screenToWorld(x, y);
    const stride = this.worldTileStride();
    const q = Math.floor(wx / stride);
    const r = Math.floor(wy / stride);
    return { q, r };
  }

  /** @deprecated Use updateLayout — kept for callers that only need layout sync. */
  syncLayout(gridWidth: number, gridHeight: number): void {
    this.updateLayout(gridWidth, gridHeight);
  }

  eventToCanvas(canvas: HTMLCanvasElement, event: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  pickBrigade(x: number, y: number, brigades: BrigadeDto[]): BrigadeDto | null {
    let best: BrigadeDto | null = null;
    let bestDistance = this.screenTileSize() * BRIGADE_HIT_SCALE;

    for (const brigade of brigades) {
      const { x: bx, y: by } = this.hexToPixel(brigade.q, brigade.r);
      const distance = Math.hypot(x - bx, y - by);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = brigade;
      }
    }

    return best;
  }

  pickHex(x: number, y: number): HexCoord {
    return this.pixelToHex(x, y);
  }

  pickNearestHex(x: number, y: number, candidates: HexCoord[], maxDistance?: number): HexCoord | null {
    const limit = maxDistance ?? this.screenTileSize() * 0.92;
    let best: HexCoord | null = null;
    let bestDistance = limit;

    for (const hex of candidates) {
      const { x: hx, y: hy } = this.hexToPixel(hex.q, hex.r);
      const distance = Math.hypot(x - hx, y - hy);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = hex;
      }
    }

    return best;
  }

  isOnGrid(hex: HexCoord): boolean {
    return isOnOffsetGridCoord(hex, this.gridWidth, this.gridHeight);
  }

  render(state: GameStateDto, options: RenderOptions): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.updateLayout(state.gridWidth, state.gridHeight);

    const fogEnabled = options.visibleHexes !== null;

    eachOffsetHex(state.gridWidth, state.gridHeight, (_col, _row, hex) => {
      const { q, r } = hex;
      const visible = !fogEnabled || isHexVisible(options.visibleHexes!, hex);
      const terrain = options.terrain.get(`${q},${r}`) ?? 'Plains';
      const baseFill = TERRAIN_COLORS[terrain] ?? '#2a3d52';
      const isMove = visible && options.highlightHexes.some((h) => h.q === q && h.r === r);
      const isAttackTarget = visible && options.attackHexes.some((h) => h.q === q && h.r === r);
      const isInAttackRange = visible && options.rangeHexes.some((h) => h.q === q && h.r === r);
      const fill = visible ? baseFill : '#141a22';
      this.drawTile(q, r, '#1e2a3a', fill, visible ? '#2a3d52' : '#0f1419');
      if (visible && isInAttackRange) {
        this.drawTileOverlay(q, r, ATTACK_RANGE_FILL);
      }
      if (visible && isMove) {
        this.drawTileOverlay(q, r, MOVE_FILL);
      }
      if (visible && isAttackTarget) {
        this.drawTileOverlay(q, r, ATTACK_TARGET_FILL);
      }
    });

    if (fogEnabled) {
      eachOffsetHex(state.gridWidth, state.gridHeight, (_col, _row, hex) => {
        if (!isHexVisible(options.visibleHexes!, hex)) {
          this.drawTileFogOverlay(hex.q, hex.r);
        }
      });
    }

    const visibleMoveHexes = options.highlightHexes.filter(
      (hex) => !fogEnabled || isHexVisible(options.visibleHexes!, hex),
    );
    this.drawRegionContour(visibleMoveHexes, MOVE_CONTOUR, MOVE_CONTOUR_GLOW);

    const visibleRangeHexes = options.rangeHexes.filter(
      (hex) => !fogEnabled || isHexVisible(options.visibleHexes!, hex),
    );
    this.drawRegionContour(visibleRangeHexes, ATTACK_RANGE_CONTOUR, ATTACK_RANGE_GLOW);

    for (const brigade of state.brigades) {
      if (
        isBrigadeVisible(
          brigade,
          options.viewingPlayerId,
          options.visibleHexes ?? new Set(),
          state.brigades,
          options.terrain,
        )
      ) {
        this.drawBrigade(brigade, brigade.id === options.selectedBrigadeId);
      }
    }

    for (const popup of options.damagePopups) {
      if (!fogEnabled || isHexVisible(options.visibleHexes!, { q: popup.q, r: popup.r })) {
        this.drawDamagePopup(popup);
      }
    }
  }

  private tileRect(q: number, r: number): { x: number; y: number; size: number } {
    const { x: cx, y: cy } = this.hexToPixel(q, r);
    const half = this.screenTileSize() / 2;
    return { x: cx - half, y: cy - half, size: this.screenTileSize() };
  }

  private drawTile(q: number, r: number, stroke: string, fill: string, strokeOverride?: string): void {
    const { x, y, size } = this.tileRect(q, r);
    this.ctx.fillStyle = fill;
    this.ctx.fillRect(x, y, size, size);
    this.ctx.strokeStyle = strokeOverride ?? stroke;
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  }

  private drawTileFogOverlay(q: number, r: number): void {
    const { x, y, size } = this.tileRect(q, r);
    this.ctx.fillStyle = 'rgba(5, 8, 12, 0.72)';
    this.ctx.fillRect(x, y, size, size);
  }

  private drawTileOverlay(q: number, r: number, fill: string): void {
    const { x, y, size } = this.tileRect(q, r);
    this.ctx.fillStyle = fill;
    this.ctx.fillRect(x, y, size, size);
  }

  private drawRegionContour(hexes: HexCoord[], stroke: string, glow: string): void {
    if (hexes.length === 0) return;

    const segments = collectRegionBoundarySegments(hexes, this.fitTileSize, TILE_GAP);
    const loops = traceBoundaryLoops(segments);
    if (loops.length === 0) return;

    const lineWidth = Math.max(2, 2.5 * this.scale);

    this.ctx.save();
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = lineWidth;
    this.ctx.shadowColor = glow;
    this.ctx.shadowBlur = 5 * this.scale;

    for (const loop of loops) {
      this.ctx.beginPath();
      const start = this.worldToScreen(loop[0]![0], loop[0]![1]);
      this.ctx.moveTo(start.x, start.y);
      for (let i = 1; i < loop.length; i++) {
        const point = this.worldToScreen(loop[i]![0], loop[i]![1]);
        this.ctx.lineTo(point.x, point.y);
      }
      this.ctx.closePath();
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private drawBrigade(brigade: BrigadeDto, selected: boolean): void {
    const { x, y } = this.hexToPixel(brigade.q, brigade.r);
    const color = PLAYER_COLORS[brigade.playerId] ?? '#888';
    const tileSize = this.screenTileSize();
    const radius = tileSize * 0.32;

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = selected ? '#ffd166' : '#111';
    this.ctx.lineWidth = selected ? 3 : 2;
    this.ctx.stroke();

    this.ctx.fillStyle = '#fff';
    this.ctx.font = `bold ${Math.max(9, Math.round(tileSize * 0.34))}px Segoe UI, sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(UNIT_LABELS[brigade.unitType] ?? '?', x, y - 3);

    const hpPct = brigade.strength / brigade.maxStrength;
    const barW = tileSize * 0.75;
    const barH = 4;
    const barX = x - barW / 2;
    const barY = y + radius * 0.65;

    this.ctx.fillStyle = '#222';
    this.ctx.fillRect(barX, barY, barW, barH);
    this.ctx.fillStyle = hpPct > 0.5 ? '#6fcf6f' : hpPct > 0.25 ? '#f2c94c' : '#eb5757';
    this.ctx.fillRect(barX, barY, barW * hpPct, barH);

    if (brigade.statusEffects.length > 0) {
      this.ctx.font = '9px Segoe UI, sans-serif';
      this.ctx.fillStyle = '#ffd166';
      this.ctx.fillText('●', x + radius * 0.85, y - radius * 0.85);
    }
  }

  private drawDamagePopup(popup: DamagePopup): void {
    const { x, y } = this.hexToPixel(popup.q, popup.r);
    const floatOffset = (1 - popup.opacity) * 24;
    const tileSize = this.screenTileSize();

    this.ctx.font = 'bold 14px Segoe UI, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.globalAlpha = popup.opacity;
    this.ctx.fillStyle = popup.text === 'MISS' ? '#9fb3c8' : '#ff6b6b';
    this.ctx.fillText(popup.text, x, y - tileSize * 0.55 - floatOffset);
    this.ctx.globalAlpha = 1;
  }
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  return offsetDistance(a, b);
}

export function getNeighbors(q: number, r: number): HexCoord[] {
  return orthogonalNeighbors({ q, r });
}

export function getReachableHexes(
  start: HexCoord,
  movementRange: number,
  gridWidth: number,
  gridHeight: number,
  occupied: HexCoord[],
  terrain: Map<string, string>,
  isFirstMove = false,
): HexCoord[] {
  const occupiedSet = new Set(occupied.map((h) => `${h.q},${h.r}`));
  const startKey = `${start.q},${start.r}`;

  const costs = new Map<string, number>([[startKey, 0]]);
  const coords = new Map<string, HexCoord>([[startKey, start]]);
  const frontier = new Set<string>([startKey]);

  while (frontier.size > 0) {
    let currentKey = '';
    let currentCost = Infinity;
    for (const key of frontier) {
      const c = costs.get(key)!;
      if (c < currentCost) {
        currentCost = c;
        currentKey = key;
      }
    }
    frontier.delete(currentKey);
    const current = coords.get(currentKey)!;

    for (const neighbor of getNeighbors(current.q, current.r)) {
      const key = `${neighbor.q},${neighbor.r}`;
      if (!isOnOffsetGrid(neighbor.q, neighbor.r, gridWidth, gridHeight) || occupiedSet.has(key)) {
        continue;
      }

      const tileTerrain = terrain.get(key) ?? 'Plains';
      if (!isPassableTerrain(tileTerrain)) {
        continue;
      }

      const nextCost = currentCost + terrainMovementCost(tileTerrain);
      if (nextCost > movementRange) {
        continue;
      }

      const known = costs.get(key);
      if (known !== undefined && known <= nextCost) {
        continue;
      }

      costs.set(key, nextCost);
      coords.set(key, neighbor);
      frontier.add(key);
    }
  }

  const result = new Map<string, HexCoord>();
  for (const [key, coord] of coords) {
    if (key !== startKey) {
      result.set(key, coord);
    }
  }

  if (isFirstMove) {
    for (const neighbor of getNeighbors(start.q, start.r)) {
      const key = `${neighbor.q},${neighbor.r}`;
      if (!isOnOffsetGrid(neighbor.q, neighbor.r, gridWidth, gridHeight) || occupiedSet.has(key)) {
        continue;
      }
      const tileTerrain = terrain.get(key) ?? 'Plains';
      if (!isPassableTerrain(tileTerrain)) {
        continue;
      }
      result.set(key, neighbor);
    }
  }

  return [...result.values()];
}

export function withinRange(q: number, r: number, range: number): HexCoord[] {
  return offsetWithinRange({ q, r }, range);
}

export { manhattanDistance };
