// Port of CombatGame.Domain — authoritative game rules for Appwrite Functions
import { randomUUID } from 'node:crypto';
import { generateMap, MAP_SIZE } from './mapGenerator.js';
import {
  hasCompleteOffsetTileSet,
  isOnOffsetGrid,
  isTilesAdjacent,
  manhattanDistance,
  offsetDistance,
  offsetNeighbor,
  orthogonalNeighbors,
} from './hexOffset.js';
import {
  type TileMap,
  type TerrainType,
  concealsUnits,
  getDefenseMultiplier as getTerrainDefenseMultiplier,
  getMovementCost,
  getTerrain,
  isPassable,
} from './terrain.js';

export type UnitType = 'Scout' | 'Infantry' | 'Tank' | 'Artillery' | 'AntiTank';
export type DamageCategory = 'SmallArms' | 'HighExplosive' | 'AntiArmor';
export type ArmorClass = 'Soft' | 'Medium' | 'Heavy';
export type GameMode = 'Hotseat' | 'VsAi' | 'Multiplayer';
export type GamePhase = 'InProgress' | 'Victory';
export type CommandType = 'Move' | 'UseWeapon' | 'UseAbility' | 'EndTurn';

export interface HexCoord {
  q: number;
  r: number;
}

export interface Weapon {
  id: string;
  name: string;
  range: number;
  baseDamage: number;
  category: DamageCategory;
}

export interface Ability {
  id: string;
  name: string;
  type: string;
  description: string;
}

export interface StatusEffect {
  type: string;
  remainingTurns: number;
}

export interface BrigadeTurnState {
  hasMoved: boolean;
  hasUsedAbility: boolean;
  forfeitsActions: boolean;
  movementPointsRemaining: number;
  revealedFromForest: boolean;
  usedWeaponIds: string[];
}

export interface Brigade {
  id: string;
  playerId: number;
  unitType: UnitType;
  position: HexCoord;
  maxStrength: number;
  strength: number;
  baseDefense: number;
  experience: number;
  upgrades: string[];
  statusEffects: StatusEffect[];
  turnState: BrigadeTurnState;
  movedLastTurn: boolean;
}

export interface GameEvent {
  type: string;
  message: string;
  turnNumber: number;
  targetQ?: number;
  targetR?: number;
  damage?: number;
  hit?: boolean;
}

export interface InternalGameState {
  gameId: string;
  mode: GameMode;
  gridWidth: number;
  gridHeight: number;
  tiles: TileMap;
  brigades: Brigade[];
  currentPlayerId: number;
  turnNumber: number;
  phase: GamePhase;
  winnerId: number | null;
  eventLog: GameEvent[];
  connectedPlayers: number[];
  aiPlayerId: number;
  rngSeed: number;
}

export interface GameCommand {
  type: CommandType;
  playerId: number;
  brigadeId?: string;
  targetCoord?: HexCoord;
  weaponId?: string;
  abilityId?: string;
}

export interface CommandResult {
  success: boolean;
  error?: string;
}

// --- DTOs (client-facing) ---

export interface GameStateDto {
  gameId: string;
  mode: string;
  gridWidth: number;
  gridHeight: number;
  tiles: TileDto[];
  currentPlayerId: number;
  turnNumber: number;
  phase: string;
  winnerId: number | null;
  aiPlayerId: number;
  brigades: BrigadeDto[];
  eventLog: GameEvent[];
  connectedPlayers: number[];
}

export interface TileDto {
  q: number;
  r: number;
  terrain: string;
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
  weapons: Weapon[];
  abilities: Ability[];
  movementRange: number;
  movementPointsRemaining: number;
  visionRange: number;
  revealedFromForest: boolean;
  currentAccuracy: number;
}

export interface GameCommandDto {
  type: CommandType;
  playerId: number;
  brigadeId?: string;
  targetQ?: number;
  targetR?: number;
  targetCoord?: HexCoord;
  weaponId?: string;
  abilityId?: string;
}

function readCoordField(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return undefined;
}

function parseTargetCoord(dto: GameCommandDto): HexCoord | undefined {
  const raw = dto as GameCommandDto & Record<string, unknown>;
  if (dto.targetCoord) {
    const q = Number(dto.targetCoord.q);
    const r = Number(dto.targetCoord.r);
    if (Number.isFinite(q) && Number.isFinite(r)) return { q: Math.trunc(q), r: Math.trunc(r) };
  }

  const q = readCoordField(raw, 'targetQ', 'TargetQ');
  const r = readCoordField(raw, 'targetR', 'TargetR');
  if (q == null || r == null) return undefined;
  return { q, r };
}

export function commandFromDto(dto: GameCommandDto): GameCommand {
  return {
    type: dto.type,
    playerId: dto.playerId,
    brigadeId: dto.brigadeId,
    targetCoord: parseTargetCoord(dto),
    weaponId: dto.weaponId,
    abilityId: dto.abilityId,
  };
}

export function syncGridDimensions(state: InternalGameState): void {
  state.gridWidth = MAP_SIZE;
  state.gridHeight = MAP_SIZE;
}

// --- Tile grid (q = column, r = row) ---

export function hexKey(c: HexCoord): string {
  return `${c.q},${c.r}`;
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  return offsetDistance(a, b);
}

