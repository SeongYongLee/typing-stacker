import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { START_DIM } from './StartBackdrop.tsx'

/**
 * 판이 열리는 순간 **어둠이 걷힌다.**
 *
 * START 박자까지는 방이 `START_DIM`만큼 어둡다(`StartBackdrop`). 그 화면이 사라지고
 * `GameScreen`이 들어올 때 방이 곧바로 제 밝기로 나타나면, 이으려고 깔아둔 어둠이
 * 마지막에 한 번 툭 벗겨진다 — 앞의 몇 초를 들인 것이 그 한 프레임에 무너진다.
 *
 * 그래서 **같은 어둠을 여기서 이어받아** 0까지 걷는다. 두 화면이 서로 다른 방을
 * 그리지만 어둠은 방과 무관하므로 그대로 이어진다.
 *
 * **판을 함께 덮는 것은 의도다.** 걷히는 동안 낱말과 HUD도 같이 밝아져서, 판이
 * 열리는 것이 "글자가 하나 떴다"가 아니라 **불이 켜지는 것**으로 읽힌다.
 *
 * ## 시계가 아니라 프레임으로 걷는다
 *
 * 판이 열리는 첫 순간에는 본선이 **가끔 길게 멈춘다**(실측 한 번은 370ms). WAAPI든
 * CSS든 애니메이션은 벽시계를 따라가므로 그동안 혼자 진행하고, 화면이 돌아오는 순간
 * **0.70에서 0.23으로 건너뛴 채** 나타난다 — 부드럽게 걷으려고 만든 것이 오히려 한 번
 * 크게 번쩍인다. 실기 제보가 이것이었고 계측으로도 그대로 잡혔다.
 *
 * 시작을 미뤄서는 못 막는다. **멈춤은 걷기 시작한 뒤에도 오기 때문이다** — 400ms를
 * 일부러 넣어보니 미뤄도 0.60을 건너뛰었다.
 *
 * 그래서 프레임마다 직접 옮기되 **한 프레임이 가져갈 수 있는 몫에 상한**을 둔다
 * (`MAX_STEP_MS`). 멈추는 동안 어둠은 그 자리에 서 있고, 화면이 돌아오면 서 있던
 * 자리에서 이어 걷는다. 가려주라고 있는 것이 이 어둠이니 그것이 맞는 동작이다.
 *
 * 값을 리렌더에 맡기지 않고 DOM에 직접 쓰는 이유는 엔진이 매 프레임 스냅샷을 밀어
 * 리렌더가 계속 일어나기 때문이다(`animate.ts`와 같은 까닭). `style` 프롭이 모듈
 * 상수라 React가 이 요소의 인라인 스타일을 다시 건드리지 않는다.
 */

/** 걷히는 데 걸리는 시간(ms). 첫 단어가 내려오기 시작하는 것과 겹친다 */
const LIFT_MS = 550

/**
 * 한 프레임이 가져갈 수 있는 최대 몫(ms).
 *
 * 60Hz 한 프레임(16.7ms)의 두 배쯤이다. 프레임이 조금 늦는 것은 그대로 따라가되,
 * 수백 ms 멈춘 것은 **한 프레임 몫으로 깎는다** — 그 차이가 곧 번쩍임이다.
 */
const MAX_STEP_MS = 34

/**
 * 어둠의 색. `--bg`(`#0d0f16`)와 같은 색을 알파로 쓴다.
 *
 * **`opacity`가 아니라 배경색의 알파를 움직인다.** 화면 전체를 덮는 요소의 `opacity`를
 * 애니메이션하면 브라우저가 그 요소를 별도 합성 레이어로 올렸다가 0에 닿는 순간
 * 정리하는데, 그때 **한 프레임이 새하얗게** 그려졌다. 실측으로 여덟 판 중 한 판에서
 * 났고(연출을 빼면 0판) 흰 프레임이 나는 시각이 늘 걷힘이 끝난 직후였다.
 *
 * 알파는 칠하기만 바꾸므로 그 레이어가 아예 생기지 않는다.
 */
function veil(alpha: number): string {
  return `rgba(13, 15, 22, ${alpha})`
}

const style: CSSProperties = {
  position: 'absolute',
  inset: 0,
  /*
   * 바탕값이 걷기 전의 어둠이다. 0으로 두고 첫 프레임에 덮으려 했더니 그 한 프레임이
   * **어둠 없이** 그려져서, 밝았다가 어두워졌다가 다시 밝아졌다.
   */
  backgroundColor: veil(START_DIM),
  pointerEvents: 'none',
  // 판 위에 덮되 일시정지·결과 같은 덮개보다는 아래다
  zIndex: 2,
}

/** 끝으로 갈수록 느려진다. 마지막에 툭 끊기지 않게 */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/**
 * 다 걷히면 알린다 — **부르는 쪽이 이 요소를 떼어야 한다.**
 *
 * 알파가 0이어도 화면 전체를 덮는 요소는 판이 도는 내내 합성에 얹힌다. 하는 일이
 * 없는데 남아 있을 이유가 없고, 흰 프레임을 만들었던 것도 이런 전체 덮개였다.
 */
function StartCurtain({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const done = useRef(onDone)
  done.current = onDone

  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) {
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      done.current()
      return
    }

    let frame = 0
    let previous = performance.now()
    let elapsed = 0

    const step = (now: number): void => {
      elapsed += Math.min(now - previous, MAX_STEP_MS)
      previous = now
      const t = Math.min(elapsed / LIFT_MS, 1)
      element.style.backgroundColor = veil(START_DIM * (1 - easeOut(t)))
      if (t < 1) {
        frame = requestAnimationFrame(step)
        return
      }
      done.current()
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <div aria-hidden ref={ref} style={style} />
}

export { StartCurtain }
