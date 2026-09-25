import { expect, mock, test } from 'bun:test'

import type { Canvas, Image as CKImage } from 'canvaskit-wasm'

import { SceneGraph } from '@open-pencil/scene-graph'

import { initCanvasKit } from '#cli/headless'
import type { SkiaRenderer } from '#core/canvas/renderer'
import { SkiaRenderer as Renderer } from '#core/canvas/renderer'
import {
  SceneTileCache,
  renderSceneTiles,
  visibleTileCoordinates
} from '#core/canvas/renderer/tiles'

import { expectDefined } from '#tests/helpers/assert'

test('visible tiles cover positive and negative world coordinates without duplicating an edge', () => {
  const coordinates = visibleTileCoordinates({ minX: -256, minY: 0, maxX: 256, maxY: 512 }, 1, 256)
  expect(coordinates.map(({ x, y }) => [x, y])).toEqual([
    [-1, 0],
    [0, 0],
    [-1, 1],
    [0, 1]
  ])
})

test('tile cache retains only its byte budget and evicts least recently used images', () => {
  const cache = new SceneTileCache<{ delete(): void }>(8)
  const first = { delete: mock() }
  const second = { delete: mock() }
  const third = { delete: mock() }
  const add = (key: string, x: number, image: { delete(): void }) =>
    cache.put({ key, x, y: 0, worldX: x, worldY: 0, worldSize: 1, bytes: 4, image })

  expect(add('first', 0, first)).toBe(true)
  expect(add('second', 1, second)).toBe(true)
  cache.get('first')
  expect(add('third', 2, third)).toBe(true)
  expect(cache.get('second')).toBeUndefined()
  expect(second.delete).toHaveBeenCalledTimes(1)
  expect(cache.bytes).toBe(8)
  cache.invalidate({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
  expect(cache.get('first')).toBeUndefined()
  expect(cache.get('third')).toBeDefined()
  expect(first.delete).toHaveBeenCalledTimes(1)
  cache.clear()
  expect(third.delete).toHaveBeenCalledTimes(1)
  expect(cache.bytes).toBe(0)
})

test('oversized tiles are disposed without exceeding the budget', () => {
  const cache = new SceneTileCache<{ delete(): void }>(8)
  const image = { delete: mock() }
  expect(
    cache.put({ key: 'large', x: 0, y: 0, worldX: 0, worldY: 0, worldSize: 1, bytes: 12, image })
  ).toBe(false)
  expect(image.delete).toHaveBeenCalledTimes(1)
  expect(cache.size).toBe(0)
})

test('viewport tiles are reused while panning and replaced after a scene edit', () => {
  const imageDeletes: Array<ReturnType<typeof mock>> = []
  const makeSurface = mock(() => {
    const imageDelete = mock()
    imageDeletes.push(imageDelete)
    return {
      getCanvas: () => ({
        clear: mock(),
        save: mock(),
        scale: mock(),
        translate: mock(),
        restore: mock()
      }),
      flush: mock(),
      makeImageSnapshot: () => ({ delete: imageDelete }),
      delete: mock()
    }
  })
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  graph.createNode('RECTANGLE', page.id, { x: 0, y: 0, width: 20, height: 20 })
  const renderer = {
    ck: {
      ColorType: { RGBA_8888: 1 },
      AlphaType: { Premul: 1 },
      ColorSpace: { SRGB: 1 },
      Color4f: mock(),
      LTRBRect: mock((...values: number[]) => values),
      FilterMode: { Nearest: 1 },
      MipmapMode: { None: 1 }
    },
    surface: { makeSurface },
    sceneTileCache: new SceneTileCache<CKImage>(4 * 512 * 512 * 4),
    sceneTileCacheGraph: null,
    sceneTileCacheVersion: -1,
    sceneTileCacheFontGeneration: -1,
    sceneTileCachePageId: null,
    sceneTileCachePositionPreviewVersion: -1,
    sceneTileCachePageColor: '',
    fontGeneration: 0,
    pageId: page.id,
    pageColor: { r: 1, g: 1, b: 1 },
    subtreeCullBounds: new Map(),
    subtreeNodeCounts: new Map(),
    subtreeCullBoundsGraph: null,
    subtreeCullBoundsSceneVersion: -1,
    subtreeCullBoundsPositionPreviewVersion: -1,
    zoom: 1,
    dpr: 1,
    panX: 0,
    panY: 0,
    worldViewport: { x: 0, y: 0, w: 256, h: 256 },
    opacityPaint: { setAlphaf: mock() },
    renderNode: mock()
  } as SkiaRenderer
  const canvas = { drawImageRectOptions: mock() } as Canvas

  expect(renderSceneTiles(renderer, canvas, graph, 1)).toBe(true)
  expect(makeSurface).toHaveBeenCalledTimes(1)
  renderer.panX = -128
  renderer.worldViewport = { x: 128, y: 0, w: 256, h: 256 }
  expect(renderSceneTiles(renderer, canvas, graph, 1)).toBe(true)
  expect(makeSurface).toHaveBeenCalledTimes(1)
  expect(renderSceneTiles(renderer, canvas, graph, 2)).toBe(true)
  expect(makeSurface).toHaveBeenCalledTimes(2)
  expect(imageDeletes[0]).toHaveBeenCalledTimes(1)
  graph.positionPreviewVersion++
  expect(renderSceneTiles(renderer, canvas, graph, 2)).toBe(true)
  expect(makeSurface).toHaveBeenCalledTimes(3)
  renderer.pageColor = { r: 0, g: 0, b: 0 }
  expect(renderSceneTiles(renderer, canvas, graph, 2)).toBe(true)
  expect(makeSurface).toHaveBeenCalledTimes(4)
})

test('a failed tile allocation falls back without retrying or retaining stale images', () => {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const makeSurface = mock(() => null)
  const renderer = {
    ck: { ColorType: { RGBA_8888: 1 }, AlphaType: { Premul: 1 }, ColorSpace: { SRGB: 1 } },
    surface: { makeSurface },
    sceneTileCache: new SceneTileCache<CKImage>(512 * 512 * 4),
    sceneTileCacheGraph: null,
    sceneTileCacheVersion: -1,
    sceneTileCacheFontGeneration: -1,
    sceneTileCachePageId: null,
    sceneTileCachePositionPreviewVersion: -1,
    sceneTileCachePageColor: '',
    sceneTileAllocationFailed: false,
    fontGeneration: 0,
    pageId: page.id,
    pageColor: { r: 1, g: 1, b: 1 },
    subtreeCullBounds: new Map(),
    subtreeNodeCounts: new Map(),
    subtreeCullBoundsGraph: null,
    subtreeCullBoundsSceneVersion: -1,
    subtreeCullBoundsPositionPreviewVersion: -1,
    zoom: 1,
    dpr: 1,
    worldViewport: { x: 0, y: 0, w: 100, h: 100 }
  } as SkiaRenderer
  const warning = console.warn
  console.warn = mock()
  try {
    expect(renderSceneTiles(renderer, {} as Canvas, graph, 1)).toBe(false)
    expect(renderSceneTiles(renderer, {} as Canvas, graph, 1)).toBe(false)
    expect(makeSurface).toHaveBeenCalledTimes(1)
    expect(renderer.sceneTileCache.size).toBe(0)
    expect(console.warn).toHaveBeenCalledTimes(1)
  } finally {
    console.warn = warning
  }
})

test('tiled rendering matches direct rendering across a tile boundary', async () => {
  const ck = await initCanvasKit()
  const width = 768
  const height = 128
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  graph.createNode('RECTANGLE', page.id, {
    x: 475,
    y: 10,
    width: 100,
    height: 70,
    fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.3, b: 0.9, a: 1 }, visible: true, opacity: 1 }]
  })
  const directSurface = expectDefined(ck.MakeSurface(width, height), 'direct surface')
  const tiledSurface = expectDefined(ck.MakeSurface(width, height), 'tiled surface')
  const direct = new Renderer(ck, directSurface)
  const tiled = new Renderer(ck, tiledSurface)
  const capture = (surface: typeof directSurface) => {
    const image = surface.makeImageSnapshot()
    const pixels = expectDefined(
      image.readPixels(0, 0, {
        width,
        height,
        colorType: ck.ColorType.RGBA_8888,
        alphaType: ck.AlphaType.Unpremul,
        colorSpace: ck.ColorSpace.SRGB
      }),
      'pixels'
    )
    image.delete()
    return pixels
  }
  try {
    for (const renderer of [direct, tiled]) {
      renderer.pageId = page.id
      renderer.pageColor = { r: 1, g: 1, b: 1 }
      renderer.viewportWidth = width
      renderer.viewportHeight = height
      renderer.worldViewport = { x: 0, y: 0, w: width, h: height }
      renderer.zoom = 1
      renderer.dpr = 1
    }
    const directCanvas = directSurface.getCanvas()
    directCanvas.clear(ck.WHITE)
    for (const childId of page.childIds) direct.renderNode(directCanvas, graph, childId, {})
    const tiledCanvas = tiledSurface.getCanvas()
    tiledCanvas.clear(ck.WHITE)
    expect(renderSceneTiles(tiled, tiledCanvas, graph, 1)).toBe(true)
    tiledSurface.flush()
    directSurface.flush()
    const expected = capture(directSurface)
    const actual = capture(tiledSurface)
    for (const x of [474, 475, 500, 511, 512, 513, 550, 574, 575]) {
      const index = (40 * width + x) * 4
      expect(actual.slice(index, index + 4)).toEqual(expected.slice(index, index + 4))
    }
  } finally {
    direct.destroy()
    tiled.destroy()
  }
})

