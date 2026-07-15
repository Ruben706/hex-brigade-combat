# Appwrite Setup (plain English)

You only need **three things** in Appwrite for this game:

| Thing | What it is | Your value |
|-------|------------|------------|
| **Database** | A folder that holds tables | `6a5750b8002d1d05b18f` (you already created this) |
| **Table** | One spreadsheet named `games` — each row is one saved game | Table ID: `games` |
| **Function** | Server code that runs combat rules when the website clicks buttons | Deploy `game-api` (see below) |

Appwrite’s console now says **Tables** and **Columns**. Older docs call them collections and attributes — same idea.

---

## Step 1 — Create the `games` table (automatic)

### Option A: Run the setup script (easiest)

1. In Appwrite Console → **API keys** → **Create API key**
2. Enable scopes: `databases.read`, `databases.write`
3. Copy the key, then in PowerShell from the repo root:

```powershell
$env:APPWRITE_API_KEY = "paste-your-api-key-here"
node appwrite/scripts/setup-database.mjs
```

This creates the `games` table with four text columns:

| Column | What it stores |
|--------|----------------|
| `state` | Full game state (JSON text) |
| `clientState` | What the browser needs to draw the board (JSON text) |
| `mode` | Hotseat / VsAi / Multiplayer |
| `connectedPlayers` | Which players joined (JSON text) |

### Option B: Create manually in the console

1. Open your database (`6a5750b8002d1d05b18f`)
2. Click **Create table** → name it **Games**, set Table ID to `games`
3. Go to **Columns** → create four **String** columns (same names as above; size 1,048,576 for `state` and `clientState`, 64 for `mode`, 256 for `connectedPlayers`; all required)
4. Go to **Settings** → **Permissions** → add role **Any** with Create, Read, Update, Delete

---

## Step 2 — Deploy the game function

The function is the game’s brain on the server. The website calls it for “New game”, moves, attacks, etc.

### Install Appwrite CLI (one time)

```powershell
npm install -g appwrite-cli
appwrite login
```

### Deploy

```powershell
cd appwrite
appwrite init project
# Select your project "Test project" (ID: 6a574b63000d15c7e337)

cd functions/game-api
npm install
npm run build
cd ../..
appwrite push functions
```

After deploy, open **Functions** in the console and copy the **Function ID** of `game-api`.

### Set function environment variables

In Appwrite Console → **Functions** → **game-api** → **Settings** → **Environment variables**:

| Variable | Value |
|----------|-------|
| `APPWRITE_API_KEY` | Same API key as step 1 (needs databases.read + databases.write) |
| `APPWRITE_DATABASE_ID` | `6a5750b8002d1d05b18f` |
| `APPWRITE_GAMES_COLLECTION_ID` | `games` |

`APPWRITE_FUNCTION_API_ENDPOINT` and `APPWRITE_FUNCTION_PROJECT_ID` are set automatically by Appwrite.

---

## Step 3 — Tell the website which function to use

The function ID is **`game-api`** (already set in `src/CombatGame.Client/src/lib/appwrite.ts`).

```ts
export const APPWRITE_FUNCTION_ID =
  import.meta.env.VITE_APPWRITE_FUNCTION_ID || 'game-api';
```

Or set `VITE_APPWRITE_FUNCTION_ID` in `src/CombatGame.Client/.env.local` for local builds.

**Automated deploy (from repo root):**

```powershell
cd appwrite/scripts
npm ci
cd ../..
$env:APPWRITE_API_KEY = "your-api-key"
node appwrite/scripts/deploy-function.mjs
```

For GitHub Pages, add repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|----------|-------|
| `VITE_APPWRITE_FUNCTION_ID` | `game-api` |
| `VITE_APPWRITE_DATABASE_ID` | `6a5750b8002d1d05b18f` |
| `VITE_APPWRITE_GAMES_COLLECTION_ID` | `games` |

---

## Step 4 — Allow your website to connect (CORS)

Appwrite Console → **Overview** → **Add platform** → **Web app**:

- `localhost` (for local dev)
- `ruben706.github.io` (for the live site)

---

## Quick test

1. Deploy function and set the function ID
2. Open https://ruben706.github.io/hex-brigade-combat/
3. Open browser DevTools → Console — you should see `Appwrite ping OK`
4. Click **Hotseat** or **vs AI** — a new row should appear in the `games` table

---

## Local development

- **localhost** uses the .NET SignalR server by default (run `dotnet run --project src/CombatGame.Server`)
- To test Appwrite locally, set `VITE_APPWRITE_FUNCTION_ID` in `.env.local` and rebuild the client
