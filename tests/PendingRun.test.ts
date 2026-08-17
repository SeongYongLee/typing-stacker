import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunStats } from '../src/game/types/game.ts'
import { flushPendingRun, submitRun } from '../src/rank/client.ts'
import {
  clearPendingRun,
  loadPendingRun,
  queuePendingRun,
  STORAGE_KEY,
  type PendingRun,
} from '../src/storage/pendingRun.ts'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const lower: PendingRun = {
  id: 'player', name: '말랑한 연필', icon: '', score: 50_000,
  stackCount: 100, maxHeight: 12, maxCombo: 20, kpm: 300, durationSec: 600,
}

describe('미전송 싱글 기록', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('더 높은 기록을 보존하고 이전 요청의 완료가 새 기록을 지우지 않는다', () => {
    queuePendingRun(lower)
    const higher = queuePendingRun({ ...lower, score: 300_000 })

    expect(loadPendingRun()?.score).toBe(300_000)
    clearPendingRun(lower)
    expect(loadPendingRun()).toEqual(higher)
    clearPendingRun(higher)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('전송 실패 기록을 남겼다가 다음 재시도 성공 후 지운다', async () => {
    localStorage.setItem('typing-stacker/profile/v1', JSON.stringify({
      id: 'player', name: '말랑한 연필', icon: '',
    }))
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        best: { ...lower, at: undefined }, rank: 1, top: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const stats: RunStats = {
      score: 300_000,
      rawScore: 300_000,
      accuracy: 1,
      stackCount: 120,
      maxHeight: 16,
      missedWords: 0,
      lives: 0,
      combo: 0,
      maxCombo: 60,
      kpm: 350,
      durationSec: 900,
      hiddenFound: [],
    }

    expect(await submitRun(stats)).toBeNull()
    expect(loadPendingRun()?.score).toBe(300_000)

    expect(await flushPendingRun()).not.toBeNull()
    expect(loadPendingRun()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('서버 제한으로 거절된 기록을 남겼다가 정책 변경 후 다시 보낸다', async () => {
    localStorage.setItem('typing-stacker/profile/v1', JSON.stringify({
      id: 'player', name: '말랑한 연필', icon: '',
    }))
    const accepted = {
      best: { ...lower, score: 300_000, at: undefined }, rank: 1, top: [],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'invalid', reason: 'stack-count',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(accepted), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const stats: RunStats = {
      score: 300_000,
      rawScore: 300_000,
      accuracy: 1,
      stackCount: 650,
      maxHeight: 52,
      missedWords: 0,
      lives: 0,
      combo: 651,
      maxCombo: 651,
      kpm: 220,
      durationSec: 3600,
      hiddenFound: [],
    }

    expect(await submitRun(stats)).toMatchObject({ error: 'invalid', reason: 'stack-count' })
    expect(loadPendingRun()?.score).toBe(300_000)

    expect(await flushPendingRun()).toMatchObject({ rank: 1 })
    expect(loadPendingRun()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
