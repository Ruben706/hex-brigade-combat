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
                var coord = HexOffset.FromOddR(col, row);
                _tiles[coord] = new HexTile { Coord = coord };
            }
        }
    }

    public bool Contains(HexCoord coord) => HexOffset.IsOnGrid(coord, Width, Height);

    public TerrainType GetTerrain(HexCoord coord) => _tiles[coord].Terrain;

    public void SetTerrain(HexCoord coord, TerrainType terrain)
    {
        if (!Contains(coord))
        {
            return;
        }

        _tiles[coord].Terrain = terrain;
    }

    public bool IsAdjacent(HexCoord a, HexCoord b) => a.DistanceTo(b) == 1;
}
