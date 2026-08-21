/**
 * Rotatable 3D globe renderer for cube-sphere maps.
 *
 * The world is drawn as one sphere-projected quad mesh — a quad per tile —
 * textured from a single atlas canvas painted with the same procedural
 * terrain art the flat renderer bakes. Props (mountains, trees, cities,
 * resources) and units ride above the surface as camera-facing sprites.
 * The globe rotates under the pointer; the camera stays put on +Z.
 *
 * Known v1 simplifications, accepted deliberately: shoreline foam is not
 * computed across cube-face seams, floating combat text and missile/nuke
 * effects are not shown (unit HP bars still tell the story), and props are
 * flattened to at most two sprites per tile.
 *
 * Twin-globe maps render both planets in this one scene, spaced along +X and
 * sharing the topology and texture atlas; the camera slides sideways to park
 * in front of the active planet, and only that planet rotates under drags.
 */
import * as THREE from "three";
import type { GameState, Tile, Unit } from "../../engine/state";
import { idx, coordsOf, tileCount, cityById, isBurning, planetCount, planetOf, gridWidth } from "../../engine/state";
import { sphereTopology } from "../../engine/topology";
import {
  diamondPath,
  drawProp,
  drawTile,
  isWaterTerrain,
  propKey,
  variantAt,
  tileBox,
  EDGE_ORDER,
  PROP_BOX,
  type PropKind,
} from "../terrainArt";
import { sprite, blit } from "../spriteCache";
import { CELL_W, CELL_H, ATLAS_SIZE, cellOrigin, cellDiamondUv } from "./atlasLayout";
import { drawCharacter } from "../unitArt";
import { isAir } from "../../data/units";
import { tribeById } from "../../data/tribes";
import { TILE_W, TILE_H } from "../iso";

/** Sphere radius in scene units. */
const R = 100;
const MIN_DIST = R * 1.45;
const MAX_DIST = R * 3.4;
/** Centre-to-centre gap between planets on twin-globe maps. */
const PLANET_SPACING = R * 2.6;

const FOG_FILL = "#333f57";
const FOG_EDGE = "#232c40";

export interface GlobeView {
  viewerId: number;
  explored: number[];
  watched: number[];
  revealAll: boolean;
  selectedUnitId: number | null;
  reachable: Array<[number, number]>;
  attackableUnitIds: number[];
  hoverTile: [number, number] | null;
}

