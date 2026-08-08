import { describe, expect, it } from 'vitest'
import { MATERIALS, materialOf, toneOf } from '../src/game/data/materials.ts'
import { ALL_VARIANTS } from '../src/game/data/words.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

function allVariants(): ItemVariant[] {
  return [...ALL_VARIANTS]
}

describe('재질 표', () => {
  /**
   * 표에 없는 물건은 기본값(plastic)으로 떨어진다. 그 실패는 **조용하다** —
   * 소리가 나긴 하는데 다른 물건과 같을 뿐이라 눈에도 귀에도 잘 안 띈다.
   * 아트가 들어올 때마다 여기서 잡는다.
   */
  it('모든 물건이 표에 재질을 갖는다', () => {
    const missing = allVariants()
      .filter((item) => !(item.id in MATERIALS))
      .map((item) => `${item.id}(${item.label})`)
    expect(missing, `재질을 정하지 않은 물건: ${missing.join(', ')}`).toEqual([])
  })

  it('표에 없는 물건 id는 표에 남아 있지 않다', () => {
    const known = new Set(allVariants().map((item) => item.id))
    const stale = Object.keys(MATERIALS).filter((id) => !known.has(id))
    expect(stale, `없어진 물건이 표에 남아 있다: ${stale.join(', ')}`).toEqual([])
  })

  it('변형이 재질과 개체값을 들고 있다', () => {
    for (const item of allVariants()) {
      expect(item.material, item.id).toBe(materialOf(item.id))
      expect(item.tone, item.id).toBeGreaterThanOrEqual(0)
      expect(item.tone, item.id).toBeLessThan(1)
    }
  })

  /**
   * 소리가 재질 하나로 뭉치면 "다 같은 소리"로 돌아간다.
   * 한 재질에 물건이 몰려 있지 않은지 본다.
   */
  it('한 재질에 물건이 절반 넘게 몰리지 않는다', () => {
    const counts = new Map<string, number>()
    for (const item of allVariants()) {
      counts.set(item.material, (counts.get(item.material) ?? 0) + 1)
    }
    const total = allVariants().length
    for (const [material, count] of counts) {
      expect(count / total, `${material}에 ${count}/${total}`).toBeLessThan(0.5)
    }
  })

  it('재질이 넉넉히 갈려 있다', () => {
    const used = new Set(allVariants().map((item) => item.material))
    expect(used.size).toBeGreaterThanOrEqual(6)
  })
})

describe('개체값(tone)', () => {
  /**
   * 난수가 아니라 id의 함수여야 한다. 같은 물건은 언제 떨어져도 같은 소리를 내야
   * "저건 텀블러다"가 귀에 익는다.
   */
  it('같은 id는 언제나 같은 값을 준다', () => {
    expect(toneOf('tumbler')).toBe(toneOf('tumbler'))
    expect(toneOf('airplane')).toBe(toneOf('airplane'))
  })

  /**
   * 값이 겹쳐도 되는 것은 **재질이 다를 때**뿐이다. 유리 셋째와 나무 셋째가 같은
   * 0.5를 갖는 것은 문제가 아니다 — 배음과 울림이 이미 갈라놓았기 때문이다.
   * 갈려야 하는 것은 같은 무리 안이다.
   */
  it('같은 재질 안에서 값이 겹치지 않는다', () => {
    const byMaterial = new Map<string, number[]>()
    for (const item of allVariants()) {
      const list = byMaterial.get(item.material) ?? []
      list.push(item.tone)
      byMaterial.set(item.material, list)
    }
    for (const [material, tones] of byMaterial) {
      expect(new Set(tones).size, material).toBe(tones.length)
    }
  })

  /**
   * 같은 재질 안에서 값이 뭉쳐 있으면 그 무리가 한 소리로 들린다.
   * 유리끼리, 금속끼리 서로 갈려 있는지 본다.
   */
  it('같은 재질 안에서도 값이 흩어져 있다', () => {
    const byMaterial = new Map<string, number[]>()
    for (const item of allVariants()) {
      const list = byMaterial.get(item.material) ?? []
      list.push(item.tone)
      byMaterial.set(item.material, list)
    }
    for (const [material, tones] of byMaterial) {
      if (tones.length < 3) {
        continue
      }
      const sorted = [...tones].sort((a, b) => a - b)
      /*
       * 등간격으로 펴두므로 가장 가까운 둘도 1/개수만큼 벌어져 있어야 한다.
       * 해시를 그대로 쓰던 때는 여기서 0.0016짜리 짝이 나왔다 — 0.01반음 차이라
       * 완전히 같은 소리였다. 이 검사가 그 회귀를 막는다.
       */
      let closest = 1
      for (let i = 1; i < sorted.length; i += 1) {
        closest = Math.min(closest, (sorted[i] ?? 0) - (sorted[i - 1] ?? 0))
      }
      expect(closest, `${material}에서 가장 가까운 두 물건`).toBeGreaterThan(
        0.9 / tones.length,
      )
    }
  })
})
