import type { BuildingType } from "../engine/state";

export type UnitType =
  | "warrior"
  | "rider"
  | "archer"
  | "defender"
  | "swordsman"
  | "catapult"
  | "knight"
  | "missile"
  | "medic"
  | "scout_plane"
  | "bomber"
  | "giant";

export interface UnitDef {
  name: string;
  atk: number;
  def: number;
  mov: number;
  hp: number;
  range: number;
  cost: number;
  /** tech id required to train, null = always available (or reward-only) */
  tech: string | null;
  /** reward-only units cannot be trained with stars */
  trainable: boolean;
  /** trainable only in a city whose territory holds this building */
  requiresBuilding: BuildingType | null;
  /** flies: crosses any terrain, ignores zones of control, cannot hold ground */
  air: boolean;
  /** how far it sees, when that beats the ground it is standing on */
  sight: number;
  /** strikes from above: the defender's terrain and walls count for nothing */
  ignoresCover: boolean;
}

/** Everything a plain foot unit is, so each entry below states only what differs. */
const FOOT = { requiresBuilding: null, air: false, sight: 1, ignoresCover: false } as const;

export const UNITS: Record<UnitType, UnitDef> = {
  warrior: { name: "Warrior", atk: 2, def: 2, mov: 1, hp: 10, range: 1, cost: 2, tech: null, trainable: true, ...FOOT },
  rider: { name: "Rider", atk: 2, def: 1, mov: 2, hp: 10, range: 1, cost: 3, tech: "riding", trainable: true, ...FOOT },
  archer: { name: "Archer", atk: 2, def: 1, mov: 1, hp: 10, range: 2, cost: 3, tech: "archery", trainable: true, ...FOOT },
  defender: { name: "Defender", atk: 1, def: 3, mov: 1, hp: 15, range: 1, cost: 3, tech: "shields", trainable: true, ...FOOT },
  swordsman: { name: "Swordsman", atk: 3, def: 3, mov: 1, hp: 15, range: 1, cost: 5, tech: "smithery", trainable: true, ...FOOT },
  catapult: { name: "Catapult", atk: 4, def: 0, mov: 1, hp: 10, range: 3, cost: 8, tech: "mathematics", trainable: true, ...FOOT },
  knight: { name: "Knight", atk: 4, def: 1, mov: 3, hp: 15, range: 1, cost: 8, tech: "chivalry", trainable: true, ...FOOT },
  missile: { name: "Missile Launcher", atk: 5, def: 0, mov: 1, hp: 10, range: 5, cost: 12, tech: "rocketry", trainable: true, ...FOOT },
  // Field medicine: carries no weapon, and mends whoever it is standing beside.
  medic: { name: "Medic", atk: 0, def: 2, mov: 2, hp: 10, range: 0, cost: 4, tech: "medicine", trainable: true, ...FOOT, requiresBuilding: "hospital" },
  // Aircraft: they fly over mountains, forests and open sea alike.
  scout_plane: { name: "Scout Plane", atk: 0, def: 1, mov: 4, hp: 10, range: 0, cost: 6, tech: "flight", trainable: true, ...FOOT, requiresBuilding: "airfield", air: true, sight: 3 },
  bomber: { name: "Bomber", atk: 5, def: 1, mov: 3, hp: 15, range: 1, cost: 12, tech: "flight", trainable: true, ...FOOT, requiresBuilding: "airfield", air: true, sight: 2, ignoresCover: true },
  giant: { name: "Giant", atk: 5, def: 4, mov: 1, hp: 40, range: 1, cost: 10, tech: null, trainable: false, ...FOOT },
};

/** Whether this unit flies. The one question the rules ask about aircraft. */
export function isAir(type: UnitType): boolean {
  return UNITS[type].air;
}

/** Stats used while a unit is embarked on water. HP is carried over. */
export const NAVAL: Record<"raft" | "ship", { name: string; atk: number; def: number; mov: number; range: number; upgradeCost: number }> = {
  raft: { name: "Raft", atk: 1, def: 1, mov: 2, range: 2, upgradeCost: 0 },
  ship: { name: "Ship", atk: 2, def: 2, mov: 3, range: 2, upgradeCost: 5 },
};

/** Stats while a unit rides a capsule between launch and landing: inert cargo. */
export const ORBIT: { name: string; atk: number; def: number; mov: number; range: number } = {
  name: "In Orbit",
  atk: 0,
  def: 0,
  mov: 0,
  range: 0,
};
