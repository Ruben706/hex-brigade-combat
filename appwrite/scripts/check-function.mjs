import { Client, Functions } from '../functions/game-api/node_modules/node-appwrite/dist/index.mjs';

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? '6a574b63000d15c7e337';
const API_KEY = process.env.APPWRITE_API_KEY;
const FUNCTION_ID = process.env.APPWRITE_FUNCTION_ID ?? 'game-api';
const DEPLOYMENT_ID = process.argv[2];

async function main() {
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const functions = new Functions(client);

  if (DEPLOYMENT_ID) {
    const d = await functions.getDeployment({ functionId: FUNCTION_ID, deploymentId: DEPLOYMENT_ID });
    console.log('deployment', d.$id, d.status, d.buildStatus);
    return;
  }

  const fn = await functions.get({ functionId: FUNCTION_ID });
  console.log('function', fn.$id, 'deployment', fn.deploymentId, 'live', fn.live);

  const exec = await functions.createExecution({
    functionId: FUNCTION_ID,
    body: JSON.stringify({ action: 'createGame', mode: 'Hotseat' }),
    async: false,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  console.log('execution', exec.status, exec.responseStatusCode);
  console.log(exec.responseBody?.slice(0, 300));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
