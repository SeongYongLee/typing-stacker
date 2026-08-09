import { describe, expect, it } from 'vitest'
import { MATERIAL_VOICES } from '../src/audio/voices.ts'
import { MATERIALS, grainOf, materialOf, toneOf } from '../src/game/data/materials.ts'
import { ALL_VARIANTS } from '../src/game/data/words.ts'
import type { ItemVariant } from '../src/game/types/game.ts'

function allVariants(): ItemVariant[] {
  return [...ALL_VARIANTS]
}

function groupByMaterial(): Map<string, ItemVariant[]> {
  const byMaterial = new Map<string, ItemVariant[]>()
  for (const item of allVariants()) {
    const list = byMaterial.get(item.material) ?? []
    list.push(item)
    byMaterial.set(item.material, list)
  }
  return byMaterial
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
      expect(item.grain, item.id).toBe(grainOf(item.id))
      expect(item.grain, item.id).toBeGreaterThanOrEqual(0)
      expect(item.grain, item.id).toBeLessThan(1)
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
   *
   * 축이 둘이므로 겹치지 않아야 하는 것은 **쌍**이다. 음높이가 같아도 울림이 다르면
   * 다른 소리다 — 격자에 앉히는 것이 바로 그 성질을 쓰는 것이다.
   */
  it('같은 재질 안에서 (음높이, 울림) 쌍이 겹치지 않는다', () => {
    for (const [material, items] of groupByMaterial()) {
      const pairs = items.map((item) => `${item.tone},${item.grain}`)
      expect(new Set(pairs).size, material).toBe(pairs.length)
    }
  })

  /**
   * 개체값이 실제로 **몇 반음** 벌어지는지는 재질의 폭(spread)까지 봐야 안다.
   * 0~1 안에서 등간격이라는 것만으로는 부족했다 — 천 13종은 폭이 3반음뿐이라
   * 이웃끼리 0.23반음이었고, 등간격이었지만 귀에는 완전히 같은 소리였다.
   *
   * 격자로 바꾼 뒤에는 음높이 칸이 ⌈√개수⌉개뿐이라 같은 폭에서도 훨씬 벌어진다.
   * 이 검사가 "물건이 늘어서 무리가 다시 빽빽해지는 것"을 잡는다.
   */
  it('같은 음높이 칸끼리는 최소 반음 이상 벌어져 있다', () => {
    const MIN_SEMITONES = 0.6
    for (const [material, items] of groupByMaterial()) {
      const spread = MATERIAL_VOICES[material as keyof typeof MATERIAL_VOICES].spread
      const levels = [...new Set(items.map((item) => item.tone))].sort((a, b) => a - b)
      if (levels.length < 2) {
        continue
      }
      let closest = Infinity
      for (let i = 1; i < levels.length; i += 1) {
        closest = Math.min(closest, (levels[i] ?? 0) - (levels[i - 1] ?? 0))
      }
      /*
       * 간격은 `폭 ÷ 칸 수`라 딱 떨어지는 값이 나온다(천은 3 ÷ 5 = 0.6). 그런데
       * 개체값이 0~1을 거쳐 오므로 그 나눗셈이 부동소수로 0.5999999999999999가 되어
       * 문턱과 같은 값인데도 걸린다. 문턱은 귀로 정한 값이고 1조분의 1을 가릴 만큼
       * 정밀하지 않으니, 자릿수를 맞춰 비교한다.
       */
      expect(
        Number((closest * spread).toFixed(6)),
        `${material} ${items.length}종의 이웃 음높이 간격(반음)`,
      ).toBeGreaterThanOrEqual(MIN_SEMITONES)
    }
  })

  /**
   * 음높이가 같은 물건들은 울림이 갈라놓아야 한다. 그것이 두 번째 축을 둔 이유다 —
   * 여기가 무너지면 격자가 그냥 한 줄로 되돌아간 것이다.
   */
  it('음높이가 같은 물건들은 울림이 서로 다르다', () => {
    for (const [material, items] of groupByMaterial()) {
      const byTone = new Map<number, number[]>()
      for (const item of items) {
        const list = byTone.get(item.tone) ?? []
        list.push(item.grain)
        byTone.set(item.tone, list)
      }
      for (const [tone, grains] of byTone) {
        expect(new Set(grains).size, `${material} 음높이 ${tone}`).toBe(grains.length)
      }
    }
  })
})
