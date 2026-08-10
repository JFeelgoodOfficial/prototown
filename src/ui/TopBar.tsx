import { useState } from "react";
import { useGame } from "./store";
import { HUMAN_ID } from "../game/controller";
import { playerById } from "../engine/state";
import { playerIncome } from "../engine/economy";
import { playerScore } from "../engine/score";
import { tribeById } from "../data/tribes";
import TechTreeDialog from "./TechTreeDialog";

export default function TopBar() {
  const game = useGame();
  const [techOpen, setTechOpen] = useState(false);
  const s = game.state;
  if (!s) return null;
  const me = playerById(s, HUMAN_ID);
  const tribe = tribeById(me.tribeId);
  const endTurn = game.legal.find((a) => a.type === "END_TURN");

  return (
    <div className="flex items-center gap-4 border-b border-white/10 bg-[#101a2c] px-4 py-2 text-sm">
      <span className="font-bold" style={{ color: tribe.color }}>
        {tribe.name}
      </span>
      <span title="Stars (income per turn)">
        ⭐ {me.stars} <span className="text-white/50">(+{playerIncome(s, HUMAN_ID)})</span>
      </span>
      <span title="Score">🏆 {playerScore(s, HUMAN_ID)}</span>
      <span className="text-white/60">
        Turn {s.turn}
        {s.winMode === "perfection" ? ` / ${s.maxTurns}` : ""}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          className="rounded bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20"
          onClick={() => setTechOpen(true)}
        >
          Research
        </button>
        <button
          className="rounded bg-emerald-600 px-4 py-1.5 font-bold hover:bg-emerald-500 disabled:opacity-40"
          disabled={!endTurn || game.aiBusy}
          onClick={() => endTurn && game.dispatch(endTurn)}
        >
          End turn
        </button>
        <button
          className="rounded bg-white/10 px-3 py-1.5 hover:bg-white/20"
          onClick={() => game.backToMenu()}
          title="Back to menu (game is autosaved)"
        >
          Menu
        </button>
      </div>
      {techOpen && <TechTreeDialog onClose={() => setTechOpen(false)} />}
    </div>
  );
}
