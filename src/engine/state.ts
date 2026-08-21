import type { UnitType } from "../data/units";
import { UNITS } from "../data/units";
import { sphereTopology } from "./topology";

export type TerrainType = "field" | "forest" | "mountain" | "water" | "ocean" | "crater" | "void";
export type ResourceType = "fruit" | "animal" | "fish" | "whale" | "metal" | "crop";
export type BuildingType =
  | "lumber_hut"
  | "farm"
  | "mine"
  | "port"
  | "naval_tower"
  | "airfield"
  | "flak_tower"
  | "hospital"
  | "spaceport";

export interface Tile {
  x: number;
  y: number;
  terrain: TerrainType;
  resource: ResourceType | null;
  building: BuildingType | null;
  /** id of the city whose territory contains this tile */
  cityId: number | null;
  /** uncaptured neutral village sits here */
  village: boolean;
  /** city (or captured village) sits here */
  cityHere: number | null;
  /** unexplored ruin: the first unit to walk in claims what's inside */
  ruin: boolean;
  /** field whose fruit has been picked: worked ground, and so farmable */
  tilled: boolean;
  /** turn a tower on this tile last fired, so each one fires once a turn */
  firedTurn: number | null;
  /**
   * Firestorm: the turn the flames on this tile die down. Null on ground that
   * is not burning. Anything that walks in while it burns does not walk out.
   */
  fireOutTurn: number | null;
}

export interface City {
  id: number;
  x: number;
  y: number;
  ownerId: number;
  name: string;
  level: number;
  /** population progress toward next level; next level needs level+1 */
  population: number;
  isCapital: boolean;
  walls: boolean;
  workshop: boolean;
  parks: number;
  /** orbital space station: lets units launch from this city's spaceport */
  spaceStation: boolean;
  /** territory radius: 1 normally, 2 after border growth */
  borderRadius: 1 | 2;
  /** pending level-up reward the owner must pick: [optionA, optionB] */
  pendingReward: [string, string] | null;
}

export interface Unit {
  id: number;
  type: UnitType;
  ownerId: number;
  /** city that supports this unit (counts against its capacity) */
  homeCityId: number | null;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  kills: number;
  veteran: boolean;
  moved: boolean;
  attacked: boolean;
  /** dug in: defends better, until it moves or attacks */
  fortified: boolean;
  /** null on land; the naval form carrying this unit; or "orbit" between launch and landing */
  embarked: "raft" | "ship" | "orbit" | null;
}

export interface PlayerState {
  id: number;
  tribeId: string;
  isHuman: boolean;
  stars: number;
  techs: string[];
  /** 0/1 per tile, row-major; tiles this player has ever seen */
  explored: number[];
  alive: boolean;
}

export type WinMode = "domination" | "perfection";

/** Shape of the world. "void" tiles pad non-square shapes inside the square array. */
export type MapType = "square" | "circle" | "continents" | "globe" | "twin_globes";

export interface GameState {
  seed: number;
  /** PRNG cursor — advanced by every random draw so replays are deterministic */
  rngState: number;
  size: number;
  mapType: MapType;
  turn: number;
  currentPlayerId: number;
  tiles: Tile[];
  cities: City[];
  units: Unit[];
  players: PlayerState[];
  nextId: number;
  winMode: WinMode;
  maxTurns: number;
  winnerId: number | null;
  /** what the last ruin gave up, for the UI to announce; cleared each action */
  lastRuinReward: RuinReward | null;
  /** score per player at the end of each completed turn, oldest first */
  scoreHistory: number[][];
  /** true once any player has fired the game's single nuke */
  nukeLaunched: boolean;
  /** flak that just hit an aircraft, for the UI to announce; cleared each action */
  lastFlakHit: FlakHit | null;
}

/** An aircraft caught by anti-air fire as it flew in. */
export interface FlakHit {
  unitId: number;
  x: number;
  y: number;
  damage: number;
  destroyed: boolean;
}

export type RuinRewardKind = "stars" | "tech" | "veteran" | "population" | "map";

export interface RuinReward {
  kind: RuinRewardKind;
  x: number;
  y: number;
  playerId: number;
  /** short human-readable label, e.g. "+8 stars" */
  label: string;
}

/**
 * The grid the tiles array is laid out on. Flat maps are size×size; a globe
 * is the six n×n cube faces side by side — one row-major grid 6n wide and
 * n tall, where `size` is the face resolution n. Twin globes are two such
 * planets side by side in one 12n-wide grid — planet 0 in columns [0, 6n),
 * planet 1 in [6n, 12n) — with no adjacency between them. All indexing goes
 * through these so nothing else needs to know which world shape it is on.
 */
export type Grid = Pick<GameState, "size" | "mapType">;

/** Cube-sphere world(s): adjacency comes from sphereTopology, not the flat grid. */
export function isGlobeGrid(state: Grid): boolean {
  return state.mapType === "globe" || state.mapType === "twin_globes";
}

export function planetCount(state: Grid): number {
  return state.mapType === "twin_globes" ? 2 : 1;
}

/** Which planet a column belongs to. Always 0 on single-world maps. */
export function planetOf(state: Grid, x: number): number {
  return state.mapType === "twin_globes" && x >= state.size * 6 ? 1 : 0;
}

