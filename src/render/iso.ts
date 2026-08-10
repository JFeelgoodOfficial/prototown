export const TILE_W = 72;
export const TILE_H = 36;

/** Grid coords -> world-space pixel center of the tile's diamond. */
export function gridToWorld(x: number, y: number): [number, number] {
  return [((x - y) * TILE_W) / 2, ((x + y) * TILE_H) / 2];
}

/** World-space pixel -> grid coords (may be out of bounds; caller checks). */
export function worldToGrid(wx: number, wy: number): [number, number] {
  const fx = (wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2;
  const fy = (wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2;
  return [Math.round(fx), Math.round(fy)];
}

/** Painter's order: draw back-to-front by x+y, then x. */
export function drawOrder(size: number): Array<[number, number]> {
  const order: Array<[number, number]> = [];
  for (let s = 0; s <= (size - 1) * 2; s++) {
    for (let x = 0; x <= s; x++) {
      const y = s - x;
      if (x < size && y < size) order.push([x, y]);
    }
  }
  return order;
}
