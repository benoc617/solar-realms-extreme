/**
 * Burger Dash HTTP Adapter — game-specific API payload construction.
 *
 * The one rule that matters here: the status payload is built from
 * `projectBurgerDashState`, never from raw state, so the hidden crayon hand
 * cannot reach a client before the reveal.
 */

import type { GameHttpAdapter } from "@dge/shared";
import { prisma } from "@/lib/prisma";
import type { BurgerDashState } from "@dge/burgerdash";
import {
  actorForPhase,
  BOARD,
  createInitialState,
  FINAL_SPACE,
  getLegalActions,
  playerById,
  PLAYER_COLORS,
  projectBurgerDashState,
} from "@dge/burgerdash";

/** Max AI seats the create-form offers to fill. */
const MAX_PLAYERS = 4;

/**
 * Kick off the AI sequence when the game opens with an AI due to act.
 *
 * Unlike chess and gin rummy, a Burger Dash game can be waiting on an AI before
 * any human has moved: on turn 1 the human is the guesser, so the AI must hide
 * the crayon first. The orchestrator only fires `runAiSequence` *after* a human
 * action, and the status route's stale-turn recovery does not kick in for 90s,
 * so without this the opening move would hang.
 */
async function kickoffAiIfNeeded(sessionId: string, state: BurgerDashState) {
  const actor = actorForPhase(state);
  if (!actor?.isAI) return;
  const { burgerDashGameDefinition } = await import("@dge/burgerdash");
  void burgerDashGameDefinition.runAiSequence?.(sessionId).catch(() => {});
}

function readState(rawLog: unknown): BurgerDashState | null {
  return rawLog && typeof rawLog === "object" && !Array.isArray(rawLog)
    ? (rawLog as unknown as BurgerDashState)
    : null;
}

