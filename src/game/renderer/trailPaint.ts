import { sparkleColor } from './glow.ts'
import { SPECS, type Particle } from '../systems/TrailField.ts'
import type { Trail } from '../data/trails.ts'

/**
 * 부스러기 하나를 어떤 색으로 얼마나 진하게 칠할지.
 *
 * `TrailField`가 **어디에 무엇이 있는지**를 알고 여기가 **어떻게 보일지**를 안다.
 * 색번짐에서 `LandingGlow`와 `glow.ts`를 나눈 것과 같은 경계다 — 그래야 세기와 색을
 * 조율하는 일이 물리·시간 로직을 건드리지 않고 끝난다.
 */

interface TrailPaint {
  readonly style: string
  readonly alpha: number
  /**
   * 두를 테두리. 필요 없으면 null이다.
   *
   * **배경이 그림이 된 뒤에 생긴 것이다.** 예전 아레나는 단색 어두운 색이라 밝은
   * 부스러기가 그대로 떠 보였는데, 지금은 밝은 벽·화이트보드·창문 위에 얹히므로
   * 밝은 점을 밝은 곳에 찍는 꼴이 된다. 물건 스티커가 검은 윤곽을 두르는 것과 같은
   * 해법이고, 같은 어법이라 겉돌지도 않는다.
   *
   * 어두운 배경에서는 어두운 테두리가 배경에 묻혀 저절로 사라진다 — 낮과 밤에
   * 다른 값을 쓰지 않아도 되는 이유다.
   */
  readonly outline: { readonly style: string; readonly width: number } | null
}

/**
 * 갈래마다 가장 진할 때의 알파.
 *
 * 반짝임만 가산 합성이라 값이 낮다 — 더하는 색은 같은 알파에서도 훨씬 세게 보인다.
 *
 * **2026-08-09에 전반으로 올렸다.** 예전 값은 "어두운 배경에서 이 정도면 보인다"를
 * 기준으로 잡은 것인데, 아레나 배경이 단색에서 밝은 그림으로 바뀌며 그 전제가 깨졌다.
 * 김만 그대로다 — 김은 배경이고, 진해지면 쌓인 물건을 가린다.
 */
const PEAK: Readonly<Record<Trail, number>> = {
  sparkle: 0.85,
  droplet: 0.82,
  petal: 0.92,
  fluff: 0.66,
  crumb: 0.78,
  /* 퍼지는 물은 짧게 살아서 눈에 남는 시간이 적다. 그만큼 진해야 보인다 */
  splash: 0.85,
  /* 김은 배경이다. 진하면 쌓인 물건을 가려 무엇이 얹혔는지가 안 보인다 */
  steam: 0.22,
}

/*
 * **가산 합성을 걷어냈다.**
 *
 * 반짝임만 `lighter`로 그렸는데, 캔버스가 투명해서 그 합성은 **부스러기끼리 겹칠 때만**
 * 작용한다(배경과는 나중에 일반 알파로 합성된다). 물건이 쌓이는 자리의 배경 휘도가
 * 낮·밤 모두 **155**라 밝은 반짝임이 겹치면 하얗게 뜨기만 하고, 그것이 "빛"으로
 * 읽히지도 않는다.
 *
 * 대신 **밝기와 테두리**로 대비를 만든다 — `sparkleColor`가 배경보다 62만큼 밝게
 * 맞추고, 어두운 테두리가 형태를 만든다. 색번짐이 곱으로 바뀐 것과 같은 판단이다.
 */

/**
 * 밝기를 맞춰 쓰는 갈래.
 *
 * 반짝임은 **빛**이라 짙은 물건이어도 밝게 나가야 한다. 무엇보다 **배경보다 밝아야**
 * 보인다 — 물건이 쌓이는 자리의 휘도가 155다(`SPARKLE_LIGHTNESS`). 나머지는 물건의
 * 색을 그대로 쓴다 — 흩날리는 단풍잎은 단풍잎 색이어야 하고, 밝기를 맞추면 잎이
 * 죄다 파스텔로 뜬다.
 */
