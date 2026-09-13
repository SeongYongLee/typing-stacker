import { Congestion3D } from './Congestion3D.ts'
import { recallExit } from './RecallExit.ts'
import { mergeLabelOffset } from './MergePresentation3D.ts'
import {
  BoxGeometry, Color, DirectionalLight, Group, HemisphereLight, Mesh,
  MeshStandardMaterial, OrthographicCamera, PCFSoftShadowMap, Scene, WebGLRenderer,
} from 'three'
import { ARENA, LEDGE } from '../../config.ts'
import type { ArenaRenderState } from '../ArenaRenderer.ts'
import type { ArenaRendererPort } from '../ArenaRendererPort.ts'
import { canvasPixelRatio } from '../canvasResolution.ts'
import { drawCatcher, catcherAlpha, catcherVisualOffset } from '../arenaPaint.ts'
import { shakeScale } from '../displayPrefs.ts'
import { compactCamera } from '../compactCamera.ts'
import { arenaProjection } from './projection.ts'
import { ItemAssets, type ItemModel } from './ItemAssets.ts'
import type { ItemStyle } from './itemGeometry.ts'
import { Effects3D } from './Effects3D.ts'
import { WindowLight3D, type WindowLightLayout } from './WindowLight3D.ts'
import { Jelly } from './Jelly.ts'
import { PrototypeOverlay } from './PrototypeOverlay.ts'

interface ThreeOptions {
  compact?: boolean
  style: ItemStyle
  yaw: number
  colliders: boolean
  backgroundAlignment?: 'center' | 'bottom'
  night: number | null
}

class Arena3DRenderer implements ArenaRendererPort {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly mergeScene = new Scene()
  private readonly world = new Group()
  private readonly camera = new OrthographicCamera(-4, 4, 5, -5, 0.1, 100)
  private readonly sky = new HemisphereLight('#fff4d6', '#6b5039', 2.3)
  private readonly sun = new DirectionalLight('#fff0cf', 3)
  private readonly alarm = new Congestion3D()
  private readonly windowLight = new WindowLight3D()
  private roomLayout: WindowLightLayout = { width: 1, height: 1, offsetX: 0, offsetY: 0, alignment: 'bottom' }
  private readonly assets = new ItemAssets()
  private readonly effects = new Effects3D(this.assets)
  private readonly models = new Map<number, ItemModel>()
  private readonly boxGeometry = new BoxGeometry(1, 1, 1)
  private readonly wood = new MeshStandardMaterial({ color: '#b97843', roughness: 0.75 })
  private readonly trim = new MeshStandardMaterial({ color: '#e7c99a', roughness: 0.65 })
  private readonly backing = new MeshStandardMaterial({ color: '#657b78', roughness: 0.9 })
  private readonly platform = new Group()
  private readonly ledges: Mesh[] = []
  private containerKey = ''
  private readonly overlay = new PrototypeOverlay()
  private readonly handCanvas: HTMLCanvasElement
  private readonly handCtx: CanvasRenderingContext2D
  private readonly ctx: CanvasRenderingContext2D
  private readonly canvas: HTMLCanvasElement
  private readonly overlayCanvas: HTMLCanvasElement
  private readonly options: ThreeOptions
  private width = 1
  private height = 1
  private dpr = 1
  private handVisible = false
  private disposed = false
  private jellyStrength = 0
  private readonly jelly = new Jelly()
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly dayColor = new Color('#fff0cf')
  private readonly nightColor = new Color('#9cb7ff')

  constructor(canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement, options: ThreeOptions) {
    const ctx = overlayCanvas.getContext('2d')
    if (ctx === null) throw new Error('연출 캔버스를 준비할 수 없습니다.')
    this.ctx = ctx; this.canvas = canvas; this.overlayCanvas = overlayCanvas; this.options = options
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setClearColor(0, 0)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.type = PCFSoftShadowMap
    this.sun.position.set(-3, 8, 6)
    this.sun.castShadow = true
    const shadowSize = options.compact ? 512 : 1024
    this.sun.shadow.mapSize.set(shadowSize, shadowSize)
    Object.assign(this.sun.shadow.camera, { left: -5, right: 5, top: 10, bottom: -3, near: 0.1, far: 30 })
    this.sun.shadow.bias = -0.001
    this.sun.shadow.normalBias = 0.015
    this.world.add(this.alarm.group, this.effects.group, this.sky, this.sun, this.sun.target, this.platform)
    this.scene.add(this.windowLight.group, this.world)
    this.mergeScene.add(this.effects.mergeGroup)
    this.renderer.info.autoReset = false
    // Hands sit behind WebGL artwork; the HUD remains on the front overlay.
    this.handCanvas = document.createElement('canvas')
    this.handCanvas.className = 'three-canvas three-hands'
    this.handCanvas.setAttribute('aria-hidden', 'true')
    const handCtx = this.handCanvas.getContext('2d')
    if (handCtx === null) throw new Error('회수 손 캔버스를 준비할 수 없습니다.')
    this.handCtx = handCtx
    canvas.before(this.handCanvas)
    this.resize()
  }

