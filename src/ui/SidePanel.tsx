import { useGame } from "./store";
import { HUMAN_ID } from "../game/controller";
import { unitById, tileAt, cityById, unitAt, type GameState } from "../engine/state";
import { UNITS, NAVAL, type UnitType } from "../data/units";
import { HARVEST_DEFS, CITY_IMPROVEMENTS } from "../data/constants";
import { cityIncome, popForNextLevel, cityUnitCount, cityCapacity } from "../engine/economy";
import UnitPortrait from "./UnitPortrait";
import type { Action } from "../engine/actions";

/** Context panel: shows the selected unit, city, or tile with its actions. */
export default function SidePanel() {
  const game = useGame();
  const s = game.state;
  if (!s) return null;

  const unit = game.selectedUnitId !== null ? unitById(s, game.selectedUnitId) : undefined;
  if (unit) {
    const def = UNITS[unit.type];
    const acts = game.legal.filter(
      (a) => "unitId" in a && a.unitId === unit.id && a.type !== "MOVE" && a.type !== "ATTACK",
    );
    return (
      <Panel title={`${unit.embarked ? NAVAL[unit.embarked].name + " · " : ""}${def.name}${unit.veteran ? " ★" : ""}`}>
        <div className="flex items-end gap-3">
          <UnitPortrait
            tribeId={s.players[unit.ownerId].tribeId}
            type={unit.embarked ?? unit.type}
            width={64}
            height={68}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white/80">
              HP {unit.hp}/{unit.maxHp} · ATK {def.atk} · DEF {def.def} · Range {def.range}
            </div>
            <div className="text-xs text-white/50">
              {unit.moved && unit.attacked ? "Done for this turn" : unit.moved ? "Has moved" : "Ready"}
              {unit.fortified && <span className="text-sky-300"> · Dug in</span>}
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {acts.map((a) => (
            <ActionButton key={JSON.stringify(a)} action={a} />
          ))}
        </div>
      </Panel>
    );
  }

  if (game.selectedTile) {
    const [x, y] = game.selectedTile;
    const tile = tileAt(s, x, y);
    const city = tile.cityHere !== null ? cityById(s, tile.cityHere) : undefined;

    if (city && city.ownerId === HUMAN_ID) {
      const trains = game.legal.filter((a) => a.type === "TRAIN" && a.cityId === city.id);
      const improvements = game.legal.filter(
        (a) => a.type === "BUILD_IMPROVEMENT" && a.cityId === city.id,
      );
      const occupied = unitAt(s, city.x, city.y) !== undefined;
      return (
        <Panel title={`${city.name}${city.isCapital ? " (capital)" : ""} — level ${city.level}`}>
          <div className="text-sm text-white/80">
            Growth {city.population}/{popForNextLevel(city)} · Income ⭐{cityIncome(s, city)} · Units{" "}
            {cityUnitCount(s, city.id)}/{cityCapacity(s, city)}
            {city.walls ? " · Walls" : ""}
            {city.workshop ? " · Workshop" : ""}
            {city.parks > 0 ? ` · ${city.parks} park${city.parks > 1 ? "s" : ""}` : ""}
          </div>
          <div className="mt-2">
            <div className="mb-1 text-xs font-semibold uppercase text-white/50">Train unit</div>
            <div className="flex flex-wrap gap-2">
              {trains.length === 0 && (
                <span className="text-xs text-white/50">
                  {occupied
                    ? "City tile is occupied — move the unit first."
                    : cityUnitCount(s, city.id) >= cityCapacity(s, city)
                      ? "At unit capacity — level up the city."
                      : "No affordable units. Earn stars or research."}
                </span>
              )}
              {trains.map((a) => (
                <ActionButton key={JSON.stringify(a)} action={a} />
              ))}
            </div>
          </div>
          {improvements.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-xs font-semibold uppercase text-white/50">Build</div>
              <div className="flex flex-wrap gap-2">
                {improvements.map((a) => (
                  <ActionButton key={JSON.stringify(a)} action={a} />
                ))}
              </div>
            </div>
          )}
        </Panel>
      );
    }

    if (tile.ruin) {
      return (
        <Panel title="Ancient ruin">
          <div className="mt-1 text-xs text-white/60">
            Move a unit here to claim what's left inside — stars, a lost technology, veterans, settlers, or maps.
          </div>
        </Panel>
      );
    }

    const tileActs = game.legal.filter(
      (a) => (a.type === "HARVEST" || a.type === "BUILD") && a.x === x && a.y === y,
    );
    if (tileActs.length > 0 || tile.resource || tile.building) {
      return (
        <Panel title={describeTile(tile.terrain, tile.resource, tile.building)}>
          <div className="mt-1 flex flex-wrap gap-2">
            {tileActs.length === 0 && (
              <span className="text-xs text-white/50">
                {tile.cityId === null ? "Outside your territory." : "Nothing to do here yet."}
              </span>
            )}
            {tileActs.map((a) => (
              <ActionButton key={JSON.stringify(a)} action={a} />
            ))}
          </div>
        </Panel>
      );
    }
  }
  return null;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute bottom-3 left-3 w-[min(340px,90vw)] rounded-xl border border-white/15 bg-[#0f1828]/95 p-3 shadow-xl">
      <div className="mb-1 font-bold">{title}</div>
      {children}
    </div>
  );
}

function ActionButton({ action }: { action: Action }) {
  const game = useGame();
  return (
    <button
      className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold hover:bg-sky-500"
      onClick={() => game.dispatch(action)}
    >
      {labelFor(action, game.state!)}
    </button>
  );
}

function labelFor(a: Action, s: GameState): string {
  switch (a.type) {
    case "CAPTURE":
      return "Capture";
    case "RECOVER":
      return "Recover";
    case "DISBAND":
      return "Disband";
    case "FORTIFY":
      return "Dig in";
    case "UPGRADE_BOAT":
      return `Upgrade to Ship (⭐${NAVAL.ship.upgradeCost})`;
    case "HARVEST": {
      // the price and the payout both depend on what is actually on the tile
      const resource = tileAt(s, a.x, a.y).resource;
      const def = resource ? HARVEST_DEFS[resource as keyof typeof HARVEST_DEFS] : undefined;
      if (!def) return "Harvest";
      const payout = def.stars > 0 ? ` → ⭐${def.stars}` : "";
      return `Harvest ${resource} (⭐${def.cost})${payout}`;
    }
    case "BUILD":
      return `Build ${a.building.replace("_", " ")}`;
    case "BUILD_IMPROVEMENT": {
      const def = CITY_IMPROVEMENTS[a.improvement];
      return `${def.name} (⭐${def.cost})`;
    }
    case "TRAIN":
      return `${UNITS[a.unitType as UnitType].name} (⭐${UNITS[a.unitType as UnitType].cost})`;
    default:
      return a.type;
  }
}

function describeTile(terrain: string, resource: string | null, building: string | null): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");
  let title = cap(terrain);
  if (resource) title += ` · ${cap(resource)}`;
  if (building) title += ` · ${cap(building)}`;
  return title;
}
