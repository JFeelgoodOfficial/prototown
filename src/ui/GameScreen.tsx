import { useEffect, useRef, useState } from "react";
import { useGame } from "./store";
import { controller, type UnitAnim } from "../game/controller";
import { render, pickTile, type ViewOptions } from "../render/renderer";
import { renderMinimap, minimapToGrid } from "../render/minimap";
import { worldToGrid, gridToWorld } from "../render/iso";
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
import OnlineStatusBar from "./OnlineStatusBar";

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
    // Invalidated by anything that makes the last painted frame stale. Assigning
    // canvas.width clears the canvas, so a resize *must* force a repaint or the
    // board stays blank until something else happens to change the frame key.
    let lastFrameKey = "";
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
      lastFrameKey = "";
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

    // Derived per-frame data that only changes when the game state or selection
    // does — recomputing it every frame walked the whole map for nothing.
    let derivedKey: unknown = null;
    let derived = {
      watched: [] as number[],
      moves: [] as Array<[number, number]>,
      attackIds: [] as number[],
    };

    // A turn-based board is static most of the time. Redrawing an unchanged
    // frame 60x a second is pure battery burn on a phone, so only draw when
    // something the renderer reads has actually moved.
    const draw = () => {
      const s = controller.state;
      const cam = cameraRef.current!;
      if (s) {
        // A pending focus (from cycling to an idle unit) moves the camera first.
        if (controller.focusRequest) {
          const [fx, fy] = controller.focusRequest;
          const [wx, wy] = gridToWorld(fx, fy);
          cam.x = wx;
          cam.y = wy;
          clampCamera(cam, s.size, viewRef.current.w, viewRef.current.h);
          controller.focusRequest = null;
        }

        const hover = hoverRef.current;
        const animating = controller.floats.length > 0 || controller.anims.length > 0;
        const frameKey = `${controller.getVersion()}|${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.zoom.toFixed(4)}|${hover ? `${hover[0]},${hover[1]}` : ""}|${canvas.width}x${canvas.height}|${controller.revealAll}`;
        if (!animating && frameKey === lastFrameKey) {
          raf = requestAnimationFrame(draw);
          return;
        }
        lastFrameKey = frameKey;

        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        const human = playerById(s, controller.localSeat);
        const now = performance.now();
        controller.floats = controller.floats.filter((f) => now - f.bornAt < 900);
        controller.anims = controller.anims.filter((a) => now - a.bornAt < a.duration);
        const unitOffsets = offsetsFor(controller.anims, now);

        const selected = controller.selectedUnitId;
        const key = `${controller.getVersion()}:${selected}:${controller.aiBusy}`;
        if (key !== derivedKey) {
          derivedKey = key;
          const moves: Array<[number, number]> = [];
          const attackIds: number[] = [];
          if (selected !== null && !controller.aiBusy) {
            for (const a of controller.legal) {
              if (a.type === "MOVE" && a.unitId === selected) moves.push([a.x, a.y]);
              if (a.type === "ATTACK" && a.unitId === selected) attackIds.push(a.targetId);
            }
          }
          derived = { watched: watchedMask(s, human), moves, attackIds };
        }

        const view: ViewOptions = {
          camera: cam,
          width: canvas.width / dpr,
          height: canvas.height / dpr,
          viewerId: controller.localSeat,
          explored: human.explored,
          watched: derived.watched,
          selectedUnitId: selected,
          reachable: derived.moves,
          attackableUnitIds: derived.attackIds,
          hoverTile: hoverRef.current,
          floatingTexts: controller.floats.map((f) => ({
            x: f.x,
            y: f.y,
            text: f.text,
            color: f.color,
            t: (now - f.bornAt) / 900,
          })),
          revealAll: controller.revealAll,
          unitOffsets,
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

    // Tile tops stand at their own height, so the hit test has to undo the lift
    // the renderer applied — a flat inverse would pick the tile below the cursor.
    const toGrid = (clientX: number, clientY: number): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const cam = cameraRef.current!;
      const [wx, wy] = screenToWorld(cam, clientX - rect.left, clientY - rect.top, rect.width, rect.height);
      const s = controller.state;
      if (!s) return worldToGrid(wx, wy);
      return pickTile(s, wx, wy, controller.revealAll ? undefined : playerById(s, controller.localSeat).explored);
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // a focused button handles its own Space/Enter
      const onButton = document.activeElement?.tagName === "BUTTON";
      const s = controller.state;
      if (!s || controller.aiBusy) return;
      const modalOpen = controller.legal.some((a) => a.type === "CHOOSE_REWARD");

      switch (e.key) {
        case "Escape":
          controller.selectUnit(null);
          break;
        case "Tab": {
          if (modalOpen) return;
          e.preventDefault();
          controller.cycleIdleUnit();
          break;
        }
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
          zoomBy(1.3);
          break;
        case "-":
        case "_":
          e.preventDefault();
          zoomBy(1 / 1.3);
          break;
        case "f":
        case "F":
          recenter();
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
        <Minimap cameraRef={cameraRef} viewRef={viewRef} />
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
        {game.mode === "online" && <OnlineStatusBar />}
      </div>
    </div>
  );
}

const MINIMAP_SIZE = 116;

/** Board overview, top-right. Tapping it jumps the camera to that tile. */
function Minimap({
  cameraRef,
  viewRef,
}: {
  cameraRef: React.RefObject<Camera | null>;
  viewRef: React.RefObject<{ w: number; h: number }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let lastKey = "";
    const tick = () => {
      const s = controller.state;
      const cam = cameraRef.current;
      if (s && cam) {
        const key = `${controller.getVersion()}|${cam.x.toFixed(0)},${cam.y.toFixed(0)},${cam.zoom.toFixed(3)}|${controller.revealAll}`;
        if (key !== lastKey) {
          lastKey = key;
          const dpr = window.devicePixelRatio || 1;
          canvas.width = MINIMAP_SIZE * dpr;
          canvas.height = MINIMAP_SIZE * dpr;
          ctx.save();
          ctx.scale(dpr, dpr);
          renderMinimap(
            ctx,
            s,
            {
              camera: cam,
              viewW: viewRef.current.w,
              viewH: viewRef.current.h,
              viewerId: controller.localSeat,
              explored: playerById(s, controller.localSeat).explored,
              revealAll: controller.revealAll,
            },
            MINIMAP_SIZE,
            MINIMAP_SIZE,
          );
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, cameraRef, viewRef]);

  const jump = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = controller.state;
    const cam = cameraRef.current;
    if (!s || !cam) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const [gx, gy] = minimapToGrid(s.size, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    if (!inBounds(s, gx, gy)) return;
    const [wx, wy] = gridToWorld(gx, gy);
    cam.x = wx;
    cam.y = wy;
    clampCamera(cam, s.size, viewRef.current.w, viewRef.current.h);
  };

  return (
    <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
      {open && (
        <canvas
          ref={canvasRef}
          onClick={jump}
          title="Click to jump there"
          style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
          className="cursor-pointer rounded-md border border-white/15 bg-black/50"
        />
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="touch-manipulation rounded border border-white/15 bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white/70 hover:bg-black/70"
      >
        {open ? "Hide map" : "Map"}
      </button>
    </div>
  );
}

/**
 * World-space offset per animating unit: a move eases from the old tile to the
 * new one, a hit is a short decaying shudder.
 */
function offsetsFor(anims: UnitAnim[], now: number): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  for (const a of anims) {
    const t = Math.min(1, (now - a.bornAt) / a.duration);
    if (a.kind === "move") {
      const [fx, fy] = gridToWorld(a.fromX, a.fromY);
      const [tx, ty] = gridToWorld(a.toX, a.toY);
      const eased = 1 - (1 - t) * (1 - t); // ease-out
      out.set(a.unitId, [(fx - tx) * (1 - eased), (fy - ty) * (1 - eased)]);
    } else {
      const decay = 1 - t;
      out.set(a.unitId, [Math.sin(t * Math.PI * 6) * 5 * decay, 0]);
    }
  }
  return out;
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
  if (unit && unit.ownerId === controller.localSeat) {
    controller.selectUnit(unit.id === selected ? null : unit.id);
    return;
  }
  controller.selectTile([x, y]);
}
