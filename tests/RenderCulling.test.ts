import { describe, expect, it } from 'vitest'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import { bodyVisible } from '../src/game/renderer/ArenaRenderer.ts'
import type { ArenaView } from '../src/game/renderer/arenaView.ts'
import type { BodySnapshot } from '../src/game/types/game.ts'

const variant = VARIANT_BY_ID.values().next().value!
const view: ArenaView = {
  ctx: null as unknown as CanvasRenderingContext2D,
  scale: 100,
  cssWidth: 800,
  cssHeight: 600,
  cameraY: 0,
  nightfall: 0,
  toScreenX: (x) => 400 + x * 100,
  toScreenY: (y) => 500 - y * 100,
}

function body(x: number, y: number): BodySnapshot {
  return {
    handle: 1,
    variant,
    owner: 'solo',
    x,
    y,
    rotation: 0,
    settled: true,
  }
}

describe('장시간 싱글 렌더 대상', () => {
  it('화면 안 물건과 경계에 걸친 물건은 남긴다', () => {
    expect(bodyVisible(view, body(0, 2))).toBe(true)
    expect(bodyVisible(view, body(0, 5.5))).toBe(true)
  })

  it('카메라 아래와 좌우 바깥 물건은 그리지 않는다', () => {
    expect(bodyVisible(view, body(0, -5))).toBe(false)
    expect(bodyVisible(view, body(10, 2))).toBe(false)
  })
})
