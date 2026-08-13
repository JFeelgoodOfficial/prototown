import { describe, it, expect } from "vitest";
import { newGame } from "../src/engine/mapgen";
import { serialize, deserialize } from "../src/engine/serialize";
import { applyAction } from "../src/engine/reducer";
import { computeLegalActions } from "../src/engine/legalActions";

describe("save / load", () => {
  it("roundtrips a fresh game exactly", () => {
    const s = newGame({ seed: 99, size: 11, tribes: ["meridia", "ashfen"], winMode: "perfection" });
    const restored = deserialize(serialize(s, 12345, "hard"));
    expect(restored).not.toBeNull();
    expect(JSON.stringify(restored!.state)).toBe(JSON.stringify(s));
    expect(restored!.savedAt).toBe(12345);
    expect(restored!.difficulty).toBe("hard");
  });

  it("roundtrips mid-game and play continues identically", () => {
    let s = newGame({ seed: 5, size: 11, tribes: ["meridia", "ashfen"], winMode: "domination" });
    for (let i = 0; i < 10; i++) {
      const actions = computeLegalActions(s, s.currentPlayerId);
      s = applyAction(s, actions[0]);
    }
    const restored = deserialize(serialize(s, 0, "normal"))!.state;
    const a1 = computeLegalActions(s, s.currentPlayerId);
    const a2 = computeLegalActions(restored, restored.currentPlayerId);
    expect(JSON.stringify(a2)).toBe(JSON.stringify(a1));
  });

  it("loads version 1 saves, which recorded no difficulty at all", () => {
    const s = newGame({ seed: 7, size: 11, tribes: ["korvani", "thornwood"], winMode: "domination" });
    const restored = deserialize(JSON.stringify({ version: 1, savedAt: 42, state: s }));
    expect(restored).not.toBeNull();
    expect(restored!.difficulty).toBeNull();
    expect(restored!.aggression).toBeNull();
    expect(restored!.savedAt).toBe(42);
    expect(restored!.state.seed).toBe(7);
  });

  it("loads version 2 saves, which recorded difficulty as a multiplier", () => {
    const s = newGame({ seed: 8, size: 11, tribes: ["korvani", "thornwood"], winMode: "domination" });
    const restored = deserialize(JSON.stringify({ version: 2, savedAt: 9, aggression: 1.5, state: s }));
    expect(restored).not.toBeNull();
    expect(restored!.aggression).toBe(1.5);
    expect(restored!.difficulty).toBeNull();
  });

  it("loads version 3 saves, which predate the nuke flag", () => {
    const s = newGame({ seed: 11, size: 11, tribes: ["korvani", "thornwood"], winMode: "domination" });
    const bare = JSON.parse(JSON.stringify(s));
    delete bare.nukeLaunched;
    const restored = deserialize(JSON.stringify({ version: 3, savedAt: 1, difficulty: "normal", state: bare }));
    expect(restored).not.toBeNull();
    expect(restored!.state.nukeLaunched).toBe(false);
  });

  it("loads version 4 saves, which predate map shapes", () => {
    const s = newGame({ seed: 12, size: 11, tribes: ["korvani", "thornwood"], winMode: "domination" });
    const bare = JSON.parse(JSON.stringify(s));
    delete bare.mapType;
    const restored = deserialize(JSON.stringify({ version: 4, savedAt: 1, difficulty: "normal", state: bare }));
    expect(restored).not.toBeNull();
    expect(restored!.state.mapType).toBe("square");
  });

  it("roundtrips a circle game with its map type", () => {
    const s = newGame({ seed: 3, size: 11, mapType: "circle", tribes: ["meridia", "ashfen"], winMode: "domination" });
    const restored = deserialize(serialize(s, 0, "normal"));
    expect(restored!.state.mapType).toBe("circle");
    expect(JSON.stringify(restored!.state)).toBe(JSON.stringify(s));
  });

  it("rejects unknown versions and junk", () => {
    expect(deserialize("not json")).toBeNull();
    expect(deserialize(JSON.stringify({ version: 999, state: {} }))).toBeNull();
    expect(deserialize(JSON.stringify({ version: 3, savedAt: 0, difficulty: "hard", state: {} }))).toBeNull();
  });
});
