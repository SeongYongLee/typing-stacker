import { useEffect, useRef } from 'react'
import { LIVES } from '../game/config.ts'
import { play } from './animate.ts'

const KEPT = '#ff6b6b'
const LOST = '#2e3448'

/**
 * 플레이 중 계속 확인해야 하는 두 값.
 * 시선이 아레나와 입력창(가운데·가운데 아래)에 붙어 있으므로 좌상단 HUD가 아니라
 * 입력창 양옆에 둔다 — 확인하려고 눈을 떼지 않아도 된다.
 *
 * 목숨은 남은 개수만 보여주지 않고 **칸을 항상 3개 유지**한다. 꺼진 자리가 빈 하트로
 * 남아 있어야 "몇 개를 잃었고 몇 번 더 버틸 수 있는지"가 한눈에 읽힌다.
 * 색만으로 구분하지 않고 글리프도 ♥/♡로 다르게 둔다.
 */
function Lives({ lives }: { lives: number }) {
  const rowRef = useRef<HTMLSpanElement | null>(null)
  const slots = useRef<(HTMLSpanElement | null)[]>([])
  const previous = useRef(lives)

  // 목숨이 줄어드는 순간을 놓치지 않게 한다 — 물건이 떨어지는 데 시선이 가 있기 때문이다
  useEffect(() => {
    const lost = previous.current > lives
    previous.current = lives
    if (!lost) {
      return
    }
    // 방금 꺼진 자리(인덱스 = 남은 개수)가 크게 튀었다가 식는다
    play(
      slots.current[lives] ?? null,
      [
        { transform: 'scale(2)', color: KEPT },
        { transform: 'scale(2)', color: KEPT, offset: 0.3 },
        { transform: 'scale(1)', color: LOST },
      ],
      { duration: 560, easing: 'ease-out' },
    )
    play(
      rowRef.current,
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 260, easing: 'ease-in-out' },
    )
  }, [lives])

  // 마지막 목숨은 계속 맥박한다 — 다음 한 번이면 끝이라는 것을 계속 알린다
  useEffect(() => {
    if (lives !== 1) {
      return
    }
    const pulse = play(
      slots.current[0] ?? null,
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0.4, transform: 'scale(1.2)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 900, iterations: Number.POSITIVE_INFINITY },
    )
    return () => pulse?.cancel()
  }, [lives])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#6a7290', letterSpacing: '0.08em' }}>목숨</span>
      <span
        ref={rowRef}
        style={{ display: 'inline-flex', gap: 3, fontSize: 22, lineHeight: 1 }}
      >
        {Array.from({ length: LIVES }, (_, index) => {
          const kept = index < lives
          return (
            <span
              key={index}
              ref={(node) => {
                slots.current[index] = node
              }}
              style={{ display: 'inline-block', color: kept ? KEPT : LOST }}
            >
              {kept ? '♥' : '♡'}
            </span>
          )
        })}
      </span>
    </div>
  )
}

function Combo({ combo }: { combo: number }) {
  const active = combo > 0
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#6a7290', letterSpacing: '0.08em' }}>콤보</span>
      <span
        style={{
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1,
          color: active ? '#6bffb0' : '#2e3448',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {active ? `x${combo}` : '—'}
      </span>
    </div>
  )
}

export { Lives, Combo }
