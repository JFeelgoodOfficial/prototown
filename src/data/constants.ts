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

export const BUILDING_DEFS = {
  lumber_hut: { cost: 3, pop: 1, tech: "forestry", terrain: "forest" },
  farm: { cost: 5, pop: 2, tech: "farming", terrain: "field", needsResource: "crop" },
  mine: { cost: 5, pop: 2, tech: "mining", terrain: "mountain", needsResource: "metal" },
  port: { cost: 7, pop: 1, tech: "sailing", terrain: "water" },
} as const;

/**
 * City improvements you can buy outright once the tech is known. These are the
 * same two things the level-up reward table hands out by chance — Construction
 * and Spiritualism let you go and get them instead of waiting to be offered.
 */
export const CITY_IMPROVEMENTS = {
  walls: { cost: 8, tech: "construction", name: "City Walls" },
  park: { cost: 12, tech: "spiritualism", name: "Grand Park" },
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

// Ruins: one per ~45 tiles, claimed by walking a unit in
export const RUIN_TILES_PER = 45;
export const RUIN_STARS = 8;
export const RUIN_POPULATION = 2;
/** radius of map revealed by a cartographer's ruin */
export const RUIN_MAP_RADIUS = 3;
