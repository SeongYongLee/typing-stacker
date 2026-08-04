import { ARENA } from '../config.ts'

/**
 * 받침대에는 양옆 벽이 없다. 그래서 한쪽으로 쏠려 쌓다가 무너지면 물건이
 * 아레나 밖으로 굴러떨어지고, 그 순간이 게임오버다.
 *
 * 물리 정확도가 아니라 위치만 보고 판정하므로 엔진 품질에 의존하지 않고,
 * 플레이어 눈에도 "아 저거 넘어가는데"가 그대로 보인다.
 */
function isEscaped(x: number, y: number): boolean {
  return y < ARENA.killY || Math.abs(x) > ARENA.halfWidth
}

/**
 * 이탈로 판정된 물건도 바로 치우지 않는다 — 테두리 밖으로 튕겨 날아가는 모습이
 * 캔버스에 그려져야 "저게 떨어져서 목숨이 깎였다"가 눈에 남는다.
 * 이 여유까지 넘어가면 화면에서 완전히 사라진 것으로 보고 세계에서 지운다.
 */
const DESPAWN_MARGIN = 4

function isOutOfSight(x: number, y: number): boolean {
  return y < ARENA.killY - DESPAWN_MARGIN || Math.abs(x) > ARENA.halfWidth + DESPAWN_MARGIN
}

export { isEscaped, isOutOfSight }
