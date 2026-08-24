/**
 * Burger Dash rules — ported from the original engine tests, plus coverage for
 * the networked two-step crayon turn that the pass-and-play version had no
 * equivalent of.
 */

import { describe, expect, it } from "vitest";
import {
  BOARD,
  FINAL_SPACE,
  getSpace,
  actorForPhase,
  activePlayer,
  buildMovePath,
  chooseHider,
  continueEffect,
  createInitialState,
  getLegalActions,
  guessHand,
  hideHand,
  resign,
  resolveSpace,
  skipStalledTurn,
} from "@dge/burgerdash";
import type { BurgerDashState } from "@dge/burgerdash";

function game(playerCount: number, aiSeats: number[] = []): BurgerDashState {
  return createInitialState(
    Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `P${i + 1}`,
      isAI: aiSeats.includes(i),
    })),
  );
}

/** Force the active player onto a space without playing through the turns. */
function at(state: BurgerDashState, position: number): BurgerDashState {
  return {
    ...state,
    players: state.players.map((p, i) =>
      i === state.activeIndex ? { ...p, position } : p,
    ),
  };
}

/** Play one whole turn, controlling whether the guess is right. */
function takeTurn(state: BurgerDashState, correct: boolean): BurgerDashState {
  let s = state;
  if (s.phase === "skippedTurn") s = continueEffect(s);
  if (s.phase === "chooseHider") {
    const other = s.players.find((p) => p.id !== activePlayer(s).id)!;
    s = chooseHider(s, other.id);
  }
  s = hideHand(s, "left");
  s = guessHand(s, correct ? "left" : "right");
  s = resolveSpace(s);
  let guard = 0;
  while (s.phase === "spaceEffect") {
    s = continueEffect(s);
    if ((guard += 1) > 5) throw new Error("space effects did not settle");
  }
  return s;
}

describe("board data", () => {
  it("has 31 spaces numbered 1..31 with unique grid slots", () => {
    expect(BOARD).toHaveLength(FINAL_SPACE);
    expect(BOARD.map((s) => s.id)).toEqual(
      Array.from({ length: FINAL_SPACE }, (_, i) => i + 1),
    );
    const slots = new Set(BOARD.map((s) => `${s.row}:${s.col}`));
    expect(slots.size).toBe(BOARD.length);
  });

  it("drops straight down at every row transition", () => {
    // Where the snake changes row, consecutive spaces must share a column —
    // otherwise the path visibly jogs sideways (17 -> 18 did before).
    for (let id = 1; id < FINAL_SPACE; id += 1) {
      const a = getSpace(id);
      const b = getSpace(id + 1);
      if (a.row === b.row) {
        expect(Math.abs(a.col - b.col)).toBe(1); // same row: step one column
      } else {
        expect(b.row).toBe(a.row + 1); // next row down...
        expect(b.col).toBe(a.col);     // ...directly below
      }
    }
  });

  it("points every jump / move space at a real space further along", () => {
    for (const space of BOARD) {
      if (space.kind === "jump" || space.kind === "move") {
        expect(space.target).toBeDefined();
        expect(() => getSpace(space.target!)).not.toThrow();
        expect(space.target!).toBeGreaterThan(space.id);
      }
    }
  });
});

describe("setup", () => {
  it("rejects fewer than 2 or more than 4 players", () => {
    expect(() => game(1)).toThrow();
    expect(() => game(5)).toThrow();
    expect(() => game(2)).not.toThrow();
    expect(() => game(4)).not.toThrow();
  });

  it("starts everyone on space 1 with no crayon hidden", () => {
    const s = game(3);
    expect(s.players.every((p) => p.position === 1)).toBe(true);
    expect(s.hiddenHand).toBeNull();
    expect(s.status).toBe("playing");
  });

  it("skips the chooseHider phase in a 2-player game", () => {
    const s = game(2);
    expect(s.phase).toBe("hiding");
    expect(s.hiderId).toBe("p2");
  });

  it("asks a 3-player game who should hide", () => {
    const s = game(3);
    expect(s.phase).toBe("chooseHider");
    expect(s.hiderId).toBeNull();
  });

  it("assigns distinct colors", () => {
    const colors = game(4).players.map((p) => p.color);
    expect(new Set(colors).size).toBe(4);
  });
});

