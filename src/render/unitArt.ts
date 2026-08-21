/* Polyforge — procedural character art, realistic pass.
   Ported from codex/unitart.js, which remains the design reference.
   Figures are authored in a 100-unit-tall space (feet at y=0, crown at y=-100)
   and shaded with material gradients, ambient occlusion and specular passes
   rather than flat fills. Mounted on the isometric stage by ./renderer.ts. */
import { TRIBES } from "../data/tribes";
import type { UnitType } from "../data/units";

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];
export type Stops = Array<[number, string]>;

/** Unit types the art module can draw: every trainable unit plus the embarked forms. */
export type ArtUnitType = UnitType | "raft" | "ship";

export interface DrawCharacterOpts {
  /** tribe id; unknown ids fall back to the first tribe rather than throwing mid-frame */
  tribe: string;
  type: ArtUnitType;
  /** ground point the figure stands on (feet), in the current canvas space */
  x?: number;
  y?: number;
  /** 1 = authored figure at tile scale */
  scale?: number;
  veteran?: boolean;
  acted?: boolean;
  /** 0..1; the bar is drawn only when below 1 */
  hpFrac?: number;
}

/** Weapon families drive blade, haft and siege-payload styling. */
type WeaponStyle = "notched" | "hook" | "straight" | "thorn";

interface KitDef {
  trim: string;
  cloth: string;
  metal: string;
  metalHi: string;
  weapon: WeaponStyle;
  /** forward shear applied to the whole figure */
  lean: number;
  /** lowers the shoulder line; a settled, heavier stance */
  crouch: number;
  bulk: number;
  helm(ctx: Ctx, k: TribeKit): void;
  shield(ctx: Ctx, k: TribeKit): void;
  crest(ctx: Ctx, c: string): void;
  accent(ctx: Ctx, x: number, y: number): void;
}

/** A kit merged with its tribe's identity colors. */
export interface TribeKit extends KitDef {
  id: string;
  name: string;
  color: string;
  dark: string;
  armor: string;
  armorDark: string;
}

export interface LimbOpts {
  hi?: string;
  lo?: string;
  rim?: boolean;
  line?: number;
}

export interface PlateOpts extends LimbOpts {
  rimA?: number;
  horiz?: boolean;
  spec?: boolean;
  specA?: number;
}

export interface OrbOpts extends LimbOpts {
  rot?: number;
}

interface BodyCfg {
  bulk?: number;
  crouch?: number;
  seated?: boolean;
  plated?: boolean;
  cape?: boolean;
}

/** Joint positions returned by body() so weapons and shields can be hung on the figure. */
interface Joints {
  sh: number;
  waist: number;
  hip: number;
  shW: number;
  bulk: number;
}

/* ───────────── color ───────────── */
function rgb(h: string): [number, number, number] {
  if (h.charAt(0) !== "#") {
    const m = h.match(/-?\d+/g) ?? ["0", "0", "0"];
    return [+m[0], +m[1], +m[2]];
  }
  h = h.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mix(a: string, b: string, t: number): string {
  const A = rgb(a), B = rgb(b);
  return "rgb(" + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",") + ")";
}
const lt = (c: string, t: number) => mix(c, "#fff6e8", t);
const dk = (c: string, t: number) => mix(c, "#120e14", t);
const alpha = (c: string, a: number) => "rgba(" + rgb(c).join(",") + "," + a + ")";

/** Key light comes from upper left-front; a cool bounce fills from lower right. */
const L: Pt = [-0.52, -0.85];

const MAT = {
  skin: "#c98f66", skinHi: "#f0c79b", skinLo: "#7c4e33",
  steel: "#aeb8c4", steelHi: "#f2f6fb", steelLo: "#3f4753",
  iron: "#5d6068", ironHi: "#9aa0aa", ironLo: "#24272d",
  bronze: "#c39a4e", leather: "#6d4a2c", leatherHi: "#a5763f",
  wood: "#8a6640", woodHi: "#b98d5b", woodLo: "#4a3320",
  rope: "#c9b088", cloth: "#8d3f33",
};

function G(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Stops): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s) => g.addColorStop(s[0], s[1]));
  return g;
}
function RG(ctx: Ctx, x: number, y: number, r: number, stops: Stops): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  stops.forEach((s) => g.addColorStop(s[0], s[1]));
  return g;
}

/* ───────────── shading primitives ───────────── */

/** Tapered, round-capped limb with cross-axis material shading. */
function limb(ctx: Ctx, a: Pt, b: Pt, r1: number, r2: number, col: string, opts: LimbOpts = {}): void {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 0.001;
  const px = -dy / len, py = dx / len;
  const ap = Math.atan2(py, px);
  ctx.beginPath();
  ctx.arc(a[0], a[1], r1, ap, ap + Math.PI);
  ctx.arc(b[0], b[1], r2, ap + Math.PI, ap + Math.PI * 2);
  ctx.closePath();

  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const r = Math.max(r1, r2);
  const towardLight = px * L[0] + py * L[1] > 0 ? 1 : -1;
  const hi = opts.hi || lt(col, 0.42), lo = opts.lo || dk(col, 0.5);
  ctx.fillStyle = G(ctx,
    mx + px * r * towardLight, my + py * r * towardLight,
    mx - px * r * towardLight, my - py * r * towardLight,
    [[0, hi], [0.22, lt(col, 0.12)], [0.62, col], [1, lo]]);
  ctx.fill();
  if (opts.rim !== false) {
    ctx.strokeStyle = alpha(dk(col, 0.72), 0.55);
    ctx.lineWidth = opts.line || 0.9;
    ctx.stroke();
  }
}

/** Shaded polygon plate: vertical light falloff, hairline rim, optional specular. */
function plate(ctx: Ctx, pts: Pt[], col: string, opts: PlateOpts = {}): void {
  let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
  pts.forEach((p) => { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); });
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  const hi = opts.hi || lt(col, 0.4), lo = opts.lo || dk(col, 0.48);
  ctx.fillStyle = opts.horiz
    ? G(ctx, minX, 0, maxX, 0, [[0, hi], [0.45, col], [1, lo]])
    : G(ctx, 0, minY, 0, maxY, [[0, hi], [0.38, lt(col, 0.08)], [1, lo]]);
  ctx.fill();
  if (opts.rim !== false) {
    ctx.strokeStyle = alpha(dk(col, 0.7), opts.rimA == null ? 0.5 : opts.rimA);
    ctx.lineWidth = opts.line || 0.9;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  if (opts.spec) {
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = opts.specA || 0.5;
    ctx.fillStyle = G(ctx, minX, minY, minX + (maxX - minX) * 0.6, maxY, [[0, "rgba(255,255,255,0)"], [0.4, "rgba(255,255,255,0.85)"], [0.55, "rgba(255,255,255,0)"]]);
    ctx.fillRect(minX - 2, minY - 2, maxX - minX + 4, maxY - minY + 4);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

/** Shaded ellipsoid volume (heads, pauldrons, bosses). */
function orb(ctx: Ctx, x: number, y: number, rx: number, ry: number, col: string, opts: OrbOpts = {}): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, opts.rot || 0, 0, Math.PI * 2);
  ctx.fillStyle = RG(ctx, x + L[0] * rx * 0.5, y + L[1] * ry * 0.5, Math.max(rx, ry) * 1.5,
    [[0, opts.hi || lt(col, 0.5)], [0.42, col], [1, opts.lo || dk(col, 0.55)]]);
  ctx.fill();
  if (opts.rim !== false) {
    ctx.strokeStyle = alpha(dk(col, 0.7), 0.45);
    ctx.lineWidth = opts.line || 0.9;
    ctx.stroke();
  }
}

