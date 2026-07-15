import { withinRange, type HexCoord } from '../render/HexRenderer';
import type { BrigadeDto } from '../types/game';

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
): boolean {
  if (brigade.playerId === viewingPlayerId) return true;
  return isHexVisible(visibleHexes, { q: brigade.q, r: brigade.r });
}
