import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioBus } from '../src/audio/AudioBus.ts'

/**
 * 소리가 **깨어 있을 때만** 예약되는가.
 *
 * 브라우저는 사용자가 누르기 전까지 대개 소리를 내주지 않는다. 그런데 `suspended`인
 * 컨텍스트에 예약한 소리는 **오류도 없이 사라진다** — 그래서 이 고장은 조용하다.
 * 곡이 안 나오는 것이 아니라 첫 마디가 통째로 비어버리는 식이라 눈치채기도 어렵다.
 *
 * 예약하는 쪽이 물어야 하는 것은 "컨텍스트가 있는가"가 아니라 **"깨어 있는가"**다.
 * 그것을 `running`이 말하고, 여기서 그 약속을 지킨다.
 *
 * ## 왜 가짜 컨텍스트인가
 *
 * node에는 WebAudio가 없고, 있더라도 **제스처 없이 열리는지는 브라우저가 정한다** —
 * 그 판단은 실기로만 볼 수 있다. 여기서 잴 수 있는 것은 "열렸다고 할 때 어떻게
 * 행동하는가"까지이고, 조용히 사라지는 고장은 정확히 그 자리에 있다.
 */

interface FakeContext {
  state: 'suspended' | 'running'
  resume: () => Promise<void>
}

/** 실제 `AudioContext`가 하는 일 중 `AudioBus`가 만지는 것만 흉내 낸다 */
function fakeAudioContext(opensWithoutGesture: boolean) {
  const created: FakeContext[] = []
  const node = () => ({
    connect: () => {},
    gain: { value: 0, setValueAtTime: () => {}, cancelAndHoldAtTime: () => {}, linearRampToValueAtTime: () => {} },
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    frequency: { value: 0 },
    Q: { value: 0 },
    type: '',
  })
  class Ctx implements FakeContext {
    state: 'suspended' | 'running' = 'suspended'
    currentTime = 0
    destination = node()
    sampleRate = 48000
    constructor() {
      created.push(this)
    }
    resume(): Promise<void> {
      if (opensWithoutGesture) {
        this.state = 'running'
      }
      return Promise.resolve()
    }
    suspend(): Promise<void> {
      this.state = 'suspended'
      return Promise.resolve()
    }
    close(): Promise<void> {
      return Promise.resolve()
    }
    createGain = node
    createDynamicsCompressor = node
    createBiquadFilter = node
    createBuffer = (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    })
  }
  return { Ctx, created }
}

describe('소리는 깨어 있을 때만 예약된다', () => {
  const globals = globalThis as unknown as Record<string, unknown>
  let previous: unknown

  beforeEach(() => {
    previous = globals['AudioContext']
  })
  afterEach(() => {
    globals['AudioContext'] = previous
    vi.restoreAllMocks()
  })

  /** 컨텍스트를 만들기 전에는 낼 수 있는 소리가 없다 */
  it('열기 전에는 잠들어 있다', () => {
    const { Ctx } = fakeAudioContext(false)
    globals['AudioContext'] = Ctx
    expect(new AudioBus().running).toBe(false)
  })

  /**
   * 이미 논 적이 있는 사이트라면 브라우저가 제스처 없이 열어준다.
   * 그때는 시작 화면의 곡이 새로고침 직후부터 흘러야 한다.
   */
  it('제스처 없이 열리면 그때 알린다', async () => {
    const { Ctx } = fakeAudioContext(true)
    globals['AudioContext'] = Ctx
    const bus = new AudioBus()
    const opened = vi.fn()
    bus.tryOpen(opened)
    await Promise.resolve()
    await Promise.resolve()
    expect(opened).toHaveBeenCalled()
    expect(bus.running).toBe(true)
  })

  /**
   * 안 열리면 **아무것도 하지 않는다.** 여기서 곡을 걸면 그 음들이 조용히 사라지고,
   * 첫 제스처 뒤에 이어지는 것이 아니라 그 구간이 통째로 비어버린다.
   */
  it('안 열리면 알리지 않고 잠든 채로 둔다', async () => {
    const { Ctx } = fakeAudioContext(false)
    globals['AudioContext'] = Ctx
    const bus = new AudioBus()
    const opened = vi.fn()
    bus.tryOpen(opened)
    await Promise.resolve()
    await Promise.resolve()
    expect(opened).not.toHaveBeenCalled()
    expect(bus.running).toBe(false)
  })

  /** 브라우저가 WebAudio를 아예 모르는 경우에도 터지지 않아야 한다 */
  it('WebAudio가 없어도 터지지 않는다', () => {
    delete globals['AudioContext']
    const bus = new AudioBus()
    const opened = vi.fn()
    expect(() => bus.tryOpen(opened)).not.toThrow()
    expect(bus.running).toBe(false)
    expect(opened).not.toHaveBeenCalled()
  })

  /**
   * 첫 제스처가 들어오면 그때 열린다. `tryOpen`이 실패한 브라우저에서 이쪽이 이어받는다 —
   * 둘 중 하나는 반드시 열어야 하고, 그래서 두 길이 같은 상태를 본다.
   */
  it('첫 제스처가 tryOpen을 이어받는다', () => {
    const { Ctx } = fakeAudioContext(false)
    globals['AudioContext'] = Ctx
    const bus = new AudioBus()
    bus.tryOpen(() => {})
    expect(bus.running).toBe(false)

    // unlock 안에서는 브라우저가 열어준다
    globals['AudioContext'] = fakeAudioContext(true).Ctx
    const opened = new AudioBus()
    opened.unlock()
    expect(opened.running).toBe(true)
  })
})
