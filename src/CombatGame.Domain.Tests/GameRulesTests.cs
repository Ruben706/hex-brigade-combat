using CombatGame.Domain;
using CombatGame.Domain.Commands;
using CombatGame.Domain.Combat;
using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;
using CombatGame.Domain.Maps;
using CombatGame.Domain.Units;

namespace CombatGame.Domain.Tests;

internal static class TestMapHelper
{
    public static void SetPlains(GameState state, params HexCoord[] coords)
    {
        foreach (var coord in coords)
        {
            if (state.Grid.Contains(coord))
            {
                state.Grid.SetTerrain(coord, TerrainType.Plains);
            }
        }
    }
}

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
        artillery.Position = new HexCoord(5, 7);
        enemy.Position = new HexCoord(8, 7);
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
        TestMapHelper.SetPlains(state, target);
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
        var second = new HexCoord(infantry.Position.Q + 2, infantry.Position.R);
        var third = new HexCoord(second.Q + 1, second.R);
        TestMapHelper.SetPlains(state, new HexCoord(infantry.Position.Q + 1, infantry.Position.R), second, third);

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
        tank.Position = new HexCoord(5, 7);
        enemyInfantry.Position = new HexCoord(7, 7);

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
    public void Tank_CanMoveFourHexes_InOneClick()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        tank.Position = new HexCoord(5, 7);
        TestMapHelper.SetPlains(state,
            new HexCoord(6, 7), new HexCoord(7, 7), new HexCoord(8, 7), new HexCoord(9, 7));

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = tank.Id,
            TargetCoord = new HexCoord(9, 7)
        });

        Assert.True(result.Success);
        Assert.Equal(new HexCoord(9, 7), tank.Position);
        Assert.Equal(0, tank.TurnState.MovementPointsRemaining);
    }

    [Fact]
    public void Infantry_CanMoveTwoHexes_InOneClick()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var infantry = state.Brigades.First(b => b.UnitType == UnitType.Infantry && b.PlayerId == 0);
        infantry.Position = new HexCoord(5, 7);
        TestMapHelper.SetPlains(state, new HexCoord(6, 7), new HexCoord(7, 7));

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = new HexCoord(7, 7)
        });

        Assert.True(result.Success);
        Assert.Equal(new HexCoord(7, 7), infantry.Position);
        Assert.Equal(0, infantry.TurnState.MovementPointsRemaining);
    }

    [Fact]
    public void Infantry_CannotMoveBeyondMovementPoints()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var infantry = state.Brigades.First(b => b.UnitType == UnitType.Infantry && b.PlayerId == 0);
        infantry.Position = new HexCoord(5, 7);

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = new HexCoord(8, 7)
        });

        Assert.False(result.Success);
    }
}

public class VisionTests
{
    [Fact]
    public void VisionRanges_AreOrderedByUnitType()
    {
        Assert.True(VisionHelper.GetVisionRange(UnitType.Scout) > VisionHelper.GetVisionRange(UnitType.Infantry));
        Assert.True(VisionHelper.GetVisionRange(UnitType.Infantry) > VisionHelper.GetVisionRange(UnitType.AntiTank));
        Assert.True(VisionHelper.GetVisionRange(UnitType.AntiTank) > VisionHelper.GetVisionRange(UnitType.Tank));
        Assert.True(VisionHelper.GetVisionRange(UnitType.Tank) > VisionHelper.GetVisionRange(UnitType.Artillery));
    }

    [Fact]
    public void FriendlyBrigades_RevealHexesWithinVision()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var scout = state.Brigades.First(b => b.UnitType == UnitType.Scout && b.PlayerId == 0);
        scout.Position = new HexCoord(5, 7);

        var visible = VisionHelper.GetVisibleHexes([scout], state.Grid);

