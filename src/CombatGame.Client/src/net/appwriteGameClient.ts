import { Client, Functions, Realtime, ExecutionMethod } from 'appwrite';
import type { GameCommandDto, GameMode, GameStateDto } from '../types/game';

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || '';
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || '';
const functionId = import.meta.env.VITE_APPWRITE_FUNCTION_ID || '';
const databaseId = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'combat';
const collectionId = import.meta.env.VITE_APPWRITE_GAMES_COLLECTION_ID || 'games';

function getClient(): Client {
  return new Client().setEndpoint(endpoint).setProject(projectId);
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const functions = new Functions(getClient());
  const execution = await functions.createExecution(
    functionId,
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

    const realtime = new Realtime(getClient());
    const channel = `databases.${databaseId}.collections.${collectionId}.documents.${gameId}`;

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

export function isAppwriteConfigured(): boolean {
  return Boolean(endpoint && projectId && functionId);
}
