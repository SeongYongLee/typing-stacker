import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { SOLO_LIVES } from '../game/config.ts'
import { play } from './animate.ts'

/*
 * 이름표는 원래 `#6a7290`이었다. 배경이 단색일 때는 값보다 한 걸음 물러난 회색이었는데,
 * 방 그림 위에서는 하필 이 자리 뒤가 가장 밝은 바닥이라 **통째로 사라졌다**.
 * 한 단계 밝혀 아래쪽 그러데이션 위에서 읽히게 한다.
 */
const KEPT = '#ff6b6b'
const FEVER = '#dec7ff'
const LOST = '#2e3448'
const SCORE_BACKGROUND = '#e4e68a'
const COMBO_BACKGROUND = '#6bffb0'
const CHIP_TEXT = '#0d0f16'
const VITAL_LABEL_SIZE = 22
const VITAL_VALUE_SIZE = 52
const VITAL_GAP = 16
const COMPACT_LABEL_SIZE = 14
const COMPACT_VALUE_SIZE = 26
const COMPACT_GAP = 8
const BAR_LABEL_SIZE = 16
const BAR_VALUE_SIZE = 38
const BAR_GAP = 10

type VitalSize = 'regular' | 'compact' | 'bar'

function labelStyleFor(size: VitalSize): CSSProperties {
  return {
    ...vitalLabelStyle,
    fontSize: size === 'compact'
      ? COMPACT_LABEL_SIZE
      : size === 'bar'
        ? BAR_LABEL_SIZE
        : VITAL_LABEL_SIZE,
    letterSpacing: size === 'regular' ? vitalLabelStyle.letterSpacing : '0.04em',
  }
}

function valueChipStyleFor(size: VitalSize): CSSProperties {
  return {
    ...valueChipStyle,
    padding: size === 'compact'
      ? '4px 7px 5px'
      : size === 'bar'
        ? '5px 9px 7px'
        : valueChipStyle.padding,
    borderRadius: size === 'regular' ? valueChipStyle.borderRadius : 8,
    fontSize: size === 'compact'
      ? COMPACT_VALUE_SIZE
      : size === 'bar'
        ? BAR_VALUE_SIZE
        : VITAL_VALUE_SIZE,
  }
}

function gapFor(size: VitalSize): number {
  return size === 'compact' ? COMPACT_GAP : size === 'bar' ? BAR_GAP : VITAL_GAP
}

