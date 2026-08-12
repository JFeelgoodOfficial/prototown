import { describe, it, expect } from "vitest";
import { makeTestState, addUnit, addCity, setTerrain } from "./helpers";
import { computeLegalActions } from "../src/engine/legalActions";
import { applyAction } from "../src/engine/reducer";
import { reachableTiles } from "../src/engine/movement";
import { tileAt, unitAt, cityById } from "../src/engine/state";
import type { Action } from "../src/engine/actions";

const nukesIn = (actions: Action[]) => actions.filter((a) => a.type === "LAUNCH_NUKE");

describe("atomic theory research gating", () => {
  it("cannot be researched before rocketry", () => {
    const s = makeTestState();
    s.players[0].stars = 100;
    const ids = (pid: number) =>
      computeLegalActions(s, pid)
        .filter((a) => a.type === "RESEARCH")
        .map((a) => (a as { techId: string }).techId);

    expect(ids(0)).not.toContain("rocketry"); // needs mathematics
    expect(ids(0)).not.toContain("atomic_theory");

    s.players[0].techs.push("hunting", "forestry", "mathematics");
    expect(ids(0)).toContain("rocketry");
    expect(ids(0)).not.toContain("atomic_theory");

    s.players[0].techs.push("rocketry");
    expect(ids(0)).toContain("atomic_theory");
  });
});

describe("nuke legality", () => {
  it("requires atomic theory, live sight of an enemy city, and an unfired nuke", () => {
    const s = makeTestState(); // capitals at (1,1) for p0 and (6,6) for p1
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(0);

    s.players[0].techs.push("atomic_theory");
    // enemy capital is out of live sight: still nothing
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(0);

    // a scout standing next to the enemy capital brings it into sight
    addUnit(s, 0, "warrior", 5, 5);
    const nukes = nukesIn(computeLegalActions(s, 0));
    expect(nukes).toHaveLength(1);
    expect((nukes[0] as { cityId: number }).cityId).toBe(s.cities[1].id);

    // never your own city, and never a second nuke for anyone
    s.nukeLaunched = true;
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(0);
  });
});

describe("nuke detonation", () => {
  function armedState() {
    const s = makeTestState();
    s.players[0].techs.push("atomic_theory");
    addUnit(s, 0, "warrior", 5, 5); // spotter, inside the blast
    return s;
  }

  it("craters the city and its 8 neighbours, killing units of every owner", () => {
    const s = armedState();
    const target = s.cities[1]; // (6,6)
    tileAt(s, 5, 6).resource = "fruit";
    tileAt(s, 6, 5).building = "farm";
    tileAt(s, 7, 7).village = true;
    tileAt(s, 7, 5).ruin = true;
    addUnit(s, 1, "warrior", 6, 5); // defender inside the blast
    const survivor = addUnit(s, 0, "warrior", 3, 3); // outside

    const next = applyAction(s, { type: "LAUNCH_NUKE", cityId: target.id });

    expect(next.nukeLaunched).toBe(true);
    for (let y = 5; y <= 7; y++)
      for (let x = 5; x <= 7; x++) {
        const t = tileAt(next, x, y);
        expect(t.terrain).toBe("crater");
        expect(t.resource).toBeNull();
        expect(t.building).toBeNull();
        expect(t.village).toBe(false);
        expect(t.ruin).toBe(false);
        expect(t.cityHere).toBeNull();
        expect(t.cityId).toBeNull();
      }
    expect(cityById(next, target.id)).toBeUndefined();
    expect(unitAt(next, 5, 5)).toBeUndefined(); // own spotter died too
    expect(unitAt(next, 6, 5)).toBeUndefined();
    expect(unitAt(next, 3, 3)?.id).toBe(survivor.id);
  });

  it("eliminates a player whose last city is nuked and ends the game", () => {
    const s = armedState();
    addUnit(s, 1, "warrior", 0, 6); // far from the blast, dies with its tribe
    const next = applyAction(s, { type: "LAUNCH_NUKE", cityId: s.cities[1].id });
    expect(next.players[1].alive).toBe(false);
    expect(next.units.filter((u) => u.ownerId === 1)).toHaveLength(0);
    expect(next.winnerId).toBe(0);
  });

  it("takes an adjacent city with it and releases surviving territory and units", () => {
    const s = armedState();
    const target = s.cities[1];
    const adjacent = addCity(s, 1, 5, 7); // inside the 3x3 around (6,6)
    const refuge = addCity(s, 1, 1, 6); // keeps player 1 alive
    // claimed territory outside the blast, and a surviving unit homed to the target
    tileAt(s, 4, 4).cityId = target.id;
    const orphan = addUnit(s, 1, "warrior", 1, 4);
    orphan.homeCityId = target.id;

    const next = applyAction(s, { type: "LAUNCH_NUKE", cityId: target.id });

    expect(cityById(next, adjacent.id)).toBeUndefined();
    expect(cityById(next, refuge.id)).toBeDefined();
    expect(next.players[1].alive).toBe(true);
    expect(tileAt(next, 4, 4).cityId).toBeNull();
    expect(next.units.find((u) => u.id === orphan.id)?.homeCityId).toBeNull();
  });
});

describe("craters", () => {
  it("can never be entered", () => {
    const s = makeTestState();
    setTerrain(s, 3, 3, "crater");
    const u = addUnit(s, 0, "warrior", 2, 3);
    const reach = reachableTiles(s, u);
    expect(reach).not.toContainEqual([3, 3]);
    expect(reach).toContainEqual([2, 2]); // ordinary neighbours still open
  });
});

describe("missile launcher", () => {
  it("is trainable only with rocketry", () => {
    const s = makeTestState();
    s.players[0].stars = 20;
    const trains = (pid: number) =>
      computeLegalActions(s, pid)
        .filter((a) => a.type === "TRAIN")
        .map((a) => (a as { unitType: string }).unitType);
    expect(trains(0)).not.toContain("missile");
    s.players[0].techs.push("rocketry");
    expect(trains(0)).toContain("missile");
  });

  it("strikes at range 5 but not 6, and takes no retaliation", () => {
    const s = makeTestState();
    const launcher = addUnit(s, 0, "missile", 0, 0);
    addUnit(s, 0, "warrior", 4, 5); // spotter watching the target tile
    const enemy = addUnit(s, 1, "warrior", 5, 5); // Chebyshev 5 from (0,0)

    const attack = computeLegalActions(s, 0).find(
      (a) => a.type === "ATTACK" && a.unitId === launcher.id && a.targetId === enemy.id,
    );
    expect(attack).toBeDefined();

    const next = applyAction(s, attack!);
    const launcherAfter = next.units.find((u) => u.id === launcher.id)!;
    expect(launcherAfter.hp).toBe(launcher.maxHp); // out of the defender's reach
    expect(launcherAfter.attacked).toBe(true);
    const enemyAfter = next.units.find((u) => u.id === enemy.id);
    expect(!enemyAfter || enemyAfter.hp < enemy.maxHp).toBe(true);

    // one tile further is out of range
    const far = makeTestState();
    const launcher2 = addUnit(far, 0, "missile", 0, 0);
    addUnit(far, 0, "warrior", 5, 6);
    const enemy2 = addUnit(far, 1, "warrior", 6, 6);
    const attack2 = computeLegalActions(far, 0).find(
      (a) => a.type === "ATTACK" && a.unitId === launcher2.id && a.targetId === enemy2.id,
    );
    expect(attack2).toBeUndefined();
  });
});