export function hexNeighbor(c: HexCoord, dir: number): HexCoord {
  return offsetNeighbor(c, dir);
}

class SeededRng {
  private state: number;
  constructor(seed: number) { this.state = seed; }
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
}

// --- Unit catalog ---

const UNIT_DEFS: Record<UnitType, {
  maxStrength: number;
  baseDefense: number;
  armorClass: ArmorClass;
  weapons: Weapon[];
  abilities: Ability[];
  upgradeXp: Record<string, number>;
}> = {
  Scout: {
    maxStrength: 60, baseDefense: 6, armorClass: 'Soft',
    weapons: [{ id: 'carbine', name: 'Carbine', range: 1, baseDamage: 5, category: 'SmallArms' }],
    abilities: [],
    upgradeXp: { Camouflage: 40 },
  },
  Infantry: {
    maxStrength: 100, baseDefense: 10, armorClass: 'Soft',
    weapons: [{ id: 'rifle', name: 'Rifle', range: 1, baseDamage: 8, category: 'SmallArms' }],
    abilities: [{ id: 'dig_in', name: 'Dig In', type: 'DigIn', description: 'Fortify position (+50% defense until moving)' }],
    upgradeXp: { AntiTankRounds: 50, VeteranDefense: 80 },
  },
  Tank: {
    maxStrength: 150, baseDefense: 25, armorClass: 'Heavy',
    weapons: [
      { id: 'main_gun', name: 'Main Gun', range: 3, baseDamage: 25, category: 'AntiArmor' },
      { id: 'machine_gun', name: 'Machine Gun', range: 2, baseDamage: 6, category: 'SmallArms' },
    ],
    abilities: [],
    upgradeXp: { ReinforcedArmor: 60, ImprovedGun: 90 },
  },
  Artillery: {
    maxStrength: 80, baseDefense: 5, armorClass: 'Soft',
    weapons: [{ id: 'howitzer', name: 'Howitzer', range: 5, baseDamage: 30, category: 'HighExplosive' }],
    abilities: [{ id: 'setup', name: 'Setup', type: 'Setup', description: 'Prepare artillery for firing (forfeits move and attack this turn)' }],
    upgradeXp: { RapidDeployment: 70, ExtendedRange: 100 },
  },
  AntiTank: {
    maxStrength: 90, baseDefense: 12, armorClass: 'Medium',
    weapons: [{ id: 'at_gun', name: 'AT Gun', range: 3, baseDamage: 22, category: 'AntiArmor' }],
    abilities: [{ id: 'ambush', name: 'Ambush', type: 'Ambush', description: 'Hold position (+30% defense, +20% AT damage this turn)' }],
    upgradeXp: { HEATRounds: 55, Camouflage: 75 },
  },
};

function getArmorClass(b: Brigade): ArmorClass {
  return UNIT_DEFS[b.unitType].armorClass;
}

function hasStatus(b: Brigade, type: string): boolean {
  return b.statusEffects.some((s) => s.type === type);
}

function removeStatus(b: Brigade, type: string): void {
  b.statusEffects = b.statusEffects.filter((s) => s.type !== type);
}

export function createBrigade(type: UnitType, playerId: number, position: HexCoord): Brigade {
  const def = UNIT_DEFS[type];
  return {
    id: randomUUID(),
    playerId,
    unitType: type,
    position,
    maxStrength: def.maxStrength,
    strength: def.maxStrength,
    baseDefense: def.baseDefense,
    experience: 0,
    upgrades: [],
    statusEffects: [],
    turnState: {
      hasMoved: false,
      hasUsedAbility: false,
      forfeitsActions: false,
      movementPointsRemaining: getMovementPointsForUnit(type),
      revealedFromForest: false,
      usedWeaponIds: [],
    },
    movedLastTurn: false,
  };
}

export function getWeapons(b: Brigade): Weapon[] {
  const weapons = UNIT_DEFS[b.unitType].weapons.map((w) => ({ ...w }));
  if (b.unitType === 'Infantry' && b.upgrades.includes('AntiTankRounds')) {
    weapons.push({ id: 'at_rifle', name: 'AT Rifle', range: 2, baseDamage: 12, category: 'AntiArmor' });
  }
  if (b.unitType === 'Tank' && b.upgrades.includes('ImprovedGun')) {
    const gun = weapons.find((w) => w.id === 'main_gun');
    if (gun) gun.baseDamage = Math.round(gun.baseDamage * 1.2);
  }
  if (b.unitType === 'Artillery' && b.upgrades.includes('ExtendedRange')) {
    const howitzer = weapons.find((w) => w.id === 'howitzer');
    if (howitzer) howitzer.range += 1;
  }
  return weapons;
}

export function getAbilities(b: Brigade): Ability[] {
  return [...UNIT_DEFS[b.unitType].abilities];
}

function getAvailableUpgrades(b: Brigade): string[] {
  const costs = UNIT_DEFS[b.unitType].upgradeXp;
  return Object.entries(costs)
    .filter(([u, cost]) => !b.upgrades.includes(u) && b.experience >= cost)
    .map(([u]) => u);
}

export function getMovementPointsForUnit(unitType: UnitType): number {
  switch (unitType) {
    case 'Tank': return 4;
    case 'Scout': return 3;
    case 'Artillery': return 1;
    case 'Infantry':
    case 'AntiTank':
      return 2;
    default:
      return 1;
  }
}

