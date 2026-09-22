import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'

const editor = useEditorSetupWithClear('/?test&no-chrome&no-rulers')

test('ellipse arc segments', async () => {
  const nodeNames = await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const pageId = store.state.currentPageId

    store.graph.createNode('FRAME', pageId, {
      name: 'Ellipse arc backdrop',
      x: 56,
      y: 52,
      width: 480,
      height: 250,
      cornerRadius: 22,
      fills: [
        { type: 'SOLID', color: { r: 0.96, g: 0.97, b: 0.99, a: 1 }, visible: true, opacity: 1 }
      ]
    })

    const arcs = [
      { name: '18px spinner', x: 88, y: 96, size: 18, innerRadius: 0.68, start: -90, sweep: 270 },
      { name: '30px spinner', x: 136, y: 90, size: 30, innerRadius: 0.72, start: -90, sweep: 270 },
      {
        name: 'Large spinner',
        x: 220,
        y: 84,
        size: 144,
        innerRadius: 0.68,
        start: -90,
        sweep: 270
      },
      { name: 'Reverse arc', x: 408, y: 96, size: 88, innerRadius: 0.55, start: 30, sweep: -220 }
    ]

    for (const arc of arcs) {
      store.graph.createNode('ELLIPSE', pageId, {
        name: arc.name,
        x: arc.x,
        y: arc.y,
        width: arc.size,
        height: arc.size,
        arcData: {
          startingAngle: (arc.start * Math.PI) / 180,
          endingAngle: ((arc.start + arc.sweep) * Math.PI) / 180,
          innerRadius: arc.innerRadius
        },
        fills: [
          { type: 'SOLID', color: { r: 0.35, g: 0.35, b: 0.38, a: 1 }, visible: true, opacity: 1 }
        ]
      })
    }

    store.clearSelection()
    store.requestRender()

    const page = store.graph.getNode(pageId)
    return page?.childIds.map((id) => store.graph.getNode(id)?.name) ?? []
  })
  expect(nodeNames).toEqual([
    'Ellipse arc backdrop',
    '18px spinner',
    '30px spinner',
    'Large spinner',
    'Reverse arc'
  ])
  await editor.canvas.waitForRender()
  editor.canvas.assertNoErrors()
  const buffer = await editor.canvas.canvas.screenshot()
  expect(buffer).toMatchSnapshot('ellipse-arc-segments.png')
})
