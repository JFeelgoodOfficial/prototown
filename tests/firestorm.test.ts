import { describe, it, expect } from "vitest";
import { makeTestState, addUnit, addCity, setTerrain } from "./helpers";
import { computeLegalActions, firestormLine } from "../src/engine/legalActions";
import { applyAction } from "../src/engine/reducer";
import { newGame } from "../src/engine/mapgen";
import { tileAt, unitAt, unitById, isBurning, isPlayable, dist } from "../src/engine/state";
import { FIRESTORM_COST, FIRESTORM_LENGTH, FIRESTORM_BURN_TURNS } from "../src/data/constants";
import type { Action } from "../src/engine/actions";

const runsIn = (actions: Action[]) => actions.filter((a) => a.type === "FIRESTORM");

/** The eight headings a run can be flown along, as deltas from the plane. */
const HEADINGS: Array<[number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/** Player 0 with Incendiaries, the stars for a run, and a bomber to fly it. */
function armedState(x = 2, y = 4) {
  const s = makeTestState();
  s.players[0].techs.push("flight", "incendiaries");
  s.players[0].stars = 20;
  const bomber = addUnit(s, 0, "bomber", x, y);
  return { s, bomber };
}

/** The run this bomber would fly along the given heading. */
function runAlong(s: ReturnType<typeof armedState>["s"], unitId: number, dx: number, dy: number): Action {
  const bomber = unitById(s, unitId)!;
  const run = computeLegalActions(s, 0).find(
    (a) => a.type === "FIRESTORM" && a.unitId === unitId && a.x === bomber.x + dx && a.y === bomber.y + dy,
  );
  expect(run).toBeDefined();
  return run!;
}

describe("firestorm legality", () => {
  it("needs a bomber, the tech, and the stars to pay for the munitions", () => {
    const s = makeTestState();
    const bomber = addUnit(s, 0, "bomber", 2, 4);
    s.players[0].stars = 20;
    expect(runsIn(computeLegalActions(s, 0))).toHaveLength(0); // no tech

    s.players[0].techs.push("flight", "incendiaries");
    expect(runsIn(computeLegalActions(s, 0))).toHaveLength(8); // one per heading

    s.players[0].stars = FIRESTORM_COST - 1;
    expect(runsIn(computeLegalActions(s, 0))).toHaveLength(0);
    s.players[0].stars = FIRESTORM_COST;
    expect(runsIn(computeLegalActions(s, 0))).toHaveLength(8);

    // the strike is the plane's, and it only has one a turn
    bomber.attacked = true;
    expect(runsIn(computeLegalActions(s, 0))).toHaveLength(0);
    bomber.attacked = false;

    // and no other unit flies one, however well placed
    addUnit(s, 0, "catapult", 5, 4);
    expect(runsIn(computeLegalActions(s, 0)).map((a) => (a as { unitId: number }).unitId)).toEqual(
      new Array(8).fill(bomber.id),
    );
  });

  it("offers no heading that runs straight off the map", () => {
    const { s } = armedState(0, 0); // the corner: only three headings lead inland
    const headings = runsIn(computeLegalActions(s, 0)).map((a) => {
      const r = a as { x: number; y: number };
      return `${r.x},${r.y}`;
    });
    expect(headings.sort()).toEqual(["0,1", "1,0", "1,1"]);
  });

  it("draws the line from beside the plane outwards, and clips it at the map edge", () => {
    const { s } = armedState(2, 4);
    expect(firestormLine(s, 2, 4, 3, 4)).toEqual([
      [3, 4],
      [4, 4],
      [5, 4],
      [6, 4],
    ]);
    expect(firestormLine(s, 2, 4, 3, 3)).toHaveLength(FIRESTORM_LENGTH); // diagonals too

    // a run westward off an 8-wide map burns only what is left of the world
    expect(firestormLine(s, 2, 4, 1, 4)).toEqual([
      [1, 4],
      [0, 4],
    ]);
    // and a heading that is not a heading at all burns nothing
    expect(firestormLine(s, 2, 4, 5, 4)).toEqual([]);
    expect(firestormLine(s, 2, 4, 2, 4)).toEqual([]);
  });
});

describe("firestorm lines on a folded map", () => {
  it("only ever burns a chain of genuinely adjacent, playable tiles", () => {
    const s = newGame({ seed: 7, size: 12, mapType: "globe", tribes: ["meridia", "ashfen"], winMode: "domination" });
    let longRuns = 0;
    for (const tile of s.tiles) {
      if (tile.terrain === "void") continue;
      for (const [dx, dy] of HEADINGS) {
        const line = firestormLine(s, tile.x, tile.y, tile.x + dx, tile.y + dy);
        expect(line.length).toBeLessThanOrEqual(FIRESTORM_LENGTH);
        if (line.length === FIRESTORM_LENGTH) longRuns++;
        let [px, py] = [tile.x, tile.y];
        for (const [x, y] of line) {
          expect(isPlayable(s, x, y)).toBe(true);
          expect(dist(s, px, py, x, y)).toBe(1); // no jumping a seam
          [px, py] = [x, y];
        }
      }
    }
    // most of a globe is open ground, so the great majority of runs are full ones
    expect(longRuns).toBeGreaterThan(0);
  });
});

describe("firestorm run", () => {
  it("kills every ground unit in the line, whoever owns it", () => {
    const { s, bomber } = armedState(2, 4);
    const enemy = addUnit(s, 1, "swordsman", 4, 4);
    const own = addUnit(s, 0, "warrior", 5, 4);
    const overflying = addUnit(s, 1, "scout_plane", 6, 4); // above the fire, not in it
    const spared = addUnit(s, 1, "warrior", 4, 5); // one tile off the line

    const next = applyAction(s, runAlong(s, bomber.id, 1, 0));

    expect(unitById(next, enemy.id)).toBeUndefined();
    expect(unitById(next, own.id)).toBeUndefined();
    expect(unitById(next, overflying.id)).toBeDefined();
    expect(unitById(next, spared.id)).toBeDefined();
    expect(unitById(next, bomber.id)).toMatchObject({ x: 2, y: 4, moved: true, attacked: true });
  });

  it("charges the munitions and spends the plane's turn", () => {
    const { s, bomber } = armedState(2, 4);
    const next = applyAction(s, runAlong(s, bomber.id, 1, 0));
    expect(next.players[0].stars).toBe(20 - FIRESTORM_COST);
    expect(runsIn(computeLegalActions(next, 0))).toHaveLength(0); // the strike is spent
  });

  it("burns buildings down to bare field, and leaves water where it found it", () => {
    const { s, bomber } = armedState(2, 4);
    setTerrain(s, 4, 4, "forest");
    tileAt(s, 3, 4).building = "farm";
    tileAt(s, 3, 4).tilled = true;
    tileAt(s, 4, 4).building = "lumber_hut";
    setTerrain(s, 5, 4, "water");
    tileAt(s, 5, 4).building = "port";
    setTerrain(s, 6, 4, "forest"); // no building: the trees are only set alight

    const next = applyAction(s, runAlong(s, bomber.id, 1, 0));

    expect(tileAt(next, 3, 4)).toMatchObject({ building: null, terrain: "field", tilled: false });
    expect(tileAt(next, 4, 4)).toMatchObject({ building: null, terrain: "field" });
    expect(tileAt(next, 5, 4)).toMatchObject({ building: null, terrain: "water" });
    expect(tileAt(next, 6, 4)).toMatchObject({ building: null, terrain: "forest" });
  });

  it("leaves a city standing on ground it sets alight", () => {
    const { s, bomber } = armedState(2, 4);
    const city = addCity(s, 1, 4, 4);
    const next = applyAction(s, runAlong(s, bomber.id, 1, 0));
    expect(next.cities.find((c) => c.id === city.id)).toBeDefined();
    expect(isBurning(next, tileAt(next, 4, 4))).toBe(true);
  });
});

describe("burning ground", () => {
  function burnedState() {
    const { s, bomber } = armedState(2, 4);
    const next = applyAction(s, runAlong(s, bomber.id, 1, 0));
    return next;
  }

  it("burns for two turns and then goes out", () => {
    const s = burnedState();
    const tile = () => tileAt(s, 3, 4);
    expect(tile().fireOutTurn).toBe(s.turn + FIRESTORM_BURN_TURNS);
    expect(isBurning(s, tile())).toBe(true);

    s.turn += FIRESTORM_BURN_TURNS - 1;
    expect(isBurning(s, tile())).toBe(true);
    s.turn += 1;
    expect(isBurning(s, tile())).toBe(false);
  });

  it("kills whatever walks into it, and lets aircraft over", () => {
    const s = burnedState();
    const walker = addUnit(s, 0, "warrior", 3, 5);
    const flier = addUnit(s, 0, "scout_plane", 4, 5);

    const walked = applyAction(s, { type: "MOVE", unitId: walker.id, x: 3, y: 4 });
    expect(unitById(walked, walker.id)).toBeUndefined();
    expect(unitAt(walked, 3, 4)).toBeUndefined();

    const flown = applyAction(s, { type: "MOVE", unitId: flier.id, x: 4, y: 4 });
    expect(unitById(flown, flier.id)).toMatchObject({ x: 4, y: 4 });
  });

  it("is cleared off the map once its turns are up", () => {
    let s = burnedState();
    s.currentPlayerId = 0;
    for (let i = 0; i < FIRESTORM_BURN_TURNS * s.players.length + 2; i++) {
      s = applyAction(s, { type: "END_TURN" });
    }
    expect(s.tiles.every((t) => t.fireOutTurn === null)).toBe(true);
  });

  it("leaves a unit in orbit alone — its tile is only the pad it left from", () => {
    const s = burnedState();
    const passenger = addUnit(s, 0, "warrior", 3, 4);
    passenger.embarked = "orbit";
    const next = applyAction(s, { type: "END_TURN" });
    expect(unitById(next, passenger.id)).toBeDefined();
  });

  it("stops a city mustering onto its own burning tile", () => {
    const { s, bomber } = armedState(2, 4);
    const city = addCity(s, 0, 4, 4); // player 0's own town, in the line
    const next = applyAction(s, runAlong(s, bomber.id, 1, 0));
    const trains = () => computeLegalActions(next, 0).filter((a) => a.type === "TRAIN" && a.cityId === city.id);
    expect(isBurning(next, tileAt(next, 4, 4))).toBe(true);
    expect(trains()).toHaveLength(0);

    next.turn += FIRESTORM_BURN_TURNS; // once the fire is out, the gates open again
    expect(trains().length).toBeGreaterThan(0);
  });

  it("still lets a unit walk past it, so the fire is a wall and not a cage", () => {
    const s = burnedState();
    const rider = addUnit(s, 0, "rider", 3, 6);
    const moves = computeLegalActions(s, 0).filter((a) => a.type === "MOVE" && a.unitId === rider.id);
    expect(moves.some((a) => (a as { x: number; y: number }).y === 5)).toBe(true);
  });
});
