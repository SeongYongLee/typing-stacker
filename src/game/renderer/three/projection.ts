import { ARENA, ARENA_SCREEN_MAX_WIDTH } from '../../config.ts'

// Match the original arena framing so switching renderers does not move the stack.
const BOTTOM = ARENA.killY + 0.18
const HEIGHT = Math.max(ARENA.height, ARENA.spawnY + 0.8) - BOTTOM

function arenaProjection(width: number, height: number, cameraY: number, yaw = 0, scaleOverride?: number) {
  const scale = scaleOverride ?? Math.max(0.01, Math.min(Math.min(width, ARENA_SCREEN_MAX_WIDTH) / (ARENA.halfWidth * 2), height / HEIGHT))
  const bottom = BOTTOM + cameraY
  const centerY = bottom + height / scale / 2
  return {
    scale, bottom, centerY,
    halfWidth: width / scale / 2,
    halfHeight: height / scale / 2,
    toScreenX: (x: number) => width / 2 + x * Math.cos(yaw) * scale,
    toScreenY: (y: number) => height - (y - bottom) * scale,
  }
}

export { arenaProjection }
