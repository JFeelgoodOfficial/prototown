import { useGame } from "./store";
import { HUMAN_ID } from "../game/controller";
import { playerById, citiesOf } from "../engine/state";
import { TECHS, techCost } from "../data/techs";

export default function TechTreeDialog({ onClose }: { onClose: () => void }) {
  const game = useGame();
  const s = game.state;
  if (!s) return null;
  const me = playerById(s, HUMAN_ID);
  const numCities = citiesOf(s, HUMAN_ID).length;
  const branches = ["riding", "organization", "climbing", "fishing", "hunting"];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="max-h-[85vh] w-[min(920px,95vw)] overflow-auto rounded-xl border border-white/15 bg-[#0f1828] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Research — ⭐ {me.stars}</h2>
          <button className="rounded bg-white/10 px-3 py-1 hover:bg-white/20" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {branches.map((root) => (
            <div key={root} className="space-y-2">
              {TECHS.filter((t) => branchOf(t.id) === root).map((tech) => {
                const known = me.techs.includes(tech.id);
                const prereqOk = !tech.requires || me.techs.includes(tech.requires);
                const cost = techCost(tech.id, numCities);
                const action = game.legal.find((a) => a.type === "RESEARCH" && a.techId === tech.id);
                return (
                  <button
                    key={tech.id}
                    disabled={!action}
                    onClick={() => {
                      if (action) {
                        game.dispatch(action);
                        onClose();
                      }
                    }}
                    className={`w-full rounded-lg border p-2 text-left text-sm transition ${
                      known
                        ? "border-emerald-500/60 bg-emerald-500/15"
                        : action
                          ? "border-sky-400/60 bg-sky-500/15 hover:bg-sky-500/30"
                          : "border-white/10 bg-white/5 opacity-60"
                    }`}
                  >
                    <div className="flex justify-between font-semibold">
                      <span>{tech.name}</span>
                      {!known && <span>⭐{cost}</span>}
                    </div>
                    <div className="text-xs text-white/60">
                      {known ? "Researched" : prereqOk ? tech.blurb : `Requires ${tech.requires}`}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function branchOf(id: string): string {
  const roots: Record<string, string> = {
    riding: "riding", roads: "riding", free_spirit: "riding", trade: "riding", chivalry: "riding",
    organization: "organization", farming: "organization", shields: "organization", construction: "organization", strategy: "organization",
    climbing: "climbing", mining: "climbing", meditation: "climbing", smithery: "climbing", philosophy: "climbing",
    fishing: "fishing", sailing: "fishing", whaling: "fishing", navigation: "fishing", aquatism: "fishing",
    hunting: "hunting", archery: "hunting", forestry: "hunting", mathematics: "hunting", spiritualism: "hunting",
  };
  return roots[id];
}
