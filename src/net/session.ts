import type { GameState } from "../engine/state";
import { actionKey, type Action } from "../engine/actions";
import { serialize, deserialize, SAVE_VERSION } from "../engine/serialize";
import type { GameController } from "../game/controller";
import type { ActionRow, GameRow, OnlineConfig, OnlineSessionHandle, OnlineStatus, SeatRef } from "./types";
import { buildState, applyStep, ReplayError } from "./replay";
import * as api from "./client";
import { NetError } from "./client";
import { rememberGame } from "./registry";
import { tribeById } from "../data/tribes";

/** Thrown when a game was created by a build with a different engine version. */
export class VersionError extends Error {
  constructor(public gameEngine: number) {
    super(`game uses engine v${gameEngine}, this build has v${SAVE_VERSION}`);
    this.name = "VersionError";
  }
}

/**
 * A live connection to one online game. Owns the ordering bookkeeping that
 * keeps every client's replayed state identical to the server log:
 *
 * - `serverCount`: actions known committed on the server (contiguous from 0).
 * - `pending`: actions applied locally but not yet confirmed, oldest first.
 * - invariant: local state = server log[0..serverCount) + pending, so the
 *   local action count is always serverCount + pending.length.
 *
 * Own moves apply optimistically, then a sequential outbox submits them. A
 * realtime insert (or fetched row) at an index we already applied must match
 * the pending action at that position — AI-pump races produce identical
 * actions, so this normally just confirms; a true mismatch forces a full
 * rebuild from the log. Correctness never depends on realtime delivery: every
 * reconnect, tab-refocus, and conflict re-reads the log by index.
 */
export class OnlineSession implements OnlineSessionHandle {
  status: OnlineStatus = "connecting";

  private serverCount: number;
  private pending: Array<{ key: string; action: Action; nextSeat: number; winnerSeat: number | null }> = [];
  private takeovers: Set<number>;
  private lastSnapshotIdx: number;

  private flushing = false;
  private reconciling = false;
  private detached = false;
  private subscription: api.GameSubscription | null = null;
  private onVisible = (): void => {
    if (document.visibilityState === "visible") void this.reconcile();
  };

  constructor(
    private controller: GameController,
    readonly config: OnlineConfig,
    readonly ref: SeatRef,
    row: GameRow,
    logLength: number,
  ) {
    this.serverCount = logLength;
    this.takeovers = new Set(row.takeover_seats ?? []);
    this.lastSnapshotIdx = row.snapshot_idx ?? 0;
  }

  /** Read through a method so TS control flow can't wrongly narrow the field. */
  private isCorrupted(): boolean {
    return this.status === "corrupted";
  }

  localCount(): number {
    return this.serverCount + this.pending.length;
  }

  drivesSeat(seatNo: number): boolean {
    return seatNo >= this.config.humanSeats || this.takeovers.has(seatNo);
  }

  takenOver(seatNo: number): boolean {
    return this.takeovers.has(seatNo);
  }

  /** When the current (absent) player last acted, for the takeover countdown. */
  lastMoveAt: number = Date.now();

  async start(): Promise<void> {
    this.subscription = await api.subscribeGame(this.ref.gameId, {
      onAction: (row) => {
        this.ingest(row);
        this.afterIngest();
      },
      onGame: (row) => {
        this.applyGameRow(row);
        this.controller.touch();
      },
      onStatus: (connected) => {
        if (this.detached) return;
        if (connected) {
          // catch anything that landed while the channel was down
          void this.reconcile();
        } else if (this.status === "live") {
          this.setStatus("offline");
        }
      },
    });
    document.addEventListener("visibilitychange", this.onVisible);
    await this.reconcile();
  }

  detach(): void {
    this.detached = true;
    this.subscription?.close();
    this.subscription = null;
    document.removeEventListener("visibilitychange", this.onVisible);
  }

  /** The controller just applied an action this client originated. */
  onLocalAction(action: Action): void {
    const s = this.controller.state;
    if (!s) return;
    this.pending.push({
      key: actionKey(action),
      action,
      nextSeat: s.currentPlayerId,
      winnerSeat: s.winnerId,
    });
    void this.flush();
  }

