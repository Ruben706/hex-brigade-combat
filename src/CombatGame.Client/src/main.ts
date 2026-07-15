import './style.css';
import { pingAppwriteBackend } from './lib/appwrite';
import { gameClient, getBackendName, getBackendSetupHint } from './net/index';
import {
  getReachableHexes,
  HexRenderer,
  withinRange,
  type DamagePopup,
  type HexCoord,
} from './render/HexRenderer';
import type {
  ActionMode,
  BrigadeDto,
  GameCommandDto,
  GameMode,
  GameStateDto,
} from './types/game';
import { PLAYER_COLORS } from './types/game';

const app = document.querySelector<HTMLDivElement>('#app')!;

let gameId: string | null = null;
let gameState: GameStateDto | null = null;
let localPlayerId = 0;
let selectedBrigadeId: string | null = null;
let actionMode: ActionMode = { kind: 'none' };
let hexRenderer: HexRenderer | null = null;
let lastEventLogLength = 0;
let damagePopupEntries: Array<{ q: number; r: number; text: string; createdAt: number }> = [];
let popupAnimId: number | null = null;

const POPUP_DURATION_MS = 1500;

function renderApp(): void {
  app.innerHTML = `
    <div class="layout">
      <header class="header">
        <h1>Hex Brigade Combat</h1>
        <div id="menu-screen" class="menu-screen">
          <button data-mode="Hotseat">Hotseat (2 Players)</button>
          <button data-mode="VsAi">vs AI</button>
          <button data-mode="Multiplayer" id="create-mp-btn">Create Multiplayer Game</button>
          <div class="join-row">
            <input id="join-id" placeholder="Game ID to join" />
            <button id="join-btn">Join as Player 2</button>
          </div>
          <p id="menu-status" class="status"></p>
        </div>
        <div id="game-header" class="game-header hidden">
          <span id="turn-info"></span>
          <span id="player-info"></span>
          <button id="end-turn-btn">End Turn</button>
        </div>
      </header>
      <main class="main hidden" id="game-main">
        <div class="board-panel">
          <canvas id="game-canvas" width="900" height="560"></canvas>
        </div>
        <aside class="side-panel">
          <section id="brigade-panel" class="panel">
            <h2>Selected Brigade</h2>
            <div id="brigade-details">Click a brigade to select</div>
          </section>
          <section id="actions-panel" class="panel">
            <h2>Actions</h2>
            <div id="action-buttons"></div>
          </section>
          <section class="panel log-panel">
            <h2>Battle Log</h2>
            <ul id="event-log"></ul>
          </section>
        </aside>
      </main>
      <div id="victory-overlay" class="victory-overlay hidden">
        <div class="victory-card">
          <h2 id="victory-text"></h2>
          <button id="back-menu-btn">Back to Menu</button>
        </div>
      </div>
    </div>
  `;

  setupMenuHandlers();
}

function setupMenuHandlers(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as GameMode;
      if (mode === 'Multiplayer') {
        void startMultiplayerCreate();
      } else {
        void startGame(mode, mode === 'VsAi' ? 0 : 0);
      }
    });
  });

  document.getElementById('create-mp-btn')?.addEventListener('click', () => void startMultiplayerCreate());
  document.getElementById('join-btn')?.addEventListener('click', () => void joinMultiplayer());
  document.getElementById('end-turn-btn')?.addEventListener('click', () => void endTurn());
  document.getElementById('back-menu-btn')?.addEventListener('click', () => location.reload());
}

async function startGame(mode: GameMode, playerId: number): Promise<void> {
  setMenuStatus('Creating game...');
  try {
    const result = await gameClient.createGame(mode);
    gameId = result.gameId;
    gameState = result.state;
    localPlayerId = playerId;

    const join = await gameClient.joinGame(gameId, playerId);
    if (join.state) {
      gameState = join.state;
    }

    if (mode === 'Hotseat') {
      await gameClient.joinGame(gameId, 1);
    }

    showGame();
  } catch (err) {
    setMenuStatus(`Failed to connect: ${String(err)}`);
  }
}

