import type { GameStateDto, TileDto } from '../types/game';
import { generateTilesForGame, MAP_SIZE } from './proceduralMap';

type RawGameState = GameStateDto & { Tiles?: TileDto[] };

function hasTerrainVariety(tiles: TileDto[]): boolean {
  if (tiles.length === 0) return false;
  const terrains = new Set(tiles.map((t) => t.terrain));
  return terrains.size > 1;
}

/** Ensure tile data is present and each battle has a procedural map. */
export function normalizeGameState(state: GameStateDto): GameStateDto {
  const raw = state as RawGameState;
  let tiles = state.tiles ?? raw.Tiles;

  const needsGeneration =
    !tiles?.length ||
    !hasTerrainVariety(tiles) ||
    state.gridWidth !== MAP_SIZE ||
    state.gridHeight !== MAP_SIZE;

  if (needsGeneration && state.gameId) {
    tiles = generateTilesForGame(state.gameId);
  }

  return {
    ...state,
    gridWidth: MAP_SIZE,
    gridHeight: MAP_SIZE,
    tiles: tiles ?? [],
  };
}