  /** Ask the server to hand the absent current player's seat to the AI. */
  async requestTakeover(targetSeat: number): Promise<void> {
    await api.claimAiTakeover(this.ref, targetSeat);
    this.takeovers.add(targetSeat);
    this.controller.touch();
    this.controller.maybePumpOnline();
  }

  private nextGameId: string | null = null;

  /** Start (or join) the rematch. Idempotent server-side: first config wins. */
  async rematch(config: OnlineConfig): Promise<SeatRef> {
    const newId = await api.createRematch(this.ref, config);
    this.nextGameId = newId;
    return { gameId: newId, seatNo: this.ref.seatNo, token: this.ref.token };
  }

  rematchReady(): SeatRef | null {
    if (!this.nextGameId) return null;
    return { gameId: this.nextGameId, seatNo: this.ref.seatNo, token: this.ref.token };
  }

  private setStatus(status: OnlineStatus): void {
    if (this.status === status || this.detached) return;
    this.status = status;
    this.controller.touch();
  }

  // --- outbox ----------------------------------------------------------------

  private async flush(): Promise<void> {
    if (this.flushing || this.detached) return;
    this.flushing = true;
    try {
      let backoff = 1500;
      while (this.pending.length > 0 && !this.detached) {
        const item = this.pending[0];
        const idx = this.serverCount;
        try {
          await api.submitAction(this.ref, idx, item.action, item.nextSeat, item.winnerSeat);
          // confirm — unless a realtime insert already did while we awaited
          if (this.pending[0] === item) {
            this.pending.shift();
            this.serverCount = idx + 1;
          }
          this.setStatus("live");
          backoff = 1500;
          if (item.action.type === "END_TURN" && this.pending.length === 0) void this.maybeSnapshot();
        } catch (err) {
          if (this.detached) break;
          if (err instanceof NetError && err.kind === "conflict") {
            // someone else won this index (usually an identical AI-pump action)
            await this.reconcile();
          } else if (err instanceof NetError && (err.kind === "finished" || err.kind === "not_your_turn" || err.kind === "bad_token")) {
            // our view of the game disagrees with the server's — rebuild
            await this.hardResync();
          } else {
            this.setStatus("offline");
            await sleep(backoff);
            backoff = Math.min(backoff * 2, 15000);
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  // --- inbound ---------------------------------------------------------------

  /**
   * Fold one server log row into local bookkeeping. Rows we already applied
   * confirm (or contradict) the pending queue; the next unseen row applies to
   * the controller as a remote move.
   */
  private ingest(row: ActionRow): void {
    if (this.detached || this.isCorrupted()) return;
    if (row.idx < this.serverCount) return; // already confirmed
    const pos = row.idx - this.serverCount;
    if (pos < this.pending.length) {
      if (pos === 0 && this.pending[0].key === actionKey(row.action)) {
        this.pending.shift();
        this.serverCount = row.idx + 1;
      } else {
        // the server log diverged from what we applied — rebuild from truth
        void this.hardResync();
      }
    } else if (pos === this.pending.length) {
      try {
        this.controller.applyRemoteAction(row.action);
        this.serverCount = row.idx + 1;
        this.lastMoveAt = Date.now();
      } catch {
        void this.hardResync();
      }
    } else {
      // gap: we missed rows, fetch them in order
      void this.reconcile();
    }
  }

  private afterIngest(): void {
    if (this.detached) return;
    this.controller.maybePumpOnline();
    this.controller.touch();
  }

  private applyGameRow(row: GameRow): void {
    this.takeovers = new Set(row.takeover_seats ?? []);
    this.lastMoveAt = Date.parse(row.updated_at) || this.lastMoveAt;
    this.nextGameId = row.next_game_id ?? this.nextGameId;
    if (row.action_count > this.localCount()) void this.reconcile();
  }

  /** Re-read the log tail and game row; the log by index is the truth. */
  async reconcile(): Promise<void> {
    if (this.reconciling || this.detached || this.isCorrupted()) return;
    this.reconciling = true;
    if (this.status !== "connecting") this.setStatus("syncing");
    try {
      const rows = await api.fetchActions(this.ref.gameId, this.serverCount);
      for (const row of rows) {
        this.ingest(row);
        if (this.detached || this.isCorrupted()) return;
      }
      const gameRow = await api.fetchGameRow(this.ref.gameId);
      this.applyGameRow(gameRow);
      this.setStatus("live");
      this.afterIngest();
      if (this.pending.length > 0) void this.flush();
    } catch (err) {
      if (!(err instanceof ReplayError)) this.setStatus("offline");
    } finally {
      this.reconciling = false;
    }
  }

  /** Throw away local state and rebuild it from the full server log. */
  private async hardResync(): Promise<void> {
    if (this.detached) return;
    this.setStatus("syncing");
    try {
      const row = await api.fetchGameRow(this.ref.gameId);
      const { state, count } = await loadStateFromServer(row);
      this.pending = [];
      this.serverCount = count;
      this.applyGameRow(row);
      this.controller.resetOnlineState(state);
      this.setStatus("live");
      this.afterIngest();
    } catch (err) {
      this.setStatus(err instanceof ReplayError ? "corrupted" : "offline");
    }
  }

  // --- snapshots -------------------------------------------------------------

  /** Cache the replayed state server-side so future loads skip the replay. */
  private async maybeSnapshot(): Promise<void> {
    const s = this.controller.state;
    if (!s || this.pending.length > 0) return;
    const idx = this.serverCount;
    if (idx <= this.lastSnapshotIdx) return;
    try {
      await api.saveSnapshot(this.ref, idx, serialize(s, Date.now(), this.config.difficulty));
      this.lastSnapshotIdx = idx;
    } catch {
      // cosmetic: the log is the save
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Rebuild the state for a game row: from the stored snapshot plus the log
 * tail when possible, else a full replay. Returns how many log actions the
 * state includes (the log fetch can run ahead of the game row we hold).
 * Throws ReplayError on a corrupt log.
 */
async function loadStateFromServer(row: GameRow): Promise<{ state: GameState; count: number }> {
  let state: GameState | null = null;
  let from = 0;
  if (row.snapshot && row.snapshot_idx > 0) {
    const loaded = deserialize(JSON.stringify(row.snapshot));
    if (loaded) {
      state = loaded.state;
      from = row.snapshot_idx;
    }
  }
  const log = await api.fetchActions(row.id, from);
  if (state === null) return { state: buildState(row.config, log), count: log.length };
  for (const entry of log) state = applyStep(state, entry);
  return { state, count: from + log.length };
}

/**
 * Open an online game from a seat link: fetch, verify, replay, and hand the
 * controller a running session. Detaches any session already open.
 */
export async function openOnlineGame(controller: GameController, ref: SeatRef): Promise<OnlineSession> {
  const row = await api.fetchGameRow(ref.gameId);
  if (row.config.engine !== SAVE_VERSION) throw new VersionError(row.config.engine);
  const seat = await api.whoami(ref);
  if (seat === null || seat !== ref.seatNo) throw new NetError("bad_token");

  let loaded: { state: GameState; count: number };
  try {
    loaded = await loadStateFromServer(row);
  } catch (err) {
    if (err instanceof ReplayError && row.snapshot_idx > 0) {
      // a bad snapshot shouldn't kill the game — the log is the truth
      const log = await api.fetchActions(ref.gameId, 0);
      loaded = { state: buildState(row.config, log), count: log.length };
    } else {
      throw err;
    }
  }

  controller.online?.detach();
  const session = new OnlineSession(controller, row.config, ref, row, loaded.count);
  controller.startOnlineGame(loaded.state, ref.seatNo, row.config, session);
  await session.start();
  // every opened game lands in the local list, so links survive lost chats
  const mine = tribeById(row.config.tribes[ref.seatNo] ?? row.config.tribes[0]).name;
  const ai = row.config.tribes.length - row.config.humanSeats;
  rememberGame({
    ...ref,
    label: `${mine} vs friend${ai > 0 ? ` + ${ai} AI` : ""} · ${row.config.winMode}`,
    createdAt: Date.now(),
  });
  return session;
}
