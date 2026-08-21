import type { BuildingType, ResourceType, TerrainType } from "../engine/state";

export const INITIAL_STARS = 5;
export const ATTACK_ACCELERATOR = 4.5;
export const DEFENCE_BONUS_TERRAIN = 1.5;
export const DEFENCE_BONUS_WALLS = 4.0;

/** Defence multiplier for a unit that spent a turn digging in. */
export const FORTIFY_BONUS = 1.4;
/** Extra damage per friendly unit already pressing the defender, and its cap. */
export const FLANK_BONUS_PER_UNIT = 0.15;
export const FLANK_BONUS_MAX = 0.45;

export const RECOVER_HEAL = 2;
export const RECOVER_HEAL_OWN_TERRITORY = 4;

export const VETERAN_KILLS = 3;
export const VETERAN_HP_BONUS = 5;

export const CAPITAL_INCOME_BONUS = 1;
export const WORKSHOP_INCOME = 1;

export const CITY_BASE_INCOME = 1;

export const PARK_POINTS = 250;

export const MAX_TURNS_PERFECTION = 30;

// Score weights (Perfection mode)
export const POINTS_PER_POPULATION = 5;
export const POINTS_PER_CITY_LEVEL = 50;
export const POINTS_PER_CITY = 100;
export const POINTS_PER_TILE_REVEALED = 5;
export const POINTS_PER_UNIT_COST = 5;
export const POINTS_PER_TECH_TIER = 100;

// Tech effects
/** Roads: cost of a step between two land tiles of your own territory. */
export const ROAD_MOVE_COST = 0.5;
/** Trade: extra stars per turn from every city. */
export const TRADE_INCOME_PER_CITY = 1;
/** Strategy: extra units every city can support. */
export const STRATEGY_CAPACITY_BONUS = 1;
/** Philosophy: what a tech costs once you know it. */
export const PHILOSOPHY_DISCOUNT = 0.8;
/** Whaling: stars a whale pays out when harvested. */
export const WHALE_STARS = 10;
/** Fraction of shallow-water resources near a settlement that are whales. */
export const WHALE_SHARE = 1 / 3;
/** Parks a single city may ever hold, however they were come by. */
export const MAX_PARKS_PER_CITY = 2;

// Harvest / building costs (stars), population yields, and star payouts
export const HARVEST_DEFS = {
  fruit: { cost: 2, pop: 1, stars: 0, tech: "organization" },
  animal: { cost: 2, pop: 1, stars: 0, tech: "hunting" },
  fish: { cost: 2, pop: 1, stars: 0, tech: "fishing" },
  whale: { cost: 2, pop: 0, stars: WHALE_STARS, tech: "whaling" },
} as const;

export interface BuildingDef {
  name: string;
  cost: number;
  /** population the site feeds on its own */
  pop: number;
  tech: string;
  terrain: TerrainType;
  /**
   * A resource the site is worth more on top of. Without it the building still
   * goes up — a mine cut into bare rock, a farm on ground that has already been
   * cleared — it simply feeds `pop` instead of `pop + bonusPop`.
   */
  bonusResource?: ResourceType;
  bonusPop?: number;
  /** needs ground that has already given up its fruit: only a farm does */
  needsTilled?: boolean;
}

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  lumber_hut: { name: "Lumber Hut", cost: 3, pop: 1, tech: "forestry", terrain: "forest" },
  farm: { name: "Farm", cost: 5, pop: 1, tech: "farming", terrain: "field", bonusResource: "crop", bonusPop: 1, needsTilled: true },
  mine: { name: "Mine", cost: 5, pop: 1, tech: "mining", terrain: "mountain", bonusResource: "metal", bonusPop: 1 },
  port: { name: "Port", cost: 7, pop: 1, tech: "sailing", terrain: "water" },
  naval_tower: { name: "Naval Tower", cost: 8, pop: 0, tech: "coastal_defence", terrain: "water" },
  airfield: { name: "Airfield", cost: 10, pop: 1, tech: "flight", terrain: "field" },
  flak_tower: { name: "Flak Tower", cost: 8, pop: 0, tech: "air_defence", terrain: "field" },
  hospital: { name: "Hospital", cost: 8, pop: 2, tech: "medicine", terrain: "field" },
  spaceport: { name: "Spaceport", cost: 10, pop: 1, tech: "space_travel", terrain: "field" },
};

