using CombatGame.Domain.Enums;

namespace CombatGame.Domain.Units;

public sealed class Weapon
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required int Range { get; set; }
    public required int BaseDamage { get; set; }
    public required DamageCategory Category { get; init; }
}
