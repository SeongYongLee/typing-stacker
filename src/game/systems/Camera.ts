import {
  ARENA,
  CAMERA_DESCEND_FOLLOW,
  CAMERA_FOLLOW,
  CAMERA_START_TOP,
} from '../config.ts'

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
 * 지금 탑 높이에서 카메라가 있어야 할 자리.
 * 화면의 2/3 정도가 찰 때까지는 고정하고, 그 뒤부터 넘친 만큼만 조금씩 올린다.
 */
function targetCameraY(stackTop: number): number {
  return Math.max(0, stackTop - CAMERA_START_TOP)
}

/**
 * 현재 위치에서 목표를 향해 한 프레임만큼 다가간다.
 *
 * 즉시 옮기면 물건 하나 얹을 때마다 화면이 툭 튀어 어디에 떨어지는지 놓친다.
 * 내려올 때는 더 천천히 따라간다 — 탑이 살짝 흔들릴 때마다 판이 내려오면 고양이
 * 판정과 화면 타이밍이 같이 출렁인다.
 */
function followCameraY(current: number, stackTop: number, dt: number): number {
  const target = targetCameraY(stackTop)
  const follow = target < current ? CAMERA_DESCEND_FOLLOW : CAMERA_FOLLOW
  const step = Math.min(1, follow * dt)
  const next = current + (target - current) * step
  return Math.abs(next - target) < 0.02 ? target : next
}

/** 물건이 생겨야 할 높이. 시야가 올라간 만큼 함께 올라간다 */
function spawnYFor(cameraY: number): number {
  return ARENA.spawnY + cameraY
}

export { CAMERA_START_TOP, targetCameraY, followCameraY, spawnYFor }
