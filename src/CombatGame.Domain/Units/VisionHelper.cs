using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;

namespace CombatGame.Domain.Units;

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

    public static HashSet<HexCoord> GetVisibleHexes(
        IEnumerable<Brigade> friendlyBrigades,
        HexGrid grid)
    {
        var visible = new HashSet<HexCoord>();

        foreach (var brigade in friendlyBrigades)
        {
            foreach (var hex in brigade.Position.WithinRange(GetVisionRange(brigade)))
            {
                if (grid.Contains(hex))
                {
                    visible.Add(hex);
                }
            }
        }

        return visible;
    }
}
