using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;

namespace CombatGame.Domain.Units;

using GameState = CombatGame.Domain.GameState;

public static class VisionHelper
{
    public static int GetVisionRange(UnitType unitType) => unitType switch
    {
        UnitType.Scout => 5,
        UnitType.Infantry => 4,
        UnitType.AntiTank => 3,
        UnitType.Tank => 2,
        UnitType.Artillery => 1,
        _ => 2
    };

    public static int GetVisionRange(Brigade brigade) => GetVisionRange(brigade.UnitType);

    public static int GetEffectiveVisionRange(Brigade brigade, HexGrid grid)
    {
        var range = GetVisionRange(brigade);
        if (grid.GetTerrain(brigade.Position) == TerrainType.Hill)
        {
            range += 1;
        }

        return range;
    }

    public static HashSet<HexCoord> GetVisibleHexes(
        IEnumerable<Brigade> friendlyBrigades,
        HexGrid grid)
    {
        var visible = new HashSet<HexCoord>();

        foreach (var brigade in friendlyBrigades)
        {
            foreach (var hex in brigade.Position.WithinRange(GetEffectiveVisionRange(brigade, grid)))
            {
                if (grid.Contains(hex))
                {
                    visible.Add(hex);
                }
            }
        }

        return visible;
    }

    public static bool CanPlayerSeeBrigade(GameState state, int viewingPlayerId, Brigade target)
    {
        if (target.PlayerId == viewingPlayerId)
        {
            return true;
        }

        var friendly = state.GetPlayerBrigades(viewingPlayerId).ToList();
        var visibleHexes = GetVisibleHexes(friendly, state.Grid);
        if (!visibleHexes.Contains(target.Position))
        {
            return false;
        }

        var terrain = state.Grid.GetTerrain(target.Position);
        if (!TerrainHelper.ConcealsUnits(terrain))
        {
            return true;
        }

        if (target.TurnState.RevealedFromForest)
        {
            return true;
        }

        return friendly.Any(b => b.Position.DistanceTo(target.Position) == 1);
    }
}
