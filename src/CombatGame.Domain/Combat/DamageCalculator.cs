using CombatGame.Domain.Enums;
using CombatGame.Domain.Units;

namespace CombatGame.Domain.Combat;

public static class DamageCalculator
{
    private static readonly Dictionary<(DamageCategory, ArmorClass), double> Effectiveness = new()
    {
        [(DamageCategory.SmallArms, ArmorClass.Soft)] = 1.0,
        [(DamageCategory.SmallArms, ArmorClass.Medium)] = 0.6,
        [(DamageCategory.SmallArms, ArmorClass.Heavy)] = 0.15,
        [(DamageCategory.HighExplosive, ArmorClass.Soft)] = 1.2,
        [(DamageCategory.HighExplosive, ArmorClass.Medium)] = 0.8,
        [(DamageCategory.HighExplosive, ArmorClass.Heavy)] = 0.5,
        [(DamageCategory.AntiArmor, ArmorClass.Soft)] = 0.7,
        [(DamageCategory.AntiArmor, ArmorClass.Medium)] = 1.0,
        [(DamageCategory.AntiArmor, ArmorClass.Heavy)] = 1.5
    };

    public static double GetEffectiveness(DamageCategory category, ArmorClass armor) =>
        Effectiveness.TryGetValue((category, armor), out var value) ? value : 1.0;

    public const double MovedAccuracyPenalty = 0.5;

    public static double GetAccuracy(Brigade attacker) =>
        attacker.TurnState.HasMoved ? MovedAccuracyPenalty : 1.0;

    public static AttackResult ResolveAttack(
        Weapon weapon,
        Brigade attacker,
        Brigade defender,
        Random rng)
    {
        var accuracy = GetAccuracy(attacker);
        if (rng.NextDouble() > accuracy)
        {
            return new AttackResult { Hit = false, Damage = 0, Accuracy = accuracy };
        }

        return new AttackResult
        {
            Hit = true,
            Damage = CalculateDamage(weapon, attacker, defender),
            Accuracy = accuracy
        };
    }

    public static int CalculateDamage(Weapon weapon, Brigade attacker, Brigade defender)
    {
        var effectiveness = GetEffectiveness(weapon.Category, defender.GetArmorClass());
        var attackMultiplier = GetAttackMultiplier(attacker, weapon);
        var defenseMultiplier = GetDefenseMultiplier(defender);

        var raw = weapon.BaseDamage * effectiveness * attackMultiplier;
        var mitigated = raw / defenseMultiplier;
        return Math.Max(1, (int)Math.Round(mitigated));
    }

    public static double GetDefenseMultiplier(Brigade brigade)
    {
        var multiplier = 1.0 + brigade.BaseDefense / 100.0;

        if (brigade.HasStatus(StatusEffectType.Fortified))
        {
            multiplier *= 1.5;
        }

        if (brigade.HasStatus(StatusEffectType.Ambush))
        {
            multiplier *= 1.3;
        }

        if (brigade.Upgrades.Contains(UpgradeType.VeteranDefense))
        {
            multiplier *= 1.2;
        }

        if (brigade.Upgrades.Contains(UpgradeType.ReinforcedArmor))
        {
            multiplier *= 1.3;
        }

        if (brigade.Upgrades.Contains(UpgradeType.Camouflage) && !brigade.MovedLastTurn)
        {
            multiplier *= 1.15;
        }

        return multiplier;
    }

    private static double GetAttackMultiplier(Brigade attacker, Weapon weapon)
    {
        var multiplier = 1.0;

        if (attacker.HasStatus(StatusEffectType.Ambush) && weapon.Category == DamageCategory.AntiArmor)
        {
            multiplier *= 1.2;
        }

        if (attacker.Upgrades.Contains(UpgradeType.HEATRounds) &&
            weapon.Category == DamageCategory.AntiArmor &&
            attacker.UnitType == UnitType.AntiTank)
        {
            multiplier *= 1.25;
        }

        return multiplier;
    }
}
