import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GallerySimulation } from '../src/dev/GallerySimulation.ts'
import { FrameClock } from './helpers/frameClock.ts'

const clock = new FrameClock()
beforeEach(() => clock.install())
afterEach(() => clock.uninstall())
const renderer = () => ({ draw: vi.fn(), resize: vi.fn(), dispose: vi.fn() })

it('drops the six display items into the real tray and can reset the comparison', async () => {
  const tray = await GallerySimulation.create()
  try {
    tray.attachRenderer(renderer())
    expect(tray.snapshot().bodies).toHaveLength(6)
    tray.dropAll()
    const originalHeight = tray.snapshot().bodies[0]!.y
    await clock.advance(0.5)
    expect(tray.snapshot().bodies[0]!.y).toBeLessThan(originalHeight)
    await clock.advance(5)
    expect(tray.snapshot().bodies.some((body) => body.settled)).toBe(true)
    tray.clear()
    expect(tray.snapshot().bodies).toHaveLength(0)
    tray.arrange()
    expect(tray.snapshot().bodies).toHaveLength(6)
    expect(tray.snapshot().time).toBe(0)
  } finally { tray.dispose() }
})

it('keeps the paused physical state through renderer replacement and resumes falling', async () => {
  const tray = await GallerySimulation.create()
  try {
    const first = renderer()
    tray.attachRenderer(first)
    tray.drop('egg', 1.2)
    expect(tray.snapshot().bodies).toHaveLength(1)
    expect(tray.snapshot().bodies[0]!.x).toBeCloseTo(1.2)
    await clock.advance(0.3)
    tray.setPaused(true)
    const before = JSON.stringify(tray.snapshot())
    tray.attachRenderer(renderer())
    await clock.advance(1)
    expect(JSON.stringify(tray.snapshot())).toBe(before)
    expect(first.dispose).toHaveBeenCalledOnce()
    tray.setPaused(false)
    await clock.advance(0.3)
    expect(JSON.stringify(tray.snapshot())).not.toBe(before)
  } finally { tray.dispose() }
})

it('previews merge and recall without changing items, and freezes a paused preview', async () => {
  const tray = await GallerySimulation.create()
  try {
    tray.attachRenderer(renderer())
    const bodies = tray.snapshot().bodies
    tray.previewEffect('merge')
    await clock.advance(1)
    expect(tray.snapshot().hiddenReveal?.progress).toBeGreaterThan(0)
    expect(tray.snapshot().bodies).toEqual(bodies)
    tray.setPaused(true)
    const paused = tray.snapshot()
    await clock.advance(1)
    expect(tray.snapshot()).toEqual(paused)
    tray.previewEffect('recall')
    await clock.advance(1)
    expect(tray.snapshot().whiteboardRecall?.progress).toBeGreaterThan(0)
    expect(tray.snapshot().hiddenReveal).toBeNull()
    await clock.advance(3)
    expect(tray.snapshot().whiteboardRecall).toBeNull()
    expect(tray.snapshot().bodies).toEqual(bodies)
  } finally { tray.dispose() }
})


it('accepts expanded items and bounded catalog batches, rejecting unknown IDs without clearing', async () => {
  const tray = await GallerySimulation.create()
  try {
    tray.attachRenderer(renderer())
    const before = tray.snapshot()
    tray.drop('missing-item', 0)
    expect(tray.snapshot()).toEqual(before)
    tray.drop('sunflower', 0)
    expect(tray.snapshot().bodies[0]!.variant.id).toBe('sunflower')
    tray.dropAll(['laptop', 'bubble-bottle', 'magic-wand', 'leaf', 'biscuit', 'snowflake', 'sunflower', 'laptop', 'missing-item'])
    expect(tray.snapshot().bodies.map((body) => body.variant.id)).toEqual(['laptop', 'bubble-bottle', 'magic-wand', 'leaf', 'biscuit', 'snowflake'])
    const batch = tray.snapshot()
    tray.dropAll(['missing-item'])
    expect(tray.snapshot()).toEqual(batch)
    tray.previewEffect('recall', 'sunflower')
    await clock.advance(0.3)
    expect(tray.snapshot().whiteboardRecall?.sprite).toContain('sunflower')
    expect(tray.snapshot().bodies).toHaveLength(6)
  } finally { tray.dispose() }
})
