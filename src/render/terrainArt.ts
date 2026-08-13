/**
 * The land and everything standing on it.
 *
 * Tiles are drawn as a carved slab: each top sits at its own height with a
 * shaded rock crust beneath, so shorelines and mountain shoulders show real
 * cliff faces. Props (trees, ore, herds, huts, docks, cities) are built from
 * the same shading primitives as the figures in unitArt.ts and lit by the same
 * upper-left key, then cast a contact shadow onto the ground.
 *
 * All of it is far too expensive to redraw per frame — see spriteCache.ts;
 * every function here paints one thing at the origin so it can be baked once
 * and blitted.
 */
import type { TerrainType, ResourceType, BuildingType } from "../engine/state";
import { TILE_W, TILE_H } from "./iso";
import {
  type Ctx,
  type Pt,
  MAT,
  G,
  RG,
  mix,
  lt,
  dk,
  alpha,
  limb,
  plate,
  orb,
  ao,
  spec,
  stroke,
  cloth,
  wood,
  kitFor,
  type TribeKit,
} from "./unitArt";

/** Deterministic per-tile noise, so a tile looks the same every frame. */
export function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface TerrainMat {
  base: string;
  hi: string;
  lo: string;
  wall: string;
  wallLo: string;
  /** height of the tile top above the ocean surface */
  lift: number;
  /** extra height varying per tile, so ground rolls instead of lying flat */
  jitter: number;
}

const TERRAIN_MAT: Record<TerrainType, TerrainMat> = {
  field: { base: "#7ca34e", hi: "#a8c973", lo: "#4d6f31", wall: "#7a5c3c", wallLo: "#3a2a1a", lift: 7, jitter: 3 },
  forest: { base: "#688c44", hi: "#8dae62", lo: "#385428", wall: "#6d5636", wallLo: "#332617", lift: 8, jitter: 3 },
  mountain: { base: "#9d9a92", hi: "#c6c2b8", lo: "#5f5b53", wall: "#736c62", wallLo: "#38342e", lift: 11, jitter: 6 },
  water: { base: "#3f9ac4", hi: "#8fd6ef", lo: "#1e6690", wall: "#1a4c6d", wallLo: "#0e2f45", lift: 2, jitter: 0 },
  ocean: { base: "#22688f", hi: "#5aa8c8", lo: "#0e3d5c", wall: "#0d3350", wallLo: "#071f31", lift: 0, jitter: 0 },
  crater: { base: "#4a423c", hi: "#6b6058", lo: "#241f1b", wall: "#3a322c", wallLo: "#1a1512", lift: 5, jitter: 2 },
  // Off-map padding; never drawn, present so lookups stay total.
  void: { base: "#0b1220", hi: "#0b1220", lo: "#0b1220", wall: "#0b1220", wallLo: "#0b1220", lift: 0, jitter: 0 },
};

/** How far the rock crust hangs below a tile top — deeper than any step on the board. */
const CRUST = 18;

/** Only four distinct looks per terrain: the sprite cache holds one bake of each. */
export const VARIANTS = 4;

export function variantAt(x: number, y: number): number {
  return Math.floor(hash(x, y, 3) * VARIANTS) % VARIANTS;
}

/** Height of a tile top in pixels. Depends only on terrain and variant, so it is cacheable. */
export function liftFor(terrain: TerrainType, variant: number): number {
  const m = TERRAIN_MAT[terrain];
  return m.lift + (m.jitter === 0 ? 0 : Math.round((variant / (VARIANTS - 1)) * m.jitter));
}

export const isWaterTerrain = (t: TerrainType): boolean => t === "water" || t === "ocean";

/* ── geometry ── */

export function diamondPath(ctx: Ctx, wx: number, wy: number): void {
  ctx.beginPath();
  ctx.moveTo(wx, wy - TILE_H / 2);
  ctx.lineTo(wx + TILE_W / 2, wy);
  ctx.lineTo(wx, wy + TILE_H / 2);
  ctx.lineTo(wx - TILE_W / 2, wy);
  ctx.closePath();
}

/** The tile's four edges as [neighbour dx, dy, from, to]. */
function tileEdges(): Array<[number, number, Pt, Pt]> {
  return [
    [0, -1, [-TILE_W / 2, 0], [0, -TILE_H / 2]],
    [-1, 0, [0, -TILE_H / 2], [TILE_W / 2, 0]],
    [0, 1, [TILE_W / 2, 0], [0, TILE_H / 2]],
    [1, 0, [0, TILE_H / 2], [-TILE_W / 2, 0]],
  ];
}

/** Bit per edge (in tileEdges order) whose neighbour is water. */
export const EDGE_ORDER: Array<[number, number]> = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
];

