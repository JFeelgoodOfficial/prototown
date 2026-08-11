import { useEffect, useState } from "react";
import { useGame } from "./store";
import { playerById } from "../engine/state";
import { playerIncome } from "../engine/economy";
import { playerScore } from "../engine/score";
import { tribeById } from "../data/tribes";
import { isMuted, setMuted } from "../game/sound";
import { isFullscreen, onFullscreenChange, supportsFullscreen, toggleFullscreen } from "../game/fullscreen";
import TechTreeDialog from "./TechTreeDialog";
import HelpOverlay from "./HelpOverlay";
import ScoreDialog from "./ScoreDialog";
import SavesDialog from "./SavesDialog";

export default function TopBar() {
  const game = useGame();
  const [techOpen, setTechOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [savesOpen, setSavesOpen] = useState(false);
  // the mute flag lives outside React; this re-renders the toggle after a change
  const [, setMutedTick] = useState(0);
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  useEffect(() => onFullscreenChange(() => setFullscreen(isFullscreen())), []);
  const s = game.state;
  if (!s) return null;
  const me = playerById(s, game.localSeat);
  const tribe = tribeById(me.tribeId);
  const endTurn = game.legal.find((a) => a.type === "END_TURN");
  const idle = game.idleUnits().length;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 bg-[#101a2c] px-2 py-1.5 text-xs sm:gap-x-4 sm:px-4 sm:py-2 sm:text-sm">
      <span className="font-bold" style={{ color: tribe.color }}>
        {tribe.name}
      </span>
      <span title="Stars (income per turn)">
        ⭐ {me.stars} <span className="text-white/50">(+{playerIncome(s, game.localSeat)})</span>
      </span>
      <button
        className="rounded hover:bg-white/10"
        onClick={() => setScoreOpen(true)}
        title="Where your score comes from"
      >
        🏆 {playerScore(s, game.localSeat)}
      </button>
      <span className="text-white/60">
        Turn {s.turn}
        {s.winMode === "perfection" ? ` / ${s.maxTurns}` : ""}
      </span>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          className="rounded bg-white/10 px-2 py-1.5 font-semibold hover:bg-white/20 sm:px-3"
          onClick={() => setTechOpen(true)}
        >
          Research
        </button>
        {idle > 0 && (
          <button
            className="rounded bg-amber-500/20 px-2 py-1.5 font-semibold text-amber-300 hover:bg-amber-500/30 sm:px-3"
            onClick={() => game.cycleIdleUnit()}
            title="Jump to the next unit that can still act (Tab)"
          >
            {idle} waiting
          </button>
        )}
        <button
          className="rounded bg-emerald-600 px-3 py-1.5 font-bold hover:bg-emerald-500 disabled:opacity-40 sm:px-4"
          disabled={!endTurn || game.aiBusy}
          onClick={() => endTurn && game.dispatch(endTurn)}
          title={idle > 0 ? `${idle} unit${idle > 1 ? "s" : ""} can still act` : "End turn (Space)"}
        >
          End turn
        </button>
        <button
          className="rounded bg-white/10 px-2 py-1.5 hover:bg-white/20 sm:px-3"
          onClick={() => {
            setMuted(!isMuted());
            setMutedTick((n) => n + 1);
          }}
          title={isMuted() ? "Sound off" : "Sound on"}
          aria-label={isMuted() ? "Turn sound on" : "Turn sound off"}
        >
          {isMuted() ? "🔇" : "🔊"}
        </button>
        {supportsFullscreen() && (
          <button
            className="rounded bg-white/10 px-2 py-1.5 hover:bg-white/20 sm:px-3"
            onClick={() => void toggleFullscreen()}
            title={fullscreen ? "Leave fullscreen" : "Play fullscreen"}
            aria-label={fullscreen ? "Leave fullscreen" : "Play fullscreen"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={fullscreen ? "M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" : "M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"} />
            </svg>
          </button>
        )}
        <button
          className="rounded bg-white/10 px-2 py-1.5 hover:bg-white/20 sm:px-3"
          onClick={() => setHelpOpen(true)}
          title="How to play"
        >
          ?
        </button>
        <button
          className="rounded bg-white/10 px-2 py-1.5 hover:bg-white/20 sm:px-3"
          onClick={() => setSavesOpen(true)}
          title="Saved games"
          aria-label="Saved games"
        >
          💾
        </button>
        <button
          className="rounded bg-white/10 px-2 py-1.5 hover:bg-white/20 sm:px-3"
          onClick={() => game.backToMenu()}
          title="Back to menu (game is autosaved)"
        >
          Menu
        </button>
      </div>
      {techOpen && <TechTreeDialog onClose={() => setTechOpen(false)} />}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
      {scoreOpen && <ScoreDialog onClose={() => setScoreOpen(false)} />}
      {savesOpen && <SavesDialog onClose={() => setSavesOpen(false)} />}
    </div>
  );
}
