import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { updateDisplaySettings } from '../src/game/renderer/displayPrefs.ts'
import { GLOWING_IDS } from '../src/game/data/glowItems.ts'
import { TRAILS, trailOf, type Trail } from '../src/game/data/trails.ts'
import { ALL_VARIANTS } from '../src/game/data/words.ts'
import { fadeOf, grownBy, trailPaint } from '../src/game/renderer/trailPaint.ts'
import {
  FULL_SPEED,
  MAX_PARTICLES,
  MIN_SPEED,
  SPECS,
  SPLASH_COUNT,
  SPLASH_FAN,
  SPLASH_MIN_STRENGTH,
  STEAM_MAX,
  TrailField,
  type Particle,
  type TrailBody,
} from '../src/game/systems/TrailField.ts'

function body(id: string, x: number, y: number, settled = false): TrailBody {
  const variant = ALL_VARIANTS.find((item) => item.id === id)
  if (variant === undefined) throw new Error(`없는 물건: ${id}`)
  return {
    handle: 1,
    x,
    y,
    settled,
    variant: { id, color: variant.color, artBounds: variant.artBounds },
  }
}

/** 물건을 위에서 아래로 옮기며 프레임을 돌린다 */
function fall(field: TrailField, id: string, frames: number, speed = 4, settled = false): void {
  const dt = 1 / 60
  let y = 5
  // 첫 프레임은 지난 자리를 기억하는 데만 쓰인다 — 속도를 알 수 없으므로 흘리지 않는다
  field.update([body(id, 0, y, settled)], dt)
  for (let i = 0; i < frames; i += 1) {
    y -= speed * dt
    field.update([body(id, 0, y, settled)], dt)
  }
}

describe('꼬리 갈래 표', () => {
  /**
   * `splash`만 빼고 모든 갈래에 물건이 있어야 한다. 배정된 물건이 없는 갈래는
   * 표만 있고 화면에는 영영 안 나온다.
   *
   * `splash`는 예외다 — **움직이는 동안** 흘리는 것이 아니라 **부딪히는 순간** 터지는
   * 것이라 물건에 배정되지 않는다. 액체가 담긴 것(`droplet`)이 닿을 때 만들어진다.
   */
  it('splash 말고는 모든 갈래에 물건이 배정돼 있다', () => {
    const used = new Set(Object.values(TRAILS))
    for (const kind of Object.keys(SPECS) as Trail[]) {
      if (kind === 'splash') {
        expect(used.has(kind), 'splash는 물건에 배정되지 않는다').toBe(false)
        continue
      }
      expect(used.has(kind), kind).toBe(true)
    }
  })

  it('표의 id가 모두 실제로 있는 물건이다', () => {
    const known = new Set(ALL_VARIANTS.map((item) => item.id))
    const missing = Object.keys(TRAILS).filter((id) => !known.has(id))
    expect(missing, `없는 물건: ${missing.join(', ')}`).toEqual([])
  })

  /** 다 흘리면 화면이 늘 부스러기로 차서 아무 뜻이 없어진다 */
  it('대부분의 물건은 아무것도 흘리지 않는다', () => {
    const ratio = Object.keys(TRAILS).length / ALL_VARIANTS.length
    expect(ratio).toBeLessThan(0.5)
  })

  /** 같은 물건이 화면을 물들이고 또 반짝임을 흘려야 규칙이 두 번 강화된다 */
  it('반짝이는 것은 색번짐과 같은 물건들이다', () => {
    const sparkling = Object.entries(TRAILS)
      .filter(([, kind]) => kind === 'sparkle')
      .map(([id]) => id)
      .sort()
    expect(sparkling).toEqual([...GLOWING_IDS].sort())
  })

  it('갈래가 없는 물건은 null이다', () => {
    expect(trailOf('refrigerator')).toBeNull()
    expect(trailOf('bolt')).toBe('sparkle')
  })
})

