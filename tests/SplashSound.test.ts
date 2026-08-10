import { describe, expect, it } from 'vitest'
import { SoundBoard } from '../src/audio/SoundBoard.ts'

interface FakeAudioParam {
  value: number
  setValueAtTime(value: number, at: number): void
  exponentialRampToValueAtTime(value: number, at: number): void
}

function audioParam(): FakeAudioParam {
  return {
    value: 0,
    setValueAtTime(value) { this.value = value },
    exponentialRampToValueAtTime(value) { this.value = value },
  }
}

function fakeContext() {
  const starts: number[] = []
  const connectable = () => ({
    connect() { return this },
    disconnect() {},
  })
  const ctx = {
    currentTime: 10,
    createOscillator() {
      return {
        ...connectable(),
        type: 'sine',
        frequency: audioParam(),
        detune: { value: 0 },
        start(at: number) { starts.push(at) },
        stop() {},
      }
    },
    createGain() {
      return { ...connectable(), gain: audioParam() }
    },
    createBufferSource() {
      return {
        ...connectable(),
        buffer: null,
        start(at: number) { starts.push(at) },
        stop() {},
      }
    },
    createBiquadFilter() {
      return {
        ...connectable(),
        type: 'lowpass',
        frequency: audioParam(),
        Q: { value: 0 },
      }
    },
  }
  return { ctx: ctx as unknown as AudioContext, starts }
}

/** SoundBoard가 필요로 하는 AudioBus의 최소 표면. WebAudio 노드 예약만 받아 적는다. */
function installFakeBus(board: SoundBoard) {
  const { ctx, starts } = fakeContext()
  const bus = {
    context: null as AudioContext | null,
    running: false,
    sfx: {} as AudioNode,
    bgm: null,
    noiseBuffer: { duration: 1 } as AudioBuffer,
    current: { sfxVolume: 1, bgmVolume: 0 },
    async unlock() {
      this.context = ctx
      await Promise.resolve()
      this.running = true
    },
    update() {},
    subscribe() { return () => {} },
    setSuspended() {},
    dispose() {},
  }
  ;(board as unknown as { bus: typeof bus }).bus = bus
  return { bus, ctx, starts }
}

describe('스플래시 사무실 문', () => {
  it('첫 제스처 전의 열림을 보관했다가 unlock에서 한 번만 연다', async () => {
    const board = new SoundBoard()
    const { starts } = installFakeBus(board)

    board.setSplash(true)
    expect(starts).toHaveLength(0)

    await board.unlock()
    expect(starts.length).toBeGreaterThan(0)
    const afterFirstUnlock = starts.length

    await board.unlock()
    expect(starts).toHaveLength(afterFirstUnlock)
    board.dispose()
  })

  it('첫 클릭으로 바로 나가도 닫힘은 열림 뒤 0.6초부터 난다', async () => {
    const board = new SoundBoard()
    const { bus, ctx, starts } = installFakeBus(board)
    await bus.unlock()

    board.setSplash(true)
    const openCount = starts.length
    expect(openCount).toBeGreaterThan(0)

    ;(ctx as unknown as { currentTime: number }).currentTime = 10.1
    board.setSplash(false)
    const closeStarts = starts.slice(openCount)
    expect(closeStarts.length).toBeGreaterThan(0)
    expect(Math.min(...closeStarts)).toBeGreaterThanOrEqual(10.6)
    board.dispose()
  })
})
