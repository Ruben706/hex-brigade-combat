using CombatGame.Domain.Combat;
using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;
using CombatGame.Domain.Turn;
using CombatGame.Domain.Units;

namespace CombatGame.Domain.Commands;

public static class GameEngine
{
    public static CommandResult Execute(GameState state, GameCommand command)
    {
        if (state.Phase == GamePhase.Victory)
        {
            return CommandResult.Fail("Game is over.");
        }

        if (command.PlayerId != state.CurrentPlayerId)
        {
            return CommandResult.Fail("Not your turn.");
        }

        return command.Type switch
        {
            CommandType.Move => ExecuteMove(state, command),
            CommandType.UseWeapon => ExecuteWeapon(state, command),
            CommandType.UseAbility => ExecuteAbility(state, command),
            CommandType.EndTurn => ExecuteEndTurn(state, command),
            _ => CommandResult.Fail("Unknown command.")
        };
    }

    private static CommandResult ExecuteMove(GameState state, GameCommand command)
    {
        var brigade = GetBrigade(state, command);
        if (brigade is null)
        {
            return CommandResult.Fail("Brigade not found.");
        }

        if (brigade.TurnState.MovementPointsRemaining <= 0)
        {
            return CommandResult.Fail("No movement points remaining.");
        }

        if (brigade.TurnState.ForfeitsActions)
        {
            return CommandResult.Fail("Brigade cannot act this turn.");
        }

        if (brigade.TurnState.UsedWeaponIds.Count > 0)
        {
            return CommandResult.Fail("Cannot move after firing.");
        }

        if (command.TargetCoord is null)
        {
            return CommandResult.Fail("Target coordinate required.");
        }

        state.Grid.EnsureAllTiles();

        var target = command.TargetCoord.Value;
        if (!state.Grid.Contains(target))
        {
            return CommandResult.Fail("Target is outside the map.");
        }

        if (!MovementHelper.TryGetMovementCost(
                brigade.Position,
                target,
                brigade.TurnState.MovementPointsRemaining,
                state.Grid,
                state.Brigades.Where(b => b.Id != brigade.Id).Select(b => b.Position),
                out var moveCost,
                isFirstMove: !brigade.TurnState.HasMoved))
        {
            return CommandResult.Fail("Target is out of movement range.");
        }

        if (state.GetBrigadeAt(target) is not null)
        {
            return CommandResult.Fail("Target hex is occupied.");
        }

        TurnManager.ClearMovementStatuses(brigade);
        brigade.Position = target;
        brigade.TurnState.HasMoved = true;
        brigade.TurnState.MovementPointsRemaining =
            Math.Max(0, brigade.TurnState.MovementPointsRemaining - moveCost);
        state.AddEvent(GameEventType.Moved,
            $"Player {brigade.PlayerId}'s {brigade.UnitType} moved to ({target.Q},{target.R}).");
        return CommandResult.Ok();
    }

    private static CommandResult ExecuteWeapon(GameState state, GameCommand command)
    {
        var brigade = GetBrigade(state, command);
        if (brigade is null)
        {
            return CommandResult.Fail("Brigade not found.");
        }

        if (brigade.TurnState.ForfeitsActions)
        {
            return CommandResult.Fail("Brigade cannot attack this turn.");
        }

        if (string.IsNullOrEmpty(command.WeaponId))
        {
            return CommandResult.Fail("Weapon id required.");
        }

        if (brigade.TurnState.UsedWeaponIds.Contains(command.WeaponId))
        {
            return CommandResult.Fail("Weapon already used this turn.");
        }

        var weapons = UnitCatalog.GetWeapons(brigade);
        var weapon = weapons.FirstOrDefault(w => w.Id == command.WeaponId);
        if (weapon is null)
        {
            return CommandResult.Fail("Weapon not available.");
        }

        if (brigade.UnitType == UnitType.Artillery && !brigade.HasStatus(StatusEffectType.ArtilleryReady))
        {
            return CommandResult.Fail("Artillery must be set up before firing.");
        }

        if (command.TargetCoord is null)
        {
            return CommandResult.Fail("Target coordinate required.");
        }

        var targetCoord = command.TargetCoord.Value;
        var distance = brigade.Position.DistanceTo(targetCoord);
        if (distance > weapon.Range)
        {
            return CommandResult.Fail("Target out of range.");
        }

        var target = state.GetBrigadeAt(targetCoord);
        if (target is null || target.PlayerId == brigade.PlayerId)
        {
            return CommandResult.Fail("Must target an enemy brigade.");
        }

        var attack = DamageCalculator.ResolveAttack(weapon, brigade, target, state.Rng, state.Grid);
        brigade.TurnState.UsedWeaponIds.Add(weapon.Id);

        if (TerrainHelper.ConcealsUnits(state.Grid.GetTerrain(brigade.Position)))
        {
            brigade.TurnState.RevealedFromForest = true;
        }

        if (!attack.Hit)
        {
            state.AddEvent(
                GameEventType.Missed,
                $"{brigade.UnitType} fired {weapon.Name} at {target.UnitType} but missed ({(int)(attack.Accuracy * 100)}% accuracy).",
                target.Position.Q,
                target.Position.R,
                0,
                false);
            return CommandResult.Ok();
        }

        var damage = attack.Damage;
        target.Strength -= damage;
        brigade.Experience += Math.Max(1, damage / 3);
        TurnManager.ApplyUpgradeIfEligible(brigade, state);

        state.AddEvent(
            GameEventType.Attacked,
            $"{brigade.UnitType} fired {weapon.Name} at {target.UnitType} for {damage} damage.",
            target.Position.Q,
            target.Position.R,
            damage,
            true);
        state.AddEvent(GameEventType.DamageDealt,
            $"{target.UnitType} has {Math.Max(0, target.Strength)}/{target.MaxStrength} strength remaining.");

        if (target.Strength <= 0)
        {
            state.Brigades.Remove(target);
            brigade.Experience += 30;
            TurnManager.ApplyUpgradeIfEligible(brigade, state);
            state.AddEvent(GameEventType.BrigadeDestroyed,
                $"{target.UnitType} brigade destroyed!");
            state.CheckVictory();
        }

        return CommandResult.Ok();
    }

