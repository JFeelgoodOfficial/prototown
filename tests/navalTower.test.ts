import { describe, it, expect } from "vitest";
import { makeTestState, addUnit, setTerrain } from "./helpers";
import { computeLegalActions } from "../src/engine/legalActions";
import { applyAction } from "../src/engine/reducer";
import { tileAt, unitById } from "../src/engine/state";
import { watchedMask } from "../src/engine/fog";
import { idx } from "../src/engine/state";
import { NAVAL_TOWER_RANGE } from "../src/data/constants";
import type { Action } from "../src/engine/actions";

const shotsIn = (a: Action[]) => a.filter((x): x is Extract<Action, { type: "BOMBARD" }> => x.type === "BOMBARD");

/**
 * p0's capital at (1,1) with the sea running east along row 1, and a tower
 * built on the coastal water inside its borders at (2,1).
 */
function coastState() {
  const s = makeTestState(12);
  for (let x = 2; x < 12; x++) setTerrain(s, x, 1, "water");
  tileAt(s, 2, 1).building = "naval_tower";
  s.players[0].techs.push("fishing", "sailing", "coastal_defence");
  return s;
}

function enemyShip(s: ReturnType<typeof coastState>, x: number) {
  const ship = addUnit(s, 1, "warrior", x, 1);
  ship.embarked = "ship";
  return ship;
}

describe("naval tower legality", () => {
  it("only ever fires on shipping, and only inside its range", () => {
    const s = coastState();
    const near = enemyShip(s, 5); // 3 tiles out
    const far = enemyShip(s, 7); // 5 tiles out, beyond the guns
    const ashore = addUnit(s, 1, "warrior", 2, 2); // right beside the tower, but on land

    const shots = shotsIn(computeLegalActions(s, 0));
    const targets = shots.map((a) => a.targetId);
    expect(targets).toContain(near.id);
    expect(targets).not.toContain(far.id);
    expect(targets).not.toContain(ashore.id);
    expect(shots.every((a) => a.x === 2 && a.y === 1)).toBe(true);
  });

  it("fires once a turn, and reloads by the owner's next one", () => {
    const s = coastState();
    const ship = enemyShip(s, 5);
    ship.hp = 40;
    ship.maxHp = 40;

    const fired = applyAction(s, { type: "BOMBARD", x: 2, y: 1, targetId: ship.id });
    expect(tileAt(fired, 2, 1).firedTurn).toBe(fired.turn);
    expect(shotsIn(computeLegalActions(fired, 0))).toHaveLength(0);

    // round the table and back: the guns are loaded again
    let next = applyAction(fired, { type: "END_TURN" });
    next = applyAction(next, { type: "END_TURN" });
    expect(next.turn).toBe(fired.turn + 1);
    expect(shotsIn(computeLegalActions(next, 0))).toHaveLength(1);
  });
});

describe("naval tower gunnery", () => {
  it("hurts the vessel and never takes return fire", () => {
    const s = coastState();
    const ship = enemyShip(s, 4);
    ship.hp = 30;
    ship.maxHp = 30;

    const after = applyAction(s, { type: "BOMBARD", x: 2, y: 1, targetId: ship.id });
    const hit = unitById(after, ship.id)!;
    expect(hit.hp).toBeLessThan(30);
    // nothing on our side was in the exchange at all
    expect(after.units.filter((u) => u.ownerId === 0)).toHaveLength(0);
  });

  it("sinks a vessel it finishes off", () => {
    const s = coastState();
    const ship = enemyShip(s, 3);
    ship.hp = 1;

    const after = applyAction(s, { type: "BOMBARD", x: 2, y: 1, targetId: ship.id });
    expect(unitById(after, ship.id)).toBeUndefined();
  });
});

describe("naval tower as a lookout", () => {
  it("watches the water out to its own gun range", () => {
    const s = coastState();
    const player = s.players[0];
    const watched = watchedMask(s, player);
    // four tiles east of the tower is still under its eye; seven is not
    expect(watched[idx(s, 2 + NAVAL_TOWER_RANGE, 1)]).toBe(1);
    expect(watched[idx(s, 2 + NAVAL_TOWER_RANGE + 3, 1)]).toBe(0);
  });
});
