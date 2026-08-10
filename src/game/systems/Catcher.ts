import { ARENA } from '../config/arena.ts'
import { CATCH } from '../config/items.ts'

/**
 * 화이트보드에 적힌 단어를 치면 **뻗어 나와 물건을 회수해 가는 판.**
 *
 * 손이 옆에서 들어와 떨어지는 물건을 받고, 물건은 그 위를 미끄러져 받침대 **바깥으로**
 * 빠진다. 그렇게 나간 물건은 목숨을 깎지 않는다 — 규칙과 그 근거는 [[01_Planning]].
 *
 * ## 여기서 정하는 것은 자리 하나뿐이다
 *
 * 브라우저도 물리도 모른다. "어디서 떨궜고 탑이 얼마나 높은가"를 받아 **판의 두 끝이
 * 어디인가**를 돌려준다. 세우는 것은 `PhysicsWorld`, 그리는 것은 `renderer/`다 —
 * 통나무에서 `Ledge.ts`와 물리를 나눈 것과 같은 경계다.
 *
 * ## 판이 지켜야 하는 것 넷
 *
 * | | 왜 |
 * |---|---|
 * | 안쪽 끝이 **떨군 자리를 덮는다** | 안 그러면 물건이 판을 비켜 지나 탑에 얹힌다 |
 * | 바깥 끝이 **받침대 밖으로 나간다** | 안 그러면 미끄러진 물건이 결국 탑 위로 떨어진다 |
 * | 바깥 끝이 안쪽보다 **낮다** | 미끄러져 나가야 회수다. 평평하면 그냥 공중 발판이 된다 |
 * | 판 전체가 **탑 꼭대기보다 위** | 탑 속에 생기면 회수가 아니라 붕괴다 |
 *
 * 넷 다 시험이 지킨다. 특히 두 번째와 네 번째는 어겨도 물리는 멀쩡히 돌아가고
 * **눈으로만 "왜 저게 얹히지"로 보이는** 종류라 값을 만질 때 조용히 깨진다.
 */

interface CatchSpot {
  /** 어느 쪽으로 빼내는가. 단어가 내려온 레인을 따른다 */
  readonly side: 'left' | 'right'
  /** 떨군 자리를 덮는 안쪽 끝 */
  readonly innerX: number
  readonly innerY: number
  /** 받침대 밖으로 나간 바깥 끝. 여기서 물건이 떨어진다 */
  readonly outerX: number
  readonly outerY: number
}

/** 판의 가운데와 길이·기울기. 물리와 그림이 쓰기 좋은 꼴 */
interface CatchPlank {
  readonly x: number
  readonly y: number
  readonly halfLength: number
  /** 라디안. 화면에서 시계 반대 방향이 + (월드 y가 위쪽 +) */
  readonly angle: number
}

/**
 * 판을 놓을 자리를 고른다.
 *
 * `dropX`는 Enter를 친 순간의 조준이고 `stackTop`은 지금 탑의 꼭대기다.
 */
function catchSpot(dropX: number, side: 'left' | 'right', stackTop: number): CatchSpot {
  const sign = side === 'left' ? -1 : 1

  /*
   * 안쪽 끝은 떨군 자리보다 **조금 더 안쪽**에서 시작한다. 딱 맞추면 물건의 반폭만큼이
   * 판 밖으로 걸쳐 나가 모서리에서 튕긴다 — 받는 것이 아니라 치는 것이 된다.
   */
  const innerX = dropX - sign * CATCH.grip

  /*
   * 바깥 끝은 **받침대 밖**이어야 한다. 받침대 가장자리에서 멈추면 미끄러진 물건이
   * 그 아래 탑의 어깨로 떨어진다 — 회수한 줄 알았는데 얹히는 것이라 가장 나쁘다.
   */
  const outerX = sign * (ARENA.platformHalfWidth + CATCH.clearOut)

  /*
   * 높이는 **바깥 끝**에 건다. 판에서 가장 낮은 점이 거기이기 때문이다.
   *
   * 안쪽에 걸었더니 판이 길어질수록 바깥 끝이 기울기만큼 내려가 **바닥 아래로
   * 잠겼다** — 왼쪽 레인 단어를 오른쪽 끝에 조준하면 판이 5m를 넘고, 그때 바깥 끝이
   * 받침대 윗면보다 0.26m 아래였다. 가장 낮은 점을 기준으로 잡으면 길이가 얼마든
   * 탑 위에 뜬다.
   */
  const floor = Math.max(stackTop, ARENA.platformTop)
  const outerY = floor + CATCH.rise
  const innerY = outerY + Math.abs(outerX - innerX) * CATCH.slope

  return { side, innerX, innerY, outerX, outerY }
}

/** 두 끝을 물리·그림이 쓰는 꼴로 바꾼다 */
function plankOf(spot: CatchSpot): CatchPlank {
  const dx = spot.outerX - spot.innerX
  const dy = spot.outerY - spot.innerY
  return {
    x: (spot.innerX + spot.outerX) / 2,
    y: (spot.innerY + spot.outerY) / 2,
    halfLength: Math.hypot(dx, dy) / 2,
    angle: Math.atan2(dy, dx),
  }
}

/**
 * 회수되는 물건이 떨어지는 자리. **조준을 쓰지 않는다** — 까닭은 `CATCH.dropX`에.
 *
 * 이 규칙을 자리를 고르는 쪽과 같은 파일에 둔 이유는 둘이 한 몸이기 때문이다.
 * 떨구는 자리가 바뀌면 판의 길이가 통째로 바뀐다.
 */
function recallDropX(side: 'left' | 'right'): number {
  return (side === 'left' ? -1 : 1) * CATCH.dropX
}

/**
 * 판의 길이. 떨구는 자리가 고정이라 **늘 같다.**
 *
 * 그림(손)이 이 길이에 맞춰 늘어나므로, `dropX`나 `clearOut`을 만지면 팔이 얼마나
 * 길어 보이는지가 함께 바뀐다.
 */
const HALF_LENGTH = plankOf(catchSpot(recallDropX('right'), 'right', 0)).halfLength

export { catchSpot, plankOf, recallDropX, HALF_LENGTH }
export type { CatchSpot, CatchPlank }
