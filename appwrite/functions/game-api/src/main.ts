import { Client, TablesDB } from 'node-appwrite';
import {
  coerceInternalState,
  createSkirmish,
  ensureMapGenerated,
  executeCommand,
  runAiTurn,
  toDto,
  commandFromDto,
  type GameCommand,
  type GameCommandDto,
  type GameMode,
} from './domain/gameDomain.js';

const DB_ID = process.env.APPWRITE_DATABASE_ID || '6a5750b8002d1d05b18f';
const TABLE_ID = process.env.APPWRITE_GAMES_COLLECTION_ID || 'games';

function getTablesDB(): TablesDB {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT!)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);
  return new TablesDB(client);
}

async function loadState(
  tablesDB: TablesDB,
  gameId: string,
): Promise<import('./domain/gameDomain.js').InternalGameState | null> {
  try {
    const row = await tablesDB.getRow({
      databaseId: DB_ID,
      tableId: TABLE_ID,
      rowId: gameId,
    });
    const parsed = JSON.parse(row.state as string) as Record<string, unknown>;
    const state = coerceInternalState(parsed);
    if (ensureMapGenerated(state)) {
      await saveState(tablesDB, state);
    }
    return state;
  } catch {
    return null;
  }
}

async function saveState(
  tablesDB: TablesDB,
  state: import('./domain/gameDomain.js').InternalGameState,
): Promise<void> {
  const dto = toDto(state);
  const data = {
    state: JSON.stringify(state),
    clientState: JSON.stringify(dto),
    mode: dto.mode,
    connectedPlayers: JSON.stringify(dto.connectedPlayers),
  };

  await tablesDB.upsertRow({
    databaseId: DB_ID,
    tableId: TABLE_ID,
    rowId: state.gameId,
    data,
  });
}

interface RequestBody {
  action: string;
  mode?: GameMode;
  gameId?: string;
  playerId?: number;
  command?: GameCommandDto;
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

    const rawBody = req.body;
    const body: RequestBody =
      typeof rawBody === 'string'
        ? rawBody
          ? JSON.parse(rawBody)
          : {}
        : (rawBody ?? {});
    const tablesDB = getTablesDB();

    switch (body.action) {
      case 'createGame': {
        const mode = body.mode || 'Hotseat';
        const internal = createSkirmish(mode);
        ensureMapGenerated(internal);
        await saveState(tablesDB, internal);
        const dto = toDto(internal);
        log(`Created game ${dto.gameId} mode=${mode}`);
        return res.json({ success: true, gameId: dto.gameId, state: dto });
      }

      case 'joinGame': {
        if (!body.gameId || body.playerId === undefined) {
          return res.json({ success: false, error: 'gameId and playerId required' }, 400);
        }
        const internal = await loadState(tablesDB, body.gameId);
        if (!internal) return res.json({ success: false, error: 'Game not found' }, 404);

        if (!internal.connectedPlayers.includes(body.playerId)) {
          internal.connectedPlayers.push(body.playerId);
          await saveState(tablesDB, internal);
        }
        return res.json({ success: true, state: toDto(internal) });
      }

      case 'sendCommand': {
        if (!body.gameId || !body.command) {
          return res.json({ success: false, error: 'gameId and command required' }, 400);
        }

        const internal = await loadState(tablesDB, body.gameId);
        if (!internal) return res.json({ success: false, error: 'Game not found' }, 404);

        const commandPayload =
          typeof body.command === 'string'
            ? (JSON.parse(body.command) as GameCommandDto)
            : body.command;
        const result = executeCommand(internal, commandFromDto(commandPayload));
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

        await saveState(tablesDB, internal);
        return res.json({ success: true, state: toDto(internal) });
      }

      case 'getState': {
        if (!body.gameId) return res.json({ success: false, error: 'gameId required' }, 400);
        const internal = await loadState(tablesDB, body.gameId);
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
