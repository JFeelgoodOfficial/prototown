import type { GameState, Tile, Unit } from "../engine/state";
import { idx, cityById, inBounds } from "../engine/state";
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
}

/** Fits the 100-unit-tall authored figures onto a 72x36 iso tile. */
const UNIT_ART_SCALE = 0.62;

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
  const reachSet = new Set(view.reachable.map(([x, y]) => y * state.size + x));
  const attackSet = new Set(view.attackableUnitIds);
  const unitsByTile = new Map<number, Unit>();
  for (const u of state.units) unitsByTile.set(u.y * state.size + u.x, u);

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
    const [wx, wy0] = gridToWorld(x, y);
    if (offscreen(wx, wy0)) continue;
    const wy = topOf(x, y);
    if (!explored) {
      blit(ctx, sprite("fog", FOG_BOX, (c) => drawCloud(c, 0, 0)), wx, wy);
      continue;
    }
    drawTileAt(ctx, state, tile, x, y, wx, wy);
    if (reachSet.has(y * state.size + x)) {
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
    const key = gy * state.size + gx;
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
    if (!inBounds(state, nx, ny) || isWaterTerrain(state.tiles[idx(state, nx, ny)].terrain)) mask |= 1 << i;
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
  drawCharacter(ctx, {
    tribe: tribe.id,
    type: unit.embarked ?? unit.type,
    x: wx,
    y: wy + 4,
    scale: UNIT_ART_SCALE,
    veteran: unit.veteran,
    acted: unit.moved && unit.attacked,
    hpFrac: unit.hp / unit.maxHp,
  });
}
