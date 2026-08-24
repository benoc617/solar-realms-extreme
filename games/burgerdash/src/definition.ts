/**
 * Burger Dash GameDefinition for the DGE engine.
 *
 * State is stored in GameSession.log as JSON (no separate tables), following
 * the chess / gin rummy pattern.
 *
 * Two things are worth knowing before reading on:
 *
 * 1. **The crayon is genuinely hidden.** `hiddenHand` lives only in the
 *    server-side state. `projectState` strips it from every client payload
 *    until the reveal — including the hider's own, since they have already
 *    committed and re-reading it would only help them leak it.
 *
 * 2. **A turn blocks on two different players.** During `hiding` the engine's
 *    `currentTurnPlayerId` points at the *hider*, not the turn's owner. The
 *    turn-order hook feeds `actorForPhase()` to `advanceTurn`, which is the
 *    same mechanism Gin Rummy uses to keep the engine on one player across a
 *    multi-step turn.
 *
 * There is no meaningful search here: guessing a hidden hand is a coin flip and
 * hiding has no counter-strategy, so the "AI" picks uniformly at random. The
 * difficulty profile exists only to satisfy the engine's standard option and to
 * pace how long the AI appears to think.
 */

import type {
  GameDefinition,
  ActionResult,
  Move,
  Rng,
  FullActionResult,
  AiDifficultyProfile,
} from "@dge/shared";
import { getDb } from "@dge/engine/db-context";
import type { BurgerDashState, Hand } from "./types";
import {
  actorForPhase,
  chooseHider,
  cloneState,
  continueEffect,
  getLegalActions,
  guessHand,
  hideHand,
  playerById,
  resign,
  resolveSpace,
} from "./rules";
import { FINAL_SPACE } from "./board";

// ---------------------------------------------------------------------------
// State persistence via GameSession.log
// ---------------------------------------------------------------------------

export async function loadBurgerDashState(
  sessionId: string,
  _playerId?: string,
  _action?: string,
  _db?: unknown,
): Promise<BurgerDashState> {
  const session = await getDb().gameSession.findUnique({
    where: { id: sessionId },
    select: { log: true },
  });
  if (!session?.log) throw new Error("Burger Dash session not found");
  const log = session.log as unknown;
  if (typeof log === "string") return JSON.parse(log) as BurgerDashState;
  return log as BurgerDashState;
}

export async function saveBurgerDashState(
  sessionId: string,
  state: BurgerDashState,
  _db?: unknown,
): Promise<void> {
  const jsonLog = JSON.parse(JSON.stringify(state));
  const updates: Record<string, unknown> = { log: jsonLog };
  if (state.status !== "playing") updates.status = "complete";
  await getDb().gameSession.update({
    where: { id: sessionId },
    data: updates,
  });
}

// ---------------------------------------------------------------------------
// Pure-track action handling
// ---------------------------------------------------------------------------

