import { prefersReducedMotion } from './displayPrefs.ts'

interface LightBounds {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

const COLORS = ['#6d5cff', '#b049ff', '#ff4fa3', '#38d7ff', '#4fffb0', '#ff6b77'] as const
const BEAM_COUNT = 7
const SPOT_COUNT = 28

/** 미러볼 등장 순간의 조명. 물리와 무관한 화면 효과라 렌더러 경계에 둔다. */
function drawMirrorBallLights(
  ctx: CanvasRenderingContext2D,
  bounds: LightBounds,
  progress: number,
): void {
  const t = clamp(progress, 0, 1)
  if (t >= 1) {
    return
  }

  const reducedMotion = prefersReducedMotion()
  const intensity = Math.sin(Math.PI * t) * (reducedMotion ? 0.28 : 1)
  if (intensity <= 0) {
    return
  }

  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top
  const sourceX = (bounds.left + bounds.right) / 2
  const sourceY = bounds.top + height * 0.08
  const time = t * 2.8

  ctx.save()
  ctx.beginPath()
  ctx.rect(bounds.left, bounds.top, width, height)
  ctx.clip()
  ctx.globalCompositeOperation = 'screen'

  drawBeams(ctx, sourceX, sourceY, width, height, time, intensity, reducedMotion)
  drawFloorSpots(ctx, bounds, time, intensity, reducedMotion)

  ctx.restore()
}

function drawBeams(
  ctx: CanvasRenderingContext2D,
  sourceX: number,
  sourceY: number,
  width: number,
  height: number,
  time: number,
  intensity: number,
  reducedMotion: boolean,
): void {
  const beamCount = reducedMotion ? 3 : BEAM_COUNT

  for (let index = 0; index < beamCount; index += 1) {
    const phase = index * 1.73
    const color = COLORS[index % COLORS.length]!
    const sweep = reducedMotion
      ? Math.sin(phase) * 0.18
      : Math.sin(time * (3.1 + index * 0.13) + phase) * 0.82
    const targetX = sourceX + sweep * width * 0.56
    const targetY = sourceY + height * (0.58 + (index % 3) * 0.1)
    const dx = targetX - sourceX
    const dy = targetY - sourceY
    const distance = Math.hypot(dx, dy)
    const spread = width * (0.055 + (index % 3) * 0.012)
    const perpendicularX = (-dy / distance) * spread
    const perpendicularY = (dx / distance) * spread
    const gradient = ctx.createLinearGradient(sourceX, sourceY, targetX, targetY)

    gradient.addColorStop(0, withAlpha(color, 0.24 * intensity))
    gradient.addColorStop(0.48, withAlpha(color, 0.12 * intensity))
    gradient.addColorStop(1, withAlpha(color, 0))

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(sourceX, sourceY)
    ctx.lineTo(targetX - perpendicularX, targetY - perpendicularY)
    ctx.lineTo(targetX + perpendicularX, targetY + perpendicularY)
    ctx.closePath()
    ctx.fill()
  }
}

function drawFloorSpots(
  ctx: CanvasRenderingContext2D,
  bounds: LightBounds,
  time: number,
  intensity: number,
  reducedMotion: boolean,
): void {
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top
  const spotCount = reducedMotion ? 12 : SPOT_COUNT

  for (let index = 0; index < spotCount; index += 1) {
    const column = index % 7
    const row = Math.floor(index / 7)
    const phase = index * 1.41
    const color = COLORS[(index * 5) % COLORS.length]!
    const baseX = bounds.left + ((column + 0.5) / 7) * width
    const baseY = bounds.top + height * (0.61 + row * 0.085)
    const sway = reducedMotion ? 0 : Math.sin(time * (4.5 + (index % 4) * 0.25) + phase)
    const bob = reducedMotion ? 0 : Math.cos(time * (3.6 + (index % 3) * 0.3) + phase)
    const x = baseX + sway * width * 0.055
    const y = baseY + bob * height * 0.028
    const radius = Math.max(8, Math.min(width, height) * (0.028 + (index % 3) * 0.006))
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)

    gradient.addColorStop(0, withAlpha('#ffffff', 0.38 * intensity))
    gradient.addColorStop(0.2, withAlpha(color, 0.34 * intensity))
    gradient.addColorStop(1, withAlpha(color, 0))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function withAlpha(color: string, alpha: number): string {
  const channel = Math.round(clamp(alpha, 0, 1) * 255)
  return `${color}${channel.toString(16).padStart(2, '0')}`
}

export { drawMirrorBallLights }
