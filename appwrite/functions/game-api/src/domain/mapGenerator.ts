import type { HexCoord } from './gameDomain.js';
import { hexKey } from './gameDomain.js';
import type { TileMap, TerrainType } from './terrain.js';
import { isOnOffsetGrid, offsetNeighbor, offsetWithinRange, orthogonalNeighbors, manhattanDistance } from './hexOffset.js';

export const MAP_SIZE = 16;

class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

function isInSpawnZone(hex: HexCoord): boolean {
  return (hex.q <= 2 || hex.q >= MAP_SIZE - 3) && hex.r >= 4 && hex.r <= 12;
}

function isOnGrid(hex: HexCoord): boolean {
  return isOnOffsetGrid(hex.q, hex.r, MAP_SIZE, MAP_SIZE);
}

function clearRect(tiles: TileMap, colMin: number, colMax: number, rowMin: number, rowMax: number): void {
  for (let row = rowMin; row <= rowMax && row < MAP_SIZE; row++) {
    for (let col = colMin; col <= colMax && col < MAP_SIZE; col++) {
      tiles[hexKey({ q: col, r: row })] = 'Plains';
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
  for (const hex of offsetWithinRange(center, radius)) {
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
  return { q: rng.nextInt(min, max), r: rng.nextInt(min, max) };
}

export function generateMap(seed: number): TileMap {
  const rng = new SeededRng(seed);
  const tiles: TileMap = {};

  for (let row = 0; row < MAP_SIZE; row++) {
    for (let col = 0; col < MAP_SIZE; col++) {
      tiles[hexKey({ q: col, r: row })] = 'Plains';
    }
  }

  paintBlob(tiles, { q: 8, r: 8 }, 'Mountain', 2, rng, 0.65);
  paintBlob(tiles, { q: 7, r: 5 }, 'Mountain', 2, rng, 0.55);
  paintBlob(tiles, { q: 9, r: 11 }, 'Mountain', 1, rng, 0.7);

  for (let i = 0; i < 6; i++) {
    paintBlob(tiles, randomCoord(rng, 4, 11), 'DeepWater', rng.nextInt(1, 2), rng, 0.45);
  }

  for (const key of Object.keys(tiles)) {
    if (tiles[key] !== 'DeepWater') continue;
    const [q, r] = key.split(',').map(Number);
    for (let d = 0; d < 4; d++) {
      const n = offsetNeighbor({ q, r }, d);
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