export function burgerDashApplyAction(
  state: BurgerDashState,
  playerId: string,
  action: string,
  params: unknown,
  _rng?: Rng | unknown,
): ActionResult<BurgerDashState> {
  const p = (params ?? {}) as Record<string, unknown>;

  if (state.status !== "playing") {
    return { success: false, message: "Game is already over." };
  }

  if (action === "resign") {
    const next = resign(state, playerId);
    // resign() no-ops for an id that is not in this game. Reporting success
    // there would claim a game ended when it did not.
    if (next === state) {
      return { success: false, message: "You are not in this game." };
    }
    const who = playerById(state, playerId);
    return {
      success: true,
      message: `${who?.name ?? "A player"} left the game.`,
      state: next,
      gameOver: true,
      winner: next.winnerId,
    };
  }

  // Every other action must come from the player the game is waiting on.
  const actor = actorForPhase(state);
  if (!actor) {
    return { success: false, message: "No action is expected right now." };
  }
  if (actor.id !== playerId) {
    return { success: false, message: "It is not your move." };
  }

  switch (action) {
    case "choose_hider": {
      if (state.phase !== "chooseHider") {
        return { success: false, message: "A hider has already been chosen." };
      }
      // Deliberately not named `playerId`: the action route spreads action
      // params into the same object as the acting player's id, so a param
      // called `playerId` would overwrite the caller's identity.
      const target = typeof p.hiderId === "string" ? p.hiderId : "";
      const next = chooseHider(state, target);
      if (next === state) {
        return { success: false, message: "That player cannot hide the crayon." };
      }
      const hider = playerById(next, next.hiderId);
      return {
        success: true,
        message: `${hider?.name ?? "A player"} was asked to hide the crayon.`,
        state: next,
      };
    }

    case "hide_hand": {
      if (state.phase !== "hiding") {
        return { success: false, message: "The crayon is not being hidden now." };
      }
      const hand = p.hand === "left" || p.hand === "right" ? (p.hand as Hand) : null;
      if (!hand) {
        return { success: false, message: "Choose the left or right hand." };
      }
      const byTimeout = p.byTimeout === true;
      const next = hideHand(state, hand, byTimeout);
      // Deliberately does not name the hand — this message is broadcast.
      return {
        success: true,
        message: "The crayon is hidden.",
        state: next,
      };
    }

    case "guess_hand": {
      if (state.phase !== "guessing") {
        return { success: false, message: "There is nothing to guess yet." };
      }
      const hand = p.hand === "left" || p.hand === "right" ? (p.hand as Hand) : null;
      if (!hand) {
        return { success: false, message: "Guess the left or right hand." };
      }
      const next = guessHand(state, hand);
      const correct = next.moveAmount === 2;
      return {
        success: true,
        message: correct
          ? `Correct! ${actor.name} moves 2 spaces.`
          : `Wrong — the crayon was in the other hand. ${actor.name} moves 1 space.`,
        state: next,
        details: { correct, hiddenHand: next.hiddenHand, guessedHand: hand },
      };
    }

    case "continue": {
      let next: BurgerDashState;
      if (state.phase === "reveal") {
        next = resolveSpace(state);
      } else if (state.phase === "spaceEffect" || state.phase === "skippedTurn") {
        next = continueEffect(state);
      } else {
        return { success: false, message: "Nothing to continue." };
      }

      if (next.status === "complete" && next.winnerId) {
        const winner = playerById(next, next.winnerId);
        return {
          success: true,
          message: `${winner?.name ?? "Someone"} reached the burger and wins!`,
          state: next,
          gameOver: true,
          winner: next.winnerId,
        };
      }
      return { success: true, message: describeEffect(state, next), state: next };
    }

    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}

function describeEffect(before: BurgerDashState, after: BurgerDashState): string {
  const active = before.players[before.activeIndex];
  if (before.phase === "skippedTurn") {
    return `${active.name} loses this turn.`;
  }
  const effect = after.effect;
  if (effect?.kind === "loseTurn") return `${active.name} landed on Lose a Turn.`;
  if (effect?.kind === "jump") return `${active.name} jumps to space ${effect.to}.`;
  if (effect?.kind === "move") return `${active.name} moves to space ${effect.to}.`;
  const moved = after.players.find((p) => p.id === active.id);
  return `${active.name} is on space ${moved?.position ?? active.position}.`;
}

// ---------------------------------------------------------------------------
// Hidden information
// ---------------------------------------------------------------------------

/**
 * Strip the hidden crayon hand for client payloads.
 *
 * The hand is revealed only once the guess is locked in (`reveal` and beyond).
 * Before that it is nulled for *everyone* — the hider included. They have
 * already committed, so re-sending it to their client would add nothing but a
 * way for it to leak.
 */
export function projectBurgerDashState(
  state: BurgerDashState,
  _forPlayerId: string,
): BurgerDashState {
  const revealed =
    state.phase === "reveal" ||
    state.phase === "spaceEffect" ||
    state.phase === "skippedTurn" ||
    state.phase === "won";
  if (revealed) return state;
  return { ...state, hiddenHand: null };
}

// ---------------------------------------------------------------------------
// Evaluation + candidate moves
// ---------------------------------------------------------------------------

/** Progress toward the burger, 0..1, from `forPlayerId`'s point of view. */
function burgerDashEval(state: BurgerDashState, forPlayerId: string): number {
  if (state.winnerId) return state.winnerId === forPlayerId ? 1 : 0;
  const me = playerById(state, forPlayerId);
  if (!me) return 0;
  const best = Math.max(...state.players.map((p) => p.position));
  const lead = (me.position - best) / FINAL_SPACE;
  return Math.max(0, Math.min(1, me.position / FINAL_SPACE + lead * 0.25));
}

function burgerDashGenerateMoves(
  state: BurgerDashState,
  forPlayerId: string,
): Move[] {
  return getLegalActions(state, forPlayerId);
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/**
 * Difficulty only paces how long the AI pretends to think. Hiding and guessing
 * are pure coin flips with no exploitable structure, so no amount of search
 * would beat random — claiming otherwise in the UI would be a lie.
 */
export const BURGERDASH_DIFFICULTY_PROFILE: AiDifficultyProfile = {
  easy: { label: "Dawdling", behavior: { thinkMs: 1200 } },
  medium: { label: "Snappy", behavior: { thinkMs: 600 } },
  hard: { label: "Instant", behavior: { thinkMs: 200 } },
};

/** Pick the AI's move for whatever phase it is being asked to act in. */
export function getBurgerDashAIMove(
  state: BurgerDashState,
  playerId: string,
  rng: () => number = Math.random,
): Move | null {
  const legal = getLegalActions(state, playerId);
  if (legal.length === 0) return null;
  return legal[Math.floor(rng() * legal.length) % legal.length];
}

// ---------------------------------------------------------------------------
// Full-track GameDefinition
// ---------------------------------------------------------------------------

/**
 * In-flight AI sequences, keyed by session id. Both callers of
 * `runAiSequence` run in the same Next.js process, so an in-process guard is
 * enough to stop overlapping load-modify-save loops from losing moves.
 */
const aiSequenceInFlight = new Map<string, Promise<void>>();

async function sessionIdFor(playerId: string): Promise<string | null> {
  const player = await getDb().player.findUnique({
    where: { id: playerId },
    select: { gameSessionId: true },
  });
  return player?.gameSessionId ?? null;
}

export const burgerDashGameDefinition: GameDefinition<BurgerDashState> = {
  loadState: loadBurgerDashState,
  saveState: saveBurgerDashState,
  applyAction: burgerDashApplyAction,
  projectState: projectBurgerDashState,
  evalState: burgerDashEval,
  generateCandidateMoves: burgerDashGenerateMoves,
  aiDifficultyProfile: BURGERDASH_DIFFICULTY_PROFILE,

  async processFullAction(
    playerId: string,
    action: string,
    params: Record<string, unknown>,
  ): Promise<FullActionResult> {
    const sessionId = await sessionIdFor(playerId);
    if (!sessionId) return { success: false, message: "Player has no session." };

    const state = await loadBurgerDashState(sessionId);
    const result = burgerDashApplyAction(state, playerId, action, params);
    if (result.success && result.state) {
      await saveBurgerDashState(sessionId, result.state);
    }
    return {
      success: result.success,
      message: result.message,
      actionDetails: result.details,
      gameOver: result.gameOver === true,
    };
  },

  // No economy tick — processFullTick intentionally not defined.

  /**
   * Drive every consecutive AI action. Unlike chess this can act for a player
   * who is *not* the turn owner: an AI asked to hide the crayon acts during the
   * human's turn, which is exactly the two-step crayon flow.
   *
   * Serialized per session by `aiSequenceInFlight`. Two callers can legitimately
   * start this at once — the adapter's opening kickoff and the orchestrator's
   * post-action fire-and-forget — and because the loop is an unlocked
   * load-modify-save, overlapping runs would read the same state and clobber
   * each other's move.
   */
  async runAiSequence(sessionId: string): Promise<void> {
    const existing = aiSequenceInFlight.get(sessionId);
    if (existing) return existing;

    const run = (async () => {
      const { advanceTurn } = await import("@dge/engine/turn-order");

      for (let guard = 0; guard < 400; guard += 1) {
        const state = await loadBurgerDashState(sessionId);
        if (state.status !== "playing") break;

        const actor = actorForPhase(state);
        if (!actor || !actor.isAI) break;

        const move = getBurgerDashAIMove(state, actor.id);
        if (!move) break;

        const result = burgerDashApplyAction(state, actor.id, move.action, move.params);
        if (!result.success || !result.state) break;

        await saveBurgerDashState(sessionId, result.state);
        await advanceTurn(sessionId);
      }
    })().finally(() => {
      aiSequenceInFlight.delete(sessionId);
    });

    aiSequenceInFlight.set(sessionId, run);
    return run;
  },
};

export { cloneState };
