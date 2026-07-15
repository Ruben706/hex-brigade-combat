namespace CombatGame.Domain.Hex;

/// <summary>
/// Odd-r offset coordinates for a visually rectangular pointy-top hex grid.
/// </summary>
public static class HexOffset
{
    public static HexCoord FromOddR(int col, int row) =>
        new(col - (row - (row & 1)) / 2, row);

    public static (int Col, int Row) ToOddR(HexCoord coord) =>
        (coord.Q + (coord.R - (coord.R & 1)) / 2, coord.R);

    public static bool IsOnGrid(HexCoord coord, int width, int height)
    {
        var (col, row) = ToOddR(coord);
        return col >= 0 && col < width && row >= 0 && row < height;
    }
}