/** Ambient occlusion pool — soft contact darkening. */
function ao(ctx: Ctx, x: number, y: number, r: number, strength = 0.35): void {
  ctx.fillStyle = RG(ctx, x, y, r, [[0, "rgba(10,6,12," + strength + ")"], [1, "rgba(10,6,12,0)"]]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Soft ground shadow. */
function groundShadow(ctx: Ctx, rx: number, ry: number): void {
  ctx.save();
  ctx.fillStyle = RG(ctx, 0, 0, rx, [[0, "rgba(8,12,20,0.5)"], [0.55, "rgba(8,12,20,0.28)"], [1, "rgba(8,12,20,0)"]]);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function spec(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0, a = 0.6): void {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = RG(ctx, x, y, Math.max(rx, ry), [[0, "rgba(255,255,255,0.95)"], [1, "rgba(255,255,255,0)"]]);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function stroke(ctx: Ctx, pts: Pt[], col: string, w: number, cap: CanvasLineCap = "round"): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = cap; ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
}

/** Cloth panel with hanging folds. */
function cloth(ctx: Ctx, pts: Pt[], col: string, folds = 3): void {
  plate(ctx, pts, col, { rimA: 0.35 });
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.clip();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  pts.forEach((p) => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
  for (let i = 1; i <= folds; i++) {
    const x = minX + ((maxX - minX) * i) / (folds + 1);
    ctx.beginPath();
    ctx.moveTo(x, minY);
    ctx.quadraticCurveTo(x + (maxX - minX) * 0.05, (minY + maxY) / 2, x - (maxX - minX) * 0.03, maxY);
    ctx.strokeStyle = "rgba(20,12,18,0.22)"; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 2.4, minY);
    ctx.quadraticCurveTo(x + 2.4 + (maxX - minX) * 0.05, (minY + maxY) / 2, x - 0.6, maxY);
    ctx.strokeStyle = "rgba(255,245,230,0.14)"; ctx.lineWidth = 1.6; ctx.stroke();
  }
  ctx.restore();
}

/** Wood with grain. */
function wood(ctx: Ctx, pts: Pt[], opts: PlateOpts = {}): void {
  plate(ctx, pts, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo, ...opts });
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.clip();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  pts.forEach((p) => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
  const horiz = maxX - minX > maxY - minY;
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    ctx.beginPath();
    if (horiz) { ctx.moveTo(minX, minY + (maxY - minY) * t); ctx.lineTo(maxX, minY + (maxY - minY) * t + 0.8); }
    else { ctx.moveTo(minX + (maxX - minX) * t, minY); ctx.lineTo(minX + (maxX - minX) * t + 0.8, maxY); }
    ctx.strokeStyle = i % 2 ? "rgba(40,26,14,0.22)" : "rgba(220,180,130,0.16)";
    ctx.lineWidth = 0.9; ctx.stroke();
  }
  ctx.restore();
}

/* ───────────── tribe kits ─────────────
   Six axes of variation: headgear, shield, weapon, stance, crest, terrain accent. */
const KITS: Record<string, KitDef> = {
  ashfen: {
    trim: "#f0a24b", cloth: "#b8402c", metal: "#4c4442", metalHi: "#8a7d76", weapon: "notched",
    lean: 0.055, crouch: 0, bulk: 1.0,
    /** kiln-hood: heat-warped iron cowl, side horns, burning crest */
    helm(ctx: Ctx, k: TribeKit) {
      plate(ctx, [[-9.5, 2], [-10.5, -8], [-6, -14.5], [6, -14.5], [10.5, -8], [9.5, 2], [5, 4], [-5, 4]], k.metal, { hi: k.metalHi, lo: dk(k.metal, 0.6), spec: true, specA: 0.35 });
      plate(ctx, [[-10.5, -7], [-17, -12], [-11, -12.5], [-6, -14]], k.metal, { hi: k.metalHi });
      plate(ctx, [[10.5, -7], [17, -12], [11, -12.5], [6, -14]], k.metal, { hi: k.metalHi });
      // brow band and eye slit
      plate(ctx, [[-9.5, -3], [9.5, -3], [10, -6.5], [-10, -6.5]], dk(k.metal, 0.25), { hi: k.metalHi, spec: true });
      ctx.fillStyle = "rgba(8,6,8,0.92)";
      ctx.fillRect(-6, -5.6, 12, 2.1);
      ctx.fillStyle = alpha("#ff7a2f", 0.55);
      ctx.fillRect(-5, -5.2, 10, 1.1);
      // ember crest
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-2.5, -14);
      ctx.quadraticCurveTo(-4, -24, 1, -30);
      ctx.quadraticCurveTo(3, -22, 6, -26);
      ctx.quadraticCurveTo(6, -17, 3.5, -13.5);
      ctx.closePath();
      ctx.fillStyle = G(ctx, 0, -30, 0, -13, [[0, "#fff0b8"], [0.35, "#ffb03a"], [1, "#c33c1c"]]);
      ctx.fill();
      ctx.restore();
      spec(ctx, 0, -20, 3, 6, 0, 0.4);
    },
    shield(ctx: Ctx, k: TribeKit) { // teardrop, flame-notched rim
      plate(ctx, [[0, -20], [13, -10], [13, 6], [0, 22], [-13, 6], [-13, -10]], k.cloth, { spec: true, specA: 0.28 });
      plate(ctx, [[0, -13], [7.5, -6], [7.5, 4], [0, 14], [-7.5, 4], [-7.5, -6]], k.trim, { rimA: 0.4 });
      orb(ctx, 0, 0, 4, 4, MAT.iron, { hi: MAT.ironHi });
      spec(ctx, -5, -9, 4, 7, -0.5, 0.35);
    },
    crest(ctx: Ctx, c: string) {
      plate(ctx, [[0, -9], [5, 0], [0, 9], [-5, 0]], c, { rimA: 0.35 });
      plate(ctx, [[0, -5], [2.5, 0.5], [0, 5], [-2.5, 0.5]], "#ffe9a8", { rimA: 0.2 });
    },
    accent(ctx: Ctx, x: number, y: number) {
      for (let i = 0; i < 4; i++) {
        const ex = x + i * 5.5, ey = y - i * 9 - Math.sin(i) * 3;
        ctx.fillStyle = RG(ctx, ex, ey, 4 - i * 0.5, [[0, "rgba(255,214,140,0.85)"], [0.4, "rgba(255,140,50,0.45)"], [1, "rgba(255,120,40,0)"]]);
        ctx.beginPath(); ctx.arc(ex, ey, 4 - i * 0.5, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  korvani: {
    trim: "#8fdff0", cloth: "#2f66ab", metal: "#63737f", metalHi: "#aebcc7", weapon: "hook",
    lean: 0, crouch: 3.5, bulk: 0.95,
    helm(ctx: Ctx, k: TribeKit) { // finned diving helm with a glass port
      plate(ctx, [[-9, 3], [-9.5, -8], [0, -17], [9.5, -8], [9, 3], [4, 4.5], [-4, 4.5]], k.metal, { hi: k.metalHi, spec: true, specA: 0.45 });
      plate(ctx, [[-2, -16], [1, -28], [5, -25], [6, -14]], k.trim, { rimA: 0.4, spec: true }); // dorsal fin
      plate(ctx, [[-9.5, -7], [-16.5, -3], [-9, -0.5]], k.metal, { hi: k.metalHi });
      plate(ctx, [[9.5, -7], [16.5, -3], [9, -0.5]], k.metal, { hi: k.metalHi });
      orb(ctx, 0, -5.5, 5.2, 4.2, "#16283a", { hi: "#5f93b3", lo: "#0a1420" });
      spec(ctx, -1.8, -7, 2, 1.4, -0.4, 0.85);
      ctx.strokeStyle = alpha(k.metalHi, 0.9); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.ellipse(0, -5.5, 5.6, 4.6, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 5; i++) { // rivets
        const a = -Math.PI + (i / 4) * Math.PI;
        orb(ctx, Math.cos(a) * 7.4, -5.5 + Math.sin(a) * 6.2, 0.9, 0.9, k.metalHi, { rim: false });
      }
    },
    shield(ctx: Ctx, k: TribeKit) { // round, scalloped, wave boss
      orb(ctx, 0, 0, 15, 17, k.cloth, { hi: lt(k.cloth, 0.4) });
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 17, 0, 0, Math.PI * 2); ctx.clip();
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-15, i * 6.5);
        ctx.quadraticCurveTo(-4, i * 6.5 - 5, 0, i * 6.5);
        ctx.quadraticCurveTo(4, i * 6.5 + 5, 15, i * 6.5);
        ctx.strokeStyle = alpha(k.trim, 0.85); ctx.lineWidth = 1.8; ctx.stroke();
      }
      ctx.restore();
      orb(ctx, 0, 0, 4.6, 4.6, MAT.steel, { hi: MAT.steelHi, lo: MAT.steelLo });
      spec(ctx, -6, -8, 5, 8, -0.4, 0.4);
    },
    crest(ctx: Ctx, c: string) {
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-7, -3 + i * 6.5);
        ctx.quadraticCurveTo(0, -10 + i * 6.5, 7, -3 + i * 6.5);
        ctx.strokeStyle = c; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.stroke();
      }
      ctx.lineCap = "butt";
    },
    accent(ctx: Ctx, x: number, y: number) {
      for (let i = 0; i < 5; i++) {
        const ex = x + i * 4.5, ey = y - i * 7;
        ctx.fillStyle = RG(ctx, ex, ey, 3.4, [[0, "rgba(226,248,255,0.9)"], [0.5, "rgba(143,223,240,0.45)"], [1, "rgba(143,223,240,0)"]]);
        ctx.beginPath(); ctx.arc(ex, ey, 3.4 - i * 0.35, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  meridia: {
    trim: "#ffe9a8", cloth: "#c08a22", metal: "#cfae62", metalHi: "#fbecc0", weapon: "straight",
    lean: -0.03, crouch: 0, bulk: 1.0,
    helm(ctx: Ctx, k: TribeKit) { // gilt parade helm, transverse crest, sun disc
      plate(ctx, [[-9, 3], [-10, -8], [-5, -15], [5, -15], [10, -8], [9, 3], [4, 4.5], [-4, 4.5]], k.metal, { hi: k.metalHi, lo: dk(k.metal, 0.55), spec: true, specA: 0.7 });
      plate(ctx, [[-10, -8], [-10, -1], [-13, 0], [-13, -7]], k.metal, { hi: k.metalHi, spec: true });
      plate(ctx, [[10, -8], [10, -1], [13, 0], [13, -7]], k.metal, { hi: k.metalHi, spec: true });
      ctx.fillStyle = "rgba(10,8,4,0.9)";
      ctx.fillRect(-6.5, -6.6, 13, 2.3);
      // transverse crest
      ctx.beginPath();
      ctx.moveTo(-7, -14.5);
      ctx.quadraticCurveTo(0, -32, 8.5, -13.5);
      ctx.quadraticCurveTo(2, -20, -7, -14.5);
      ctx.closePath();
      ctx.fillStyle = G(ctx, -7, -30, 8, -13, [[0, "#fff8e0"], [0.5, k.trim], [1, "#b58a2c"]]);
      ctx.fill();
      ctx.strokeStyle = "rgba(60,42,10,0.45)"; ctx.lineWidth = 0.9; ctx.stroke();
      orb(ctx, 0, -19, 3.6, 3.6, "#ffefc0", { hi: "#ffffff", lo: "#c69a34" });
      spec(ctx, -3, -10, 2.6, 4, -0.4, 0.75);
    },
    shield(ctx: Ctx, k: TribeKit) { // tower shield with sunburst
      plate(ctx, [[-13, -22], [13, -22], [13, 22], [-13, 22]], k.cloth, { spec: true, specA: 0.35 });
      ctx.save();
      ctx.beginPath(); ctx.rect(-13, -22, 26, 44); ctx.clip();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        stroke(ctx, [[Math.cos(a) * 5, Math.sin(a) * 5], [Math.cos(a) * 20, Math.sin(a) * 20]], alpha(k.trim, 0.9), 1.8);
      }
      ctx.restore();
      orb(ctx, 0, 0, 5.2, 5.2, k.trim, { hi: "#fffaf0", lo: "#b08a30" });
      plate(ctx, [[-13, -22], [13, -22], [13, -19], [-13, -19]], k.metal, { hi: k.metalHi, spec: true });
      plate(ctx, [[-13, 19], [13, 19], [13, 22], [-13, 22]], k.metal, { hi: k.metalHi, spec: true });
      spec(ctx, -6, -13, 5, 12, -0.25, 0.35);
    },
    crest(ctx: Ctx, c: string) {
      orb(ctx, 0, 0, 4, 4, c, { hi: "#fffaf0" });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        stroke(ctx, [[Math.cos(a) * 5.4, Math.sin(a) * 5.4], [Math.cos(a) * 8.6, Math.sin(a) * 8.6]], c, 1.6);
      }
    },
    accent(ctx: Ctx, x: number, y: number) {
      for (let i = 0; i < 5; i++) {
        const ex = x + i * 4, ey = y - i * 7.5;
        ctx.fillStyle = RG(ctx, ex, ey, 3.2, [[0, "rgba(255,246,214,0.9)"], [1, "rgba(255,233,168,0)"]]);
        ctx.beginPath(); ctx.arc(ex, ey, 3.2 - i * 0.3, 0, Math.PI * 2); ctx.fill();
      }
    },
  },
  thornwood: {
    trim: "#9fd46f", cloth: "#356b39", metal: "#6d5a3d", metalHi: "#a58d5f", weapon: "thorn",
    lean: 0.03, crouch: 6, bulk: 0.98,
    helm(ctx: Ctx, k: TribeKit) { // antlered bark hood over a carved leaf mask
      ctx.beginPath();
      ctx.moveTo(-10, 4);
      ctx.quadraticCurveTo(-12, -12, 0, -16.5);
      ctx.quadraticCurveTo(12, -12, 10, 4);
      ctx.quadraticCurveTo(0, 7, -10, 4);
      ctx.closePath();
      ctx.fillStyle = RG(ctx, -4, -10, 20, [[0, lt(k.metal, 0.4)], [0.5, k.metal], [1, dk(k.metal, 0.55)]]);
      ctx.fill();
      ctx.strokeStyle = "rgba(30,22,12,0.5)"; ctx.lineWidth = 0.9; ctx.stroke();
      // bark texture
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-10, 4); ctx.quadraticCurveTo(-12, -12, 0, -16.5); ctx.quadraticCurveTo(12, -12, 10, 4); ctx.closePath();
      ctx.clip();
      for (let i = -3; i <= 3; i++) stroke(ctx, [[i * 3, -17], [i * 3 + 1.2, 5]], "rgba(30,22,12,0.28)", 0.8);
      ctx.restore();
      // antlers
      ([[-1, -1], [1, 1]] as Pt[]).forEach(([s]) => {
        stroke(ctx, [[s * 6, -14], [s * 11, -24], [s * 9, -31]], MAT.woodHi, 2.2);
        stroke(ctx, [[s * 9.6, -22], [s * 16, -25]], MAT.woodHi, 1.6);
        stroke(ctx, [[s * 10.2, -27], [s * 6, -33]], MAT.woodHi, 1.5);
      });
      plate(ctx, [[0, -12], [6, -5], [0, 3], [-6, -5]], k.trim, { rimA: 0.4 });
      stroke(ctx, [[0, -11], [0, 2]], "rgba(30,60,26,0.6)", 1);
      for (let i = 0; i < 3; i++) stroke(ctx, [[0, -8 + i * 3], [3.4, -10 + i * 3]], "rgba(30,60,26,0.45)", 0.8);
    },
    shield(ctx: Ctx, k: TribeKit) { // lashed bark planks
      plate(ctx, [[-12, -18], [12, -18], [14, 2], [0, 20], [-14, 2]], MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
      for (let i = -1; i <= 1; i++) stroke(ctx, [[i * 7, -17.5], [i * 7 + 1, 13]], "rgba(40,26,14,0.4)", 1.3);
      plate(ctx, [[-13.4, -7], [13.4, -7], [13.4, -3.6], [-13.4, -3.6]], k.trim, { rimA: 0.3 });
      plate(ctx, [[-11.6, 4], [11.6, 4], [11.6, 7.4], [-11.6, 7.4]], k.trim, { rimA: 0.3 });
      orb(ctx, 0, -1, 3.6, 3.6, MAT.iron, { hi: MAT.ironHi });
      spec(ctx, -5, -11, 4, 7, -0.4, 0.25);
    },
    crest(ctx: Ctx, c: string) {
      stroke(ctx, [[0, 8], [0, -8]], c, 2);
      stroke(ctx, [[0, -1], [6, -7]], c, 1.7);
      stroke(ctx, [[0, 2.5], [-6, -3]], c, 1.7);
      stroke(ctx, [[0, -5], [4.6, -10]], c, 1.4);
    },
    accent(ctx: Ctx, x: number, y: number) {
      for (let i = 0; i < 3; i++) {
        const ex = x + i * 6, ey = y - i * 10;
        ctx.save();
        ctx.translate(ex, ey); ctx.rotate(i * 0.7);
        plate(ctx, [[0, -4], [3.4, 0], [0, 4], [-3.4, 0]], "#9fd46f", { rimA: 0.3 });
        ctx.restore();
      }
    },
  },
};

/** Merges a tribe's identity colors into its kit. Unknown ids degrade to the
    first tribe / Ashfen kit rather than throwing inside the render loop. */
export function kitFor(tribeId: string): TribeKit {
  const t = TRIBES.find((x) => x.id === tribeId) ?? TRIBES[0];
  const base = KITS[t.id] ?? KITS.ashfen;
  return {
    ...base,
    id: t.id,
    name: t.name,
    color: t.color,
    dark: t.colorDark,
    armor: t.color,
    armorDark: t.colorDark,
  };
}

/* ───────────── the human figure ─────────────
   100 units tall; 3/4 view facing right; key light upper-left. */
function head(ctx: Ctx, k: TribeKit, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  limb(ctx, [-1, 8], [0, 2], 3.6, 3.9, MAT.skin, { hi: MAT.skinHi, lo: MAT.skinLo }); // neck
  ao(ctx, 0, 6, 5, 0.4);
  // skull + jaw
  orb(ctx, 0, 0, 6.2, 7.1, MAT.skin, { hi: MAT.skinHi, lo: MAT.skinLo });
  plate(ctx, [[-4.6, 2], [4.6, 2], [3.4, 6.4], [-3, 6.4]], MAT.skin, { hi: MAT.skinHi, lo: MAT.skinLo, rimA: 0.25 });
  ao(ctx, 0, -1.4, 5.4, 0.22);
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  k.helm(ctx, k);
  ctx.restore();
}

function body(ctx: Ctx, k: TribeKit, cfg: BodyCfg = {}): Joints {
  const bulk = (cfg.bulk == null ? 1 : cfg.bulk) * (k.bulk || 1);
  const crouch = (cfg.crouch == null ? 0 : cfg.crouch) + (k.crouch || 0);
  const col = k.armor;
  const sh = 82 - crouch;      // shoulder line
  const waist = 58 - crouch;
  const hip = 50 - crouch;
  const shW = 13.5 * bulk;

  // ── legs. Joints are derived from the hip so a crouched or seated figure
  // keeps knee-above-ankle ordering.
  if (cfg.seated) {
    // thigh forward over the saddle, shin down the flank
    limb(ctx, [-1, -hip - 1], [13, -hip + 3], 6.2 * bulk, 4.6 * bulk, dk(col, 0.42));
    limb(ctx, [13, -hip + 3], [15, -hip + 22], 4.3 * bulk, 3.3 * bulk, dk(col, 0.5));
    plate(ctx, [[10, -hip + 21], [20, -hip + 21], [21, -hip + 26], [9, -hip + 26]], MAT.leather, { hi: MAT.leatherHi });
    limb(ctx, [3, -hip - 2], [17, -hip + 2], 6.6 * bulk, 4.8 * bulk, dk(col, 0.28));
    limb(ctx, [17, -hip + 2], [19, -hip + 22], 4.5 * bulk, 3.5 * bulk, dk(col, 0.36));
    plate(ctx, [[14, -hip + 21], [25, -hip + 21], [26, -hip + 26], [13, -hip + 26]], MAT.leather, { hi: MAT.leatherHi });
  } else {
    const knee = hip * 0.5, ankle = 3.5;
    limb(ctx, [-4, -hip], [-8, -knee], 6.4 * bulk, 4.6 * bulk, dk(col, 0.42));
    limb(ctx, [-8, -knee], [-9, -ankle], 4.4 * bulk, 3.4 * bulk, dk(col, 0.5));
    plate(ctx, [[-14, -ankle - 1], [-4, -ankle - 1], [-3.5, 0], [-15.5, 0]], MAT.leather, { hi: MAT.leatherHi });
    limb(ctx, [5, -hip], [8, -knee - 1], 6.8 * bulk, 4.8 * bulk, dk(col, 0.3));
    limb(ctx, [8, -knee - 1], [8.5, -ankle], 4.6 * bulk, 3.6 * bulk, dk(col, 0.38));
    plate(ctx, [[3, -ankle - 1], [14.5, -ankle - 1], [15.5, 0], [2.5, 0]], MAT.leather, { hi: MAT.leatherHi });
    ao(ctx, 0, -2, 16, 0.3);
  }

  // ── torso: chest tapering to waist, then hip plate
  plate(ctx, [[-shW, -sh], [shW, -sh], [shW * 0.72, -waist], [-shW * 0.72, -waist]], col, { spec: true, specA: 0.22 });
  plate(ctx, [[-shW * 0.72, -waist], [shW * 0.72, -waist], [shW * 0.78, -hip - 2], [-shW * 0.78, -hip - 2]], dk(col, 0.18), {});
  // chest musculature / cuirass swell
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-shW, -sh); ctx.lineTo(shW, -sh); ctx.lineTo(shW * 0.72, -waist); ctx.lineTo(-shW * 0.72, -waist);
  ctx.closePath(); ctx.clip();
  ctx.fillStyle = RG(ctx, -shW * 0.35, -sh + 8, shW * 1.3, [[0, alpha(lt(col, 0.55), 0.55)], [1, "rgba(255,255,255,0)"]]);
  ctx.fillRect(-shW - 2, -sh - 2, shW * 2 + 4, sh);
  stroke(ctx, [[0, -sh + 3], [0, -waist - 2]], "rgba(20,12,18,0.25)", 1.2);
  ctx.fillStyle = "rgba(20,12,18,0.18)";
  ctx.fillRect(shW * 0.34, -sh, shW, sh - waist);
  ctx.restore();
  if (cfg.plated) {
    plate(ctx, [[-shW * 0.95, -sh + 9], [shW * 0.95, -sh + 9], [shW * 0.9, -sh + 13], [-shW * 0.9, -sh + 13]], k.metal, { hi: k.metalHi, spec: true });
    plate(ctx, [[-shW * 0.85, -waist - 8], [shW * 0.85, -waist - 8], [shW * 0.8, -waist - 4], [-shW * 0.8, -waist - 4]], k.metal, { hi: k.metalHi, spec: true });
  }
  // belt
  plate(ctx, [[-shW * 0.8, -hip - 6], [shW * 0.8, -hip - 6], [shW * 0.82, -hip], [-shW * 0.82, -hip]], MAT.leather, { hi: MAT.leatherHi });
  orb(ctx, 0, -hip - 3, 2.6, 2.6, k.metal, { hi: k.metalHi });
  // tribe crest on the chest
  ctx.save();
  ctx.translate(0, -(sh + waist) / 2 - 2);
  ctx.scale(0.82, 0.82);
  k.crest(ctx, k.trim);
  ctx.restore();

  if (cfg.cape) {
    cloth(ctx, [[-shW + 1, -sh - 1], [-shW - 7, -20], [-shW + 5, -16], [-shW * 0.4, -sh + 4]], k.cloth, 2);
  }

  // ── pauldrons
  orb(ctx, -shW - 1.5, -sh + 3.5, 7.6 * bulk, 6.4 * bulk, k.metal, { hi: k.metalHi, lo: dk(k.metal, 0.6) });
  orb(ctx, shW + 1.5, -sh + 3.5, 7.8 * bulk, 6.6 * bulk, k.metal, { hi: k.metalHi, lo: dk(k.metal, 0.6) });
  spec(ctx, -shW - 3.5, -sh + 1, 3, 2, -0.4, 0.55);
  spec(ctx, shW - 0.5, -sh + 1, 3, 2, -0.4, 0.45);

  head(ctx, k, 1.5, -(sh + 12), 1);

  return { sh, waist, hip, shW, bulk };
}

function arm(ctx: Ctx, k: TribeKit, from: Pt, to: Pt, elbow: Pt, bulk: number, opts: { color?: string; bracer?: boolean } = {}): void {
  const col = opts.color || dk(k.armor, 0.12);
  limb(ctx, from, elbow, 5 * bulk, 4 * bulk, col);
  limb(ctx, elbow, to, 3.9 * bulk, 3.2 * bulk, MAT.skin, { hi: MAT.skinHi, lo: MAT.skinLo });
  if (opts.bracer) plate(ctx, [[to[0] - 4.4, to[1] - 6], [to[0] + 4.4, to[1] - 6], [to[0] + 4, to[1] - 1], [to[0] - 4, to[1] - 1]], k.metal, { hi: k.metalHi, spec: true });
  orb(ctx, to[0], to[1] + 1.5, 3.4 * bulk, 3.2 * bulk, MAT.skin, { hi: MAT.skinHi, lo: MAT.skinLo }); // fist
}

/* ───────────── weapons ───────────── */
function haftStyle(ctx: Ctx, k: TribeKit, a: Pt, b: Pt, w: number): void {
  if (k.weapon === "thorn") {
    limb(ctx, a, b, w, w * 0.85, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      stroke(ctx, [[x, y], [x + 4, y + 1.5]], k.trim, 1.2);
    }
  } else if (k.weapon === "notched") {
    limb(ctx, a, b, w, w * 0.85, "#3b3330", { hi: "#6e625c" });
  } else if (k.weapon === "hook") {
    limb(ctx, a, b, w, w * 0.85, "#6f7f86", { hi: "#c2d6dd" });
  } else {
    limb(ctx, a, b, w, w * 0.85, k.metal, { hi: k.metalHi });
  }
}

function bladeGeom(ctx: Ctx, k: TribeKit, len: number, w: number): void {
  if (k.weapon === "notched") {
    plate(ctx, [[-w, 0], [w, 0], [w * 0.7, -len * 0.55], [w, -len * 0.8], [0, -len], [-w * 0.85, -len * 0.7]], "#6b615c", { hi: "#a49991", lo: "#2c2622", spec: true });
    stroke(ctx, [[0, -3], [0, -len + 4]], "rgba(255,140,60,0.75)", 1.3);
  } else if (k.weapon === "hook") {
    ctx.beginPath();
    ctx.moveTo(-w, 0); ctx.lineTo(w, 0);
    ctx.quadraticCurveTo(w + 4, -len * 0.6, 0, -len);
    ctx.quadraticCurveTo(-w - 1.5, -len * 0.55, -w, 0);
    ctx.closePath();
    ctx.fillStyle = G(ctx, -w, 0, w, -len, [[0, MAT.steelLo], [0.45, MAT.steel], [0.62, MAT.steelHi], [1, MAT.steelLo]]);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,26,32,0.5)"; ctx.lineWidth = 0.8; ctx.stroke();
  } else if (k.weapon === "thorn") {
    plate(ctx, [[-w, 0], [w, 0], [w, -len * 0.75], [0, -len], [-w, -len * 0.72]], "#8d968a", { hi: "#d3dbd0", lo: "#3d443c", spec: true });
    stroke(ctx, [[-w, -len * 0.42], [-w - 4, -len * 0.42 - 4]], k.trim, 1.3);
  } else {
    plate(ctx, [[-w, 0], [w, 0], [w, -len * 0.82], [0, -len], [-w, -len * 0.82]], MAT.steel, { hi: MAT.steelHi, lo: MAT.steelLo, spec: true, specA: 0.75 });
    stroke(ctx, [[0, -3], [0, -len + 5]], "rgba(70,84,98,0.6)", 1);
  }
}

