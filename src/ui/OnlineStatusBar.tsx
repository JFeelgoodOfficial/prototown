import { useEffect } from "react";
import { useGame } from "./store";
import { tribeById } from "../data/tribes";
import { playSound } from "../game/sound";

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
  return (
    <Banner tone="idle">
      Waiting for <span style={{ color: tribe.color }}>{tribe.name}</span>… you can close this tab and come back any
      time.
    </Banner>
  );
}

function Banner({ tone, children }: { tone: "good" | "warn" | "bad" | "idle"; children: React.ReactNode }) {
  const color =
    tone === "good"
      ? "bg-emerald-600/80 text-white"
      : tone === "warn"
        ? "bg-amber-500/80 text-black"
        : tone === "bad"
          ? "bg-red-600/85 text-white"
          : "bg-black/60 text-white/80";
  return (
    <div className={`pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold ${color}`}>
      {children}
    </div>
  );
}
