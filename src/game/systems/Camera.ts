import { ARENA, CAMERA_FOLLOW, CAMERA_HEADROOM } from '../config.ts'

/**
 * 탑을 따라 올라가는 시야.
 *
 * 카메라가 없으면 스폰 높이(ARENA.spawnY)가 곧 게임의 천장이 된다. 탑이 거기 닿는
 * 순간 새 물건이 탑 **속에** 생겨 서로를 밀어내며 튕겨나간다. 붙는 물건이 생기면서
 * 탑이 안정되자 실제로 도달하게 됐다 — 봇으로 재보니 23개째에 최고 높이가 정확히
 * 스폰 높이에 닿았고 그 뒤로 네 번 겹쳐 생성됐다.
 *
 * 물리도 화면도 모르는 순수 계산이라 node에서 그대로 시험한다.
 */

/**
 * 카메라가 움직이기 시작하는 탑 높이.
 * 여기까지는 시야가 고정이고, 넘어서면 따라 오른다 — "판이 본격적으로 시작되는 지점"이
 * 눈에 보이는 유일한 순간이라 난이도도 이 값을 기준으로 삼는다(Difficulty.ts).
 */
const CAMERA_START_TOP = ARENA.spawnY - CAMERA_HEADROOM

/** 지금 탑 높이에서 카메라가 있어야 할 자리 */
function targetCameraY(stackTop: number): number {
  // 받침대 위 여유가 CAMERA_HEADROOM보다 좁아지면 그만큼 올려다본다
  return Math.max(0, stackTop + CAMERA_HEADROOM - ARENA.spawnY)
}

/**
 * 현재 위치에서 목표를 향해 한 프레임만큼 다가간다.
 *
 * 즉시 옮기면 물건 하나 얹을 때마다 화면이 툭 튀어 어디에 떨어지는지 놓친다.
 * 내려올 때도 같은 빠르기로 따라간다 — 탑이 무너져 낮아졌는데 시야가 하늘에
 * 머물러 있으면 남은 것이 안 보인다.
 */
function followCameraY(current: number, stackTop: number, dt: number): number {
  const target = targetCameraY(stackTop)
  const step = Math.min(1, CAMERA_FOLLOW * dt)
  return current + (target - current) * step
}

/** 물건이 생겨야 할 높이. 시야가 올라간 만큼 함께 올라간다 */
function spawnYFor(cameraY: number): number {
  return ARENA.spawnY + cameraY
}

export { CAMERA_START_TOP, targetCameraY, followCameraY, spawnYFor }
