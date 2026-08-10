import { describe, expect, it } from 'vitest'
import {
  IMPACT_WINDOW_MAX,
  IMPACT_WINDOW_SEC,
  SoundLimiter,
} from '../src/audio/SoundLimiter.ts'

/**
 * 소리를 몇 개 흘려보내는지는 잴 수 있다. 실제로 어떻게 들리는지는 귀로만 알 수 있으므로
 * 여기서 지키는 것은 "무너질 때 소리가 폭주하지 않는다"와 "타자는 막히지 않는다"뿐이다.
 */
describe('SoundLimiter', () => {
  it('같은 소리를 최소 간격 안에서는 한 번만 흘려보낸다', () => {
    const limiter = new SoundLimiter()

    expect(limiter.allow('lifeLost', 0)).toBe(true)
    expect(limiter.allow('lifeLost', 0.05)).toBe(false)
    expect(limiter.allow('lifeLost', 0.19)).toBe(false)
    // 목숨 소리의 간격은 0.2초다
    expect(limiter.allow('lifeLost', 0.21)).toBe(true)
  })

  it('종류가 다르면 서로를 막지 않는다', () => {
    const limiter = new SoundLimiter()

    expect(limiter.allow('wordHit', 0)).toBe(true)
    expect(limiter.allow('wordMiss', 0)).toBe(true)
    expect(limiter.allow('drop', 0)).toBe(true)
    expect(limiter.allow('merge', 0)).toBe(true)
  })

  /**
   * 타자음은 키와 1대1이어야 한다. 분당 600타(초당 10타)는 사람이 낼 수 있는 속도이고,
   * 그때 소리가 빠지면 "내가 친 것이 들어갔나"가 흔들린다.
   */
  it('빠르게 쳐도 타자음은 막히지 않는다', () => {
    const limiter = new SoundLimiter()
    let played = 0
    for (let i = 0; i < 20; i += 1) {
      if (limiter.allow('typed', i * 0.1)) {
        played += 1
      }
    }
    expect(played).toBe(20)
  })

  it('한 창 안의 부딪힘은 상한까지만 울린다', () => {
    const limiter = new SoundLimiter()
    let played = 0
    // 무너지는 순간처럼 같은 프레임에 우수수 들어온다
    for (let i = 0; i < 30; i += 1) {
      if (limiter.allow('impact', 0)) {
        played += 1
      }
    }
    expect(played).toBe(IMPACT_WINDOW_MAX)
  })

  it('창이 지나면 부딪힘이 다시 울린다', () => {
    const limiter = new SoundLimiter()
    for (let i = 0; i < 10; i += 1) {
      limiter.allow('impact', 0)
    }
    expect(limiter.allow('impact', 0.01)).toBe(false)
    expect(limiter.allow('impact', IMPACT_WINDOW_SEC)).toBe(true)
  })

  /**
   * 무너짐이 길게 이어져도 초당 개수가 정해진 만큼만 나온다.
   * 이 값이 커지면 소리가 뭉개지고, 작으면 무너짐이 조용해진다.
   */
  it('무너지는 1초 동안 나는 부딪힘 소리에 상한이 있다', () => {
    const limiter = new SoundLimiter()
    let played = 0
    // 60프레임 동안 매 프레임 5개씩 쏟아지는 상황
    for (let frame = 0; frame < 60; frame += 1) {
      for (let i = 0; i < 5; i += 1) {
        if (limiter.allow('impact', frame / 60)) {
          played += 1
        }
      }
    }
    expect(played).toBeLessThanOrEqual(Math.ceil(1 / IMPACT_WINDOW_SEC) * IMPACT_WINDOW_MAX)
    // 그러면서도 완전히 조용해지지는 않는다
    expect(played).toBeGreaterThan(10)
  })

  it('reset하면 처음 상태로 돌아간다', () => {
    const limiter = new SoundLimiter()
    expect(limiter.allow('collapse', 0)).toBe(true)
    expect(limiter.allow('collapse', 0.1)).toBe(false)
    limiter.reset()
    expect(limiter.allow('collapse', 0.1)).toBe(true)
  })
})
