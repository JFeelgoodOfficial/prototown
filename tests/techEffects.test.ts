import { describe, it, expect } from "vitest";
import { makeTestState, addCity, addUnit, setTerrain } from "./helpers";
import type { GameState } from "../src/engine/state";
import { idx, playerById } from "../src/engine/state";
import { reachableTiles } from "../src/engine/movement";
import { cityIncome, cityCapacity, playerIncome } from "../src/engine/economy";
import { computeLegalActions } from "../src/engine/legalActions";
import { applyAction } from "../src/engine/reducer";
import { playerScore } from "../src/engine/score";
import { newGame } from "../src/engine/mapgen";
import { TECHS, techCost } from "../src/data/techs";
import { UNITS } from "../src/data/units";
import { TERRAIN } from "../src/data/terrain";
import {
  HARVEST_DEFS,
  BUILDING_DEFS,
  CITY_IMPROVEMENTS,
  MAX_PARKS_PER_CITY,
  PARK_POINTS,
  WHALE_STARS,
} from "../src/data/constants";

/** Paint a strip of tiles as territory of the player's first city. */
function claimRow(state: GameState, cityId: number, y: number, x0: number, x1: number): void {
  for (let x = x0; x <= x1; x++) state.tiles[idx(state, x, y)].cityId = cityId;
}

function reaches(state: GameState, unitId: number, x: number, y: number): boolean {
  const unit = state.units.find((u) => u.id === unitId)!;
  return reachableTiles(state, unit).some(([rx, ry]) => rx === x && ry === y);
}

describe("Roads", () => {
  /** A capital at (1,1) with a long claimed corridor east along row 1. */
  function corridorState(): GameState {
    const s = makeTestState(10);
    s.units = [];
    claimRow(s, s.cities[0].id, 1, 0, 8);
    return s;
  }

  it("doubles movement along your own territory", () => {
    const s = corridorState();
    const u = addUnit(s, 0, "warrior", 1, 1);
    expect(reaches(s, u.id, 3, 1)).toBe(false);

    s.players[0].techs.push("roads");
    expect(reaches(s, u.id, 3, 1)).toBe(true);
    // exactly two half-cost steps, and not a third
    expect(reaches(s, u.id, 4, 1)).toBe(false);
  });

  it("stops woods inside your borders from halting a move", () => {
    const s = corridorState();
    // a full column of trees, so there is no way round on the diagonals
    for (let y = 0; y < s.size; y++) setTerrain(s, 2, y, "forest");
    const u = addUnit(s, 0, "rider", 1, 1);
    // entering the wood ends the move, so the far side is out of reach
    expect(reaches(s, u.id, 3, 1)).toBe(false);

    s.players[0].techs.push("roads");
    expect(reaches(s, u.id, 3, 1)).toBe(true);
  });

  it("does nothing outside your own territory", () => {
    const s = corridorState();
    const u = addUnit(s, 0, "warrior", 5, 5); // unclaimed ground
    const before = reachableTiles(s, u).length;
    s.players[0].techs.push("roads");
    expect(reachableTiles(s, u).length).toBe(before);
  });

  it("does not speed up embarked units over your own water", () => {
    const s = corridorState();
    for (let x = 0; x <= 8; x++) setTerrain(s, x, 1, "water");
    const u = addUnit(s, 0, "warrior", 1, 1);
    u.embarked = "raft";
    const before = reachableTiles(s, u).length;
    s.players[0].techs.push("roads");
    expect(reachableTiles(s, u).length).toBe(before);
  });

  it("still lets an enemy halt a roaded unit", () => {
    const open = corridorState();
    open.players[0].techs.push("roads");
    const rider = addUnit(open, 0, "rider", 1, 1);
    // four half-cost steps down the corridor
    expect(reaches(open, rider.id, 5, 1)).toBe(true);

    const blocked = corridorState();
    blocked.players[0].techs.push("roads");
    const u = addUnit(blocked, 0, "rider", 1, 1);
    addUnit(blocked, 1, "warrior", 4, 0); // presses (3,1) through (5,1)
    expect(reaches(blocked, u.id, 3, 1)).toBe(true); // may close, but stops there
    expect(reaches(blocked, u.id, 4, 1)).toBe(false);
    expect(reaches(blocked, u.id, 5, 1)).toBe(false);
  });

  it("still respects the Climbing gate", () => {
    const s = corridorState();
    s.players[0].techs.push("roads");
    setTerrain(s, 2, 1, "mountain");
    const u = addUnit(s, 0, "warrior", 1, 1);
    expect(reaches(s, u.id, 2, 1)).toBe(false);
  });
});

