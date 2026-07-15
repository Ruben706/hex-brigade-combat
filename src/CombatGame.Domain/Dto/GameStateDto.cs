using CombatGame.Domain;
using CombatGame.Domain.Enums;
using CombatGame.Domain.Hex;
using CombatGame.Domain.Units;

namespace CombatGame.Domain.Dto;

public sealed class GameStateDto
{
    public Guid GameId { get; init; }
    public string Mode { get; init; } = "";
    public int GridWidth { get; init; }
    public int GridHeight { get; init; }
    public int CurrentPlayerId { get; init; }
    public int TurnNumber { get; init; }
    public string Phase { get; init; } = "";
    public int? WinnerId { get; init; }
    public int AiPlayerId { get; init; }
    public List<TileDto> Tiles { get; init; } = [];
    public List<BrigadeDto> Brigades { get; init; } = [];
    public List<GameEventDto> EventLog { get; init; } = [];
    public List<int> ConnectedPlayers { get; init; } = [];
}

public sealed class TileDto
{
    public int Q { get; init; }
    public int R { get; init; }
    public string Terrain { get; init; } = "";
}

public sealed class BrigadeDto
{
    public Guid Id { get; init; }
    public int PlayerId { get; init; }
    public string UnitType { get; init; } = "";
    public int Q { get; init; }
    public int R { get; init; }
    public int Strength { get; init; }
    public int MaxStrength { get; init; }
    public int BaseDefense { get; init; }
    public int Experience { get; init; }
    public List<string> Upgrades { get; init; } = [];
    public List<string> StatusEffects { get; init; } = [];
    public bool HasMoved { get; init; }
    public bool HasUsedAbility { get; init; }
    public bool ForfeitsActions { get; init; }
    public List<string> UsedWeaponIds { get; init; } = [];
    public List<WeaponDto> Weapons { get; init; } = [];
    public List<AbilityDto> Abilities { get; init; } = [];
    public int MovementRange { get; init; }
    public int MovementPointsRemaining { get; init; }
    public int VisionRange { get; init; }
    public bool RevealedFromForest { get; init; }
    public double CurrentAccuracy { get; init; }
}

public sealed class WeaponDto
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public int Range { get; init; }
    public int BaseDamage { get; init; }
    public string Category { get; init; } = "";
}

public sealed class AbilityDto
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public string Type { get; init; } = "";
    public string Description { get; init; } = "";
}

public sealed class GameEventDto
{
    public string Type { get; init; } = "";
    public string Message { get; init; } = "";
    public int TurnNumber { get; init; }
    public int? TargetQ { get; init; }
    public int? TargetR { get; init; }
    public int? Damage { get; init; }
    public bool? Hit { get; init; }
}

public sealed class GameCommandDto
{
    public string Type { get; init; } = "";
    public int PlayerId { get; init; }
    public Guid? BrigadeId { get; init; }
    public int? TargetQ { get; init; }
    public int? TargetR { get; init; }
    public string? WeaponId { get; init; }
    public string? AbilityId { get; init; }
}

public static class GameStateMapper
{
    public static GameStateDto ToDto(GameState state)
    {
        return new GameStateDto
        {
            GameId = state.GameId,
            Mode = state.Mode.ToString(),
            GridWidth = state.Grid.Width,
            GridHeight = state.Grid.Height,
            CurrentPlayerId = state.CurrentPlayerId,
            TurnNumber = state.TurnNumber,
            Phase = state.Phase.ToString(),
            WinnerId = state.WinnerId,
            AiPlayerId = state.AiPlayerId,
            ConnectedPlayers = state.ConnectedPlayers.Order().ToList(),
            Tiles = state.Grid.Tiles.Values.Select(t => new TileDto
            {
                Q = t.Coord.Q,
                R = t.Coord.R,
                Terrain = t.Terrain.ToString()
            }).ToList(),
            Brigades = state.Brigades.Select(b => ToBrigadeDto(b, state.Grid)).ToList(),
            EventLog = state.EventLog.Select(e => new GameEventDto
            {
                Type = e.Type.ToString(),
                Message = e.Message,
                TurnNumber = e.TurnNumber,
                TargetQ = e.TargetQ,
                TargetR = e.TargetR,
                Damage = e.Damage,
                Hit = e.Hit
            }).ToList()
        };
    }

    public static BrigadeDto ToBrigadeDto(Brigade brigade, HexGrid grid)
    {
        return new BrigadeDto
        {
            Id = brigade.Id,
            PlayerId = brigade.PlayerId,
            UnitType = brigade.UnitType.ToString(),
            Q = brigade.Position.Q,
            R = brigade.Position.R,
            Strength = brigade.Strength,
            MaxStrength = brigade.MaxStrength,
            BaseDefense = brigade.BaseDefense,
            Experience = brigade.Experience,
            Upgrades = brigade.Upgrades.Select(u => u.ToString()).ToList(),
            StatusEffects = brigade.StatusEffects.Select(s => s.Type.ToString()).ToList(),
            HasMoved = brigade.TurnState.HasMoved,
            HasUsedAbility = brigade.TurnState.HasUsedAbility,
            ForfeitsActions = brigade.TurnState.ForfeitsActions,
            UsedWeaponIds = brigade.TurnState.UsedWeaponIds.ToList(),
            Weapons = UnitCatalog.GetWeapons(brigade).Select(w => new WeaponDto
            {
                Id = w.Id,
                Name = w.Name,
                Range = w.Range,
                BaseDamage = w.BaseDamage,
                Category = w.Category.ToString()
            }).ToList(),
            Abilities = UnitCatalog.GetAbilities(brigade).Select(a => new AbilityDto
            {
                Id = a.Id,
                Name = a.Name,
                Type = a.Type.ToString(),
                Description = a.Description
            }).ToList(),
            MovementRange = MovementHelper.GetMovementPoints(brigade),
            MovementPointsRemaining = brigade.TurnState.MovementPointsRemaining,
            VisionRange = VisionHelper.GetEffectiveVisionRange(brigade, grid),
            RevealedFromForest = brigade.TurnState.RevealedFromForest,
            CurrentAccuracy = Combat.DamageCalculator.GetAccuracy(brigade)
        };
    }

    public static Commands.GameCommand FromDto(GameCommandDto dto)
    {
        HexCoord? target = dto.TargetQ.HasValue && dto.TargetR.HasValue
            ? new HexCoord(dto.TargetQ.Value, dto.TargetR.Value)
            : null;

        return new Commands.GameCommand
        {
            Type = Enum.Parse<CommandType>(dto.Type),
            PlayerId = dto.PlayerId,
            BrigadeId = dto.BrigadeId,
            TargetCoord = target,
            WeaponId = dto.WeaponId,
            AbilityId = dto.AbilityId
        };
    }
}
