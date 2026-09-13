import { createCanvasSceneGraph } from '@open-pencil/pen'

import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'

const editor = useEditorSetupWithClear('/?test&no-chrome&no-rulers')

test('authored polygon geometry renders as a pentagon', async () => {
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
  if (!node) throw new Error('Polygon adapter did not produce a node')
  await editor.page.evaluate(
    ({ type, vectorNetwork, fills }) => {
      const store = window.openPencil?.getStore?.()
      if (!store) throw new Error('OpenPencil store not initialized')
      store.graph.createNode(type, store.state.currentPageId, {
        name: 'Authored pentagon',
        x: 160,
        y: 110,
        width: 180,
        height: 150,
        vectorNetwork,
        fills
      })
      store.clearSelection()
      store.requestRender()
    },
    { type: node.type, vectorNetwork: node.vectorNetwork, fills: node.fills }
  )
  await editor.canvas.waitForRender()
  editor.canvas.assertNoErrors()
  expect(await editor.canvas.canvas.screenshot()).toMatchSnapshot('authored-polygon-geometry.png')
})

test('even-odd vector geometry preserves holes', async () => {
  await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const bytes: number[] = []
    const pushFloat = (value: number) => {
      const buffer = new ArrayBuffer(4)
      new DataView(buffer).setFloat32(0, value, true)
      bytes.push(...new Uint8Array(buffer))
    }
    const moveTo = (x: number, y: number) => {
      bytes.push(1)
      pushFloat(x)
      pushFloat(y)
    }
    const lineTo = (x: number, y: number) => {
      bytes.push(2)
      pushFloat(x)
      pushFloat(y)
    }
    const rectangle = (x: number, y: number, width: number, height: number) => {
      moveTo(x, y)
      lineTo(x + width, y)
      lineTo(x + width, y + height)
      lineTo(x, y + height)
      bytes.push(0)
    }
    rectangle(0, 0, 240, 144)
    rectangle(28, 28, 184, 88)
    rectangle(48, 48, 144, 12)

    store.graph.createNode('VECTOR', store.state.currentPageId, {
      name: 'Even-odd card outline',
      x: 160,
      y: 110,
      width: 240,
      height: 144,
      fills: [
        {
          type: 'SOLID',
          color: { r: 0.23, g: 0.51, b: 0.96, a: 1 },
          visible: true,
          opacity: 1
        }
      ],
      fillGeometry: [{ windingRule: 'EVENODD', commandsBlob: new Uint8Array(bytes) }]
    })
    store.clearSelection()
    store.requestRender()
  })
  await editor.canvas.waitForRender()
  editor.canvas.assertNoErrors()
  const buffer = await editor.canvas.canvas.screenshot()
  expect(buffer).toMatchSnapshot('even-odd-vector-holes.png')
})
