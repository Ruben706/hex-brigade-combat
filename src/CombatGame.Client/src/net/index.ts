import { isAppwriteConfigured, appwriteGameClient } from './appwriteGameClient';
import { gameClient as signalRGameClient } from './gameClient';

export const gameClient = isAppwriteConfigured() ? appwriteGameClient : signalRGameClient;

export function getBackendName(): string {
  return isAppwriteConfigured() ? 'Appwrite' : 'SignalR (local)';
}
