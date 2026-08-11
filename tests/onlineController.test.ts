import { describe, it, expect } from "vitest";
import { GameController } from "../src/game/controller";
import { serialize } from "../src/engine/serialize";
import { actionKey, type Action } from "../src/engine/actions";
import { mulberry32 } from "../src/engine/rng";
import { buildState, configForNewGame } from "../src/net/replay";
import type { OnlineConfig, OnlineSessionHandle, OnlineStatus, SeatRef } from "../src/net/types";

/**
 * Two controllers playing the same online game against an in-memory server:
 * an append-only log with the same optimistic index check as the submit RPC.
 */

interface Row {
  idx: number;
  action: Action;
}

class FakeServer {
  log: Row[] = [];
  sessions: FakeSession[] = [];

  submit(expectedIdx: number, action: Action): void {
    if (expectedIdx !== this.log.length) {
      throw Object.assign(new Error("conflict"), { kind: "conflict" });
    }
    this.log.push({ idx: expectedIdx, action });
    // deliver to everyone, like the realtime channel does
    for (const s of this.sessions) s.pull();
  }
}

class FakeSession implements OnlineSessionHandle {
  status: OnlineStatus = "live";
  lastMoveAt = 0;
  ref: SeatRef;
  private count = 0;

  constructor(
    private server: FakeServer,
    private controller: GameController,
    seatNo: number,
    private drives: Set<number>,
  ) {
    this.ref = { gameId: "fake", seatNo, token: "fake-token" };
    server.sessions.push(this);
  }

  onLocalAction(action: Action): void {
    const idx = this.count;
    this.count++;
    try {
      this.server.submit(idx, action);
    } catch (err) {
      if ((err as { kind?: string }).kind !== "conflict") throw err;
      // deterministic AI race: the committed action must be the one we applied
      expect(actionKey(this.server.log[idx].action)).toBe(actionKey(action));
    }
  }

  /** Apply any server rows this client hasn't seen (the realtime path). */
  pull(): void {
    while (this.count < this.server.log.length) {
      const row = this.server.log[this.count];
      this.count++;
      this.controller.applyRemoteAction(row.action);
    }
    this.controller.maybePumpOnline();
  }

  drivesSeat(seatNo: number): boolean {
    return this.drives.has(seatNo);
  }

  localCount(): number {
    return this.count;
  }

  async requestTakeover(): Promise<void> {}
  async rematch(): Promise<SeatRef> {
    throw new Error("unused");
  }
  rematchReady(): SeatRef | null {
    return null;
  }
  detach(): void {}
}

async function waitFor(check: () => boolean, ms = 15000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 10));
  }
}

function setUpPair(config: OnlineConfig, drivesA: Set<number>, drivesB: Set<number>) {
  const server = new FakeServer();
  const a = new GameController();
  const b = new GameController();
  const sessionA = new FakeSession(server, a, 0, drivesA);
  const sessionB = new FakeSession(server, b, 1, drivesB);
  a.startOnlineGame(buildState(config, []), 0, config, sessionA);
  b.startOnlineGame(buildState(config, []), 1, config, sessionB);
  return { server, a, b };
}

const settled = (a: GameController, b: GameController, server: FakeServer) => () =>
  !a.aiBusy &&
  !b.aiBusy &&
  a.state !== null &&
  b.state !== null &&
  serializeOf(a) === serializeOf(b) &&
  server.sessions.every((s) => s.localCount() === server.log.length);

const serializeOf = (c: GameController) => serialize(c.state!, 0, "normal");

describe("two clients sharing an online game", () => {
  it("stay identical while humans alternate and one client pumps the AI", async () => {
    const config = configForNewGame(1, "relaxed", "domination", mulberry32(21));
    // only client A advances the AI seat — B might be offline for all we know
    const { server, a, b } = setUpPair(config, new Set([2]), new Set());

    for (let round = 0; round < 3; round++) {
      await waitFor(() => a.state!.currentPlayerId === 0 && !a.aiBusy);
      a.dispatch({ type: "END_TURN" });
      await waitFor(() => !a.aiBusy);
      await waitFor(settled(a, b, server));
      expect(b.state!.currentPlayerId).toBe(1);

      b.dispatch({ type: "END_TURN" });
      // seat 2 is the AI: A notices via its pull() and pumps it
      await waitFor(() => a.state!.currentPlayerId === 0 && !a.aiBusy);
      await waitFor(settled(a, b, server));
    }
    expect(server.log.length).toBeGreaterThan(6);
    expect(serializeOf(a)).toBe(serializeOf(b));
  }, 30000);

  it("converge even when both clients race to pump the same AI seat", async () => {
    const config = configForNewGame(1, "relaxed", "domination", mulberry32(33));
    // both drive seat 2: submissions race, the idx check dedupes identical moves
    const { server, a, b } = setUpPair(config, new Set([2]), new Set([2]));

    for (let round = 0; round < 2; round++) {
      await waitFor(() => a.state!.currentPlayerId === 0 && !a.aiBusy);
      a.dispatch({ type: "END_TURN" });
      await waitFor(settled(a, b, server));
      b.dispatch({ type: "END_TURN" });
      await waitFor(() => a.state!.currentPlayerId === 0 && b.state!.currentPlayerId === 0);
      await waitFor(settled(a, b, server));
    }
    expect(serializeOf(a)).toBe(serializeOf(b));
  }, 30000);

  it("keeps a remote human's seat untouched when nobody drives it", async () => {
    const config = configForNewGame(0, "relaxed", "domination", mulberry32(44));
    const { a, b } = setUpPair(config, new Set(), new Set());
    a.dispatch({ type: "END_TURN" });
    await waitFor(() => b.state!.currentPlayerId === 1);
    // A must not pump seat 1 — it's B's human seat
    await new Promise((r) => setTimeout(r, 200));
    expect(a.aiBusy).toBe(false);
    expect(a.state!.currentPlayerId).toBe(1);
    expect(b.legal.length).toBeGreaterThan(0);
  });
});
