import { expect, it } from 'vitest'
import { Jelly } from '../src/game/renderer/three/Jelly.ts'
import { ItemAssets } from '../src/game/renderer/three/ItemAssets.ts'
import { VARIANT_BY_ID } from '../src/game/data/words.ts'
import type { BodySnapshot } from '../src/game/types/game.ts'

const egg: BodySnapshot = { handle: 1, owner: 'gallery', variant: VARIANT_BY_ID.get('egg')!, x: 0, y: 1, rotation: 0, settled: true }
const hit = { handle: 1, id: 'egg', color: '#fff', x: 0, y: 1, strength: 1 }

it('preserves a flat artwork plane and its alpha-cut shadow material', () => {
  const assets = new ItemAssets()
  const model = assets.create(egg.variant, 'flat')
  try {
    expect(model.art.children).toHaveLength(1)
    const geometry = model.asset.face
    geometry.computeBoundingBox()
    expect(geometry.boundingBox!.max.z).toBe(0)
    expect(geometry.boundingBox!.min.z).toBe(0)
    expect(model.front.type).toBe('MeshBasicMaterial')
    expect(model.front.alphaTest).toBeGreaterThan(0)
    expect(model.art.children[0]!.castShadow).toBe(true)
  } finally { assets.release(model); assets.dispose() }
})

it('squashes only after impact, preserves area and stops exactly with simulation time', () => {
  const jelly = new Jelly()
  const before = JSON.stringify(egg)
  jelly.update(0, [egg], [])
  expect(jelly.scale(egg, 0, 1)).toEqual({ x: 1, y: 1 })
  jelly.update(0.1, [egg], [hit])
  jelly.update(0.16, [egg], [])
  const shape = jelly.scale(egg, 0.16, 1)
  expect(shape.y).toBeLessThan(1)
  expect(shape.x * shape.y).toBeCloseTo(1)
  jelly.update(0.16, [egg], [hit])
  expect(jelly.scale(egg, 0.16, 1)).toEqual(shape)
  expect(jelly.scale(egg, 0.16, 0)).toEqual({ x: 1, y: 1 })
  jelly.update(1.1, [egg], [])
  expect(jelly.scale(egg, 1.1, 1)).toEqual({ x: 1, y: 1 })
  expect(JSON.stringify(egg)).toBe(before)
})

it('does not transfer an old pulse to a reused handle or a restarted scene', () => {
  const jelly = new Jelly()
  jelly.update(1, [egg], [hit])
  const pan = { ...egg, variant: VARIANT_BY_ID.get('frying-pan')! }
  jelly.update(1.1, [pan], [])
  expect(jelly.scale(pan, 1.1, 1)).toEqual({ x: 1, y: 1 })
  jelly.update(2, [egg], [hit])
  jelly.update(0, [egg], [])
  expect(jelly.scale(egg, 0, 1)).toEqual({ x: 1, y: 1 })
})
