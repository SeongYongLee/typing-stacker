import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { updateDisplaySettings } from '../src/game/renderer/displayPrefs.ts'
import { glowColor, glowStyle, glowAlpha } from '../src/game/renderer/glow.ts'

/**
 * 색이 실제로 화면에 깔리는지 본다.
 *
 * 순수 로직(`tests/glow.test.ts`)은 "이런 색을 이만큼 진하게"까지만 말한다. 그것이
 * 캔버스에 닿는지는 렌더러를 돌려봐야 알 수 있는데, **실기로 확인하기 가장 어려운
 * 부분이기도 하다** — 옅은 색이라 스크린샷으로도 눈에 잘 안 띈다.
 *
 * 그래서 2D 컨텍스트를 흉내 낸 것을 물려 무엇을 칠했는지 받아 적는다. 브라우저가
 * 없어도 되고, 연출을 손볼 때 "화면 전체를 덮는가"와 "가산 합성인가"가 조용히
 * 뒤집히는 것을 잡는다.
 */

interface FillRecord {
  readonly style: string
  readonly composite: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

const CSS_WIDTH = 1280
const CSS_HEIGHT = 800

function makeCanvas(): { canvas: HTMLCanvasElement; fills: FillRecord[] } {
  const fills: FillRecord[] = []
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
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    stroke: () => {},
    fill: () => {},
    setLineDash: () => {},
    strokeRect: () => {},
    drawImage: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({
        style: String(this.fillStyle),
        composite: String(this.globalCompositeOperation),
        x,
        y,
        w,
        h,
      })
    },
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: CSS_WIDTH, height: CSS_HEIGHT }),
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, fills }
}

/** 화면 전체를 덮는 칠. 배경으로 깔린 색은 이것뿐이다 */
function fullScreenFills(fills: readonly FillRecord[]): readonly FillRecord[] {
  return fills.filter(
    (fill) => fill.x === 0 && fill.y === 0 && fill.w === CSS_WIDTH && fill.h === CSS_HEIGHT,
  )
}

const BASE_STATE = {
  bodies: [],
  aimX: 0,
  showAim: false,
  hiddenReveal: null,
  quake: 0,
  quakePhase: 0,
  ownerColors: null,
  cameraY: 0,
  stackTop: 0.8,
  time: 0,
} as const

let ArenaRenderer: typeof import('../src/game/renderer/ArenaRenderer.ts').ArenaRenderer

beforeEach(async () => {
  // 렌더러가 생성될 때 dpr을 읽는다. node에는 window가 없으므로 최소한만 세워준다
  ;(globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 2 }
  ArenaRenderer = (await import('../src/game/renderer/ArenaRenderer.ts')).ArenaRenderer
  updateDisplaySettings({ glow: 1 })
})

afterEach(() => {
  updateDisplaySettings({ glow: 1 })
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('얹힘 색이 화면에 깔린다', () => {
  it('얹힌 것이 없으면 배경을 물들이지 않는다', () => {
    const { canvas, fills } = makeCanvas()
    new ArenaRenderer(canvas).draw({ ...BASE_STATE, landing: null })
    expect(fullScreenFills(fills)).toEqual([])
  })

  /**
   * 아레나 안쪽만 칠하면 "판 전체 분위기가 바뀐다"가 되지 않는다.
   * 캔버스가 레인 뒤까지 화면을 덮고 있으므로 이 한 번의 칠이 곧 배경이다.
   */
  it('화면 전체를 덮는다', () => {
    const { canvas, fills } = makeCanvas()
    new ArenaRenderer(canvas).draw({
      ...BASE_STATE,
      landing: { color: '#f2d43c', strength: 1, progress: 0 },
    })
    expect(fullScreenFills(fills)).toHaveLength(1)
  })

  /**
   * 보통 합성으로 덮으면 짙은 색이 배경을 **어둡게** 만들어 "무엇이 얹혔다"가 아니라
   * "화면이 꺼졌다"로 보인다. 빛을 더하는 쪽이어야 늘 같은 뜻으로 읽힌다.
   */
  it('빛을 더하는 합성으로 칠한다', () => {
    const { canvas, fills } = makeCanvas()
    new ArenaRenderer(canvas).draw({
      ...BASE_STATE,
      landing: { color: '#f2d43c', strength: 1, progress: 0 },
    })
    expect(fullScreenFills(fills)[0]?.composite).toBe('lighter')
  })

  it('물건의 색과 세기가 그대로 칠에 들어간다', () => {
    const { canvas, fills } = makeCanvas()
    new ArenaRenderer(canvas).draw({
      ...BASE_STATE,
      landing: { color: '#f2d43c', strength: 1, progress: 0 },
    })
    const expected = glowStyle(glowColor('#f2d43c'), glowAlpha(0, 1))
    expect(fullScreenFills(fills)[0]?.style).toBe(expected)
  })

  it('사라진 뒤에는 칠하지 않는다', () => {
    const { canvas, fills } = makeCanvas()
    new ArenaRenderer(canvas).draw({
      ...BASE_STATE,
      landing: { color: '#f2d43c', strength: 1, progress: 1 },
    })
    expect(fullScreenFills(fills)).toEqual([])
  })

  /**
   * 색이 번지는 화면이 눈에 피로한 사람에게는 이것만으로 오래 못 하는 게임이 된다.
   * 흔들림과 같은 이유로 끄는 길이 있어야 하고, 껐으면 **아예 그리지 않아야** 한다.
   */
  it('설정에서 끄면 아예 그리지 않는다', () => {
    updateDisplaySettings({ glow: 0 })
    const { canvas, fills } = makeCanvas()
    new ArenaRenderer(canvas).draw({
      ...BASE_STATE,
      landing: { color: '#f2d43c', strength: 1, progress: 0 },
    })
    expect(fullScreenFills(fills)).toEqual([])
  })

  it('약하게로 두면 옅어진다', () => {
    const full = (() => {
      const { canvas, fills } = makeCanvas()
      new ArenaRenderer(canvas).draw({
        ...BASE_STATE,
        landing: { color: '#f2d43c', strength: 1, progress: 0 },
      })
      return fullScreenFills(fills)[0]?.style ?? ''
    })()
    updateDisplaySettings({ glow: 0.5 })
    const half = (() => {
      const { canvas, fills } = makeCanvas()
      new ArenaRenderer(canvas).draw({
        ...BASE_STATE,
        landing: { color: '#f2d43c', strength: 1, progress: 0 },
      })
      return fullScreenFills(fills)[0]?.style ?? ''
    })()
    const alphaOf = (style: string): number => Number(/,\s*([\d.]+)\)$/.exec(style)?.[1] ?? 0)
    expect(alphaOf(half)).toBeCloseTo(alphaOf(full) / 2, 5)
  })
})
