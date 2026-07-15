using CombatGame.Domain.Hex;

namespace CombatGame.Domain.Maps;

public static class MapGenerator
{
    public const int MapSize = 16;

    public static HexGrid Generate(Random rng)
    {
        var grid = new HexGrid(MapSize, MapSize);

        foreach (var tile in grid.Tiles.Values)
        {
            tile.Terrain = TerrainType.Plains;
        }

        PaintBlob(grid, HexOffset.FromOddR(8, 8), TerrainType.Mountain, 2, rng, 0.65);
        PaintBlob(grid, HexOffset.FromOddR(7, 5), TerrainType.Mountain, 2, rng, 0.55);
        PaintBlob(grid, HexOffset.FromOddR(9, 11), TerrainType.Mountain, 1, rng, 0.7);

        for (var i = 0; i < 6; i++)
        {
            var center = RandomCoord(rng, 4, 11);
            PaintBlob(grid, center, TerrainType.DeepWater, rng.Next(1, 3), rng, 0.45);
        }

        foreach (var tile in grid.Tiles.Values)
        {
            if (tile.Terrain != TerrainType.DeepWater)
            {
                continue;
            }

            for (var d = 0; d < 6; d++)
            {
                var neighbor = tile.Coord.Neighbor(d);
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

        for (var i = 0; i < 14; i++)
        {
            PaintBlob(grid, RandomCoord(rng, 0, MapSize - 1), TerrainType.Forest, rng.Next(1, 3), rng, 0.5);
        }

        for (var i = 0; i < 10; i++)
        {
            PaintBlob(grid, RandomCoord(rng, 0, MapSize - 1), TerrainType.Hill, rng.Next(1, 2), rng, 0.55);
        }

        EnsureSpawnZones(grid);
        grid.EnsureAllTiles();
        return grid;
    }

    private static HexCoord RandomCoord(Random rng, int min, int max)
    {
        var col = rng.Next(min, max + 1);
        var row = rng.Next(min, max + 1);
        return HexOffset.FromOddR(col, row);
    }

    private static void EnsureSpawnZones(HexGrid grid)
    {
        ClearRect(grid, 0, 2, 4, 12);
        ClearRect(grid, MapSize - 3, MapSize - 1, 4, 12);
    }

    private static void ClearRect(HexGrid grid, int colMin, int colMax, int rowMin, int rowMax)
    {
        for (var row = rowMin; row <= rowMax && row < grid.Height; row++)
        {
            for (var col = colMin; col <= colMax && col < grid.Width; col++)
            {
                grid.SetTerrain(HexOffset.FromOddR(col, row), TerrainType.Plains);
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

    private static bool IsInSpawnZone(HexCoord coord)
    {
        var (col, row) = HexOffset.ToOddR(coord);
        return (col <= 2 || col >= MapSize - 3) && row is >= 4 and <= 12;
    }
}
