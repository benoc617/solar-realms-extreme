import type { ReactElement } from 'react'
import type { ArtKey } from '../types'

/**
 * Original, hand-written SVG characters. Nothing here is traced from or copied
 * out of the printed placemat that inspired the game.
 */

const INK = '#4a3b33'

function Face({ x = 50, y = 52, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={INK} stroke={INK}>
      <circle cx={-9} cy={-4} r={2.6} strokeWidth={0} />
      <circle cx={9} cy={-4} r={2.6} strokeWidth={0} />
      <path
        d="M -8 4 Q 0 11 8 4"
        fill="none"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </g>
  )
}

function Apple() {
  return (
    <g>
      <path
        d="M50 26 C 30 20 16 34 18 54 C 20 74 34 88 50 84 C 66 88 80 74 82 54 C 84 34 70 20 50 26 Z"
        fill="#f7fbfd"
        stroke={INK}
        strokeWidth={3}
      />
      <path d="M50 26 L 50 15" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <path
        d="M51 18 C 60 8 72 10 74 16 C 70 24 58 24 51 18 Z"
        fill="#bfe0c2"
        stroke={INK}
        strokeWidth={2.6}
      />
      <Face y={56} />
    </g>
  )
}

function Burger() {
  return (
    <g>
      <path
        d="M16 44 C 16 22 84 22 84 44 Z"
        fill="#f0c26a"
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <circle cx={38} cy={33} r={2} fill="#fff6e2" />
      <circle cx={54} cy={30} r={2} fill="#fff6e2" />
      <circle cx={66} cy={36} r={2} fill="#fff6e2" />
      <path
        d="M14 46 C 26 40 40 52 52 46 C 64 40 78 52 88 46 L 88 52 L 14 52 Z"
        fill="#a8cf8f"
        stroke={INK}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <rect x={16} y={52} width={68} height={13} rx={5} fill="#a9705a" stroke={INK} strokeWidth={3} />
      <path
        d="M18 66 C 18 82 82 82 82 66 Z"
        fill="#f0c26a"
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Face y={59} scale={0.92} />
    </g>
  )
}

function Fries() {
  return (
    <g>
      <g stroke={INK} strokeWidth={2.6} strokeLinejoin="round">
        <rect x={34} y={16} width={9} height={34} rx={3} fill="#f6d98d" />
        <rect x={46} y={10} width={9} height={40} rx={3} fill="#f6d98d" />
        <rect x={58} y={18} width={9} height={32} rx={3} fill="#f6d98d" />
      </g>
      <path
        d="M28 44 L 72 44 L 66 86 L 34 86 Z"
        fill="#e3705f"
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path d="M30 56 L 70 56" stroke="#f7e7e0" strokeWidth={4} />
      <Face y={70} scale={0.9} />
    </g>
  )
}

function Drink() {
  return (
    <g>
      <path
        d="M62 12 L 54 40"
        stroke={INK}
        strokeWidth={3.4}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M28 30 L 72 30 L 65 88 L 35 88 Z"
        fill="#f7fbfd"
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <rect x={24} y={24} width={52} height={9} rx={4} fill="#cfe1ef" stroke={INK} strokeWidth={3} />
      <path d="M31 50 L 69 50" stroke="#cfe1ef" strokeWidth={5} />
      <Face y={68} scale={0.9} />
    </g>
  )
}

function Star() {
  return (
    <g>
      <path
        d="M50 12 L 61 38 L 89 41 L 68 60 L 74 88 L 50 74 L 26 88 L 32 60 L 11 41 L 39 38 Z"
        fill="#f4c542"
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Face y={52} scale={0.95} />
      <path d="M30 84 L 26 96" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path d="M68 84 L 72 96" stroke={INK} strokeWidth={3} strokeLinecap="round" />
    </g>
  )
}

