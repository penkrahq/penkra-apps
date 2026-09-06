import { describe, test, expect } from 'bun:test'

import type { Vector } from '@open-pencil/core'
import {
  computeDescendantVisualBounds,
  computeVisualBounds
} from '@open-pencil/scene-graph/geometry'

function commandsBlobFromPoints(points: Vector[]): Uint8Array {
  const blob = new Uint8Array(points.length * 9 + 1)
  const view = new DataView(blob.buffer)
  let offset = 0
  for (const point of points) {
    blob[offset] = 1
    view.setFloat32(offset + 1, point.x, true)
    view.setFloat32(offset + 5, point.y, true)
    offset += 9
  }
  blob[offset] = 0
  return blob
}

describe('computeVisualBounds', () => {
  const idPos = (id: string) => {
    const map: Record<string, Vector> = {
      r1: { x: 100, y: 200 },
      r2: { x: 300, y: 400 },
      rotated: { x: 0, y: 0 }
    }
    return map[id] ?? { x: 0, y: 0 }
  }

  test('empty iterable returns zero rect', () => {
    expect(computeVisualBounds([], idPos)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  test('single axis-aligned node returns its bounds', () => {
    const result = computeVisualBounds([{ id: 'r1', width: 50, height: 60 }], idPos)
    expect(result).toEqual({ x: 100, y: 200, width: 50, height: 60 })
  })

  test('multiple nodes returns union', () => {
    const result = computeVisualBounds(
      [
        { id: 'r1', width: 50, height: 60 },
        { id: 'r2', width: 30, height: 30 }
      ],
      idPos
    )
    expect(result).toEqual({ x: 100, y: 200, width: 230, height: 230 })
  })

  test('rotated node has expanded bbox', () => {
    const noRot = computeVisualBounds(
      [{ id: 'rotated', width: 100, height: 50, rotation: 0 }],
      idPos
    )
    const rotated = computeVisualBounds(
      [{ id: 'rotated', width: 100, height: 50, rotation: 45 }],
      idPos
    )
    // Rotated bbox should be larger
    expect(rotated.width).toBeGreaterThan(noRot.width)
    expect(rotated.height).toBeGreaterThan(noRot.height)
  })

  test('strokes expand bounds', () => {
    const noStroke = computeVisualBounds([{ id: 'r1', width: 50, height: 60, strokes: [] }], idPos)
    const withStroke = computeVisualBounds(
      [
        {
          id: 'r1',
          width: 50,
          height: 60,
          strokes: [
            {
              weight: 10,
              visible: true,
              align: 'OUTSIDE' as const,
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1
            }
          ]
        }
      ],
      idPos
    )
    // OUTSIDE stroke of weight 10 adds 10 to each side
    expect(withStroke.width).toBe(noStroke.width + 20)
    expect(withStroke.height).toBe(noStroke.height + 20)
  })

  test('invisible strokes do not expand bounds', () => {
    const noStroke = computeVisualBounds([{ id: 'r1', width: 50, height: 60 }], idPos)
    const invisibleStroke = computeVisualBounds(
      [
        {
          id: 'r1',
          width: 50,
          height: 60,
          strokes: [
            {
              weight: 100,
              visible: false,
              align: 'OUTSIDE' as const,
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1
            }
          ]
        }
      ],
      idPos
    )
    expect(invisibleStroke.width).toBe(noStroke.width)
    expect(invisibleStroke.height).toBe(noStroke.height)
  })

  test('CENTER stroke expands bounds by half weight', () => {
    const noStroke = computeVisualBounds([{ id: 'r1', width: 50, height: 60 }], idPos)
    const centerStroke = computeVisualBounds(
      [
        {
          id: 'r1',
          width: 50,
          height: 60,
          strokes: [
            {
              weight: 10,
              visible: true,
              align: 'CENTER' as const,
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1
            }
          ]
        }
      ],
      idPos
    )
    // CENTER stroke of weight 10 adds 5 to each side
    expect(centerStroke.width).toBe(noStroke.width + 10)
    expect(centerStroke.height).toBe(noStroke.height + 10)
  })

  test('INSIDE stroke does not expand bounds', () => {
    const noStroke = computeVisualBounds([{ id: 'r1', width: 50, height: 60 }], idPos)
    const insideStroke = computeVisualBounds(
      [
        {
          id: 'r1',
          width: 50,
          height: 60,
          strokes: [
            {
              weight: 10,
              visible: true,
              align: 'INSIDE' as const,
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1
            }
          ]
        }
      ],
      idPos
    )
    expect(insideStroke.width).toBe(noStroke.width)
    expect(insideStroke.height).toBe(noStroke.height)
  })

  test('DROP_SHADOW expands bounds asymmetrically based on offset', () => {
    const noEffect = computeVisualBounds([{ id: 'r1', width: 50, height: 60 }], idPos)
    const withShadow = computeVisualBounds(
      [
        {
          id: 'r1',
          width: 50,
          height: 60,
          effects: [
            {
              type: 'DROP_SHADOW' as const,
              visible: true,
              radius: 10,
              spread: 0,
              offset: { x: 5, y: -3 },
              color: { r: 0, g: 0, b: 0, a: 0.5 }
            }
          ]
        }
      ],
      idPos
    )
    // sigma=radius/2; ceil(3*sigma)=15, translated by (5,-3).
    expect(withShadow.x).toBe(noEffect.x - 10)
    expect(withShadow.y).toBe(noEffect.y - 18)
    expect(withShadow.width).toBe(noEffect.width + 10 + 20)
    expect(withShadow.height).toBe(noEffect.height + 18 + 12)
  })

  test('LAYER_BLUR expands bounds by the three-sigma kernel', () => {
    const noEffect = computeVisualBounds([{ id: 'r1', width: 50, height: 60 }], idPos)
    const withBlur = computeVisualBounds(
      [
        {
          id: 'r1',
          width: 50,
          height: 60,
          effects: [
            {
              type: 'LAYER_BLUR' as const,
              visible: true,
              radius: 20,
              spread: 0,
              offset: { x: 0, y: 0 },
              color: { r: 0, g: 0, b: 0, a: 1 }
            }
          ]
        }
      ],
      idPos
    )
    // radius=20 gives sigma=10, hence 30 pixels on each side.
    expect(withBlur.width).toBe(noEffect.width + 60)
    expect(withBlur.height).toBe(noEffect.height + 60)
  })

  test('invisible effect does not expand bounds', () => {
    const noEffect = computeVisualBounds([{ id: 'r1', width: 50, height: 60 }], idPos)
    const invisibleEffect = computeVisualBounds(
      [
        {
          id: 'r1',
          width: 50,
          height: 60,
          effects: [
            {
              type: 'DROP_SHADOW' as const,
              visible: false,
              radius: 100,
              spread: 50,
              offset: { x: 200, y: 200 },
              color: { r: 0, g: 0, b: 0, a: 1 }
            }
          ]
        }
      ],
      idPos
    )
    expect(invisibleEffect).toEqual(noEffect)
  })

  test('combined OUTSIDE stroke and DROP_SHADOW expands bounds correctly', () => {
    const noEffects = computeVisualBounds([{ id: 'r1', width: 50, height: 60 }], idPos)
    const combined = computeVisualBounds(
      [
        {
          id: 'r1',
          width: 50,
          height: 60,
          strokes: [
            {
              weight: 5,
              visible: true,
              align: 'OUTSIDE' as const,
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1
            }
          ],
          effects: [
            {
              type: 'DROP_SHADOW' as const,
              visible: true,
              radius: 10,
              spread: 0,
              offset: { x: 3, y: 3 },
              color: { r: 0, g: 0, b: 0, a: 0.5 }
            }
          ]
        }
      ],
      idPos
    )
    // Five-pixel stroke plus a 15-pixel kernel translated by (3,3).
    expect(combined.x).toBe(noEffects.x - 17)
    expect(combined.y).toBe(noEffects.y - 17)
    expect(combined.width).toBe(noEffects.width + 17 + 23)
    expect(combined.height).toBe(noEffects.height + 17 + 23)
  })

  test('multiple strokes takes maximum overflow', () => {
    const noEffects = computeVisualBounds([{ id: 'r1', width: 50, height: 60 }], idPos)
    const multiStroke = computeVisualBounds(
      [
        {
          id: 'r1',
          width: 50,
          height: 60,
          strokes: [
            {
              weight: 2,
              visible: true,
              align: 'OUTSIDE' as const,
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1
            },
            {
              weight: 8,
              visible: true,
              align: 'CENTER' as const,
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1
            },
            {
              weight: 4,
              visible: true,
              align: 'INSIDE' as const,
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1
            }
          ]
        }
      ],
      idPos
    )
    // strokeOverflow takes max: OUTSIDE(2)=2, CENTER(4)=4, INSIDE(0)=0 → max=4
    expect(multiStroke.width).toBe(noEffects.width + 8) // 4 per side × 2
    expect(multiStroke.height).toBe(noEffects.height + 8)
  })

  test('inside stroke geometry does not expand export bounds', () => {
    const strokeGeometry = [
      {
        commandsBlob: commandsBlobFromPoints([
          { x: -1, y: -1 },
          { x: 101, y: 51 }
        ])
      }
    ]
    const nodes = {
      inside: {
        id: 'inside',
        type: 'COMPONENT',
        width: 100,
        height: 50,
        visible: true,
        strokes: [
          {
            weight: 1,
            visible: true,
            align: 'INSIDE' as const,
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1
          }
        ],
        strokeGeometry,
        childIds: []
      },
      outside: {
        id: 'outside',
        type: 'FRAME',
        width: 100,
        height: 50,
        visible: true,
        strokes: [
          {
            weight: 1,
            visible: true,
            align: 'OUTSIDE' as const,
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1
          }
        ],
        strokeGeometry,
        childIds: []
      }
    }

    const insideBounds = computeDescendantVisualBounds(
      ['inside'],
      (id) => nodes[id as keyof typeof nodes],
      () => ({ x: 10, y: 20 })
    )
    const outsideBounds = computeDescendantVisualBounds(
      ['outside'],
      (id) => nodes[id as keyof typeof nodes],
      () => ({ x: 10, y: 20 })
    )

    expect(insideBounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 })
    expect(outsideBounds).toEqual({ minX: 9, minY: 19, maxX: 111, maxY: 71 })
  })

  test('nested clipping stops descendants outside the ancestor clip', () => {
    const nodes = {
      root: {
        id: 'root',
        type: 'FRAME',
        width: 100,
        height: 100,
        visible: true,
        clipsContent: true,
        childIds: ['row']
      },
      row: {
        id: 'row',
        type: 'FRAME',
        width: 100,
        height: 50,
        visible: true,
        clipsContent: true,
        childIds: ['cell']
      },
      cell: {
        id: 'cell',
        type: 'FRAME',
        width: 50,
        height: 50,
        visible: true,
        childIds: []
      }
    }
    const positions: Record<keyof typeof nodes, Vector> = {
      root: { x: 0, y: 0 },
      row: { x: 0, y: 120 },
      cell: { x: 0, y: 120 }
    }

    const bounds = computeDescendantVisualBounds(
      ['root'],
      (id) => nodes[id as keyof typeof nodes],
      (id) => positions[id as keyof typeof positions]
    )

    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
  })

  test('multiple effects accumulate directional overflow', () => {
    const noEffects = computeVisualBounds([{ id: 'r1', width: 50, height: 60 }], idPos)
    const multiEffect = computeVisualBounds(
      [
        {
          id: 'r1',
          width: 50,
          height: 60,
          effects: [
            {
              type: 'DROP_SHADOW' as const,
              visible: true,
              radius: 5,
              spread: 0,
              offset: { x: 10, y: 0 },
              color: { r: 0, g: 0, b: 0, a: 1 }
            },
            {
              type: 'DROP_SHADOW' as const,
              visible: true,
              radius: 3,
              spread: 0,
              offset: { x: -10, y: 0 },
              color: { r: 0, g: 0, b: 0, a: 1 }
            }
          ]
        }
      ],
      idPos
    )
    // Kernels ceil(7.5)=8 and ceil(4.5)=5, translated in opposite directions.
    expect(multiEffect.x).toBe(noEffects.x - 15)
    expect(multiEffect.width).toBe(noEffects.width + 15 + 18)
    expect(multiEffect.y).toBe(noEffects.y - 8)
    expect(multiEffect.height).toBe(noEffects.height + 8 + 8)
  })
})
