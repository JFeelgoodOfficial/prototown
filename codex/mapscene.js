/* Polyforge — a hand-authored map scene rendered with the engine's own
   isometric renderer (ported from src/render/renderer.ts + src/render/iso.ts),
   with unit art supplied by unitart.js. */
(function () {
  const TILE_W = 72, TILE_H = 36;
  const gridToWorld = (x, y) => [((x - y) * TILE_W) / 2, ((x + y) * TILE_H) / 2];
  function worldToGrid(wx, wy) {
    const fx = (wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2;
    const fy = (wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2;
    return [Math.round(fx), Math.round(fy)];
  }

  const TERRAIN_COLORS = {
    field: ["#8fce5e", "#6da844"],
    forest: ["#7dbb54", "#5c9a3c"],
    mountain: ["#b8b2a8", "#8f8a80"],
    water: ["#58b7e3", "#3f9ccb"],
    ocean: ["#2f7db3", "#256795"],
  };

  const CODES = { f: "field", F: "forest", m: "mountain", w: "water", o: "ocean" };
  const MAP = [
    "oowwFffff",
    "owwffFfmf",
    "wwfffffmm",
    "wffFffffm",
    "ffffcffff",
    "ffFfffFff",
    "fffffffmf",
    "wffvffffm",
    "wwffffffo",
  ];
  const SIZE = 9;

  const RESOURCES = { "6,1": "metal", "7,2": "metal", "3,3": "fruit", "5,5": "crop", "1,7": "fish", "2,0": "fish", "6,6": "animal" };
  const BUILDINGS = { "3,5": "lumber_hut", "5,4": "farm", "7,3": "mine", "2,6": "port" };

  const CITY = { x: 4, y: 4, name: "Emberhold", level: 4, walls: true, isCapital: true, mine: true };
  const CITY2 = { x: 7, y: 7, name: "Cindral", level: 2, walls: false, isCapital: false, mine: true };
  const VILLAGE = { x: 3, y: 7 };

  /** Every trainable form, laid out around the capital. */
  const UNITS = [
    { id: 1, type: "warrior", x: 3, y: 4, hp: 10, maxHp: 10 },
    { id: 2, type: "archer", x: 5, y: 3, hp: 7, maxHp: 10 },
    { id: 3, type: "defender", x: 4, y: 5, hp: 15, maxHp: 15, mine: true },
    { id: 4, type: "swordsman", x: 3, y: 6, hp: 15, maxHp: 15, veteran: true },
    { id: 5, type: "rider", x: 6, y: 4, hp: 10, maxHp: 10, acted: true },
    { id: 6, type: "knight", x: 5, y: 6, hp: 15, maxHp: 15 },
    { id: 7, type: "catapult", x: 6, y: 2, hp: 10, maxHp: 10 },
    { id: 8, type: "giant", x: 2, y: 3, hp: 34, maxHp: 40 },
    { id: 9, type: "ship", x: 1, y: 1, hp: 10, maxHp: 10, embarked: "ship", base: "archer" },
    { id: 10, type: "raft", x: 0, y: 4, hp: 10, maxHp: 10, embarked: "raft", base: "warrior" },
  ].map((u) => Object.assign({ mine: true }, u));

  const ENEMIES = [
    { id: 21, type: "warrior", x: 8, y: 1, hp: 10, maxHp: 10, mine: false },
    { id: 22, type: "swordsman", x: 8, y: 6, hp: 11, maxHp: 15, mine: false },
  ];

  const ALL = UNITS.concat(ENEMIES);
  const CLOUDS = ["8,0", "0,8", "8,8", "0,0"];

  function terrainAt(x, y) {
    const c = MAP[y][x];
    return CODES[c] || "field";
  }
  function cityTerritory(x, y) {
    if (Math.abs(x - CITY.x) <= 1 && Math.abs(y - CITY.y) <= 1) return "mine";
    if (Math.abs(x - CITY2.x) <= 1 && Math.abs(y - CITY2.y) <= 1) return "mine";
    return null;
  }

  /* --- primitives, verbatim in spirit from renderer.ts --- */
  function diamondPath(ctx, wx, wy) {
    ctx.beginPath();
    ctx.moveTo(wx, wy - TILE_H / 2);
    ctx.lineTo(wx + TILE_W / 2, wy);
    ctx.lineTo(wx, wy + TILE_H / 2);
    ctx.lineTo(wx - TILE_W / 2, wy);
    ctx.closePath();
  }
  function drawCloud(ctx, wx, wy) {
    diamondPath(ctx, wx, wy);
    ctx.fillStyle = "#1a2436"; ctx.fill();
    ctx.strokeStyle = "#141c2b"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(wx - 8, wy, 12, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(wx + 6, wy - 3, 10, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#243149"; ctx.fill();
  }
  function drawMountain(ctx, wx, wy) {
    ctx.beginPath();
    ctx.moveTo(wx - 18, wy + 6); ctx.lineTo(wx - 4, wy - 18); ctx.lineTo(wx + 8, wy + 6);
    ctx.closePath(); ctx.fillStyle = "#9a948a"; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(wx - 1, wy + 8); ctx.lineTo(wx + 10, wy - 10); ctx.lineTo(wx + 19, wy + 8);
    ctx.closePath(); ctx.fillStyle = "#b0aaa0"; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(wx - 9, wy - 9); ctx.lineTo(wx - 4, wy - 18); ctx.lineTo(wx + 1, wy - 9);
    ctx.closePath(); ctx.fillStyle = "#f1f2f4"; ctx.fill();
  }
  function drawTrees(ctx, wx, wy) {
    [[-12, 2], [2, -4], [10, 5]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(wx + dx - 6, wy + dy + 4);
      ctx.lineTo(wx + dx, wy + dy - 12);
      ctx.lineTo(wx + dx + 6, wy + dy + 4);
      ctx.closePath();
      ctx.fillStyle = "#3e7d32"; ctx.fill();
      ctx.fillStyle = "#6b4a2b";
      ctx.fillRect(wx + dx - 1.5, wy + dy + 4, 3, 4);
    });
  }
  function drawResource(ctx, resource, wx, wy) {
    const colors = { fruit: "#e5533d", animal: "#a9713f", fish: "#e8f4fa", metal: "#e8c14d", crop: "#f0d878" };
    ctx.beginPath();
    ctx.arc(wx + 16, wy - 6, 5, 0, Math.PI * 2);
    ctx.fillStyle = colors[resource] || "#fff"; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1; ctx.stroke();
  }
  function drawBuilding(ctx, building, wx, wy) {
    if (building === "port") {
      ctx.fillStyle = "#8a6b45"; ctx.fillRect(wx - 12, wy - 4, 24, 8);
      ctx.fillStyle = "#c9a468"; ctx.fillRect(wx - 12, wy - 7, 24, 4);
      return;
    }
    ctx.fillStyle = building === "mine" ? "#7d7469" : building === "farm" ? "#caa64f" : "#8a6b45";
    ctx.fillRect(wx - 8, wy - 6, 16, 10);
    ctx.beginPath();
    ctx.moveTo(wx - 10, wy - 6); ctx.lineTo(wx, wy - 14); ctx.lineTo(wx + 10, wy - 6);
    ctx.closePath();
    ctx.fillStyle = building === "mine" ? "#5d564e" : "#a5522f"; ctx.fill();
  }
  function drawVillage(ctx, wx, wy) {
    ctx.fillStyle = "#c8b79b"; ctx.fillRect(wx - 9, wy - 5, 18, 9);
    ctx.beginPath();
    ctx.moveTo(wx - 11, wy - 5); ctx.lineTo(wx, wy - 14); ctx.lineTo(wx + 11, wy - 5);
    ctx.closePath(); ctx.fillStyle = "#6d6152"; ctx.fill();
  }
  function drawCity(ctx, city, wx, wy, color) {
    if (city.walls) {
      diamondPath(ctx, wx, wy);
      ctx.strokeStyle = "#e8e2d6"; ctx.lineWidth = 3; ctx.stroke();
    }
    const houses = Math.min(4, 1 + Math.floor(city.level / 2));
    const spots = [[0, -2], [-12, 3], [12, 3], [0, 8]];
    for (let h = 0; h < houses; h++) {
      const [dx, dy] = spots[h];
      ctx.fillStyle = "#e7dfd2";
      ctx.fillRect(wx + dx - 7, wy + dy - 6, 14, 9);
      ctx.beginPath();
      ctx.moveTo(wx + dx - 8, wy + dy - 6);
      ctx.lineTo(wx + dx, wy + dy - 13);
      ctx.lineTo(wx + dx + 8, wy + dy - 6);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawNameplate(ctx, city, wx, wy, color) {
    ctx.font = "bold 11px sans-serif";
    const w = ctx.measureText(city.name).width + 26;
    ctx.fillStyle = "rgba(10,15,25,0.8)";
    roundRect(ctx, wx - w / 2, wy + TILE_H / 2 + 2, w, 16, 5); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    roundRect(ctx, wx - w / 2, wy + TILE_H / 2 + 2, w, 16, 5); ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = city.isCapital ? "#ffd75e" : "#9fd0ff";
    ctx.fillText(String(city.level), wx - w / 2 + 7, wy + TILE_H / 2 + 14);
    ctx.fillStyle = "#fff";
    ctx.fillText(city.name, wx - w / 2 + 18, wy + TILE_H / 2 + 14);
  }

  function drawOrder() {
    const order = [];
    for (let s = 0; s <= (SIZE - 1) * 2; s++) {
      for (let x = 0; x <= s; x++) {
        const y = s - x;
        if (x < SIZE && y < SIZE) order.push([x, y]);
      }
    }
    return order;
  }

  /** opts: { width, height, zoom, tribeId, enemyTribeId, selectedId, hoverTile, reachable } */
  function render(ctx, opts) {
    const A = window.PolyforgeArt;
    const tribe = A.TRIBES.find((t) => t.id === opts.tribeId) || A.TRIBES[0];
    const foe = A.TRIBES.find((t) => t.id === opts.enemyTribeId) || A.TRIBES[1];
    const { width, height } = opts;
    const zoom = opts.zoom || 1;

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2 + 20);
    ctx.scale(zoom, zoom);
    ctx.translate(0, -((SIZE - 1) * TILE_H) / 2);

    const order = drawOrder();
    const reach = new Set(opts.reachable || []);

    for (const [x, y] of order) {
      const [wx, wy] = gridToWorld(x, y);
      if (CLOUDS.indexOf(x + "," + y) >= 0) { drawCloud(ctx, wx, wy); continue; }
      const terrain = terrainAt(x, y);
      diamondPath(ctx, wx, wy);
      ctx.fillStyle = TERRAIN_COLORS[terrain][0];
      ctx.fill();

      if (cityTerritory(x, y)) {
        diamondPath(ctx, wx, wy);
        ctx.fillStyle = tribe.color + "2e"; ctx.fill();
        diamondPath(ctx, wx, wy);
        ctx.strokeStyle = tribe.color + "88"; ctx.lineWidth = 1.5; ctx.stroke();
      } else {
        diamondPath(ctx, wx, wy);
        ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1; ctx.stroke();
      }

      if (terrain === "mountain") drawMountain(ctx, wx, wy);
      if (terrain === "forest") drawTrees(ctx, wx, wy);
      const key = x + "," + y;
      if (RESOURCES[key]) drawResource(ctx, RESOURCES[key], wx, wy);
      if (BUILDINGS[key]) drawBuilding(ctx, BUILDINGS[key], wx, wy);
      if (VILLAGE.x === x && VILLAGE.y === y) drawVillage(ctx, wx, wy);
      if (CITY.x === x && CITY.y === y) drawCity(ctx, CITY, wx, wy, tribe.color);
      if (CITY2.x === x && CITY2.y === y) drawCity(ctx, CITY2, wx, wy, tribe.color);

      if (reach.has(key)) {
        diamondPath(ctx, wx, wy);
        ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (opts.hoverTile && opts.hoverTile[0] === x && opts.hoverTile[1] === y) {
        diamondPath(ctx, wx, wy);
        ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    for (const [x, y] of order) {
      const u = ALL.find((u) => u.x === x && u.y === y);
      if (!u) continue;
      const [wx, wy] = gridToWorld(x, y);
      if (u.id === opts.selectedId) {
        ctx.beginPath();
        ctx.ellipse(wx, wy + 4, 18, 9, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
      }
      if (!u.mine && opts.selectedId != null) {
        ctx.beginPath();
        ctx.ellipse(wx, wy + 4, 18, 9, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff5544"; ctx.lineWidth = 2.5; ctx.stroke();
      }
      A.drawCharacter(ctx, {
        tribe: u.mine ? tribe.id : foe.id,
        type: u.type,
        x: wx,
        y: wy + 4,
        scale: 0.62,
        veteran: !!u.veteran,
        acted: !!u.acted,
        hpFrac: u.hp / u.maxHp,
      });
    }

    [CITY, CITY2].forEach((c) => {
      const [wx, wy] = gridToWorld(c.x, c.y);
      drawNameplate(ctx, c, wx, wy, tribe.color);
    });

    ctx.restore();
  }

  /** Screen px -> unit under the cursor (or null). */
  function pick(px, py, opts) {
    const zoom = opts.zoom || 1;
    const wx = (px - opts.width / 2) / zoom;
    const wy = (py - (opts.height / 2 + 20)) / zoom + ((SIZE - 1) * TILE_H) / 2;
    const [gx, gy] = worldToGrid(wx, wy);
    if (gx < 0 || gy < 0 || gx >= SIZE || gy >= SIZE) return { tile: null, unit: null };
    return { tile: [gx, gy], unit: ALL.find((u) => u.x === gx && u.y === gy) || null };
  }

  function neighbors(u) {
    const out = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = u.x + dx, y = u.y + dy;
        if ((dx || dy) && x >= 0 && y >= 0 && x < SIZE && y < SIZE && !ALL.some((o) => o.x === x && o.y === y))
          out.push(x + "," + y);
      }
    return out;
  }

  window.PolyforgeScene = { render, pick, UNITS: ALL, CITY, neighbors, SIZE, terrainAt };
})();