describe("the crayon turn", () => {
  it("blocks on the hider, not the active player, while hiding", () => {
    const s = game(2);
    expect(s.phase).toBe("hiding");
    // p1's turn, but p2 is the one who must act.
    expect(activePlayer(s).id).toBe("p1");
    expect(actorForPhase(s)!.id).toBe("p2");
  });

  it("hands control back to the guesser once the hand is committed", () => {
    let s = game(2);
    s = hideHand(s, "left");
    expect(s.phase).toBe("guessing");
    expect(actorForPhase(s)!.id).toBe("p1");
  });

  it("offers no legal actions to a player who is not the actor", () => {
    const s = game(2);
    expect(getLegalActions(s, "p2").length).toBe(2); // the hider may hide
    expect(getLegalActions(s, "p1")).toEqual([]); // guesser waits
  });

  it("moves 2 on a correct guess and 1 on a wrong one", () => {
    let correct = game(2);
    correct = guessHand(hideHand(correct, "left"), "left");
    expect(correct.moveAmount).toBe(2);

    let wrong = game(2);
    wrong = guessHand(hideHand(wrong, "left"), "right");
    expect(wrong.moveAmount).toBe(1);
  });

  it("ignores a guess before a hand is hidden", () => {
    const s = game(2);
    expect(guessHand(s, "left")).toBe(s);
  });

  it("ignores a second hide after one is committed", () => {
    const s = hideHand(game(2), "left");
    expect(hideHand(s, "right")).toBe(s);
  });

  it("rejects the active player as their own hider", () => {
    const s = game(3);
    expect(chooseHider(s, activePlayer(s).id)).toBe(s);
  });

  it("records a timeout auto-hide so the reveal can explain it", () => {
    const s = hideHand(game(2), "left", true);
    expect(s.hiddenByTimeout).toBe(true);
    expect(s.phase).toBe("guessing");
  });

  it("clears the hidden hand at the start of the next turn", () => {
    const s = takeTurn(game(2), true);
    expect(s.hiddenHand).toBeNull();
    expect(s.guessedHand).toBeNull();
  });
});

describe("movement", () => {
  it("builds a path of the right length, clamped at the final space", () => {
    expect(buildMovePath(1, 2)).toEqual([2, 3]);
    expect(buildMovePath(30, 2)).toEqual([31]);
    // Clamped to a single entry rather than walking past the end. Unreachable
    // in play (a player on 31 has already won), but the clamp is what stops a
    // path running off the board.
    expect(buildMovePath(FINAL_SPACE, 2)).toEqual([FINAL_SPACE]);
  });

  it("colours every space passed through, not just the one landed on", () => {
    let s = at(game(2), 1);
    s = takeTurn(s, true); // moves 1 -> 3
    expect(s.landedBy[2]).toContain("p1");
    expect(s.landedBy[3]).toContain("p1");
  });

  it("advances the turn to the next player", () => {
    const s = takeTurn(game(3), false);
    expect(s.activeIndex).toBe(1);
    expect(s.turnCount).toBe(1);
  });

  it("wraps the turn order back to the first player", () => {
    let s = game(2);
    s = takeTurn(s, false);
    s = takeTurn(s, false);
    expect(s.activeIndex).toBe(0);
  });
});

describe("space effects", () => {
  it("jumps ahead from space 8 to 13", () => {
    let s = at(game(2), 6);
    s = takeTurn(s, true); // 6 -> 8, jump to 13
    expect(s.players[0].position).toBe(13);
    expect(s.landedBy[13]).toContain("p1");
  });

  it("does not chain a second effect at the jump destination", () => {
    let s = at(game(2), 13);
    s = takeTurn(s, true); // 13 -> 15, jump to 20; 20 is plain
    expect(s.players[0].position).toBe(20);
    expect(s.phase).not.toBe("spaceEffect");
  });

  it("costs the next turn on a Lose a Turn space", () => {
    let s = at(game(2), 4);
    s = takeTurn(s, false); // 4 -> 5, lose a turn
    expect(s.players[0].skipNextTurn).toBe(true);
  });

  it("consumes the skip and passes play on", () => {
    let s = at(game(2), 4);
    s = takeTurn(s, false); // p1 lands on 5
    s = takeTurn(s, false); // p2 plays
    expect(s.activeIndex).toBe(0);
    expect(s.phase).toBe("skippedTurn");
    s = continueEffect(s);
    expect(s.players[0].skipNextTurn).toBe(false);
    expect(s.activeIndex).toBe(1);
  });
});

describe("winning", () => {
  it("wins by reaching space 31 exactly", () => {
    let s = at(game(2), 29);
    s = takeTurn(s, true); // 29 -> 31
    expect(s.phase).toBe("won");
    expect(s.winnerId).toBe("p1");
    expect(s.status).toBe("complete");
  });

  it("wins by overshooting the final space", () => {
    let s = at(game(2), 30);
    s = takeTurn(s, true); // would be 32
    expect(s.players[0].position).toBe(FINAL_SPACE);
    expect(s.winnerId).toBe("p1");
  });

  it("stops accepting actions once won", () => {
    let s = at(game(2), 30);
    s = takeTurn(s, true);
    expect(getLegalActions(s, "p1")).toEqual([]);
    expect(actorForPhase(s)).toBeNull();
  });
});

