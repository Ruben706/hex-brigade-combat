using CombatGame.Domain;
using CombatGame.Domain.Commands;
using CombatGame.Domain.Dto;
using CombatGame.Domain.Enums;
using CombatGame.Domain.Maps;
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

            if (session.State.ConnectedPlayers.Contains(playerId) &&
                !session.ConnectionPlayers.Any(kv => kv.Value == playerId && kv.Key == connectionId))
            {
                return (false, "Player slot already taken.", null);
            }
        }

        session.ConnectionIds.Add(connectionId);
        session.ConnectionPlayers[connectionId] = playerId;
        session.State.ConnectedPlayers.Add(playerId);

        return (true, null, GameStateMapper.ToDto(session.State));
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
}
