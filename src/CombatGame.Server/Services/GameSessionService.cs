using CombatGame.Domain;
using CombatGame.Domain.Commands;
using CombatGame.Domain.Dto;
using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;
using CombatGame.Domain.Lobby;
using CombatGame.Domain.Maps;
using CombatGame.Domain.Units;
using System.Collections.Concurrent;

namespace CombatGame.Server.Services;

public sealed class GameSession
{
    public required GameState State { get; init; }
    public HashSet<string> ConnectionIds { get; } = [];
    public Dictionary<string, int> ConnectionPlayers { get; } = new();
}

public sealed class GameSessionService
{
    private readonly ConcurrentDictionary<Guid, GameSession> _sessions = new();
    private readonly AiController _aiController;

    public GameSessionService(AiController aiController)
    {
        _aiController = aiController;
    }

    public (Guid gameId, GameStateDto state) CreateGame(GameMode mode)
    {
        var state = DefaultSkirmishMap.Create(mode);
        var session = new GameSession { State = state };
        _sessions[state.GameId] = session;
        return (state.GameId, GameStateMapper.ToDto(state));
    }

    public (Guid gameId, GameStateDto state) CreateLobby(string lobbyName, int hostPlayerId, string connectionId)
    {
        var state = DefaultSkirmishMap.CreateLobby(lobbyName, hostPlayerId);
        var session = new GameSession { State = state };
        session.ConnectionIds.Add(connectionId);
        session.ConnectionPlayers[connectionId] = hostPlayerId;
        _sessions[state.GameId] = session;
        return (state.GameId, GameStateMapper.ToDto(state));
    }

    public IReadOnlyList<LobbySummaryDto> ListLobbies()
    {
        return _sessions.Values
            .Where(s => s.State.Phase == GamePhase.Lobby && s.State.ConnectedPlayers.Count < 2)
            .Select(s => new LobbySummaryDto
            {
                GameId = s.State.GameId,
                LobbyName = s.State.LobbyName,
                PlayerCount = s.State.ConnectedPlayers.Count,
                Phase = s.State.Phase.ToString(),
                HostPlayerId = s.State.HostPlayerId
            })
            .ToList();
    }

    public GameStateDto? GetState(Guid gameId)
    {
        return _sessions.TryGetValue(gameId, out var session)
            ? GameStateMapper.ToDto(session.State)
            : null;
    }

    public (bool success, string? error, GameStateDto? state) JoinGame(Guid gameId, string connectionId, int playerId)
    {
        if (!_sessions.TryGetValue(gameId, out var session))
        {
            return (false, "Game not found.", null);
        }

        if (session.State.Mode == GameMode.Multiplayer)
        {
            if (playerId is not (0 or 1))
            {
                return (false, "Invalid player slot.", null);
            }

            if (session.ConnectionPlayers.Values.Contains(playerId) &&
                session.ConnectionPlayers.GetValueOrDefault(connectionId) != playerId)
            {
                return (false, "Player slot already taken.", null);
            }
        }

        session.ConnectionIds.Add(connectionId);
        session.ConnectionPlayers[connectionId] = playerId;

        if (session.State.Phase is GamePhase.Lobby or GamePhase.Loadout or GamePhase.Deployment)
        {
            if (!session.State.ConnectedPlayers.Contains(playerId))
            {
                var result = LobbyService.JoinLobby(session.State, playerId);
                if (!result.Success)
                {
                    return (false, result.Error, null);
                }
            }
        }
        else if (!session.State.ConnectedPlayers.Contains(playerId))
        {
            session.State.ConnectedPlayers.Add(playerId);
        }

        return (true, null, GameStateMapper.ToDto(session.State));
    }

    public (bool success, string? error, GameStateDto? state) UpdateLoadout(
        Guid gameId,
        int playerId,
        IReadOnlyList<LoadoutUnitDto> rosterDto)
    {
        if (!_sessions.TryGetValue(gameId, out var session))
        {
            return (false, "Game not found.", null);
        }

        var roster = ParseRoster(rosterDto);
        var result = LobbyService.UpdateLoadout(session.State, playerId, roster);
        return result.Success
            ? (true, null, GameStateMapper.ToDto(session.State))
            : (false, result.Error, null);
    }

