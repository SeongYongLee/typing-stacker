import { describe, expect, it } from 'vitest'
import {
  canvasPixelRatio,
  MAX_CANVAS_DPR,
  MAX_CANVAS_PIXELS,
} from '../src/game/renderer/canvasResolution.ts'

describe('canvasPixelRatio', () => {
  it('작은 화면에서도 DPR 상한을 넘지 않는다', () => {
    expect(canvasPixelRatio(800, 600, 3)).toBe(MAX_CANVAS_DPR)
  })

  it('큰 화면의 backing store를 픽셀 예산 안으로 줄인다', () => {
    const ratio = canvasPixelRatio(3840, 2160, 2)
    expect(3840 * 2160 * ratio * ratio).toBeCloseTo(MAX_CANVAS_PIXELS)
  })

  it('잘못된 DPR과 아직 크기가 없는 캔버스를 안전하게 처리한다', () => {
    expect(canvasPixelRatio(0, 0, Number.NaN)).toBe(1)
  })
})
