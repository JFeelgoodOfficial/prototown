import { useGame } from "./store";
import { HUMAN_ID } from "../game/controller";
import { playerScore, scoreBreakdown } from "../engine/score";
import { tribeById } from "../data/tribes";
import { dailySeedForToday, recordDailyResult } from "../game/daily";
import ScoreChart from "./ScoreChart";

export default function GameOverScreen() {
  const game = useGame();
  const s = game.state;
  if (!s || s.winnerId === null) return null;
  const humanWon = s.winnerId === HUMAN_ID;
  const scores = [...s.players].sort((a, b) => playerScore(s, b.id) - playerScore(s, a.id));
  const breakdown = scoreBreakdown(s, HUMAN_ID);
  const myScore = playerScore(s, HUMAN_ID);
  const wasDaily = s.seed === dailySeedForToday();
  if (wasDaily) recordDailyResult(myScore, humanWon);

  return (
    <div className="flex h-full items-start justify-center overflow-auto bg-gradient-to-b from-[#0b1220] to-[#101f38] p-4">
      <div className="my-auto w-[min(600px,94vw)] rounded-2xl border border-white/10 bg-[#0f1828]/90 p-6 shadow-2xl">
        <div className="text-center">
          <div className="text-5xl">{humanWon ? "🏆" : "💀"}</div>
          <h1 className="mt-2 text-3xl font-black">{humanWon ? "Victory!" : "Defeat"}</h1>
          <p className="mt-1 text-sm text-white/60">
            {tribeById(s.players[s.winnerId].tribeId).name}{" "}
            {s.winMode === "perfection" ? "scored highest" : "conquered the world"} on turn {s.turn}.
            {wasDaily ? " Today's daily challenge." : ""}
          </p>
        </div>

        {s.scoreHistory.length >= 2 && (
          <div className="mt-5">
            <ScoreChart state={s} />
          </div>
        )}

        <div className="mt-5 space-y-1.5">
          {scores.map((p) => {
            const tribe = tribeById(p.tribeId);
            return (
              <div key={p.id} className="flex justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm">
                <span className="font-semibold" style={{ color: tribe.color }}>
                  {tribe.name}
                  {p.id === HUMAN_ID ? " (you)" : ""}
                  {!p.alive ? " ☠" : ""}
                </span>
                <span className="tabular-nums">{playerScore(s, p.id)}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-5">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">
            Where your {myScore} points came from
          </div>
          <div className="space-y-1">
            {breakdown.map((part) => (
              <div key={part.label} className="flex items-baseline gap-2 text-sm">
                <span className="text-white/80">{part.label}</span>
                <span className="text-xs text-white/40">{part.detail}</span>
                <span className="ml-auto tabular-nums text-white/70">{part.points}</span>
              </div>
            ))}
          </div>
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
