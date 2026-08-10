import { gridToWorld, TILE_W, TILE_H } from "./iso";

export interface Camera {
  /** world-space point at the center of the screen */
  x: number;
  y: number;
  zoom: number;
}

export const MAX_ZOOM = 2.5;
export const DEFAULT_MIN_ZOOM = 0.5;
/** World-space breathing room around the map: unit art and mountains stand well above their tile. */
const BOUNDS_MARGIN = 48;

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Drawn world-space extents of the map diamond, including each tile's half-diamond. */
export function mapBounds(size: number): Bounds {
  const halfW = (size * TILE_W) / 2;
  return {
    minX: -halfW,
    maxX: halfW,
    minY: -TILE_H / 2,
    maxY: (size - 1) * TILE_H + TILE_H / 2,
  };
}

export function centerOnGrid(size: number): Camera {
  const [wx, wy] = gridToWorld((size - 1) / 2, (size - 1) / 2);
  return { x: wx, y: wy, zoom: 1 };
}

export function screenToWorld(cam: Camera, sx: number, sy: number, width: number, height: number): [number, number] {
  return [(sx - width / 2) / cam.zoom + cam.x, (sy - height / 2) / cam.zoom + cam.y];
}

/** Zoom at which the whole map plus its margin fits inside the viewport. */
export function fitZoom(size: number, viewW: number, viewH: number): number {
  if (viewW <= 0 || viewH <= 0) return 1;
  const b = mapBounds(size);
  const worldW = b.maxX - b.minX + BOUNDS_MARGIN * 2;
  const worldH = b.maxY - b.minY + BOUNDS_MARGIN * 2;
  return Math.min(viewW / worldW, viewH / worldH);
}

/**
 * Lowest allowed zoom. Normally 0.5, but on a viewport too small to hold the map
 * at that zoom (phones) it drops far enough that the whole map still fits.
 */
export function minZoom(size: number, viewW: number, viewH: number): number {
  return Math.min(DEFAULT_MIN_ZOOM, fitZoom(size, viewW, viewH));
}

export function clampZoom(z: number, min: number = DEFAULT_MIN_ZOOM): number {
  return Math.min(MAX_ZOOM, Math.max(min, z));
}

/** Opening camera for a map: centered, zoomed out far enough to show the whole board. */
export function initialCamera(size: number, viewW: number, viewH: number): Camera {
  const cam = centerOnGrid(size);
  const fit = fitZoom(size, viewW, viewH);
  cam.zoom = clampZoom(Math.min(1, fit), minZoom(size, viewW, viewH));
  return cam;
}

/** Keep the viewport over the map: clamp each axis, or lock to center when the map already fits. */
export function clampCamera(cam: Camera, size: number, viewW: number, viewH: number): void {
  if (viewW <= 0 || viewH <= 0) return;
  const b = mapBounds(size);
  const minX = b.minX - BOUNDS_MARGIN;
  const maxX = b.maxX + BOUNDS_MARGIN;
  const minY = b.minY - BOUNDS_MARGIN;
  const maxY = b.maxY + BOUNDS_MARGIN;

  const halfW = viewW / (2 * cam.zoom);
  const halfH = viewH / (2 * cam.zoom);

  cam.x = maxX - minX <= halfW * 2 ? (minX + maxX) / 2 : Math.min(maxX - halfW, Math.max(minX + halfW, cam.x));
  cam.y = maxY - minY <= halfH * 2 ? (minY + maxY) / 2 : Math.min(maxY - halfH, Math.max(minY + halfH, cam.y));
}

/**
 * Change zoom while keeping the world point that sat under (prevSx, prevSy) under (sx, sy).
 * With equal points this is cursor-anchored wheel zoom; with a moving pinch midpoint it
 * folds two-finger panning into the same step.
 */
export function anchorZoom(
  cam: Camera,
  prevSx: number,
  prevSy: number,
  sx: number,
  sy: number,
  newZoom: number,
  viewW: number,
  viewH: number,
): void {
  const [wx, wy] = screenToWorld(cam, prevSx, prevSy, viewW, viewH);
  cam.zoom = newZoom;
  cam.x = wx - (sx - viewW / 2) / newZoom;
  cam.y = wy - (sy - viewH / 2) / newZoom;
}
