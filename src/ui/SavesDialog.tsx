import { useRef, useState } from "react";
import { useGame } from "./store";
import { HUMAN_ID } from "../game/controller";
import { listSlots, type SavedGame } from "../game/persistence";
import { tribeById } from "../data/tribes";

export default function SavesDialog({ onClose }: { onClose: () => void }) {
  const game = useGame();
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const slots = listSlots();
  const hasGame = game.state !== null;

  const say = (message: string) => setNotice(message);

  const copyExport = async () => {
    const text = game.exportCurrent();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      say("Save copied to the clipboard.");
    } catch {
      download(text);
      say("Clipboard unavailable — downloaded the file instead.");
    }
  };

  const importText = async (text: string) => {
    if (game.importSave(text)) onClose();
    else say("That doesn't look like a Polyforge save.");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[min(520px,94vw)] overflow-auto rounded-xl border border-white/15 bg-[#0f1828] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Saved games</h2>
          <button className="rounded bg-white/10 px-3 py-1 hover:bg-white/20" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mb-4 text-xs text-white/50">
          Your game autosaves on its own. These slots are for keeping a position you want to come back to.
        </p>

        <div className="space-y-2">
          {slots.map((slot, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Slot {i + 1}</div>
                  <div className="truncate text-xs text-white/50">{describe(slot)}</div>
                </div>
                <div className="flex flex-none gap-1.5">
                  <button
                    className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 disabled:opacity-40"
                    disabled={!hasGame}
                    onClick={() => say(game.saveToSlot(i) ? `Saved to slot ${i + 1}.` : "Could not write to storage.")}
                  >
                    Save
                  </button>
                  <button
                    className="rounded bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20 disabled:opacity-40"
                    disabled={!slot}
                    onClick={() => game.loadFromSlot(i) && onClose()}
                  >
                    Load
                  </button>
                  <button
                    className="rounded bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
                    disabled={!slot}
                    onClick={() => {
                      game.clearSlot(i);
                      say(`Cleared slot ${i + 1}.`);
                    }}
                    title="Clear this slot"
                    aria-label={`Clear slot ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">
            Move a game between devices
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20 disabled:opacity-40"
              disabled={!hasGame}
              onClick={copyExport}
            >
              Copy save
            </button>
            <button
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20 disabled:opacity-40"
              disabled={!hasGame}
              onClick={() => {
                const text = game.exportCurrent();
                if (text) {
                  download(text);
                  say("Downloaded polyforge-save.json.");
                }
              }}
            >
              Download
            </button>
            <button
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
              onClick={() => fileRef.current?.click()}
            >
              Load from file
            </button>
            <button
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"
              onClick={async () => {
                try {
                  await importText(await navigator.clipboard.readText());
                } catch {
                  say("Couldn't read the clipboard — use Load from file.");
                }
              }}
            >
              Paste save
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) await importText(await file.text());
            }}
          />
        </div>

        {notice && <div className="mt-4 text-xs text-emerald-300">{notice}</div>}
      </div>
    </div>
  );
}

function describe(slot: SavedGame | null): string {
  if (!slot) return "Empty";
  const human = slot.state.players.find((p) => p.id === HUMAN_ID);
  const parts = [`Turn ${slot.state.turn}`];
  if (human) parts.push(tribeById(human.tribeId).name);
  parts.push(slot.difficulty);
  if (slot.savedAt) parts.push(new Date(slot.savedAt).toLocaleString());
  return parts.join(" · ");
}

function download(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "polyforge-save.json";
  a.click();
  URL.revokeObjectURL(url);
}