/** Soft contact shadow cast down-right, away from the key light. */
function castShadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.3): void {
  ctx.save();
  ctx.fillStyle = RG(ctx, x, y, Math.max(rx, ry), [
    [0, `rgba(14,18,12,${a})`],
    [0.55, `rgba(14,18,12,${a * 0.55})`],
    [1, "rgba(14,18,12,0)"],
  ]);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ── the tile itself ── */

/** Rock crust under a tile top: two faces, banded strata, a lip of topsoil. */
function crust(ctx: Ctx, terrain: TerrainType, variant: number, lift: number): void {
  const m = TERRAIN_MAT[terrain];
  const depth = lift + CRUST;
  const faces: Array<{ p: Pt; q: Pt; shade: number }> = [
    { p: [-TILE_W / 2, 0], q: [0, TILE_H / 2], shade: 0 },
    { p: [TILE_W / 2, 0], q: [0, TILE_H / 2], shade: 1 },
  ];
  for (const f of faces) {
    ctx.beginPath();
    ctx.moveTo(f.p[0], f.p[1]);
    ctx.lineTo(f.q[0], f.q[1]);
    ctx.lineTo(f.q[0], f.q[1] + depth);
    ctx.lineTo(f.p[0], f.p[1] + depth);
    ctx.closePath();
    const wall = f.shade ? dk(m.wall, 0.26) : m.wall;
    const wallLo = f.shade ? dk(m.wallLo, 0.3) : m.wallLo;
    ctx.fillStyle = G(ctx, 0, 0, 0, TILE_H / 2 + depth, [
      [0, lt(wall, 0.1)],
      [0.28, wall],
      [1, wallLo],
    ]);
    ctx.fill();
    if (isWaterTerrain(terrain)) continue;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(f.p[0], f.p[1]);
    ctx.lineTo(f.q[0], f.q[1]);
    ctx.lineTo(f.q[0], f.q[1] + depth);
    ctx.lineTo(f.p[0], f.p[1] + depth);
    ctx.closePath();
    ctx.clip();
    for (let i = 0; i < 3; i++) {
      const off = 4 + i * 5 + hash(variant, i, 60 + f.shade) * 4;
      ctx.beginPath();
      ctx.moveTo(f.p[0], f.p[1] + off);
      ctx.lineTo(f.q[0], f.q[1] + off);
      ctx.strokeStyle = i % 2 ? "rgba(255,238,208,0.09)" : "rgba(18,12,8,0.22)";
      ctx.lineWidth = 1.4 + hash(variant, i, 70) * 1.6;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(f.p[0], f.p[1] + 1);
    ctx.lineTo(f.q[0], f.q[1] + 1);
    ctx.strokeStyle = f.shade ? "rgba(58,40,22,0.55)" : "rgba(96,68,38,0.5)";
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.restore();
  }
}

/** Light catches the back rim of a tile; the front edge darkens into contact. */
function tileRim(ctx: Ctx): void {
  ctx.save();
  diamondPath(ctx, 0, 0);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(-TILE_W / 2, 0);
  ctx.lineTo(0, -TILE_H / 2);
  ctx.lineTo(TILE_W / 2, 0);
  ctx.strokeStyle = "rgba(255,250,224,0.16)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(TILE_W / 2, 0);
  ctx.lineTo(0, TILE_H / 2);
  ctx.lineTo(-TILE_W / 2, 0);
  ctx.strokeStyle = "rgba(16,20,12,0.16)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

/** Sand along every edge that meets water, with a pebble scatter. */
function shoreSand(ctx: Ctx, variant: number, waterMask: number): void {
  if (waterMask === 0) return;
  ctx.save();
  diamondPath(ctx, 0, 0);
  ctx.clip();
  tileEdges().forEach(([, , p, q], ei) => {
    if ((waterMask & (1 << ei)) === 0) return;
    const t = 0.34;
    const ip: Pt = [p[0] * (1 - t), p[1] * (1 - t)];
    const iq: Pt = [q[0] * (1 - t), q[1] * (1 - t)];
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.quadraticCurveTo((q[0] + iq[0]) / 2 + 2, (q[1] + iq[1]) / 2, iq[0], iq[1]);
    ctx.quadraticCurveTo((iq[0] + ip[0]) / 2, (iq[1] + ip[1]) / 2 + (ei > 1 ? 3 : -3), ip[0], ip[1]);
    ctx.closePath();
    ctx.fillStyle = G(ctx, p[0], p[1], 0, 0, [
      [0, "rgba(233,214,166,0.92)"],
      [0.6, "rgba(211,190,143,0.6)"],
      [1, "rgba(190,176,130,0)"],
    ]);
    ctx.fill();
  });
  for (let i = 0; i < 7; i++) {
    const px = (hash(variant, i, 210) - 0.5) * TILE_W * 0.8;
    const py = (hash(variant, i, 220) - 0.5) * TILE_H * 0.8;
    ctx.beginPath();
    ctx.ellipse(px, py, 1 + hash(variant, i, 230) * 1.4, 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? "rgba(255,248,224,0.5)" : "rgba(92,74,48,0.35)";
    ctx.fill();
  }
  ctx.restore();
}

function grassTop(ctx: Ctx, terrain: TerrainType, variant: number): void {
  const m = TERRAIN_MAT[terrain];
  diamondPath(ctx, 0, 0);
  const tone = mix(m.base, hash(variant, 0, 1) > 0.5 ? m.hi : m.lo, 0.18 + hash(variant, 0, 2) * 0.14);
  ctx.fillStyle = G(ctx, -TILE_W / 2, -TILE_H / 2, TILE_W / 2, TILE_H / 2, [
    [0, lt(tone, 0.2)],
    [0.5, tone],
    [1, dk(tone, 0.26)],
  ]);
  ctx.fill();

  ctx.save();
  diamondPath(ctx, 0, 0);
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    const r = 9 + hash(variant, i, 10) * 14;
    const px = (hash(variant, i, 20) - 0.5) * TILE_W * 0.7;
    const py = (hash(variant, i, 30) - 0.5) * TILE_H * 0.7;
    ctx.fillStyle = RG(
      ctx,
      px,
      py,
      r,
      i % 2
        ? [[0, "rgba(255,246,214,0.14)"], [1, "rgba(255,246,214,0)"]]
        : [[0, "rgba(38,52,24,0.2)"], [1, "rgba(38,52,24,0)"]],
    );
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const blades = terrain === "forest" ? 22 : 18;
  for (let i = 0; i < blades; i++) {
    const px = (hash(variant, i, 100) - 0.5) * TILE_W * 0.86;
    const py = (hash(variant, i, 200) - 0.5) * TILE_H * 0.86;
    const h = 2.6 + hash(variant, i, 300) * 3.2;
    const sway = (hash(variant, i, 400) - 0.5) * 2.6;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + sway * 0.5, py - h * 0.7, px + sway, py - h);
    ctx.strokeStyle = i % 3 === 0 ? "rgba(196,224,140,0.55)" : "rgba(52,78,34,0.45)";
    ctx.lineWidth = 0.9;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const px = (hash(variant, i, 500) - 0.5) * TILE_W * 0.7;
    const py = (hash(variant, i, 510) - 0.5) * TILE_H * 0.7;
    const r = 1 + hash(variant, i, 520) * 1.5;
    ctx.beginPath();
    ctx.ellipse(px + 0.6, py + 0.6, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(24,28,18,0.28)";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? "rgba(186,182,168,0.75)" : "rgba(146,140,126,0.7)";
    ctx.fill();
  }
  if (terrain === "field" && hash(variant, 0, 530) > 0.5) {
    for (let i = 0; i < 4; i++) {
      const px = (hash(variant, i, 540) - 0.5) * TILE_W * 0.6;
      const py = (hash(variant, i, 550) - 0.5) * TILE_H * 0.6;
      ctx.beginPath();
      ctx.arc(px, py - 2.4, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = hash(variant, i, 560) > 0.5 ? "rgba(255,236,150,0.85)" : "rgba(246,214,232,0.8)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 2);
      ctx.strokeStyle = "rgba(72,102,44,0.7)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function rockTop(ctx: Ctx, variant: number): void {
  const m = TERRAIN_MAT.mountain;
  diamondPath(ctx, 0, 0);
  ctx.fillStyle = G(ctx, -TILE_W / 2, -TILE_H / 2, TILE_W / 2, TILE_H / 2, [
    [0, lt(m.base, 0.24)],
    [0.55, m.base],
    [1, dk(m.base, 0.3)],
  ]);
  ctx.fill();
  ctx.save();
  diamondPath(ctx, 0, 0);
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    const px = (hash(variant, i, 50) - 0.5) * TILE_W * 0.72;
    const py = (hash(variant, i, 60) - 0.5) * TILE_H * 0.72;
    const r = 4 + hash(variant, i, 70) * 8;
    ctx.beginPath();
    ctx.moveTo(px - r, py);
    ctx.lineTo(px - r * 0.3, py - r * 0.42);
    ctx.lineTo(px + r * 0.7, py - r * 0.28);
    ctx.lineTo(px + r, py + r * 0.2);
    ctx.lineTo(px - r * 0.2, py + r * 0.44);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? "rgba(244,244,238,0.14)" : "rgba(44,42,38,0.16)";
    ctx.fill();
    ctx.strokeStyle = "rgba(38,36,32,0.18)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const px = (hash(variant, i, 80) - 0.5) * TILE_W * 0.6;
    const py = (hash(variant, i, 90) - 0.5) * TILE_H * 0.6;
    ctx.beginPath();
    ctx.moveTo(px - 6, py);
    ctx.quadraticCurveTo(px, py - 2, px + 7, py + 1);
    ctx.strokeStyle = "rgba(236,244,252,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function waterTop(ctx: Ctx, terrain: TerrainType, variant: number, waterMask: number): void {
  const m = TERRAIN_MAT[terrain];
  diamondPath(ctx, 0, 0);
  ctx.fillStyle = G(ctx, 0, -TILE_H / 2, 0, TILE_H / 2, [
    [0, lt(m.base, 0.2)],
    [0.5, m.base],
    [1, dk(m.base, 0.28)],
  ]);
  ctx.fill();

  ctx.save();
  diamondPath(ctx, 0, 0);
  ctx.clip();
  ctx.fillStyle = G(ctx, 0, -TILE_H / 2, 0, TILE_H / 2, [
    [0, "rgba(6,32,52,0.3)"],
    [0.6, "rgba(6,32,52,0)"],
  ]);
  ctx.fillRect(-TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H);
  /* shallows brighten where the tile touches land */
  tileEdges().forEach(([, , p, q], ei) => {
    if (waterMask & (1 << ei)) return;
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    ctx.fillStyle = RG(ctx, mx, my, 26, [
      [0, "rgba(150,226,235,0.34)"],
      [1, "rgba(150,226,235,0)"],
    ]);
    ctx.beginPath();
    ctx.ellipse(mx, my, 26, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  for (let i = 0; i < 5; i++) {
    const off = -TILE_H / 2 + (TILE_H / 5) * (i + hash(variant, i, 80) * 0.6);
    const w = TILE_W * (0.22 + hash(variant, i, 90) * 0.3);
    const cx = (hash(variant, i, 95) - 0.5) * TILE_W * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, off);
    ctx.quadraticCurveTo(cx, off - 1.6, cx + w / 2, off);
    ctx.strokeStyle = i % 2 ? "rgba(215,245,255,0.32)" : "rgba(8,44,68,0.26)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  ctx.fillStyle = RG(ctx, -14, -8, 26, [
    [0, "rgba(255,255,255,0.3)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  ctx.beginPath();
  ctx.ellipse(-14, -8, 26, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const px = (hash(variant, i, 600) - 0.5) * TILE_W * 0.8;
    const py = (hash(variant, i, 610) - 0.5) * TILE_H * 0.8;
    const w = 2 + hash(variant, i, 620) * 4;
    ctx.beginPath();
    ctx.moveTo(px - w, py);
    ctx.lineTo(px + w, py - 0.8);
    ctx.strokeStyle = `rgba(255,255,255,${0.16 + hash(variant, i, 630) * 0.24})`;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  ctx.restore();

  /* foam against every shore */
  tileEdges().forEach(([dx, dy, p, q], ei) => {
    if (waterMask & (1 << ei)) return;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    ctx.quadraticCurveTo(mx + (dx - dy) * 1.5, my - 2, q[0], q[1]);
    ctx.strokeStyle = "rgba(236,250,255,0.62)";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(236,250,255,0.24)";
    ctx.lineWidth = 4.5;
    ctx.stroke();
  });
}

/** One complete tile — crust and top — with its centre at the origin. */
export function drawTile(ctx: Ctx, terrain: TerrainType, variant: number, waterMask: number): void {
  crust(ctx, terrain, variant, liftFor(terrain, variant));
  if (isWaterTerrain(terrain)) {
    waterTop(ctx, terrain, variant, waterMask);
    return;
  }
  if (terrain === "crater") {
    craterTop(ctx, variant);
    tileRim(ctx);
    return;
  }
  if (terrain === "mountain") rockTop(ctx, variant);
  else grassTop(ctx, terrain, variant);
  tileRim(ctx);
  shoreSand(ctx, variant, waterMask);
}

/** Blasted ground: a scorched bowl sunk into ash, cracked and still smouldering. */
function craterTop(ctx: Ctx, variant: number): void {
  const m = TERRAIN_MAT.crater;
  diamondPath(ctx, 0, 0);
  ctx.fillStyle = G(ctx, -TILE_W / 2, -TILE_H / 2, TILE_W / 2, TILE_H / 2, [
    [0, lt(m.base, 0.12)],
    [0.5, m.base],
    [1, dk(m.base, 0.3)],
  ]);
  ctx.fill();

  ctx.save();
  diamondPath(ctx, 0, 0);
  ctx.clip();
  // the bowl: darker toward the centre so the tile reads as sunken
  ctx.fillStyle = RG(ctx, 0, 0, TILE_W * 0.4, [
    [0, "rgba(10,8,6,0.72)"],
    [0.55, "rgba(20,16,12,0.4)"],
    [1, "rgba(20,16,12,0)"],
  ]);
  ctx.beginPath();
  ctx.ellipse(0, 0, TILE_W * 0.36, TILE_H * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  // thrown-up rim catching the light on the back edge
  ctx.beginPath();
  ctx.ellipse(0, -1.5, TILE_W * 0.3, TILE_H * 0.3, 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = alpha(m.hi, 0.55);
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 1.5, TILE_W * 0.3, TILE_H * 0.3, 0, 0, Math.PI);
  ctx.strokeStyle = "rgba(8,6,4,0.5)";
  ctx.lineWidth = 2.2;
  ctx.stroke();
  // cracks radiating out of the bowl
  for (let i = 0; i < 6; i++) {
    const a = hash(variant, i, 700) * Math.PI * 2;
    const r0 = TILE_W * (0.12 + hash(variant, i, 710) * 0.1);
    const r1 = TILE_W * (0.3 + hash(variant, i, 720) * 0.16);
    const bend = (hash(variant, i, 730) - 0.5) * 8;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.5);
    ctx.quadraticCurveTo(
      Math.cos(a) * (r0 + r1) * 0.5 + bend,
      Math.sin(a) * (r0 + r1) * 0.25 + bend * 0.4,
      Math.cos(a) * r1,
      Math.sin(a) * r1 * 0.5,
    );
    ctx.strokeStyle = i % 2 ? "rgba(6,5,4,0.55)" : "rgba(12,9,7,0.4)";
    ctx.lineWidth = 1 + hash(variant, i, 740) * 0.8;
    ctx.stroke();
  }
  // embers still glowing in the cracks
  for (let i = 0; i < 3; i++) {
    const px = (hash(variant, i, 750) - 0.5) * TILE_W * 0.4;
    const py = (hash(variant, i, 760) - 0.5) * TILE_H * 0.4;
    const r = 1 + hash(variant, i, 770) * 1.4;
    ctx.fillStyle = RG(ctx, px, py, r * 3, [
      [0, "rgba(255,120,40,0.5)"],
      [1, "rgba(255,120,40,0)"],
    ]);
    ctx.beginPath();
    ctx.ellipse(px, py, r * 3, r * 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? "#ff8a3a" : "#e05a24";
    ctx.fill();
  }
  ctx.restore();
}

/** Height every unexplored tile is drawn at, so fog never leaks the relief under it. */
export const FOG_LIFT = 7;

/** Every height a tile top can be drawn at, low to high — the hit test probes these. */
export const ALL_LIFTS: number[] = (() => {
  const set = new Set<number>([FOG_LIFT]);
  (Object.keys(TERRAIN_MAT) as TerrainType[]).forEach((t) => {
    for (let v = 0; v < VARIANTS; v++) set.add(liftFor(t, v));
  });
  return [...set].sort((a, b) => a - b);
})();

/** World-space bounds a baked tile sprite needs, anchored on the tile centre. */
export function tileBox(terrain: TerrainType, variant: number) {
  return {
    left: -TILE_W / 2 - 1,
    top: -TILE_H / 2 - 1,
    right: TILE_W / 2 + 1,
    bottom: TILE_H / 2 + liftFor(terrain, variant) + CRUST + 2,
  };
}

/** One generous box for every prop: mountains and capital banners are the tall ones. */
export const PROP_BOX = { left: -40, top: -48, right: 40, bottom: 22 };

export const FOG_BOX = {
  left: -TILE_W / 2 - 1,
  top: -TILE_H / 2 - 1,
  right: TILE_W / 2 + 1,
  bottom: TILE_H / 2 + FOG_LIFT + CRUST + 2,
};

/** Unexplored: night cloud over the tile, on a crust of its own so it sits in the slab. */
export function drawCloud(ctx: Ctx, wx: number, wy: number): void {
  const depth = FOG_LIFT + CRUST;
  ([[-TILE_W / 2, 0, 0.1], [TILE_W / 2, 0, 0.4]] as Array<[number, number, number]>).forEach(([px, py, shade]) => {
    ctx.beginPath();
    ctx.moveTo(wx + px, wy + py);
    ctx.lineTo(wx, wy + TILE_H / 2);
    ctx.lineTo(wx, wy + TILE_H / 2 + depth);
    ctx.lineTo(wx + px, wy + py + depth);
    ctx.closePath();
    ctx.fillStyle = G(ctx, 0, wy, 0, wy + TILE_H / 2 + depth, [
      [0, dk("#243149", shade)],
      [1, dk("#0e1524", shade)],
    ]);
    ctx.fill();
  });
  diamondPath(ctx, wx, wy);
  ctx.fillStyle = G(ctx, wx, wy - TILE_H / 2, wx, wy + TILE_H / 2, [
    [0, "#26324a"],
    [1, "#141c2b"],
  ]);
  ctx.fill();
  ctx.save();
  diamondPath(ctx, wx, wy);
  ctx.clip();
  const puffs: Array<[number, number, number, number]> = [
    [-10, 1, 14, 7],
    [7, -3, 11, 6],
    [0, 6, 12, 5],
  ];
  puffs.forEach(([dx, dy, rx, ry], i) => {
    ctx.fillStyle = RG(ctx, wx + dx, wy + dy, rx, [
      [0, i ? "rgba(96,116,152,0.5)" : "rgba(120,142,180,0.55)"],
      [1, "rgba(90,110,145,0)"],
    ]);
    ctx.beginPath();
    ctx.ellipse(wx + dx, wy + dy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/* ── props ── */

function drawMountain(ctx: Ctx, variant: number): void {
  const s = 1 + hash(variant, 0, 5) * 0.22;
  castShadow(ctx, 12 * s, 7, 24 * s, 9 * s, 0.34);
  ao(ctx, 0, 4, 22 * s, 0.3);
  const rock = "#8d8880";
  const rockLo = "#3c3934";
  plate(ctx, [[-20 * s, 8], [-6 * s, -22 * s], [6 * s, 8]], dk(rock, 0.22), { hi: lt(rock, 0.1), lo: rockLo, rimA: 0.3 });
  plate(ctx, [[-4 * s, 10], [9 * s, -30 * s], [10 * s, 10]], rock, { hi: lt(rock, 0.4), lo: rockLo, rimA: 0.35 });
  plate(ctx, [[9 * s, -30 * s], [22 * s, 10], [10 * s, 10]], dk(rock, 0.3), { hi: rock, lo: dk(rockLo, 0.2), rimA: 0.35 });
  for (let i = 0; i < 3; i++) {
    const t = 0.24 + i * 0.24;
    stroke(
      ctx,
      [
        [9 * s - 6.5 * s * t, -30 * s + 40 * s * t],
        [9 * s - 6.5 * s * (t + 0.16), -30 * s + 40 * s * (t + 0.2)],
      ],
      i % 2 ? "rgba(255,250,238,0.18)" : "rgba(28,26,22,0.3)",
      1,
    );
  }
  plate(
    ctx,
    [[3.4 * s, -19 * s], [9 * s, -30 * s], [14.6 * s, -19 * s], [10.5 * s, -21.4 * s], [7 * s, -18 * s]],
    "#e6ecf2",
    { hi: "#ffffff", lo: "#a9bccb", rimA: 0.18 },
  );
  spec(ctx, 7 * s, -25 * s, 3.6 * s, 6 * s, -0.5, 0.4);
  for (let i = 0; i < 7; i++) {
    const px = (hash(variant, i, 40) - 0.5) * 36 * s;
    const py = 6 + hash(variant, i, 45) * 6;
    const r = 1.6 + hash(variant, i, 47) * 2;
    ctx.beginPath();
    ctx.ellipse(px + 0.8, py + 0.8, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(22,26,18,0.3)";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? "rgba(200,196,188,0.6)" : "rgba(112,106,98,0.6)";
    ctx.fill();
  }
}

interface TreeDef {
  trunk: string;
  canopy: string;
  canopyHi: string;
  shape: "spire" | "wind" | "round" | "broad";
  ember?: boolean;
  bramble?: boolean;
}

/** One silhouette per tribe, so a player's woods read as theirs. */
const TREES: Record<string, TreeDef> = {
  ashfen: { trunk: "#4a3226", canopy: "#5f7343", canopyHi: "#93a763", shape: "spire", ember: true },
  korvani: { trunk: "#5b4b3a", canopy: "#4f7d6d", canopyHi: "#84b2a0", shape: "wind" },
  meridia: { trunk: "#8a7554", canopy: "#8ea350", canopyHi: "#c6cf7c", shape: "round" },
  thornwood: { trunk: "#4d3b28", canopy: "#3f6f37", canopyHi: "#7aa85a", shape: "broad", bramble: true },
};

function tree(ctx: Ctx, T: TreeDef, s: number): void {
  ctx.beginPath();
  ctx.ellipse(0.4 * s, 0.4 * s, 3.4 * s, 1.5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = dk(T.trunk, 0.3);
  ctx.fill();
  limb(ctx, [0.6 * s, 0], [-0.4 * s, -9 * s], 2.1 * s, 1.4 * s, T.trunk, { hi: lt(T.trunk, 0.32), lo: dk(T.trunk, 0.5) });
  for (let i = 0; i < 2; i++) {
    stroke(
      ctx,
      [[(-0.2 + i * 1.1) * s, -1 * s], [(-0.8 + i * 1.1) * s, -8 * s]],
      i ? "rgba(255,236,208,0.14)" : "rgba(18,12,8,0.3)",
      0.8 * s,
    );
  }
  if (T.shape === "spire") {
    for (let i = 0; i < 3; i++) {
      const yy = -7 * s - i * 5.4 * s;
      const w = (8.4 - i * 2.2) * s;
      plate(
        ctx,
        [[-w, yy], [-w * 0.45, yy - 2 * s], [0, yy - 8 * s], [w * 0.45, yy - 2 * s], [w, yy]],
        i === 0 ? dk(T.canopy, 0.14) : T.canopy,
        { hi: T.canopyHi, lo: dk(T.canopy, 0.55), rimA: 0.28 },
      );
      stroke(ctx, [[-w * 0.8, yy - 0.6 * s], [-w * 0.3, yy - 3.4 * s]], "rgba(190,214,140,0.3)", 0.9 * s);
    }
  } else if (T.shape === "wind") {
    plate(
      ctx,
      [[-8 * s, -8 * s], [-2 * s, -19 * s], [7 * s, -17 * s], [10 * s, -9 * s], [1 * s, -6 * s]],
      T.canopy,
      { hi: T.canopyHi, lo: dk(T.canopy, 0.5), rimA: 0.28 },
    );
    orb(ctx, 5 * s, -14 * s, 5 * s, 3.4 * s, lt(T.canopy, 0.12), { hi: T.canopyHi, rim: false });
    orb(ctx, -3.4 * s, -12.4 * s, 3.4 * s, 2.4 * s, dk(T.canopy, 0.2), { rim: false });
  } else if (T.shape === "round") {
    orb(ctx, 0, -13 * s, 8.4 * s, 7.4 * s, T.canopy, { hi: T.canopyHi, lo: dk(T.canopy, 0.5) });
    orb(ctx, -3 * s, -16 * s, 4.6 * s, 3.4 * s, lt(T.canopy, 0.2), { rim: false });
    orb(ctx, 4.4 * s, -10 * s, 3.6 * s, 2.8 * s, dk(T.canopy, 0.24), { rim: false });
  } else {
    orb(ctx, -2 * s, -12 * s, 7.6 * s, 6 * s, T.canopy, { hi: T.canopyHi, lo: dk(T.canopy, 0.55) });
    orb(ctx, 5 * s, -14.5 * s, 5.6 * s, 4.6 * s, dk(T.canopy, 0.12), { hi: T.canopyHi, lo: dk(T.canopy, 0.5) });
    orb(ctx, -4 * s, -15 * s, 4 * s, 3 * s, lt(T.canopy, 0.18), { rim: false });
    orb(ctx, 1.6 * s, -8.6 * s, 4.2 * s, 2.8 * s, dk(T.canopy, 0.3), { rim: false });
  }
  if (T.ember) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc((-4 + i * 4) * s, (-10 - i * 3.5) * s, 0.9 * s, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? "rgba(255,176,84,0.9)" : "rgba(255,110,60,0.8)";
      ctx.fill();
    }
  }
  if (T.bramble) {
    for (let i = 0; i < 4; i++) {
      const a = -0.4 - i * 0.5;
      stroke(ctx, [[0, -1 * s], [Math.cos(a) * 7 * s, -2 * s + Math.sin(a) * 5 * s]], "rgba(58,44,26,0.75)", 1 * s);
    }
  }
}

function drawTrees(ctx: Ctx, variant: number, tribeId: string): void {
  const T = TREES[tribeId] ?? TREES.thornwood;
  for (let i = 0; i < 5; i++) {
    const px = (hash(variant, i, 700) - 0.5) * TILE_W * 0.7;
    const py = (hash(variant, i, 710) - 0.5) * TILE_H * 0.7;
    ctx.beginPath();
    ctx.ellipse(px, py, 3.4, 1.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? "rgba(44,72,32,0.5)" : "rgba(74,104,46,0.42)";
    ctx.fill();
  }
  const spots: Array<[number, number]> = [[-13, 3], [3, -5], [11, 6], [-4, 8]];
  spots.forEach(([dx, dy], i) => {
    if (i === 3 && hash(variant, 0, 7) < 0.45) return;
    const s = 0.82 + hash(variant, i, 11) * 0.4;
    ctx.save();
    ctx.translate(dx + (hash(variant, i, 15) - 0.5) * 3, dy);
    castShadow(ctx, 7 * s, 2 * s, 10 * s, 4 * s, 0.32);
    ao(ctx, 0, 1, 8 * s, 0.36);
    tree(ctx, T, s);
    ctx.restore();
  });
}

function drawResource(ctx: Ctx, resource: ResourceType): void {
  ctx.save();
  ctx.translate(15, -2);

  if (resource === "fruit") {
    castShadow(ctx, 5, 4, 12, 5, 0.32);
    ao(ctx, 0, 2, 9, 0.3);
    limb(ctx, [0, 2], [-0.6, -5], 1.8, 1.3, "#5a4028", { hi: "#8d6a44", lo: "#2b1d11" });
    orb(ctx, -2.6, -8.6, 6.4, 4.8, "#456b31", { hi: "#7fa54f", lo: "#22381a" });
    orb(ctx, 3, -9.6, 5, 4, "#3d6029", { hi: "#79a04a", lo: "#1d3115" });
    orb(ctx, -1, -12.4, 3.6, 2.6, "#5b8340", { hi: "#9dc46a", rim: false });
    const fruit: Array<[number, number]> = [[-3.6, -7.4], [2.8, -6.6], [0.2, -10.6], [4.6, -10.4]];
    fruit.forEach(([dx, dy], i) => {
      orb(ctx, dx, dy, 2, 1.9, i % 2 ? "#d2452f" : "#e2643a", { hi: "#ff9f78", lo: "#69180f" });
      spec(ctx, dx - 0.7, dy - 0.8, 0.7, 0.6, 0, 0.5);
    });
    orb(ctx, 6.4, 2.6, 1.8, 1.4, "#c33f2b", { hi: "#ff8f6a", lo: "#5e150d" });
  } else if (resource === "crop") {
    ctx.translate(-6, 0);
    castShadow(ctx, 6, 4, 14, 5, 0.28);
    for (let r = 0; r < 2; r++) {
      for (let i = -1; i <= 1; i++) {
        const bx = i * 4.4 + r * 2.2;
        const by = 2 - r * 3.4;
        limb(ctx, [bx, by], [bx + 0.8, by - 9], 1.2, 0.7, "#c9a24a", { hi: "#f2dc9c", lo: "#6f5119" });
        for (let g = 0; g < 3; g++) {
          orb(ctx, bx + 0.8 + (g % 2 ? 0.9 : -0.9), by - 9 - g * 1.6, 1.1, 0.9, "#e6c463", {
            hi: "#fff2b6",
            lo: "#7d5c1c",
            rim: false,
          });
        }
        stroke(ctx, [[bx + 0.8, by - 10.4], [bx + 2.4, by - 13.4]], "rgba(248,228,166,0.75)", 0.9);
      }
    }
  } else if (resource === "metal") {
    castShadow(ctx, 5, 4, 12, 5, 0.34);
    ao(ctx, 0, 2, 9, 0.32);
    plate(ctx, [[-8, 3], [-5, -6], [1, -9], [6, -6], [8, 3]], "#6f6a62", {
      hi: "#b3ada2",
      lo: "#2d2a26",
      rimA: 0.42,
      spec: true,
      specA: 0.3,
    });
    plate(ctx, [[-2, 3], [0, -7], [4, -5.4], [4.4, 3]], "#5b564f", { hi: "#918a80", lo: "#221f1c", rimA: 0.3 });
    const vein: Pt[] = [[-6, 0], [-2.6, -2.6], [0.6, -1.4], [3.6, -4]];
    stroke(ctx, vein, "#d8b84f", 1.6);
    stroke(ctx, vein, "rgba(255,240,176,0.5)", 0.7);
    ([[-3.4, -4.6], [3, -6.4]] as Array<[number, number]>).forEach(([dx, dy], i) => {
      plate(
        ctx,
        [[dx - 1.8, dy + 2], [dx - 0.6, dy - 2.6], [dx + 1.4, dy - 1.6], [dx + 1.8, dy + 2]],
        i ? "#e0bb52" : "#d3ad46",
        { hi: "#fff2b0", lo: "#7a5c12", rimA: 0.35, spec: true },
      );
    });
    spec(ctx, -2.4, -5.4, 1.4, 2.2, -0.4, 0.55);
  } else if (resource === "animal") {
    ctx.translate(-4, 1);
    castShadow(ctx, 4, 3, 13, 4.6, 0.32);
    ([[-5.4, -0.6], [-3.4, -0.2], [3.4, -0.4], [5, 0]] as Array<[number, number]>).forEach(([dx, dy], i) =>
      limb(ctx, [dx, dy - 5.6], [dx + (i > 1 ? 0.6 : -0.4), dy + 1.6], 1.2, 0.8, i % 2 ? "#8c5c31" : "#9a663a", {
        hi: "#c08c56",
        lo: "#3e2512",
      }),
    );
    limb(ctx, [-5, -7.2], [5, -7.8], 3.6, 3, "#a9713f", { hi: "#dda86f", lo: "#4c2f18" });
    orb(ctx, -5.6, -6.6, 2.4, 2.2, "#b87d48", { hi: "#e2ad76", lo: "#4c2f18", rim: false });
    orb(ctx, -4.6, -8.2, 1.8, 1.1, "rgba(244,232,210,0.75)", { rim: false });
    ([[-1.4, -8.6], [1.6, -7.8]] as Array<[number, number]>).forEach(([dx, dy]) =>
      orb(ctx, dx, dy, 1, 0.7, "rgba(248,236,214,0.5)", { rim: false }),
    );
    limb(ctx, [4.4, -8], [7.4, -10.6], 2.4, 1.7, "#b07543", { hi: "#dca86e", lo: "#472a14" });
    orb(ctx, 8.4, -11.4, 2.7, 2.1, "#b87d48", { hi: "#e2ad76", lo: "#4c2f18" });
    orb(ctx, 9.8, -11.2, 1.1, 0.8, "#7a4c26", { rim: false });
    plate(ctx, [[7.2, -12.6], [6, -14.6], [8, -13.4]], "#9a663a", { hi: "#c99163", lo: "#3e2512", rimA: 0.3 });
    stroke(ctx, [[8, -13], [8.8, -16.4]], "#e8dcc2", 1.1);
    stroke(ctx, [[8.8, -16.4], [7.4, -18.2]], "#e8dcc2", 0.9);
    stroke(ctx, [[8.8, -16.4], [10.6, -17.6]], "#e8dcc2", 0.9);
    stroke(ctx, [[9.4, -12.6], [11.2, -15]], "#e8dcc2", 1);
    stroke(ctx, [[11.2, -15], [12.4, -16.6]], "#e8dcc2", 0.8);
    orb(ctx, -6.6, -7.8, 1.3, 1.9, "#f0e2c8", { rim: false });
  } else if (resource === "fish") {
    ctx.translate(-15, 3);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(i * 3 - 3, i * 1.6 - 1, 9 - i * 2.4, 4 - i, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(238,252,255,${0.55 - i * 0.14})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.save();
    ctx.rotate(-0.5);
    orb(ctx, 2, -6, 4.6, 2.3, "#8fc7dd", { hi: "#eaf9ff", lo: "#2f5f78" });
    plate(ctx, [[-2.2, -6], [-6, -8.6], [-5.6, -3.6]], "#7ab3cb", { hi: "#dff2fa", lo: "#2a5468", rimA: 0.3 });
    plate(ctx, [[1.6, -8], [3.4, -10.4], [4.4, -7.6]], "#7ab3cb", { hi: "#dff2fa", lo: "#2a5468", rimA: 0.3 });
    spec(ctx, 3, -6.8, 1.6, 0.9, -0.3, 0.6);
    ctx.beginPath();
    ctx.arc(5.2, -6.2, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = "#12303e";
    ctx.fill();
    ctx.restore();
    ([[-4, -11], [6, -12.6], [1, -14]] as Array<[number, number]>).forEach(([dx, dy], i) => {
      ctx.beginPath();
      ctx.ellipse(dx, dy, 1 + i * 0.2, 1.4 + i * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(226,246,255,0.7)";
      ctx.fill();
    });
  } else if (resource === "whale") {
    // a broad dark back breaking the surface, tail up, blowing a spout
    ctx.translate(-13, 2);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(i * 2 - 1, i * 1.5 - 1, 15 - i * 3.4, 6 - i * 1.3, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(226,246,255,${0.5 - i * 0.13})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // tail fluke, rising behind the back
    plate(ctx, [[-11, -7], [-15.4, -14.6], [-10.4, -12.6], [-6.4, -15.4], [-7.4, -8.4]], "#33566e", {
      hi: "#7fa6bd", lo: "#152c3c", rimA: 0.35,
    });
    orb(ctx, 1.6, -8.4, 9.4, 4.4, "#3d6076", { hi: "#9dc0d3", lo: "#12283a", rot: -0.12 });
    // pale grooved underside catching the light along the waterline
    plate(ctx, [[-6.6, -5.6], [8.4, -6.6], [9.4, -4.6], [-6.2, -3.6]], "#7f9fb0", {
      hi: "#d6e9f2", lo: "#3c5a6c", rimA: 0.25,
    });
    spec(ctx, -1, -10.6, 4.6, 1.5, -0.14, 0.5);
    ctx.beginPath();
    ctx.arc(8.2, -8.6, 0.7, 0, Math.PI * 2);
    ctx.fillStyle = "#0d2130";
    ctx.fill();
    // spout
    stroke(ctx, [[7.4, -12.2], [8.4, -17.4]], "rgba(233,249,255,0.75)", 1.4);
    ([[7.4, -18.8, 1.9], [5.2, -17.4, 1.3], [9.8, -17.6, 1.5]] as Array<[number, number, number]>).forEach(
      ([dx, dy, r]) => {
        ctx.beginPath();
        ctx.ellipse(dx, dy, r, r * 0.82, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(233,249,255,0.62)";
        ctx.fill();
      },
    );
  }
  ctx.restore();
}

/* ── buildings ── */

function roof(ctx: Ctx, cx: number, cy: number, halfW: number, h: number, color: string, rows = 4): void {
  plate(ctx, [[cx - halfW, cy], [cx, cy - h], [cx + 1.5, cy - h], [cx + 2, cy]], lt(color, 0.18), {
    hi: lt(color, 0.4),
    lo: dk(color, 0.3),
    rimA: 0.4,
  });
  plate(ctx, [[cx + 2, cy], [cx + 1.5, cy - h], [cx + halfW, cy]], dk(color, 0.34), {
    hi: color,
    lo: dk(color, 0.6),
    rimA: 0.4,
  });
  for (let i = 1; i <= rows; i++) {
    const t = i / (rows + 1);
    stroke(ctx, [[cx - halfW + halfW * t, cy - h * t], [cx + 1.5, cy - h * t]], "rgba(20,14,10,0.2)", 0.9);
    stroke(ctx, [[cx + 2, cy - h * t], [cx + halfW - (halfW - 2) * t, cy - h * t]], "rgba(20,14,10,0.24)", 0.9);
  }
  stroke(ctx, [[cx - 0.4, cy - h - 0.6], [cx + 2, cy - h - 0.6]], lt(color, 0.55), 1.6);
}

function wall(ctx: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  plate(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], col, {
    hi: lt(col, 0.26),
    lo: dk(col, 0.34),
    rimA: 0.4,
    horiz: true,
  });
}

/** A lit window — the cheapest way to make a building look inhabited. */
function litWindow(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  plate(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], "#2a1d12", { hi: "#4a3524", lo: "#120c07", rimA: 0.4 });
  ctx.fillStyle = RG(ctx, x + w / 2, y + h / 2, w * 1.6, [
    [0, "rgba(255,196,104,0.85)"],
    [0.5, "rgba(255,170,80,0.35)"],
    [1, "rgba(255,170,80,0)"],
  ]);
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w * 1.6, h * 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,214,140,0.9)";
  ctx.fillRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4);
  ctx.strokeStyle = "rgba(40,26,14,0.7)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.stroke();
}

function smoke(ctx: Ctx, x: number, y: number, n = 4): void {
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x + i * 1.6 + Math.sin(i) * 1.2, y - i * 4.2, 1.6 + i * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(216,214,206,${0.3 - i * 0.055})`;
    ctx.fill();
  }
}

/** Worn dirt apron under a worked site: people walk here every day. */
function trampledGround(ctx: Ctx, rx: number, ry: number): void {
  ctx.save();
  ctx.fillStyle = RG(ctx, 0, 2, rx, [
    [0, "rgba(120,94,58,0.5)"],
    [0.6, "rgba(120,94,58,0.26)"],
    [1, "rgba(120,94,58,0)"],
  ]);
  ctx.beginPath();
  ctx.ellipse(0, 2, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A small tribe token every worked site wears, so holdings read as owned. */
function tribeMark(ctx: Ctx, k: TribeKit, dx: number, dy: number): void {
  ctx.save();
  ctx.translate(dx, dy);
  if (k.id === "ashfen") {
    limb(ctx, [0, 0], [0, -5], 2.4, 3, "#4c4442", { hi: "#8a7d76", lo: "#1d1a19" });
    orb(ctx, 0, -6.4, 2.6, 1.6, "#ff8a3c", { hi: "#ffe1a8", lo: "#8f2f10", rim: false });
    orb(ctx, 0, -8.6, 1.4, 1.8, "rgba(255,190,110,0.45)", { rim: false });
  } else if (k.id === "korvani") {
    stroke(ctx, [[-4, -9], [4, -8]], MAT.woodLo, 1.2);
    for (let i = -1; i <= 1; i++) {
      stroke(ctx, [[i * 3, -8.4], [i * 3 + 0.6, -3]], "rgba(200,214,196,0.6)", 0.8);
      orb(ctx, i * 3 + 0.6, -2.4, 1.5, 1.5, "#3f7f96", { hi: "#9fd8e8", lo: "#123a4a" });
    }
  } else if (k.id === "meridia") {
    limb(ctx, [0, 0], [0, -10], 1, 0.9, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    orb(ctx, 0, -12, 3.2, 3.2, "#e0b84b", { hi: "#fff2bf", lo: "#8a6413" });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      stroke(
        ctx,
        [[Math.cos(a) * 3.6, -12 + Math.sin(a) * 3.6], [Math.cos(a) * 5.4, -12 + Math.sin(a) * 5.4]],
        "#f0cf70",
        0.9,
      );
    }
  } else {
    limb(ctx, [0, 0], [-0.6, -8], 1.6, 1.2, "#4d3b28", { hi: "#8a6b45", lo: "#241a10" });
    for (let i = 0; i < 3; i++) {
      const a = -0.5 - i * 0.6;
      stroke(ctx, [[-0.6, -6], [Math.cos(a) * 6, -6 + Math.sin(a) * 5]], "#3f6f37", 1.4);
    }
    orb(ctx, -2, -9, 2.6, 1.8, "#5d8b45", { hi: "#9dc477", lo: "#2a4520" });
  }
  ctx.restore();
}

function drawBuilding(ctx: Ctx, building: BuildingType, k: TribeKit): void {
  if (building === "port") {
    for (let i = -1; i <= 1; i++) {
      limb(ctx, [i * 9, 8], [i * 9, 0], 1.7, 1.5, MAT.woodLo, { hi: MAT.wood, lo: "#231708" });
      ctx.beginPath();
      ctx.ellipse(i * 9, 8, 4.4, 1.8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(228,248,255,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    castShadow(ctx, 6, 6, 20, 6, 0.3);
    wood(ctx, [[-15, -4], [15, -4], [15, 1], [-15, 1]], { rimA: 0.4 });
    wood(ctx, [[-15, -7], [15, -7], [15, -4], [-15, -4]], { hi: "#d3a469", rimA: 0.4 });
    for (let i = -4; i <= 4; i++) stroke(ctx, [[i * 3.4, -7], [i * 3.4, -4]], "rgba(48,32,16,0.3)", 0.8);
    plate(ctx, [[2, -8], [17, -8], [14, -3], [4, -3]], dk(MAT.wood, 0.2), {
      hi: MAT.woodHi,
      lo: MAT.woodLo,
      rimA: 0.4,
    });
    stroke(ctx, [[3, -6.4], [15.4, -6.4]], "rgba(255,236,200,0.3)", 1);
    limb(ctx, [9, -8], [9, -22], 1.1, 0.9, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    cloth(ctx, [[9, -21], [9, -10], [19, -12]], k.color, 2);
    stroke(ctx, [[9, -22], [17, -8.4]], "rgba(210,190,150,0.7)", 0.8);
    plate(ctx, [[-14, -8], [-8, -8], [-8, -4], [-14, -4]], MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo, rimA: 0.4 });
    stroke(ctx, [[-14, -6], [-8, -6]], "rgba(40,26,12,0.4)", 0.8);
    plate(ctx, [[-8.6, -11], [-3.6, -11], [-3.6, -7], [-8.6, -7]], dk(MAT.wood, 0.1), {
      hi: MAT.woodHi,
      lo: MAT.woodLo,
      rimA: 0.4,
    });
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.ellipse(-11, -3 - i * 0.9, 3 - i * 0.7, 1.2 - i * 0.3, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(201,176,136,0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    tribeMark(ctx, k, -13, -8);
    return;
  }

  if (building === "mine") {
    castShadow(ctx, 10, 6, 20, 6, 0.32);
    plate(ctx, [[-16, 4], [-11, -12], [6, -14], [12, 4]], "#7e7871", { hi: "#b6afa5", lo: "#2f2c28", rimA: 0.4 });
    for (let i = 0; i < 3; i++) {
      stroke(
        ctx,
        [[-15 + i, -1 - i * 3.4], [11 - i * 1.4, -3 - i * 3.2]],
        i % 2 ? "rgba(255,248,232,0.14)" : "rgba(30,26,22,0.26)",
        1.2,
      );
    }
    plate(ctx, [[-6, 4], [-5, -7], [3, -7], [4, 4]], "#151417", { hi: "#33313a", lo: "#08070a", rimA: 0.3 });
    ctx.fillStyle = RG(ctx, -1, -1, 7, [
      [0, "rgba(255,182,92,0.5)"],
      [1, "rgba(255,182,92,0)"],
    ]);
    ctx.beginPath();
    ctx.ellipse(-1, -1, 7, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    wood(ctx, [[-8, -7], [6, -7], [6, -4.4], [-8, -4.4]], { rimA: 0.45 });
    wood(ctx, [[-8, -6], [-5.6, -6], [-5.6, 4], [-8, 4]]);
    wood(ctx, [[4, -6], [6.4, -6], [6.4, 4], [4, 4]]);
    stroke(ctx, [[-1, 4], [14, 2.6]], "rgba(60,54,48,0.8)", 1.2);
    stroke(ctx, [[-1, 5.6], [14, 4.2]], "rgba(60,54,48,0.8)", 1.2);
    for (let i = 0; i < 4; i++) stroke(ctx, [[1 + i * 3.4, 3.6], [1 + i * 3.4, 5.6]], "rgba(74,54,32,0.8)", 1.4);
    plate(ctx, [[8, -1], [17, -1], [16, 4], [9, 4]], dk(k.metal, 0.05), {
      hi: "#9aa0aa",
      lo: "#24272d",
      rimA: 0.4,
      spec: true,
    });
    orb(ctx, 11, 4.4, 1.6, 1.6, "#2a2724", { hi: "#5c5651" });
    orb(ctx, 15, 4.4, 1.6, 1.6, "#2a2724", { hi: "#5c5651" });
    ([[11, -2], [14, -2.6], [12.6, -3.4]] as Array<[number, number]>).forEach(([dx, dy]) => {
      orb(ctx, dx, dy, 1.7, 1.4, "#dab84f", { hi: "#fff0ae", lo: "#6f5310" });
      spec(ctx, dx - 0.6, dy - 0.5, 0.6, 0.5, 0, 0.6);
    });
    orb(ctx, -13, 3, 5, 2.2, "#6b645a", { hi: "#9d968a", lo: "#2c2822", rim: false });
    limb(ctx, [-10, 4], [-7.4, -4], 0.8, 0.7, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    stroke(ctx, [[-9.4, -3.6], [-5.4, -5.4]], "#9aa0aa", 1.4);
    tribeMark(ctx, k, -14, 2);
    return;
  }

  if (building === "farm") {
    trampledGround(ctx, 22, 9);
    for (let i = 0; i < 4; i++) {
      const yy = -4 + i * 2.6;
      plate(
        ctx,
        [[-17 + i * 1.4, yy], [17 - i * 1.4, yy], [16 - i * 1.4, yy + 2.1], [-18 + i * 1.4, yy + 2.1]],
        i % 2 ? "#8a6435" : "#a2793f",
        { hi: "#c79a5a", lo: "#4a3319", rimA: 0.25 },
      );
      for (let j = -3; j <= 3; j++) {
        const px = j * (4.6 - i * 0.3) + i * 1.2;
        stroke(ctx, [[px, yy + 1.8], [px + 0.6, yy - 0.6]], "rgba(122,166,74,0.75)", 0.9);
        stroke(ctx, [[px, yy + 1.8], [px - 1.2, yy + 0.2]], "rgba(96,140,58,0.6)", 0.8);
      }
    }
    for (let i = -2; i <= 2; i++) limb(ctx, [i * 8, -6], [i * 8, -13], 1.1, 1, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    stroke(ctx, [[-16, -10.5], [16, -10.5]], MAT.woodLo, 1.6);
    stroke(ctx, [[-16, -11.6], [16, -11.6]], "rgba(200,160,110,0.7)", 1);
    ([[-6, -6], [4, -6]] as Array<[number, number]>).forEach(([dx, dy]) => {
      castShadow(ctx, dx + 5, dy + 1, 7, 3, 0.3);
      limb(ctx, [dx, dy], [dx + 1, dy - 9], 2.6, 3.6, "#d9b257", { hi: "#f8e4a6", lo: "#7c5b20" });
      stroke(ctx, [[dx + 1, dy - 9], [dx + 4, dy - 12]], "rgba(248,228,166,0.75)", 1.1);
      stroke(ctx, [[dx + 1, dy - 9], [dx - 2, dy - 12]], "rgba(248,228,166,0.6)", 1.1);
      stroke(ctx, [[dx - 2.4, dy - 4], [dx + 3.4, dy - 4.6]], "rgba(120,88,34,0.7)", 1);
    });
    tribeMark(ctx, k, -14, -6);
    return;
  }

  if (building === "spaceport") {
    /* spaceport: scorched concrete apron, service gantry, tribe-liveried rocket */
    trampledGround(ctx, 22, 9);
    castShadow(ctx, 8, 6, 20, 6, 0.32);
    plate(ctx, [[-16, 1], [14, 1], [17, 8], [-13, 8]], "#8d8a84", { hi: "#c0bcb4", lo: "#3a3834", rimA: 0.4 });
    stroke(ctx, [[-12, 4.4], [14, 4.4]], "rgba(30,28,26,0.35)", 1.1);
    orb(ctx, 5, 4.6, 4.6, 1.8, "#4a4642", { rim: false });
    // service gantry with cross-bracing and a crew arm to the hatch
    limb(ctx, [-8, 5], [-8, -16], 1.2, 1, dk(k.metal, 0.05), { hi: "#9aa0aa", lo: "#24272d" });
    limb(ctx, [-3, 5], [-3, -20], 1.4, 1.1, dk(k.metal, 0.05), { hi: "#9aa0aa", lo: "#24272d" });
    for (let i = 0; i < 4; i++) {
      const yy = -1 - i * 4.2;
      stroke(ctx, [[-8, yy], [-3, yy - 2.2]], "#6b7078", 1);
      stroke(ctx, [[-8, yy - 2.2], [-3, yy]], "#464b52", 1);
    }
    stroke(ctx, [[-3, -18], [2.4, -15.6]], "#9aa0aa", 1.2);
    // the rocket: white hull, tribe nose cone and fins, one porthole
    plate(ctx, [[2.2, 4], [3.6, -2], [3.6, 4]], dk(k.color, 0.15), { hi: "#ffffff", lo: dk(k.color, 0.5), rimA: 0.3 });
    plate(ctx, [[7.8, 4], [6.4, -2], [6.4, 4]], dk(k.color, 0.25), { hi: "#ffffff", lo: dk(k.color, 0.5), rimA: 0.3 });
    limb(ctx, [5, 4], [5, -14], 3.2, 2.8, "#d9dde2", { hi: "#f4f7fa", lo: "#5c6068" });
    plate(ctx, [[2.2, -13], [7.8, -13], [5, -21], [5, -21]], k.color, { hi: "#fff2bf", lo: dk(k.color, 0.45), rimA: 0.35 });
    stroke(ctx, [[2.4, -4], [7.6, -4]], k.color, 1.5);
    orb(ctx, 5, -9, 1.3, 1.3, "#20303f", { hi: "#7fb1d8" });
    spec(ctx, 4.6, -9.4, 0.5, 0.4, 0, 0.6);
    ctx.fillStyle = RG(ctx, 5, 3.4, 4.5, [
      [0, "rgba(255,196,110,0.45)"],
      [1, "rgba(255,196,110,0)"],
    ]);
    ctx.beginPath();
    ctx.ellipse(5, 3.4, 4.5, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // control hut off the apron
    wall(ctx, -18, -3, 8, 7, "#9c948a");
    roof(ctx, -14, -3, 5.5, 4, k.color);
    litWindow(ctx, -13.4, -0.6, 3, 2.4);
    tribeMark(ctx, k, -14, 6);
    return;
  }

  /* lumber hut: stacked-log walls, plank roof, cut stack, stump and axe */
  trampledGround(ctx, 20, 8);
  castShadow(ctx, 11, 5, 16, 5, 0.32);
  ao(ctx, 0, 4, 18, 0.3);
  wall(ctx, -10, -8, 20, 12, "#8a6b45");
  for (let i = 0; i < 4; i++) {
    const yy = -8 + i * 3;
    stroke(ctx, [[-10, yy + 3], [10, yy + 3]], "rgba(50,32,16,0.4)", 1);
    stroke(ctx, [[-10, yy + 0.7], [10, yy + 0.7]], "rgba(255,226,182,0.16)", 1);
    orb(ctx, -10.4, yy + 1.6, 1.5, 1.5, "#c9a877", { hi: "#f0d9b4", lo: "#6b4b28" });
  }
  roof(ctx, 0, -8, 13, 10, k.color);
  plate(ctx, [[-4, -3], [3, -3], [3, 4], [-4, 4]], "#3a2a1d", { hi: "#6a4d33", lo: "#170f0a", rimA: 0.3 });
  stroke(ctx, [[-0.6, -3], [-0.6, 4]], "rgba(20,12,6,0.5)", 0.8);
  litWindow(ctx, 4.6, -5.4, 4, 3.4);
  for (let i = 0; i < 3; i++) {
    orb(ctx, 14 + (i % 2) * 3, 2 - i * 3, 3.2, 2.4, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    orb(ctx, 14 + (i % 2) * 3, 2 - i * 3, 1.3, 1, "#c9a877", { rim: false });
  }
  orb(ctx, -15, 3.4, 3.4, 2, "#8a6b45", { hi: "#b98d5b", lo: "#4a3320" });
  orb(ctx, -15, 2.6, 3.2, 1.6, "#c9a877", { rim: false });
  limb(ctx, [-15, 2], [-12.6, -4.4], 0.8, 0.7, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
  plate(ctx, [[-12.8, -5.6], [-10.2, -6.6], [-10.6, -3.4], [-12.4, -3.6]], "#9aa0aa", {
    hi: "#eef2f8",
    lo: "#3f4753",
    rimA: 0.4,
    spec: true,
  });
  for (let i = 0; i < 4; i++) {
    const px = -19 + i * 2.4;
    const py = 5 + (i % 2) * 1.4;
    ctx.beginPath();
    ctx.ellipse(px, py, 1.4, 0.7, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(214,182,132,0.7)";
    ctx.fill();
  }
  tribeMark(ctx, k, -14, -8);
}

function drawVillage(ctx: Ctx): void {
  trampledGround(ctx, 20, 8);
  castShadow(ctx, 10, 5, 16, 5, 0.32);
  ao(ctx, 0, 4, 18, 0.32);
  wall(ctx, -11, -7, 22, 11, "#c2b195");
  for (let i = -1; i <= 1; i++) stroke(ctx, [[i * 6, -7], [i * 6, 4]], "rgba(86,64,40,0.5)", 1.4);
  stroke(ctx, [[-11, -1.6], [11, -1.6]], "rgba(86,64,40,0.4)", 1.2);
  roof(ctx, 0, -7, 14, 11, "#6d6152");
  plate(ctx, [[-3, -2], [3, -2], [3, 4], [-3, 4]], "#41352a", { hi: "#6d5b48", lo: "#1c1611", rimA: 0.3 });
  litWindow(ctx, 4.4, -5, 3.6, 3);
  /* a well out front — an unclaimed village flies no colours, only daily life */
  orb(ctx, -14, 2.4, 4, 2.2, "#9a9184", { hi: "#c8c0b2", lo: "#3e3a36" });
  orb(ctx, -14, 1.6, 3.2, 1.6, "#2b2620", { rim: false });
  limb(ctx, [-16.4, 1.4], [-16.4, -5], 0.7, 0.6, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
  limb(ctx, [-11.6, 1.4], [-11.6, -5], 0.7, 0.6, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
  stroke(ctx, [[-17, -5], [-11, -5]], MAT.woodLo, 1.4);
  stroke(ctx, [[-14, -5], [-14, -2.2]], "rgba(201,176,136,0.8)", 0.7);
  limb(ctx, [7, -12], [7, -17], 1.8, 1.6, "#8d8378", { hi: "#c2b8ab", lo: "#3d3831" });
  smoke(ctx, 7, -19, 4);
}

/** Broken pillars on cracked flagstone, with vines and something still glinting. */
function drawRuin(ctx: Ctx): void {
  castShadow(ctx, 6, 4, 18, 7, 0.3);
  plate(ctx, [[-16, 0], [0, -8], [16, 0], [0, 8]], "#8d8577", { hi: "#bab2a1", lo: "#3d3931", rimA: 0.3 });
  stroke(ctx, [[-9, -1], [-2, 1.6], [3, -1.4], [11, 1]], "rgba(30,26,20,0.4)", 1);
  stroke(ctx, [[-3, 5], [0, 0], [4, -4]], "rgba(30,26,20,0.3)", 0.9);
  ([[-9, 0, 12], [0, -3, 16], [9, 1, 8]] as Array<[number, number, number]>).forEach(([dx, dy, h], i) => {
    plate(ctx, [[dx - 3, dy], [dx + 3, dy], [dx + 3, dy - h], [dx - 3, dy - h]], "#b0a893", {
      hi: "#e2dac6",
      lo: "#4e4a3f",
      rimA: 0.4,
      horiz: true,
    });
    stroke(ctx, [[dx - 0.8, dy - 1], [dx - 0.8, dy - h + 1]], "rgba(60,54,44,0.3)", 0.8);
    plate(
      ctx,
      [[dx - 3.6, dy - h], [dx + 1.4, dy - h - 2.2], [dx + 3.6, dy - h + 0.6], [dx - 1, dy - h + 1.4]],
      "#c6bda6",
      { hi: "#f0e8d4", lo: "#5b5648", rimA: 0.35 },
    );
    if (i !== 2) {
      stroke(
        ctx,
        [[dx + 2.4, dy], [dx + 1, dy - h * 0.4], [dx + 2.6, dy - h * 0.75]],
        "rgba(74,110,50,0.8)",
        1.1,
      );
      orb(ctx, dx + 1.4, dy - h * 0.55, 1.8, 1.2, "#5d8b45", { hi: "#9dc477", rim: false });
    }
  });
  orb(ctx, 5, 5, 4.4, 2, "#a89f8b", { hi: "#d8d0bb", lo: "#4a463c" });
  ctx.fillStyle = RG(ctx, 2, -9, 6, [
    [0, "rgba(255,228,150,0.75)"],
    [1, "rgba(255,228,150,0)"],
  ]);
  ctx.beginPath();
  ctx.arc(2, -9, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,244,206,0.95)";
  ctx.beginPath();
  ctx.arc(2, -9, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

/* City silhouettes differ by tribe: kiln stacks, stilt decks, colonnades, bark lodges. */
function cityHouse(ctx: Ctx, dx: number, dy: number, k: TribeKit, big: boolean): void {
  const w = big ? 9 : 7.5;
  const h = big ? 11 : 9;
  ctx.save();
  ctx.translate(dx, dy);
  castShadow(ctx, w + 4, 4, w + 7, 4.4, 0.3);
  ao(ctx, 0, 3, w + 6, 0.3);
  if (k.id === "korvani") {
    for (let i = -1; i <= 1; i += 2) limb(ctx, [i * (w - 2), 5], [i * (w - 2), -2], 1.2, 1.2, MAT.woodLo);
  }
  wall(ctx, -w, -h, w * 2, h + 2, k.id === "thornwood" ? "#7d6a4c" : k.id === "meridia" ? "#e2d8c2" : "#cdbfa8");
  if (k.id === "meridia") {
    for (let i = -1; i <= 1; i++) {
      limb(ctx, [i * (w * 0.6), 2], [i * (w * 0.6), -h + 1], 1.3, 1.3, "#f0e7d2", { hi: "#ffffff", lo: "#a89b81" });
    }
  }
  if (k.id === "thornwood") {
    for (let i = 0; i < 3; i++) stroke(ctx, [[-w, -h + 3 + i * 3], [w, -h + 3 + i * 3]], "rgba(48,36,22,0.32)", 1);
  }
  roof(ctx, 0, -h, w + 3.5, big ? 12 : 10, k.color, big ? 5 : 4);
  if (k.id === "ashfen") {
    limb(ctx, [w - 3, -h], [w - 3, -h - 8], 1.8, 1.6, "#5b524d", { hi: "#8f847d", lo: "#221f1d" });
    ctx.beginPath();
    ctx.arc(w - 3, -h - 10, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,140,70,0.5)";
    ctx.fill();
    smoke(ctx, w - 3, -h - 12, 3);
  } else {
    smoke(ctx, -w + 2.4, -h - 6, 3);
  }
  if (k.id === "thornwood") orb(ctx, -w + 2, -h - 1, 3.4, 2, "#5d8b45", { hi: "#8fb96a", rim: false });
  plate(ctx, [[-2.6, -3], [2.6, -3], [2.6, 2], [-2.6, 2]], "#332a22", { hi: "#5e4f40", lo: "#140f0b", rimA: 0.3 });
  litWindow(ctx, w - 5.4, -h + 2.6, 3.4, 2.8);
  if (big) litWindow(ctx, -w + 2, -h + 2.6, 3.4, 2.8);
  ctx.restore();
}

export interface CityArt {
  level: number;
  walls: boolean;
  isCapital: boolean;
}

function drawCity(ctx: Ctx, city: CityArt, k: TribeKit): void {
  trampledGround(ctx, 26, 11);
  if (city.walls) {
    const pts: Pt[] = [[0, -TILE_H / 2], [TILE_W / 2, 0], [0, TILE_H / 2], [-TILE_W / 2, 0]];
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.strokeStyle = "rgba(28,24,20,0.5)";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = "#cfc7b6";
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,250,238,0.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      ([[-TILE_W / 2, 0, 0, -TILE_H / 2], [0, -TILE_H / 2, TILE_W / 2, 0]] as Array<[number, number, number, number]>).forEach(
        ([ax, ay, bx, by]) => {
          const px = ax + (bx - ax) * t;
          const py = ay + (by - ay) * t;
          plate(ctx, [[px - 1.6, py - 1.4], [px + 1.6, py - 1.4], [px + 1.6, py - 4], [px - 1.6, py - 4]], "#d8d0be", {
            hi: "#fffaf0",
            lo: "#6f6858",
            rimA: 0.35,
          });
        },
      );
    }
    pts.forEach(([px, py]) => orb(ctx, px, py - 3, 3.4, 2.8, "#d8d0be", { hi: "#fffaf0", lo: "#6f6858" }));
    plate(ctx, [[-20, 6], [-13, 9.4], [-13, 3.4], [-20, 0]], "#4a3a28", { hi: "#7d6244", lo: "#1d150d", rimA: 0.4 });
  }
  const houses = Math.min(4, 1 + Math.floor(city.level / 2));
  const order: Array<[number, number]> = [[0, -3], [-13, 4], [12, 4], [0, 9]];
  order.slice(0, houses).forEach(([dx, dy], i) => cityHouse(ctx, dx, dy, k, i === 0 && city.isCapital));
  if (city.level >= 2) {
    const sx = -6;
    const sy = 9;
    limb(ctx, [sx - 5, sy], [sx - 5, sy - 6], 0.8, 0.7, "#8a6640");
    limb(ctx, [sx + 5, sy], [sx + 5, sy - 6], 0.8, 0.7, "#8a6640");
    cloth(ctx, [[sx - 6, sy - 6], [sx + 6, sy - 6], [sx + 5, sy - 3.4], [sx - 5, sy - 3.4]], k.color, 3);
    plate(ctx, [[sx - 5, sy - 3], [sx + 5, sy - 3], [sx + 5, sy - 1.4], [sx - 5, sy - 1.4]], "#8a6640", {
      hi: "#b98d5b",
      lo: "#4a3320",
      rimA: 0.35,
    });
    ([[-3, -4], [0, -4.2], [3, -3.8]] as Array<[number, number]>).forEach(([dx, dy]) =>
      orb(ctx, sx + dx, sy + dy, 1.3, 1, dx ? "#d2452f" : "#e6c463", { rim: false }),
    );
  }
  if (city.isCapital) {
    limb(ctx, [0, -8], [0, -32], 1.3, 1.1, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    cloth(ctx, [[0, -32], [0, -21], [14, -24]], k.color, 2);
    orb(ctx, 0, -33.4, 1.6, 1.6, dk(k.color, 0.2), { hi: "#fff2bf", rim: false });
  }
}

/* ── prop dispatch, for the sprite cache ── */

export type PropKind =
  | { kind: "mountain"; variant: number }
  | { kind: "trees"; variant: number; tribeId: string }
  | { kind: "resource"; resource: ResourceType }
  | { kind: "building"; building: BuildingType; tribeId: string }
  | { kind: "village" }
  | { kind: "ruin" }
  | { kind: "city"; tribeId: string; level: number; walls: boolean; isCapital: boolean };

/** Stable identity of a prop: two props with the same key draw identically. */
export function propKey(p: PropKind): string {
  switch (p.kind) {
    case "mountain":
      return `mountain|${p.variant}`;
    case "trees":
      return `trees|${p.variant}|${p.tribeId}`;
    case "resource":
      return `res|${p.resource}`;
    case "building":
      return `bld|${p.building}|${p.tribeId}`;
    case "village":
      return "village";
    case "ruin":
      return "ruin";
    case "city":
      return `city|${p.tribeId}|${Math.min(4, 1 + Math.floor(p.level / 2))}|${p.walls}|${p.isCapital}|${p.level >= 2}`;
  }
}

/** Draw a prop with its tile centre at the origin. */
export function drawProp(ctx: Ctx, p: PropKind): void {
  switch (p.kind) {
    case "mountain":
      drawMountain(ctx, p.variant);
      return;
    case "trees":
      drawTrees(ctx, p.variant, p.tribeId);
      return;
    case "resource":
      drawResource(ctx, p.resource);
      return;
    case "building":
      drawBuilding(ctx, p.building, kitFor(p.tribeId));
      return;
    case "village":
      drawVillage(ctx);
      return;
    case "ruin":
      drawRuin(ctx);
      return;
    case "city":
      drawCity(ctx, p, kitFor(p.tribeId));
      return;
  }
}
