export const INITIAL_STARS = 5;
export const ATTACK_ACCELERATOR = 4.5;
export const DEFENCE_BONUS_TERRAIN = 1.5;
export const DEFENCE_BONUS_WALLS = 4.0;

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

// Harvest / building costs (stars) and population yields
export const HARVEST_DEFS = {
  fruit: { cost: 2, pop: 1, tech: "organization" },
  animal: { cost: 2, pop: 1, tech: "hunting" },
  fish: { cost: 2, pop: 1, tech: "fishing" },
} as const;

export const BUILDING_DEFS = {
  lumber_hut: { cost: 3, pop: 1, tech: "forestry", terrain: "forest" },
  farm: { cost: 5, pop: 2, tech: "farming", terrain: "field", needsResource: "crop" },
  mine: { cost: 5, pop: 2, tech: "mining", terrain: "mountain", needsResource: "metal" },
  port: { cost: 7, pop: 1, tech: "sailing", terrain: "water" },
} as const;

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
