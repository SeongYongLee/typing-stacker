import { catcherImageWidth, catcherPose, catcherVisualOffset } from '../arenaPaint.ts'
import { ARENA_ART } from '../arenaArt.generated.ts'

/** Follow the same screen-space retreat as the hand, only after it has arrived. */
export function recallExit(progress: number, side: 'left' | 'right', scale: number, yaw = 0, compact = false) {
  const width = catcherImageWidth(scale, compact)
  const art = ARENA_ART['catch-day']
  const pose = catcherPose(Math.max(0.5, Math.min(1, progress)), side, width, width * art.height / art.width, compact)
  return { x: (pose.x - catcherVisualOffset(side, compact)) / (scale * Math.cos(yaw)), y: -pose.y / scale }
}