function Parachute() {
  return (
    <g>
      <path
        d="M10 46 C 10 16 90 16 90 46 C 74 40 62 40 50 46 C 38 40 26 40 10 46 Z"
        fill="#f7fbfd"
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <g stroke={INK} strokeWidth={2.4} fill="none">
        <path d="M12 45 L 44 74" />
        <path d="M50 45 L 50 72" />
        <path d="M88 45 L 56 74" />
      </g>
      <circle cx={50} cy={80} r={13} fill="#a83a2e" stroke={INK} strokeWidth={3} />
      <text
        x={50}
        y={85}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fill="#fff"
        fontFamily="inherit"
      >
        B
      </text>
    </g>
  )
}

const ART: Record<ArtKey, () => ReactElement> = {
  apple: Apple,
  burger: Burger,
  fries: Fries,
  drink: Drink,
  star: Star,
  parachute: Parachute,
}

export function Character({ art, size = 64 }: { art: ArtKey; size?: number }) {
  const Component = ART[art]
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <Component />
    </svg>
  )
}

/** The blue direction arrows printed between spaces. */
export function Arrow({
  direction,
  size = 58,
}: {
  direction: 'right' | 'left' | 'down'
  size?: number
}) {
  const rotation = direction === 'right' ? 0 : direction === 'left' ? 180 : 90
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <g transform={`rotate(${rotation} 50 50)`}>
        <path
          d="M18 42 L 58 42 L 58 26 L 86 50 L 58 74 L 58 58 L 18 58 Z"
          fill="#6b93b4"
        />
      </g>
    </svg>
  )
}

/** Closed / open hand used by the hide-and-guess mini game. */
export function HandIcon({
  side,
  open = false,
  crayon = null,
  size = 150,
}: {
  side: 'left' | 'right'
  open?: boolean
  crayon?: string | null
  size?: number
}) {
  const skin = '#f6d7bd'
  // The two hands are mirror images, so the thumb reads as left vs right.
  const flip = side === 'left' ? -1 : 1
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <g transform={`translate(${flip < 0 ? 100 : 0} 0) scale(${flip} 1)`}>
        {open ? (
          <g>
            {/* fingers */}
            <g fill={skin} stroke={INK} strokeWidth={3} strokeLinejoin="round">
              <rect x={30} y={22} width={12} height={40} rx={6} />
              <rect x={43} y={14} width={12} height={48} rx={6} />
              <rect x={56} y={18} width={12} height={44} rx={6} />
              <rect x={69} y={26} width={12} height={36} rx={6} />
              {/* thumb */}
              <rect
                x={12}
                y={50}
                width={12}
                height={30}
                rx={6}
                transform="rotate(-35 18 65)"
              />
              {/* palm */}
              <rect x={26} y={50} width={56} height={36} rx={16} />
            </g>
            {crayon && (
              <g transform="rotate(-16 54 66)">
                <rect
                  x={30}
                  y={60}
                  width={48}
                  height={15}
                  rx={3}
                  fill={crayon}
                  stroke={INK}
                  strokeWidth={2.6}
                />
                <path
                  d="M78 60 L 92 67.5 L 78 75 Z"
                  fill={crayon}
                  stroke={INK}
                  strokeWidth={2.6}
                  strokeLinejoin="round"
                />
                <path d="M44 60 L 44 75" stroke={INK} strokeWidth={2} opacity={0.45} />
                <path d="M64 60 L 64 75" stroke={INK} strokeWidth={2} opacity={0.45} />
              </g>
            )}
          </g>
        ) : (
          <g fill={skin} stroke={INK} strokeWidth={3} strokeLinejoin="round">
            {/* curled fingers */}
            <rect x={30} y={28} width={13} height={26} rx={6.5} />
            <rect x={43} y={24} width={13} height={30} rx={6.5} />
            <rect x={56} y={26} width={13} height={28} rx={6.5} />
            <rect x={69} y={32} width={12} height={22} rx={6} />
            {/* fist */}
            <rect x={26} y={44} width={56} height={42} rx={18} />
            {/* thumb folded across the front */}
            <rect
              x={22}
              y={54}
              width={14}
              height={30}
              rx={7}
              transform="rotate(-24 29 69)"
            />
            <path
              d="M40 66 L 74 66"
              stroke={INK}
              strokeWidth={2.4}
              opacity={0.4}
              fill="none"
            />
          </g>
        )}
      </g>
    </svg>
  )
}
