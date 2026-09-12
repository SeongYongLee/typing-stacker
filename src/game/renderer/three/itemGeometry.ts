import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape, ShapeGeometry } from 'three'
import type { ItemVariant } from '../../types/game.ts'
import { itemOutlines } from '../itemOutlines.ts'

const VOLUME_IDS = new Set(['study-book', 'egg', 'frying-pan', 'soccer-ball', 'umbrella', 'fried-egg'])
type ItemStyle = 'flat' | 'sticker' | 'volume'
type Point = readonly [number, number]
function distanceToEdges(x: number, y: number, outlines: readonly (readonly Point[])[]): number {
  let nearest = Infinity
  for (const points of outlines) {
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!
      const b = points[(i + 1) % points.length]!
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
      nearest = Math.min(nearest, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy))
    }
  }
  return nearest
}

/** Preserve the XY outline while giving the front surface actual depth and normals. */
function createItemGeometry(variant: ItemVariant, style: ItemStyle): { body: BufferGeometry; face: BufferGeometry } {
  const outlines = itemOutlines(variant)
  const shapes = outlines.map((points) => {
    const shape = new Shape()
    points.forEach(([x, y], i) => i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y))
    shape.closePath()
    return shape
  })
  const volume = style === 'volume' && VOLUME_IDS.has(variant.id)
  const edgeDepth = volume ? 0.10 : 0.055
  const body = new ExtrudeGeometry(shapes, { depth: edgeDepth * 2, bevelEnabled: false, steps: 1 })
  body.translate(0, 0, -edgeDepth)
  const triangulated = new ShapeGeometry(shapes)
  const source = triangulated.index === null ? triangulated : triangulated.toNonIndexed()
  const positions: number[] = [], uvs: number[] = []
  const { hw, hh } = variant.artBounds
  const bump = variant.id === 'study-book' ? 0.035 : variant.id === 'frying-pan' ? 0.065 : Math.min(hw, hh) * 0.8
  const write = (p: Point) => {
    const edge = volume ? distanceToEdges(p[0], p[1], outlines) : 0
    const relief = volume ? bump * Math.sin(Math.min(1, edge / (Math.min(hw, hh) * 0.8)) * Math.PI / 2) : 0
    positions.push(p[0], p[1], edgeDepth + 0.001 + relief)
    uvs.push((p[0] / hw + 1) / 2, (p[1] / hh + 1) / 2)
  }
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const triangle = (a: Point, b: Point, c: Point, level: number) => {
    if (level === 0) { write(a); write(b); write(c); return }
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a)
    triangle(a, ab, ca, level - 1); triangle(ab, b, bc, level - 1)
    triangle(ca, bc, c, level - 1); triangle(ab, bc, ca, level - 1)
  }
  const vertices = source.getAttribute('position')
  for (let i = 0; i < vertices.count; i += 3) {
    const point = (n: number): Point => [vertices.getX(n), vertices.getY(n)]
    triangle(point(i), point(i + 1), point(i + 2), volume ? 3 : 0)
  }
  if (source !== triangulated) source.dispose()
  triangulated.dispose()
  const face = new BufferGeometry()
  face.setAttribute('position', new Float32BufferAttribute(positions, 3))
  face.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  face.computeVertexNormals()
  return { body, face }
}

export { createItemGeometry, itemOutlines, VOLUME_IDS }
export type { ItemStyle }
