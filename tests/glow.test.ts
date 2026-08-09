import { describe, expect, it } from 'vitest'
import { GLOWING_IDS, glows } from '../src/game/data/glowItems.ts'
import { ALL_VARIANTS } from '../src/game/data/words.ts'
import {
  GLOW_LIGHTNESS,
  GLOW_MIN_ALPHA,
  GLOW_PEAK_ALPHA,
  glowAlpha,
  glowColor,
  glowStyle,
} from '../src/game/renderer/glow.ts'
import { LANDING_GLOW_SEC, LandingGlow } from '../src/game/systems/LandingGlow.ts'

/** HSL의 L — 최소·최대 성분의 중간 */
function lightnessOf(color: { r: number; g: number; b: number }): number {
  return (Math.min(color.r, color.g, color.b) + Math.max(color.r, color.g, color.b)) / 2
}

/** 어느 성분이 가장 큰지. 색조가 유지됐는지 보는 거친 기준 */
function dominant(color: { r: number; g: number; b: number }): string {
  const max = Math.max(color.r, color.g, color.b)
  return [
    color.r === max ? 'r' : '',
    color.g === max ? 'g' : '',
    color.b === max ? 'b' : '',
  ].join('')
}

describe('번지는 색', () => {
  /**
   * 물건 색을 그대로 쓰면 짙은 물건이 아무 일도 하지 않는다. 배경이 어두운 남색이라
   * 짙은 갈색을 더해도 눈에 보이는 변화가 없고, 그러면 특색이 "색이 다르다"가 아니라
   * "밝은 물건만 보인다"가 된다.
   */
  it('밝기를 한 값으로 맞춘다 — 짙은 물건도 보이게', () => {
    for (const hex of ['#4a3a2a', '#3a3f52', '#2f3542', '#f2d43c', '#ffd233']) {
      expect(lightnessOf(glowColor(hex)), hex).toBeCloseTo(GLOW_LIGHTNESS, 2)
    }
  })

  /**
   * 밝기만 옮기고 색조는 물건의 것이어야 한다 — 번개는 노랗게 번져야 한다.
   *
   * 성분의 **순서**로 본다. 어느 하나가 가장 크냐만 보면 노랑(r>g>b)과 빨강(r>b>g)을
   * 구분할 수 없다.
   */
  it('색조는 물건의 것을 그대로 쓴다', () => {
    // 번개 #f2d43c — 빨강 > 초록 > 파랑, 파랑이 멀리 떨어져 있다 = 노랑
    const bolt = glowColor('#f2d43c')
    expect(bolt.r).toBeGreaterThan(bolt.g)
    expect(bolt.g).toBeGreaterThan(bolt.b)
    expect(bolt.r - bolt.g).toBeLessThan(bolt.g - bolt.b)
    // 별가루 #c9a7f0 — 파랑이 가장 크다 = 보라
    expect(dominant(glowColor('#c9a7f0'))).toBe('b')
    // 햇빛 #ffd233 — 번개와 같은 계열이어야 한다
    const sunlight = glowColor('#ffd233')
    expect(sunlight.r).toBeGreaterThan(sunlight.b)
  })

  /**
   * 흰 물건에 색조를 만들어주면 그림에 없는 색이 화면에 뜬다.
   * 하얀 것은 하얗게 번지는 것이 맞다.
   */
  it('무채색은 무채색으로 남는다', () => {
    const grey = glowColor('#f2f2f2')
    expect(grey.r).toBeCloseTo(grey.g, 5)
    expect(grey.g).toBeCloseTo(grey.b, 5)
  })

  it('읽을 수 없는 색이면 무채색으로 떨어진다 — 화면이 깨지지 않아야 한다', () => {
    for (const bad of ['', '#', 'red', '#12', '#gggggg']) {
      const fallback = glowColor(bad)
      expect(fallback.r, bad).toBeCloseTo(GLOW_LIGHTNESS, 5)
      expect(fallback.g, bad).toBeCloseTo(GLOW_LIGHTNESS, 5)
    }
  })

  it('짧은 표기(#abc)도 읽는다', () => {
    expect(glowColor('#ff0')).toEqual(glowColor('#ffff00'))
  })

  /**
   * 화면 전체를 덮는 색이라 조금만 진해도 눈이 먼저 피로해진다.
   *
   * **알파가 아니라 화면이 얼마나 움직이는지를 지킨다.** 합성 방식이 바뀌면 같은
   * 알파가 다른 결과를 낸다 — 예전에는 빛을 더해서 0.085가 +22%였고, 지금은 곱으로
   * 덮어서 0.22가 −12%다. 알파에 문턱을 두면 방식을 바꿀 때마다 그 문턱이 거짓말이 된다.
   *
   * 곱하기는 `결과 = 배경 x (1 - 알파 x (1 - 밝기))`이므로 변화가 **배경과 무관하게
   * 비율로** 나온다. 그래서 배경 밝기를 몰라도 이 검사가 성립한다.
   */
  it('가장 진해도 화면을 이만큼 넘게 어둡게 하지 않는다', () => {
    const change = glowAlpha(0, 1) * (1 - GLOW_LIGHTNESS)
    expect(change, `${(change * 100).toFixed(0)}% 어두워진다`).toBeLessThanOrEqual(0.15)
    expect(glowAlpha(0, 1)).toBeCloseTo(GLOW_PEAK_ALPHA, 5)
  })

  /** 반대로 너무 옅으면 얹혔는지 알 수 없다. 예전 값은 밝은 배경에서 0%였다 */
  it('가장 진할 때는 눈에 띌 만큼은 움직인다', () => {
    const change = glowAlpha(0, 1) * (1 - GLOW_LIGHTNESS)
    expect(change, `${(change * 100).toFixed(0)}% 어두워진다`).toBeGreaterThanOrEqual(0.08)
  })

  it('약하게 얹혀도 아주 조금은 번진다', () => {
    expect(glowAlpha(0, 0)).toBeCloseTo(GLOW_MIN_ALPHA, 5)
    expect(GLOW_MIN_ALPHA).toBeGreaterThan(0)
  })

  it('세게 부딪힐수록 진하다', () => {
    const weak = glowAlpha(0, 0.2)
    const strong = glowAlpha(0, 0.9)
    expect(strong).toBeGreaterThan(weak)
  })

  /**
   * 선형으로 빼면 끝까지 옅은 색이 남아 화면이 늘 물들어 있는 것처럼 보인다.
   * 처음에 훅 빠지고 꼬리가 짧아야 "번쩍"이 된다 — 절반쯤 지났을 때 이미 1/4이어야 한다.
   */
  it('처음에 훅 빠지고 꼬리가 짧다', () => {
    const peak = glowAlpha(0, 1)
    expect(glowAlpha(0.5, 1)).toBeCloseTo(peak * 0.25, 5)
    expect(glowAlpha(1, 1)).toBe(0)
    expect(glowAlpha(1.5, 1)).toBe(0)
  })

  it('캔버스에 넘길 문자열을 만든다', () => {
    expect(glowStyle({ r: 1, g: 0.5, b: 0 }, 0.08)).toBe('rgba(255, 128, 0, 0.08)')
  })
})

