import { beforeAll, describe, expect, mock, test } from 'bun:test'

import { renderNodesToImage, SceneGraph, SkiaRenderer } from '@open-pencil/core'

import { initCanvasKit } from '#cli/headless'
import { makeArcPath } from '#core/canvas/fills'
import type { SkiaRenderer as SkiaRendererType } from '#core/canvas/renderer'

import { expectDefined } from '#tests/helpers/assert'

let canvasKit: Awaited<ReturnType<typeof initCanvasKit>>

beforeAll(async () => {
  canvasKit = await initCanvasKit()
})

function pageId(graph: SceneGraph) {
  return graph.getPages()[0].id
}

function createRenderer() {
  const paths: Array<{
    addArc: ReturnType<typeof mock>
    arcToOval: ReturnType<typeof mock>
    lineTo: ReturnType<typeof mock>
    close: ReturnType<typeof mock>
    delete: ReturnType<typeof mock>
  }> = []

  class MockPath {
    addArc = mock(() => undefined)
    arcToOval = mock(() => undefined)
    lineTo = mock(() => undefined)
    close = mock(() => undefined)
    delete = mock(() => undefined)

    constructor() {
      paths.push(this)
    }
  }

  const renderer = {
    ck: {
      Path: MockPath,
      LTRBRect: mock((left, top, right, bottom) => new Float32Array([left, top, right, bottom]))
    }
  } as SkiaRendererType

  return { renderer, paths }
}

describe('canvas ellipse arcs', () => {
  test('builds a donut segment as one connected contour', () => {
    const graph = new SceneGraph()
    const node = graph.createNode('ELLIPSE', pageId(graph), {
      width: 18,
      height: 18,
      arcData: {
        startingAngle: -Math.PI / 2,
        endingAngle: Math.PI,
        innerRadius: 0.68
      }
    })
    const { renderer, paths } = createRenderer()

    makeArcPath(renderer, node).delete()

    expect(paths).toHaveLength(1)
    expect(paths[0].addArc).toHaveBeenCalledWith(new Float32Array([0, 0, 18, 18]), -90, 270)
    expect(paths[0].lineTo).toHaveBeenCalledWith(2.88, 9)
    expect(paths[0].arcToOval).toHaveBeenCalledWith(
      new Float32Array([2.88, 2.88, 15.120000000000001, 15.120000000000001]),
      180,
      -270,
      false
    )
    expect(paths[0].close).toHaveBeenCalledTimes(1)
  })

  test('keeps the spinner gap and inner cutout transparent when rasterized', () => {
    const graph = new SceneGraph()
    const node = graph.createNode('ELLIPSE', pageId(graph), {
      width: 18,
      height: 18,
      fills: [
        {
          type: 'SOLID',
          color: { r: 0.56, g: 0.56, b: 0.58, a: 1 },
          opacity: 1,
          visible: true
        }
      ],
      arcData: {
        startingAngle: -Math.PI / 2,
        endingAngle: Math.PI,
        innerRadius: 0.68
      }
    })
    const surface = expectDefined(canvasKit.MakeSurface(1, 1), 'arc test surface')
    const renderer = new SkiaRenderer(canvasKit, surface)

    try {
      const png = expectDefined(
        renderNodesToImage(canvasKit, renderer, graph, pageId(graph), [node.id], {
          scale: 4,
          format: 'PNG'
        }),
        'arc png'
      )
      const image = expectDefined(canvasKit.MakeImageFromEncoded(png), 'arc image')
      const pixels = expectDefined(
        image.readPixels(0, 0, {
          width: image.width(),
          height: image.height(),
          colorType: canvasKit.ColorType.RGBA_8888,
          alphaType: canvasKit.AlphaType.Unpremul,
          colorSpace: canvasKit.ColorSpace.SRGB
        }),
        'arc pixels'
      )
      const alphaAt = (x: number, y: number) => pixels[(y * image.width() + x) * 4 + 3]

      expect(alphaAt(22, 22)).toBe(0)
      expect(alphaAt(36, 36)).toBe(0)
      expect(alphaAt(66, 36)).toBeGreaterThan(0)

      image.delete()
    } finally {
      surface.delete()
    }
  })
})
