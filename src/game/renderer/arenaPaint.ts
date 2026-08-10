import { ARENA, CATCH, LEDGE } from '../config.ts'
import type { Bounds } from '../shapes.ts'
import type {
  BodySnapshot,
  OwnerId,
  PrimitiveShape,
  ShapeDef,
  ShapePart,
} from '../types/game.ts'
import type { CatView } from '../systems/CatPickup.ts'
import { PAIR_MARK_COLORS } from '../systems/PairMarks.ts'
import { ARENA_ART as GENERATED_ART } from './arenaArt.generated.ts'
import { ARROW_ART, artUrl, drawDayNight } from './arenaArt.ts'
import { COLORS } from './arenaColors.ts'
import { catPose } from './catPose.ts'
import { padRatio, rim } from './rimCache.ts'
import { sprite } from './spriteCache.ts'
import type { ArenaView } from './arenaView.ts'

/* 투명 여백을 빼고 그려, 화살표 끝이 물리 위치에 맞는다. */
const ARROW_CROP = { x: 208, y: 123, width: 621, height: 776 } as const

/**
 * 상자 그림에서 **물건이 얹히는 선**이 위에서 몇 %인가.
 *
 * 상자는 열린 채 비스듬히 보이므로 그림의 맨 위가 아니라 앞쪽 테두리가 바닥이다.
 * 그 선을 `ARENA.platformTop`에 맞춰야 물건이 상자 **안에** 담긴 것으로 보인다 —
 * 그림 위쪽(상자 안벽)이 물건 뒤로 남아 그렇게 읽힌다.
 *
 * 알파로는 잴 수 없는 값이라 눈으로 정했다. **그림을 다시 그리면 다시 봐야 한다.**
 */
const PLATFORM_SURFACE = 0.46

/**
 * 상자 그림에서 **몸통이 차지하는 폭**의 비율. 나머지는 양옆으로 열린 덮개다.
 *
 * 그림 전체를 받침대 폭에 맞추면 덮개까지 안으로 들어와 몸통이 받침대보다 좁아지고,
 * 끝에 얹힌 물건이 허공에 뜬 것처럼 보인다. 몸통을 기준으로 맞추면 덮개는 밖으로
 * 삐져나가는데 그쪽이 옳다 — 덮개는 물건을 받지 않는다.
 */
const PLATFORM_BODY = 0.88

/**
 * 받침대를 놓을 화면 사각형. 앞뒤 두 장이 **같은 자리**에 그려져야 한다.
 *
 * 파이프라인이 앞뒤를 한 묶음으로 잘라 두 장의 크기가 같으므로, 자리를 한 번만
 * 재서 둘 다에 쓴다. 따로 재면 잘린 양이 달라 앞벽이 어긋난다.
 */
function platformRect(view: ArenaView): { left: number; top: number; width: number; height: number } {
  const art = GENERATED_ART['platform-back-day']
  const width = (ARENA.platformHalfWidth * 2 * view.scale) / PLATFORM_BODY
  const height = width * (art.height / art.width)
  return {
    left: view.toScreenX(0) - width / 2,
    top: view.toScreenY(ARENA.platformTop) - height * PLATFORM_SURFACE,
    width,
    height,
  }
}

/**
 * 받침대의 **뒤쪽** — 안벽과 뒤 덮개. 물건보다 먼저 그린다.
 *
 * 예전에는 통짜 그림 한 장이었다. 물건이 그 위에 그려지므로 상자 앞으로 아랫동이
 * 삐져나왔고, 담긴 것처럼 보이게 하려고 그림을 눈대중 비율만큼 올려 **담긴 척**만
 * 했다. 앞뒤가 갈라진 지금은 사이에 물건을 끼워 넣으면 그만이다.
 */
function drawPlatformBack(view: ArenaView): void {
  const { ctx } = view
  const box = platformRect(view)
  const drawn = drawDayNight(view, 'platform-back-day', 'platform-back-night', (image) => {
    ctx.drawImage(image, box.left, box.top, box.width, box.height)
  })
  if (drawn) {
    return
  }
  // 이미지를 못 받아도 물리 받침대가 보이지 않는 상태로 플레이시키지 않는다
  ctx.fillStyle = '#4a5171'
  ctx.fillRect(
    view.toScreenX(-ARENA.platformHalfWidth),
    view.toScreenY(ARENA.platformTop),
    ARENA.platformHalfWidth * 2 * view.scale,
    ARENA.platformHalfHeight * 2 * view.scale,
  )
}

