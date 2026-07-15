// Port of CombatGame.Domain — authoritative game rules for Appwrite Functions
import { randomUUID } from 'node:crypto';

export type UnitType = 'Infantry' | 'Tank' | 'Artillery' | 'AntiTank';
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
  currentPlayerId: number;
  turnNumber: number;
  phase: string;
  winnerId: number | null;
  aiPlayerId: number;
  brigades: BrigadeDto[];
  eventLog: GameEvent[];
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
  weapons: Weapon[];
  abilities: Ability[];
  movementRange: number;
  movementPointsRemaining: number;
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

export function commandFromDto(dto: GameCommandDto): GameCommand {
  const targetCoord =
    dto.targetCoord ??
    (dto.targetQ !== undefined && dto.targetR !== undefined
      ? { q: dto.targetQ, r: dto.targetR }
      : undefined);

  return {
    type: dto.type,
    playerId: dto.playerId,
    brigadeId: dto.brigadeId,
    targetCoord,
    weaponId: dto.weaponId,
    abilityId: dto.abilityId,
  };
}

// --- Hex ---

const HEX_DIRS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
] as const;

export function hexKey(c: HexCoord): string {
  return `${c.q},${c.r}`;
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const s1 = -a.q - a.r;
  const s2 = -b.q - b.r;
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(s1 - s2)) / 2;
}

export function hexNeighbor(c: HexCoord, dir: number): HexCoord {
  const [dq, dr] = HEX_DIRS[dir % 6];
  return { q: c.q + dq, r: c.r + dr };
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
    case 'Artillery': return 1;
    case 'Infantry':
    case 'AntiTank':
      return 2;
    default:
      return 1;
  }
}

export function getMovementPoints(b: Brigade): number {
  return getMovementPointsForUnit(b.unitType);
}

function resetMovementPoints(b: Brigade): void {
  b.turnState.movementPointsRemaining = getMovementPoints(b);
}

