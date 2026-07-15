using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;

namespace CombatGame.Domain.Commands;

public sealed class GameCommand
{
    public required CommandType Type { get; init; }
    public required int PlayerId { get; init; }
    public Guid? BrigadeId { get; init; }
    public HexCoord? TargetCoord { get; init; }
    public string? WeaponId { get; init; }
    public string? AbilityId { get; init; }
}

public sealed class CommandResult
{
    public bool Success { get; init; }
    public string? Error { get; init; }

    public static CommandResult Ok() => new() { Success = true };
    public static CommandResult Fail(string error) => new() { Success = false, Error = error };
}
