import { describe, expect, it } from 'vitest'
import { Points, SpotLight } from 'three'
import { WindowLight3D, windowRoomBox, windowWorldPoint } from '../src/game/renderer/three/WindowLight3D.ts'
import { arenaProjection } from '../src/game/renderer/three/projection.ts'

describe('window light registration', () => {
  it('uses the same cover crop and bottom alignment as the room', () => {
    expect(windowRoomBox(1600, 800, 'bottom')).toEqual({ left: 0, top: 0, width: 1600, height: 800 })
    expect(windowRoomBox(1600, 600, 'bottom').top).toBe(-200)
    expect(windowRoomBox(1600, 600, 'center').top).toBe(-100)
    expect(windowRoomBox(400, 800, 'bottom').left).toBe(-600)
  })
  it.each([0, 0.14])('stays on the window through depth and camera movement (yaw %s)', yaw => {
    for (const cameraY of [0, 5]) for (const z of [-0.8, 0.65]) {
      const p = windowWorldPoint(123, 234, z, 1440, 800, cameraY, yaw)
      const projection = arenaProjection(1440, 800, cameraY, yaw)
      expect(720 + (p.x * Math.cos(yaw) - p.z * Math.sin(yaw)) * projection.scale).toBeCloseTo(123)
      expect(projection.toScreenY(p.y)).toBeCloseTo(234)
    }
  })
  it('freezes dust for reduced motion, changes moonlight, and reuses geometry', () => {
    const light = new WindowLight3D()
    const layout = { width: 1440, height: 900, offsetX: 0, offsetY: 0, alignment: 'bottom' as const }
    const dust = light.group.children.find(child => child instanceof Points) as Points
    const spot = light.group.children.find(child => child instanceof SpotLight) as SpotLight
    const geometry = dust.geometry
    light.update(1440, 800, 0, 0, layout, 0, 0, true, 2)
    const before = Array.from(geometry.getAttribute('position').array)
    const daylight = spot.color.clone()
    light.update(1440, 800, 0, 0, layout, 1, 100, true, 2)
    expect(Array.from(geometry.getAttribute('position').array)).toEqual(before)
    expect(spot.color.equals(daylight)).toBe(false)
    expect(geometry.getAttribute('position').count).toBe(48)
    light.update(1440, 800, 0, 0, layout, 1, 100, false, 2)
    expect(Array.from(geometry.getAttribute('position').array)).not.toEqual(before)
    expect(dust.geometry).toBe(geometry)
    expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
    let disposed = 0
    geometry.addEventListener('dispose', () => disposed++)
    light.dispose(); light.dispose()
    expect(disposed).toBe(1)
  })
})
