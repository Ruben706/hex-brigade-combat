namespace CombatGame.Domain.Hex;

/// <summary>
/// HexCoord already stores odd-r offset coordinates (Q = column, R = row),
/// so these conversions are identity mappings kept for call-site clarity.
/// </summary>
public static class HexOffset
{
    public static HexCoord FromOddR(int col, int row) => new(col, row);

    public static (int Col, int Row) ToOddR(HexCoord coord) => (coord.Q, coord.R);

    public static bool IsOnGrid(HexCoord coord, int width, int height) =>
        coord.Q >= 0 && coord.Q < width && coord.R >= 0 && coord.R < height;
}