describe('갈래마다 성질이 다르다', () => {
  /** 넷이 갈리지 않으면 갈래를 나눈 것이 눈에 보이지 않는다 */
  it('뿜는 양·수명·무게·흔들림이 서로 갈려 있다', () => {
    const specs = Object.values(SPECS)
    for (const key of ['rate', 'life', 'gravity'] as const) {
      const values = new Set(specs.map((spec) => spec[key]))
      expect(values.size, key).toBeGreaterThanOrEqual(4)
    }
  })

  /** 털이 방울보다 빨리 사라지면 "느리게 떠 있는 것"으로 보이지 않는다 */
  it('털이 가장 오래 남는다', () => {
    for (const kind of ['sparkle', 'droplet', 'crumb', 'petal'] as const) {
      expect(SPECS.fluff.life, kind).toBeGreaterThan(SPECS[kind].life)
    }
  })

  /**
   * 떨어지는 것들 사이에서는 털이 가장 가볍다. 반짝임은 아예 떨어지지 않는다 —
   * 뜬 자리에 남아 **물건이 지나간 길**을 그리는 것이 그 갈래의 일이다.
   */
  it('떨어지는 갈래 중 털이 가장 가볍고, 반짝임은 떨어지지 않는다', () => {
    expect(SPECS.sparkle.gravity).toBe(0)
    for (const kind of ['droplet', 'crumb', 'petal'] as const) {
      expect(SPECS.fluff.gravity, kind).toBeLessThan(SPECS[kind].gravity)
    }
  })

  /** 방울은 물건보다 빨리 떨어져 뒤로 처져야 "튀었다"로 보인다 */
  it('방울은 물건보다 무겁게 떨어진다', () => {
    expect(SPECS.droplet.gravity).toBeGreaterThan(1)
  })

  /** 흔들리며 내려오는 것은 잎과 털뿐이다 */
  it('흔들리는 갈래가 정해져 있다', () => {
    expect(SPECS.petal.sway).toBeGreaterThan(0)
    expect(SPECS.fluff.sway).toBeGreaterThan(0)
    expect(SPECS.sparkle.sway).toBe(0)
    expect(SPECS.droplet.sway).toBe(0)
  })
})

describe('부스러기를 흘린다', () => {
  it('빠르게 움직이면 흘린다', () => {
    const field = new TrailField()
    fall(field, 'bolt', 30)
    expect(field.particles.length).toBeGreaterThan(0)
  })

  /** 얹혀 있는 물건이 계속 반짝이면 쌓은 탑 전체가 지저분해진다 */
  it('자리를 잡은 물건은 흘리지 않는다', () => {
    const field = new TrailField()
    fall(field, 'bolt', 30, 4, true)
    expect(field.particles).toHaveLength(0)
  })

  it('거의 멈춰 있으면 흘리지 않는다', () => {
    const field = new TrailField()
    fall(field, 'bolt', 30, MIN_SPEED * 0.5)
    expect(field.particles).toHaveLength(0)
  })

  it('갈래가 없는 물건은 흘리지 않는다', () => {
    const field = new TrailField()
    fall(field, 'refrigerator', 30)
    expect(field.particles).toHaveLength(0)
  })

  it('빠를수록 많이 흘린다', () => {
    const slow = new TrailField()
    fall(slow, 'bolt', 30, MIN_SPEED * 1.5)
    const fast = new TrailField()
    fall(fast, 'bolt', 30, FULL_SPEED)
    expect(fast.particles.length).toBeGreaterThan(slow.particles.length)
  })

  /**
   * 매 프레임 내림하면 느린 갈래(초당 6개)는 한 프레임 몫이 0.1이라
   * 영영 하나도 안 나온다.
   */
  it('가장 느린 갈래도 결국 나온다', () => {
    const field = new TrailField()
    fall(field, 'quill-feather', 60)
    expect(field.particles.length).toBeGreaterThan(0)
  })

  it('시간이 지나면 사라진다', () => {
    const field = new TrailField()
    fall(field, 'bolt', 20)
    expect(field.particles.length).toBeGreaterThan(0)
    // 물건을 치우고 수명보다 길게 흘린다
    for (let i = 0; i < 200; i += 1) {
      field.update([], 1 / 60)
    }
    expect(field.particles).toHaveLength(0)
  })

  /** 탑이 무너지면 열 개가 동시에 흘린다. 그때 개수가 갑자기 뛰면 안 된다 */
  it('개수에 상한이 있다', () => {
    const field = new TrailField()
    const dt = 1 / 60
    let y = 40
    for (let frame = 0; frame < 400; frame += 1) {
      y -= 8 * dt
      const bodies = Object.keys(TRAILS).map((id, index) => ({
        ...body(id, index * 0.1, y),
        handle: index + 1,
      }))
      field.update(bodies, dt)
    }
    expect(field.particles.length).toBeLessThanOrEqual(MAX_PARTICLES)
  })

  /** 앞 판의 부스러기가 새 판 첫 프레임에 남아 있으면 안 된다 */
  it('판을 다시 시작하면 비워진다', () => {
    const field = new TrailField()
    fall(field, 'bolt', 30)
    field.reset()
    expect(field.particles).toHaveLength(0)
  })

  /** 탭이 가려졌다 돌아올 때 한 프레임에 몇 초가 밀려들면 한꺼번에 터진다 */
  it('한 프레임에 흐르는 시간에 상한이 있다', () => {
    const normal = new TrailField()
    fall(normal, 'bolt', 1)
    const jumped = new TrailField()
    jumped.update([body('bolt', 0, 5)], 1 / 60)
    jumped.update([body('bolt', 0, 4.9)], 30)
    expect(jumped.particles.length).toBeLessThanOrEqual(MAX_PARTICLES)
  })
})

