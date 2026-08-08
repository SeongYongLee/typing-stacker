import { useEffect, useRef, type CSSProperties } from 'react'
import { WORD } from '../game/config.ts'
import type { FallingWord, Side } from '../game/types/game.ts'
import { play } from './animate.ts'

interface TypingLaneProps {
  words: readonly FallingWord[]
  side: Side
  /** 상대가 지목한 단어. 대전에서만 넘어온다 */
  suggested?: string | null
}

const SUGGESTED = '#ffcf5c'

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

function TypingLane({ words, side, suggested = null }: TypingLaneProps) {
  const mine = words.filter((word) => word.side === side)

  return (
    <div style={laneStyle} data-lane={side}>
      {mine.map((word) => (
        <Chip
          key={word.id}
          word={word}
          suggested={word.state === 'active' && word.word === suggested}
        />
      ))}
    </div>
  )
}

/**
 * 지목된 단어는 아래 안내문만으로는 눈에 들어오지 않는다 — 시선이 내려오는 글자에
 * 붙어 있기 때문이다. 그래서 그 칩 자체가 맥박한다.
 *
 * 맥박은 WAAPI로 돌린다. 엔진이 매 프레임 리렌더를 밀어 CSS transition은 끊기고,
 * y가 매 프레임 바뀌어도 애니메이션은 다시 시작되지 않는다.
 */
function Chip({ word, suggested }: { word: FallingWord; suggested: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const missed = word.state === 'missed'

  useEffect(() => {
    if (!suggested) {
      return
    }
    const pulse = play(
      ref.current,
      [
        { transform: 'translate(-50%, -50%) scale(1)' },
        { transform: 'translate(-50%, -50%) scale(1.12)' },
        { transform: 'translate(-50%, -50%) scale(1)' },
      ],
      { duration: 780, iterations: Number.POSITIVE_INFINITY, easing: 'ease-in-out' },
    )
    return () => pulse?.cancel()
  }, [suggested])

  return (
    <div
      ref={ref}
      data-word={word.word}
      data-state={word.state}
      data-suggested={suggested ? '' : undefined}
      style={{
        ...chipBase,
        top: `${word.y * 100}%`,
        left: `${((word.slot + 0.5) / WORD.slotsPerSide) * 100}%`,
        opacity: missed ? word.fade * 0.6 : 1,
        color: missed ? '#6a7290' : suggested ? '#ffe9b8' : '#f2f4fb',
        background: missed ? 'transparent' : suggested ? 'rgba(255, 207, 92, 0.16)' : '#1d2233',
        borderColor: missed ? '#2b3047' : suggested ? SUGGESTED : '#48507a',
        boxShadow: suggested && !missed ? `0 0 14px rgba(255, 207, 92, 0.45)` : 'none',
        textDecoration: missed ? 'line-through' : 'none',
      }}
    >
      {word.word}
    </div>
  )
}

export { TypingLane }
