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

export function usesRectangularLayout(
  tileKeys: string[],
  width: number,
  height: number,
): boolean {
  if (tileKeys.length !== width * height) {
    return false;
  }

  return tileKeys.every((key) => {
    const [q, r] = key.split(',').map(Number);
    return isOnOffsetGrid(q, r, width, height);
  });
}

export function eachOffsetKey(width: number, height: number): string[] {
  const keys: string[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const { q, r } = offsetToAxial(col, row);
      keys.push(`${q},${r}`);
    }
  }
  return keys;
}

/** True when every odd-r offset cell has a tile entry (full rectangular map). */
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