describe('부스러기를 어떻게 칠하는가', () => {
  const particle = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 1,
    born: 1,
    size: 0.05,
    kind: 'sparkle' as Trail,
    color: '#f2d43c',
    phase: 0,
    angle: 0,
    spin: 1,
  }

  it('반짝임만 빛을 더한다', () => {
    expect(trailPaint({ ...particle, kind: 'sparkle' }, 1).additive).toBe(true)
    expect(trailPaint({ ...particle, kind: 'petal' }, 1).additive).toBe(false)
  })

  /**
   * 태어나자마자 최대 밝기면 부스러기가 아니라 점이 찍힌 것처럼 보인다.
   * 짧게 밝아졌다 사라져야 한다.
   */
  it('태어날 때 아주 짧게 밝아진다', () => {
    expect(fadeOf({ ...particle, life: 1 })).toBe(0)
    expect(fadeOf({ ...particle, life: 0.9 })).toBeGreaterThan(0)
    expect(fadeOf({ ...particle, life: 0.85 })).toBeGreaterThan(
      fadeOf({ ...particle, life: 0.98 }),
    )
  })

  it('수명이 끝나면 안 보인다', () => {
    expect(fadeOf({ ...particle, life: 0 })).toBe(0)
  })

  it('설정을 낮추면 옅어진다', () => {
    const alphaAt = (scale: number): number =>
      trailPaint({ ...particle, life: 0.5 }, scale).alpha
    expect(alphaAt(0)).toBe(0)
    expect(alphaAt(0.5)).toBeCloseTo(alphaAt(1) / 2, 6)
  })

  /**
   * 잎은 물건 색을 그대로 써야 한다. 밝기를 맞추면 단풍잎도 클로버도
   * 죄다 파스텔로 떠서 갈래 안의 특색이 사라진다.
   */
  it('반짝임만 밝기를 맞추고 나머지는 물건 색을 쓴다', () => {
    const dark = '#4a3a2a'
    const petal = trailPaint({ ...particle, kind: 'petal', color: dark, life: 0.5 }, 1)
    const sparkle = trailPaint({ ...particle, kind: 'sparkle', color: dark, life: 0.5 }, 1)
    expect(petal.style).toContain('74, 58, 42')
    expect(sparkle.style).not.toContain('74, 58, 42')
  })
})

/**
 * 부스러기가 실제로 캔버스에 닿는지 본다.
 *
 * 위의 검사들은 "점이 몇 개 생겼고 무슨 색인가"까지만 말한다. 그것이 그려지는지는
 * 렌더러를 돌려봐야 하고, 실기로 확인하기가 특히 어렵다 — 브라우저에서 픽셀을 세어봤더니
 * **물건 그림 자체가 부스러기보다 훨씬 크게 잡혀**(세탁기 하나가 5,752픽셀) 아무것도
 * 가려낼 수 없었다. 그래서 2D 컨텍스트를 흉내 내 무엇을 그렸는지 받아 적는다.
 */
