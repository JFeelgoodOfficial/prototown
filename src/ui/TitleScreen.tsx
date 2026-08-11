import { useState } from "react";
import MainMenu from "./MainMenu";
import SavesDialog from "./SavesDialog";
import SettingsDialog from "./SettingsDialog";
import { playSound } from "../game/sound";

/**
 * The painted title screen. The four buttons are part of the artwork, so the
 * interactive controls are transparent hit areas laid over them: every hotspot
 * is positioned as a percentage of the image, so art and controls stay locked
 * together at any size.
 *
 * The art fills the screen rather than letterboxing. It is scaled past the
 * viewport and the overflow clipped — anchored to the bottom, so a window
 * taller than the art trims the far edges (the buttons sit well inside them)
 * and a wider one takes a slice of sky off the top, never the button bar.
 * Both crops are capped, and whatever the crop can't cover is filled by a
 * blurred copy of the same art, so the screen reads full-bleed at any shape
 * without ever cutting the logo or a button.
 */

/** Measured from the artwork (1376x768): plate centres and the plate's box. */
const ART_W = 1376;
const ART_H = 768;
const PLATE_TOP = 622;
const PLATE_BOTTOM = 720;
const PLATE_HALF_W = 58;
/** The hit area also covers the word under the plate — a bigger target for thumbs. */
const HIT_BOTTOM = 768;

const pct = (v: number, total: number) => `${(v / total) * 100}%`;

const RATIO = ART_W / ART_H;
/**
 * How wide to draw the art. The first term fills the width but stops once the
 * vertical crop would reach the logo — only the 18px of sky above it is spare,
 * so that headroom is all it may spend. The second fills the height but stops
 * before the outer buttons would run off the sides. Whichever is larger wins,
 * so the art covers as much of the screen as it can without losing anything.
 */
const SKY_HEADROOM = 16 / ART_H;
const SIDE_LIMIT = 2.3;
const ART_WIDTH_CSS = `max(
  min(100vw, calc(100dvh * ${(RATIO / (1 - SKY_HEADROOM)).toFixed(4)})),
  min(calc(100dvh * ${RATIO.toFixed(4)}), calc(100vw * ${SIDE_LIMIT}))
)`;

type Slot = { id: string; cx: number; label: string; hint: string };

const SLOTS: Slot[] = [
  { id: "start", cx: 473, label: "Start", hint: "Set up a new game" },
  { id: "load", cx: 618, label: "Load", hint: "Saved games" },
  { id: "settings", cx: 762, label: "Settings", hint: "Sound and display" },
  { id: "quit", cx: 907, label: "Quit", hint: "Leave the game" },
];

type View = "title" | "new" | "quit";

export default function TitleScreen() {
  const [view, setView] = useState<View>("title");
  const [savesOpen, setSavesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  if (view === "new") return <MainMenu onBack={() => setView("title")} />;
  if (view === "quit") return <QuitScreen onBack={() => setView("title")} />;

  const press = (id: string) => {
    playSound("select");
    if (id === "start") setView("new");
    else if (id === "load") setSavesOpen(true);
    else if (id === "settings") setSettingsOpen(true);
    else setConfirmQuit(true);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#081019]">
      <img
        src="/title.webp"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl brightness-[0.45]"
        draggable={false}
      />
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 select-none"
        style={{ width: ART_WIDTH_CSS, aspectRatio: `${ART_W} / ${ART_H}` }}
      >
        <img
          src="/title.webp"
          alt="Prototown — a walled town of the Ashfen tribe, with mines, farms, forests and a harbour"
          className="h-full w-full object-fill"
          draggable={false}
          fetchPriority="high"
        />

        {SLOTS.map((slot) => (
          <TitleButton key={slot.id} slot={slot} onPress={() => press(slot.id)} />
        ))}
      </div>

      {savesOpen && <SavesDialog onClose={() => setSavesOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {confirmQuit && (
        <ConfirmQuit
          onCancel={() => setConfirmQuit(false)}
          onQuit={() => {
            setConfirmQuit(false);
            // Only a window the page opened itself may close; everywhere else
            // this is a no-op, so fall through to a farewell screen.
            window.close();
            setView("quit");
          }}
        />
      )}
    </div>
  );
}

/**
 * One painted button. The highlight is a second copy of the artwork clipped to
 * this plate and brightened, so hovering lights up the stone itself rather than
 * laying a rectangle over it.
 */
function TitleButton({ slot, onPress }: { slot: Slot; onPress: () => void }) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const left = slot.cx - PLATE_HALF_W;
  const width = PLATE_HALF_W * 2;
  const height = PLATE_BOTTOM - PLATE_TOP;

  return (
    <button
      onClick={onPress}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onPointerDown={() => setPress(true)}
      onPointerUp={() => setPress(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-label={`${slot.label} — ${slot.hint}`}
      className="absolute cursor-pointer rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-amber-300/80"
      style={{
        left: pct(left - 12, ART_W),
        width: pct(width + 24, ART_W),
        top: pct(PLATE_TOP - 8, ART_H),
        height: pct(HIT_BOTTOM - PLATE_TOP + 8, ART_H),
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute transition-all duration-150"
        style={{
          left: pct(12, width + 24),
          width: pct(width, width + 24),
          top: pct(8, HIT_BOTTOM - PLATE_TOP + 8),
          height: pct(height, HIT_BOTTOM - PLATE_TOP + 8),
          borderRadius: "20%",
          // the same artwork, aligned so this element frames exactly its own plate
          backgroundImage: "url(/title.webp)",
          backgroundSize: `${(ART_W / width) * 100}% ${(ART_H / height) * 100}%`,
          backgroundPosition: `${(left / (ART_W - width)) * 100}% ${(PLATE_TOP / (ART_H - height)) * 100}%`,
          opacity: hover || press ? 1 : 0,
          filter: press ? "brightness(0.82) saturate(1.05)" : "brightness(1.35) saturate(1.15)",
          transform: press ? "translateY(2px)" : "none",
          boxShadow: press ? "none" : "0 0 26px 6px rgba(255,226,150,0.45)",
        }}
      />
    </button>
  );
}

function ConfirmQuit({ onCancel, onQuit }: { onCancel: () => void; onQuit: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div
        className="w-[min(380px,94vw)] rounded-xl border border-white/15 bg-[#0f1828] p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">Quit Prototown?</h2>
        <p className="mt-2 text-sm text-white/60">
          Your game autosaves, so you can pick it up again from Load.
        </p>
        <div className="mt-5 flex gap-2">
          <button className="flex-1 rounded-xl bg-white/10 py-2.5 font-semibold hover:bg-white/20" onClick={onCancel}>
            Keep playing
          </button>
          <button className="flex-1 rounded-xl bg-red-600 py-2.5 font-bold hover:bg-red-500" onClick={onQuit}>
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}

/** Where Quit lands in a browser tab that refuses to close itself. */
function QuitScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-[#081019] p-6 text-center">
      <h1 className="text-3xl font-black tracking-tight">Until next time</h1>
      <p className="max-w-sm text-sm text-white/55">
        Prototown is closed. Your progress is saved — close this tab, or step back in.
      </p>
      <button className="rounded-xl bg-emerald-600 px-6 py-3 font-bold hover:bg-emerald-500" onClick={onBack}>
        Back to the title
      </button>
    </div>
  );
}
