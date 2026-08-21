import type { GameState, Tile, Unit } from "../engine/state";
import { idx, cityById, inBounds, isBurning } from "../engine/state";
import { isAir } from "../data/units";
import { tribeById } from "../data/tribes";
import { TILE_W, TILE_H, gridToWorld, worldToGrid, drawOrder } from "./iso";
import { drawCharacter } from "./unitArt";
import {
  diamondPath,
  drawCloud,
  drawProp,
  drawTile,
  isWaterTerrain,
  liftFor,
  propKey,
  variantAt,
  tileBox,
  EDGE_ORDER,
  ALL_LIFTS,
  FOG_BOX,
  FOG_LIFT,
  PROP_BOX,
  type PropKind,
} from "./terrainArt";
import { blit, sprite } from "./spriteCache";
import type { Camera } from "./camera";

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  /** 0..1 progress of the float-up animation */
  t: number;
}

/** A missile in flight from one tile to another; t is 0..1 flight progress. */
export interface MissileFx {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
}

/** A nuclear blast over a tile; t is 0..1 through the whole effect. */
export interface BlastFx {
  x: number;
  y: number;
  t: number;
}

export interface ViewOptions {
  camera: Camera;
  width: number;
  height: number;
  /** whose fog to render */
  viewerId: number;
  explored: number[];
  watched: number[];
  selectedUnitId: number | null;
  reachable: Array<[number, number]>;
  attackableUnitIds: number[];
  hoverTile: [number, number] | null;
  floatingTexts: FloatingText[];
  revealAll: boolean;
  /** world-space offsets per unit id, for move slides and hit flinches */
  unitOffsets?: Map<number, [number, number]>;
  missiles?: MissileFx[];
  blasts?: BlastFx[];
}

/** Fits the 100-unit-tall authored figures onto a 72x36 iso tile. */
const UNIT_ART_SCALE = 0.62;

/** How far above its tile an aircraft is drawn, so it reads as flying over it. */
const AIR_LIFT = 16;

/** Draw order only depends on map size, but the loop runs every frame. */
const drawOrderCache = new Map<number, Array<[number, number]>>();
function cachedDrawOrder(size: number): Array<[number, number]> {
  let order = drawOrderCache.get(size);
  if (!order) {
    order = drawOrder(size);
    drawOrderCache.set(size, order);
  }
  return order;
}

/** City names never change, so their measured plate width can be measured once. */
const nameplateWidths = new Map<string, number>();

