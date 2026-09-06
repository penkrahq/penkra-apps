import { expect, test } from 'bun:test'

import { createCanvasSceneGraph } from '@open-pencil/pen'

test('authored polygon geometry uses the same vector adapter as paths', () => {
  const graph = createCanvasSceneGraph({
    version: '2.17',
    children: [
      {
        id: 'pentagon',
        type: 'polygon',
        width: 180,
        height: 150,
        geometry: 'M50 0 L100 35 L80 100 L20 100 L0 35 Z',
        viewBox: [0, 0, 100, 100],
        fillRule: 'evenodd',
        fill: '#0B4A6F'
      }
    ]
  })
  const node = [...graph.nodes.values()].find((candidate) => candidate.pencilNodeId === 'pentagon')
  expect(node?.type).toBe('VECTOR')
  expect(node?.vectorNetwork?.vertices).toHaveLength(5)
  expect(node?.vectorNetwork?.regions[0]?.windingRule).toBe('EVENODD')
})
