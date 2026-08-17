import { describe, expect, it, vi } from 'vitest'
import { cancelAutoMatchSearch } from '../src/hooks/useAutoMatch.ts'

describe('자동매칭 취소', () => {
  it('지원하지 않는 서버 응답으로 원격 검색이 멈춘 뒤에도 로컬 화면을 닫는다', () => {
    const active = { current: false }
    const close = vi.fn()
    const leave = vi.fn(async () => {})

    cancelAutoMatchSearch(active, close, leave)

    expect(close).toHaveBeenCalledOnce()
    expect(leave).not.toHaveBeenCalled()
  })

  it('실제로 검색 중이면 로컬 화면을 닫고 서버 줄에서도 나간다', () => {
    const active = { current: true }
    const close = vi.fn(() => {
      active.current = false
    })
    const leave = vi.fn(async () => {})

    cancelAutoMatchSearch(active, close, leave)

    expect(active.current).toBe(false)
    expect(close).toHaveBeenCalledOnce()
    expect(leave).toHaveBeenCalledOnce()
  })
})
