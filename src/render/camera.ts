import { gridToWorld } from "./iso";

export interface Camera {
  /** world-space point at the center of the screen */
  x: number;
  y: number;
  zoom: number;
}

export function centerOnGrid(size: number): Camera {
  const [wx, wy] = gridToWorld((size - 1) / 2, (size - 1) / 2);
  return { x: wx, y: wy, zoom: 1 };
}

export function screenToWorld(cam: Camera, sx: number, sy: number, width: number, height: number): [number, number] {
  return [(sx - width / 2) / cam.zoom + cam.x, (sy - height / 2) / cam.zoom + cam.y];
}

export function clampZoom(z: number): number {
  return Math.min(2.5, Math.max(0.5, z));
}
