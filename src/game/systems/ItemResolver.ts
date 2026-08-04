import { HIDDEN_CHANCE } from '../config.ts'
import { WORD_BY_TEXT } from '../data/words.ts'
import type { ItemVariant } from '../types/game.ts'
import type { Rng } from './Rng.ts'

/**
 * 단어를 실제로 떨어질 물건으로 바꾼다.
 * 플레이어는 Enter를 누른 뒤에야 결과를 보므로, 이 롤은 판정 직후 한 번만 호출된다.
 */
function resolveItem(word: string, rng: Rng): ItemVariant {
  const entry = WORD_BY_TEXT.get(word)
  if (entry === undefined) {
    throw new Error(`단어 테이블에 없는 단어: ${word}`)
  }

  const base = entry.variants[0]
  if (base === undefined) {
    throw new Error(`변형이 비어있는 단어: ${word}`)
  }

  const hidden = entry.variants.filter((item) => item.hidden)
  if (hidden.length === 0 || rng.next() >= HIDDEN_CHANCE) {
    return base
  }
  return rng.pick(hidden)
}

export { resolveItem }
