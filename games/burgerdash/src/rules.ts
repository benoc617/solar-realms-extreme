/**
 * Burger Dash — pure rules engine.
 *
 * Ported from the original `src/game/engine.ts`. Movement, jumps, lose-a-turn
 * and the overshoot win are unchanged. What differs:
 *
 *   - The four device-handoff phases collapse to `hiding` / `guessing`, which
 *     block on two *different* players (see types.ts).
 *   - The token no longer walks space-by-space (`moving` / STEP), because the
 *     UI animates from the before/after positions instead. Landing is resolved
 *     in one step, and every space walked through is still recorded in
 *     `landedBy` so the crayon-circle trail is identical.
 *   - No React, no timers: every transition is an explicit action so the
 *     engine, MCTS and the HTTP routes all drive it the same way.
 */

import { BOARD, FINAL_SPACE, getSpace } from "./board";
import type {
  BdPlayer,
  BurgerDashState,
  ColorKey,
  Hand,
  Phase,
} from "./types";

const START_SPACE = BOARD[0].id;

export const PLAYER_COLORS: ColorKey[] = [
  "red",
  "blue",
  "green",
  "orange",
  "purple",
  "pink",
];

export interface PlayerConfig {
  id: string;
  name: string;
  color?: ColorKey;
  isAI: boolean;
}

export function cloneState(state: BurgerDashState): BurgerDashState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    landedBy: Object.fromEntries(
      Object.entries(state.landedBy).map(([k, v]) => [k, [...v]]),
    ),
    effect: state.effect ? { ...state.effect } : null,
  };
}

export function createInitialState(
  configs: PlayerConfig[],
  aiDifficulty: "easy" | "medium" | "hard" = "medium",
): BurgerDashState {
  if (configs.length < 2 || configs.length > 4) {
    throw new Error("Burger Dash needs 2 to 4 players");
  }

  const players: BdPlayer[] = configs.map((config, index) => ({
    id: config.id,
    name: config.name.trim() || `Player ${index + 1}`,
    color: config.color ?? PLAYER_COLORS[index % PLAYER_COLORS.length],
    isAI: config.isAI,
    position: START_SPACE,
    skipNextTurn: false,
  }));

  const base: BurgerDashState = {
    players,
    activeIndex: 0,
    phase: "chooseHider",
    hiderId: null,
    hiddenHand: null,
    guessedHand: null,
    moveAmount: 0,
    landedBy: {},
    effect: null,
    status: "playing",
    winnerId: null,
    turnCount: 0,
    aiDifficulty,
  };

  return { ...base, ...beginTurn(players, 0) };
}

type TurnStart = Pick<
  BurgerDashState,
  | "players"
  | "activeIndex"
  | "phase"
  | "hiderId"
  | "hiddenHand"
  | "guessedHand"
  | "moveAmount"
  | "effect"
  | "hiddenByTimeout"
>;

/**
 * Everything that resets at the top of a turn. A player who owes a skipped turn
 * stops here instead: the flag is consumed and a banner phase is entered, and
 * the turn passes on from there.
 */
function beginTurn(players: BdPlayer[], activeIndex: number): TurnStart {
  const blank = {
    hiddenHand: null,
    guessedHand: null,
    moveAmount: 0,
    effect: null,
    hiddenByTimeout: false,
  } as const;

  const active = players[activeIndex];

  if (active.skipNextTurn) {
    return {
      players: players.map((p) =>
        p.id === active.id ? { ...p, skipNextTurn: false } : p,
      ),
      activeIndex,
      phase: "skippedTurn",
      hiderId: null,
      ...blank,
    };
  }

  const candidates = players.filter((p) => p.id !== active.id);
  // With two players there is only one possible hider, so don't ask.
  if (candidates.length === 1) {
    return {
      players,
      activeIndex,
      phase: "hiding",
      hiderId: candidates[0].id,
      ...blank,
    };
  }

  return { players, activeIndex, phase: "chooseHider", hiderId: null, ...blank };
}

function nextTurn(state: BurgerDashState): BurgerDashState {
  const activeIndex = (state.activeIndex + 1) % state.players.length;
  return {
    ...state,
    ...beginTurn(state.players, activeIndex),
    turnCount: state.turnCount + 1,
  };
}

function markLanded(
  landedBy: BurgerDashState["landedBy"],
  spaceId: number,
  playerId: string,
): BurgerDashState["landedBy"] {
  const current = landedBy[spaceId] ?? [];
  if (current.includes(playerId)) return landedBy;
  return { ...landedBy, [spaceId]: [...current, playerId] };
}

function updatePlayer(
  players: BdPlayer[],
  playerId: string,
  patch: Partial<BdPlayer>,
): BdPlayer[] {
  return players.map((p) => (p.id === playerId ? { ...p, ...patch } : p));
}