async function startMultiplayerCreate(): Promise<void> {
  setMenuStatus('Creating multiplayer game...');
  try {
    const result = await gameClient.createGame('Multiplayer');
    gameId = result.gameId;
    localPlayerId = 0;
    await gameClient.joinGame(gameId, 0);
    gameState = result.state;
    setMenuStatus(`Share this Game ID with Player 2: ${gameId}`);
    showGame();
  } catch (err) {
    setMenuStatus(`Failed: ${String(err)}`);
  }
}

async function joinMultiplayer(): Promise<void> {
  const input = document.getElementById('join-id') as HTMLInputElement;
  const id = input.value.trim();
  if (!id) {
    setMenuStatus('Enter a game ID');
    return;
  }

  setMenuStatus('Joining...');
  try {
    gameId = id;
    localPlayerId = 1;
    const join = await gameClient.joinGame(id, 1);
    if (!join.success) {
      setMenuStatus(join.error ?? 'Join failed');
      return;
    }
    gameState = join.state!;
    showGame();
  } catch (err) {
    setMenuStatus(`Failed: ${String(err)}`);
  }
}

function showGame(): void {
  document.getElementById('menu-screen')?.classList.add('hidden');
  document.getElementById('game-header')?.classList.remove('hidden');
  document.getElementById('game-main')?.classList.remove('hidden');

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  hexRenderer = new HexRenderer(canvas);
  lastEventLogLength = gameState?.eventLog.length ?? 0;
  damagePopupEntries = [];

  gameClient.setStateHandler((state) => {
    processCombatEvents(state);
    gameState = state;
    updateUi();
  });

  canvas.addEventListener('click', (e) => {
    if (!gameState || !hexRenderer) return;
    hexRenderer.syncLayout(gameState.gridWidth, gameState.gridHeight);
    const { x, y } = hexRenderer.eventToCanvas(canvas, e);
    void handleCanvasClick(x, y);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelAction(true);
    }
  });

  window.addEventListener('resize', () => {
    canvas.width = canvas.parentElement?.clientWidth ?? 900;
    canvas.height = 560;
    updateUi();
  });

  updateUi();
}

function processCombatEvents(state: GameStateDto): void {
  const newEvents = state.eventLog.slice(lastEventLogLength);
  lastEventLogLength = state.eventLog.length;

  for (const event of newEvents) {
    if (event.targetQ == null || event.targetR == null) continue;
    if (event.type === 'Missed' || event.hit === false) {
      damagePopupEntries.push({
        q: event.targetQ,
        r: event.targetR,
        text: 'MISS',
        createdAt: Date.now(),
      });
    } else if (event.damage != null && event.damage > 0) {
      damagePopupEntries.push({
        q: event.targetQ,
        r: event.targetR,
        text: `-${event.damage}`,
        createdAt: Date.now(),
      });
    }
  }

  if (newEvents.some((e) => e.type === 'Missed' || e.type === 'Attacked')) {
    startPopupAnimation();
  }
}

function getActiveDamagePopups(): DamagePopup[] {
  const now = Date.now();
  return damagePopupEntries
    .filter((p) => now - p.createdAt < POPUP_DURATION_MS)
    .map((p) => ({
      q: p.q,
      r: p.r,
      text: p.text,
      opacity: 1 - (now - p.createdAt) / POPUP_DURATION_MS,
    }));
}

function startPopupAnimation(): void {
  if (popupAnimId != null) return;
  const tick = () => {
    const now = Date.now();
    damagePopupEntries = damagePopupEntries.filter((p) => now - p.createdAt < POPUP_DURATION_MS);
    refreshRenderer();
    if (damagePopupEntries.length > 0) {
      popupAnimId = requestAnimationFrame(tick);
    } else {
      popupAnimId = null;
    }
  };
  popupAnimId = requestAnimationFrame(tick);
}

