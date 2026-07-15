import { randomUUID } from 'node:crypto';
import { generateMap, MAP_SIZE } from './mapGenerator.js';
import {
  createBrigade,
  getMovementPointsForUnit,
  hashGameId,
  type Brigade,
  type HexCoord,
  type InternalGameState,
  type UnitType,
} from './gameDomain.js';
import { validateRoster, isInDeploymentZone } from './armyBuilder.js';
import { getTerrain, isPassable } from './terrain.js';

export interface LoadoutUnit {
  unitType: UnitType;
  upgrades: string[];
}

export function createLobbyState(lobbyName?: string, hostPlayerId = 0): InternalGameState {
  const gameId = randomUUID();
  const rngSeed = hashGameId(gameId);
  const state: InternalGameState = {
    gameId,
    mode: 'Multiplayer',
    gridWidth: MAP_SIZE,
    gridHeight: MAP_SIZE,
    tiles: generateMap(rngSeed),
    brigades: [],
    currentPlayerId: 0,
    turnNumber: 1,
    phase: 'Lobby',
    winnerId: null,
    eventLog: [],
    connectedPlayers: [hostPlayerId],
    aiPlayerId: -1,
    rngSeed,
    lobbyName: lobbyName?.trim() || 'Skirmish',
    hostPlayerId,
    playerLoadouts: { 0: { roster: [], ready: false }, 1: { roster: [], ready: false } },
    playerDeployments: { 0: [], 1: [] },
    deploymentReady: { 0: false, 1: false },
  };
  state.eventLog.push({
    type: 'TurnEnded',
    message: `Lobby created by Player ${hostPlayerId}.`,
    turnNumber: state.turnNumber,
  });
  return state;
}

function getLoadout(state: InternalGameState, playerId: number) {
  if (!state.playerLoadouts[playerId]) {
    state.playerLoadouts[playerId] = { roster: [], ready: false };
  }
  return state.playerLoadouts[playerId]!;
}

function getDeployments(state: InternalGameState, playerId: number) {
  if (!state.playerDeployments[playerId]) {
    state.playerDeployments[playerId] = [];
  }
  return state.playerDeployments[playerId]!;
}

function maybeAdvanceFromLobby(state: InternalGameState): void {
  if (state.phase !== 'Lobby' || state.connectedPlayers.length < 2) return;
  state.phase = 'Loadout';
  state.eventLog.push({
    type: 'TurnEnded',
    message: 'Both players connected — configure your army.',
    turnNumber: state.turnNumber,
  });
}

function maybeAdvanceFromLoadout(state: InternalGameState): void {
  if (state.phase !== 'Loadout') return;
  if (!state.connectedPlayers.every((pid) => getLoadout(state, pid).ready)) return;
  state.phase = 'Deployment';
  for (const pid of state.connectedPlayers) {
    state.playerDeployments[pid] = [];
    state.deploymentReady[pid] = false;
  }
  state.eventLog.push({
    type: 'TurnEnded',
    message: 'Armies ready — deploy your units.',
    turnNumber: state.turnNumber,
  });
}

function createBrigadeFromLoadout(
  unit: LoadoutUnit,
  playerId: number,
  position: HexCoord,
): Brigade {
  const brigade = createBrigade(unit.unitType, playerId, position);
  brigade.upgrades = [...unit.upgrades];
  brigade.fromLoadout = true;
  if (unit.unitType === 'Artillery' && unit.upgrades.includes('RapidDeployment')) {
    brigade.statusEffects.push({ type: 'ArtilleryReady', remainingTurns: -1 });
  }
  return brigade;
}

function resetAllTurnStates(state: InternalGameState): void {
  for (const brigade of state.brigades) {
    brigade.turnState.hasMoved = false;
    brigade.turnState.hasUsedAbility = false;
    brigade.turnState.forfeitsActions = false;
    brigade.turnState.revealedFromForest = false;
    brigade.turnState.usedWeaponIds = [];
    brigade.turnState.movementPointsRemaining = getMovementPointsForUnit(brigade.unitType);
  }
}

function spawnBrigades(state: InternalGameState): void {
  state.brigades = [];
  for (const playerId of [...state.connectedPlayers].sort()) {
    const loadout = getLoadout(state, playerId);
    const placements = [...getDeployments(state, playerId)].sort((a, b) => a.rosterIndex - b.rosterIndex);
    for (let i = 0; i < loadout.roster.length; i++) {
      const unit = loadout.roster[i]!;
      const placement = placements.find((p) => p.rosterIndex === i);
      if (!placement) continue;
      state.brigades.push(
        createBrigadeFromLoadout(unit, playerId, { q: placement.q, r: placement.r }),
      );
    }
  }
  resetAllTurnStates(state);
}

function maybeStartBattle(state: InternalGameState): void {
  if (state.phase !== 'Deployment') return;
  if (!state.connectedPlayers.every((pid) => state.deploymentReady[pid])) return;
  spawnBrigades(state);
  state.phase = 'InProgress';
  state.currentPlayerId = 0;
  state.turnNumber = 1;
  state.eventLog.push({
    type: 'TurnEnded',
    message: "Battle begins! Player 0's turn.",
    turnNumber: state.turnNumber,
  });
}

