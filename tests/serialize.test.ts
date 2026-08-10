import { describe, it, expect } from "vitest";
import { newGame } from "../src/engine/mapgen";
import { serialize, deserialize } from "../src/engine/serialize";
import { applyAction } from "../src/engine/reducer";
import { computeLegalActions } from "../src/engine/legalActions";

describe("save / load", () => {
  it("roundtrips a fresh game exactly", () => {
    const s = newGame({ seed: 99, size: 11, tribes: ["meridia", "ashfen"], winMode: "perfection" });
    const restored = deserialize(serialize(s, 12345));
    expect(restored).not.toBeNull();
    expect(JSON.stringify(restored)).toBe(JSON.stringify(s));
  });

  it("roundtrips mid-game and play continues identically", () => {
    let s = newGame({ seed: 5, size: 11, tribes: ["meridia", "ashfen"], winMode: "domination" });
    for (let i = 0; i < 10; i++) {
      const actions = computeLegalActions(s, s.currentPlayerId);
      s = applyAction(s, actions[0]);
    }
    const restored = deserialize(serialize(s, 0))!;
    const a1 = computeLegalActions(s, s.currentPlayerId);
    const a2 = computeLegalActions(restored, restored.currentPlayerId);
    expect(JSON.stringify(a2)).toBe(JSON.stringify(a1));
  });

  it("rejects unknown versions and junk", () => {
    expect(deserialize("not json")).toBeNull();
    expect(deserialize(JSON.stringify({ version: 999, state: {} }))).toBeNull();
  });
});