describe('부스러기가 화면에 그려진다', () => {
  const CSS = { width: 1280, height: 800 }

  function makeCanvas(): { canvas: HTMLCanvasElement; ops: string[]; fills: number } {
    const ops: string[] = []
    const counted = { fills: 0 }
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      shadowBlur: 0,
      shadowColor: '',
      setTransform: () => {},
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => ops.push('moveTo'),
      lineTo: () => ops.push('lineTo'),
      arc: () => ops.push('arc'),
      ellipse: () => ops.push('ellipse'),
      quadraticCurveTo: () => ops.push('quadraticCurveTo'),
      stroke: () => {},
      fill: () => {
        counted.fills += 1
        ops.push('fill')
      },
      fillRect: () => {},
      setLineDash: () => {},
      strokeRect: () => {},
      drawImage: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      getBoundingClientRect: () => CSS,
    }
    return {
      canvas: canvas as unknown as HTMLCanvasElement,
      ops,
      get fills() {
        return counted.fills
      },
    }
  }

  const BASE = {
    aimX: 0,
    showAim: false,
    hiddenReveal: null,
    landing: null,
    quake: 0,
    quakePhase: 0,
    ownerColors: null,
    cameraY: 0,
    stackTop: 0.8,
    ledges: [],
    formingLedge: null,
    impacts: [],
  } as const

  let ArenaRenderer: typeof import('../src/game/renderer/ArenaRenderer.ts').ArenaRenderer

  beforeEach(async () => {
    ;(globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 2 }
    /*
     * 렌더러는 물건을 그리려고 스프라이트 캐시를 부르고, 캐시는 없는 그림을 `new Image()`로
     * 받아온다. node에는 그것이 없어서 물건마다 오류가 하나씩 새어 나온다 — 여기서 재는
     * 것은 부스러기이므로, 이미지는 **영영 로드되지 않는 것**으로 세워두면 된다.
     * 그러면 렌더러가 그림 대신 도형 색으로 칠하는 길을 타고 조용히 지나간다.
     */
    ;(globalThis as unknown as { Image: unknown }).Image = class {
      complete = false
      naturalWidth = 0
      src = ''
    }
    ArenaRenderer = (await import('../src/game/renderer/ArenaRenderer.ts')).ArenaRenderer
    updateDisplaySettings({ trail: 1 })
  })

  afterEach(() => {
    updateDisplaySettings({ trail: 1 })
    delete (globalThis as unknown as { window?: unknown }).window
    delete (globalThis as unknown as { Image?: unknown }).Image
  })

  /** 물건을 아래로 옮기며 프레임을 돌린다. 그린 원의 반지름들을 돌려준다 */
  function run(id: string, frames = 30): { ops: string[]; fills: number } {
    const shell = makeCanvas()
    const { canvas } = shell
    const renderer = new ArenaRenderer(canvas)
    const variant = ALL_VARIANTS.find((item) => item.id === id)
    if (variant === undefined) throw new Error(id)
    let y = 4
    let time = 0
    for (let i = 0; i < frames; i += 1) {
      renderer.draw({
        ...BASE,
        time,
        bodies: [
          {
            handle: 1,
            variant,
            owner: 'solo',
            x: 0,
            y,
            rotation: 0,
            settled: false,
          },
        ],
      })
      y -= 4 / 60
      time += 1 / 60
    }
    return { ops: shell.ops, fills: shell.fills }
  }

  /*
   * `fill()`은 받침대와 물건도 쓰고, 물건은 **볼록 조각마다** 한 번씩 부른다. 그래서
   * 서로 다른 물건끼리는 값을 견줄 수 없다(번개 377 대 냉장고 390 — 조각 수 차이다).
   * **같은 물건을 켜고 끄고** 비교해야 부스러기 몫만 남는다.
   */
  function fillsWith(id: string, trail: number): number {
    updateDisplaySettings({ trail })
    return run(id).fills
  }

  it('꼬리를 가진 물건이 떨어지면 더 그린다', () => {
    expect(fillsWith('bolt', 1)).toBeGreaterThan(fillsWith('bolt', 0))
  })

  /** 움직이는 점이 늘어나는 게 거슬리는 사람에게는 이것만으로 오래 못 하는 게임이 된다 */
  it('설정에서 끄면 아예 그리지 않는다', () => {
    expect(fillsWith('refrigerator', 1)).toBe(fillsWith('refrigerator', 0))
  })

  it('꼬리가 없는 물건은 설정을 켜도 달라지지 않는다', () => {
    expect(fillsWith('refrigerator', 1)).toBe(fillsWith('refrigerator', 0.5))
  })

  /**
   * 다섯 갈래를 전부 원으로 그렸을 때는 뿜는 양·수명·무게가 달라도 눈에는
   * **"색만 다른 동그라미"**로 보였다. 갈래를 나눈 값이 모양에서 가장 크게 드러난다.
   */
  it('별은 각진 모양으로 그린다 — 원이 아니다', () => {
    const { ops } = run('bolt')
    expect(ops).toContain('lineTo')
    expect(ops).not.toContain('arc')
  })

  it('잎은 뾰족한 곡선으로 그린다', () => {
    const { ops } = run('leaf')
    expect(ops).toContain('quadraticCurveTo')
    expect(ops).not.toContain('arc')
  })

  it('방울과 솜은 눌린 타원으로 그린다', () => {
    expect(run('beer').ops).toContain('ellipse')
    expect(run('quill-feather').ops).toContain('ellipse')
  })

  it('부스러기는 각진 조각으로 그린다', () => {
    const { ops } = run('broom')
    expect(ops).toContain('lineTo')
    expect(ops).not.toContain('ellipse')
  })

  /** 갈래마다 모양이 갈려야 "잎이 흩날린다"가 읽힌다 */
  it('갈래마다 쓰는 경로가 다르다', () => {
    const pathOf = (id: string): string =>
      [...new Set(run(id).ops.filter((op) => op !== 'fill' && op !== 'moveTo'))].sort().join('+')
    const shapes = new Set([
      pathOf('bolt'),
      pathOf('leaf'),
      pathOf('beer'),
      pathOf('broom'),
    ])
    expect(shapes.size).toBeGreaterThanOrEqual(3)
  })
})

