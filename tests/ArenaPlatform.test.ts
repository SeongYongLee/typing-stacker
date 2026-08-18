import { describe, expect, it } from 'vitest'
import { ARENA } from '../src/game/config.ts'
import { SOLO_STAGES } from '../src/game/data/soloStages.ts'
import { ARENA_ART } from '../src/game/renderer/arenaArt.generated.ts'
import { platformRect } from '../src/game/renderer/arenaPaint.ts'
import type { ArenaView } from '../src/game/renderer/arenaView.ts'

const SCALE = 100
const CENTER_X = 500
const view = {
  ctx: {} as CanvasRenderingContext2D,
  scale: SCALE,
  cssWidth: 1000,
  cssHeight: 800,
  cameraY: 0,
  nightfall: 0,
  toScreenX: (worldX: number) => CENTER_X + worldX * SCALE,
  toScreenY: (worldY: number) => 800 - worldY * SCALE,
} satisfies ArenaView

describe('싱글 수납함 표시 크기', () => {
  it('단계별 폭과 원본 비율을 유지하며 바닥을 물리 판정선에 맞춘다', () => {
    const art = ARENA_ART['platform-back-day']

    for (const stage of SOLO_STAGES) {
      const box = platformRect(view, stage.box.halfWidth)
      expect(box.width).toBe(stage.box.halfWidth * 2 * SCALE)
      expect(box.left).toBe(CENTER_X - box.width / 2)
      expect(box.height / box.width).toBe(art.height / art.width)
      expect(box.top + box.height).toBe(view.toScreenY(ARENA.platformTop) + 5)
    }
  })
})
