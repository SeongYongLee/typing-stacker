import type { Trail } from '../data/trails.ts'

/**
 * 부스러기 하나의 **모양**.
 *
 * 처음에는 다섯 갈래를 전부 원으로 그렸다. 뿜는 양·수명·무게·흔들림은 갈래마다 달랐지만
 * 눈에는 **"색만 다른 동그라미"**로 보였다 — 잎이 흩날리는데 동그라미가 흩날리면
 * 그것은 잎이 아니다. 갈래를 나눈 값이 모양에서 가장 크게 드러난다.
 *
 * 모양만 여기 있고 색·진하기는 `trailPaint.ts`에 있다. 둘을 나눈 것은 조율하는 사람이
 * 다른 것을 볼 때가 있기 때문이다 — "너무 진하다"와 "잎처럼 안 보인다"는 서로 다른
 * 문제이고 고치는 자리도 다르다.
 *
 * 좌표는 **화면 기준**으로 받는다. 캔버스는 y가 아래로 +이므로 부르는 쪽이 뒤집어
 * 넘긴다 — 여기서 다시 뒤집으면 어느 쪽이 기준인지 알 수 없게 된다.
 */

interface ShapeArgs {
  readonly x: number
  readonly y: number
  /** 화면 픽셀 반지름 */
  readonly radius: number
  /** 화면 기준 기울기(라디안) */
  readonly angle: number
}

/** 반짝임의 갈래 수. 넷이면 별처럼 보이고 다섯을 넘으면 눈꽃에 가까워진다 */
const SPARKLE_POINTS = 4
/** 별의 안쪽 반지름 비율. 낮으면 뾰족하고 높으면 다각형이 된다 */
const SPARKLE_INNER = 0.32

function traceSparkle(ctx: CanvasRenderingContext2D, { x, y, radius, angle }: ShapeArgs): void {
  ctx.beginPath()
  for (let i = 0; i < SPARKLE_POINTS * 2; i += 1) {
    const step = angle + (i * Math.PI) / SPARKLE_POINTS
    const reach = i % 2 === 0 ? radius : radius * SPARKLE_INNER
    const px = x + Math.cos(step) * reach
    const py = y + Math.sin(step) * reach
    if (i === 0) {
      ctx.moveTo(px, py)
    } else {
      ctx.lineTo(px, py)
    }
  }
  ctx.closePath()
}

/** 양 끝이 뾰족한 잎. 이차곡선 둘로 만든다 — 타원은 끝이 둥글어 잎으로 안 보인다 */
function tracePetal(ctx: CanvasRenderingContext2D, { x, y, radius, angle }: ShapeArgs): void {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const half = radius * 0.62
  ctx.beginPath()
  ctx.moveTo(x - cos * radius, y - sin * radius)
  ctx.quadraticCurveTo(x - sin * half, y + cos * half, x + cos * radius, y + sin * radius)
  ctx.quadraticCurveTo(x + sin * half, y - cos * half, x - cos * radius, y - sin * radius)
  ctx.closePath()
}

/** 진행 방향으로 늘어난 방울. 늘어나는 것만으로 "튀었다"가 읽힌다 */
function traceDroplet(ctx: CanvasRenderingContext2D, { x, y, radius, angle }: ShapeArgs): void {
  ctx.beginPath()
  ctx.ellipse(x, y, radius * 1.55, radius * 0.75, angle, 0, Math.PI * 2)
  ctx.closePath()
}

/** 솜뭉치는 둥근 것이 맞다. 다만 완전한 원은 아니라 살짝 눌러 돌린다 */
function traceFluff(ctx: CanvasRenderingContext2D, { x, y, radius, angle }: ShapeArgs): void {
  ctx.beginPath()
  ctx.ellipse(x, y, radius * 1.18, radius * 0.82, angle, 0, Math.PI * 2)
  ctx.closePath()
}

/** 세 각짜리 조각. 부스러기는 각이 있다 — 한 각만 길게 빼 부러진 것처럼 보이게 한다 */
function traceCrumb(ctx: CanvasRenderingContext2D, { x, y, radius, angle }: ShapeArgs): void {
  ctx.beginPath()
  for (let i = 0; i < 3; i += 1) {
    const step = angle + (i * Math.PI * 2) / 3
    const reach = radius * (i === 1 ? 1.3 : 0.9)
    const px = x + Math.cos(step) * reach
    const py = y + Math.sin(step) * reach
    if (i === 0) {
      ctx.moveTo(px, py)
    } else {
      ctx.lineTo(px, py)
    }
  }
  ctx.closePath()
}

const TRACERS: Readonly<
  Record<Trail, (ctx: CanvasRenderingContext2D, args: ShapeArgs) => void>
> = {
  sparkle: traceSparkle,
  petal: tracePetal,
  droplet: traceDroplet,
  fluff: traceFluff,
  crumb: traceCrumb,
  /* 퍼지는 물도 방울이다. 나아가는 방향으로 늘어나 흩어지는 결이 보인다 */
  splash: traceDroplet,
}

/** 그 갈래의 모양으로 경로를 만든다. 칠하는 것은 부르는 쪽이 한다 */
function traceTrail(ctx: CanvasRenderingContext2D, kind: Trail, args: ShapeArgs): void {
  TRACERS[kind](ctx, args)
}

export { traceTrail, SPARKLE_POINTS, SPARKLE_INNER }
export type { ShapeArgs }
