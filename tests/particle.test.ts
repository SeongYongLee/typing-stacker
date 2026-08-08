import { describe, expect, it } from 'vitest'
import {
  hasFinalConsonant,
  withObject,
  withSubject,
  withTopic,
} from '../src/text/particle.ts'

/**
 * 이름과 물건 이름이 모두 자동으로 만들어지므로 조사를 손으로 적을 수 없다.
 * "방장가 먼저 노렸다"처럼 한 글자가 어긋나면 문장 전체가 어색해진다.
 */

describe('조사', () => {
  it('받침이 있는지 가른다', () => {
    expect(hasFinalConsonant('방장')).toBe(true)
    expect(hasFinalConsonant('참가자')).toBe(false)
    expect(hasFinalConsonant('나침반')).toBe(true)
    expect(hasFinalConsonant('피자')).toBe(false)
  })

  it('이 / 가', () => {
    expect(withSubject('방장')).toBe('방장이')
    expect(withSubject('참가자')).toBe('참가자가')
  })

  it('을 / 를', () => {
    expect(withObject('나침반')).toBe('나침반을')
    expect(withObject('피자')).toBe('피자를')
  })

  it('은 / 는', () => {
    expect(withTopic('나침반')).toBe('나침반은')
    expect(withTopic('피자')).toBe('피자는')
  })

  it('뒤에 붙은 빈칸은 무시한다', () => {
    expect(withSubject('방장 ')).toBe('방장 이')
    expect(hasFinalConsonant('방장  ')).toBe(true)
  })

  /*
   * 한글이 아닌 글자로 끝나면 규칙이 갈린다. 어느 쪽이든 틀릴 수 있으므로
   * 받침 없는 쪽으로 두고, 적어도 터지지는 않게 한다.
   */
  it('한글이 아니거나 비어 있어도 터지지 않는다', () => {
    expect(withSubject('abc')).toBe('abc가')
    expect(withSubject('123')).toBe('123가')
    expect(withSubject('')).toBe('가')
    expect(hasFinalConsonant('')).toBe(false)
  })
})