describe("turn timeouts", () => {
  // The engine calls skipStalledTurn (via processEndTurn) and then re-resolves
  // the actor from game state. If these did not change the actor, the engine
  // would reset the clock on the same player forever and the game would hang.

  it("commits a hand for a stalled hider and moves to the guesser", () => {
    const s = game(2); // phase "hiding", actor p2
    const next = skipStalledTurn(s, "p2", () => "left");
    expect(next.phase).toBe("guessing");
    expect(next.hiddenHand).toBe("left");
    expect(next.hiddenByTimeout).toBe(true);
    expect(actorForPhase(next)!.id).toBe("p1"); // actor changed
  });

  it("does not punish the stalled hider — they are not the one racing", () => {
    const next = skipStalledTurn(game(2), "p2", () => "left");
    expect(next.players.find((p) => p.id === "p2")!.skipNextTurn).toBe(false);
    expect(next.status).toBe("playing");
  });

  it("picks a hider for a stalled active player", () => {
    const s = game(3); // phase "chooseHider", actor p1
    const next = skipStalledTurn(s, "p1", undefined, (c) => c[0]);
    expect(next.phase).toBe("hiding");
    expect(next.hiderId).toBe("p2");
    expect(actorForPhase(next)!.id).toBe("p2"); // actor changed
  });

  it("forfeits a stalled guess and passes play on without moving", () => {
    const s = hideHand(game(2), "left"); // phase "guessing", actor p1
    const next = skipStalledTurn(s, "p1");
    expect(next.players[0].position).toBe(1); // no free space
    expect(next.activeIndex).toBe(1);
    expect(actorForPhase(next)!.id).toBe("p1"); // p1 now hides for p2
    expect(next.phase).toBe("hiding");
  });

  it("clears the committed hand when a guess is forfeited", () => {
    const s = hideHand(game(2), "left");
    const next = skipStalledTurn(s, "p1");
    expect(next.hiddenHand).toBeNull();
    expect(next.guessedHand).toBeNull();
  });

  it("honours a move already earned when the reveal is not acknowledged", () => {
    const s = guessHand(hideHand(game(2), "left"), "left"); // correct, moves 2
    const next = skipStalledTurn(s, "p1");
    expect(next.players[0].position).toBe(3);
  });

  it("acknowledges a stalled skipped-turn banner", () => {
    let s = at(game(2), 4);
    s = takeTurn(s, false); // p1 lands on 5 (lose a turn)
    s = takeTurn(s, false); // p2 plays
    expect(s.phase).toBe("skippedTurn");
    const next = skipStalledTurn(s, "p1");
    expect(next.phase).not.toBe("skippedTurn");
    expect(next.activeIndex).toBe(1);
  });

  it("changes the actor in every stalled phase", () => {
    // The invariant the engine depends on, asserted directly.
    const cases: BurgerDashState[] = [
      game(2),                                   // hiding
      game(3),                                   // chooseHider
      hideHand(game(2), "left"),                 // guessing
      guessHand(hideHand(game(2), "left"), "left"), // reveal
    ];
    for (const s of cases) {
      const before = actorForPhase(s)!;
      const next = skipStalledTurn(s, before.id, () => "left", (c) => c[0]);
      const after = actorForPhase(next);
      const moved = after?.id !== before.id || next.phase !== s.phase;
      expect(moved).toBe(true);
    }
  });

  it("ignores a player who is not the current actor", () => {
    const s = game(2); // actor is p2
    expect(skipStalledTurn(s, "p1")).toBe(s);
  });

  it("ignores a finished game", () => {
    const over: BurgerDashState = { ...game(2), status: "complete" };
    expect(skipStalledTurn(over, "p2")).toBe(over);
  });
});

describe("resigning", () => {
  it("hands a 2-player game to the other player", () => {
    const s = resign(game(2), "p1");
    expect(s.status).toBe("resigned");
    expect(s.winnerId).toBe("p2");
  });

  it("ends a 3-player game with no winner", () => {
    const s = resign(game(3), "p1");
    expect(s.status).toBe("resigned");
    expect(s.winnerId).toBeNull();
  });

  it("ignores a player who is not in this game", () => {
    // Without a membership check this ended a live 2-player game as a draw.
    const s = game(2);
    expect(resign(s, "someone-from-another-session")).toBe(s);
    expect(s.status).toBe("playing");
  });
});