function sword(ctx: Ctx, k: TribeKit, x: number, y: number, rot: number, len: number, hilt: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  limb(ctx, [0, 9], [0, 0], 2.4, 2.4, MAT.leather, { hi: MAT.leatherHi });
  orb(ctx, 0, 10.5, 2.6, 2.6, k.metal, { hi: k.metalHi });
  plate(ctx, [[-hilt, -1.5], [hilt, -1.5], [hilt * 0.8, 1.5], [-hilt * 0.8, 1.5]], k.metal, { hi: k.metalHi, spec: true });
  bladeGeom(ctx, k, len, len * 0.11);
  ctx.restore();
}

function spear(ctx: Ctx, k: TribeKit, x: number, y: number, rot: number, len: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  haftStyle(ctx, k, [0, len * 0.32], [0, -len * 0.68], 2.1);
  ctx.translate(0, -len * 0.68);
  bladeGeom(ctx, k, len * 0.24, len * 0.045);
  ctx.restore();
}

function bowWeapon(ctx: Ctx, k: TribeKit, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  const col = k.weapon === "thorn" ? MAT.wood : k.weapon === "notched" ? "#3b3330" : k.weapon === "hook" ? "#6f7f86" : k.metal;
  ctx.beginPath();
  ctx.moveTo(0, -25);
  ctx.quadraticCurveTo(17, 0, 0, 25);
  ctx.strokeStyle = G(ctx, 0, -25, 12, 25, [[0, lt(col, 0.35)], [0.5, col], [1, dk(col, 0.5)]]);
  ctx.lineWidth = 3.4; ctx.lineCap = "round"; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -25); ctx.lineTo(-2, 0); ctx.lineTo(0, 25);
  ctx.strokeStyle = "rgba(240,232,214,0.85)"; ctx.lineWidth = 1; ctx.stroke();
  stroke(ctx, [[-11, 0], [12, 0]], k.trim, 1.5);
  plate(ctx, [[12, 0], [7, -2.4], [7, 2.4]], MAT.steel, { hi: MAT.steelHi, rimA: 0.3 });
  ctx.restore();
}

