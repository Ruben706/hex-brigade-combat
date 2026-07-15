# Hex Brigade Combat

Turn-based tactical combat on a hexagonal grid. Brigades of Infantry, Tanks, Artillery, and Anti-Tank units fight using independent weapons, abilities, and experience-based upgrades.

## Features

- **Hex grid combat** with range-based attacks
- **Four unit types**: Infantry, Tank, Artillery, Anti-Tank
- **Independent weapons** per brigade (e.g. tank main gun + machine gun)
- **Abilities**: Dig In (infantry), Setup (artillery), Ambush (anti-tank)
- **Damage effectiveness matrix** (small arms weak vs tanks, anti-armor strong vs tanks)
- **XP upgrades** per unit type
- **Game modes**: Hotseat, vs AI, browser multiplayer (SignalR)

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org/) 18+

## Run locally

**Terminal 1 — Server**

```bash
dotnet run --project src/CombatGame.Server
```

Server listens on `http://localhost:5280`.

**Terminal 2 — Client**

```bash
cd src/CombatGame.Client
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## How to play

1. Choose **Hotseat**, **vs AI**, or **Multiplayer**
2. Click one of your brigades (colored token on the map)
3. Use **Move**, weapon buttons, or abilities from the side panel
4. Click a highlighted hex to move or attack
5. Press **End Turn** when finished

### Multiplayer

- Player 1: click **Create Multiplayer Game** and share the Game ID
- Player 2: paste the Game ID and click **Join as Player 2**

## Run tests

```bash
dotnet test
```

## Deployment (GitHub Pages)

The Vite client deploys automatically to GitHub Pages on every push to `master` via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

**Live site:** https://ruben706.github.io/hex-brigade-combat/

### First-time setup

1. Open the repo on GitHub → **Settings** → **Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push to `master` — the deploy workflow runs automatically

### Backend for production play

GitHub Pages hosts static files only. The game server (`CombatGame.Server`) must run elsewhere for multiplayer/hotseat to work online.

1. Host the .NET server (Azure, Railway, Fly.io, etc.) and note its public URL
2. In the GitHub repo, go to **Settings** → **Secrets and variables** → **Actions** → **Variables**
3. Add repository variable `VITE_HUB_URL` = `https://your-server.example.com/hub/game`
4. Re-run the **Deploy to GitHub Pages** workflow

Without `VITE_HUB_URL`, the deployed site loads but cannot connect to a game server.

### CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on push and pull requests:

- `dotnet test` for game rules
- Client TypeScript build

## Project structure

```
src/
├── CombatGame.Domain/     # Game rules (hex, units, combat, turns)
├── CombatGame.Server/     # ASP.NET Core + SignalR hub
├── CombatGame.Client/     # Vite + TypeScript canvas UI
└── CombatGame.Domain.Tests/
```
