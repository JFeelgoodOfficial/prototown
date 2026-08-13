import type { GameState, PlayerState, Tile, TerrainType, City, Unit, MapType, Grid } from "./state";
import { idx, coordsOf, neighbors, dist, disk, gridWidth, gridHeight, tileCount } from "./state";
import { sphereTopology } from "./topology";
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
  /** World shape. Defaults to "square". */
  mapType?: MapType;
}

/** Tiles of a circle map inside the disc inscribed in the size×size square. */
export function insideCircle(size: number, x: number, y: number): boolean {
  const c = (size - 1) / 2;
  const r2 = (size / 2 - 0.5) ** 2 + 0.5;
  return (x - c) ** 2 + (y - c) ** 2 <= r2;
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
function placeCapitals(
  rand: () => number,
  grid: Grid,
  count: number,
  valid?: (x: number, y: number) => boolean,
  margin = 2,
): Array<[number, number]> {
  const candidates: Array<[number, number]> = [];
  for (let y = margin; y < gridHeight(grid) - margin; y++)
    for (let x = margin; x < gridWidth(grid) - margin; x++) {
      if (valid && !valid(x, y)) continue;
      candidates.push([x, y]);
    }

  const picks: Array<[number, number]> = [];
  picks.push(candidates[Math.floor(rand() * candidates.length)]);
  while (picks.length < count) {
    let best: [number, number] | null = null;
    let bestScore = -1;
    for (const c of candidates) {
      const d = Math.min(...picks.map((p) => dist(grid, p[0], p[1], c[0], c[1])));
      if (d > bestScore) {
        bestScore = d;
        best = c;
      }
    }
    picks.push(best!);
  }
  return picks;
}

/**
 * Smooth value noise in [0,1] for globe maps: a random 3D lattice over the
 * cube [-1,1]³, sampled at each tile's centre on the unit sphere. Seamless by
 * construction — no face of the cube-sphere sees an edge in the noise.
 */
function sphereNoise(rand: () => number, n: number, gridN: number): number[] {
  const lattice: number[] = [];
  for (let i = 0; i < gridN * gridN * gridN; i++) lattice.push(rand());
  const clampG = (g: number) => Math.max(0, Math.min(g, gridN - 1));
  const at = (gx: number, gy: number, gz: number) =>
    lattice[(clampG(gz) * gridN + clampG(gy)) * gridN + clampG(gx)];
  const smooth = (t: number) => t * t * (3 - 2 * t);

  const topo = sphereTopology(n);
  const out: number[] = new Array(topo.count);
  for (let i = 0; i < topo.count; i++) {
    const [px, py, pz] = topo.centers[i];
    const fx = ((px + 1) / 2) * (gridN - 1);
    const fy = ((py + 1) / 2) * (gridN - 1);
    const fz = ((pz + 1) / 2) * (gridN - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const tz = smooth(fz - z0);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const v00 = lerp(at(x0, y0, z0), at(x0 + 1, y0, z0), tx);
    const v10 = lerp(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), tx);
    const v01 = lerp(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), tx);
    const v11 = lerp(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), tx);
    out[i] = lerp(lerp(v00, v10, ty), lerp(v01, v11, ty), tz);
  }
  return out;
}

