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
            (UnitType.Scout, 1, 11),
            (UnitType.Infantry, 2, 12),
            (UnitType.Tank, 0, 10),
            (UnitType.Artillery, 0, 13),
            (UnitType.AntiTank, 1, 14)
        };

        var right = Width - 1;
        var player1Units = new (UnitType type, int col, int row)[]
        {
            (UnitType.Scout, right - 1, 11),
            (UnitType.Infantry, right - 2, 12),
            (UnitType.Tank, right, 10),
            (UnitType.Artillery, right, 13),
            (UnitType.AntiTank, right - 1, 14)
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
