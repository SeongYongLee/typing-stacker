import type { ReactNode } from 'react'
import { Blurb, Danger, Key, SidePanel } from '../components/SidePanel.tsx'
import { SoloRanking, VersusTier } from '../components/RankBoxes.tsx'
import type { Leaderboard } from '../hooks/useLeaderboard.ts'
import { LIVES } from '../game/config.ts'
import { MAX_PLAYERS } from '../multi/protocol.ts'

/** 시작 화면에서 고른 항목에 딸린 것을 옆에 보여준다 */
interface TitleSidePanelProps {
  kind: PanelKind | null
  board: Leaderboard
}

type PanelKind = 'name' | 'solo' | 'versus' | 'collection' | 'options'

/**
 * 항목마다의 설명.
 *
 * 한자리에 모아두는 이유는 다섯을 나란히 놓고 길이와 결을 맞춰야 하기 때문이다 —
 * 하나만 길면 그 항목이 어려운 것처럼 읽힌다.
 */
type BlurbPanelKind = Exclude<PanelKind, 'solo'>

const BLURBS: Record<BlurbPanelKind, readonly ReactNode[]> = {
  name: ['순위표와 대전 상대에게 보이는 이름과 아이콘을 바꿉니다.'],
  versus: [
    <>최대 {MAX_PLAYERS}명이 각자의 받침대에서 동시에 쌓습니다. 목숨은 각자 {LIVES}개입니다.</>,
    <>
      내가 쌓은 물건이 받침대를 벗어나면 <Danger>내 목숨</Danger>이 하나 깎입니다.
    </>,
    <>
      탑을 <Key>골인선</Key>까지 쌓거나 마지막까지 살아남으면 이깁니다.
    </>,
    <>
      골인하거나 탈락한 뒤에는 친선전 <Key>채팅</Key>을 이용할 수 있습니다.
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
