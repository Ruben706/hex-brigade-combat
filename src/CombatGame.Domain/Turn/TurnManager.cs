using CombatGame.Domain.Enums;
using CombatGame.Domain.Units;

namespace CombatGame.Domain.Turn;

using GameState = CombatGame.Domain.GameState;

public static class TurnManager
{
    public static void ResetBrigadeTurnStates(GameState state)
    {
        foreach (var brigade in state.Brigades)
        {
            brigade.TurnState.HasMoved = false;
            brigade.TurnState.HasUsedAbility = false;
            brigade.TurnState.ForfeitsActions = false;
            brigade.TurnState.UsedWeaponIds.Clear();
        }
    }

    public static void ProcessEndOfTurn(GameState state)
    {
        foreach (var brigade in state.Brigades)
        {
            ProcessBrigadeStatusTick(brigade);
        }
    }

    public static void EndTurn(GameState state)
    {
        foreach (var brigade in state.GetPlayerBrigades(state.CurrentPlayerId))
        {
            brigade.MovedLastTurn = brigade.TurnState.HasMoved;
        }

        ProcessEndOfTurn(state);
        state.CurrentPlayerId = state.CurrentPlayerId == 0 ? 1 : 0;
        state.TurnNumber++;
        ResetBrigadeTurnStates(state);
        state.AddEvent(GameEventType.TurnEnded, $"Player {state.CurrentPlayerId}'s turn (Turn {state.TurnNumber}).");
    }

    private static void ProcessBrigadeStatusTick(Units.Brigade brigade)
    {
        if (brigade.HasStatus(StatusEffectType.ArtillerySettingUp))
        {
            brigade.RemoveStatus(StatusEffectType.ArtillerySettingUp);
            brigade.StatusEffects.Add(new StatusEffect
            {
                Type = StatusEffectType.ArtilleryReady,
                RemainingTurns = -1
            });
        }

        var timed = brigade.StatusEffects.Where(s => s.RemainingTurns > 0).ToList();
        foreach (var effect in timed)
        {
            effect.RemainingTurns--;
        }

        brigade.StatusEffects.RemoveAll(s => s.RemainingTurns == 0);
    }

    public static void ClearMovementStatuses(Brigade brigade)
    {
        brigade.RemoveStatus(StatusEffectType.Fortified);
        brigade.RemoveStatus(StatusEffectType.ArtilleryReady);
        brigade.RemoveStatus(StatusEffectType.ArtillerySettingUp);
    }

    public static void ApplyUpgradeIfEligible(Brigade brigade, GameState state)
    {
        foreach (var upgrade in UnitCatalog.GetAvailableUpgrades(brigade))
        {
            if (!brigade.Upgrades.Contains(upgrade))
            {
                brigade.Upgrades.Add(upgrade);
                state.AddEvent(GameEventType.UpgradeEarned,
                    $"{brigade.UnitType} brigade earned upgrade: {upgrade}");
            }
        }
    }
}
