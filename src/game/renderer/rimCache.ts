/**
 * 물건 그림에 두르는 주인 색 테두리.
 *
 * 그림자는 알파를 따라 번지므로 **실루엣 그대로** 테두리가 나온다. 충돌 도형에 선을
 * 그으면 다각형 윤곽이 그림 위에 겹쳐 물건 모양이 어긋나 보였다.
 *
 * 다만 shadowBlur는 매 프레임 물건마다 물리면 비싸다 — 레티나에서는 그리는 픽셀이
 * 네 배다. 그래서 (그림, 색) 조합마다 **한 번만 만들어 두고** 그 뒤로는 그림 두 장을
 * 겹쳐 그린다. 물건은 57종이고 색은 인원 수만큼이라 개수가 뻔하다.
 */

/** 번짐이 잘리지 않게 둘 여백 (원본 픽셀 기준) */
const PAD = 22
const BLUR = 12
/** 겹칠수록 진해진다. 미리 만들어 두므로 몇 번을 겹쳐도 프레임 비용은 같다 */
const PASSES = 6

const cache = new Map<string, HTMLCanvasElement | null>()

/**
 * 그림 바깥으로 번진 테두리만 담은 canvas. 그릴 수 없으면 null.
 *
 * 반환한 canvas는 원본보다 상하좌우로 `padRatio` 만큼 크다 — 그리는 쪽이
 * 그만큼 넓게 그려야 위치가 맞는다.
 */
function rim(image: HTMLImageElement, color: string): HTMLCanvasElement | null {
  const key = `${image.src}|${color}`
  const found = cache.get(key)
  if (found !== undefined) {
    return found
  }

  const made = build(image, color)
  cache.set(key, made)
  return made
}

/** 테두리 canvas가 원본보다 얼마나 큰지 (한쪽 기준 비율) */
function padRatio(image: HTMLImageElement): { x: number; y: number } {
  return { x: PAD / image.naturalWidth, y: PAD / image.naturalHeight }
}

function build(image: HTMLImageElement, color: string): HTMLCanvasElement | null {
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width === 0 || height === 0) {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = width + PAD * 2
  canvas.height = height + PAD * 2
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    return null
  }

  ctx.shadowColor = color
  ctx.shadowBlur = BLUR
  for (let pass = 0; pass < PASSES; pass += 1) {
    ctx.drawImage(image, PAD, PAD, width, height)
  }

  /*
   * 그림이 있던 자리를 파낸다. 번짐만 남기면 그 위에 원본을 덮었을 때
   * 테두리가 그림 안쪽을 흐리지 않는다 — 안쪽까지 물들면 물건 색이 달라 보인다.
   */
  ctx.shadowColor = 'transparent'
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(image, PAD, PAD, width, height)

  return canvas
}

export { rim, padRatio }
