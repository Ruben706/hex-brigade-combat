namespace CombatGame.Domain.Enums;

public enum UnitType
{
    Scout,
    Infantry,
    Tank,
    Artillery,
    AntiTank
}

public enum DamageCategory
{
    SmallArms,
    HighExplosive,
    AntiArmor
}

public enum ArmorClass
{
    Soft,
    Medium,
    Heavy
}

public enum AbilityType
{
    DigIn,
    Setup,
    Ambush
}

public enum UpgradeType
{
    AntiTankRounds,
    VeteranDefense,
    ReinforcedArmor,
    ImprovedGun,
    RapidDeployment,
    ExtendedRange,
    HEATRounds,
    Camouflage
}

public enum StatusEffectType
{
    Fortified,
    ArtillerySettingUp,
    ArtilleryReady,
    Ambush,
    Camouflaged
}

public enum GameMode
{
    Hotseat,
    VsAi,
    Multiplayer
}

public enum GamePhase
{
    Lobby,
    Loadout,
    Deployment,
    InProgress,
    Victory
}

public enum CommandType
{
    Move,
    UseWeapon,
    UseAbility,
    EndTurn
}

public enum GameEventType
{
    Moved,
    Attacked,
    AbilityUsed,
    DamageDealt,
    BrigadeDestroyed,
    TurnEnded,
    UpgradeEarned,
    GameOver,
    Missed
}
