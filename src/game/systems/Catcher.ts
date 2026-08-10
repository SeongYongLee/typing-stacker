import { ARENA } from '../config/arena.ts'
import { CATCH } from '../config/items.ts'

/**
 * 화이트보드에 적힌 단어를 치면 받침대 밖에서 **물건을 회수해 가는 손.**
 *
 * 손이 옆에서 들어와 있고, 물건은 처음부터 그 손 위에 떨어진다. 그렇게 나간 물건은
 * 목숨을 깎지 않는다.
 *
 * ## 여기서 정하는 것은 자리 하나뿐이다
 *
 * 브라우저도 물리도 모른다. "어디서 떨궜고 탑이 얼마나 높은가"를 받아 **판의 두 끝이
 * 어디인가**를 돌려준다. 세우는 것은 `PhysicsWorld`, 그리는 것은 `renderer/`다 —
 * 통나무에서 `Ledge.ts`와 물리를 나눈 것과 같은 경계다.
 *
 * ## 손이 지켜야 하는 것
 *
 * | | 왜 |
 * |---|---|
 * | 떨구는 자리가 **받침대 밖** | 회수 물건이 필드에 다시 들어오면 안 된다 |
 * | 손은 **아레나 안** | 화면 밖에서 그냥 사라진 것처럼 보이면 안 된다 |
 * | 손 전체가 **탑 꼭대기보다 위** | 탑 속에 생기면 회수가 아니라 붕괴다 |
 *
 * 넷 다 시험이 지킨다. 특히 두 번째와 네 번째는 어겨도 물리는 멀쩡히 돌아가고
 * **눈으로만 "왜 저게 얹히지"로 보이는** 종류라 값을 만질 때 조용히 깨진다.
 */

interface CatchSpot {
  /** 어느 쪽으로 빼내는가. 단어가 내려온 레인을 따른다 */
  readonly side: 'left' | 'right'
  /** 떨군 자리를 덮는 안쪽 끝. 바깥 손 모델에서도 받침대 밖에 있다 */
  readonly innerX: number
  readonly innerY: number
  /** 받침대 밖으로 나간 바깥 끝. 여기서 물건이 빠진다 */
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
 * `dropX`는 레인 쪽 바깥 손의 낙하 위치이고 `stackTop`은 지금 탑의 꼭대기다.
 */
function catchSpot(dropX: number, side: 'left' | 'right', stackTop: number): CatchSpot {
  const sign = side === 'left' ? -1 : 1

  const innerX = dropX - sign * 0.24
  const outerX = dropX + sign * 0.7

  /*
   * 손은 탑보다 위에서 받는다. 낮은 바깥 끝을 기준으로 잡으면 탑이 높아져도 손이
   * 탑 안에 박히지 않는다.
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
