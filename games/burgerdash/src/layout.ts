import type { ColorKey, Space } from "./types"

/**
 * Everything is drawn on a fixed-size canvas and then scaled to the viewport,
 * so the whole board is always visible with no reflow and no scrolling.
 */
export const DESIGN_W = 1600
export const DESIGN_H = 772

export const PAD_X = 30
export const PAD_Y = 30
export const CELL_W = 154
export const CELL_H = 178
/** Gap between neighbouring tiles. */
export const TILE_GAP = 8

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Pixel rect of a whole grid cell (tiles inset themselves by TILE_GAP). */
export function cellRect(row: number, col: number, colSpan = 1, rowSpan = 1): Rect {
  return {
    x: PAD_X + col * CELL_W,
    y: PAD_Y + row * CELL_H,
    w: colSpan * CELL_W,
    h: rowSpan * CELL_H,
  }
}

export function tileRect(space: Space): Rect {
  const cell = cellRect(space.row, space.col)
  return {
    x: cell.x + TILE_GAP / 2,
    y: cell.y + TILE_GAP / 2,
    w: cell.w - TILE_GAP,
    h: cell.h - TILE_GAP,
  }
}

export function tileCenter(space: Space): { x: number; y: number } {
  const rect = tileRect(space)
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}

/**
 * The lower-left of the grid is free of spaces (rows 1-3 start further in),
 * which is where the placemat prints its rules. The same corner holds the
 * game's title, roster and turn panel.
 */
export const TITLE_RECT = cellRect(1, 0, 3)
export const ROSTER_RECT = cellRect(2, 0, 2)
export const PANEL_RECT = cellRect(3, 0, 4)

export const CRAYON_COLORS: Record<ColorKey, { ink: string; light: string; name: string }> = {
  red: { ink: '#d0483c', light: '#f2b8b2', name: 'Red' },
  blue: { ink: '#3c78c4', light: '#b6cfee', name: 'Blue' },
  green: { ink: '#4a9a55', light: '#bcdfc0', name: 'Green' },
  orange: { ink: '#e2892a', light: '#f7d3a5', name: 'Orange' },
  purple: { ink: '#8a5bbd', light: '#d6c3ec', name: 'Purple' },
  pink: { ink: '#d8629a', light: '#f5c4dc', name: 'Pink' },
}

export const COLOR_ORDER: ColorKey[] = ['red', 'blue', 'green', 'orange', 'purple', 'pink']
