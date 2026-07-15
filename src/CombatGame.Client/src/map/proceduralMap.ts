import type { TileDto } from '../types/game';

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
    return min + Math.floor(this.next() * (max - min));
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

function isInSpawnZone(coord: HexCoord): boolean {
  return (coord.q <= 2 || coord.q >= MAP_SIZE - 3) && coord.r >= 4 && coord.r <= 12;
}

function clearRect(tiles: TileMap, qMin: number, qMax: number, rMin: number, rMax: number): void {
  for (let r = rMin; r <= rMax && r < MAP_SIZE; r++) {
    for (let q = qMin; q <= qMax && q < MAP_SIZE; q++) {
      tiles[hexKey({ q, r })] = 'Plains';
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
    if (hex.q < 0 || hex.r < 0 || hex.q >= MAP_SIZE || hex.r >= MAP_SIZE) continue;
    if (isInSpawnZone(hex)) continue;

    const dist = Math.max(
      Math.abs(hex.q - center.q),
      Math.abs(hex.r - center.r),
      Math.abs(hex.q + hex.r - center.q - center.r),
    );
    if (dist !== 0 && rng.next() >= density) continue;

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

/** Same seed algorithm as the Appwrite game-api domain. */
export function hashGameId(gameId: string): number {
  return gameId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

export function generateMap(seed: number): TileMap {
  const rng = new SeededRng(seed);
  const tiles: TileMap = {};

  for (let r = 0; r < MAP_SIZE; r++) {
    for (let q = 0; q < MAP_SIZE; q++) {
      tiles[hexKey({ q, r })] = 'Plains';
    }
  }

  paintBlob(tiles, { q: 8, r: 8 }, 'Mountain', 2, rng, 0.65);
  paintBlob(tiles, { q: 7, r: 5 }, 'Mountain', 2, rng, 0.55);
  paintBlob(tiles, { q: 9, r: 11 }, 'Mountain', 1, rng, 0.7);

  for (let i = 0; i < 6; i++) {
    paintBlob(
      tiles,
      { q: rng.nextInt(4, 12), r: rng.nextInt(4, 12) },
      'DeepWater',
      rng.nextInt(1, 3),
      rng,
      0.45,
    );
  }

  for (let r = 0; r < MAP_SIZE; r++) {
    for (let q = 0; q < MAP_SIZE; q++) {
      const key = hexKey({ q, r });
      if (tiles[key] !== 'DeepWater') continue;

      const dirs = [
        [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
      ] as const;
      for (const [dq, dr] of dirs) {
        const nq = q + dq;
        const nr = r + dr;
        if (nq < 0 || nr < 0 || nq >= MAP_SIZE || nr >= MAP_SIZE) continue;
        const nKey = hexKey({ q: nq, r: nr });
        if (tiles[nKey] === 'Plains' && rng.next() < 0.55) {
          tiles[nKey] = 'ShallowWater';
        }
      }
    }
  }

  for (let i = 0; i < 14; i++) {
    paintBlob(
      tiles,
      { q: rng.nextInt(0, MAP_SIZE), r: rng.nextInt(0, MAP_SIZE) },
      'Forest',
      rng.nextInt(1, 3),
      rng,
      0.5,
    );
  }

  for (let i = 0; i < 10; i++) {
    paintBlob(
      tiles,
      { q: rng.nextInt(0, MAP_SIZE), r: rng.nextInt(0, MAP_SIZE) },
      'Hill',
      rng.nextInt(1, 2),
      rng,
      0.55,
    );
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