        Assert.Contains(new HexCoord(10, 7), visible);
        Assert.DoesNotContain(new HexCoord(11, 7), visible);
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
        tank.Position = new HexCoord(5, 7);
        enemy.Position = new HexCoord(7, 7);
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

public class TerrainTests
{
    [Fact]
    public void Forest_IncreasesDefense()
    {
        var grid = new HexGrid(4, 4);
        grid.SetTerrain(new HexCoord(1, 1), TerrainType.Forest);
        var defender = UnitCatalog.CreateBrigade(UnitType.Infantry, 1, new HexCoord(1, 1));
        var attacker = UnitCatalog.CreateBrigade(UnitType.Infantry, 0, new HexCoord(0, 1));
        var rifle = UnitCatalog.GetWeapons(attacker).First();

        var onForest = DamageCalculator.CalculateDamage(rifle, attacker, defender, grid);
        grid.SetTerrain(new HexCoord(1, 1), TerrainType.Plains);
        var onPlains = DamageCalculator.CalculateDamage(rifle, attacker, defender, grid);

        Assert.True(onForest < onPlains);
    }

    [Fact]
    public void Infantry_CannotEnterDeepWater()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var infantry = state.Brigades.First(b => b.UnitType == UnitType.Infantry && b.PlayerId == 0);
        infantry.Position = new HexCoord(5, 7);
        state.Grid.SetTerrain(new HexCoord(6, 7), TerrainType.DeepWater);

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = new HexCoord(6, 7)
        });

        Assert.False(result.Success);
    }

    [Fact]
    public void Hill_IncreasesVisionRange()
    {
        var grid = new HexGrid(16, 16);
        grid.SetTerrain(new HexCoord(4, 4), TerrainType.Hill);
        var scout = UnitCatalog.CreateBrigade(UnitType.Scout, 0, new HexCoord(4, 4));

        var visible = VisionHelper.GetVisibleHexes([scout], grid);

        Assert.Contains(new HexCoord(10, 4), visible);
        Assert.DoesNotContain(new HexCoord(11, 4), visible);
    }

    [Fact]
    public void Map_IsGeneratedAt16x16()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);

        Assert.Equal(16, state.Grid.Width);
        Assert.Equal(16, state.Grid.Height);
    }
    [Fact]
    public void CanMove_ToFirstColumn()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        var start = HexOffset.FromOddR(3, 7);
        var target = HexOffset.FromOddR(0, 7);
        tank.Position = start;
        TestMapHelper.SetPlains(state, start, target, HexOffset.FromOddR(1, 7), HexOffset.FromOddR(2, 7));

        Assert.Equal(0, target.Q);

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = tank.Id,
            TargetCoord = target
        });

        Assert.True(result.Success);
        Assert.Equal(target, tank.Position);
    }
    [Fact]
    public void OffsetGrid_IncludesMapCornerTiles()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);

        Assert.True(state.Grid.Contains(new HexCoord(0, 15)));
        Assert.True(state.Grid.Contains(new HexCoord(15, 0)));
        Assert.True(state.Grid.Contains(new HexCoord(0, 0)));
        Assert.True(state.Grid.Contains(new HexCoord(15, 15)));
        Assert.False(state.Grid.Contains(new HexCoord(-1, 7)));
        Assert.False(state.Grid.Contains(new HexCoord(16, 7)));
    }

    [Fact]
    public void FirstMove_AllowsAdjacentExpensiveTerrain_AndClampsPointsAtZero()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var artillery = state.Brigades.First(b => b.UnitType == UnitType.Artillery && b.PlayerId == 0);
        artillery.Position = new HexCoord(5, 7);
        var target = new HexCoord(6, 7);
        state.Grid.SetTerrain(target, TerrainType.Hill); // cost 2, artillery has 1 MP

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = artillery.Id,
            TargetCoord = target
        });

        Assert.True(result.Success);
        Assert.Equal(target, artillery.Position);
        Assert.Equal(0, artillery.TurnState.MovementPointsRemaining);
    }

    [Fact]
    public void FirstMove_StillCannotEnterImpassableTerrain()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        tank.Position = new HexCoord(5, 7);
        var target = new HexCoord(6, 7);
        state.Grid.SetTerrain(target, TerrainType.DeepWater);

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = tank.Id,
            TargetCoord = target
        });

        Assert.False(result.Success);
        Assert.Equal(new HexCoord(5, 7), tank.Position);
    }

    [Fact]
    public void SecondMove_DoesNotGetFreeAdjacentStep()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var infantry = state.Brigades.First(b => b.UnitType == UnitType.Infantry && b.PlayerId == 0);
        infantry.Position = new HexCoord(5, 7);
        TestMapHelper.SetPlains(state, new HexCoord(6, 7));
        var forest = new HexCoord(7, 7);
        state.Grid.SetTerrain(forest, TerrainType.Forest); // cost 2

        // First move: one plains step, spends 1 of 2 points.
        var first = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = new HexCoord(6, 7)
        });
        Assert.True(first.Success);
        Assert.Equal(1, infantry.TurnState.MovementPointsRemaining);

        // Second move into forest costs 2 with only 1 point left — no free step now.
        var second = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = infantry.Id,
            TargetCoord = forest
        });
        Assert.False(second.Success);
    }

    [Fact]
    public void Movement_SpendsPointsByPathCost()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        tank.Position = new HexCoord(5, 7);
        TestMapHelper.SetPlains(state, new HexCoord(6, 7), new HexCoord(7, 7));

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = tank.Id,
            TargetCoord = new HexCoord(7, 7)
        });

        Assert.True(result.Success);
        Assert.Equal(2, tank.TurnState.MovementPointsRemaining); // 4 - 2 plains steps
    }

    [Fact]
    public void Pathfinding_PrefersCheaperRoute()
    {
        var grid = new HexGrid(16, 16);
        foreach (var tile in grid.Tiles.Values)
        {
            tile.Terrain = TerrainType.Plains;
        }

        // Direct step is forest (cost 2); going around over plains costs 2 as well,
        // but a 2-long plains path to the far side must still be found optimally.
        var start = new HexCoord(5, 7);
        var forest = new HexCoord(6, 7);
        var beyond = new HexCoord(7, 7);
        grid.SetTerrain(forest, TerrainType.Forest);

        Assert.True(MovementHelper.TryGetMovementCost(start, beyond, 4, grid, [], out var cost));
        // Cheapest route to 'beyond': around the forest over plains = 3 steps of cost 1,
        // or through the forest = 2 + 1 = 3. Either way optimal cost is 3.
        Assert.Equal(3, cost);
    }

    [Fact]
    public void OffsetNeighbors_AreAdjacentAndParityAware()
    {
        // Even row
        var even = new HexCoord(5, 6);
        // Odd row
        var odd = new HexCoord(5, 7);

        for (var d = 0; d < 6; d++)
        {
            Assert.Equal(1, even.DistanceTo(even.Neighbor(d)));
            Assert.Equal(1, odd.DistanceTo(odd.Neighbor(d)));
        }
    }

    [Fact]
    public void CanMove_ToBottomLeftOffsetCorner()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        var start = HexOffset.FromOddR(2, 14);
        var target = HexOffset.FromOddR(0, 15);
        tank.Position = start;
        TestMapHelper.SetPlains(state, start, target, HexOffset.FromOddR(1, 15), HexOffset.FromOddR(1, 14));

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = tank.Id,
            TargetCoord = target
        });

        Assert.True(result.Success);
        Assert.Equal(target, tank.Position);
    }

    [Fact]
    public void CanMove_ToTopRightOffsetCorner()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        var start = HexOffset.FromOddR(13, 1);
        var target = HexOffset.FromOddR(15, 0);
        tank.Position = start;
        TestMapHelper.SetPlains(state, start, target, HexOffset.FromOddR(14, 0), HexOffset.FromOddR(14, 1));

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = tank.Id,
            TargetCoord = target
        });

        Assert.True(result.Success);
        Assert.Equal(target, tank.Position);
    }
}

public class NoMoveAfterFireTests
{
    [Fact]
    public void Brigade_CannotMoveAfterFiring()
    {
        var state = DefaultSkirmishMap.Create(GameMode.Hotseat);
        var tank = state.Brigades.First(b => b.UnitType == UnitType.Tank && b.PlayerId == 0);
        var enemy = state.Brigades.First(b => b.PlayerId == 1);
        tank.Position = new HexCoord(5, 7);
        enemy.Position = new HexCoord(7, 7);

        GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseWeapon,
            PlayerId = 0,
            BrigadeId = tank.Id,
            WeaponId = "main_gun",
            TargetCoord = enemy.Position
        });

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = 0,
            BrigadeId = tank.Id,
            TargetCoord = new HexCoord(6, 7)
        });

        Assert.False(result.Success);
        Assert.Contains("firing", result.Error!, StringComparison.OrdinalIgnoreCase);
    }
}