export function getVisionRangeForUnit(unitType: UnitType): number {
  switch (unitType) {
    case 'Scout': return 5;
    case 'Infantry': return 4;
    case 'AntiTank': return 3;
    case 'Tank': return 2;
    case 'Artillery': return 1;
    default:
      return 2;
  }
}

export function getVisionRange(b: Brigade, tiles: TileMap): number {
  let range = getVisionRangeForUnit(b.unitType);
  if (getTerrain(tiles, b.position.q, b.position.r) === 'Hill') {
    range += 1;
  }
  return range;
}

export function getMovementPoints(b: Brigade): number {
  return getMovementPointsForUnit(b.unitType);
}

function resetMovementPoints(b: Brigade): void {
  b.turnState.movementPointsRemaining = getMovementPoints(b);
}

/** Dijkstra over terrain costs: cheapest path cost to every hex within range. */
function computePathCosts(
  start: HexCoord,
  range: number,
  gridW: number,
  gridH: number,
  occupied: Set<string>,
  tiles: TileMap,
): Map<string, number> {
  const costs = new Map<string, number>([[hexKey(start), 0]]);
  const coords = new Map<string, HexCoord>([[hexKey(start), start]]);
  // Small frontier (16x16 map) — linear-scan extraction is fine.
  const frontier = new Set<string>([hexKey(start)]);

  while (frontier.size > 0) {
    let currentKey = '';
    let currentCost = Infinity;
    for (const key of frontier) {
      const c = costs.get(key)!;
      if (c < currentCost) {
        currentCost = c;
        currentKey = key;
      }
    }
    frontier.delete(currentKey);
    const current = coords.get(currentKey)!;

    for (let i = 0; i < 4; i++) {
      const n = hexNeighbor(current, i);
      if (!isOnOffsetGrid(n.q, n.r, gridW, gridH)) continue;
      const key = hexKey(n);
      if (occupied.has(key)) continue;

      const terrain = getTerrain(tiles, n.q, n.r);
      if (!isPassable(terrain)) continue;

      const next = currentCost + getMovementCost(terrain);
      if (next > range) continue;

      const known = costs.get(key);
      if (known !== undefined && known <= next) continue;
      costs.set(key, next);
      coords.set(key, n);
      frontier.add(key);
    }
  }

  costs.delete(hexKey(start));
  return costs;
}

/**
 * A passable, unoccupied hex directly adjacent to start. On a brigade's first
 * move of the turn such a step is always allowed regardless of cost
 * (deep water / mountains stay impassable).
 */
function isFreeAdjacentStep(
  start: HexCoord,
  target: HexCoord,
  gridW: number,
  gridH: number,
  occupied: Set<string>,
  tiles: TileMap,
): boolean {
  return (
    manhattanDistance(start, target) === 1 &&
    isOnOffsetGrid(target.q, target.r, gridW, gridH) &&
    !occupied.has(hexKey(target)) &&
    isPassable(getTerrain(tiles, target.q, target.r))
  );
}

function getReachableHexes(
  start: HexCoord,
  range: number,
  gridW: number,
  gridH: number,
  occupied: Set<string>,
  tiles: TileMap,
  isFirstMove = false,
): HexCoord[] {
  const costs = computePathCosts(start, range, gridW, gridH, occupied, tiles);
  const result = new Map<string, HexCoord>();
  for (const key of costs.keys()) {
    const [q, r] = key.split(',').map(Number);
    result.set(key, { q, r });
  }

  if (isFirstMove) {
    for (const n of orthogonalNeighbors(start)) {
      if (isFreeAdjacentStep(start, n, gridW, gridH, occupied, tiles)) {
        result.set(hexKey(n), n);
      }
    }
  }

  return [...result.values()];
}

function tryGetMovementCost(
  start: HexCoord,
  target: HexCoord,
  range: number,
  gridW: number,
  gridH: number,
  occupied: Set<string>,
  tiles: TileMap,
  isFirstMove = false,
): number | null {
  if (start.q === target.q && start.r === target.r) return null;

  // A direct adjacent step is always the cheapest way to an adjacent hex.
  if (isFirstMove && isFreeAdjacentStep(start, target, gridW, gridH, occupied, tiles)) {
    return getMovementCost(getTerrain(tiles, target.q, target.r));
  }

  const costs = computePathCosts(start, range, gridW, gridH, occupied, tiles);
  return costs.get(hexKey(target)) ?? null;
}

// --- Combat ---

const EFFECTIVENESS: Record<string, number> = {
  'SmallArms,Soft': 1.0, 'SmallArms,Medium': 0.6, 'SmallArms,Heavy': 0.15,
  'HighExplosive,Soft': 1.2, 'HighExplosive,Medium': 0.8, 'HighExplosive,Heavy': 0.5,
  'AntiArmor,Soft': 0.7, 'AntiArmor,Medium': 1.0, 'AntiArmor,Heavy': 1.5,
};

function getEffectiveness(cat: DamageCategory, armor: ArmorClass): number {
  return EFFECTIVENESS[`${cat},${armor}`] ?? 1;
}

export function getAccuracy(b: Brigade): number {
  return b.turnState.hasMoved ? 0.5 : 1.0;
}