describe('빛나는 물건', () => {
  /**
   * 문자열 집합이라 오타가 나도 조용히 빠진다 — 그 물건만 물들지 않고, 그 실패는
   * 실기로 한참 뒤에야 눈에 띈다.
   */
  it('목록의 id가 모두 실제로 있는 물건이다', () => {
    const known = new Set(ALL_VARIANTS.map((item) => item.id))
    const missing = [...GLOWING_IDS].filter((id) => !known.has(id))
    expect(missing, `없는 물건이 목록에 있다: ${missing.join(', ')}`).toEqual([])
  })

  it('번개는 물든다', () => {
    expect(glows('bolt')).toBe(true)
  })

  /** 늘 일어나는 일은 아무것도 알리지 못한다. 드물어야 뜻이 있다 */
  it('물드는 물건은 전체의 일부다', () => {
    expect(GLOWING_IDS.size).toBeGreaterThan(3)
    expect(GLOWING_IDS.size / ALL_VARIANTS.length).toBeLessThan
      (0.2)
  })

  /** 반짝이는 것과 빛을 내는 것은 다르다. 그 선을 풀면 밝은 물건이 전부 들어온다 */
  it('반짝이기만 하는 것은 물들지 않는다', () => {
    for (const id of ['gold-medal', 'heart-ring', 'glass-shards', 'hand-mirror']) {
      expect(glows(id), id).toBe(false)
    }
  })
})