/** Spaces walked through for a move of `amount`, clamped at the final space. */
export function buildMovePath(from: number, amount: number): number[] {
  const path: number[] = [];
  for (let i = 1; i <= amount; i += 1) {
    const next = Math.min(from + i, FINAL_SPACE);
    if (path[path.length - 1] === next) break;
    path.push(next);
  }
  return path;
}

/**
 * Land the active player on `spaceId`: record the circle, check for a win, and
 * work out whether the space does anything. Teleport destinations are settled
 * with `land()` too, but only ever once per turn (see `resolveSpace` /
 * `continueEffect`), so a board edit can never produce an endless chain of hops.
 */
function land(
  state: BurgerDashState,
  spaceId: number,
  applyEffect: boolean,
): BurgerDashState {
  const active = state.players[state.activeIndex];
  const landedBy = markLanded(state.landedBy, spaceId, active.id);
  const players = updatePlayer(state.players, active.id, { position: spaceId });
  const settled = { ...state, players, landedBy };

  if (spaceId >= FINAL_SPACE) {
    return {
      ...settled,
      phase: "won",
      status: "complete",
      winnerId: active.id,
      effect: null,
    };
  }

  const space = getSpace(spaceId);

  if (applyEffect && (space.kind === "jump" || space.kind === "move")) {
    return {
      ...settled,
      phase: "spaceEffect",
      effect: { kind: space.kind, from: spaceId, to: space.target },
    };
  }

  if (applyEffect && space.kind === "loseTurn") {
    return {
      ...settled,
      players: updatePlayer(players, active.id, { skipNextTurn: true }),
      phase: "spaceEffect",
      effect: { kind: "loseTurn", from: spaceId },
    };
  }

  return nextTurn({ ...settled, effect: null });
}

// ---------------------------------------------------------------------------
// Transitions — one per player-visible action
// ---------------------------------------------------------------------------

export function chooseHider(
  state: BurgerDashState,
  playerId: string,
): BurgerDashState {
  if (state.phase !== "chooseHider") return state;
  const hider = state.players.find((p) => p.id === playerId);
  const active = state.players[state.activeIndex];
  if (!hider || hider.id === active.id) return state;
  return { ...state, hiderId: hider.id, phase: "hiding" };
}

/**
 * The hider commits a hand. `byTimeout` marks a server-side auto-commit so the
 * reveal banner can explain why nobody chose.
 */
export function hideHand(
  state: BurgerDashState,
  hand: Hand,
  byTimeout = false,
): BurgerDashState {
  if (state.phase !== "hiding") return state;
  return {
    ...state,
    hiddenHand: hand,
    hiddenByTimeout: byTimeout,
    phase: "guessing",
  };
}

export function guessHand(
  state: BurgerDashState,
  hand: Hand,
): BurgerDashState {
  if (state.phase !== "guessing" || !state.hiddenHand) return state;
  const correct = hand === state.hiddenHand;
  return {
    ...state,
    guessedHand: hand,
    moveAmount: correct ? 2 : 1,
    phase: "reveal",
  };
}

/**
 * Acknowledge the reveal and move. Every space walked through is recorded, so
 * the crayon trail matches the original's step-by-step walk.
 */
export function resolveSpace(state: BurgerDashState): BurgerDashState {
  if (state.phase !== "reveal") return state;
  const active = state.players[state.activeIndex];
  const path = buildMovePath(active.position, state.moveAmount);
  if (path.length === 0) return nextTurn(state);

  let landedBy = state.landedBy;
  // Circles are drawn on every space passed over, not just the final one.
  for (const spaceId of path.slice(0, -1)) {
    landedBy = markLanded(landedBy, spaceId, active.id);
  }

  return land({ ...state, landedBy }, path[path.length - 1], true);
}

/** Acknowledge a space-effect or skipped-turn banner. */
export function continueEffect(state: BurgerDashState): BurgerDashState {
  if (state.phase === "skippedTurn") return nextTurn(state);
  if (state.phase !== "spaceEffect" || !state.effect) return state;
  const { effect } = state;
  if (effect.kind === "loseTurn") {
    return nextTurn({ ...state, effect: null });
  }
  // Jump / move: hop once. The destination is settled without re-applying any
  // effect it might carry.
  return land({ ...state, effect: null }, effect.to ?? effect.from, false);
}

/**
 * Advance a turn that has timed out on `playerId`.
 *
 * The engine's auto-skip calls this via `processEndTurn` and then re-resolves
 * the current player from game state, so this MUST leave the game with a
 * different actor — otherwise the engine simply resets the clock on the same
 * player and the session hangs forever.
 *
 * Each phase is resolved the way that turn would have ended anyway:
 *
 *   - `hiding`      the hider is not the one racing, so they are not punished:
 *                   a hand is committed for them and play moves to the guesser.
 *   - `chooseHider` a hider is picked for the active player, then their turn
 *                   proceeds. They still owe a guess.
 *   - `guessing`    the guess is forfeited — the active player moves 0 spaces
 *                   and the turn passes on.
 *   - banner phases the banner is acknowledged on their behalf.
 *
 * Returns the state unchanged when `playerId` is not the current actor.
 */
