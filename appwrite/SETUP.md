# Appwrite Backend Setup

The game uses **Appwrite Functions** for authoritative game logic and **Appwrite Realtime** to sync state to clients.

## 1. Create an Appwrite project

1. Sign up at [cloud.appwrite.io](https://cloud.appwrite.io) (or self-host)
2. Create a project (e.g. `hex-brigade-combat`)
3. Note your **Project ID** and **API Endpoint** (e.g. `https://cloud.appwrite.io/v1`)

## 2. Create the database

In **Databases**, create:

| Setting | Value |
|---------|-------|
| Database ID | `combat` |
| Collection ID | `games` |

**Collection attributes:**

| Key | Type | Size | Required |
|-----|------|------|----------|
| `state` | String | 1,048,576 | Yes |
| `clientState` | String | 1,048,576 | Yes |
| `mode` | String | 64 | Yes |
| `connectedPlayers` | String | 256 | Yes |

**Collection permissions** (open access for prototype — tighten for production):

- Create: Any
- Read: Any
- Update: Any
- Delete: Any

## 3. Deploy the function

Install the [Appwrite CLI](https://appwrite.io/docs/tooling/command-line/installation):

```bash
npm install -g appwrite-cli
appwrite login
cd appwrite
appwrite init project
appwrite deploy function
```

Set function environment variables in the Appwrite Console:

| Variable | Value |
|----------|-------|
| `APPWRITE_API_KEY` | API key with Databases read/write |
| `APPWRITE_DATABASE_ID` | `combat` |
| `APPWRITE_GAMES_COLLECTION_ID` | `games` |

`APPWRITE_FUNCTION_API_ENDPOINT` and `APPWRITE_FUNCTION_PROJECT_ID` are injected automatically.

## 4. Configure the client

Create `src/CombatGame.Client/.env.local`:

```env
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your-project-id
VITE_APPWRITE_FUNCTION_ID=your-function-id
VITE_APPWRITE_DATABASE_ID=combat
VITE_APPWRITE_GAMES_COLLECTION_ID=games
```

For GitHub Pages, add the same values as **repository variables** (Settings → Secrets and variables → Actions → Variables) with the `VITE_` prefix.

## 5. Add a Web platform

In Appwrite Console → **Overview** → **Add platform** → **Web app**:

- Hostname: `localhost` (dev)
- Hostname: `ruben706.github.io` (production)

Without this, browser requests will be blocked by CORS.
