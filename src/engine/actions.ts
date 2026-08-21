import type { UnitType } from "../data/units";
import type { CityImprovement } from "../data/constants";
import type { BuildingType } from "./state";

export type Action =
  | { type: "MOVE"; unitId: number; x: number; y: number }
  | { type: "ATTACK"; unitId: number; targetId: number }
  | { type: "CAPTURE"; unitId: number }
  | { type: "RECOVER"; unitId: number }
  | { type: "FORTIFY"; unitId: number }
  | { type: "DISBAND"; unitId: number }
  | { type: "UPGRADE_BOAT"; unitId: number }
  | { type: "LAUNCH"; unitId: number }
  | { type: "LAND"; unitId: number; x: number; y: number }
  | { type: "HARVEST"; x: number; y: number }
  | { type: "BUILD"; x: number; y: number; building: BuildingType }
  | { type: "TRAIN"; cityId: number; unitType: UnitType }
  | { type: "BUILD_IMPROVEMENT"; cityId: number; improvement: CityImprovement }
  | { type: "RESEARCH"; techId: string }
  | { type: "BOMBARD"; x: number; y: number; targetId: number }
  | { type: "FOUND_CITY"; unitId: number }
  | { type: "LAUNCH_NUKE"; unitId: number; cityId: number }
  /** Bomber incendiary run: (x, y) is the first tile of the line it burns. */
  | { type: "FIRESTORM"; unitId: number; x: number; y: number }
  | { type: "CHOOSE_REWARD"; cityId: number; reward: string }
  | { type: "END_TURN" };

export function actionKey(a: Action): string {
  return JSON.stringify(a);
}
