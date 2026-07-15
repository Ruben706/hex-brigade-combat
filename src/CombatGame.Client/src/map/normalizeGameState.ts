import type { GameStateDto, TileDto } from '../types/game';
import { generateTilesForGame, MAP_SIZE } from './proceduralMap';
import { hasCompleteOffsetTileSet } from './hexOffset';

type RawGameState = GameStateDto & { Tiles?: TileDto[] };

function tilesToMap(tiles: TileDto[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const tile of tiles) {
    map[`${tile.q},${tile.r}`] = tile.terrain;
  }
  return map;
}

/** Ensure tile data is present and each battle has a procedural map. */
export function normalizeGameState(state: GameStateDto): GameStateDto {
  const raw = state as RawGameState;
  let tiles = state.tiles ?? raw.Tiles ?? [];

  const tileMap = tilesToMap(tiles);
  const needsGeneration =
    tiles.length === 0 ||
    state.gridWidth !== MAP_SIZE ||
    state.gridHeight !== MAP_SIZE ||
    !hasCompleteOffsetTileSet(tileMap, MAP_SIZE, MAP_SIZE);

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