    private static CommandResult ExecuteAbility(GameState state, GameCommand command)
    {
        var brigade = GetBrigade(state, command);
        if (brigade is null)
        {
            return CommandResult.Fail("Brigade not found.");
        }

        if (brigade.TurnState.HasUsedAbility)
        {
            return CommandResult.Fail("Ability already used this turn.");
        }

        if (string.IsNullOrEmpty(command.AbilityId))
        {
            return CommandResult.Fail("Ability id required.");
        }

        var abilities = UnitCatalog.GetAbilities(brigade);
        var ability = abilities.FirstOrDefault(a => a.Id == command.AbilityId);
        if (ability is null)
        {
            return CommandResult.Fail("Ability not available.");
        }

        brigade.TurnState.HasUsedAbility = true;

        switch (ability.Type)
        {
            case AbilityType.DigIn:
                if (brigade.TurnState.HasMoved)
                {
                    return CommandResult.Fail("Cannot dig in after moving.");
                }

                brigade.StatusEffects.Add(new StatusEffect
                {
                    Type = StatusEffectType.Fortified,
                    RemainingTurns = -1
                });
                state.AddEvent(GameEventType.AbilityUsed,
                    $"{brigade.UnitType} dug in (+50% defense until moving).");
                break;

            case AbilityType.Setup:
                brigade.TurnState.ForfeitsActions = true;
                brigade.TurnState.HasMoved = true;
                brigade.TurnState.MovementPointsRemaining = 0;
                brigade.RemoveStatus(StatusEffectType.ArtilleryReady);

                if (brigade.Upgrades.Contains(UpgradeType.RapidDeployment))
                {
                    brigade.StatusEffects.Add(new StatusEffect
                    {
                        Type = StatusEffectType.ArtilleryReady,
                        RemainingTurns = -1
                    });
                    state.AddEvent(GameEventType.AbilityUsed,
                        $"{brigade.UnitType} set up rapidly and is ready to fire.");
                }
                else
                {
                    brigade.StatusEffects.Add(new StatusEffect
                    {
                        Type = StatusEffectType.ArtillerySettingUp,
                        RemainingTurns = 1
                    });
                    state.AddEvent(GameEventType.AbilityUsed,
                        $"{brigade.UnitType} is setting up (ready next turn).");
                }
                break;

            case AbilityType.Ambush:
                if (brigade.TurnState.HasMoved)
                {
                    return CommandResult.Fail("Cannot ambush after moving.");
                }

                brigade.TurnState.HasMoved = true;
                brigade.TurnState.MovementPointsRemaining = 0;
                brigade.StatusEffects.Add(new StatusEffect
                {
                    Type = StatusEffectType.Ambush,
                    RemainingTurns = 1
                });
                state.AddEvent(GameEventType.AbilityUsed,
                    $"{brigade.UnitType} prepared an ambush (+30% defense, +20% AT damage).");
                break;
        }

        return CommandResult.Ok();
    }

    private static CommandResult ExecuteEndTurn(GameState state, GameCommand command)
    {
        TurnManager.EndTurn(state);
        return CommandResult.Ok();
    }

    private static Brigade? GetBrigade(GameState state, GameCommand command)
    {
        if (command.BrigadeId is null)
        {
            return null;
        }

        var brigade = state.GetBrigade(command.BrigadeId.Value);
        if (brigade is null || brigade.PlayerId != command.PlayerId)
        {
            return null;
        }

        return brigade;
    }
}
