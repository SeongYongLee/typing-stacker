import { useEffect, useRef, type CSSProperties } from 'react'
import { WORD } from '../game/config.ts'
import type { FallingWord, Side } from '../game/types/game.ts'
import { play } from './animate.ts'

interface TypingLaneProps {
  words: readonly FallingWord[]
  side: Side
  /**
   * 덫이 걸린 단어 → 건 사람의 색.
   * 색까지 받는 이유는 **누가 걸었는지**가 테두리로 보여야 하기 때문이다 —
   * 내가 건 것과 상대가 건 것이 같아 보이면 어느 쪽이 함정인지 알 수 없다.
   */
  harassed?: ReadonlyMap<string, string> | null
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

function TypingLane({ words, side, harassed = null }: TypingLaneProps) {
  const mine = words.filter((word) => word.side === side)

  return (
    <div style={laneStyle} data-lane={side}>
      {mine.map((word) => (
        <Chip
          key={word.id}
          word={word}
          harassColor={word.state === 'active' ? (harassed?.get(word.word) ?? null) : null}
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
function Chip({ word, harassColor }: { word: FallingWord; harassColor: string | null }) {
  const suggested = harassColor !== null
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
        color: missed ? '#6a7290' : suggested ? '#ffe1e1' : '#f2f4fb',
        // 덫은 붉은 바탕에 **건 사람의 색** 테두리다. 바탕이 위험을, 테두리가 누구인지를 말한다
        background: missed ? 'transparent' : suggested ? 'rgba(255, 107, 107, 0.22)' : '#1d2233',
        borderColor: missed ? '#2b3047' : (harassColor ?? '#48507a'),
        borderWidth: suggested ? 2 : 1,
        boxShadow: suggested && !missed ? `0 0 14px rgba(255, 207, 92, 0.45)` : 'none',
        textDecoration: missed ? 'line-through' : 'none',
      }}
    >
      {word.word}
    </div>
  )
}

export { TypingLane }
