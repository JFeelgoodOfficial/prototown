import { useEffect, useState, type ReactNode } from "react";
import { isMuted, setMuted, playSound } from "../game/sound";
import HelpOverlay from "./HelpOverlay";

/** Settings that outlive a single game: sound, display, and the rules sheet. */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [sound, setSound] = useState(!isMuted());
  const [fullscreen, setFullscreen] = useState(document.fullscreenElement !== null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleSound = () => {
    const next = !sound;
    setMuted(!next);
    setSound(next);
    if (next) playSound("select");
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
      // Phones can hold the screen in landscape once the page owns it. Browsers
      // that refuse just reject, and the rotate prompt keeps doing its job.
      const orientation = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
      await orientation?.lock?.("landscape").catch(() => {});
    } catch {
      // fullscreen denied — nothing to recover, the toggle simply stays off
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[min(460px,94vw)] overflow-auto rounded-xl border border-white/15 bg-[#0f1828] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Settings</h2>
          <button className="rounded bg-white/10 px-3 py-1 hover:bg-white/20" onClick={onClose}>
            Close
          </button>
        </div>

        <Toggle
          label="Sound"
          hint="Move, combat and level-up effects"
          on={sound}
          onToggle={toggleSound}
          icon={<span className="text-xl">{sound ? "🔊" : "🔇"}</span>}
        />
        <Toggle
          label="Fullscreen"
          hint="Fills the screen, and holds landscape where the browser allows it"
          on={fullscreen}
          onToggle={toggleFullscreen}
          icon={<FullscreenIcon on={fullscreen} />}
        />

        <button
          className="mt-4 w-full rounded-xl bg-white/10 py-2.5 font-semibold hover:bg-white/20"
          onClick={() => setHelpOpen(true)}
        >
          How to play
        </button>

        <p className="mt-4 text-center text-xs text-white/35">
          Prototown · settings are kept on this device
        </p>
      </div>
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

/** Arrows pushing out to the corners, or pulling back in when already fullscreen. */
function FullscreenIcon({ on }: { on: boolean }) {
  const d = on
    ? "M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6"
    : "M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function Toggle({
  label,
  hint,
  on,
  onToggle,
  icon,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      className="mb-2 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10"
    >
      <span className="flex w-6 flex-none justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="block text-xs text-white/50">{hint}</span>
      </span>
      <span
        className={`h-6 w-11 flex-none rounded-full p-0.5 transition ${on ? "bg-emerald-500" : "bg-white/15"}`}
        aria-hidden
      >
        <span className={`block h-5 w-5 rounded-full bg-white transition ${on ? "translate-x-5" : ""}`} />
      </span>
    </button>
  );
}
