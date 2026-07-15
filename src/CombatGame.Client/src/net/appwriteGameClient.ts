import { Functions, Realtime, ExecutionMethod } from 'appwrite';
import {
  APPWRITE_FUNCTION_ID,
  APPWRITE_DATABASE_ID,
  APPWRITE_GAMES_COLLECTION_ID,
  client,
} from '../lib/appwrite';
import type { GameCommandDto, GameMode, GameStateDto } from '../types/game';

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
  private subscription: { unsubscribe: () => Promise<void> } | null = null;

  setStateHandler(handler: (state: GameStateDto) => void): void {
    this.onStateChanged = handler;
  }

  async connect(): Promise<void> {
    // Realtime subscribes per game session
  }

  private async subscribeToGame(gameId: string): Promise<void> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
    }

    const realtime = new Realtime(client);
    const channel = `databases.${APPWRITE_DATABASE_ID}.collections.${APPWRITE_GAMES_COLLECTION_ID}.documents.${gameId}`;

    this.subscription = await realtime.subscribe(channel, (event) => {
      if (event.events.some((e) => e.includes('.update') || e.includes('.create'))) {
        const payload = event.payload as { clientState?: string };
        if (payload.clientState) {
          const state = JSON.parse(payload.clientState) as GameStateDto;
          this.onStateChanged?.(state);
        }
      }
    });
  }

  async createGame(mode: GameMode): Promise<{ gameId: string; state: GameStateDto }> {
    const result = await invoke<{ success: boolean; gameId: string; state: GameStateDto }>({
      action: 'createGame',
      mode,
    });
    this.subscribeToGame(result.gameId);
    return { gameId: result.gameId, state: result.state };
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
      await this.subscribeToGame(gameId);
    }
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
    void this.subscription?.unsubscribe();
    this.subscription = null;
  }
}

export const appwriteGameClient = new AppwriteGameClient();