const NORMALIZED: Readonly<Record<Trail, boolean>> = {
  sparkle: true,
  droplet: false,
  petal: false,
  fluff: false,
  crumb: false,
  /* 물은 담긴 것의 색이어야 한다 — 맥주는 노랗고 딸기우유는 분홍이다 */
  splash: false,
  /* 색이 이미 `STEAM_COLOR`로 정해져 있다. 밝기를 또 맞출 것이 없다 */
  steam: false,
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const body = hex.startsWith('#') ? hex.slice(1) : hex
  const full = body.length === 3 ? [...body].map((c) => c + c).join('') : body
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return { r: 0.6, g: 0.6, b: 0.6 }
  }
  return {
    r: Number.parseInt(full.slice(0, 2), 16) / 255,
    g: Number.parseInt(full.slice(2, 4), 16) / 255,
    b: Number.parseInt(full.slice(4, 6), 16) / 255,
  }
}

/**
 * 남은 수명으로 옅어진다.
 *
 * 태어날 때 곧바로 최대가 아니라 **아주 짧게 밝아졌다 사라진다** — 물건에서 막 떨어진
 * 자리에서 갑자기 최대 밝기로 나타나면 부스러기가 아니라 점이 찍힌 것처럼 보인다.
 */
function fadeOf(particle: Particle): number {
  const remain = Math.max(0, Math.min(1, particle.life / particle.born))
  const rise = Math.min(1, (1 - remain) * 8)
  return remain * remain * rise
}

/**
 * 살면서 커진 배수. 김에만 1을 넘는다(`SPECS.steam.grow`).
 *
 * 여기 두는 이유는 이것이 **보이는 크기**의 문제이기 때문이다 — `TrailField`가 든
 * `size`는 태어날 때의 크기이고, 시간에 따라 어떻게 보일지는 칠하는 쪽이 정한다.
 */
function grownBy(particle: Particle): number {
  const grow = SPECS[particle.kind].grow
  if (grow === 0) {
    return 1
  }
  const aged = 1 - Math.max(0, Math.min(1, particle.life / particle.born))
  return 1 + grow * aged
}

/**
 * 테두리를 두르지 않는 갈래.
 *
 * 김은 배경이라 윤곽이 생기면 연기가 아니라 덩어리로 보인다. 나머지는 전부 두른다 —
 * 밝은 배경에서 형태를 만들어주는 것이 이 선의 일이다.
 */
const NO_OUTLINE: ReadonlySet<Trail> = new Set<Trail>(['steam'])

/** 테두리 색. 물건 스티커의 윤곽과 같은 어법이라 검정 계열이다 */
const OUTLINE_RGB = '26, 22, 30'

/**
 * 테두리를 본체 알파의 몇 배로 칠하는가.
 *
 * 1을 넘긴 이유는 **본체가 옅어질 때 형태가 먼저 사라지면 안 되기 때문**이다.
 * 같은 비율로 옅어지면 밝은 배경에서 부스러기가 수명 절반쯤부터 안 보인다.
 */
const OUTLINE_ALPHA = 1.15

/** 테두리 두께(px). 부스러기가 작으므로 이보다 굵으면 선이 속을 다 먹는다 */
const OUTLINE_WIDTH = 1.1


function trailPaint(particle: Particle, scale: number): TrailPaint {
  const base = NORMALIZED[particle.kind]
    ? sparkleColor(particle.color)
    : parseHex(particle.color)
  const alpha = PEAK[particle.kind] * fadeOf(particle) * scale
  const to255 = (value: number): number => Math.round(value * 255)
  return {
    style: `rgba(${to255(base.r)}, ${to255(base.g)}, ${to255(base.b)}, ${alpha})`,
    alpha,
    outline: NO_OUTLINE.has(particle.kind)
      ? null
      : {
          style: `rgba(${OUTLINE_RGB}, ${Math.min(1, alpha * OUTLINE_ALPHA)})`,
          width: OUTLINE_WIDTH,
        },
  }
}

export { trailPaint, fadeOf, grownBy, PEAK, NORMALIZED }
export type { TrailPaint }
