using CombatGame.Domain;
using CombatGame.Domain.Commands;
using CombatGame.Domain.Combat;
using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;
using CombatGame.Domain.Maps;
using CombatGame.Domain.Units;

namespace CombatGame.Domain.Tests;

public class DamageCalculatorTests
{
    [Theory]
    [InlineData(DamageCategory.SmallArms, ArmorClass.Soft, 1.0)]
    [InlineData(DamageCategory.SmallArms, ArmorClass.Heavy, 0.15)]
    [InlineData(DamageCategory.AntiArmor, ArmorClass.Heavy, 1.5)]
    [InlineData(DamageCategory.HighExplosive, ArmorClass.Soft, 1.2)]
    public void Effectiveness_MatchesMatrix(DamageCategory category, ArmorClass armor, double expected)
    {
        Assert.Equal(expected, DamageCalculator.GetEffectiveness(category, armor));
    }

    [Fact]
    public void SmallArms_DealsLessDamageToTanks()
    {
        var rifle = new Weapon
        {
            Id = "rifle",
            Name = "Rifle",
            Range = 1,
            BaseDamage = 8,
            Category = DamageCategory.SmallArms
        };

        var infantry = UnitCatalog.CreateBrigade(UnitType.Infantry, 0, new HexCoord(0, 0));
        var tank = UnitCatalog.CreateBrigade(UnitType.Tank, 1, new HexCoord(1, 0));

        var vsInfantry = DamageCalculator.CalculateDamage(rifle, infantry, infantry);
        var vsTank = DamageCalculator.CalculateDamage(rifle, infantry, tank);

        Assert.True(vsTank < vsInfantry);
    }
}

public class ArtillerySetupTests
{
    private static GameState CreateCloseRangeState()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var artillery = state.Brigades.First(b => b.UnitType == UnitType.Artillery && b.PlayerId == 0);
        var enemy = state.Brigades.First(b => b.PlayerId == 1);
        artillery.Position = new HexCoord(5, 3);
        enemy.Position = new HexCoord(8, 3);
        return state;
    }

    [Fact]
    public void Artillery_CannotFire_WithoutSetup()
    {
        var state = CreateCloseRangeState();
        var artillery = state.Brigades.First(b => b.UnitType == UnitType.Artillery && b.PlayerId == 0);
        var target = state.Brigades.First(b => b.PlayerId == 1);

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseWeapon,
            PlayerId = 0,
            BrigadeId = artillery.Id,
            WeaponId = "howitzer",
            TargetCoord = target.Position
        });

        Assert.False(result.Success);
        Assert.Contains("set up", result.Error!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Artillery_CanFire_AfterSetupAndEndTurn()
    {
        var state = CreateCloseRangeState();
        var artillery = state.Brigades.First(b => b.UnitType == UnitType.Artillery && b.PlayerId == 0);
        var target = state.Brigades.First(b => b.PlayerId == 1);

        GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseAbility,
            PlayerId = 0,
            BrigadeId = artillery.Id,
            AbilityId = "setup"
        });

        GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.EndTurn,
            PlayerId = 0
        });

        GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.EndTurn,
            PlayerId = 1
        });

        Assert.True(artillery.HasStatus(StatusEffectType.ArtilleryReady));

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseWeapon,
            PlayerId = 0,
            BrigadeId = artillery.Id,
            WeaponId = "howitzer",
            TargetCoord = target.Position
        });

        Assert.True(result.Success);
    }
}

public class DigInTests
{
    [Fact]
    public void DigIn_IncreasesDefense()
    {
        var brigade = UnitCatalog.CreateBrigade(UnitType.Infantry, 0, new HexCoord(0, 0));
        var without = DamageCalculator.GetDefenseMultiplier(brigade);

        brigade.StatusEffects.Add(new StatusEffect
        {
            Type = StatusEffectType.Fortified,
            RemainingTurns = -1
        });

        var with = DamageCalculator.GetDefenseMultiplier(brigade);
        Assert.True(with > without);
    }

    [Fact]
    public void Moving_ClearsFortifiedStatus()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var infantry = state.Brigades.First(b => b.UnitType == UnitType.Infantry && b.PlayerId == 0);

        GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseAbility,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            AbilityId = "dig_in"
        });

        Assert.True(infantry.HasStatus(StatusEffectType.Fortified));

        var target = new HexCoord(infantry.Position.Q + 1, infantry.Position.R);
        GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = target
        });

        Assert.False(infantry.HasStatus(StatusEffectType.Fortified));
    }
}

public class TurnActionLimitTests
{
    [Fact]
    public void Brigade_CannotMoveAfterUsingAllMovementPoints()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var infantry = state.Brigades.First(b => b.UnitType == UnitType.Infantry && b.PlayerId == 0);
        var first = new HexCoord(infantry.Position.Q + 1, infantry.Position.R);
        var second = new HexCoord(first.Q + 1, first.R);
        var third = new HexCoord(second.Q + 1, second.R);