  setJelly(strength: number): void {
    this.jellyStrength = strength
  }

  resize(): void {
    if (this.disposed) return
    const rect = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height)
    const room = this.canvas.closest('[data-game-screen]')?.querySelector('[data-arena-room]')?.getBoundingClientRect()
      ?? this.canvas.parentElement?.querySelector('.three-gallery-background')?.getBoundingClientRect() ?? rect
    this.roomLayout = { width: room.width, height: room.height, offsetX: room.left - rect.left, offsetY: room.top - rect.top,
      alignment: this.options.backgroundAlignment ?? 'bottom' }
    this.dpr = canvasPixelRatio(this.width, this.height, this.options.compact ? Math.min(1.5, window.devicePixelRatio) : window.devicePixelRatio)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(this.width, this.height, false)
    this.overlayCanvas.width = Math.round(this.width * this.dpr)
    this.overlayCanvas.height = Math.round(this.height * this.dpr)
    this.handCanvas.width = this.overlayCanvas.width
    this.handCanvas.height = this.overlayCanvas.height
  }

  private block(parent: Group, x: number, y: number, z: number, width: number, height: number, depth: number, material = this.wood): Mesh {
    const mesh = new Mesh(this.boxGeometry, material)
    mesh.position.set(x, y, z); mesh.scale.set(width, height, depth)
    mesh.castShadow = true; mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  private updateContainer(state: ArenaRenderState): void {
    const halfWidth = state.container?.halfWidth ?? ARENA.platformHalfWidth
    const wallHeight = state.container?.wallHeight ?? 1.52
    const key = `${halfWidth}:${wallHeight}`
    if (key === this.containerKey) return
    this.containerKey = key
    this.platform.clear()
    this.block(this.platform, 0, ARENA.platformTop - ARENA.platformHalfHeight, 0, halfWidth * 2, ARENA.platformHalfHeight * 2, 0.9)
    // Back panel catches shadows. The front remains open so contact points stay readable.
    this.block(this.platform, 0, ARENA.platformTop + wallHeight / 2, -0.5, halfWidth * 2, wallHeight, 0.06, this.backing)
    for (const side of [-1, 1]) {
      this.block(this.platform, side * halfWidth, ARENA.platformTop + wallHeight / 2, 0, 0.15, wallHeight, 0.9, this.trim)
    }
    this.block(this.platform, 0, ARENA.platformTop - 0.15, 0.48, halfWidth * 2 + 0.12, 0.14, 0.06, this.trim)
    const flap = ARENA.bowlFlap
    for (const side of [-1, 1]) {
      const dx = flap.outerX - flap.innerX, dy = flap.outerY - flap.innerY
      const mesh = this.block(this.platform, side * (flap.innerX + flap.outerX) / 2,
        (flap.innerY + flap.outerY - flap.thickness) / 2, 0,
        Math.hypot(dx, dy), flap.thickness, 0.85)
      mesh.rotation.z = side * Math.atan2(dy, dx)
    }
  }

  draw(state: ArenaRenderState): void {
    if (this.disposed) return
    const { yaw, style, colliders } = this.options
    const night = this.options.night ?? state.nightfall ?? 0
    const projection = arenaProjection(this.width, this.height, state.cameraY, yaw, this.options.compact ? compactCamera(this.width, this.height, state.stackTop).scale : undefined)
    const { scale, centerY, halfWidth, halfHeight } = projection
    if (state.hiddenReveal != null) {
      const count = state.hiddenReveal.from.length
      // Reserve space for HUD above, source rows and caption below.
      const top = Math.min(this.height * 0.38, (this.options.compact ? 20 : 115) + (count >= 4 ? 0.82 : 0.4) * scale)
      const bottom = Math.max(top, this.height - (mergeLabelOffset(count) + 0.3) * scale)
      const desired = this.height * 0.34
      const screenY = Math.max(top, Math.min(bottom, desired))
      state = { ...state, hiddenReveal: { ...state.hiddenReveal,
        origin: { x: 0, y: projection.bottom + (this.height - screenY) / scale } } }
    }
    Object.assign(this.camera, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight })
    this.camera.position.set(Math.sin(yaw) * 20, centerY, Math.cos(yaw) * 20)
    this.camera.lookAt(0, centerY, 0)
    this.camera.updateProjectionMatrix()
    const shake = (state.quake ?? 0) * shakeScale()
    const phase = state.quakePhase ?? 0
    const dx = Math.sin(phase * 47) * shake
    const dy = -Math.cos(phase * 31) * shake * 0.7
    const focus = state.collapseFocus
    const zoom = focus == null ? 1 : 1 + Math.sin(Math.PI * Math.max(0, Math.min(1, focus.progress))) * 0.45
    let shadowDirty = this.sun.shadow.map === null || this.world.scale.x !== zoom ||
      this.world.position.x !== dx + (1 - zoom) * (focus?.x ?? 0) ||
      this.world.position.y !== dy + (1 - zoom) * (focus?.y ?? 0)
    this.world.scale.setScalar(zoom)
    this.world.position.set(dx + (1 - zoom) * (focus?.x ?? 0), dy + (1 - zoom) * (focus?.y ?? 0), 0)
    this.sky.intensity = 2.3 - night * 1.0
    this.sun.intensity = 3 - night * 1.1
    this.sun.color.copy(this.dayColor).lerp(this.nightColor, night)
    const previousContainer = this.containerKey
    this.updateContainer(state)
    shadowDirty ||= previousContainer !== this.containerKey
    const alarm = this.alarm.update(state.time, state.congestionLevel ?? 0,
      state.container?.halfWidth ?? ARENA.platformHalfWidth, state.container?.wallHeight ?? 1.52, this.reducedMotion.matches)
    this.trim.emissive.set('#b76028'); this.trim.emissiveIntensity = alarm * 0.7
    this.canvas.dataset.congestionAlarm = String(alarm)
    this.jelly.update(state.time, state.bodies, state.impacts)
    let maxSquash = 0
    const seen = new Set<number>()
    for (const body of state.bodies) {
      seen.add(body.handle)
      let model = this.models.get(body.handle)
      if (model !== undefined && model.variant.id !== body.variant.id) {
        this.assets.release(model); this.models.delete(body.handle); model = undefined
      }
      if (model === undefined) {
        shadowDirty = true
        model = this.assets.create(body.variant, style)
        this.models.set(body.handle, model); this.world.add(model.group)
      }
      const wasLoaded = model.asset.loaded
      this.assets.update(model)
      shadowDirty ||= wasLoaded !== model.asset.loaded
      const recalled = body.recalled === true && state.catcher != null
      const offset = recalled ? catcherVisualOffset(state.catcher!.x < 0 ? 'left' : 'right', this.options.compact) / scale : 0
      const stretch = this.jelly.scale(body, state.time, colliders || this.reducedMotion.matches ? 0 : this.jellyStrength)
      const bottomExtent = Math.abs(Math.cos(body.rotation)) * body.variant.artBounds.hh
        + Math.abs(Math.sin(body.rotation)) * body.variant.artBounds.hw
      const x = body.x + offset, y = body.y - bottomExtent * (1 - stretch.y)
      shadowDirty ||= model.group.position.x !== x || model.group.position.y !== y ||
        model.group.scale.x !== stretch.x || model.group.scale.y !== stretch.y ||
        model.art.rotation.z !== body.rotation || recalled
      model.group.position.set(x, y, 0)
      if (recalled) {
        const exit = recallExit(state.catcher!.progress, state.catcher!.x < 0 ? 'left' : 'right', scale, yaw, this.options.compact)
        model.group.position.x += exit.x; model.group.position.y += exit.y
      }
      model.group.scale.set(stretch.x, stretch.y, 1)
      model.art.rotation.set(0, 0, body.rotation)
      maxSquash = Math.max(maxSquash, Math.abs(1 - stretch.y))
      const opacity = recalled ? catcherAlpha(state.catcher!.progress) : 1
      for (const material of [model.side, model.front]) {
        material.transparent = opacity < 1; material.opacity = opacity
      }
    }
    for (const [handle, model] of this.models) {
      if (!seen.has(handle)) { shadowDirty = true; this.assets.release(model); this.models.delete(handle) }
    }
    const ledges = state.ledges ?? []
    shadowDirty ||= ledges.length > 0 || this.ledges.length > 0
    while (this.ledges.length > ledges.length) this.ledges.pop()!.removeFromParent()
    ledges.forEach((ledge, i) => {
      const mesh = this.ledges[i] ?? this.block(this.world, 0, 0, 0, 1, 1, 1)
      this.ledges[i] = mesh
      mesh.position.set(ledge.x, ledge.y - LEDGE.halfHeight, 0)
      mesh.scale.set(ledge.halfWidth * 2, LEDGE.halfHeight * 2, 0.65)
    })
    this.effects.update(state, scale, !this.reducedMotion.matches, yaw, this.options.compact)
    this.windowLight.update(this.width, this.height, state.cameraY, yaw, this.roomLayout, night, state.time, this.reducedMotion.matches, this.dpr, scale)
    this.renderer.shadowMap.needsUpdate = shadowDirty
    this.renderer.info.reset()
    this.renderer.render(this.scene, this.camera)
    if (state.hiddenReveal != null) {
      // Presentation is screen information: world depth must not hide its artwork.
      // Keep depth within the presentation so its sources and result still overlap naturally.
      this.renderer.autoClear = false
      this.renderer.clearDepth()
      this.renderer.render(this.mergeScene, this.camera)
      this.renderer.autoClear = true
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.ctx.clearRect(0, 0, this.width, this.height)
    this.overlay.drawMergeLabel({
      compact: this.options.compact, ctx: this.ctx, cssWidth: this.width, cssHeight: this.height, scale,
      cameraY: state.cameraY, nightfall: night,
      toScreenX: projection.toScreenX, toScreenY: projection.toScreenY,
    }, state)
    this.ctx.save()
    this.ctx.translate(dx * scale * Math.cos(yaw), -dy * scale)
    if (focus != null) {
      const fx = projection.toScreenX(focus.x), fy = projection.toScreenY(focus.y)
      this.ctx.translate(fx, fy); this.ctx.scale(zoom, zoom); this.ctx.translate(-fx, -fy)
    }
    // Filter the composited hand silhouette once, including the day/night blend.
    // CSS pixels keep the shadow consistent across device pixel ratios.
    if (state.catcher != null || this.handVisible) {
      const catcherProgress = state.catcher?.progress ?? 0
      const arrival = Math.max(0, Math.min(1, catcherProgress / 0.18, (1 - catcherProgress) / 0.22))
      const softness = 7 + (1 - arrival) * 9
      const offset = 7 + (1 - arrival) * 7
      const shadowAlpha = (0.12 + arrival * 0.13) * (1 - night * 0.25)
      this.handCanvas.style.filter = state.catcher == null ? 'none'
        : `drop-shadow(${offset}px ${offset * 1.3}px ${softness}px rgba(40, 34, 30, ${shadowAlpha}))`
      const hand = this.handCtx
      hand.setTransform(this.ctx.getTransform())
      // Clear in device coordinates, then restore the shared shake/zoom transform.
      hand.save(); hand.resetTransform(); hand.clearRect(0, 0, this.handCanvas.width, this.handCanvas.height); hand.restore()
      if (state.catcher != null) drawCatcher({
        compact: this.options.compact, ctx: hand, cssWidth: this.width, cssHeight: this.height, scale,
        cameraY: state.cameraY, nightfall: night,
        toScreenX: projection.toScreenX, toScreenY: projection.toScreenY,
      }, state.catcher)
      this.handVisible = state.catcher != null
    }
    this.overlay.draw({
      compact: this.options.compact, ctx: this.ctx, cssWidth: this.width, cssHeight: this.height, scale,
      cameraY: state.cameraY, nightfall: night,
      toScreenX: projection.toScreenX, toScreenY: projection.toScreenY,
    }, state, colliders)
    this.ctx.restore()
    // Dev diagnostics are sampled by the toolbar/browser checks, not React frame state.
    this.canvas.dataset.windowLight = '3d'
    this.canvas.dataset.windowNight = String(night)
    this.canvas.dataset.windowMotes = String(this.windowLight.moteCount)
    this.canvas.dataset.particleKinds = this.effects.particleKinds
    this.canvas.dataset.particles = String(this.effects.particleCount)
    this.canvas.dataset.jelly = String(maxSquash)
    this.canvas.dataset.bodies = String(this.models.size)
    this.canvas.dataset.geometries = String(this.renderer.info.memory.geometries)
    this.canvas.dataset.textures = String(this.renderer.info.memory.textures)
    this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls)
    this.canvas.dataset.ready = 'true'
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.handCanvas.remove()
    for (const model of this.models.values()) this.assets.release(model)
    this.models.clear(); this.windowLight.dispose(); this.alarm.dispose(); this.effects.dispose(); this.assets.dispose()
    this.boxGeometry.dispose(); this.wood.dispose(); this.trim.dispose(); this.backing.dispose()
    this.sun.shadow.map?.dispose()
    this.scene.clear()
    this.renderer.dispose()
    // StrictMode replays effects on the same canvas. Only lose a detached context.
    queueMicrotask(() => {
      if (!this.canvas.isConnected) this.renderer.forceContextLoss()
    })
    this.ctx.clearRect(0, 0, this.width, this.height)
  }
}

export { Arena3DRenderer }
export type { ThreeOptions }
