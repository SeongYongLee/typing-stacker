import { ARENA, ARENA_SCREEN_MAX_WIDTH } from '../config.ts'

/** Show the whole stack and platform; leave the distant spawn point above the view. */
export function compactCamera(width: number, height: number, stackTop: number) {
  const top = Math.max(2.6, stackTop + 0.3)
  const scale = Math.max(0.01, Math.min(
    Math.max(0, Math.min(width, ARENA_SCREEN_MAX_WIDTH)) / (ARENA.halfWidth * 2),
    // The small arrow needs only 20px. Give the recovered space back to item scale.
    Math.max(0, height - 20) / (top - ARENA.killY - 0.18),
  ))
  return { scale }
}