function quiver(ctx: Ctx, k: TribeKit, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(0.34);
  plate(ctx, [[-4.4, -13], [4.4, -13], [3.8, 13], [-3.8, 13]], MAT.leather, { hi: MAT.leatherHi, spec: true, specA: 0.2 });
  plate(ctx, [[-4.6, -13], [4.6, -13], [4.6, -9.6], [-4.6, -9.6]], k.metal, { hi: k.metalHi });
  for (let i = -1; i <= 1; i++) {
    stroke(ctx, [[i * 2.6, -12], [i * 2.6 - 1, -22]], MAT.wood, 1.2);
    plate(ctx, [[i * 2.6 - 1, -22], [i * 2.6 + 1.6, -19.4], [i * 2.6 - 2.6, -19]], k.trim, { rimA: 0.25 });
  }
  ctx.restore();
}

/* ───────────── the mount ───────────── */
function horse(ctx: Ctx, k: TribeKit, opts: { barded?: boolean } = {}): void {
  const coat = opts.barded ? "#5b5f68" : mix(MAT.leather, "#3a2a1c", 0.35);
  // far legs
  limb(ctx, [-16, -34], [-20, -19], 4.6, 3.4, dk(coat, 0.4));
  limb(ctx, [-20, -19], [-19, -1.5], 3.2, 2.4, dk(coat, 0.5));
  limb(ctx, [14, -34], [19, -19], 4.6, 3.4, dk(coat, 0.4));
  limb(ctx, [19, -19], [20, -1.5], 3.2, 2.4, dk(coat, 0.5));
  ao(ctx, 0, -1.5, 26, 0.3);
  // barrel
  ctx.beginPath();
  ctx.moveTo(-22, -36);
  ctx.quadraticCurveTo(0, -47, 22, -37);
  ctx.quadraticCurveTo(28, -30, 20, -24);
  ctx.quadraticCurveTo(0, -18, -20, -25);
  ctx.quadraticCurveTo(-27, -30, -22, -36);
  ctx.closePath();
  ctx.fillStyle = RG(ctx, -8, -42, 42, [[0, lt(coat, 0.42)], [0.45, coat], [1, dk(coat, 0.55)]]);
  ctx.fill();
  ctx.strokeStyle = alpha(dk(coat, 0.7), 0.5); ctx.lineWidth = 1; ctx.stroke();
  // near legs
  limb(ctx, [-12, -33], [-15, -18], 5.2, 3.8, coat);
  limb(ctx, [-15, -18], [-14, -1.5], 3.6, 2.6, dk(coat, 0.25));
  limb(ctx, [11, -33], [15, -18], 5.2, 3.8, coat);
  limb(ctx, [15, -18], [16, -1.5], 3.6, 2.6, dk(coat, 0.25));
  // hooves
  ([[-14, -1.5], [16, -1.5], [-19, -1.5], [20, -1.5]] as Pt[]).forEach((p) => plate(ctx, [[p[0] - 3.4, p[1] - 2.5], [p[0] + 3.4, p[1] - 2.5], [p[0] + 3.8, p[1] + 1.5], [p[0] - 3.8, p[1] + 1.5]], "#3a332c", { hi: "#6c6157" }));
  // neck + head
  limb(ctx, [17, -40], [30, -55], 8.6, 5.4, coat);
  plate(ctx, [[27, -58], [39, -62], [41, -56], [30, -51]], coat, { hi: lt(coat, 0.4), lo: dk(coat, 0.5) });
  orb(ctx, 30, -56, 5.4, 5, coat, { hi: lt(coat, 0.45) });
  plate(ctx, [[28, -61], [30, -67], [32.5, -60]], dk(coat, 0.3), { rimA: 0.3 }); // ear
  orb(ctx, 34, -57.5, 1.2, 1.2, "#16110d", { rim: false });
  // mane + tail
  for (let i = 0; i < 5; i++) stroke(ctx, [[19 + i * 2.4, -44 - i * 2.4], [13 + i * 2.4, -52 - i * 2.6]], alpha(k.trim, 0.8), 2.2);
  ctx.beginPath();
  ctx.moveTo(-22, -34);
  ctx.quadraticCurveTo(-34, -30, -33, -8);
  ctx.strokeStyle = G(ctx, -22, -34, -33, -8, [[0, lt(coat, 0.2)], [1, dk(coat, 0.5)]]);
  ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.stroke();

  if (opts.barded) {
    cloth(ctx, [[-22, -38], [14, -40], [11, -16], [-19, -13]], k.armor, 3);
    ctx.save();
    ctx.translate(-4, -28); ctx.scale(0.9, 0.9);
    k.crest(ctx, k.trim);
    ctx.restore();
    // chamfron
    plate(ctx, [[27, -59], [39, -62.5], [41, -56.5], [30, -52]], k.metal, { hi: k.metalHi, spec: true, specA: 0.6 });
    plate(ctx, [[29, -62], [31, -74], [34, -60]], k.trim, { rimA: 0.35 });
    plate(ctx, [[15, -44], [26, -48], [27, -40], [17, -37]], k.metal, { hi: k.metalHi, spec: true });
  } else {
    plate(ctx, [[-18, -38], [8, -40], [7, -32], [-16, -31]], k.cloth, { rimA: 0.3 }); // saddle blanket
  }
  plate(ctx, [[-9, -40], [7, -41], [6, -35], [-8, -34]], MAT.leather, { hi: MAT.leatherHi, spec: true, specA: 0.25 }); // saddle
  stroke(ctx, [[24, -52], [33, -56]], MAT.leather, 1.4); // rein
}

