import type { HexCoord } from './gameDomain.js';

export const DEFAULT_MAP_SIZE = 16;

/**
 * Coordinates are odd-r offset: q = column, r = row, both in [0, size).
 * Axial/cube coordinates are only used internally for hex math.
 */

export function offsetToAxial(col: number, row: number): { q: number; r: number } {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset(q: number, r: number): { col: number; row: number } {
  return { col: q + (r - (r & 1)) / 2, row: r };
}

function normalizeGridDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

export function isOnOffsetGrid(
  q: number,
  r: number,
  width: number,
  height: number,
  fallbackSize = DEFAULT_MAP_SIZE,
): boolean {
  if (!Number.isFinite(q) || !Number.isFinite(r)) return false;
  const w = normalizeGridDimension(width, fallbackSize);
  const h = normalizeGridDimension(height, fallbackSize);
  return q >= 0 && q < w && r >= 0 && r < h;
}

const EVEN_ROW_DIRS = [
  [1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1],
] as const;
const ODD_ROW_DIRS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1],
] as const;

export function offsetNeighbor(c: HexCoord, dir: number): HexCoord {
  const dirs = (c.r & 1) === 0 ? EVEN_ROW_DIRS : ODD_ROW_DIRS;
  const [dq, dr] = dirs[dir % 6];
  return { q: c.q + dq, r: c.r + dr };
}

export function offsetDistance(a: HexCoord, b: HexCoord): number {
  const a1 = offsetToAxial(a.q, a.r);
  const b1 = offsetToAxial(b.q, b.r);
  const s1 = -a1.q - a1.r;
  const s2 = -b1.q - b1.r;
  return (Math.abs(a1.q - b1.q) + Math.abs(a1.r - b1.r) + Math.abs(s1 - s2)) / 2;
}

export function offsetWithinRange(center: HexCoord, range: number): HexCoord[] {
  const axial = offsetToAxial(center.q, center.r);
  const results: HexCoord[] = [];
  for (let dq = -range; dq <= range; dq++) {
    const r1 = Math.max(-range, -dq - range);
    const r2 = Math.min(range, -dq + range);
    for (let dr = r1; dr <= r2; dr++) {
      const { col, row } = axialToOffset(axial.q + dq, axial.r + dr);
      results.push({ q: col, r: row });
    }
  }
  return results;
}

export function eachOffsetKey(width: number, height: number): string[] {
  const keys: string[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      keys.push(`${col},${row}`);
    }
  }
  return keys;
}

/** True when every offset cell has a tile entry (full rectangular map). */
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
