import { describe, expect, it } from 'vitest'
import { catchSpot, plankOf, recallDropX } from '../src/game/systems/Catcher.ts'
import {
  catcherImageWidth,
  catcherPose,
  catcherVisualOffset,
} from '../src/game/renderer/arenaPaint.ts'

describe('회수 손 표시 크기와 동선', () => {
  it('기준 크기의 3.24배로 그린다', () => {
    for (const scale of [0, 100, 1_000]) {
      const original = Math.min(260, Math.max(190, scale * 2.25))
      expect(catcherImageWidth(scale)).toBeCloseTo(original * 3.24)
    }
  })

  it('화면 바깥 아래에서 안쪽 위로 들어온다', () => {
    const width = 450
    const height = 432
    const leftStart = catcherPose(0, 'left', width, height)
    const leftMiddle = catcherPose(0.09, 'left', width, height)
    const leftSettled = catcherPose(0.18, 'left', width, height)
    const rightStart = catcherPose(0, 'right', width, height)

    expect(leftStart.x).toBeLessThan(leftMiddle.x)
    expect(leftMiddle.x).toBeLessThan(leftSettled.x)
    expect(leftStart.y).toBeGreaterThan(leftMiddle.y)
    expect(leftMiddle.y).toBeGreaterThan(leftSettled.y)
    expect(leftSettled.x).toBe(catcherVisualOffset('left'))
    expect(leftSettled.y).toBeCloseTo(0)
    expect(leftSettled.alpha).toBe(1)
    expect(rightStart.x).toBeGreaterThan(catcherVisualOffset('right'))
    expect(rightStart.y).toBeGreaterThan(0)
  })

  it('왼쪽 손은 오른쪽 손의 위치와 움직임을 정확히 반전한다', () => {
    const width = 730
    const height = 700
    for (const progress of [0, 0.09, 0.18, 0.5, 0.9, 1]) {
      const left = catcherPose(progress, 'left', width, height)
      const right = catcherPose(progress, 'right', width, height)
      expect(left.x, `진행도 ${progress}`).toBeCloseTo(-right.x)
      expect(left.y, `진행도 ${progress}`).toBeCloseTo(right.y)
      expect(left.alpha, `진행도 ${progress}`).toBeCloseTo(right.alpha)
    }
  })

  it('회수 물건이 좌우 모두 손바닥 기준점 가까이 떨어진다', () => {
    const scale = 100
    const width = catcherImageWidth(scale)

    for (const side of ['left', 'right'] as const) {
      const dropX = recallDropX(side)
      const plank = plankOf(catchSpot(dropX, side, 1.6))
      const pose = catcherPose(0.35, side, width, width * 0.96)
      const handX = plank.x * scale + pose.x
      const handY = plank.y * scale + pose.y
      const dropY = plank.y + Math.tan(plank.angle) * (dropX - plank.x)
      const itemX = dropX * scale + catcherVisualOffset(side)
      const itemY = dropY * scale

      /* 손바닥 기준점에서 이미지 폭의 5% 안이면 실제 손바닥 면적에 충분히 들어온다. */
      expect(Math.hypot(itemX - handX, itemY - handY), side).toBeLessThan(width * 0.05)
    }
  })
})
