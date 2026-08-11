import type { GameState } from "./state";
import { citiesOf, unitsOf, playerById } from "./state";
import { totalPopulation } from "./economy";
import { UNITS } from "../data/units";
import { TECH_BY_ID } from "../data/techs";
import {
  PARK_POINTS,
  POINTS_PER_CITY,
  POINTS_PER_CITY_LEVEL,
  POINTS_PER_POPULATION,
  POINTS_PER_TECH_TIER,
  POINTS_PER_TILE_REVEALED,
  POINTS_PER_UNIT_COST,
} from "../data/constants";

export interface ScorePart {
  label: string;
  /** what earned it, e.g. "4 cities" */
  detail: string;
  points: number;
}

/** Where a player's score comes from, largest contribution first. */
export function scoreBreakdown(state: GameState, playerId: number): ScorePart[] {
  const player = playerById(state, playerId);
  const cities = citiesOf(state, playerId);
  const units = unitsOf(state, playerId);

  const levels = cities.reduce((n, c) => n + c.level, 0);
  const population = cities.reduce((n, c) => n + totalPopulation(c), 0);
  const parks = cities.reduce((n, c) => n + c.parks, 0);
  const unitCost = units.reduce((n, u) => n + UNITS[u.type].cost, 0);
  const techTiers = player.techs.reduce((n, id) => n + TECH_BY_ID[id].tier, 0);
  const explored = player.explored.reduce((a, b) => a + b, 0);

  const parts: ScorePart[] = [
    { label: "Cities", detail: plural(cities.length, "city", "cities"), points: cities.length * POINTS_PER_CITY },
    { label: "City levels", detail: `${levels} total`, points: levels * POINTS_PER_CITY_LEVEL },
    { label: "Population", detail: plural(population, "citizen", "citizens"), points: population * POINTS_PER_POPULATION },
    { label: "Technology", detail: plural(player.techs.length, "tech", "techs"), points: techTiers * POINTS_PER_TECH_TIER },
    { label: "Territory seen", detail: plural(explored, "tile", "tiles"), points: explored * POINTS_PER_TILE_REVEALED },
    { label: "Army", detail: plural(units.length, "unit", "units"), points: unitCost * POINTS_PER_UNIT_COST },
    { label: "Parks", detail: plural(parks, "park", "parks"), points: parks * PARK_POINTS },
  ];
  return parts.filter((p) => p.points > 0).sort((a, b) => b.points - a.points);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function playerScore(state: GameState, playerId: number): number {
  const player = playerById(state, playerId);
  let score = 0;
  for (const c of citiesOf(state, playerId)) {
    score += POINTS_PER_CITY;
    score += c.level * POINTS_PER_CITY_LEVEL;
    score += totalPopulation(c) * POINTS_PER_POPULATION;
    score += c.parks * PARK_POINTS;
  }
  for (const u of unitsOf(state, playerId)) {
    score += UNITS[u.type].cost * POINTS_PER_UNIT_COST;
  }
  for (const techId of player.techs) {
    score += TECH_BY_ID[techId].tier * POINTS_PER_TECH_TIER;
  }
  score += player.explored.reduce((a, b) => a + b, 0) * POINTS_PER_TILE_REVEALED;
  return score;
}