        Assert.True(GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = first
        }).Success);

        Assert.True(GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = second
        }).Success);

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = third
        });

        Assert.False(result.Success);
    }

    [Fact]
    public void Weapon_CannotBeUsedTwice()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        var target = state.Brigades.First(b => b.PlayerId == 1);

        GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseWeapon,
            PlayerId = 0,
            BrigadeId = tank.Id,
            WeaponId = "main_gun",
            TargetCoord = target.Position
        });

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseWeapon,
            PlayerId = 0,
            BrigadeId = tank.Id,
            WeaponId = "main_gun",
            TargetCoord = target.Position
        });

        Assert.False(result.Success);
    }

    [Fact]
    public void Tank_CanUseBothWeaponsIndependently()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        var enemyInfantry = state.Brigades.First(b => b.UnitType == UnitType.Infantry && b.PlayerId == 1);
        tank.Position = new HexCoord(5, 3);
        enemyInfantry.Position = new HexCoord(7, 3);

        var gunResult = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseWeapon,
            PlayerId = 0,
            BrigadeId = tank.Id,
            WeaponId = "main_gun",
            TargetCoord = enemyInfantry.Position
        });

        var mgResult = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseWeapon,
            PlayerId = 0,
            BrigadeId = tank.Id,
            WeaponId = "machine_gun",
            TargetCoord = enemyInfantry.Position
        });

        Assert.True(gunResult.Success);
        Assert.True(mgResult.Success);
    }
}

public class UpgradeTests
{
    [Fact]
    public void Infantry_EarnsAntiTankWeaponUpgrade()
    {
        var brigade = UnitCatalog.CreateBrigade(UnitType.Infantry, 0, new HexCoord(0, 0));
        brigade.Experience = 50;

        var upgrades = UnitCatalog.GetAvailableUpgrades(brigade).ToList();
        Assert.Contains(UpgradeType.AntiTankRounds, upgrades);

        brigade.Upgrades.Add(UpgradeType.AntiTankRounds);
        var weapons = UnitCatalog.GetWeapons(brigade);
        Assert.Contains(weapons, w => w.Id == "at_rifle");
    }
}

public class MovementTests
{
    [Fact]
    public void Tank_CanMoveFourHexes_StepByStep()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        tank.Position = new HexCoord(5, 3);

        for (var i = 1; i <= 4; i++)
        {
            var result = GameEngine.Execute(state, new GameCommand
            {
                Type = CommandType.Move,
                PlayerId = 0,
                BrigadeId = tank.Id,
                TargetCoord = new HexCoord(5 + i, 3)
            });

            Assert.True(result.Success, $"Move step {i} failed");
        }

        Assert.Equal(new HexCoord(9, 3), tank.Position);
        Assert.Equal(0, tank.TurnState.MovementPointsRemaining);
    }

    [Fact]
    public void Infantry_CanMoveTwoHexes_StepByStep()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var infantry = state.Brigades.First(b => b.UnitType == UnitType.Infantry && b.PlayerId == 0);
        infantry.Position = new HexCoord(5, 3);

        Assert.True(GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = new HexCoord(6, 3)
        }).Success);

        Assert.True(GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = new HexCoord(7, 3)
        }).Success);

        Assert.Equal(new HexCoord(7, 3), infantry.Position);
        Assert.False(GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = new HexCoord(8, 3)
        }).Success);
    }

    [Fact]
    public void Infantry_CannotSkipHexesInOneMove()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var infantry = state.Brigades.First(b => b.UnitType == UnitType.Infantry && b.PlayerId == 0);
        infantry.Position = new HexCoord(5, 3);

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = new HexCoord(7, 3)
        });

        Assert.False(result.Success);
    }
}

public class AccuracyTests
{
    [Fact]
    public void StationaryBrigade_HasFullAccuracy()
    {
        var brigade = UnitCatalog.CreateBrigade(UnitType.Infantry, 0, new HexCoord(0, 0));
        Assert.Equal(1.0, DamageCalculator.GetAccuracy(brigade));
    }

    [Fact]
    public void MovedBrigade_HasHalvedAccuracy()
    {
        var brigade = UnitCatalog.CreateBrigade(UnitType.Infantry, 0, new HexCoord(0, 0));
        brigade.TurnState.HasMoved = true;
        Assert.Equal(0.5, DamageCalculator.GetAccuracy(brigade));
    }

    [Fact]
    public void MovedBrigade_CanMissAttack()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        var enemy = state.Brigades.First(b => b.PlayerId == 1);
        tank.Position = new HexCoord(5, 3);
        enemy.Position = new HexCoord(7, 3);
        tank.TurnState.HasMoved = true;
        state.Rng = new Random(0);

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseWeapon,
            PlayerId = 0,
            BrigadeId = tank.Id,
            WeaponId = "main_gun",
            TargetCoord = enemy.Position
        });

        Assert.True(result.Success);
        Assert.Contains(state.EventLog, e => e.Type == GameEventType.Missed);
    }
}
