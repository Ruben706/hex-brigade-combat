namespace CombatGame.Domain.Hex;

public static class HexOffset
{
    public static HexCoord FromOddR(int col, int row) => new(col, row);

    public static (int Col, int Row) ToOddR(HexCoord coord) => (coord.Q, coord.R);

    public static bool IsOnGrid(HexCoord coord, int width, int height) =>
        coord.Q >= 0 && coord.Q < width && coord.R >= 0 && coord.R < height;
}
