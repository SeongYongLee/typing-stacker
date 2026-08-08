import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { play } from './animate.ts'

/**
 * 혼자 하기가 열리기 전의 두 박자.
 *
 * 대전은 숫자를 센다(`Countdown`). 거기서는 마지막에 준비를 누른 사람이 아니면
 * 언제 열리는지 모른 채 당하므로 **남은 시간을 알려주는 것** 자체가 일이다.
 *
 * 혼자 할 때는 방금 자기가 눌렀으니 그 일이 없다. 남는 것은 손을 자판으로 옮길
 * 틈뿐이고, 그 틈에 숫자를 세면 기다림이 길게 느껴진다 — 특히 다시 하기를 되풀이할
 * 때 그렇다. 그래서 세지 않고 **READY로 손을 부르고 START로 놓아준다.**
 *
 * 두 낱말은 읽는 것이 아니라 **박자로 받는 것**이다. 그래서 뜻이 아니라 리듬에
 * 맞춰 길이를 잡았다 — READY가 조금 길고 START는 짧다.
 */
type SoloStep = 'ready' | 'start'

const WORD: Readonly<Record<SoloStep, string>> = { ready: 'READY', start: 'START' }
const COLOR: Readonly<Record<SoloStep, string>> = { ready: '#8b93b4', start: '#ffcf5c' }

const rootStyle: CSSProperties = {
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
}

function SoloStart({ step }: { step: SoloStep }) {
  const ref = useRef<HTMLDivElement | null>(null)

  /*
   * 낱말이 바뀔 때마다 한 번 튄다. 움직임이 없으면 멈춘 것처럼 보인다.
   *
   * **`useEffect`가 아니라 `useLayoutEffect`여야 한다.** `useEffect`는 그려진 **뒤**에
   * 도므로, 바뀐 낱말과 색이 제 밝기로 한 프레임 먼저 그려지고 그다음에 애니메이션이
   * 투명도 0.15로 되돌려 다시 채운다. 그 한 프레임 때문에 "낱말이 먼저 바뀌고
   * 색이 뒤따라 들어오는" 것처럼 보인다 — 실제로는 둘이 같은 렌더에서 바뀌는데도.
   *
   * `useLayoutEffect`는 그리기 **전에** 돌아서 첫 프레임부터 애니메이션의 시작 상태로
   * 그려진다. 낱말·색·움직임이 한 몸으로 들어온다.
   */
  useLayoutEffect(() => {
    play(
      ref.current,
      [
        { transform: 'scale(1.35)', opacity: 0.15 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 300, easing: 'ease-out' },
    )
  }, [step])

  return (
    <div style={rootStyle}>
      <div
        ref={ref}
        data-solo-start={step}
        style={{
          font: '700 72px/1 var(--sans)',
          letterSpacing: '0.16em',
          // 자간을 준 만큼 오른쪽이 비어 가운데가 왼쪽으로 밀린다
          textIndent: '0.16em',
          color: COLOR[step],
        }}
      >
        {WORD[step]}
      </div>
    </div>
  )
}

export { SoloStart }
export type { SoloStep }
