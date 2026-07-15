import type { HexCoord } from '../render/HexRenderer';

/** Odd-r offset layout for a visually rectangular pointy-top hex grid. */
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

export function isOnOffsetGridCoord(hex: HexCoord, width: number, height: number): boolean {
  return isOnOffsetGrid(hex.q, hex.r, width, height);
}

export function eachOffsetHex(
  width: number,
  height: number,
  fn: (col: number, row: number, hex: HexCoord) => void,
): void {
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      fn(col, row, offsetToAxial(col, row));
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