function updateUi(): void {
  if (!gameState || !hexRenderer) return;

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  hexRenderer.resize(canvas.width, canvas.height);

  const { moveHexes, attackHexes } = computeHighlights();
  hexRenderer.render(gameState, {
    selectedBrigadeId,
    highlightHexes: moveHexes,
    attackHexes,
    damagePopups: getActiveDamagePopups(),
  });

  updateHeader();
  updateBrigadePanel();
  updateActionButtons();
  updateEventLog();
  updateVictoryOverlay();
}

function computeHighlights(): { moveHexes: HexCoord[]; attackHexes: HexCoord[] } {
  const moveHexes: HexCoord[] = [];
  const attackHexes: HexCoord[] = [];

  if (!gameState || actionMode.kind === 'none') {
    return { moveHexes, attackHexes };
  }

  const brigade = gameState.brigades.find((b) => b.id === getActiveBrigadeId());
  if (!brigade) return { moveHexes, attackHexes };

  if (actionMode.kind === 'move' && !brigade.hasMoved && !brigade.forfeitsActions) {
    const occupied = gameState.brigades
      .filter((b) => b.id !== brigade.id)
      .map((b) => ({ q: b.q, r: b.r }));
    moveHexes.push(
      ...getReachableHexes(
        { q: brigade.q, r: brigade.r },
        brigade.movementRange,
        gameState.gridWidth,
        gameState.gridHeight,
        occupied,
      ),
    );
  }

  if (actionMode.kind === 'weapon') {
    for (const hex of withinRange(brigade.q, brigade.r, actionMode.range)) {
      const target = gameState.brigades.find((b) => b.q === hex.q && b.r === hex.r);
      if (target && target.playerId !== brigade.playerId) {
        attackHexes.push(hex);
      }
    }
  }

  return { moveHexes, attackHexes };
}

function getActiveBrigadeId(): string | null {
  if (actionMode.kind === 'none') return selectedBrigadeId;
  return actionMode.brigadeId;
}

function updateHeader(): void {
  if (!gameState) return;
  const turnInfo = document.getElementById('turn-info')!;
  const playerInfo = document.getElementById('player-info')!;
  const endBtn = document.getElementById('end-turn-btn') as HTMLButtonElement;

  const isMyTurn = canActAsCurrentPlayer();
  turnInfo.textContent = `Turn ${gameState.turnNumber} — Player ${gameState.currentPlayerId}'s turn`;
  playerInfo.textContent = `You: Player ${localPlayerId} | Backend: ${getBackendName()}`;
  playerInfo.style.color = PLAYER_COLORS[localPlayerId];
  endBtn.disabled = !isMyTurn || gameState.phase === 'Victory';
}

function canActAsCurrentPlayer(): boolean {
  if (!gameState) return false;
  if (gameState.mode === 'Hotseat') return true;
  if (gameState.mode === 'VsAi' && gameState.currentPlayerId === gameState.aiPlayerId) return false;
  return gameState.currentPlayerId === localPlayerId;
}

function updateBrigadePanel(): void {
  const panel = document.getElementById('brigade-details')!;
  if (!gameState || !selectedBrigadeId) {
    panel.textContent = 'Click a brigade to select';
    return;
  }

  const brigade = gameState.brigades.find((b) => b.id === selectedBrigadeId);
  if (!brigade) {
    panel.textContent = 'Brigade destroyed or deselected';
    return;
  }

  panel.innerHTML = `
    <p><strong>${brigade.unitType}</strong> (Player ${brigade.playerId})</p>
    <p>Strength: ${brigade.strength}/${brigade.maxStrength}</p>
    <p>Defense: ${brigade.baseDefense} | XP: ${brigade.experience}</p>
    <p>Position: (${brigade.q}, ${brigade.r})</p>
    <p>Status: ${brigade.statusEffects.length ? brigade.statusEffects.join(', ') : 'None'}</p>
    <p>Accuracy: ${Math.round(brigade.currentAccuracy * 100)}%${brigade.hasMoved ? ' (moved — halved)' : ''}</p>
    <p>Upgrades: ${brigade.upgrades.length ? brigade.upgrades.join(', ') : 'None'}</p>
    <p>Moved: ${brigade.hasMoved ? 'Yes' : 'No'} | Ability used: ${brigade.hasUsedAbility ? 'Yes' : 'No'}</p>
  `;
}

