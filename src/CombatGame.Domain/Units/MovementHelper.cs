using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;

namespace CombatGame.Domain.Units;

public static class MovementHelper
{
    public static int GetMovementPoints(UnitType unitType) => unitType switch
    {
        UnitType.Tank => 4,
        UnitType.Artillery => 1,
        UnitType.Infantry => 2,
        UnitType.AntiTank => 2,
        _ => 1
    };

    public static int GetMovementPoints(Brigade brigade) => GetMovementPoints(brigade.UnitType);

    public static void ResetMovementPoints(Brigade brigade) =>
        brigade.TurnState.MovementPointsRemaining = GetMovementPoints(brigade);

    public static HashSet<HexCoord> GetReachableHexes(
        HexCoord start,
        int movementRange,
        HexGrid grid,
        IEnumerable<HexCoord> occupiedCoords)
    {
        var occupied = occupiedCoords.ToHashSet();
        var reachable = new HashSet<HexCoord>();
        var visited = new Dictionary<HexCoord, int> { [start] = 0 };
        var queue = new Queue<(HexCoord coord, int cost)>();
        queue.Enqueue((start, 0));

        while (queue.Count > 0)
        {
            var (current, cost) = queue.Dequeue();
            if (cost > 0)
            {
                reachable.Add(current);
            }

            if (cost >= movementRange)
            {
                continue;
            }

            for (var i = 0; i < 6; i++)
            {
                var neighbor = current.Neighbor(i);
                if (!grid.Contains(neighbor) || occupied.Contains(neighbor))
                {
                    continue;
                }

                var nextCost = cost + 1;
                if (visited.TryGetValue(neighbor, out var knownCost) && knownCost <= nextCost)
                {
                    continue;
                }

                visited[neighbor] = nextCost;
                queue.Enqueue((neighbor, nextCost));
            }
        }

        return reachable;
    }

    public static bool CanReach(
        HexCoord start,
        HexCoord target,
        int movementRange,
        HexGrid grid,
        IEnumerable<HexCoord> occupiedCoords) =>
        TryGetMovementCost(start, target, movementRange, grid, occupiedCoords, out _);

    public static bool TryGetMovementCost(
        HexCoord start,
        HexCoord target,
        int movementRange,
        HexGrid grid,
        IEnumerable<HexCoord> occupiedCoords,
        out int cost)
    {
        cost = 0;
        if (start == target)
        {
            return false;
        }

        var occupied = occupiedCoords.ToHashSet();
        var visited = new Dictionary<HexCoord, int> { [start] = 0 };
        var queue = new Queue<(HexCoord coord, int pathCost)>();
        queue.Enqueue((start, 0));

        while (queue.Count > 0)
        {
            var (current, pathCost) = queue.Dequeue();
            if (pathCost >= movementRange)
            {
                continue;
            }

            for (var i = 0; i < 6; i++)
            {
                var neighbor = current.Neighbor(i);
                if (!grid.Contains(neighbor) || occupied.Contains(neighbor))
                {
                    continue;
                }

                var nextCost = pathCost + 1;
                if (visited.TryGetValue(neighbor, out var knownCost) && knownCost <= nextCost)
                {
                    continue;
                }

                visited[neighbor] = nextCost;
                queue.Enqueue((neighbor, nextCost));
            }
        }

        if (!visited.TryGetValue(target, out cost) || cost <= 0)
        {
            cost = 0;
            return false;
        }

        return true;
    }
}