/* ───────────── unit builds ───────────── */
/** The column of thin air an aircraft hangs in, down to the ground below it. */
function aloft(ctx: Ctx, top: number): void {
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(0, -4 - i * 6, 13 - i * 3.5, 4 - i, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(190,208,224,${0.22 - i * 0.06})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  stroke(ctx, [[0, -10], [0, top]], "rgba(190,208,224,0.16)", 2);
}

const BUILD: Record<ArtUnitType, (ctx: Ctx, k: TribeKit) => void> = {
  warrior(ctx, k) {
    groundShadow(ctx, 30, 11);
    spear(ctx, k, 20, -66, 0.16, 108);
    const b = body(ctx, k, { cape: false });
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [-19, -60], [-17, -70], b.bulk, { bracer: true });
    ctx.save(); ctx.translate(-22, -56); ctx.scale(0.92, 0.92); k.shield(ctx, k); ctx.restore();
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [19, -66], [18, -74], b.bulk, { bracer: true });
    k.accent(ctx, -34, -78);
  },

  defender(ctx, k) {
    groundShadow(ctx, 34, 12);
    const b = body(ctx, k, { bulk: 1.16, plated: true });
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [20, -58], [20, -70], b.bulk, { bracer: true });
    sword(ctx, k, 21, -58, 0.35, 26, 5.5);
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [-18, -58], [-16, -70], b.bulk, { bracer: true });
    ctx.save(); ctx.translate(-24, -52); ctx.scale(1.22, 1.22); k.shield(ctx, k); ctx.restore();
    k.accent(ctx, 34, -82);
  },

  swordsman(ctx, k) {
    groundShadow(ctx, 31, 11);
    const b = body(ctx, k, { bulk: 1.06, plated: true, cape: true });
    // mail skirt
    cloth(ctx, [[-b.shW * 0.8, -b.hip - 1], [b.shW * 0.8, -b.hip - 1], [b.shW * 0.66, -b.hip + 13], [-b.shW * 0.66, -b.hip + 13]], k.metal, 3);
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [-4, -74], [-14, -70], b.bulk, { bracer: true });
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [2, -78], [16, -72], b.bulk, { bracer: true });
    sword(ctx, k, 0, -77, -0.42, 52, 7);
    k.accent(ctx, -34, -86);
  },

  archer(ctx, k) {
    groundShadow(ctx, 27, 10);
    const b = body(ctx, k, { bulk: 0.9, cape: true });
    quiver(ctx, k, -16, -68);
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [10, -74], [-4, -72], b.bulk * 0.95, { bracer: true });
    bowWeapon(ctx, k, 22, -72);
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [22, -72], [20, -64], b.bulk * 0.95, { bracer: true });
    k.accent(ctx, 36, -88);
  },

  rider(ctx, k) {
    groundShadow(ctx, 40, 12);
    horse(ctx, k, { barded: false });
    ctx.save();
    ctx.translate(-4, -38);
    ctx.scale(0.86, 0.86);
    const b = body(ctx, k, { bulk: 0.94, crouch: 46, seated: true, cape: true });
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [22, -30], [20, -38], b.bulk, { bracer: true });
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [-16, -28], [-16, -36], b.bulk, { bracer: true });
    ctx.restore();
    spear(ctx, k, 14, -66, 0.2, 96);
    k.accent(ctx, -44, -84);
  },

  knight(ctx, k) {
    groundShadow(ctx, 46, 13);
    horse(ctx, k, { barded: true });
    ctx.save();
    ctx.translate(-6, -40);
    ctx.scale(0.9, 0.9);
    const b = body(ctx, k, { bulk: 1.02, crouch: 46, seated: true, plated: true, cape: true });
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [-14, -28], [-15, -36], b.bulk, { bracer: true });
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [18, -30], [18, -38], b.bulk, { bracer: true });
    ctx.restore();
    // couched lance
    ctx.save();
    ctx.translate(8, -70);
    ctx.rotate(-0.2);
    haftStyle(ctx, k, [-26, 6], [40, -6], 2.8);
    plate(ctx, [[40, -6], [58, -10], [40, -12]], MAT.steel, { hi: MAT.steelHi, lo: MAT.steelLo, spec: true });
    plate(ctx, [[-22, 4], [-14, 10], [-14, -2]], k.metal, { hi: k.metalHi, spec: true }); // vamplate
    cloth(ctx, [[10, -3], [26, -6], [24, 3], [9, 4]], k.cloth, 2);
    ctx.restore();
    k.accent(ctx, -50, -92);
  },

  catapult(ctx, k) {
    groundShadow(ctx, 48, 14);
    // frame
    wood(ctx, [[-40, -14], [40, -14], [36, -25], [-36, -25]]);
    wood(ctx, [[-30, -22], [-22, -22], [-4, -62], [-11, -64]]);
    wood(ctx, [[26, -22], [34, -22], [12, -64], [4, -62]]);
    wood(ctx, [[-18, -40], [18, -40], [18, -46], [-18, -46]]);
    // iron bands
    ([[-26, -22], [30, -22]] as Pt[]).forEach((p) => plate(ctx, [[p[0] - 5, p[1] - 3], [p[0] + 5, p[1] - 3], [p[0] + 5, p[1] + 2], [p[0] - 5, p[1] + 2]], MAT.iron, { hi: MAT.ironHi, spec: true }));
    // torsion bundle
    orb(ctx, -3, -36, 11, 8, MAT.rope, { hi: "#f0e0bd", lo: "#8a7248" });
    for (let i = -3; i <= 3; i++) stroke(ctx, [[-3 + i * 2.6, -44], [-3 + i * 2.6, -28]], "rgba(90,70,40,0.35)", 1.4);
    // throwing arm
    ctx.save();
    ctx.translate(-3, -58);
    ctx.rotate(-0.55);
    wood(ctx, [[-4, 6], [4, 6], [3, -62], [-3, -62]]);
    ctx.translate(0, -62);
    if (k.weapon === "notched") { orb(ctx, 0, 0, 9, 9, "#4e4340", { hi: "#8b7a6e" }); orb(ctx, -1, -1, 4, 4, "#ff9a3c", { rim: false }); }
    else if (k.weapon === "hook") { orb(ctx, 0, 0, 9, 9, "#3d6b7f", { hi: "#9fd3e4" }); spec(ctx, -3, -3, 3, 3, 0, 0.8); }
    else if (k.weapon === "straight") { orb(ctx, 0, 0, 9, 9, k.metal, { hi: k.metalHi, lo: dk(k.metal, 0.6) }); spec(ctx, -3, -3, 3.4, 3, 0, 0.8); }
    else { orb(ctx, 0, 0, 9.5, 9.5, "#6f7a63", { hi: "#adbaa0" }); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; stroke(ctx, [[Math.cos(a) * 7, Math.sin(a) * 7], [Math.cos(a) * 13, Math.sin(a) * 13]], k.trim, 1.8); } }
    ctx.restore();
    // banner mast
    wood(ctx, [[28, -24], [32, -24], [32, -74], [28, -74]]);
    cloth(ctx, [[32, -74], [56, -66], [32, -52]], k.armor, 3);
    ctx.save(); ctx.translate(40, -64); ctx.scale(0.8, 0.8); k.crest(ctx, k.trim); ctx.restore();
    // wheels
    ([[-26, -12], [26, -12]] as Pt[]).forEach((p) => {
      orb(ctx, p[0], p[1], 13, 13, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; stroke(ctx, [[p[0] - Math.cos(a) * 11, p[1] - Math.sin(a) * 11], [p[0] + Math.cos(a) * 11, p[1] + Math.sin(a) * 11]], "rgba(60,40,22,0.5)", 1.8); }
      orb(ctx, p[0], p[1], 3.6, 3.6, MAT.iron, { hi: MAT.ironHi });
    });
    // crew
    ctx.save();
    ctx.translate(-52, 0); ctx.scale(0.72, 0.72);
    const b = body(ctx, k, { bulk: 0.92 });
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [18, -52], [17, -64], b.bulk, {});
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [-16, -54], [-16, -66], b.bulk, {});
    ctx.restore();
    k.accent(ctx, 58, -92);
  },

  missile(ctx, k) {
    groundShadow(ctx, 48, 14);
    // chassis
    wood(ctx, [[-40, -14], [40, -14], [36, -25], [-36, -25]]);
    ([[-26, -22], [30, -22]] as Pt[]).forEach((p) => plate(ctx, [[p[0] - 5, p[1] - 3], [p[0] + 5, p[1] - 3], [p[0] + 5, p[1] + 2], [p[0] - 5, p[1] + 2]], MAT.iron, { hi: MAT.ironHi, spec: true }));
    // rear support strut holding the rail's elevation
    wood(ctx, [[8, -24], [16, -24], [30, -52], [23, -55]]);
    // launch rail angled skyward, missile riding it
    ctx.save();
    ctx.translate(-14, -26);
    ctx.rotate(-0.9);
    wood(ctx, [[-8, 10], [74, 10], [74, 4], [-8, 4]]);
    plate(ctx, [[-6, 4], [78, 4], [78, 0], [-6, 0]], MAT.iron, { hi: MAT.ironHi, spec: true });
    // missile body
    plate(ctx, [[2, -3], [58, -3], [58, -15], [2, -15]], MAT.steel, { hi: MAT.steelHi, lo: MAT.steelLo, spec: true, specA: 0.7 });
    // tail fins
    plate(ctx, [[2, -3], [-8, 7], [12, -3]], k.metal, { hi: k.metalHi, spec: true });
    plate(ctx, [[2, -15], [-8, -25], [12, -15]], k.metal, { hi: k.metalHi, spec: true });
    // nose cone, styled per weapon family like the catapult's payload
    if (k.weapon === "notched") { plate(ctx, [[58, -3], [76, -9], [58, -15]], "#4e4340", { hi: "#8b7a6e" }); orb(ctx, 61, -9, 3.4, 3.4, "#ff9a3c", { rim: false }); }
    else if (k.weapon === "hook") { plate(ctx, [[58, -3], [76, -9], [58, -15]], "#3d6b7f", { hi: "#9fd3e4" }); spec(ctx, 62, -12, 3, 3, 0, 0.8); }
    else if (k.weapon === "straight") { plate(ctx, [[58, -3], [76, -9], [58, -15]], k.metal, { hi: k.metalHi, lo: dk(k.metal, 0.6) }); spec(ctx, 62, -12, 3.4, 3, 0, 0.8); }
    else { plate(ctx, [[58, -3], [76, -9], [58, -15]], "#6f7a63", { hi: "#adbaa0" }); for (let i = 0; i < 3; i++) stroke(ctx, [[60 + i * 5, -3], [60 + i * 5, -15]], k.trim, 1.6); }
    // band with the tribe's trim around the body
    plate(ctx, [[34, -3], [39, -3], [39, -15], [34, -15]], k.trim, { rimA: 0.35 });
    ctx.restore();
    // banner mast
    wood(ctx, [[28, -24], [32, -24], [32, -74], [28, -74]]);
    cloth(ctx, [[32, -74], [56, -66], [32, -52]], k.armor, 3);
    ctx.save(); ctx.translate(40, -64); ctx.scale(0.8, 0.8); k.crest(ctx, k.trim); ctx.restore();
    // wheels
    ([[-26, -12], [26, -12]] as Pt[]).forEach((p) => {
      orb(ctx, p[0], p[1], 13, 13, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; stroke(ctx, [[p[0] - Math.cos(a) * 11, p[1] - Math.sin(a) * 11], [p[0] + Math.cos(a) * 11, p[1] + Math.sin(a) * 11]], "rgba(60,40,22,0.5)", 1.8); }
      orb(ctx, p[0], p[1], 3.6, 3.6, MAT.iron, { hi: MAT.ironHi });
    });
    // crew
    ctx.save();
    ctx.translate(-52, 0); ctx.scale(0.72, 0.72);
    const b = body(ctx, k, { bulk: 0.92 });
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [18, -52], [17, -64], b.bulk, {});
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [-16, -54], [-16, -66], b.bulk, {});
    ctx.restore();
    k.accent(ctx, 58, -96);
  },

  giant(ctx, k) {
    groundShadow(ctx, 52, 16);
    ctx.save();
    ctx.scale(1.55, 1.55);
    const b = body(ctx, k, { bulk: 1.5, plated: true });
    arm(ctx, k, [-b.shW - 2, -b.sh + 5], [-26, -46], [-24, -62], b.bulk * 0.95, {});
    arm(ctx, k, [b.shW + 2, -b.sh + 5], [26, -50], [26, -64], b.bulk * 0.95, {});
    ctx.restore();
    // maul
    ctx.save();
    ctx.translate(48, -80);
    ctx.rotate(0.22);
    haftStyle(ctx, k, [0, 46], [0, -22], 4.2);
    if (k.weapon === "notched") { plate(ctx, [[-16, -22], [16, -22], [13, -48], [-13, -48]], "#5c524e", { hi: "#9c8d85", lo: "#241d1a", spec: true }); stroke(ctx, [[-9, -35], [9, -35]], "rgba(255,150,60,0.8)", 2.2); }
    else if (k.weapon === "hook") { plate(ctx, [[-15, -24], [15, -24], [7, -52], [-7, -50]], "#4f7284", { hi: "#b7dbe8", lo: "#1e3742", spec: true }); stroke(ctx, [[11, -28], [24, -40]], MAT.steelLo, 3); }
    else if (k.weapon === "straight") { plate(ctx, [[-15, -22], [15, -22], [15, -50], [-15, -50]], k.metal, { hi: k.metalHi, lo: dk(k.metal, 0.6), spec: true, specA: 0.8 }); orb(ctx, 0, -36, 5, 5, k.trim, { hi: "#fffaf0" }); }
    else { orb(ctx, 0, -36, 17, 19, "#71786a", { hi: "#b3bda9", lo: "#2f342c" }); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; stroke(ctx, [[Math.cos(a) * 13, -36 + Math.sin(a) * 15], [Math.cos(a) * 23, -36 + Math.sin(a) * 26]], k.trim, 2.4); } }
    ctx.restore();
    k.accent(ctx, -58, -118);
  },

  raft(ctx, k) {
    groundShadow(ctx, 42, 12);
    wood(ctx, [[-38, -12], [38, -12], [38, -2], [-38, -2]]);
    for (let i = -2; i <= 2; i++) stroke(ctx, [[i * 15, -12], [i * 15, -2]], "rgba(40,26,14,0.45)", 1.4);
    plate(ctx, [[-38, -8.6], [38, -8.6], [38, -6.2], [-38, -6.2]], MAT.rope, { hi: "#efe0be", rimA: 0.25 });
    ctx.save();
    ctx.translate(-2, -12); ctx.scale(0.8, 0.8);
    const b = body(ctx, k, { bulk: 0.94 });
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [22, -60], [20, -70], b.bulk, {});
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [-16, -56], [-16, -68], b.bulk, {});
    ctx.restore();
    haftStyle(ctx, k, [24, -4], [34, -74], 2.2);
    water(ctx);
  },

  ship(ctx, k) {
    groundShadow(ctx, 50, 14);
    ctx.beginPath();
    ctx.moveTo(-48, -16);
    ctx.quadraticCurveTo(0, 14, 48, -16);
    ctx.lineTo(42, -30);
    ctx.lineTo(-42, -30);
    ctx.closePath();
    ctx.fillStyle = G(ctx, 0, -30, 0, 4, [[0, MAT.woodHi], [0.4, MAT.wood], [1, MAT.woodLo]]);
    ctx.fill();
    ctx.strokeStyle = "rgba(40,26,14,0.55)"; ctx.lineWidth = 1.1; ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-46 + i, -22 + i * 4);
      ctx.quadraticCurveTo(0, 6 + i * 3, 46 - i, -22 + i * 4);
      ctx.strokeStyle = "rgba(40,26,14,0.28)"; ctx.lineWidth = 1; ctx.stroke();
    }
    plate(ctx, [[-42, -34], [42, -34], [42, -29], [-42, -29]], k.armor, { spec: true, specA: 0.25 });
    plate(ctx, [[42, -30], [56, -44], [46, -14]], MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo }); // prow
    wood(ctx, [[-3, -34], [3, -34], [3, -96], [-3, -96]]); // mast
    ctx.beginPath();
    ctx.moveTo(2, -94);
    ctx.quadraticCurveTo(46, -70, 4, -38);
    ctx.closePath();
    ctx.fillStyle = G(ctx, 2, -94, 30, -40, [[0, lt(k.armor, 0.55)], [0.55, lt(k.armor, 0.3)], [1, dk(k.armor, 0.2)]]);
    ctx.fill();
    ctx.strokeStyle = alpha(dk(k.armor, 0.6), 0.5); ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.moveTo(2, -94); ctx.quadraticCurveTo(46, -70, 4, -38); ctx.closePath(); ctx.clip();
    for (let i = 0; i < 3; i++) stroke(ctx, [[6 + i * 9, -92], [6 + i * 7, -38]], "rgba(20,14,10,0.14)", 3);
    ctx.restore();
    ctx.save(); ctx.translate(20, -68); ctx.scale(1.5, 1.5); k.crest(ctx, dk(k.armor, 0.45)); ctx.restore();
    ctx.save();
    ctx.translate(-22, -30); ctx.scale(0.72, 0.72);
    const b = body(ctx, k, { bulk: 0.94 });
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [20, -58], [19, -70], b.bulk, {});
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [-16, -56], [-16, -68], b.bulk, {});
    ctx.restore();
    water(ctx);
  },

  /* medic: no weapon at all — a satchel of dressings and a herb-bundle staff */
  medic(ctx, k) {
    groundShadow(ctx, 27, 10);
    const b = body(ctx, k, { bulk: 0.9, cape: true });
    // satchel on a shoulder strap, the healer's pale sprig stitched to the flap
    stroke(ctx, [[-9, -76], [12, -50]], MAT.leather, 3.4);
    plate(ctx, [[9, -56], [23, -56], [23, -42], [9, -42]], MAT.leather, { hi: MAT.leatherHi, lo: "#2e1d10", rimA: 0.4 });
    plate(ctx, [[9, -56], [23, -56], [23, -51], [9, -51]], dk(MAT.leather, 0.25), { hi: MAT.leatherHi, rimA: 0.3 });
    stroke(ctx, [[16, -50], [16, -44]], "#e6f0dc", 1.6);
    stroke(ctx, [[16, -47], [12, -45]], "#e6f0dc", 1.4);
    stroke(ctx, [[16, -47], [20, -45]], "#e6f0dc", 1.4);
    // rolled bandages tucked into the belt
    ([[-13, -50], [-18, -46]] as Pt[]).forEach(([x, y]) => {
      orb(ctx, x, y, 3.4, 3, "#e8e2d4", { hi: "#ffffff", lo: "#9a9285" });
      stroke(ctx, [[x - 2.6, y], [x + 2.6, y - 0.6]], "rgba(120,112,100,0.5)", 0.9);
    });
    arm(ctx, k, [b.shW + 1, -b.sh + 4], [19, -60], [19, -72], b.bulk, { bracer: true });
    arm(ctx, k, [-b.shW - 1, -b.sh + 4], [-18, -66], [-17, -74], b.bulk, { bracer: true });
    // staff, hung with a lantern and a bundle of drying herbs
    limb(ctx, [-19, -4], [-19, -96], 1.5, 1.2, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    stroke(ctx, [[-19, -92], [-9, -90]], MAT.woodLo, 1.2);
    plate(ctx, [[-13, -90], [-5, -90], [-5, -80], [-13, -80]], dk(k.metal, 0.1), { hi: k.metalHi, lo: "#20232a", rimA: 0.4 });
    ctx.fillStyle = RG(ctx, -9, -85, 12, [[0, "rgba(255,226,160,0.85)"], [0.5, "rgba(255,196,110,0.3)"], [1, "rgba(255,196,110,0)"]]);
    ctx.beginPath();
    ctx.ellipse(-9, -85, 12, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,230,170,0.9)";
    ctx.fillRect(-11.6, -88.4, 5.2, 6.8);
    for (let i = 0; i < 4; i++) {
      const a = -0.4 - i * 0.34;
      stroke(ctx, [[-19, -70], [-19 + Math.cos(a) * 11, -70 + Math.sin(a) * 12]], "#7fa262", 1.5);
    }
    k.accent(ctx, 32, -84);
  },

  /* scout plane: high-wing monoplane loitering over the tile it is watching */
  scout_plane(ctx, k) {
    groundShadow(ctx, 26, 9);
    aloft(ctx, -30);
    const cy = -74;
    // tailplane and fin first, so the fuselage overlaps them
    plate(ctx, [[-50, cy + 3], [-26, cy + 2], [-26, cy - 2], [-50, cy - 2]], "#b9c1c9", { hi: MAT.steelHi, lo: MAT.steelLo, rimA: 0.4 });
    plate(ctx, [[-46, cy - 1], [-40, cy - 24], [-30, cy - 24], [-28, cy - 1]], k.color, { hi: lt(k.color, 0.45), lo: dk(k.color, 0.5), rimA: 0.4 });
    // fuselage
    plate(
      ctx,
      [[-48, cy + 2], [-30, cy + 7], [20, cy + 8], [36, cy + 2], [36, cy - 4], [18, cy - 9], [-30, cy - 6], [-48, cy - 2]],
      "#d5dbe2",
      { hi: "#ffffff", lo: "#6a7178", rimA: 0.45, spec: true, specA: 0.5 },
    );
    // glazed observation canopy: this aircraft is all eyes
    plate(ctx, [[2, cy - 8], [20, cy - 8], [16, cy - 18], [0, cy - 18]], "#2b4c66", { hi: "#a9dcf2", lo: "#12283a", rimA: 0.35, spec: true, specA: 0.8 });
    spec(ctx, 8, cy - 15, 5, 2.6, -0.2, 0.65);
    // high wing on its struts
    stroke(ctx, [[-4, cy - 7], [-8, cy - 18]], "#7d858e", 1.6);
    stroke(ctx, [[14, cy - 8], [12, cy - 18]], "#7d858e", 1.6);
    plate(ctx, [[-26, cy - 18], [30, cy - 20], [30, cy - 14], [-26, cy - 13]], "#e2e7ec", { hi: "#ffffff", lo: "#79818a", rimA: 0.4, horiz: true });
    plate(ctx, [[16, cy - 19], [30, cy - 20], [30, cy - 14], [16, cy - 14]], k.color, { hi: lt(k.color, 0.4), lo: dk(k.color, 0.5), rimA: 0.3 });
    // tribe roundel on the flank
    orb(ctx, -14, cy, 5, 5, k.color, { hi: lt(k.color, 0.5), lo: dk(k.color, 0.5) });
    orb(ctx, -14, cy, 2.2, 2.2, "#f6f2e6", { rim: false });
    // nose, engine cowl and the disc of the turning propeller
    plate(ctx, [[36, cy + 2], [42, cy], [42, cy - 3], [36, cy - 4]], dk(k.metal, 0.1), { hi: k.metalHi, lo: "#20232d", rimA: 0.4, spec: true });
    ctx.fillStyle = "rgba(216,226,236,0.32)";
    ctx.beginPath();
    ctx.ellipse(44, cy - 1, 3, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx, [[44, cy - 17], [44, cy + 15]], "rgba(150,166,182,0.5)", 1.4);
    // fixed undercarriage
    stroke(ctx, [[2, cy + 8], [-2, cy + 18]], "#7d858e", 1.8);
    stroke(ctx, [[16, cy + 8], [18, cy + 18]], "#7d858e", 1.8);
    orb(ctx, -2, cy + 19, 3.4, 3.4, "#2a2724", { hi: "#5c5651" });
    orb(ctx, 18, cy + 19, 3.4, 3.4, "#2a2724", { hi: "#5c5651" });
    k.accent(ctx, 40, cy - 30);
  },

  /* bomber: twin engines, bay doors open, one bomb already on its way down */
  bomber(ctx, k) {
    groundShadow(ctx, 34, 12);
    aloft(ctx, -26);
    const cy = -80;
    plate(ctx, [[-56, cy + 4], [-28, cy + 3], [-28, cy - 3], [-56, cy - 3]], "#b9c1c9", { hi: MAT.steelHi, lo: MAT.steelLo, rimA: 0.4 });
    plate(ctx, [[-52, cy - 2], [-46, cy - 28], [-34, cy - 28], [-30, cy - 2]], k.color, { hi: lt(k.color, 0.45), lo: dk(k.color, 0.5), rimA: 0.4 });
    // heavy fuselage, deeper in the belly than the scout's
    plate(
      ctx,
      [[-54, cy + 2], [-32, cy + 11], [22, cy + 12], [42, cy + 3], [42, cy - 6], [20, cy - 12], [-32, cy - 8], [-54, cy - 2]],
      "#4f5a63",
      { hi: "#9aa8b4", lo: "#232a30", rimA: 0.45, spec: true, specA: 0.35 },
    );
    plate(ctx, [[6, cy - 11], [22, cy - 11], [18, cy - 20], [4, cy - 20]], "#22384a", { hi: "#8cc4de", lo: "#0f1e2a", rimA: 0.35, spec: true, specA: 0.7 });
    // low wing carrying both engine nacelles
    plate(ctx, [[-34, cy - 4], [34, cy - 6], [34, cy + 1], [-34, cy + 3]], "#5c6873", { hi: "#a2b0bc", lo: "#262d33", rimA: 0.4, horiz: true });
    ([-12, 14] as number[]).forEach((ex) => {
      plate(ctx, [[ex - 9, cy - 8], [ex + 9, cy - 8], [ex + 11, cy + 1], [ex - 9, cy + 1]], dk(k.metal, 0.05), { hi: k.metalHi, lo: "#20232d", rimA: 0.4, spec: true });
      ctx.fillStyle = "rgba(216,226,236,0.3)";
      ctx.beginPath();
      ctx.ellipse(ex + 13, cy - 4, 2.6, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // open bomb bay and the bomb falling out of it
    plate(ctx, [[-6, cy + 11], [10, cy + 11], [10, cy + 14], [-6, cy + 14]], "#161c21", { hi: "#39434c", lo: "#0a0d10", rimA: 0.3 });
    stroke(ctx, [[-6, cy + 14], [-12, cy + 20]], "#5c6873", 1.6);
    stroke(ctx, [[10, cy + 14], [16, cy + 20]], "#5c6873", 1.6);
    orb(ctx, 2, cy + 26, 4, 7.5, "#3f4753", { hi: "#8d97a4", lo: "#1a1e25" });
    plate(ctx, [[-1.5, cy + 32], [5.5, cy + 32], [4, cy + 38], [0, cy + 38]], k.color, { hi: lt(k.color, 0.4), lo: dk(k.color, 0.5), rimA: 0.3 });
    orb(ctx, -22, cy, 5, 5, k.color, { hi: lt(k.color, 0.5), lo: dk(k.color, 0.5) });
    orb(ctx, -22, cy, 2.2, 2.2, "#f6f2e6", { rim: false });
    k.accent(ctx, 46, cy - 32);
  },
};

function water(ctx: Ctx): void {
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-50 - i * 8, 2 + i * 6);
    ctx.quadraticCurveTo(0, 14 + i * 6, 50 + i * 8, 2 + i * 6);
    ctx.strokeStyle = "rgba(232,246,252," + (0.7 - i * 0.2) + ")";
    ctx.lineWidth = 2.4 - i * 0.5;
    ctx.stroke();
  }
}

/* ───────────── public entry ───────────── */

/** Crown heights per type, used to place the veteran star and HP bar. */
export const TOPS: Record<ArtUnitType, number> = {
  warrior: -138, defender: -138, swordsman: -142, archer: -134,
  rider: -124, knight: -132, catapult: -132, missile: -140, giant: -200, raft: -122, ship: -114,
  medic: -140, scout_plane: -116, bomber: -122,
};

/** Figures are authored 100 units tall; this fits them to the tile scale. */
export const FIT = 0.55;

/** Rough authored half-widths (weapon tips and accents included), for previews. */
const HALF_WIDTHS: Record<ArtUnitType, number> = {
  warrior: 42, defender: 56, swordsman: 42, archer: 56,
  rider: 52, knight: 70, catapult: 76, missile: 76, giant: 72, raft: 68, ship: 78,
  medic: 46, scout_plane: 52, bomber: 62,
};

/** Largest scale that keeps a figure of this type inside a w x h box. */
export function fitScale(type: ArtUnitType, w: number, h: number): number {
  const top = Math.abs(TOPS[type] ?? -104);
  const halfWidth = HALF_WIDTHS[type] ?? 50;
  return Math.min(h / (top * FIT), w / (halfWidth * 2 * FIT));
}

export function drawCharacter(ctx: Ctx, opts: DrawCharacterOpts): void {
  const scale = (opts.scale == null ? 1 : opts.scale) * FIT;
  const x = opts.x || 0, y = opts.y || 0;

  const sprite = spriteFor(opts, scale, resolutionOf(ctx));
  if (sprite) {
    const box = boxFor(opts.type);
    ctx.drawImage(sprite, x - box.ox * scale, y - box.oy * scale, box.w * scale, box.h * scale);
  } else {
    // No canvas to rasterize into (non-browser host): draw straight to the target.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    paintFigure(ctx, opts, 0, 0);
    if (opts.acted) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(18,24,34,0.45)";
      ctx.fillRect(-200, -300, 400, 340);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }

  // The bar is left out of the cached sprite: it varies continuously with
  // damage, and every distinct value would cost its own rasterization.
  if (opts.hpFrac != null && opts.hpFrac < 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const top = TOPS[opts.type] || -104;
    const w = 48, h = 8;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(-w / 2, top - 12, w, h);
    ctx.fillStyle = opts.hpFrac > 0.5 ? "#5cd65c" : opts.hpFrac > 0.25 ? "#e8c14d" : "#e5533d";
    ctx.fillRect(-w / 2 + 1, top - 11, (w - 2) * opts.hpFrac, h - 2);
    ctx.restore();
  }
}

/** Authored-space bounds of a figure, with headroom for lean, crest and shadow. */
function boxFor(type: ArtUnitType): { w: number; h: number; ox: number; oy: number } {
  const halfWidth = HALF_WIDTHS[type] ?? 50;
  const top = Math.abs(TOPS[type] ?? -104);
  const pad = 12 + 0.06 * top; // 0.06 covers the widest kit lean
  return { w: (halfWidth + pad) * 2, h: top + pad + 22, ox: halfWidth + pad, oy: top + pad };
}

/** Device pixels per world unit, rounded up to a power of two so that a slow
    zoom crosses only a handful of buckets instead of re-rasterizing per frame. */
function resolutionOf(ctx: Ctx): number {
  const t = ctx.getTransform();
  const dev = Math.hypot(t.a, t.b) || 1;
  return Math.min(4, Math.max(0.5, 2 ** Math.ceil(Math.log2(dev))));
}

/* Figures are deterministic in (tribe, type, veteran, acted, scale, resolution),
   so each is rasterized once and blitted thereafter — redrawing dozens of
   gradient-shaded figures every frame is otherwise the renderer's hot spot.
   Rasterizing also gives acted units their dim for free: tinting with
   source-atop inside the sprite touches the figure's own pixels only, where
   tinting on the map context would darken the terrain beneath it. */
const spriteCache = new Map<string, HTMLCanvasElement>();
const CACHE_LIMIT = 96;

function spriteFor(opts: DrawCharacterOpts, scale: number, res: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = `${opts.tribe}|${opts.type}|${opts.veteran ? 1 : 0}|${opts.acted ? 1 : 0}|${scale.toFixed(3)}|${res}`;
  const hit = spriteCache.get(key);
  if (hit) {
    // Re-insert so eviction is least-recently-used: plain insertion order can
    // drop a sprite that is on screen every frame.
    spriteCache.delete(key);
    spriteCache.set(key, hit);
    return hit;
  }

  const box = boxFor(opts.type);
  const px = scale * res;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(box.w * px));
  canvas.height = Math.max(1, Math.ceil(box.h * px));
  const c = canvas.getContext("2d");
  if (!c) return null;
  c.scale(px, px);
  paintFigure(c, opts, box.ox, box.oy);
  if (opts.acted) {
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = "rgba(18,24,34,0.45)";
    c.fillRect(0, 0, box.w, box.h);
    c.globalCompositeOperation = "source-over";
  }

  if (spriteCache.size >= CACHE_LIMIT) {
    const oldest = spriteCache.keys().next().value;
    if (oldest !== undefined) spriteCache.delete(oldest);
  }
  spriteCache.set(key, canvas);
  return canvas;
}

