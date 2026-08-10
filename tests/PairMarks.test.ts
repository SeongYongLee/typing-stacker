import { describe, expect, it } from 'vitest'
import { MARK_COUNT, pairMarks } from '../src/game/systems/PairMarks.ts'
import { RECIPES } from '../src/game/data/recipes.ts'
import type { Recipe } from '../src/game/data/recipes.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'

/**
 * 표식이 뜻하는 것은 하나여야 한다 — **이것끼리 붙이면 된다.**
 * 짝이 아닌 것에 같은 모양이 뜨면 알려주려던 것과 반대로 헷갈리게 만든다.
 */
function recipe(inputs: readonly string[], resultId: string): Recipe {
  const result = VARIANT_BY_ID.get(resultId)
  if (result === undefined) {
    throw new Error(`없는 변형: ${resultId}`)
  }
  return { id: `t-${inputs.join('+')}`, inputs, result, hiddenResults: [] }
}

const pizza = RECIPES.find((item) => item.inputs[0] === item.inputs[1])
if (pizza === undefined) {
  throw new Error('같은 재료 둘짜리 레시피가 없다')
}
const cross = RECIPES.find((item) => item.inputs[0] !== item.inputs[1])
if (cross === undefined) {
  throw new Error('서로 다른 재료짜리 레시피가 없다')
}

describe('pairMarks', () => {
  it('재료가 다 있어야 표식이 붙는다', () => {
    const half = new Map([[cross.inputs[0]!, 1]])
    expect(pairMarks(half, [cross]).size, '한쪽만 있으면 알릴 것이 없다').toBe(0)

    const both = new Map([
      [cross.inputs[0]!, 1],
      [cross.inputs[1]!, 1],
    ])
    const marks = pairMarks(both, [cross])
    expect(marks.get(cross.inputs[0]!)).toBe(0)
    expect(marks.get(cross.inputs[1]!)).toBe(0)
  })

  it('같은 재료 둘짜리는 둘이 있어야 한다', () => {
    const one = new Map([[pizza.inputs[0]!, 1]])
    expect(pairMarks(one, [pizza]).size, '하나로는 못 합친다').toBe(0)
    expect(pairMarks(new Map([[pizza.inputs[0]!, 2]]), [pizza]).size).toBe(1)
  })

  it('단어 히든은 기본형 짝 표식을 대신 받지 않는다', () => {
    const clover = RECIPES.find((item) => item.inputs[0] === 'clover' && item.inputs[1] === 'clover')
    expect(clover).toBeDefined()
    const marks = pairMarks(new Map([['clover', 1], ['clover-lucky', 1]]), [clover!])
    expect(marks.size).toBe(0)
  })

  it('짝끼리 같은 번호, 다른 짝과는 다른 번호', () => {
    const alive = new Map([
      ['a', 1],
      ['b', 1],
      ['c', 1],
      ['d', 1],
    ])
    const first = cross.result.id
    const marks = pairMarks(alive, [recipe(['a', 'b'], first), recipe(['c', 'd'], first)])
    expect(marks.get('a')).toBe(marks.get('b'))
    expect(marks.get('c')).toBe(marks.get('d'))
    expect(marks.get('a')).not.toBe(marks.get('c'))
  })

  it('한 물건에 표식을 둘 씌우지 않는다 — 어느 쪽과 붙일지 흐려진다', () => {
    const alive = new Map([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ])
    const id = cross.result.id
    const marks = pairMarks(alive, [recipe(['a', 'b'], id), recipe(['a', 'c'], id)])
    // a는 먼저 갖춰진 조합의 표식을 지킨다
    expect(marks.get('a')).toBe(marks.get('b'))
    expect(marks.get('c')).not.toBe(marks.get('a'))
  })

  it('쓸 수 있는 모양보다 많은 조합이 갖춰져도 넘치지 않는다', () => {
    const alive = new Map<string, number>()
    const many: Recipe[] = []
    for (let i = 0; i < MARK_COUNT + 3; i += 1) {
      alive.set(`x${i}`, 1)
      alive.set(`y${i}`, 1)
      many.push(recipe([`x${i}`, `y${i}`], cross.result.id))
    }
    const marks = pairMarks(alive, many)
    const used = new Set(marks.values())
    expect(used.size).toBeLessThanOrEqual(MARK_COUNT)
    for (const mark of used) {
      expect(mark).toBeLessThan(MARK_COUNT)
    }
  })

  it('쓰던 번호를 지킨다 — 다른 짝이 사라져도 내 색은 그대로', () => {
    /*
     * 매 프레임 처음부터 매기면 다른 단어가 사라진 것만으로 내 색이 바뀐다.
     * 색이 짝을 잇는 유일한 표식인데 그것이 흔들리면 방금 외운 짝이 매번 무너진다.
     */
    const id = cross.result.id
    const both = new Map([
      ['a', 1],
      ['b', 1],
      ['c', 1],
      ['d', 1],
    ])
    const recipes = [recipe(['a', 'b'], id), recipe(['c', 'd'], id)]
    const first = pairMarks(both, recipes)
    const cd = first.get('c')

    // a·b가 사라졌다. c·d는 그대로인데 앞자리가 비었다
    const onlyCd = new Map([
      ['c', 1],
      ['d', 1],
    ])
    const after = pairMarks(onlyCd, recipes, first)
    expect(after.get('c'), '쓰던 번호를 그대로 지켜야 한다').toBe(cd)
    expect(after.get('d')).toBe(cd)
  })

  it('직전 배정을 안 넘기면 앞자리부터 다시 매긴다', () => {
    const id = cross.result.id
    const onlyCd = new Map([
      ['c', 1],
      ['d', 1],
    ])
    const recipes = [recipe(['a', 'b'], id), recipe(['c', 'd'], id)]
    expect(pairMarks(onlyCd, recipes).get('c')).toBe(0)
  })

  it('빈 받침대에는 아무 표식도 없다', () => {
    expect(pairMarks(new Map(), RECIPES).size).toBe(0)
  })
})
