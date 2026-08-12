export type UnitType =
  | "warrior"
  | "rider"
  | "archer"
  | "defender"
  | "swordsman"
  | "catapult"
  | "knight"
  | "missile"
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
}

export const UNITS: Record<UnitType, UnitDef> = {
  warrior: { name: "Warrior", atk: 2, def: 2, mov: 1, hp: 10, range: 1, cost: 2, tech: null, trainable: true },
  rider: { name: "Rider", atk: 2, def: 1, mov: 2, hp: 10, range: 1, cost: 3, tech: "riding", trainable: true },
  archer: { name: "Archer", atk: 2, def: 1, mov: 1, hp: 10, range: 2, cost: 3, tech: "archery", trainable: true },
  defender: { name: "Defender", atk: 1, def: 3, mov: 1, hp: 15, range: 1, cost: 3, tech: "shields", trainable: true },
  swordsman: { name: "Swordsman", atk: 3, def: 3, mov: 1, hp: 15, range: 1, cost: 5, tech: "smithery", trainable: true },
  catapult: { name: "Catapult", atk: 4, def: 0, mov: 1, hp: 10, range: 3, cost: 8, tech: "mathematics", trainable: true },
  knight: { name: "Knight", atk: 4, def: 1, mov: 3, hp: 15, range: 1, cost: 8, tech: "chivalry", trainable: true },
  missile: { name: "Missile Launcher", atk: 5, def: 0, mov: 1, hp: 10, range: 5, cost: 12, tech: "rocketry", trainable: true },
  giant: { name: "Giant", atk: 5, def: 4, mov: 1, hp: 40, range: 1, cost: 10, tech: null, trainable: false },
};

/** Stats used while a unit is embarked on water. HP is carried over. */
export const NAVAL: Record<"raft" | "ship", { name: string; atk: number; def: number; mov: number; range: number; upgradeCost: number }> = {
  raft: { name: "Raft", atk: 1, def: 1, mov: 2, range: 2, upgradeCost: 0 },
  ship: { name: "Ship", atk: 2, def: 2, mov: 3, range: 2, upgradeCost: 5 },
};
