import { describe, expect, it } from 'vitest'
import { INITIAL_FADE_IN_SEC } from '../src/audio/Bgm.ts'
import {
  SPLASH_COVERED_MS,
  SPLASH_DARKEN_MS,
  SPLASH_REVEAL_MS,
} from '../src/components/SplashTransition.tsx'

describe('스플래시에서 플레이 화면으로 가는 검은 전환', () => {
  it('문 열림이 끝나는 0.6초까지 스플래시를 완전히 가린다', () => {
    expect(SPLASH_DARKEN_MS + SPLASH_COVERED_MS).toBe(600)
  })

  it('첫 배경음은 검어지기 전에 들릴 만큼 빠르게 열린다', () => {
    expect(INITIAL_FADE_IN_SEC * 1000).toBeLessThan(SPLASH_DARKEN_MS + SPLASH_COVERED_MS)
  })

  it('새 화면은 짧게 드러나 입력을 오래 막지 않는다', () => {
    expect(SPLASH_REVEAL_MS).toBeGreaterThan(0)
    expect(SPLASH_REVEAL_MS).toBeLessThanOrEqual(300)
  })
})