function getDefenseMultiplier(b: Brigade, tiles: TileMap): number {
  let m = 1 + b.baseDefense / 100;
  if (hasStatus(b, 'Fortified')) m *= 1.5;
  if (hasStatus(b, 'Ambush')) m *= 1.3;
  if (b.upgrades.includes('VeteranDefense')) m *= 1.2;
  if (b.upgrades.includes('ReinforcedArmor')) m *= 1.3;
  if (b.upgrades.includes('Camouflage') && !b.movedLastTurn) m *= 1.15;
  m *= getTerrainDefenseMultiplier(getTerrain(tiles, b.position.q, b.position.r));
  return m;
}

function getAttackMultiplier(attacker: Brigade, weapon: Weapon): number {
  let m = 1;
  if (hasStatus(attacker, 'Ambush') && weapon.category === 'AntiArmor') m *= 1.2;
  if (attacker.upgrades.includes('HEATRounds') && weapon.category === 'AntiArmor' && attacker.unitType === 'AntiTank') m *= 1.25;
  return m;
}

function calculateDamage(weapon: Weapon, attacker: Brigade, defender: Brigade, tiles: TileMap): number {
  const eff = getEffectiveness(weapon.category, getArmorClass(defender));
  const raw = weapon.baseDamage * eff * getAttackMultiplier(attacker, weapon);
  return Math.max(1, Math.round(raw / getDefenseMultiplier(defender, tiles)));
}

function resolveAttack(
  weapon: Weapon,
  attacker: Brigade,
  defender: Brigade,
  rng: SeededRng,
  tiles: TileMap,
): { hit: boolean; damage: number; accuracy: number } {
  const accuracy = getAccuracy(attacker);
  if (rng.next() > accuracy) return { hit: false, damage: 0, accuracy };
  return { hit: true, damage: calculateDamage(weapon, attacker, defender, tiles), accuracy };
}

// --- Game state helpers ---

function getBrigade(state: InternalGameState, id: string): Brigade | undefined {
  return state.brigades.find((b) => b.id === id);
}

function getBrigadeAt(state: InternalGameState, coord: HexCoord): Brigade | undefined {
  return state.brigades.find((b) => b.position.q === coord.q && b.position.r === coord.r);
}

function addEvent(state: InternalGameState, type: string, message: string, extra?: Partial<GameEvent>): void {
  state.eventLog.push({ type, message, turnNumber: state.turnNumber, ...extra });
  if (state.eventLog.length > 100) state.eventLog.shift();
}

function checkVictory(state: InternalGameState): void {
  const players = [...new Set(state.brigades.map((b) => b.playerId))];
  if (players.length <= 1 && state.brigades.length > 0) {
    state.phase = 'Victory';
    state.winnerId = players[0] ?? null;
    addEvent(state, 'GameOver', `Player ${state.winnerId} wins!`);
  } else if (state.brigades.length === 0) {
    state.phase = 'Victory';
    state.winnerId = null;
    addEvent(state, 'GameOver', 'Draw - all brigades destroyed.');
  }
}

function applyUpgrades(b: Brigade, state: InternalGameState): void {
  for (const u of getAvailableUpgrades(b)) {
    if (!b.upgrades.includes(u)) {
      b.upgrades.push(u);
      addEvent(state, 'UpgradeEarned', `${b.unitType} brigade earned upgrade: ${u}`);
    }
  }
}

function clearMovementStatuses(b: Brigade): void {
  removeStatus(b, 'Fortified');
  removeStatus(b, 'ArtilleryReady');
  removeStatus(b, 'ArtillerySettingUp');
}

function processBrigadeStatusTick(b: Brigade): void {
  if (hasStatus(b, 'ArtillerySettingUp')) {
    removeStatus(b, 'ArtillerySettingUp');
    b.statusEffects.push({ type: 'ArtilleryReady', remainingTurns: -1 });
  }
  for (const e of b.statusEffects.filter((s) => s.remainingTurns > 0)) e.remainingTurns--;
  b.statusEffects = b.statusEffects.filter((s) => s.remainingTurns !== 0);
}

function resetTurnStates(state: InternalGameState): void {
  for (const b of state.brigades) {
    b.turnState.hasMoved = false;
    b.turnState.hasUsedAbility = false;
    b.turnState.forfeitsActions = false;
    b.turnState.revealedFromForest = false;
    b.turnState.usedWeaponIds = [];
    resetMovementPoints(b);
  }
}

function endTurn(state: InternalGameState): void {
  for (const b of state.brigades.filter((br) => br.playerId === state.currentPlayerId)) {
    b.movedLastTurn = b.turnState.hasMoved;
  }
  for (const b of state.brigades) processBrigadeStatusTick(b);
  state.currentPlayerId = state.currentPlayerId === 0 ? 1 : 0;
  state.turnNumber++;
  resetTurnStates(state);
  addEvent(state, 'TurnEnded', `Player ${state.currentPlayerId}'s turn (Turn ${state.turnNumber}).`);
}

// --- Skirmish map ---

