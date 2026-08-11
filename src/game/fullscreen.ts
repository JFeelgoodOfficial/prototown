/**
 * Fullscreen is always the player's choice — nothing here runs on its own.
 * The browser owns the truth (Esc and the system UI can leave fullscreen
 * behind our back), so state is read from the document and components
 * subscribe to the change event rather than keeping their own flag.
 */

export function isFullscreen(): boolean {
  return typeof document !== "undefined" && document.fullscreenElement !== null;
}

export function supportsFullscreen(): boolean {
  return typeof document !== "undefined" && document.documentElement.requestFullscreen !== undefined;
}

/** Fires whenever the browser enters or leaves fullscreen, however it happened. */
export function onFullscreenChange(fn: () => void): () => void {
  document.addEventListener("fullscreenchange", fn);
  return () => document.removeEventListener("fullscreenchange", fn);
}

/**
 * Toggle fullscreen. Phones will usually only hold an orientation once a page
 * owns the screen, so entering also asks for landscape — a request browsers are
 * free to refuse, which is why the rejection is swallowed.
 */
export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
    const orientation = screen.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    await orientation?.lock?.("landscape").catch(() => {});
  } catch {
    // Denied (no gesture, an iPhone, a locked-down embed) — stay windowed.
  }
}
