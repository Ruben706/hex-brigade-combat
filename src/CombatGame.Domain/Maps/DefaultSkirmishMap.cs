using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;
using CombatGame.Domain.Turn;
using CombatGame.Domain.Units;

namespace CombatGame.Domain.Maps;

public static class DefaultSkirmishMap
{
    public const int Width = MapGenerator.MapSize;
    public const int Height = MapGenerator.MapSize;

    public static GameState Create(GameMode mode)
    {
        var gameId = Guid.NewGuid();
        var seed = gameId.ToString().Sum(c => c);
        var rng = new Random(seed);
        var grid = MapGenerator.Generate(rng);
        var state = new GameState
        {
            GameId = gameId,
            Mode = mode,
            Grid = grid,
            CurrentPlayerId = 0,
            AiPlayerId = mode == GameMode.VsAi ? 1 : -1,
            Rng = rng
        };

        var player0Units = new (UnitType type, HexCoord pos)[]
        {
            (UnitType.Scout, new HexCoord(1, 7)),
            (UnitType.Infantry, new HexCoord(2, 8)),
            (UnitType.Tank, new HexCoord(0, 6)),
            (UnitType.Artillery, new HexCoord(0, 9)),
            (UnitType.AntiTank, new HexCoord(1, 10))
        };

        var player1Units = new (UnitType type, HexCoord pos)[]
        {
            (UnitType.Scout, new HexCoord(14, 7)),
            (UnitType.Infantry, new HexCoord(13, 8)),
            (UnitType.Tank, new HexCoord(15, 6)),
            (UnitType.Artillery, new HexCoord(15, 9)),
            (UnitType.AntiTank, new HexCoord(14, 10))
        };

        foreach (var (type, pos) in player0Units)
        {
            state.Brigades.Add(UnitCatalog.CreateBrigade(type, 0, pos));
        }

        foreach (var (type, pos) in player1Units)
        {
            state.Brigades.Add(UnitCatalog.CreateBrigade(type, 1, pos));
        }

        state.AddEvent(GameEventType.TurnEnded, "Battle begins! Player 0's turn.");
        TurnManager.ResetBrigadeTurnStates(state);
        return state;
    }
}
