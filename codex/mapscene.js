/* Polyforge — hand-authored map scene on the engine's isometric renderer.

   The board is built as a carved slab of land: every tile top sits at its own
   height, so shorelines and mountain shoulders show real cliff faces, and the
   crust beneath each tile is shaded rock. Everything standing on the land —
   trees, ore, herds, huts, docks, cities — casts a contact shadow and is lit
   from the same upper-left key as the figures in unitart.js. */
(function () {
  const TILE_W = 72, TILE_H = 36;
  const gridToWorld = (x, y) => [((x - y) * TILE_W) / 2, ((x + y) * TILE_H) / 2];
  function worldToGrid(wx, wy) {
    const fx = (wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2;
    const fy = (wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2;
    return [Math.round(fx), Math.round(fy)];
  }

  const A = () => window.PolyforgeArt;
  const H = () => window.PolyforgeArt.H;

  /* deterministic per-tile noise */
  function hash(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ── terrain material: base, high tone, low tone, crust rock, height ──
     `lift` is the tile's base height above the water line and `jitter` the
     per-tile variation on top of it, so a field reads as rolling ground
     rather than a sheet of card. */
  const TERRAIN = {
    field:    { base: "#7ca34e", hi: "#a8c973", lo: "#4d6f31", wall: "#7a5c3c", wallLo: "#3a2a1a", rock: "#8b8073", lift: 7,  jitter: 3 },
    forest:   { base: "#688c44", hi: "#8dae62", lo: "#385428", wall: "#6d5636", wallLo: "#332617", rock: "#7f7466", lift: 8,  jitter: 3 },
    mountain: { base: "#9d9a92", hi: "#c6c2b8", lo: "#5f5b53", wall: "#736c62", wallLo: "#38342e", rock: "#8b857a", lift: 11, jitter: 6 },
    water:    { base: "#3f9ac4", hi: "#8fd6ef", lo: "#1e6690", wall: "#1a4c6d", wallLo: "#0e2f45", rock: "#3d5566", lift: 2,  jitter: 0 },
    ocean:    { base: "#22688f", hi: "#5aa8c8", lo: "#0e3d5c", wall: "#0d3350", wallLo: "#071f31", rock: "#2b4155", lift: 0,  jitter: 0 },
  };
  /* How far the rock crust hangs below a tile top. Deeper than any height
     difference on the board, so no seam ever opens between neighbours. */
  const CRUST = 18;

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

  const RESOURCES = { "7,1": "metal", "7,2": "metal", "3,3": "fruit", "5,5": "crop", "1,8": "fish", "2,0": "fish", "6,5": "animal" };
  const BUILDINGS = { "2,5": "lumber_hut", "5,4": "farm", "8,2": "mine", "0,7": "port" };
  const RUINS = ["1,3"];

  const CITY = { x: 4, y: 4, name: "Emberhold", level: 4, walls: true, isCapital: true, mine: true };
  const CITY2 = { x: 7, y: 7, name: "Cindral", level: 2, walls: false, isCapital: false, mine: true };
  const VILLAGE = { x: 3, y: 7 };

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
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return "ocean";
    return CODES[MAP[y][x]] || "field";
  }
  const isWater = (t) => t === "water" || t === "ocean";
  /** Height of a tile top, in pixels above the ocean surface. */
  function liftAt(x, y) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return 0;
    const m = TERRAIN[terrainAt(x, y)];
    return m.lift + Math.round(hash(x, y, 3) * m.jitter);
  }
  function cityTerritory(x, y) {
    if (Math.abs(x - CITY.x) <= 1 && Math.abs(y - CITY.y) <= 1) return "mine";
    if (Math.abs(x - CITY2.x) <= 1 && Math.abs(y - CITY2.y) <= 1) return "mine";
    return null;
  }

  /* ── tile geometry ── */
  function diamondPath(ctx, wx, wy) {
    ctx.beginPath();
    ctx.moveTo(wx, wy - TILE_H / 2);
    ctx.lineTo(wx + TILE_W / 2, wy);
    ctx.lineTo(wx, wy + TILE_H / 2);
    ctx.lineTo(wx - TILE_W / 2, wy);
    ctx.closePath();
  }

  /** The tile's four edges as [dx, dy, from, to], front faces last. */
  function tileEdges(wx, wy) {
    return [
      [0, -1, [wx - TILE_W / 2, wy], [wx, wy - TILE_H / 2]],
      [-1, 0, [wx, wy - TILE_H / 2], [wx + TILE_W / 2, wy]],
      [0, 1, [wx + TILE_W / 2, wy], [wx, wy + TILE_H / 2]],
      [1, 0, [wx, wy + TILE_H / 2], [wx - TILE_W / 2, wy]],
    ];
  }

  /** Soft contact shadow cast down-right, away from the key light. */
  function castShadow(ctx, x, y, rx, ry, a) {
    const s = a == null ? 0.3 : a;
    ctx.save();
    ctx.fillStyle = H().RG(ctx, x, y, Math.max(rx, ry),
      [[0, "rgba(14,18,12," + s + ")"], [0.55, "rgba(14,18,12," + s * 0.55 + ")"], [1, "rgba(14,18,12,0)"]]);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * The two visible crust faces under a lifted tile. Each is banded rock over
   * packed soil, so land reads as a slab carved out of the sea rather than a
   * painted diamond.
   */
  function crust(ctx, wx, wy, lift, m, x, y) {
    const depth = lift + CRUST;
    if (depth <= 0) return;
    const { G, dk, lt } = H();
    const top = wy;
    const faces = [
      { p: [wx - TILE_W / 2, top], q: [wx, top + TILE_H / 2], shade: 0 },
      { p: [wx + TILE_W / 2, top], q: [wx, top + TILE_H / 2], shade: 1 },
    ];
    faces.forEach((f) => {
      ctx.beginPath();
      ctx.moveTo(f.p[0], f.p[1]);
      ctx.lineTo(f.q[0], f.q[1]);
      ctx.lineTo(f.q[0], f.q[1] + depth);
      ctx.lineTo(f.p[0], f.p[1] + depth);
      ctx.closePath();
      const wall = f.shade ? dk(m.wall, 0.26) : m.wall;
      const wallLo = f.shade ? dk(m.wallLo, 0.3) : m.wallLo;
      ctx.fillStyle = G(ctx, 0, top, 0, top + TILE_H / 2 + depth,
        [[0, lt(wall, 0.1)], [0.28, wall], [1, wallLo]]);
      ctx.fill();

      if (isWater(terrainAt(x, y))) return;
      /* strata: a couple of exposed rock bands and a dirt line under the turf */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(f.p[0], f.p[1]);
      ctx.lineTo(f.q[0], f.q[1]);
      ctx.lineTo(f.q[0], f.q[1] + depth);
      ctx.lineTo(f.p[0], f.p[1] + depth);
      ctx.closePath();
      ctx.clip();
      for (let i = 0; i < 3; i++) {
        const off = 4 + i * 5 + hash(x, y, 60 + i + f.shade * 7) * 4;
        ctx.beginPath();
        ctx.moveTo(f.p[0], f.p[1] + off);
        ctx.lineTo(f.q[0], f.q[1] + off);
        ctx.strokeStyle = i % 2 ? "rgba(255,238,208,0.09)" : "rgba(18,12,8,0.22)";
        ctx.lineWidth = 1.4 + hash(x, y, 70 + i) * 1.6;
        ctx.stroke();
      }
      /* topsoil lip right under the grass */
      ctx.beginPath();
      ctx.moveTo(f.p[0], f.p[1] + 1);
      ctx.lineTo(f.q[0], f.q[1] + 1);
      ctx.strokeStyle = f.shade ? "rgba(58,40,22,0.55)" : "rgba(96,68,38,0.5)";
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.restore();
    });
  }

  /* ── tile tops ── */

  /** Inner edge shading: light catches the back rim, contact darkens the front. */
  function tileRim(ctx, wx, wy) {
    ctx.save();
    diamondPath(ctx, wx, wy);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(wx - TILE_W / 2, wy);
    ctx.lineTo(wx, wy - TILE_H / 2);
    ctx.lineTo(wx + TILE_W / 2, wy);
    ctx.strokeStyle = "rgba(255,250,224,0.16)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wx + TILE_W / 2, wy);
    ctx.lineTo(wx, wy + TILE_H / 2);
    ctx.lineTo(wx - TILE_W / 2, wy);
    ctx.strokeStyle = "rgba(16,20,12,0.16)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  /** Sand along any edge that meets water, with a pebble scatter. */
  function shoreSand(ctx, wx, wy, x, y) {
    const { G } = H();
    let any = false;
    ctx.save();
    diamondPath(ctx, wx, wy);
    ctx.clip();
    tileEdges(wx, wy).forEach(([dx, dy, p, q], ei) => {
      if (!isWater(terrainAt(x + dx, y + dy))) return;
      any = true;
      const t = 0.34;
      const ip = [p[0] + (wx - p[0]) * t, p[1] + (wy - p[1]) * t];
      const iq = [q[0] + (wx - q[0]) * t, q[1] + (wy - q[1]) * t];
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.quadraticCurveTo((q[0] + iq[0]) / 2 + 2, (q[1] + iq[1]) / 2, iq[0], iq[1]);
      ctx.quadraticCurveTo((iq[0] + ip[0]) / 2, (iq[1] + ip[1]) / 2 + (ei > 1 ? 3 : -3), ip[0], ip[1]);
      ctx.closePath();
      ctx.fillStyle = G(ctx, p[0], p[1], wx, wy,
        [[0, "rgba(233,214,166,0.92)"], [0.6, "rgba(211,190,143,0.6)"], [1, "rgba(190,176,130,0)"]]);
      ctx.fill();
    });
    if (any) {
      for (let i = 0; i < 7; i++) {
        const px = wx + (hash(x, y, 210 + i) - 0.5) * TILE_W * 0.8;
        const py = wy + (hash(x, y, 220 + i) - 0.5) * TILE_H * 0.8;
        ctx.beginPath();
        ctx.ellipse(px, py, 1 + hash(x, y, 230 + i) * 1.4, 0.7, 0, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? "rgba(255,248,224,0.5)" : "rgba(92,74,48,0.35)";
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function grassTop(ctx, wx, wy, x, y, m, terrain) {
    const { G, mix, lt, dk } = H();
    diamondPath(ctx, wx, wy);
    const tone = mix(m.base, hash(x, y, 1) > 0.5 ? m.hi : m.lo, 0.18 + hash(x, y, 2) * 0.14);
    ctx.fillStyle = G(ctx, wx - TILE_W / 2, wy - TILE_H / 2, wx + TILE_W / 2, wy + TILE_H / 2,
      [[0, lt(tone, 0.2)], [0.5, tone], [1, dk(tone, 0.26)]]);
    ctx.fill();

    ctx.save();
    diamondPath(ctx, wx, wy); ctx.clip();
    /* soil mottling — sun-bleached patches and damp hollows */
    for (let i = 0; i < 5; i++) {
      const r = 9 + hash(x, y, 10 + i) * 14;
      const px = wx + (hash(x, y, 20 + i) - 0.5) * TILE_W * 0.7;
      const py = wy + (hash(x, y, 30 + i) - 0.5) * TILE_H * 0.7;
      ctx.fillStyle = H().RG(ctx, px, py, r,
        i % 2 ? [[0, "rgba(255,246,214,0.14)"], [1, "rgba(255,246,214,0)"]]
              : [[0, "rgba(38,52,24,0.2)"], [1, "rgba(38,52,24,0)"]]);
      ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    /* grass blades, denser and darker under forest canopy */
    const n = terrain === "forest" ? 22 : 18;
    for (let i = 0; i < n; i++) {
      const px = wx + (hash(x, y, 100 + i) - 0.5) * TILE_W * 0.86;
      const py = wy + (hash(x, y, 200 + i) - 0.5) * TILE_H * 0.86;
      const h = 2.6 + hash(x, y, 300 + i) * 3.2;
      const sway = (hash(x, y, 400 + i) - 0.5) * 2.6;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + sway * 0.5, py - h * 0.7, px + sway, py - h);
      ctx.strokeStyle = i % 3 === 0 ? "rgba(196,224,140,0.55)" : "rgba(52,78,34,0.45)";
      ctx.lineWidth = 0.9; ctx.lineCap = "round"; ctx.stroke();
    }
    /* pebbles, and a wildflower or two on open field */
    for (let i = 0; i < 3; i++) {
      const px = wx + (hash(x, y, 500 + i) - 0.5) * TILE_W * 0.7;
      const py = wy + (hash(x, y, 510 + i) - 0.5) * TILE_H * 0.7;
      const r = 1 + hash(x, y, 520 + i) * 1.5;
      ctx.beginPath(); ctx.ellipse(px + 0.6, py + 0.6, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(24,28,18,0.28)"; ctx.fill();
      ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? "rgba(186,182,168,0.75)" : "rgba(146,140,126,0.7)"; ctx.fill();
    }
    if (terrain === "field" && hash(x, y, 530) > 0.55) {
      for (let i = 0; i < 4; i++) {
        const px = wx + (hash(x, y, 540 + i) - 0.5) * TILE_W * 0.6;
        const py = wy + (hash(x, y, 550 + i) - 0.5) * TILE_H * 0.6;
        ctx.beginPath(); ctx.arc(px, py - 2.4, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = hash(x, y, 560 + i) > 0.5 ? "rgba(255,236,150,0.85)" : "rgba(246,214,232,0.8)";
        ctx.fill();
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 2);
        ctx.strokeStyle = "rgba(72,102,44,0.7)"; ctx.lineWidth = 0.8; ctx.stroke();
      }
    }
    ctx.restore();
    tileRim(ctx, wx, wy);
    shoreSand(ctx, wx, wy, x, y);
  }

  function rockTop(ctx, wx, wy, x, y, m) {
    const { G, lt, dk } = H();
    diamondPath(ctx, wx, wy);
    ctx.fillStyle = G(ctx, wx - TILE_W / 2, wy - TILE_H / 2, wx + TILE_W / 2, wy + TILE_H / 2,
      [[0, lt(m.base, 0.24)], [0.55, m.base], [1, dk(m.base, 0.3)]]);
    ctx.fill();
    ctx.save();
    diamondPath(ctx, wx, wy); ctx.clip();
    /* fractured slabs: angular facets rather than round blobs */
    for (let i = 0; i < 5; i++) {
      const px = wx + (hash(x, y, 50 + i) - 0.5) * TILE_W * 0.72;
      const py = wy + (hash(x, y, 60 + i) - 0.5) * TILE_H * 0.72;
      const r = 4 + hash(x, y, 70 + i) * 8;
      ctx.beginPath();
      ctx.moveTo(px - r, py);
      ctx.lineTo(px - r * 0.3, py - r * 0.42);
      ctx.lineTo(px + r * 0.7, py - r * 0.28);
      ctx.lineTo(px + r, py + r * 0.2);
      ctx.lineTo(px - r * 0.2, py + r * 0.44);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? "rgba(244,244,238,0.14)" : "rgba(44,42,38,0.16)";
      ctx.fill();
      ctx.strokeStyle = "rgba(38,36,32,0.18)"; ctx.lineWidth = 0.8; ctx.stroke();
    }
    /* frost in the cracks */
    for (let i = 0; i < 3; i++) {
      const px = wx + (hash(x, y, 80 + i) - 0.5) * TILE_W * 0.6;
      const py = wy + (hash(x, y, 90 + i) - 0.5) * TILE_H * 0.6;
      ctx.beginPath();
      ctx.moveTo(px - 6, py);
      ctx.quadraticCurveTo(px, py - 2, px + 7, py + 1);
      ctx.strokeStyle = "rgba(236,244,252,0.3)"; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    tileRim(ctx, wx, wy);
    shoreSand(ctx, wx, wy, x, y);
  }

  function waterTop(ctx, wx, wy, x, y, m) {
    const { G, lt, dk } = H();
    diamondPath(ctx, wx, wy);
    ctx.fillStyle = G(ctx, wx, wy - TILE_H / 2, wx, wy + TILE_H / 2,
      [[0, lt(m.base, 0.2)], [0.5, m.base], [1, dk(m.base, 0.28)]]);
    ctx.fill();

    ctx.save();
    diamondPath(ctx, wx, wy); ctx.clip();
    /* depth pooling toward the far edge */
    ctx.fillStyle = G(ctx, wx, wy - TILE_H / 2, wx, wy + TILE_H / 2,
      [[0, "rgba(6,32,52,0.3)"], [0.6, "rgba(6,32,52,0)"]]);
    ctx.fillRect(wx - TILE_W / 2, wy - TILE_H / 2, TILE_W, TILE_H);
    /* shallows brighten where the tile touches land */
    tileEdges(wx, wy).forEach(([dx, dy, p, q]) => {
      if (isWater(terrainAt(x + dx, y + dy))) return;
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      ctx.fillStyle = H().RG(ctx, mx, my, 26,
        [[0, "rgba(150,226,235,0.34)"], [1, "rgba(150,226,235,0)"]]);
      ctx.beginPath(); ctx.ellipse(mx, my, 26, 15, 0, 0, Math.PI * 2); ctx.fill();
    });
    /* ripple bands */
    for (let i = 0; i < 5; i++) {
      const off = -TILE_H / 2 + (TILE_H / 5) * (i + hash(x, y, 80 + i) * 0.6);
      const w = TILE_W * (0.22 + hash(x, y, 90 + i) * 0.3);
      const cx = wx + (hash(x, y, 95 + i) - 0.5) * TILE_W * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, wy + off);
      ctx.quadraticCurveTo(cx, wy + off - 1.6, cx + w / 2, wy + off);
      ctx.strokeStyle = i % 2 ? "rgba(215,245,255,0.32)" : "rgba(8,44,68,0.26)";
      ctx.lineWidth = 1.1; ctx.stroke();
    }
    /* specular sheen from the key light, plus scattered caustic sparkles */
    ctx.fillStyle = H().RG(ctx, wx - 14, wy - 8, 26,
      [[0, "rgba(255,255,255,0.3)"], [1, "rgba(255,255,255,0)"]]);
    ctx.beginPath(); ctx.ellipse(wx - 14, wy - 8, 26, 11, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const px = wx + (hash(x, y, 600 + i) - 0.5) * TILE_W * 0.8;
      const py = wy + (hash(x, y, 610 + i) - 0.5) * TILE_H * 0.8;
      const w = 2 + hash(x, y, 620 + i) * 4;
      ctx.beginPath();
      ctx.moveTo(px - w, py); ctx.lineTo(px + w, py - 0.8);
      ctx.strokeStyle = "rgba(255,255,255," + (0.16 + hash(x, y, 630 + i) * 0.24) + ")";
      ctx.lineWidth = 0.9; ctx.stroke();
    }
    ctx.restore();

    /* foam where the tile meets a lifted shore */
    tileEdges(wx, wy).forEach(([dx, dy, p, q]) => {
      if (isWater(terrainAt(x + dx, y + dy))) return;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      ctx.quadraticCurveTo(mx + (dx - dy) * 1.5, my - 2, q[0], q[1]);
      ctx.strokeStyle = "rgba(236,250,255,0.62)"; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.strokeStyle = "rgba(236,250,255,0.24)"; ctx.lineWidth = 4.5; ctx.stroke();
    });
  }

  function drawCloud(ctx, wx, wy) {
    const { G, RG } = H();
    diamondPath(ctx, wx, wy);
    ctx.fillStyle = G(ctx, wx, wy - TILE_H / 2, wx, wy + TILE_H / 2, [[0, "#26324a"], [1, "#141c2b"]]);
    ctx.fill();
    ctx.save();
    diamondPath(ctx, wx, wy); ctx.clip();
    [[-10, 1, 14, 7], [7, -3, 11, 6], [0, 6, 12, 5]].forEach(([dx, dy, rx, ry], i) => {
      ctx.fillStyle = RG(ctx, wx + dx, wy + dy, rx,
        [[0, i ? "rgba(96,116,152,0.5)" : "rgba(120,142,180,0.55)"], [1, "rgba(90,110,145,0)"]]);
      ctx.beginPath(); ctx.ellipse(wx + dx, wy + dy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  /* ── mountains ── */
  function drawMountain(ctx, wx, wy, x, y) {
    const { plate, ao, spec, dk, lt } = H();
    const s = 1 + hash(x, y, 5) * 0.22;
    ctx.save();
    ctx.translate(wx, wy);
    castShadow(ctx, 12 * s, 7, 24 * s, 9 * s, 0.34);
    ao(ctx, 0, 4, 22 * s, 0.3);
    const rock = "#8d8880", rockLo = "#3c3934";
    /* back ridge */
    plate(ctx, [[-20 * s, 8], [-6 * s, -22 * s], [6 * s, 8]], dk(rock, 0.22),
      { hi: lt(rock, 0.1), lo: rockLo, rimA: 0.3 });
    /* main peak, two facets */
    plate(ctx, [[-4 * s, 10], [9 * s, -30 * s], [10 * s, 10]], rock,
      { hi: lt(rock, 0.4), lo: rockLo, rimA: 0.35 });
    plate(ctx, [[9 * s, -30 * s], [22 * s, 10], [10 * s, 10]], dk(rock, 0.3),
      { hi: rock, lo: dk(rockLo, 0.2), rimA: 0.35 });
    /* fracture lines down the lit facet */
    for (let i = 0; i < 3; i++) {
      const t = 0.24 + i * 0.24;
      H().stroke(ctx, [[9 * s - (9 * s + 4 * s) * t * 0.5, -30 * s + (40 * s) * t],
                       [9 * s - (9 * s + 4 * s) * (t + 0.16) * 0.5, -30 * s + (40 * s) * (t + 0.2)]],
        i % 2 ? "rgba(255,250,238,0.18)" : "rgba(28,26,22,0.3)", 1);
    }
    /* snow cap with a wind lip */
    plate(ctx, [[3.4 * s, -19 * s], [9 * s, -30 * s], [14.6 * s, -19 * s], [10.5 * s, -21.4 * s], [7 * s, -18 * s]],
      "#e6ecf2", { hi: "#ffffff", lo: "#a9bccb", rimA: 0.18 });
    spec(ctx, 7 * s, -25 * s, 3.6 * s, 6 * s, -0.5, 0.4);
    /* scree fanning out from the base */
    for (let i = 0; i < 7; i++) {
      const px = (hash(x, y, 40 + i) - 0.5) * 36 * s;
      const py = 6 + hash(x, y, 45 + i) * 6;
      const r = 1.6 + hash(x, y, 47 + i) * 2;
      ctx.beginPath(); ctx.ellipse(px + 0.8, py + 0.8, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(22,26,18,0.3)"; ctx.fill();
      ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? "rgba(200,196,188,0.6)" : "rgba(112,106,98,0.6)"; ctx.fill();
    }
    ctx.restore();
  }

  /* ── forests: one silhouette per tribe ── */
  const TREES = {
    ashfen: { trunk: "#4a3226", canopy: "#5f7343", canopyHi: "#93a763", shape: "spire", ember: true },
    korvani: { trunk: "#5b4b3a", canopy: "#4f7d6d", canopyHi: "#84b2a0", shape: "wind" },
    meridia: { trunk: "#8a7554", canopy: "#8ea350", canopyHi: "#c6cf7c", shape: "round" },
    thornwood: { trunk: "#4d3b28", canopy: "#3f6f37", canopyHi: "#7aa85a", shape: "broad", bramble: true },
  };

  function tree(ctx, T, s) {
    const { limb, plate, orb, dk, lt } = H();
    /* root flare, then the trunk, so the tree grows out of the ground */
    ctx.beginPath();
    ctx.ellipse(0.4 * s, 0.4 * s, 3.4 * s, 1.5 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = dk(T.trunk, 0.3); ctx.fill();
    limb(ctx, [0.6 * s, 0], [-0.4 * s, -9 * s], 2.1 * s, 1.4 * s, T.trunk,
      { hi: lt(T.trunk, 0.32), lo: dk(T.trunk, 0.5) });
    /* bark grain */
    for (let i = 0; i < 2; i++) {
      H().stroke(ctx, [[(-0.2 + i * 1.1) * s, -1 * s], [(-0.8 + i * 1.1) * s, -8 * s]],
        i ? "rgba(255,236,208,0.14)" : "rgba(18,12,8,0.3)", 0.8 * s);
    }
    if (T.shape === "spire") {
      for (let i = 0; i < 3; i++) {
        const yy = -7 * s - i * 5.4 * s, w = (8.4 - i * 2.2) * s;
        plate(ctx, [[-w, yy], [-w * 0.45, yy - 2 * s], [0, yy - 8 * s], [w * 0.45, yy - 2 * s], [w, yy]],
          i === 0 ? dk(T.canopy, 0.14) : T.canopy,
          { hi: T.canopyHi, lo: dk(T.canopy, 0.55), rimA: 0.28 });
        /* needle sprays catching the light on the left edge */
        H().stroke(ctx, [[-w * 0.8, yy - 0.6 * s], [-w * 0.3, yy - 3.4 * s]], "rgba(190,214,140,0.3)", 0.9 * s);
      }
    } else if (T.shape === "wind") {
      plate(ctx, [[-8 * s, -8 * s], [-2 * s, -19 * s], [7 * s, -17 * s], [10 * s, -9 * s], [1 * s, -6 * s]],
        T.canopy, { hi: T.canopyHi, lo: dk(T.canopy, 0.5), rimA: 0.28 });
      orb(ctx, 5 * s, -14 * s, 5 * s, 3.4 * s, lt(T.canopy, 0.12), { hi: T.canopyHi, rim: false });
      orb(ctx, -3.4 * s, -12.4 * s, 3.4 * s, 2.4 * s, dk(T.canopy, 0.2), { rim: false });
    } else if (T.shape === "round") {
      orb(ctx, 0, -13 * s, 8.4 * s, 7.4 * s, T.canopy, { hi: T.canopyHi, lo: dk(T.canopy, 0.5) });
      orb(ctx, -3 * s, -16 * s, 4.6 * s, 3.4 * s, lt(T.canopy, 0.2), { rim: false });
      orb(ctx, 4.4 * s, -10 * s, 3.6 * s, 2.8 * s, dk(T.canopy, 0.24), { rim: false });
    } else {
      orb(ctx, -2 * s, -12 * s, 7.6 * s, 6 * s, T.canopy, { hi: T.canopyHi, lo: dk(T.canopy, 0.55) });
      orb(ctx, 5 * s, -14.5 * s, 5.6 * s, 4.6 * s, dk(T.canopy, 0.12), { hi: T.canopyHi, lo: dk(T.canopy, 0.5) });
      orb(ctx, -4 * s, -15 * s, 4 * s, 3 * s, lt(T.canopy, 0.18), { rim: false });
      orb(ctx, 1.6 * s, -8.6 * s, 4.2 * s, 2.8 * s, dk(T.canopy, 0.3), { rim: false });
    }
    if (T.ember) {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc((-4 + i * 4) * s, (-10 - i * 3.5) * s, 0.9 * s, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? "rgba(255,176,84,0.9)" : "rgba(255,110,60,0.8)"; ctx.fill();
      }
    }
    if (T.bramble) {
      for (let i = 0; i < 4; i++) {
        const a = -0.4 - i * 0.5;
        H().stroke(ctx, [[0, -1 * s], [Math.cos(a) * 7 * s, -2 * s + Math.sin(a) * 5 * s]],
          "rgba(58,44,26,0.75)", 1 * s);
      }
    }
  }

  function drawTrees(ctx, wx, wy, x, y, tribeId) {
    const { ao } = H();
    const T = TREES[tribeId] || TREES.thornwood;
    const spots = [[-13, 3], [3, -5], [11, 6], [-4, 8]];
    /* undergrowth first, so the trunks sit in it */
    for (let i = 0; i < 5; i++) {
      const px = wx + (hash(x, y, 700 + i) - 0.5) * TILE_W * 0.7;
      const py = wy + (hash(x, y, 710 + i) - 0.5) * TILE_H * 0.7;
      ctx.beginPath();
      ctx.ellipse(px, py, 3.4, 1.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? "rgba(44,72,32,0.5)" : "rgba(74,104,46,0.42)";
      ctx.fill();
    }
    spots.forEach(([dx, dy], i) => {
      if (i === 3 && hash(x, y, 7) < 0.45) return;
      const s = 0.82 + hash(x, y, 11 + i) * 0.4;
      ctx.save();
      ctx.translate(wx + dx + (hash(x, y, 15 + i) - 0.5) * 3, wy + dy);
      castShadow(ctx, 7 * s, 2 * s, 10 * s, 4 * s, 0.32);
      ao(ctx, 0, 1, 8 * s, 0.36);
      tree(ctx, T, s);
      ctx.restore();
    });
  }

  /* ── items on the land ── */
  function drawResource(ctx, resource, wx, wy, x, y, k) {
    const { plate, orb, limb, ao, stroke, spec, dk, lt } = H();
    ctx.save();
    ctx.translate(wx + 15, wy - 2);

    if (resource === "fruit") {
      castShadow(ctx, 5, 4, 12, 5, 0.32);
      ao(ctx, 0, 2, 9, 0.3);
      /* a low fruit tree: short trunk, layered leaf mass, ripe fruit, windfall */
      limb(ctx, [0, 2], [-0.6, -5], 1.8, 1.3, "#5a4028", { hi: "#8d6a44", lo: "#2b1d11" });
      orb(ctx, -2.6, -8.6, 6.4, 4.8, "#456b31", { hi: "#7fa54f", lo: "#22381a" });
      orb(ctx, 3, -9.6, 5, 4, "#3d6029", { hi: "#79a04a", lo: "#1d3115" });
      orb(ctx, -1, -12.4, 3.6, 2.6, "#5b8340", { hi: "#9dc46a", rim: false });
      [[-3.6, -7.4], [2.8, -6.6], [0.2, -10.6], [4.6, -10.4]].forEach(([dx, dy], i) => {
        orb(ctx, dx, dy, 2, 1.9, i % 2 ? "#d2452f" : "#e2643a", { hi: "#ff9f78", lo: "#69180f" });
        spec(ctx, dx - 0.7, dy - 0.8, 0.7, 0.6, 0, 0.5);
      });
      orb(ctx, 6.4, 2.6, 1.8, 1.4, "#c33f2b", { hi: "#ff8f6a", lo: "#5e150d" });
      ctx.restore(); return;
    }

    if (resource === "crop") {
      ctx.translate(-6, 0);
      castShadow(ctx, 6, 4, 14, 5, 0.28);
      /* two rows of wheat with grain heads, and a leaning sheaf */
      for (let r = 0; r < 2; r++) {
        for (let i = -1; i <= 1; i++) {
          const bx = i * 4.4 + r * 2.2, by = 2 - r * 3.4;
          limb(ctx, [bx, by], [bx + 0.8, by - 9], 1.2, 0.7, "#c9a24a", { hi: "#f2dc9c", lo: "#6f5119" });
          for (let g = 0; g < 3; g++) {
            orb(ctx, bx + 0.8 + (g % 2 ? 0.9 : -0.9), by - 9 - g * 1.6, 1.1, 0.9,
              "#e6c463", { hi: "#fff2b6", lo: "#7d5c1c", rim: false });
          }
          stroke(ctx, [[bx + 0.8, by - 10.4], [bx + 2.4, by - 13.4]], "rgba(248,228,166,0.75)", 0.9);
        }
      }
      ctx.restore(); return;
    }

    if (resource === "metal") {
      castShadow(ctx, 5, 4, 12, 5, 0.34);
      ao(ctx, 0, 2, 9, 0.32);
      /* a split boulder with an exposed vein and two raw crystals */
      plate(ctx, [[-8, 3], [-5, -6], [1, -9], [6, -6], [8, 3]], "#6f6a62",
        { hi: "#b3ada2", lo: "#2d2a26", rimA: 0.42, spec: true, specA: 0.3 });
      plate(ctx, [[-2, 3], [0, -7], [4, -5.4], [4.4, 3]], "#5b564f",
        { hi: "#918a80", lo: "#221f1c", rimA: 0.3 });
      /* ore vein threading the face */
      stroke(ctx, [[-6, 0], [-2.6, -2.6], [0.6, -1.4], [3.6, -4]], "#d8b84f", 1.6);
      stroke(ctx, [[-6, 0], [-2.6, -2.6], [0.6, -1.4], [3.6, -4]], "rgba(255,240,176,0.5)", 0.7);
      [[-3.4, -4.6], [3, -6.4]].forEach(([dx, dy], i) => {
        plate(ctx, [[dx - 1.8, dy + 2], [dx - 0.6, dy - 2.6], [dx + 1.4, dy - 1.6], [dx + 1.8, dy + 2]],
          i ? "#e0bb52" : "#d3ad46", { hi: "#fff2b0", lo: "#7a5c12", rimA: 0.35, spec: true });
      });
      spec(ctx, -2.4, -5.4, 1.4, 2.2, -0.4, 0.55);
      ctx.restore(); return;
    }

    if (resource === "animal") {
      ctx.translate(-4, 1);
      castShadow(ctx, 4, 3, 13, 4.6, 0.32);
      /* a grazing deer: four legs, deep chest, neck bent to the grass */
      [[-5.4, -0.6], [-3.4, -0.2], [3.4, -0.4], [5, 0]].forEach(([dx, dy], i) =>
        limb(ctx, [dx, dy - 5.6], [dx + (i > 1 ? 0.6 : -0.4), dy + 1.6], 1.2, 0.8,
          i % 2 ? "#8c5c31" : "#9a663a", { hi: "#c08c56", lo: "#3e2512" }));
      limb(ctx, [-5, -7.2], [5, -7.8], 3.6, 3, "#a9713f", { hi: "#dda86f", lo: "#4c2f18" });
      orb(ctx, -5.6, -6.6, 2.4, 2.2, "#b87d48", { hi: "#e2ad76", lo: "#4c2f18", rim: false });
      /* white rump patch and flank dapples */
      orb(ctx, -4.6, -8.2, 1.8, 1.1, "rgba(244,232,210,0.75)", { rim: false });
      [[-1.4, -8.6], [1.6, -7.8]].forEach(([dx, dy]) =>
        orb(ctx, dx, dy, 1, 0.7, "rgba(248,236,214,0.5)", { rim: false }));
      limb(ctx, [4.4, -8], [7.4, -10.6], 2.4, 1.7, "#b07543", { hi: "#dca86e", lo: "#472a14" });
      orb(ctx, 8.4, -11.4, 2.7, 2.1, "#b87d48", { hi: "#e2ad76", lo: "#4c2f18" });
      orb(ctx, 9.8, -11.2, 1.1, 0.8, "#7a4c26", { rim: false });
      /* ear and antlers */
      plate(ctx, [[7.2, -12.6], [6, -14.6], [8, -13.4]], "#9a663a", { hi: "#c99163", lo: "#3e2512", rimA: 0.3 });
      stroke(ctx, [[8, -13], [8.8, -16.4]], "#e8dcc2", 1.1);
      stroke(ctx, [[8.8, -16.4], [7.4, -18.2]], "#e8dcc2", 0.9);
      stroke(ctx, [[8.8, -16.4], [10.6, -17.6]], "#e8dcc2", 0.9);
      stroke(ctx, [[9.4, -12.6], [11.2, -15]], "#e8dcc2", 1);
      stroke(ctx, [[11.2, -15], [12.4, -16.6]], "#e8dcc2", 0.8);
      /* tail */
      orb(ctx, -6.6, -7.8, 1.3, 1.9, "#f0e2c8", { rim: false });
      ctx.restore(); return;
    }

    if (resource === "fish") {
      /* a fish breaking the surface, with splash rings and droplets */
      ctx.translate(-15, 3);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 3 - 3, i * 1.6 - 1, 9 - i * 2.4, 4 - i, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(238,252,255," + (0.55 - i * 0.14) + ")";
        ctx.lineWidth = 1.2; ctx.stroke();
      }
      ctx.save();
      ctx.rotate(-0.5);
      orb(ctx, 2, -6, 4.6, 2.3, "#8fc7dd", { hi: "#eaf9ff", lo: "#2f5f78" });
      plate(ctx, [[-2.2, -6], [-6, -8.6], [-5.6, -3.6]], "#7ab3cb", { hi: "#dff2fa", lo: "#2a5468", rimA: 0.3 });
      plate(ctx, [[1.6, -8], [3.4, -10.4], [4.4, -7.6]], "#7ab3cb", { hi: "#dff2fa", lo: "#2a5468", rimA: 0.3 });
      spec(ctx, 3, -6.8, 1.6, 0.9, -0.3, 0.6);
      ctx.beginPath(); ctx.arc(5.2, -6.2, 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "#12303e"; ctx.fill();
      ctx.restore();
      [[-4, -11], [6, -12.6], [1, -14]].forEach(([dx, dy], i) => {
        ctx.beginPath(); ctx.ellipse(dx, dy, 1 + i * 0.2, 1.4 + i * 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(226,246,255,0.7)"; ctx.fill();
      });
      ctx.restore(); return;
    }
    ctx.restore();
  }

  /* ── buildings, tribe-flavoured ── */
  function roof(ctx, cx, cy, halfW, h, color, opts) {
    const { plate, stroke, dk, lt } = H();
    opts = opts || {};
    plate(ctx, [[cx - halfW, cy], [cx, cy - h], [cx + 1.5, cy - h], [cx + 2, cy]], lt(color, 0.18),
      { hi: lt(color, 0.4), lo: dk(color, 0.3), rimA: 0.4 });
    plate(ctx, [[cx + 2, cy], [cx + 1.5, cy - h], [cx + halfW, cy]], dk(color, 0.34),
      { hi: color, lo: dk(color, 0.6), rimA: 0.4 });
    /* shingle courses running with each slope */
    const rows = opts.rows == null ? 4 : opts.rows;
    for (let i = 1; i <= rows; i++) {
      const t = i / (rows + 1);
      stroke(ctx, [[cx - halfW + halfW * t, cy - h * t], [cx + 1.5, cy - h * t]],
        "rgba(20,14,10,0.2)", 0.9);
      stroke(ctx, [[cx + 2, cy - h * t], [cx + halfW - (halfW - 2) * t, cy - h * t]],
        "rgba(20,14,10,0.24)", 0.9);
    }
    /* ridge beam catching the light */
    stroke(ctx, [[cx - 0.4, cy - h - 0.6], [cx + 2, cy - h - 0.6]], lt(color, 0.55), 1.6);
  }

  function wall(ctx, x, y, w, h, col) {
    const { plate, dk, lt } = H();
    plate(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], col,
      { hi: lt(col, 0.26), lo: dk(col, 0.34), rimA: 0.4, horiz: true });
  }

  /** A lit window — the cheapest way to make a building look inhabited. */
  function window_(ctx, x, y, w, h) {
    const { plate } = H();
    plate(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], "#2a1d12",
      { hi: "#4a3524", lo: "#120c07", rimA: 0.4 });
    ctx.fillStyle = H().RG(ctx, x + w / 2, y + h / 2, w * 1.6,
      [[0, "rgba(255,196,104,0.85)"], [0.5, "rgba(255,170,80,0.35)"], [1, "rgba(255,170,80,0)"]]);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w * 1.6, h * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,214,140,0.9)";
    ctx.fillRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4);
    ctx.strokeStyle = "rgba(40,26,14,0.7)"; ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
  }

  /** A thread of smoke, so chimneys read as lived-in. */
  function smoke(ctx, x, y, n) {
    for (let i = 0; i < (n || 4); i++) {
      ctx.beginPath();
      ctx.arc(x + i * 1.6 + Math.sin(i) * 1.2, y - i * 4.2, 1.6 + i * 1.1, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(216,214,206," + (0.3 - i * 0.055) + ")";
      ctx.fill();
    }
  }

  /** A small tribe token every worked site wears, so holdings read as owned. */
  function tribeMark(ctx, k, dx, dy) {
    const { orb, limb, stroke, MAT } = H();
    ctx.save();
    ctx.translate(dx, dy);
    if (k.id === "ashfen") {
      limb(ctx, [0, 0], [0, -5], 2.4, 3, "#4c4442", { hi: "#8a7d76", lo: "#1d1a19" });
      orb(ctx, 0, -6.4, 2.6, 1.6, "#ff8a3c", { hi: "#ffe1a8", lo: "#8f2f10", rim: false });
      orb(ctx, 0, -8.6, 1.4, 1.8, "rgba(255,190,110,0.45)", { rim: false });
    } else if (k.id === "korvani") {
      stroke(ctx, [[-4, -9], [4, -8]], MAT.woodLo, 1.2);
      for (let i = -1; i <= 1; i++) {
        stroke(ctx, [[i * 3, -8.4], [i * 3 + 0.6, -3]], "rgba(200,214,196,0.6)", 0.8);
        orb(ctx, i * 3 + 0.6, -2.4, 1.5, 1.5, "#3f7f96", { hi: "#9fd8e8", lo: "#123a4a" });
      }
    } else if (k.id === "meridia") {
      limb(ctx, [0, 0], [0, -10], 1, 0.9, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
      orb(ctx, 0, -12, 3.2, 3.2, "#e0b84b", { hi: "#fff2bf", lo: "#8a6413" });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        stroke(ctx, [[Math.cos(a) * 3.6, -12 + Math.sin(a) * 3.6], [Math.cos(a) * 5.4, -12 + Math.sin(a) * 5.4]], "#f0cf70", 0.9);
      }
    } else {
      limb(ctx, [0, 0], [-0.6, -8], 1.6, 1.2, "#4d3b28", { hi: "#8a6b45", lo: "#241a10" });
      for (let i = 0; i < 3; i++) {
        const a = -0.5 - i * 0.6;
        stroke(ctx, [[-0.6, -6], [Math.cos(a) * 6, -6 + Math.sin(a) * 5]], "#3f6f37", 1.4);
      }
      orb(ctx, -2, -9, 2.6, 1.8, "#5d8b45", { hi: "#9dc477", lo: "#2a4520" });
    }
    ctx.restore();
  }

  /** Worn dirt apron under a worked site: people walk here every day. */
  function trampledGround(ctx, rx, ry) {
    ctx.save();
    ctx.fillStyle = H().RG(ctx, 0, 2, rx,
      [[0, "rgba(120,94,58,0.5)"], [0.6, "rgba(120,94,58,0.26)"], [1, "rgba(120,94,58,0)"]]);
    ctx.beginPath();
    ctx.ellipse(0, 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBuilding(ctx, building, wx, wy, x, y, k) {
    const { plate, orb, limb, ao, stroke, wood, cloth, spec, dk, lt, MAT } = H();
    ctx.save();
    ctx.translate(wx, wy);

    if (building === "port") {
      /* planked dock on piles, moored boat, crates and a lantern */
      for (let i = -1; i <= 1; i++) {
        limb(ctx, [i * 9, 8], [i * 9, 0], 1.7, 1.5, MAT.woodLo, { hi: MAT.wood, lo: "#231708" });
        ctx.beginPath();
        ctx.ellipse(i * 9, 8, 4.4, 1.8, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(228,248,255,0.4)"; ctx.lineWidth = 1; ctx.stroke();
      }
      castShadow(ctx, 6, 6, 20, 6, 0.3);
      wood(ctx, [[-15, -4], [15, -4], [15, 1], [-15, 1]], { rimA: 0.4 });
      wood(ctx, [[-15, -7], [15, -7], [15, -4], [-15, -4]], { hi: "#d3a469", rimA: 0.4 });
      for (let i = -4; i <= 4; i++) stroke(ctx, [[i * 3.4, -7], [i * 3.4, -4]], "rgba(48,32,16,0.3)", 0.8);
      /* moored hull, mast and sail */
      plate(ctx, [[2, -8], [17, -8], [14, -3], [4, -3]], dk(MAT.wood, 0.2),
        { hi: MAT.woodHi, lo: MAT.woodLo, rimA: 0.4 });
      stroke(ctx, [[3, -6.4], [15.4, -6.4]], "rgba(255,236,200,0.3)", 1);
      limb(ctx, [9, -8], [9, -22], 1.1, 0.9, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
      cloth(ctx, [[9, -21], [9, -10], [19, -12]], k.color, 2);
      stroke(ctx, [[9, -22], [17, -8.4]], "rgba(210,190,150,0.7)", 0.8);
      /* dockside crates and coiled rope */
      plate(ctx, [[-14, -8], [-8, -8], [-8, -4], [-14, -4]], MAT.wood,
        { hi: MAT.woodHi, lo: MAT.woodLo, rimA: 0.4 });
      stroke(ctx, [[-14, -6], [-8, -6]], "rgba(40,26,12,0.4)", 0.8);
      plate(ctx, [[-8.6, -11], [-3.6, -11], [-3.6, -7], [-8.6, -7]], dk(MAT.wood, 0.1),
        { hi: MAT.woodHi, lo: MAT.woodLo, rimA: 0.4 });
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.ellipse(-11, -3 - i * 0.9, 3 - i * 0.7, 1.2 - i * 0.3, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(201,176,136,0.8)"; ctx.lineWidth = 1; ctx.stroke();
      }
      tribeMark(ctx, k, -13, -8);
      ctx.restore(); return;
    }

    if (building === "mine") {
      /* cut rock face, timbered adit, rail and ore cart, lantern in the dark */
      castShadow(ctx, 10, 6, 20, 6, 0.32);
      plate(ctx, [[-16, 4], [-11, -12], [6, -14], [12, 4]], "#7e7871",
        { hi: "#b6afa5", lo: "#2f2c28", rimA: 0.4 });
      for (let i = 0; i < 3; i++) {
        stroke(ctx, [[-15 + i, -1 - i * 3.4], [11 - i * 1.4, -3 - i * 3.2]],
          i % 2 ? "rgba(255,248,232,0.14)" : "rgba(30,26,22,0.26)", 1.2);
      }
      /* the adit mouth, dark and deep */
      plate(ctx, [[-6, 4], [-5, -7], [3, -7], [4, 4]], "#151417", { hi: "#33313a", lo: "#08070a", rimA: 0.3 });
      ctx.fillStyle = H().RG(ctx, -1, -1, 7,
        [[0, "rgba(255,182,92,0.5)"], [1, "rgba(255,182,92,0)"]]);
      ctx.beginPath(); ctx.ellipse(-1, -1, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
      wood(ctx, [[-8, -7], [6, -7], [6, -4.4], [-8, -4.4]], { rimA: 0.45 });
      wood(ctx, [[-8, -6], [-5.6, -6], [-5.6, 4], [-8, 4]]);
      wood(ctx, [[4, -6], [6.4, -6], [6.4, 4], [4, 4]]);
      /* rail line out of the mouth */
      stroke(ctx, [[-1, 4], [14, 2.6]], "rgba(60,54,48,0.8)", 1.2);
      stroke(ctx, [[-1, 5.6], [14, 4.2]], "rgba(60,54,48,0.8)", 1.2);
      for (let i = 0; i < 4; i++) stroke(ctx, [[1 + i * 3.4, 3.6], [1 + i * 3.4, 5.6]], "rgba(74,54,32,0.8)", 1.4);
      /* ore cart, heaped */
      plate(ctx, [[8, -1], [17, -1], [16, 4], [9, 4]], dk(k.metal || "#5d6068", 0.05),
        { hi: "#9aa0aa", lo: "#24272d", rimA: 0.4, spec: true });
      orb(ctx, 11, 4.4, 1.6, 1.6, "#2a2724", { hi: "#5c5651" });
      orb(ctx, 15, 4.4, 1.6, 1.6, "#2a2724", { hi: "#5c5651" });
      [[11, -2], [14, -2.6], [12.6, -3.4]].forEach(([dx, dy]) => {
        orb(ctx, dx, dy, 1.7, 1.4, "#dab84f", { hi: "#fff0ae", lo: "#6f5310" });
        spec(ctx, dx - 0.6, dy - 0.5, 0.6, 0.5, 0, 0.6);
      });
      /* tailings heap and a leaning pick */
      orb(ctx, -13, 3, 5, 2.2, "#6b645a", { hi: "#9d968a", lo: "#2c2822", rim: false });
      limb(ctx, [-10, 4], [-7.4, -4], 0.8, 0.7, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
      stroke(ctx, [[-9.4, -3.6], [-5.4, -5.4]], "#9aa0aa", 1.4);
      tribeMark(ctx, k, -14, 2);
      ctx.restore(); return;
    }

    if (building === "farm") {
      /* tilled furrows with sprouting rows, a fence line, stooked grain */
      trampledGround(ctx, 22, 9);
      for (let i = 0; i < 4; i++) {
        const yy = -4 + i * 2.6;
        plate(ctx, [[-17 + i * 1.4, yy], [17 - i * 1.4, yy], [16 - i * 1.4, yy + 2.1], [-18 + i * 1.4, yy + 2.1]],
          i % 2 ? "#8a6435" : "#a2793f", { hi: "#c79a5a", lo: "#4a3319", rimA: 0.25 });
        for (let j = -3; j <= 3; j++) {
          const px = j * (4.6 - i * 0.3) + i * 1.2;
          stroke(ctx, [[px, yy + 1.8], [px + 0.6, yy - 0.6]], "rgba(122,166,74,0.75)", 0.9);
          stroke(ctx, [[px, yy + 1.8], [px - 1.2, yy + 0.2]], "rgba(96,140,58,0.6)", 0.8);
        }
      }
      for (let i = -2; i <= 2; i++) {
        limb(ctx, [i * 8, -6], [i * 8, -13], 1.1, 1, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
      }
      stroke(ctx, [[-16, -10.5], [16, -10.5]], MAT.woodLo, 1.6);
      stroke(ctx, [[-16, -11.6], [16, -11.6]], "rgba(200,160,110,0.7)", 1);
      [[-6, -6], [4, -6]].forEach(([dx, dy]) => {
        castShadow(ctx, dx + 5, dy + 1, 7, 3, 0.3);
        limb(ctx, [dx, dy], [dx + 1, dy - 9], 2.6, 3.6, "#d9b257", { hi: "#f8e4a6", lo: "#7c5b20" });
        stroke(ctx, [[dx + 1, dy - 9], [dx + 4, dy - 12]], "rgba(248,228,166,0.75)", 1.1);
        stroke(ctx, [[dx + 1, dy - 9], [dx - 2, dy - 12]], "rgba(248,228,166,0.6)", 1.1);
        stroke(ctx, [[dx - 2.4, dy - 4], [dx + 3.4, dy - 4.6]], "rgba(120,88,34,0.7)", 1);
      });
      tribeMark(ctx, k, -14, -6);
      ctx.restore(); return;
    }

    /* lumber hut: stacked-log walls, plank roof, cut stack, stump and axe */
    trampledGround(ctx, 20, 8);
    castShadow(ctx, 11, 5, 16, 5, 0.32);
    ao(ctx, 0, 4, 18, 0.3);
    wall(ctx, -10, -8, 20, 12, "#8a6b45");
    /* log courses: a shaded band per log, with the end grain showing at the corner */
    for (let i = 0; i < 4; i++) {
      const yy = -8 + i * 3;
      stroke(ctx, [[-10, yy + 3], [10, yy + 3]], "rgba(50,32,16,0.4)", 1);
      stroke(ctx, [[-10, yy + 0.7], [10, yy + 0.7]], "rgba(255,226,182,0.16)", 1);
      orb(ctx, -10.4, yy + 1.6, 1.5, 1.5, "#c9a877", { hi: "#f0d9b4", lo: "#6b4b28" });
    }
    roof(ctx, 0, -8, 13, 10, k.color);
    /* door with a plank line, and a lit window beside it */
    plate(ctx, [[-4, -3], [3, -3], [3, 4], [-4, 4]], "#3a2a1d", { hi: "#6a4d33", lo: "#170f0a", rimA: 0.3 });
    stroke(ctx, [[-0.6, -3], [-0.6, 4]], "rgba(20,12,6,0.5)", 0.8);
    window_(ctx, 4.6, -5.4, 4, 3.4);
    /* cut stack, drying */
    for (let i = 0; i < 3; i++) {
      orb(ctx, 14 + (i % 2) * 3, 2 - i * 3, 3.2, 2.4, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
      orb(ctx, 14 + (i % 2) * 3, 2 - i * 3, 1.3, 1, "#c9a877", { rim: false });
      stroke(ctx, [[14 + (i % 2) * 3, 2 - i * 3], [14 + (i % 2) * 3 + 1.1, 2 - i * 3]], "rgba(90,62,32,0.6)", 0.6);
    }
    /* chopping stump with the axe left in it, and chips on the ground */
    orb(ctx, -15, 3.4, 3.4, 2, "#8a6b45", { hi: "#b98d5b", lo: "#4a3320" });
    orb(ctx, -15, 2.6, 3.2, 1.6, "#c9a877", { rim: false });
    limb(ctx, [-15, 2], [-12.6, -4.4], 0.8, 0.7, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    plate(ctx, [[-12.8, -5.6], [-10.2, -6.6], [-10.6, -3.4], [-12.4, -3.6]], "#9aa0aa",
      { hi: "#eef2f8", lo: "#3f4753", rimA: 0.4, spec: true });
    for (let i = 0; i < 4; i++) {
      const px = -19 + i * 2.4, py = 5 + (i % 2) * 1.4;
      ctx.beginPath(); ctx.ellipse(px, py, 1.4, 0.7, 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(214,182,132,0.7)"; ctx.fill();
    }
    tribeMark(ctx, k, -14, -8);
    ctx.restore();
  }

  function drawVillage(ctx, wx, wy, k) {
    const { plate, orb, ao, stroke, limb, MAT } = H();
    ctx.save();
    ctx.translate(wx, wy);
    trampledGround(ctx, 20, 8);
    castShadow(ctx, 10, 5, 16, 5, 0.32);
    ao(ctx, 0, 4, 18, 0.32);
    wall(ctx, -11, -7, 22, 11, "#c2b195");
    /* daub panels between timber studs */
    for (let i = -1; i <= 1; i++) stroke(ctx, [[i * 6, -7], [i * 6, 4]], "rgba(86,64,40,0.5)", 1.4);
    stroke(ctx, [[-11, -1.6], [11, -1.6]], "rgba(86,64,40,0.4)", 1.2);
    roof(ctx, 0, -7, 14, 11, "#6d6152");
    plate(ctx, [[-3, -2], [3, -2], [3, 4], [-3, 4]], "#41352a", { hi: "#6d5b48", lo: "#1c1611", rimA: 0.3 });
    window_(ctx, 4.4, -5, 3.6, 3);
    /* a well out front — the village has no banner, only daily life */
    orb(ctx, -14, 2.4, 4, 2.2, "#9a9184", { hi: "#c8c0b2", lo: "#3e3a36" });
    orb(ctx, -14, 1.6, 3.2, 1.6, "#2b2620", { rim: false });
    limb(ctx, [-16.4, 1.4], [-16.4, -5], 0.7, 0.6, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    limb(ctx, [-11.6, 1.4], [-11.6, -5], 0.7, 0.6, MAT.wood, { hi: MAT.woodHi, lo: MAT.woodLo });
    stroke(ctx, [[-17, -5], [-11, -5]], MAT.woodLo, 1.4);
    stroke(ctx, [[-14, -5], [-14, -2.2]], "rgba(201,176,136,0.8)", 0.7);
    /* chimney smoke */
    limb(ctx, [7, -12], [7, -17], 1.8, 1.6, "#8d8378", { hi: "#c2b8ab", lo: "#3d3831" });
    smoke(ctx, 7, -19, 4);
    ctx.restore();
  }

  /** Broken pillars on cracked flagstone, with vines and something still glinting. */
  function drawRuin(ctx, wx, wy) {
    const { plate, orb, stroke, dk } = H();
    ctx.save();
    ctx.translate(wx, wy);
    castShadow(ctx, 6, 4, 18, 7, 0.3);
    /* flagstone floor, cracked */
    plate(ctx, [[-16, 0], [0, -8], [16, 0], [0, 8]], "#8d8577",
      { hi: "#bab2a1", lo: "#3d3931", rimA: 0.3 });
    stroke(ctx, [[-9, -1], [-2, 1.6], [3, -1.4], [11, 1]], "rgba(30,26,20,0.4)", 1);
    stroke(ctx, [[-3, 5], [0, 0], [4, -4]], "rgba(30,26,20,0.3)", 0.9);
    [[-9, 0, 12], [0, -3, 16], [9, 1, 8]].forEach(([dx, dy, h], i) => {
      plate(ctx, [[dx - 3, dy], [dx + 3, dy], [dx + 3, dy - h], [dx - 3, dy - h]], "#b0a893",
        { hi: "#e2dac6", lo: "#4e4a3f", rimA: 0.4, horiz: true });
      /* fluting and a broken, uneven crown */
      stroke(ctx, [[dx - 0.8, dy - 1], [dx - 0.8, dy - h + 1]], "rgba(60,54,44,0.3)", 0.8);
      plate(ctx, [[dx - 3.6, dy - h], [dx + 1.4, dy - h - 2.2], [dx + 3.6, dy - h + 0.6], [dx - 1, dy - h + 1.4]],
        "#c6bda6", { hi: "#f0e8d4", lo: "#5b5648", rimA: 0.35 });
      /* vine creeping up the shaft */
      if (i !== 2) {
        stroke(ctx, [[dx + 2.4, dy], [dx + 1, dy - h * 0.4], [dx + 2.6, dy - h * 0.75]], "rgba(74,110,50,0.8)", 1.1);
        orb(ctx, dx + 1.4, dy - h * 0.55, 1.8, 1.2, "#5d8b45", { hi: "#9dc477", rim: false });
      }
    });
    /* fallen drum and a glint of something worth the walk */
    orb(ctx, 5, 5, 4.4, 2, "#a89f8b", { hi: "#d8d0bb", lo: "#4a463c" });
    ctx.fillStyle = H().RG(ctx, 2, -9, 6, [[0, "rgba(255,228,150,0.75)"], [1, "rgba(255,228,150,0)"]]);
    ctx.beginPath(); ctx.arc(2, -9, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,244,206,0.95)";
    ctx.beginPath(); ctx.arc(2, -9, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* City silhouettes differ by tribe: kiln stacks, stilt decks, colonnades, bark lodges. */
  function cityHouse(ctx, dx, dy, k, big) {
    const { plate, orb, limb, ao, stroke, MAT } = H();
    const w = big ? 9 : 7.5, h = big ? 11 : 9;
    ctx.save();
    ctx.translate(dx, dy);
    castShadow(ctx, w + 4, 4, w + 7, 4.4, 0.3);
    ao(ctx, 0, 3, w + 6, 0.3);
    if (k.id === "korvani") {
      for (let i = -1; i <= 1; i += 2) limb(ctx, [i * (w - 2), 5], [i * (w - 2), -2], 1.2, 1.2, MAT.woodLo);
    }
    wall(ctx, -w, -h, w * 2, h + 2, k.id === "thornwood" ? "#7d6a4c" : k.id === "meridia" ? "#e2d8c2" : "#cdbfa8");
    if (k.id === "meridia") {
      for (let i = -1; i <= 1; i++) limb(ctx, [i * (w * 0.6), 2], [i * (w * 0.6), -h + 1], 1.3, 1.3, "#f0e7d2",
        { hi: "#ffffff", lo: "#a89b81" });
    }
    if (k.id === "thornwood") {
      for (let i = 0; i < 3; i++) stroke(ctx, [[-w, -h + 3 + i * 3], [w, -h + 3 + i * 3]], "rgba(48,36,22,0.32)", 1);
    }
    roof(ctx, 0, -h, w + 3.5, big ? 12 : 10, k.color, { rows: big ? 5 : 4 });
    if (k.id === "ashfen") {
      limb(ctx, [w - 3, -h], [w - 3, -h - 8], 1.8, 1.6, "#5b524d", { hi: "#8f847d", lo: "#221f1d" });
      ctx.beginPath(); ctx.arc(w - 3, -h - 10, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,140,70,0.5)"; ctx.fill();
      smoke(ctx, w - 3, -h - 12, 3);
    } else {
      smoke(ctx, -w + 2.4, -h - 6, 3);
    }
    if (k.id === "thornwood") {
      orb(ctx, -w + 2, -h - 1, 3.4, 2, "#5d8b45", { hi: "#8fb96a", rim: false });
    }
    plate(ctx, [[-2.6, -3], [2.6, -3], [2.6, 2], [-2.6, 2]], "#332a22", { hi: "#5e4f40", lo: "#140f0b", rimA: 0.3 });
    window_(ctx, w - 5.4, -h + 2.6, 3.4, 2.8);
    if (big) window_(ctx, -w + 2, -h + 2.6, 3.4, 2.8);
    ctx.restore();
  }

  function drawCity(ctx, city, wx, wy, k) {
    const { plate, orb, limb, stroke, cloth, dk } = H();
    ctx.save();
    ctx.translate(wx, wy);
    /* packed earth square linking the houses */
    trampledGround(ctx, 26, 11);
    if (city.walls) {
      /* stone curtain wall around the tile edge, with a gatehouse toward the viewer */
      const pts = [[0, -TILE_H / 2], [TILE_W / 2, 0], [0, TILE_H / 2], [-TILE_W / 2, 0]];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.strokeStyle = "rgba(28,24,20,0.5)"; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = "#cfc7b6"; ctx.lineWidth = 4.5; ctx.stroke();
      ctx.strokeStyle = "rgba(255,250,238,0.7)"; ctx.lineWidth = 1.2; ctx.stroke();
      /* crenellations along the two lit runs */
      for (let i = 1; i < 7; i++) {
        const t = i / 7;
        [[-TILE_W / 2, 0, 0, -TILE_H / 2], [0, -TILE_H / 2, TILE_W / 2, 0]].forEach(([ax, ay, bx, by]) => {
          const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
          plate(ctx, [[px - 1.6, py - 1.4], [px + 1.6, py - 1.4], [px + 1.6, py - 4], [px - 1.6, py - 4]],
            "#d8d0be", { hi: "#fffaf0", lo: "#6f6858", rimA: 0.35 });
        });
      }
      pts.forEach(([px, py]) => {
        orb(ctx, px, py - 3, 3.4, 2.8, "#d8d0be", { hi: "#fffaf0", lo: "#6f6858" });
      });
      /* gate on the front-left face */
      plate(ctx, [[-20, 6], [-13, 9.4], [-13, 3.4], [-20, 0]], "#4a3a28",
        { hi: "#7d6244", lo: "#1d150d", rimA: 0.4 });
    }
    const houses = Math.min(4, 1 + Math.floor(city.level / 2));
    /* back to front so overlaps read correctly */
    const order = [[0, -3], [-13, 4], [12, 4], [0, 9]].filter((s, i) => i < houses);
    order.forEach(([dx, dy], i) => cityHouse(ctx, dx, dy, k, i === 0 && city.isCapital));
    /* market stall between the houses: awning, table, goods */
    if (city.level >= 2) {
      const sx = -6, sy = 9;
      limb(ctx, [sx - 5, sy], [sx - 5, sy - 6], 0.8, 0.7, "#8a6640");
      limb(ctx, [sx + 5, sy], [sx + 5, sy - 6], 0.8, 0.7, "#8a6640");
      cloth(ctx, [[sx - 6, sy - 6], [sx + 6, sy - 6], [sx + 5, sy - 3.4], [sx - 5, sy - 3.4]], k.color, 3);
      plate(ctx, [[sx - 5, sy - 3], [sx + 5, sy - 3], [sx + 5, sy - 1.4], [sx - 5, sy - 1.4]], "#8a6640",
        { hi: "#b98d5b", lo: "#4a3320", rimA: 0.35 });
      [[-3, -4], [0, -4.2], [3, -3.8]].forEach(([dx, dy]) =>
        orb(ctx, sx + dx, sy + dy, 1.3, 1, dx ? "#d2452f" : "#e6c463", { rim: false }));
    }
    if (city.isCapital) {
      limb(ctx, [0, -8], [0, -32], 1.3, 1.1, H().MAT.wood, { hi: H().MAT.woodHi, lo: H().MAT.woodLo });
      cloth(ctx, [[0, -32], [0, -21], [14, -24]], k.color, 2);
      orb(ctx, 0, -33.4, 1.6, 1.6, dk(k.color, 0.2), { hi: "#fff2bf", rim: false });
    }
    ctx.restore();
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
  let cache = null;

  function render(ctx, opts) {
    const { width, height } = opts;
    const zoom = opts.zoom || 1;
    const dpr = window.devicePixelRatio || 1;
    const key = [opts.tribeId, opts.enemyTribeId, zoom, width, height, opts.selectedId, dpr].join("|");
    if (!cache || cache.key !== key) {
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.round(width * dpr));
      off.height = Math.max(1, Math.round(height * dpr));
      const octx = off.getContext("2d");
      octx.scale(dpr, dpr);
      paintBase(octx, opts);
      cache = { key: key, canvas: off };
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(cache.canvas, 0, 0, width, height);
    paintOverlay(ctx, opts);
  }

  function withStage(ctx, opts, fn) {
    const zoom = opts.zoom || 1;
    ctx.save();
    ctx.translate(opts.width / 2, opts.height / 2 + 20);
    ctx.scale(zoom, zoom);
    ctx.translate(0, -((SIZE - 1) * TILE_H) / 2);
    fn();
    ctx.restore();
  }

  /** Live pass: only the things that change between frames. */
  function paintOverlay(ctx, opts) {
    withStage(ctx, opts, () => {
      const reach = new Set(opts.reachable || []);
      for (const [x, y] of drawOrder()) {
        const key = x + "," + y;
        const [wx, wy0] = gridToWorld(x, y);
        const wy = wy0 - liftAt(x, y);
        if (reach.has(key)) {
          diamondPath(ctx, wx, wy);
          ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5; ctx.stroke();
        }
        if (opts.hoverTile && opts.hoverTile[0] === x && opts.hoverTile[1] === y) {
          diamondPath(ctx, wx, wy);
          ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    });
  }

  function paintBase(ctx, opts) {
    const Art = A();
    const tribe = Art.TRIBES.find((t) => t.id === opts.tribeId) || Art.TRIBES[0];
    const foe = Art.TRIBES.find((t) => t.id === opts.enemyTribeId) || Art.TRIBES[1];
    const k = Art.kitFor(tribe.id);
    const { G, RG } = H();
    const { width, height } = opts;
    const zoom = opts.zoom || 1;

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = G(ctx, 0, 0, 0, height, [[0, "#0d1626"], [1, "#060a12"]]);
    ctx.fillRect(0, 0, width, height);
    /* warm haze in the upper left, where the key light comes from */
    ctx.fillStyle = RG(ctx, width * 0.3, height * 0.18, Math.max(width, height) * 0.7,
      [[0, "rgba(120,140,180,0.18)"], [1, "rgba(120,140,180,0)"]]);
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2 + 20);
    ctx.scale(zoom, zoom);
    ctx.translate(0, -((SIZE - 1) * TILE_H) / 2);

    const order = drawOrder();

    for (const [x, y] of order) {
      const [wx0, wy0] = gridToWorld(x, y);
      if (CLOUDS.indexOf(x + "," + y) >= 0) { drawCloud(ctx, wx0, wy0); continue; }
      const terrain = terrainAt(x, y);
      const m = TERRAIN[terrain];
      const lift = liftAt(x, y);
      const wx = wx0, wy = wy0 - lift;

      crust(ctx, wx, wy, lift, m, x, y);
      if (isWater(terrain)) waterTop(ctx, wx, wy, x, y, m);
      else if (terrain === "mountain") rockTop(ctx, wx, wy, x, y, m);
      else grassTop(ctx, wx, wy, x, y, m, terrain);

      if (cityTerritory(x, y)) {
        diamondPath(ctx, wx, wy);
        ctx.fillStyle = tribe.color + "26"; ctx.fill();
        diamondPath(ctx, wx, wy);
        ctx.strokeStyle = tribe.color + "8c"; ctx.lineWidth = 1.5; ctx.stroke();
      } else {
        diamondPath(ctx, wx, wy);
        ctx.strokeStyle = "rgba(0,0,0,0.14)"; ctx.lineWidth = 1; ctx.stroke();
      }

      const key = x + "," + y;
      if (terrain === "mountain" && BUILDINGS[key] !== "mine") drawMountain(ctx, wx, wy, x, y);
      if (terrain === "forest" && BUILDINGS[key] !== "lumber_hut") drawTrees(ctx, wx, wy, x, y, tribe.id);
      if (RESOURCES[key]) drawResource(ctx, RESOURCES[key], wx, wy, x, y, k);
      if (BUILDINGS[key]) drawBuilding(ctx, BUILDINGS[key], wx, wy, x, y, k);
      if (RUINS.indexOf(key) >= 0) drawRuin(ctx, wx, wy);
      if (VILLAGE.x === x && VILLAGE.y === y) drawVillage(ctx, wx, wy, k);
      if (CITY.x === x && CITY.y === y) drawCity(ctx, CITY, wx, wy, k);
      if (CITY2.x === x && CITY2.y === y) drawCity(ctx, CITY2, wx, wy, k);
    }

    for (const [x, y] of order) {
      const u = ALL.find((u) => u.x === x && u.y === y);
      if (!u) continue;
      const [wx, wy0] = gridToWorld(x, y);
      const wy = wy0 - liftAt(x, y) + 4;
      if (u.id === opts.selectedId) {
        ctx.beginPath();
        ctx.ellipse(wx, wy, 18, 9, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
      }
      if (!u.mine && opts.selectedId != null) {
        ctx.beginPath();
        ctx.ellipse(wx, wy, 18, 9, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "#ff5544"; ctx.lineWidth = 2.5; ctx.stroke();
      }
      Art.drawCharacter(ctx, {
        tribe: u.mine ? tribe.id : foe.id,
        type: u.type,
        x: wx,
        y: wy,
        scale: 0.62,
        veteran: !!u.veteran,
        acted: !!u.acted,
        hpFrac: u.hp / u.maxHp,
      });
    }

    [CITY, CITY2].forEach((c) => {
      const [wx, wy] = gridToWorld(c.x, c.y);
      drawNameplate(ctx, c, wx, wy - liftAt(c.x, c.y), tribe.color);
    });

    ctx.restore();
  }

  /**
   * Screen px -> tile under the cursor. Tile tops sit at their own height, so
   * the flat inverse is only a first guess: re-solve with the height of the
   * tile it lands on until it agrees with itself.
   */
  function pickGrid(wx, wy) {
    let g = worldToGrid(wx, wy + 7);
    for (let i = 0; i < 2; i++) {
      const l = liftAt(g[0], g[1]);
      const g2 = worldToGrid(wx, wy + l);
      if (g2[0] === g[0] && g2[1] === g[1]) break;
      g = g2;
    }
    return g;
  }

  function pick(px, py, opts) {
    const zoom = opts.zoom || 1;
    const wx = (px - opts.width / 2) / zoom;
    const wy = (py - (opts.height / 2 + 20)) / zoom + ((SIZE - 1) * TILE_H) / 2;
    const [gx, gy] = pickGrid(wx, wy);
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

  /** Single-tile preview used by the codex sheet. */
  const PREVIEW_TERRAIN = { port: "water", fish: "water", water: "water", ocean: "ocean", mountain: "mountain",
    mine: "mountain", metal: "mountain", forest: "forest", lumber_hut: "forest", fruit: "forest", animal: "forest" };
  function preview(ctx, kind, cx, cy, tribeId, scale) {
    const Art = A();
    const k = Art.kitFor(tribeId);
    const terrain = PREVIEW_TERRAIN[kind] || "field";
    const m = TERRAIN[terrain];
    const s = scale || 1;
    const x = 3, y = 4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    const wy = 0;
    crust(ctx, 0, wy, m.lift, m, x, y);
    if (isWater(terrain)) waterTop(ctx, 0, wy, x, y, m);
    else if (terrain === "mountain") rockTop(ctx, 0, wy, x, y, m);
    else grassTop(ctx, 0, wy, x, y, m, terrain);
    diamondPath(ctx, 0, wy);
    ctx.strokeStyle = "rgba(0,0,0,0.16)"; ctx.lineWidth = 1; ctx.stroke();
    if (terrain === "mountain" && kind !== "mine") drawMountain(ctx, 0, wy, x, y);
    if (terrain === "forest" && kind !== "lumber_hut") drawTrees(ctx, 0, wy, x, y, tribeId);
    if (RES_KINDS.indexOf(kind) >= 0) drawResource(ctx, kind, 0, wy, x, y, k);
    else if (kind === "village") drawVillage(ctx, 0, wy, k);
    else if (kind === "ruin") drawRuin(ctx, 0, wy);
    else if (kind === "city") drawCity(ctx, CITY2, 0, wy, k);
    else if (kind === "capital") drawCity(ctx, CITY, 0, wy, k);
    else if (BUILD_KINDS.indexOf(kind) >= 0) drawBuilding(ctx, kind, 0, wy, x, y, k);
    ctx.restore();
  }
  const RES_KINDS = ["fruit", "crop", "metal", "animal", "fish"];
  const BUILD_KINDS = ["lumber_hut", "farm", "mine", "port"];

  window.PolyforgeScene = { render, pick, UNITS: ALL, CITY, neighbors, SIZE, terrainAt, TREES, preview };
})();