/**
 * 받침대의 **앞벽** — 물건을 다 그린 뒤에 덮는다. 그래야 상자에 담긴다.
 *
 * 통나무(먼지 뭉치)는 이 앞에 둔다. 상자 밖 공중에 서는 것이라 앞벽에 가리면
 * 없는 것처럼 보인다.
 */
function drawPlatformFront(view: ArenaView): void {
  const { ctx } = view
  const box = platformRect(view)
  drawDayNight(view, 'platform-front-day', 'platform-front-night', (image) => {
    ctx.drawImage(image, box.left, box.top, box.width, box.height)
  })
}

/**
 * 공중에 선 작은 통나무들.
 *
 * 받침대와 **같은 그림을 줄여서** 그린다. 새 그림을 그리지 않아도 되는 데다,
 * 무엇보다 같은 그림이라 "여기도 받침대다"가 설명 없이 읽힌다 — 다른 모양이면
 * 장식으로 보고 지나쳐서, 자리를 하나 더 준 보상이 전달되지 않는다.
 */
function drawLedges(
  view: ArenaView,
  ledges: readonly { readonly x: number; readonly y: number; readonly halfWidth: number }[],
): void {
  if (ledges.length === 0) {
    return
  }
  const { ctx } = view
  const height = LEDGE.halfHeight * 2 * view.scale

  for (const ledge of ledges) {
    const width = ledge.halfWidth * 2 * view.scale
    const left = view.toScreenX(ledge.x - ledge.halfWidth)
    const top = view.toScreenY(ledge.y)
    /*
     * 먼지 뭉치는 **콜라이더 높이에 맞춰 눌러 그린다.** 받침대처럼 그림 비율대로
     * 늘리면 보이는 두께와 부딪히는 두께가 어긋나 허공에 걸린 것처럼 보인다.
     * 뭉치는 형태가 무른 것이라 눌려도 어색하지 않다.
     */
    const drawn = drawDayNight(view, 'ledge-day', 'ledge-night', (image) => {
      ctx.drawImage(image, left, top, width, height)
    })
    if (!drawn) {
      ctx.fillStyle = '#4a5171'
      ctx.fillRect(left, top, width, height)
    }
  }
}

function drawCatcher(
  view: ArenaView,
  catcher: {
    readonly x: number
    readonly y: number
    readonly halfLength: number
    readonly angle: number
    readonly progress: number
  },
): void {
  const { ctx } = view
  const art = GENERATED_ART['catch-day']
  /*
   * 손 그림은 물리 판 길이에 맞춰 늘리지 않는다. 회수 손은 "여기서 받아 간다"는
   * 연출이지 길이가 변하는 도구가 아니므로, 이미지가 가진 비율과 화면 크기만 따른다.
   */
  const width = Math.min(260, Math.max(190, view.scale * 2.25))
  const height = width * (art.height / art.width)
  const x = view.toScreenX(catcher.x)
  const y = view.toScreenY(catcher.y)
  const side = catcher.x < 0 ? 'left' : 'right'
  const fadeIn = Math.min(catcher.progress / 0.18, 1)
  const fadeOut = Math.min((1 - catcher.progress) / 0.22, 1)
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut))
  const motion = catcher.progress < 0.5 ? 1 - fadeIn : 1 - fadeOut
  const slide = motion * 34
  /*
   * 손 그림은 원본부터 왼쪽 아래 → 오른쪽 위로 45도쯤 뻗어 있다. 물리 각도를 그대로
   * 더하면 그림이 두 번 기울어져 뒤집히므로, 원본 기울기에서 회수 판 기울기만큼만 보정한다.
   */
  const angleFix = Math.PI / 4 - Math.atan(CATCH.slope)
  const screenAngle = side === 'left' ? angleFix : -angleFix

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x + (side === 'left' ? -slide : slide), y + slide * 0.25)
  ctx.rotate(screenAngle)
  if (side === 'right') {
    ctx.scale(-1, 1)
  }
  const drawn = drawDayNight(view, 'catch-day', 'catch-night', (image) => {
    ctx.drawImage(image, -width / 2, -height * 0.53, width, height)
  })
  if (!drawn) {
    ctx.fillStyle = 'rgba(65, 183, 152, 0.65)'
    ctx.fillRect(
      -catcher.halfLength * view.scale,
      -CATCH.halfThickness * view.scale,
      catcher.halfLength * 2 * view.scale,
      CATCH.halfThickness * 2 * view.scale,
    )
  }
  ctx.restore()
}

