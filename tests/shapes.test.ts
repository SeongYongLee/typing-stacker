import { describe, expect, it } from 'vitest'
import {
  halfExtentY,
  shapeBounds,
  spriteBounds,
  spriteShape,
} from '../src/game/shapes.ts'
import { SPRITES } from '../src/game/data/sprites.generated.ts'
import { WORDS } from '../src/game/data/words.ts'
import { AIM_HALF_RANGE, ARENA, MAX_ITEM_HALF_WIDTH } from '../src/game/config.ts'

describe('shapeBounds', () => {
  it('기본 도형별 외접 사각형', () => {
    expect(shapeBounds({ kind: 'circle', radius: 0.3 })).toEqual({ hw: 0.3, hh: 0.3 })
    expect(shapeBounds({ kind: 'box', hw: 0.4, hh: 0.15 })).toEqual({ hw: 0.4, hh: 0.15 })
    expect(shapeBounds({ kind: 'capsule', halfHeight: 0.3, radius: 0.1 })).toEqual({
      hw: 0.1,
      hh: 0.4,
    })
  })

  it('compound는 조각의 오프셋까지 감싼다', () => {
    const bounds = shapeBounds({
      kind: 'compound',
      parts: [
        { shape: { kind: 'box', hw: 0.05, hh: 0.26 }, offset: { x: 0, y: -0.13 } },
        { shape: { kind: 'box', hw: 0.19, hh: 0.1 }, offset: { x: 0, y: 0.27 } },
      ],
    })
    expect(bounds.hw).toBeCloseTo(0.19)
    // 손잡이가 0.13 + 0.26 = 0.39로 머리(0.27 + 0.1)보다 더 뻗는다.
    // 그림을 바디 원점 기준으로 그리므로 좌우/위아래 대칭인 상자로 감싼다.
    expect(bounds.hh).toBeCloseTo(0.39)
  })

  it('halfExtentY는 외접 사각형의 세로 반폭이다', () => {
    expect(halfExtentY({ kind: 'box', hw: 1, hh: 0.25 })).toBe(0.25)
  })
})

describe('spriteShape', () => {
  it('큰 변을 지정하면 나머지는 그림의 원래 비율을 따른다', () => {
    const bounds = spriteBounds('airplane', { width: 1 })
    expect(bounds.hw * 2).toBeCloseTo(1)
    expect((bounds.hw * 2) / (bounds.hh * 2)).toBeCloseTo(SPRITES.airplane.aspect, 4)
  })

  it('height로 지정해도 비율이 유지된다', () => {
    const bounds = spriteBounds('lightning', { height: 0.8 })
    expect(bounds.hh * 2).toBeCloseTo(0.8)
    expect((bounds.hw * 2) / (bounds.hh * 2)).toBeCloseTo(SPRITES.lightning.aspect, 4)
  })

  it('콜라이더는 그림 크기를 넘지 않는다 — 빈 공간에서 부딪히지 않아야 한다', () => {
    for (const name of Object.keys(SPRITES) as (keyof typeof SPRITES)[]) {
      const art = spriteBounds(name, { width: 1 })
      const collider = shapeBounds(spriteShape(name, { width: 1 }))
      expect(collider.hw, `${name} 가로`).toBeLessThanOrEqual(art.hw + 1e-6)
      expect(collider.hh, `${name} 세로`).toBeLessThanOrEqual(art.hh + 1e-6)
    }
  })

  it('모든 스프라이트의 실루엣 조각이 폴리곤으로 쓸 만하다', () => {
    for (const [name, meta] of Object.entries(SPRITES)) {
      expect(meta.aspect, `${name} 비율`).toBeGreaterThan(0)
      expect(meta.outline.length, `${name} 윤곽 점 개수`).toBeGreaterThanOrEqual(3)
      expect(meta.pieces.length, `${name} 조각 개수`).toBeGreaterThanOrEqual(1)
      for (const piece of meta.pieces) {
        expect(piece.length, `${name} 조각 점 개수`).toBeGreaterThanOrEqual(3)
        for (const [x, y] of piece) {
          expect(Math.abs(x), `${name} x 범위`).toBeLessThanOrEqual(1.001)
          expect(Math.abs(y), `${name} y 범위`).toBeLessThanOrEqual(1.001)
        }
      }
    }
  })

  it('조각들이 모두 볼록하다 — Rapier는 오목 폴리곤을 받지 못한다', () => {
    const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
      (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!)

    for (const [name, meta] of Object.entries(SPRITES)) {
      for (const [index, piece] of meta.pieces.entries()) {
        let sign = 0
        for (let i = 0; i < piece.length; i += 1) {
          const c = cross(
            piece[i]!,
            piece[(i + 1) % piece.length]!,
            piece[(i + 2) % piece.length]!,
          )
          if (Math.abs(c) < 1e-9) continue
          const s = c > 0 ? 1 : -1
          if (sign === 0) sign = s
          else expect(s, `${name} 조각 ${index}가 오목하다`).toBe(sign)
        }
      }
    }
  })

  it('스티커 물건은 실루엣 조각들로 된 compound다', () => {
    const shape = spriteShape('airplane', { width: 1 })
    expect(shape.kind).toBe('compound')
    if (shape.kind === 'compound') {
      expect(shape.parts.length).toBe(SPRITES.airplane.pieces.length)
      expect(shape.parts.length).toBeGreaterThan(1)
    }
  })
})

describe('물건 크기', () => {
  it('모든 변형이 받침대 위에 올라갈 수 있는 크기다', () => {
    for (const entry of WORDS) {
      for (const item of entry.variants) {
        const bounds = shapeBounds(item.shape)
        expect(
          bounds.hw * 2,
          `${item.id}가 받침대(${ARENA.platformHalfWidth * 2})보다 넓다`,
        ).toBeLessThan(ARENA.platformHalfWidth * 2)
        expect(bounds.hw, `${item.id}가 너무 작다`).toBeGreaterThan(0.02)
        expect(bounds.hh, `${item.id}가 너무 작다`).toBeGreaterThan(0.02)
      }
    }
  })

  it('가장 큰 물건도 MAX_ITEM_HALF_WIDTH를 넘지 않는다', () => {
    // 이게 깨지면 조준 양 끝에서 물건이 받침대 밖으로 걸쳐 즉사한다
    for (const entry of WORDS) {
      for (const item of entry.variants) {
        expect(shapeBounds(item.shape).hw, `${item.id}`).toBeLessThanOrEqual(
          MAX_ITEM_HALF_WIDTH,
        )
      }
    }
  })

  it('조준 양 끝에서 떨궈도 가장 큰 물건이 받침대 위에 온전히 얹힌다', () => {
    expect(AIM_HALF_RANGE + MAX_ITEM_HALF_WIDTH).toBeLessThanOrEqual(
      ARENA.platformHalfWidth,
    )
    expect(AIM_HALF_RANGE).toBeGreaterThan(0.5)
  })
})
