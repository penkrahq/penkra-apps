import { describe, expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/core'

import { recomputeDerivedGraphLayout } from '#vue/canvas/surface/derived-layout'

import { autoFrame, pageId, rect } from '#tests/helpers/layout'

describe('derived canvas layout', () => {
  test('updates geometry through preview events without authored update events', () => {
    const graph = new SceneGraph()
    const frame = autoFrame(graph, pageId(graph), {
      layoutMode: 'HORIZONTAL',
      width: 240,
      height: 80,
      paddingLeft: 12,
      itemSpacing: 8
    })
    const first = rect(graph, frame.id, 30, 20)
    const second = rect(graph, frame.id, 40, 20)
    let authoredUpdates = 0
    let previewUpdates = 0
    const unsubscribe = graph.onNodeEvents({
      updated: () => authoredUpdates++,
      previewUpdated: () => previewUpdates++
    })

    recomputeDerivedGraphLayout(graph)
    unsubscribe()

    expect(authoredUpdates).toBe(0)
    expect(previewUpdates).toBeGreaterThan(0)
    expect(graph.getNode(first.id)?.x).toBe(12)
    expect(graph.getNode(second.id)?.x).toBe(50)
  })
})
