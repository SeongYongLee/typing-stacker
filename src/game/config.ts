/**
 * 밸런스 상수의 **현관**.
 *
 * 값은 `config/` 아래 다섯 파일이 나눠 갖고 여기서는 다시 내보내기만 한다.
 * 그래서 `from '../config.ts'`로 쓰던 곳(쉰 곳이 넘는다)은 하나도 고칠 것이 없다.
 *
 * ## 왜 갈랐나
 *
 * 한 파일에 상수 예순 개가 모여 있었고 **기능을 하나 넣으면 반드시 여기를 지났다.**
 * 여러 사람이 동시에 일할 때 이 파일이 늘 교차로가 되어, 서로 상관없는 작업끼리
 * 같은 자리에서 부딪혔다.
 *
 * 값을 한곳에 모은 것 자체는 옳았다 — 밸런스는 나란히 놓고 봐야 조율이 된다.
 * 다만 "나란히 볼 무리"가 하나가 아니라 다섯이었을 뿐이다.
 *
 * | 파일 | 무엇 |
 * |---|---|
 * | `arena` | 좌표계·크기·카메라·조준 — 판이 놓이는 자리 |
 * | `time` | 판의 시간. 언제 무엇이 내려오는가 |
 * | `items` | 물건이 나오는 방식과 얹히는 자리 |
 * | `scoring` | 점수·목숨. 판이 어떻게 끝나는가 |
 * | `feel` | 부딪힘·흔들림·멎음. 손끝의 감각 |
 *
 * **값을 더할 때는 `config/` 안에 넣는다.** 여기에 직접 쓰면 갈라놓은 뜻이 사라진다.
 */

export {
  ARENA,
  CAMERA_HEADROOM,
  CAMERA_FOLLOW,
  MAX_ITEM_HALF_WIDTH,
  AIM_OVERHANG,
  AIM_HALF_RANGE,
  ARENA_SCREEN_MAX_WIDTH,
  MIN_VIEWPORT_WIDTH,
} from './config/arena.ts'

export {
  COUNTDOWN_SEC,
  SOLO_READY_MS,
  SOLO_START_MS,
  DIFFICULTY_FULL_HEIGHT,
  FIRST_NIGHT_MERGES,
  FIRST_NIGHT_SEC,
  DAY_SEC,
  NIGHT_SEC,
  DROP_COOLDOWN_MS,
  WORD,
} from './config/time.ts'

export { LEDGE, CATCH, HIDDEN_CHANCE, OPENING_HIDDEN_CHANCE } from './config/items.ts'

export { LIVES, SOLO_LIVES, INVULNERABLE_SEC, SOLO_OWNER, SCORE } from './config/scoring.ts'

export {
  SETTLE_SPEED,
  SETTLE_HOLD_SEC,
  HEAVY_MASS,
  ANCHOR_LINEAR_DAMPING,
  ANCHOR_ANGULAR_DAMPING,
  QUAKE_MIN_SIZE,
  QUAKE_MIN_SPEED,
  IMPACT_MIN_SPEED,
  IMPACT_FULL_SCALE,
  QUAKE_IMPACT_SCALE,
  QUAKE_DURATION,
  QUAKE_MAX_AMPLITUDE,
  QUAKE_REARM_DISTANCE,
  QUAKE_REIMPACT_SPEED,
} from './config/feel.ts'
