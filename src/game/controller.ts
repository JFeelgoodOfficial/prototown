import type { GameState } from "../engine/state";
import { unitById, playerById } from "../engine/state";
import type { Action } from "../engine/actions";
import { applyAction } from "../engine/reducer";
import { computeLegalActions } from "../engine/legalActions";
import { newGame, type NewGameOptions } from "../engine/mapgen";
import { HeuristicAgent } from "../ai/heuristicAgent";
import type { AiAgent } from "../ai/agent";
import { saveGame, loadGame, clearSave } from "./persistence";

export type Screen = "menu" | "game" | "gameover";

export interface FloatEffect {
  x: number;
  y: number;
  text: string;
  color: string;
  bornAt: number;
}

export const HUMAN_ID = 0;
const AI_STEP_MS = 140;
const AI_ACTION_CAP = 250;

export type Difficulty = "relaxed" | "normal" | "hard";
const DIFFICULTY_AGGRESSION: Record<Difficulty, number> = {
  relaxed: 0.6,
  normal: 1,
  hard: 1.5,
};

class GameController {
  state: GameState | null = null;
  screen: Screen = "menu";
  selectedUnitId: number | null = null;
  selectedTile: [number, number] | null = null;
  legal: Action[] = [];
  floats: FloatEffect[] = [];
  aiBusy = false;
  revealAll = false;
  /** Timestamp of the last successful autosave, for the "Saved" indicator. */
  lastSavedAt: number | null = null;

  private aggression = DIFFICULTY_AGGRESSION.normal;
  private agents = new Map<number, AiAgent>();
  private version = 0;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  startNewGame(opts: NewGameOptions, difficulty: Difficulty): void {
    this.state = newGame(opts);
    this.agents.clear();
    this.aggression = DIFFICULTY_AGGRESSION[difficulty];
    for (const p of this.state.players) {
      if (!p.isHuman) this.agents.set(p.id, new HeuristicAgent({ aggression: this.aggression }));
    }
    this.screen = "game";
    this.selectedUnitId = null;
    this.selectedTile = null;
    this.floats = [];
    this.refreshLegal();
    this.persist();
    this.notify();
  }

  continueGame(): boolean {
    const loaded = loadGame();
    if (!loaded) return false;
    this.state = loaded.state;
    this.agents.clear();
    this.aggression = loaded.aggression;
    for (const p of this.state.players) {
      if (!p.isHuman) this.agents.set(p.id, new HeuristicAgent({ aggression: this.aggression }));
    }
    this.screen = this.state.winnerId !== null ? "gameover" : "game";
    this.refreshLegal();
    this.notify();
    if (this.state.currentPlayerId !== HUMAN_ID && this.state.winnerId === null) {
      void this.runAiTurns();
    }
    return true;
  }

  backToMenu(): void {
    this.screen = "menu";
    this.notify();
  }

  /** Return to an in-memory game after visiting the menu. */
  resumeCurrent(): void {
    if (!this.state) return;
    this.screen = this.state.winnerId !== null ? "gameover" : "game";
    this.refreshLegal();
    this.notify();
    if (this.state.currentPlayerId !== HUMAN_ID && this.state.winnerId === null) {
      void this.runAiTurns();
    }
  }

  abandonGame(): void {
    clearSave();
    this.state = null;
    this.lastSavedAt = null;
    this.screen = "menu";
    this.notify();
  }

  /** Write the current game to storage, recording when it happened. */
  private persist(): void {
    if (!this.state) return;
    if (saveGame(this.state, this.aggression)) this.lastSavedAt = Date.now();
  }

  /** Flush a save outside the normal action flow (tab hidden, page unloading). */
  saveNow(): void {
    if (!this.state || this.state.winnerId !== null) return;
    this.persist();
  }

  /** Dispatch a human action. */
  dispatch(action: Action): void {
    if (!this.state || this.aiBusy || this.state.currentPlayerId !== HUMAN_ID) return;
    this.applyWithEffects(action);
    this.selectedTile = null;
    if (action.type !== "MOVE") this.selectedUnitId = null;
    else this.selectedUnitId = action.unitId;
    this.refreshLegal();
    if (this.state.winnerId !== null) {
      this.screen = "gameover";
      clearSave();
    } else {
      this.persist();
    }
    this.notify();
    if (this.state.currentPlayerId !== HUMAN_ID && this.state.winnerId === null) {
      void this.runAiTurns();
    }
  }

  selectUnit(id: number | null): void {
    this.selectedUnitId = id;
    this.selectedTile = null;
    this.notify();
  }