    public (bool success, string? error, GameStateDto? state) SetLoadoutReady(Guid gameId, int playerId, bool ready)
    {
        if (!_sessions.TryGetValue(gameId, out var session))
        {
            return (false, "Game not found.", null);
        }

        var result = LobbyService.SetLoadoutReady(session.State, playerId, ready);
        return result.Success
            ? (true, null, GameStateMapper.ToDto(session.State))
            : (false, result.Error, null);
    }

    public (bool success, string? error, GameStateDto? state) DeployUnit(
        Guid gameId,
        int playerId,
        int rosterIndex,
        int q,
        int r)
    {
        if (!_sessions.TryGetValue(gameId, out var session))
        {
            return (false, "Game not found.", null);
        }

        var result = LobbyService.DeployUnit(session.State, playerId, rosterIndex, new HexCoord(q, r));
        return result.Success
            ? (true, null, GameStateMapper.ToDto(session.State))
            : (false, result.Error, null);
    }

    public (bool success, string? error, GameStateDto? state) ClearDeployment(
        Guid gameId,
        int playerId,
        int? rosterIndex)
    {
        if (!_sessions.TryGetValue(gameId, out var session))
        {
            return (false, "Game not found.", null);
        }

        var result = LobbyService.ClearDeployment(session.State, playerId, rosterIndex);
        return result.Success
            ? (true, null, GameStateMapper.ToDto(session.State))
            : (false, result.Error, null);
    }

    public (bool success, string? error, GameStateDto? state) SetDeploymentReady(Guid gameId, int playerId, bool ready)
    {
        if (!_sessions.TryGetValue(gameId, out var session))
        {
            return (false, "Game not found.", null);
        }

        var result = LobbyService.SetDeploymentReady(session.State, playerId, ready);
        return result.Success
            ? (true, null, GameStateMapper.ToDto(session.State))
            : (false, result.Error, null);
    }

    public (bool success, string? error, GameStateDto? state) LeaveLobby(Guid gameId, int playerId)
    {
        if (!_sessions.TryGetValue(gameId, out var session))
        {
            return (false, "Game not found.", null);
        }

        var result = LobbyService.LeaveLobby(session.State, playerId);
        return result.Success
            ? (true, null, GameStateMapper.ToDto(session.State))
            : (false, result.Error, null);
    }

    public void RemoveConnection(string connectionId)
    {
        foreach (var session in _sessions.Values)
        {
            if (session.ConnectionIds.Remove(connectionId))
            {
                if (session.ConnectionPlayers.Remove(connectionId, out var playerId))
                {
                    if (!session.ConnectionPlayers.Values.Contains(playerId))
                    {
                        session.State.ConnectedPlayers.Remove(playerId);
                    }
                }
            }
        }
    }

    public async Task<(bool success, string? error, GameStateDto? state, bool aiTurnPending)> SendCommandAsync(
        Guid gameId,
        GameCommandDto commandDto)
    {
        if (!_sessions.TryGetValue(gameId, out var session))
        {
            return (false, "Game not found.", null, false);
        }

        var command = GameStateMapper.FromDto(commandDto);
        var result = GameEngine.Execute(session.State, command);
        if (!result.Success)
        {
            return (false, result.Error, null, false);
        }

        var aiTurnPending = ShouldRunAi(session.State);
        if (aiTurnPending)
        {
            await _aiController.RunTurnAsync(session.State);
        }

        return (true, null, GameStateMapper.ToDto(session.State), false);
    }

    public bool ShouldRunAi(GameState state) =>
        state.Mode == GameMode.VsAi &&
        state.Phase == GamePhase.InProgress &&
        state.CurrentPlayerId == state.AiPlayerId;

    public IEnumerable<Guid> GetGameIdsForConnection(string connectionId)
    {
        foreach (var (gameId, session) in _sessions)
        {
            if (session.ConnectionIds.Contains(connectionId))
            {
                yield return gameId;
            }
        }
    }

    private static List<LoadoutUnit> ParseRoster(IReadOnlyList<LoadoutUnitDto> rosterDto)
    {
        return rosterDto.Select(u => new LoadoutUnit
        {
            UnitType = Enum.Parse<UnitType>(u.UnitType, true),
            Upgrades = u.Upgrades.Select(up => Enum.Parse<UpgradeType>(up, true)).ToList()
        }).ToList();
    }
}
