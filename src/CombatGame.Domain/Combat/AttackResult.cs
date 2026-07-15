namespace CombatGame.Domain.Combat;

public sealed class AttackResult
{
    public required bool Hit { get; init; }
    public int Damage { get; init; }
    public double Accuracy { get; init; }
}
