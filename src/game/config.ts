/**
 * 아레나 좌표계: 원점은 받침대 중앙, x는 오른쪽 +, y는 위쪽 + (단위: 미터).
 * Rapier는 수 미터 규모에서 가장 안정적이라 픽셀이 아니라 미터로 시뮬레이션하고,
 * 렌더러가 px로 환산한다.
 */
const ARENA = {
  // 월드를 좁게 잡을수록 같은 캔버스에서 물건이 크게 보인다.
  // 받침대 밖으로 0.7씩 여유를 두어, 굴러떨어질 공간은 남기면서
  // 빈 공간이 화면을 낭비하지 않게 했다.
  halfWidth: 2.7,
  height: 5.2,
  /** 받침대 윗면 높이 */
  platformTop: 0.8,
  /**
   * 받침대 반폭.
   * 양옆에 벽이 없으니 미끄러진 물건을 받아줄 것은 받침대 폭뿐이다.
   * 좁게 잡으면 한 칸 폭 탑을 쌓다가 살짝 미끄러지는 것만으로 즉사해서,
   * 실력과 무관하게 두세 개에서 끝난다.
   *
   * 2.0은 너무 관대해서 미끄러져도 대개 받침대가 받아냈다. 조준 범위가 이 값에서
   * 파생되므로(AIM_HALF_RANGE) 좁히면 조준도 같이 좁아진다 — 한 번에 크게 줄이지 않는다.
   */
  platformHalfWidth: 1.85,
  platformHalfHeight: 0.25,
  /** 물건이 생성되는 높이 */
  spawnY: 4.6,
  /** 이 높이보다 아래로 내려간 물건은 이탈로 본다 */
  killY: -0.8,
  /**
   * 지구 중력(-9.81)보다 약하게 잡았다.
   * 스폰 높이에서 받침대까지는 3m가 넘는데, 실제 중력이면 착지 속도가 8m/s를 넘어
   * 이미 쌓아둔 물건을 밀어내고 스택이 두세 개에서 무너진다.
   * 약한 중력은 낙하가 눈으로 읽히게 만들고 조준할 시간도 준다.
   */
  gravity: -7,
} as const

/** 가장 큰 물건(비행기)의 반폭. tests/shapes.test.ts가 이 값을 지킨다 */
const MAX_ITEM_HALF_WIDTH = 0.55

/**
 * 화살표가 훑는 범위.
 *
 * 받침대 반폭에서 가장 큰 물건의 반폭을 뺀 값이다. 즉 어느 타이밍에 Enter를 쳐도
 * 물건은 받침대 위에 온전히 얹힌다. 조준 실수 하나로 즉사하지 않아야 하고,
 * 그래야 무너짐이 조준이 아니라 순수하게 쌓기 실패에서만 나온다.
 */
const AIM_HALF_RANGE = ARENA.platformHalfWidth - MAX_ITEM_HALF_WIDTH

/** 물건을 연달아 쏟아내 물리를 망가뜨리는 것만 막는 최소 간격 */
const DROP_COOLDOWN_MS = 300

const HIDDEN_CHANCE = 0.14

/** 안정화 판정: 이 속도 아래로 이만큼 유지되면 착지 완료로 본다 */
const SETTLE_SPEED = 0.35
const SETTLE_HOLD_SEC = 0.35

/** 물건이 받침대를 벗어날 때마다 하나씩 줄고, 0이 되면 끝이다 */
const LIVES = 3

/**
 * 목숨을 잃은 뒤 이만큼은 더 깎이지 않는다.
 *
 * 탑이 무너지면 물건이 하나씩 떨어지는 게 아니라 우수수 쏟아진다. 이탈을 각각 세면
 * 한 번의 무너짐으로 목숨 3개가 다 날아가서, 목숨이 3개인 의미가 사라진다.
 * 이 시간은 그 연쇄를 한 번의 실수로 묶어준다 — 쏟아지는 것이 끝날 만큼은 되고,
 * 다시 쌓기 시작할 때까지 남을 만큼 길지는 않은 값이다.
 */
const INVULNERABLE_SEC = 2

/**
 * 싱글에서 쓰는 주인 식별자.
 * 물리 층은 물건마다 주인을 들고 있어야 한다 — 멀티에서 물건이 벗어나면
 * 떨어뜨린 사람이 아니라 쌓은 사람의 목숨이 깎이기 때문이다. 싱글은 주인이 하나뿐이다.
 */
const SOLO_OWNER = 'solo'

