import { expect, it } from 'vitest'
import { recallExit } from '../src/game/renderer/three/RecallExit.ts'
import { catcherPose, catcherImageWidth, catcherVisualOffset } from '../src/game/renderer/arenaPaint.ts'
import { ARENA_ART } from '../src/game/renderer/arenaArt.generated.ts'
it.each(['left', 'right'] as const)('keeps an item on the retreating %s hand', side => {
  for (const scale of [45, 90]) for (const yaw of [0, 0.14]) {
    expect(recallExit(0.6, side, scale, yaw).x).toBeCloseTo(0)
    const middle = recallExit(0.9, side, scale, yaw), end = recallExit(1, side, scale, yaw)
    expect(Math.abs(end.x)).toBeGreaterThan(Math.abs(middle.x))
    expect(end.y).toBeLessThan(middle.y)
    const width = catcherImageWidth(scale), art = ARENA_ART['catch-day']
    const pose = catcherPose(0.9, side, width, width * art.height / art.width)
    expect(middle.x * scale * Math.cos(yaw)).toBeCloseTo(pose.x - catcherVisualOffset(side))
    expect(-middle.y * scale).toBeCloseTo(pose.y)
  }
})
