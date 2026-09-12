import { describe, expect, it } from 'vitest'
import { ALL_VARIANTS, VARIANT_BY_ID } from '../src/game/data/words.ts'
import { createItemGeometry, VOLUME_IDS } from '../src/game/renderer/three/itemGeometry.ts'
import { arenaProjection } from '../src/game/renderer/three/projection.ts'
import { ARENA, ARENA_SCREEN_MAX_WIDTH } from '../src/game/config.ts'

describe('3D visual geometry preserves gameplay silhouettes', () => {
  it('builds finite geometry and UVs for every existing item without expanding XY bounds', () => {
    for (const variant of ALL_VARIANTS) {
      const { body, face } = createItemGeometry(variant, 'sticker')
      for (const geometry of [body, face]) {
        const positions = geometry.getAttribute('position')
        let finite = true, maxX = 0, maxY = 0
        for (let i = 0; i < positions.count; i++) {
          finite &&= Number.isFinite(positions.getZ(i))
          maxX = Math.max(maxX, Math.abs(positions.getX(i)))
          maxY = Math.max(maxY, Math.abs(positions.getY(i)))
        }
        expect(finite, variant.id).toBe(true)
        expect(maxX, variant.id).toBeLessThanOrEqual(variant.artBounds.hw + 0.00001)
        expect(maxY, variant.id).toBeLessThanOrEqual(variant.artBounds.hh + 0.00001)
        geometry.dispose()
      }
      const uv = face.getAttribute('uv')
      expect([...uv.array].every(Number.isFinite)).toBe(true)
    }
  })

  it('gives the six representative items real surface depth without changing their data', () => {
    for (const id of VOLUME_IDS) {
      const variant = VARIANT_BY_ID.get(id)!
      const before = JSON.stringify(variant)
      const { body, face } = createItemGeometry(variant, 'volume')
      face.computeBoundingBox()
      const bounds = face.boundingBox!
      expect(bounds.max.z - bounds.min.z, id).toBeGreaterThan(0.02)
      expect(bounds.min.x).toBeGreaterThanOrEqual(-variant.artBounds.hw - 0.00001)
      expect(bounds.max.x).toBeLessThanOrEqual(variant.artBounds.hw + 0.00001)
      expect(JSON.stringify(variant)).toBe(before)
      body.dispose(); face.dispose()
    }
  })
})

describe('3D camera registration', () => {
  it('projects the same points as the original Canvas renderer at different sizes and camera heights', () => {
    for (const [width, height] of [[1440, 740], [1200, 520], [1920, 960]]) {
      for (const cameraY of [0, 2.4]) {
        const p = arenaProjection(width!, height!, cameraY)
        const scale = Math.min(Math.min(width!, ARENA_SCREEN_MAX_WIDTH) / (ARENA.halfWidth * 2), height! / (Math.max(ARENA.height, ARENA.spawnY + 0.8) - ARENA.killY - 0.18))
        for (const [x, y] of [[0, ARENA.platformTop], [-2, 4], [1.2, ARENA.spawnY]]) {
          expect(p.toScreenX(x!)).toBeCloseTo(width! / 2 + x! * scale)
          expect(p.toScreenY(y!)).toBeCloseTo(height! + 0.18 * scale - (y! - ARENA.killY - cameraY) * scale)
        }
      }
    }
  })
})
