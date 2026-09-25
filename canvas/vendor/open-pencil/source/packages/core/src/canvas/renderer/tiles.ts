import type { Canvas, Image as CKImage } from 'canvaskit-wasm'

import type { SceneGraph } from '@open-pencil/scene-graph'
import type { VisualBounds } from '@open-pencil/scene-graph/geometry'

import type { SkiaRenderer } from '#core/canvas/renderer'
import { prepareSubtreeCullBounds } from '#core/canvas/scene'

const TILE_DEVICE_PIXELS = 512

export type TileCoordinate = {
  x: number
  y: number
  worldX: number
  worldY: number
  worldSize: number
}

export type SceneTile<Image extends { delete(): void }> = TileCoordinate & {
  key: string
  image: Image
  bytes: number
  lastUsedAt: number
}

export function visibleTileCoordinates(
  viewport: VisualBounds,
  deviceScale: number,
  tilePixels: number
): TileCoordinate[] {
  if (!Number.isFinite(deviceScale) || deviceScale <= 0) return []
  if (!Number.isFinite(tilePixels) || tilePixels <= 0) return []
  const worldSize = tilePixels / deviceScale
  const firstX = Math.floor(viewport.minX / worldSize)
  const lastX = Math.ceil(viewport.maxX / worldSize) - 1
  const firstY = Math.floor(viewport.minY / worldSize)
  const lastY = Math.ceil(viewport.maxY / worldSize) - 1
  const tiles: TileCoordinate[] = []
  for (let y = firstY; y <= lastY; y++) {
    for (let x = firstX; x <= lastX; x++) {
      tiles.push({ x, y, worldX: x * worldSize, worldY: y * worldSize, worldSize })
    }
  }
  return tiles
}

export function tileIntersectsBounds(tile: TileCoordinate, bounds: VisualBounds): boolean {
  return (
    tile.worldX < bounds.maxX &&
    tile.worldX + tile.worldSize > bounds.minX &&
    tile.worldY < bounds.maxY &&
    tile.worldY + tile.worldSize > bounds.minY
  )
}

export class SceneTileCache<Image extends { delete(): void }> {
  private tiles = new Map<string, SceneTile<Image>>()
  private usedBytes = 0
  private tick = 0

  constructor(readonly byteBudget: number) {
    if (!Number.isFinite(byteBudget) || byteBudget < 0) {
      throw new RangeError('Tile cache byte budget must be finite and non-negative')
    }
  }

  get bytes(): number {
    return this.usedBytes
  }

  get size(): number {
    return this.tiles.size
  }

  get(key: string): SceneTile<Image> | undefined {
    const tile = this.tiles.get(key)
    if (tile) tile.lastUsedAt = ++this.tick
    return tile
  }

  put(tile: Omit<SceneTile<Image>, 'lastUsedAt'>): boolean {
    if (tile.bytes <= 0 || tile.bytes > this.byteBudget) {
      tile.image.delete()
      return false
    }
    this.delete(tile.key)
    this.tiles.set(tile.key, { ...tile, lastUsedAt: ++this.tick })
    this.usedBytes += tile.bytes
    while (this.usedBytes > this.byteBudget) {
      let oldest: SceneTile<Image> | undefined
      for (const candidate of this.tiles.values()) {
        if (!oldest || candidate.lastUsedAt < oldest.lastUsedAt) oldest = candidate
      }
      if (!oldest) break
      this.delete(oldest.key)
    }
    return this.tiles.has(tile.key)
  }

  invalidate(bounds: VisualBounds): void {
    for (const tile of this.tiles.values()) {
      if (tileIntersectsBounds(tile, bounds)) this.delete(tile.key)
    }
  }

  delete(key: string): void {
    const tile = this.tiles.get(key)
    if (!tile) return
    this.tiles.delete(key)
    this.usedBytes -= tile.bytes
    tile.image.delete()
  }

  clear(): void {
    for (const key of this.tiles.keys()) this.delete(key)
  }
}

function tileCacheScopeMatches(r: SkiaRenderer, graph: SceneGraph, sceneVersion: number): boolean {
  return (
    r.sceneTileCacheGraph === graph &&
    r.sceneTileCacheVersion === sceneVersion &&
    r.sceneTileCacheFontGeneration === r.fontGeneration &&
    r.sceneTileCachePageId === r.pageId &&
    r.sceneTileCachePositionPreviewVersion === graph.positionPreviewVersion &&
    r.sceneTileCachePageColor === `${r.pageColor.r}:${r.pageColor.g}:${r.pageColor.b}`
  )
}

