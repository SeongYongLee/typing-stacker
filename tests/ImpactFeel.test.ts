import { describe, expect, it } from 'vitest'
import { IMPACT_FULL_SCALE, QUAKE_IMPACT_SCALE } from '../src/game/config.ts'
import {
  impactEventOf,
  quakeEventOf,
  strengthOf,
  trailHitOf,
} from '../src/game/systems/ImpactFeel.ts'
import { ALL_VARIANTS } from '../src/game/data/words.ts'

/**
 * 부딪힘 하나를 눈에 보이는 것과 귀에 들리는 것으로 바꾸는 규칙.
 *
 * 혼자 하기와 대전이 이 스무 줄을 각자 적고 있었다. 두 벌이면 **한쪽만 고쳤을 때
 * 같은 물건이 판마다 다르게 들린다** — 그리고 그 어긋남은 두 모드를 번갈아 해봐야
 * 드러난다. 이 파일은 규칙이 한 곳에서만 나온다는 것을 지킨다.
 */

const variant = ALL_VARIANTS[0]!

function hitOf(impact: number) {
  return { variant, x: 0.5, y: 1.2, mass: 0.24, impact, first: true }
}

describe('부딪힘의 값', () => {
  it('세기는 0~1로 눌러 담는다', () => {
    expect(strengthOf(hitOf(0))).toBe(0)
    expect(strengthOf(hitOf(IMPACT_FULL_SCALE / 2))).toBeCloseTo(0.5, 5)
    // 아무리 세게 부딪혀도 1을 넘지 않는다 — 넘으면 음량과 부스러기가 폭주한다
    expect(strengthOf(hitOf(IMPACT_FULL_SCALE * 10))).toBe(1)
  })

  /*
   * 여기가 이 파일의 핵심이다. 부스러기와 소리가 **같은 값**을 써야 눈과 귀가
   * 어긋나지 않는다 — 예전에는 두 곳에서 각자 계산했다.
   */
  it('부스러기와 소리가 같은 세기를 쓴다', () => {
    const hit = hitOf(IMPACT_FULL_SCALE * 0.37)
    const event = impactEventOf(hit)
    expect(trailHitOf(hit).strength).toBe(strengthOf(hit))
    expect(event.kind === 'impact' && event.strength).toBe(strengthOf(hit))
  })

  it('부스러기는 부딪힌 자리와 물건의 색을 그대로 쓴다', () => {
    const hit = hitOf(1)
    const trail = trailHitOf(hit)
    expect(trail.x).toBe(hit.x)
    expect(trail.y).toBe(hit.y)
    expect(trail.id).toBe(variant.id)
    expect(trail.color).toBe(variant.color)
  })

  /*
   * 크기는 몸통 음높이를 정한다 — 큰 것이 낮게 울린다. 그림의 큰 변에서 뽑는다.
   */
  it('소리 크기는 그림의 큰 변에서 나온다', () => {
    const event = impactEventOf(hitOf(1))
    const expected = Math.max(variant.artBounds.hw, variant.artBounds.hh) * 2
    expect(event.kind === 'impact' && event.size).toBe(expected)
  })

  it('박스 반응음을 가르는 실제 질량을 손대지 않고 넘긴다', () => {
    const hit = hitOf(1)
    const event = impactEventOf(hit)
    expect(event.kind === 'impact' && event.mass).toBe(hit.mass)
  })

  it('재질과 개체값은 손대지 않고 넘긴다', () => {
    const event = impactEventOf(hitOf(1))
    if (event.kind !== 'impact') throw new Error('impact가 아니다')
    expect(event.material).toBe(variant.material)
    expect(event.tone).toBe(variant.tone)
    expect(event.grain).toBe(variant.grain)
  })

  it('지진은 0이면 아무 일도 아니다', () => {
    expect(quakeEventOf(0)).toBeNull()
    expect(quakeEventOf(-1)).toBeNull()
  })

  it('지진도 1을 넘지 않는다', () => {
    const event = quakeEventOf(QUAKE_IMPACT_SCALE * 5)
    expect(event?.kind === 'quake' && event.strength).toBe(1)
  })
})
