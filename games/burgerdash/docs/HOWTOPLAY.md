# Burger Dash — How to Play

A race to the burger for **2 to 4 players**. Every seat can be a human or an AI.

---

## The idea

You move by guessing. Another player hides a crayon in one of their hands; you
pick a hand. Guess right and you move 2 spaces, guess wrong and you move 1.
First to reach space 31 wins.

---

## A turn, step by step

A Burger Dash turn takes **two players**, which is what makes it different from
most turn-based games — you will sometimes be asked to act during somebody
else's turn.

**1. Pick a hider.**
The player whose turn it is chooses another player to hide the crayon. In a
2-player game there is only one candidate, so this step is skipped.

**2. The hider hides.**
That player picks their left or right hand. **Nobody else can see the choice** —
it goes straight to the server and is never sent to another player's screen
until the guess is locked in. Not even the guesser's browser has it.

**3. The guesser guesses.**
Left or right.

**4. Reveal and move.**
Both hands open. Correct → move 2. Wrong → move 1.

Every space you land on **or pass through** gets a circle in your crayon colour,
so the board fills in with a record of where everyone has been.

---

## The board

31 spaces in a snake, left to right and back again:

| Row | Spaces |
|-----|--------|
| 1 | 1 Start · 2 · 3 · 4 · 5 **Lose a Turn** · 6 · 7 · 8 **Jump to 13** · 9 · 10 |
| 2 | 11 **Move to 12** · 12 · 13 · 14 · 15 **Jump to 20** · 16 · 17 |
| 3 | 18 **Move to 19** · 19 · 20 · 21 · 22 **Lose a Turn** · 23 **Jump to 26** · 24 · 25 |
| 4 | 26 · 27 · 28 · 29 **Lose a Turn** · 30 · 31 **Winner!** |

**Jump / Move spaces** send you ahead as soon as you land on them. The space you
arrive at does *not* trigger again — you never chain two hops in one turn.

**Lose a Turn** costs you your next turn. You will see a banner when it is
skipped.

**Winning:** reach **or pass** space 31. You do not need to land on it exactly,
so a lucky 2 from space 30 wins just as well as from 29.

---

## Waiting on other players

Because a turn needs a hider before it needs a guesser, the game can be waiting
on someone who is not the player whose turn it is. The screen always tells you
who it is waiting on.

If a hider does not choose within the turn timer, **the server picks a hand at
random** and play carries on — a game never stalls because one person stepped
away. When that happens, the reveal says so.

If the *guesser* runs out of time instead, they forfeit that guess: they do not
move, and play passes to the next player.

---

## Playing with AI

Any seat can be an AI. AI players hide and guess immediately, so a solo game
against bots moves at whatever speed you click.

The **AI Speed** setting does not make the AI a better guesser. Guessing which
hand holds a hidden crayon is a coin flip — there is no skill in it and no
pattern to read. The setting only changes how long AI players pause before
acting, so you can slow the game down enough to follow it.

---

## Strategy

There is not much, and that is the point — this is a children's placemat game.
The only real decision in a 3-4 player game is **who you ask to hide the
crayon**, and since every hider is equally random, even that is a matter of
taste rather than advantage. Enjoy the crayon trail.
