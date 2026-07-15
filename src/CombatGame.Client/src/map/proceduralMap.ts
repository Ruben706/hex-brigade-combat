import type { TileDto } from '../types/game';
import { offsetToAxial, axialToOffset } from './hexOffset';

export const MAP_SIZE = 16;

export type TerrainType =
  | 'Plains'
  | 'Forest'
  | 'ShallowWater'
  | 'DeepWater'
  | 'Mountain'
  | 'Hill';

type TileMap = Record<string, TerrainType>;

interface HexCoord {
  q: number;
  r: number;
}

function hexKey(c: HexCoord): string {
  return `${c.q},${c.r}`;
}

class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

function withinRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let dq = -range; dq <= range; dq++) {
    const r1 = Math.max(-range, -dq - range);
    const r2 = Math.min(range, -dq + range);
    for (let dr = r1; dr <= r2; dr++) {
      results.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return results;
}

function isInSpawnZone(hex: HexCoord): boolean {
  const { col, row } = axialToOffset(hex.q, hex.r);
  return (col <= 2 || col >= MAP_SIZE - 3) && row >= 4 && row <= 12;
}

function isOnGrid(hex: HexCoord): boolean {
  const { col, row } = axialToOffset(hex.q, hex.r);
  return col >= 0 && col < MAP_SIZE && row >= 0 && row < MAP_SIZE;
}

function clearRect(tiles: TileMap, colMin: number, colMax: number, rowMin: number, rowMax: number): void {
  for (let row = rowMin; row <= rowMax && row < MAP_SIZE; row++) {
    for (let col = colMin; col <= colMax && col < MAP_SIZE; col++) {
      tiles[hexKey(offsetToAxial(col, row))] = 'Plains';
    }
  }
}

function paintBlob(
  tiles: TileMap,
  center: HexCoord,
  terrain: TerrainType,
  radius: number,
  rng: SeededRng,
  density: number,
): void {
  for (const hex of withinRange(center, radius)) {
    if (!isOnGrid(hex)) continue;
    if (isInSpawnZone(hex)) continue;

    if (hex.q !== center.q || hex.r !== center.r) {
      if (rng.next() >= density) continue;
    }

    const key = hexKey(hex);
    const existing = tiles[key] ?? 'Plains';

    if (terrain === 'ShallowWater' && (existing === 'Mountain' || existing === 'DeepWater')) continue;
    if (
      terrain === 'Forest' &&
      (existing === 'Mountain' || existing === 'DeepWater' || existing === 'ShallowWater')
    ) {
      continue;
    }
    if (terrain === 'Hill' && existing !== 'Plains') continue;

    tiles[key] = terrain;
  }
}

function randomCoord(rng: SeededRng, min: number, max: number): HexCoord {
  return offsetToAxial(rng.nextInt(min, max), rng.nextInt(min, max));
}

export function hashGameId(gameId: string): number {
  return gameId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

export function generateMap(seed: number): TileMap {
  const rng = new SeededRng(seed);
  const tiles: TileMap = {};

  for (let row = 0; row < MAP_SIZE; row++) {
    for (let col = 0; col < MAP_SIZE; col++) {
      tiles[hexKey(offsetToAxial(col, row))] = 'Plains';
    }
  }

  paintBlob(tiles, offsetToAxial(8, 8), 'Mountain', 2, rng, 0.65);
  paintBlob(tiles, offsetToAxial(7, 5), 'Mountain', 2, rng, 0.55);
  paintBlob(tiles, offsetToAxial(9, 11), 'Mountain', 1, rng, 0.7);

  for (let i = 0; i < 6; i++) {
    paintBlob(tiles, randomCoord(rng, 4, 11), 'DeepWater', rng.nextInt(1, 2), rng, 0.45);
  }

  for (const key of Object.keys(tiles)) {
    if (tiles[key] !== 'DeepWater') continue;
    const [q, r] = key.split(',').map(Number);
    const dirs = [
      [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
    ] as const;
    for (const [dq, dr] of dirs) {
      const n = { q: q + dq, r: r + dr };
      if (!isOnGrid(n)) continue;
      const nKey = hexKey(n);
      if (tiles[nKey] === 'Plains' && rng.next() < 0.55) {
        tiles[nKey] = 'ShallowWater';
      }
    }
  }

  for (let i = 0; i < 14; i++) {
    paintBlob(tiles, randomCoord(rng, 0, MAP_SIZE - 1), 'Forest', rng.nextInt(1, 2), rng, 0.5);
  }

  for (let i = 0; i < 10; i++) {
    paintBlob(tiles, randomCoord(rng, 0, MAP_SIZE - 1), 'Hill', 1, rng, 0.55);
  }

  clearRect(tiles, 0, 2, 4, 12);
  clearRect(tiles, MAP_SIZE - 3, MAP_SIZE - 1, 4, 12);
  return tiles;
}

export function tileMapToTiles(map: TileMap): TileDto[] {
  return Object.entries(map).map(([key, terrain]) => {
    const [q, r] = key.split(',').map(Number);
    return { q, r, terrain };
  });
}

export function generateTilesForGame(gameId: string): TileDto[] {
  return tileMapToTiles(generateMap(hashGameId(gameId)));
}