/** Draws the figure and its veteran star at authored scale, feet at (px, py). */
function paintFigure(ctx: Ctx, opts: DrawCharacterOpts, px: number, py: number): void {
  const k = kitFor(opts.tribe);
  ctx.save();
  ctx.translate(px, py);
  ctx.lineJoin = "round";
  ctx.save();
  if (k.lean) ctx.transform(1, 0, -k.lean, 1, 0, 0);
  (BUILD[opts.type] ?? BUILD.warrior)(ctx, k);
  ctx.restore();

  if (opts.veteran) {
    const top = TOPS[opts.type] || -104;
    ctx.save();
    ctx.translate(-34, top + 14);
    ctx.fillStyle = G(ctx, 0, -11, 0, 11, [[0, "#fff3c4"], [0.5, "#ffd75e"], [1, "#c08c1c"]]);
    ctx.strokeStyle = "rgba(60,40,6,0.7)"; ctx.lineWidth = 1;
    star(ctx, 0, 0, 11, 5);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function star(ctx: Ctx, cx: number, cy: number, r: number, ri: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 ? ri : r;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/* The shading kit the figures are built from. terrainArt.ts draws the land,
   its props and its buildings with the same primitives, so ground and people
   are lit by one key light and share one material language. */
export { mix, lt, dk, alpha, MAT, G, RG, limb, plate, orb, ao, spec, stroke, cloth, wood };
