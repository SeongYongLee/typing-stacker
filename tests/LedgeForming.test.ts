import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * 뭉쳐지던 통나무가 **자기가 앉은 그 자리에** 선다.
 *
 * 연출과 실제 통나무는 그리는 곳이 다르다(`drawFormingLedge` / `drawLedges`). 둘이
 * 같은 자리를 가리키는지는 **그려진 사각형을 나란히 놓고 비교해야** 알 수 있는데,
 * 어긋나도 물리는 멀쩡하므로 시험이 없으면 눈으로만 잡힌다.
 *
 * 실제로 어긋나 있었다. 연출은 그림을 `(cx, cy)`를 **중심으로** 그리는데 도착점을
 * 통나무의 **윗면**(`forming.y`)으로 잡아, 다 앉는 순간 그림 높이의 절반만큼 툭
 * 내려앉았다.
 *
 * 2D 컨텍스트를 흉내 낸 것을 물려 `drawImage`의 사각형을 받아 적는다 —
 * `tests/ArenaGlow.test.ts`·`tests/HiddenTagPadding.test.ts`와 같은 방식이다.
 */

interface DrawRecord {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly alpha: number
}

const CSS_WIDTH = 1280
const CSS_HEIGHT = 800

function makeCanvas(): { canvas: HTMLCanvasElement; draws: DrawRecord[] } {
  const draws: DrawRecord[] = []
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
    ellipse: () => {},
    roundRect: () => {},
    stroke: () => {},
    fill: () => {},
    setLineDash: () => {},
    strokeRect: () => {},
    fillText: () => {},
    measureText: (text: string) => ({ width: text.length * 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    /*
     * node에는 그림이 없어 `sprite()`가 null을 돌려주고, 두 그리기 모두 **대체
     * 사각형**으로 떨어진다. 그 사각형이 그림과 같은 자리·같은 크기라 이 시험이
     * 보려는 것은 그대로 볼 수 있다. 그림 경로도 함께 받아 적어 둘 중 어느 쪽이든
     * 잡히게 한다.
     */
    fillRect(x: number, y: number, w: number, h: number) {
      draws.push({ x, y, w, h, alpha: Number(this.globalAlpha) })
    },
    drawImage(_image: unknown, x: number, y: number, w: number, h: number) {
      draws.push({ x, y, w, h, alpha: Number(this.globalAlpha) })
    },
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: CSS_WIDTH, height: CSS_HEIGHT }),
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, draws }
}

const BASE_STATE = {
  bodies: [],
  aimX: 0,
  showAim: false,
  hiddenReveal: null,
  landing: null,
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

const SPOT = { x: 0.9, y: 1.4, halfWidth: 0.4 } as const

let ArenaRenderer: typeof import('../src/game/renderer/ArenaRenderer.ts').ArenaRenderer

beforeEach(async () => {
  ;(globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 2 }
  ArenaRenderer = (await import('../src/game/renderer/ArenaRenderer.ts')).ArenaRenderer
})

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

const key = (d: DrawRecord): string => `${d.x}|${d.y}|${d.w}|${d.h}`

/**
 * 통나무가 하나도 없는 판을 그려 **배경·받침대의 사각형 목록**을 얻는다.
 *
 * 그 목록에 없는 것이 통나무다. 두 판을 서로 견주면 안 된다 — 자리가 **같아졌을 때**
 * 남는 것이 없어져서, 고쳐진 것을 실패로 잡는다(실제로 그렇게 한 번 헛짚었다).
 */
function baseline(): readonly DrawRecord[] {
  const plain = makeCanvas()
  new ArenaRenderer(plain.canvas).draw({ ...BASE_STATE })
  return plain.draws
}

/** 기준 판에 없는 사각형 — 통나무다 */
function ledgeOf(draws: readonly DrawRecord[]): DrawRecord | undefined {
  const common = new Set(baseline().map(key))
  return draws.find((d) => !common.has(key(d)))
}

describe('통나무가 앉은 자리에 선다', () => {
  it('연출이 끝나는 사각형과 실제로 서는 사각형이 같다', () => {
    const forming = makeCanvas()
    new ArenaRenderer(forming.canvas).draw({
      ...BASE_STATE,
      // progress 1 = 다 앉은 순간
      formingLedge: { ...SPOT, progress: 1 },
    })
    const settled = makeCanvas()
    new ArenaRenderer(settled.canvas).draw({ ...BASE_STATE, ledges: [SPOT] })

    const a = ledgeOf(forming.draws)
    const b = ledgeOf(settled.draws)
    expect(a, '연출이 그림을 그려야 한다').toBeDefined()
    expect(b, '통나무가 그려져야 한다').toBeDefined()
    if (a === undefined || b === undefined) {
      return
    }

    expect(a.x, `가로 자리가 어긋난다 (연출 ${a.x} · 실제 ${b.x})`).toBeCloseTo(b.x, 3)
    expect(a.y, `세로 자리가 어긋난다 (연출 ${a.y} · 실제 ${b.y})`).toBeCloseTo(b.y, 3)
    expect(a.w).toBeCloseTo(b.w, 3)
    expect(a.h).toBeCloseTo(b.h, 3)
  })

  /**
   * 시작은 히든 연출이 뜨는 자리(아레나 위쪽)라 도착점보다 위여야 한다. 이것이
   * 뒤집히면 "모여서 앉는다"가 아니라 "솟아오른다"가 된다.
   */
  it('출발은 도착보다 위에서 시작한다', () => {
    const start = makeCanvas()
    new ArenaRenderer(start.canvas).draw({
      ...BASE_STATE,
      formingLedge: { ...SPOT, progress: 0 },
    })
    const end = makeCanvas()
    new ArenaRenderer(end.canvas).draw({
      ...BASE_STATE,
      formingLedge: { ...SPOT, progress: 1 },
    })

    const a = ledgeOf(start.draws)
    const b = ledgeOf(end.draws)
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    // 화면 좌표는 아래로 +
    expect(a?.y ?? 0).toBeLessThan(b?.y ?? 0)
  })
})