export function joinLobby(state: InternalGameState, playerId: number): { success: boolean; error?: string } {
  if (state.mode !== 'Multiplayer') return { success: false, error: 'Not a multiplayer game.' };
  if (playerId !== 0 && playerId !== 1) return { success: false, error: 'Invalid player slot.' };
  if (state.connectedPlayers.includes(playerId)) return { success: true };
  if (state.connectedPlayers.length >= 2) return { success: false, error: 'Lobby is full.' };
  state.connectedPlayers.push(playerId);
  maybeAdvanceFromLobby(state);
  return { success: true };
}

export function updateLoadout(
  state: InternalGameState,
  playerId: number,
  roster: LoadoutUnit[],
): { success: boolean; error?: string } {
  if (state.phase !== 'Loadout') return { success: false, error: 'Not in loadout phase.' };
  if (!state.connectedPlayers.includes(playerId)) {
    return { success: false, error: 'Player not in lobby.' };
  }
  const error = validateRoster(roster);
  if (error) return { success: false, error };
  const loadout = getLoadout(state, playerId);
  loadout.roster = roster.map((u) => ({ unitType: u.unitType, upgrades: [...u.upgrades] }));
  loadout.ready = false;
  return { success: true };
}

export function setLoadoutReady(
  state: InternalGameState,
  playerId: number,
  ready: boolean,
): { success: boolean; error?: string } {
  if (state.phase !== 'Loadout') return { success: false, error: 'Not in loadout phase.' };
  const loadout = getLoadout(state, playerId);
  if (ready) {
    const error = validateRoster(loadout.roster);
    if (error) return { success: false, error };
  }
  loadout.ready = ready;
  maybeAdvanceFromLoadout(state);
  return { success: true };
}

export function deployUnit(
  state: InternalGameState,
  playerId: number,
  rosterIndex: number,
  coord: HexCoord,
): { success: boolean; error?: string } {
  if (state.phase !== 'Deployment') return { success: false, error: 'Not in deployment phase.' };
  const loadout = getLoadout(state, playerId);
  if (rosterIndex < 0 || rosterIndex >= loadout.roster.length) {
    return { success: false, error: 'Invalid roster index.' };
  }
  if (!isInDeploymentZone(playerId, coord.q, coord.r, state.gridWidth)) {
    return { success: false, error: 'Tile is outside your deployment zone.' };
  }
  if (!isPassable(getTerrain(state.tiles, coord.q, coord.r))) {
    return { success: false, error: 'Tile is not passable.' };
  }

  const occupied = new Set<string>();
  for (const [pidStr, list] of Object.entries(state.playerDeployments)) {
    const pid = Number(pidStr);
    for (const p of list) {
      if (pid === playerId && p.rosterIndex === rosterIndex) continue;
      occupied.add(`${p.q},${p.r}`);
    }
  }
  if (occupied.has(`${coord.q},${coord.r}`)) {
    return { success: false, error: 'Tile is already occupied.' };
  }

  const placements = getDeployments(state, playerId);
  const existing = placements.find((p) => p.rosterIndex === rosterIndex);
  if (existing) {
    existing.q = coord.q;
    existing.r = coord.r;
  } else {
    placements.push({ rosterIndex, q: coord.q, r: coord.r });
  }
  state.deploymentReady[playerId] = false;
  return { success: true };
}

export function clearDeployment(
  state: InternalGameState,
  playerId: number,
  rosterIndex?: number,
): { success: boolean; error?: string } {
  if (state.phase !== 'Deployment') return { success: false, error: 'Not in deployment phase.' };
  if (rosterIndex === undefined) {
    state.playerDeployments[playerId] = [];
  } else {
    state.playerDeployments[playerId] = getDeployments(state, playerId).filter(
      (p) => p.rosterIndex !== rosterIndex,
    );
  }
  state.deploymentReady[playerId] = false;
  return { success: true };
}

export function setDeploymentReady(
  state: InternalGameState,
  playerId: number,
  ready: boolean,
): { success: boolean; error?: string } {
  if (state.phase !== 'Deployment') return { success: false, error: 'Not in deployment phase.' };
  const loadout = getLoadout(state, playerId);
  const placements = getDeployments(state, playerId);
  if (ready) {
    if (placements.length !== loadout.roster.length) {
      return { success: false, error: 'Place all roster units before ready.' };
    }
    if (new Set(placements.map((p) => p.rosterIndex)).size !== loadout.roster.length) {
      return { success: false, error: 'Each roster unit must be placed once.' };
    }
  }
  state.deploymentReady[playerId] = ready;
  maybeStartBattle(state);
  return { success: true };
}

export function leaveLobby(state: InternalGameState, playerId: number): { success: boolean; error?: string } {
  state.connectedPlayers = state.connectedPlayers.filter((p) => p !== playerId);
  if (
    state.hostPlayerId === playerId &&
    (state.phase === 'Lobby' || state.phase === 'Loadout' || state.phase === 'Deployment')
  ) {
    state.phase = 'Victory';
    state.winnerId = null;
    state.eventLog.push({
      type: 'GameOver',
      message: 'Host left the lobby.',
      turnNumber: state.turnNumber,
    });
  }
  return { success: true };
}

export interface LobbySummary {
  gameId: string;
  lobbyName: string;
  playerCount: number;
  phase: string;
  hostPlayerId: number;
}

export function toLobbySummary(state: InternalGameState): LobbySummary {
  return {
    gameId: state.gameId,
    lobbyName: state.lobbyName,
    playerCount: state.connectedPlayers.length,
    phase: state.phase,
    hostPlayerId: state.hostPlayerId,
  };
}
