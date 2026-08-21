import { useState } from "react";
import { useGame } from "./store";
import { unitById, tileAt, cityById, unitAt, dist, type GameState, type Tile, type City } from "../engine/state";
import { UNITS, NAVAL, ORBIT, type UnitType } from "../data/units";
import {
  HARVEST_DEFS,
  CITY_IMPROVEMENTS,
  BUILDING_DEFS,
  FOUND_CITY_COST,
  NAVAL_TOWER_RANGE,
  NUKE_DELIVERY_RANGE,
} from "../data/constants";
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
    const inOrbit = unit.embarked === "orbit";
    // Landing is done by tapping a lit tile on the other world, so the LAND
    // actions themselves (one per landing site) never render as buttons.
    const acts = game.legal.filter(
      (a) =>
        "unitId" in a &&
        a.unitId === unit.id &&
        a.type !== "MOVE" &&
        a.type !== "ATTACK" &&
        a.type !== "LAND" &&
        a.type !== "LAUNCH_NUKE",
    );
    // A nuke run is aimed at a city, not fired from this panel: it is offered
    // (behind its own confirmation) when that city is the thing selected.
    const canNuke = game.legal.some((a) => a.type === "LAUNCH_NUKE" && a.unitId === unit.id);
    const mode =
      unit.embarked === null ? null : unit.embarked === "orbit" ? ORBIT : NAVAL[unit.embarked];
    return (
      <Panel title={`${mode ? mode.name + " · " : ""}${def.name}${unit.veteran ? " ★" : ""}`}>
        <div className="flex items-end gap-3">
          <UnitPortrait
            tribeId={s.players[unit.ownerId].tribeId}
            type={unit.embarked === "orbit" ? unit.type : (unit.embarked ?? unit.type)}
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
            {inOrbit && (
              <div className="text-xs text-amber-300">
                In orbit — tap a lit tile on the other world to land.
              </div>
            )}
            {def.air && (
              <div className="text-xs text-sky-300">
                Flies over anything — but holds no ground, and enemy flak fires on it.
              </div>
            )}
            {canNuke && (
              <div className="text-xs text-amber-300">
                ☢ Armed — tap an enemy city in sight, within {NUKE_DELIVERY_RANGE} tiles, to send it.
              </div>
            )}
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

    if (city && city.ownerId === game.localSeat) {
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

    if (city && city.ownerId !== game.localSeat) {
      // The bomb only ever rides a Bomber, so the panel offers the run from the
      // best-placed one that can still make it — and says so when none can.
      const runs = game.legal.filter((a) => a.type === "LAUNCH_NUKE" && a.cityId === city.id);
      const armed =
        !s.nukeLaunched &&
        s.currentPlayerId === game.localSeat &&
        s.players[game.localSeat].techs.includes("atomic_theory");
      if (armed) {
        const best = runs.slice().sort((a, b) => runCost(s, a, city) - runCost(s, b, city))[0];
        return (
          <Panel title={`${city.name}${city.isCapital ? " (capital)" : ""} — level ${city.level}`}>
            <div className="text-xs text-white/60">
              Enemy city. The nuke levels it and the eight tiles around it — forever. Only one will ever
              fly, and only a Bomber can carry it.
            </div>
            {best ? (
              <div className="mt-2">
                <NukeButton action={best} cityName={city.name} />
              </div>
            ) : (
              <div className="mt-2 text-xs text-amber-300">
                Needs a Bomber with its strike unspent, within {NUKE_DELIVERY_RANGE} tiles of a city
                you can see right now.
              </div>
            )}
          </Panel>
        );
      }
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
      (a) => (a.type === "HARVEST" || a.type === "BUILD" || a.type === "BOMBARD") && a.x === x && a.y === y,
    );
    if (tileActs.length > 0 || tile.resource || tile.building) {
      const tower = tile.building === "naval_tower";
      const fired = tower && tile.firedTurn === s.turn;
      return (
        <Panel title={describeTile(tile)}>
          {tower && (
            <div className="text-xs text-white/60">
              {fired
                ? "The guns have fired this turn — they reload by your next one."
                : `Shells enemy ships up to ${NAVAL_TOWER_RANGE} tiles out, once a turn. Tap a ship in range to fire.`}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            {tileActs.length === 0 && !tower && (
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

/**
 * How much a nuke run costs the player who flies it, for picking between the
 * bombers that could make it. Anything inside the ring dies with the city, so a
 * plane that can stand off is always the better one to send; nearer is better
 * only among the ones that come home.
 */
function runCost(s: GameState, a: Action, city: City): number {
  const bomber = a.type === "LAUNCH_NUKE" ? unitById(s, a.unitId) : undefined;
  if (!bomber) return Infinity;
  const away = dist(s, bomber.x, bomber.y, city.x, city.y);
  return away <= 1 ? 100 : away;
}

/** Launching the one nuke is irreversible, so the button asks twice. */
function NukeButton({ action, cityName }: { action: Action; cityName: string }) {
  const game = useGame();
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        className="rounded bg-amber-600 px-3 py-1.5 text-sm font-semibold hover:bg-amber-500"
        onClick={() => setArmed(true)}
      >
        ☢ Launch Nuke
      </button>
    );
  }
  return (
    <button
      className="animate-pulse rounded bg-red-600 px-3 py-1.5 text-sm font-bold hover:bg-red-500"
      onClick={() => game.dispatch(action)}
    >
      Confirm: destroy {cityName}?
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
    case "BUILD": {
      const def = BUILDING_DEFS[a.building];
      return `${def.name} (⭐${def.cost})`;
    }
    case "BOMBARD": {
      const target = unitById(s, a.targetId);
      const mode = target?.embarked === "ship" ? "Ship" : "Raft";
      return `💥 Fire on ${mode}`;
    }
    case "FOUND_CITY":
      return `🏙 Found town (⭐${FOUND_CITY_COST})`;
    case "BUILD_IMPROVEMENT": {
      const def = CITY_IMPROVEMENTS[a.improvement];
      return `${def.name} (⭐${def.cost})`;
    }
    case "TRAIN":
      return `${UNITS[a.unitType as UnitType].name} (⭐${UNITS[a.unitType as UnitType].cost})`;
    case "LAUNCH_NUKE":
      return "☢ Launch Nuke";
    case "LAUNCH":
      return "🚀 Launch to orbit";
    default:
      return a.type;
  }
}

function describeTile(tile: Tile): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  let title = cap(tile.terrain);
  if (tile.resource) title += ` · ${cap(tile.resource)}`;
  else if (tile.tilled && tile.building === null) title += " · Tilled";
  if (tile.building) title += ` · ${BUILDING_DEFS[tile.building].name}`;
  return title;
}