  selectTile(xy: [number, number] | null): void {
    this.selectedTile = xy;
    this.selectedUnitId = null;
    this.notify();
  }

  toggleReveal(): void {
    this.revealAll = !this.revealAll;
    this.notify();
  }

  private refreshLegal(): void {
    this.legal = this.state ? computeLegalActions(this.state, HUMAN_ID) : [];
  }

  private applyWithEffects(action: Action): void {
    if (!this.state) return;
    if (action.type === "ATTACK") {
      const target = unitById(this.state, action.targetId);
      const attacker = unitById(this.state, action.unitId);
      const next = applyAction(this.state, action);
      const targetAfter = unitById(next, action.targetId);
      const attackerAfter = unitById(next, action.unitId);
      if (target) {
        const dmg = target.hp - (targetAfter?.hp ?? 0);
        this.addFloat(target.x, target.y, targetAfter ? `-${dmg}` : "☠", "#ff6655");
      }
      if (attacker && attacker.hp !== (attackerAfter?.hp ?? attacker.hp)) {
        const dmg = attacker.hp - (attackerAfter?.hp ?? 0);
        this.addFloat(attacker.x, attacker.y, attackerAfter ? `-${dmg}` : "☠", "#ffaa44");
      }
      this.state = next;
    } else if (action.type === "RECOVER") {
      const unit = unitById(this.state, action.unitId);
      const next = applyAction(this.state, action);
      const after = unitById(next, action.unitId);
      if (unit && after) this.addFloat(unit.x, unit.y, `+${after.hp - unit.hp}`, "#66dd66");
      this.state = next;
    } else {
      this.state = applyAction(this.state, action);
    }
  }

  private addFloat(x: number, y: number, text: string, color: string): void {
    this.floats.push({ x, y, text, color, bornAt: performance.now() });
    if (this.floats.length > 40) this.floats.splice(0, this.floats.length - 40);
  }

  /** Run AI players until control returns to the human (or the game ends). */
  private async runAiTurns(): Promise<void> {
    if (!this.state || this.aiBusy) return;
    this.aiBusy = true;
    this.notify();
    try {
      let guard = 0;
      while (
        this.state &&
        this.state.winnerId === null &&
        this.state.currentPlayerId !== HUMAN_ID &&
        guard < AI_ACTION_CAP * 4
      ) {
        guard++;
        const pid = this.state.currentPlayerId;
        const agent = this.agents.get(pid);
        if (!agent || !playerById(this.state, pid).alive) {
          this.applyWithEffects({ type: "END_TURN" });
          this.notify();
          continue;
        }
        let actionsThisTurn = 0;
        while (
          this.state.currentPlayerId === pid &&
          this.state.winnerId === null &&
          actionsThisTurn < AI_ACTION_CAP
        ) {
          const action = actionsThisTurn === AI_ACTION_CAP - 1 ? ({ type: "END_TURN" } as Action) : agent.chooseAction(this.state, pid);
          const visible = this.isActionVisible(action);
          this.applyWithEffects(action);
          actionsThisTurn++;
          this.notify();
          if (visible) await sleep(AI_STEP_MS);
        }
        if (this.state.currentPlayerId === pid && this.state.winnerId === null) {
          this.applyWithEffects({ type: "END_TURN" });
          this.notify();
        }
      }
    } finally {
      this.aiBusy = false;
      this.refreshLegal();
      if (this.state) {
        if (this.state.winnerId !== null) {
          this.screen = "gameover";
          clearSave();
        } else {
          this.persist();
        }
      }
      this.notify();
    }
  }

  /** Only pause for AI actions the human can actually see. */
  private isActionVisible(action: Action): boolean {
    if (!this.state) return false;
    const human = playerById(this.state, HUMAN_ID);
    const seen = (x: number, y: number) => human.explored[y * this.state!.size + x] === 1;
    switch (action.type) {
      case "MOVE":
        return seen(action.x, action.y);
      case "ATTACK": {
        const t = unitById(this.state, action.targetId);
        return t ? seen(t.x, t.y) : false;
      }
      case "CAPTURE":
      case "RECOVER": {
        const u = unitById(this.state, action.unitId);
        return u ? seen(u.x, u.y) : false;
      }
      default:
        return false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const controller = new GameController();

// handle for E2E tests and console debugging
declare global {
  interface Window {
    __pf?: GameController;
  }
}
if (typeof window !== "undefined") {
  window.__pf = controller;
  // Mobile browsers can discard a backgrounded tab without warning; flush then.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) controller.saveNow();
  });
  window.addEventListener("pagehide", () => controller.saveNow());
}
