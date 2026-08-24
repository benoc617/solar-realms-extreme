/**
 * Burger Dash definition — action dispatch, turn enforcement, and the
 * hidden-hand guarantee.
 *
 * The `projectState` tests are the important ones: they are what stop the
 * crayon leaking through the status route to the player who is about to guess.
 */

import { describe, expect, it } from "vitest";
import {
  getLegalActions,
  burgerDashApplyAction,
  projectBurgerDashState,
  getBurgerDashAIMove,
  createInitialState,
  guessHand,
  hideHand,
} from "@dge/burgerdash";
import type { BurgerDashState } from "@dge/burgerdash";

function game(n = 2, aiSeats: number[] = []): BurgerDashState {
  return createInitialState(
    Array.from({ length: n }, (_, i) => ({
      id: `p${i + 1}`,
      name: `P${i + 1}`,
      isAI: aiSeats.includes(i),
    })),
  );
}

describe("projectState — the crayon stays hidden", () => {
  it("hides the committed hand from the guesser", () => {
    const s = hideHand(game(2), "left");
    expect(s.hiddenHand).toBe("left"); // server-side truth
    expect(projectBurgerDashState(s, "p1").hiddenHand).toBeNull();
  });

  it("hides the committed hand from the hider too", () => {
    // The hider already chose; echoing it back only creates a leak path.
    const s = hideHand(game(2), "right");
    expect(projectBurgerDashState(s, "p2").hiddenHand).toBeNull();
  });

  it("hides it from a third-party spectator", () => {
    const s = hideHand(game(3), "left");
    expect(projectBurgerDashState(s, "p3").hiddenHand).toBeNull();
  });

  it("reveals it once the guess is locked in", () => {
    const s = guessHand(hideHand(game(2), "left"), "right");
    expect(s.phase).toBe("reveal");
    expect(projectBurgerDashState(s, "p1").hiddenHand).toBe("left");
  });

  it("leaves the rest of the state untouched", () => {
    const s = hideHand(game(2), "left");
    const projected = projectBurgerDashState(s, "p1");
    expect(projected.players).toEqual(s.players);
    expect(projected.phase).toBe(s.phase);
    expect(projected.hiderId).toBe(s.hiderId);
  });
});

describe("applyAction — turn enforcement", () => {
  it("refuses an action from a player who is not the actor", () => {
    const s = game(2); // phase "hiding", actor is p2
    const r = burgerDashApplyAction(s, "p1", "hide_hand", { hand: "left" });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/not your move/i);
  });

  it("accepts the hide from the hider", () => {
    const r = burgerDashApplyAction(game(2), "p2", "hide_hand", { hand: "left" });
    expect(r.success).toBe(true);
    expect(r.state!.phase).toBe("guessing");
  });

  it("never names the hidden hand in the broadcast message", () => {
    const r = burgerDashApplyAction(game(2), "p2", "hide_hand", { hand: "left" });
    expect(r.message).not.toMatch(/left|right/i);
  });

  it("rejects a malformed hand", () => {
    const r = burgerDashApplyAction(game(2), "p2", "hide_hand", { hand: "up" });
    expect(r.success).toBe(false);
  });

  it("reports a correct guess and the move amount", () => {
    const s = hideHand(game(2), "left");
    const r = burgerDashApplyAction(s, "p1", "guess_hand", { hand: "left" });
    expect(r.success).toBe(true);
    expect(r.details!.correct).toBe(true);
    expect(r.state!.moveAmount).toBe(2);
  });

  it("reports a wrong guess", () => {
    const s = hideHand(game(2), "left");
    const r = burgerDashApplyAction(s, "p1", "guess_hand", { hand: "right" });
    expect(r.details!.correct).toBe(false);
    expect(r.state!.moveAmount).toBe(1);
  });

  it("rejects an unknown action", () => {
    const s = hideHand(game(2), "left");
    const r = burgerDashApplyAction(s, "p1", "eat_burger", {});
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/unknown action/i);
  });

  it("refuses every action once the game is over", () => {
    const over: BurgerDashState = { ...game(2), status: "complete" };
    const r = burgerDashApplyAction(over, "p2", "hide_hand", { hand: "left" });
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/already over/i);
  });

  it("lets any player resign at any time", () => {
    const r = burgerDashApplyAction(game(2), "p1", "resign", {});
    expect(r.success).toBe(true);
    expect(r.gameOver).toBe(true);
    expect(r.winner).toBe("p2");
  });

  it("names no action param `playerId` — it would collide with the caller's id", () => {
    // The action route spreads action params alongside the acting player's id,
    // so a param called `playerId` silently overwrites who is acting and the
    // turn guard then rejects the request. Regression guard for that bug.
    const states = [game(3), hideHand(game(2), "left")];
    for (const st of states) {
      for (const p of st.players) {
        for (const a of getLegalActions(st, p.id)) {
          expect(Object.keys(a.params)).not.toContain("playerId");
        }
      }
    }
  });

  it("routes chooseHider through the active player only", () => {
    const s = game(3);
    expect(burgerDashApplyAction(s, "p2", "choose_hider", { hiderId: "p3" }).success).toBe(false);
    expect(burgerDashApplyAction(s, "p1", "choose_hider", { hiderId: "p3" }).success).toBe(true);
  });

  it("signals game over when a player reaches the burger", () => {
    let s = game(2);
    s = { ...s, players: s.players.map((p, i) => (i === 0 ? { ...p, position: 30 } : p)) };
    s = guessHand(hideHand(s, "left"), "left");
    const r = burgerDashApplyAction(s, "p1", "continue", {});
    expect(r.gameOver).toBe(true);
    expect(r.winner).toBe("p1");
  });
});

describe("AI", () => {
  it("returns a legal move for whichever phase it must act in", () => {
    const s = game(2, [1]); // p2 is AI and must hide
    const move = getBurgerDashAIMove(s, "p2", () => 0);
    expect(move).not.toBeNull();
    expect(move!.action).toBe("hide_hand");
  });

  it("returns null when it is not the AI's move", () => {
    const s = game(2, [1]);
    expect(getBurgerDashAIMove(s, "p1")).toBeNull();
  });

  it("can pick either hand", () => {
    const s = game(2, [1]);
    const left = getBurgerDashAIMove(s, "p2", () => 0);
    const right = getBurgerDashAIMove(s, "p2", () => 0.99);
    expect(left!.params.hand).not.toBe(right!.params.hand);
  });

  it("picks a hider when asked to in a 3-player game", () => {
    const s = game(3, [0]); // p1 is AI, must choose a hider
    const move = getBurgerDashAIMove(s, "p1", () => 0);
    expect(move!.action).toBe("choose_hider");
    expect(["p2", "p3"]).toContain(move!.params.hiderId);
  });
});