export function skipStalledTurn(
  state: BurgerDashState,
  playerId: string,
  pickHand: () => Hand = () => (Math.random() < 0.5 ? "left" : "right"),
  pickHider: (candidates: BdPlayer[]) => BdPlayer = (c) =>
    c[Math.floor(Math.random() * c.length) % c.length],
): BurgerDashState {
  if (state.status !== "playing") return state;
  const actor = actorForPhase(state);
  if (!actor || actor.id !== playerId) return state;

  switch (state.phase) {
    case "hiding":
      return hideHand(state, pickHand(), true);

    case "chooseHider": {
      const candidates = state.players.filter((p) => p.id !== actor.id);
      if (candidates.length === 0) return state;
      return chooseHider(state, pickHider(candidates).id);
    }

    case "guessing":
      // No guess means no move. Pass play on rather than granting a free
      // space, and clear the committed hand so nothing leaks into next turn.
      return nextTurn({ ...state, hiddenHand: null, guessedHand: null, moveAmount: 0 });

    case "reveal":
      // The guess was already made; honour the move they earned.
      return resolveSpace(state);

    case "spaceEffect":
    case "skippedTurn":
      return continueEffect(state);

    default:
      return state;
  }
}

export function resign(
  state: BurgerDashState,
  playerId: string,
): BurgerDashState {
  if (state.status !== "playing") return state;
  // Only a player actually in this game can resign it. Without this an id from
  // another session would end the game as a draw.
  if (!state.players.some((p) => p.id === playerId)) return state;
  const remaining = state.players.filter((p) => p.id !== playerId);
  // Two-player game: the other player wins outright. With 3-4 players there is
  // no single winner to crown, so the session simply ends.
  return {
    ...state,
    phase: "won",
    status: "resigned",
    winnerId: remaining.length === 1 ? remaining[0].id : null,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function activePlayer(state: BurgerDashState): BdPlayer {
  return state.players[state.activeIndex];
}

export function playerById(
  state: BurgerDashState,
  id: string | null,
): BdPlayer | undefined {
  if (!id) return undefined;
  return state.players.find((p) => p.id === id);
}

/**
 * Which player must act right now, if any.
 *
 * This is what makes the two-step crayon turn work on the engine: during
 * `hiding` the actor is the *hider*, not the turn's owner. The turn-order hook
 * feeds this to `advanceTurn`, so `currentTurnPlayerId` tracks whoever the game
 * is actually waiting on.
 *
 * Banner phases (`reveal`, `spaceEffect`, `skippedTurn`) are acknowledged by
 * the active player.
 */
export function actorForPhase(state: BurgerDashState): BdPlayer | null {
  if (state.status !== "playing") return null;
  const active = state.players[state.activeIndex];
  switch (state.phase) {
    case "hiding":
      return playerById(state, state.hiderId) ?? null;
    case "chooseHider":
    case "guessing":
    case "reveal":
    case "spaceEffect":
    case "skippedTurn":
      return active;
    default:
      return null;
  }
}

/** Legal actions for `playerId` in the current phase. Empty when not their move. */
export function getLegalActions(
  state: BurgerDashState,
  playerId: string,
): { action: string; params: Record<string, unknown>; label: string }[] {
  const actor = actorForPhase(state);
  if (!actor || actor.id !== playerId) return [];

  switch (state.phase) {
    case "chooseHider":
      return state.players
        .filter((p) => p.id !== actor.id)
        .map((p) => ({
          action: "choose_hider",
          params: { hiderId: p.id },
          label: `Ask ${p.name} to hide the crayon`,
        }));
    case "hiding":
      return (["left", "right"] as Hand[]).map((hand) => ({
        action: "hide_hand",
        params: { hand },
        label: `Hide the crayon in your ${hand} hand`,
      }));
    case "guessing":
      return (["left", "right"] as Hand[]).map((hand) => ({
        action: "guess_hand",
        params: { hand },
        label: `Guess ${hand} hand`,
      }));
    case "reveal":
      return [{ action: "continue", params: {}, label: "Move" }];
    case "spaceEffect":
    case "skippedTurn":
      return [{ action: "continue", params: {}, label: "Continue" }];
    default:
      return [];
  }
}

export const PHASE_ORDER: Phase[] = [
  "chooseHider",
  "hiding",
  "guessing",
  "reveal",
  "spaceEffect",
  "skippedTurn",
  "won",
];
