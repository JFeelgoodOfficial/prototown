import type { GameState } from "../engine/state";
import { unitById, playerById, unitsOf } from "../engine/state";
import type { Action } from "../engine/actions";
import { applyAction } from "../engine/reducer";
import { computeLegalActions } from "../engine/legalActions";
import { newGame, type NewGameOptions } from "../engine/mapgen";
import { HeuristicAgent } from "../ai/heuristicAgent";
import type { AiPersonality } from "../ai/evaluate";
import type { AiAgent } from "../ai/agent";
import {
  saveGame,
  loadGame,
  clearSave,
  saveToSlot,
  loadFromSlot,
  clearSlot,
  exportSave,
  parseSave,
  type SavedGame,
} from "./persistence";
import { DIFFICULTY_PERSONALITY, type Difficulty } from "./difficulty";
import { playSound } from "./sound";
import type { OnlineConfig, OnlineSessionHandle } from "../net/types";

export type Screen = "menu" | "game" | "gameover";

export interface FloatEffect {
  x: number;
  y: number;
  text: string;
  color: string;
  bornAt: number;
}

/** A unit sliding from one tile to another, or flinching from a hit. */
export interface UnitAnim {
  unitId: number;
  kind: "move" | "hit";
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  bornAt: number;
  duration: number;
}

export const MOVE_ANIM_MS = 180;
export const HIT_ANIM_MS = 260;

const AI_STEP_MS = 140;
const AI_ACTION_CAP = 250;

export type { Difficulty };

export class GameController {
  state: GameState | null = null;
  screen: Screen = "menu";
  /** Engine player id this client plays as. Always 0 in local games. */
  localSeat = 0;
  mode: "local" | "online" = "local";
  /** Live network session when playing online; null in local games. */
  online: OnlineSessionHandle | null = null;
  onlineConfig: OnlineConfig | null = null;
  selectedUnitId: number | null = null;
  selectedTile: [number, number] | null = null;
  legal: Action[] = [];
  floats: FloatEffect[] = [];
  anims: UnitAnim[] = [];
  /** Tile the view should jump to, consumed by the map once applied. */
  focusRequest: [number, number] | null = null;
  aiBusy = false;
  revealAll = false;
  /** Timestamp of the last successful autosave, for the "Saved" indicator. */
  lastSavedAt: number | null = null;

