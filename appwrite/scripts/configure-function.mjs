/**
 * Sets game-api function environment variables after deploy.
 * Reads APPWRITE_API_KEY from the environment.
 */
import { Client, Functions } from '../functions/game-api/node_modules/node-appwrite/dist/index.mjs';

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? '6a574b63000d15c7e337';
const API_KEY = process.env.APPWRITE_API_KEY;
const FUNCTION_ID = process.env.APPWRITE_FUNCTION_ID ?? 'game-api';

const VARS = [
  { id: 'appwrite-api-key', key: 'APPWRITE_API_KEY', value: API_KEY, secret: true },
  { id: 'appwrite-database-id', key: 'APPWRITE_DATABASE_ID', value: '6a5750b8002d1d05b18f' },
  { id: 'appwrite-games-table-id', key: 'APPWRITE_GAMES_COLLECTION_ID', value: 'games' },
];

async function upsertVariable(functions, spec) {
  try {
    await functions.updateVariable({
      functionId: FUNCTION_ID,
      variableId: spec.id,
      key: spec.key,
      value: spec.value,
      secret: spec.secret ?? false,
    });
    console.log(`Updated ${spec.key}`);
  } catch {
    await functions.createVariable({
      functionId: FUNCTION_ID,
      variableId: spec.id,
      key: spec.key,
      value: spec.value,
      secret: spec.secret ?? false,
    });
    console.log(`Created ${spec.key}`);
  }
}

async function main() {
  if (!API_KEY) {
    console.error('Set APPWRITE_API_KEY first.');
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const functions = new Functions(client);

  for (const spec of VARS) {
    if (!spec.value) continue;
    await upsertVariable(functions, spec);
  }

  console.log(`Function ${FUNCTION_ID} variables configured.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
