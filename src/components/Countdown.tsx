import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { play } from './animate.ts'

/**
 * 판이 열리기 전에 세는 숫자.
 *
 * 누르는 순간 바로 시작하면 첫 단어가 이미 내려오고 있다 — 누른 사람은 마우스에
 * 손이 가 있고 자판으로 옮길 틈이 없다. 대전에는 이유가 하나 더 있어서 **남은 시간을
 * 숫자로** 알린다: 마지막에 준비를 누른 사람이 아니면 언제 열리는지 모른 채 당한다.
 *
 * 혼자 하기는 그 이유가 없어 세지 않고 READY → START 두 박자로 연다(`SoloStart`).
 *
 * **숫자를 가장 크게 둔다.** 대결에서는 그 아래에 위치만 짧게 미리 보여주되,
 * 규칙 설명은 섞지 않아 시작 신호에서 시선이 벗어나지 않게 한다.
 */
const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

const panelStyle: CSSProperties = {
  display: 'grid',
  justifyItems: 'center',
  gap: 10,
  textAlign: 'center',
}

interface CountdownProps {
  secondsLeft: number
  /** 숫자 아래 크게 보여줄 시작 정보. 대전에서는 첫 타자를 적는다 */
  focus?: string
  /** 대결처럼 시작 전에 공간 배치를 보여줘야 할 때 숫자 아래에 놓는다. */
  children?: ReactNode
}

function Countdown({ secondsLeft, focus, children }: CountdownProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    // 숫자가 바뀔 때마다 한 번 크게 튄다. 초 단위라 움직임이 없으면 멈춘 것처럼 보인다
    play(
      ref.current,
      [
        { transform: 'scale(1.22)', opacity: 0.35 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    )
  }, [secondsLeft])

  return (
    <div style={rootStyle}>
      <div style={panelStyle} data-countdown={secondsLeft}>
        <p style={{ color: '#6a7290', margin: 0, fontSize: 13, letterSpacing: '0.08em' }}>
          곧 시작한다. 손을 올리자
        </p>
        <div
          ref={ref}
          style={{
            font: '700 96px/1 var(--sans)',
            color: '#e4e68a',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {secondsLeft}
        </div>
        {focus !== undefined && (
          <div
            style={{
              display: 'grid',
              justifyItems: 'center',
              minWidth: 220,
              maxWidth: 'min(78vw, 420px)',
              marginTop: 4,
            }}
          >
            <p
              style={{
                width: '100%',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: '#f2f4fb',
                fontSize: 28,
                fontWeight: 900,
                lineHeight: 1.1,
                textShadow: '0 4px 18px rgba(13, 15, 22, 0.6)',
              }}
            >
              {focus}
            </p>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export { Countdown }
