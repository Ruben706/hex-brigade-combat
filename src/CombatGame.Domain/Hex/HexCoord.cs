namespace CombatGame.Domain.Hex;

/// <summary>
/// Odd-r offset coordinates (Q = column, R = row) on a rectangular pointy-top hex grid.
/// All coordinates on a W×H map are non-negative; cube math is used internally for
/// distance / neighbor / range calculations.
/// </summary>
public readonly record struct HexCoord(int Q, int R)
{
    public (int Q, int R) ToAxial() => (Q - (R - (R & 1)) / 2, R);

    public static HexCoord FromAxial(int axialQ, int axialR) =>
        new(axialQ + (axialR - (axialR & 1)) / 2, axialR);

    public int DistanceTo(HexCoord other)
    {
        var (aq1, ar1) = ToAxial();
        var (aq2, ar2) = other.ToAxial();
        var s1 = -aq1 - ar1;
        var s2 = -aq2 - ar2;
        return (Math.Abs(aq1 - aq2) + Math.Abs(ar1 - ar2) + Math.Abs(s1 - s2)) / 2;
    }

    public HexCoord Neighbor(int direction)
    {
        ReadOnlySpan<(int dq, int dr)> evenRow =
        [
            (1, 0), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1)
        ];
        ReadOnlySpan<(int dq, int dr)> oddRow =
        [
            (1, 0), (1, -1), (0, -1), (-1, 0), (0, 1), (1, 1)
        ];
        var (dq, dr) = (R & 1) == 0 ? evenRow[direction % 6] : oddRow[direction % 6];
        return new HexCoord(Q + dq, R + dr);
    }

    public IEnumerable<HexCoord> WithinRange(int range)
    {
        var (aq, ar) = ToAxial();
        for (var dq = -range; dq <= range; dq++)
        {
            var r1 = Math.Max(-range, -dq - range);
            var r2 = Math.Min(range, -dq + range);
            for (var dr = r1; dr <= r2; dr++)
            {
                yield return FromAxial(aq + dq, ar + dr);
            }
        }
    }
}
