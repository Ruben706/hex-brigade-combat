namespace CombatGame.Domain.Hex;

public readonly record struct HexCoord(int Q, int R)
{
    public int S => -Q - R;

    public int DistanceTo(HexCoord other)
    {
        return (Math.Abs(Q - other.Q) + Math.Abs(R - other.R) + Math.Abs(S - other.S)) / 2;
    }

    public HexCoord Neighbor(int direction)
    {
        ReadOnlySpan<(int dq, int dr)> directions =
        [
            (1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)
        ];
        var (dq, dr) = directions[direction % 6];
        return new HexCoord(Q + dq, R + dr);
    }

    public IEnumerable<HexCoord> Ring(int radius)
    {
        if (radius == 0)
        {
            yield return this;
            yield break;
        }

        var current = this + new HexCoord(-radius, radius);
        for (var i = 0; i < 6; i++)
        {
            for (var j = 0; j < radius; j++)
            {
                yield return current;
                current = current.Neighbor(i);
            }
        }
    }

    public IEnumerable<HexCoord> WithinRange(int range)
    {
        for (var dq = -range; dq <= range; dq++)
        {
            var r1 = Math.Max(-range, -dq - range);
            var r2 = Math.Min(range, -dq + range);
            for (var dr = r1; dr <= r2; dr++)
            {
                yield return new HexCoord(Q + dq, R + dr);
            }
        }
    }

    public static HexCoord operator +(HexCoord a, HexCoord b) => new(a.Q + b.Q, a.R + b.R);
}
