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
  /*
   * **바탕을 비운다.** 뒤에 보관소 그림이 그대로 이어져야 방 안에 판이 놓인 것으로
   * 읽힌다 — 띠를 세우면 거기서 방이 잘려 판만 창처럼 뚫린 모양이 된다.
   *
   * 대신 대비는 **글자 쪽에서** 만든다. 바탕을 어둡게 하면 그림을 죽여서 대비를
   * 얻는 것이고, 그림자는 글자 뒤에만 드리워 그림을 건드리지 않는다.
   */
  background:
    'linear-gradient(to top, rgba(13, 15, 22, 0) 0%, rgba(13, 15, 22, 0.5) 55%, rgba(13, 15, 22, 0.8) 100%)',
  textShadow: '0 1px 3px rgba(8, 10, 16, 0.9), 0 0 10px rgba(8, 10, 16, 0.7)',
  // 배경 층이 뒤로 가려면 이쪽이 쌓임 순서를 가져야 한다
  position: 'relative',
  zIndex: 1,
}

function Hud({ stats }: HudProps) {
  return (
    <div style={wrapStyle}>
      <RunChase score={stats.score} />
    </div>
  )
}

export { Hud }
