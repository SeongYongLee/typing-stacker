import { BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Texture } from 'three'
import type { ItemVariant } from '../../types/game.ts'
import { sprite } from '../spriteCache.ts'
import { createItemGeometry, type ItemStyle } from './itemGeometry.ts'

interface Asset {
  body: BufferGeometry
  face: BufferGeometry
  texture: Texture
  src: string
  loaded: boolean
}
interface ItemModel {
  group: Group
  art: Group
  side: MeshStandardMaterial
  front: MeshStandardMaterial | MeshBasicMaterial
  asset: Asset
  variant: ItemVariant
}

class ItemAssets {
  private readonly cache = new Map<string, Asset>()

  create(variant: ItemVariant, style: ItemStyle): ItemModel {
    const key = `${style}:${variant.id}`
    let asset = this.cache.get(key)
    if (asset === undefined) {
      const texture = new Texture()
      texture.colorSpace = SRGBColorSpace
      const geometry = style === 'flat'
        ? { body: new BufferGeometry(), face: new PlaneGeometry(variant.artBounds.hw * 2, variant.artBounds.hh * 2) }
        : createItemGeometry(variant, style)
      asset = { ...geometry, texture, src: variant.sprite, loaded: false }
      this.cache.set(key, asset)
    }
    const metalness = variant.material === 'metal' ? 0.35 : 0
    const side = new MeshStandardMaterial({ color: variant.color, roughness: 0.45, metalness })
    // Unlit artwork keeps its original colors. Alpha testing also cuts the cast shadow.
    const front = style === 'flat'
      ? new MeshBasicMaterial({ color: variant.color, alphaTest: 0.08, side: DoubleSide })
      : new MeshStandardMaterial({ color: variant.color, roughness: 0.7, metalness: metalness * 0.4 })
    const group = new Group()
    const art = new Group()
    group.add(art)
    const meshes = [new Mesh(asset.face, front)]
    if (style !== 'flat') meshes.push(new Mesh(asset.body, side))
    for (const mesh of meshes) {
      mesh.castShadow = true
      mesh.receiveShadow = true
      art.add(mesh)
    }
    return { group, art, side, front, asset, variant }
  }

  update(model: ItemModel): void {
    const { asset, front } = model
    if (!asset.loaded) {
      const image = sprite(asset.src)
      if (image !== null) {
        asset.texture.image = image
        asset.texture.needsUpdate = true
        asset.loaded = true
      }
    }
    if (asset.loaded && front.map === null) {
      front.map = asset.texture
      front.color.set('#ffffff')
      front.needsUpdate = true
    }
  }

  release(model: ItemModel): void {
    model.group.removeFromParent()
    model.side.dispose()
    model.front.dispose()
  }

  dispose(): void {
    for (const asset of this.cache.values()) {
      asset.body.dispose(); asset.face.dispose(); asset.texture.dispose()
    }
    this.cache.clear()
  }
}

export { ItemAssets }
export type { ItemModel }