/**
 * 부딪히는 순간 물이 퍼진다.
 *
 * 흘리는 부스러기와 성격이 다르다 — 저쪽은 **움직이는 동안** 계속 나오고 이쪽은
 * **한 순간**에 터진다. 그래서 부딪힘 판정을 렌더러가 스스로 하지 않고 물리가 이미
 * 갖고 있는 것(`IMPACT_MIN_SPEED`)을 넘겨받는다. 두 벌을 두면 조율한 문턱이 어긋난다.
 */
describe('닿으면 물이 퍼진다', () => {
  function hit(id: string, strength = 1) {
    const variant = ALL_VARIANTS.find((item) => item.id === id)
    if (variant === undefined) throw new Error(id)
    return { id, color: variant.color, x: 0, y: 1, strength }
  }

  it('액체가 담긴 것이 닿으면 터진다', () => {
    const field = new TrailField()
    field.update([], 1 / 60, [hit('beer')])
    expect(field.particles.length).toBeGreaterThan(0)
    expect(field.particles.every((p) => p.kind === 'splash')).toBe(true)
  })

  /** 모든 물건이 튀면 그것은 물이 아니라 그냥 착지 연출이다 */
  it('액체가 아닌 것은 안 터진다', () => {
    const field = new TrailField()
    field.update([], 1 / 60, [hit('bolt'), hit('leaf'), hit('refrigerator')])
    expect(field.particles).toHaveLength(0)
  })

  /** 살짝 얹히는 것까지 튀면 받침대가 늘 젖어 있다 */
  it('약하게 닿으면 안 터진다', () => {
    const field = new TrailField()
    field.update([], 1 / 60, [hit('beer', SPLASH_MIN_STRENGTH * 0.5)])
    expect(field.particles).toHaveLength(0)
  })

  it('세게 닿을수록 많이 터진다', () => {
    const weak = new TrailField()
    weak.update([], 1 / 60, [hit('beer', 0.3)])
    const strong = new TrailField()
    strong.update([], 1 / 60, [hit('beer', 1)])
    expect(strong.particles.length).toBeGreaterThan(weak.particles.length)
    expect(strong.particles.length).toBeLessThanOrEqual(SPLASH_COUNT)
  })

  /**
   * 바닥에 닿아 튄 물이 바닥을 뚫고 내려가면 안 된다.
   *
   * **태어나는 순간**을 본다(dt 0). 한 프레임이라도 흐르면 중력이 붙어 아래로
   * 내려가기 시작하는데, 그건 튄 물이 다시 떨어지는 것이라 맞는 동작이다.
   */
  it('태어날 때 아래로는 튀지 않는다', () => {
    const field = new TrailField()
    field.update([], 0, [hit('beer')])
    for (const particle of field.particles) {
      expect(particle.vy).toBeGreaterThanOrEqual(0)
    }
  })

  it('옆으로 퍼진다 — 한 점에서 위로만 솟지 않는다', () => {
    const field = new TrailField()
    field.update([], 0, [hit('beer')])
    const left = field.particles.filter((p) => p.vx < 0).length
    const right = field.particles.filter((p) => p.vx > 0).length
    expect(left).toBeGreaterThan(0)
    expect(right).toBeGreaterThan(0)
  })

  /** 담긴 것의 색이어야 한다 — 맥주는 노랗고 딸기우유는 분홍이다 */
  it('담긴 것의 색으로 퍼진다', () => {
    const beer = ALL_VARIANTS.find((item) => item.id === 'beer')
    const field = new TrailField()
    field.update([], 1 / 60, [hit('beer')])
    expect(field.particles[0]?.color).toBe(beer?.color)
  })

  /**
   * 시간이 안 흐른 프레임이 실제로 있다(판이 멈춰 있거나 화면이 처음 그려질 때).
   * 부딪힘은 사건이라 그런 프레임에서 흘려보내면 통째로 사라진다.
   */
  it('시간이 안 흘러도 터진다', () => {
    const field = new TrailField()
    field.update([], 0, [hit('beer')])
    expect(field.particles.length).toBeGreaterThan(0)
  })

  it('시간이 지나면 사라진다', () => {
    const field = new TrailField()
    field.update([], 1 / 60, [hit('beer')])
    for (let i = 0; i < 120; i += 1) {
      field.update([], 1 / 60)
    }
    expect(field.particles).toHaveLength(0)
  })
})

