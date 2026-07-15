using CombatGame.Domain.Enums;

namespace CombatGame.Domain.Units;

public sealed class Ability
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required AbilityType Type { get; init; }
    public required string Description { get; init; }
}
