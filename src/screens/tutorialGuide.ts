import type { GameState } from '../game/core/GameEngine.ts'

/** Shared lesson content; only the input hint differs between keyboard and touch. */
export function tutorialGuide(stage: GameState['stage'], mobile = false) {
  if (stage.tutorialStep === null) return null
  const key = mobile ? '키보드의 ↵ 버튼을' : 'Enter를'
  const demo = stage.congestionDemo
  const guide = (title: string, text: string, action: string | null = null, waiting = false) => ({ title, text, action, waiting })
  if (demo === 'ready' || demo === 'congestionGuide') return guide('4 / 5 · 경보 알아보기', '회수 성공! 남은 횟수만큼 돌려주면 클리어입니다. 이제 단어를 놓치면 경보가 어떻게 쌓이는지 볼까요?', '경보 보기')
  if (demo === 'wordRush') return guide('4 / 5 · 경보 알아보기', '지금은 입력하지 않고 지켜보세요. 놓친 단어가 경보 게이지를 채웁니다.', null, true)
  if (demo === 'full') return guide('4 / 5 · 경보 알아보기', '경보가 가득 찼습니다. 물건이 한꺼번에 들어오니, 평소에는 오타와 놓치는 단어를 줄여주세요.', '계속')
  if (demo === 'falling' || demo === 'gameOverIntro') return guide('5 / 5 · 상자 지키기', '경보가 울려 물건이 들어옵니다. 상자 밖으로 떨어지는 물건을 지켜보세요.', null, true)
  if (demo === 'gameOverPrompt') return guide('5 / 5 · 연습 완료', '물건이 밖으로 떨어지고 고양이가 나오면 게임오버입니다. 연습에서는 경보를 크게 보여드렸어요. 이제 직접 정리해보세요.', '연습 마치기')
  if (demo === 'over') return null
  switch (stage.tutorialStep) {
    case 0: return guide('1 / 5 · 물건 쌓기', '이곳은 분실물 보관소입니다. 단어를 적어 물건을 쌓고, 주인이 찾는 물건을 돌려주세요. 책부터 넣어볼까요?', '시작하기')
    case 1: return guide('1 / 5 · 물건 쌓기', `책을 입력하고 ${key} 누르세요. 움직이는 화살표 위치에 물건이 떨어집니다.`)
    case 2: return guide('2 / 5 · 합성하기', `잘 놓았어요! 이제 계란을 한 번씩 입력해 3개를 넣어보세요. ${stage.tutorialText?.match(/\(\d+ \/ \d+\)/)?.[0] ?? ''}`)
    case 3: return guide('2 / 5 · 합성하기', '프라이팬을 입력해 계란 가까이에 놓아보세요. 같은 색 테두리는 합성 짝입니다. 빗나가면 다시 시도해도 괜찮아요.')
    case 4: return guide('2 / 5 · 합성 성공', '계란과 프라이팬이 만나 계란 프라이가 됐어요. 이번에는 위치를 도와드렸습니다. 이제 주인에게 돌려줄까요?', '회수해보기')
    default: return guide('3 / 5 · 주인에게 돌려주기', `합성한 계란 프라이가 회수 대상입니다. 화이트보드를 확인하고 계란 프라이를 입력한 뒤 ${key} 누르세요.`)
  }
}
