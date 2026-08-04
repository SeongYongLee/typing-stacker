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

export { isEscaped }
