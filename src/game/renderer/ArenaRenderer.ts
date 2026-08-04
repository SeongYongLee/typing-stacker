import { ARENA } from '../config.ts'
import type { BodySnapshot, ShapeDef } from '../types/game.ts'

interface ArenaRenderState {
  readonly bodies: readonly BodySnapshot[]
  readonly aimX: number
  readonly showAim: boolean
}

const COLORS = {
  frame: '#262b3d',
  frameEdge: '#3a4160',
  platform: '#4a5171',
  platformTop: '#6b74a0',
  aim: '#ffcf5c',
  aimTrack: 'rgba(255, 207, 92, 0.16)',
  danger: 'rgba(255, 107, 107, 0.5)',
} as const

/** 월드 y 범위: killY(이탈선)부터 아레나 천장까지 */
const WORLD_HEIGHT = ARENA.height - ARENA.killY
const WORLD_WIDTH = ARENA.halfWidth * 2

class ArenaRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private scale = 1
  private cssWidth = 0
  private cssHeight = 0

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (ctx === null) {
      throw new Error('2D 컨텍스트를 얻을 수 없다')
    }
    this.canvas = canvas
    this.ctx = ctx
    this.resize()
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.cssWidth = rect.width
    this.cssHeight = rect.height
    this.canvas.width = Math.round(rect.width * dpr)
    this.canvas.height = Math.round(rect.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.scale = Math.min(rect.width / WORLD_WIDTH, rect.height / WORLD_HEIGHT)
  }

  draw(state: ArenaRenderState): void {
    const { ctx } = this
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight)

    this.drawFrame()
    this.drawPlatform()
    if (state.showAim) {
      this.drawAim(state.aimX)
    }
    for (const body of state.bodies) {
      this.drawBody(body)
    }
  }

  private toScreenX(worldX: number): number {
    return this.cssWidth / 2 + worldX * this.scale
  }

  private toScreenY(worldY: number): number {
    return this.cssHeight - (worldY - ARENA.killY) * this.scale
  }

  private drawFrame(): void {
    const { ctx } = this
    const left = this.toScreenX(-ARENA.halfWidth)
    const right = this.toScreenX(ARENA.halfWidth)
    const top = this.toScreenY(ARENA.height)
    const bottom = this.toScreenY(ARENA.killY)

    ctx.save()
    ctx.strokeStyle = COLORS.frame
    ctx.lineWidth = 2
    ctx.setLineDash([6, 8])
    ctx.strokeRect(left, top, right - left, bottom - top)
    ctx.restore()

    // 이탈선 — 이 아래로 내려가면 게임오버
    ctx.save()
    ctx.strokeStyle = COLORS.danger
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(left, bottom - 1)
    ctx.lineTo(right, bottom - 1)
    ctx.stroke()
    ctx.restore()
  }

  private drawPlatform(): void {
    const { ctx } = this
    const left = this.toScreenX(-ARENA.platformHalfWidth)
    const width = ARENA.platformHalfWidth * 2 * this.scale
    const top = this.toScreenY(ARENA.platformTop)
    const height = ARENA.platformHalfHeight * 2 * this.scale

    ctx.fillStyle = COLORS.platform
    ctx.fillRect(left, top, width, height)
    ctx.fillStyle = COLORS.platformTop
    ctx.fillRect(left, top, width, Math.max(2, height * 0.16))
  }

  private drawAim(worldX: number): void {
    const { ctx } = this
    const x = this.toScreenX(worldX)
    const top = this.toScreenY(ARENA.height)
    const trackBottom = this.toScreenY(ARENA.platformTop)

    ctx.save()
    ctx.strokeStyle = COLORS.aimTrack
    ctx.lineWidth = 2
    ctx.setLineDash([4, 10])
    ctx.beginPath()
    ctx.moveTo(x, top + 22)
    ctx.lineTo(x, trackBottom)
    ctx.stroke()
    ctx.restore()

    ctx.save()
    ctx.fillStyle = COLORS.aim
    ctx.beginPath()
    ctx.moveTo(x, top + 20)
    ctx.lineTo(x - 9, top + 2)
    ctx.lineTo(x + 9, top + 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private drawBody(body: BodySnapshot): void {
    const { ctx } = this
    ctx.save()
    ctx.translate(this.toScreenX(body.x), this.toScreenY(body.y))
    // 월드는 y가 위로 +, 캔버스는 아래로 + 이므로 회전 방향을 뒤집는다
    ctx.rotate(-body.rotation)

    ctx.fillStyle = body.variant.color
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.lineWidth = 1.5
    this.tracePath(body.variant.shape)
    ctx.fill()
    ctx.stroke()

    const size = this.emojiSize(body.variant.shape)
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(body.variant.emoji, 0, 0)

    ctx.restore()
  }

  private tracePath(shape: ShapeDef): void {
    const { ctx, scale } = this
    ctx.beginPath()
    switch (shape.kind) {
      case 'circle':
        ctx.arc(0, 0, shape.radius * scale, 0, Math.PI * 2)
        break
      case 'box':
        ctx.rect(
          -shape.hw * scale,
          -shape.hh * scale,
          shape.hw * 2 * scale,
          shape.hh * 2 * scale,
        )
        break
      case 'capsule': {
        const r = shape.radius * scale
        const h = shape.halfHeight * scale
        ctx.moveTo(-r, -h)
        ctx.lineTo(-r, h)
        ctx.arc(0, h, r, Math.PI, 0, true)
        ctx.lineTo(r, -h)
        ctx.arc(0, -h, r, 0, Math.PI, true)
        ctx.closePath()
        break
      }
      case 'polygon': {
        shape.points.forEach((point, index) => {
          // 캔버스 y축이 뒤집혀 있으므로 y에 -1을 곱한다
          const x = point.x * scale
          const y = -point.y * scale
          if (index === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        ctx.closePath()
        break
      }
    }
  }

  private emojiSize(shape: ShapeDef): number {
    switch (shape.kind) {
      case 'circle':
        return shape.radius * 1.5 * this.scale
      case 'box':
        return Math.min(shape.hw, shape.hh) * 2.1 * this.scale
      case 'capsule':
        return shape.radius * 2.4 * this.scale
      case 'polygon': {
        const hw = Math.max(...shape.points.map((p) => Math.abs(p.x)))
        const hh = Math.max(...shape.points.map((p) => Math.abs(p.y)))
        return Math.min(hw, hh) * 1.9 * this.scale
      }
    }
  }
}

export { ArenaRenderer }
export type { ArenaRenderState }