/** Topology-local tile index of (x, y) on its own planet's cube-sphere. */
function topoIdx(state: Grid, x: number, y: number): number {
  const w = state.size * 6;
  return y * w + (x - planetOf(state, x) * w);
}

/** Grid coordinates of a topology-local tile index on the given planet. */
function topoCoords(state: Grid, planet: number, i: number): [number, number] {
  const w = state.size * 6;
  return [(i % w) + planet * w, Math.floor(i / w)];
}

export function gridWidth(state: Grid): number {
  return isGlobeGrid(state) ? state.size * 6 * planetCount(state) : state.size;
}

export function gridHeight(state: Grid): number {
  return state.size;
}

export function tileCount(state: Grid): number {
  return gridWidth(state) * gridHeight(state);
}

export function idx(state: Grid, x: number, y: number): number {
  return y * gridWidth(state) + x;
}

export function coordsOf(state: Grid, i: number): [number, number] {
  const w = gridWidth(state);
  return [i % w, Math.floor(i / w)];
}

export function inBounds(state: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < gridWidth(state) && y < gridHeight(state);
}

export function tileAt(state: GameState, x: number, y: number): Tile {
  return state.tiles[idx(state, x, y)];
}

/** In bounds and not an off-map void tile. */
export function isPlayable(state: Pick<GameState, "size" | "mapType" | "tiles">, x: number, y: number): boolean {
  return inBounds(state, x, y) && state.tiles[idx(state, x, y)].terrain !== "void";
}

/**
 * Whether a firestorm is still burning on this tile. The flames are set to go
 * out on a stated turn, so the check is against the clock rather than a
 * countdown ticking on every tile of the map.
 */
export function isBurning(state: Pick<GameState, "turn">, tile: Tile): boolean {
  return tile.fireOutTurn !== null && state.turn < tile.fireOutTurn;
}

/**
 * Whether fire on this tile would kill the unit. Aircraft are over the flames
 * rather than in them, and a unit in orbit is over the whole world — its tile
 * is only the pad it left from.
 */
export function burnsUnit(state: Pick<GameState, "turn">, tile: Tile, unit: Unit): boolean {
  return isBurning(state, tile) && !UNITS[unit.type].air && unit.embarked !== "orbit";
}

export function unitAt(state: GameState, x: number, y: number): Unit | undefined {
  return state.units.find((u) => u.x === x && u.y === y);
}

export function unitById(state: GameState, id: number): Unit | undefined {
  return state.units.find((u) => u.id === id);
}

export function cityById(state: GameState, id: number): City | undefined {
  return state.cities.find((c) => c.id === id);
}

export function playerById(state: GameState, id: number): PlayerState {
  const p = state.players.find((p) => p.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

export function citiesOf(state: GameState, playerId: number): City[] {
  return state.cities.filter((c) => c.ownerId === playerId);
}

export function unitsOf(state: GameState, playerId: number): Unit[] {
  return state.units.filter((u) => u.ownerId === playerId);
}

/** Tiles inside a player's borders carrying the given building. */
export function buildingsOf(state: GameState, playerId: number, building: BuildingType): Tile[] {
  return state.tiles.filter(
    (t) => t.building === building && t.cityId !== null && cityById(state, t.cityId)?.ownerId === playerId,
  );
}

export function hasTech(player: PlayerState, techId: string | null): boolean {
  return techId === null || player.techs.includes(techId);
}

/** All 8 neighbours (the reference game uses Moore adjacency). On a globe
    the adjacency folds across cube-face edges instead of stopping. */
export function neighbors(state: Grid, x: number, y: number): Array<[number, number]> {
  if (isGlobeGrid(state)) {
    const planet = planetOf(state, x);
    return sphereTopology(state.size).neighborTable[topoIdx(state, x, y)].map((i) =>
      topoCoords(state, planet, i),
    );
  }
  const out: Array<[number, number]> = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(state, nx, ny)) out.push([nx, ny]);
    }
  return out;
}

/**
 * Range and adjacency metric: Chebyshev distance on flat maps, where it is
 * exactly the number of 8-way steps; graph distance in 8-way steps on a globe.
 * Tiles on different planets are unreachable on foot: Infinity.
 */
export function dist(state: Grid, ax: number, ay: number, bx: number, by: number): number {
  if (isGlobeGrid(state)) {
    if (planetOf(state, ax) !== planetOf(state, bx)) return Infinity;
    return sphereTopology(state.size).dist(topoIdx(state, ax, ay), topoIdx(state, bx, by));
  }
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Every in-bounds tile within `r` steps of (x, y), the centre included.
 * The replacement for `for dy/dx` square loops, which mean nothing across
 * cube-face edges.
 */
export function disk(state: Grid, x: number, y: number, r: number): Array<[number, number]> {
  if (isGlobeGrid(state)) {
    const planet = planetOf(state, x);
    const topo = sphereTopology(state.size);
    const d = topo.distField(topoIdx(state, x, y));
    const out: Array<[number, number]> = [];
    for (let i = 0; i < topo.count; i++) if (d[i] <= r) out.push(topoCoords(state, planet, i));
    return out;
  }
  const out: Array<[number, number]> = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(state, nx, ny)) out.push([nx, ny]);
    }
  return out;
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}
