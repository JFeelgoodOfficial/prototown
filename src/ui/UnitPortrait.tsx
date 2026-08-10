import { useEffect, useRef } from "react";
import { drawCharacter, fitScale, type ArtUnitType } from "../render/unitArt";

/**
 * A single character drawn to a still canvas — used for the tribe picker and the
 * selected-unit card. Redraws only when the figure or its box changes.
 */
export default function UnitPortrait({
  tribeId,
  type,
  width,
  height,
  className,
}: {
  tribeId: string;
  type: ArtUnitType;
  width: number;
  height: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // Leave a little air so weapon tips and ground shadow are not clipped.
    drawCharacter(ctx, {
      tribe: tribeId,
      type,
      x: width / 2,
      y: height - 3,
      scale: fitScale(type, width - 4, height - 8),
    });
  }, [tribeId, type, width, height]);

  return <canvas ref={ref} style={{ width, height }} className={className} />;
}
