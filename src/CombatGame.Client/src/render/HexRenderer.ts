import type { BrigadeDto, GameStateDto } from '../types/game';
import { PLAYER_COLORS, TERRAIN_COLORS, UNIT_LABELS } from '../types/game';
import {
  axialToOffset,
  eachOffsetHex,
  isOnOffsetGrid,
  isOnOffsetGridCoord,
  offsetDistance,
  offsetNeighbor,
  offsetWithinRange,
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

const DEFAULT_HEX_SIZE = 32;
const BRIGADE_HIT_SCALE = 0.85;

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
  private offsetX = 0;
  private offsetY = 0;
  private gridWidth = 0;
  private gridHeight = 0;
  private hexSize = DEFAULT_HEX_SIZE;

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

  hexToPixel(q: number, r: number): { x: number; y: number } {
    const { x, y } = this.hexToPixelUncentered(q, r);
    return { x: x + this.offsetX, y: y + this.offsetY };
  }

  /** q = column, r = row (odd-r offset). Odd rows are shifted half a hex right. */
  private hexToPixelUncentered(q: number, r: number): { x: number; y: number } {
    const x = this.hexSize * Math.sqrt(3) * (q + 0.5 * (r & 1));
    const y = this.hexSize * ((3 / 2) * r);
    return { x, y };
  }

  pixelToHex(x: number, y: number): HexCoord {
    const px = x - this.offsetX;
    const py = y - this.offsetY;
    const aq = ((Math.sqrt(3) / 3) * px - (1 / 3) * py) / this.hexSize;
    const ar = ((2 / 3) * py) / this.hexSize;
    const rounded = axialRound(aq, ar);
    const { col, row } = axialToOffset(rounded.q, rounded.r);
    return { q: col, r: row };
  }

  syncLayout(gridWidth: number, gridHeight: number): void {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    const fitWidth = (this.width - 40) / ((gridWidth + 0.5) * Math.sqrt(3));
    const fitHeight = (this.height - 40) / (gridHeight * 1.5);
    this.hexSize = Math.max(18, Math.min(DEFAULT_HEX_SIZE, Math.floor(Math.min(fitWidth, fitHeight))));

    const corners = [
      this.hexToPixelUncentered(0, 0),
      this.hexToPixelUncentered(gridWidth - 1, 0),
      this.hexToPixelUncentered(0, gridHeight - 1),
      this.hexToPixelUncentered(gridWidth - 1, gridHeight - 1),
    ];

    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));

    this.offsetX = (this.width - (maxX - minX)) / 2 - minX + this.hexSize;
    this.offsetY = (this.height - (maxY - minY)) / 2 - minY + this.hexSize;
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
    let bestDistance = this.hexSize * BRIGADE_HIT_SCALE;

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

  /** Snap a click to the nearest highlighted hex (avoids edge mis-picks). */
  pickNearestHex(x: number, y: number, candidates: HexCoord[], maxDistance?: number): HexCoord | null {
    const limit = maxDistance ?? this.hexSize * 0.92;
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
    this.syncLayout(state.gridWidth, state.gridHeight);

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
      this.drawHex(q, r, '#1e2a3a', fill, visible ? '#2a3d52' : '#0f1419');
    });

    if (fogEnabled) {
      eachOffsetHex(state.gridWidth, state.gridHeight, (_col, _row, hex) => {
        if (!isHexVisible(options.visibleHexes!, hex)) {
          this.drawHexFogOverlay(hex.q, hex.r);
        }
      });
    }

    for (const hex of options.rangeHexes) {
      if (!fogEnabled || isHexVisible(options.visibleHexes!, hex)) {
        this.drawHexOutline(hex.q, hex.r, '#ffd166', 3);
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

  private drawHex(q: number, r: number, stroke: string, fill: string, strokeOverride?: string): void {
    const { x, y } = this.hexToPixel(q, r);
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const hx = x + this.hexSize * Math.cos(angle);
      const hy = y + this.hexSize * Math.sin(angle);
      if (i === 0) {
        this.ctx.moveTo(hx, hy);
      } else {
        this.ctx.lineTo(hx, hy);
      }
    }
    this.ctx.closePath();
    this.ctx.fillStyle = fill;
    this.ctx.fill();
    this.ctx.strokeStyle = strokeOverride ?? stroke;
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
  }

  private drawHexFogOverlay(q: number, r: number): void {
    const { x, y } = this.hexToPixel(q, r);
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const hx = x + this.hexSize * Math.cos(angle);
      const hy = y + this.hexSize * Math.sin(angle);
      if (i === 0) {
        this.ctx.moveTo(hx, hy);
      } else {
        this.ctx.lineTo(hx, hy);
      }
    }
    this.ctx.closePath();
    this.ctx.fillStyle = 'rgba(5, 8, 12, 0.72)';
    this.ctx.fill();
  }

  private drawHexOutline(q: number, r: number, stroke: string, lineWidth: number): void {
    const { x, y } = this.hexToPixel(q, r);
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const hx = x + this.hexSize * Math.cos(angle);
      const hy = y + this.hexSize * Math.sin(angle);
      if (i === 0) {
        this.ctx.moveTo(hx, hy);
      } else {
        this.ctx.lineTo(hx, hy);
      }
    }
    this.ctx.closePath();
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();
  }

  private drawBrigade(brigade: BrigadeDto, selected: boolean): void {
    const { x, y } = this.hexToPixel(brigade.q, brigade.r);
    const color = PLAYER_COLORS[brigade.playerId] ?? '#888';
    const radius = this.hexSize * 0.55;

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = selected ? '#ffd166' : '#111';
    this.ctx.lineWidth = selected ? 3 : 2;
    this.ctx.stroke();

    this.ctx.fillStyle = '#fff';
    this.ctx.font = `bold ${Math.max(9, Math.round(this.hexSize * 0.34))}px Segoe UI, sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(UNIT_LABELS[brigade.unitType] ?? '?', x, y - 4);

    const hpPct = brigade.strength / brigade.maxStrength;
    const barW = this.hexSize * 0.9;
    const barH = 5;
    const barX = x - barW / 2;
    const barY = y + radius * 0.55;

    this.ctx.fillStyle = '#222';
    this.ctx.fillRect(barX, barY, barW, barH);
    this.ctx.fillStyle = hpPct > 0.5 ? '#6fcf6f' : hpPct > 0.25 ? '#f2c94c' : '#eb5757';
    this.ctx.fillRect(barX, barY, barW * hpPct, barH);

    if (brigade.statusEffects.length > 0) {
      this.ctx.font = '9px Segoe UI, sans-serif';
      this.ctx.fillStyle = '#ffd166';
      this.ctx.fillText('●', x + radius * 0.7, y - radius * 0.7);
    }
  }

  private drawDamagePopup(popup: DamagePopup): void {
    const { x, y } = this.hexToPixel(popup.q, popup.r);
    const floatOffset = (1 - popup.opacity) * 24;

    this.ctx.font = 'bold 14px Segoe UI, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.globalAlpha = popup.opacity;
    this.ctx.fillStyle = popup.text === 'MISS' ? '#9fb3c8' : '#ff6b6b';
    this.ctx.fillText(popup.text, x, y - this.hexSize * 0.9 - floatOffset);
    this.ctx.globalAlpha = 1;
  }
}

function axialRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);

  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }

  return { q: rq, r: rr };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  return offsetDistance(a, b);
}

export function getNeighbors(q: number, r: number): HexCoord[] {
  return [0, 1, 2, 3, 4, 5].map((dir) => offsetNeighbor({ q, r }, dir));
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

  // Dijkstra over terrain costs (frontier scan is fine on a 16x16 map).
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

  // First move of the turn: any adjacent passable, unoccupied tile is allowed
  // regardless of cost (deep water / mountains stay impassable).
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
