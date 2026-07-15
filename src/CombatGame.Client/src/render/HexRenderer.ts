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

function terrainMovementCost(terrain: string): number {
  switch (terrain) {
    case 'Plains':
      return 1;
    case 'Forest':
    case 'ShallowWater':
    case 'Hill':
      return 2;
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
      const isAttack = visible && options.attackHexes.some((h) => h.q === q && h.r === r);
      const fill = visible
        ? isMove
          ? '#3d6b4f'
          : isAttack
            ? '#6b3d3d'
            : baseFill
        : '#141a22';
      this.drawTile(q, r, '#1e2a3a', fill, visible ? '#2a3d52' : '#0f1419');
    });

    if (fogEnabled) {
      eachOffsetHex(state.gridWidth, state.gridHeight, (_col, _row, hex) => {
        if (!isHexVisible(options.visibleHexes!, hex)) {
          this.drawTileFogOverlay(hex.q, hex.r);
        }
      });
    }

    for (const hex of options.rangeHexes) {
      if (!fogEnabled || isHexVisible(options.visibleHexes!, hex)) {
        this.drawTileOutline(hex.q, hex.r, '#ffd166', 3);
      }
    }

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

  private drawTileOutline(q: number, r: number, stroke: string, lineWidth: number): void {
    const { x, y, size } = this.tileRect(q, r);
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
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
