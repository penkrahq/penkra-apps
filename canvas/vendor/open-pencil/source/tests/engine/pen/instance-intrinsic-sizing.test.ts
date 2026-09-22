import { expect, test } from 'bun:test'

import { createCanvasSceneGraph, hydrateCanvasSceneGraphInstances } from '@open-pencil/pen'

function chipDocument(height: number | 'fit_content') {
  return {
    version: '2.17',
    children: [
      {
        id: 'chip',
        type: 'frame' as const,
        reusable: true,
        layout: 'horizontal',
        width: 'fit_content',
        height,
        padding: [0, 14],
        gap: 6,
        children: [
          {
            id: 'label',
            type: 'text' as const,
            content: 'All',
            fontSize: 16,
            lineHeight: 1.2
          },
          {
            id: 'count',
            type: 'frame' as const,
            layout: 'horizontal',
            width: 20,
            height: 20
          }
        ]
      },
      {
        id: 'instance',
        type: 'ref' as const,
        ref: 'chip',
        descendants: { label: { content: 'Kaneshie Market' } }
      }
    ]
  }
}

test('intrinsic descendant overrides preserve a fixed source component height', () => {
  const document = chipDocument(32)
  const graph = createCanvasSceneGraph(document, { deferExternalInstances: true })

  graph.updateNode('label', { width: 29.25, height: 19 })
  hydrateCanvasSceneGraphInstances(graph, document, ['instance'])

  expect(graph.getNode('instance')?.primaryAxisSizing).toBe('HUG')
  expect(graph.getNode('instance')?.counterAxisSizing).toBe('FIXED')
})

test('intrinsic descendant overrides preserve an intentionally hug-height component', () => {
  const document = chipDocument('fit_content')
  const graph = createCanvasSceneGraph(document, { deferExternalInstances: true })

  graph.updateNode('label', { width: 29.25, height: 19 })
  hydrateCanvasSceneGraphInstances(graph, document, ['instance'])

  expect(graph.getNode('instance')?.primaryAxisSizing).toBe('HUG')
  expect(graph.getNode('instance')?.counterAxisSizing).toBe('HUG')
})
