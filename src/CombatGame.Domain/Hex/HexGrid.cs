namespace CombatGame.Domain.Hex;

public enum TerrainType
{
    Plains,
    Forest,
    ShallowWater,
    DeepWater,
    Mountain,
    Hill
}

public sealed class HexTile
{
    public required HexCoord Coord { get; init; }
    public TerrainType Terrain { get; set; } = TerrainType.Plains;
}

public sealed class HexGrid
{
    public int Width { get; }
    public int Height { get; }
    public IReadOnlyDictionary<HexCoord, HexTile> Tiles => _tiles;

    private readonly Dictionary<HexCoord, HexTile> _tiles = new();

    public HexGrid(int width, int height)
    {
        Width = width;
        Height = height;

        for (var row = 0; row < height; row++)
        {
            for (var col = 0; col < width; col++)
            {
                var coord = new HexCoord(col, row);
                _tiles[coord] = new HexTile { Coord = coord };
            }
        }
    }

    public bool Contains(HexCoord coord) => HexOffset.IsOnGrid(coord, Width, Height);

    public TerrainType GetTerrain(HexCoord coord)
    {
        if (_tiles.TryGetValue(coord, out var tile))
        {
            return tile.Terrain;
        }

        return Contains(coord) ? TerrainType.Plains : throw new KeyNotFoundException($"Tile {coord} is not on the grid.");
    }

    public void SetTerrain(HexCoord coord, TerrainType terrain)
    {
        if (!Contains(coord))
        {
            return;
        }

        if (!_tiles.TryGetValue(coord, out var tile))
        {
            _tiles[coord] = new HexTile { Coord = coord, Terrain = terrain };
            return;
        }

        tile.Terrain = terrain;
    }

    public void EnsureAllTiles()
    {
        for (var row = 0; row < Height; row++)
        {
            for (var col = 0; col < Width; col++)
            {
                var coord = new HexCoord(col, row);
                if (!_tiles.ContainsKey(coord))
                {
                    _tiles[coord] = new HexTile { Coord = coord };
                }
            }
        }
    }

    public bool IsAdjacent(HexCoord a, HexCoord b) =>
        Math.Abs(a.Q - b.Q) + Math.Abs(a.R - b.R) == 1;
}
