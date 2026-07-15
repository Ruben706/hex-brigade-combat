using CombatGame.Domain;
using CombatGame.Domain.Commands;
using CombatGame.Domain.Combat;
using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;
using CombatGame.Domain.Units;

namespace CombatGame.Server.Services;

public sealed class AiController
{
    public Task RunTurnAsync(GameState state)
    {
        var aiPlayer = state.AiPlayerId;
        var brigades = state.GetPlayerBrigades(aiPlayer).ToList();

        foreach (var brigade in brigades)
        {
            if (state.Phase == GamePhase.Victory)
            {
                break;
            }

            if (TrySetupArtillery(state, brigade, aiPlayer))
            {
                continue;
            }

            if (TryAttack(state, brigade, aiPlayer))
            {
                continue;
            }

            while (TryMoveTowardEnemy(state, brigade, aiPlayer))
            {
            }
        }

        if (state.Phase == GamePhase.InProgress && state.CurrentPlayerId == aiPlayer)
        {
            GameEngine.Execute(state, new GameCommand
            {
                Type = CommandType.EndTurn,
                PlayerId = aiPlayer
            });
        }

        return Task.CompletedTask;
    }

    private static bool TrySetupArtillery(GameState state, Brigade brigade, int aiPlayer)
    {
        if (brigade.UnitType != UnitType.Artillery ||
            brigade.HasStatus(StatusEffectType.ArtilleryReady) ||
            brigade.HasStatus(StatusEffectType.ArtillerySettingUp) ||
            brigade.TurnState.HasUsedAbility)
        {
            return false;
        }

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseAbility,
            PlayerId = aiPlayer,
            BrigadeId = brigade.Id,
            AbilityId = "setup"
        });

        return result.Success;
    }

    private static bool TryAttack(GameState state, Brigade brigade, int aiPlayer)
    {
        if (brigade.TurnState.ForfeitsActions)
        {
            return false;
        }

        var weapons = UnitCatalog.GetWeapons(brigade);
        var enemies = state.GetEnemyBrigades(aiPlayer).ToList();
        if (enemies.Count == 0)
        {
            return false;
        }

        Weapon? bestWeapon = null;
        Brigade? bestTarget = null;
        var bestScore = 0.0;

        foreach (var weapon in weapons)
        {
            if (brigade.TurnState.UsedWeaponIds.Contains(weapon.Id))
            {
                continue;
            }

            if (brigade.UnitType == UnitType.Artillery && !brigade.HasStatus(StatusEffectType.ArtilleryReady))
            {
                continue;
            }

            foreach (var enemy in enemies)
            {
                var distance = brigade.Position.DistanceTo(enemy.Position);
                if (distance > weapon.Range)
                {
                    continue;
                }

                var effectiveness = DamageCalculator.GetEffectiveness(weapon.Category, enemy.GetArmorClass());
                var score = weapon.BaseDamage * effectiveness;
                if (score > bestScore)
                {
                    bestScore = score;
                    bestWeapon = weapon;
                    bestTarget = enemy;
                }
            }
        }

        if (bestWeapon is null || bestTarget is null)
        {
            return false;
        }

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.UseWeapon,
            PlayerId = aiPlayer,
            BrigadeId = brigade.Id,
            WeaponId = bestWeapon.Id,
            TargetCoord = bestTarget.Position
        });

        return result.Success;
    }

    private static bool TryMoveTowardEnemy(GameState state, Brigade brigade, int aiPlayer)
    {
        if (brigade.TurnState.MovementPointsRemaining <= 0 || brigade.TurnState.ForfeitsActions)
        {
            return false;
        }

        if (brigade.TurnState.UsedWeaponIds.Count > 0)
        {
            return false;
        }

        var enemies = state.GetEnemyBrigades(aiPlayer).ToList();
        if (enemies.Count == 0)
        {
            return false;
        }

        var nearest = enemies
            .OrderBy(e => brigade.Position.DistanceTo(e.Position))
            .First();

        HexCoord? bestMove = null;
        var bestDistance = brigade.Position.DistanceTo(nearest.Position);

        var reachable = MovementHelper.GetReachableHexes(
            brigade.Position,
            brigade.TurnState.MovementPointsRemaining,
            state.Grid,
            state.Brigades.Where(b => b.Id != brigade.Id).Select(b => b.Position),
            isFirstMove: !brigade.TurnState.HasMoved);

        foreach (var candidate in reachable)
        {
            var distance = candidate.DistanceTo(nearest.Position);
            if (distance < bestDistance)
            {
                bestDistance = distance;
                bestMove = candidate;
            }
        }

        if (bestMove is null)
        {
            return false;
        }

        var result = GameEngine.Execute(state, new GameCommand
        {
            Type = CommandType.Move,
            PlayerId = aiPlayer,
            BrigadeId = brigade.Id,
            TargetCoord = bestMove
        });

        return result.Success;
    }
}
