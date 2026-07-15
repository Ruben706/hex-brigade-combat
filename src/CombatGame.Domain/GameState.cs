using CombatGame.Domain.Enums;

namespace CombatGame.Domain;

public sealed class GameEvent
{
    public required GameEventType Type { get; init; }
    public required string Message { get; init; }
    public int TurnNumber { get; init; }
    public int? TargetQ { get; init; }
    public int? TargetR { get; init; }
    public int? Damage { get; init; }
    public bool? Hit { get; init; }
}

public sealed class GameState
{
    public required Guid GameId { get; init; }
    public required GameMode Mode { get; init; }
    public required Hex.HexGrid Grid { get; init; }
    public List<Units.Brigade> Brigades { get; } = [];
    public int CurrentPlayerId { get; set; }
    public int TurnNumber { get; set; } = 1;
    public GamePhase Phase { get; set; } = GamePhase.InProgress;
    public int? WinnerId { get; set; }
    public List<GameEvent> EventLog { get; } = [];
    public HashSet<int> ConnectedPlayers { get; } = [];
    public int AiPlayerId { get; set; } = 1;
    public Random Rng { get; set; } = Random.Shared;

    public Units.Brigade? GetBrigade(Guid id) =>
        Brigades.FirstOrDefault(b => b.Id == id);

    public Units.Brigade? GetBrigadeAt(Hex.HexCoord coord) =>
        Brigades.FirstOrDefault(b => b.Position.Equals(coord));

    public IEnumerable<Units.Brigade> GetPlayerBrigades(int playerId) =>
        Brigades.Where(b => b.PlayerId == playerId);

    public IEnumerable<Units.Brigade> GetEnemyBrigades(int playerId) =>
        Brigades.Where(b => b.PlayerId != playerId);

    public void AddEvent(GameEventType type, string message)
    {
        AddEvent(type, message, null, null, null, null);
    }

    public void AddEvent(
        GameEventType type,
        string message,
        int? targetQ,
        int? targetR,
        int? damage,
        bool? hit)
    {
        EventLog.Add(new GameEvent
        {
            Type = type,
            Message = message,
            TurnNumber = TurnNumber,
            TargetQ = targetQ,
            TargetR = targetR,
            Damage = damage,
            Hit = hit
        });

        if (EventLog.Count > 100)
        {
            EventLog.RemoveAt(0);
        }
    }

    public void CheckVictory()
    {
        var players = Brigades.Select(b => b.PlayerId).Distinct().ToList();
        if (players.Count <= 1 && Brigades.Count > 0)
        {
            Phase = GamePhase.Victory;
            WinnerId = players.FirstOrDefault();
            AddEvent(GameEventType.GameOver, $"Player {WinnerId} wins!");
        }
        else if (Brigades.Count == 0)
        {
            Phase = GamePhase.Victory;
            WinnerId = null;
            AddEvent(GameEventType.GameOver, "Draw - all brigades destroyed.");
        }
    }
}