export const burgerDashHttpAdapter: GameHttpAdapter = {
  defaultTotalTurns: 9999,
  defaultActionsPerDay: 1,
  defaultTurnTimeoutSecs: 43200, // 12 hours

  getPlayerCreateData() {
    return {};
  },

  async onSessionCreated(sessionId, creatorPlayerId, options) {
    const opponentMode = (options?.opponentMode as string) || "ai";
    const aiDifficulty =
      (options?.aiDifficulty as "easy" | "medium" | "hard" | undefined) ?? "medium";
    const totalPlayers = clampPlayers(options?.playerCount);

    const creator = await prisma.player.findUnique({
      where: { id: creatorPlayerId },
      select: { id: true, name: true },
    });
    if (!creator) return;

    if (opponentMode === "human") {
      // Wait for humans to join; state is initialized in onPlayerJoined once
      // the table is full.
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          waitingForHuman: true,
          turnStartedAt: null,
          currentTurnPlayerId: null,
          maxPlayers: totalPlayers,
        },
      });
      return;
    }

    // vs AI: fill the remaining seats with AI players.
    const configs = [
      { id: creator.id, name: creator.name, color: PLAYER_COLORS[0], isAI: false },
    ];
    for (let i = 1; i < totalPlayers; i += 1) {
      const ai = await prisma.player.create({
        data: {
          name: `Dash Bot ${i}`,
          isAI: true,
          aiPersona: "random",
          turnOrder: i,
          gameSessionId: sessionId,
        },
      });
      configs.push({
        id: ai.id,
        name: ai.name,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        isAI: true,
      });
    }

    const state = createInitialState(configs, aiDifficulty);

    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        log: JSON.parse(JSON.stringify(state)),
        // The game opens on "choose a hider" (3-4p) or "hide" (2p); either way
        // the engine should be pointing at whoever must act first.
        currentTurnPlayerId: actorForPhase(state)?.id ?? creator.id,
        turnStartedAt: new Date(),
        // The table is full the moment the AI seats are created — the register
        // route's generic cap (default 50) would otherwise leave the lobby
        // advertising room that does not exist.
        maxPlayers: totalPlayers,
      },
    });

    await kickoffAiIfNeeded(sessionId, state);
  },

  async onPlayerJoined(sessionId, _playerId) {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      select: { log: true, maxPlayers: true },
    });
    if (readState(session?.log)) return; // already initialized

    const players = await prisma.player.findMany({
      where: { gameSessionId: sessionId },
      orderBy: { turnOrder: "asc" },
      select: { id: true, name: true, isAI: true },
    });

    const target = session?.maxPlayers ?? 2;
    if (players.length < Math.max(2, target)) return; // still filling seats

    const state = createInitialState(
      players.map((p, i) => ({
        id: p.id,
        name: p.name,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        isAI: p.isAI,
      })),
    );

    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        log: JSON.parse(JSON.stringify(state)),
        currentTurnPlayerId: actorForPhase(state)?.id ?? players[0].id,
        turnStartedAt: new Date(),
        waitingForHuman: false,
      },
    });

    await kickoffAiIfNeeded(sessionId, state);
  },

  async buildStatus(playerId) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        name: true,
        isAI: true,
        gameSessionId: true,
        gameSession: {
          select: {
            id: true,
            galaxyName: true,
            status: true,
            log: true,
            turnMode: true,
            currentTurnPlayerId: true,
            turnStartedAt: true,
            turnTimeoutSecs: true,
            inviteCode: true,
            isPublic: true,
            waitingForHuman: true,
            createdBy: true,
          },
        },
      },
    });

    if (!player?.gameSession) return { error: "Player not found" };

    const session = player.gameSession;
    const raw = readState(session.log);
    // Never build the payload from raw state — project it first.
    const state = raw ? projectBurgerDashState(raw, playerId) : null;

    const actor = state ? actorForPhase(state) : null;
    const me = state ? playerById(state, playerId) : undefined;

    const turnDeadline = session.turnStartedAt
      ? new Date(
          new Date(session.turnStartedAt).getTime() + session.turnTimeoutSecs * 1000,
        ).toISOString()
      : null;

    return {
      playerId: player.id,
      name: player.name,
      sessionId: session.id,
      galaxyName: session.galaxyName,
      inviteCode: session.inviteCode,
      isPublic: session.isPublic,
      isCreator: session.createdBy === player.name,
      turnMode: session.turnMode,
      waitingForGameStart: session.waitingForHuman,
      turnDeadline,
      turnTimeoutSecs: session.turnTimeoutSecs,

      // Whose input the game is blocked on right now — during "hiding" this is
      // the hider, who is not the turn's owner.
      isYourTurn: actor?.id === playerId,
      waitingOn: actor ? { id: actor.id, name: actor.name } : null,

      gameStatus: state?.status ?? "playing",
      phase: state?.phase ?? "chooseHider",
      winner: state?.winnerId ?? null,

      board: BOARD,
      finalSpace: FINAL_SPACE,
      players: state?.players ?? [],
      activePlayerId: state ? state.players[state.activeIndex]?.id ?? null : null,
      hiderId: state?.hiderId ?? null,
      landedBy: state?.landedBy ?? {},
      effect: state?.effect ?? null,
      turnCount: state?.turnCount ?? 0,

      myColor: me?.color ?? null,
      myPosition: me?.position ?? 1,
      amHider: state?.hiderId === playerId,

      // null until reveal — see projectBurgerDashState.
      hiddenHand: state?.hiddenHand ?? null,
      guessedHand: state?.guessedHand ?? null,
      moveAmount: state?.moveAmount ?? 0,
      hiddenByTimeout: state?.hiddenByTimeout ?? false,

      legalActions: state ? getLegalActions(state, playerId) : [],
      aiDifficulty: state?.aiDifficulty ?? "medium",
    };
  },

  async isGameOver(playerId) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { gameSession: { select: { status: true, log: true } } },
    });
    if (!player?.gameSession) return true;
    if (player.gameSession.status === "complete") return true;
    const state = readState(player.gameSession.log);
    return state ? state.status !== "playing" : false;
  },

  // Sequential only — no door-game (simultaneous) support.
  async getDoorGameGuards() {
    return null;
  },

  async computeHubTurnState(player, session) {
    const s = await prisma.gameSession.findUnique({
      where: { id: session.id },
      select: { log: true },
    });
    const state = readState(s?.log);
    if (!state) {
      return {
        isYourTurn: session.currentTurnPlayerId === player.id,
        currentTurnPlayer: null,
      };
    }
    const actor = actorForPhase(state);
    return {
      isYourTurn: actor?.id === player.id,
      currentTurnPlayer: actor?.name ?? null,
    };
  },
};

function clampPlayers(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 2;
  return Math.max(2, Math.min(MAX_PLAYERS, Math.floor(n)));
}
