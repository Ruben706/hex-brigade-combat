using CombatGame.Domain.Commands;
using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;
using CombatGame.Domain.Maps;
using CombatGame.Domain.Turn;
using CombatGame.Domain.Units;

namespace CombatGame.Domain.Lobby;

public static class LobbyService
{
    public static CommandResult CreateLobby(GameState state, string lobbyName, int hostPlayerId)
    {
        state.LobbyName = string.IsNullOrWhiteSpace(lobbyName) ? "Skirmish" : lobbyName.Trim();
        state.HostPlayerId = hostPlayerId;
        state.Phase = GamePhase.Lobby;
        state.Brigades.Clear();
        state.ConnectedPlayers.Clear();
        state.ConnectedPlayers.Add(hostPlayerId);
        InitPlayerLobbyState(state, 0);
        InitPlayerLobbyState(state, 1);
        state.AddEvent(GameEventType.TurnEnded, $"Lobby created by Player {hostPlayerId}.");
        return CommandResult.Ok();
    }

    public static CommandResult JoinLobby(GameState state, int playerId)
    {
        if (state.Mode != GameMode.Multiplayer)
        {
            return CommandResult.Fail("Not a multiplayer game.");
        }

        if (playerId is not (0 or 1))
        {
            return CommandResult.Fail("Invalid player slot.");
        }

        if (state.ConnectedPlayers.Contains(playerId))
        {
            return CommandResult.Ok();
        }

        if (state.ConnectedPlayers.Count >= 2)
        {
            return CommandResult.Fail("Lobby is full.");
        }

        state.ConnectedPlayers.Add(playerId);
        MaybeAdvanceFromLobby(state);
        return CommandResult.Ok();
    }

    public static CommandResult UpdateLoadout(GameState state, int playerId, IReadOnlyList<LoadoutUnit> roster)
    {
        if (state.Phase != GamePhase.Loadout)
        {
            return CommandResult.Fail("Not in loadout phase.");
        }

        if (!state.ConnectedPlayers.Contains(playerId))
        {
            return CommandResult.Fail("Player not in lobby.");
        }

        if (!ArmyBuilder.TryValidateRoster(roster, out var error))
        {
            return CommandResult.Fail(error!);
        }

        var loadout = GetOrCreateLoadout(state, playerId);
        loadout.Roster = roster.Select(u => new LoadoutUnit
        {
            UnitType = u.UnitType,
            Upgrades = u.Upgrades.ToList()
        }).ToList();
        loadout.Ready = false;
        return CommandResult.Ok();
    }

    public static CommandResult SetLoadoutReady(GameState state, int playerId, bool ready)
    {
        if (state.Phase != GamePhase.Loadout)
        {
            return CommandResult.Fail("Not in loadout phase.");
        }

        var loadout = GetOrCreateLoadout(state, playerId);
        if (ready && !ArmyBuilder.TryValidateRoster(loadout.Roster, out var error))
        {
            return CommandResult.Fail(error!);
        }

        loadout.Ready = ready;
        MaybeAdvanceFromLoadout(state);
        return CommandResult.Ok();
    }

    public static CommandResult DeployUnit(GameState state, int playerId, int rosterIndex, HexCoord coord)
    {
        if (state.Phase != GamePhase.Deployment)
        {
            return CommandResult.Fail("Not in deployment phase.");
        }

        var loadout = GetOrCreateLoadout(state, playerId);
        if (rosterIndex < 0 || rosterIndex >= loadout.Roster.Count)
        {
            return CommandResult.Fail("Invalid roster index.");
        }

        if (!ArmyBuilder.IsInDeploymentZone(playerId, coord, state.Grid.Width))
        {
            return CommandResult.Fail("Tile is outside your deployment zone.");
        }

        if (!state.Grid.Contains(coord))
        {
            return CommandResult.Fail("Tile is outside the map.");
        }

        if (!TerrainHelper.IsPassable(state.Grid.GetTerrain(coord)))
        {
            return CommandResult.Fail("Tile is not passable.");
        }

        var placements = GetOrCreateDeployments(state, playerId);
        var occupied = new HashSet<HexCoord>();
        foreach (var (pid, list) in state.PlayerDeployments)
        {
            foreach (var p in list)
            {
                if (pid == playerId && p.RosterIndex == rosterIndex)
                {
                    continue;
                }

                occupied.Add(new HexCoord(p.Q, p.R));
            }
        }

        if (occupied.Contains(coord))
        {
            return CommandResult.Fail("Tile is already occupied.");
        }

        var existing = placements.FirstOrDefault(p => p.RosterIndex == rosterIndex);
        if (existing is not null)
        {
            existing.Q = coord.Q;
            existing.R = coord.R;
        }
        else
        {
            placements.Add(new DeploymentPlacement { RosterIndex = rosterIndex, Q = coord.Q, R = coord.R });
        }

        state.DeploymentReady[playerId] = false;
        return CommandResult.Ok();
    }

    public static CommandResult ClearDeployment(GameState state, int playerId, int? rosterIndex)
    {
        if (state.Phase != GamePhase.Deployment)
        {
            return CommandResult.Fail("Not in deployment phase.");
        }

        var placements = GetOrCreateDeployments(state, playerId);
        if (rosterIndex.HasValue)
        {
            placements.RemoveAll(p => p.RosterIndex == rosterIndex.Value);
        }
        else
        {
            placements.Clear();
        }

        state.DeploymentReady[playerId] = false;
        return CommandResult.Ok();
    }