/**
 * Whether this building may go up on this tile. A building with a
 * `bonusResource` may be raised on top of that resource; otherwise the ground
 * has to be clear, because paving over an unharvested resource loses it.
 */
export function buildingFits(def: BuildingDef, terrain: TerrainType, resource: ResourceType | null, tilled: boolean): boolean {
  if (def.terrain !== terrain) return false;
  if (def.bonusResource !== undefined && resource === def.bonusResource) return true;
  if (resource !== null) return false;
  return !def.needsTilled || tilled;
}

/** Population the finished building feeds, richer on top of its bonus resource. */
export function buildingPop(def: BuildingDef, resource: ResourceType | null): number {
  return def.pop + (def.bonusResource !== undefined && resource === def.bonusResource ? (def.bonusPop ?? 0) : 0);
}

// Naval Towers: shore guns that shell enemy vessels, and watch the sea they cover.
export const NAVAL_TOWER_RANGE = 4;
export const NAVAL_TOWER_ATK = 4;

// Flak Towers: fire on any enemy aircraft that flies inside their umbrella.
export const FLAK_RANGE = 3;
export const FLAK_DAMAGE = 6;

/**
 * The bomb has no legs of its own: only a Bomber carries it, and only this far
 * out from where it is parked — one sortie's flight, the same three tiles the
 * plane could have crossed under its own power.
 */
export const NUKE_DELIVERY_RANGE = 3;

// Hospitals and Medics: free healing at the start of your turn, no action spent.
export const HOSPITAL_RANGE = 2;
export const HOSPITAL_HEAL = 3;
export const MEDIC_RANGE = 1;
export const MEDIC_HEAL = 2;

/** Stars to send settlers out and found a brand-new town on neutral ground. */
export const FOUND_CITY_COST = 100;

/**
 * City improvements you can buy outright once the tech is known. These are the
 * same two things the level-up reward table hands out by chance — Construction
 * and Spiritualism let you go and get them instead of waiting to be offered.
 */
export const CITY_IMPROVEMENTS = {
  walls: { cost: 8, tech: "construction", name: "City Walls" },
  park: { cost: 12, tech: "spiritualism", name: "Grand Park" },
  station: { cost: 15, tech: "space_travel", name: "Space Station" },
} as const;
export type CityImprovement = keyof typeof CITY_IMPROVEMENTS;

// City rewards offered on level-up: [option A, option B]
export const LEVEL_REWARDS: Record<number, [string, string]> = {
  2: ["workshop", "explorer"],
  3: ["walls", "stars"], // stars = +5
  4: ["border_growth", "population"], // +3 pop
  5: ["park", "super_unit"], // level 5 and beyond
};
export const REWARD_STARS_AMOUNT = 5;
export const REWARD_POPULATION_AMOUNT = 3;

export const CITY_UNIT_CAPACITY_BASE = 1; // capacity = level + 1

// Space travel (twin-globe maps)
/** Survey sites photographed on the other planet when a Space Station is built. */
export const SURVEY_SITES = 3;
/** Radius revealed around each survey site. */
export const SURVEY_RADIUS = 2;

// Ruins: one per ~45 tiles, claimed by walking a unit in
export const RUIN_TILES_PER = 45;
export const RUIN_STARS = 8;
export const RUIN_POPULATION = 2;
/** radius of map revealed by a cartographer's ruin */
export const RUIN_MAP_RADIUS = 3;
