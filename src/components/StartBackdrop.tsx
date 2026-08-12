import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ArenaBackdrop } from './ArenaBackdrop.tsx'
import { play } from './animate.ts'
import { timeOfDay } from '../game/systems/DayNight.ts'

/**
 * 판이 열리기 전에 **갈 곳을 미리 조금 보여준다.**
 *
 * 혼자 하기의 READY·START는 판을 덮지 않고 **대신** 보여주는 화면이라(까닭은
 * `App.tsx`에) 그동안 화면이 통째로 비어 있었다. 그러다 시작하는 순간 방이 한꺼번에
 * 나타나서, 손을 올릴 틈을 주려고 만든 그 몇 초가 오히려 "아무것도 없다가 갑자기
 * 시작하는" 구간이 됐다.
 *
 * 방은 실제 판과 같은 밝기로 유지한다. 준비 화면이 끝날 때 전체 밝기를 바꾸면
 * 캔버스와 HUD가 붙는 순간의 페이드가 깜빡임으로 읽힌다. 시작 신호는 READY·START
 * 낱말이 맡고, 방은 두 화면 사이에서 변하지 않는 기준점으로 남는다.
 *
 * ## 판이 아니라 방만 깐다
 *
 * `GameScreen`을 통째로 뒤에 두면 안 된다 — 다시 하기에서 **지난 판의 탑과 결과
 * 화면**이 낱말 뒤로 비쳐서, 새로 시작하는 자리에 지난 판이 남는다. 방 그림은
 * 판의 상태를 하나도 안 들고 있어서 그 문제가 없다.
 *
 * ## 대전에는 쓰지 않는다
 *
 * 대전은 준비 플로우에 스플래시 배경을 쓰고, 판이 열리면 현재 현지 시각의 방으로
 * 갈아탄다. 싱글의 낮·Night Fever 시계를 쓰지 않으므로 이 시작 덮개를 공유하지 않는다.
 *
 * ## 판이 열리는 낮으로 깐다
 *
 * 값을 적어두지 않고 판이 열리는 상태(`timeOfDay('day', 0)`)를 그대로 넘긴다. 점수
 * 기준을 손봐도 방과 벽시계가 실제 시작 자리로 함께 따라가야 준비 화면에서 판으로
 * 넘어갈 때 밝기나 바늘이 튀지 않는다.
 */

/** 준비 화면에 들어올 때만 검은 화면에서 방을 드러내는 시간(ms). */
const SETTLE_MS = 500

const rootStyle: CSSProperties = {
  position: 'relative',
  height: '100%',
}

const roomStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
}

/**
 * 어둠의 색. `--bg`(`#0d0f16`)와 같은 색을 알파로 쓴다.
 *
 * **`opacity`가 아니라 배경색의 알파를 움직인다.** 화면 전체를 덮는 요소의 `opacity`를
 * 애니메이션하면 브라우저가 별도 합성 레이어로 올렸다가 정리하는데, 그때 한 프레임이
 * 새하얗게 그려졌다 — 까닭과 실측은 `StartCurtain`에.
 */
function veilColor(alpha: number): string {
  return `rgba(13, 15, 22, ${alpha})`
}

const veilStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundColor: veilColor(0),
  pointerEvents: 'none',
}

function StartBackdrop({ children }: { children: ReactNode }) {
  const veil = useRef<HTMLDivElement | null>(null)

  /*
   * 방이 켜지듯 들어온다. 완전히 가린 데서 실제 판과 같은 밝기까지 걷는다.
   *
   * **`useLayoutEffect`여야 한다.** 그려진 뒤에 돌면 방이 제 밝기로 한 프레임 먼저
   * 보이고 그다음에 어둠이 덮으므로, 켜지는 것이 아니라 한 번 번쩍이는 것이 된다.
   * `SoloStart`가 낱말에서 같은 자리를 밟았다.
   */
  useLayoutEffect(() => {
    play(
      veil.current,
      [{ backgroundColor: veilColor(1) }, { backgroundColor: veilColor(0) }],
      { duration: SETTLE_MS, easing: 'ease-out' },
    )
  }, [])

  return (
    <div style={rootStyle}>
      <div aria-hidden style={roomStyle}>
        <ArenaBackdrop mode="solo" time={timeOfDay('day', 0)} />
      </div>
      <div aria-hidden ref={veil} style={veilStyle} />
      {/* 숫자·낱말은 어둠보다 앞에 온다 — 가려질 것은 방이지 글자가 아니다 */}
      <div style={{ position: 'relative', height: '100%', zIndex: 1 }}>{children}</div>
    </div>
  )
}

export { StartBackdrop }
