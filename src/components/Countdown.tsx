import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
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
 * **숫자만 크게 둔다.** 명단이나 규칙을 같이 두면 그것을 읽다가 시작을 놓친다.
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
  /** 숫자 아래 한 줄. 대전에서는 누가 함께 있는지를 적는다 */
  note?: string
}

function Countdown({ secondsLeft, note }: CountdownProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    // 숫자가 바뀔 때마다 한 번 크게 튄다. 초 단위라 움직임이 없으면 멈춘 것처럼 보인다
    play(
      ref.current,
      [
        { transform: 'scale(1.4)', opacity: 0.2 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 380, easing: 'ease-out' },
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
            color: '#ffcf5c',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {secondsLeft}
        </div>
        {note !== undefined && (
          <p style={{ color: '#4a5171', margin: 0, fontSize: 13 }}>{note}</p>
        )}
      </div>
    </div>
  )
}

export { Countdown }
