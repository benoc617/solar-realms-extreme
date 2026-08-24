/**
 * Burger Dash — game registration side-effect module.
 *
 * Import this once at app startup (via game-bootstrap.ts).
 */

import { registerGame } from "@dge/engine/registry";
import { burgerDashGameDefinition } from "@dge/burgerdash";
import { burgerDashHttpAdapter } from "@/lib/burgerdash-http-adapter";
import type { GameMetadata } from "@dge/shared";

const burgerDashMetadata: GameMetadata = {
  game: "burgerdash",
  displayName: "Burger Dash",
  description:
    "Hide a crayon, guess the hand, race 31 spaces to the burger. 2-4 players.",
  playerRange: [2, 4],
  supportsJoin: true,
  autoCreateAI: false,
  createOptions: [
    {
      key: "opponentMode",
      label: "Opponents",
      description: "Play against AI immediately, or invite people to join.",
      type: "select",
      default: "ai",
      options: [
        { value: "ai", label: "AI opponents" },
        { value: "human", label: "Humans (invite)" },
      ],
    },
    {
      key: "playerCount",
      label: "Players",
      description: "How many seats at the table, including you.",
      type: "number",
      default: 2,
      min: 2,
      max: 4,
    },
    {
      key: "aiDifficulty",
      label: "AI Speed",
      description:
        "Guessing a hidden hand is a coin flip, so this only changes how long AI players pause before acting.",
      type: "select",
      default: "medium",
      options: [
        { value: "easy", label: "Dawdling" },
        { value: "medium", label: "Snappy" },
        { value: "hard", label: "Instant" },
      ],
    },
  ],
};

registerGame("burgerdash", {
  definition: burgerDashGameDefinition,
  metadata: burgerDashMetadata,
  adapter: burgerDashHttpAdapter,
  hooks: {
    turnOrder: {
      async runTick() {}, // Burger Dash has no economy tick

      /**
       * Engine auto-skip on turn timeout.
       *
       * This MUST leave the game with a different actor. The engine calls this
       * and then re-resolves the current player from game state; because
       * `getActivePlayers` below returns a single player, the engine's own
       * `nextPlayer` fallback cannot advance anything on its own. If the game
       * state does not move, the session hangs on the absent player with its
       * clock reset on every poll.
       *
       * `skipStalledTurn` resolves every stalled phase — see its doc comment
       * for how each one is settled.
       */
      async processEndTurn(playerId: string) {
        const { getDb } = await import("@dge/engine/db-context");
        const player = await getDb().player.findUnique({
          where: { id: playerId },
          select: { gameSessionId: true },
        });
        if (!player?.gameSessionId) return;

        const { loadBurgerDashState, saveBurgerDashState, skipStalledTurn } =
          await import("@dge/burgerdash");

        let state;
        try {
          state = await loadBurgerDashState(player.gameSessionId);
        } catch {
          return;
        }
        if (state.status !== "playing") return;

        const next = skipStalledTurn(state, playerId);
        if (next === state) return; // not this player's move — nothing to skip
        await saveBurgerDashState(player.gameSessionId, next);
      },

      /**
       * Return only the player the game is currently waiting on.
       *
       * This is the mechanism that makes a two-player turn work: during
       * `hiding` this returns the hider, so `advanceTurn` parks
       * `currentTurnPlayerId` on them until they commit, then moves to the
       * guesser. The engine never needs to know what a crayon is.
       */
      async getActivePlayers(sessionId: string) {
        const { getDb } = await import("@dge/engine/db-context");
        const db = getDb();

        const allPlayers = () =>
          db.player.findMany({
            where: { gameSessionId: sessionId },
            orderBy: { turnOrder: "asc" },
            select: { id: true, name: true, isAI: true, turnOrder: true },
          });

        const session = await db.gameSession.findUnique({
          where: { id: sessionId },
          select: { log: true },
        });
        const raw = session?.log;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          return allPlayers();
        }

        const { actorForPhase } = await import("@dge/burgerdash");
        const state = raw as unknown as import("@dge/burgerdash").BurgerDashState;
        const actor = actorForPhase(state);
        if (!actor) return allPlayers();

        const p = await db.player.findUnique({
          where: { id: actor.id },
          select: { id: true, name: true, isAI: true, turnOrder: true },
        });
        return p ? [p] : [];
      },
    },
  },
});
