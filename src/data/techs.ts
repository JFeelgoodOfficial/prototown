export interface TechDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  requires: string | null;
  blurb: string;
}

/**
 * Five-branch tech tree, three tiers per branch, matching the reference
 * game's classic layout. Names are our own generic terms.
 */
export const TECHS: TechDef[] = [
  // Riding branch
  { id: "riding", name: "Riding", tier: 1, requires: null, blurb: "Train Riders." },
  { id: "roads", name: "Roads", tier: 2, requires: "riding", blurb: "Trade routes (score)." },
  { id: "free_spirit", name: "Free Spirit", tier: 2, requires: "riding", blurb: "Disband units." },
  { id: "trade", name: "Trade", tier: 3, requires: "roads", blurb: "Wealth (score)." },
  { id: "chivalry", name: "Chivalry", tier: 3, requires: "free_spirit", blurb: "Train Knights." },

  // Organization branch
  { id: "organization", name: "Organization", tier: 1, requires: null, blurb: "Harvest fruit." },
  { id: "farming", name: "Farming", tier: 2, requires: "organization", blurb: "Build farms." },
  { id: "shields", name: "Shields", tier: 2, requires: "organization", blurb: "Train Defenders." },
  { id: "construction", name: "Construction", tier: 3, requires: "farming", blurb: "Grand works (score)." },
  { id: "strategy", name: "Strategy", tier: 3, requires: "shields", blurb: "Discipline (score)." },

  // Climbing branch
  { id: "climbing", name: "Climbing", tier: 1, requires: null, blurb: "Cross mountains." },
  { id: "mining", name: "Mining", tier: 2, requires: "climbing", blurb: "Build mines." },
  { id: "meditation", name: "Meditation", tier: 2, requires: "climbing", blurb: "Mountain defence bonus." },
  { id: "smithery", name: "Smithery", tier: 3, requires: "mining", blurb: "Train Swordsmen." },
  { id: "philosophy", name: "Philosophy", tier: 3, requires: "meditation", blurb: "Enlightenment (score)." },

  // Fishing branch
  { id: "fishing", name: "Fishing", tier: 1, requires: null, blurb: "Harvest fish." },
  { id: "sailing", name: "Sailing", tier: 2, requires: "fishing", blurb: "Build ports, upgrade Ships." },
  { id: "whaling", name: "Whaling", tier: 2, requires: "fishing", blurb: "Bounty of the sea (score)." },
  { id: "navigation", name: "Navigation", tier: 3, requires: "sailing", blurb: "Cross deep ocean." },
  { id: "aquatism", name: "Aquatism", tier: 3, requires: "whaling", blurb: "Water defence bonus." },

  // Hunting branch
  { id: "hunting", name: "Hunting", tier: 1, requires: null, blurb: "Harvest animals." },
  { id: "archery", name: "Archery", tier: 2, requires: "hunting", blurb: "Train Archers, forest defence." },
  { id: "forestry", name: "Forestry", tier: 2, requires: "hunting", blurb: "Build lumber huts." },
  { id: "mathematics", name: "Mathematics", tier: 3, requires: "forestry", blurb: "Train Catapults." },
  { id: "spiritualism", name: "Spiritualism", tier: 3, requires: "archery", blurb: "Harmony (score)." },
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/**
 * Research cost. Mirrors the reference implementation: cost scales with
 * tier and the number of cities you own.
 */
export function techCost(techId: string, numCities: number): number {
  const t = TECH_BY_ID[techId];
  if (!t) throw new Error(`unknown tech ${techId}`);
  return t.tier * numCities + 4;
}
