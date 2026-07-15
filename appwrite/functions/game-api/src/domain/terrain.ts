export type TerrainType =
  | 'Plains'
  | 'Forest'
  | 'ShallowWater'
  | 'DeepWater'
  | 'Mountain'
  | 'Hill';

export type TileMap = Record<string, TerrainType>;

export function isPassable(terrain: TerrainType): boolean {
  return terrain !== 'DeepWater' && terrain !== 'Mountain';
}

export function getMovementCost(terrain: TerrainType): number {
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

export function getDefenseMultiplier(terrain: TerrainType): number {
  switch (terrain) {
    case 'Forest':
      return 1.2;
    case 'ShallowWater':
      return 0.8;
    default:
      return 1;
  }
}

export function concealsUnits(terrain: TerrainType): boolean {
  return terrain === 'Forest';
}

export function getTerrain(tiles: TileMap, q: number, r: number): TerrainType {
  return tiles[`${q},${r}`] ?? 'Plains';
}