describe("Trade", () => {
  it("adds a star per turn to each of your cities", () => {
    const s = makeTestState();
    const mine = s.cities[0];
    const theirs = s.cities[1];
    expect(cityIncome(s, mine)).toBe(2);

    s.players[0].techs.push("trade");
    expect(cityIncome(s, mine)).toBe(3);
    // it is the city owner's tech that counts, not whose turn it is
    expect(cityIncome(s, theirs)).toBe(2);
  });

  it("scales player income with the number of cities", () => {
    const s = makeTestState();
    addCity(s, 0, 4, 4);
    const before = playerIncome(s, 0);
    s.players[0].techs.push("trade");
    expect(playerIncome(s, 0)).toBe(before + 2); // two cities
  });
});

describe("Strategy", () => {
  it("lets every city support one more unit", () => {
    const s = makeTestState();
    const city = s.cities[0];
    expect(cityCapacity(s, city)).toBe(2);
    s.players[0].techs.push("strategy");
    expect(cityCapacity(s, city)).toBe(3);
  });

  it("reopens training at the old capacity", () => {
    const s = makeTestState();
    s.units = [];
    const city = s.cities[0];
    s.players[0].stars = 30;
    for (let i = 0; i < 2; i++) {
      const u = addUnit(s, 0, "warrior", 3 + i, 5);
      u.homeCityId = city.id;
    }
    const trains = () =>
      computeLegalActions(s, 0).filter((a) => a.type === "TRAIN" && a.cityId === city.id);
    expect(trains()).toHaveLength(0);

    s.players[0].techs.push("strategy");
    expect(trains().length).toBeGreaterThan(0);
  });
});

describe("Philosophy", () => {
  it("takes a fifth off the price of a tech", () => {
    expect(techCost("trade", 3, false)).toBe(13);
    expect(techCost("trade", 3, true)).toBe(11);
  });

  it("charges exactly what the tech tree quotes", () => {
    const s = makeTestState();
    s.players[0].techs.push("philosophy", "riding");
    s.players[0].stars = 40;
    const quoted = techCost("roads", s.cities.filter((c) => c.ownerId === 0).length, true);
    const after = applyAction(s, { type: "RESEARCH", techId: "roads" });
    expect(playerById(after, 0).stars).toBe(40 - quoted);
  });

  it("does not discount itself", () => {
    const s = makeTestState();
    s.players[0].techs.push("climbing", "meditation");
    s.players[0].stars = 40;
    const full = techCost("philosophy", 1, false);
    const after = applyAction(s, { type: "RESEARCH", techId: "philosophy" });
    expect(playerById(after, 0).stars).toBe(40 - full);
  });
});

describe("Construction and Spiritualism", () => {
  function improvements(s: GameState, cityId: number) {
    return computeLegalActions(s, 0).filter(
      (a) => a.type === "BUILD_IMPROVEMENT" && a.cityId === cityId,
    );
  }

  it("gates buying walls behind Construction", () => {
    const s = makeTestState();
    s.units = [];
    s.players[0].stars = 30;
    const city = s.cities[0];
    expect(improvements(s, city.id)).toHaveLength(0);

    s.players[0].techs.push("construction");
    expect(improvements(s, city.id)).toHaveLength(1);
  });

  it("builds walls once, then stops offering them", () => {
    const s = makeTestState();
    s.units = [];
    s.players[0].stars = 30;
    s.players[0].techs.push("construction");
    const city = s.cities[0];

    const after = applyAction(s, {
      type: "BUILD_IMPROVEMENT",
      cityId: city.id,
      improvement: "walls",
    });
    expect(after.cities[0].walls).toBe(true);
    expect(playerById(after, 0).stars).toBe(30 - CITY_IMPROVEMENTS.walls.cost);
    expect(improvements(after, city.id)).toHaveLength(0);
  });

  it("offers walls even when a unit is standing in the city", () => {
    const s = makeTestState();
    s.units = [];
    s.players[0].stars = 30;
    s.players[0].techs.push("construction");
    const city = s.cities[0];
    addUnit(s, 0, "warrior", city.x, city.y);
    expect(improvements(s, city.id)).toHaveLength(1);
  });

  it("will not offer an improvement you cannot afford", () => {
    const s = makeTestState();
    s.units = [];
    s.players[0].techs.push("construction");
    s.players[0].stars = CITY_IMPROVEMENTS.walls.cost - 1;
    expect(improvements(s, s.cities[0].id)).toHaveLength(0);
  });

  it("buys parks for score, up to the cap", () => {
    const s = makeTestState();
    s.units = [];
    s.players[0].stars = 60;
    s.players[0].techs.push("spiritualism");
    const city = s.cities[0];

    const before = playerScore(s, 0);
    let cur = applyAction(s, { type: "BUILD_IMPROVEMENT", cityId: city.id, improvement: "park" });
    expect(cur.cities[0].parks).toBe(1);
    expect(playerScore(cur, 0)).toBe(before + PARK_POINTS);

    for (let i = 1; i < MAX_PARKS_PER_CITY; i++) {
      cur = applyAction(cur, {
        type: "BUILD_IMPROVEMENT",
        cityId: city.id,
        improvement: "park",
      });
    }
    expect(cur.cities[0].parks).toBe(MAX_PARKS_PER_CITY);
    const parkActions = computeLegalActions(cur, 0).filter(
      (a) => a.type === "BUILD_IMPROVEMENT" && a.improvement === "park",
    );
    expect(parkActions).toHaveLength(0);
  });
});