    public static CommandResult SetDeploymentReady(GameState state, int playerId, bool ready)
    {
        if (state.Phase != GamePhase.Deployment)
        {
            return CommandResult.Fail("Not in deployment phase.");
        }

        var loadout = GetOrCreateLoadout(state, playerId);
        var placements = GetOrCreateDeployments(state, playerId);

        if (ready)
        {
            if (placements.Count != loadout.Roster.Count)
            {
                return CommandResult.Fail("Place all roster units before ready.");
            }

            if (placements.Select(p => p.RosterIndex).Distinct().Count() != loadout.Roster.Count)
            {
                return CommandResult.Fail("Each roster unit must be placed once.");
            }
        }

        state.DeploymentReady[playerId] = ready;
        MaybeStartBattle(state);
        return CommandResult.Ok();
    }

    public static CommandResult LeaveLobby(GameState state, int playerId)
    {
        state.ConnectedPlayers.Remove(playerId);
        if (state.HostPlayerId == playerId && state.Phase is GamePhase.Lobby or GamePhase.Loadout or GamePhase.Deployment)
        {
            state.Phase = GamePhase.Victory;
            state.WinnerId = null;
            state.AddEvent(GameEventType.GameOver, "Host left the lobby.");
        }

        return CommandResult.Ok();
    }

    public static void SpawnBrigadesFromLoadout(GameState state)
    {
        state.Brigades.Clear();
        foreach (var playerId in state.ConnectedPlayers.Order())
        {
            var loadout = GetOrCreateLoadout(state, playerId);
            var placements = GetOrCreateDeployments(state, playerId)
                .OrderBy(p => p.RosterIndex)
                .ToList();

            for (var i = 0; i < loadout.Roster.Count; i++)
            {
                var unit = loadout.Roster[i];
                var placement = placements.First(p => p.RosterIndex == i);
                var position = new HexCoord(placement.Q, placement.R);
                var brigade = UnitCatalog.CreateBrigade(unit.UnitType, playerId, position);
                foreach (var upgrade in unit.Upgrades)
                {
                    brigade.Upgrades.Add(upgrade);
                }

                brigade.FromLoadout = true;
                ApplyLoadoutSetup(brigade);
                state.Brigades.Add(brigade);
            }
        }

        TurnManager.ResetBrigadeTurnStates(state);
    }

    private static void ApplyLoadoutSetup(Brigade brigade)
    {
        if (brigade.UnitType == UnitType.Artillery &&
            brigade.Upgrades.Contains(UpgradeType.RapidDeployment))
        {
            brigade.StatusEffects.Add(new StatusEffect
            {
                Type = StatusEffectType.ArtilleryReady,
                RemainingTurns = -1
            });
        }
    }

    private static void MaybeAdvanceFromLobby(GameState state)
    {
        if (state.Phase != GamePhase.Lobby || state.ConnectedPlayers.Count < 2)
        {
            return;
        }

        state.Phase = GamePhase.Loadout;
        state.AddEvent(GameEventType.TurnEnded, "Both players connected — configure your army.");
    }

    private static void MaybeAdvanceFromLoadout(GameState state)
    {
        if (state.Phase != GamePhase.Loadout)
        {
            return;
        }

        if (!state.ConnectedPlayers.All(pid => GetOrCreateLoadout(state, pid).Ready))
        {
            return;
        }

        state.Phase = GamePhase.Deployment;
        foreach (var playerId in state.ConnectedPlayers)
        {
            GetOrCreateDeployments(state, playerId).Clear();
            state.DeploymentReady[playerId] = false;
        }

        state.AddEvent(GameEventType.TurnEnded, "Armies ready — deploy your units.");
    }

    private static void MaybeStartBattle(GameState state)
    {
        if (state.Phase != GamePhase.Deployment)
        {
            return;
        }

        if (!state.ConnectedPlayers.All(pid => state.DeploymentReady.GetValueOrDefault(pid)))
        {
            return;
        }

        SpawnBrigadesFromLoadout(state);
        state.Phase = GamePhase.InProgress;
        state.CurrentPlayerId = 0;
        state.TurnNumber = 1;
        state.AddEvent(GameEventType.TurnEnded, "Battle begins! Player 0's turn.");
    }

    private static void InitPlayerLobbyState(GameState state, int playerId)
    {
        GetOrCreateLoadout(state, playerId);
        GetOrCreateDeployments(state, playerId);
        state.DeploymentReady[playerId] = false;
    }

    private static PlayerLoadout GetOrCreateLoadout(GameState state, int playerId)
    {
        if (!state.PlayerLoadouts.TryGetValue(playerId, out var loadout))
        {
            loadout = new PlayerLoadout();
            state.PlayerLoadouts[playerId] = loadout;
        }

        return loadout;
    }

    private static List<DeploymentPlacement> GetOrCreateDeployments(GameState state, int playerId)
    {
        if (!state.PlayerDeployments.TryGetValue(playerId, out var placements))
        {
            placements = [];
            state.PlayerDeployments[playerId] = placements;
        }

        return placements;
    }
}
