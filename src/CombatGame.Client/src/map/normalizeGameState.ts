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

const PRE_BATTLE_PHASES = new Set(['Lobby', 'Loadout', 'Deployment']);

/** Ensure tile data is present and each battle has a procedural map. */
export function normalizeGameState(state: GameStateDto): GameStateDto {
  const raw = state as RawGameState;
  let tiles = state.tiles ?? raw.Tiles ?? [];

  const width = state.gridWidth || MAP_SIZE;
  const height = state.gridHeight || MAP_SIZE;
  const tileMap = tilesToMap(tiles);
  const hasCompleteTiles = hasCompleteOffsetTileSet(tileMap, width, height);

  if (PRE_BATTLE_PHASES.has(state.phase) && tiles.length > 0 && hasCompleteTiles) {
    return {
      ...state,
      gridWidth: width,
      gridHeight: height,
      tiles,
    };
  }

  const needsGeneration =
    tiles.length === 0 ||
    width !== MAP_SIZE ||
    height !== MAP_SIZE ||
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
