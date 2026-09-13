import type { CanvasKit } from 'canvaskit-wasm'
import { onScopeDispose } from 'vue'
import type { Ref } from 'vue'

import { SkiaRenderer } from '@open-pencil/core/canvas'
import type { Editor } from '@open-pencil/core/editor'
import { computeAllLayouts } from '@open-pencil/core/layout'

import { makeGLSurface, sizeCanvas, type CanvasGLContext } from '#vue/canvas/surface/gl-surface'
import { useCanvasKitLoader } from '#vue/canvas/surface/kit-loader'
import { createCanvasRenderLoop } from '#vue/canvas/surface/render-loop'
import { useCanvasResizeObserver } from '#vue/canvas/surface/resize-observer'
import type { UseCanvasOptions } from '#vue/canvas/surface/types'

type SurfaceManagerState = {
  renderer: SkiaRenderer | null
  glContext: CanvasGLContext | null
}

export function createCanvasSurfaceManager({
  editor,
  canvasRef,
  options,
  getCanvasKit,
  isDestroyed,
  shouldShowRulers
}: {
  editor: Editor
  canvasRef: { value: HTMLCanvasElement | null }
  options: UseCanvasOptions | undefined
  getCanvasKit: () => CanvasKit | null
  isDestroyed: () => boolean
  shouldShowRulers: () => boolean
}) {
  const state: SurfaceManagerState = { renderer: null, glContext: null }
  let sceneBackingRenderTimer: ReturnType<typeof setTimeout> | null = null
  let firstRenderMeasured = false

  function clearSceneBackingRenderTimer() {
    if (sceneBackingRenderTimer === null) return
    clearTimeout(sceneBackingRenderTimer)
    sceneBackingRenderTimer = null
  }

  function createSurface(
    canvas: HTMLCanvasElement,
    { reloadFonts = false }: { reloadFonts?: boolean } = {}
  ) {
    const ck = getCanvasKit()
    if (!ck) return

    if (state.renderer) editor.removeCanvasRenderer(state.renderer)
    state.renderer?.destroy()
    state.renderer = null
    state.glContext?.delete()
    state.glContext = null

    sizeCanvas(canvas, editor)

    const result = makeGLSurface(ck, canvas, editor, options, state.glContext)
    state.glContext = result.glContext
    const surface = result.surface
    if (!surface) {
      canvas.dataset.surfaceError = 'webgl'
      return
    }

    const glCtx = canvas.getContext('webgl2') ?? null
    state.renderer = new SkiaRenderer(ck, surface, glCtx)
    editor.setCanvasKit(ck, state.renderer)
    canvas.dataset.ready = '1'

    // When the surface is recreated after a resize fallback, destroyRenderer
    // has cleared the module-level fontProvider — the new renderer must reload.
    // On initial mount, kit-loader.init() handles loadFonts, so skip here.
    if (reloadFonts && !isDestroyed()) {
      void state.renderer.loadFonts(renderNow).then(() => {
        if (!isDestroyed()) renderNow()
        return undefined
      })
    }
  }

  function renderNow() {
    if (!state.renderer || isDestroyed()) return
    const renderStartedAt = performance.now()
    state.renderer.renderFromEditorState(
      editor.state,
      editor.graph,
      editor.textEditor,
      canvasRef.value?.clientWidth ?? 0,
      canvasRef.value?.clientHeight ?? 0,
      shouldShowRulers(),
      options?.layer ?? 'full'
    )
    if (!firstRenderMeasured) {
      firstRenderMeasured = true
      options?.onPerformance?.('engine.render-first', performance.now() - renderStartedAt, {
        graphNodes: editor.graph.nodes.size,
        layer: options?.layer ?? 'full'
      })
    }
    renderLoop.markRendered()
    clearSceneBackingRenderTimer()
    if (options?.layer === 'scene' && state.renderer.sceneBackingNeedsCrispRender) {
      const delay = Math.max(0, state.renderer.sceneBackingPreviewUntil - performance.now())
      sceneBackingRenderTimer = setTimeout(() => renderLoop.markDirty(), delay)
    }
  }

  const renderLoop = createCanvasRenderLoop(editor, renderNow, { layer: options?.layer })

  function resizeCanvas(canvas: HTMLCanvasElement) {
    const ck = getCanvasKit()
    if (!ck || !state.renderer) {
      createSurface(canvas)
      return
    }

    sizeCanvas(canvas, editor)

    const result = makeGLSurface(ck, canvas, editor, options, state.glContext)
    state.glContext = result.glContext
    const surface = result.surface
    if (!surface) {
      console.warn('Falling back to full surface recreation after resize')
      createSurface(canvas, { reloadFonts: true })
      return
    }
    state.renderer.replaceSurface(surface)
    renderNow()
  }

  function destroy() {
    clearSceneBackingRenderTimer()
    renderLoop.pause()
    if (state.renderer) editor.removeCanvasRenderer(state.renderer)
    state.renderer?.destroy()
    state.glContext?.delete()
  }

  return {
    createSurface,
    resizeCanvas,
    renderNow,
    destroy,
    markDirty: renderLoop.markDirty,
    getRenderer: () => state.renderer
  }
}

export function useCanvasSurfaceLifecycle({
  canvasRef,
  surface,
  setCanvasKit,
  getCanvasKitValue,
  lifecycle,
  editor,
  options,
  onReady
}: {
  canvasRef: Ref<HTMLCanvasElement | null>
  surface: ReturnType<typeof createCanvasSurfaceManager>
  setCanvasKit: (ck: CanvasKit | null) => void
  getCanvasKitValue: () => CanvasKit | null
  lifecycle: { destroyed: boolean }
  editor: Editor
  options?: UseCanvasOptions
  onReady?: () => void
}) {
  useCanvasKitLoader({
    canvasRef,
    lifecycle,
    setCanvasKit,
    createSurface: surface.createSurface,
    loadFonts: async () => {
      const fontsStartedAt = performance.now()
      await surface.getRenderer()?.loadFonts(surface.renderNow)
      options?.onPerformance?.('engine.fonts', performance.now() - fontsStartedAt, {
        graphNodes: editor.graph.nodes.size
      })
      const layoutStartedAt = performance.now()
      if (options?.recomputeLayoutAfterFonts !== false) {
        for (const page of editor.graph.getPages()) computeAllLayouts(editor.graph, page.id)
      }
      options?.onPerformance?.('engine.font-layout', performance.now() - layoutStartedAt, {
        graphNodes: editor.graph.nodes.size,
        skipped: options?.recomputeLayoutAfterFonts === false
      })
    },
    renderNow: () => {
      const readyRenderStartedAt = performance.now()
      surface.renderNow()
      options?.onPerformance?.('engine.render-ready', performance.now() - readyRenderStartedAt, {
        graphNodes: editor.graph.nodes.size
      })
    },
    onReady
  })

  const { cancelResize } = useCanvasResizeObserver({
    canvasRef,
    getCanvasKitValue,
    resizeCanvas: surface.resizeCanvas
  })

  onScopeDispose(() => {
    lifecycle.destroyed = true
    cancelResize()
    surface.destroy()
  })
}
