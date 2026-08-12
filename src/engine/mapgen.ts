import type { GameState, PlayerState, Tile, TerrainType, City, Unit } from "./state";
import { idx, inBounds, neighbors, dist } from "./state";
import { mulberry32, nextInt } from "./rng";
import { tribeById } from "../data/tribes";
import { INITIAL_STARS, MAX_TURNS_PERFECTION, RUIN_TILES_PER, WHALE_SHARE } from "../data/constants";
import { computeVisibility } from "./fog";
import type { WinMode } from "./state";

export interface NewGameOptions {
  seed: number;
  size: number;
  /** tribe ids; the first `humanSeats` are human players */
  tribes: string[];
  winMode: WinMode;
  /** How many leading seats are humans. Defaults to 1 (local play). */
  humanSeats?: number;
}

/** Smooth value noise in [0,1] from a coarse random lattice. */
function valueNoise(rand: () => number, size: number, freq: number): number[] {
  const gridN = Math.max(2, Math.round(size / freq) + 1);
  const lattice: number[] = [];
  for (let i = 0; i < gridN * gridN; i++) lattice.push(rand());
  const at = (gx: number, gy: number) =>
    lattice[Math.min(gy, gridN - 1) * gridN + Math.min(gx, gridN - 1)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const out: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / (size - 1)) * (gridN - 1);
      const fy = (y / (size - 1)) * (gridN - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = smooth(fx - x0);
      const ty = smooth(fy - y0);
      const a = at(x0, y0);
      const b = at(x0 + 1, y0);
      const c = at(x0, y0 + 1);
      const d = at(x0 + 1, y0 + 1);
      out.push(a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
    }
  }
  return out;
}

/** Pick capital positions greedily maximizing the minimum pairwise distance. */
function placeCapitals(rand: () => number, size: number, count: number): Array<[number, number]> {
  const margin = 2;
  const candidates: Array<[number, number]> = [];
  for (let y = margin; y < size - margin; y++)
    for (let x = margin; x < size - margin; x++) candidates.push([x, y]);

  const picks: Array<[number, number]> = [];
  picks.push(candidates[Math.floor(rand() * candidates.length)]);
  while (picks.length < count) {
    let best: [number, number] | null = null;
    let bestScore = -1;
    for (const c of candidates) {
      const d = Math.min(...picks.map((p) => dist(c[0], c[1], p[0], p[1])));
      if (d > bestScore) {
        bestScore = d;
        best = c;
      }
    }
    picks.push(best!);
  }
  return picks;
}

