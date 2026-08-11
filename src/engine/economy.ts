import type { GameState, City } from "./state";
import { citiesOf, unitsOf, playerById, hasTech } from "./state";
import {
  CITY_BASE_INCOME,
  CAPITAL_INCOME_BONUS,
  WORKSHOP_INCOME,
  LEVEL_REWARDS,
  TRADE_INCOME_PER_CITY,
  STRATEGY_CAPACITY_BONUS,
} from "../data/constants";
import { abilityOf } from "./tribeAbility";

/** Stars per turn for one city: base + (level-1) + capital + workshop + Trade. */
export function cityIncome(state: GameState, city: City): number {
  const trade = hasTech(playerById(state, city.ownerId), "trade") ? TRADE_INCOME_PER_CITY : 0;
  return (
    CITY_BASE_INCOME +
    (city.level - 1) +
    (city.isCapital ? CAPITAL_INCOME_BONUS : 0) +
    (city.workshop ? WORKSHOP_INCOME : 0) +
    trade
  );
}

export function playerIncome(state: GameState, playerId: number): number {
  const cities = citiesOf(state, playerId);
  const base = cities.reduce((sum, c) => sum + cityIncome(state, c), 0);
  // a tribe with no cities left is being eliminated; no stipend for them
  return cities.length === 0 ? 0 : base + abilityOf(state, playerId).incomeBonus;
}

/** Population needed to go from the city's current level to the next. */
export function popForNextLevel(city: City): number {
  return city.level + 1;
}

/** Units currently supported by the city. */
export function cityUnitCount(state: GameState, cityId: number): number {
  return state.units.filter((u) => u.homeCityId === cityId).length;
}

/** Max units a city can support: level + 1, and one more with Strategy. */
export function cityCapacity(state: GameState, city: City): number {
  const strategy = hasTech(playerById(state, city.ownerId), "strategy") ? STRATEGY_CAPACITY_BONUS : 0;
  return city.level + 1 + strategy;
}

/**
 * Add population to a city; on level-up, queue the reward choice.
 * Excess population carries over. Returns true if the city levelled.
 */
export function addPopulation(city: City, amount: number): boolean {
  city.population += amount;
  let levelled = false;
  while (city.population >= popForNextLevel(city)) {
    city.population -= popForNextLevel(city);
    city.level += 1;
    levelled = true;
    const rewards = LEVEL_REWARDS[Math.min(city.level, 5)];
    if (rewards) city.pendingReward = [...rewards] as [string, string];
  }
  return levelled;
}

/** Total population ever accumulated (for scoring): sum of thresholds passed plus current progress. */
export function totalPopulation(city: City): number {
  let total = city.population;
  for (let lvl = 1; lvl < city.level; lvl++) total += lvl + 1;
  return total;
}

export function playerHasPendingReward(state: GameState, playerId: number): City | undefined {
  return citiesOf(state, playerId).find((c) => c.pendingReward !== null);
}

export function armySize(state: GameState, playerId: number): number {
  return unitsOf(state, playerId).length;
}
