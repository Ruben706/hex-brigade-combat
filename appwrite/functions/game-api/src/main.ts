import { Client, Databases } from 'node-appwrite';
import {
  createSkirmish,
  executeCommand,
  runAiTurn,
  toDto,
  type GameCommand,
  type GameMode,
} from './domain/gameDomain.js';

const DB_ID = process.env.APPWRITE_DATABASE_ID || 'combat';
const COLLECTION_ID = process.env.APPWRITE_GAMES_COLLECTION_ID || 'games';

function getDatabases(): Databases {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT!)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);
  return new Databases(client);
}

async function loadState(databases: Databases, gameId: string): Promise<import('./domain/gameDomain.js').InternalGameState | null> {
  try {
    const doc = await databases.getDocument(DB_ID, COLLECTION_ID, gameId);
    return JSON.parse(doc.state as string);
  } catch {
    return null;
  }
}

async function saveState(databases: Databases, state: import('./domain/gameDomain.js').InternalGameState): Promise<void> {
  const dto = toDto(state);
  const payload = {
    state: JSON.stringify(state),
    clientState: JSON.stringify(dto),
    mode: dto.mode,
    connectedPlayers: JSON.stringify(dto.connectedPlayers),
  };

  try {
    await databases.updateDocument(DB_ID, COLLECTION_ID, state.gameId, payload);
  } catch {
    await databases.createDocument(DB_ID, COLLECTION_ID, state.gameId, payload);
  }
}

interface RequestBody {
  action: string;
  mode?: GameMode;
  gameId?: string;
  playerId?: number;
  command?: GameCommand;
}

export default async function handler({ req, res, log, error }: {
  req: { body: string; method: string };
  res: { json: (body: unknown, status?: number) => void };
  log: (msg: string) => void;
  error: (msg: string) => void;
}): Promise<void> {
  try {
    if (req.method === 'GET') {
      return res.json({ status: 'ok', service: 'hex-brigade-combat' });
    }

    const body: RequestBody = req.body ? JSON.parse(req.body) : {};
    const databases = getDatabases();

    switch (body.action) {
      case 'createGame': {
        const mode = body.mode || 'Hotseat';
        const internal = createSkirmish(mode);
        await saveState(databases, internal);
        const dto = toDto(internal);
        log(`Created game ${dto.gameId} mode=${mode}`);
        return res.json({ success: true, gameId: dto.gameId, state: dto });
      }

      case 'joinGame': {
        if (!body.gameId || body.playerId === undefined) {
          return res.json({ success: false, error: 'gameId and playerId required' }, 400);
        }
        const internal = await loadState(databases, body.gameId);
        if (!internal) return res.json({ success: false, error: 'Game not found' }, 404);

        if (!internal.connectedPlayers.includes(body.playerId)) {
          internal.connectedPlayers.push(body.playerId);
          await saveState(databases, internal);
        }
        return res.json({ success: true, state: toDto(internal) });
      }

      case 'sendCommand': {
        if (!body.gameId || !body.command) {
          return res.json({ success: false, error: 'gameId and command required' }, 400);
        }

        const internal = await loadState(databases, body.gameId);
        if (!internal) return res.json({ success: false, error: 'Game not found' }, 404);

        const result = executeCommand(internal, body.command);
        if (!result.success) {
          return res.json({ success: false, error: result.error });
        }

        if (
          internal.mode === 'VsAi' &&
          internal.phase === 'InProgress' &&
          internal.currentPlayerId === internal.aiPlayerId
        ) {
          runAiTurn(internal);
        }

        await saveState(databases, internal);
        return res.json({ success: true, state: toDto(internal) });
      }

      case 'getState': {
        if (!body.gameId) return res.json({ success: false, error: 'gameId required' }, 400);
        const internal = await loadState(databases, body.gameId);
        if (!internal) return res.json({ success: false, error: 'Game not found' }, 404);
        return res.json({ success: true, state: toDto(internal) });
      }

      default:
        return res.json({ success: false, error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    error(String(err));
    return res.json({ success: false, error: String(err) }, 500);
  }
}
