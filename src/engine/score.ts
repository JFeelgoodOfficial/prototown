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
