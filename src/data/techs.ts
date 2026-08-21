import { PHILOSOPHY_DISCOUNT } from "./constants";
import type { MapType } from "../engine/state";

export interface TechDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  requires: string | null;
  /** id of the tier-1 tech this one hangs off; the column it is drawn in */
  branch: string;
  blurb: string;
}

/**
 * Five-branch tech tree laid out like the reference game's classic tree, with
 * a fourth tier of late-game branches (rockets, flight, medicine) hung off it.
 * Names are our own generic terms.
 */
export const TECHS: TechDef[] = [
  // Riding branch
  { id: "riding", name: "Riding", tier: 1, requires: null, branch: "riding", blurb: "Train Riders." },
  { id: "roads", name: "Roads", tier: 2, requires: "riding", branch: "riding", blurb: "Move twice as far inside your borders." },
  { id: "free_spirit", name: "Free Spirit", tier: 2, requires: "riding", branch: "riding", blurb: "Disband units." },
  { id: "trade", name: "Trade", tier: 3, requires: "roads", branch: "riding", blurb: "+1 star per turn from every city." },
  { id: "chivalry", name: "Chivalry", tier: 3, requires: "free_spirit", branch: "riding", blurb: "Train Knights." },

  // Organization branch
  { id: "organization", name: "Organization", tier: 1, requires: null, branch: "organization", blurb: "Harvest fruit." },
  { id: "farming", name: "Farming", tier: 2, requires: "organization", branch: "organization", blurb: "Build farms." },
  { id: "shields", name: "Shields", tier: 2, requires: "organization", branch: "organization", blurb: "Train Defenders." },
  { id: "construction", name: "Construction", tier: 3, requires: "farming", branch: "organization", blurb: "Build City Walls (⭐8)." },
  { id: "strategy", name: "Strategy", tier: 3, requires: "shields", branch: "organization", blurb: "Every city supports one more unit." },
  { id: "medicine", name: "Medicine", tier: 3, requires: "farming", branch: "organization", blurb: "Build Hospitals and train Medics." },

  // Climbing branch
  { id: "climbing", name: "Climbing", tier: 1, requires: null, branch: "climbing", blurb: "Cross mountains." },
  { id: "mining", name: "Mining", tier: 2, requires: "climbing", branch: "climbing", blurb: "Build mines." },
  { id: "meditation", name: "Meditation", tier: 2, requires: "climbing", branch: "climbing", blurb: "Mountain defence bonus." },
  { id: "smithery", name: "Smithery", tier: 3, requires: "mining", branch: "climbing", blurb: "Train Swordsmen." },
  { id: "philosophy", name: "Philosophy", tier: 3, requires: "meditation", branch: "climbing", blurb: "All further research costs a fifth less." },

  // Fishing branch
  { id: "fishing", name: "Fishing", tier: 1, requires: null, branch: "fishing", blurb: "Harvest fish." },
  { id: "sailing", name: "Sailing", tier: 2, requires: "fishing", branch: "fishing", blurb: "Build ports, upgrade Ships." },
  { id: "whaling", name: "Whaling", tier: 2, requires: "fishing", branch: "fishing", blurb: "Harvest whales for stars." },
  { id: "navigation", name: "Navigation", tier: 3, requires: "sailing", branch: "fishing", blurb: "Cross deep ocean." },
  { id: "aquatism", name: "Aquatism", tier: 3, requires: "whaling", branch: "fishing", blurb: "Water defence bonus." },
  { id: "coastal_defence", name: "Coastal Defence", tier: 3, requires: "sailing", branch: "fishing", blurb: "Build Naval Towers — shore guns that shell ships four tiles out." },

  // Hunting branch
  { id: "hunting", name: "Hunting", tier: 1, requires: null, branch: "hunting", blurb: "Harvest animals." },
  { id: "archery", name: "Archery", tier: 2, requires: "hunting", branch: "hunting", blurb: "Train Archers, forest defence." },
  { id: "forestry", name: "Forestry", tier: 2, requires: "hunting", branch: "hunting", blurb: "Build lumber huts." },
  { id: "mathematics", name: "Mathematics", tier: 3, requires: "forestry", branch: "hunting", blurb: "Train Catapults." },
  { id: "spiritualism", name: "Spiritualism", tier: 3, requires: "archery", branch: "hunting", blurb: "Build Grand Parks (⭐12)." },
  { id: "rocketry", name: "Rocketry", tier: 4, requires: "mathematics", branch: "hunting", blurb: "Train Missile Launchers." },
  { id: "atomic_theory", name: "Atomic Theory", tier: 4, requires: "rocketry", branch: "hunting", blurb: "Arm one nuke — flown by a Bomber, once per game, for everyone." },
  { id: "space_travel", name: "Space Travel", tier: 4, requires: "rocketry", branch: "hunting", blurb: "Build Spaceports and Space Stations — reach the twin world." },
  { id: "flight", name: "Flight", tier: 4, requires: "mathematics", branch: "hunting", blurb: "Build Airfields — train Scout Planes and Bombers." },
  { id: "air_defence", name: "Air Defence", tier: 4, requires: "flight", branch: "hunting", blurb: "Build Flak Towers — they fire on enemy aircraft that stray near." },
  { id: "incendiaries", name: "Incendiaries", tier: 4, requires: "flight", branch: "hunting", blurb: "Bombers fly firestorm runs — four tiles of fire that burn for two turns." },
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/**
 * Whether a tech exists on this map shape. Space Travel is pointless with
 * nowhere to fly to, so it is offered — by research and by ruins — only on
 * twin-globe maps.
 */
export function techAvailable(mapType: MapType, techId: string): boolean {
  return techId !== "space_travel" || mapType === "twin_globes";
}

/**
 * Research cost. Mirrors the reference implementation: cost scales with
 * tier and the number of cities you own, then Philosophy takes a fifth off.
 *
 * `discounted` is deliberately required rather than defaulted: the price shown
 * in the tech tree, the price checked for affordability, and the price actually
 * charged are computed at three separate call sites, and a default is how those
 * three quietly drift apart.
 */
export function techCost(techId: string, numCities: number, discounted: boolean): number {
  const t = TECH_BY_ID[techId];
  if (!t) throw new Error(`unknown tech ${techId}`);
  const base = t.tier * numCities + 4;
  return discounted ? Math.max(1, Math.ceil(base * PHILOSOPHY_DISCOUNT)) : base;
}
