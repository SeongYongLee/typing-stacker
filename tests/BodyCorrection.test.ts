import { describe, expect, it } from 'vitest'
import { WORDS } from '../src/game/data/words.ts'
import type { BodySnapshot } from '../src/game/types/game.ts'
import { BodyCorrection, DEFAULT_DURATION_SEC } from '../src/multi/BodyCorrection.ts'

const variant = WORDS[0]!.variants[0]!
const BODY: BodySnapshot = {
  handle: 10, variant, owner: 'p1', x: 2, y: 3, rotation: 0, settled: false,
}

const correction = (dx: number, rotation = 0) => ({
  handle: 10, itemId: 1, dx, dy: 0, rotation,
})

describe('BodyCorrection', () => {
  it('첫 그림은 직전 표시 위치와 정확히 이어지고 끝에는 권위 위치가 된다', () => {
    const smoother = new BodyCorrection()
    smoother.note([correction(-0.4)])
    smoother.advance(1 / 60)
    expect(smoother.apply([BODY])[0]?.x).toBeCloseTo(1.6, 8)

    smoother.advance(DEFAULT_DURATION_SEC)
    expect(smoother.apply([BODY])[0]?.x).toBeCloseTo(2, 8)
    expect(smoother.hasActive).toBe(false)
  })

  it('회전은 ±π 경계의 짧은 방향으로 이어 붙인다', () => {
    const smoother = new BodyCorrection()
    smoother.note([correction(0, Math.PI * 2 - 0.1)])
    expect(smoother.apply([BODY])[0]?.rotation).toBeCloseTo(-0.1, 5)
  })

  it('큰 위치나 회전 차이는 즉시 반영하되 한 렌더 동안 꼬리를 억제한다', () => {
    const smoother = new BodyCorrection()
    smoother.note([correction(0.8)])
    expect(smoother.apply([BODY])[0]?.x).toBe(2)
    expect(smoother.suppressedHandles.has(10)).toBe(true)
    smoother.apply([BODY])
    expect(smoother.suppressedHandles.has(10)).toBe(false)

    smoother.note([correction(0, Math.PI / 2)])
    expect(smoother.apply([BODY])[0]?.rotation).toBe(0)
    expect(smoother.suppressedHandles.has(10)).toBe(true)
  })

  it('보정 도중 새 교정은 현재 표시 위치에서 다시 시작한다', () => {
    const smoother = new BodyCorrection()
    smoother.note([correction(-0.4)])
    smoother.advance(1 / 60) // 첫 프레임 보존
    smoother.advance(DEFAULT_DURATION_SEC / 2)
    const shown = smoother.apply([BODY])[0]!.x

    // 새 권위 위치가 다시 0.1m 오른쪽으로 이동했다. 새 BODY가 그 권위 위치다.
    smoother.note([correction(-0.1)])
    const nextAuthority = { ...BODY, x: 2.1 }
    expect(smoother.apply([nextAuthority])[0]?.x).toBeCloseTo(shown, 8)
  })

  it('활성 보정 핸들을 꼬리 억제 목록에 넣는다', () => {
    const smoother = new BodyCorrection()
    smoother.note([correction(-0.2)])
    smoother.apply([BODY])
    expect(smoother.suppressedHandles.has(10)).toBe(true)
  })
})