export function hashGameId(gameId: string): number {
  return gameId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

const PLAYER_SPAWNS: Record<number, HexCoord[]> = {
  0: [
    { q: 1, r: 7 },
    { q: 2, r: 8 },
    { q: 0, r: 6 },
    { q: 0, r: 9 },
    { q: 1, r: 10 },
  ],
  1: [
    { q: 14, r: 7 },
    { q: 13, r: 8 },
    { q: 15, r: 6 },
    { q: 15, r: 9 },
    { q: 14, r: 10 },
  ],
};

function migrateBrigadePositions(state: InternalGameState): void {
  const occupied = new Set<string>();

  for (const brigade of state.brigades) {
    const key = hexKey(brigade.position);
    if (isOnOffsetGrid(brigade.position.q, brigade.position.r, state.gridWidth, state.gridHeight) && !occupied.has(key)) {
      occupied.add(key);
      continue;
    }

    const spawns = PLAYER_SPAWNS[brigade.playerId] ?? PLAYER_SPAWNS[0]!;
    const open = spawns.find((spawn) => !occupied.has(hexKey(spawn))) ?? spawns[0]!;
    brigade.position = { q: open.q, r: open.r };
    occupied.add(hexKey(brigade.position));
  }
}

function syncOffsetTiles(state: InternalGameState, generated: TileMap): void {
  for (const [key, terrain] of Object.entries(generated)) {
    state.tiles[key] = terrain;
  }

  for (const key of Object.keys(state.tiles)) {
    const [q, r] = key.split(',').map(Number);
    if (!Number.isFinite(q) || !Number.isFinite(r) || !isOnOffsetGrid(q, r, state.gridWidth, state.gridHeight)) {
      delete state.tiles[key];
    }
  }
}

function coerceTileMap(tiles: unknown): TileMap {
  if (!tiles || typeof tiles !== 'object') return {};
  if (Array.isArray(tiles)) {
    const map: TileMap = {};
    for (const tile of tiles as Array<{ q?: number; r?: number; terrain?: string }>) {
      if (tile?.q === undefined || tile?.r === undefined || !tile.terrain) continue;
      map[`${tile.q},${tile.r}`] = tile.terrain as TerrainType;
    }
    return map;
  }
  return { ...(tiles as TileMap) };
}

/** Normalize persisted JSON (camelCase/PascalCase, tile array vs map). */
export function coerceInternalState(raw: Record<string, unknown>): InternalGameState {
  const record = raw as Record<string, unknown> & InternalGameState;
  const gameId = String(record.gameId ?? record['GameId'] ?? '');
  const readDim = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : MAP_SIZE;
  };
  const state: InternalGameState = {
    gameId,
    mode: (record.mode ?? record['Mode'] ?? 'Hotseat') as GameMode,
    gridWidth: readDim(record.gridWidth ?? record['GridWidth']),
    gridHeight: readDim(record.gridHeight ?? record['GridHeight']),
    tiles: coerceTileMap(record.tiles ?? record['Tiles']),
    brigades: Array.isArray(record.brigades ?? record['Brigades'])
      ? (record.brigades ?? record['Brigades']) as Brigade[]
      : [],
    currentPlayerId: Number(record.currentPlayerId ?? record['CurrentPlayerId'] ?? 0),
    turnNumber: Number(record.turnNumber ?? record['TurnNumber'] ?? 1),
    phase: (record.phase ?? record['Phase'] ?? 'InProgress') as GamePhase,
    winnerId: (record.winnerId ?? record['WinnerId'] ?? null) as number | null,
    eventLog: Array.isArray(record.eventLog ?? record['EventLog'])
      ? (record.eventLog ?? record['EventLog']) as GameEvent[]
      : [],
    connectedPlayers: Array.isArray(record.connectedPlayers ?? record['ConnectedPlayers'])
      ? (record.connectedPlayers ?? record['ConnectedPlayers']) as number[]
      : [],
    aiPlayerId: Number(record.aiPlayerId ?? record['AiPlayerId'] ?? -1),
    rngSeed: Number(record.rngSeed ?? record['RngSeed'] ?? hashGameId(gameId)),
  };

  for (const brigade of state.brigades) {
    const legacy = brigade as Brigade & { q?: number; r?: number };
    if (!brigade.position && legacy.q !== undefined && legacy.r !== undefined) {
      brigade.position = { q: legacy.q, r: legacy.r };
    }
  }

  return state;
}

/** Ensure a full odd-r offset map exists. Returns true when state was modified. */
export function ensureMapGenerated(state: InternalGameState): boolean {
  const seed = state.rngSeed || hashGameId(state.gameId);
  const generated = generateMap(seed);
  const before = JSON.stringify({
    gridWidth: state.gridWidth,
    gridHeight: state.gridHeight,
    tiles: state.tiles,
    brigades: state.brigades.map((b) => b.position),
  });

  const needsFullRegen =
    state.gridWidth !== MAP_SIZE ||
    state.gridHeight !== MAP_SIZE ||
    !hasCompleteOffsetTileSet(state.tiles, MAP_SIZE, MAP_SIZE);

  syncGridDimensions(state);
  state.rngSeed = seed;

  if (needsFullRegen) {
    state.tiles = { ...generated };
    migrateBrigadePositions(state);
  } else {
    syncOffsetTiles(state, generated);
  }

  const after = JSON.stringify({
    gridWidth: state.gridWidth,
    gridHeight: state.gridHeight,
    tiles: state.tiles,
    brigades: state.brigades.map((b) => b.position),
  });
  return before !== after;
}

