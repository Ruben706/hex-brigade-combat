using CombatGame.Domain.Enums;

namespace CombatGame.Domain.Units;

public sealed class UnitDefinition
{
    public required UnitType Type { get; init; }
    public required string DisplayName { get; init; }
    public required int MaxStrength { get; init; }
    public required int BaseDefense { get; init; }
    public required ArmorClass ArmorClass { get; init; }
    public required List<Weapon> Weapons { get; init; }
    public required List<Ability> Abilities { get; init; }
    public required Dictionary<UpgradeType, int> UpgradeXpCosts { get; init; }
}

public static class UnitCatalog
{
    private static readonly Dictionary<UnitType, UnitDefinition> Definitions = BuildDefinitions();

    public static UnitDefinition Get(UnitType type) => Definitions[type];

    public static Brigade CreateBrigade(UnitType type, int playerId, Hex.HexCoord position)
    {
        var def = Get(type);
        return new Brigade
        {
            Id = Guid.NewGuid(),
            PlayerId = playerId,
            UnitType = type,
            Position = position,
            MaxStrength = def.MaxStrength,
            Strength = def.MaxStrength,
            BaseDefense = def.BaseDefense
        };
    }

    public static List<Weapon> GetWeapons(Brigade brigade)
    {
        var def = Get(brigade.UnitType);
        var weapons = def.Weapons.Select(w => new Weapon
        {
            Id = w.Id,
            Name = w.Name,
            Range = w.Range,
            BaseDamage = w.BaseDamage,
            Category = w.Category
        }).ToList();

        ApplyWeaponUpgrades(brigade, weapons);
        return weapons;
    }

    public static List<Ability> GetAbilities(Brigade brigade) =>
        Get(brigade.UnitType).Abilities.ToList();

    public static IEnumerable<UpgradeType> GetAvailableUpgrades(Brigade brigade)
    {
        var def = Get(brigade.UnitType);
        foreach (var (upgrade, cost) in def.UpgradeXpCosts)
        {
            if (!brigade.Upgrades.Contains(upgrade) && brigade.Experience >= cost)
            {
                yield return upgrade;
            }
        }
    }

    private static void ApplyWeaponUpgrades(Brigade brigade, List<Weapon> weapons)
    {
        switch (brigade.UnitType)
        {
            case UnitType.Infantry when brigade.Upgrades.Contains(UpgradeType.AntiTankRounds):
                weapons.Add(new Weapon
                {
                    Id = "at_rifle",
                    Name = "AT Rifle",
                    Range = 2,
                    BaseDamage = 12,
                    Category = DamageCategory.AntiArmor
                });
                break;
            case UnitType.Tank when brigade.Upgrades.Contains(UpgradeType.ImprovedGun):
                var gun = weapons.First(w => w.Id == "main_gun");
                gun.BaseDamage = (int)(gun.BaseDamage * 1.2);
                break;
            case UnitType.Artillery when brigade.Upgrades.Contains(UpgradeType.ExtendedRange):
                var howitzer = weapons.First(w => w.Id == "howitzer");
                howitzer.Range += 1;
                break;
        }
    }

    private static Dictionary<UnitType, UnitDefinition> BuildDefinitions()
    {
        return new Dictionary<UnitType, UnitDefinition>
        {
            [UnitType.Scout] = new()
            {
                Type = UnitType.Scout,
                DisplayName = "Scout",
                MaxStrength = 60,
                BaseDefense = 6,
                ArmorClass = ArmorClass.Soft,
                Weapons =
                [
                    new Weapon
                    {
                        Id = "carbine",
                        Name = "Carbine",
                        Range = 1,
                        BaseDamage = 5,
                        Category = DamageCategory.SmallArms
                    }
                ],
                Abilities = [],
                UpgradeXpCosts = new()
                {
                    [UpgradeType.Camouflage] = 40
                }
            },
            [UnitType.Infantry] = new()
            {
                Type = UnitType.Infantry,
                DisplayName = "Infantry",
                MaxStrength = 100,
                BaseDefense = 10,
                ArmorClass = ArmorClass.Soft,
                Weapons =
                [
                    new Weapon
                    {
                        Id = "rifle",
                        Name = "Rifle",
                        Range = 1,
                        BaseDamage = 8,
                        Category = DamageCategory.SmallArms
                    }
                ],
                Abilities =
                [
                    new Ability
                    {
                        Id = "dig_in",
                        Name = "Dig In",
                        Type = AbilityType.DigIn,
                        Description = "Fortify position (+50% defense until moving)"
                    }
                ],
                UpgradeXpCosts = new()
                {
                    [UpgradeType.AntiTankRounds] = 50,
                    [UpgradeType.VeteranDefense] = 80
                }
            },
            [UnitType.Tank] = new()
            {
                Type = UnitType.Tank,
                DisplayName = "Tank",
                MaxStrength = 150,
                BaseDefense = 25,
                ArmorClass = ArmorClass.Heavy,
                Weapons =
                [
                    new Weapon
                    {
                        Id = "main_gun",
                        Name = "Main Gun",
                        Range = 3,
                        BaseDamage = 25,
                        Category = DamageCategory.AntiArmor
                    },
                    new Weapon
                    {
                        Id = "machine_gun",
                        Name = "Machine Gun",
                        Range = 2,
                        BaseDamage = 6,
                        Category = DamageCategory.SmallArms
                    }
                ],
                Abilities = [],
                UpgradeXpCosts = new()
                {
                    [UpgradeType.ReinforcedArmor] = 60,
                    [UpgradeType.ImprovedGun] = 90
                }
            },
            [UnitType.Artillery] = new()
            {
                Type = UnitType.Artillery,
                DisplayName = "Artillery",
                MaxStrength = 80,
                BaseDefense = 5,
                ArmorClass = ArmorClass.Soft,
                Weapons =
                [
                    new Weapon
                    {
                        Id = "howitzer",
                        Name = "Howitzer",
                        Range = 5,
                        BaseDamage = 30,
                        Category = DamageCategory.HighExplosive
                    }
                ],
                Abilities =
                [
                    new Ability
                    {
                        Id = "setup",
                        Name = "Setup",
                        Type = AbilityType.Setup,
                        Description = "Prepare artillery for firing (forfeits move and attack this turn)"
                    }
                ],
                UpgradeXpCosts = new()
                {
                    [UpgradeType.RapidDeployment] = 70,
                    [UpgradeType.ExtendedRange] = 100
                }
            },
            [UnitType.AntiTank] = new()
            {
                Type = UnitType.AntiTank,
                DisplayName = "Anti-Tank",
                MaxStrength = 90,
                BaseDefense = 12,
                ArmorClass = ArmorClass.Medium,
                Weapons =
                [
                    new Weapon
                    {
                        Id = "at_gun",
                        Name = "AT Gun",
                        Range = 3,
                        BaseDamage = 22,
                        Category = DamageCategory.AntiArmor
                    }
                ],
                Abilities =
                [
                    new Ability
                    {
                        Id = "ambush",
                        Name = "Ambush",
                        Type = AbilityType.Ambush,
                        Description = "Hold position (+30% defense, +20% AT damage this turn)"
                    }
                ],
                UpgradeXpCosts = new()
                {
                    [UpgradeType.HEATRounds] = 55,
                    [UpgradeType.Camouflage] = 75
                }
            }
        };
    }
}
