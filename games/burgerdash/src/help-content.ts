export const BURGERDASH_HELP_TITLE = "Burger Dash";

export const BURGERDASH_HELP_CONTENT = `
# Burger Dash

A race along 31 spaces to the burger, for 2 to 4 players. Hide a crayon in one
hand, guess which hand, and move.

## A Turn

Each turn takes two players:

1. **Pick a hider.** The active player asks another player to hide the crayon.
   In a 2-player game the other player is chosen automatically.
2. **The hider hides.** That player secretly picks their left or right hand.
   Nobody else — not even the server's reply to the other players — is told
   which hand until the guess is locked in.
3. **The active player guesses.** Left or right.

- **Correct guess** → move **2** spaces.
- **Wrong guess** → move **1** space.

Every space you land on or pass through gets a circle in your crayon colour.

## The Board

| Row | Spaces |
|-----|--------|
| 1 | 1 Start · 2 · 3 · 4 · 5 **Lose a Turn** · 6 · 7 · 8 **Jump to 13** · 9 · 10 |
| 2 | 11 **Move to 12** · 12 · 13 · 14 · 15 **Jump to 20** · 16 · 17 |
| 3 | 18 **Move to 19** · 19 · 20 · 21 · 22 **Lose a Turn** · 23 **Jump to 26** · 24 · 25 |
| 4 | 26 · 27 · 28 · 29 **Lose a Turn** · 30 · 31 **Winner!** |

- **Jump / Move** spaces send you ahead immediately. The space you land on does
  not trigger again — you never chain two hops in one turn.
- **Lose a Turn** costs you your next turn.
- Reaching **or passing** space 31 wins. No exact landing needed.

## Waiting on Another Player

Because a turn needs the hider to act before the guesser, play can pause on
someone else. Nobody can stall a game by walking away — if the player being
waited on runs out of time, the server settles their turn and play continues:

- **A hider who does not choose** has a hand picked at random. They are not
  penalised — they are not the one racing. The reveal says when this happened.
- **A guesser who does not guess** forfeits that guess: they do not move, and
  play passes to the next player.

## AI Players

Any seat can be an AI. AI players both hide and guess instantly.

Guessing a hidden hand is a coin flip, so the difficulty setting does not make
the AI a better guesser — there is no such thing. It only changes how long the
AI pauses before acting.
`;

export const HELP_REGISTRY: Record<string, { title: string; content: string }> = {
  burgerdash: {
    title: BURGERDASH_HELP_TITLE,
    content: BURGERDASH_HELP_CONTENT,
  },
};