test('tiled rendering preserves a soft shadow crossing a tile boundary', async () => {
  const ck = await initCanvasKit()
  const width = 640
  const height = 140
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  graph.createNode('RECTANGLE', page.id, {
    x: 500,
    y: 24,
    width: 24,
    height: 64,
    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, visible: true, opacity: 1 }],
    effects: [
      {
        type: 'DROP_SHADOW',
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 0.6 },
        offset: { x: 0, y: 0 },
        radius: 15,
        spread: 0
      }
    ]
  })
  const directSurface = expectDefined(ck.MakeSurface(width, height), 'direct surface')
  const tiledSurface = expectDefined(ck.MakeSurface(width, height), 'tiled surface')
  const direct = new Renderer(ck, directSurface)
  const tiled = new Renderer(ck, tiledSurface)
  const pixels = (surface: typeof directSurface) => {
    const snapshot = surface.makeImageSnapshot()
    const result = expectDefined(
      snapshot.readPixels(0, 0, {
        width,
        height,
        colorType: ck.ColorType.RGBA_8888,
        alphaType: ck.AlphaType.Unpremul,
        colorSpace: ck.ColorSpace.SRGB
      }),
      'pixels'
    )
    snapshot.delete()
    return result
  }
  try {
    for (const renderer of [direct, tiled]) {
      renderer.pageId = page.id
      renderer.pageColor = { r: 1, g: 1, b: 1 }
      renderer.viewportWidth = width
      renderer.viewportHeight = height
      renderer.worldViewport = { x: 0, y: 0, w: width, h: height }
      renderer.zoom = 1
      renderer.dpr = 1
    }
    const directCanvas = directSurface.getCanvas()
    directCanvas.clear(ck.WHITE)
    for (const childId of page.childIds) direct.renderNode(directCanvas, graph, childId, {})
    const tiledCanvas = tiledSurface.getCanvas()
    tiledCanvas.clear(ck.WHITE)
    expect(renderSceneTiles(tiled, tiledCanvas, graph, 1)).toBe(true)
    directSurface.flush()
    tiledSurface.flush()
    const expected = pixels(directSurface)
    const actual = pixels(tiledSurface)
    for (const x of [490, 500, 510, 511, 512, 513, 524, 535]) {
      const index = (56 * width + x) * 4
      for (let channel = 0; channel < 4; channel++) {
        // An offscreen RGBA snapshot may quantize a translucent blur by one
        // channel value when composited back onto the opaque page.
        expect(Math.abs(actual[index + channel] - expected[index + channel])).toBeLessThanOrEqual(1)
      }
    }
  } finally {
    direct.destroy()
    tiled.destroy()
  }
})

