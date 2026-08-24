import type { Space } from "./types"

export const FINAL_SPACE = 31

/** Design grid the board is laid out on. */
export const GRID_COLS = 10
export const GRID_ROWS = 4

/**
 * The 31 spaces of the board, in a four-row snake:
 *   row 0: 1..10  left to right
 *   row 1: 11..17 right to left
 *   row 2: 18..25 left to right
 *   row 3: 26..31 right to left
 *
 * Rows 1-3 start further in than row 0, which leaves the lower-left corner of
 * the grid free for the title, the player roster and the turn panel.
 */
export const BOARD: Space[] = [
  { id: 1, row: 0, col: 0, kind: 'start', label: 'Start', art: 'apple', arrow: 'right' },
  { id: 2, row: 0, col: 1, kind: 'plain', arrow: 'right' },
  { id: 3, row: 0, col: 2, kind: 'plain', arrow: 'right' },
  { id: 4, row: 0, col: 3, kind: 'plain', arrow: 'right' },
  { id: 5, row: 0, col: 4, kind: 'loseTurn', label: 'Lose a Turn' },
  { id: 6, row: 0, col: 5, kind: 'plain', arrow: 'right' },
  { id: 7, row: 0, col: 6, kind: 'plain', arrow: 'right' },
  { id: 8, row: 0, col: 7, kind: 'jump', target: 13, label: 'Jump to 13', art: 'parachute' },
  { id: 9, row: 0, col: 8, kind: 'plain', arrow: 'right' },
  { id: 10, row: 0, col: 9, kind: 'plain', arrow: 'down' },

  { id: 11, row: 1, col: 9, kind: 'move', target: 12, label: 'Move to 12', art: 'drink' },
  { id: 12, row: 1, col: 8, kind: 'plain', arrow: 'left' },
  { id: 13, row: 1, col: 7, kind: 'plain', art: 'star' },
  { id: 14, row: 1, col: 6, kind: 'plain', arrow: 'left' },
  { id: 15, row: 1, col: 5, kind: 'jump', target: 20, label: 'Jump to 20', art: 'parachute' },
  { id: 16, row: 1, col: 4, kind: 'plain', arrow: 'left' },
  { id: 17, row: 1, col: 3, kind: 'plain', arrow: 'down' },

  { id: 18, row: 2, col: 2, kind: 'move', target: 19, label: 'Move to 19', art: 'fries' },
  { id: 19, row: 2, col: 3, kind: 'plain', arrow: 'right' },
  { id: 20, row: 2, col: 4, kind: 'plain', art: 'star' },
  { id: 21, row: 2, col: 5, kind: 'plain', arrow: 'right' },
  { id: 22, row: 2, col: 6, kind: 'loseTurn', label: 'Lose a Turn' },
  { id: 23, row: 2, col: 7, kind: 'jump', target: 26, label: 'Jump to 26', art: 'parachute' },
  { id: 24, row: 2, col: 8, kind: 'plain', arrow: 'right' },
  { id: 25, row: 2, col: 9, kind: 'plain', arrow: 'down' },

  { id: 26, row: 3, col: 9, kind: 'plain', art: 'star' },
  { id: 27, row: 3, col: 8, kind: 'plain', arrow: 'left' },
  { id: 28, row: 3, col: 7, kind: 'plain', arrow: 'left' },
  { id: 29, row: 3, col: 6, kind: 'loseTurn', label: 'Lose a Turn' },
  { id: 30, row: 3, col: 5, kind: 'plain', arrow: 'left' },
  { id: 31, row: 3, col: 4, kind: 'winner', label: 'Winner!', art: 'burger' },
]

const BY_ID = new Map(BOARD.map((s) => [s.id, s]))

export function getSpace(id: number): Space {
  const space = BY_ID.get(id)
  if (!space) throw new Error(`No board space with id ${id}`)
  return space
}
