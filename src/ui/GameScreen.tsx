import { useEffect, useRef } from "react";
import { useGame } from "./store";
import { controller, HUMAN_ID } from "../game/controller";
import { render, type ViewOptions } from "../render/renderer";
import { worldToGrid } from "../render/iso";
import {
  screenToWorld,
  clampZoom,
  minZoom,
  initialCamera,
  clampCamera,
  anchorZoom,
  type Camera,
} from "../render/camera";
import { playerById, unitAt, inBounds } from "../engine/state";
import { watchedMask } from "../engine/fog";
import TopBar from "./TopBar";
import SidePanel from "./SidePanel";
import RewardPicker from "./RewardPicker";

export default function GameScreen() {
  const game = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const hoverRef = useRef<[number, number] | null>(null);
  /** Viewport size in CSS pixels — all camera math is DPR-free. */
  const viewRef = useRef({ w: 0, h: 0 });
  const camKeyRef = useRef("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const state = controller.state;
    if (!canvas || !state) return;
    const ctx = canvas.getContext("2d")!;

    let raf = 0;
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      viewRef.current = { w: rect.width, h: rect.height };
      // A rotation or window resize can leave the camera zoomed in past what now fits.
      const cam = cameraRef.current;
      const s = controller.state;
      if (cam && s) {
        cam.zoom = clampZoom(cam.zoom, minZoom(s.size, rect.width, rect.height));
        clampCamera(cam, s.size, rect.width, rect.height);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    // Reset the camera for a new board, but keep it across menu round-trips of the same game.
    const camKey = `${state.seed}:${state.size}`;
    if (!cameraRef.current || camKeyRef.current !== camKey) {
      cameraRef.current = initialCamera(state.size, viewRef.current.w, viewRef.current.h);
      camKeyRef.current = camKey;
    }

    const draw = () => {
      const s = controller.state;
      const cam = cameraRef.current!;
      if (s) {
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        const human = playerById(s, HUMAN_ID);
        const now = performance.now();
        controller.floats = controller.floats.filter((f) => now - f.bornAt < 900);

        const selected = controller.selectedUnitId;
        const moves: Array<[number, number]> = [];
        const attackIds: number[] = [];
        if (selected !== null && !controller.aiBusy) {
          for (const a of controller.legal) {
            if (a.type === "MOVE" && a.unitId === selected) moves.push([a.x, a.y]);
            if (a.type === "ATTACK" && a.unitId === selected) attackIds.push(a.targetId);
          }
        }

        const view: ViewOptions = {
          camera: cam,
          width: canvas.width / dpr,
          height: canvas.height / dpr,
          viewerId: HUMAN_ID,
          explored: human.explored,
          watched: watchedMask(s, human),
          selectedUnitId: selected,
          reachable: moves,
          attackableUnitIds: attackIds,
          hoverTile: hoverRef.current,
          floatingTexts: controller.floats.map((f) => ({
            x: f.x,
            y: f.y,
            text: f.text,
            color: f.color,
            t: (now - f.bornAt) / 900,
          })),
          revealAll: controller.revealAll,
        };
        render(ctx, s, view);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // --- input ---
    /** Every pointer currently down, in client coords — two of them means a pinch. */
    const pointers = new Map<number, { x: number; y: number }>();
    let dragAnchor: [number, number] | null = null;
    let dragging = false;
    let tapCandidate = false;
    let pinchDist = 0;
    let pinchMid: [number, number] = [0, 0];

    const toGrid = (clientX: number, clientY: number): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const cam = cameraRef.current!;
      const [wx, wy] = screenToWorld(cam, clientX - rect.left, clientY - rect.top, rect.width, rect.height);
      return worldToGrid(wx, wy);
    };

    const pinchOf = (): { dist: number; mid: [number, number] } | null => {
      const pts = [...pointers.values()];
      if (pts.length < 2) return null;
      const [a, b] = pts;
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2] };
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
        // Pinch dropped to one finger — re-anchor so the map doesn't jump.
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
        // A second finger is never a tap.
        tapCandidate = false;
        dragging = true;
        const p = pinchOf();
        if (p) {
          pinchDist = p.dist;
          pinchMid = p.mid;
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const cam = cameraRef.current!;
      const s = controller.state;
      const { w, h } = viewRef.current;
      const tracked = pointers.get(e.pointerId);
      if (tracked) {
        tracked.x = e.clientX;
        tracked.y = e.clientY;
      }

      const pinch = pointers.size >= 2 ? pinchOf() : null;
      if (pinch && s) {
        const rect = canvas.getBoundingClientRect();
        if (pinchDist > 0) {
          const next = clampZoom(cam.zoom * (pinch.dist / pinchDist), minZoom(s.size, w, h));
          // Moving midpoint carries the two-finger pan along with the zoom.
          anchorZoom(
            cam,
            pinchMid[0] - rect.left,
            pinchMid[1] - rect.top,
            pinch.mid[0] - rect.left,
            pinch.mid[1] - rect.top,
            next,
            w,
            h,
          );
          clampCamera(cam, s.size, w, h);
        }
        pinchDist = pinch.dist;
        pinchMid = pinch.mid;
        return;
      }

      if (tracked && dragAnchor) {
        const dx = e.clientX - dragAnchor[0];
        const dy = e.clientY - dragAnchor[1];
        if (dragging || Math.hypot(dx, dy) > 5) {
          dragging = true;
          tapCandidate = false;
          cam.x -= dx / cam.zoom;
          cam.y -= dy / cam.zoom;
          if (s) clampCamera(cam, s.size, w, h);
          dragAnchor = [e.clientX, e.clientY];
        }
      }

      if (e.pointerType === "touch") {
        hoverRef.current = null; // hover is a mouse concept
        return;
      }
      const g = toGrid(e.clientX, e.clientY);
      hoverRef.current = s && inBounds(s, g[0], g[1]) ? g : null;
    };

    const onPointerUp = (e: PointerEvent) => {
      const isTap = pointers.size === 1 && pointers.has(e.pointerId) && tapCandidate && !dragging;
      endPointer(e);
      if (isTap) handleClick(toGrid(e.clientX, e.clientY));
    };

    const onPointerCancel = (e: PointerEvent) => {
      endPointer(e); // never counts as a click
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current!;
      const s = controller.state;
      if (!s) return;
      const rect = canvas.getBoundingClientRect();
      const { w, h } = viewRef.current;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const next = clampZoom(cam.zoom * (e.deltaY > 0 ? 0.9 : 1.11), minZoom(s.size, w, h));
      anchorZoom(cam, sx, sy, sx, sy, next, w, h);
      clampCamera(cam, s.size, w, h);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [game.screen]);

  const zoomBy = (factor: number) => {
    const cam = cameraRef.current;
    const s = controller.state;
    if (!cam || !s) return;
    const { w, h } = viewRef.current;
    const next = clampZoom(cam.zoom * factor, minZoom(s.size, w, h));
    anchorZoom(cam, w / 2, h / 2, w / 2, h / 2, next, w, h);
    clampCamera(cam, s.size, w, h);
  };

  const recenter = () => {
    const s = controller.state;
    if (!s) return;
    cameraRef.current = initialCamera(s.size, viewRef.current.w, viewRef.current.h);
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 cursor-pointer touch-none select-none" />
        <SidePanel />
        <RewardPicker />
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <MapButton label="+" title="Zoom in" onPress={() => zoomBy(1.3)} />
          <MapButton label="−" title="Zoom out" onPress={() => zoomBy(1 / 1.3)} />
          <MapButton label="⌖" title="Fit map to screen" onPress={recenter} />
        </div>
        {game.lastSavedAt !== null && (
          <div
            key={game.lastSavedAt}
            className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 animate-save-flash text-xs font-semibold text-white/45"
          >
            Saved
          </div>
        )}
        {controller.aiBusy && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm font-semibold text-amber-300">
            Rival tribes are moving…
          </div>
        )}
      </div>
    </div>
  );
}

function MapButton({ label, title, onPress }: { label: string; title: string; onPress: () => void }) {
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

function handleClick([x, y]: [number, number]): void {
  const s = controller.state;
  if (!s || controller.aiBusy || !inBounds(s, x, y)) return;
  if (controller.legal.some((a) => a.type === "CHOOSE_REWARD")) return; // modal open

  const selected = controller.selectedUnitId;
  if (selected !== null) {
    const move = controller.legal.find((a) => a.type === "MOVE" && a.unitId === selected && a.x === x && a.y === y);
    if (move) {
      controller.dispatch(move);
      return;
    }
    const targetUnit = unitAt(s, x, y);
    if (targetUnit) {
      const attack = controller.legal.find(
        (a) => a.type === "ATTACK" && a.unitId === selected && a.targetId === targetUnit.id,
      );
      if (attack) {
        controller.dispatch(attack);
        return;
      }
    }
  }

  const unit = unitAt(s, x, y);
  if (unit && unit.ownerId === HUMAN_ID) {
    controller.selectUnit(unit.id === selected ? null : unit.id);
    return;
  }
  controller.selectTile([x, y]);
}
