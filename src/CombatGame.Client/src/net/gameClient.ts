import * as signalR from '@microsoft/signalr';
import type { GameCommandDto, GameMode, GameStateDto } from '../types/game';

const hubUrl = import.meta.env.VITE_HUB_URL || '/hub/game';

export class GameClient {
  private connection: signalR.HubConnection;
  private onStateChanged?: (state: GameStateDto) => void;

  constructor() {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .build();

    this.connection.on('StateChanged', (state: GameStateDto) => {
      this.onStateChanged?.(state);
    });
  }

  async connect(): Promise<void> {
    if (this.connection.state === signalR.HubConnectionState.Connected) {
      return;
    }
    await this.connection.start();
  }

  setStateHandler(handler: (state: GameStateDto) => void): void {
    this.onStateChanged = handler;
  }

  async createGame(mode: GameMode): Promise<{ gameId: string; state: GameStateDto }> {
    await this.connect();
    const result = await this.connection.invoke<{ gameId: string; state: GameStateDto }>(
      'CreateGame',
      mode,
    );
    return result;
  }

  async joinGame(
    gameId: string,
    playerId: number,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('JoinGame', gameId, playerId);
  }

  async sendCommand(
    gameId: string,
    command: GameCommandDto,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('SendCommand', gameId, command);
  }
}

export const gameClient = new GameClient();
