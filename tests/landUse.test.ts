import { describe, it, expect } from "vitest";
import { makeTestState, addUnit, setTerrain } from "./helpers";
import { computeLegalActions } from "../src/engine/legalActions";
import { applyAction } from "../src/engine/reducer";
import { tileAt } from "../src/engine/state";
import { totalPopulation } from "../src/engine/economy";
import type { Action } from "../src/engine/actions";

/** BUILD actions offered for one tile. */
function buildsAt(s: ReturnType<typeof makeTestState>, x: number, y: number): string[] {
  return computeLegalActions(s, 0)
    .filter((a): a is Extract<Action, { type: "BUILD" }> => a.type === "BUILD" && a.x === x && a.y === y)
    .map((a) => a.building);
}

describe("mining any mountain", () => {
  it("a bare peak in your borders takes a mine, and metal makes it worth more", () => {
    const s = makeTestState(); // p0's capital sits at (1,1), borders one tile out
    s.players[0].techs.push("climbing", "mining");
    s.players[0].stars = 40;
    setTerrain(s, 2, 2, "mountain");
    setTerrain(s, 0, 0, "mountain");
    tileAt(s, 0, 0).resource = "metal";

    expect(buildsAt(s, 2, 2)).toContain("mine");
    expect(buildsAt(s, 0, 0)).toContain("mine");

    const bare = applyAction(s, { type: "BUILD", x: 2, y: 2, building: "mine" });
    const rich = applyAction(s, { type: "BUILD", x: 0, y: 0, building: "mine" });
    // the bare seam feeds 1, the metal one 2 — the same building, twice the yield
    expect(totalPopulation(bare.cities[0])).toBe(1);
    expect(totalPopulation(rich.cities[0])).toBe(2);
  });

  it("stays out of reach without Mining, and off other people's mountains", () => {
    const s = makeTestState();
    s.players[0].stars = 40;
    setTerrain(s, 2, 2, "mountain");
    setTerrain(s, 5, 5, "mountain"); // inside p1's borders
    expect(buildsAt(s, 2, 2)).not.toContain("mine");

    s.players[0].techs.push("climbing", "mining");
    expect(buildsAt(s, 2, 2)).toContain("mine");
    expect(buildsAt(s, 5, 5)).toHaveLength(0);
  });
});

describe("farming ground you have already worked", () => {
  it("a field is farmable once its fruit has been picked", () => {
    const s = makeTestState();
    s.players[0].techs.push("organization", "farming");
    s.players[0].stars = 40;
    tileAt(s, 2, 2).resource = "fruit";

    // fruit still on the tree: harvest it first, no plough yet
    expect(buildsAt(s, 2, 2)).not.toContain("farm");
    expect(tileAt(s, 2, 2).tilled).toBe(false);

    const after = applyAction(s, { type: "HARVEST", x: 2, y: 2 });
    expect(tileAt(after, 2, 2).tilled).toBe(true);
    expect(buildsAt(after, 2, 2)).toContain("farm");

    const farmed = applyAction(after, { type: "BUILD", x: 2, y: 2, building: "farm" });
    // one from the fruit, one from the farm on the cleared ground
    expect(totalPopulation(farmed.cities[0])).toBe(2);
  });

  it("a crop field still farms without being tilled, and feeds twice as many", () => {
    const s = makeTestState();
    s.players[0].techs.push("farming");
    s.players[0].stars = 40;
    tileAt(s, 2, 2).resource = "crop";

    expect(buildsAt(s, 2, 2)).toContain("farm");
    const farmed = applyAction(s, { type: "BUILD", x: 2, y: 2, building: "farm" });
    expect(totalPopulation(farmed.cities[0])).toBe(2);
  });

  it("untouched empty ground is not farmland", () => {
    const s = makeTestState();
    s.players[0].techs.push("farming");
    s.players[0].stars = 40;
    expect(buildsAt(s, 2, 2)).not.toContain("farm");
  });

  it("never paves over an unharvested resource", () => {
    const s = makeTestState();
    s.players[0].techs.push("flight", "farming");
    s.players[0].stars = 60;
    tileAt(s, 2, 2).resource = "fruit";
    expect(buildsAt(s, 2, 2)).not.toContain("airfield");
  });
});

describe("founding a town on neutral ground", () => {
  const foundIn = (s: ReturnType<typeof makeTestState>) =>
    computeLegalActions(s, 0).filter((a) => a.type === "FOUND_CITY");

  it("costs a hundred stars and needs a unit on unclaimed land", () => {
    const s = makeTestState();
    const unit = addUnit(s, 0, "warrior", 4, 4); // well outside both capitals' borders
    s.players[0].stars = 99;
    expect(foundIn(s)).toHaveLength(0);

    s.players[0].stars = 100;
    expect(foundIn(s)).toHaveLength(1);

    const after = applyAction(s, { type: "FOUND_CITY", unitId: unit.id });
    expect(after.players[0].stars).toBe(0);
    expect(after.cities).toHaveLength(3);
    const town = after.cities[2];
    expect(town.ownerId).toBe(0);
    expect(town.isCapital).toBe(false);
    expect(town.level).toBe(1);
    expect(tileAt(after, 4, 4).cityHere).toBe(town.id);
    // the new town claims the ring around it, and adopts the settlers
    expect(tileAt(after, 3, 3).cityId).toBe(town.id);
    expect(after.units.find((u) => u.id === unit.id)!.homeCityId).toBe(town.id);
  });

  it("never inside anyone's borders, on a village, or from a boat", () => {
    const s = makeTestState();
    s.players[0].stars = 200;

    const inside = addUnit(s, 0, "warrior", 2, 2); // p0's own territory
    expect(foundIn(s).some((a) => a.unitId === inside.id)).toBe(false);

    tileAt(s, 4, 4).village = true;
    const onVillage = addUnit(s, 0, "warrior", 4, 4);
    expect(foundIn(s).some((a) => a.unitId === onVillage.id)).toBe(false);

    const afloat = addUnit(s, 0, "warrior", 4, 6);
    afloat.embarked = "ship";
    setTerrain(s, 4, 6, "water");
    expect(foundIn(s).some((a) => a.unitId === afloat.id)).toBe(false);
  });
});
