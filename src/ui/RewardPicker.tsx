import { useGame } from "./store";
import { cityById } from "../engine/state";
import type { Action } from "../engine/actions";

type RewardAction = Extract<Action, { type: "CHOOSE_REWARD" }>;

const REWARD_INFO: Record<string, { name: string; blurb: string }> = {
  workshop: { name: "Workshop", blurb: "+1 star every turn" },
  explorer: { name: "Explorer", blurb: "Reveals nearby lands" },
  walls: { name: "City Walls", blurb: "Big defence bonus for units in the city" },
  stars: { name: "Windfall", blurb: "+5 stars now" },
  border_growth: { name: "Border Growth", blurb: "Territory expands" },
  population: { name: "Festival", blurb: "+3 population" },
  park: { name: "Grand Park", blurb: "+250 score" },
  super_unit: { name: "Colossus", blurb: "A mighty super unit" },
};

export default function RewardPicker() {
  const game = useGame();
  const s = game.state;
  if (!s || game.aiBusy) return null;
  const rewards = game.legal.filter((a): a is RewardAction => a.type === "CHOOSE_REWARD");
  if (rewards.length === 0) return null;
  const city = cityById(s, rewards[0].cityId);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="w-[min(480px,92vw)] rounded-xl border border-amber-300/40 bg-[#101a2c] p-5 text-center shadow-2xl">
        <h2 className="text-lg font-bold text-amber-300">
          {city?.name} grew to level {city?.level}!
        </h2>
        <p className="mb-4 text-sm text-white/60">Choose a reward</p>
        <div className="flex gap-3">
          {rewards.map((a) => {
            const info = REWARD_INFO[a.reward] ?? { name: a.reward, blurb: "" };
            return (
              <button
                key={a.reward}
                className="flex-1 rounded-lg border border-white/15 bg-white/5 p-4 hover:border-amber-300/60 hover:bg-amber-300/10"
                onClick={() => game.dispatch(a)}
              >
                <div className="text-base font-bold">{info.name}</div>
                <div className="mt-1 text-xs text-white/60">{info.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
