import type { CSSProperties } from 'react'
import { WORD } from '../game/config.ts'
import type { FallingWord, Side } from '../game/types/game.ts'

interface TypingLaneProps {
  words: readonly FallingWord[]
  side: Side
}

const laneStyle: CSSProperties = {
  position: 'relative',
  height: '100%',
  minWidth: 0,
  borderBottom: '2px dashed #3a4160',
}

const chipBase: CSSProperties = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 21,
  fontWeight: 600,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  border: '1px solid',
}

function TypingLane({ words, side }: TypingLaneProps) {
  const mine = words.filter((word) => word.side === side)

  return (
    <div style={laneStyle} data-lane={side}>
      {mine.map((word) => {
        const missed = word.state === 'missed'
        return (
          <div
            key={word.id}
            data-word={word.word}
            data-state={word.state}
            style={{
              ...chipBase,
              top: `${word.y * 100}%`,
              left: `${((word.slot + 0.5) / WORD.slotsPerSide) * 100}%`,
              opacity: missed ? word.fade * 0.6 : 1,
              color: missed ? '#6a7290' : '#f2f4fb',
              background: missed ? 'transparent' : '#1d2233',
              borderColor: missed ? '#2b3047' : '#48507a',
              textDecoration: missed ? 'line-through' : 'none',
            }}
          >
            {word.word}
          </div>
        )
      })}
    </div>
  )
}

export { TypingLane }
