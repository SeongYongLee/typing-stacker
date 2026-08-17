import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRank, flushPendingRun, syncProfile } from '../src/rank/client.ts'
import { queuePendingRun } from '../src/storage/pendingRun.ts'

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

const profile = { id: 'player', name: '반짝이는 샴푸통', icon: 'pencil-set' }
const view = {
  best: null,
  rank: null,
  top: [],
  ladder: [],
  rating: 1000,
  wins: 0,
  losses: 0,
}

describe('랭킹 프로필 동기화', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    localStorage.setItem('typing-stacker/profile/v1', JSON.stringify(profile))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('현재 프로필을 전용 API로 보낸다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(view), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await syncProfile()).toMatchObject(view)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/rank\/profile$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual(profile)
  })

  it('미전송 기록도 예전 이름 대신 현재 프로필로 보낸다', async () => {
    queuePendingRun({
      id: profile.id,
      name: '예전 이름',
      icon: '',
      score: 1000,
      stackCount: 10,
      maxHeight: 5,
      maxCombo: 5,
      kpm: 200,
      durationSec: 60,
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(view), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await flushPendingRun()

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({
      id: profile.id,
      name: profile.name,
      icon: profile.icon,
    })
  })

  it('순위표를 읽을 때 프로필 갱신 응답을 그대로 사용한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(view), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await fetchRank()).toMatchObject(view)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/rank\/profile$/)
  })
})
