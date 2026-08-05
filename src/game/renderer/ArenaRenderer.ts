import { ARENA, ARENA_SCREEN_MAX_WIDTH } from '../config.ts'
import type { Bounds } from '../shapes.ts'
import type { BodySnapshot, PrimitiveShape, ShapeDef, ShapePart } from '../types/game.ts'

interface HiddenReveal {
  readonly label: string
  readonly sprite: string
  /** 0 → 1 */
  readonly progress: number
}

/** 놓쳐서 아레나 위에 떠 있는 물건. 단어를 맞히면 상쇄된다 */
interface PendingBox {
  readonly word: string
  readonly x: number
  /** 0이면 방금 올라왔고 1이면 곧 떨어진다 */
  readonly urgency: number
}

interface ArenaRenderState {
  readonly bodies: readonly BodySnapshot[]
  readonly aimX: number
  readonly showAim: boolean
  readonly pending: readonly PendingBox[]
  readonly hiddenReveal: HiddenReveal | null
  /** 지진 흔들림 진폭 (월드 단위). 0이면 흔들리지 않는다 */
  readonly quake: number
  /** 흔들림 위상 — 프레임마다 흐르는 시간 */
  readonly quakePhase: number
}

const COLORS = {
  frame: '#262b3d',
  platform: '#4a5171',
  platformTop: '#6b74a0',
  aim: '#ffcf5c',
  aimTrack: 'rgba(255, 207, 92, 0.16)',
  danger: 'rgba(255, 107, 107, 0.5)',
  pendingEdge: '#48507a',
  hidden: '#ffcf5c',
} as const

/**
 * index.css의 --sans와 같은 스택.
 * canvas의 font는 CSS 변수를 해석하지 못하고, 해석에 실패하면 대입 자체가 무시되어
 * 직전 폰트(고스트 이모지 크기)가 그대로 남는다 — 그래서 값을 여기에 펼쳐 쓴다.
 */
const UI_FONT = "system-ui, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"

const WORLD_HEIGHT = ARENA.height - ARENA.killY
const WORLD_WIDTH = ARENA.halfWidth * 2

class ArenaRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly imageCache = new Map<string, HTMLImageElement>()
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
    // 캔버스는 레인 뒤까지 넓게 깔리지만 아레나는 가운데 폭 안에 머문다 —
    // 남는 좌우 공간은 튕겨 나간 물건과 히든 연출이 잘리지 않게 쓰인다
    const arenaWidth = Math.min(rect.width, ARENA_SCREEN_MAX_WIDTH)
    this.scale = Math.min(arenaWidth / WORLD_WIDTH, rect.height / WORLD_HEIGHT)
  }

  draw(state: ArenaRenderState): void {
    const { ctx } = this
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight)

    ctx.save()
    if (state.quake > 0) {
      // 결정론적 흔들림 — 두 주파수를 겹쳐 규칙적으로 보이지 않게 한다
      const amp = state.quake * this.scale
      const t = state.quakePhase
      ctx.translate(Math.sin(t * 47) * amp, Math.cos(t * 31) * amp * 0.7)
    }

    this.drawFrame()
    // 히든 연출은 배경에 깔린다 — 쌓인 물건을 가리지 않아야 한다
    if (state.hiddenReveal !== null) {
      this.drawHiddenReveal(state.hiddenReveal)
    }
    this.drawPlatform()
    if (state.showAim) {
      this.drawAim(state.aimX)
    }
    for (const body of state.bodies) {
      this.drawBody(body)
    }
    // 대기 중인 물건은 쌓인 것들 위에 그린다 — 곧 떨어질 것이 가려지면 안 된다
    for (const [box, row] of this.layoutPending(state.pending)) {
      this.drawPendingBox(box, row)
    }
    ctx.restore()
  }

  /**
   * 예고 상자가 떨어질 자리 위에 그대로 서 있어야 하는데, 낙하 지점이 받침대 폭 안으로
   * 제한되어 있어 여러 개가 나오면 가로로 겹친다. 겹치는 것들만 아래 줄로 내린다 —
   * x는 그대로 두고 줄만 바꾸므로 "어디로 떨어지는지"는 흐트러지지 않는다.
   */
  private layoutPending(boxes: readonly PendingBox[]): [PendingBox, number][] {
    const placed: [PendingBox, number][] = []
    const rowRights: number[] = []
    const sorted = [...boxes].sort((a, b) => a.x - b.x)

    for (const box of sorted) {
      const half = this.pendingWidth(box.word) / 2
      const left = this.toScreenX(box.x) - half
      let row = 0
      while ((rowRights[row] ?? Number.NEGATIVE_INFINITY) > left) {
        row += 1
      }
      rowRights[row] = this.toScreenX(box.x) + half
      placed.push([box, row])
    }
    return placed
  }

  private pendingFontSize(): number {
    return Math.max(12, this.scale * 0.2)
  }

  private pendingWidth(word: string): number {
    const { ctx } = this
    ctx.save()
    ctx.font = `600 ${this.pendingFontSize()}px ${UI_FONT}`
    const width = ctx.measureText(word).width + this.pendingFontSize()
    ctx.restore()
    return width
  }

  /**
   * 놓친 단어가 떨어질 자리에서 기다리는 모습.
   * 단어를 적어두는 이유는 두 가지다 — 어느 단어를 놓쳤는지 알려주고,
   * 무슨 물건이 될지는 여전히 감추어 "Enter 뒤에 공개" 규칙을 지킨다.
   */
  private drawPendingBox(box: PendingBox, row: number): void {
    const { ctx } = this
    const urgency = Math.min(Math.max(box.urgency, 0), 1)
    const x = this.toScreenX(box.x)
    const fontSize = this.pendingFontSize()
    const y = this.toScreenY(ARENA.height - 0.42) + row * (fontSize * 1.9)

    ctx.save()
    ctx.font = `600 ${fontSize}px ${UI_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const padX = fontSize * 0.5
    const width = ctx.measureText(box.word).width + padX * 2
    const height = fontSize * 1.7
    const left = x - width / 2
    const top = y - height / 2

    // 임박할수록 붉어지고, 마지막 순간에는 깜빡인다
    const blink = urgency > 0.75 ? 0.55 + 0.45 * Math.abs(Math.sin(urgency * 40)) : 1
    ctx.globalAlpha = blink
    ctx.fillStyle = 'rgba(13, 15, 22, 0.85)'
    ctx.strokeStyle = urgency > 0.5 ? COLORS.danger : COLORS.pendingEdge
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(left, top, width, height, 6)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = urgency > 0.5 ? '#ffd7d7' : '#b6bdd4'
    ctx.fillText(box.word, x, y - height * 0.06)

    // 남은 시간 — 바가 꽉 차면 떨어진다
    const barY = top + height - 3.5
    ctx.fillStyle = COLORS.pendingEdge
    ctx.fillRect(left + 3, barY, width - 6, 2)
    ctx.fillStyle = COLORS.danger
    ctx.fillRect(left + 3, barY, (width - 6) * urgency, 2)
    ctx.restore()
  }

  /** 스프라이트는 비동기로 로드되므로 준비된 것만 그린다 */
  private image(src: string): HTMLImageElement | null {
    const cached = this.imageCache.get(src)
    if (cached !== undefined) {
      return cached.complete && cached.naturalWidth > 0 ? cached : null
    }
    const img = new Image()
    img.src = src
    this.imageCache.set(src, img)
    return null
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

  /** 히든이 나왔을 때 아레나 배경에 이름과 링을 깔아준다 */
  private drawHiddenReveal(reveal: HiddenReveal): void {
    const { ctx } = this
    const t = Math.min(Math.max(reveal.progress, 0), 1)
    // 앞의 12%는 밝아지고, 뒤의 40%는 사라진다
    const alpha = t < 0.12 ? t / 0.12 : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1
    if (alpha <= 0) {
      return
    }

    const cx = this.toScreenX(0)
    const cy = this.toScreenY(ARENA.height * 0.52)
    const unit = this.scale

    ctx.save()
    ctx.globalAlpha = alpha

    for (let i = 0; i < 2; i += 1) {
      const ringT = Math.min(t * 1.6 - i * 0.18, 1)
      if (ringT <= 0) continue
      ctx.beginPath()
      ctx.arc(cx, cy, unit * (0.3 + ringT * 1.7), 0, Math.PI * 2)
      ctx.strokeStyle = COLORS.hidden
      ctx.globalAlpha = alpha * (1 - ringT) * 0.5
      ctx.lineWidth = 2
      ctx.stroke()
    }

    ctx.globalAlpha = alpha * 0.2
    const ghost = unit * (1.3 + t * 0.5)
    const img = this.image(reveal.sprite)
    if (img !== null) {
      const ratio = img.naturalWidth / img.naturalHeight
      const w = ratio >= 1 ? ghost : ghost * ratio
      const h = ratio >= 1 ? ghost / ratio : ghost
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.globalAlpha = alpha
    ctx.fillStyle = COLORS.hidden
    ctx.font = `700 ${Math.max(16, unit * 0.34)}px ${UI_FONT}`
    ctx.fillText(reveal.label, cx, cy + ghost * 0.62)
    ctx.font = `${Math.max(10, unit * 0.16)}px ${UI_FONT}`
    ctx.globalAlpha = alpha * 0.75
    ctx.fillText('HIDDEN', cx, cy + ghost * 0.62 + Math.max(16, unit * 0.32))

    ctx.restore()
  }

  private drawBody(body: BodySnapshot): void {
    const { ctx } = this
    const { shape } = body.variant

    ctx.save()
    ctx.translate(this.toScreenX(body.x), this.toScreenY(body.y))
    // 월드는 y가 위로 +, 캔버스는 아래로 + 이므로 회전 방향을 뒤집는다
    ctx.rotate(-body.rotation)

    const drawn = this.drawSprite(body.variant.sprite, body.variant.artBounds)

    // 그림이 아직 로드되지 않았으면 충돌 도형만이라도 보여준다
    if (!drawn) {
      ctx.fillStyle = body.variant.color
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.55
      for (const part of this.partsOf(shape)) {
        this.tracePart(part)
        ctx.fill()
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  /** 그림을 물건의 원래 크기에 맞춰 그린다 — 보이는 것과 부딪히는 것이 같아야 한다 */
  private drawSprite(src: string, bounds: Bounds): boolean {
    const img = this.image(src)
    if (img === null) {
      return false
    }
    const width = bounds.hw * 2 * this.scale
    const height = bounds.hh * 2 * this.scale
    this.ctx.drawImage(img, -width / 2, -height / 2, width, height)
    return true
  }

  private partsOf(shape: ShapeDef): readonly ShapePart[] {
    if (shape.kind === 'compound') {
      return shape.parts
    }
    return [{ shape, offset: { x: 0, y: 0 } }]
  }

  private tracePart(part: ShapePart): void {
    const { ctx, scale } = this
    ctx.beginPath()
    // 캔버스 y축이 뒤집혀 있으므로 오프셋의 y도 뒤집는다
    const ox = part.offset.x * scale
    const oy = -part.offset.y * scale
    this.traceShape(part.shape, ox, oy)
  }

  private traceShape(shape: PrimitiveShape, ox: number, oy: number): void {
    const { ctx, scale } = this
    switch (shape.kind) {
      case 'circle':
        ctx.arc(ox, oy, shape.radius * scale, 0, Math.PI * 2)
        break
      case 'box':
        ctx.rect(
          ox - shape.hw * scale,
          oy - shape.hh * scale,
          shape.hw * 2 * scale,
          shape.hh * 2 * scale,
        )
        break
      case 'capsule': {
        const r = shape.radius * scale
        const h = shape.halfHeight * scale
        ctx.moveTo(ox - r, oy - h)
        ctx.lineTo(ox - r, oy + h)
        ctx.arc(ox, oy + h, r, Math.PI, 0, true)
        ctx.lineTo(ox + r, oy - h)
        ctx.arc(ox, oy - h, r, 0, Math.PI, true)
        ctx.closePath()
        break
      }
      case 'polygon': {
        shape.points.forEach((point, index) => {
          const x = ox + point.x * scale
          const y = oy - point.y * scale
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
}

export { ArenaRenderer }
export type { ArenaRenderState, HiddenReveal }