export function render(ctx: CanvasRenderingContext2D, state: GameState, view: ViewOptions): void {
  const { camera, width, height } = view;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  const order = cachedDrawOrder(state.size);
  const reachSet = new Set(view.reachable.map(([x, y]) => idx(state, x, y)));
  const attackSet = new Set(view.attackableUnitIds);
  const unitsByTile = new Map<number, Unit>();
  for (const u of state.units) unitsByTile.set(idx(state, u.x, u.y), u);

  // Cull to the visible world rect, padded for art that overhangs its tile
  // (mountains and figures above, nameplates below).
  const halfW = width / (2 * camera.zoom);
  const halfH = height / (2 * camera.zoom);
  const cullMinX = camera.x - halfW - TILE_W;
  const cullMaxX = camera.x + halfW + TILE_W;
  const cullMinY = camera.y - halfH - 96;
  const cullMaxY = camera.y + halfH + TILE_H * 2;
  const offscreen = (wx: number, wy: number): boolean =>
    wx < cullMinX || wx > cullMaxX || wy < cullMinY || wy > cullMaxY;

  /** Where a tile's top face is drawn: its own height, or the flat fog height. */
  const topOf = (x: number, y: number): number => {
    const i = idx(state, x, y);
    const seen = view.revealAll || view.explored[i] === 1;
    const wy = gridToWorld(x, y)[1];
    return wy - (seen ? liftFor(state.tiles[i].terrain, variantAt(x, y)) : FOG_LIFT);
  };

  // Pass 1: tiles
  for (const [x, y] of order) {
    const i = idx(state, x, y);
    const explored = view.revealAll || view.explored[i] === 1;
    const tile = state.tiles[i];
    if (tile.terrain === "void") continue;
    const [wx, wy0] = gridToWorld(x, y);
    if (offscreen(wx, wy0)) continue;
    const wy = topOf(x, y);
    if (!explored) {
      blit(ctx, sprite("fog", FOG_BOX, (c) => drawCloud(c, 0, 0)), wx, wy);
      continue;
    }
    drawTileAt(ctx, state, tile, x, y, wx, wy);
    if (reachSet.has(idx(state, x, y))) {
      diamondPath(ctx, wx, wy);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (view.hoverTile && view.hoverTile[0] === x && view.hoverTile[1] === y) {
      diamondPath(ctx, wx, wy);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Pass 2: units (skip enemies on unwatched tiles)
  for (const [x, y] of order) {
    const i = idx(state, x, y);
    const unit = unitsByTile.get(i);
    if (!unit) continue;
    const visible =
      view.revealAll ||
      unit.ownerId === view.viewerId ||
      (view.explored[i] === 1 && view.watched[i] === 1);
    if (!visible) continue;
    const [wx, wy0] = gridToWorld(x, y);
    if (offscreen(wx, wy0)) continue;
    const wy = topOf(x, y);
    const off = view.unitOffsets?.get(unit.id);
    drawUnit(
      ctx,
      state,
      unit,
      wx + (off ? off[0] : 0),
      wy + (off ? off[1] : 0),
      unit.id === view.selectedUnitId,
      attackSet.has(unit.id),
    );
  }

  // Pass 2b: missiles in flight, above the units they fly over
  for (const m of view.missiles ?? []) {
    drawMissileFx(ctx, m, gridToWorld(m.fromX, m.fromY)[0], topOf(m.fromX, m.fromY), gridToWorld(m.toX, m.toY)[0], topOf(m.toX, m.toY));
  }

  // Pass 3: city nameplates on top of everything (tiles drawn later would cover them)
  for (const city of state.cities) {
    const i = idx(state, city.x, city.y);
    if (!view.revealAll && view.explored[i] !== 1) continue;
    const [wx, wy0] = gridToWorld(city.x, city.y);
    if (offscreen(wx, wy0)) continue;
    drawNameplate(ctx, state, city, wx, topOf(city.x, city.y));
  }

  // Pass 4: floating combat text
  for (const ft of view.floatingTexts) {
    const wx = gridToWorld(ft.x, ft.y)[0];
    const wy = topOf(ft.x, ft.y);
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = 1 - ft.t;
    ctx.fillText(ft.text, wx, wy - TILE_H - 14 - ft.t * 22);
    ctx.globalAlpha = 1;
  }

  // Pass 5: nuke blasts overdraw everything
  for (const b of view.blasts ?? []) {
    drawBlastFx(ctx, b, gridToWorld(b.x, b.y)[0], topOf(b.x, b.y));
  }

  ctx.restore();
}

/** How high a missile cruises above the tile tops, in world pixels. */
const MISSILE_APEX = 240;

/** Straight up off the launcher, a level cruise, then straight down on the target. */
function drawMissileFx(
  ctx: CanvasRenderingContext2D,
  m: MissileFx,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): void {
  const t = m.t;
  let x: number;
  let y: number;
  let angle: number; // direction of travel
  if (t < 0.35) {
    const k = t / 0.35;
    const eased = 1 - (1 - k) * (1 - k); // launch kick, then settling climb
    x = fx;
    y = fy - MISSILE_APEX * eased;
    angle = -Math.PI / 2;
  } else if (t < 0.65) {
    const k = (t - 0.35) / 0.3;
    x = fx + (tx - fx) * k;
    y = fy + (ty - fy) * k - MISSILE_APEX;
    angle = Math.atan2(ty - fy, tx - fx);
  } else {
    const k = (t - 0.65) / 0.35;
    x = tx;
    y = ty - MISSILE_APEX + MISSILE_APEX * k * k; // gravity takes it
    angle = Math.PI / 2;
  }

  // exhaust / falling smoke behind the capsule
  const burning = t < 0.65;
  for (let i = 1; i <= 3; i++) {
    const back = i * 9;
    const px = x - Math.cos(angle) * back;
    const py = y - Math.sin(angle) * back;
    ctx.beginPath();
    ctx.arc(px, py, 3.4 - i * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = burning
      ? `rgba(255,${200 - i * 40},80,${0.5 - i * 0.13})`
      : `rgba(180,180,180,${0.4 - i * 0.11})`;
    ctx.fill();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2); // capsule is authored nose-up
  // body
  roundRect(ctx, -3.2, -9, 6.4, 14, 3);
  ctx.fillStyle = "#c7d0da";
  ctx.fill();
  ctx.strokeStyle = "#3f4753";
  ctx.lineWidth = 1;
  ctx.stroke();
  // nose
  ctx.beginPath();
  ctx.moveTo(-3.2, -8);
  ctx.lineTo(0, -14);
  ctx.lineTo(3.2, -8);
  ctx.closePath();
  ctx.fillStyle = "#e05a3a";
  ctx.fill();
  // fins
  ctx.beginPath();
  ctx.moveTo(-3.2, 5);
  ctx.lineTo(-7, 9);
  ctx.lineTo(-3.2, 1);
  ctx.moveTo(3.2, 5);
  ctx.lineTo(7, 9);
  ctx.lineTo(3.2, 1);
  ctx.fillStyle = "#8a94a2";
  ctx.fill();
  // engine flame while the motor burns
  if (burning) {
    ctx.beginPath();
    ctx.moveTo(-2.4, 5);
    ctx.quadraticCurveTo(0, 14 + Math.sin(t * 90) * 3, 2.4, 5);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,190,70,0.9)";
    ctx.fill();
  }
  ctx.restore();
}

/** Flash, ground shockwave, then a mushroom column that rises and greys out. */
function drawBlastFx(ctx: CanvasRenderingContext2D, b: BlastFx, wx: number, wy: number): void {
  const t = b.t;
  const fade = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1; // whole effect eases out at the end
  ctx.save();
  ctx.globalAlpha = fade;

  // white flash swallowing the blast area
  if (t < 0.2) {
    const k = t / 0.2;
    const r = TILE_W * (0.6 + 2.6 * k);
    const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
    g.addColorStop(0, `rgba(255,255,240,${0.95 * (1 - k * 0.6)})`);
    g.addColorStop(0.6, `rgba(255,240,180,${0.7 * (1 - k)})`);
    g.addColorStop(1, "rgba(255,220,140,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(wx, wy, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ground shockwave running out through the 3x3 and beyond
  if (t >= 0.05 && t < 0.55) {
    const k = (t - 0.05) / 0.5;
    const r = TILE_W * (0.4 + 3.4 * k);
    ctx.beginPath();
    ctx.ellipse(wx, wy, r, r * (TILE_H / TILE_W), 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,236,190,${0.85 * (1 - k)})`;
    ctx.lineWidth = 5 * (1 - k) + 1;
    ctx.stroke();
  }

  // mushroom: stem climbing, cap swelling, fire cooling into ash grey
  if (t >= 0.12) {
    const k = Math.min(1, (t - 0.12) / 0.7);
    const rise = 150 * k;
    const heat = Math.max(0, 1 - k * 1.4); // orange -> grey
    const mixc = (hot: number[], cold: number[], a: number) =>
      `rgba(${hot.map((h, i) => Math.round(h + (cold[i] - h) * (1 - heat))).join(",")},${a})`;
    const fire = [255, 150, 60];
    const ash = [120, 112, 104];

    // stem
    const stemW = 16 + 10 * k;
    const g = ctx.createLinearGradient(wx, wy, wx, wy - rise);
    g.addColorStop(0, mixc(fire, ash, 0.75));
    g.addColorStop(1, mixc([255, 200, 120], [150, 142, 132], 0.85));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(wx - stemW / 2, wy);
    ctx.quadraticCurveTo(wx - stemW * 0.3, wy - rise * 0.5, wx - stemW * 0.55, wy - rise);
    ctx.lineTo(wx + stemW * 0.55, wy - rise);
    ctx.quadraticCurveTo(wx + stemW * 0.3, wy - rise * 0.5, wx + stemW / 2, wy);
    ctx.closePath();
    ctx.fill();

    // cap: a cluster of billowing orbs
    const capY = wy - rise;
    const capR = 20 + 26 * k;
    const puffs: Array<[number, number, number]> = [
      [0, -6, 1],
      [-0.75, 2, 0.72],
      [0.75, 2, 0.72],
      [-0.4, -8, 0.6],
      [0.4, -8, 0.6],
    ];
    for (const [ox, oy, s] of puffs) {
      const px = wx + ox * capR;
      const py = capY + oy * 0.4 * s;
      const pr = capR * s;
      const rg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.4, pr * 0.1, px, py, pr);
      rg.addColorStop(0, mixc([255, 220, 150], [168, 160, 150], 0.95));
      rg.addColorStop(0.7, mixc(fire, ash, 0.85));
      rg.addColorStop(1, mixc([180, 90, 40], [90, 84, 78], 0.5));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(px, py, pr, pr * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // base ring of dust hugging the ground
    ctx.beginPath();
    ctx.ellipse(wx, wy + 2, TILE_W * (0.7 + 0.5 * k), TILE_H * (0.6 + 0.4 * k), 0, 0, Math.PI * 2);
    ctx.strokeStyle = mixc([220, 170, 110], [110, 104, 98], 0.4 * (1 - k * 0.5));
    ctx.lineWidth = 8 * (1 - k * 0.4);
    ctx.stroke();
  }

  ctx.restore();
}

/** Height of a tile's top face. Fog hides the relief under it, so unexplored
    tiles all sit at one height and give nothing away. */
export function tileLift(state: GameState, x: number, y: number, explored?: number[]): number {
  if (!inBounds(state, x, y)) return 0;
  const i = idx(state, x, y);
  if (explored && explored[i] !== 1) return FOG_LIFT;
  return liftFor(state.tiles[i].terrain, variantAt(x, y));
}

/**
 * World point -> the tile drawn under it.
 *
 * Tile tops stand at their own height, so the flat inverse would pick whatever
 * tile sits under the cursor on the *ground* plane rather than the one the
 * player can see there. Probe every height a top can be drawn at, keep the
 * tiles whose drawn diamond really covers the point, and take the one the
 * painter drew last — that is the one on top.
 */
export function pickTile(
  state: GameState,
  wx: number,
  wy: number,
  explored?: number[],
): [number, number] {
  let best: [number, number] | null = null;
  let bestOrder = -Infinity;
  let seen = 0;
  const tried = new Set<number>();
  for (const probe of ALL_LIFTS) {
    const [gx, gy] = worldToGrid(wx, wy + probe);
    if (!inBounds(state, gx, gy)) continue;
    const key = idx(state, gx, gy);
    if (tried.has(key)) continue;
    tried.add(key);
    seen++;
    const [cx, cy] = gridToWorld(gx, gy);
    const dy = wy - (cy - tileLift(state, gx, gy, explored));
    if (Math.abs(wx - cx) / (TILE_W / 2) + Math.abs(dy) / (TILE_H / 2) > 1) continue;
    const order = gx + gy + gx / (state.size + 1);
    if (order > bestOrder) {
      bestOrder = order;
      best = [gx, gy];
    }
  }
  // Off the board, or over a cliff face rather than any top: the flat inverse
  // is the honest answer, and the caller bounds-checks it anyway.
  return best ?? (seen === 0 ? worldToGrid(wx, wy) : worldToGrid(wx, wy + FOG_LIFT));
}

/** Bit per neighbouring edge that is water — drives the beaches and the foam. */
function waterMaskAt(state: GameState, x: number, y: number): number {
  let mask = 0;
  EDGE_ORDER.forEach(([dx, dy], i) => {
    const nx = x + dx;
    const ny = y + dy;
    if (
      !inBounds(state, nx, ny) ||
      state.tiles[idx(state, nx, ny)].terrain === "void" ||
      isWaterTerrain(state.tiles[idx(state, nx, ny)].terrain)
    )
      mask |= 1 << i;
  });
  return mask;
}

function tileSpriteFor(state: GameState, tile: Tile, x: number, y: number) {
  const variant = variantAt(x, y);
  const mask = waterMaskAt(state, x, y);
  return sprite(`tile|${tile.terrain}|${variant}|${mask}`, tileBox(tile.terrain, variant), (c) =>
    drawTile(c, tile.terrain, variant, mask),
  );
}

function propSpriteFor(p: PropKind) {
  return sprite(`prop|${propKey(p)}`, PROP_BOX, (c) => drawProp(c, p));
}

/** Land, then everything standing on it. `wy` is the tile's lifted centre. */
function drawTileAt(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  tile: Tile,
  x: number,
  y: number,
  wx: number,
  wy: number,
): void {
  blit(ctx, tileSpriteFor(state, tile, x, y), wx, wy);

  // territory tint + border
  const city = tile.cityId !== null ? cityById(state, tile.cityId) : undefined;
  if (city && city.ownerId >= 0) {
    const tribe = tribeById(state.players[city.ownerId].tribeId);
    diamondPath(ctx, wx, wy);
    ctx.fillStyle = tribe.color + "2e";
    ctx.fill();
    diamondPath(ctx, wx, wy);
    ctx.strokeStyle = tribe.color + "88";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    diamondPath(ctx, wx, wy);
    ctx.strokeStyle = "rgba(0,0,0,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const variant = variantAt(x, y);
  const tribeId = state.players[0] ? tribeById(state.players[0].tribeId).id : "ashfen";
  const ownerTribe = city && city.ownerId >= 0 ? tribeById(state.players[city.ownerId].tribeId).id : tribeId;
  // A mine replaces the peak it is cut into, a lumber hut the trees it felled.
  if (tile.terrain === "mountain" && tile.building !== "mine") {
    blit(ctx, propSpriteFor({ kind: "mountain", variant }), wx, wy);
  }
  if (tile.terrain === "forest" && tile.building !== "lumber_hut") {
    blit(ctx, propSpriteFor({ kind: "trees", variant, tribeId: ownerTribe }), wx, wy);
  }
  if (tile.resource) blit(ctx, propSpriteFor({ kind: "resource", resource: tile.resource }), wx, wy);
  if (tile.building) {
    blit(ctx, propSpriteFor({ kind: "building", building: tile.building, tribeId: ownerTribe }), wx, wy);
  }
  if (tile.village) blit(ctx, propSpriteFor({ kind: "village" }), wx, wy);
  if (tile.ruin) blit(ctx, propSpriteFor({ kind: "ruin" }), wx, wy);
  // fire is drawn over whatever it is consuming, and under the city walls
  if (isBurning(state, tile)) blit(ctx, propSpriteFor({ kind: "fire", variant }), wx, wy);
  if (tile.cityHere !== null) {
    const here = cityById(state, tile.cityHere);
    if (here) {
      blit(
        ctx,
        propSpriteFor({
          kind: "city",
          tribeId: tribeById(state.players[here.ownerId].tribeId).id,
          level: here.level,
          walls: here.walls,
          isCapital: here.isCapital,
        }),
        wx,
        wy,
      );
    }
  }
}

function drawNameplate(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  city: { ownerId: number; level: number; isCapital: boolean; name: string },
  wx: number,
  wy: number,
): void {
  const tribe = tribeById(state.players[city.ownerId].tribeId);
  ctx.font = "bold 11px sans-serif";
  let w = nameplateWidths.get(city.name);
  if (w === undefined) {
    w = ctx.measureText(city.name).width + 26;
    nameplateWidths.set(city.name, w);
  }
  ctx.fillStyle = "rgba(10,15,25,0.8)";
  roundRect(ctx, wx - w / 2, wy + TILE_H / 2 + 2, w, 16, 5);
  ctx.fill();
  ctx.strokeStyle = tribe.color;
  ctx.lineWidth = 1.5;
  roundRect(ctx, wx - w / 2, wy + TILE_H / 2 + 2, w, 16, 5);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = city.isCapital ? "#ffd75e" : "#9fd0ff";
  ctx.fillText(String(city.level), wx - w / 2 + 7, wy + TILE_H / 2 + 14);
  ctx.fillStyle = "#fff";
  ctx.fillText(city.name, wx - w / 2 + 18, wy + TILE_H / 2 + 14);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawUnit(ctx: CanvasRenderingContext2D, state: GameState, unit: Unit, wx: number, wy: number, selected: boolean, attackable: boolean): void {
  const tribe = tribeById(state.players[unit.ownerId].tribeId);
  // An aircraft is over the tile rather than on it, so its figure floats clear
  // of the ground while its rings and shadow stay down where the tile is.
  const lift = isAir(unit.type) ? AIR_LIFT : 0;

  // Rings go down first so the figure stands on top of them.
  if (unit.fortified) {
    // a low earthwork the figure stands behind
    ctx.beginPath();
    ctx.ellipse(wx, wy + 5, 20, 10, 0, Math.PI * 0.08, Math.PI * 0.92);
    ctx.strokeStyle = "rgba(150,190,230,0.85)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  if (selected) {
    ctx.beginPath();
    ctx.ellipse(wx, wy + 4, 18, 9, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (attackable) {
    ctx.beginPath();
    ctx.ellipse(wx, wy + 4, 18, 9, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#ff5544";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // The character art carries the veteran star, HP bar and acted dim itself.
  // (An orbiting unit keeps its own figure; orbit only happens on globe maps.)
  drawCharacter(ctx, {
    tribe: tribe.id,
    type: unit.embarked === "orbit" ? unit.type : (unit.embarked ?? unit.type),
    x: wx,
    y: wy + 4 - lift,
    scale: UNIT_ART_SCALE,
    veteran: unit.veteran,
    acted: unit.moved && unit.attacked,
    hpFrac: unit.hp / unit.maxHp,
  });
}
