import { useEffect, useRef } from "react";
import { useGame } from "./store";
import { controller, HUMAN_ID } from "../game/controller";
import { render, type ViewOptions } from "../render/renderer";
import { worldToGrid } from "../render/iso";
import { centerOnGrid, screenToWorld, clampZoom, type Camera } from "../render/camera";
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const state = controller.state;
    if (!canvas || !state) return;
    const ctx = canvas.getContext("2d")!;
    if (!cameraRef.current) cameraRef.current = centerOnGrid(state.size);

    let raf = 0;
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

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
    let downAt: [number, number] | null = null;
    let dragging = false;

    const toGrid = (clientX: number, clientY: number): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const cam = cameraRef.current!;
      const [wx, wy] = screenToWorld(cam, clientX - rect.left, clientY - rect.top, rect.width, rect.height);
      return worldToGrid(wx, wy);
    };

    const onPointerDown = (e: PointerEvent) => {
      downAt = [e.clientX, e.clientY];
      dragging = false;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const cam = cameraRef.current!;
      if (downAt) {
        const dx = e.clientX - downAt[0];
        const dy = e.clientY - downAt[1];
        if (dragging || Math.hypot(dx, dy) > 5) {
          dragging = true;
          cam.x -= dx / cam.zoom;
          cam.y -= dy / cam.zoom;
          downAt = [e.clientX, e.clientY];
        }
      }
      const g = toGrid(e.clientX, e.clientY);
      const s = controller.state;
      hoverRef.current = s && inBounds(s, g[0], g[1]) ? g : null;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (downAt && !dragging) handleClick(toGrid(e.clientX, e.clientY));
      downAt = null;
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current!;
      cam.zoom = clampZoom(cam.zoom * (e.deltaY > 0 ? 0.9 : 1.11));
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [game.screen]);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 cursor-pointer" />
        <SidePanel />
        <RewardPicker />
        {controller.aiBusy && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm font-semibold text-amber-300">
            Rival tribes are moving…
          </div>
        )}
      </div>
    </div>
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
