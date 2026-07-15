import { hexDistance, withinRange, type HexCoord } from '../render/HexRenderer';
import type { BrigadeDto, TileDto } from '../types/game';

const VISION_BY_UNIT: Record<string, number> = {
  Scout: 5,
  Infantry: 4,
  AntiTank: 3,
  Tank: 2,
  Artillery: 1,
};

export function getVisionRange(unitType: string): number {
  return VISION_BY_UNIT[unitType] ?? 2;
}

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function buildTerrainMap(tiles: TileDto[] | undefined, gridWidth: number, gridHeight: number): Map<string, string> {
  const map = new Map<string, string>();
  if (tiles?.length) {
    for (const tile of tiles) {
      map.set(hexKey(tile.q, tile.r), tile.terrain);
    }
    return map;
  }

  for (let r = 0; r < gridHeight; r++) {
    for (let q = 0; q < gridWidth; q++) {
      map.set(hexKey(q, r), 'Plains');
    }
  }
  return map;
}

export function computeVisibleHexes(
  brigades: BrigadeDto[],
  viewingPlayerId: number,
  gridWidth: number,
  gridHeight: number,
): Set<string> {
  const visible = new Set<string>();

  for (const brigade of brigades.filter((b) => b.playerId === viewingPlayerId)) {
    const range = brigade.visionRange ?? getVisionRange(brigade.unitType);
    for (const hex of withinRange(brigade.q, brigade.r, range)) {
      if (hex.q >= 0 && hex.r >= 0 && hex.q < gridWidth && hex.r < gridHeight) {
        visible.add(hexKey(hex.q, hex.r));
      }
    }
  }

  return visible;
}

export function isHexVisible(visibleHexes: Set<string>, hex: HexCoord): boolean {
  return visibleHexes.has(hexKey(hex.q, hex.r));
}

export function isBrigadeVisible(
  brigade: BrigadeDto,
  viewingPlayerId: number,
  visibleHexes: Set<string>,
  allBrigades: BrigadeDto[],
  terrain: Map<string, string>,
): boolean {
  if (brigade.playerId === viewingPlayerId) return true;
  if (!isHexVisible(visibleHexes, { q: brigade.q, r: brigade.r })) return false;

  const tileTerrain = terrain.get(hexKey(brigade.q, brigade.r)) ?? 'Plains';
  if (tileTerrain !== 'Forest') return true;
  if (brigade.revealedFromForest) return true;

  const friendlies = allBrigades.filter((b) => b.playerId === viewingPlayerId);
  return friendlies.some(
    (friendly) => hexDistance({ q: friendly.q, r: friendly.r }, { q: brigade.q, r: brigade.r }) === 1,
  );
}
