import { describe, expect, it } from 'vitest'
import { ARENA, CAMERA_FOLLOW, CAMERA_START_TOP } from '../src/game/config.ts'
import {
  followCameraY,
  renderVerticalBounds,
  spawnYFor,
  targetCameraY,
} from '../src/game/systems/Camera.ts'

describe('targetCameraY', () => {
  it('낮은 탑에서는 움직이지 않는다', () => {
    expect(targetCameraY(ARENA.platformTop)).toBe(0)
    expect(targetCameraY(CAMERA_START_TOP - 0.5)).toBe(0)
  })

  it('화면의 2/3 정도가 찬 뒤 넘친 만큼 올라간다', () => {
    expect(CAMERA_START_TOP).toBeCloseTo(
      ARENA.platformTop + (ARENA.height - ARENA.platformTop) * (2 / 3),
    )
    expect(targetCameraY(CAMERA_START_TOP)).toBe(0)
    expect(targetCameraY(CAMERA_START_TOP + 1)).toBeCloseTo(1)
  })

  it('카메라가 오른 뒤에는 스폰 높이와 탑 사이의 여유가 일정하다', () => {
    const expectedGap = ARENA.spawnY - CAMERA_START_TOP
    for (const top of [5, 8, 20, 100]) {
      // 카메라가 저기 있을 때 물건이 생기는 높이
      const spawn = spawnYFor(targetCameraY(top))
      expect(spawn - top).toBeCloseTo(expectedGap)
    }
  })

  it('아무리 높아도 물건은 탑 위에서 생긴다 — 탑 속에 생기면 서로를 밀어낸다', () => {
    for (const top of [CAMERA_START_TOP, 5, 12, 50]) {
      expect(spawnYFor(targetCameraY(top))).toBeGreaterThan(top)
    }
  })

  it('렌더 범위가 카메라를 따라간 스폰 위치를 처음부터 포함한다', () => {
    for (const camera of [0, 4, 20]) {
      const bounds = renderVerticalBounds(camera, 1.5)
      expect(bounds.top).toBeGreaterThan(spawnYFor(camera))
      expect(bounds.bottom).toBeLessThan(camera + ARENA.killY)
    }
  })
})

describe('followCameraY', () => {
  it('목표를 향해 다가가되 한 번에 닿지는 않는다', () => {
    const stackTop = 6
    const target = targetCameraY(stackTop)
    const next = followCameraY(0, stackTop, 1 / 60)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(target)
  })

  it('계속 따라가면 목표에 수렴한다', () => {
    const stackTop = 6
    let camera = 0
    for (let i = 0; i < 300; i += 1) {
      camera = followCameraY(camera, stackTop, 1 / 60)
    }
    expect(camera).toBeCloseTo(targetCameraY(stackTop), 3)
  })

  it('탑이 무너져 낮아지면 시야도 내려온다 — 하늘만 보고 있으면 안 된다', () => {
    let camera = targetCameraY(8)
    expect(camera).toBeGreaterThan(0)
    for (let i = 0; i < 300; i += 1) {
      camera = followCameraY(camera, ARENA.platformTop, 1 / 60)
    }
    expect(camera).toBeCloseTo(0, 3)
  })

  it('내려갈 때는 올라갈 때보다 천천히 따라가 흔들림을 줄인다', () => {
    const current = targetCameraY(8)
    const target = targetCameraY(ARENA.platformTop)
    const next = followCameraY(current, ARENA.platformTop, 1 / 60)
    const symmetricNext = current + (target - current) * Math.min(1, CAMERA_FOLLOW / 60)

    expect(next).toBeLessThan(current)
    expect(next).toBeGreaterThan(symmetricNext)
  })

  it('한 프레임이 길어져도 목표를 지나치지 않는다', () => {
    // 탭이 백그라운드에 있다 돌아오면 dt가 통째로 크게 들어온다
    const stackTop = 6
    const camera = followCameraY(0, stackTop, 10)
    expect(camera).toBeCloseTo(targetCameraY(stackTop), 5)
  })
})