function getReachableHexes(start: HexCoord, range: number, gridW: number, gridH: number, occupied: Set<string>): HexCoord[] {
  const reachable: HexCoord[] = [];
  const visited = new Map<string, number>([[hexKey(start), 0]]);
  const queue: Array<{ c: HexCoord; cost: number }> = [{ c: start, cost: 0 }];

  while (queue.length > 0) {
    const { c, cost } = queue.shift()!;
    if (cost > 0) reachable.push(c);
    if (cost >= range) continue;

    for (let i = 0; i < 6; i++) {
      const n = hexNeighbor(c, i);
      if (n.q < 0 || n.r < 0 || n.q >= gridW || n.r >= gridH) continue;
      const key = hexKey(n);
      if (occupied.has(key)) continue;
      const next = cost + 1;
      const known = visited.get(key);
      if (known !== undefined && known <= next) continue;
      visited.set(key, next);
      queue.push({ c: n, cost: next });
    }
  }
  return reachable;
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

function getDefenseMultiplier(b: Brigade): number {
  let m = 1 + b.baseDefense / 100;
  if (hasStatus(b, 'Fortified')) m *= 1.5;
  if (hasStatus(b, 'Ambush')) m *= 1.3;
  if (b.upgrades.includes('VeteranDefense')) m *= 1.2;
  if (b.upgrades.includes('ReinforcedArmor')) m *= 1.3;
  if (b.upgrades.includes('Camouflage') && !b.movedLastTurn) m *= 1.15;
  return m;
}

function getAttackMultiplier(attacker: Brigade, weapon: Weapon): number {
  let m = 1;
  if (hasStatus(attacker, 'Ambush') && weapon.category === 'AntiArmor') m *= 1.2;
  if (attacker.upgrades.includes('HEATRounds') && weapon.category === 'AntiArmor' && attacker.unitType === 'AntiTank') m *= 1.25;
  return m;
}

function calculateDamage(weapon: Weapon, attacker: Brigade, defender: Brigade): number {
  const eff = getEffectiveness(weapon.category, getArmorClass(defender));
  const raw = weapon.baseDamage * eff * getAttackMultiplier(attacker, weapon);
  return Math.max(1, Math.round(raw / getDefenseMultiplier(defender)));
}

function resolveAttack(weapon: Weapon, attacker: Brigade, defender: Brigade, rng: SeededRng): { hit: boolean; damage: number; accuracy: number } {
  const accuracy = getAccuracy(attacker);
  if (rng.next() > accuracy) return { hit: false, damage: 0, accuracy };
  return { hit: true, damage: calculateDamage(weapon, attacker, defender), accuracy };
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

export function createSkirmish(mode: GameMode): InternalGameState {
  const gameId = randomUUID();
  const state: InternalGameState = {
    gameId,
    mode,
    gridWidth: 12,
    gridHeight: 8,
    brigades: [],
    currentPlayerId: 0,
    turnNumber: 1,
    phase: 'InProgress',
    winnerId: null,
    eventLog: [],
    connectedPlayers: [],
    aiPlayerId: mode === 'VsAi' ? 1 : -1,
    rngSeed: gameId.split('').reduce((a, c) => a + c.charCodeAt(0), 0),
  };

  const p0: Array<[UnitType, HexCoord]> = [
    ['Infantry', { q: 1, r: 2 }], ['Infantry', { q: 1, r: 4 }],
    ['Tank', { q: 0, r: 3 }], ['Artillery', { q: 0, r: 1 }], ['AntiTank', { q: 0, r: 5 }],
  ];
  const p1: Array<[UnitType, HexCoord]> = [
    ['Infantry', { q: 10, r: 2 }], ['Infantry', { q: 10, r: 4 }],
    ['Tank', { q: 11, r: 3 }], ['Artillery', { q: 11, r: 1 }], ['AntiTank', { q: 11, r: 5 }],
  ];
  for (const [t, pos] of p0) state.brigades.push(createBrigade(t, 0, pos));
  for (const [t, pos] of p1) state.brigades.push(createBrigade(t, 1, pos));
  addEvent(state, 'TurnEnded', 'Battle begins! Player 0\'s turn.');
  return state;
}

// --- Game engine ---

export function executeCommand(state: InternalGameState, command: GameCommand): CommandResult {
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
  if (!cmd.targetCoord) return { success: false, error: 'Target coordinate required.' };

  const t = cmd.targetCoord;
  if (t.q < 0 || t.r < 0 || t.q >= state.gridWidth || t.r >= state.gridHeight) {
    return { success: false, error: 'Target is outside the map.' };
  }

  if (hexDistance(b.position, t) !== 1) {
    return { success: false, error: 'Move one hex at a time.' };
  }

  const occupied = new Set(state.brigades.filter((br) => br.id !== b.id).map((br) => hexKey(br.position)));
  const reachable = getReachableHexes(b.position, 1, state.gridWidth, state.gridHeight, occupied);
  if (!reachable.some((h) => h.q === t.q && h.r === t.r)) {
    return { success: false, error: 'Target is not a valid adjacent hex.' };
  }
  if (getBrigadeAt(state, t)) return { success: false, error: 'Target hex is occupied.' };

  clearMovementStatuses(b);
  b.position = t;
  b.turnState.hasMoved = true;
  b.turnState.movementPointsRemaining--;
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

  const attack = resolveAttack(weapon, b, target, rng);
  b.turnState.usedWeaponIds.push(weapon.id);

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
  if (b.turnState.movementPointsRemaining <= 0 || b.turnState.forfeitsActions) return false;
  const enemies = state.brigades.filter((br) => br.playerId !== ai);
  if (enemies.length === 0) return false;

  const nearest = enemies.reduce((a, e) =>
    hexDistance(b.position, e.position) < hexDistance(b.position, a.position) ? e : a);

  const occupied = new Set(state.brigades.filter((br) => br.id !== b.id).map((br) => hexKey(br.position)));
  const reachable = getReachableHexes(b.position, 1, state.gridWidth, state.gridHeight, occupied);

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
      currentAccuracy: getAccuracy(b),
    })),
    eventLog: [...state.eventLog],
  };
}

export function fromDto(dto: GameStateDto): InternalGameState {
  return {
    gameId: dto.gameId,
    mode: dto.mode as GameMode,
    gridWidth: dto.gridWidth,
    gridHeight: dto.gridHeight,
    currentPlayerId: dto.currentPlayerId,
    turnNumber: dto.turnNumber,
    phase: dto.phase as GamePhase,
    winnerId: dto.winnerId,
    aiPlayerId: dto.aiPlayerId,
    connectedPlayers: [...dto.connectedPlayers],
    rngSeed: dto.gameId.split('').reduce((a, c) => a + c.charCodeAt(0), 0),
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
        usedWeaponIds: [...b.usedWeaponIds],
      },
    })),
  };
}
