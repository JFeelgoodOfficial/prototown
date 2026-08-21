import { controller } from "../game/controller";
import { unitAt, isPlayable } from "../engine/state";

/**
 * What a tap on a tile means, shared by the flat board and the globe:
 * move or attack with the selection if legal, otherwise select what's there.
 */
export function handleBoardClick([x, y]: [number, number]): void {
  const s = controller.state;
  if (!s || controller.aiBusy || !isPlayable(s, x, y)) return;
  if (controller.legal.some((a) => a.type === "CHOOSE_REWARD")) return; // modal open

  // A selected Naval Tower fires by tapping the vessel it should shell, the
  // same gesture as attacking with a unit.
  const tower = controller.selectedTile;
  if (tower) {
    const target = unitAt(s, x, y);
    const shot = target
      ? controller.legal.find(
          (a) => a.type === "BOMBARD" && a.x === tower[0] && a.y === tower[1] && a.targetId === target.id,
        )
      : undefined;
    if (shot) {
      controller.dispatch(shot);
      controller.selectTile(tower);
      return;
    }
  }

  const selected = controller.selectedUnitId;
  if (selected !== null) {
    const move = controller.legal.find((a) => a.type === "MOVE" && a.unitId === selected && a.x === x && a.y === y);
    if (move) {
      controller.dispatch(move);
      return;
    }
    const land = controller.legal.find((a) => a.type === "LAND" && a.unitId === selected && a.x === x && a.y === y);
    if (land) {
      controller.dispatch(land);
      return;
    }
    const targetUnit = unitAt(s, x, y);
    if (targetUnit) {
      const attack = controller.legal.find(
        (a) => a.type === "ATTACK" && a.unitId === selected && a.targetId === targetUnit.id,
      );
      if (attack) {
        controller.dispatch(attack);
        return;
      }
    }
  }

  const unit = unitAt(s, x, y);
  if (unit && unit.ownerId === controller.localSeat) {
    controller.selectUnit(unit.id === selected ? null : unit.id);
    return;
  }
  controller.selectTile([x, y]);
}