test('paint edits invalidate only intersecting viewport tiles', async () => {
  const ck = await initCanvasKit()
  const surface = expectDefined(ck.MakeSurface(1024, 128), 'surface')
  const renderer = new Renderer(ck, surface)
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const node = graph.createNode('RECTANGLE', page.id, {
    x: 50,
    y: 20,
    width: 100,
    height: 60,
    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, visible: true, opacity: 1 }]
  })
  try {
    renderer.pageId = page.id
    renderer.pageColor = { r: 1, g: 1, b: 1 }
    renderer.worldViewport = { x: 0, y: 0, w: 1024, h: 128 }
    renderer.viewportWidth = 1024
    renderer.viewportHeight = 128
    renderer.zoom = 1
    renderer.dpr = 1
    expect(renderSceneTiles(renderer, surface.getCanvas(), graph, 1)).toBe(true)
    expect(renderer.sceneTileCache.size).toBe(2)
    const oldFill = node.fills[0]
    const nextFill = { ...oldFill, color: { r: 0, g: 1, b: 0, a: 1 } }
    graph.updateNode(node.id, { fills: [nextFill] })
    renderer.invalidateSceneTilesForNode(graph, node.id, { fills: [nextFill] })
    expect(renderer.sceneTileCache.size).toBe(1)
    renderer.sceneTileCacheVersion = 2
    expect(renderSceneTiles(renderer, surface.getCanvas(), graph, 2)).toBe(true)
    expect(renderer.sceneTileCache.size).toBe(2)
  } finally {
    renderer.destroy()
  }
})

test('interactive scene uses viewport tiles on either side of the old node-count cutoff', async () => {
  const ck = await initCanvasKit()
  const surface = expectDefined(ck.MakeSurface(128, 128), 'surface')
  const renderer = new Renderer(ck, surface)
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  graph.createNode('RECTANGLE', page.id, {
    x: 5,
    y: 5,
    width: 30,
    height: 30,
    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, visible: true, opacity: 1 }]
  })
  try {
    renderer.pageId = page.id
    renderer.pageColor = { r: 1, g: 1, b: 1 }
    renderer.viewportWidth = 128
    renderer.viewportHeight = 128
    renderer.zoom = 1
    renderer.dpr = 1
    renderer.render(graph, new Set(), {}, 1, 'scene')
    expect(renderer.sceneTileCache.size).toBe(1)
    for (let index = 0; index < 10_000; index++) {
      graph.createNode('RECTANGLE', page.id, {
        x: 10_000 + index,
        y: 0,
        width: 1,
        height: 1
      })
    }
    renderer.render(graph, new Set(), {}, 2, 'scene')
    expect(renderer.sceneTileCache.size).toBe(1)
    expect(renderer.sceneBackingNeedsCrispRender).toBe(false)
  } finally {
    renderer.destroy()
  }
})
