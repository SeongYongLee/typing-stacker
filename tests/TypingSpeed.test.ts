import { describe, expect, it } from 'vitest'
import { countKeystrokes, keystrokesPerMinute } from '../src/game/systems/TypingSpeed.ts'

describe('countKeystrokes', () => {
  it('초성·중성·종성을 두벌식 키 수로 센다', () => {
    expect(countKeystrokes('가')).toBe(2) // ㄱㅏ
    expect(countKeystrokes('강')).toBe(3) // ㄱㅏㅇ
    expect(countKeystrokes('사과')).toBe(5) // ㅅㅏ + ㄱㅗㅏ
    expect(countKeystrokes('번개')).toBe(5) // ㅂㅓㄴ + ㄱㅐ
  })

  it('쌍자음·복합모음·겹받침은 2타다', () => {
    expect(countKeystrokes('까')).toBe(3) // ㄲ(2) + ㅏ
    expect(countKeystrokes('과')).toBe(3) // ㄱ + ㅘ(2)
    expect(countKeystrokes('닭')).toBe(4) // ㄷ + ㅏ + ㄺ(2)
    expect(countKeystrokes('뚫')).toBe(5) // ㄸ(2) + ㅜ + ㅀ(2)
  })

  it('한글이 아닌 글자는 1타로 본다', () => {
    expect(countKeystrokes('a1 ')).toBe(3)
    expect(countKeystrokes('')).toBe(0)
  })

  it('조립 중인 낱자도 세지 못해 넘기지 않는다', () => {
    // 완성형이 아닌 낱자(ㅅ, 사가 되기 전)는 한글 음절 범위 밖이라 1타로 센다.
    // 타수는 제출된 단어로만 집계하므로 실제 경로에서는 들어오지 않는다.
    expect(countKeystrokes('ㅅ')).toBe(1)
  })
})

describe('keystrokesPerMinute', () => {
  it('경과 시간으로 나눠 분당으로 환산한다', () => {
    expect(keystrokesPerMinute(50, 30)).toBe(100)
    expect(keystrokesPerMinute(5, 60)).toBe(5)
    expect(keystrokesPerMinute(0, 60)).toBe(0)
  })

  it('1초가 지나기 전에는 값이 튀므로 0을 준다', () => {
    expect(keystrokesPerMinute(0, 0)).toBe(0)
    expect(keystrokesPerMinute(10, 0.5)).toBe(0)
  })
})
