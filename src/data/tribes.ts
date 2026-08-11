export interface TribeDef {
  id: string;
  name: string;
  /** primary / secondary colors used for territory, units, UI */
  color: string;
  colorDark: string;
  /** cosmetic: two-word identity used on the tribe picker */
  tagline: string;
  startingTech: string;
  /** terrain generation biases applied near this tribe's capital */
  forestBias: number;
  mountainBias: number;
  waterBias: number;
  cityNames: string[];
  /** what this tribe actually plays like — one rule each, shown on the picker */
  ability: TribeAbility;
}

export interface TribeAbility {
  name: string;
  description: string;
  /** multiplies damage this tribe deals when attacking */
  damageMultiplier: number;
  /** extra movement for embarked units */
  navalMoveBonus: number;
  /** extra stars per turn, on top of city income */
  incomeBonus: number;
  /** climbs mountains without researching Climbing */
  freeClimbing: boolean;
}

const NO_ABILITY: Omit<TribeAbility, "name" | "description"> = {
  damageMultiplier: 1,
  navalMoveBonus: 0,
  incomeBonus: 0,
  freeClimbing: false,
};

export const TRIBES: TribeDef[] = [
  {
    id: "ashfen",
    name: "Ashfen",
    color: "#e05c4b",
    colorDark: "#8f3527",
    tagline: "Ember & kiln",
    startingTech: "hunting",
    forestBias: 1.5,
    mountainBias: 1,
    waterBias: 0.8,
    cityNames: ["Emberhold", "Cindral", "Ashmoor", "Pyrewatch", "Duskfen", "Smolder", "Kilnrest", "Sootvale"],
    ability: {
      ...NO_ABILITY,
      name: "Forgefire",
      description: "Attacks deal 25% more damage.",
      damageMultiplier: 1.25,
    },
  },
  {
    id: "korvani",
    name: "Korvani",
    color: "#4b8fe0",
    colorDark: "#2b5c9e",
    tagline: "Tide & salt",
    startingTech: "fishing",
    forestBias: 0.7,
    mountainBias: 0.8,
    waterBias: 1.6,
    cityNames: ["Tidemark", "Korvspire", "Saltholm", "Wavecrest", "Brinehal", "Deepmoor", "Gullport", "Foamreach"],
    ability: {
      ...NO_ABILITY,
      name: "Tidebound",
      description: "Boats move one tile further.",
      navalMoveBonus: 1,
    },
  },
  {
    id: "meridia",
    name: "Meridia",
    color: "#e0b84b",
    colorDark: "#9e7d27",
    tagline: "Sun & order",
    startingTech: "organization",
    forestBias: 0.8,
    mountainBias: 0.9,
    waterBias: 0.9,
    cityNames: ["Solmere", "Aurelia", "Goldfield", "Meridian", "Suncrest", "Harvestal", "Lumenvale", "Dawnhold"],
    ability: {
      ...NO_ABILITY,
      name: "Suntithe",
      description: "Earns one extra star every turn.",
      incomeBonus: 1,
    },
  },
  {
    id: "thornwood",
    name: "Thornwood",
    color: "#5cb85c",
    colorDark: "#357a35",
    tagline: "Bramble & stone",
    startingTech: "climbing",
    forestBias: 1.2,
    mountainBias: 1.5,
    waterBias: 0.7,
    cityNames: ["Bramblekeep", "Thornspire", "Rootholm", "Mossgard", "Fernhollow", "Oakenreach", "Greenwarden", "Wildmere"],
    ability: {
      ...NO_ABILITY,
      name: "Surefoot",
      description: "Crosses mountains without Climbing.",
      freeClimbing: true,
    },
  },
];

export function tribeById(id: string): TribeDef {
  const t = TRIBES.find((t) => t.id === id);
  if (!t) throw new Error(`unknown tribe ${id}`);
  return t;
}
