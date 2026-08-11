import { useEffect, useState } from "react";
import { useGame } from "./store";
import { pushSupport, alertsEnabled, enableTurnAlerts, disableTurnAlerts, type PushSupport } from "../net/push";

/**
 * Turn-alert toggle for online games. One tap subscribes this device to a
 * push when it becomes your turn; on iOS Safari outside a Home-Screen app it
 * explains the install step instead (that's an Apple requirement).
 */
export default function OnlineBell() {
  const game = useGame();
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    setSupport(pushSupport());
    void alertsEnabled().then(setEnabled);
  }, []);

  const ref = game.online?.ref;
  if (!ref || support === "unsupported") return null;

  const toggle = async () => {
    if (busy) return;
    if (support === "needs-install" || support === "denied") {
      setHintOpen(true);
      return;
    }
    setBusy(true);
    try {
      if (enabled) {
        await disableTurnAlerts(ref);
        setEnabled(false);
      } else {
        setEnabled(await enableTurnAlerts(ref));
        setSupport(pushSupport()); // permission may have flipped to denied
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className={`rounded px-2 py-1.5 hover:bg-white/20 sm:px-3 ${enabled ? "bg-sky-500/30" : "bg-white/10"}`}
        onClick={() => void toggle()}
        disabled={busy}
        title={enabled ? "Turn alerts on — tap to turn off" : "Get a notification when it's your turn"}
        aria-label={enabled ? "Turn off turn alerts" : "Turn on turn alerts"}
      >
        {enabled ? "🔔" : "🔕"}
      </button>
      {hintOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" onClick={() => setHintOpen(false)}>
          <div
            className="w-[min(420px,92vw)] rounded-xl border border-white/15 bg-[#0f1828] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {support === "needs-install" ? (
              <>
                <h2 className="text-lg font-bold">Add Prototown to your Home Screen first</h2>
                <p className="mt-2 text-sm text-white/70">
                  iPhones only deliver notifications to installed web apps. In Safari, tap the{" "}
                  <span className="font-semibold text-white">Share</span> button, choose{" "}
                  <span className="font-semibold text-white">Add to Home Screen</span>, then open Prototown from the
                  new icon and tap the bell again.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold">Notifications are blocked</h2>
                <p className="mt-2 text-sm text-white/70">
                  This browser has notifications turned off for Prototown. Allow them in your browser's site settings,
                  then tap the bell again.
                </p>
              </>
            )}
            <button
              className="mt-4 w-full rounded-lg bg-white/10 py-2 font-semibold hover:bg-white/20"
              onClick={() => setHintOpen(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
