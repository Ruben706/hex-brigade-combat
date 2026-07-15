import type { HexCoord } from './gameDomain.js';

export function offsetToAxial(col: number, row: number): HexCoord {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset(q: number, r: number): { col: number; row: number } {
  return { col: q + (r - (r & 1)) / 2, row: r };
}

export function isOnOffsetGrid(q: number, r: number, width: number, height: number): boolean {
  const { col, row } = axialToOffset(q, r);
  return col >= 0 && col < width && row >= 0 && row < height;
}
