import type { GameState } from "../engine/state";
import { idx } from "../engine/state";
import { tribeById } from "../data/tribes";
import { mapBounds, type Camera } from "./camera";
import { worldToGrid } from "./iso";

const TERRAIN_DOT: Record<string, string> = {
  field: "#5f8f3f",
  forest: "#3f6f2f",
  mountain: "#8a857c",
  water: "#2f6f92",
  ocean: "#1f4d69",
  crater: "#37302b",
};

const UNSEEN = "#161f30";

export interface MinimapView {
  camera: Camera;
  /** viewport size in CSS pixels, to draw the "you are here" box */
  viewW: number;
  viewH: number;
  viewerId: number;
  explored: number[];
  revealAll: boolean;
}

/**
 * Top-down overview of the board. Deliberately a plain square grid rather than
 * the isometric projection — at this size the diamond is far harder to read.
 */
export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  view: MinimapView,
  width: number,
  height: number,
): void {
  const cell = Math.min(width, height) / state.size;
  const originX = (width - cell * state.size) / 2;
  const originY = (height - cell * state.size) / 2;

  ctx.clearRect(0, 0, width, height);

  for (let y = 0; y < state.size; y++) {
    for (let x = 0; x < state.size; x++) {
      const i = idx(state, x, y);
      const seen = view.revealAll || view.explored[i] === 1;
      const tile = state.tiles[i];
      if (tile.terrain === "void") continue;
      let color = UNSEEN;
      if (seen) {
        color = TERRAIN_DOT[tile.terrain] ?? UNSEEN;
        if (tile.cityId !== null) {
          const city = state.cities.find((c) => c.id === tile.cityId);
          if (city && city.ownerId >= 0) color = tribeById(state.players[city.ownerId].tribeId).colorDark;
        }
      }
      ctx.fillStyle = color;
      ctx.fillRect(originX + x * cell, originY + y * cell, cell + 0.5, cell + 0.5);
    }
  }

  // ruins are the reason to go somewhere, so they get their own mark
  for (const tile of state.tiles) {
    if (!tile.ruin) continue;
    const i = idx(state, tile.x, tile.y);
    if (!view.revealAll && view.explored[i] !== 1) continue;
    ctx.fillStyle = "#ffd75e";
    const s = Math.max(2, cell * 0.5);
    ctx.fillRect(originX + tile.x * cell + (cell - s) / 2, originY + tile.y * cell + (cell - s) / 2, s, s);
  }

  // cities read as bright squares, units as dots, both only where visible
  for (const city of state.cities) {
    const i = idx(state, city.x, city.y);
    if (!view.revealAll && view.explored[i] !== 1) continue;
    ctx.fillStyle = tribeById(state.players[city.ownerId].tribeId).color;
    const s = Math.max(2.5, cell * 0.8);
    ctx.fillRect(originX + city.x * cell + (cell - s) / 2, originY + city.y * cell + (cell - s) / 2, s, s);
  }

  for (const unit of state.units) {
    const i = idx(state, unit.x, unit.y);
    const mine = unit.ownerId === view.viewerId;
    if (!view.revealAll && !mine && view.explored[i] !== 1) continue;
    ctx.beginPath();
    ctx.arc(originX + (unit.x + 0.5) * cell, originY + (unit.y + 0.5) * cell, Math.max(1.2, cell * 0.28), 0, Math.PI * 2);
    ctx.fillStyle = mine ? "#ffffff" : tribeById(state.players[unit.ownerId].tribeId).color;
    ctx.fill();
  }

  drawViewportBox(ctx, state, view, cell, originX, originY);

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  if (state.mapType === "circle") {
    ctx.beginPath();
    ctx.arc(originX + (cell * state.size) / 2, originY + (cell * state.size) / 2, (cell * state.size) / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(originX, originY, cell * state.size, cell * state.size);
  }
}

/** The camera's world rect, projected back to grid space as a box. */
function drawViewportBox(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  view: MinimapView,
  cell: number,
  originX: number,
  originY: number,
): void {
  const { camera, viewW, viewH } = view;
  if (viewW <= 0 || viewH <= 0) return;
  const b = mapBounds(state.size);
  const halfW = viewW / (2 * camera.zoom);
  const halfH = viewH / (2 * camera.zoom);
  // If the whole board is on screen there is nothing useful to outline.
  if (halfW * 2 >= b.maxX - b.minX && halfH * 2 >= b.maxY - b.minY) return;

  // Project the four screen corners into grid space and take their bounding box:
  // an axis-aligned screen rect is a diamond in grid space.
  let minGx = Infinity, maxGx = -Infinity, minGy = Infinity, maxGy = -Infinity;
  for (const [cx, cy] of [
    [camera.x - halfW, camera.y - halfH],
    [camera.x + halfW, camera.y - halfH],
    [camera.x - halfW, camera.y + halfH],
    [camera.x + halfW, camera.y + halfH],
  ]) {
    const [gx, gy] = worldToGrid(cx, cy);
    minGx = Math.min(minGx, gx); maxGx = Math.max(maxGx, gx);
    minGy = Math.min(minGy, gy); maxGy = Math.max(maxGy, gy);
  }
  const clamp = (v: number) => Math.max(0, Math.min(state.size, v));
  const x0 = clamp(minGx), x1 = clamp(maxGx), y0 = clamp(minGy), y1 = clamp(maxGy);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(originX + x0 * cell, originY + y0 * cell, (x1 - x0) * cell, (y1 - y0) * cell);
}

/** Grid tile under a click at (px,py) inside a minimap of this size. */
export function minimapToGrid(
  size: number,
  px: number,
  py: number,
  width: number,
  height: number,
): [number, number] {
  const cell = Math.min(width, height) / size;
  const originX = (width - cell * size) / 2;
  const originY = (height - cell * size) / 2;
  return [Math.floor((px - originX) / cell), Math.floor((py - originY) / cell)];
}
