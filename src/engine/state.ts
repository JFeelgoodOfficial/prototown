import type { UnitType } from "../data/units";

export type TerrainType = "field" | "forest" | "mountain" | "water" | "ocean" | "crater";
export type ResourceType = "fruit" | "animal" | "fish" | "whale" | "metal" | "crop";
export type BuildingType = "lumber_hut" | "farm" | "mine" | "port";

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
  /** null on land; otherwise the naval form carrying this unit */
  embarked: "raft" | "ship" | null;
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

export interface GameState {
  seed: number;
  /** PRNG cursor — advanced by every random draw so replays are deterministic */
  rngState: number;
  size: number;
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

export function idx(state: Pick<GameState, "size">, x: number, y: number): number {
  return y * state.size + x;
}

export function inBounds(state: Pick<GameState, "size">, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.size && y < state.size;
}

export function tileAt(state: GameState, x: number, y: number): Tile {
  return state.tiles[idx(state, x, y)];
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

export function hasTech(player: PlayerState, techId: string | null): boolean {
  return techId === null || player.techs.includes(techId);
}

/** All 8 neighbours (the reference game uses Moore adjacency). */
export function neighbors(state: Pick<GameState, "size">, x: number, y: number): Array<[number, number]> {
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

/** Chebyshev distance — range and adjacency metric on the square grid. */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}
