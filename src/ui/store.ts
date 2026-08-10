import { useSyncExternalStore } from "react";
import { controller } from "../game/controller";

/** Re-renders the component whenever the game controller changes. */
export function useGame(): typeof controller {
  useSyncExternalStore(controller.subscribe, controller.getVersion);
  return controller;
}
