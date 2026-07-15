using CombatGame.Domain.Dto;
using CombatGame.Domain.Enums;
using CombatGame.Server.Services;
using Microsoft.AspNetCore.SignalR;

namespace CombatGame.Server.Hubs;

public sealed class GameHub : Hub
{
    private readonly GameSessionService _gameService;

    public GameHub(GameSessionService gameService)
    {
        _gameService = gameService;
    }

    public object CreateGame(string mode)
    {
        if (!Enum.TryParse<GameMode>(mode, true, out var gameMode))
        {
            gameMode = GameMode.Hotseat;
        }

        var (gameId, state) = _gameService.CreateGame(gameMode);
        return new { gameId, state };
    }

    public async Task<object> CreateLobby(string lobbyName, int playerId)
    {
        var (gameId, state) = _gameService.CreateLobby(lobbyName, playerId, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, gameId.ToString());
        return new { gameId, state };
    }

    public object ListLobbies()
    {
        return new { lobbies = _gameService.ListLobbies() };
    }

    public async Task<object> JoinGame(Guid gameId, int playerId)
    {
        var (success, error, state) = _gameService.JoinGame(gameId, Context.ConnectionId, playerId);
        if (!success)
        {
            return new { success = false, error };
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, gameId.ToString());
        await Clients.Group(gameId.ToString()).SendAsync("StateChanged", state);
        return new { success = true, state };
    }

    public async Task<object> UpdateLoadout(Guid gameId, int playerId, List<LoadoutUnitDto> roster)
    {
        var (success, error, state) = _gameService.UpdateLoadout(gameId, playerId, roster);
        if (!success)
        {
            return new { success = false, error };
        }

        await Clients.Group(gameId.ToString()).SendAsync("StateChanged", state);
        return new { success = true, state };
    }

    public async Task<object> SetLoadoutReady(Guid gameId, int playerId, bool ready)
    {
        var (success, error, state) = _gameService.SetLoadoutReady(gameId, playerId, ready);
        if (!success)
        {
            return new { success = false, error };
        }

        await Clients.Group(gameId.ToString()).SendAsync("StateChanged", state);
        return new { success = true, state };
    }

    public async Task<object> DeployUnit(Guid gameId, int playerId, int rosterIndex, int q, int r)
    {
        var (success, error, state) = _gameService.DeployUnit(gameId, playerId, rosterIndex, q, r);
        if (!success)
        {
            return new { success = false, error };
        }

        await Clients.Group(gameId.ToString()).SendAsync("StateChanged", state);
        return new { success = true, state };
    }

    public async Task<object> ClearDeployment(Guid gameId, int playerId, int? rosterIndex)
    {
        var (success, error, state) = _gameService.ClearDeployment(gameId, playerId, rosterIndex);
        if (!success)
        {
            return new { success = false, error };
        }

        await Clients.Group(gameId.ToString()).SendAsync("StateChanged", state);
        return new { success = true, state };
    }

    public async Task<object> SetDeploymentReady(Guid gameId, int playerId, bool ready)
    {
        var (success, error, state) = _gameService.SetDeploymentReady(gameId, playerId, ready);
        if (!success)
        {
            return new { success = false, error };
        }

        await Clients.Group(gameId.ToString()).SendAsync("StateChanged", state);
        return new { success = true, state };
    }

    public async Task<object> LeaveLobby(Guid gameId, int playerId)
    {
        var (success, error, state) = _gameService.LeaveLobby(gameId, playerId);
        if (!success)
        {
            return new { success = false, error };
        }

        await Clients.Group(gameId.ToString()).SendAsync("StateChanged", state);
        return new { success = true, state };
    }

    public async Task<object> SendCommand(Guid gameId, GameCommandDto command)
    {
        var (success, error, state, _) = await _gameService.SendCommandAsync(gameId, command);
        if (!success)
        {
            return new { success = false, error };
        }

        await Clients.Group(gameId.ToString()).SendAsync("StateChanged", state);
        return new { success = true, state };
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        _gameService.RemoveConnection(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}
