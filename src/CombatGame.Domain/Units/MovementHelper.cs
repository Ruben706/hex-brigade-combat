using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;

namespace CombatGame.Domain.Units;

public static class MovementHelper
{
    public static int GetMovementPoints(UnitType unitType) => unitType switch
    {
        UnitType.Tank => 4,
        UnitType.Scout => 3,
        UnitType.Artillery => 1,
        UnitType.Infantry => 2,
        UnitType.AntiTank => 2,
        _ => 1
    };

    public static int GetMovementPoints(Brigade brigade) => GetMovementPoints(brigade.UnitType);

    public static void ResetMovementPoints(Brigade brigade) =>
        brigade.TurnState.MovementPointsRemaining = GetMovementPoints(brigade);

    /// <summary>
    /// Dijkstra over terrain costs. Returns the cheapest path cost to every hex
    /// reachable within <paramref name="movementRange"/> points.
    /// </summary>
    private static Dictionary<HexCoord, int> ComputePathCosts(
        HexCoord start,
        int movementRange,
        HexGrid grid,
        HashSet<HexCoord> occupied)
    {
        var costs = new Dictionary<HexCoord, int> { [start] = 0 };
        var queue = new PriorityQueue<HexCoord, int>();
        queue.Enqueue(start, 0);

        while (queue.TryDequeue(out var current, out var cost))
        {
            if (cost > costs[current])
            {
                continue; // stale entry
            }

            for (var i = 0; i < 4; i++)
            {
                var neighbor = current.Neighbor(i);
                if (!grid.Contains(neighbor) || occupied.Contains(neighbor))
                {
                    continue;
                }

                var terrain = grid.GetTerrain(neighbor);
                if (!TerrainHelper.IsPassable(terrain))
                {
                    continue;
                }

                var nextCost = cost + TerrainHelper.GetMovementCost(terrain);
                if (nextCost > movementRange)
                {
                    continue;
                }

                if (costs.TryGetValue(neighbor, out var knownCost) && knownCost <= nextCost)
                {
                    continue;
                }

                costs[neighbor] = nextCost;
                queue.Enqueue(neighbor, nextCost);
            }
        }

        costs.Remove(start);
        return costs;
    }

    /// <summary>
    /// True when the target is a passable, unoccupied hex directly adjacent to start.
    /// On a brigade's first move of the turn such a step is always allowed,
    /// regardless of its movement point cost (deep water / mountains stay impassable).
    /// </summary>
    private static bool IsFreeAdjacentStep(
        HexCoord start,
        HexCoord target,
        HexGrid grid,
        HashSet<HexCoord> occupied)
    {
        return Math.Abs(start.Q - target.Q) + Math.Abs(start.R - target.R) == 1 &&
               grid.Contains(target) &&
               !occupied.Contains(target) &&
               TerrainHelper.IsPassable(grid.GetTerrain(target));
    }

    public static HashSet<HexCoord> GetReachableHexes(
        HexCoord start,
        int movementRange,
        HexGrid grid,
        IEnumerable<HexCoord> occupiedCoords,
        bool isFirstMove = false)
    {
        var occupied = occupiedCoords.ToHashSet();
        var reachable = ComputePathCosts(start, movementRange, grid, occupied).Keys.ToHashSet();

        if (isFirstMove)
        {
            foreach (var neighbor in start.OrthogonalNeighbors())
            {
                if (IsFreeAdjacentStep(start, neighbor, grid, occupied))
                {
                    reachable.Add(neighbor);
                }
            }
        }

        return reachable;
    }

    public static bool CanReach(
        HexCoord start,
        HexCoord target,
        int movementRange,
        HexGrid grid,
        IEnumerable<HexCoord> occupiedCoords,
        bool isFirstMove = false) =>
        TryGetMovementCost(start, target, movementRange, grid, occupiedCoords, out _, isFirstMove);

    public static bool TryGetMovementCost(
        HexCoord start,
        HexCoord target,
        int movementRange,
        HexGrid grid,
        IEnumerable<HexCoord> occupiedCoords,
        out int cost,
        bool isFirstMove = false)
    {
        cost = 0;
        if (start == target)
        {
            return false;
        }

        var occupied = occupiedCoords.ToHashSet();

        // A direct adjacent step is always the cheapest way to an adjacent hex
        // (any path ends by paying the target's terrain cost).
        if (isFirstMove && IsFreeAdjacentStep(start, target, grid, occupied))
        {
            cost = TerrainHelper.GetMovementCost(grid.GetTerrain(target));
            return true;
        }

        var costs = ComputePathCosts(start, movementRange, grid, occupied);
        return costs.TryGetValue(target, out cost);
    }
}
