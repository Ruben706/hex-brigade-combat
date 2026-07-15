import { gameClient } from '../net/index';
import {
  ALL_UNIT_TYPES,
  ARMY_BUDGET,
  calculateRosterCost,
  getAvailableUpgrades,
  getDeploymentZoneHexes,
  getUnitCost,
  getUpgradeCost,
  MAX_ROSTER_SIZE,
  validateRoster,
  type LoadoutUnit,
  type UnitType,
} from '../map/armyBuilder';
import { buildTerrainMap } from '../vision/fogOfWar';
import { HexRenderer } from '../render/HexRenderer';
import type { GameStateDto } from '../types/game';
import { PLAYER_COLORS } from '../types/game';

export interface PreBattleDeps {
  getGameId: () => string | null;
  setGameId: (id: string) => void;
  getLocalPlayerId: () => number;
  setLocalPlayerId: (id: number) => void;
  getGameState: () => GameStateDto | null;
  setGameState: (state: GameStateDto) => void;
  applyGameState: (state: GameStateDto) => GameStateDto;
  enterBattle: () => void;
  leaveToMenu: () => void;
  ensureStateSubscription: () => void;
}

let deps: PreBattleDeps | null = null;
let lobbyPollTimer: ReturnType<typeof setInterval> | null = null;
let localRoster: LoadoutUnit[] = [];
let selectedRosterIndex: number | null = null;
let deployRenderer: HexRenderer | null = null;
let deployCameraSetup = false;

export function initPreBattle(preBattleDeps: PreBattleDeps): void {
  deps = preBattleDeps;
  bindStaticHandlers();
}

export function hideAllPreBattleScreens(): void {
  stopLobbyPolling();
  for (const id of ['lobby-browser', 'waiting-room', 'loadout-screen', 'deployment-screen']) {
    document.getElementById(id)?.classList.add('hidden');
  }
}

export function showMainMenu(): void {
  hideAllPreBattleScreens();
  document.getElementById('menu-screen')?.classList.remove('hidden');
}

function requireDeps(): PreBattleDeps {
  if (!deps) throw new Error('PreBattle not initialized');
  return deps;
}

function setStatus(elId: string, msg: string): void {
  const el = document.getElementById(elId);
  if (el) el.textContent = msg;
}

function stopLobbyPolling(): void {
  if (lobbyPollTimer != null) {
    clearInterval(lobbyPollTimer);
    lobbyPollTimer = null;
  }
}

function showScreen(screenId: string): void {
  hideAllPreBattleScreens();
  document.getElementById('menu-screen')?.classList.add('hidden');
  document.getElementById(screenId)?.classList.remove('hidden');
}

export function routeGamePhase(): void {
  const state = requireDeps().getGameState();
  if (!state) return;

  switch (state.phase) {
    case 'Lobby':
      showWaitingRoom();
      break;
    case 'Loadout':
      showLoadoutScreen();
      break;
    case 'Deployment':
      showDeploymentScreen();
      break;
    case 'InProgress':
    case 'Victory':
      hideAllPreBattleScreens();
      requireDeps().enterBattle();
      break;
    default:
      break;
  }
}

function bindStaticHandlers(): void {
  document.getElementById('find-match-btn')?.addEventListener('click', () => showLobbyBrowser());
  document.getElementById('lobby-back-btn')?.addEventListener('click', () => showMainMenu());
  document.getElementById('create-lobby-btn')?.addEventListener('click', () => void createLobby());
  document.getElementById('lobby-join-id-btn')?.addEventListener('click', () => void joinLobbyById());
  document.getElementById('waiting-leave-btn')?.addEventListener('click', () => void leaveLobby());
  document.getElementById('loadout-ready-btn')?.addEventListener('click', () => void toggleLoadoutReady());
  document.getElementById('deploy-ready-btn')?.addEventListener('click', () => void toggleDeploymentReady());
  document.getElementById('deploy-clear-btn')?.addEventListener('click', () => void clearAllDeployments());
}

export function showLobbyBrowser(): void {
  showScreen('lobby-browser');
  void refreshLobbyList();
  stopLobbyPolling();
  lobbyPollTimer = setInterval(() => void refreshLobbyList(), 3000);
}

