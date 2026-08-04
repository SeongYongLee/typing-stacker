import type { FallingWord, JudgeResult } from '../types/game.ts'

/**
 * 입력 문자열을 낙하 중인 단어와 맞춰본다.
 * 바닥선에 닿아 missed가 된 단어는 대상에서 빠지고, 여러 개가 일치하면
 * 가장 아래(급한) 것을 잡는다. WordSpawner가 활성 단어의 중복을 막으므로
 * 실제로 둘 이상 일치하는 경우는 없지만, 판정 규칙 자체는 모호하지 않게 둔다.
 */
function judgeInput(words: readonly FallingWord[], input: string): JudgeResult {
  const target = input.trim()
  if (target.length === 0) {
    return { kind: 'miss', input: target }
  }

  let best: FallingWord | null = null
  for (const word of words) {
    if (word.state !== 'active' || word.word !== target) {
      continue
    }
    if (best === null || word.y > best.y) {
      best = word
    }
  }

  return best === null ? { kind: 'miss', input: target } : { kind: 'hit', word: best }
}

export { judgeInput }