/**
 * 부채꼴로 솟는다.
 *
 * 처음에는 반원에 고르게 뿌리고 세로 성분을 절반으로 눌렀는데, 그러면 옆으로 흐르기만
 * 해서 "튀었다"가 아니라 "번졌다"로 보였다. 물이 튀는 것은 **중력 반대 방향**으로
 * 솟구쳤다가 되떨어지는 것이다.
 */
describe('물은 부채꼴로 솟는다', () => {
  function splash(): TrailField {
    const variant = ALL_VARIANTS.find((item) => item.id === 'beer')
    if (variant === undefined) throw new Error('beer')
    const field = new TrailField()
    field.update([], 0, [{ id: 'beer', color: variant.color, x: 0, y: 1, strength: 1 }])
    return field
  }

  it('전부 위로 솟는다', () => {
    for (const particle of splash().particles) {
      expect(particle.vy).toBeGreaterThan(0)
    }
  })

  /** 가운데가 가장 높이 솟아야 부채꼴로 보인다. 전부 같으면 폭발처럼 보인다 */
  it('가운데가 가장자리보다 높이 솟는다', () => {
    const particles = [...splash().particles]
    const middle = particles.filter((p) => Math.abs(p.vx) < 0.5)
    const edge = particles.filter((p) => Math.abs(p.vx) > 1.2)
    expect(middle.length).toBeGreaterThan(0)
    expect(edge.length).toBeGreaterThan(0)
    const mean = (list: typeof particles): number =>
      list.reduce((sum, p) => sum + p.vy, 0) / list.length
    expect(mean(middle)).toBeGreaterThan(mean(edge))
  })

  /** 좁으면 분수처럼 한 줄기로 솟고, 180도에 가까우면 바닥을 기는 물이 된다 */
  it('부채가 좌우로 벌어져 있다', () => {
    expect(SPLASH_FAN).toBeGreaterThan(1.2)
    expect(SPLASH_FAN).toBeLessThan(Math.PI)
    const particles = splash().particles
    expect(particles.some((p) => p.vx < -0.5)).toBe(true)
    expect(particles.some((p) => p.vx > 0.5)).toBe(true)
  })

  /** 솟았으면 되떨어져야 한다 — 중력이 맡는다 */
  it('솟았다가 되떨어진다', () => {
    const field = splash()
    const top = Math.max(...field.particles.map((p) => p.vy))
    for (let i = 0; i < 20; i += 1) {
      field.update([], 1 / 60)
    }
    const later = Math.max(...field.particles.map((p) => p.vy))
    expect(later).toBeLessThan(top)
  })
})

