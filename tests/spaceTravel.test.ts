import { describe, it, expect } from "vitest";
import { newGame } from "../src/engine/mapgen";
import { applyAction } from "../src/engine/reducer";
import { computeLegalActions } from "../src/engine/legalActions";
import type { Action } from "../src/engine/actions";
import { makeTestState, addUnit } from "./helpers";
import { techAvailable, TECH_BY_ID } from "../src/data/techs";
import { wantsSpaceTravel, BALANCED } from "../src/ai/evaluate";
import { HeuristicAgent } from "../src/ai/heuristicAgent";
import {
  idx,
  planetOf,
  tileAt,
  unitsOf,
  citiesOf,
  neighbors,
  type GameState,
  type Unit,
} from "../src/engine/state";

const ALL_TECHS_BUT_SPACE = Object.keys(TECH_BY_ID).filter((t) => t !== "space_travel");

/** A twin world where player 0 is ready to reach for the stars. */
function spaceReady(): GameState {
  const s = newGame({
    seed: 7,
    size: 5,
    mapType: "twin_globes",
    tribes: ["meridia", "ashfen"],
    winMode: "domination",
  });
  const p0 = s.players[0];
  p0.techs = ["rocketry", "space_travel"];
  p0.stars = 100;
  return s;
}

/** A field tile inside the player's capital territory with nothing on it. */
function padSite(s: GameState, playerId: number): [number, number] {
  const capital = citiesOf(s, playerId).find((c) => c.isCapital)!;
  const t = s.tiles.find(
    (t) =>
      t.cityId === capital.id &&
      !t.cityHere &&
      !t.village &&
      !t.ruin &&
      t.terrain !== "void" &&
      t.building === null,
  )!;
  t.terrain = "field";
  t.resource = null;
  return [t.x, t.y];
}

function legalOf(s: GameState): Action[] {
  return computeLegalActions(s, s.currentPlayerId);
}

/** Walk player 0 through pad + station, returning the state and pad coords. */
function withStation(): { s: GameState; pad: [number, number] } {
  let s = spaceReady();
  const pad = padSite(s, 0);
  const build = legalOf(s).find(
    (a) => a.type === "BUILD" && a.building === "spaceport" && a.x === pad[0] && a.y === pad[1],
  )!;
  expect(build).toBeDefined();
  s = applyAction(s, build);
  const station = legalOf(s).find((a) => a.type === "BUILD_IMPROVEMENT" && a.improvement === "station")!;
  expect(station).toBeDefined();
  s = applyAction(s, station);
  return { s, pad };
}

/** Put a fresh warrior of the current player on the pad, ready to launch. */
function boardPad(s: GameState, pad: [number, number]): Unit {
  const u = addUnit(s, 0, "warrior", pad[0], pad[1]);
  return u;
}

/** End turns until it is player 0's turn again. */
function roundTrip(s: GameState): GameState {
  do {
    s = applyAction(s, { type: "END_TURN" });
  } while (s.currentPlayerId !== 0 && s.winnerId === null);
  return s;
}

describe("space travel gating", () => {
  it("exists only on twin-globe maps", () => {
    expect(techAvailable("twin_globes", "space_travel")).toBe(true);
    for (const m of ["square", "circle", "continents", "globe"] as const) {
      expect(techAvailable(m, "space_travel")).toBe(false);
    }
    expect(TECH_BY_ID.space_travel.tier).toBe(4);
    expect(TECH_BY_ID.space_travel.requires).toBe("rocketry");
  });

  it("is never offered for research on a square map", () => {
    const s = makeTestState(8);
    s.players[0].techs = [...ALL_TECHS_BUT_SPACE];
    s.players[0].stars = 1000;
    const research = legalOf(s).filter((a) => a.type === "RESEARCH");
    expect(research.length).toBe(0);
  });

  it("is never granted by a ruin off twin maps", () => {
    for (let seed = 0; seed < 20; seed++) {
      let s = makeTestState(8);
      s.rngState = seed * 7919 + 3;
      s.players[0].techs = [...ALL_TECHS_BUT_SPACE];
      const u = addUnit(s, 0, "warrior", 4, 4);
      s.tiles[idx(s, 4, 5)].ruin = true;
      s = applyAction(s, { type: "MOVE", unitId: u.id, x: 4, y: 5 });
      expect(s.lastRuinReward!.kind).not.toBe("tech");
      expect(s.players[0].techs).not.toContain("space_travel");
    }
  });

  it("wantsSpaceTravel is on for grounded twin tribes and off elsewhere", () => {
    const s = spaceReady();
    expect(wantsSpaceTravel(s, 0)).toBe(true);
    expect(wantsSpaceTravel(s, 1)).toBe(true);
    expect(wantsSpaceTravel(makeTestState(8), 0)).toBe(false);
  });
});

