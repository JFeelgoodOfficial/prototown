import type { TerrainType } from "../engine/state";

export interface TerrainDef {
  name: string;
  /** movement cost in move points; Infinity = impassable for land units */
  moveCost: number;
  /** entering this tile ends the unit's movement */
  stopsMovement: boolean;
  /** tech required for land units to enter */
  requiresTech: string | null;
  /** grants the 1.5x defence bonus once the matching tech is known */
  defenceTech: string | null;
  water: boolean;
}

export const TERRAIN: Record<TerrainType, TerrainDef> = {
  field: { name: "Field", moveCost: 1, stopsMovement: false, requiresTech: null, defenceTech: null, water: false },
  forest: { name: "Forest", moveCost: 1, stopsMovement: true, requiresTech: null, defenceTech: "archery", water: false },
  mountain: { name: "Mountain", moveCost: 1, stopsMovement: true, requiresTech: "climbing", defenceTech: "meditation", water: false },
  water: { name: "Water", moveCost: 1, stopsMovement: false, requiresTech: null, defenceTech: "aquatism", water: true },
  ocean: { name: "Ocean", moveCost: 1, stopsMovement: false, requiresTech: null, defenceTech: "aquatism", water: true },
};
