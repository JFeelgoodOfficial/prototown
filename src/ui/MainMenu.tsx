import { useMemo, useState } from "react";
import { useGame } from "./store";
import type { Difficulty } from "../game/controller";
import { HUMAN_ID } from "../game/controller";
import { loadGame } from "../game/persistence";
import { TRIBES, tribeById } from "../data/tribes";
import UnitPortrait from "./UnitPortrait";
import type { GameState, WinMode } from "../engine/state";

export default function MainMenu() {
  const game = useGame();
  const [tribeId, setTribeId] = useState(TRIBES[0].id);
  const [opponents, setOpponents] = useState(1);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [winMode, setWinMode] = useState<WinMode>("domination");
  // Read storage once per menu mount; the in-memory game takes priority when present.
  const stored = useMemo(() => loadGame(), []);
  const resumeInfo = game.state
    ? describeGame(game.state, game.lastSavedAt)
    : stored
      ? describeGame(stored.state, stored.savedAt)
      : null;

  const start = () => {
    const size = opponents === 1 ? 11 : opponents === 2 ? 14 : 16;
    const others = TRIBES.filter((t) => t.id !== tribeId).map((t) => t.id);
    const tribes = [tribeId, ...others.slice(0, opponents)];
    const seed = Math.floor(Math.random() * 2 ** 31);
    game.startNewGame({ seed, size, tribes, winMode }, difficulty);
  };

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-gradient-to-b from-[#0b1220] to-[#101f38] p-4">
      <div className="w-[min(520px,94vw)] rounded-2xl border border-white/10 bg-[#0f1828]/90 p-6 shadow-2xl">
        <h1 className="text-center text-4xl font-black tracking-tight">
          Poly<span className="text-sky-400">forge</span>
        </h1>
        <p className="mb-6 mt-1 text-center text-sm text-white/50">
          Explore, expand, and conquer — you against the rival tribes.
        </p>

        <Section label="Your tribe">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TRIBES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTribeId(t.id)}
                className={`flex flex-col items-center rounded-lg border p-2 transition ${
                  tribeId === t.id ? "border-white bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <UnitPortrait tribeId={t.id} type="warrior" width={78} height={82} />
                <div className="text-sm font-semibold" style={{ color: t.color }}>
                  {t.name}
                </div>
                <div className="text-[11px] text-white/45">{t.tagline}</div>
                <div className="mt-1.5 flex gap-1">
                  <Swatch color={t.color} />
                  <Swatch color={t.colorDark} />
                </div>
              </button>
            ))}
          </div>
        </Section>

        <Section label="Opponents">
          <Choice options={[1, 2, 3]} value={opponents} onPick={setOpponents} render={(n) => `${n} rival${n > 1 ? "s" : ""}`} />
        </Section>

        <Section label="Difficulty">
          <Choice
            options={["relaxed", "normal", "hard"] as Difficulty[]}
            value={difficulty}
            onPick={setDifficulty}
            render={(d) => d.charAt(0).toUpperCase() + d.slice(1)}
          />
        </Section>

        <Section label="Victory">
          <Choice
            options={["domination", "perfection"] as WinMode[]}
            value={winMode}
            onPick={setWinMode}
            render={(m) => (m === "domination" ? "Domination — last tribe standing" : "Perfection — best score in 30 turns")}
          />
        </Section>

        <div className="mt-6 space-y-2">
          <button
            className="w-full rounded-xl bg-emerald-600 py-3 text-lg font-bold hover:bg-emerald-500"
            onClick={start}
          >
            New game
          </button>
          {resumeInfo && (
            <button
              className="w-full rounded-xl bg-white/10 py-2.5 font-semibold hover:bg-white/20"
              onClick={() => {
                if (game.state) game.resumeCurrent();
                else game.continueGame();
              }}
            >
              Continue
              <span className="block text-xs font-normal text-white/50">{resumeInfo}</span>
            </button>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-white/35">
          Tap to move · drag to pan · pinch or scroll to zoom. Capture villages, grow cities, research, and out-fight
          the AI.
        </p>
      </div>
    </div>
  );
}

/** One-line summary of a saved or in-progress game for the Continue button. */
function describeGame(state: GameState, savedAt: number | null): string {
  const human = state.players.find((p) => p.id === HUMAN_ID);
  const parts = [`Turn ${state.turn}`];
  if (human) parts.push(tribeById(human.tribeId).name);
  const when = savedAt ? relativeTime(savedAt) : null;
  if (when) parts.push(`saved ${when}`);
  return parts.join(" · ");
}

function relativeTime(at: number): string {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(at).toLocaleDateString();
}

function Swatch({ color }: { color: string }) {
  return <span className="h-2 w-2 rounded-full ring-1 ring-black/40" style={{ background: color }} />;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-white/50">{label}</div>
      {children}
    </div>
  );
}

function Choice<T extends string | number>({
  options,
  value,
  onPick,
  render,
}: {
  options: T[];
  value: T;
  onPick: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {options.map((o) => (
        <button
          key={String(o)}
          onClick={() => onPick(o)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
            value === o ? "border-white bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
          }`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}