describe("spaceport and station", () => {
  it("builds a spaceport only on clear field, and the station only after it", () => {
    const s = spaceReady();
    // no spaceport in territory yet: no station on offer
    expect(legalOf(s).some((a) => a.type === "BUILD_IMPROVEMENT" && a.improvement === "station")).toBe(false);

    const pad = padSite(s, 0);
    // a resource blocks the pad, like it blocks a lumber hut
    tileAt(s, pad[0], pad[1]).resource = "fruit";
    expect(
      legalOf(s).some((a) => a.type === "BUILD" && a.building === "spaceport" && a.x === pad[0] && a.y === pad[1]),
    ).toBe(false);
    tileAt(s, pad[0], pad[1]).resource = null;
    expect(
      legalOf(s).some((a) => a.type === "BUILD" && a.building === "spaceport" && a.x === pad[0] && a.y === pad[1]),
    ).toBe(true);
  });

  it("station purchase surveys the other planet from orbit", () => {
    const { s } = withStation();
    const capital = citiesOf(s, 0)[0];
    expect(capital.spaceStation).toBe(true);
    // only one station per city
    expect(legalOf(s).some((a) => a.type === "BUILD_IMPROVEMENT" && a.improvement === "station")).toBe(false);

    const home = planetOf(s, capital.x);
    const seen = s.tiles.filter(
      (t) => planetOf(s, t.x) !== home && s.players[0].explored[idx(s, t.x, t.y)] === 1,
    );
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe("launch, orbit, landing", () => {
  it("launches only from a friendly pad with a station, and orbit ends the turn", () => {
    let { s, pad } = withStation();
    // a unit standing off the pad cannot launch
    const stray = addUnit(s, 0, "warrior", citiesOf(s, 0)[0].x, citiesOf(s, 0)[0].y);
    expect(legalOf(s).some((a) => a.type === "LAUNCH" && a.unitId === stray.id)).toBe(false);

    const u = boardPad(s, pad);
    const launch = legalOf(s).find((a) => a.type === "LAUNCH" && a.unitId === u.id)!;
    expect(launch).toBeDefined();
    s = applyAction(s, launch);
    const orbiting = unitsOf(s, 0).find((x) => x.id === u.id)!;
    expect(orbiting.embarked).toBe("orbit");
    expect(orbiting.moved).toBe(true);
    expect(orbiting.attacked).toBe(true);
    // spent: nothing else for this unit this turn
    expect(legalOf(s).some((a) => a.type === "LAND" && a.unitId === u.id)).toBe(false);
  });

  it("cannot launch without the station", () => {
    let s = spaceReady();
    const pad = padSite(s, 0);
    const build = legalOf(s).find(
      (a) => a.type === "BUILD" && a.building === "spaceport" && a.x === pad[0] && a.y === pad[1],
    )!;
    s = applyAction(s, build);
    const u = boardPad(s, pad);
    expect(legalOf(s).some((a) => a.type === "LAUNCH" && a.unitId === u.id)).toBe(false);
  });

  it("a unit in orbit cannot move, attack, or be attacked", () => {
    let { s, pad } = withStation();
    const u = boardPad(s, pad);
    s = applyAction(s, legalOf(s).find((a) => a.type === "LAUNCH" && a.unitId === u.id)!);
    s = roundTrip(s);

    const orbiting = unitsOf(s, 0).find((x) => x.id === u.id)!;
    expect(orbiting.embarked).toBe("orbit");
    const mine = legalOf(s);
    expect(mine.some((a) => a.type === "MOVE" && a.unitId === u.id)).toBe(false);
    expect(mine.some((a) => a.type === "ATTACK" && a.unitId === u.id)).toBe(false);
    expect(mine.some((a) => a.type === "FORTIFY" && a.unitId === u.id)).toBe(false);

    // an enemy warrior parks right beside the pad — and still can't touch it
    const [ex, ey] = neighbors(s, pad[0], pad[1]).find(([nx, ny]) => {
      const t = tileAt(s, nx, ny);
      return t.terrain === "field" && !t.cityHere && !s.units.some((w) => w.x === nx && w.y === ny);
    })!;
    addUnit(s, 1, "warrior", ex, ey);
    const theirs = computeLegalActions(applyAction(s, { type: "END_TURN" }), 1);
    expect(theirs.some((a) => a.type === "ATTACK" && "targetId" in a && a.targetId === u.id)).toBe(false);
  });

  it("lands next turn on explored land of the other planet, or aborts to the pad", () => {
    let { s, pad } = withStation();
    const u = boardPad(s, pad);
    const home = planetOf(s, pad[0]);
    s = applyAction(s, legalOf(s).find((a) => a.type === "LAUNCH" && a.unitId === u.id)!);
    s = roundTrip(s);

    const lands = legalOf(s).filter((a): a is Action & { type: "LAND" } => a.type === "LAND" && a.unitId === u.id);
    expect(lands.length).toBeGreaterThan(1);
    for (const a of lands) {
      if (a.x === pad[0] && a.y === pad[1]) continue; // the abort option
      expect(planetOf(s, a.x)).not.toBe(home);
      expect(s.players[0].explored[idx(s, a.x, a.y)]).toBe(1);
      expect(["field", "forest", "mountain"]).toContain(tileAt(s, a.x, a.y).terrain);
    }
    // the abort is always among the options
    expect(lands.some((a) => a.x === pad[0] && a.y === pad[1])).toBe(true);

    const target = lands.find((a) => !(a.x === pad[0] && a.y === pad[1]))!;
    s = applyAction(s, target);
    const landed = unitsOf(s, 0).find((x) => x.id === u.id)!;
    expect(landed.embarked).toBeNull();
    expect([landed.x, landed.y]).toEqual([target.x, target.y]);
    expect(landed.moved).toBe(true); // landing ends the turn's movement
    expect(planetOf(s, landed.x)).not.toBe(home);
  });

  it("the AI builds the pad and station, launches, and lands on the other world", () => {
    let s = spaceReady();
    // Fund the space program and nothing else: no rivals share the home
    // planet, so the only thing worth doing is going up.
    const agent = new HeuristicAgent(BALANCED);
    const home = planetOf(s, citiesOf(s, 0)[0].x);
    let builtPad = false;
    let boughtStation = false;
    let launched = false;
    let landed = false;
    let safety = 6000;
    while (safety-- > 0 && !landed && s.winnerId === null) {
      if (s.currentPlayerId === 0) s.players[0].stars = Math.max(s.players[0].stars, 30);
      const action = agent.chooseAction(s, s.currentPlayerId);
      if (s.currentPlayerId === 0) {
        if (action.type === "BUILD" && action.building === "spaceport") builtPad = true;
        if (action.type === "BUILD_IMPROVEMENT" && action.improvement === "station") boughtStation = true;
        if (action.type === "LAUNCH") launched = true;
      }
      s = applyAction(s, action);
      for (const u of unitsOf(s, 0)) {
        if (u.embarked === null && planetOf(s, u.x) !== home) landed = true;
      }
    }
    expect(builtPad).toBe(true);
    expect(boughtStation).toBe(true);
    expect(launched).toBe(true);
    expect(landed).toBe(true);
  }, 60000);

  it("wins domination by conquering the last city across the void", () => {
    let { s } = withStation();
    // beam the invader straight down: the travel mechanics are covered above
    const enemyCapital = citiesOf(s, 1)[0];
    const u = addUnit(s, 0, "warrior", enemyCapital.x, enemyCapital.y);
    const capture = legalOf(s).find((a) => a.type === "CAPTURE" && a.unitId === u.id)!;
    expect(capture).toBeDefined();
    s = applyAction(s, capture);
    expect(s.players[1].alive).toBe(false);
    expect(s.winnerId).toBe(0);
  });
});
