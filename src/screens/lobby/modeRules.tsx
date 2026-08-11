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
    <>
      각자 자기 받침대와 <Key>자기 탑</Key>을 가집니다.
    </>,
    '같은 단어가 같은 순서로 나오고, 동시에 진행합니다.',
    '화면에는 최대 4개의 타워가 보입니다.',
    '5명 이상이면 내 타워와 무작위 타워 3개를 보여주고, 마지막 생존 타워는 계속 보여줍니다.',
    '먼저 목표 높이에 닿거나 마지막까지 하트를 남기면 이깁니다.',
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
