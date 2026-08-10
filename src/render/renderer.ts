import type { GameState, Tile, Unit } from "../engine/state";
import { idx, cityById } from "../engine/state";
import { tribeById } from "../data/tribes";
import { UNITS } from "../data/units";
import { TILE_W, TILE_H, gridToWorld, drawOrder } from "./iso";
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
}

const TERRAIN_COLORS: Record<string, [string, string]> = {
  field: ["#8fce5e", "#6da844"],
  forest: ["#7dbb54", "#5c9a3c"],
  mountain: ["#b8b2a8", "#8f8a80"],
  water: ["#58b7e3", "#3f9ccb"],
  ocean: ["#2f7db3", "#256795"],
};

export function render(ctx: CanvasRenderingContext2D, state: GameState, view: ViewOptions): void {
  const { camera, width, height } = view;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  const order = drawOrder(state.size);
  const reachSet = new Set(view.reachable.map(([x, y]) => y * state.size + x));

  // Pass 1: tiles
  for (const [x, y] of order) {
    const i = idx(state, x, y);
    const explored = view.revealAll || view.explored[i] === 1;
    const tile = state.tiles[i];
    const [wx, wy] = gridToWorld(x, y);
    if (!explored) {
      drawCloud(ctx, wx, wy);
      continue;
    }
    drawTile(ctx, state, tile, wx, wy);
    if (reachSet.has(y * state.size + x)) {
      diamondPath(ctx, wx, wy);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
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
    const unit = state.units.find((u) => u.x === x && u.y === y);
    if (!unit) continue;
    const visible =
      view.revealAll ||
      unit.ownerId === view.viewerId ||
      (view.explored[i] === 1 && view.watched[i] === 1);
    if (!visible) continue;
    const [wx, wy] = gridToWorld(x, y);
    drawUnit(ctx, state, unit, wx, wy, unit.id === view.selectedUnitId, view.attackableUnitIds.includes(unit.id));
  }

  // Pass 3: city nameplates on top of everything (tiles drawn later would cover them)
  for (const city of state.cities) {
    const i = idx(state, city.x, city.y);
    if (!view.revealAll && view.explored[i] !== 1) continue;
    const [wx, wy] = gridToWorld(city.x, city.y);
    drawNameplate(ctx, state, city, wx, wy);
  }

  // Pass 4: floating combat text
  for (const ft of view.floatingTexts) {
    const [wx, wy] = gridToWorld(ft.x, ft.y);
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = 1 - ft.t;
    ctx.fillText(ft.text, wx, wy - TILE_H - 14 - ft.t * 22);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function diamondPath(ctx: CanvasRenderingContext2D, wx: number, wy: number): void {
  ctx.beginPath();
  ctx.moveTo(wx, wy - TILE_H / 2);
  ctx.lineTo(wx + TILE_W / 2, wy);
  ctx.lineTo(wx, wy + TILE_H / 2);
  ctx.lineTo(wx - TILE_W / 2, wy);
  ctx.closePath();
}

function drawCloud(ctx: CanvasRenderingContext2D, wx: number, wy: number): void {
  diamondPath(ctx, wx, wy);
  ctx.fillStyle = "#1a2436";
  ctx.fill();
  ctx.strokeStyle = "#141c2b";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(wx - 8, wy, 12, 6, 0, 0, Math.PI * 2);
  ctx.ellipse(wx + 6, wy - 3, 10, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#243149";
  ctx.fill();
}

function drawTile(ctx: CanvasRenderingContext2D, state: GameState, tile: Tile, wx: number, wy: number): void {
  const [top] = TERRAIN_COLORS[tile.terrain];
  diamondPath(ctx, wx, wy);
  ctx.fillStyle = top;
  ctx.fill();

  // territory tint + border
  if (tile.cityId !== null) {
    const city = cityById(state, tile.cityId);
    if (city && city.ownerId >= 0) {
      const tribe = tribeById(state.players[city.ownerId].tribeId);
      diamondPath(ctx, wx, wy);
      ctx.fillStyle = tribe.color + "2e";
      ctx.fill();
      diamondPath(ctx, wx, wy);
      ctx.strokeStyle = tribe.color + "88";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  } else {
    diamondPath(ctx, wx, wy);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (tile.terrain === "mountain") drawMountain(ctx, wx, wy);
  if (tile.terrain === "forest") drawTrees(ctx, wx, wy);
  if (tile.resource) drawResource(ctx, tile.resource, wx, wy);
  if (tile.building) drawBuilding(ctx, tile.building, wx, wy);
  if (tile.village) drawVillage(ctx, wx, wy);
  if (tile.cityHere !== null) {
    const city = cityById(state, tile.cityHere);
    if (city) drawCity(ctx, state, city, wx, wy);
  }
}

function drawMountain(ctx: CanvasRenderingContext2D, wx: number, wy: number): void {
  ctx.beginPath();
  ctx.moveTo(wx - 18, wy + 6);
  ctx.lineTo(wx - 4, wy - 18);
  ctx.lineTo(wx + 8, wy + 6);
  ctx.closePath();
  ctx.fillStyle = "#9a948a";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(wx - 1, wy + 8);
  ctx.lineTo(wx + 10, wy - 10);
  ctx.lineTo(wx + 19, wy + 8);
  ctx.closePath();
  ctx.fillStyle = "#b0aaa0";
  ctx.fill();
  // snow cap
  ctx.beginPath();
  ctx.moveTo(wx - 9, wy - 9);
  ctx.lineTo(wx - 4, wy - 18);
  ctx.lineTo(wx + 1, wy - 9);
  ctx.closePath();
  ctx.fillStyle = "#f1f2f4";
  ctx.fill();
}

function drawTrees(ctx: CanvasRenderingContext2D, wx: number, wy: number): void {
  for (const [dx, dy] of [
    [-12, 2],
    [2, -4],
    [10, 5],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(wx + dx - 6, wy + dy + 4);
    ctx.lineTo(wx + dx, wy + dy - 12);
    ctx.lineTo(wx + dx + 6, wy + dy + 4);
    ctx.closePath();
    ctx.fillStyle = "#3e7d32";
    ctx.fill();
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(wx + dx - 1.5, wy + dy + 4, 3, 4);
  }
}

function drawResource(ctx: CanvasRenderingContext2D, resource: string, wx: number, wy: number): void {
  const colors: Record<string, string> = {
    fruit: "#e5533d",
    animal: "#a9713f",
    fish: "#e8f4fa",
    metal: "#e8c14d",
    crop: "#f0d878",
  };
  ctx.beginPath();
  ctx.arc(wx + 16, wy - 6, 5, 0, Math.PI * 2);
  ctx.fillStyle = colors[resource] ?? "#fff";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBuilding(ctx: CanvasRenderingContext2D, building: string, wx: number, wy: number): void {
  if (building === "port") {
    ctx.fillStyle = "#8a6b45";
    ctx.fillRect(wx - 12, wy - 4, 24, 8);
    ctx.fillStyle = "#c9a468";
    ctx.fillRect(wx - 12, wy - 7, 24, 4);
    return;
  }
  // hut-style building
  ctx.fillStyle = building === "mine" ? "#7d7469" : building === "farm" ? "#caa64f" : "#8a6b45";
  ctx.fillRect(wx - 8, wy - 6, 16, 10);
  ctx.beginPath();
  ctx.moveTo(wx - 10, wy - 6);
  ctx.lineTo(wx, wy - 14);
  ctx.lineTo(wx + 10, wy - 6);
  ctx.closePath();
  ctx.fillStyle = building === "mine" ? "#5d564e" : "#a5522f";
  ctx.fill();
}

function drawVillage(ctx: CanvasRenderingContext2D, wx: number, wy: number): void {
  ctx.fillStyle = "#c8b79b";
  ctx.fillRect(wx - 9, wy - 5, 18, 9);
  ctx.beginPath();
  ctx.moveTo(wx - 11, wy - 5);
  ctx.lineTo(wx, wy - 14);
  ctx.lineTo(wx + 11, wy - 5);
  ctx.closePath();
  ctx.fillStyle = "#6d6152";
  ctx.fill();
}

function drawCity(ctx: CanvasRenderingContext2D, state: GameState, city: { ownerId: number; level: number; walls: boolean; isCapital: boolean; name: string }, wx: number, wy: number): void {
  const tribe = tribeById(state.players[city.ownerId].tribeId);

  if (city.walls) {
    diamondPath(ctx, wx, wy);
    ctx.strokeStyle = "#e8e2d6";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const houses = Math.min(4, 1 + Math.floor(city.level / 2));
  const spots: Array<[number, number]> = [
    [0, -2],
    [-12, 3],
    [12, 3],
    [0, 8],
  ];
  for (let h = 0; h < houses; h++) {
    const [dx, dy] = spots[h];
    ctx.fillStyle = "#e7dfd2";
    ctx.fillRect(wx + dx - 7, wy + dy - 6, 14, 9);
    ctx.beginPath();
    ctx.moveTo(wx + dx - 8, wy + dy - 6);
    ctx.lineTo(wx + dx, wy + dy - 13);
    ctx.lineTo(wx + dx + 8, wy + dy - 6);
    ctx.closePath();
    ctx.fillStyle = tribe.color;
    ctx.fill();
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
  const w = ctx.measureText(city.name).width + 26;
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
  const uy = wy - 8;

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

  if (unit.embarked) {
    // boat hull
    ctx.beginPath();
    ctx.moveTo(wx - 14, uy + 8);
    ctx.quadraticCurveTo(wx, uy + 16, wx + 14, uy + 8);
    ctx.lineTo(wx + 10, uy + 4);
    ctx.lineTo(wx - 10, uy + 4);
    ctx.closePath();
    ctx.fillStyle = "#8a6b45";
    ctx.fill();
    if (unit.embarked === "ship") {
      ctx.fillStyle = "#e8e2d6";
      ctx.beginPath();
      ctx.moveTo(wx, uy + 4);
      ctx.lineTo(wx, uy - 12);
      ctx.lineTo(wx + 10, uy - 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // body: circle head + shield-ish body in tribe color
  const shape = UNITS[unit.type];
  const r = unit.type === "giant" ? 11 : 8;
  ctx.beginPath();
  ctx.ellipse(wx, uy, r, r + 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = tribe.color;
  ctx.fill();
  ctx.strokeStyle = tribe.colorDark;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(wx, uy - r - 3, unit.type === "giant" ? 6 : 4.5, 0, Math.PI * 2);
  ctx.fillStyle = "#f2d3b3";
  ctx.fill();

  // weapon glyph hint by range/type
  ctx.strokeStyle = "#2c2c2c";
  ctx.lineWidth = 2;
  if (shape.range >= 2) {
    ctx.beginPath();
    ctx.arc(wx + r + 2, uy - 2, 5, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(wx + r + 1, uy + 4);
    ctx.lineTo(wx + r + 6, uy - 8);
    ctx.stroke();
  }

  if (unit.veteran) {
    ctx.fillStyle = "#ffd75e";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("★", wx - r - 4, uy - r);
  }

  // HP bar (only when damaged)
  if (unit.hp < unit.maxHp) {
    const hpw = 22;
    const frac = unit.hp / unit.maxHp;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(wx - hpw / 2, uy - r - 12, hpw, 4);
    ctx.fillStyle = frac > 0.5 ? "#5cd65c" : frac > 0.25 ? "#e8c14d" : "#e5533d";
    ctx.fillRect(wx - hpw / 2, uy - r - 12, hpw * frac, 4);
  }

  // dimmed if already acted (own units only get visual cue)
  if (unit.moved && unit.attacked) {
    ctx.beginPath();
    ctx.ellipse(wx, uy, r + 1, r + 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,25,35,0.35)";
    ctx.fill();
  }
}