const vitalLabelStyle: CSSProperties = {
  color: '#a7afc9',
  fontSize: VITAL_LABEL_SIZE,
  letterSpacing: '0.08em',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const valueChipStyle: CSSProperties = {
  padding: '6px 10px 8px',
  borderRadius: 10,
  color: CHIP_TEXT,
  fontSize: VITAL_VALUE_SIZE,
  fontWeight: 700,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
  display: 'inline-block',
}

/**
 * 플레이 중 계속 확인해야 하는 두 값.
 * 시선이 아레나와 입력창(가운데·가운데 아래)에 붙어 있으므로 좌상단 HUD가 아니라
 * 입력창 양옆에 둔다 — 확인하려고 눈을 떼지 않아도 된다.
 *
 * 목숨은 남은 개수만 보여주지 않고 **칸을 항상 유지**한다. 꺼진 자리가 빈 하트로
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
        inset: '-10px -14px',
        borderRadius: 999,
        border: `2px solid ${BARRIER}`,
        background: `radial-gradient(circle, rgba(139, 214, 255, 0.18), rgba(139, 214, 255, 0.04))`,
        boxShadow: `0 0 ${12 + strength * 16}px rgba(139, 214, 255, ${0.25 + strength * 0.4})`,
        opacity: 0.25 + strength * 0.75,
        pointerEvents: 'none',
      }}
    />
  )
}

function Lives({
  lives,
  invulnerable = 0,
  size = 'regular',
  fever = false,
}: {
  lives: number
  invulnerable?: number
  size?: VitalSize
  fever?: boolean
}) {
  const rowRef = useRef<HTMLSpanElement | null>(null)
  const slots = useRef<(HTMLSpanElement | null)[]>([])
  const pulseSlots = useRef<(HTMLSpanElement | null)[]>([])
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
      pulseSlots.current[0] ?? null,
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0.4, transform: 'scale(1.2)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 900, iterations: Number.POSITIVE_INFINITY },
    )
    return () => pulse?.cancel()
  }, [lives])

  /*
   * Fever는 마지막 하트의 `transform` 맥박과 다른 축인 밝기·그림자만 움직인다.
   * 각 하트를 따로 재생해야 잃은 빈 하트까지 함께 빛나지 않는다.
   */
  useEffect(() => {
    if (!fever) {
      return
    }
    const sparkles = slots.current.slice(0, lives).map((slot, index) =>
      play(
        slot,
        [
          { filter: 'brightness(1)', textShadow: '0 0 4px rgba(222, 199, 255, 0.55)' },
          { filter: 'brightness(1.3)', textShadow: '0 0 14px rgba(239, 226, 255, 0.95)' },
          { filter: 'brightness(1)', textShadow: '0 0 5px rgba(222, 199, 255, 0.6)' },
        ],
        {
          duration: 900,
          delay: index * 110,
          iterations: Number.POSITIVE_INFINITY,
          easing: 'ease-in-out',
        },
      ),
    )
    return () => {
      for (const sparkle of sparkles) {
        sparkle?.cancel()
      }
    }
  }, [fever, lives])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: gapFor(size) }}>
      <span style={labelStyleFor(size)}>목숨</span>
      <span
        ref={rowRef}
        style={{
          position: 'relative',
          display: 'inline-flex',
          gap: size === 'compact' ? 4 : size === 'bar' ? 5 : 6,
          fontSize: size === 'compact' ? 26 : size === 'bar' ? 34 : 44,
          lineHeight: 1,
        }}
      >
        {!fever && invulnerable > 0 && <Barrier ratio={invulnerable} />}
        {Array.from({ length: SOLO_LIVES }, (_, index) => {
          const kept = index < lives
          const feverHeart = kept && fever
          return (
            <span
              key={index}
              ref={(node) => {
                pulseSlots.current[index] = node
              }}
              style={{ display: 'inline-block' }}
            >
              <span
                ref={(node) => {
                  slots.current[index] = node
                }}
                data-fever-heart={feverHeart || undefined}
                style={{
                  display: 'inline-block',
                  color: feverHeart ? FEVER : kept ? KEPT : LOST,
                  textShadow: feverHeart ? '0 0 8px rgba(222, 199, 255, 0.72)' : undefined,
                }}
              >
                {kept ? '♥' : '♡'}
              </span>
            </span>
          )
        })}
      </span>
    </div>
  )
}

function Combo({ combo, size = 'regular' }: { combo: number; size?: VitalSize }) {
  const active = combo > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: gapFor(size) }}>
      <span style={labelStyleFor(size)}>콤보</span>
      <span
        style={{
          ...valueChipStyleFor(size),
          minWidth: size === 'regular' ? 86 : size === 'bar' ? 64 : 44,
          textAlign: 'center',
          background: COMBO_BACKGROUND,
        }}
      >
        {active ? combo : '-'}
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
function Score({
  score,
  fever = false,
  size = 'regular',
}: {
  score: number
  fever?: boolean
  size?: VitalSize
}) {
  const valueRef = useRef<HTMLSpanElement | null>(null)
  const previous = useRef(score)
  const [delta, setDelta] = useState<{
    seq: number
    amount: number
    fever: boolean
  } | null>(null)
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
    setDelta({ seq: seq.current, amount, fever: fever && up })
    // 타이머의 주인은 이 표시 자신이다 — 값 변화에 매달면 연달아 바뀔 때 지워져 남는다
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDelta(null), DELTA_MS)
  }, [score, fever])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: gapFor(size) }}>
      <span style={labelStyleFor(size)}>점수</span>
      {/* 기준을 숫자로 잡는다. 바깥 상자에 붙이면 "점수" 라벨 위에 뜬다 */}
      <span style={{ position: 'relative', display: 'inline-block' }}>
        <span
          ref={valueRef}
          data-score={score}
          style={{
            ...valueChipStyleFor(size),
            minWidth: size === 'regular' ? 190 : size === 'bar' ? 136 : 92,
            textAlign: 'right',
            background: SCORE_BACKGROUND,
          }}
        >
          {score.toLocaleString('ko-KR')}
        </span>
        {delta !== null && (
          <Delta key={delta.seq} amount={delta.amount} fever={delta.fever} size={size} />
        )}
      </span>
    </div>
  )
}

