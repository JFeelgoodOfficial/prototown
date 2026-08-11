import { useEffect, useState } from "react";
import { useGame } from "./store";
import { tribeById } from "../data/tribes";
import { playSound } from "../game/sound";

const TAKEOVER_AFTER_MS = 24 * 3600 * 1000;

/**
 * Network game status: whose turn it is, connection health, and (later) the
 * abandoned-turn takeover offer. Sits where the "rivals are moving" banner
 * does, but for states that banner doesn't cover.
 */
export default function OnlineStatusBar() {
  const game = useGame();
  const s = game.state;
  const online = game.online;
  const myTurn = !!s && s.winnerId === null && s.currentPlayerId === game.localSeat;
  const [takeoverBusy, setTakeoverBusy] = useState(false);
  const [takeoverNote, setTakeoverNote] = useState<string | null>(null);
  // the waiting banner shows wall-clock info, so refresh it now and then
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // surface the turn even when the tab is in the background
  useEffect(() => {
    const base = "Prototown";
    document.title = myTurn ? `● Your turn — ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [myTurn]);
  useEffect(() => {
    if (myTurn) playSound("select");
  }, [myTurn]);

  if (!s || !online || game.mode !== "online") return null;

  if (online.status === "corrupted") {
    return <Banner tone="bad">This game's move log is damaged — it can't continue.</Banner>;
  }
  if (online.status === "offline") {
    return <Banner tone="warn">Reconnecting to the game server…</Banner>;
  }
  if (s.winnerId !== null) return null;

  const current = s.currentPlayerId;
  if (myTurn) {
    return <Banner tone="good">Your turn</Banner>;
  }
  if (game.aiBusy || online.drivesSeat(current)) return null; // the AI banner covers this
  const tribe = tribeById(s.players[current].tribeId);
  const idleMs = Date.now() - online.lastMoveAt;
  const canTakeover = idleMs > TAKEOVER_AFTER_MS;

  const requestTakeover = async () => {
    if (takeoverBusy) return;
    setTakeoverBusy(true);
    setTakeoverNote(null);
    try {
      await online.requestTakeover(current);
    } catch (err) {
      setTakeoverNote(
        (err as { kind?: string }).kind === "too_soon"
          ? "The server says it hasn't been a full day yet — try again later."
          : "Couldn't reach the server. Try again in a moment.",
      );
    } finally {
      setTakeoverBusy(false);
    }
  };

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1.5">
      <Banner tone="idle" inline>
        Waiting for <span style={{ color: tribe.color }}>{tribe.name}</span>
        {idleMs > 3600_000 ? ` — quiet for ${hoursAgo(idleMs)}` : "…"} You can close this tab and come back any time.
      </Banner>
      {canTakeover && (
        <button
          className="pointer-events-auto rounded-full bg-amber-500/90 px-4 py-1.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-60"
          disabled={takeoverBusy}
          onClick={() => void requestTakeover()}
        >
          {takeoverBusy ? "Asking…" : "They've been away a day — let the AI play their tribe"}
        </button>
      )}
      {takeoverNote && <Banner tone="warn" inline>{takeoverNote}</Banner>}
    </div>
  );
}

function hoursAgo(ms: number): string {
  const hours = Math.floor(ms / 3600_000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours - days * 24}h`;
}

function Banner({
  tone,
  inline,
  children,
}: {
  tone: "good" | "warn" | "bad" | "idle";
  inline?: boolean;
  children: React.ReactNode;
}) {
  const color =
    tone === "good"
      ? "bg-emerald-600/80 text-white"
      : tone === "warn"
        ? "bg-amber-500/80 text-black"
        : tone === "bad"
          ? "bg-red-600/85 text-white"
          : "bg-black/60 text-white/80";
  const position = inline ? "" : "absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap";
  return (
    <div className={`pointer-events-none max-w-[92vw] rounded-full px-4 py-1.5 text-center text-sm font-semibold ${position} ${color}`}>
      {children}
    </div>
  );
}
