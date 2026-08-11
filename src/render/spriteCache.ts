/**
 * Bakes the procedural land art into offscreen sprites.
 *
 * A tile top with its grass blades, mottling and shore foam costs a millisecond
 * or so to draw — fine once, ruinous 60 times a second across a few hundred
 * tiles. Every distinct look is painted once into its own canvas and blitted
 * from then on, so a frame is a few hundred drawImage calls.
 *
 * Sprites are rasterised at a fixed supersample (SPRITE_SCALE device pixels per
 * world pixel) and drawn back at world size, so panning and zooming never
 * invalidate the cache — only the map's contents do.
 */
import type { Ctx } from "./unitArt";

/** Device pixels per world pixel in a baked sprite. Crisp at 2x DPR, zoom 1. */
export const SPRITE_SCALE = 2;

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** world-space offset from the anchor point to the sprite's top-left corner */
  ox: number;
  oy: number;
  /** world-space size */
  w: number;
  h: number;
}

export interface SpriteBox {
  /** world-space bounds around the anchor the art may paint into */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const cache = new Map<string, Sprite>();

/**
 * The sprite for `key`, painting it with `paint` on first use. `paint` receives
 * a context whose origin is the sprite's anchor point.
 */
export function sprite(key: string, box: SpriteBox, paint: (ctx: Ctx) => void): Sprite {
  const hit = cache.get(key);
  if (hit) return hit;

  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(w * SPRITE_SCALE));
  canvas.height = Math.max(1, Math.ceil(h * SPRITE_SCALE));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
    ctx.translate(-box.left, -box.top);
    paint(ctx);
  }
  const made: Sprite = { canvas, ox: box.left, oy: box.top, w, h };
  cache.set(key, made);
  return made;
}

/** Blit a baked sprite so its anchor lands on (wx, wy) in world space. */
export function blit(ctx: Ctx, s: Sprite, wx: number, wy: number): void {
  ctx.drawImage(s.canvas, wx + s.ox, wy + s.oy, s.w, s.h);
}

/** Drop every baked sprite. Only needed if the art itself changes. */
export function clearSprites(): void {
  cache.clear();
}

export function spriteCount(): number {
  return cache.size;
}
