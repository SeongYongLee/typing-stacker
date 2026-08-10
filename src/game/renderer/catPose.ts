/**
 * 뛰어드는 고양이가 지금 어디에 있는가 — 뛰는 **모양**.
 *
 * `systems/CatPickup.ts`는 "누가 어디서 언제부터"까지만 안다. 어떤 곡선으로 뛰어
 * 오르고 얼마나 크게 그려질지는 여기서 정한다 — 색번짐에서 `LandingGlow`와
 * `glow.ts`를 나눈 것과 같은 경계다. 세기를 손보는 일이 판의 시간 로직을 건드리지
 * 않고 끝난다.
 *
 * ## 왜 포물선인가
 *
 * 올라갈 때 느려지고 내려올 때 빨라지는 것이 뛰어오른 것으로 읽히는 유일한 신호다.
 * 등속으로 오르내리면 뛰는 것이 아니라 **끌려 올라갔다 내려오는** 것으로 보인다.
 * 그래서 오름은 감속(`1-(1-u)²`), 내림은 가속(`1-v²`)으로 나눠 쓴다 — 중력이 하는
 * 일을 그대로 적은 것이다.
 */
import { GRAB_AT, type CatView } from '../systems/CatPickup.ts'

/**
 * 고양이 그림의 **폭**(월드 미터).
 *
 * 높이가 아니라 폭을 기준으로 삼는다. 파이프라인이 여백을 잘라내므로 네 마리의
 * 세로가 465~590으로 제각각인데, 뛰는 자세의 가로 길이는 곧 도약 폭이라 그쪽이
 * 서로 비슷하다. 높이에 맞추면 웅크린 고양이만 옆으로 퍼진다.
 *
 * 받침대 반폭이 2.0m이고 물건이 0.4~1.2m다. 1.5m면 물건보다 확실히 크면서
 * 받침대를 다 가리지는 않는다 — **가려버리면 무엇을 잃었는지가 또 안 보인다.**
 */
const CAT_WIDTH = 1.5

/** 뛰기 시작하는 자리가 물건에서 바깥쪽으로 얼마나 떨어져 있는가(m) */
const LEAP_OUT = 1.1

/** 물어 가며 착지하는 자리는 더 바깥이다 — 물건을 갖고 물러난다 */
const LEAP_AWAY = 1.9

/** 뛰기 시작하는 높이가 물건보다 얼마나 아래인가(m). 화면 밖에서 올라와야 한다 */
const LEAP_DROP = 2.6

/** 무는 자리 — 고양이 그림 가운데에서 앞쪽·위쪽으로 얼마나(그림 폭 대비) */
const MOUTH_FORWARD = 0.24
const MOUTH_UP = 0.1

interface CatPose {
  /** 그릴 그림의 이름 뒷자리. `cat-<kind>-<from>` */
  readonly art: `cat-${CatView['kind']}-${CatView['from']}`
  /** 고양이 그림 가운데(월드 좌표) */
  readonly x: number
  readonly y: number
  /** 그림 폭(월드 미터) */
  readonly width: number
  /** 물고 있는 물건을 그릴 자리. 아직 안 물었으면 null */
  readonly carry: { readonly x: number; readonly y: number } | null
}

/**
 * 지금 프레임의 자세.
 *
 * 물건은 **물기 전까지 떨어진 자리에 그대로 있다**(`carry`가 null). 그 사이에도
 * 물건을 고양이에 붙여 그리면 고양이가 빈손으로 다가가 이미 물고 있는 것이 되어,
 * 무는 순간이 사라진다.
 */
function catPose(cat: CatView): CatPose {
  const outward = cat.from === 'left' ? -1 : 1
  const startX = cat.x + outward * LEAP_OUT
  const endX = cat.x + outward * LEAP_AWAY
  const floorY = cat.y - LEAP_DROP

  const t = cat.progress
  let lift: number
  let x: number
  if (t < GRAB_AT) {
    const u = t / GRAB_AT
    lift = 1 - (1 - u) * (1 - u)
    x = startX + (cat.x - startX) * u
  } else {
    const v = (t - GRAB_AT) / (1 - GRAB_AT)
    lift = 1 - v * v
    x = cat.x + (endX - cat.x) * v
  }
  const y = floorY + (cat.y - floorY) * lift

  /*
   * 무는 자리는 **앞발 쪽**이다. `jump-left`는 왼쪽에서 들어와 오른쪽을 향하므로
   * 앞이 곧 안쪽 — 바깥쪽의 반대다.
   */
  const forward = -outward
  return {
    art: `cat-${cat.kind}-${cat.from}`,
    x,
    y,
    width: CAT_WIDTH,
    carry: cat.holding
      ? {
          x: x + forward * CAT_WIDTH * MOUTH_FORWARD,
          y: y + CAT_WIDTH * MOUTH_UP,
        }
      : null,
  }
}

export { catPose, CAT_WIDTH }
export type { CatPose }