describe("Whaling", () => {
  function whaleState(): GameState {
    const s = makeTestState();
    s.units = [];
    const city = s.cities[0];
    setTerrain(s, city.x + 1, city.y, "water");
    s.tiles[idx(s, city.x + 1, city.y)].resource = "whale";
    s.players[0].stars = 10;
    return s;
  }

  it("gates the harvest behind the tech", () => {
    const s = whaleState();
    const harvests = () => computeLegalActions(s, 0).filter((a) => a.type === "HARVEST");
    expect(harvests()).toHaveLength(0);
    s.players[0].techs.push("whaling");
    expect(harvests()).toHaveLength(1);
  });

  it("pays stars rather than population", () => {
    const s = whaleState();
    s.players[0].techs.push("whaling");
    const city = s.cities[0];
    const after = applyAction(s, { type: "HARVEST", x: city.x + 1, y: city.y });

    expect(playerById(after, 0).stars).toBe(10 - HARVEST_DEFS.whale.cost + WHALE_STARS);
    expect(after.tiles[idx(after, city.x + 1, city.y)].resource).toBeNull();
    expect(after.cities[0].population).toBe(0);
    expect(after.cities[0].level).toBe(1);
    expect(after.cities[0].pendingReward).toBeNull();
  });

  it("only ever places whales on shallow water", () => {
    let whales = 0;
    let reachable = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = newGame({ seed, size: 11, tribes: ["ashfen", "korvani"], winMode: "perfection" });
      for (const t of s.tiles) {
        if (t.resource !== "whale") continue;
        whales++;
        expect(t.terrain).toBe("water");
        if (t.cityId !== null) reachable++;
      }
    }
    expect(whales).toBeGreaterThan(0);
    // a whale nobody can ever reach is dead content
    expect(reachable).toBeGreaterThan(0);
  });
});

describe("tech tree", () => {
  it("gives every tech something to do", () => {
    const wired = new Set<string>();
    for (const def of Object.values(UNITS)) if (def.tech) wired.add(def.tech);
    for (const def of Object.values(HARVEST_DEFS)) wired.add(def.tech);
    for (const def of Object.values(BUILDING_DEFS)) wired.add(def.tech);
    for (const def of Object.values(CITY_IMPROVEMENTS)) wired.add(def.tech);
    for (const def of Object.values(TERRAIN)) {
      if (def.requiresTech) wired.add(def.requiresTech);
      if (def.defenceTech) wired.add(def.defenceTech);
    }
    // techs read directly by engine code rather than by a data table
    for (const id of ["roads", "trade", "strategy", "philosophy", "free_spirit", "navigation", "atomic_theory"]) {
      wired.add(id);
    }

    const inert = TECHS.filter((t) => !wired.has(t.id)).map((t) => t.id);
    expect(inert).toEqual([]);
  });

  it("describes each tech without falling back on score", () => {
    const vague = TECHS.filter((t) => t.blurb.includes("(score)")).map((t) => t.id);
    expect(vague).toEqual([]);
  });
});
