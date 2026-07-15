using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;
using CombatGame.Domain.Turn;
using CombatGame.Domain.Units;

namespace CombatGame.Domain.Maps;

public static class DefaultSkirmishMap
{
    public const int Width = 12;
    public const int Height = 8;

    public static GameState Create(GameMode mode)
    {
        var grid = new HexGrid(Width, Height);
        var gameId = Guid.NewGuid();
        var state = new GameState
        {
            GameId = gameId,
            Mode = mode,
            Grid = grid,
            CurrentPlayerId = 0,
            AiPlayerId = mode == GameMode.VsAi ? 1 : -1,
            Rng = new Random(gameId.GetHashCode())
        };

        var player0Units = new (UnitType type, HexCoord pos)[]
        {
            (UnitType.Scout, new HexCoord(2, 3)),
            (UnitType.Infantry, new HexCoord(1, 4)),
            (UnitType.Tank, new HexCoord(0, 3)),
            (UnitType.Artillery, new HexCoord(0, 1)),
            (UnitType.AntiTank, new HexCoord(0, 5))
        };

        var player1Units = new (UnitType type, HexCoord pos)[]
        {
            (UnitType.Scout, new HexCoord(9, 3)),
            (UnitType.Infantry, new HexCoord(10, 4)),
            (UnitType.Tank, new HexCoord(11, 3)),
            (UnitType.Artillery, new HexCoord(11, 1)),
            (UnitType.AntiTank, new HexCoord(11, 5))
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
