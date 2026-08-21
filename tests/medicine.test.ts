import { describe, it, expect } from "vitest";
import { makeTestState, addUnit } from "./helpers";
import { computeLegalActions } from "../src/engine/legalActions";
import { applyAction } from "../src/engine/reducer";
import { tileAt, unitById, type GameState } from "../src/engine/state";
import { HOSPITAL_HEAL, HOSPITAL_RANGE, MEDIC_HEAL } from "../src/data/constants";
import type { Action } from "../src/engine/actions";

/** Round the table so it is p0's turn again, and their wards get seen to. */
function nextOwnTurn(s: GameState): GameState {
  return applyAction(applyAction(s, { type: "END_TURN" }), { type: "END_TURN" });
}

describe("hospitals", () => {
  it("mend everyone inside their catchment at the start of your turn", () => {
    const s = makeTestState(12);
    tileAt(s, 1, 2).building = "hospital"; // inside p0's capital borders
    const near = addUnit(s, 0, "warrior", 1, 4); // two tiles from the ward
    const far = addUnit(s, 0, "warrior", 1, 6); // four tiles away
    near.hp = 3;
    far.hp = 3;

    const after = nextOwnTurn(s);
    expect(unitById(after, near.id)!.hp).toBe(3 + HOSPITAL_HEAL);
    expect(unitById(after, far.id)!.hp).toBe(3);
  });

  it("cost the soldier nothing: a healed unit still has its whole turn", () => {
    const s = makeTestState(12);
    tileAt(s, 1, 2).building = "hospital";
    const hurt = addUnit(s, 0, "warrior", 1, 3);
    hurt.hp = 3;

    const after = nextOwnTurn(s);
    const healed = unitById(after, hurt.id)!;
    expect(healed.hp).toBe(3 + HOSPITAL_HEAL);
    expect(healed.moved).toBe(false);
    expect(healed.attacked).toBe(false);
  });

  it("never heal past full, and never heal the other side", () => {
    const s = makeTestState(12);
    tileAt(s, 1, 2).building = "hospital";
    const mine = addUnit(s, 0, "warrior", 1, 3);
    const theirs = addUnit(s, 1, "warrior", 2, 3);
    mine.hp = 9;
    theirs.hp = 3;

    const after = nextOwnTurn(s);
    expect(unitById(after, mine.id)!.hp).toBe(10);
    expect(unitById(after, theirs.id)!.hp).toBe(3);
  });

  it("gate medics: a city can only train them once it has a ward", () => {
    const s = makeTestState(12);
    s.players[0].techs.push("organization", "farming", "medicine");
    s.players[0].stars = 40;
    const trains = (): string[] =>
      computeLegalActions(s, 0)
        .filter((a): a is Extract<Action, { type: "TRAIN" }> => a.type === "TRAIN")
        .map((a) => a.unitType);

    expect(trains()).not.toContain("medic");
    tileAt(s, 1, 2).building = "hospital";
    expect(trains()).toContain("medic");
  });
});

describe("medics", () => {
  it("patch up whoever they are standing beside", () => {
    const s = makeTestState(12);
    addUnit(s, 0, "medic", 5, 5);
    const beside = addUnit(s, 0, "warrior", 5, 6);
    const away = addUnit(s, 0, "warrior", 5, 8);
    beside.hp = 2;
    away.hp = 2;

    const after = nextOwnTurn(s);
    expect(unitById(after, beside.id)!.hp).toBe(2 + MEDIC_HEAL);
    expect(unitById(after, away.id)!.hp).toBe(2);
  });

  it("cannot treat themselves", () => {
    const s = makeTestState(12);
    const medic = addUnit(s, 0, "medic", 5, 5);
    medic.hp = 2;
    expect(unitById(nextOwnTurn(s), medic.id)!.hp).toBe(2);
  });

  it("carry no weapon, so are never offered an attack", () => {
    const s = makeTestState(12);
    addUnit(s, 1, "warrior", 5, 5);
    addUnit(s, 0, "medic", 5, 4);
    expect(computeLegalActions(s, 0).some((a) => a.type === "ATTACK")).toBe(false);
  });

  it("do not stack with a hospital — a soldier in both takes the better one", () => {
    const s = makeTestState(12);
    tileAt(s, 1, 2).building = "hospital";
    addUnit(s, 0, "medic", 1, 4);
    const hurt = addUnit(s, 0, "warrior", 1, 3); // beside the medic, inside the catchment
    hurt.hp = 1;

    expect(HOSPITAL_HEAL).toBeGreaterThan(MEDIC_HEAL); // the assumption under the test
    expect(unitById(nextOwnTurn(s), hurt.id)!.hp).toBe(1 + HOSPITAL_HEAL);
  });

  it("and a hospital's reach really is its stated radius", () => {
    const s = makeTestState(12);
    tileAt(s, 1, 2).building = "hospital";
    const edge = addUnit(s, 0, "warrior", 1, 2 + HOSPITAL_RANGE);
    edge.hp = 1;
    expect(unitById(nextOwnTurn(s), edge.id)!.hp).toBe(1 + HOSPITAL_HEAL);
  });
});