const SCORE = {
  perItem: 100,
  perHeightMeter: 220,
  /** 콤보 1당 배수 증가분 */
  comboStep: 0.1,
  /** 배수 상한 */
  comboMaxMultiplier: 3,
  /**
   * 놓친 단어에 매기는 대가. 상쇄를 없앤 대신 점수로만 받는다.
   *
   * 최종 점수에 `floor + (1 - floor) x 정확도`를 곱한다. 정확도는 쌓은 개수를
   * 쌓은 개수와 놓친 개수의 합으로 나눈 값이다. 즉 많이 쌓을수록 실수 하나의
   * 무게가 옅어진다 — 놓쳤다고 판이 망가지면 안 되고, 다만 잘 친 판과는
   * 구분되어야 한다.
   */
  accuracyFloor: 0.4,
  /** 합성으로 만들어낸 물건에 얹는 점수 */
  craftBonus: 260,
} as const

const WORD = {
  slotsPerSide: 4,
} as const

/**
 * 아레나를 화면에 그릴 때의 최대 폭(px).
 * 캔버스 자체는 낙하 레인 뒤까지 화면 전체에 깔린다 — 튕겨 날아간 물건과 히든 연출이
 * 받침대 영역을 벗어나도 보여야 하기 때문이다. 아레나(점선 틀)는 이 폭을 넘지 않으므로
 * GameScreen의 가운데 열과 렌더러가 같은 값을 본다.
 */
const ARENA_SCREEN_MAX_WIDTH = 480

/**
 * 이 질량 이상이면 "무거운 물건"이다. 착지하면 감쇠를 걸어 잠그고, 화면을 흔든다.
 *
 * **밀도가 아니라 질량으로 재는 이유**가 있다. 밀도로 재면 작고 조밀한 것(텀블러
 * 0.408)이 무겁다고 판정되고, 크고 실제로 더 무거운 것(비행기 0.410, 피자 한판
 * 0.526, 노트북 0.625)이 빠진다. 화면에서 무거워 보이는 것은 크기이므로,
 * 밀도로 재면 "가벼워 보이는 게 흔들고 무거워 보이는 건 조용한" 어긋남이 생긴다.
 *
 * 0.35에서 끊으면 도시락·노트북·피자 한판·접힌 노트북·비행기·텀블러가 들어오고,
 * 그다음(우산 0.183)까지 간격이 넓어서 경계가 애매하지 않다.
 */
const HEAVY_MASS = 0.35
const ANCHOR_LINEAR_DAMPING = 7
const ANCHOR_ANGULAR_DAMPING = 9

/** 무거운 물건이 이 속도 이상으로 부딪히면 화면이 흔들린다 */
const QUAKE_MIN_SPEED = 3.5
/**
 * 충격(속도 x 질량)을 0~1 세기로 누르는 나눔값.
 * 가장 무거운 물건이 제 속도로 떨어졌을 때 최대치에 닿고, 경계에 걸친 물건은
 * 눈에 겨우 보일 만큼만 흔들리는 값이다.
 */
const QUAKE_IMPACT_SCALE = 4.5
const QUAKE_DURATION = 0.45
/** 흔들림 최대 진폭 (월드 단위) */
const QUAKE_MAX_AMPLITUDE = 0.16
/**
 * 자리를 잡은 무거운 물건이 여기서 이만큼(월드 단위) 밀려나면 자리를 잃은 것으로 본다.
 * 그 순간 잠금이 풀리고 지진 판정도 되살아나서, 다시 부딪히면 또 흔들린다.
 * 얹힌 물건이 눌려 생기는 미세한 떨림으로는 넘지 못하고, 무너지기 시작할 때만 넘는 거리다.
 */
const QUAKE_REARM_DISTANCE = 0.4
/**
 * 자리를 잃은 물건이 다시 부딪힐 때는 이 속도만 넘어도 흔들린다.
 * 무너질 때의 낙하는 스택 한 칸 높이라 처음 떨어질 때만큼 빨라지지 않는데,
 * 그래도 무거운 것이 쏟아지는 순간이니 화면은 흔들려야 한다.
 */
const QUAKE_REIMPACT_SPEED = 2.2

export {
  ARENA,
  AIM_HALF_RANGE,
  MAX_ITEM_HALF_WIDTH,
  DROP_COOLDOWN_MS,
  HIDDEN_CHANCE,
  SETTLE_SPEED,
  SETTLE_HOLD_SEC,
  SCORE,
  LIVES,
  INVULNERABLE_SEC,
  SOLO_OWNER,
  WORD,
  ARENA_SCREEN_MAX_WIDTH,
  HEAVY_MASS,
  QUAKE_IMPACT_SCALE,
  ANCHOR_LINEAR_DAMPING,
  ANCHOR_ANGULAR_DAMPING,
  QUAKE_MIN_SPEED,
  QUAKE_DURATION,
  QUAKE_MAX_AMPLITUDE,
  QUAKE_REARM_DISTANCE,
  QUAKE_REIMPACT_SPEED,
}