export function newGame(opts: NewGameOptions): GameState {
  const { seed, size, tribes, winMode } = opts;
  const mapType = opts.mapType ?? "square";
  if (tribes.length < 2 || tribes.length > 4) throw new Error("2-4 tribes");
  const rand = mulberry32(seed);
  const grid: Grid = { size, mapType };
  const W = gridWidth(grid);
  const H = gridHeight(grid);

  // On a circle map, capitals stay a full tile inside the rim so every
  // neighbour of a capital is playable. On a globe they stay off the 24
  // cube-corner tiles, whose seven neighbours would be an unfair start.
  const capitalOk =
    mapType === "circle"
      ? (x: number, y: number) =>
          insideCircle(size, x, y) &&
          [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => insideCircle(size, x + dx, y + dy)))
      : mapType === "globe"
        ? (x: number, y: number) => !sphereTopology(size).cornerTiles.has(idx(grid, x, y))
        : undefined;
  const capitalMargin = mapType === "continents" ? 3 : mapType === "globe" ? 0 : 2;
  const capitals = placeCapitals(rand, grid, tribes.length, capitalOk, capitalMargin);

  // Terrain from two noise fields: elevation decides water/land/mountain,
  // moisture decides forest. Tribe biases tilt generation near each capital.
  const elevation =
    mapType === "globe" ? sphereNoise(rand, size, Math.max(3, Math.round(size * 0.8))) : valueNoise(rand, size, 4);
  const moisture =
    mapType === "globe" ? sphereNoise(rand, size, Math.max(3, Math.round(size * 0.6))) : valueNoise(rand, size, 3);

  const tiles: Tile[] = [];
  // Blob-plus-noise elevation kept around so later passes can raise the
  // shallowest sea when a starting continent comes out too small.
  const continentElevation: number[] = new Array(W * H).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mapType === "circle" && !insideCircle(size, x, y)) {
        tiles.push({ x, y, terrain: "void", resource: null, building: null, cityId: null, village: false, cityHere: null, ruin: false });
        continue;
      }
      let e = elevation[y * W + x];
      let m = moisture[y * W + x];

      // Bias terrain near capitals by tribe preference
      for (let i = 0; i < capitals.length; i++) {
        const [cx, cy] = capitals[i];
        const d = dist(grid, cx, cy, x, y);
        if (d <= 3) {
          const tribe = tribeById(tribes[i]);
          const w = (3 - d) / 3;
          m = m * (1 + (tribe.forestBias - 1) * w * 0.5);
          e = e * (1 + (tribe.mountainBias - 1) * w * 0.25);
          if (tribe.waterBias > 1) e -= 0.08 * w;
        }
      }

      let terrain: TerrainType;
      if (mapType === "continents") {
        // Each capital anchors a landmass blob; away from every blob the sea
        // takes over, so tribes start separated by ocean.
        const blob = Math.max(
          ...capitals.map(([cx, cy]) => Math.max(0, 1 - Math.hypot(x - cx, y - cy) / (size * 0.3))),
        );
        const e2 = 0.5 * e + 0.5 * blob;
        continentElevation[y * W + x] = e2;
        if (e2 <= 0.45) terrain = "ocean";
        else if (e > 0.78) terrain = "mountain";
        else terrain = m > 0.62 ? "forest" : "field";
      } else if (e < 0.32) terrain = e < 0.22 ? "ocean" : "water";
      else if (e > 0.78) terrain = "mountain";
      else terrain = m > 0.62 ? "forest" : "field";

      tiles.push({ x, y, terrain, resource: null, building: null, cityId: null, village: false, cityHere: null, ruin: false });
    }
  }

  const state: GameState = {
    seed,
    rngState: seed ^ 0x9e3779b9,
    size,
    mapType,
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

  // Guarantee land reachability between capitals: carve field corridors.
  // On a circle map, route via the centre tile — each x-then-y leg only ever
  // moves a coordinate toward the centre, so the whole path stays in the disc.
  // On a globe, x-then-y walks mean nothing across cube faces, so corridors
  // follow BFS shortest paths over the sphere instead. Continents maps
  // deliberately skip this: the ocean between landmasses is the point, and
  // crossing it takes sailing.
  if (mapType === "globe") {
    carveCorridorsGlobe(state, capitals);
  } else if (mapType === "continents") {
    ensureMinLandmass(state, capitals, continentElevation, new Set());
    coastalShelf(state);
    // Channel-carving can nibble a continent back below the minimum, so the
    // growth pass runs again afterwards, forbidden from filling the channels in.
    const channels = ensureCoastalWater(state, capitals);
    ensureMinLandmass(state, capitals, continentElevation, channels);
    coastalShelf(state); // regrown coastline gets its shelf too
  } else if (mapType === "circle") {
    const c: [number, number] = [Math.floor(size / 2), Math.floor(size / 2)];
    for (const cap of capitals) carveCorridors(state, [cap, c]);
  } else {
    carveCorridors(state, capitals);
  }

  // Villages: ~1 per 20 tiles, on land, spaced away from capitals and each other
  const villageTarget = Math.floor((W * H) / 20);
  let villagesPlaced = 0;
  let attempts = 0;
  while (villagesPlaced < villageTarget && attempts < 4000) {
    attempts++;
    const x = nextInt(state, W);
    const y = nextInt(state, H);
    const t = tiles[idx(state, x, y)];
    if (t.terrain !== "field" && t.terrain !== "forest") continue;
    const nearCapital = capitals.some(([cx, cy]) => dist(state, cx, cy, x, y) < 3);
    const nearVillage = tiles.some((o) => o.village && dist(state, o.x, o.y, x, y) < 3);
    if (nearCapital || nearVillage) continue;
    t.terrain = "field";
    t.village = true;
    t.resource = null;
    villagesPlaced++;
  }

  // Ruins: rarer than villages and pushed out toward the unexplored middle
  // ground, so exploring away from home has a payoff of its own.
  const ruinTarget = Math.floor((W * H) / RUIN_TILES_PER);
  let ruinsPlaced = 0;
  attempts = 0;
  while (ruinsPlaced < ruinTarget && attempts < 4000) {
    attempts++;
    const x = nextInt(state, W);
    const y = nextInt(state, H);
    const t = tiles[idx(state, x, y)];
    if (t.terrain !== "field" && t.terrain !== "forest" && t.terrain !== "mountain") continue;
    if (t.village || t.ruin) continue;
    if (capitals.some(([cx, cy]) => dist(state, cx, cy, x, y) < 4)) continue;
    if (tiles.some((o) => o.ruin && dist(state, o.x, o.y, x, y) < 3)) continue;
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
    const nearSettlement = settlementTiles.some((s) => dist(state, s.x, s.y, t.x, t.y) <= 2);
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
      explored: new Array(tileCount(state)).fill(0),
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
  for (const [x, y] of disk(state, city.x, city.y, city.borderRadius)) {
    const t = state.tiles[idx(state, x, y)];
    if (t.terrain === "void") continue;
    if (t.cityId === null) t.cityId = city.id;
  }
}

const isLandTerrain = (t: TerrainType): boolean => t === "field" || t === "forest" || t === "mountain";

/** A starting continent below this many land tiles is unplayably cramped. */
const MIN_CONTINENT = 20;

/** Every land tile 8-connected to (sx, sy). */
function landmassOf(state: GameState, sx: number, sy: number): Set<number> {
  const seen = new Set<number>([idx(state, sx, sy)]);
  const queue: Array<[number, number]> = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [nx, ny] of neighbors(state, x, y)) {
      const key = idx(state, nx, ny);
      if (seen.has(key) || !isLandTerrain(state.tiles[key].terrain)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/**
 * Grow each capital's continent to a playable minimum by raising the
 * shallowest sea tile on its coast, deterministically, until it is big enough.
 */
function ensureMinLandmass(
  state: GameState,
  capitals: Array<[number, number]>,
  elevation: number[],
  keepWet: Set<number>,
): void {
  for (const [cx, cy] of capitals) {
    for (let guard = 0; guard < tileCount(state); guard++) {
      const mass = landmassOf(state, cx, cy);
      if (mass.size >= MIN_CONTINENT) break;
      let best = -1;
      let bestElev = Infinity;
      for (const key of mass) {
        const t = state.tiles[key];
        for (const [nx, ny] of neighbors(state, t.x, t.y)) {
          const nk = idx(state, nx, ny);
          const nt = state.tiles[nk];
          if (nt.terrain !== "water" && nt.terrain !== "ocean") continue;
          if (keepWet.has(nk)) continue;
          if (elevation[nk] < bestElev || (elevation[nk] === bestElev && nk < best)) {
            bestElev = elevation[nk];
            best = nk;
          }
        }
      }
      if (best < 0) break; // no raisable coast — nothing to do
      state.tiles[best].terrain = "field";
    }
  }
}

/** Deep ocean touching land becomes shallow water: a shelf for ports, fish and rafts. */
function coastalShelf(state: GameState): void {
  for (const t of state.tiles) {
    if (t.terrain !== "ocean") continue;
    if (neighbors(state, t.x, t.y).some(([nx, ny]) => isLandTerrain(state.tiles[idx(state, nx, ny)].terrain)))
      t.terrain = "water";
  }
}

/**
 * A capital with no shallow water beside it could never build a port and its
 * tribe would be stuck on its island forever. Carve a 1-wide sea channel from
 * the nearest sea tile to just beside the capital.
 */
function ensureCoastalWater(state: GameState, capitals: Array<[number, number]>): Set<number> {
  const capitalKeys = new Set(capitals.map(([x, y]) => idx(state, x, y)));
  // every water tile the guarantee depends on, so later passes leave them wet
  const keepWet = new Set<number>();
  for (const [cx, cy] of capitals) {
    const shore = neighbors(state, cx, cy).filter(
      ([nx, ny]) => state.tiles[idx(state, nx, ny)].terrain === "water",
    );
    if (shore.length > 0) {
      for (const [nx, ny] of shore) keepWet.add(idx(state, nx, ny));
      continue;
    }

    // nearest sea tile, deterministic tie-break by index
    let sea: Tile | null = null;
    let bestD = Infinity;
    for (const t of state.tiles) {
      if (t.terrain !== "water" && t.terrain !== "ocean") continue;
      const d = (t.x - cx) ** 2 + (t.y - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        sea = t;
      }
    }
    if (!sea) continue; // a world with no sea at all needs no ports

    keepWet.add(idx(state, sea.x, sea.y));
    let x = sea.x;
    let y = sea.y;
    while (dist(state, x, y, cx, cy) > 1) {
      if (x !== cx) x += Math.sign(cx - x);
      else y += Math.sign(cy - y);
      const key = idx(state, x, y);
      if (capitalKeys.has(key)) break; // never sink a capital
      const t = state.tiles[key];
      if (isLandTerrain(t.terrain)) t.terrain = "water";
      keepWet.add(key);
    }
  }
  return keepWet;
}

/**
 * Globe corridors: convert water along a BFS shortest path between each pair
 * of consecutive capitals, so all capitals connect by land on the sphere.
 */
function carveCorridorsGlobe(state: GameState, capitals: Array<[number, number]>): void {
  for (let i = 1; i < capitals.length; i++) {
    const [ax, ay] = capitals[i - 1];
    const [bx, by] = capitals[i];
    const start = idx(state, ax, ay);
    const goal = idx(state, bx, by);
    const parent = new Map<number, number>();
    parent.set(start, start);
    const queue = [start];
    for (let head = 0; head < queue.length && !parent.has(goal); head++) {
      const cur = queue[head];
      const [cx, cy] = coordsOf(state, cur);
      for (const [nx, ny] of neighbors(state, cx, cy)) {
        const key = idx(state, nx, ny);
        if (parent.has(key)) continue;
        parent.set(key, cur);
        queue.push(key);
      }
    }
    for (let cur = goal; cur !== start; cur = parent.get(cur)!) {
      const t = state.tiles[cur];
      if (t.terrain === "water" || t.terrain === "ocean") t.terrain = "field";
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
      if (t.terrain === "void") continue;
      if (t.terrain === "water" || t.terrain === "ocean") t.terrain = "field";
    }
  }
}