/**
 * 김은 조건이 반대다.
 *
 * 다른 갈래는 **움직이는 동안** 흘리고 정착하면 멈추는데, 김은 얹힌 **뒤에** 올라온다.
 * 떨어지는 동안 김이 나면 그건 김이 아니라 연기 꼬리다.
 */
describe('뜨거운 것은 얹힌 뒤 김을 낸다', () => {
  function steamFor(id: string, settled: boolean, frames = 60): TrailField {
    const field = new TrailField()
    for (let i = 0; i < frames; i += 1) {
      field.update([body(id, 0, 1, settled)], 1 / 60)
    }
    return field
  }

  it('정착하면 김이 오른다', () => {
    const field = steamFor('frying-pan', true)
    expect(field.particles.length).toBeGreaterThan(0)
    expect(field.particles.every((p) => p.kind === 'steam')).toBe(true)
  })

  /** 떨어지는 동안 김이 나면 그건 연기 꼬리다 */
  it('움직이는 동안에는 안 난다', () => {
    const field = new TrailField()
    let y = 5
    for (let i = 0; i < 60; i += 1) {
      y -= 4 / 60
      field.update([body('frying-pan', 0, y, false)], 1 / 60)
    }
    expect(field.particles).toHaveLength(0)
  })

  /** 김은 중력 반대로 오른다 */
  it('위로 오른다', () => {
    const field = steamFor('iron', true, 20)
    expect(field.particles.every((p) => p.vy > 0)).toBe(true)
    const before = field.particles.map((p) => p.y)
    for (let i = 0; i < 20; i += 1) {
      field.update([], 1 / 60)
    }
    const after = field.particles.map((p) => p.y)
    expect(Math.max(...after)).toBeGreaterThan(Math.max(...before))
  })

  /** 가운데에서 내면 김이 물건 속에서 솟아 나오는 것처럼 보인다 */
  it('물건 위에서 시작한다', () => {
    const pan = ALL_VARIANTS.find((item) => item.id === 'frying-pan')
    const field = steamFor('frying-pan', true, 10)
    for (const particle of field.particles) {
      expect(particle.y).toBeGreaterThan(1)
      expect(particle.y).toBeLessThanOrEqual(1 + (pan?.artBounds.hh ?? 0))
    }
  })

  /** 김은 물건 색을 쓰지 않는다 — 남색 프라이팬에서 남색 김이 오르면 안 보인다 */
  it('어느 물건에서 나든 같은 색이다', () => {
    const pan = steamFor('frying-pan', true, 20).particles[0]?.color
    const shirt = steamFor('burnt-hole-shirt', true, 20).particles[0]?.color
    expect(pan).toBeDefined()
    expect(pan).toBe(shirt)
    expect(pan).not.toBe(ALL_VARIANTS.find((i) => i.id === 'frying-pan')?.color)
  })

  /**
   * 상시 뿜는 유일한 갈래다. 전체 상한만 두면 뜨거운 물건이 몇 개 쌓였을 때
   * 김이 자리를 다 차지해 떨어지는 물건의 꼬리가 사라진다.
   */
  it('김만 따로 상한이 있다', () => {
    const field = new TrailField()
    const hot = ['frying-pan', 'fried-egg', 'iron', 'burnt-hole-shirt']
    for (let i = 0; i < 600; i += 1) {
      field.update(
        hot.map((id, index) => ({ ...body(id, index * 0.3, 1, true), handle: index + 1 })),
        1 / 60,
      )
    }
    const steam = field.particles.filter((p) => p.kind === 'steam').length
    expect(steam).toBeLessThanOrEqual(STEAM_MAX)
    expect(steam).toBeLessThan(MAX_PARTICLES)
  })

  /** 크기가 그대로면 위로 흐르는 점들이라 연기가 아니라 거품으로 보인다 */
  it('살면서 커진다', () => {
    const young = { life: 1, born: 1, kind: 'steam' as Trail } as Particle
    const old = { life: 0.1, born: 1, kind: 'steam' as Trail } as Particle
    expect(grownBy(old)).toBeGreaterThan(grownBy(young))
    expect(grownBy({ ...young, kind: 'petal' })).toBe(1)
  })
})
