/**
 * Where each tile's art lives in the globe's texture atlas.
 *
 * One cell per tile, in reading order. Cells keep the flat renderer's 2:1
 * diamond aspect so the baked art is reused unstretched, and a small gutter
 * keeps linear sampling from bleeding neighbouring cells in.
 */
export const CELL_W = 192;
export const CELL_H = 96;
export const GUTTER = 6;
export const ATLAS_SIZE = 4096;

export const atlasCols = (): number => Math.floor(ATLAS_SIZE / CELL_W);

/** Top-left pixel of a tile's cell. */
export function cellOrigin(tile: number): [number, number] {
  const cols = atlasCols();
  return [(tile % cols) * CELL_W, Math.floor(tile / cols) * CELL_H];
}

/**
 * UVs of the four diamond corners of a tile's cell — top, right, bottom,
 * left — matching the iso diamond the terrain art paints.
 */
export function cellDiamondUv(tile: number): Array<[number, number]> {
  const [ox, oy] = cellOrigin(tile);
  const cx = (ox + CELL_W / 2) / ATLAS_SIZE;
  const cy = (oy + CELL_H / 2) / ATLAS_SIZE;
  const hw = (CELL_W / 2 - GUTTER) / ATLAS_SIZE;
  const hh = (CELL_H / 2 - GUTTER) / ATLAS_SIZE;
  // canvas y grows downward; UV v grows upward
  return [
    [cx, 1 - (cy - hh)],
    [cx + hw, 1 - cy],
    [cx, 1 - (cy + hh)],
    [cx - hw, 1 - cy],
  ];
}
