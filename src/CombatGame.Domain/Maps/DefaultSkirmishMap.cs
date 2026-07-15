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

        var player0Units = new (UnitType type, int col, int row)[]
        {
            (UnitType.Scout, 1, 7),
            (UnitType.Infantry, 2, 8),
            (UnitType.Tank, 0, 6),
            (UnitType.Artillery, 0, 9),
            (UnitType.AntiTank, 1, 10)
        };

        var player1Units = new (UnitType type, int col, int row)[]
        {
            (UnitType.Scout, 14, 7),
            (UnitType.Infantry, 13, 8),
            (UnitType.Tank, 15, 6),
            (UnitType.Artillery, 15, 9),
            (UnitType.AntiTank, 14, 10)
        };

        foreach (var (type, col, row) in player0Units)
        {
            state.Brigades.Add(UnitCatalog.CreateBrigade(type, 0, HexOffset.FromOddR(col, row)));
        }

        foreach (var (type, col, row) in player1Units)
        {
            state.Brigades.Add(UnitCatalog.CreateBrigade(type, 1, HexOffset.FromOddR(col, row)));
        }

        state.AddEvent(GameEventType.TurnEnded, "Battle begins! Player 0's turn.");
        TurnManager.ResetBrigadeTurnStates(state);
        return state;
    }
}
