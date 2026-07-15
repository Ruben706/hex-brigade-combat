using CombatGame.Domain.Enums;

namespace CombatGame.Domain.Units;

public sealed class StatusEffect
{
    public required StatusEffectType Type { get; init; }
    public int RemainingTurns { get; set; }
}
