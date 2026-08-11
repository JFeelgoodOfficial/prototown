import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import type { Action } from "../engine/actions";
import type { ActionRow, GameRow, OnlineConfig, SeatRef } from "./types";

/**
 * Thin typed wrappers over the Supabase RPCs and reads. The SDK is loaded on
 * first use via dynamic import so single-player never pays for it.
 */

let clientPromise: Promise<SupabaseClient> | null = null;

function sb(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
        auth: { persistSession: false },
      }),
    );
  }
  return clientPromise;
}

export type NetErrorKind = "conflict" | "not_your_turn" | "bad_token" | "finished" | "too_soon" | "network";

export class NetError extends Error {
  constructor(
    public kind: NetErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = "NetError";
  }
}

/** The RPCs signal expected failures by raising with a fixed keyword. */
function toNetError(message: string): NetError {
  const kinds: NetErrorKind[] = ["conflict", "not_your_turn", "bad_token", "finished", "too_soon"];
  const kind = kinds.find((k) => message.includes(k));
  return new NetError(kind ?? "network", message);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const client = await sb();
  const { data, error } = await client.rpc(fn, args);
  if (error) throw toNetError(error.message);
  return data as T;
}

export async function createGame(config: OnlineConfig): Promise<{ game_id: string; seats: Array<{ seat_no: number; token: string }> }> {
  return rpc("create_game", {
    p_config: config,
    p_human_seats: config.humanSeats,
    p_total_seats: config.tribes.length,
  });
}

export async function submitAction(
  ref: SeatRef,
  expectedIdx: number,
  action: Action,
  nextSeat: number,
  winnerSeat: number | null,
): Promise<void> {
  await rpc("submit_action", {
    p_game_id: ref.gameId,
    p_token: ref.token,
    p_expected_idx: expectedIdx,
    p_action: action,
    p_next_seat: nextSeat,
    p_winner_seat: winnerSeat,
  });
}

export async function whoami(ref: SeatRef): Promise<number | null> {
  return rpc("whoami", { p_game_id: ref.gameId, p_token: ref.token });
}

export async function saveSnapshot(ref: SeatRef, idx: number, snapshot: string): Promise<void> {
  await rpc("save_snapshot", {
    p_game_id: ref.gameId,
    p_token: ref.token,
    p_idx: idx,
    p_snapshot: JSON.parse(snapshot),
  });
}

export async function claimAiTakeover(ref: SeatRef, targetSeat: number): Promise<void> {
  await rpc("claim_ai_takeover", { p_game_id: ref.gameId, p_token: ref.token, p_target_seat: targetSeat });
}

export async function savePushSubscription(ref: SeatRef, subscription: unknown | null): Promise<void> {
  await rpc("save_push_subscription", { p_game_id: ref.gameId, p_token: ref.token, p_subscription: subscription });
}

export async function createRematch(ref: SeatRef, config: OnlineConfig): Promise<string> {
  return rpc("create_rematch", { p_game_id: ref.gameId, p_token: ref.token, p_config: config });
}

export async function fetchGameRow(gameId: string): Promise<GameRow> {
  const client = await sb();
  const { data, error } = await client.from("games").select("*").eq("id", gameId).single();
  if (error) throw new NetError(error.code === "PGRST116" ? "bad_token" : "network", error.message);
  return data as GameRow;
}

export async function fetchActions(gameId: string, fromIdx = 0): Promise<ActionRow[]> {
  const client = await sb();
  const { data, error } = await client
    .from("actions")
    .select("idx, seat_no, action")
    .eq("game_id", gameId)
    .gte("idx", fromIdx)
    .order("idx", { ascending: true });
  if (error) throw new NetError("network", error.message);
  return (data ?? []) as ActionRow[];
}

export interface GameSubscription {
  close(): void;
}

/**
 * Live inserts on the game's action log plus updates to the game row (turn
 * pointer, takeover, rematch). Correctness never rests on these arriving —
 * the session reconciles against the log by index — they just make the game
 * feel live when both players are online.
 */
export async function subscribeGame(
  gameId: string,
  handlers: {
    onAction(row: ActionRow): void;
    onGame(row: GameRow): void;
    onStatus(connected: boolean): void;
  },
): Promise<GameSubscription> {
  const client = await sb();
  const channel: RealtimeChannel = client
    .channel(`game-${gameId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "actions", filter: `game_id=eq.${gameId}` },
      (payload) => handlers.onAction(payload.new as unknown as ActionRow),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      (payload) => handlers.onGame(payload.new as unknown as GameRow),
    )
    .subscribe((status) => {
      handlers.onStatus(status === "SUBSCRIBED");
    });
  return { close: () => void client.removeChannel(channel) };
}
