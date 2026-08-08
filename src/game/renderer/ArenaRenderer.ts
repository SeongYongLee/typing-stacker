import { sprite } from './spriteCache.ts'
import { ARENA, ARENA_SCREEN_MAX_WIDTH } from '../config.ts'
import type { Bounds } from '../shapes.ts'
import type {
  BodySnapshot,
  OwnerId,
  PrimitiveShape,
  ShapeDef,
  ShapePart,
} from '../types/game.ts'

/**
 * 주인 색 테두리. 누구 것인지만 알면 되므로 은은해야 한다 —
 * 진하면 그림보다 테두리가 먼저 보여서 물건을 알아보기 어려워진다.
 */
const RIM_BLUR = 7
const RIM_ALPHA = 0.85

interface HiddenReveal {
  readonly label: string
  readonly sprite: string
  /** 0 → 1 */
  readonly progress: number
}

interface ArenaRenderState {
  readonly bodies: readonly BodySnapshot[]
  readonly aimX: number
  readonly showAim: boolean
  readonly hiddenReveal: HiddenReveal | null
  /** 지진 흔들림 진폭 (월드 단위). 0이면 흔들리지 않는다 */
  readonly quake: number
  /** 흔들림 위상 — 프레임마다 흐르는 시간 */
  readonly quakePhase: number
  /**
   * 주인별 표시 색. 멀티에서만 넘긴다.
   * 물건이 벗어나면 **주인**의 목숨이 깎이므로 누구 것인지 보이지 않으면
   * 하트가 왜 깎였는지 알 수 없다. 싱글은 주인이 하나뿐이라 null로 두고 그리지 않는다.
   */
  readonly ownerColors: ReadonlyMap<OwnerId, string> | null
  /**
   * 화면이 올려다보는 높이. 탑이 자라면 이 값이 커져 시야가 따라 올라간다.
   * 이것이 없으면 탑이 스폰 높이에 닿는 순간 새 물건이 탑 속에 생긴다.
   */
  readonly cameraY: number
  /** 쌓인 것들의 꼭대기. 조준선이 여기까지 내려와 어디에 떨어질지 가리킨다 */
  readonly stackTop: number
}

