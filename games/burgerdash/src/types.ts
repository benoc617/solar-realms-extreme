/**
 * Burger Dash — state types.
 *
 * Ported from the pass-and-play original (benoc617/burgerdash). The board and
 * movement rules are unchanged; the turn phases differ because DGE players each
 * have their own screen.
 *
 * The original used four phases (`handoffToHider`, `hiderChoose`,
 * `handoffToGuesser`, `guess`) to manage passing one physical device between
 * people. Networked play needs no hand-off screens, so those collapse to two
 * phases that each block on a *different* player:
 *
 *   chooseHider -> hiding (hider acts) -> guessing (active player acts) -> reveal
 *
 * `hiddenHand` is never sent to a client before `reveal`; see
 * `projectState` in definition.ts.
 */

/** Which hand the crayon is hidden in. */
export type Hand = "left" | "right";

export type SpaceKind = "start" | "plain" | "loseTurn" | "jump" | "move" | "winner";

/** Decorative character drawn on a space. */
export type ArtKey = "apple" | "drink" | "fries" | "parachute" | "star" | "burger";

export interface Space {
  id: number;
  /** 0-based grid position on the 10 x 4 design grid. */
  row: number;
  col: number;
  kind: SpaceKind;
  /** Destination for `jump` / `move` spaces. */
  target?: number;
  label?: string;
  art?: ArtKey;
  /** Direction of travel drawn on the space. */
  arrow?: "right" | "left" | "down";
}

export type ColorKey = "red" | "blue" | "green" | "orange" | "purple" | "pink";

export interface BdPlayer {
  /** DGE Player row id. */
  id: string;
  name: string;
  color: ColorKey;
  isAI: boolean;
  /** Space id the player currently occupies (1..31). */
  position: number;
  /** Set by a "Lose a Turn" space; consumed at the start of their next turn. */
  skipNextTurn: boolean;
}

export type Phase =
  /** Active player picks who will hide the crayon (auto-resolved with 2 players). */
  | "chooseHider"
  /** Waiting on the hider to commit a hand. Blocks on `hiderId`, not the active player. */
  | "hiding"
  /** Waiting on the active player to guess. */
  | "guessing"
  /** Both hands open; shows right/wrong and how many spaces to move. */
  | "reveal"
  /** Banner for the jump / move / lose-a-turn effect of the space landed on. */
  | "spaceEffect"
  /** Banner shown when a player's turn is skipped. */
  | "skippedTurn"
  | "won";

export interface SpaceEffect {
  kind: "jump" | "move" | "loseTurn";
  from: number;
  to?: number;
}

export type BdStatus = "playing" | "complete" | "resigned" | "timeout";

export interface BurgerDashState {
  players: BdPlayer[];
  activeIndex: number;
  phase: Phase;
  hiderId: string | null;

  /**
   * The committed hand. SERVER-ONLY until `phase === "reveal"` — stripped by
   * `projectState` for every client, including the hider's own, so it can never
   * leak through the status route.
   */
  hiddenHand: Hand | null;
  guessedHand: Hand | null;

  /** 1 (wrong) or 2 (correct), decided by the guess. */
  moveAmount: number;
  /** Space id -> ids of players who have landed there, in landing order. */
  landedBy: Record<number, string[]>;
  effect: SpaceEffect | null;

  status: BdStatus;
  winnerId: string | null;
  /** Completed turns, incremented when a guess resolves. */
  turnCount: number;

  /**
   * True when the server auto-committed the hand because the hider timed out.
   * Surfaced in the reveal banner so players know why.
   */
  hiddenByTimeout?: boolean;

  /** AI difficulty chosen at session creation. Default "medium" when absent. */
  aiDifficulty?: "easy" | "medium" | "hard";
}