function updateActionButtons(): void {
  const container = document.getElementById('action-buttons')!;
  container.innerHTML = '';

  if (!gameState || !selectedBrigadeId || !canActAsCurrentPlayer()) {
    container.textContent = 'Select your brigade on your turn';
    return;
  }

  const brigade = gameState.brigades.find((b) => b.id === selectedBrigadeId);
  if (!brigade || brigade.playerId !== getControllingPlayerId()) {
    container.textContent = 'Select one of your brigades';
    return;
  }

  if (gameState.currentPlayerId !== brigade.playerId) {
    container.textContent = 'Wait for your turn';
    return;
  }

  const moveBtn = document.createElement('button');
  moveBtn.textContent = actionMode.kind === 'move' ? 'Cancel Move' : 'Move';
  moveBtn.disabled = brigade.hasMoved || brigade.forfeitsActions;
  moveBtn.onclick = () => {
    if (actionMode.kind === 'move') {
      cancelAction(false);
    } else {
      actionMode = { kind: 'move', brigadeId: brigade.id };
      refreshRenderer();
    }
  };
  container.appendChild(moveBtn);

  for (const weapon of brigade.weapons) {
    const isSelected =
      actionMode.kind === 'weapon' &&
      actionMode.brigadeId === brigade.id &&
      actionMode.weaponId === weapon.id;
    const btn = document.createElement('button');
    btn.textContent = isSelected
      ? `Cancel ${weapon.name}`
      : `${weapon.name} (rng ${weapon.range}, dmg ${weapon.baseDamage}, acc ${Math.round(brigade.currentAccuracy * 100)}%)`;
    btn.disabled =
      !isSelected &&
      (brigade.forfeitsActions ||
        brigade.usedWeaponIds.includes(weapon.id) ||
        (brigade.unitType === 'Artillery' && !brigade.statusEffects.includes('ArtilleryReady')));
    btn.onclick = () => {
      if (isSelected) {
        cancelAction(false);
      } else {
        actionMode = { kind: 'weapon', brigadeId: brigade.id, weaponId: weapon.id, range: weapon.range };
        refreshRenderer();
      }
    };
    container.appendChild(btn);
  }

  for (const ability of brigade.abilities) {
    const btn = document.createElement('button');
    btn.textContent = `${ability.name}`;
    btn.title = ability.description;
    btn.disabled = brigade.hasUsedAbility;
    btn.onclick = () => void useAbility(brigade, ability.id);
    container.appendChild(btn);
  }
}

function getControllingPlayerId(): number {
  if (!gameState) return localPlayerId;
  if (gameState.mode === 'Hotseat') return gameState.currentPlayerId;
  return localPlayerId;
}

function cancelAction(deselect: boolean): void {
  actionMode = { kind: 'none' };
  if (deselect) {
    selectedBrigadeId = null;
  }
  refreshRenderer();
}

function canBrigadeAutoMove(brigade: BrigadeDto): boolean {
  if (!gameState) return false;
  return (
    canActAsCurrentPlayer() &&
    brigade.playerId === getControllingPlayerId() &&
    gameState.currentPlayerId === brigade.playerId &&
    !brigade.hasMoved &&
    !brigade.forfeitsActions
  );
}

function selectBrigade(brigade: BrigadeDto | null): void {
  if (!brigade) {
    selectedBrigadeId = null;
    actionMode = { kind: 'none' };
    refreshRenderer();
    return;
  }

  selectedBrigadeId = brigade.id;
  actionMode = canBrigadeAutoMove(brigade)
    ? { kind: 'move', brigadeId: brigade.id }
    : { kind: 'none' };
  refreshRenderer();
}

