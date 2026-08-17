import type { ReactNode } from 'react'
import { Key } from '../../components/SidePanel.tsx'
import { MATCH_MODE_CHOICE_LABELS, type MatchModeChoice } from '../../multi/matchModes.ts'

const MODE_CHOICES: readonly MatchModeChoice[] = ['duel']

const MODE_BLURBS: Record<MatchModeChoice, readonly ReactNode[]> = {
  roulette: [
    <>
      시작할 때 <Key>함께 쌓기</Key>와 <Key>대결</Key> 중 하나를 자동으로 고릅니다.
    </>,
    '선택된 모드의 규칙으로 바로 시작합니다.',
  ],
  shared: [
    <>
      한 받침대 위에 <Key>한 탑을 함께</Key> 쌓습니다.
    </>,
    <>
      차례대로 단어를 치고 <Key>한 번씩</Key> 물건을 떨어뜨립니다.
    </>,
    '상대 물건을 밀어내면 그 물건 주인의 하트가 줄어듭니다.',
    '마지막 생존자가 이깁니다.',
  ],
  duel: [
    '내 단어를 놓치면 물건이 자동으로 떨어집니다.',
    '합성하면 상대에게 예약 공격을 보내고, 마지막 생존자가 이깁니다.',
  ],
}

function nextModeChoice(current: MatchModeChoice): MatchModeChoice {
  const index = MODE_CHOICES.indexOf(current)
  return MODE_CHOICES[(index + 1) % MODE_CHOICES.length] ?? 'duel'
}

function modeLabel(choice: MatchModeChoice): string {
  return MATCH_MODE_CHOICE_LABELS[choice]
}

export { MODE_CHOICES, MODE_BLURBS, nextModeChoice, modeLabel }
