export type FontLayoutSchedulerOptions = {
  recomputeLayoutAfterFonts: boolean
  recomputeLayout: () => void
  requestRender: () => void
  renderNow: () => void
  schedule?: (callback: () => void) => void
}

export function createFontLayoutScheduler(options: FontLayoutSchedulerOptions) {
  let initializationComplete = false
  let queued = false
  const schedule = options.schedule ?? queueMicrotask

  function fontResolutionSettled() {
    if (!initializationComplete) return
    if (!options.recomputeLayoutAfterFonts) {
      options.renderNow()
      return
    }
    if (queued) return
    queued = true
    schedule(() => {
      queued = false
      options.recomputeLayout()
      options.requestRender()
    })
  }

  return {
    finishInitialization() {
      initializationComplete = true
    },
    fontResolutionSettled
  }
}
