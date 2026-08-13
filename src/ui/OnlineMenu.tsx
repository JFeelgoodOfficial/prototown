import { useMemo, useState } from "react";
import type { Difficulty } from "../game/difficulty";
import type { MapType, WinMode } from "../engine/state";
import { configForNewGame } from "../net/replay";
import { gameHash, gameLink, type OnlineConfig, type SeatRef } from "../net/types";
import { listRememberedGames, rememberGame, forgetGame } from "../net/registry";
import { tribeById } from "../data/tribes";

type Created = {
  config: OnlineConfig;
  mySeat: SeatRef;
  friendSeat: SeatRef;
};

/**
 * Set up an async online game: pick opponents, create it on the server, and
 * share the second player's secret link. Tribes are assigned randomly.
 */
export default function OnlineMenu({ onBack }: { onBack: () => void }) {
  const [aiCount, setAiCount] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [winMode, setWinMode] = useState<WinMode>("domination");
  const [mapType, setMapType] = useState<MapType>("square");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const remembered = useMemo(() => listRememberedGames(), [created, listVersion]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const net = await import("../net/client");
      const config = configForNewGame(aiCount, difficulty, winMode, Math.random, mapType);
      const res = await net.createGame(config);
      const tokens = new Map(res.seats.map((s) => [s.seat_no, s.token]));
      const mySeat: SeatRef = { gameId: res.game_id, seatNo: 0, token: tokens.get(0)! };
      const friendSeat: SeatRef = { gameId: res.game_id, seatNo: 1, token: tokens.get(1)! };
      rememberGame({
        ...mySeat,
        label: describeConfig(config),
        createdAt: Date.now(),
      });
      setCreated({ config, mySeat, friendSeat });
    } catch {
      setError("Couldn't reach the game server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Frame onBack={onBack}>
        <h2 className="text-center text-2xl font-black">Game created</h2>
        <p className="mt-1 text-center text-sm text-white/55">
          Send your friend their link — it's their key to the game, so only share it with them. Keep yours to take
          your own turns from any device.
        </p>
        <ShareLink label="Your friend's link" link={gameLink(created.friendSeat)} highlight />
        <ShareLink label="Your link" link={gameLink(created.mySeat)} />
        <button
          className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-lg font-bold hover:bg-emerald-500"
          onClick={() => {
            window.location.hash = gameHash(created.mySeat);
          }}
        >
          Enter game — it's your turn
        </button>
        <p className="mt-3 text-center text-xs text-white/40">
          You play {tribeName(created.config, 0)}, your friend plays {tribeName(created.config, 1)}
          {created.config.tribes.length > 2
            ? `, against ${created.config.tribes
                .slice(2)
                .map((id) => tribeById(id).name)
                .join(" and ")}`
            : ""}
          . Tribes are dealt randomly.
        </p>
      </Frame>
    );
  }

  return (
    <Frame onBack={onBack}>
      <h2 className="text-center text-2xl font-black">Play online</h2>
      <p className="mb-4 mt-1 text-center text-sm text-white/55">
        You and a friend, taking turns whenever suits you — on any phone or computer. You'll get a link to send them.
      </p>

      <Section label="Rival AI tribes">
        <Choice
          options={[0, 1, 2]}
          value={aiCount}
          onPick={setAiCount}
          render={(n) => (n === 0 ? "None — 1v1" : `${n} AI rival${n > 1 ? "s" : ""}`)}
        />
      </Section>
      {aiCount > 0 && (
        <Section label="AI difficulty">
          <Choice
            options={["relaxed", "normal", "hard"] as Difficulty[]}
            value={difficulty}
            onPick={setDifficulty}
            render={(d) => d.charAt(0).toUpperCase() + d.slice(1)}
          />
        </Section>
      )}
      <Section label="Map">
        <Choice
          options={["square", "circle", "continents"] as MapType[]}
          value={mapType}
          onPick={setMapType}
          render={(m) => m.charAt(0).toUpperCase() + m.slice(1)}
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

      <button
        className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-lg font-bold hover:bg-emerald-500 disabled:opacity-50"
        disabled={busy}
        onClick={() => void create()}
      >
        {busy ? "Creating…" : "Create game"}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-300">{error}</p>}
      <p className="mt-2 text-center text-xs text-white/40">Tribes are dealt randomly when the game is created.</p>

      {remembered.length > 0 && (
        <Section label="Your online games">
          <div className="space-y-1.5">
            {remembered.map((g) => (
              <div key={g.gameId} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm">
                <button
                  className="min-w-0 flex-1 truncate text-left font-semibold hover:text-sky-300"
                  onClick={() => {
                    window.location.hash = gameHash(g);
                  }}
                >
                  {g.label}
                  <span className="block text-xs font-normal text-white/40">
                    started {new Date(g.createdAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  className="rounded px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white/80"
                  onClick={(e) => {
                    e.stopPropagation();
                    forgetGame(g.gameId);
                    setListVersion((n) => n + 1);
                  }}
                  title="Remove from this list (the game itself stays)"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}
    </Frame>
  );
}

function describeConfig(config: OnlineConfig): string {
  const you = tribeById(config.tribes[0]).name;
  const ai = config.tribes.length - config.humanSeats;
  return `${you} vs friend${ai > 0 ? ` + ${ai} AI` : ""} · ${config.winMode}`;
}

function tribeName(config: OnlineConfig, seat: number): string {
  return tribeById(config.tribes[seat]).name;
}

function ShareLink({ label, link, highlight }: { label: string; link: string; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked: the input below is selectable
    }
  };
  const canShare = typeof navigator.share === "function";
  return (
    <div className={`mt-4 rounded-xl border p-3 ${highlight ? "border-sky-400/40 bg-sky-500/10" : "border-white/10 bg-white/5"}`}>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">{label}</div>
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white/70"
        />
        <button className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20" onClick={() => void copy()}>
          {copied ? "Copied!" : "Copy"}
        </button>
        {canShare && (
          <button
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
            onClick={() => void navigator.share({ title: "Prototown", text: "Play Prototown with me!", url: link }).catch(() => undefined)}
          >
            Share
          </button>
        )}
      </div>
    </div>
  );
}

function Frame({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-gradient-to-b from-[#0b1220] to-[#101f38]">
      {/* min-h-full, not h-full: a panel taller than the screen grows this row
          instead of overflowing a centred box — which is what put the ends of it
          out of reach on a short screen. */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="my-auto w-[min(520px,94vw)] rounded-2xl border border-white/10 bg-[#0f1828]/90 p-6 shadow-2xl">
          <button className="mb-3 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20" onClick={onBack}>
            ← Back
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">{label}</div>
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
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o)}
          onClick={() => onPick(o)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
            value === o ? "border-white bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10"
          }`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}
