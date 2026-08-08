import type { CSSProperties } from 'react'
import type { RunStats } from '../game/types/game.ts'
import { RunChase } from './RunChase.tsx'

interface HudProps {
  stats: RunStats
}

/**
 * 판이 도는 동안의 상단 띠. **지금 무엇을 쫓는가** 하나만 말한다.
 *
 * 점수·목숨·콤보는 여기 없다 — 시선이 머무는 입력창 옆(`Vitals`)으로 옮겼다.
 *
 * 한때 쌓기·최고 높이·놓친 단어·타수·경과가 여기 있었는데 전부 걷어냈다. 기준은
 * 하나였다: **판 중에 그것을 보고 무엇을 바꾸는가.**
 *
 * - 쌓은 개수와 높이는 아레나가 이미 보여준다(카메라가 따라 올라가는 것이 곧 높이다)
 * - 놓친 단어는 바닥선이 붉게 번지고 점수가 내려가는 것으로 이미 두 번 알린다
 * - 타수는 보면 초조해질 뿐 손이 빨라지지 않는다
 * - 경과는 아무것도 정하지 않는다. **난이도는 시간이 아니라 탑 높이를 따라간다**
 *   (`Difficulty`) — 한때 경과를 "얼마나 험해졌는지 알려주는 값"으로 여겨 남겨뒀는데
 *   그건 12초마다 한 단계씩 오르던 시절의 이야기였고 그 방식은 이미 없다
 *
 * 전부 결과 화면에서 볼 값이다. 남은 하나는 다르다 — 쫓는 것이 없으면 점수는
 * 그냥 늘어나는 숫자다.
 */
const wrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px 20px',
  /*
   * 내용이 없어도 띠 높이가 흔들리지 않게 한다.
   * 순위는 서버에서 받아오므로 판이 열리고 조금 뒤에 들어오는데, 그때 띠가
   * 늘어나면 아레나가 통째로 밀린다. 서버가 죽어 끝내 비어 있어도 마찬가지다.
   */
  minHeight: 22,
  borderBottom: '1px solid #262b3d',
  background: '#151824',
}

function Hud({ stats }: HudProps) {
  return (
    <div style={wrapStyle}>
      <RunChase score={stats.score} />
    </div>
  )
}

export { Hud }