async function handleCanvasClick(x: number, y: number): Promise<void> {
  if (!gameState || !gameId || !hexRenderer) return;

  const brigadeAt = hexRenderer.pickBrigade(x, y, gameState.brigades);
  const hex = brigadeAt
    ? { q: brigadeAt.q, r: brigadeAt.r }
    : hexRenderer.pickHex(x, y);

  if (actionMode.kind === 'move') {
    if (!canActAsCurrentPlayer()) return;

    const isValidMove =
      hexRenderer.isOnGrid(hex) &&
      computeHighlights().moveHexes.some((h) => h.q === hex.q && h.r === hex.r);

    if (isValidMove) {
      const brigadeId = actionMode.brigadeId;
      await sendCommand({
        type: 'Move',
        playerId: gameState.currentPlayerId,
        brigadeId,
        targetQ: hex.q,
        targetR: hex.r,
      });
      selectedBrigadeId = brigadeId;
      actionMode = { kind: 'none' };
      refreshRenderer();
      return;
    }

    cancelAction(true);
    return;
  }

  if (actionMode.kind === 'weapon') {
    if (!canActAsCurrentPlayer()) return;

    if (brigadeAt && brigadeAt.playerId !== gameState.currentPlayerId) {
      await sendCommand({
        type: 'UseWeapon',
        playerId: gameState.currentPlayerId,
        brigadeId: actionMode.brigadeId,
        weaponId: actionMode.weaponId,
        targetQ: brigadeAt.q,
        targetR: brigadeAt.r,
      });
      actionMode = { kind: 'none' };
      return;
    }

    if (brigadeAt) {
      selectBrigade(brigadeAt);
    } else {
      selectBrigade(null);
    }
    return;
  }

  if (brigadeAt) {
    selectBrigade(brigadeAt);
  } else {
    selectBrigade(null);
  }
}

async function useAbility(brigade: BrigadeDto, abilityId: string): Promise<void> {
  if (!gameState || !gameId) return;
  await sendCommand({
    type: 'UseAbility',
    playerId: gameState.currentPlayerId,
    brigadeId: brigade.id,
    abilityId,
  });
  actionMode = { kind: 'none' };
}

async function endTurn(): Promise<void> {
  if (!gameState || !gameId || !canActAsCurrentPlayer()) return;
  await sendCommand({ type: 'EndTurn', playerId: gameState.currentPlayerId });
  actionMode = { kind: 'none' };
  selectedBrigadeId = null;
}

async function sendCommand(command: GameCommandDto): Promise<void> {
  if (!gameId) return;
  const result = await gameClient.sendCommand(gameId, command);
  if (!result.success) {
    alert(result.error ?? 'Command failed');
    return;
  }
  if (result.state) {
    processCombatEvents(result.state);
    gameState = result.state;
    refreshRenderer();
  }
}

function updateEventLog(): void {
  const log = document.getElementById('event-log')!;
  if (!gameState) return;
  log.innerHTML = gameState.eventLog
    .slice()
    .reverse()
    .slice(0, 20)
    .map((e) => `<li><span class="turn">T${e.turnNumber}</span> ${e.message}</li>`)
    .join('');
}

function updateVictoryOverlay(): void {
  const overlay = document.getElementById('victory-overlay')!;
  if (!gameState || gameState.phase !== 'Victory') {
    overlay.classList.add('hidden');
    return;
  }

  overlay.classList.remove('hidden');
  const text = document.getElementById('victory-text')!;
  text.textContent =
    gameState.winnerId !== null
      ? `Player ${gameState.winnerId} wins!`
      : 'Draw!';
}

function refreshRenderer(): void {
  updateUi();
}

function setMenuStatus(msg: string): void {
  const el = document.getElementById('menu-status');
  if (el) el.textContent = msg;
}

renderApp();

void pingAppwriteBackend().then((ok) => {
  const hint = getBackendSetupHint();
  if (ok && hint) {
    setMenuStatus(`Appwrite connected. ${hint}`);
  } else if (ok) {
    setMenuStatus('Appwrite backend connected.');
  } else {
    setMenuStatus('Appwrite ping failed — add localhost and ruben706.github.io as Web platforms in Appwrite Console.');
  }
});
