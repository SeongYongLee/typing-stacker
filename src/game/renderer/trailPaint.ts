import { glowColor } from './glow.ts'
import type { Particle } from '../systems/TrailField.ts'
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
  /** 빛을 더해 칠하는가. 반짝임만 그렇다 */
  readonly additive: boolean
}

/**
 * 갈래마다 가장 진할 때의 알파.
 *
 * 반짝임만 가산 합성이라 값이 낮다 — 더하는 색은 같은 알파에서도 훨씬 세게 보인다.
 * 나머지는 물감처럼 덮으므로 어두운 배경에서 이 정도는 되어야 보인다.
 */
const PEAK: Readonly<Record<Trail, number>> = {
  sparkle: 0.75,
  droplet: 0.7,
  petal: 0.82,
  fluff: 0.5,
  crumb: 0.62,
  /* 퍼지는 물은 짧게 살아서 눈에 남는 시간이 적다. 그만큼 진해야 보인다 */
  splash: 0.85,
}

/** 반짝임만 빛을 더한다. 흩날리는 잎을 가산으로 그리면 색이 다 하얗게 뜬다 */
const ADDITIVE: Readonly<Record<Trail, boolean>> = {
  sparkle: true,
  droplet: false,
  petal: false,
  fluff: false,
  crumb: false,
  splash: false,
}

/**
 * 밝기를 맞춰 쓰는 갈래.
 *
 * 반짝임은 **빛**이라 짙은 물건이어도 밝게 나가야 한다(색번짐과 같은 이유로 밝기를
 * 맞춘다). 나머지는 물건의 색을 그대로 쓴다 — 흩날리는 단풍잎은 단풍잎 색이어야 하고,
 * 밝기를 맞추면 잎이 죄다 파스텔로 뜬다.
 */
const NORMALIZED: Readonly<Record<Trail, boolean>> = {
  sparkle: true,
  droplet: false,
  petal: false,
  fluff: false,
  crumb: false,
  /* 물은 담긴 것의 색이어야 한다 — 맥주는 노랗고 딸기우유는 분홍이다 */
  splash: false,
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

function trailPaint(particle: Particle, scale: number): TrailPaint {
  const base = NORMALIZED[particle.kind]
    ? glowColor(particle.color)
    : parseHex(particle.color)
  const alpha = PEAK[particle.kind] * fadeOf(particle) * scale
  const to255 = (value: number): number => Math.round(value * 255)
  return {
    style: `rgba(${to255(base.r)}, ${to255(base.g)}, ${to255(base.b)}, ${alpha})`,
    alpha,
    additive: ADDITIVE[particle.kind],
  }
}

export { trailPaint, fadeOf, PEAK, ADDITIVE, NORMALIZED }
export type { TrailPaint }
