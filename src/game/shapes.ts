import { SPRITES, type SpriteName } from './data/sprites.generated.ts'
import type { PrimitiveShape, ShapeDef, Vec2 } from './types/game.ts'

interface Bounds {
  readonly hw: number
  readonly hh: number
}

function primitiveBounds(shape: PrimitiveShape): Bounds {
  switch (shape.kind) {
    case 'circle':
      return { hw: shape.radius, hh: shape.radius }
    case 'box':
      return { hw: shape.hw, hh: shape.hh }
    case 'capsule':
      return { hw: shape.radius, hh: shape.halfHeight + shape.radius }
    case 'polygon':
      return {
        hw: Math.max(...shape.points.map((point) => Math.abs(point.x))),
        hh: Math.max(...shape.points.map((point) => Math.abs(point.y))),
      }
  }
}

/**
 * 물건의 외접 사각형. 렌더러가 이 안에 그림(이모지)을 꽉 채워 넣기 때문에
 * 화면에 보이는 그림과 실제 충돌 도형이 어긋나지 않는다.
 */
function shapeBounds(shape: ShapeDef): Bounds {
  if (shape.kind !== 'compound') {
    return primitiveBounds(shape)
  }
  let hw = 0
  let hh = 0
  for (const part of shape.parts) {
    const bounds = primitiveBounds(part.shape)
    hw = Math.max(hw, Math.abs(part.offset.x) + bounds.hw)
    hh = Math.max(hh, Math.abs(part.offset.y) + bounds.hh)
  }
  return { hw, hh }
}

/** 중심에서 위쪽 끝까지의 거리. 높이 점수를 매길 때 쓴다. */
function halfExtentY(shape: ShapeDef): number {
  return shapeBounds(shape).hh
}

type SpriteSize = { readonly width: number } | { readonly height: number }

/** 큰 변 하나만 정하면 나머지는 그림의 원래 비율을 따른다 — 물건이 찌그러지지 않는다 */
function spriteBounds(name: SpriteName, size: SpriteSize): Bounds {
  const { aspect } = SPRITES[name]
  const width = 'width' in size ? size.width : size.height * aspect
  const height = 'width' in size ? size.width / aspect : size.height
  return { hw: width / 2, hh: height / 2 }
}

/**
 * 스티커의 실루엣을 볼록 조각들로 나눠둔 것을 월드 크기에 맞춰 compound로 만든다.
 *
 * 볼록껍질 하나로 감싸지 않는 이유는 비행기 날개 사이나 번개 지그재그 같은 오목한
 * 부분이 메워져 빈 공간에서 부딪히기 때문이다. 조각들은 원본 알파 마스크에서 뽑았고
 * 면적이 실루엣과 100% 일치하는 것을 파이프라인이 검증한다.
 */
function spriteShape(name: SpriteName, size: SpriteSize): ShapeDef {
  const { hw, hh } = spriteBounds(name, size)
  const parts = SPRITES[name].pieces.map((piece) => ({
    shape: {
      kind: 'polygon' as const,
      points: piece.map(([x, y]): Vec2 => ({ x: x * hw, y: y * hh })),
    },
    offset: { x: 0, y: 0 },
  }))
  return { kind: 'compound', parts }
}

/** 그리기용 실루엣 윤곽선 (닫힌 폴리곤) */
function spriteOutline(name: SpriteName, size: SpriteSize): Vec2[] {
  const { hw, hh } = spriteBounds(name, size)
  return SPRITES[name].outline.map(([x, y]) => ({ x: x * hw, y: y * hh }))
}

export {
  primitiveBounds,
  shapeBounds,
  halfExtentY,
  spriteShape,
  spriteBounds,
  spriteOutline,
}
export type { Bounds, SpriteSize }
