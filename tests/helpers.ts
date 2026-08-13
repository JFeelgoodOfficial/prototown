import type { GameState, Tile, Unit, City, PlayerState, TerrainType } from "../src/engine/state";
import type { UnitType } from "../src/data/units";
import { UNITS } from "../src/data/units";

/** Build a small all-field test map with two players and their capitals in opposite corners. */
export function makeTestState(size = 8): GameState {
  const tiles: Tile[] = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      tiles.push({ x, y, terrain: "field", resource: null, building: null, cityId: null, village: false, cityHere: null, ruin: false });

  const state: GameState = {
    seed: 1,
    rngState: 1,
    size,
    mapType: "square",
    turn: 1,
    currentPlayerId: 0,
    tiles,
    cities: [],
    units: [],
    players: [],
    nextId: 1,
    winMode: "domination",
    maxTurns: 30,
    winnerId: null,
    lastRuinReward: null,
    scoreHistory: [],
    nukeLaunched: false,
  };

  // Korvani (boat speed) and Thornwood (climbing) are the two tribes whose
  // abilities leave land combat and income untouched, so the formula tests
  // below measure the rules rather than a tribe bonus. Tests that care about
  // an ability set the tribe themselves.
  addPlayer(state, "korvani", true);
  addPlayer(state, "thornwood", false);
  addCity(state, 0, 1, 1, true);
  addCity(state, 1, size - 2, size - 2, true);
  return state;
}

export function addPlayer(state: GameState, tribeId: string, isHuman: boolean): PlayerState {
  const p: PlayerState = {
    id: state.players.length,
    tribeId,
    isHuman,
    stars: 5,
    techs: [],
    explored: new Array(state.size * state.size).fill(1),
    alive: true,
  };
  state.players.push(p);
  return p;
}

export function addCity(state: GameState, ownerId: number, x: number, y: number, isCapital = false): City {
  const city: City = {
    id: state.nextId++,
    x,
    y,
    ownerId,
    name: `City${state.cities.length}`,
    level: 1,
    population: 0,
    isCapital,
    walls: false,
    workshop: false,
    parks: 0,
    borderRadius: 1,
    pendingReward: null,
  };
  state.cities.push(city);
  const t = state.tiles[y * state.size + x];
  t.cityHere = city.id;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < state.size && ny < state.size) {
        const nt = state.tiles[ny * state.size + nx];
        if (nt.cityId === null) nt.cityId = city.id;
      }
    }
  return city;
}

export function addUnit(state: GameState, ownerId: number, type: UnitType, x: number, y: number): Unit {
  const def = UNITS[type];
  const u: Unit = {
    id: state.nextId++,
    type,
    ownerId,
    homeCityId: null,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    kills: 0,
    veteran: false,
    moved: false,
    attacked: false,
    fortified: false,
      embarked: null,
  };
  state.units.push(u);
  return u;
}

export function setTerrain(state: GameState, x: number, y: number, terrain: TerrainType): void {
  state.tiles[y * state.size + x].terrain = terrain;
}
