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

        for (var r = 0; r < height; r++)
        {
            for (var q = 0; q < width; q++)
            {
                var coord = new HexCoord(q, r);
                _tiles[coord] = new HexTile { Coord = coord };
            }
        }
    }

    public bool Contains(HexCoord coord) => _tiles.ContainsKey(coord);

    public TerrainType GetTerrain(HexCoord coord) => _tiles[coord].Terrain;

    public void SetTerrain(HexCoord coord, TerrainType terrain)
    {
        _tiles[coord].Terrain = terrain;
    }

    public bool IsAdjacent(HexCoord a, HexCoord b) => a.DistanceTo(b) == 1;
}
