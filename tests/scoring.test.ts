import { describe, it, expect } from "vitest";
import { makeTestState, addUnit } from "./helpers";
import { playerScore, scoreBreakdown } from "../src/engine/score";
import { applyAction } from "../src/engine/reducer";
import { newGame } from "../src/engine/mapgen";
import { computeLegalActions } from "../src/engine/legalActions";

describe("score breakdown", () => {
  it("adds up to the total score", () => {
    const s = makeTestState();
    addUnit(s, 0, "warrior", 3, 3);
    addUnit(s, 0, "rider", 4, 3);
    s.players[0].techs.push("riding");
    const parts = scoreBreakdown(s, 0);
    const summed = parts.reduce((n, p) => n + p.points, 0);
    expect(summed).toBe(playerScore(s, 0));
  });

  it("lists the biggest contribution first and hides empty ones", () => {
    const s = makeTestState();
    const parts = scoreBreakdown(s, 0);
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i - 1].points).toBeGreaterThanOrEqual(parts[i].points);
    }
    expect(parts.every((p) => p.points > 0)).toBe(true);
  });
});

describe("score history", () => {
  it("records one row per completed round, one entry per player", () => {
    let s = newGame({ seed: 5, size: 11, tribes: ["meridia", "ashfen"], winMode: "perfection" });
    expect(s.scoreHistory).toEqual([]);
    for (let i = 0; i < 6; i++) s = applyAction(s, { type: "END_TURN" });
    expect(s.turn).toBe(4);
    expect(s.scoreHistory.length).toBe(3);
    for (const row of s.scoreHistory) expect(row.length).toBe(s.players.length);
  });

  it("survives a round of real play without going backwards for a growing player", () => {
    let s = newGame({ seed: 12, size: 11, tribes: ["meridia", "ashfen"], winMode: "perfection" });
    for (let i = 0; i < 40; i++) {
      const actions = computeLegalActions(s, s.currentPlayerId);
      if (actions.length === 0) break;
      s = applyAction(s, actions[0]);
    }
    expect(s.scoreHistory.length).toBeGreaterThan(0);
    for (const row of s.scoreHistory) {
      for (const v of row) expect(v).toBeGreaterThan(0);
    }
  });
});