const DELTA_MS = 900

/** 얼마나 오르내렸는지 한 번 띄우고 사라진다 */
function Delta({
  amount,
  fever = false,
  size = 'regular',
}: {
  amount: number
  fever?: boolean
  size?: VitalSize
}) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const up = amount > 0
  const feverGain = up && fever

  useEffect(() => {
    /*
     * 오르는 값은 현재 점수와 같은 크기로 보여 입력 보상을 바로 읽게 한다.
     * 깎이는 값은 놓쳤다는 사실을 방금 알아야 다음 판단이 달라지므로, 글자 크기와
     * 별개로 커졌다 제자리로 돌아오는 동작을 얹는다.
     */
    play(
      ref.current,
      up
        ? [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'translateY(0)', offset: 0.2 },
            { opacity: 1, transform: 'translateY(-8px)', offset: 0.7 },
            { opacity: 0, transform: 'translateY(-14px)' },
          ]
        : [
            { opacity: 0, transform: 'translateY(-4px) scale(0.7)' },
            { opacity: 1, transform: 'translateY(0) scale(1.3)', offset: 0.18 },
            { opacity: 1, transform: 'translateY(4px) scale(1)', offset: 0.55 },
            { opacity: 0, transform: 'translateY(14px) scale(1)' },
          ],
      // fill을 두지 않으면 끝난 뒤 기본 스타일로 돌아와 그대로 보인다
      { duration: up ? DELTA_MS : DELTA_MS + 300, easing: 'ease-out', fill: 'forwards' },
    )
  }, [up])

  return (
    <span
      ref={ref}
      data-score-delta={amount}
      data-fever-score={feverGain || undefined}
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
        // 오르는 값은 현재 점수와 같은 크기다. 깎이는 값도 기존 비율대로 두 배로 키운다
        fontSize: up
          ? size === 'compact'
            ? COMPACT_VALUE_SIZE
            : size === 'bar'
              ? BAR_VALUE_SIZE
              : VITAL_VALUE_SIZE
          : size === 'compact'
            ? 24
            : size === 'bar'
              ? 30
              : 38,
        fontWeight: 700,
        color: feverGain ? FEVER : up ? '#6bffb0' : '#ff6b6b',
        /*
         * Night Fever의 가산은 하트·별똥별과 같은 연보라 빛으로 묶는다. 내려가는 값은
         * 밤에도 위험 신호인 빨강을 유지하고, 레인 바닥선과 겹칠 때만 먹빛으로 받친다.
         */
        textShadow: feverGain
          ? '0 0 10px rgba(222, 199, 255, 0.92)'
          : up
            ? undefined
            : '0 2px 8px #0d0f16, 0 0 3px #0d0f16',
        // 커진 글자가 왼쪽 끝에 매달리면 숫자에서 멀어져 어디서 나온 값인지 흐려진다
        transformOrigin: 'left bottom',
        pointerEvents: 'none',
      }}
    >
      {up ? '+' : '−'}
      {Math.abs(amount).toLocaleString('ko-KR')}
    </span>
  )
}

export { Lives, Combo, Score, Delta, Barrier, KEPT, FEVER, LOST, BARRIER }
