import { useEffect, useRef, useState } from 'react'
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
const BARRIER = '#8bd6ff'

/**
 * 무적 시간을 하트에 씌우는 베리어.
 *
 * 남은 비율이 그대로 진하기가 된다 — 값이 매 프레임 들어오므로 애니메이션이 아니라
 * 계산해서 그린다(짧은 일회성 연출만 WAAPI로 재생한다). 사라져가는 것이 보여야
 * "언제까지 안전한지"를 눈으로 셀 수 있다.
 */
function Barrier({ ratio }: { ratio: number }) {
  const strength = Math.min(Math.max(ratio, 0), 1)
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        inset: '-5px -7px',
        borderRadius: 999,
        border: `1px solid ${BARRIER}`,
        background: `radial-gradient(circle, rgba(139, 214, 255, 0.18), rgba(139, 214, 255, 0.04))`,
        boxShadow: `0 0 ${6 + strength * 8}px rgba(139, 214, 255, ${0.25 + strength * 0.4})`,
        opacity: 0.25 + strength * 0.75,
        pointerEvents: 'none',
      }}
    />
  )
}

function Lives({ lives, invulnerable = 0 }: { lives: number; invulnerable?: number }) {
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
        style={{
          position: 'relative',
          display: 'inline-flex',
          gap: 3,
          fontSize: 22,
          lineHeight: 1,
        }}
      >
        {invulnerable > 0 && <Barrier ratio={invulnerable} />}
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

/**
 * 점수. 오를 때와 내릴 때를 몸으로 알린다.
 *
 * 놓친 단어는 정확도를 떨어뜨려 **점수를 되돌린다**(ScoreManager.finalScore).
 * 숫자만 조용히 바뀌면 그 대가가 있었다는 것을 알아채지 못한다 — 이 게임에서
 * 놓침의 유일한 대가라 반드시 보여야 한다.
 *
 * 눈은 입력칸에 붙어 있으므로 연출도 그 옆에서 일어난다.
 */
function Score({ score }: { score: number }) {
  const valueRef = useRef<HTMLSpanElement | null>(null)
  const previous = useRef(score)
  const [delta, setDelta] = useState<{ seq: number; amount: number } | null>(null)
  const seq = useRef(0)
  const timer = useRef(0)

  useEffect(() => {
    const amount = score - previous.current
    previous.current = score
    if (amount === 0) {
      return
    }

    const up = amount > 0
    play(
      valueRef.current,
      up
        ? [
            { transform: 'scale(1)' },
            { transform: 'scale(1.18)', offset: 0.3 },
            { transform: 'scale(1)' },
          ]
        : [
            // 내려갈 때는 커지지 않고 좌우로 흔들린다 — 위아래 방향이 값의 방향과 맞아야 한다
            { transform: 'translateX(0)' },
            { transform: 'translateX(-4px)', offset: 0.25 },
            { transform: 'translateX(3px)', offset: 0.6 },
            { transform: 'translateX(0)' },
          ],
      { duration: up ? 320 : 260, easing: 'ease-out' },
    )

    seq.current += 1
    setDelta({ seq: seq.current, amount })
    // 타이머의 주인은 이 표시 자신이다 — 값 변화에 매달면 연달아 바뀔 때 지워져 남는다
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDelta(null), DELTA_MS)
  }, [score])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#6a7290', letterSpacing: '0.08em' }}>점수</span>
      {/* 기준을 숫자로 잡는다. 바깥 상자에 붙이면 "점수" 라벨 위에 뜬다 */}
      <span style={{ position: 'relative', display: 'inline-block' }}>
        <span
          ref={valueRef}
          data-score={score}
          style={{
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1,
            color: '#ffcf5c',
            fontVariantNumeric: 'tabular-nums',
            display: 'inline-block',
          }}
        >
          {score.toLocaleString('ko-KR')}
        </span>
        {delta !== null && <Delta key={delta.seq} amount={delta.amount} />}
      </span>
    </div>
  )
}

const DELTA_MS = 900

/** 얼마나 오르내렸는지 한 번 띄우고 사라진다 */
function Delta({ amount }: { amount: number }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const up = amount > 0

  useEffect(() => {
    play(
      ref.current,
      [
        { opacity: 0, transform: `translateY(${up ? 6 : -6}px)` },
        { opacity: 1, transform: 'translateY(0)', offset: 0.2 },
        { opacity: 1, transform: `translateY(${up ? -8 : 8}px)`, offset: 0.7 },
        { opacity: 0, transform: `translateY(${up ? -14 : 14}px)` },
      ],
      // fill을 두지 않으면 끝난 뒤 기본 스타일로 돌아와 그대로 보인다
      { duration: DELTA_MS, easing: 'ease-out', fill: 'forwards' },
    )
  }, [up])

  return (
    <span
      ref={ref}
      data-score-delta={amount}
      style={{
        /*
         * 점수 **위쪽**에 띄운다. 오른쪽에 두면 바로 옆 콤보 글자를 덮는다.
         * 위는 아레나라 가릴 것이 없고, 값이 오르내리는 방향과도 맞는다.
         */
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: 2,
        whiteSpace: 'nowrap',
        fontSize: 14,
        fontWeight: 700,
        color: up ? '#6bffb0' : '#ff6b6b',
        pointerEvents: 'none',
      }}
    >
      {up ? '+' : '−'}
      {Math.abs(amount).toLocaleString('ko-KR')}
    </span>
  )
}

export { Lives, Combo, Score, Barrier, KEPT, LOST }
