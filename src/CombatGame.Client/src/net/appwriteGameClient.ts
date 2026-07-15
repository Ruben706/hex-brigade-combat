import { Functions, ExecutionMethod } from 'appwrite';
import {
  APPWRITE_FUNCTION_ID,
  client,
} from '../lib/appwrite';
import type { GameCommandDto, GameMode, GameStateDto, LobbySummary } from '../types/game';
import type { LoadoutUnit } from '../map/armyBuilder';

/** HTTP poll interval when Realtime is unavailable (Appwrite free tier rate-limits WebSockets). */
const SESSION_POLL_MS = 8000;

function ensureFunctionConfigured(): void {
  if (!APPWRITE_FUNCTION_ID) {
    throw new Error(
      'Appwrite game function is not configured. Deploy appwrite/functions/game-api, copy the function ID into src/lib/appwrite.ts (APPWRITE_FUNCTION_ID), then rebuild.',
    );
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  ensureFunctionConfigured();
  const functions = new Functions(client);
  const execution = await functions.createExecution(
    APPWRITE_FUNCTION_ID,
    JSON.stringify(body),
    false,
    '/',
    ExecutionMethod.POST,
    { 'Content-Type': 'application/json' },
  );

  if (execution.status !== 'completed') {
    throw new Error(execution.errors || 'Function execution failed');
  }

  return JSON.parse(execution.responseBody) as T;
}

export class AppwriteGameClient {
  private onStateChanged?: (state: GameStateDto) => void;
  private sessionPollTimer: ReturnType<typeof setInterval> | null = null;
  private sessionGameId: string | null = null;

  setStateHandler(handler: (state: GameStateDto) => void): void {
    this.onStateChanged = handler;
  }

  async connect(): Promise<void> {
    // State sync uses HTTP polling — Appwrite Realtime WebSockets hit 429 on free tier.
  }

  async fetchGameState(gameId: string): Promise<GameStateDto | null> {
    const result = await invoke<{ success: boolean; state?: GameStateDto; error?: string }>({
      action: 'getState',
      gameId,
    });
    return result.success && result.state ? result.state : null;
  }

  private stopSessionSync(): void {
    if (this.sessionPollTimer != null) {
      clearInterval(this.sessionPollTimer);
      this.sessionPollTimer = null;
    }
    this.sessionGameId = null;
  }

  private startSessionSync(gameId: string): void {
    if (this.sessionGameId === gameId && this.sessionPollTimer != null) {
      return;
    }

    this.stopSessionSync();
    this.sessionGameId = gameId;

    const pull = async () => {
      if (this.sessionGameId !== gameId) return;
      try {
        const state = await this.fetchGameState(gameId);
        if (state) {
          this.onStateChanged?.(state);
        }
      } catch (err) {
        console.warn('Session state sync failed:', err);
      }
    };

    void pull();
    this.sessionPollTimer = setInterval(() => void pull(), SESSION_POLL_MS);
  }

  async createGame(mode: GameMode): Promise<{ gameId: string; state: GameStateDto }> {
    const result = await invoke<{ success: boolean; gameId: string; state: GameStateDto }>({
      action: 'createGame',
      mode,
    });
    if (result.state.mode === 'Multiplayer') {
      this.startSessionSync(result.gameId);
    }
    return { gameId: result.gameId, state: result.state };
  }

  async createLobby(
    lobbyName: string,
    playerId: number,
  ): Promise<{ gameId: string; state: GameStateDto }> {
    const result = await invoke<{ success: boolean; gameId: string; state: GameStateDto }>({
      action: 'createLobby',
      lobbyName,
      playerId,
    });
    this.startSessionSync(result.gameId);
    return { gameId: result.gameId, state: result.state };
  }

  async listLobbies(): Promise<LobbySummary[]> {
    const result = await invoke<{ success: boolean; lobbies: LobbySummary[] }>({
      action: 'listLobbies',
    });
    return result.lobbies ?? [];
  }

  async joinGame(
    gameId: string,
    playerId: number,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    const result = await invoke<{ success: boolean; error?: string; state?: GameStateDto }>({
      action: 'joinGame',
      gameId,
      playerId,
    });
    if (result.success && result.state) {
      this.startSessionSync(gameId);
    }
    return result;
  }

  async updateLoadout(
    gameId: string,
    playerId: number,
    roster: LoadoutUnit[],
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    const result = await invoke<{ success: boolean; error?: string; state?: GameStateDto }>({
      action: 'updateLoadout',
      gameId,
      playerId,
      roster,
    });
    if (result.success && result.state) this.onStateChanged?.(result.state);
    return result;
  }

  async setLoadoutReady(
    gameId: string,
    playerId: number,
    ready: boolean,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    const result = await invoke<{ success: boolean; error?: string; state?: GameStateDto }>({
      action: 'setLoadoutReady',
      gameId,
      playerId,
      ready,
    });
    if (result.success && result.state) this.onStateChanged?.(result.state);
    return result;
  }

  async deployUnit(
    gameId: string,
    playerId: number,
    rosterIndex: number,
    q: number,
    r: number,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    const result = await invoke<{ success: boolean; error?: string; state?: GameStateDto }>({
      action: 'deployUnit',
      gameId,
      playerId,
      rosterIndex,
      targetQ: q,
      targetR: r,
    });
    if (result.success && result.state) this.onStateChanged?.(result.state);
    return result;
  }

  async clearDeployment(
    gameId: string,
    playerId: number,
    rosterIndex?: number,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    const result = await invoke<{ success: boolean; error?: string; state?: GameStateDto }>({
      action: 'clearDeployment',
      gameId,
      playerId,
      rosterIndex,
    });
    if (result.success && result.state) this.onStateChanged?.(result.state);
    return result;
  }

  async setDeploymentReady(
    gameId: string,
    playerId: number,
    ready: boolean,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    const result = await invoke<{ success: boolean; error?: string; state?: GameStateDto }>({
      action: 'setDeploymentReady',
      gameId,
      playerId,
      ready,
    });
    if (result.success && result.state) this.onStateChanged?.(result.state);
    return result;
  }

  async leaveLobby(
    gameId: string,
    playerId: number,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    const result = await invoke<{ success: boolean; error?: string; state?: GameStateDto }>({
      action: 'leaveLobby',
      gameId,
      playerId,
    });
    this.stopSessionSync();
    return result;
  }

  async sendCommand(
    gameId: string,
    command: GameCommandDto,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    const result = await invoke<{ success: boolean; error?: string; state?: GameStateDto }>({
      action: 'sendCommand',
      gameId,
      command,
    });

    if (result.success && result.state) {
      this.onStateChanged?.(result.state);
    }

    return result;
  }

  disconnect(): void {
    this.stopSessionSync();
  }
}

export const appwriteGameClient = new AppwriteGameClient();
