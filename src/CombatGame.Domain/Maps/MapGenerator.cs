using CombatGame.Domain.Hex;

namespace CombatGame.Domain.Maps;

public static class MapGenerator
{
    public const int MapSize = 16;

    public static HexGrid Generate(Random rng)
    {
        var grid = new HexGrid(MapSize, MapSize);

        for (var r = 0; r < MapSize; r++)
        {
            for (var q = 0; q < MapSize; q++)
            {
                grid.SetTerrain(new HexCoord(q, r), TerrainType.Plains);
            }
        }

        PaintBlob(grid, new HexCoord(8, 8), TerrainType.Mountain, 2, rng, 0.65);
        PaintBlob(grid, new HexCoord(7, 5), TerrainType.Mountain, 2, rng, 0.55);
        PaintBlob(grid, new HexCoord(9, 11), TerrainType.Mountain, 1, rng, 0.7);

        for (var i = 0; i < 6; i++)
        {
            var center = new HexCoord(rng.Next(4, 12), rng.Next(4, 12));
            PaintBlob(grid, center, TerrainType.DeepWater, rng.Next(1, 3), rng, 0.45);
        }

        for (var r = 0; r < MapSize; r++)
        {
            for (var q = 0; q < MapSize; q++)
            {
                var coord = new HexCoord(q, r);
                if (grid.GetTerrain(coord) != TerrainType.DeepWater)
                {
                    continue;
                }

                for (var d = 0; d < 6; d++)
                {
                    var neighbor = coord.Neighbor(d);
                    if (!grid.Contains(neighbor))
                    {
                        continue;
                    }

                    if (grid.GetTerrain(neighbor) == TerrainType.Plains && rng.NextDouble() < 0.55)
                    {
                        grid.SetTerrain(neighbor, TerrainType.ShallowWater);
                    }
                }
            }
        }

        for (var i = 0; i < 14; i++)
        {
            var center = new HexCoord(rng.Next(0, MapSize), rng.Next(0, MapSize));
            PaintBlob(grid, center, TerrainType.Forest, rng.Next(1, 3), rng, 0.5);
        }

        for (var i = 0; i < 10; i++)
        {
            var center = new HexCoord(rng.Next(0, MapSize), rng.Next(0, MapSize));
            PaintBlob(grid, center, TerrainType.Hill, rng.Next(1, 2), rng, 0.55);
        }

        EnsureSpawnZones(grid);
        return grid;
    }

    private static void EnsureSpawnZones(HexGrid grid)
    {
        ClearRect(grid, 0, 2, 4, 12);
        ClearRect(grid, MapSize - 3, MapSize - 1, 4, 12);
    }

    private static void ClearRect(HexGrid grid, int qMin, int qMax, int rMin, int rMax)
    {
        for (var r = rMin; r <= rMax && r < grid.Height; r++)
        {
            for (var q = qMin; q <= qMax && q < grid.Width; q++)
            {
                grid.SetTerrain(new HexCoord(q, r), TerrainType.Plains);
            }
        }
    }

    private static void PaintBlob(
        HexGrid grid,
        HexCoord center,
        TerrainType terrain,
        int radius,
        Random rng,
        double density)
    {
        foreach (var hex in center.WithinRange(radius))
        {
            if (!grid.Contains(hex))
            {
                continue;
            }

            if (IsInSpawnZone(hex))
            {
                continue;
            }

            if (hex.DistanceTo(center) == 0 || rng.NextDouble() < density)
            {
                var existing = grid.GetTerrain(hex);
                if (terrain == TerrainType.ShallowWater && existing is TerrainType.Mountain or TerrainType.DeepWater)
                {
                    continue;
                }

                if (terrain == TerrainType.Forest && existing is TerrainType.Mountain or TerrainType.DeepWater or TerrainType.ShallowWater)
                {
                    continue;
                }

                if (terrain == TerrainType.Hill && existing is not TerrainType.Plains)
                {
                    continue;
                }

                grid.SetTerrain(hex, terrain);
            }
        }
    }

    private static bool IsInSpawnZone(HexCoord coord) =>
        (coord.Q <= 2 || coord.Q >= MapSize - 3) && coord.R is >= 4 and <= 12;
}
