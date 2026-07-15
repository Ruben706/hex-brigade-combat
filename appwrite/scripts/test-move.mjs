import { Client, Functions } from '../functions/game-api/node_modules/node-appwrite/dist/index.mjs';

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? '6a574b63000d15c7e337';
const API_KEY = process.env.APPWRITE_API_KEY;
const FUNCTION_ID = 'game-api';

async function invoke(body) {
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const functions = new Functions(client);
  const exec = await functions.createExecution({
    functionId: FUNCTION_ID,
    body: JSON.stringify(body),
    async: false,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return JSON.parse(exec.responseBody);
}

async function main() {
  const created = await invoke({ action: 'createGame', mode: 'Hotseat' });
  if (!created.success) throw new Error(created.error);
  const gameId = created.gameId;
  const brigade = created.state.brigades.find((b) => b.playerId === 0);
  const move = await invoke({
    action: 'sendCommand',
    gameId,
    command: {
      type: 'Move',
      playerId: 0,
      brigadeId: brigade.id,
      targetQ: brigade.q - 1,
      targetR: brigade.r,
    },
  });
  console.log('move success', move.success, move.error ?? '');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
