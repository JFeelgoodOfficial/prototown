/**
 * Cube-sphere topology for globe maps.
 *
 * The world is the surface of a cube with six n×n faces, inflated onto a
 * sphere for rendering. Tiles stay quads and keep plain (x, y) coordinates:
 * the six faces sit side by side in one row-major grid of width 6n and height
 * n, so `x` is `face * n + u` and `y` is `v`. What changes on a globe is only
 * adjacency and distance — there are no map edges anywhere.
 *
 * Adjacency is derived from geometry rather than a hand-written edge table:
 * each tile knows its four corner points on the cube surface (in an integer
 * lattice, so keys are exact), and two tiles are neighbours iff they share a
 * corner. That reproduces Moore adjacency inside a face, folds it correctly
 * across all twelve cube edges, and at the eight cube corners — where three
 * faces meet and the diagonal across the corner does not exist — yields the
 * expected 24 tiles with seven neighbours instead of eight.
 */

type Vec3 = readonly [number, number, number];

interface Face {
  normal: Vec3;
  uAxis: Vec3;
  vAxis: Vec3;
}

const FACES: Face[] = [
  { normal: [1, 0, 0], uAxis: [0, 1, 0], vAxis: [0, 0, 1] },
  { normal: [-1, 0, 0], uAxis: [0, 1, 0], vAxis: [0, 0, 1] },
  { normal: [0, 1, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1] },
  { normal: [0, -1, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1] },
  { normal: [0, 0, 1], uAxis: [1, 0, 0], vAxis: [0, 1, 0] },
  { normal: [0, 0, -1], uAxis: [1, 0, 0], vAxis: [0, 1, 0] },
];

export interface SphereTopology {
  /** face resolution — the map's `size` */
  n: number;
  /** tiles per row in the flat array: 6n */
  width: number;
  /** rows: n */
  height: number;
  /** total tiles: 6n² */
  count: number;
  /** sorted neighbour tile indices, per tile */
  neighborTable: number[][];
  /** the 24 tiles (3 per cube corner) that have 7 neighbours */
  cornerTiles: Set<number>;
  /** tile centre on the unit sphere, per tile — noise sampling and rendering */
  centers: Vec3[];
  /** four tile corners on the unit sphere, per tile, in (u,v),(u+1,v),(u+1,v+1),(u,v+1) order */
  cornersOf(tile: number): [Vec3, Vec3, Vec3, Vec3];
  /** graph distance (8-way steps) between two tiles */
  dist(a: number, b: number): number;
  /** BFS distance from `source` to every tile */
  distField(source: number): Uint16Array;
}

/** Integer corner point of the cube lattice, scaled by n so keys are exact. */
function cornerPoint(face: Face, n: number, i: number, j: number): Vec3 {
  const { normal, uAxis, vAxis } = face;
  const a = 2 * i - n;
  const b = 2 * j - n;
  return [
    normal[0] * n + uAxis[0] * a + vAxis[0] * b,
    normal[1] * n + uAxis[1] * a + vAxis[1] * b,
    normal[2] * n + uAxis[2] * a + vAxis[2] * b,
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

const cache = new Map<number, SphereTopology>();

export function sphereTopology(n: number): SphereTopology {
  const cached = cache.get(n);
  if (cached) return cached;

  const width = 6 * n;
  const count = 6 * n * n;
  const tileIdx = (face: number, u: number, v: number) => v * width + face * n + u;

  // corner-point key -> tiles touching it
  const byCorner = new Map<string, number[]>();
  const centers: Vec3[] = new Array(count);
  const cornerKeys: string[][] = new Array(count);
  const pointFor = new Map<string, Vec3>();

  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < n; v++) {
      for (let u = 0; u < n; u++) {
        const tile = tileIdx(face, u, v);
        const corners: Array<[number, number]> = [
          [u, v],
          [u + 1, v],
          [u + 1, v + 1],
          [u, v + 1],
        ];
        cornerKeys[tile] = [];
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (const [i, j] of corners) {
          const p = cornerPoint(FACES[face], n, i, j);
          const key = `${p[0]},${p[1]},${p[2]}`;
          cornerKeys[tile].push(key);
          pointFor.set(key, p);
          const list = byCorner.get(key);
          if (list) list.push(tile);
          else byCorner.set(key, [tile]);
          cx += p[0];
          cy += p[1];
          cz += p[2];
        }
        centers[tile] = normalize([cx / 4, cy / 4, cz / 4]);
      }
    }
  }

  const neighborTable: number[][] = new Array(count);
  const cornerTiles = new Set<number>();
  for (let tile = 0; tile < count; tile++) {
    const set = new Set<number>();
    for (const key of cornerKeys[tile]) {
      for (const other of byCorner.get(key)!) if (other !== tile) set.add(other);
    }
    neighborTable[tile] = [...set].sort((a, b) => a - b);
    if (neighborTable[tile].length === 7) cornerTiles.add(tile);
  }

  const fields = new Map<number, Uint16Array>();
  const distField = (source: number): Uint16Array => {
    const hit = fields.get(source);
    if (hit) return hit;
    const d = new Uint16Array(count).fill(0xffff);
    d[source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      for (const next of neighborTable[cur]) {
        if (d[next] !== 0xffff) continue;
        d[next] = d[cur] + 1;
        queue.push(next);
      }
    }
    fields.set(source, d);
    return d;
  };

  const topo: SphereTopology = {
    n,
    width,
    height: n,
    count,
    neighborTable,
    cornerTiles,
    centers,
    cornersOf(tile: number) {
      const [a, b, c, d] = cornerKeys[tile].map((k) => normalize(pointFor.get(k)!));
      return [a, b, c, d];
    },
    dist(a: number, b: number) {
      return distField(a)[b];
    },
    distField,
  };
  cache.set(n, topo);
  return topo;
}
