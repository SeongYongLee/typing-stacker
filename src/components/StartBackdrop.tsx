import type { CSSProperties, ReactNode } from 'react'
import { ArenaBackdrop } from './ArenaBackdrop.tsx'
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
 * 갈아탄다. 싱글의 180초 조명 시계를 쓰지 않으므로 이 시작 덮개를 공유하지 않는다.
 *
 * ## 판이 열리는 낮으로 깐다
 *
 * 값을 적어두지 않고 판이 열리는 상태(`timeOfDay('day', 0)`)를 그대로 넘긴다. 방과
 * 벽시계가 실제 시작 자리로 함께 따라가야 준비 화면에서 판으로 넘어갈 때 밝기나
 * 바늘이 튀지 않는다.
 */

const rootStyle: CSSProperties = {
  position: 'relative',
  height: '100%',
}

const roomStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
}

function StartBackdrop({ children }: { children: ReactNode }) {
  return (
    <div style={rootStyle}>
      <div aria-hidden style={roomStyle}>
        <ArenaBackdrop mode="solo" time={timeOfDay('day', 0)} />
      </div>
      <div style={{ position: 'relative', height: '100%' }}>{children}</div>
    </div>
  )
}

export { StartBackdrop }
