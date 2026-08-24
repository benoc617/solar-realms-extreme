# Burger Dash — Technical Specification

Burger Dash is a 2-4 player race game ported from the standalone pass-and-play
app at [`benoc617/burgerdash`](https://github.com/benoc617/burgerdash). Players
race along 31 spaces to a burger; movement is decided by guessing which hand
another player hid a crayon in.

This document is the authoritative spec for the DGE implementation. Where the
port deviates from the original, the deviation and its reason are stated.

---

## 1. What changed in the port

The original is a single-device pass-and-play game. Its rules engine
(`src/game/`) was already pure TypeScript with no React, which is why the
movement rules transferred unchanged. What had to change is the turn model.

| Original | DGE | Why |
|---|---|---|
| `chooseHider → handoffToHider → hiderChoose → handoffToGuesser → guess` | `chooseHider → hiding → guessing` | The two `handoff*` phases exist only to manage passing one physical device between people. Networked players each have their own screen. |
| `moving` phase + `STEP` action per space | Landing resolved in one step | The UI animates from before/after positions. Every space walked through is still recorded in `landedBy`, so the crayon trail is identical. |
| Hidden hand held in client memory | Hidden hand held server-side, stripped by `projectState` | In pass-and-play a hider could peek at their own screen. Here the value never reaches any client until the reveal. |
| CPU seats | AI players (`isAI`) | Uses the engine's AI player rows and `runAiSequence`. |
| 10-column grid; 17 → 18 steps diagonally | 11-column grid; every row transition drops straight down | A 7-space row and an 8-space row cannot share both edges, so the original's snake jogged sideways at 17 → 18. Widening the grid by one column aligns all three transitions. |

Space order, movement amounts, jump/move targets, lose-a-turn behaviour and the
overshoot win are **unchanged** from the original. The only board change is the
column alignment noted in the last row above — no space was added, removed or
re-kinded.

---

## 2. The crayon mechanic on a turn-based engine

This is the only structurally interesting part of the port.

A Burger Dash turn requires **two different players to act in sequence**:

```
hider commits a hand   →   active player guesses   →   resolve & move
   (phase "hiding")          (phase "guessing")        (phase "reveal")
```

The DGE engine assumes the player whose turn it is, is the player who acts. That
assumption does not hold here — during `hiding` the game is blocked on the
hider, who is *not* the turn's owner.

### How it is resolved

`GameSession.currentTurnPlayerId` is treated as **"who the game is waiting on"**,
not "whose turn it is". The registration's `turnOrder.getActivePlayers` hook
returns exactly one player — the result of `actorForPhase(state)` — so
`advanceTurn` parks the engine on the hider until they commit, then moves to the
guesser. The engine never needs to know what a crayon is.

This is the same mechanism Gin Rummy uses to hold the engine on one player
across a multi-step turn; Burger Dash just points it at a different player
mid-turn.

`actorForPhase` maps phases to actors:

| Phase | Actor |
|---|---|
| `chooseHider` | active player |
| `hiding` | **hider** (not the active player) |
| `guessing` | active player |
| `reveal`, `spaceEffect`, `skippedTurn` | active player (acknowledges the banner) |
| `won` | nobody |

### Hidden information

`BurgerDashState.hiddenHand` is server-only until the guess is locked in.
`projectState` nulls it for **every** client — including the hider's own, since
they have already committed and echoing it back only creates a leak path.

It is revealed when `phase` is `reveal`, `spaceEffect`, `skippedTurn`, or `won`.

The HTTP adapter's `buildStatus` builds its payload from
`projectBurgerDashState(raw, playerId)`, never from raw state. The broadcast
message for `hide_hand` also deliberately does not name the hand.

### Turn timeouts

Because a turn can block on a player who is not racing, an unresponsive player
would otherwise stall the game for everyone.

`processEndTurn` delegates to the pure `skipStalledTurn`, which resolves **every**
stalled phase the way that turn would have ended anyway:

| Phase | Resolution |
|---|---|
| `hiding` | A hand is committed at random. The hider is **not** penalised — they are not the one racing, so a forfeit would be wrong. `hiddenByTimeout` records it and the reveal banner explains it. |
| `chooseHider` | A hider is picked for the active player; they still owe a guess. |
| `guessing` | The guess is forfeited: no movement, play passes on, and the committed hand is cleared. |
| `reveal` | The guess was already made, so the move it earned is honoured. |
| `spaceEffect` / `skippedTurn` | The banner is acknowledged on their behalf. |

> **`skipStalledTurn` must always change the actor.** The engine calls it and
> then re-resolves the current player from game state. Because
> `getActivePlayers` returns a *single* player, the engine's own `nextPlayer`
> fallback computes `(0 + 1) % 1 === 0` and cannot advance anything by itself.
> If the game state does not move, `getCurrentTurn` rewrites `turnStartedAt` to
> now and the session hangs on the absent player with its clock reset on every
> poll. A unit test asserts the actor changes in every stalled phase.

---

## 3. Board

31 spaces in a four-row snake, on an 11 x 4 design grid. Rows 1-3 start further
in, leaving the lower-left corner free for the title, roster and panel.

| Row | Direction | Spaces | Cols |
|-----|-----------|--------|------|
| 1 | left → right | 1 Start · 2 · 3 · 4 · 5 **Lose a Turn** · 6 · 7 · 8 **Jump to 13** · 9 · 10 | 0–9 |
| 2 | right → left | 11 **Move to 12** · 12 · 13 · 14 · 15 **Jump to 20** · 16 · 17 | 9–3 |
| 3 | left → right | 18 **Move to 19** · 19 · 20 · 21 · 22 **Lose a Turn** · 23 **Jump to 26** · 24 · 25 | 3–10 |
| 4 | right → left | 26 · 27 · 28 · 29 **Lose a Turn** · 30 · 31 **Winner!** | 10–5 |

The grid is **11 columns** wide so that every row transition is a straight
vertical drop — 10 → 11 at col 9, 17 → 18 at col 3, and 25 → 26 at col 10.
(The original repo's 10-column grid left 17 → 18 as a diagonal step, because a
7-space row and an 8-space row cannot share both edges.) A unit test asserts
that consecutive spaces are always orthogonally adjacent.

- `FINAL_SPACE = 31`, `GRID_COLS = 11`, `GRID_ROWS = 4`.
- Space kinds: `start`, `plain`, `loseTurn`, `jump`, `move`, `winner`.

### Movement rules

- **Correct guess** → move 2 spaces. **Wrong guess** → move 1 space.
- Every space **landed on or passed through** is recorded in `landedBy` (the
  crayon circle trail).
- **Jump / Move** spaces teleport the player once. The destination is settled
  **without re-applying its own effect**, so a board edit can never produce an
  endless chain of hops.
- **Lose a Turn** sets `skipNextTurn`, consumed at the start of that player's
  next turn (which enters the `skippedTurn` banner phase).
- Reaching **or passing** space 31 wins — no exact landing required.

---

## 4. State schema

Stored as JSON in `GameSession.log` (no separate tables), following the chess /
Gin Rummy pattern.

```ts
interface BurgerDashState {
  players: BdPlayer[];          // 2-4 players
  activeIndex: number;          // index into players — whose turn it is
  phase: Phase;
  hiderId: string | null;

  hiddenHand: Hand | null;      // SERVER-ONLY until reveal
  guessedHand: Hand | null;
  moveAmount: number;           // 1 or 2

  landedBy: Record<number, string[]>;  // space id -> player ids, landing order
  effect: SpaceEffect | null;

  status: "playing" | "complete" | "resigned" | "timeout";
  winnerId: string | null;
  turnCount: number;

  hiddenByTimeout?: boolean;
  aiDifficulty?: "easy" | "medium" | "hard";
}

interface BdPlayer {
  id: string;        // DGE Player row id
  name: string;
  color: ColorKey;   // red | blue | green | orange | purple | pink
  isAI: boolean;
  position: number;  // 1..31
  skipNextTurn: boolean;
}
```

---

## 5. Actions

| Action | Params | Actor | Effect |
|---|---|---|---|
| `choose_hider` | `{ hiderId }` | active player | Names who hides the crayon. Auto-resolved in 2-player games. |
| `hide_hand` | `{ hand, byTimeout? }` | hider | Commits the hidden hand. Message never names it. |
| `guess_hand` | `{ hand }` | active player | Locks the guess; sets `moveAmount` and reveals. |
| `continue` | — | active player | Acknowledges a `reveal` / `spaceEffect` / `skippedTurn` banner and advances. |
| `resign` | — | any player **in this game** | Ends the game. In a 2-player game the other player wins; with 3-4 there is no winner. Rejected for an id that is not in `state.players` — this is the one action handled before the `actorForPhase` guard, so it validates membership itself. |

> **The `choose_hider` param is `hiderId`, not `playerId`.** The action route
> spreads action params into the same object as the acting player's id, so a
> param named `playerId` silently overwrites the caller's identity and the turn
> guard rejects the request. `tests/unit/burgerdash-definition.test.ts` has a
> regression test asserting no action param is ever named `playerId`.

---

## 6. AI

Guessing a hidden hand is a coin flip and hiding has no counter-strategy, so
there is **no search** — `getBurgerDashAIMove` picks uniformly at random from
the legal actions. Claiming a smarter AI in the UI would be a lie.

`BURGERDASH_DIFFICULTY_PROFILE` exists only to satisfy the engine's standard
`aiDifficulty` option; the tiers (`Dawdling` / `Snappy` / `Instant`) carry a
`thinkMs` behaviour flag and nothing else. The create-form option is labelled
"AI Speed" and says so.

### AI kickoff

Unlike chess and Gin Rummy, a Burger Dash game can be waiting on an AI **before
any human has moved** — on turn 1 the human is the guesser, so the AI must hide
first. The orchestrator only fires `runAiSequence` *after* a human action, and
the status route's stale-turn recovery does not trigger for 90s. The adapter
therefore calls `kickoffAiIfNeeded` at the end of `onSessionCreated` and
`onPlayerJoined`.

`runAiSequence` loops while `actorForPhase(state).isAI`, so it correctly acts
for an AI that is hiding during a human's turn.

It is **serialized per session** by an in-process `aiSequenceInFlight` map: the
opening kickoff and the orchestrator's post-action fire-and-forget can both
start it at once, and the loop is an unlocked load-modify-save, so overlapping
runs would read the same state and clobber each other's move.

---

## 7. Session options

| Key | Type | Default | Notes |
|---|---|---|---|
| `opponentMode` | select | `ai` | `ai` fills seats with bots; `human` waits for joins. |
| `playerCount` | number | 2 | 2-4, clamped. Also written to `GameSession.maxPlayers`. |
| `aiDifficulty` | select | `medium` | Pacing only — see above. |
| `turnTimeoutSecs` | select | 43200 (12h) | A stalled hider is auto-hidden, not forfeited. |

Options are sent **flat** in the register body, not nested under a
`gameOptions` key — the route rest-destructures everything it does not
recognise into `gameOptions`.

---

## 8. Files

| File | Role |
|---|---|
| `games/burgerdash/src/types.ts` | State, phase and board types |
| `games/burgerdash/src/board.ts` | The 31 spaces (copied unchanged from the original) |
| `games/burgerdash/src/rules.ts` | Pure rules engine + `actorForPhase` / `getLegalActions` |
| `games/burgerdash/src/definition.ts` | `GameDefinition`, `projectState`, AI, persistence |
| `games/burgerdash/src/layout.ts` | 1754x772 design canvas geometry, text-safe rects + crayon colours |
| `games/burgerdash/src/art/characters.tsx` | Original hand-written SVG art |
| `games/burgerdash/src/help-content.ts` | In-game help |
| `src/lib/burgerdash-http-adapter.ts` | `GameHttpAdapter` — status payload, session setup |
| `src/lib/burgerdash-registration.ts` | Registry wiring + turn-order hooks |
| `src/components/BurgerDashGameScreen.tsx` | In-game UI |

## 9. Tests

| File | Covers |
|---|---|
| `tests/unit/burgerdash-rules.test.ts` | Board data, setup, the two-step crayon turn, movement, space effects, winning, resigning |
| `tests/unit/burgerdash-definition.test.ts` | `projectState` secrecy, action dispatch, turn enforcement, param-collision regression, AI |
| `tests/e2e/burgerdash/burgerdash.test.ts` | Registration, status, the AI hiding first, hidden-hand non-leakage over HTTP, role swap, help, resign |

## 10. Art

All artwork is original SVG written for the standalone project and copied here
unchanged. The placemat that inspired the game was used only as a rules
reference; none of its artwork or branding is reproduced.