const COLORS = {
  frame: '#262b3d',
  platform: '#4a5171',
  platformTop: '#6b74a0',
  aim: '#ffcf5c',
  aimTrack: 'rgba(255, 207, 92, 0.16)',
  danger: 'rgba(255, 107, 107, 0.5)',
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
    this.cameraY = state.cameraY
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
      this.drawAim(state.aimX, state.stackTop)
    }
    for (const body of state.bodies) {
      this.drawBody(body, state.ownerColors)
    }
    ctx.restore()
  }


  private toScreenX(worldX: number): number {
    return this.cssWidth / 2 + worldX * this.scale
  }

  private cameraY = 0

  private toScreenY(worldY: number): number {
    return this.cssHeight - (worldY - ARENA.killY - this.cameraY) * this.scale
  }

  private drawFrame(): void {
    const { ctx } = this
    const left = this.toScreenX(-ARENA.halfWidth)
    const right = this.toScreenX(ARENA.halfWidth)
    /*
     * 틀의 윗변은 시야에 붙여 둔다.
     *
     * 월드 좌표로 그리면 카메라가 올라갈 때 틀이 통째로 화면 아래로 흘러내려,
     * 탑이 높아진 순간 좌우 경계가 사라진다. 어디까지가 아레나인지는 높이와
     * 무관하게 늘 보여야 한다. 아래의 붉은 선(이탈선)은 반대로 월드에 속하므로
     * 카메라가 올라가면 발밑으로 멀어지는 것이 맞다.
     */
    const top = this.toScreenY(ARENA.height + this.cameraY)
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

  private drawAim(worldX: number, stackTop: number): void {
    const { ctx } = this
    const x = this.toScreenX(worldX)
    const top = this.toScreenY(ARENA.height + this.cameraY)
    // 조준선은 쌓인 것의 꼭대기에서 끝난다 — 실제로 물건이 닿을 자리다
    const trackBottom = this.toScreenY(stackTop)

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
    /*
     * 아레나 위쪽에 띄운다. 가운데(0.52)에 두면 쌓인 물건이 정확히 그 자리로 올라와
     * 이름이 가려진다 — 히든이 나온 순간이 가장 반가운데 그때 이름을 못 읽으면 헛일이다.
     * 스택은 아래에서 자라고 화살표는 맨 위를 지나므로 그 사이가 유일하게 비어 있는 띠다.
     */
    // 히든 연출은 배경 자막이지 월드에 놓인 물건이 아니다 —
    // 카메라를 더해 시야에 붙여두지 않으면 탑이 높아졌을 때 화면 밖으로 흘러내린다
    const cy = this.toScreenY(ARENA.height * 0.74 + this.cameraY)
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
    const img = sprite(reveal.sprite)
    if (img !== null) {
      const ratio = img.naturalWidth / img.naturalHeight
      const w = ratio >= 1 ? ghost : ghost * ratio
      const h = ratio >= 1 ? ghost / ratio : ghost
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const labelSize = Math.max(16, unit * 0.34)
    const tagSize = Math.max(10, unit * 0.16)
    const labelY = cy + ghost * 0.62
    const tagY = labelY + Math.max(16, unit * 0.32)

    // 낙하 중인 물건이 글자 위를 지나가도 읽히도록 어두운 판을 깔아준다
    ctx.font = `700 ${labelSize}px ${UI_FONT}`
    const plateWidth = Math.max(ctx.measureText(reveal.label).width, tagSize * 5) + labelSize
    const plateTop = labelY - labelSize * 0.9
    ctx.globalAlpha = alpha * 0.72
    ctx.fillStyle = '#0d0f16'
    ctx.beginPath()
    ctx.roundRect(
      cx - plateWidth / 2,
      plateTop,
      plateWidth,
      tagY + tagSize - plateTop + labelSize * 0.4,
      labelSize * 0.5,
    )
    ctx.fill()

    ctx.globalAlpha = alpha
    ctx.fillStyle = COLORS.hidden
    ctx.fillText(reveal.label, cx, labelY)
    ctx.font = `${tagSize}px ${UI_FONT}`
    ctx.globalAlpha = alpha * 0.75
    ctx.fillText('HIDDEN', cx, tagY)

    ctx.restore()
  }

  private drawBody(
    body: BodySnapshot,
    ownerColors: ReadonlyMap<OwnerId, string> | null,
  ): void {
    const { ctx } = this
    const { shape } = body.variant

    ctx.save()
    ctx.translate(this.toScreenX(body.x), this.toScreenY(body.y))
    // 월드는 y가 위로 +, 캔버스는 아래로 + 이므로 회전 방향을 뒤집는다
    ctx.rotate(-body.rotation)

    const ownerColor = ownerColors?.get(body.owner) ?? null
    const drawn = this.drawSprite(body.variant.sprite, body.variant.artBounds, ownerColor)

    // 그림이 아직 로드되지 않았으면 충돌 도형만이라도 보여준다
    if (!drawn) {
      ctx.fillStyle = body.variant.color
      ctx.strokeStyle = ownerColor ?? 'rgba(0, 0, 0, 0.4)'
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

  /**
   * 그림을 물건의 원래 크기에 맞춰 그린다 — 보이는 것과 부딪히는 것이 같아야 한다.
   *
   * 주인 색은 **그림 실루엣을 따라** 두른다. 충돌 도형에 선을 그으면 다각형 윤곽이
   * 그림 위에 겹쳐 보여서 물건 모양이 어긋나 보였다. 그림자는 알파를 따라 번지므로
   * 실루엣이 그대로 나오고, 그 위에 그림을 다시 덮어 테두리만 남긴다.
   */
  private drawSprite(src: string, bounds: Bounds, rim: string | null): boolean {
    const img = sprite(src)
    if (img === null) {
      return false
    }
    const { ctx } = this
    const width = bounds.hw * 2 * this.scale
    const height = bounds.hh * 2 * this.scale
    const left = -width / 2
    const top = -height / 2

    if (rim !== null) {
      ctx.save()
      ctx.shadowColor = rim
      ctx.shadowBlur = RIM_BLUR
      ctx.globalAlpha = RIM_ALPHA
      ctx.drawImage(img, left, top, width, height)
      ctx.restore()
    }

    ctx.drawImage(img, left, top, width, height)
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
