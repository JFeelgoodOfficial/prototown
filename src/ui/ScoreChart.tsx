import type { GameState } from "../engine/state";
import { playerScore } from "../engine/score";
import { tribeById } from "../data/tribes";

/**
 * Score per tribe over the game. The tribe colours are fixed by the game's
 * identity and two of them (gold and green) are nearly indistinguishable to
 * protanopic viewers, so every series also carries its own dash pattern, end
 * marker and direct label — identity never rests on colour alone.
 */
const DASHES = ["", "7 3", "2 3", "9 3 2 3"];
type MarkerShape = "circle" | "square" | "triangle" | "diamond";
const MARKERS: MarkerShape[] = ["circle", "square", "triangle", "diamond"];

const W = 520;
const H = 190;
const PAD = { top: 12, right: 96, bottom: 26, left: 44 };

export default function ScoreChart({ state, meId }: { state: GameState; meId: number }) {
  const history = state.scoreHistory ?? [];
  const series = state.players.map((p, i) => ({
    playerId: p.id,
    tribe: tribeById(p.tribeId),
    dash: DASHES[i % DASHES.length],
    marker: MARKERS[i % MARKERS.length],
    points: [
      ...history.map((row, turn) => ({ turn: turn + 1, score: row[p.id] ?? 0 })),
      { turn: Math.max(state.turn, history.length + 1), score: playerScore(state, p.id) },
    ],
  }));

  const lastTurn = Math.max(...series.map((s) => s.points[s.points.length - 1].turn), 2);
  const maxScore = Math.max(...series.flatMap((s) => s.points.map((p) => p.score)), 1);
  // round the top up to something legible rather than the exact maximum
  const step = niceStep(maxScore / 3);
  const top = Math.ceil(maxScore / step) * step;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const sx = (turn: number) => PAD.left + ((turn - 1) / Math.max(1, lastTurn - 1)) * plotW;
  const sy = (score: number) => PAD.top + plotH - (score / top) * plotH;

  const ticks: number[] = [];
  for (let t = 0; t <= top + 0.5; t += step) ticks.push(t);

  // Tribes finishing on similar scores would otherwise print their names on top
  // of each other; nudge the labels apart while the markers stay put.
  const labelY = spreadLabels(series.map((s) => sy(s.points[s.points.length - 1].score)));

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/50">
        Score by turn
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Score for each tribe over the game">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={sy(t)}
              y2={sy(t)}
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="1"
            />
            <text x={PAD.left - 8} y={sy(t) + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.45)">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 8} fontSize="10" fill="rgba(255,255,255,0.45)">
          Turn 1
        </text>
        <text x={PAD.left + plotW} y={H - 8} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.45)">
          {lastTurn}
        </text>

        {series.map((s, si) => {
          const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.turn)} ${sy(p.score)}`).join(" ");
          const last = s.points[s.points.length - 1];
          const ly = labelY[si];
          return (
            <g key={s.playerId}>
              <path
                d={d}
                fill="none"
                stroke={s.tribe.color}
                strokeWidth="2"
                strokeDasharray={s.dash || undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <Marker shape={s.marker} x={sx(last.turn)} y={sy(last.score)} color={s.tribe.color} />
              {Math.abs(ly - sy(last.score)) > 1 && (
                <line
                  x1={sx(last.turn) + 6}
                  y1={sy(last.score)}
                  x2={sx(last.turn) + 10}
                  y2={ly}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth="1"
                />
              )}
              <text x={sx(last.turn) + 12} y={ly + 4} fontSize="11" fill="rgba(255,255,255,0.75)" fontWeight="600">
                {s.tribe.name}
                {s.playerId === meId ? " (you)" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Distinct shapes so series stay separable without colour. */
function Marker({ shape, x, y, color }: { shape: MarkerShape; x: number; y: number; color: string }) {
  const r = 4.5;
  const common = { fill: color, stroke: "#0f1828", strokeWidth: 2 };
  if (shape === "circle") return <circle cx={x} cy={y} r={r} {...common} />;
  if (shape === "square") return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} {...common} />;
  if (shape === "triangle")
    return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} {...common} />;
  return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} {...common} />;
}

/**
 * Push labels apart so none overlap, keeping their original order and staying
 * inside the plot. Returns a y per input, in the same order.
 */
function spreadLabels(ys: number[], gap = 14): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) {
    if (order[k].y - order[k - 1].y < gap) order[k].y = order[k - 1].y + gap;
  }
  // if that pushed the stack off the bottom, slide the whole thing back up
  const overflow = order.length ? order[order.length - 1].y - (H - PAD.bottom) : 0;
  if (overflow > 0) for (const o of order) o.y -= overflow;

  const out = new Array<number>(ys.length);
  for (const o of order) out[o.i] = Math.max(PAD.top + 4, o.y);
  return out;
}

/** A round number for the axis top: 1, 2 or 5 times a power of ten. */
function niceStep(max: number): number {
  const raw = max / 2;
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}
