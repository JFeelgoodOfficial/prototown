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
  it("requires atomic theory, a bomber, live sight of an enemy city, and an unfired nuke", () => {
    const s = makeTestState(); // capitals at (1,1) for p0 and (6,6) for p1
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(0);

    s.players[0].techs.push("atomic_theory");
    // enemy capital is out of live sight: still nothing
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(0);

    // a scout standing next to the enemy capital brings it into sight — but
    // sight alone drops no bomb, there is nothing to fly it
    addUnit(s, 0, "warrior", 5, 5);
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(0);

    const bomber = addUnit(s, 0, "bomber", 4, 4); // 2 tiles off the target
    const nukes = nukesIn(computeLegalActions(s, 0));
    expect(nukes).toHaveLength(1);
    expect(nukes[0]).toMatchObject({ unitId: bomber.id, cityId: s.cities[1].id });

    // never your own city, and never a second nuke for anyone
    s.nukeLaunched = true;
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(0);
  });

  it("offers the run only from a bomber that is close enough and still has its strike", () => {
    const s = makeTestState();
    s.players[0].techs.push("atomic_theory");
    addUnit(s, 0, "warrior", 5, 5); // keeps the enemy capital watched throughout

    // out at 4 tiles the bomb cannot be flown; one tile closer it can
    const far = addUnit(s, 0, "bomber", 2, 2);
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(0);
    far.x = 3;
    far.y = 3;
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(1);

    // a plane that has already struck this turn is done flying
    far.attacked = true;
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(0);
    far.attacked = false;

    // having merely moved is no bar: flying in and dropping is one sortie
    far.moved = true;
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(1);

    // and no other unit type will do, however close it stands
    far.type = "missile";
    expect(nukesIn(computeLegalActions(s, 0))).toHaveLength(0);
  });

  it("lists one run per bomber that can reach the city", () => {
    const s = makeTestState();
    s.players[0].techs.push("atomic_theory");
    addUnit(s, 0, "warrior", 5, 5);
    const a = addUnit(s, 0, "bomber", 4, 4);
    const b = addUnit(s, 0, "bomber", 3, 5);
    const runs = nukesIn(computeLegalActions(s, 0)) as Array<{ unitId: number }>;
    expect(runs.map((r) => r.unitId).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("nuke detonation", () => {
  /** Player 0 with the bomb and a bomber standing off two tiles to fly it. */
  function armedState() {
    const s = makeTestState();
    s.players[0].techs.push("atomic_theory");
    addUnit(s, 0, "warrior", 5, 5); // spotter, inside the blast
    addUnit(s, 0, "bomber", 4, 4); // carrier, outside it
    return s;
  }

  /** The one legal nuke run against this city, as the engine offers it. */
  function runAt(s: ReturnType<typeof makeTestState>, cityId: number): Action {
    const run = computeLegalActions(s, 0).find((a) => a.type === "LAUNCH_NUKE" && a.cityId === cityId);
    expect(run).toBeDefined();
    return run!;
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

    const next = applyAction(s, runAt(s, target.id));

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
    const next = applyAction(s, runAt(s, s.cities[1].id));
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

    const next = applyAction(s, runAt(s, target.id));

    expect(cityById(next, adjacent.id)).toBeUndefined();
    expect(cityById(next, refuge.id)).toBeDefined();
    expect(next.players[1].alive).toBe(true);
    expect(tileAt(next, 4, 4).cityId).toBeNull();
    expect(next.units.find((u) => u.id === orphan.id)?.homeCityId).toBeNull();
  });

  it("spends the carrier's turn and brings it home from a stand-off tile", () => {
    const s = armedState();
    const bomber = s.units.find((u) => u.type === "bomber")!;
    const next = applyAction(s, runAt(s, s.cities[1].id));

    const after = next.units.find((u) => u.id === bomber.id);
    expect(after).toBeDefined();
    expect(after).toMatchObject({ x: 4, y: 4, moved: true, attacked: true });
  });

  it("loses the carrier when it drops from directly overhead", () => {
    const s = makeTestState();
    s.players[0].techs.push("atomic_theory");
    const bomber = addUnit(s, 0, "bomber", 6, 5); // inside the ring it is about to make
    const next = applyAction(s, runAt(s, s.cities[1].id));
    expect(next.units.find((u) => u.id === bomber.id)).toBeUndefined();
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
