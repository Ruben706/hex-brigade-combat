namespace CombatGame.Domain.Hex;

public static class TerrainHelper
{
    public static bool IsPassable(TerrainType terrain) =>
        terrain is not TerrainType.DeepWater and not TerrainType.Mountain;

    public static int GetMovementCost(TerrainType terrain) => terrain switch
    {
        TerrainType.Plains => 1,
        TerrainType.Forest => 2,
        TerrainType.ShallowWater => 2,
        TerrainType.Hill => 2,
        _ => int.MaxValue
    };

    public static double GetDefenseMultiplier(TerrainType terrain) => terrain switch
    {
        TerrainType.Forest => 1.2,
        TerrainType.ShallowWater => 0.8,
        _ => 1.0
    };

    public static bool ConcealsUnits(TerrainType terrain) => terrain == TerrainType.Forest;
}
