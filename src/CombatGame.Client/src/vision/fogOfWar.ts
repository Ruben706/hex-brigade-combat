import { hexDistance, withinRange, type HexCoord } from '../render/HexRenderer';
import type { BrigadeDto, TileDto } from '../types/game';
import { generateTilesForGame } from '../map/proceduralMap';
import { eachOffsetHex, isOnOffsetGridCoord } from '../map/hexOffset';

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

export function buildTerrainMap(
  tiles: TileDto[] | undefined,
  gridWidth: number,
  gridHeight: number,
  gameId?: string,
): Map<string, string> {
  const map = new Map<string, string>();
  const source = tiles?.length ? tiles : gameId ? generateTilesForGame(gameId) : [];

  for (const tile of source) {
    map.set(hexKey(tile.q, tile.r), tile.terrain);
  }

  if (map.size > 0) {
    return map;
  }

  eachOffsetHex(gridWidth, gridHeight, (_col, _row, hex) => {
    map.set(hexKey(hex.q, hex.r), 'Plains');
  });
  return map;
}

function isHexOnGrid(hex: HexCoord, gridWidth: number, gridHeight: number): boolean {
  return isOnOffsetGridCoord(hex, gridWidth, gridHeight);
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
      if (isHexOnGrid(hex, gridWidth, gridHeight)) {
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
