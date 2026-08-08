import { describe, expect, it } from 'vitest'
import {
  ADJECTIVES,
  isMadeName,
  joinName,
  nameCount,
  nouns,
  randomName,
} from '../src/game/data/nicknames.ts'
import { NICKNAME_MAX } from '../src/multi/protocol.ts'

/**
 * 이름을 고르게 한 이유는 순위표에 아무 말이나 올라가지 않게 하려는 것이다.
 * 그 약속이 지켜지는지를 여기서 지킨다 — 재료가 늘어나도 깨지면 안 된다.
 */

describe('고를 수 있는 이름', () => {
  it('충분히 많다 — 남과 겹치는 느낌이 없어야 한다', () => {
    expect(nameCount()).toBeGreaterThan(1000)
  })

  it('만들어진 이름은 길이 제한 안에 든다', () => {
    /*
     * 넘치면 sanitizeNickname이 잘라내고, 잘린 이름은 isMadeName을 통과하지 못해
     * 저장된 이름이 매번 새로 뽑히게 된다. 재료를 늘릴 때 여기가 먼저 알려준다.
     */
    for (const adjective of ADJECTIVES) {
      for (const noun of nouns()) {
        const name = joinName({ adjective, noun })
        expect(name.length, name).toBeLessThanOrEqual(NICKNAME_MAX)
      }
    }
  })

  it('재료에 사람을 가리키는 말이 없다', () => {
    // 재료만으로도 남을 놀리는 이름이 만들어지면 고르게 한 뜻이 사라진다
    const aboutPeople = ['귀여운', '멍청한', '못생긴', '뚱뚱한', '늙은', '어린']
    for (const word of aboutPeople) {
      expect(ADJECTIVES).not.toContain(word)
    }
  })

  it('꾸미말과 물건에 빈 값이 없다', () => {
    for (const word of [...ADJECTIVES, ...nouns()]) {
      expect(word.trim().length).toBeGreaterThan(0)
    }
  })

  it('물건 이름이 겹치지 않는다', () => {
    const list = nouns()
    expect(new Set(list).size).toBe(list.length)
  })
})

describe('randomName', () => {
  it('언제나 재료 안에서 고른다', () => {
    for (let i = 0; i < 200; i += 1) {
      const parts = randomName()
      expect(ADJECTIVES).toContain(parts.adjective)
      expect(nouns()).toContain(parts.noun)
    }
  })

  it('끝값에서도 재료 밖으로 나가지 않는다', () => {
    // Math.random은 1을 돌려주지 않지만, 넘겨받은 함수는 무엇이든 줄 수 있다
    for (const value of [0, 0.999999, 1]) {
      const parts = randomName(() => value)
      expect(ADJECTIVES).toContain(parts.adjective)
      expect(nouns()).toContain(parts.noun)
    }
  })
})

describe('isMadeName — 저장소를 그대로 믿지 않는다', () => {
  it('고른 이름은 통과한다', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isMadeName(joinName(randomName()))).toBe(true)
    }
  })

  it('손으로 적은 이름은 막는다', () => {
    for (const name of ['아무말', '굴러가는 없는물건', '없는말 문어', '', ' ', '문어']) {
      expect(isMadeName(name), name).toBe(false)
    }
  })

  it('꾸미말만이나 물건만으로는 통과하지 못한다', () => {
    expect(isMadeName(ADJECTIVES[0]!)).toBe(false)
    expect(isMadeName(nouns()[0]!)).toBe(false)
  })
})
