import { Client, Functions, Runtime } from '../functions/game-api/node_modules/node-appwrite/dist/index.mjs';
import { InputFile } from '../functions/game-api/node_modules/node-appwrite/dist/inputFile.mjs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FUNCTION_DIR = join(ROOT, 'functions', 'game-api');
const STAGE_DIR = join(ROOT, '.deploy-stage');
const ARCHIVE = join(ROOT, '.deploy-game-api.tar.gz');

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? '6a574b63000d15c7e337';
const API_KEY = process.env.APPWRITE_API_KEY;
const FUNCTION_ID = process.env.APPWRITE_FUNCTION_ID ?? 'game-api';

async function stageFunction() {
  await rm(STAGE_DIR, { recursive: true, force: true });
  await mkdir(STAGE_DIR, { recursive: true });
  await cp(FUNCTION_DIR, STAGE_DIR, {
    recursive: true,
    filter: (src) => !src.includes('node_modules'),
  });
  execSync('tar -czf .deploy-game-api.tar.gz -C .deploy-stage .', { cwd: ROOT, stdio: 'inherit' });
}

async function ensureFunction(functions) {
  try {
    return await functions.get({ functionId: FUNCTION_ID });
  } catch {
    return functions.create({
      functionId: FUNCTION_ID,
      name: 'Game API',
      runtime: Runtime.Node180,
      execute: ['any'],
      entrypoint: 'dist/main.js',
      commands: 'npm install && npm run build',
      timeout: 30,
    });
  }
}

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

  console.log('Staging function code...');
  await stageFunction();

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const functions = new Functions(client);

  console.log('Ensuring function exists...');
  await ensureFunction(functions);

  console.log('Uploading deployment...');
  const deployment = await functions.createDeployment({
    functionId: FUNCTION_ID,
    code: InputFile.fromPath(ARCHIVE, 'game-api.tar.gz'),
    activate: true,
    entrypoint: 'dist/main.js',
    commands: 'npm install && npm run build',
  });
  console.log(`Deployment ${deployment.$id} status: ${deployment.status}`);

  const vars = [
    { id: 'appwrite-api-key', key: 'APPWRITE_API_KEY', value: API_KEY, secret: true },
    { id: 'appwrite-database-id', key: 'APPWRITE_DATABASE_ID', value: '6a5750b8002d1d05b18f' },
    { id: 'appwrite-games-table-id', key: 'APPWRITE_GAMES_COLLECTION_ID', value: 'games' },
  ];
  for (const spec of vars) {
    await upsertVariable(functions, spec);
  }

  console.log(`\nDone. Function ID: ${FUNCTION_ID}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
