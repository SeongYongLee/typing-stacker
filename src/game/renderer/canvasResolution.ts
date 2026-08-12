const MAX_CANVAS_DPR = 2
const MAX_CANVAS_PIXELS = 5_000_000

/**
 * 고해상도 화면에서도 캔버스 한 프레임의 픽셀 수를 제한한다.
 * CSS 좌표계는 그대로 두고 backing store만 줄이므로 게임 배치는 달라지지 않는다.
 */
function canvasPixelRatio(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? Math.min(devicePixelRatio, MAX_CANVAS_DPR)
    : 1
  if (cssWidth <= 0 || cssHeight <= 0) return dpr
  return Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight)))
}

export { canvasPixelRatio, MAX_CANVAS_DPR, MAX_CANVAS_PIXELS }
