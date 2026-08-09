import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * 히든·합성 쪽지의 **네 변 여백이 같은지** 본다.
 *
 * 눈으로 확인하기 어려운 종류의 값이다. 스크린샷에서 재보려 했더니 방 그림에도
 * 아레나에도 크림색이 여럿이라(메모지·피자 상자·받침대) 쪽지만 골라낼 수가 없었다.
 * 그래서 2D 컨텍스트를 흉내 낸 것을 물려 **판과 글자가 어디에 그려졌는지 받아 적고**
 * 그 둘의 차를 잰다 — `tests/ArenaGlow.test.ts`와 같은 방식이다.
 *
 * 한때 변마다 따로 적혀 있어서 좌우 0.80 · 위 0.45 · 아래 0.74(labelSize 기준)로
 * 어긋나 있었다. 이런 어긋남은 글자 크기를 만질 때마다 조용히 되살아난다.
 */

interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

interface TextRecord {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly size: number
}

const CSS_WIDTH = 1280
const CSS_HEIGHT = 800
/** 글자 하나가 이만큼 넓다고 치고 잰다. 실제 폭이 아니라 **일관되기만** 하면 된다 */
const CHAR_WIDTH = 20

function fontSize(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font)
  return match?.[1] === undefined ? 0 : Number(match[1])
}

function makeCanvas(): {
  canvas: HTMLCanvasElement
  rounds: Rect[]
  texts: TextRecord[]
} {
  const rounds: Rect[] = []
  const texts: TextRecord[] = []
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
    fillRect: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    measureText: (text: string) => ({ width: text.length * CHAR_WIDTH }),
    roundRect(x: number, y: number, w: number, h: number) {
      rounds.push({ x, y, w, h })
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, size: fontSize(String(this.font)) })
    },
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: CSS_WIDTH, height: CSS_HEIGHT }),
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, rounds, texts }
}

const BASE_STATE = {
  bodies: [],
  aimX: 0,
  showAim: false,
  hiddenReveal: null,
  quake: 0,
  quakePhase: 0,
  ownerColors: null,
  pairMarks: new Map(),
  pairPulse: 1,
  cameraY: 0,
  stackTop: 0.8,
  nightfall: 0,
  ledges: [],
  formingLedge: null,
  time: 0,
  impacts: [],
} as const

let ArenaRenderer: typeof import('../src/game/renderer/ArenaRenderer.ts').ArenaRenderer

beforeEach(async () => {
  ;(globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 2 }
  ArenaRenderer = (await import('../src/game/renderer/ArenaRenderer.ts')).ArenaRenderer
})

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

/**
 * 쪽지를 한 번 그리고 판·글자의 자리를 돌려준다.
 *
 * `progress`는 재료가 다 모이고 결과물이 자리를 잡은 뒤여야 한다 — 그 전에는
 * 판을 아예 그리지 않는다(모이는 장면만 나온다).
 */
function drawTag(label: string, from: readonly string[]) {
  const { canvas, rounds, texts } = makeCanvas()
  new ArenaRenderer(canvas).draw({
    ...BASE_STATE,
    landing: null,
    hiddenReveal: { label, sprite: 'none', from, progress: 0.5 },
  })
  const plate = rounds[rounds.length - 1]
  const labelText = texts.find((item) => item.text === label)
  const tagText = texts.find((item) => item.text !== label)
  return { plate, labelText, tagText }
}

describe('히든 쪽지의 여백', () => {
  /**
   * 글자가 차지하는 칸은 `textBaseline = 'middle'` 기준이라 각 줄의 위아래로 제 글자
   * 크기의 절반씩이다. 판은 그 칸에서 사방 같은 거리에 있어야 한다.
   */
  for (const [name, label, from] of [
    ['운으로 만난 히든', '피자 한 판', []],
    ['합성으로 얻은 것', '곰돌이 오므라이스', ['pizza', 'egg']],
    ['짧은 이름', '달', []],
  ] as const) {
    it(`${name} — 네 변이 같다`, () => {
      const { plate, labelText, tagText } = drawTag(label, from)
      expect(plate, '판이 그려져야 한다').toBeDefined()
      expect(labelText, '이름이 적혀야 한다').toBeDefined()
      expect(tagText, '갈래(합성/HIDDEN)가 적혀야 한다').toBeDefined()
      if (plate === undefined || labelText === undefined || tagText === undefined) {
        return
      }

      /* 판이 글자보다 넓을 수 있다 — 짧은 이름에는 최소 너비가 걸린다 */
      const textWidth = Math.max(label.length * CHAR_WIDTH, tagText.size * 5)
      const gaps = {
        좌: labelText.x - textWidth / 2 - plate.x,
        우: plate.x + plate.w - (labelText.x + textWidth / 2),
        위: labelText.y - labelText.size / 2 - plate.y,
        아래: plate.y + plate.h - (tagText.y + tagText.size / 2),
      }

      const values = Object.values(gaps)
      const spread = Math.max(...values) - Math.min(...values)
      expect(spread, `여백이 어긋난다: ${JSON.stringify(gaps)}`).toBeLessThan(0.5)
      expect(Math.min(...values), '여백이 0이면 글자가 종이 끝에 붙는다').toBeGreaterThan(0)
    })
  }

  /** 이름이 길어져도 좌우만 늘어나고 위아래는 그대로여야 한다 */
  it('이름 길이가 위아래 여백을 바꾸지 않는다', () => {
    const short = drawTag('달', [])
    const long = drawTag('아주 긴 이름의 물건', [])
    expect(short.plate?.h).toBeCloseTo(long.plate?.h ?? -1, 5)
    expect(long.plate?.w ?? 0).toBeGreaterThan(short.plate?.w ?? 0)
  })
})