  private difficulty: Difficulty = "normal";
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
    this.leaveOnline();
    this.state = newGame(opts);
    this.agents.clear();
    this.difficulty = difficulty;
    this.spawnAgents();
    this.screen = "game";
    this.selectedUnitId = null;
    this.selectedTile = null;
    this.floats = [];
    this.anims = [];
    this.refreshLegal();
    this.persist();
    this.notify();
  }

  /** Adopt a replayed network game as the live game and start playing it. */
  startOnlineGame(state: GameState, localSeat: number, config: OnlineConfig, session: OnlineSessionHandle): void {
    this.online?.detach();
    this.mode = "online";
    this.localSeat = localSeat;
    this.online = session;
    this.onlineConfig = config;
    this.state = state;
    this.difficulty = config.difficulty;
    this.spawnAgents();
    this.screen = state.winnerId !== null ? "gameover" : "game";
    this.selectedUnitId = null;
    this.selectedTile = null;
    this.floats = [];
    this.anims = [];
    this.refreshLegal();
    this.notify();
    this.maybePumpOnline();
  }

  /** Drop the network session and return to local single-player mode. */
  leaveOnline(): void {
    if (this.mode !== "online") return;
    this.online?.detach();
    this.online = null;
    this.onlineConfig = null;
    this.mode = "local";
    this.localSeat = 0;
    this.state = null;
    this.screen = "menu";
    if (typeof window !== "undefined" && window.location.hash.startsWith("#g/")) {
      window.location.hash = "";
    }
    this.notify();
  }

  /** Apply a move another client committed to the shared log. */
  applyRemoteAction(action: Action): void {
    if (!this.state || this.mode !== "online") return;
    this.applyWithEffects(action, this.isActionVisible(action));
    this.refreshLegal();
    if (this.state.winnerId !== null) this.screen = "gameover";
    this.notify();
  }

  /** Replace the state wholesale after a network resync. */
  resetOnlineState(state: GameState): void {
    if (this.mode !== "online") return;
    this.state = state;
    this.spawnAgents();
    this.selectedUnitId = null;
    this.selectedTile = null;
    this.floats = [];
    this.anims = [];
    this.refreshLegal();
    this.screen = state.winnerId !== null ? "gameover" : "game";
    this.notify();
  }

  /** Start the AI pump if the current online seat is one this client drives. */
  maybePumpOnline(): void {
    if (this.mode !== "online" || !this.state || this.state.winnerId !== null) return;
    const current = this.state.currentPlayerId;
    if (current !== this.localSeat && this.drivesSeat(current)) void this.runTurnPump();
  }

  /** Let the network session redraw status banners. */
  touch(): void {
    this.notify();
  }

  /**
   * One agent per AI player, all sharing the current difficulty's personality.
   * Online, every non-local seat gets an agent: a remote human's seat is never
   * pumped unless the server hands it to the AI (abandoned-turn takeover), and
   * then it must play like one.
   */
  private spawnAgents(): void {
    if (!this.state) return;
    const personality: AiPersonality = DIFFICULTY_PERSONALITY[this.difficulty];
    this.agents.clear();
    for (const p of this.state.players) {
      const needsAgent = this.mode === "online" ? p.id !== this.localSeat : !p.isHuman;
      if (needsAgent) this.agents.set(p.id, new HeuristicAgent(personality));
    }
  }

  continueGame(): boolean {
    const loaded = loadGame();
    return loaded ? this.adoptSave(loaded) : false;
  }

  backToMenu(): void {
    if (this.mode === "online") {
      // an online game lives on the server; leaving just closes this window on it
      this.leaveOnline();
      return;
    }
    this.screen = "menu";
    this.notify();
  }

  /** Return to an in-memory game after visiting the menu. */
  resumeCurrent(): void {
    if (!this.state) return;
    this.screen = this.state.winnerId !== null ? "gameover" : "game";
    this.refreshLegal();
    this.notify();
    if (this.state.currentPlayerId !== this.localSeat && this.state.winnerId === null) {
      void this.runTurnPump();
    }
  }

  abandonGame(): void {
    if (this.mode === "online") {
      this.leaveOnline();
      return;
    }
    clearSave();
    this.state = null;
    this.lastSavedAt = null;
    this.screen = "menu";
    this.notify();
  }

  /**
   * Write the current game to storage, recording when it happened. Online
   * games never touch the local autosave — the server log is the save.
   */
  private persist(): void {
    if (!this.state || this.mode === "online") return;
    if (saveGame(this.state, this.difficulty)) this.lastSavedAt = Date.now();
  }

  /** Flush a save outside the normal action flow (tab hidden, page unloading). */
  saveNow(): void {
    if (!this.state || this.state.winnerId !== null || this.mode === "online") return;
    this.persist();
  }

  /** Copy the current game into a named slot, so it survives the autosave. */
  saveToSlot(slot: number): boolean {
    if (!this.state) return false;
    const ok = saveToSlot(slot, this.state, this.difficulty);
    this.notify();
    return ok;
  }

  loadFromSlot(slot: number): boolean {
    const loaded = loadFromSlot(slot);
    return loaded ? this.adoptSave(loaded) : false;
  }

  clearSlot(slot: number): void {
    clearSlot(slot);
    this.notify();
  }

  /** Text of the current game, for moving it to another device. */
  exportCurrent(): string | null {
    return this.state ? exportSave(this.state, this.difficulty) : null;
  }

  /** Load a game from pasted or uploaded save text. */
  importSave(text: string): boolean {
    const loaded = parseSave(text);
    return loaded ? this.adoptSave(loaded) : false;
  }

  /** Take a loaded save as the live game and start playing it. */
  private adoptSave(loaded: SavedGame): boolean {
    this.leaveOnline();
    this.state = loaded.state;
    this.difficulty = loaded.difficulty;
    this.floats = [];
    this.anims = [];
    this.selectedUnitId = null;
    this.selectedTile = null;
    this.spawnAgents();
    this.screen = this.state.winnerId !== null ? "gameover" : "game";
    this.refreshLegal();
    this.persist();
    this.notify();
    if (this.state.currentPlayerId !== this.localSeat && this.state.winnerId === null) {
      void this.runTurnPump();
    }
    return true;
  }

  /** Dispatch an action taken by the local player. */
  dispatch(action: Action): void {
    if (!this.state || this.aiBusy || this.state.currentPlayerId !== this.localSeat) return;
    this.applyWithEffects(action);
    this.online?.onLocalAction(action);
    this.selectedTile = null;
    if (action.type !== "MOVE") this.selectedUnitId = null;
    else this.selectedUnitId = action.unitId;
    this.refreshLegal();
    if (this.state.winnerId !== null) {
      this.screen = "gameover";
      if (this.mode === "local") clearSave();
    } else {
      this.persist();
    }
    this.notify();
    if (this.state.currentPlayerId !== this.localSeat && this.state.winnerId === null && this.drivesSeat(this.state.currentPlayerId)) {
      void this.runTurnPump();
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
    this.legal = this.state ? computeLegalActions(this.state, this.localSeat) : [];
  }

  /**
   * Apply an action and stage its feedback. `perceived` is false for AI actions
   * happening inside fog: those must stay silent and invisible, or the player
   * hears and sees things they have not scouted.
   */
  private applyWithEffects(action: Action, perceived = true): void {
    if (!this.state) return;
    if (!perceived) {
      this.state = applyAction(this.state, action);
      return;
    }
    if (action.type === "ATTACK") {
      const target = unitById(this.state, action.targetId);
      const attacker = unitById(this.state, action.unitId);
      const next = applyAction(this.state, action);
      const targetAfter = unitById(next, action.targetId);
      const attackerAfter = unitById(next, action.unitId);
      if (target) {
        const dmg = target.hp - (targetAfter?.hp ?? 0);
        this.addFloat(target.x, target.y, targetAfter ? `-${dmg}` : "☠", "#ff6655");
        if (targetAfter) this.addHit(target.id, target.x, target.y);
      }
      if (attacker && attacker.hp !== (attackerAfter?.hp ?? attacker.hp)) {
        const dmg = attacker.hp - (attackerAfter?.hp ?? 0);
        this.addFloat(attacker.x, attacker.y, attackerAfter ? `-${dmg}` : "☠", "#ffaa44");
        if (attackerAfter) this.addHit(attacker.id, attacker.x, attacker.y);
      }
      // a melee attacker steps into the tile it just cleared
      if (attacker && attackerAfter && !targetAfter && (attackerAfter.x !== attacker.x || attackerAfter.y !== attacker.y)) {
        this.addMove(attacker.id, attacker.x, attacker.y, attackerAfter.x, attackerAfter.y);
      }
      playSound(targetAfter ? "attack" : "kill");
      this.state = next;
    } else if (action.type === "RECOVER") {
      const unit = unitById(this.state, action.unitId);
      const next = applyAction(this.state, action);
      const after = unitById(next, action.unitId);
      if (unit && after) this.addFloat(unit.x, unit.y, `+${after.hp - unit.hp}`, "#66dd66");
      this.state = next;
    } else if (action.type === "MOVE") {
      const unit = unitById(this.state, action.unitId);
      if (unit) this.addMove(unit.id, unit.x, unit.y, action.x, action.y);
      playSound("move");
      this.state = applyAction(this.state, action);
      const ruin = this.state.lastRuinReward;
      if (ruin) {
        this.addFloat(ruin.x, ruin.y, ruin.label, ruin.playerId === this.localSeat ? "#ffd75e" : "#c8b79b");
        playSound(ruin.playerId === this.localSeat ? "levelUp" : "capture");
      }
    } else {
      const before = this.state;
      this.state = applyAction(before, action);
      if (action.type === "CAPTURE") playSound("capture");
      else if (action.type === "CHOOSE_REWARD") playSound("levelUp");
      else if (action.type === "END_TURN" && before.currentPlayerId === this.localSeat) playSound("endTurn");
    }
  }

  private addMove(unitId: number, fromX: number, fromY: number, toX: number, toY: number): void {
    this.anims = this.anims.filter((a) => a.unitId !== unitId);
    this.anims.push({ unitId, kind: "move", fromX, fromY, toX, toY, bornAt: performance.now(), duration: MOVE_ANIM_MS });
  }

  private addHit(unitId: number, x: number, y: number): void {
    this.anims = this.anims.filter((a) => a.unitId !== unitId);
    this.anims.push({ unitId, kind: "hit", fromX: x, fromY: y, toX: x, toY: y, bornAt: performance.now(), duration: HIT_ANIM_MS });
  }

  /** Own units that can still do something this turn. */
  idleUnits(): number[] {
    const s = this.state;
    if (!s || s.currentPlayerId !== this.localSeat || this.aiBusy) return [];
    return unitsOf(s, this.localSeat)
      .filter((u) => !u.moved || !u.attacked)
      .map((u) => u.id);
  }

  /** Select the next unit with actions left and ask the map to show it. */
  cycleIdleUnit(): void {
    const ids = this.idleUnits();
    if (ids.length === 0) return;
    const at = this.selectedUnitId === null ? -1 : ids.indexOf(this.selectedUnitId);
    const next = ids[(at + 1) % ids.length];
    const unit = this.state ? unitById(this.state, next) : null;
    this.selectedUnitId = next;
    this.selectedTile = null;
    if (unit) this.focusRequest = [unit.x, unit.y];
    playSound("select");
    this.notify();
  }

  private addFloat(x: number, y: number, text: string, color: string): void {
    this.floats.push({ x, y, text, color, bornAt: performance.now() });
    if (this.floats.length > 40) this.floats.splice(0, this.floats.length - 40);
  }

  /**
   * Which seats this client is responsible for advancing. In local games that
   * is every seat but the player's own; online it is only the AI seats this
   * client has been told to drive (remote humans move themselves).
   */
  protected drivesSeat(pid: number): boolean {
    if (this.mode === "online") return this.online?.drivesSeat(pid) ?? false;
    return pid !== this.localSeat;
  }

  /** Apply an action this client originated for a seat it drives. */
  private applyDriven(action: Action, perceived: boolean): void {
    this.applyWithEffects(action, perceived);
    this.online?.onLocalAction(action);
  }

  /** Advance seats this client drives until control returns to a seat it doesn't (or the game ends). */
  protected async runTurnPump(): Promise<void> {
    if (!this.state || this.aiBusy) return;
    this.aiBusy = true;
    this.notify();
    try {
      let guard = 0;
      while (
        this.state &&
        this.state.winnerId === null &&
        this.state.currentPlayerId !== this.localSeat &&
        this.drivesSeat(this.state.currentPlayerId) &&
        guard < AI_ACTION_CAP * 4
      ) {
        guard++;
        const pid = this.state.currentPlayerId;
        const agent = this.agents.get(pid);
        if (!agent || !playerById(this.state, pid).alive) {
          this.applyDriven({ type: "END_TURN" }, false);
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
          this.applyDriven(action, visible);
          actionsThisTurn++;
          this.notify();
          if (visible) await sleep(AI_STEP_MS);
        }
        if (this.state.currentPlayerId === pid && this.state.winnerId === null) {
          this.applyDriven({ type: "END_TURN" }, false);
          this.notify();
        }
      }
    } finally {
      this.aiBusy = false;
      this.refreshLegal();
      if (this.state) {
        if (this.state.winnerId !== null) {
          this.screen = "gameover";
          if (this.mode === "local") clearSave();
        } else {
          this.persist();
        }
      }
      this.notify();
    }
  }

  /** Only pause for AI actions the local player can actually see. */
  private isActionVisible(action: Action): boolean {
    if (!this.state) return false;
    const viewer = playerById(this.state, this.localSeat);
    const seen = (x: number, y: number) => viewer.explored[y * this.state!.size + x] === 1;
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
