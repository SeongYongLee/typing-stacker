import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ARENA } from '../src/game/config.ts'
import { DUEL_TARGET_STACK_TOP } from '../src/multi/MatchEngine.ts'

const CSS_WIDTH = 900
const CSS_HEIGHT = 700

function makeCanvas(): { canvas: HTMLCanvasElement; texts: string[]; dashes: number[][] } {
  const texts: string[] = []
  const dashes: number[][] = []
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
    strokeRect: () => {},
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
  return { canvas: canvas as unknown as HTMLCanvasElement, texts, dashes }
}

let ArenaRenderer: typeof import('../src/game/renderer/ArenaRenderer.ts').ArenaRenderer

beforeEach(async () => {
  ;(globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 1 }
  ArenaRenderer = (await import('../src/game/renderer/ArenaRenderer.ts')).ArenaRenderer
})

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('대결 골인선', () => {
  it('각 타워에 실제 승리 높이의 목표선을 그린다', () => {
    const { canvas, texts, dashes } = makeCanvas()
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
          bodies: [],
          aimX: 0,
          showAim: false,
          cameraY: 0,
          stackTop: ARENA.platformTop,
          goalY: DUEL_TARGET_STACK_TOP,
          ownerColors: null,
        },
        {
          id: 'b',
          bodies: [],
          aimX: 0,
          showAim: false,
          cameraY: 0,
          stackTop: ARENA.platformTop,
          goalY: DUEL_TARGET_STACK_TOP,
          ownerColors: null,
        },
      ],
    })

    expect(texts.filter((text) => text === '목표')).toHaveLength(2)
    expect(dashes.filter((dash) => dash.join(',') === '8,6')).toHaveLength(2)
  })
})
