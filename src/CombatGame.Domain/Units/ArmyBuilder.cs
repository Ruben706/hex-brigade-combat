using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;
using CombatGame.Domain.Maps;

namespace CombatGame.Domain.Units;

public sealed class LoadoutUnit
{
    public required UnitType UnitType { get; init; }
    public List<UpgradeType> Upgrades { get; init; } = [];
}

public sealed class PlayerLoadout
{
    public List<LoadoutUnit> Roster { get; set; } = [];
    public bool Ready { get; set; }
}

public sealed class DeploymentPlacement
{
    public int RosterIndex { get; set; }
    public int Q { get; set; }
    public int R { get; set; }
}

public static class ArmyBuilder
{
    public const int ArmyBudget = 500;
    public const int MinRosterSize = 1;
    public const int MaxRosterSize = 6;

    private static readonly Dictionary<UnitType, int> UnitCosts = new()
    {
        [UnitType.Scout] = 70,
        [UnitType.Infantry] = 90,
        [UnitType.AntiTank] = 130,
        [UnitType.Artillery] = 160,
        [UnitType.Tank] = 200,
    };

    public static int GetUnitCost(UnitType type) => UnitCosts[type];

    public static int GetUpgradeCost(UnitType unitType, UpgradeType upgrade)
    {
        var def = UnitCatalog.Get(unitType);
        return def.UpgradeXpCosts.TryGetValue(upgrade, out var cost) ? cost : int.MaxValue;
    }

    public static int CalculateRosterCost(IReadOnlyList<LoadoutUnit> roster)
    {
        var total = 0;
        foreach (var unit in roster)
        {
            total += GetUnitCost(unit.UnitType);
            foreach (var upgrade in unit.Upgrades)
            {
                total += GetUpgradeCost(unit.UnitType, upgrade);
            }
        }

        return total;
    }

    public static bool TryValidateRoster(IReadOnlyList<LoadoutUnit> roster, out string? error)
    {
        error = null;
        if (roster.Count < MinRosterSize)
        {
            error = $"Roster must have at least {MinRosterSize} unit.";
            return false;
        }

        if (roster.Count > MaxRosterSize)
        {
            error = $"Roster cannot exceed {MaxRosterSize} units.";
            return false;
        }

        foreach (var unit in roster)
        {
            if (!UnitCosts.ContainsKey(unit.UnitType))
            {
                error = $"Unknown unit type: {unit.UnitType}.";
                return false;
            }

            var allowed = UnitCatalog.Get(unit.UnitType).UpgradeXpCosts.Keys.ToHashSet();
            foreach (var upgrade in unit.Upgrades)
            {
                if (!allowed.Contains(upgrade))
                {
                    error = $"Upgrade {upgrade} is not available for {unit.UnitType}.";
                    return false;
                }
            }
        }

        var cost = CalculateRosterCost(roster);
        if (cost > ArmyBudget)
        {
            error = $"Roster costs {cost} points (max {ArmyBudget}).";
            return false;
        }

        return true;
    }

    public static bool IsInDeploymentZone(int playerId, HexCoord coord, int mapSize = MapGenerator.MapSize)
    {
        var col = coord.Q;
        var row = coord.R;
        if (row < 4 || row > mapSize - 6)
        {
            return false;
        }

        return playerId switch
        {
            0 => col >= 0 && col <= 2,
            1 => col >= mapSize - 3 && col <= mapSize - 1,
            _ => false
        };
    }

    public static IEnumerable<HexCoord> GetDeploymentZoneTiles(int playerId, int mapSize = MapGenerator.MapSize)
    {
        for (var row = 4; row <= mapSize - 6; row++)
        {
            var colMin = playerId == 0 ? 0 : mapSize - 3;
            var colMax = playerId == 0 ? 2 : mapSize - 1;
            for (var col = colMin; col <= colMax; col++)
            {
                yield return new HexCoord(col, row);
            }
        }
    }
}