describe('얹힘 연출', () => {
  const bolt = { variant: { id: 'bolt', color: '#f2d43c' }, impact: 2, first: true }
  const bento = { variant: { id: 'bento', color: '#f2df8a' }, impact: 3, first: true }

  it('빛나는 물건이 처음 닿으면 색이 남는다', () => {
    const glow = new LandingGlow()
    glow.note([bolt])
    expect(glow.view?.color).toBe('#f2d43c')
    expect(glow.view?.progress).toBe(0)
  })

  it('빛나지 않는 물건은 아무 일도 없다', () => {
    const glow = new LandingGlow()
    glow.note([bento])
    expect(glow.view).toBeNull()
  })

  /**
   * 무너지는 동안에는 부딪힘이 한 프레임에 열 개도 들어온다. 그때마다 물들면
   * 색이 겹쳐 무엇이 얹혔는지가 오히려 안 보인다.
   */
  it('무너져 다시 부딪힌 것은 물들지 않는다', () => {
    const glow = new LandingGlow()
    glow.note([{ ...bolt, first: false }])
    expect(glow.view).toBeNull()
  })

  /**
   * 마지막 것을 쓰면 순서가 물리 순회에 달려 있어 같은 시드로 다시 돌려도
   * 색이 달라진다.
   */
  it('같은 프레임에 여럿이면 가장 세게 부딪힌 것이 남는다', () => {
    const glow = new LandingGlow()
    const star = { variant: { id: 'gold-star', color: '#f5c33b' }, impact: 0.4, first: true }
    const moon = { variant: { id: 'crescent-moon', color: '#f6e58d' }, impact: 2.5, first: true }
    glow.note([star, moon, { ...star, impact: 0.1 }])
    expect(glow.view?.color).toBe('#f6e58d')
  })

  it('시간이 지나면 사라진다', () => {
    const glow = new LandingGlow()
    glow.note([bolt])
    glow.advance(LANDING_GLOW_SEC / 2)
    expect(glow.view?.progress).toBeCloseTo(0.5, 5)
    glow.advance(LANDING_GLOW_SEC / 2)
    expect(glow.view).toBeNull()
  })

  it('새로 얹히면 앞의 것을 덮는다', () => {
    const glow = new LandingGlow()
    glow.note([bolt])
    glow.advance(LANDING_GLOW_SEC * 0.8)
    glow.note([{ variant: { id: 'sunlight', color: '#ffd233' }, impact: 1, first: true }])
    expect(glow.view?.color).toBe('#ffd233')
    expect(glow.view?.progress).toBe(0)
  })

  /** 앞 판의 색이 새 판 첫 프레임에 남아 있으면 안 된다 */
  it('판을 다시 시작하면 비워진다', () => {
    const glow = new LandingGlow()
    glow.note([bolt])
    glow.reset()
    expect(glow.view).toBeNull()
  })

  it('세기는 0~1로 눌러 내놓는다', () => {
    const glow = new LandingGlow()
    glow.note([{ ...bolt, impact: 999 }])
    expect(glow.view?.strength).toBe(1)
  })
})
