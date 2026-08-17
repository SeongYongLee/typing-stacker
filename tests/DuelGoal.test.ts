import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ARENA } from '../src/game/config.ts'

const CSS_WIDTH = 900
const CSS_HEIGHT = 700

function makeCanvas(): {
  canvas: HTMLCanvasElement
  texts: string[]
  dashes: number[][]
  strokeRects: number[]
} {
  const texts: string[] = []
  const dashes: number[][] = []
  const strokeRects: number[] = []
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: '',
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
    rect: () => {},
    clip: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    stroke: () => {},
    fill: () => {},
    strokeRect: () => strokeRects.push(1),
    fillRect: () => {},
    drawImage: () => {},
    roundRect: () => {},
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    setLineDash(value: number[]) {
      dashes.push([...value])
    },
    fillText(text: string) {
      texts.push(text)
    },
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: CSS_WIDTH, height: CSS_HEIGHT }),
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, texts, dashes, strokeRects }
}

let ArenaRenderer: typeof import('../src/game/renderer/ArenaRenderer.ts').ArenaRenderer

beforeEach(async () => {
  ;(globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 1 }
  ArenaRenderer = (await import('../src/game/renderer/ArenaRenderer.ts')).ArenaRenderer
})

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('대결 생존전', () => {
  it('골인선을 그리지 않고 각 타워의 이름만 보여준다', () => {
    const { canvas, texts, dashes, strokeRects } = makeCanvas()
    new ArenaRenderer(canvas).draw({
      bodies: [],
      aimX: 0,
      showAim: false,
      landing: null,
      nightfall: 0,
      cameraY: 0,
      stackTop: ARENA.platformTop,
      time: 0,
      impacts: [],
      ownerColors: null,
      duelTowers: [
        {
          id: 'a',
          nickname: '자두',
          mine: true,
          bodies: [],
          aimX: 0,
          showAim: false,
          cameraY: 0,
          stackTop: ARENA.platformTop,
          result: null,
          exitProgress: 0,
          ownerColors: null,
        },
        {
          id: 'b',
          nickname: '매실',
          mine: false,
          bodies: [],
          aimX: 0,
          showAim: false,
          cameraY: 0,
          stackTop: ARENA.platformTop,
          result: null,
          exitProgress: 0,
          ownerColors: null,
        },
      ],
    })

    expect(texts).not.toContain('골인')
    expect(dashes.filter((dash) => dash.join(',') === '12,7')).toHaveLength(0)
    expect(texts).toContain('자두 · 나')
    expect(texts).toContain('매실')
    expect(strokeRects).toHaveLength(0)
  })

  it('하트가 남은 마지막 참가자는 탈락이 아니라 생존으로 표시한다', () => {
    const { canvas, texts } = makeCanvas()
    new ArenaRenderer(canvas).draw({
      bodies: [],
      aimX: 0,
      showAim: false,
      landing: null,
      nightfall: 0,
      cameraY: 0,
      stackTop: ARENA.platformTop,
      time: 0,
      impacts: [],
      ownerColors: null,
      duelTowers: [{
        id: 'a',
        nickname: '자두',
        mine: true,
        bodies: [],
        aimX: 0,
        showAim: false,
        cameraY: 0,
        stackTop: ARENA.platformTop,
        lives: 2,
        result: { placement: 1, outcome: 'survived' },
        exitProgress: 0,
        ownerColors: null,
      }],
    })

    expect(texts).toContain('생존')
    expect(texts).not.toContain('탈락')
  })

  it('카운트다운 미리보기에서만 내 게임판 테두리를 그린다', () => {
    const { canvas, strokeRects } = makeCanvas()
    new ArenaRenderer(canvas).draw({
      bodies: [],
      aimX: 0,
      showAim: false,
      landing: null,
      nightfall: 0,
      cameraY: 0,
      stackTop: ARENA.platformTop,
      time: 0,
      impacts: [],
      ownerColors: null,
      duelTowers: [{
        id: 'a',
        nickname: '자두',
        mine: true,
        previewHighlight: true,
        bodies: [],
        aimX: 0,
        showAim: false,
        cameraY: 0,
        stackTop: ARENA.platformTop,
        result: null,
        exitProgress: 0,
        ownerColors: null,
      }],
    })

    expect(strokeRects).toHaveLength(1)
  })
})
