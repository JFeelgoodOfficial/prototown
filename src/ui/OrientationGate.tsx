import { useEffect, useState, type ReactNode } from "react";

/**
 * Prototown is played on a wide isometric board, so phones have to be turned
 * sideways. Held upright, a touch device gets this prompt instead of the game;
 * desktops and tablets in portrait are left alone — the test asks for a small
 * touch screen, not merely a tall window.
 */
const QUERY = "(orientation: portrait) and (max-width: 900px) and (pointer: coarse)";

function askForLandscape(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export default function OrientationGate({ children }: { children: ReactNode }) {
  const [upright, setUpright] = useState(askForLandscape);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const sync = () => setUpright(mq.matches);
    mq.addEventListener("change", sync);
    // Some phones report the new orientation a frame late, so re-check on resize too.
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return (
    <>
      {children}
      {upright && <RotatePrompt />}
    </>
  );
}

function RotatePrompt() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-[#081019] p-8 text-center">
      <PhoneIcon />
      <div>
        <h1 className="text-2xl font-black tracking-tight">Turn your phone sideways</h1>
        <p className="mt-2 text-sm text-white/55">Prototown needs the wide view to fit the map.</p>
      </div>
    </div>
  );
}

/** A phone tipping into landscape — the animation says what the words say. */
function PhoneIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden className="text-amber-300">
      <g className="origin-center [animation:pf-tip_2.4s_ease-in-out_infinite]">
        <rect x="42" y="18" width="36" height="64" rx="7" fill="none" stroke="currentColor" strokeWidth="3.5" />
        <rect x="47" y="26" width="26" height="46" rx="2" fill="currentColor" opacity="0.25" />
        <circle cx="60" cy="77" r="2.4" fill="currentColor" />
      </g>
      <path
        d="M30 100a34 34 0 0 0 60 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path d="M88 94l4 8-9 1z" fill="currentColor" opacity="0.7" />
      <style>{`@keyframes pf-tip { 0%,35% { transform: rotate(0deg) } 60%,100% { transform: rotate(-90deg) } }`}</style>
    </svg>
  );
}