export function newGame(opts: NewGameOptions): GameState {
  const { seed, size, tribes, winMode } = opts;
  if (tribes.length < 2 || tribes.length > 4) throw new Error("2-4 tribes");
  const rand = mulberry32(seed);

  const capitals = placeCapitals(rand, size, tribes.length);

  // Terrain from two noise fields: elevation decides water/land/mountain,
  // moisture decides forest. Tribe biases tilt generation near each capital.
  const elevation = valueNoise(rand, size, 4);
  const moisture = valueNoise(rand, size, 3);

  const tiles: Tile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let e = elevation[y * size + x];
      let m = moisture[y * size + x];

      // Bias terrain near capitals by tribe preference
      for (let i = 0; i < capitals.length; i++) {
        const [cx, cy] = capitals[i];
        const d = dist(x, y, cx, cy);
        if (d <= 3) {
          const tribe = tribeById(tribes[i]);
          const w = (3 - d) / 3;
          m = m * (1 + (tribe.forestBias - 1) * w * 0.5);
          e = e * (1 + (tribe.mountainBias - 1) * w * 0.25);
          if (tribe.waterBias > 1) e -= 0.08 * w;
        }
      }

      let terrain: TerrainType;
      if (e < 0.32) terrain = e < 0.22 ? "ocean" : "water";
      else if (e > 0.78) terrain = "mountain";
      else terrain = m > 0.62 ? "forest" : "field";

      tiles.push({ x, y, terrain, resource: null, building: null, cityId: null, village: false, cityHere: null, ruin: false });
    }
  }

  const state: GameState = {
    seed,
    rngState: seed ^ 0x9e3779b9,
    size,
    turn: 1,
    currentPlayerId: 0,
    tiles,
    cities: [],
    units: [],
    players: [],
    nextId: 1,
    winMode,
    maxTurns: MAX_TURNS_PERFECTION,
    winnerId: null,
    lastRuinReward: null,
    scoreHistory: [],
    nukeLaunched: false,
  };

  // Capitals: force a playable pocket of land around each
  for (let i = 0; i < capitals.length; i++) {
    const [cx, cy] = capitals[i];
    tiles[idx(state, cx, cy)].terrain = "field";
    for (const [nx, ny] of neighbors(state, cx, cy)) {
      const t = tiles[idx(state, nx, ny)];
      if (t.terrain === "ocean") t.terrain = "water";
      if (t.terrain === "mountain" && nextInt(state, 3) === 0) t.terrain = "field";
    }
  }

  // Guarantee land reachability between capitals: carve field corridors
  carveCorridors(state, capitals);

  // Villages: ~1 per 20 tiles, on land, spaced away from capitals and each other
  const villageTarget = Math.floor((size * size) / 20);
  let villagesPlaced = 0;
  let attempts = 0;
  while (villagesPlaced < villageTarget && attempts < 4000) {
    attempts++;
    const x = nextInt(state, size);
    const y = nextInt(state, size);
    const t = tiles[idx(state, x, y)];
    if (t.terrain !== "field" && t.terrain !== "forest") continue;
    const nearCapital = capitals.some(([cx, cy]) => dist(x, y, cx, cy) < 3);
    const nearVillage = tiles.some((o) => o.village && dist(x, y, o.x, o.y) < 3);
    if (nearCapital || nearVillage) continue;
    t.terrain = "field";
    t.village = true;
    t.resource = null;
    villagesPlaced++;
  }

  // Ruins: rarer than villages and pushed out toward the unexplored middle
  // ground, so exploring away from home has a payoff of its own.
  const ruinTarget = Math.floor((size * size) / RUIN_TILES_PER);
  let ruinsPlaced = 0;
  attempts = 0;
  while (ruinsPlaced < ruinTarget && attempts < 4000) {
    attempts++;
    const x = nextInt(state, size);
    const y = nextInt(state, size);
    const t = tiles[idx(state, x, y)];
    if (t.terrain !== "field" && t.terrain !== "forest" && t.terrain !== "mountain") continue;
    if (t.village || t.ruin) continue;
    if (capitals.some(([cx, cy]) => dist(x, y, cx, cy) < 4)) continue;
    if (tiles.some((o) => o.ruin && dist(x, y, o.x, o.y) < 3)) continue;
    t.ruin = true;
    t.resource = null;
    ruinsPlaced++;
  }

  // Resources — biased near villages and capitals (their future territory)
  const settlementTiles = [
    ...capitals.map(([x, y]) => ({ x, y })),
    ...tiles.filter((t) => t.village),
  ];
  for (const t of tiles) {
    if (t.village || t.ruin || t.cityHere !== null) continue;
    const nearSettlement = settlementTiles.some((s) => dist(t.x, t.y, s.x, s.y) <= 2);
    const chance = nearSettlement ? 0.5 : 0.08;
    if (t.terrain === "field") {
      if (nextInt(state, 100) < chance * 60) t.resource = nextInt(state, 2) === 0 ? "fruit" : "crop";
    } else if (t.terrain === "forest") {
      if (nextInt(state, 100) < chance * 55) t.resource = "animal";
    } else if (t.terrain === "mountain") {
      if (nextInt(state, 100) < chance * 55) t.resource = "metal";
    } else if (t.terrain === "water") {
      // One draw, as before, so every existing seed keeps the same map shape —
      // only what some shallow water holds changes. Whales are the rarest end
      // of that roll and never appear away from a settlement, because water
      // outside anyone's future borders can never be harvested.
      const roll = nextInt(state, 100);
      if (roll < chance * 45) {
        t.resource = nearSettlement && roll < chance * 45 * WHALE_SHARE ? "whale" : "fish";
      }
    }
  }

  // Players, capital cities, starting units
  for (let i = 0; i < tribes.length; i++) {
    const tribe = tribeById(tribes[i]);
    const player: PlayerState = {
      id: i,
      tribeId: tribe.id,
      isHuman: i < (opts.humanSeats ?? 1),
      stars: INITIAL_STARS,
      techs: [tribe.startingTech],
      explored: new Array(size * size).fill(0),
      alive: true,
    };
    state.players.push(player);

    const [cx, cy] = capitals[i];
    const city: City = {
      id: state.nextId++,
      x: cx,
      y: cy,
      ownerId: i,
      name: tribe.cityNames[0],
      level: 1,
      population: 0,
      isCapital: true,
      walls: false,
      workshop: false,
      parks: 0,
      borderRadius: 1,
      pendingReward: null,
    };
    state.cities.push(city);
    const capTile = tiles[idx(state, cx, cy)];
    capTile.cityHere = city.id;
    claimTerritory(state, city);

    const unit: Unit = {
      id: state.nextId++,
      type: "warrior",
      ownerId: i,
      homeCityId: city.id,
      x: cx,
      y: cy,
      hp: 10,
      maxHp: 10,
      kills: 0,
      veteran: false,
      moved: false,
      attacked: false,
      fortified: false,
      embarked: null,
    };
    state.units.push(unit);
    computeVisibility(state, player);
  }

  return state;
}

/** Claim unowned tiles within the city's border radius. */
export function claimTerritory(state: GameState, city: City): void {
  for (let dy = -city.borderRadius; dy <= city.borderRadius; dy++) {
    for (let dx = -city.borderRadius; dx <= city.borderRadius; dx++) {
      const x = city.x + dx;
      const y = city.y + dy;
      if (!inBounds(state, x, y)) continue;
      const t = state.tiles[idx(state, x, y)];
      if (t.cityId === null) t.cityId = city.id;
    }
  }
}

/** Carve 1-wide field corridors along L-paths so all capitals connect by land. */
function carveCorridors(state: GameState, capitals: Array<[number, number]>): void {
  for (let i = 1; i < capitals.length; i++) {
    const [ax, ay] = capitals[i - 1];
    const [bx, by] = capitals[i];
    let x = ax;
    let y = ay;
    while (x !== bx || y !== by) {
      if (x !== bx) x += Math.sign(bx - x);
      else y += Math.sign(by - y);
      const t = state.tiles[idx(state, x, y)];
      if (t.terrain === "water" || t.terrain === "ocean") t.terrain = "field";
    }
  }
}