export function createSkirmish(mode: GameMode): InternalGameState {
  const gameId = randomUUID();
  const rngSeed = hashGameId(gameId);
  const tiles = generateMap(rngSeed);
  const state: InternalGameState = {
    gameId,
    mode,
    gridWidth: MAP_SIZE,
    gridHeight: MAP_SIZE,
    tiles,
    brigades: [],
    currentPlayerId: 0,
    turnNumber: 1,
    phase: 'InProgress',
    winnerId: null,
    eventLog: [],
    connectedPlayers: [],
    aiPlayerId: mode === 'VsAi' ? 1 : -1,
    rngSeed,
  };

  const p0: Array<[UnitType, HexCoord]> = [
    ['Scout', { q: 1, r: 7 }], ['Infantry', { q: 2, r: 8 }],
    ['Tank', { q: 0, r: 6 }], ['Artillery', { q: 0, r: 9 }], ['AntiTank', { q: 1, r: 10 }],
  ];
  const p1: Array<[UnitType, HexCoord]> = [
    ['Scout', { q: 14, r: 7 }], ['Infantry', { q: 13, r: 8 }],
    ['Tank', { q: 15, r: 6 }], ['Artillery', { q: 15, r: 9 }], ['AntiTank', { q: 14, r: 10 }],
  ];
  for (const [t, pos] of p0) state.brigades.push(createBrigade(t, 0, pos));
  for (const [t, pos] of p1) state.brigades.push(createBrigade(t, 1, pos));
  addEvent(state, 'TurnEnded', 'Battle begins! Player 0\'s turn.');
  return state;
}

// --- Game engine ---

export function executeCommand(state: InternalGameState, command: GameCommand): CommandResult {
  ensureMapGenerated(state);
  if (state.phase === 'Victory') return { success: false, error: 'Game is over.' };
  if (command.playerId !== state.currentPlayerId) return { success: false, error: 'Not your turn.' };

  const rng = new SeededRng(state.rngSeed + state.turnNumber * 1000 + state.eventLog.length);

  switch (command.type) {
    case 'Move': return execMove(state, command);
    case 'UseWeapon': return execWeapon(state, command, rng);
    case 'UseAbility': return execAbility(state, command);
    case 'EndTurn': endTurn(state); return { success: true };
    default: return { success: false, error: 'Unknown command.' };
  }
}

function execMove(state: InternalGameState, cmd: GameCommand): CommandResult {
  const b = cmd.brigadeId ? getBrigade(state, cmd.brigadeId) : undefined;
  if (!b || b.playerId !== cmd.playerId) return { success: false, error: 'Brigade not found.' };
  if (b.turnState.movementPointsRemaining <= 0) return { success: false, error: 'No movement points remaining.' };
  if (b.turnState.forfeitsActions) return { success: false, error: 'Brigade cannot act this turn.' };
  if (b.turnState.usedWeaponIds.length > 0) return { success: false, error: 'Cannot move after firing.' };
  if (!cmd.targetCoord) return { success: false, error: 'Target coordinate required.' };

  syncGridDimensions(state);
  const t = cmd.targetCoord;
  if (!isOnOffsetGrid(t.q, t.r, MAP_SIZE, MAP_SIZE)) {
    return { success: false, error: 'Target is outside the map.' };
  }

  const occupied = new Set(state.brigades.filter((br) => br.id !== b.id).map((br) => hexKey(br.position)));
  const moveCost = tryGetMovementCost(
    b.position,
    t,
    b.turnState.movementPointsRemaining,
    MAP_SIZE,
    MAP_SIZE,
    occupied,
    state.tiles,
    !b.turnState.hasMoved,
  );
  if (moveCost === null) {
    return { success: false, error: 'Target is out of movement range.' };
  }
  if (getBrigadeAt(state, t)) return { success: false, error: 'Target hex is occupied.' };

  clearMovementStatuses(b);
  b.position = t;
  b.turnState.hasMoved = true;
  b.turnState.movementPointsRemaining = Math.max(0, b.turnState.movementPointsRemaining - moveCost);
  addEvent(state, 'Moved', `Player ${b.playerId}'s ${b.unitType} moved to (${t.q},${t.r}).`);
  return { success: true };
}