async function refreshLobbyList(): Promise<void> {
  const tbody = document.getElementById('lobby-table-body');
  if (!tbody) return;

  try {
    const lobbies = await gameClient.listLobbies();
    if (lobbies.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">No open lobbies — create one!</td></tr>';
      return;
    }

    tbody.innerHTML = lobbies
      .map(
        (lobby) => `
      <tr>
        <td>${escapeHtml(lobby.lobbyName)}</td>
        <td>${lobby.playerCount}/2</td>
        <td>Player ${lobby.hostPlayerId}</td>
        <td><button class="join-lobby-row-btn" data-game-id="${lobby.gameId}">Join</button></td>
      </tr>`,
      )
      .join('');

    tbody.querySelectorAll<HTMLButtonElement>('.join-lobby-row-btn').forEach((btn) => {
      btn.onclick = () => void joinLobby(btn.dataset.gameId!);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Failed to load lobbies: ${escapeHtml(String(err))}</td></tr>`;
  }
}

async function createLobby(): Promise<void> {
  const nameInput = document.getElementById('lobby-name-input') as HTMLInputElement;
  const lobbyName = nameInput?.value.trim() || 'Skirmish';
  setStatus('lobby-browser-status', 'Creating lobby...');

  try {
    const result = await gameClient.createLobby(lobbyName, 0);
    const d = requireDeps();
    d.setGameId(result.gameId);
    d.setLocalPlayerId(0);
    d.ensureStateSubscription();
    d.setGameState(d.applyGameState(result.state));
    stopLobbyPolling();
    showWaitingRoom();
  } catch (err) {
    setStatus('lobby-browser-status', `Failed: ${String(err)}`);
  }
}

async function joinLobbyById(): Promise<void> {
  const input = document.getElementById('lobby-join-id-input') as HTMLInputElement;
  const id = input?.value.trim();
  if (!id) {
    setStatus('lobby-browser-status', 'Enter a game ID');
    return;
  }
  await joinLobby(id);
}

async function joinLobby(gameId: string): Promise<void> {
  setStatus('lobby-browser-status', 'Joining...');
  try {
    const join = await gameClient.joinGame(gameId, 1);
    if (!join.success || !join.state) {
      setStatus('lobby-browser-status', join.error ?? 'Join failed');
      return;
    }

    const d = requireDeps();
    d.setGameId(gameId);
    d.setLocalPlayerId(1);
    d.ensureStateSubscription();
    d.setGameState(d.applyGameState(join.state));
    stopLobbyPolling();
    routeGamePhase();
  } catch (err) {
    setStatus('lobby-browser-status', `Failed: ${String(err)}`);
  }
}

function showWaitingRoom(): void {
  const state = requireDeps().getGameState();
  if (!state) return;

  showScreen('waiting-room');
  const nameEl = document.getElementById('waiting-lobby-name');
  const idEl = document.getElementById('waiting-game-id');
  const playersEl = document.getElementById('waiting-players');

  if (nameEl) nameEl.textContent = state.lobbyName ?? 'Lobby';
  if (idEl) idEl.textContent = state.gameId;
  if (playersEl) {
    const count = state.connectedPlayers.length;
    playersEl.textContent =
      count >= 2
        ? 'Both players connected — starting loadout...'
        : `Waiting for opponent (${count}/2)...`;
  }
}

async function leaveLobby(): Promise<void> {
  const d = requireDeps();
  const gameId = d.getGameId();
  if (gameId) {
    try {
      await gameClient.leaveLobby(gameId, d.getLocalPlayerId());
    } catch {
      /* ignore */
    }
  }
  d.leaveToMenu();
}

function syncLocalRosterFromState(): void {
  const state = requireDeps().getGameState();
  const playerId = requireDeps().getLocalPlayerId();
  const serverRoster = state?.playerLoadouts?.[playerId]?.roster ?? [];
  localRoster = serverRoster.map((u) => ({
    unitType: u.unitType as UnitType,
    upgrades: [...u.upgrades],
  }));
  if (localRoster.length === 0) {
    localRoster = [{ unitType: 'Infantry', upgrades: [] }];
  }
}

function showLoadoutScreen(): void {
  syncLocalRosterFromState();
  showScreen('loadout-screen');
  renderLoadoutUi();
}

function renderLoadoutUi(): void {
  const state = requireDeps().getGameState();
  const playerId = requireDeps().getLocalPlayerId();
  if (!state) return;

  const cost = calculateRosterCost(localRoster);
  const budgetBar = document.getElementById('loadout-budget-bar');
  const budgetText = document.getElementById('loadout-budget-text');
  const rosterEl = document.getElementById('loadout-roster');
  const catalogEl = document.getElementById('loadout-catalog');
  const readyBtn = document.getElementById('loadout-ready-btn') as HTMLButtonElement;
  const opponentEl = document.getElementById('loadout-opponent-status');

  if (budgetBar) budgetBar.style.width = `${Math.min(100, (cost / ARMY_BUDGET) * 100)}%`;
  if (budgetText) budgetText.textContent = `${cost} / ${ARMY_BUDGET} points`;

  const myReady = state.playerLoadouts?.[playerId]?.ready ?? false;
  const oppId = playerId === 0 ? 1 : 0;
  const oppLoadout = state.playerLoadouts?.[oppId];
  if (opponentEl) {
    opponentEl.textContent = oppLoadout?.ready
      ? `Opponent ready (${oppLoadout.unitCount} units)`
      : `Opponent: ${oppLoadout?.unitCount ?? 0} units, not ready`;
  }
  if (readyBtn) {
    readyBtn.textContent = myReady ? 'Not Ready' : 'Ready';
    readyBtn.disabled = validateRoster(localRoster) !== null;
  }

  if (catalogEl) {
    catalogEl.innerHTML = ALL_UNIT_TYPES.map(
      (type) => `
      <button class="loadout-add-btn" data-unit="${type}" ${localRoster.length >= MAX_ROSTER_SIZE ? 'disabled' : ''}>
        + ${type} (${getUnitCost(type)} pts)
      </button>`,
    ).join('');
    catalogEl.querySelectorAll<HTMLButtonElement>('.loadout-add-btn').forEach((btn) => {
      btn.onclick = () => {
        if (localRoster.length >= MAX_ROSTER_SIZE) return;
        localRoster.push({ unitType: btn.dataset.unit as UnitType, upgrades: [] });
        void pushLoadout();
      };
    });
  }

  if (rosterEl) {
    rosterEl.innerHTML = localRoster
      .map((unit, index) => {
        const upgrades = getAvailableUpgrades(unit.unitType);
        const upgradeHtml = upgrades
          .map((up) => {
            const checked = unit.upgrades.includes(up);
            const cost = getUpgradeCost(unit.unitType, up);
            return `<label class="upgrade-check">
              <input type="checkbox" data-index="${index}" data-upgrade="${up}" ${checked ? 'checked' : ''} />
              ${up} (${cost})
            </label>`;
          })
          .join('');
        return `
        <div class="loadout-unit-card">
          <div class="loadout-unit-header">
            <strong>${unit.unitType}</strong>
            <span>${getUnitCost(unit.unitType)} pts</span>
            <button class="loadout-remove-btn" data-index="${index}">Remove</button>
          </div>
          <div class="loadout-upgrades">${upgradeHtml || '<span class="muted">No upgrades</span>'}</div>
        </div>`;
      })
      .join('');

    rosterEl.querySelectorAll<HTMLButtonElement>('.loadout-remove-btn').forEach((btn) => {
      btn.onclick = () => {
        localRoster.splice(Number(btn.dataset.index), 1);
        void pushLoadout();
      };
    });

    rosterEl.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((input) => {
      input.onchange = () => {
        const index = Number(input.dataset.index);
        const upgrade = input.dataset.upgrade!;
        const unit = localRoster[index];
        if (input.checked) {
          if (!unit.upgrades.includes(upgrade)) unit.upgrades.push(upgrade);
        } else {
          unit.upgrades = unit.upgrades.filter((u) => u !== upgrade);
        }
        void pushLoadout();
      };
    });
  }
}

async function pushLoadout(): Promise<void> {
  renderLoadoutUi();
  const err = validateRoster(localRoster);
  if (err) return;

  const d = requireDeps();
  const gameId = d.getGameId();
  if (!gameId) return;

  const result = await gameClient.updateLoadout(gameId, d.getLocalPlayerId(), localRoster);
  if (!result.success) {
    setStatus('loadout-status', result.error ?? 'Failed to save loadout');
    return;
  }
  if (result.state) d.setGameState(d.applyGameState(result.state));
  renderLoadoutUi();
}

async function toggleLoadoutReady(): Promise<void> {
  const d = requireDeps();
  const state = d.getGameState();
  const gameId = d.getGameId();
  if (!state || !gameId) return;

  const playerId = d.getLocalPlayerId();
  const currentlyReady = state.playerLoadouts?.[playerId]?.ready ?? false;
  const result = await gameClient.setLoadoutReady(gameId, playerId, !currentlyReady);
  if (!result.success) {
    setStatus('loadout-status', result.error ?? 'Ready failed');
    return;
  }
  if (result.state) {
    d.setGameState(d.applyGameState(result.state));
    routeGamePhase();
  }
  renderLoadoutUi();
}

function showDeploymentScreen(): void {
  showScreen('deployment-screen');
  selectedRosterIndex = 0;
  setupDeployCanvas();
  renderDeploymentUi();
}

function setupDeployCanvas(): void {
  const canvas = document.getElementById('deploy-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  if (!deployRenderer) {
    deployRenderer = new HexRenderer(canvas);
  }

  canvas.width = canvas.parentElement?.clientWidth ?? 900;
  canvas.height = 560;

  if (deployCameraSetup) return;
  deployCameraSetup = true;

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let didDrag = false;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isPanning = true;
    didDrag = false;
    panStartX = e.clientX;
    panStartY = e.clientY;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    canvas.classList.add('is-panning');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning || !deployRenderer) return;
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    if (!didDrag && Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) >= 5) {
      didDrag = true;
    }
    if (dx !== 0 || dy !== 0) {
      const rect = canvas.getBoundingClientRect();
      deployRenderer.panBy(dx * (canvas.width / rect.width), dy * (canvas.height / rect.height));
      panStartX = e.clientX;
      panStartY = e.clientY;
      refreshDeployCanvas();
    }
  });

  const endPan = () => {
    isPanning = false;
    canvas.classList.remove('is-panning');
  };
  window.addEventListener('mouseup', endPan);
  canvas.addEventListener('mouseleave', endPan);

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!deployRenderer) return;
      e.preventDefault();
      const { x, y } = deployRenderer.eventToCanvas(canvas, e);
      deployRenderer.zoomWheel(x, y, e.deltaY);
      refreshDeployCanvas();
    },
    { passive: false },
  );

  canvas.addEventListener('click', (e) => {
    if (didDrag) {
      didDrag = false;
      return;
    }
    if (!deployRenderer) return;
    const { x, y } = deployRenderer.eventToCanvas(canvas, e);
    void handleDeployClick(x, y);
  });
}

function refreshDeployCanvas(): void {
  const state = requireDeps().getGameState();
  const playerId = requireDeps().getLocalPlayerId();
  if (!state || !deployRenderer) return;

  const canvas = document.getElementById('deploy-canvas') as HTMLCanvasElement;
  deployRenderer.resize(canvas.width, canvas.height);

  const terrain = buildTerrainMap(state.tiles, state.gridWidth, state.gridHeight, state.gameId);
  const zoneHexes = getDeploymentZoneHexes(playerId, state.gridWidth);
  const roster = state.playerLoadouts?.[playerId]?.roster ?? [];
  const placements = state.playerDeployments?.[playerId] ?? [];

  const deploymentMarkers = placements.map((p) => ({
    q: p.q,
    r: p.r,
    label: String(p.rosterIndex + 1),
    selected: p.rosterIndex === selectedRosterIndex,
  }));

  deployRenderer.render(state, {
    selectedBrigadeId: null,
    highlightHexes: [],
    attackHexes: [],
    rangeHexes: [],
    visibleHexes: null,
    viewingPlayerId: playerId,
    terrain,
    damagePopups: [],
    deploymentZoneHexes: zoneHexes,
    deploymentZoneFill: playerId === 0 ? 'rgba(74, 144, 217, 0.18)' : 'rgba(217, 74, 74, 0.18)',
    deploymentZoneContour: playerId === 0 ? '#6eb5ff' : '#ff6e6e',
    deploymentMarkers,
  });

  void roster;
}

function renderDeploymentUi(): void {
  const state = requireDeps().getGameState();
  const playerId = requireDeps().getLocalPlayerId();
  if (!state) return;

  const roster = state.playerLoadouts?.[playerId]?.roster ?? [];
  const placements = state.playerDeployments?.[playerId] ?? [];
  const placedIndices = new Set(placements.map((p) => p.rosterIndex));
  const listEl = document.getElementById('deploy-roster-list');
  const readyBtn = document.getElementById('deploy-ready-btn') as HTMLButtonElement;
  const opponentEl = document.getElementById('deploy-opponent-status');
  const playerLabel = document.getElementById('deploy-player-label');

  if (playerLabel) {
    playerLabel.textContent = `Player ${playerId}`;
    playerLabel.style.color = PLAYER_COLORS[playerId];
  }

  const oppId = playerId === 0 ? 1 : 0;
  if (opponentEl) {
    const oppReady = state.deploymentReady?.[oppId] ?? false;
    opponentEl.textContent = oppReady ? 'Opponent ready' : 'Opponent deploying...';
  }

  const allPlaced = roster.length > 0 && roster.every((_, i) => placedIndices.has(i));
  const myReady = state.deploymentReady?.[playerId] ?? false;
  if (readyBtn) {
    readyBtn.textContent = myReady ? 'Not Ready' : 'Ready to Fight';
    readyBtn.disabled = !allPlaced;
  }

  if (listEl) {
    listEl.innerHTML = roster
      .map((unit, index) => {
        const placed = placements.find((p) => p.rosterIndex === index);
        const selected = selectedRosterIndex === index;
        return `
        <button class="deploy-roster-btn ${selected ? 'selected' : ''} ${placed ? 'placed' : ''}" data-index="${index}">
          ${index + 1}. ${unit.unitType}
          ${placed ? ` @ (${placed.q},${placed.r})` : ' — unplaced'}
        </button>`;
      })
      .join('');

    listEl.querySelectorAll<HTMLButtonElement>('.deploy-roster-btn').forEach((btn) => {
      btn.onclick = () => {
        selectedRosterIndex = Number(btn.dataset.index);
        renderDeploymentUi();
        refreshDeployCanvas();
      };
    });
  }

  refreshDeployCanvas();
}

async function handleDeployClick(x: number, y: number): Promise<void> {
  const d = requireDeps();
  const state = d.getGameState();
  const gameId = d.getGameId();
  if (!state || !gameId || !deployRenderer || selectedRosterIndex == null) return;

  const hex = deployRenderer.pickHex(x, y);
  const result = await gameClient.deployUnit(
    gameId,
    d.getLocalPlayerId(),
    selectedRosterIndex,
    hex.q,
    hex.r,
  );

  if (!result.success) {
    setStatus('deploy-status', result.error ?? 'Cannot deploy here');
    return;
  }

  if (result.state) {
    d.setGameState(d.applyGameState(result.state));
    routeGamePhase();
  }
  renderDeploymentUi();
}

async function clearAllDeployments(): Promise<void> {
  const d = requireDeps();
  const gameId = d.getGameId();
  if (!gameId) return;

  const result = await gameClient.clearDeployment(gameId, d.getLocalPlayerId());
  if (result.state) d.setGameState(d.applyGameState(result.state));
  renderDeploymentUi();
}

async function toggleDeploymentReady(): Promise<void> {
  const d = requireDeps();
  const state = d.getGameState();
  const gameId = d.getGameId();
  if (!state || !gameId) return;

  const playerId = d.getLocalPlayerId();
  const currentlyReady = state.deploymentReady?.[playerId] ?? false;
  const result = await gameClient.setDeploymentReady(gameId, playerId, !currentlyReady);
  if (!result.success) {
    setStatus('deploy-status', result.error ?? 'Ready failed');
    return;
  }
  if (result.state) {
    d.setGameState(d.applyGameState(result.state));
    routeGamePhase();
  }
  renderDeploymentUi();
}

export function onPreBattleStateUpdate(): void {
  const state = requireDeps().getGameState();
  if (!state) return;

  if (state.phase === 'Loadout' && !document.getElementById('loadout-screen')?.classList.contains('hidden')) {
    renderLoadoutUi();
  } else if (
    state.phase === 'Deployment' &&
    !document.getElementById('deployment-screen')?.classList.contains('hidden')
  ) {
    renderDeploymentUi();
  } else if (state.phase === 'Lobby' && !document.getElementById('waiting-room')?.classList.contains('hidden')) {
    showWaitingRoom();
  } else {
    routeGamePhase();
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