function drawAim(view: ArenaView, worldX: number, stackTop: number): void {
  const { ctx } = view
  const x = view.toScreenX(worldX)
  const top = view.toScreenY(ARENA.height + view.cameraY)
  // 조준선은 쌓인 것의 꼭대기에서 끝난다 — 실제로 물건이 닿을 자리다
  const trackBottom = view.toScreenY(stackTop)
  const arrow = sprite(ARROW_ART)
  const arrowWidth = Math.min(44, Math.max(32, view.scale * 0.36))
  const arrowHeight = arrowWidth * (ARROW_CROP.height / ARROW_CROP.width)
  const arrowTop = top + 2
  const trackTop = arrow === null ? top + 22 : arrowTop + arrowHeight

  ctx.save()
  ctx.strokeStyle = COLORS.aimTrack
  ctx.lineWidth = 2
  ctx.setLineDash([4, 10])
  ctx.beginPath()
  ctx.moveTo(x, trackTop)
  ctx.lineTo(x, trackBottom)
  ctx.stroke()
  ctx.restore()

  if (arrow !== null) {
    ctx.drawImage(
      arrow,
      ARROW_CROP.x,
      ARROW_CROP.y,
      ARROW_CROP.width,
      ARROW_CROP.height,
      x - arrowWidth / 2,
      arrowTop,
      arrowWidth,
      arrowHeight,
    )
    return
  }

  ctx.save()
  ctx.fillStyle = '#ffcf5c'
  ctx.beginPath()
  ctx.moveTo(x, top + 20)
  ctx.lineTo(x - 9, top + 2)
  ctx.lineTo(x + 9, top + 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * 물건을 놓치면 뛰어들어 물어 가는 고양이.
 *
 * 물건이 테두리 밖으로 조용히 날아가는 것만으로는 **무엇을 잃었는지도 잃었다는
 * 것도 잘 안 보였다** — 화면 구석에서 일어나고 그때 눈은 다음 단어를 쫓고 있다.
 * 고양이가 가로질러 오르면 그 순간이 한 번 화면을 지난다.
 *
 * **낮/밤을 가르지 않는다.** 그림이 한 장뿐이라 `drawDayNight`를 쓰지 않는다 —
 * 방의 물건이 아니라 잠깐 들어왔다 나가는 것이라 조명에 물들지 않아도 어색하지 않고,
 * 오히려 배경에서 떨어져 나와 보이는 쪽이 이 연출이 하려는 일에 맞는다.
 *
 * 그림이 아직 안 왔으면 **아무것도 그리지 않는다.** 물건은 이미 세계에서 치워졌고
 * (`PhysicsWorld`), 여기서 대신 네모를 그리면 정체 모를 덩이가 지나갈 뿐이다.
 */
function drawCat(view: ArenaView, cat: CatView): void {
  const pose = catPose(cat)
  const image = sprite(artUrl(pose.art))
  if (image === null) {
    return
  }
  const { ctx } = view
  const width = pose.width * view.scale
  const height = width * (image.naturalHeight / image.naturalWidth)
  ctx.drawImage(
    image,
    view.toScreenX(pose.x) - width / 2,
    view.toScreenY(pose.y) - height / 2,
    width,
    height,
  )

  /*
   * 물고 있는 물건은 고양이 **뒤에** 그린다. 앞에 두면 물건이 얼굴을 가려 어느
   * 고양이인지가 안 보이고, 무엇보다 입에 문 것이 아니라 앞에 든 것으로 보인다.
   */
  if (pose.carry !== null) {
    // 위에서 이미 그린 고양이를 물건 위에 한 번 더 덮는다
    drawCarried(view, cat, pose.carry)
    ctx.drawImage(
      image,
      view.toScreenX(pose.x) - width / 2,
      view.toScreenY(pose.y) - height / 2,
      width,
      height,
    )
  }
}

/** 고양이가 물고 가는 물건. 판에 있던 것과 같은 그림·같은 크기다 */
function drawCarried(
  view: ArenaView,
  cat: CatView,
  at: { readonly x: number; readonly y: number },
): void {
  const { ctx } = view
  ctx.save()
  ctx.translate(view.toScreenX(at.x), view.toScreenY(at.y))
  /*
   * 조금 기울여 문다. 똑바로 두면 물건이 공중에 정지한 것으로 보여, 물려 가는 것이
   * 아니라 고양이와 겹쳐 지나가는 것으로 읽힌다.
   */
  ctx.rotate(cat.from === 'left' ? 0.35 : -0.35)
  drawSprite(view, cat.variant.sprite, cat.variant.artBounds, null)
  ctx.restore()
}

function drawBody(
  view: ArenaView,
  body: BodySnapshot,
  ownerColors: ReadonlyMap<OwnerId, string> | null,
  mark: number | undefined,
  pulse: number,
): void {
  const { ctx } = view
  const { shape } = body.variant

  ctx.save()
  ctx.translate(view.toScreenX(body.x), view.toScreenY(body.y))
  // 월드는 y가 위로 +, 캔버스는 아래로 + 이므로 회전 방향을 뒤집는다
  ctx.rotate(-body.rotation)

  /*
   * 짝 표식은 **물건의 실루엣 테두리**로 두른다. 대전에서 주인을 가르는 것과 같은
   * 장치다(`rimCache`) — 동그라미를 덧그리면 물건 위에 딴 것이 얹힌 것으로 보이는데,
   * 이것은 그 물건에 대한 이야기이므로 물건의 윤곽을 따라야 한다.
   *
   * 둘이 겹칠 일은 없다. 주인 색은 대전에만, 짝 표식은 싱글에만 있다.
   */
  const ownerColor = ownerColors?.get(body.owner) ?? null
  const rimColor =
    ownerColor ??
    (mark === undefined
      ? null
      : (PAIR_MARK_COLORS[mark % PAIR_MARK_COLORS.length] ?? null))
  /*
   * 짝 표식은 **숨 쉬듯 밝아졌다 어두워진다.** 단어 칩이 같은 주기로 빛나므로,
   * 둘이 함께 뛰는 것으로 보여 "이 둘이 한 쌍"이 색보다 먼저 읽힌다.
   * 주인 색은 신원이라 흔들리면 안 되므로 그대로 둔다.
   */
  const rimAlpha = ownerColor === null && mark !== undefined ? pulse : 1
  const drawn = drawSprite(view, body.variant.sprite, body.variant.artBounds, rimColor, rimAlpha)

  // 그림이 아직 로드되지 않았으면 충돌 도형만이라도 보여준다
  if (!drawn) {
    ctx.fillStyle = body.variant.color
    ctx.strokeStyle = rimColor ?? 'rgba(0, 0, 0, 0.4)'
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.55
    for (const part of partsOf(shape)) {
      tracePart(view, part)
      ctx.fill()
      ctx.stroke()
    }
  }

  ctx.restore()
}

/**
 * 그림을 물건의 원래 크기에 맞춰 그린다 — 보이는 것과 부딪히는 것이 같아야 한다.
 * 주인 색 테두리는 미리 만들어 둔 것을 겹쳐 그린다 (rimCache).
 */
function drawSprite(
  view: ArenaView,
  src: string,
  bounds: Bounds,
  ownerColor: string | null,
  rimAlpha = 1,
): boolean {
  const img = sprite(src)
  if (img === null) {
    return false
  }
  const { ctx } = view
  const width = bounds.hw * 2 * view.scale
  const height = bounds.hh * 2 * view.scale
  const left = -width / 2
  const top = -height / 2

  if (ownerColor !== null) {
    const glow = rim(img, ownerColor)
    if (glow !== null) {
      ctx.globalAlpha = rimAlpha
      // 테두리 그림은 원본보다 여백만큼 크다. 같은 비율로 넓게 그려야 자리가 맞는다
      const pad = padRatio(img)
      const padX = width * pad.x
      const padY = height * pad.y
      ctx.drawImage(glow, left - padX, top - padY, width + padX * 2, height + padY * 2)
      ctx.globalAlpha = 1
    }
  }

  ctx.drawImage(img, left, top, width, height)
  return true
}

function partsOf(shape: ShapeDef): readonly ShapePart[] {
  if (shape.kind === 'compound') {
    return shape.parts
  }
  return [{ shape, offset: { x: 0, y: 0 } }]
}

function tracePart(view: ArenaView, part: ShapePart): void {
  const { ctx, scale } = view
  ctx.beginPath()
  // 캔버스 y축이 뒤집혀 있으므로 오프셋의 y도 뒤집는다
  const ox = part.offset.x * scale
  const oy = -part.offset.y * scale
  traceShape(view, part.shape, ox, oy)
}

function traceShape(view: ArenaView, shape: PrimitiveShape, ox: number, oy: number): void {
  const { ctx, scale } = view
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

export { drawAim, drawBody, drawCat, drawCatcher, drawLedges, drawPlatformBack, drawPlatformFront }
