import {
  APPWRITE_FUNCTION_ID,
  APPWRITE_PROJECT_ID,
} from '../lib/appwrite';
import { appwriteGameClient } from './appwriteGameClient';
import { gameClient as signalRGameClient } from './gameClient';

function isLocalDev(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/** True when the game-api function ID is available. */
export function isGameFunctionConfigured(): boolean {
  return Boolean(APPWRITE_FUNCTION_ID);
}

/**
 * Use Appwrite on deployed sites (GitHub Pages). SignalR only works with the local .NET server.
 * Local dev uses SignalR unless a function ID is configured.
 */
export function shouldUseAppwriteBackend(): boolean {
  if (isGameFunctionConfigured()) return true;
  return !isLocalDev() && Boolean(APPWRITE_PROJECT_ID);
}

export const gameClient = shouldUseAppwriteBackend()
  ? appwriteGameClient
  : signalRGameClient;

export function getBackendName(): string {
  if (shouldUseAppwriteBackend()) {
    return isGameFunctionConfigured() ? 'Appwrite' : 'Appwrite (function not set)';
  }
  return 'SignalR (local)';
}

export function getBackendSetupHint(): string | null {
  if (!shouldUseAppwriteBackend()) return null;
  if (isGameFunctionConfigured()) return null;
  return 'Deploy the game-api Appwrite function and set APPWRITE_FUNCTION_ID in src/lib/appwrite.ts (see appwrite/SETUP.md).';
}
