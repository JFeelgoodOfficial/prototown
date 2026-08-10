import { useGame } from "./store";
import { HUMAN_ID } from "../game/controller";
import { playerScore } from "../engine/score";
import { tribeById } from "../data/tribes";

export default function GameOverScreen() {
  const game = useGame();
  const s = game.state;
  if (!s || s.winnerId === null) return null;
  const humanWon = s.winnerId === HUMAN_ID;
  const scores = [...s.players].sort((a, b) => playerScore(s, b.id) - playerScore(s, a.id));

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-b from-[#0b1220] to-[#101f38] p-4">
      <div className="w-[min(440px,94vw)] rounded-2xl border border-white/10 bg-[#0f1828]/90 p-6 text-center shadow-2xl">
        <div className="text-5xl">{humanWon ? "🏆" : "💀"}</div>
        <h1 className="mt-2 text-3xl font-black">{humanWon ? "Victory!" : "Defeat"}</h1>
        <p className="mt-1 text-sm text-white/60">
          {tribeById(s.players[s.winnerId].tribeId).name} {s.winMode === "perfection" ? "scored highest" : "conquered the world"} on turn {s.turn}.
        </p>
        <div className="mt-5 space-y-1.5 text-left">
          {scores.map((p) => {
            const tribe = tribeById(p.tribeId);
            return (
              <div key={p.id} className="flex justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm">
                <span className="font-semibold" style={{ color: tribe.color }}>
                  {tribe.name}
                  {p.id === HUMAN_ID ? " (you)" : ""}
                  {!p.alive ? " ☠" : ""}
                </span>
                <span>{playerScore(s, p.id)}</span>
              </div>
            );
          })}
        </div>
        <button
          className="mt-6 w-full rounded-xl bg-emerald-600 py-3 text-lg font-bold hover:bg-emerald-500"
          onClick={() => game.abandonGame()}
        >
          Back to menu
        </button>
      </div>
    </div>
  );
}