function execWeapon(state: InternalGameState, cmd: GameCommand, rng: SeededRng): CommandResult {
  const b = cmd.brigadeId ? getBrigade(state, cmd.brigadeId) : undefined;
  if (!b || b.playerId !== cmd.playerId) return { success: false, error: 'Brigade not found.' };
  if (b.turnState.forfeitsActions) return { success: false, error: 'Brigade cannot attack this turn.' };
  if (!cmd.weaponId) return { success: false, error: 'Weapon id required.' };
  if (b.turnState.usedWeaponIds.includes(cmd.weaponId)) return { success: false, error: 'Weapon already used this turn.' };

  const weapon = getWeapons(b).find((w) => w.id === cmd.weaponId);
  if (!weapon) return { success: false, error: 'Weapon not available.' };
  if (b.unitType === 'Artillery' && !hasStatus(b, 'ArtilleryReady')) {
    return { success: false, error: 'Artillery must be set up before firing.' };
  }
  if (!cmd.targetCoord) return { success: false, error: 'Target coordinate required.' };

  if (hexDistance(b.position, cmd.targetCoord) > weapon.range) {
    return { success: false, error: 'Target out of range.' };
  }

  const target = getBrigadeAt(state, cmd.targetCoord);
  if (!target || target.playerId === b.playerId) return { success: false, error: 'Must target an enemy brigade.' };

  const attack = resolveAttack(weapon, b, target, rng, state.tiles);
  b.turnState.usedWeaponIds.push(weapon.id);

  if (concealsUnits(getTerrain(state.tiles, b.position.q, b.position.r))) {
    b.turnState.revealedFromForest = true;
  }

  if (!attack.hit) {
    addEvent(state, 'Missed',
      `${b.unitType} fired ${weapon.name} at ${target.unitType} but missed (${Math.round(attack.accuracy * 100)}% accuracy).`,
      { targetQ: target.position.q, targetR: target.position.r, damage: 0, hit: false });
    return { success: true };
  }

  target.strength -= attack.damage;
  b.experience += Math.max(1, Math.floor(attack.damage / 3));
  applyUpgrades(b, state);
  addEvent(state, 'Attacked',
    `${b.unitType} fired ${weapon.name} at ${target.unitType} for ${attack.damage} damage.`,
    { targetQ: target.position.q, targetR: target.position.r, damage: attack.damage, hit: true });
  addEvent(state, 'DamageDealt', `${target.unitType} has ${Math.max(0, target.strength)}/${target.maxStrength} strength remaining.`);

  if (target.strength <= 0) {
    state.brigades = state.brigades.filter((br) => br.id !== target.id);
    b.experience += 30;
    applyUpgrades(b, state);
    addEvent(state, 'BrigadeDestroyed', `${target.unitType} brigade destroyed!`);
    checkVictory(state);
  }
  return { success: true };
}

function execAbility(state: InternalGameState, cmd: GameCommand): CommandResult {
  const b = cmd.brigadeId ? getBrigade(state, cmd.brigadeId) : undefined;
  if (!b || b.playerId !== cmd.playerId) return { success: false, error: 'Brigade not found.' };
  if (b.turnState.hasUsedAbility) return { success: false, error: 'Ability already used this turn.' };
  if (!cmd.abilityId) return { success: false, error: 'Ability id required.' };

  const ability = getAbilities(b).find((a) => a.id === cmd.abilityId);
  if (!ability) return { success: false, error: 'Ability not available.' };
  b.turnState.hasUsedAbility = true;

  if (ability.type === 'DigIn') {
    if (b.turnState.hasMoved) return { success: false, error: 'Cannot dig in after moving.' };
    b.statusEffects.push({ type: 'Fortified', remainingTurns: -1 });
    addEvent(state, 'AbilityUsed', `${b.unitType} dug in (+50% defense until moving).`);
  } else if (ability.type === 'Setup') {
    b.turnState.forfeitsActions = true;
    b.turnState.hasMoved = true;
    b.turnState.movementPointsRemaining = 0;
    removeStatus(b, 'ArtilleryReady');
    if (b.upgrades.includes('RapidDeployment')) {
      b.statusEffects.push({ type: 'ArtilleryReady', remainingTurns: -1 });
      addEvent(state, 'AbilityUsed', `${b.unitType} set up rapidly and is ready to fire.`);
    } else {
      b.statusEffects.push({ type: 'ArtillerySettingUp', remainingTurns: 1 });
      addEvent(state, 'AbilityUsed', `${b.unitType} is setting up (ready next turn).`);
    }
  } else if (ability.type === 'Ambush') {
    if (b.turnState.hasMoved) return { success: false, error: 'Cannot ambush after moving.' };
    b.turnState.hasMoved = true;
    b.turnState.movementPointsRemaining = 0;
    b.statusEffects.push({ type: 'Ambush', remainingTurns: 1 });
    addEvent(state, 'AbilityUsed', `${b.unitType} prepared an ambush (+30% defense, +20% AT damage).`);
  }
  return { success: true };
}

// --- AI ---

export function runAiTurn(state: InternalGameState): void {
  const ai = state.aiPlayerId;
  if (ai < 0) return;

  for (const b of state.brigades.filter((br) => br.playerId === ai)) {
    if (state.phase === 'Victory') break;
    if (trySetupArtillery(state, b, ai)) continue;
    if (tryAttack(state, b, ai)) continue;
    while (tryMoveTowardEnemy(state, b, ai)) {
      /* spend remaining movement points one hex at a time */
    }
  }

  if (state.phase === 'InProgress' && state.currentPlayerId === ai) {
    executeCommand(state, { type: 'EndTurn', playerId: ai });
  }
}

function trySetupArtillery(state: InternalGameState, b: Brigade, ai: number): boolean {
  if (b.unitType !== 'Artillery' || hasStatus(b, 'ArtilleryReady') || hasStatus(b, 'ArtillerySettingUp') || b.turnState.hasUsedAbility) return false;
  return executeCommand(state, { type: 'UseAbility', playerId: ai, brigadeId: b.id, abilityId: 'setup' }).success;
}

