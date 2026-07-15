/**
 * Creates the `games` table and columns inside your existing Appwrite database.
 *
 * Usage (PowerShell):
 *   $env:APPWRITE_API_KEY = "your-server-api-key"
 *   node appwrite/scripts/setup-database.mjs
 */
import { Client, TablesDB, Permission, Role } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? '6a574b63000d15c7e337';
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? '6a5750b8002d1d05b18f';
const TABLE_ID = process.env.APPWRITE_GAMES_TABLE_ID ?? 'games';

const OPEN_PERMISSIONS = [
  Permission.read(Role.any()),
  Permission.create(Role.any()),
  Permission.update(Role.any()),
  Permission.delete(Role.any()),
];

const COLUMNS = [
  { key: 'state', size: 1_048_576 },
  { key: 'clientState', size: 1_048_576 },
  { key: 'mode', size: 64 },
  { key: 'connectedPlayers', size: 256 },
];

async function main() {
  if (!API_KEY) {
    console.error(`
Missing APPWRITE_API_KEY.

1. Appwrite Console → your project → API keys → Create API key
2. Enable scopes: databases.read, databases.write
3. Run:

   $env:APPWRITE_API_KEY = "paste-key-here"
   node appwrite/scripts/setup-database.mjs
`);
    process.exit(1);
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const tablesDB = new TablesDB(client);

  console.log(`Using database ${DATABASE_ID}, table ${TABLE_ID}`);

  let tableExists = false;
  try {
    await tablesDB.getTable({ databaseId: DATABASE_ID, tableId: TABLE_ID });
    tableExists = true;
    console.log(`Table "${TABLE_ID}" already exists.`);
  } catch {
    await tablesDB.createTable({
      databaseId: DATABASE_ID,
      tableId: TABLE_ID,
      name: 'Games',
      permissions: OPEN_PERMISSIONS,
      columns: COLUMNS.map((col) => ({
        key: col.key,
        type: 'string',
        size: col.size,
        required: true,
      })),
    });
    console.log(`Created table "${TABLE_ID}" with all columns.`);
    return;
  }

  if (tableExists) {
    for (const col of COLUMNS) {
      try {
        await tablesDB.createStringColumn({
          databaseId: DATABASE_ID,
          tableId: TABLE_ID,
          key: col.key,
          size: col.size,
          required: true,
        });
        console.log(`Added column "${col.key}".`);
      } catch (err) {
        const message = String(err?.message ?? err);
        if (message.includes('already exists') || message.includes('Attribute already exists')) {
          console.log(`Column "${col.key}" already exists.`);
        } else {
          throw err;
        }
      }
    }

    await tablesDB.updateTable({
      databaseId: DATABASE_ID,
      tableId: TABLE_ID,
      name: 'Games',
      permissions: OPEN_PERMISSIONS,
    });
    console.log('Table permissions set to open (Any can read/create/update/delete).');
  }

  console.log('\nDone. Next: deploy the game-api function (see appwrite/SETUP.md).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
