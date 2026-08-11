import { useEffect, useState } from "react";
import { controller } from "../game/controller";
import { useGame } from "./store";
import type { SeatRef } from "../net/types";
import { onlineEnabled } from "../net/env";
import GameScreen from "./GameScreen";
import GameOverScreen from "./GameOverScreen";

/**
 * Opens the online game a seat link points at: fetches the log, replays it,
 * and hands the controller a live session. Renders the normal game screens
 * once the game is up.
 */
export default function OnlineGameLoader({ seatRef }: { seatRef: SeatRef }) {
  const game = useGame();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!onlineEnabled()) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const net = await import("../net/session");
        await net.openOnlineGame(controller, seatRef);
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        setError(describeOpenError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seatRef.gameId, seatRef.seatNo, seatRef.token, attempt]);

  if (!onlineEnabled()) {
    return (
      <Notice title="Online play isn't set up">
        <p>This build wasn't configured with a game server, so online links can't open here.</p>
        <ExitButton />
      </Notice>
    );
  }
  if (error) {
    return (
      <Notice title="Couldn't open the game">
        <p>{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-500"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
          <ExitButton />
        </div>
      </Notice>
    );
  }
  if (loading || game.mode !== "online" || !game.state) {
    return (
      <Notice title="Loading game…">
        <p className="animate-pulse">Fetching the latest moves.</p>
      </Notice>
    );
  }
  return game.screen === "gameover" ? <GameOverScreen /> : <GameScreen />;
}

function describeOpenError(err: unknown): string {
  const e = err as { name?: string; kind?: string; message?: string };
  if (e.name === "VersionError") {
    return "This game was made with a different version of Prototown. Refresh the app on both devices and try again.";
  }
  if (e.kind === "bad_token") {
    return "This link doesn't match a seat in any game — it may be mistyped or the game was deleted.";
  }
  if (e.name === "ReplayError") {
    return "This game's move log is damaged and can't be replayed.";
  }
  return "The game server can't be reached right now. Check your connection and try again.";
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-b from-[#0b1220] to-[#101f38] p-4">
      <div className="w-[min(440px,94vw)] rounded-2xl border border-white/10 bg-[#0f1828]/90 p-6 text-center shadow-2xl">
        <h1 className="text-2xl font-black">{title}</h1>
        <div className="mt-2 text-sm text-white/60">{children}</div>
      </div>
    </div>
  );
}

function ExitButton() {
  return (
    <button
      className="mt-4 rounded-lg bg-white/10 px-4 py-2 font-semibold hover:bg-white/20"
      onClick={() => {
        window.location.hash = "";
      }}
    >
      Back to title
    </button>
  );
}