function tryAttack(state: InternalGameState, b: Brigade, ai: number): boolean {
  if (b.turnState.forfeitsActions) return false;
  const enemies = state.brigades.filter((br) => br.playerId !== ai);
  let bestWeapon: Weapon | null = null;
  let bestTarget: Brigade | null = null;
  let bestScore = 0;

  for (const w of getWeapons(b)) {
    if (b.turnState.usedWeaponIds.includes(w.id)) continue;
    if (b.unitType === 'Artillery' && !hasStatus(b, 'ArtilleryReady')) continue;
    for (const e of enemies) {
      if (hexDistance(b.position, e.position) > w.range) continue;
      const score = w.baseDamage * getEffectiveness(w.category, getArmorClass(e));
      if (score > bestScore) { bestScore = score; bestWeapon = w; bestTarget = e; }
    }
  }
  if (!bestWeapon || !bestTarget) return false;
  return executeCommand(state, {
    type: 'UseWeapon', playerId: ai, brigadeId: b.id, weaponId: bestWeapon.id, targetCoord: bestTarget.position,
  }).success;
}

function tryMoveTowardEnemy(state: InternalGameState, b: Brigade, ai: number): boolean {
  if (b.turnState.movementPointsRemaining <= 0 || b.turnState.forfeitsActions || b.turnState.usedWeaponIds.length > 0) return false;
  const enemies = state.brigades.filter((br) => br.playerId !== ai);
  if (enemies.length === 0) return false;

  const nearest = enemies.reduce((a, e) =>
    hexDistance(b.position, e.position) < hexDistance(b.position, a.position) ? e : a);

  const occupied = new Set(state.brigades.filter((br) => br.id !== b.id).map((br) => hexKey(br.position)));
  const reachable = getReachableHexes(
    b.position,
    b.turnState.movementPointsRemaining,
    state.gridWidth,
    state.gridHeight,
    occupied,
    state.tiles,
    !b.turnState.hasMoved,
  );

  let best: HexCoord | null = null;
  let bestDist = hexDistance(b.position, nearest.position);
  for (const c of reachable) {
    const d = hexDistance(c, nearest.position);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  if (!best) return false;
  return executeCommand(state, { type: 'Move', playerId: ai, brigadeId: b.id, targetCoord: best }).success;
}

// --- Mapper ---

export function toDto(state: InternalGameState): GameStateDto {
  return {
    gameId: state.gameId,
    mode: state.mode,
    gridWidth: state.gridWidth,
    gridHeight: state.gridHeight,
    tiles: Object.entries(state.tiles).map(([key, terrain]) => {
      const [q, r] = key.split(',').map(Number);
      return { q, r, terrain };
    }),
    currentPlayerId: state.currentPlayerId,
    turnNumber: state.turnNumber,
    phase: state.phase,
    winnerId: state.winnerId,
    aiPlayerId: state.aiPlayerId,
    connectedPlayers: [...state.connectedPlayers].sort(),
    brigades: state.brigades.map((b) => ({
      id: b.id,
      playerId: b.playerId,
      unitType: b.unitType,
      q: b.position.q,
      r: b.position.r,
      strength: b.strength,
      maxStrength: b.maxStrength,
      baseDefense: b.baseDefense,
      experience: b.experience,
      upgrades: [...b.upgrades],
      statusEffects: b.statusEffects.map((s) => s.type),
      hasMoved: b.turnState.hasMoved,
      hasUsedAbility: b.turnState.hasUsedAbility,
      forfeitsActions: b.turnState.forfeitsActions,
      usedWeaponIds: [...b.turnState.usedWeaponIds],
      weapons: getWeapons(b),
      abilities: getAbilities(b),
      movementRange: getMovementPoints(b),
      movementPointsRemaining: b.turnState.movementPointsRemaining,
      visionRange: getVisionRange(b, state.tiles),
      revealedFromForest: b.turnState.revealedFromForest,
      currentAccuracy: getAccuracy(b),
    })),
    eventLog: [...state.eventLog],
  };
}

export function fromDto(dto: GameStateDto): InternalGameState {
  const tiles: TileMap = {};
  for (const tile of dto.tiles ?? []) {
    tiles[`${tile.q},${tile.r}`] = tile.terrain as TerrainType;
  }

  const state: InternalGameState = {
    gameId: dto.gameId,
    mode: dto.mode as GameMode,
    gridWidth: dto.gridWidth,
    gridHeight: dto.gridHeight,
    tiles,
    currentPlayerId: dto.currentPlayerId,
    turnNumber: dto.turnNumber,
    phase: dto.phase as GamePhase,
    winnerId: dto.winnerId,
    aiPlayerId: dto.aiPlayerId,
    connectedPlayers: [...dto.connectedPlayers],
    rngSeed: hashGameId(dto.gameId),
    eventLog: dto.eventLog.map((e) => ({ ...e })),
    brigades: dto.brigades.map((b) => ({
      id: b.id,
      playerId: b.playerId,
      unitType: b.unitType as UnitType,
      position: { q: b.q, r: b.r },
      maxStrength: b.maxStrength,
      strength: b.strength,
      baseDefense: b.baseDefense,
      experience: b.experience,
      upgrades: [...b.upgrades],
      statusEffects: b.statusEffects.map((t) => ({ type: t, remainingTurns: -1 })),
      movedLastTurn: false,
      turnState: {
        hasMoved: b.hasMoved,
        hasUsedAbility: b.hasUsedAbility,
        forfeitsActions: b.forfeitsActions,
        movementPointsRemaining:
          b.movementPointsRemaining ?? getMovementPointsForUnit(b.unitType as UnitType),
        revealedFromForest: b.revealedFromForest ?? false,
        usedWeaponIds: [...b.usedWeaponIds],
      },
    })),
  };

  ensureMapGenerated(state);
  return state;
}
