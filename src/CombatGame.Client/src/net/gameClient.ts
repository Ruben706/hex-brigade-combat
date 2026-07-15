import * as signalR from '@microsoft/signalr';
import type { GameCommandDto, GameMode, GameStateDto, LobbySummary } from '../types/game';
import type { LoadoutUnit } from '../map/armyBuilder';

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

  async createLobby(
    lobbyName: string,
    playerId: number,
  ): Promise<{ gameId: string; state: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('CreateLobby', lobbyName, playerId);
  }

  async listLobbies(): Promise<LobbySummary[]> {
    await this.connect();
    const result = await this.connection.invoke<{ lobbies: LobbySummary[] }>('ListLobbies');
    return result.lobbies ?? [];
  }

  async joinGame(
    gameId: string,
    playerId: number,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('JoinGame', gameId, playerId);
  }

  async updateLoadout(
    gameId: string,
    playerId: number,
    roster: LoadoutUnit[],
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('UpdateLoadout', gameId, playerId, roster);
  }

  async setLoadoutReady(
    gameId: string,
    playerId: number,
    ready: boolean,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('SetLoadoutReady', gameId, playerId, ready);
  }

  async deployUnit(
    gameId: string,
    playerId: number,
    rosterIndex: number,
    q: number,
    r: number,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('DeployUnit', gameId, playerId, rosterIndex, q, r);
  }

  async clearDeployment(
    gameId: string,
    playerId: number,
    rosterIndex?: number,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('ClearDeployment', gameId, playerId, rosterIndex ?? null);
  }

  async setDeploymentReady(
    gameId: string,
    playerId: number,
    ready: boolean,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('SetDeploymentReady', gameId, playerId, ready);
  }

  async leaveLobby(
    gameId: string,
    playerId: number,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('LeaveLobby', gameId, playerId);
  }

  async sendCommand(
    gameId: string,
    command: GameCommandDto,
  ): Promise<{ success: boolean; error?: string; state?: GameStateDto }> {
    await this.connect();
    return this.connection.invoke('SendCommand', gameId, command);
  }

  async fetchGameState(gameId: string): Promise<GameStateDto | null> {
    await this.connect();
    return this.connection.invoke<GameStateDto | null>('GetState', gameId);
  }

  beginSessionSync(_gameId: string): void {
    // SignalR pushes StateChanged events; no HTTP polling needed.
  }
}

export const gameClient = new GameClient();
