import { useGame } from "./store";
import { HUMAN_ID } from "../game/controller";
import { playerScore, scoreBreakdown } from "../engine/score";
import { tribeById } from "../data/tribes";
import ScoreChart from "./ScoreChart";

export default function ScoreDialog({ onClose }: { onClose: () => void }) {
  const game = useGame();
  const s = game.state;
  if (!s) return null;
  const parts = scoreBreakdown(s, HUMAN_ID);
  const total = playerScore(s, HUMAN_ID);
  const standings = [...s.players].sort((a, b) => playerScore(s, b.id) - playerScore(s, a.id));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[min(600px,94vw)] overflow-auto rounded-xl border border-white/15 bg-[#0f1828] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            Score <span className="text-white/50">· {total}</span>
          </h2>
          <button className="rounded bg-white/10 px-3 py-1 hover:bg-white/20" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="space-y-1">
          {parts.map((part) => (
            <div key={part.label} className="flex items-baseline gap-2 text-sm">
              <span className="text-white/80">{part.label}</span>
              <span className="text-xs text-white/40">{part.detail}</span>
              <span className="ml-auto tabular-nums text-white/70">{part.points}</span>
            </div>
          ))}
          {parts.length === 0 && <div className="text-sm text-white/50">Nothing scored yet.</div>}
        </div>

        {s.winMode === "perfection" && (
          <p className="mt-3 text-xs text-white/50">
            Perfection ends after turn {s.maxTurns} — the highest score wins.
          </p>
        )}

        {s.scoreHistory.length >= 2 && (
          <div className="mt-5">
            <ScoreChart state={s} />
          </div>
        )}

        <div className="mt-5">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">Standings</div>
          <div className="space-y-1.5">
            {standings.map((p) => {
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
        </div>
      </div>
    </div>
  );
}
