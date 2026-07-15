using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;

namespace CombatGame.Domain.Units;

public sealed class BrigadeTurnState
{
    public bool HasMoved { get; set; }
    public bool HasUsedAbility { get; set; }
    public bool ForfeitsActions { get; set; }
    public int MovementPointsRemaining { get; set; }
    public HashSet<string> UsedWeaponIds { get; } = [];
}

public sealed class Brigade
{
    public required Guid Id { get; init; }
    public required int PlayerId { get; init; }
    public required UnitType UnitType { get; init; }
    public required HexCoord Position { get; set; }
    public required int MaxStrength { get; init; }
    public int Strength { get; set; }
    public int BaseDefense { get; init; }
    public int Experience { get; set; }
    public List<UpgradeType> Upgrades { get; } = [];
    public List<StatusEffect> StatusEffects { get; } = [];
    public BrigadeTurnState TurnState { get; } = new();
    public bool MovedLastTurn { get; set; }

    public ArmorClass GetArmorClass() => UnitType switch
    {
        UnitType.Tank => ArmorClass.Heavy,
        UnitType.AntiTank => ArmorClass.Medium,
        _ => ArmorClass.Soft
    };

    public bool HasStatus(StatusEffectType type) =>
        StatusEffects.Any(s => s.Type == type);

    public void RemoveStatus(StatusEffectType type) =>
        StatusEffects.RemoveAll(s => s.Type == type);
}
