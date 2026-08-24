"use client";

/**
 * Burger Dash in-game UI.
 *
 * The board is drawn on a fixed 1754x772 design canvas (the original's 1600x772
 * plus the 11th column added to align the snake) and scaled to fit, so the whole
 * board is always visible with no scrolling.
 *
 * The screen is driven entirely by `phase` + `waitingOn` from the status
 * payload. Because a Burger Dash turn blocks on two different players, "is it
 * my turn?" is not the right question — the UI asks "am I the one being waited
 * on, and what for?" That is what makes the same component render both the
 * hider's private choice and the guesser's guess.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { HelpModal } from "@/components/HelpModal";
import { Character, Arrow, HandIcon } from "@dge/burgerdash/art/characters";
import {
  CRAYON_COLORS,
  DESIGN_H,
  DESIGN_W,
  PANEL_RECT,
  ROSTER_RECT,
  TEXT_INSET,
  TITLE_RECT,
  TITLE_SAFE_W,
  tileCenter,
  tileRect,
} from "@dge/burgerdash/layout";
import type { BdPlayer, ColorKey, Hand, Phase, Space } from "@dge/burgerdash";

// ---------------------------------------------------------------------------
// Status payload
// ---------------------------------------------------------------------------

interface BdStatus {
  playerId: string;
  name: string;
  galaxyName: string | null;
  inviteCode: string | null;
  waitingForGameStart?: boolean;

  isYourTurn: boolean;
  waitingOn: { id: string; name: string } | null;
  gameStatus: string;
  phase: Phase;
  winner: string | null;

  board: Space[];
  finalSpace: number;
  players: BdPlayer[];
  activePlayerId: string | null;
  hiderId: string | null;
  landedBy: Record<string, string[]>;
  effect: { kind: string; from: number; to?: number } | null;

  myColor: ColorKey | null;
  myPosition: number;
  amHider: boolean;

  hiddenHand: Hand | null;
  guessedHand: Hand | null;
  moveAmount: number;
  hiddenByTimeout: boolean;

  legalActions: { action: string; params: Record<string, unknown>; label: string }[];
}

export interface BurgerDashGameScreenProps {
  playerName: string;
  sessionPlayerId: string | null;
  gameSessionId: string | null;
  initialInviteCode: string;
  initialGalaxyName: string;
  initialIsPublic: boolean;
  isCreator: boolean;
  initialEvents: string[];
  onLogout: () => void;
}

const POLL_MS = 2000;

/** SVG text does not wrap or ellipsize — cap long names before drawing them. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function BurgerDashGameScreen({
  playerName,
  sessionPlayerId,
  onLogout,
}: BurgerDashGameScreenProps) {
  const [status, setStatus] = useState<BdStatus | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpContent, setHelpContent] = useState<{ title: string; content: string } | null>(null);
  const [scale, setScale] = useState(1);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Scale the fixed design canvas to the viewport ──
  useEffect(() => {
    const fit = () => {
      // Reserve the chrome that sits outside the board: header, prompt strip
      // and the action bar. Without the action bar in this budget the board
      // scales too large and pushes the hand buttons below the fold.
      const CHROME_H = 44 + 40 + 116;
      const w = window.innerWidth - 16;
      const h = window.innerHeight - CHROME_H;
      setScale(Math.max(0.2, Math.min(w / DESIGN_W, h / DESIGN_H, 1)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // ── Status polling ──
  const fetchStatus = useCallback(async () => {
    if (!sessionPlayerId) return;
    try {
      const res = await apiFetch(`/api/game/status?id=${sessionPlayerId}`);
      if (res.ok) setStatus((await res.json()) as BdStatus);
    } catch {
      /* transient — the next poll retries */
    }
  }, [sessionPlayerId]);

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  const act = useCallback(
    async (action: string, params: Record<string, unknown> = {}) => {
      if (!sessionPlayerId || submitting) return;
      setSubmitting(true);
      setMessage("");
      try {
        const res = await apiFetch("/api/game/action", {
          method: "POST",
          body: JSON.stringify({ playerId: sessionPlayerId, playerName, action, ...params }),
        });
        const data = await res.json().catch(() => ({}));
        if (data && data.success === false) {
          setMessage(String(data.error ?? data.message ?? "That move was not allowed."));
        } else if (data?.message) {
          setMessage(String(data.message));
        }
        await fetchStatus();
      } catch {
        setMessage("Could not reach the server.");
      } finally {
        setSubmitting(false);
      }
    },
    [sessionPlayerId, playerName, submitting, fetchStatus],
  );

  const openHelp = useCallback(async () => {
    setShowHelp(true);
    if (helpContent) return;
    try {
      const res = await apiFetch("/api/game/help?game=burgerdash");
      if (res.ok) setHelpContent(await res.json());
    } catch {
      /* ignore */
    }
  }, [helpContent]);

  if (!status) {
    return (
      <div className="min-h-screen bg-black text-green-400 flex items-center justify-center font-mono">
        Loading Burger Dash…
      </div>
    );
  }

  if (status.waitingForGameStart) {
    return (
      <div className="min-h-screen bg-black text-green-400 flex flex-col items-center justify-center font-mono gap-4">
        <div className="text-yellow-400 text-xl">Waiting for players to join…</div>
        {status.inviteCode && (
          <div>
            Invite code: <span className="text-yellow-400">{status.inviteCode}</span>
          </div>
        )}
        <button onClick={onLogout} className="mt-4 border border-green-700 px-4 py-2 hover:bg-green-950">
          Leave
        </button>
      </div>
    );
  }

  const me = status.players.find((p) => p.id === status.playerId);
  const active = status.players.find((p) => p.id === status.activePlayerId);
  const hider = status.players.find((p) => p.id === status.hiderId);
  const waitingOnMe = status.waitingOn?.id === status.playerId;
  const over = status.gameStatus !== "playing";

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-green-900">
        <div className="flex items-baseline gap-3">
          <span className="text-yellow-400 font-bold">BURGER DASH</span>
          <span className="text-green-600 text-sm">{status.galaxyName}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {status.inviteCode && <span className="text-green-600">Invite: {status.inviteCode}</span>}
          <button onClick={openHelp} className="border border-green-700 px-2 py-1 hover:bg-green-950">
            Help
          </button>
          {!over && (
            <button
              onClick={() => act("resign")}
              disabled={submitting}
              className="border border-red-800 text-red-400 px-2 py-1 hover:bg-red-950 disabled:opacity-40"
            >
              Resign
            </button>
          )}
          <button onClick={onLogout} className="border border-green-700 px-2 py-1 hover:bg-green-950">
            Exit
          </button>
        </div>
      </div>

      {/* ── Prompt strip: who the game is waiting on and why ── */}
      <div className="px-4 py-2 border-b border-green-900 text-sm min-h-[2.5rem] flex items-center">
        <PromptLine
          status={status}
          waitingOnMe={waitingOnMe}
          active={active}
          hider={hider}
          me={me}
        />
        {message && <span className="ml-4 text-green-600">{message}</span>}
      </div>

      {/* ── Board ── */}
      <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0">
        <div
          style={{
            width: DESIGN_W * scale,
            height: DESIGN_H * scale,
          }}
        >
          <svg
            viewBox={`0 0 ${DESIGN_W} ${DESIGN_H}`}
            width={DESIGN_W * scale}
            height={DESIGN_H * scale}
          >
            <defs>
              {/* The text blocks live in the tile-free lower-left corner.
                  Clipping to their rects means no name or message can ever
                  overlap the playing squares, however long it is. */}
              <clipPath id="bd-title-clip">
                <rect x={TITLE_RECT.x} y={TITLE_RECT.y} width={TITLE_RECT.w} height={TITLE_RECT.h} />
              </clipPath>
              <clipPath id="bd-roster-clip">
                <rect x={ROSTER_RECT.x} y={ROSTER_RECT.y} width={ROSTER_RECT.w} height={ROSTER_RECT.h} />
              </clipPath>
              <clipPath id="bd-panel-clip">
                <rect x={PANEL_RECT.x} y={PANEL_RECT.y} width={PANEL_RECT.w} height={PANEL_RECT.h} />
              </clipPath>
            </defs>

            <rect x={0} y={0} width={DESIGN_W} height={DESIGN_H} fill="#fdf6e6" rx={18} />

            {status.board.map((space) => (
              <BoardTile
                key={space.id}
                space={space}
                landed={status.landedBy[String(space.id)] ?? []}
                players={status.players}
              />
            ))}

            {/* Player tokens */}
            {status.players.map((p, i) => {
              const space = status.board.find((s) => s.id === p.position);
              if (!space) return null;
              const c = tileCenter(space);
              const ink = CRAYON_COLORS[p.color].ink;
              // Fan tokens out so overlapping players stay distinguishable.
              const offset = (i - (status.players.length - 1) / 2) * 26;
              return (
                <g key={p.id} transform={`translate(${c.x + offset} ${c.y + 34})`}>
                  <circle r={16} fill={ink} stroke="#2b2b2b" strokeWidth={3} />
                  <text
                    textAnchor="middle"
                    y={6}
                    fontSize={18}
                    fill="#fff"
                    fontWeight="bold"
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* Title block in the free lower-left corner.
                Clipped so it can never run underneath the tiles. */}
            <g clipPath="url(#bd-title-clip)">
              <g transform={`translate(${TITLE_RECT.x + TEXT_INSET} ${TITLE_RECT.y + 60})`}>
                <text fontSize={52} fontWeight="bold" fill="#d0483c">
                  Burger Dash
                </text>
                <text
                  y={40}
                  fontSize={20}
                  fill="#7a6a55"
                  textLength={TITLE_SAFE_W}
                  lengthAdjust="spacingAndGlyphs"
                >
                  Hide the crayon. Guess the hand.
                </text>
                <text y={66} fontSize={20} fill="#7a6a55">
                  Race to the burger.
                </text>
              </g>
            </g>

            {/* Roster — clipped, with long names truncated so a player
                called something enormous cannot cover the board. */}
            <g clipPath="url(#bd-roster-clip)">
              <g transform={`translate(${ROSTER_RECT.x + TEXT_INSET} ${ROSTER_RECT.y + 28})`}>
                {status.players.map((p, i) => {
                  const c = CRAYON_COLORS[p.color];
                  const isActor = status.waitingOn?.id === p.id;
                  return (
                    <g key={p.id} transform={`translate(0 ${i * 34})`}>
                      <circle cx={12} cy={-6} r={11} fill={c.ink} />
                      <text
                        x={32}
                        fontSize={20}
                        fill={isActor ? "#d0483c" : "#3b3b3b"}
                        fontWeight={isActor ? "bold" : "normal"}
                      >
                        {truncate(p.name, 14)}
                        {p.isAI ? " (AI)" : ""} — {p.position}
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>

            {/* Interaction panel */}
            <g clipPath="url(#bd-panel-clip)">
              <g transform={`translate(${PANEL_RECT.x + TEXT_INSET} ${PANEL_RECT.y + 20})`}>
                <text fontSize={22} fill="#7a6a55">
                {over
                  ? status.winner
                    ? `${status.players.find((p) => p.id === status.winner)?.name ?? "Someone"} wins!`
                    : "Game over."
                    : `Waiting on ${truncate(status.waitingOn?.name ?? "…", 18)}`}
                </text>
              </g>
            </g>
          </svg>
        </div>
      </div>

      {/* ── Action bar ── */}
      <div className="border-t border-green-900 px-4 py-3 min-h-[7rem] flex items-center justify-center">
        <ActionBar status={status} waitingOnMe={waitingOnMe} submitting={submitting} act={act} />
      </div>

      {showHelp && (
        <HelpModal
          title={helpContent?.title ?? "Burger Dash"}
          content={helpContent?.content ?? "Loading…"}
          onClose={() => setShowHelp(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt line
// ---------------------------------------------------------------------------

function PromptLine({
  status,
  waitingOnMe,
  active,
  hider,
}: {
  status: BdStatus;
  waitingOnMe: boolean;
  active?: BdPlayer;
  hider?: BdPlayer;
  me?: BdPlayer;
}) {
  if (status.gameStatus !== "playing") {
    const winner = status.players.find((p) => p.id === status.winner);
    return (
      <span className="text-yellow-400">
        {winner ? `${winner.name} reached the burger and wins!` : "Game over."}
      </span>
    );
  }

  const who = status.waitingOn?.name ?? "…";

  switch (status.phase) {
    case "chooseHider":
      return waitingOnMe ? (
        <span className="text-yellow-400">Who should hide the crayon?</span>
      ) : (
        <span>Waiting for {who} to pick someone to hide the crayon…</span>
      );
    case "hiding":
      return waitingOnMe ? (
        <span className="text-yellow-400">
          Hide the crayon — {active?.name ?? "the other player"} will try to guess. Nobody else can see your choice.
        </span>
      ) : (
        <span>{hider?.name ?? who} is hiding the crayon…</span>
      );
    case "guessing":
      return waitingOnMe ? (
        <span className="text-yellow-400">
          {hider?.name ?? "Someone"} has hidden the crayon. Which hand?
        </span>
      ) : (
        <span>Waiting for {who} to guess…</span>
      );
    case "reveal": {
      const correct = status.guessedHand === status.hiddenHand;
      return (
        <span className={correct ? "text-yellow-400" : "text-green-500"}>
          The crayon was in the {status.hiddenHand} hand —{" "}
          {correct ? "correct!" : "wrong."} {active?.name} moves {status.moveAmount}.
          {status.hiddenByTimeout && " (auto-hidden — the hider ran out of time)"}
        </span>
      );
    }
    case "spaceEffect": {
      const e = status.effect;
      if (!e) return <span>…</span>;
      if (e.kind === "loseTurn") return <span className="text-red-400">{active?.name} landed on Lose a Turn.</span>;
      return <span className="text-yellow-400">{active?.name} advances to space {e.to}.</span>;
    }
    case "skippedTurn":
      return <span className="text-red-400">{active?.name} loses this turn.</span>;
    default:
      return <span>Waiting on {who}…</span>;
  }
}

// ---------------------------------------------------------------------------
// Action bar
// ---------------------------------------------------------------------------

function ActionBar({
  status,
  waitingOnMe,
  submitting,
  act,
}: {
  status: BdStatus;
  waitingOnMe: boolean;
  submitting: boolean;
  act: (action: string, params?: Record<string, unknown>) => void;
}) {
  if (status.gameStatus !== "playing") {
    return <span className="text-green-600">The game has ended.</span>;
  }

  if (!waitingOnMe) {
    return (
      <span className="text-green-700">
        Waiting for {status.waitingOn?.name ?? "the other player"}…
      </span>
    );
  }

  switch (status.phase) {
    case "chooseHider":
      return (
        <div className="flex gap-3">
          {status.legalActions.map((a) => (
            <button
              key={String(a.params.hiderId)}
              onClick={() => act("choose_hider", { hiderId: a.params.hiderId })}
              disabled={submitting}
              className="border border-yellow-600 text-yellow-400 px-4 py-2 hover:bg-yellow-950 disabled:opacity-40"
            >
              {a.label}
            </button>
          ))}
        </div>
      );

    case "hiding":
    case "guessing": {
      const isHiding = status.phase === "hiding";
      const verb = isHiding ? "hide_hand" : "guess_hand";
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-8">
            {(["left", "right"] as Hand[]).map((hand) => (
              <button
                key={hand}
                onClick={() => act(verb, { hand })}
                disabled={submitting}
                className="flex flex-col items-center gap-1 border border-yellow-600 px-6 py-2 hover:bg-yellow-950 disabled:opacity-40"
                aria-label={`${isHiding ? "Hide in" : "Guess"} ${hand} hand`}
              >
                <HandIcon side={hand} open={false} size={72} />
                <span className="text-yellow-400 uppercase text-xs">{hand}</span>
              </button>
            ))}
          </div>
          {isHiding && (
            <span className="text-green-700 text-xs">
              Your choice is sent straight to the server — no other player can see it.
            </span>
          )}
        </div>
      );
    }

    case "reveal":
    case "spaceEffect":
    case "skippedTurn":
      return (
        <div className="flex items-center gap-6">
          {status.phase === "reveal" && status.hiddenHand && (
            <div className="flex gap-6">
              {(["left", "right"] as Hand[]).map((hand) => (
                <div key={hand} className="flex flex-col items-center">
                  <HandIcon
                    side={hand}
                    open
                    crayon={hand === status.hiddenHand ? "#d0483c" : null}
                    size={72}
                  />
                  <span
                    className={
                      hand === status.guessedHand ? "text-yellow-400 text-xs" : "text-green-700 text-xs"
                    }
                  >
                    {hand === status.guessedHand ? "your guess" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => act("continue")}
            disabled={submitting}
            className="border border-yellow-600 text-yellow-400 px-6 py-2 hover:bg-yellow-950 disabled:opacity-40"
          >
            {status.phase === "reveal" ? `Move ${status.moveAmount}` : "Continue"}
          </button>
        </div>
      );

    default:
      return <span className="text-green-700">…</span>;
  }
}

// ---------------------------------------------------------------------------
// Board tile
// ---------------------------------------------------------------------------

function BoardTile({
  space,
  landed,
  players,
}: {
  space: Space;
  landed: string[];
  players: BdPlayer[];
}) {
  const r = tileRect(space);
  const fill =
    space.kind === "winner"
      ? "#ffe9a8"
      : space.kind === "loseTurn"
        ? "#f6d0cb"
        : space.kind === "jump" || space.kind === "move"
          ? "#d9ecf6"
          : "#fffdf7";

  return (
    <g>
      <rect
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        rx={14}
        fill={fill}
        stroke="#2b2b2b"
        strokeWidth={3}
      />
      <text x={r.x + 10} y={r.y + 24} fontSize={20} fill="#7a6a55" fontWeight="bold">
        {space.id}
      </text>

      {space.art && (
        <g transform={`translate(${r.x + r.w / 2 - 32} ${r.y + 30})`}>
          <Character art={space.art} size={64} />
        </g>
      )}

      {space.arrow && !space.art && (
        <g transform={`translate(${r.x + r.w / 2 - 20} ${r.y + 46})`}>
          <Arrow direction={space.arrow} size={40} />
        </g>
      )}

      {space.label && (
        <text
          x={r.x + r.w / 2}
          y={r.y + r.h - 14}
          textAnchor="middle"
          fontSize={16}
          fill="#3b3b3b"
          fontWeight="bold"
        >
          {space.label}
        </text>
      )}

      {/* Crayon circles for everyone who has landed here */}
      {landed.map((pid, i) => {
        const p = players.find((pl) => pl.id === pid);
        if (!p) return null;
        return (
          <circle
            key={pid}
            cx={r.x + 20 + i * 20}
            cy={r.y + r.h - 34}
            r={8}
            fill="none"
            stroke={CRAYON_COLORS[p.color].ink}
            strokeWidth={3}
          />
        );
      })}
    </g>
  );
}
