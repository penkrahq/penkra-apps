import { describe, expect, test } from 'bun:test'

import { createFontLayoutScheduler } from '#vue/canvas/surface/font-layout-scheduler'

describe('font layout scheduler', () => {
  test('leaves initial font resolution to the initialization layout pass', () => {
    const calls: string[] = []
    const scheduled: Array<() => void> = []
    const scheduler = createFontLayoutScheduler({
      recomputeLayoutAfterFonts: true,
      recomputeLayout: () => calls.push('layout'),
      requestRender: () => calls.push('render'),
      renderNow: () => calls.push('render-now'),
      schedule: (callback) => scheduled.push(callback)
    })

    scheduler.fontResolutionSettled()
    scheduler.fontResolutionSettled()
    expect(scheduled).toHaveLength(0)
    expect(calls).toEqual([])

    scheduler.finishInitialization()
    scheduler.fontResolutionSettled()
    scheduler.fontResolutionSettled()
    expect(scheduled).toHaveLength(1)
    scheduled[0]()
    expect(calls).toEqual(['layout', 'render'])
  })

  test('redraws without layout after initialization when layout recomputation is disabled', () => {
    const calls: string[] = []
    const scheduler = createFontLayoutScheduler({
      recomputeLayoutAfterFonts: false,
      recomputeLayout: () => calls.push('layout'),
      requestRender: () => calls.push('render'),
      renderNow: () => calls.push('render-now')
    })

    scheduler.fontResolutionSettled()
    expect(calls).toEqual([])
    scheduler.finishInitialization()
    scheduler.fontResolutionSettled()
    expect(calls).toEqual(['render-now'])
  })
})
