import { Account, Client, Databases } from 'appwrite';

export const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
export const APPWRITE_PROJECT_ID = '6a574b63000d15c7e337';
export const APPWRITE_PROJECT_NAME = 'Test project';

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
