import { describe, it, expect } from "vitest";
import {
  mapBounds,
  fitZoom,
  minZoom,
  clampZoom,
  initialCamera,
  clampCamera,
  anchorZoom,
  screenToWorld,
  DEFAULT_MIN_ZOOM,
  type Camera,
} from "../src/render/camera";
import { TILE_W, TILE_H } from "../src/render/iso";

const PHONE = { w: 390, h: 700 };
const DESKTOP = { w: 1600, h: 900 };

/** Does the viewport at this camera contain the whole map? */
function mapFullyVisible(cam: Camera, size: number, viewW: number, viewH: number): boolean {
  const b = mapBounds(size);
  const halfW = viewW / (2 * cam.zoom);
  const halfH = viewH / (2 * cam.zoom);
  return (
    cam.x - halfW <= b.minX && cam.x + halfW >= b.maxX && cam.y - halfH <= b.minY && cam.y + halfH >= b.maxY
  );
}

describe("map bounds", () => {
  it("covers every drawn tile diamond", () => {
    const b = mapBounds(11);
    expect(b.maxX - b.minX).toBe(11 * TILE_W);
    expect(b.maxY - b.minY).toBe(11 * TILE_H);
    // west and east tips of the diamond, plus their tile half-widths
    expect(b.minX).toBe(-(10 * TILE_W) / 2 - TILE_W / 2);
    expect(b.maxX).toBe((10 * TILE_W) / 2 + TILE_W / 2);
  });
});

describe("zoom limits", () => {
  it("lets a phone zoom out far enough to fit a large map", () => {
    const z = minZoom(16, PHONE.w, PHONE.h);
    expect(z).toBeLessThan(DEFAULT_MIN_ZOOM);
    expect(z).toBe(fitZoom(16, PHONE.w, PHONE.h));
  });

  it("keeps the normal floor on a desktop viewport", () => {
    expect(minZoom(16, DESKTOP.w, DESKTOP.h)).toBe(DEFAULT_MIN_ZOOM);
  });

  it("clamps to the given floor and the shared ceiling", () => {
    expect(clampZoom(0.1)).toBe(DEFAULT_MIN_ZOOM);
    expect(clampZoom(0.1, 0.3)).toBe(0.3);
    expect(clampZoom(99)).toBe(2.5);
  });
});

describe("initialCamera", () => {
  it("shows the whole map on a phone", () => {
    for (const size of [11, 14, 16]) {
      const cam = initialCamera(size, PHONE.w, PHONE.h);
      expect(mapFullyVisible(cam, size, PHONE.w, PHONE.h)).toBe(true);
    }
  });

  it("never zooms in past 1:1 on a large screen", () => {
    expect(initialCamera(11, DESKTOP.w, DESKTOP.h).zoom).toBe(1);
  });
});

describe("clampCamera", () => {
  it("pulls a camera panned into the void back over the map", () => {
    const size = 11;
    const cam: Camera = { x: 99999, y: -99999, zoom: 2 };
    clampCamera(cam, size, DESKTOP.w, DESKTOP.h);
    const b = mapBounds(size);
    expect(cam.x).toBeLessThan(b.maxX + 200);
    expect(cam.x).toBeGreaterThan(b.minX - 200);
    expect(cam.y).toBeGreaterThan(b.minY - 200);
  });

  it("locks to the map center on an axis the viewport already covers", () => {
    const size = 11;
    const cam = initialCamera(size, DESKTOP.w, DESKTOP.h);
    cam.x = 500;
    clampCamera(cam, size, DESKTOP.w, DESKTOP.h);
    expect(cam.x).toBe(0); // map center x
  });
});

describe("anchorZoom", () => {
  it("keeps the world point under the anchor fixed", () => {
    const cam: Camera = { x: 10, y: 20, zoom: 1 };
    const [wx, wy] = screenToWorld(cam, 120, 300, DESKTOP.w, DESKTOP.h);
    anchorZoom(cam, 120, 300, 120, 300, 2.2, DESKTOP.w, DESKTOP.h);
    const [wx2, wy2] = screenToWorld(cam, 120, 300, DESKTOP.w, DESKTOP.h);
    expect(wx2).toBeCloseTo(wx, 6);
    expect(wy2).toBeCloseTo(wy, 6);
  });

  it("pans when the anchor moves (two-finger drag)", () => {
    const cam: Camera = { x: 0, y: 0, zoom: 1 };
    const [wx, wy] = screenToWorld(cam, 100, 100, DESKTOP.w, DESKTOP.h);
    anchorZoom(cam, 100, 100, 180, 140, 1, DESKTOP.w, DESKTOP.h);
    const [wx2, wy2] = screenToWorld(cam, 180, 140, DESKTOP.w, DESKTOP.h);
    expect(wx2).toBeCloseTo(wx, 6);
    expect(wy2).toBeCloseTo(wy, 6);
    expect(cam.x).toBeCloseTo(-80, 6);
  });
});
