export type TerrainType =
  | 'Plains'
  | 'Forest'
  | 'ShallowWater'
  | 'DeepWater'
  | 'Mountain'
  | 'Hill';

export interface TileDto {
  q: number;
  r: number;
  terrain: string;
}

export interface GameStateDto {
  gameId: string;
  mode: string;
  gridWidth: number;
  gridHeight: number;
  tiles?: TileDto[];
  currentPlayerId: number;
  turnNumber: number;
  phase: string;
  winnerId: number | null;
  aiPlayerId: number;
  brigades: BrigadeDto[];
  eventLog: GameEventDto[];
  connectedPlayers: number[];
}

export interface BrigadeDto {
  id: string;
  playerId: number;
  unitType: string;
  q: number;
  r: number;
  strength: number;
  maxStrength: number;
  baseDefense: number;
  experience: number;
  upgrades: string[];
  statusEffects: string[];
  hasMoved: boolean;
  hasUsedAbility: boolean;
  forfeitsActions: boolean;
  usedWeaponIds: string[];
  weapons: WeaponDto[];
  abilities: AbilityDto[];
  /** Max movement points per turn for this unit type. */
  movementRange: number;
  movementPointsRemaining: number;
  visionRange: number;
  revealedFromForest?: boolean;
  currentAccuracy: number;
}

export interface WeaponDto {
  id: string;
  name: string;
  range: number;
  baseDamage: number;
  category: string;
}

export interface AbilityDto {
  id: string;
  name: string;
  type: string;
  description: string;
}

export interface GameEventDto {
  type: string;
  message: string;
  turnNumber: number;
  targetQ?: number | null;
  targetR?: number | null;
  damage?: number | null;
  hit?: boolean | null;
}

export interface GameCommandDto {
  type: 'Move' | 'UseWeapon' | 'UseAbility' | 'EndTurn';
  playerId: number;
  brigadeId?: string;
  targetQ?: number;
  targetR?: number;
  targetCoord?: { q: number; r: number };
  weaponId?: string;
  abilityId?: string;
}

export type GameMode = 'Hotseat' | 'VsAi' | 'Multiplayer';

export type ActionMode =
  | { kind: 'none' }
  | { kind: 'move'; brigadeId: string }
  | { kind: 'weapon'; brigadeId: string; weaponId: string; range: number }
  | { kind: 'ability'; brigadeId: string; abilityId: string };

export const PLAYER_COLORS = ['#4a90d9', '#d94a4a'] as const;

export const UNIT_LABELS: Record<string, string> = {
  Scout: 'SCT',
  Infantry: 'INF',
  Tank: 'TNK',
  Artillery: 'ART',
  AntiTank: 'ATK',
};

export const TERRAIN_COLORS: Record<string, string> = {
  Plains: '#4a7c59',
  Forest: '#2d5a3d',
  ShallowWater: '#4a9ec4',
  DeepWater: '#1a4a6e',
  Mountain: '#5c5c5c',
  Hill: '#8b7355',
};
