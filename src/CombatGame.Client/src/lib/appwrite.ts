import { Account, Client, Databases } from 'appwrite';

export const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
export const APPWRITE_PROJECT_ID = '6a574b63000d15c7e337';
export const APPWRITE_PROJECT_NAME = 'Test project';

/** Set this after deploying the game-api function (Appwrite Console → Functions). */
export const APPWRITE_FUNCTION_ID =
  import.meta.env.VITE_APPWRITE_FUNCTION_ID || 'game-api';

/** Your Appwrite database (one database is enough — games are stored in a table inside it). */
export const APPWRITE_DATABASE_ID =
  import.meta.env.VITE_APPWRITE_DATABASE_ID || '6a5750b8002d1d05b18f';

/** Table ID inside the database (Appwrite console calls these "tables", older docs say "collections"). */
export const APPWRITE_GAMES_COLLECTION_ID =
  import.meta.env.VITE_APPWRITE_GAMES_COLLECTION_ID || 'games';

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const account = new Account(client);
const databases = new Databases(client);

export { client, account, databases };

/** Pings the Appwrite backend on app load to verify connectivity. */
export async function pingAppwriteBackend(): Promise<boolean> {
  try {
    await client.ping();
    console.info(`Appwrite ping OK (${APPWRITE_PROJECT_NAME})`);
    return true;
  } catch (err) {
    console.warn('Appwrite ping failed:', err);
    return false;
  }
}
