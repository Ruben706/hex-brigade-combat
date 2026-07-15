import type { BrigadeDto, GameStateDto } from '../types/game';
import { PLAYER_COLORS, UNIT_LABELS } from '../types/game';

export interface HexCoord {
  q: number;
  r: number;
}

export interface RenderOptions {
  selectedBrigadeId: string | null;
  highlightHexes: HexCoord[];
  attackHexes: HexCoord[];
  damagePopups: DamagePopup[];
}

export interface DamagePopup {
  q: number;
  r: number;
  text: string;
  opacity: number;
}

const HEX_SIZE = 32;
/** Larger than draw radius so token clicks register reliably. */
const BRIGADE_HIT_RADIUS = HEX_SIZE * 0.85;

export class HexRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private offsetX = 0;
  private offsetY = 0;
  private gridWidth = 0;
  private gridHeight = 0;

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

  private hexToPixelUncentered(q: number, r: number): { x: number; y: number } {
    const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
    const y = HEX_SIZE * ((3 / 2) * r);
    return { x, y };
  }

  pixelToHex(x: number, y: number): HexCoord {
    const px = x - this.offsetX;
    const py = y - this.offsetY;
    const q = ((Math.sqrt(3) / 3) * px - (1 / 3) * py) / HEX_SIZE;
    const r = ((2 / 3) * py) / HEX_SIZE;
    return axialRound(q, r);
  }

  syncLayout(gridWidth: number, gridHeight: number): void {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

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

    this.offsetX = (this.width - (maxX - minX)) / 2 - minX + HEX_SIZE;
    this.offsetY = (this.height - (maxY - minY)) / 2 - minY + HEX_SIZE;
  }

  /** Map a mouse event to canvas pixel coordinates (handles CSS scaling). */
  eventToCanvas(canvas: HTMLCanvasElement, event: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  /** Pick the closest brigade whose hit circle contains the click. */
  pickBrigade(x: number, y: number, brigades: BrigadeDto[]): BrigadeDto | null {
    let best: BrigadeDto | null = null;
    let bestDistance = BRIGADE_HIT_RADIUS;

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

  isOnGrid(hex: HexCoord): boolean {
    return hex.q >= 0 && hex.r >= 0 && hex.q < this.gridWidth && hex.r < this.gridHeight;
  }

  render(state: GameStateDto, options: RenderOptions): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.syncLayout(state.gridWidth, state.gridHeight);

    for (let r = 0; r < state.gridHeight; r++) {
      for (let q = 0; q < state.gridWidth; q++) {
        const isMove = options.highlightHexes.some((h) => h.q === q && h.r === r);
        const isAttack = options.attackHexes.some((h) => h.q === q && h.r === r);
        this.drawHex(q, r, '#1e2a3a', isMove ? '#3d6b4f' : isAttack ? '#6b3d3d' : '#2a3d52');
      }
    }

    for (const brigade of state.brigades) {
      this.drawBrigade(brigade, brigade.id === options.selectedBrigadeId);
    }

    for (const popup of options.damagePopups) {
      this.drawDamagePopup(popup);
    }
  }

  private drawHex(q: number, r: number, stroke: string, fill: string): void {
    const { x, y } = this.hexToPixel(q, r);
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const hx = x + HEX_SIZE * Math.cos(angle);
      const hy = y + HEX_SIZE * Math.sin(angle);
      if (i === 0) {
        this.ctx.moveTo(hx, hy);
      } else {
        this.ctx.lineTo(hx, hy);
      }
    }
    this.ctx.closePath();
    this.ctx.fillStyle = fill;
    this.ctx.fill();
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
  }

  private drawBrigade(brigade: BrigadeDto, selected: boolean): void {
    const { x, y } = this.hexToPixel(brigade.q, brigade.r);
    const color = PLAYER_COLORS[brigade.playerId] ?? '#888';
    const radius = HEX_SIZE * 0.55;

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = selected ? '#ffd166' : '#111';
    this.ctx.lineWidth = selected ? 3 : 2;
    this.ctx.stroke();

    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 11px Segoe UI, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(UNIT_LABELS[brigade.unitType] ?? '?', x, y - 4);

    const hpPct = brigade.strength / brigade.maxStrength;
    const barW = HEX_SIZE * 0.9;
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
    this.ctx.fillText(popup.text, x, y - HEX_SIZE * 0.9 - floatOffset);
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
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function getNeighbors(q: number, r: number): HexCoord[] {
  const directions = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
  return directions.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
}

export function getReachableHexes(
  start: HexCoord,
  movementRange: number,
  gridWidth: number,
  gridHeight: number,
  occupied: HexCoord[],
): HexCoord[] {
  const occupiedSet = new Set(occupied.map((h) => `${h.q},${h.r}`));
  const startKey = `${start.q},${start.r}`;
  const visited = new Map<string, number>([[startKey, 0]]);
  const reachable: HexCoord[] = [];
  const queue: Array<{ coord: HexCoord; cost: number }> = [{ coord: start, cost: 0 }];

  while (queue.length > 0) {
    const { coord, cost } = queue.shift()!;
    if (cost > 0) {
      reachable.push(coord);
    }
    if (cost >= movementRange) {
      continue;
    }

    for (const neighbor of getNeighbors(coord.q, coord.r)) {
      if (
        neighbor.q < 0 ||
        neighbor.r < 0 ||
        neighbor.q >= gridWidth ||
        neighbor.r >= gridHeight ||
        occupiedSet.has(`${neighbor.q},${neighbor.r}`)
      ) {
        continue;
      }

      const nextCost = cost + 1;
      const key = `${neighbor.q},${neighbor.r}`;
      const known = visited.get(key);
      if (known !== undefined && known <= nextCost) {
        continue;
      }

      visited.set(key, nextCost);
      queue.push({ coord: neighbor, cost: nextCost });
    }
  }

  return reachable;
}

export function withinRange(q: number, r: number, range: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let dq = -range; dq <= range; dq++) {
    const r1 = Math.max(-range, -dq - range);
    const r2 = Math.min(range, -dq + range);
    for (let dr = r1; dr <= r2; dr++) {
      results.push({ q: q + dq, r: r + dr });
    }
  }
  return results;
}
