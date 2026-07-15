export const ARMY_BUDGET = 500;
export const MIN_ROSTER_SIZE = 1;
export const MAX_ROSTER_SIZE = 6;

export type UnitType = 'Scout' | 'Infantry' | 'Tank' | 'Artillery' | 'AntiTank';

export interface LoadoutUnit {
  unitType: UnitType;
  upgrades: string[];
}

const UNIT_COSTS: Record<UnitType, number> = {
  Scout: 70,
  Infantry: 90,
  AntiTank: 130,
  Artillery: 160,
  Tank: 200,
};

const UPGRADE_COSTS: Record<UnitType, Record<string, number>> = {
  Scout: { Camouflage: 40 },
  Infantry: { AntiTankRounds: 50, VeteranDefense: 80 },
  Tank: { ReinforcedArmor: 60, ImprovedGun: 90 },
  Artillery: { RapidDeployment: 70, ExtendedRange: 100 },
  AntiTank: { HEATRounds: 55, Camouflage: 75 },
};

export const ALL_UNIT_TYPES: UnitType[] = ['Scout', 'Infantry', 'Tank', 'Artillery', 'AntiTank'];

export function getUnitCost(unitType: UnitType): number {
  return UNIT_COSTS[unitType];
}

export function getUpgradeCost(unitType: UnitType, upgrade: string): number {
  return UPGRADE_COSTS[unitType]?.[upgrade] ?? Number.MAX_SAFE_INTEGER;
}

export function getAvailableUpgrades(unitType: UnitType): string[] {
  return Object.keys(UPGRADE_COSTS[unitType] ?? {});
}

export function calculateRosterCost(roster: LoadoutUnit[]): number {
  let total = 0;
  for (const unit of roster) {
    total += getUnitCost(unit.unitType);
    for (const upgrade of unit.upgrades) {
      total += getUpgradeCost(unit.unitType, upgrade);
    }
  }
  return total;
}

export function validateRoster(roster: LoadoutUnit[]): string | null {
  if (roster.length < MIN_ROSTER_SIZE) return `Add at least ${MIN_ROSTER_SIZE} unit.`;
  if (roster.length > MAX_ROSTER_SIZE) return `Maximum ${MAX_ROSTER_SIZE} units.`;
  for (const unit of roster) {
    for (const upgrade of unit.upgrades) {
      if (!getAvailableUpgrades(unit.unitType).includes(upgrade)) {
        return `${upgrade} unavailable for ${unit.unitType}.`;
      }
    }
  }
  const cost = calculateRosterCost(roster);
  if (cost > ARMY_BUDGET) return `Over budget (${cost}/${ARMY_BUDGET}).`;
  return null;
}

export function isInDeploymentZone(playerId: number, q: number, r: number, mapSize: number): boolean {
  if (r < 4 || r > mapSize - 6) return false;
  if (playerId === 0) return q >= 0 && q <= 2;
  if (playerId === 1) return q >= mapSize - 3 && q <= mapSize - 1;
  return false;
}

export function getDeploymentZoneHexes(playerId: number, mapSize: number): Array<{ q: number; r: number }> {
  const hexes: Array<{ q: number; r: number }> = [];
  for (let row = 4; row <= mapSize - 6; row++) {
    const colMin = playerId === 0 ? 0 : mapSize - 3;
    const colMax = playerId === 0 ? 2 : mapSize - 1;
    for (let col = colMin; col <= colMax; col++) {
      hexes.push({ q: col, r: row });
    }
  }
  return hexes;
}