function recordSceneTile(
  r: SkiaRenderer,
  graph: SceneGraph,
  coordinate: TileCoordinate
): CKImage | null {
  const tilePixels = TILE_DEVICE_PIXELS
  let surface
  try {
    surface = r.surface.makeSurface({
      width: tilePixels,
      height: tilePixels,
      colorType: r.ck.ColorType.RGBA_8888,
      alphaType: r.ck.AlphaType.Premul,
      colorSpace: r.ck.ColorSpace.SRGB
    })
  } catch {
    surface = null
  }
  if (!surface) {
    r.sceneTileAllocationFailed = true
    r.sceneTileCache.clear()
    console.warn('Canvas tile allocation failed; using direct scene rendering for this surface')
    return null
  }
  const canvas = surface.getCanvas()
  const oldViewport = r.worldViewport
  try {
    canvas.clear(r.ck.Color4f(r.pageColor.r, r.pageColor.g, r.pageColor.b, 1))
    r.worldViewport = {
      x: coordinate.worldX,
      y: coordinate.worldY,
      w: coordinate.worldSize,
      h: coordinate.worldSize
    }
    canvas.save()
    canvas.scale(r.dpr, r.dpr)
    canvas.translate(-coordinate.worldX * r.zoom, -coordinate.worldY * r.zoom)
    canvas.scale(r.zoom, r.zoom)
    const page = graph.getNode(r.pageId ?? graph.rootId)
    for (const childId of page?.childIds ?? []) r.renderNode(canvas, graph, childId, {})
    canvas.restore()
    surface.flush()
    return surface.makeImageSnapshot()
  } finally {
    r.worldViewport = oldViewport
    surface.delete()
  }
}

export function renderSceneTiles(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  sceneVersion: number
): boolean {
  if (r.sceneTileAllocationFailed) return false
  prepareSubtreeCullBounds(r, graph, sceneVersion)
  if (!tileCacheScopeMatches(r, graph, sceneVersion)) {
    r.sceneTileCache.clear()
    r.sceneTileCacheGraph = graph
    r.sceneTileCacheVersion = sceneVersion
    r.sceneTileCacheFontGeneration = r.fontGeneration
    r.sceneTileCachePageId = r.pageId
    r.sceneTileCachePositionPreviewVersion = graph.positionPreviewVersion
    r.sceneTileCachePageColor = `${r.pageColor.r}:${r.pageColor.g}:${r.pageColor.b}`
  }
  const viewport: VisualBounds = {
    minX: r.worldViewport.x,
    minY: r.worldViewport.y,
    maxX: r.worldViewport.x + r.worldViewport.w,
    maxY: r.worldViewport.y + r.worldViewport.h
  }
  const coordinates = visibleTileCoordinates(viewport, r.zoom * r.dpr, TILE_DEVICE_PIXELS)
  const tileBytes = TILE_DEVICE_PIXELS * TILE_DEVICE_PIXELS * 4
  if (coordinates.length * tileBytes > r.sceneTileCache.byteBudget) return false

  const visibleTiles: SceneTile<CKImage>[] = []
  const startedAt = performance.now()
  let misses = 0
  for (const coordinate of coordinates) {
    const key = `${r.zoom}:${r.dpr}:${coordinate.x}:${coordinate.y}`
    let tile = r.sceneTileCache.get(key)
    if (!tile) {
      misses++
      const image = recordSceneTile(r, graph, coordinate)
      if (!image) return false
      r.sceneTileCache.put({ ...coordinate, key, image, bytes: tileBytes })
      tile = r.sceneTileCache.get(key)
    }
    if (!tile) return false
    visibleTiles.push(tile)
  }
  r.opacityPaint.setAlphaf(1)
  for (const tile of visibleTiles) {
    const x = tile.worldX * r.zoom + r.panX
    const y = tile.worldY * r.zoom + r.panY
    const size = tile.worldSize * r.zoom
    canvas.drawImageRectOptions(
      tile.image,
      r.ck.LTRBRect(0, 0, TILE_DEVICE_PIXELS, TILE_DEVICE_PIXELS),
      r.ck.LTRBRect(x, y, x + size, y + size),
      r.ck.FilterMode.Nearest,
      r.ck.MipmapMode.None,
      r.opacityPaint
    )
  }
  if (misses > 0) {
    const monitor = (
      globalThis as typeof globalThis & {
        __penkraPerformance?: {
          canvas?: { record: (name: string, duration: number, detail: object) => void }
        }
      }
    ).__penkraPerformance?.canvas
    monitor?.record('renderer.scene-tiles', performance.now() - startedAt, {
      misses,
      visibleTiles: coordinates.length,
      graphNodes: graph.nodes.size,
      zoom: r.zoom
    })
  }
  return true
}
