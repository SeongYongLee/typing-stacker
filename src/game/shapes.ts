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

function computeBounds(shape: ShapeDef): Bounds {
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

/**
 * 도형마다 한 번만 재고 기억한다.
 *
 * 도형은 만들어진 뒤 바뀌지 않는데(변형 테이블이 모듈 로드 때 한 번 만든다) 이 값은
 * **프레임마다 여러 번** 불린다 — `PhysicsWorld.stackTop()`이 쌓인 물건마다
 * `halfExtentY`를 부르고, 그 `stackTop()`이 한 프레임에 세 번 불린다(카메라·난이도·렌더).
 * 스티커는 볼록 조각이 평균 12개라 매번 조각을 다 훑는 값이 작지 않다.
 *
 * 실측으로 조각 10개 이상인 물건 12종을 훑는 것이 0.063ms였고 캐시 조회는 0.000ms다.
 * WeakMap이라 도형을 만들었다 버리는 쪽(테스트)에서도 새지 않는다.
 */
const boundsCache = new WeakMap<ShapeDef, Bounds>()

/**
 * 물건의 외접 사각형. 렌더러가 이 안에 그림을 꽉 채워 넣기 때문에
 * 화면에 보이는 그림과 실제 충돌 도형이 어긋나지 않는다.
 */
function shapeBounds(shape: ShapeDef): Bounds {
  const cached = boundsCache.get(shape)
  if (cached !== undefined) {
    return cached
  }
  const computed = computeBounds(shape)
  boundsCache.set(shape, computed)
  return computed
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