export class GlobeRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  /** One rotatable group per planet, planet p centred at x = p * PLANET_SPACING. */
  private globes: THREE.Group[] = [];
  private tileMeshes: THREE.Mesh[] = [];
  private atlas: HTMLCanvasElement;
  private atlasCtx: CanvasRenderingContext2D;
  private atlasTex: THREE.CanvasTexture;
  private raycaster = new THREE.Raycaster();
  private spritePool: THREE.Sprite[] = [];
  private texByKey = new Map<string, THREE.Texture>();
  private tileDiag: number;
  /** The planet the camera is parked in front of. Always 0 on single globes. */
  activePlanet = 0;
  needsRender = true;

  constructor(
    canvas: HTMLCanvasElement,
    private state: GameState,
  ) {
    const topo = sphereTopology(state.size);
    const planets = planetCount(state);
    const W = gridWidth(state);
    const w6 = state.size * 6;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(new THREE.Color("#0b1220"));
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, R * 12);
    this.camera.position.set(0, 0, R * 2.4);
    this.camera.lookAt(0, 0, 0);

    this.atlas = document.createElement("canvas");
    this.atlas.width = ATLAS_SIZE;
    this.atlas.height = ATLAS_SIZE;
    this.atlasCtx = this.atlas.getContext("2d")!;
    this.atlasTex = new THREE.CanvasTexture(this.atlas);
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    // no mipmaps: low mips would blend neighbouring cells across their gutters
    this.atlasTex.generateMipmaps = false;
    this.atlasTex.minFilter = THREE.LinearFilter;

    // per planet: one quad (two triangles) per tile, corners on the sphere.
    // All planets share the topology and the atlas; only the UVs differ,
    // pointing each planet's quads at its own block of atlas cells.
    for (let p = 0; p < planets; p++) {
      const positions = new Float32Array(topo.count * 4 * 3);
      const uvs = new Float32Array(topo.count * 4 * 2);
      const indices: number[] = [];
      for (let i = 0; i < topo.count; i++) {
        const corners = topo.cornersOf(i);
        for (let c = 0; c < 4; c++) {
          positions.set(
            [corners[c][0] * R, corners[c][1] * R, corners[c][2] * R],
            (i * 4 + c) * 3,
          );
        }
        const globalTile = Math.floor(i / w6) * W + (i % w6) + p * w6;
        const [top, right, bottom, left] = cellDiamondUv(globalTile);
        uvs.set(top, (i * 4 + 0) * 2);
        uvs.set(right, (i * 4 + 1) * 2);
        uvs.set(bottom, (i * 4 + 2) * 2);
        uvs.set(left, (i * 4 + 3) * 2);
        indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      // Double-sided: the corner-derived quad winding differs between cube
      // faces, so single-sided culling would eat half the globe.
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ map: this.atlasTex, side: THREE.DoubleSide }),
      );
      const globe = new THREE.Group();
      globe.position.x = p * PLANET_SPACING;
      globe.add(mesh);
      this.scene.add(globe);
      this.globes.push(globe);
      this.tileMeshes.push(mesh);
    }

    const c0 = topo.cornersOf(0);
    this.tileDiag = Math.hypot(c0[0][0] - c0[2][0], c0[0][1] - c0[2][1], c0[0][2] - c0[2][2]) * R;
  }

  /* ── atlas ── */

  /**
   * Shore mask for the beaches/foam, from same-face neighbours only. Across a
   * cube-face seam the fold's orientation is ambiguous, so the seam edge just
   * repeats the tile's own class — no false coasts, occasionally no foam.
   */
  private waterMaskAt(x: number, y: number): number {
    const s = this.state;
    const n = s.size;
    const face = Math.floor(x / n);
    let mask = 0;
    EDGE_ORDER.forEach(([dx, dy], i) => {
      const nx = x + dx;
      const ny = y + dy;
      const sameFace = ny >= 0 && ny < n && Math.floor(nx / n) === face && nx >= 0;
      const t = sameFace ? s.tiles[idx(s, nx, ny)].terrain : s.tiles[idx(s, x, y)].terrain;
      if (isWaterTerrain(t)) mask |= 1 << i;
    });
    return mask;
  }

  /** Repaint every atlas cell for the current state and view. */
  repaintAtlas(view: GlobeView): void {
    const s = this.state;
    const ctx = this.atlasCtx;
    const reach = new Set(view.reachable.map(([x, y]) => idx(s, x, y)));
    const hover = view.hoverTile ? idx(s, view.hoverTile[0], view.hoverTile[1]) : -1;
    ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

    for (let i = 0; i < tileCount(s); i++) {
      const tile = s.tiles[i];
      const [ox, oy] = cellOrigin(i);
      ctx.save();
      // Paint the full cell but sample (via the UVs) only the gutter-inset
      // diamond: everything sampled is painted, so tile edges never show a
      // transparent seam. The clip keeps crust/foam overflow inside the cell.
      ctx.beginPath();
      ctx.rect(ox, oy, CELL_W, CELL_H);
      ctx.clip();
      ctx.translate(ox + CELL_W / 2, oy + CELL_H / 2);
      ctx.scale(CELL_W / TILE_W, CELL_H / TILE_H);

      const explored = view.revealAll || view.explored[i] === 1;
      if (!explored) {
        diamondPath(ctx, 0, 0);
        ctx.fillStyle = FOG_FILL;
        ctx.fill();
        ctx.strokeStyle = FOG_EDGE;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        continue;
      }

      const variant = variantAt(tile.x, tile.y);
      const mask = this.waterMaskAt(tile.x, tile.y);
      blit(
        ctx,
        sprite(`tile|${tile.terrain}|${variant}|${mask}`, tileBox(tile.terrain, variant), (c) =>
          drawTile(c, tile.terrain, variant, mask),
        ),
        0,
        0,
      );

      // territory tint + border, matching the flat renderer
      const city = tile.cityId !== null ? cityById(s, tile.cityId) : undefined;
      if (city && city.ownerId >= 0) {
        const tribe = tribeById(s.players[city.ownerId].tribeId);
        diamondPath(ctx, 0, 0);
        ctx.fillStyle = tribe.color + "2e";
        ctx.fill();
        diamondPath(ctx, 0, 0);
        ctx.strokeStyle = tribe.color + "88";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (reach.has(i)) {
        diamondPath(ctx, 0, 0);
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (i === hover) {
        diamondPath(ctx, 0, 0);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
    this.atlasTex.needsUpdate = true;
    this.needsRender = true;
  }

  /* ── sprites (props + units) ── */

  private spriteTexture(key: string, paint: () => HTMLCanvasElement): THREE.Texture {
    const hit = this.texByKey.get(key);
    if (hit) return hit;
    const tex = new THREE.CanvasTexture(paint());
    tex.colorSpace = THREE.SRGBColorSpace;
    this.texByKey.set(key, tex);
    return tex;
  }

  private propTexture(p: PropKind): { tex: THREE.Texture; aspect: number } {
    const baked = sprite(`prop|${propKey(p)}`, PROP_BOX, (c) => drawProp(c, p));
    const tex = this.spriteTexture(`prop|${propKey(p)}`, () => baked.canvas);
    return { tex, aspect: baked.h / baked.w };
  }

  private unitTexture(unit: Unit, selected: boolean, attackable: boolean): THREE.Texture {
    const s = this.state;
    const tribe = tribeById(s.players[unit.ownerId].tribeId);
    const hp = (unit.hp / unit.maxHp).toFixed(2);
    const inOrbit = unit.embarked === "orbit";
    const key = `unit|${tribe.id}|${unit.embarked ?? "ground"}|${unit.type}|${unit.veteran}|${unit.moved && unit.attacked}|${hp}|${selected}|${attackable}|${unit.fortified}`;
    return this.spriteTexture(key, () => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(1.1, 1.1);
      const wx = 44;
      const wy = 96;
      if (unit.fortified) {
        ctx.beginPath();
        ctx.ellipse(wx, wy + 5, 20, 10, 0, Math.PI * 0.08, Math.PI * 0.92);
        ctx.strokeStyle = "rgba(150,190,230,0.85)";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (selected || attackable) {
        ctx.beginPath();
        ctx.ellipse(wx, wy + 4, 18, 9, 0, 0, Math.PI * 2);
        ctx.strokeStyle = attackable ? "#ff5544" : "#ffffff";
        ctx.lineWidth = attackable ? 2.5 : 2;
        ctx.stroke();
      }
      if (inOrbit) {
        // a golden capsule ring: this figure is riding a rocket, not standing here
        ctx.beginPath();
        ctx.ellipse(wx, wy - 24, 26, 34, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,214,110,0.9)";
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawCharacter(ctx, {
        tribe: tribe.id,
        type: unit.embarked === "orbit" ? unit.type : (unit.embarked ?? unit.type),
        x: wx,
        y: wy + 4,
        scale: 0.62,
        veteran: unit.veteran,
        acted: unit.moved && unit.attacked,
        hpFrac: unit.hp / unit.maxHp,
      });
      return canvas;
    });
  }

  /** Rebuild the prop and unit sprite layer for the current state and view. */
  rebuildSprites(view: GlobeView): void {
    const s = this.state;
    const topo = sphereTopology(s.size);
    const w6 = s.size * 6;
    for (const spr of this.spritePool) spr.removeFromParent();
    this.spritePool = [];

    const place = (tile: number, tex: THREE.Texture, aspect: number, size: number, lift: number) => {
      const [x, y] = coordsOf(s, tile);
      const planet = planetOf(s, x);
      const [cx, cy, cz] = topo.centers[y * w6 + (x % w6)];
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
      const r = R + lift;
      spr.position.set(cx * r, cy * r, cz * r);
      spr.scale.set(size, size * aspect, 1);
      spr.renderOrder = 1;
      this.globes[planet].add(spr);
      this.spritePool.push(spr);
    };

    const propsOf = (tile: Tile): PropKind[] => {
      const out: PropKind[] = [];
      const variant = variantAt(tile.x, tile.y);
      const ownerCity = tile.cityId !== null ? cityById(s, tile.cityId) : undefined;
      const ownerTribe =
        ownerCity && ownerCity.ownerId >= 0
          ? tribeById(s.players[ownerCity.ownerId].tribeId).id
          : s.players[0]
            ? tribeById(s.players[0].tribeId).id
            : "ashfen";
      if (tile.terrain === "mountain" && tile.building !== "mine") out.push({ kind: "mountain", variant });
      if (tile.terrain === "forest" && tile.building !== "lumber_hut")
        out.push({ kind: "trees", variant, tribeId: ownerTribe });
      // fire outlives whatever stood here, so it is pushed before the early
      // return a city takes: a burning city tile still shows its flames
      if (isBurning(s, tile)) out.push({ kind: "fire", variant });
      if (tile.cityHere !== null) {
        const here = cityById(s, tile.cityHere);
        if (here)
          out.push({
            kind: "city",
            tribeId: tribeById(s.players[here.ownerId].tribeId).id,
            level: here.level,
            walls: here.walls,
            isCapital: here.isCapital,
          });
        return out;
      }
      if (tile.village) out.push({ kind: "village" });
      else if (tile.ruin) out.push({ kind: "ruin" });
      else if (tile.building) out.push({ kind: "building", building: tile.building, tribeId: ownerTribe });
      else if (tile.resource) out.push({ kind: "resource", resource: tile.resource });
      return out;
    };

    for (let i = 0; i < tileCount(s); i++) {
      const explored = view.revealAll || view.explored[i] === 1;
      if (!explored) continue;
      for (const p of propsOf(s.tiles[i])) {
        const { tex, aspect } = this.propTexture(p);
        place(i, tex, aspect, this.tileDiag * 0.72, this.tileDiag * 0.16);
      }
    }

    const attackable = new Set(view.attackableUnitIds);
    for (const u of s.units) {
      const i = idx(s, u.x, u.y);
      const visible =
        view.revealAll || u.ownerId === view.viewerId || (view.explored[i] === 1 && view.watched[i] === 1);
      if (!visible) continue;
      const tex = this.unitTexture(u, u.id === view.selectedUnitId, attackable.has(u.id));
      // an orbiting unit floats visibly higher above its launch pad, and an
      // aircraft sits between the two: clear of the ground, short of space
      const lift =
        u.embarked === "orbit"
          ? this.tileDiag * 0.85
          : isAir(u.type)
            ? this.tileDiag * 0.55
            : this.tileDiag * 0.3;
      place(i, tex, 128 / 96, this.tileDiag * 0.62, lift);
    }
    this.needsRender = true;
  }

  /* ── interaction ── */

  /** Rotate the active planet under a drag of (dx, dy) CSS pixels. */
  rotateBy(dx: number, dy: number): void {
    const speed = 0.13 * (this.camera.position.z / (R * 2.4));
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (dx * speed * Math.PI) / 180);
    const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (dy * speed * Math.PI) / 180);
    this.globes[this.activePlanet].quaternion.premultiply(yaw).premultiply(pitch);
    this.needsRender = true;
  }

  /** Multiply the camera distance; < 1 zooms in. */
  zoomBy(factor: number): void {
    const z = Math.min(MAX_DIST, Math.max(MIN_DIST, this.camera.position.z * factor));
    this.camera.position.z = z;
    this.needsRender = true;
  }

  /** Slide the camera over to park in front of the given planet. */
  setActivePlanet(p: number): void {
    if (p < 0 || p >= this.globes.length || p === this.activePlanet) return;
    this.activePlanet = p;
    this.camera.position.x = p * PLANET_SPACING;
    this.camera.lookAt(p * PLANET_SPACING, 0, 0);
    this.needsRender = true;
  }

  /** How many planets this world has. */
  planets(): number {
    return this.globes.length;
  }

  /** Swing to the tile's planet and rotate it so the tile faces the camera. */
  focusTile(x: number, y: number): void {
    const s = this.state;
    const planet = planetOf(s, x);
    this.setActivePlanet(planet);
    const w6 = s.size * 6;
    const [cx, cy, cz] = sphereTopology(s.size).centers[y * w6 + (x % w6)];
    this.globes[planet].quaternion.setFromUnitVectors(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(0, 0, 1));
    this.needsRender = true;
  }

  /** The tile under a canvas-relative CSS pixel, or null off every globe. */
  pick(px: number, py: number, w: number, h: number): [number, number] | null {
    const ndc = new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.tileMeshes, false);
    if (hits.length === 0 || hits[0].faceIndex === undefined || hits[0].faceIndex === null) return null;
    const planet = this.tileMeshes.indexOf(hits[0].object as THREE.Mesh);
    const local = Math.floor(hits[0].faceIndex / 2);
    const w6 = this.state.size * 6;
    return [(local % w6) + planet * w6, Math.floor(local / w6)];
  }

  /* ── frame ── */

  setState(state: GameState): void {
    this.state = state;
  }

  resize(w: number, h: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  render(): void {
    if (!this.needsRender) return;
    this.needsRender = false;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const mesh of this.tileMeshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.atlasTex.dispose();
    for (const tex of this.texByKey.values()) tex.dispose();
    for (const spr of this.spritePool) spr.material.dispose();
    this.renderer.dispose();
  }
}
