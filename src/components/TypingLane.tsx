import { useEffect, useRef, type CSSProperties } from 'react'
import { WORD } from '../game/config.ts'
import type { FallingWord, Side } from '../game/types/game.ts'
import { play } from './animate.ts'

interface TypingLaneProps {
  words: readonly FallingWord[]
  side: Side
  /**
   * 단어를 놓친 횟수. 이 값이 오를 때마다 바닥선이 붉게 번진다.
   *
   * 놓치면 정확도가 떨어져 점수가 깎이는데, 그 일은 화면 반대쪽(입력줄 옆 숫자)에서
   * 일어난다. 정작 놓친 자리는 이 선이므로 여기서도 한 번 알린다.
   */
  missSeq?: number
}


const LANE_LINE = '#3a4160'
const MISS_FLASH = '#ff6b6b'

const laneStyle: CSSProperties = {
  position: 'relative',
  height: '100%',
  minWidth: 0,
  borderBottom: `2px dashed ${LANE_LINE}`,
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

function TypingLane({ words, side, missSeq = 0 }: TypingLaneProps) {
  const mine = words.filter((word) => word.side === side)
  const laneRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (missSeq === 0) {
      return
    }
    play(
      laneRef.current,
      [
        { borderBottomColor: MISS_FLASH, borderBottomWidth: '3px' },
        { borderBottomColor: MISS_FLASH, borderBottomWidth: '3px', offset: 0.35 },
        { borderBottomColor: LANE_LINE, borderBottomWidth: '2px' },
      ],
      { duration: 620, easing: 'ease-out' },
    )
  }, [missSeq])

  return (
    <div ref={laneRef} style={laneStyle} data-lane={side}>
      {mine.map((word) => (
        <Chip key={word.id} word={word} />
      ))}
    </div>
  )
}

function Chip({ word }: { word: FallingWord }) {
  const missed = word.state === 'missed'

  return (
    <div
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
        borderWidth: 1,
        textDecoration: missed ? 'line-through' : 'none',
      }}
    >
      {word.word}
    </div>
  )
}

export { TypingLane }
