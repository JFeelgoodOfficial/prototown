import { useEffect, useRef } from "react";
import { controller } from "../game/controller";
import { GlobeRenderer, type GlobeView } from "../render/globe/globeRenderer";
import { playerById } from "../engine/state";
import { watchedMask } from "../engine/fog";
import { handleBoardClick } from "./boardClick";

/**
 * The 3D board for globe maps: a rotatable cube-sphere world in a WebGL
 * canvas, filling the same pane the flat 2D canvas normally does. Dragging
 * spins the globe, pinch/wheel zooms, tapping picks a tile.
 */
export default function GlobeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<GlobeRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const state = controller.state;
    if (!canvas || !state) return;

    const globe = new GlobeRenderer(canvas, state);
    globeRef.current = globe;
    // start looking at your own capital, not whatever side the cube woke up on
    const home = state.cities.find((c) => c.ownerId === controller.localSeat && c.isCapital);
    if (home) globe.focusTile(home.x, home.y);
    let raf = 0;
    let lastViewKey = "";
    let hover: [number, number] | null = null;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      globe.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const buildView = (): GlobeView => {
      const s = controller.state!;
      const human = playerById(s, controller.localSeat);
      const selected = controller.selectedUnitId;
      const moves: Array<[number, number]> = [];
      const attackIds: number[] = [];
      if (selected !== null && !controller.aiBusy) {
        for (const a of controller.legal) {
          if (a.type === "MOVE" && a.unitId === selected) moves.push([a.x, a.y]);
          if (a.type === "ATTACK" && a.unitId === selected) attackIds.push(a.targetId);
        }
      }
      return {
        viewerId: controller.localSeat,
        explored: human.explored,
        watched: watchedMask(s, human),
        revealAll: controller.revealAll,
        selectedUnitId: selected,
        reachable: moves,
        attackableUnitIds: attackIds,
        hoverTile: hover,
      };
    };

    const draw = () => {
      const s = controller.state;
      if (s) {
        globe.setState(s);
        if (controller.focusRequest) {
          const [fx, fy] = controller.focusRequest;
          globe.focusTile(fx, fy);
          controller.focusRequest = null;
        }
        const viewKey = `${controller.getVersion()}:${controller.selectedUnitId}:${controller.aiBusy}:${controller.revealAll}:${hover ? `${hover[0]},${hover[1]}` : ""}`;
        if (viewKey !== lastViewKey) {
          lastViewKey = viewKey;
          const view = buildView();
          globe.repaintAtlas(view);
          globe.rebuildSprites(view);
        }
        globe.render();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // --- input: drag rotates, pinch/wheel zooms, tap picks ---
    const pointers = new Map<number, { x: number; y: number }>();
    let dragAnchor: [number, number] | null = null;
    let dragging = false;
    let tapCandidate = false;
    let pinchDist = 0;

    const pinchOf = (): number | null => {
      const pts = [...pointers.values()];
      if (pts.length < 2) return null;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const pickAt = (clientX: number, clientY: number): [number, number] | null => {
      const rect = canvas.getBoundingClientRect();
      return globe.pick(clientX - rect.left, clientY - rect.top, rect.width, rect.height);
    };

    const endPointer = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // pointer already gone
      }
      pinchDist = 0;
      tapCandidate = false;
      if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        dragAnchor = [p.x, p.y];
        dragging = true;
      } else if (pointers.size === 0) {
        dragAnchor = null;
        dragging = false;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // capture is best-effort
      }
      if (pointers.size === 1) {
        dragAnchor = [e.clientX, e.clientY];
        dragging = false;
        tapCandidate = true;
      } else {
        tapCandidate = false;
        dragging = true;
        pinchDist = pinchOf() ?? 0;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const tracked = pointers.get(e.pointerId);
      if (tracked) {
        tracked.x = e.clientX;
        tracked.y = e.clientY;
      }

      const pinch = pointers.size >= 2 ? pinchOf() : null;
      if (pinch !== null) {
        if (pinchDist > 0) globe.zoomBy(pinchDist / pinch);
        pinchDist = pinch;
        return;
      }

      if (tracked && dragAnchor) {
        const dx = e.clientX - dragAnchor[0];
        const dy = e.clientY - dragAnchor[1];
        if (dragging || Math.hypot(dx, dy) > 5) {
          dragging = true;
          tapCandidate = false;
          globe.rotateBy(dx, dy);
          dragAnchor = [e.clientX, e.clientY];
        }
      }

      if (e.pointerType === "touch") {
        hover = null;
        return;
      }
      hover = pickAt(e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      const isTap = pointers.size === 1 && pointers.has(e.pointerId) && tapCandidate && !dragging;
      endPointer(e);
      if (isTap) {
        const tile = pickAt(e.clientX, e.clientY);
        if (tile) handleBoardClick(tile);
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      endPointer(e);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      globe.zoomBy(e.deltaY > 0 ? 1.1 : 0.9);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const onButton = document.activeElement?.tagName === "BUTTON";
      const s = controller.state;
      if (!s || controller.aiBusy) return;
      const modalOpen = controller.legal.some((a) => a.type === "CHOOSE_REWARD");
      switch (e.key) {
        case "Escape":
          controller.selectUnit(null);
          break;
        case "Tab":
          if (modalOpen) return;
          e.preventDefault();
          controller.cycleIdleUnit();
          break;
        case " ":
        case "Enter": {
          if (modalOpen || onButton) return;
          e.preventDefault();
          const end = controller.legal.find((a) => a.type === "END_TURN");
          if (end) controller.dispatch(end);
          break;
        }
        case "+":
        case "=":
          e.preventDefault();
          globe.zoomBy(1 / 1.3);
          break;
        case "-":
        case "_":
          e.preventDefault();
          globe.zoomBy(1.3);
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);
      globe.dispose();
      globeRef.current = null;
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-pointer touch-none select-none" />
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <GlobeButton label="+" title="Zoom in" onPress={() => globeRef.current?.zoomBy(1 / 1.3)} />
        <GlobeButton label="−" title="Zoom out" onPress={() => globeRef.current?.zoomBy(1.3)} />
      </div>
    </>
  );
}

function GlobeButton({ label, title, onPress }: { label: string; title: string; onPress: () => void }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onPress}
      className="h-10 w-10 touch-manipulation rounded-lg border border-white/15 bg-black/50 text-lg font-bold leading-none text-white/80 hover:bg-black/70 active:bg-white/20"
    >
      {label}
    </button>
  );
}
