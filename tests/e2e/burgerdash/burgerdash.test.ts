/**
 * E2E tests for Burger Dash.
 *
 * The focus is the two-step crayon turn over HTTP: a turn blocks on the hider
 * (who is not the turn's owner), then on the guesser. The most important
 * assertion in this file is that `hiddenHand` never appears in a status payload
 * before the reveal.
 */

import { describe, it, expect, afterAll } from "vitest";
import {
  api,
  getStatus,
  doActionById,
  deleteTestGalaxySession,
  scheduleTestUserDeletion,
  uniqueGalaxy,
  uniqueName,
  pollStatusUntil,
  TEST_PASSWORD,
} from "../helpers";

const BD_GALAXY = uniqueGalaxy("BurgerDashE2E");
const BD_USER = uniqueName("bd_e2e");
let sessionId: string | null = null;
let playerId: string | null = null;

afterAll(async () => {
  if (sessionId) await deleteTestGalaxySession(sessionId);
  scheduleTestUserDeletion(BD_USER);
});

type Status = Record<string, unknown>;

describe("Burger Dash E2E", () => {
  it("registers a Burger Dash session against an AI", async () => {
    const signupRes = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        username: BD_USER,
        fullName: "Burger Dash Test",
        email: `${BD_USER}@test.local`,
        password: TEST_PASSWORD,
        passwordConfirm: TEST_PASSWORD,
      }),
    });
    expect([201, 409].includes(signupRes.status)).toBe(true);

    const res = await api("/api/game/register", {
      method: "POST",
      body: JSON.stringify({
        name: BD_USER,
        password: TEST_PASSWORD,
        game: "burgerdash",
        galaxyName: BD_GALAXY,
        // Game options are flat in the register body, not nested.
        opponentMode: "ai",
        playerCount: 2,
        aiDifficulty: "hard",
      }),
    });
    expect(res.status).toBe(201);
    const data = res.data as Status;
    expect(data.game).toBe("burgerdash");
    sessionId = data.gameSessionId as string;
    playerId = data.id as string;
    expect(sessionId).toBeTruthy();
    expect(playerId).toBeTruthy();
  });

  it("returns the board and both players", async () => {
    const res = await getStatus(playerId!);
    expect(res.status).toBe(200);
    const data = res.data as Status;

    expect(data.gameStatus).toBe("playing");
    expect(Array.isArray(data.board)).toBe(true);
    expect((data.board as unknown[]).length).toBe(31);
    expect(data.finalSpace).toBe(31);

    const players = data.players as { id: string; position: number; isAI: boolean }[];
    expect(players.length).toBe(2);
    expect(players.every((p) => p.position === 1)).toBe(true);
    expect(players.some((p) => p.isAI)).toBe(true);
    expect(data.myPosition).toBe(1);
    expect(data.myColor).toBeTruthy();
  });

  it("makes the AI hide the crayon, then waits on the human to guess", async () => {
    // The AI is the hider on turn 1, so the game should reach "guessing"
    // without the human doing anything.
    const data = await pollStatusUntil(
      playerId!,
      (d) => d.phase === "guessing",
      { timeoutMs: 30_000 },
    );

    expect(data.isYourTurn).toBe(true);
    expect((data.waitingOn as { id: string }).id).toBe(playerId);

    const legal = data.legalActions as { action: string }[];
    expect(legal.length).toBe(2);
    expect(legal.every((a) => a.action === "guess_hand")).toBe(true);
  });

  it("does not leak the hidden hand before the reveal", async () => {
    const res = await getStatus(playerId!);
    const data = res.data as Status;
    expect(data.phase).toBe("guessing");
    // The crayon is committed server-side but must not be in this payload.
    expect(data.hiddenHand).toBeNull();
    // Belt and braces: it must not appear anywhere in the serialized response.
    const body = JSON.stringify(data);
    expect(body).not.toMatch(/"hiddenHand":"(left|right)"/);
  });

  it("reveals the hand and the outcome once the guess is in", async () => {
    const res = await doActionById(playerId!, BD_USER, "guess_hand", { hand: "left" });
    expect(res.status).toBe(200);

    const data = (await getStatus(playerId!)).data as Status;
    expect(data.phase).toBe("reveal");
    // Now — and only now — the hand is disclosed.
    expect(["left", "right"]).toContain(data.hiddenHand);
    expect(data.guessedHand).toBe("left");
    const correct = data.hiddenHand === "left";
    expect(data.moveAmount).toBe(correct ? 2 : 1);
  });

  it("moves the player and colours the spaces walked through", async () => {
    const res = await doActionById(playerId!, BD_USER, "continue", {});
    expect(res.status).toBe(200);

    const data = (await getStatus(playerId!)).data as Status;
    expect(data.myPosition as number).toBeGreaterThan(1);

    const landedBy = data.landedBy as Record<string, string[]>;
    const mine = Object.entries(landedBy)
      .filter(([, ids]) => ids.includes(playerId!))
      .map(([space]) => Number(space));
    expect(mine.length).toBeGreaterThan(0);
    expect(Math.max(...mine)).toBe(data.myPosition);
  });

  it("asks the human to hide on the AI's turn — the roles swap", async () => {
    // This is the crayon mechanic's whole point: on turn 2 the AI is the
    // guesser and the *human* is the hider. So the human is being waited on
    // during someone else's turn.
    const data = await pollStatusUntil(
      playerId!,
      (d) => d.phase === "hiding",
      { timeoutMs: 30_000 },
    );

    expect(data.amHider).toBe(true);
    expect((data.waitingOn as { id: string }).id).toBe(playerId);
    // The turn belongs to the AI, even though we are the one who must act.
    expect(data.activePlayerId).not.toBe(playerId);

    const legal = data.legalActions as { action: string }[];
    expect(legal.length).toBe(2);
    expect(legal.every((a) => a.action === "hide_hand")).toBe(true);
  });

  it("rejects an action that does not belong to the current phase", async () => {
    // We are the hider; guessing is not ours to do. Rules-level rejections come
    // back as 200 + success:false (the engine reserves 4xx for turn guards).
    const res = await doActionById(playerId!, BD_USER, "guess_hand", { hand: "left" });
    const body = res.data as Status;
    expect(body.success).toBe(false);
    expect(String(body.error ?? body.message)).toMatch(/nothing to guess|not your move/i);
  });

  it("keeps the human's hidden hand out of the payload after they commit", async () => {
    const res = await doActionById(playerId!, BD_USER, "hide_hand", { hand: "right" });
    expect(res.status).toBe(200);

    // The hider must not be able to re-read their own committed hand.
    const data = (await getStatus(playerId!)).data as Status;
    if (data.phase === "hiding" || data.phase === "guessing") {
      expect(data.hiddenHand).toBeNull();
    }
  });

  it("serves Burger Dash help content", async () => {
    const res = await api("/api/game/help?game=burgerdash");
    expect(res.status).toBe(200);
    const data = res.data as Status;
    expect(data.title).toBe("Burger Dash");
    expect(data.content as string).toMatch(/crayon/i);
  });

  it("lists Burger Dash in the lobby game metadata", async () => {
    const res = await api("/api/game/list");
    if (res.status !== 200) return; // route is optional in some deployments
    const body = JSON.stringify(res.data);
    expect(body).toMatch(/burgerdash/);
  });

  it("ends the game when the player resigns", async () => {
    const before = (await getStatus(playerId!)).data as Status;
    if (before.gameStatus !== "playing") {
      // An earlier test already finished the game (the AI can win outright).
      expect(["resigned", "complete"]).toContain(before.gameStatus);
      return;
    }

    const res = await doActionById(playerId!, BD_USER, "resign", {});
    expect(res.status).toBe(200);

    const data = (await getStatus(playerId!)).data as Status;
    expect(["resigned", "complete"]).toContain(data.gameStatus);
  });
});
