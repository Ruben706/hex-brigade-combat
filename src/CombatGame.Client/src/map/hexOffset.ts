import type { HexCoord } from '../render/HexRenderer';

export const DEFAULT_MAP_SIZE = 16;

/** q = column, r = row on a square tile grid. */

export function isOnOffsetGrid(
  q: number,
  r: number,
  width: number,
  height: number,
  fallbackSize = DEFAULT_MAP_SIZE,
): boolean {
  if (!Number.isFinite(q) || !Number.isFinite(r)) return false;
  const w = Number.isFinite(width) && width > 0 ? Math.trunc(width) : fallbackSize;
  const h = Number.isFinite(height) && height > 0 ? Math.trunc(height) : fallbackSize;
  return q >= 0 && q < w && r >= 0 && r < h;
}

export function isOnOffsetGridCoord(hex: HexCoord, width: number, height: number): boolean {
  return isOnOffsetGrid(hex.q, hex.r, width, height);
}

const ORTHOGONAL_DIRS = [
  [1, 0], [0, -1], [-1, 0], [0, 1],
] as const;

/** Orthogonal neighbor (movement uses 4 directions). */
export function offsetNeighbor(hex: HexCoord, dir: number): HexCoord {
  const [dq, dr] = ORTHOGONAL_DIRS[dir % 4];
  return { q: hex.q + dq, r: hex.r + dr };
}

export function orthogonalNeighbors(hex: HexCoord): HexCoord[] {
  return ORTHOGONAL_DIRS.map(([dq, dr]) => ({ q: hex.q + dq, r: hex.r + dr }));
}

/** Chebyshev distance — weapon range and vision. */
export function offsetDistance(a: HexCoord, b: HexCoord): number {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));
}

/** Manhattan distance — orthogonal steps. */
export function manhattanDistance(a: HexCoord, b: HexCoord): number {
  return Math.abs(a.q - b.q) + Math.abs(a.r - b.r);
}

/** All tiles within Chebyshev range (square area). */
export function offsetWithinRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let dc = -range; dc <= range; dc++) {
    for (let dr = -range; dr <= range; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) <= range) {
        results.push({ q: center.q + dc, r: center.r + dr });
      }
    }
  }
  return results;
}

export function eachOffsetHex(
  width: number,
  height: number,
  fn: (col: number, row: number, hex: HexCoord) => void,
): void {
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      fn(col, row, { q: col, r: row });
    }
  }
}

export function eachOffsetKey(width: number, height: number): string[] {
  const keys: string[] = [];
  eachOffsetHex(width, height, (_col, _row, hex) => {
    keys.push(`${hex.q},${hex.r}`);
  });
  return keys;
}

export function hasCompleteOffsetTileSet(
  tiles: Record<string, unknown>,
  width: number,
  height: number,
): boolean {
  if (width <= 0 || height <= 0) return false;
  for (const key of eachOffsetKey(width, height)) {
    if (!(key in tiles)) return false;
  }
  return true;
}

// Legacy aliases (no-op conversions on square grid)
export function offsetToAxial(col: number, row: number): { q: number; r: number } {
  return { q: col, r: row };
}

export function axialToOffset(q: number, r: number): { col: number; row: number } {
  return { col: q, row: r };
}

export function isTilesAdjacent(a: HexCoord, b: HexCoord): boolean {
  return manhattanDistance(a, b) === 1;
}
