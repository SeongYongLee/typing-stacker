import type { ReactNode } from 'react'
import { Blurb, Danger, Key, SidePanel } from '../components/SidePanel.tsx'
import { SoloRanking, VersusTier } from '../components/RankBoxes.tsx'
import type { Leaderboard } from '../hooks/useLeaderboard.ts'
import { LIVES } from '../game/config.ts'
import { TURN_LIMIT_SEC } from '../multi/MatchEngine.ts'
import { MAX_PLAYERS } from '../multi/protocol.ts'
import { COMPETITION_MAX_PLAYERS } from '../competition/config.ts'

/** 시작 화면에서 고른 항목에 딸린 것을 옆에 보여준다 */
interface TitleSidePanelProps {
  kind: PanelKind | null
  board: Leaderboard
}

type PanelKind = 'name' | 'solo' | 'versus' | 'competition' | 'collection' | 'options'

/**
 * 항목마다의 설명.
 *
 * 한자리에 모아두는 이유는 다섯을 나란히 놓고 길이와 결을 맞춰야 하기 때문이다 —
 * 하나만 길면 그 항목이 어려운 것처럼 읽힌다.
 */
type BlurbPanelKind = Exclude<PanelKind, 'solo'>

const BLURBS: Record<BlurbPanelKind, readonly ReactNode[]> = {
  name: ['순위표와 대전 상대에게 보이는 이름과 아이콘을 바꿉니다.'],
  competition: [
    <>최대 {COMPETITION_MAX_PLAYERS}명이 각자 다른 단어를 치며 받침대 하나에 동시에 쌓습니다.</>,
    <>
      단어를 놓치거나 내 물건이 떨어지면 <Danger>내 목숨</Danger>이 하나 줄어듭니다.
    </>,
    <>
      턴과 점수는 없습니다. <Key>마지막 생존자</Key>가 이깁니다.
    </>,
  ],
  versus: [
    <>받침대 하나를 최대 {MAX_PLAYERS}명이 함께 씁니다. 목숨은 각자 {LIVES}개입니다.</>,
    <>
      내가 쌓은 물건이 받침대를 벗어나면 <Danger>내 목숨</Danger>이 하나 깎입니다.
    </>,
    <>
      <Key>차례</Key>가 돌아갑니다. {TURN_LIMIT_SEC}초 안에 치지 않으면 저절로 떨어집니다.
    </>,
    <>
      차례가 아닐 때 적는 말은 <Key>채팅</Key>이 됩니다.
    </>,
  ],
  // 도감·옵션·이름은 규칙이 아니라 자리다. 무엇이 있는 곳인지만 알면 들어가서 보면 된다
  collection: ['그동안 만난 물건이 모이는 곳입니다.'],
  options: ['소리와 화면 흔들림을 조절합니다.'],
}

function TitleSidePanel({ kind, board }: TitleSidePanelProps) {
  const blurbKind = kind === null || kind === 'solo' ? null : kind

  return (
    <SidePanel
      kind={kind ?? 'none'}
      record={
        kind === 'solo' ? (
          <SoloRanking board={board} />
        ) : kind === 'versus' ? (
          <VersusTier board={board} />
        ) : null
      }
      blurb={
        blurbKind === null ? null : <Blurb kind={blurbKind} lines={BLURBS[blurbKind]} />
      }
    />
  )
}

export { TitleSidePanel }
