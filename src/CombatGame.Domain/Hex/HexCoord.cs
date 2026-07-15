namespace CombatGame.Domain.Hex;

/// <summary>
/// Square grid tile coordinate. Q = column, R = row (both zero-based).
/// </summary>
public readonly record struct HexCoord(int Q, int R)
{
    private static readonly (int Dq, int Dr)[] OrthogonalDirs =
    [
        (1, 0), (0, -1), (-1, 0), (0, 1)
    ];

    /// <summary>Chebyshev distance — used for weapon range and vision.</summary>
    public int DistanceTo(HexCoord other) =>
        Math.Max(Math.Abs(Q - other.Q), Math.Abs(R - other.R));

    /// <summary>Orthogonal neighbor (0=E, 1=N, 2=W, 3=S).</summary>
    public HexCoord Neighbor(int direction)
    {
        var (dq, dr) = OrthogonalDirs[direction % 4];
        return new HexCoord(Q + dq, R + dr);
    }

    public IEnumerable<HexCoord> OrthogonalNeighbors()
    {
        for (var i = 0; i < 4; i++)
        {
            yield return Neighbor(i);
        }
    }

    /// <summary>All tiles within Chebyshev range (square area).</summary>
    public IEnumerable<HexCoord> WithinRange(int range)
    {
        for (var dc = -range; dc <= range; dc++)
        {
            for (var dr = -range; dr <= range; dr++)
            {
                if (Math.Max(Math.Abs(dc), Math.Abs(dr)) <= range)
                {
                    yield return new HexCoord(Q + dc, R + dr);
                }
            }
        }
    }
}
