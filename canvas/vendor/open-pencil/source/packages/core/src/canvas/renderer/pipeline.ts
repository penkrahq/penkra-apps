import type { Canvas } from 'canvaskit-wasm'

import type { SceneGraph } from '@open-pencil/scene-graph'
import { computeDescendantVisualBounds } from '@open-pencil/scene-graph/geometry'

import { drawPageGuides } from '#core/canvas/page-guides'
import type { RenderOverlays, SkiaRenderer } from '#core/canvas/renderer'
import { prepareSubtreeCullBounds } from '#core/canvas/scene'
import type { EditorState } from '#core/editor/types'

import { renderSceneBacking, updateSceneBackingPreviewState } from './retained-backing'
import { discardRetainedSceneState, invalidateScenePicture } from './state'
import { renderSceneTiles } from './tiles'
import { MAX_RETAINED_SCENE_NODES, type RenderLayer } from './types'

export { MAX_RETAINED_SCENE_NODES, type RenderLayer } from './types'

export function renderSceneToCanvas(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  pageId: string
): void {
  const prevViewport = r.worldViewport
  r.worldViewport = { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }
  const pageNode = graph.getNode(pageId)
  if (pageNode) {
    for (const childId of pageNode.childIds) {
      r.renderNode(canvas, graph, childId, {})
    }
  }
  r.worldViewport = prevViewport
}

export function renderFromEditorState(
  r: SkiaRenderer,
  state: EditorState,
  graph: SceneGraph,
  textEditor: unknown,
  viewportWidth: number,
  viewportHeight: number,
  showRulers = true,
  dpr = 1,
  layer: RenderLayer = 'full'
): void {
  r.dpr = dpr
  r.panX = state.panX
  r.panY = state.panY
  r.zoom = state.zoom
  r.viewportWidth = viewportWidth
  r.viewportHeight = viewportHeight
  r.showRulers = showRulers
  r.pageColor = state.pageColor
  r.rulerTheme = state.rulerTheme ?? null
  r.pageId = state.currentPageId
  render(
    r,
    graph,
    state.selectedIds,
    {
      hoveredNodeId: state.hoveredNodeId,
      enteredContainerId: state.enteredContainerId,
      editingTextId: state.editingTextId,
      textEditor: textEditor as RenderOverlays['textEditor'],
      marquee: state.marquee,
      snapGuides: state.snapGuides,
      rotationPreview: state.rotationPreview,
      dropTargetId: state.dropTargetId,
      layoutInsertIndicator: state.layoutInsertIndicator,
      penState: state.penState
        ? ({
            ...state.penState,
            cursorX: state.penCursorX ?? undefined,
            cursorY: state.penCursorY ?? undefined
          } as RenderOverlays['penState'])
        : null,
      nodeEditState: state.nodeEditState ?? null,
      remoteCursors: state.remoteCursors,
      autoLayoutHover: state.autoLayoutHover
    },
    state.sceneVersion,
    layer
  )
}

function hasVolatileOverlay(overlays: RenderOverlays): boolean {
  return (
    overlays.dropTargetId != null ||
    overlays.rotationPreview != null ||
    overlays.editingTextId != null ||
    overlays.nodeEditState != null
  )
}

function scenePictureMissReason(
  r: SkiaRenderer,
  graph: SceneGraph,
  overlays: RenderOverlays,
  sceneVersion: number,
  hasPositionPreview: boolean
): string {
  if (hasPositionPreview) return 'position-preview'
  if (hasVolatileOverlay(overlays)) return 'volatile-overlay'
  if (!r.scenePicture) return 'missing-picture'
  if (graph.positionPreviewVersion !== r.scenePicturePositionPreviewVersion)
    return 'position-preview-version'
  if (sceneVersion !== r.scenePictureVersion) return 'scene-version'
  if (r.fontGeneration !== r.scenePictureFontGeneration) return 'font-generation'
  if (r.pageId !== r.scenePicturePageId) return 'page'
  return 'unknown'
}

function canUseScenePicture(
  r: SkiaRenderer,
  graph: SceneGraph,
  sceneVersion: number,
  hasVolatileOverlays: boolean
): boolean {
  return (
    !hasVolatileOverlays &&
    !!r.scenePicture &&
    graph.positionPreviewVersion === r.scenePicturePositionPreviewVersion &&
    sceneVersion === r.scenePictureVersion &&
    r.fontGeneration === r.scenePictureFontGeneration &&
    r.pageId === r.scenePicturePageId
  )
}

const now = typeof performance !== 'undefined' ? () => performance.now() : () => 0
export function prepareRetainedSceneState(
  r: SkiaRenderer,
  nodeCount: number,
  layer: RenderLayer
): boolean {
  const retainFullScene = nodeCount <= MAX_RETAINED_SCENE_NODES
  if (retainFullScene) updateSceneBackingPreviewState(r, layer)
  else if (
    r.scenePicture ||
    r.sceneBacking ||
    r.sceneBackingBuild ||
    r.sceneBackingNeedsCrispRender
  ) {
    // Direct rendering cannot satisfy a pending retained-backing crisp pass.
    invalidateScenePicture(r)
  }
  return retainFullScene
}

function measure<T>(fn: () => T): { value: T; duration: number } {
  const start = now()
  const value = fn()
  return { value, duration: now() - start }
}

// eslint-disable-next-line complexity -- this is the renderer's layer orchestration boundary
export function render(
  r: SkiaRenderer,
  graph: SceneGraph,
  selectedIds: Set<string>,
  overlays: RenderOverlays = {},
  sceneVersion = -1,
  layer: RenderLayer = 'full'
): void {
  r.syncFontGeneration()
  const p = r.profiler
  p.beginFrame()
  p.setScenePictureDrawTime(0)
  p.setScenePictureRecordTime(0)
  p.setFlushTime(0)

  graph.clearAbsPosCache()
  // Detail is a screen-space decision, not a function of total document size.
  r.largeSceneDetailCulling = r.zoom < 0.25
  if (r.largeSceneDetailCulling) prepareSubtreeCullBounds(r, graph, sceneVersion)

  const canvas = r.surface.getCanvas()
  if (layer === 'overlays') {
    canvas.clear(r.ck.Color4f(0, 0, 0, 0))
  } else {
    canvas.clear(r.ck.Color4f(r.pageColor.r, r.pageColor.g, r.pageColor.b, 1))
  }

  r.worldViewport = {
    x: -r.panX / r.zoom,
    y: -r.panY / r.zoom,
    w: r.viewportWidth / r.zoom,
    h: r.viewportHeight / r.zoom
  }
  // The interactive scene uses viewport tiles. Keep the legacy full-scene
  // picture only for full/export rendering and as an exceptional fallback.
  const retainFullScene =
    layer === 'scene' ? false : prepareRetainedSceneState(r, graph.nodes.size, layer)

  const hasPositionPreview =
    graph.positionPreviewVersion !== r.scenePicturePositionPreviewVersion &&
    sceneVersion === r.scenePictureVersion
  const hasVolatileOverlays = hasPositionPreview || hasVolatileOverlay(overlays)

  const canUsePicture =
    retainFullScene && canUseScenePicture(r, graph, sceneVersion, hasVolatileOverlays)
  const cacheMissReason = retainFullScene
    ? scenePictureMissReason(r, graph, overlays, sceneVersion, hasPositionPreview)
    : 'tile-unavailable'

  if (layer !== 'overlays') {
    canvas.save()
    canvas.scale(r.dpr, r.dpr)

    p.beginPhase('render:scene')
    if (
      layer === 'scene' &&
      !hasVolatileOverlays &&
      renderSceneTiles(r, canvas, graph, sceneVersion)
    ) {
      if (
        r.scenePicture ||
        r.sceneBacking ||
        r.sceneBackingBuild ||
        r.sceneBackingNeedsCrispRender
      ) {
        discardRetainedSceneState(r)
      }
      p.setScenePictureMode('hit', 'tiles')
    } else if (
      layer === 'scene' &&
      retainFullScene &&
      !hasVolatileOverlays &&
      renderSceneBacking(r, canvas, graph, sceneVersion)
    ) {
      p.setScenePictureMode('hit', 'backing')
    } else {
      canvas.translate(r.panX, r.panY)
      canvas.scale(r.zoom, r.zoom)
      renderSceneContent(
        r,
        canvas,
        graph,
        overlays,
        sceneVersion,
        canUsePicture,
        cacheMissReason,
        hasVolatileOverlays,
        retainFullScene
      )
    }
    p.endPhase('render:scene')

    canvas.restore()
  }

  if (layer !== 'scene') {
    canvas.save()
    canvas.scale(r.dpr, r.dpr)
    r.labelCache.update(graph, r.pageId, sceneVersion, graph.positionPreviewVersion)
    p.beginPhase('render:sectionTitles')
    r.drawSectionTitles(canvas, graph)
    p.endPhase('render:sectionTitles')
    p.beginPhase('render:componentLabels')
    r.drawComponentLabels(canvas, graph)
    p.endPhase('render:componentLabels')
    r.drawFrameTitles(canvas, graph, selectedIds)
    canvas.restore()

    canvas.save()
    canvas.scale(r.dpr, r.dpr)

    r.drawHoverHighlight(
      canvas,
      graph,
      overlays.hoveredNodeId === overlays.nodeEditState?.nodeId ? null : overlays.hoveredNodeId
    )
    r.drawEnteredContainer(canvas, graph, overlays.enteredContainerId)
    p.beginPhase('render:selection')
    r.drawSelection(canvas, graph, selectedIds, overlays)
    p.endPhase('render:selection')
    r.drawFlashes(canvas, graph)
    drawPageGuides(r, canvas, graph)
    r.drawSnapGuides(canvas, overlays.snapGuides)
    r.drawMarquee(canvas, overlays.marquee)
    r.drawLayoutInsertIndicator(canvas, overlays.layoutInsertIndicator)
    r.drawAutoLayoutHover(canvas, graph, overlays.autoLayoutHover)
    r.drawNodeEditOverlay(canvas, graph, overlays.nodeEditState)
    r.drawPenOverlay(canvas, overlays.penState)
    r.drawRemoteCursors(canvas, graph, overlays.remoteCursors)
    p.beginPhase('render:rulers')
    if (r.showRulers) r.drawRulers(canvas, graph, selectedIds)
    p.endPhase('render:rulers')

    p.drawHUD(canvas, r.showRulers)

    canvas.restore()
  }

  p.beginPhase('render:flush')
  const { duration: flushDuration } = measure(() => r.surface.flush())
  p.setFlushTime(flushDuration)
  p.endPhase('render:flush')

  p.setNodeCounts(r._nodeCount, r._culledCount)
  p.endFrame()
}

function renderSceneContent(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  overlays: RenderOverlays,
  sceneVersion: number,
  canUsePicture: boolean,
  cacheMissReason: string,
  hasVolatileOverlays: boolean,
  retainFullScene: boolean
): void {
  const p = r.profiler
  if (canUsePicture) {
    p.setScenePictureMode('hit')
    p.beginPhase('render:drawPicture')
    if (r.scenePicture) {
      const picture = r.scenePicture
      const { duration } = measure(() => canvas.drawPicture(picture))
      p.setScenePictureDrawTime(duration)
    }
    p.endPhase('render:drawPicture')
  } else if (hasVolatileOverlays || !retainFullScene) {
    p.setScenePictureMode(hasVolatileOverlays ? 'volatile' : 'direct', cacheMissReason)
    r._nodeCount = 0
    r._culledCount = 0
    p.beginPhase('render:volatile')
    renderPageChildren(r, canvas, graph, overlays)
    p.endPhase('render:volatile')
  } else {
    p.setScenePictureMode('record', cacheMissReason)
    r._nodeCount = 0
    r._culledCount = 0
    p.beginPhase('render:recordPicture')
    const { duration } = measure(() => recordScenePicture(r, canvas, graph, sceneVersion))
    p.setScenePictureRecordTime(duration)
    p.endPhase('render:recordPicture')
  }
}

function renderPageChildren(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  overlays: RenderOverlays
): void {
  const pageNode = graph.getNode(r.pageId ?? graph.rootId)
  if (!pageNode) return
  for (const childId of pageNode.childIds) {
    r.renderNode(canvas, graph, childId, overlays)
  }
}

function recordScenePicture(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  sceneVersion: number
): void {
  r.scenePicture?.delete()
  const prevViewport = r.worldViewport
  r.worldViewport = { x: -1e6, y: -1e6, w: 2e6, h: 2e6 }
  const recorder = new r.ck.PictureRecorder()
  const pageNode = graph.getNode(r.pageId ?? graph.rootId)
  const sceneContentBounds = pageNode
    ? computeDescendantVisualBounds(
        pageNode.childIds,
        (id) => graph.getNode(id),
        (id) => graph.getAbsolutePosition(id)
      )
    : null
  const sceneBounds = sceneContentBounds
    ? {
        x: sceneContentBounds.minX,
        y: sceneContentBounds.minY,
        width: sceneContentBounds.maxX - sceneContentBounds.minX,
        height: sceneContentBounds.maxY - sceneContentBounds.minY
      }
    : { x: 0, y: 0, width: 1, height: 1 }
  const padding = 1024
  const bounds = r.ck.LTRBRect(
    sceneBounds.x - padding,
    sceneBounds.y - padding,
    sceneBounds.x + sceneBounds.width + padding,
    sceneBounds.y + sceneBounds.height + padding
  )
  const recCanvas = recorder.beginRecording(bounds)
  if (pageNode) {
    for (const childId of pageNode.childIds) {
      r.renderNode(recCanvas, graph, childId, {})
    }
  }
  r.scenePicture = recorder.finishRecordingAsPicture()
  recorder.delete()
  r.worldViewport = prevViewport
  r.scenePictureVersion = sceneVersion
  r.scenePictureFontGeneration = r.fontGeneration
  r.scenePicturePositionPreviewVersion = graph.positionPreviewVersion
  r.scenePicturePageId = r.pageId
  canvas.drawPicture(r.scenePicture)
}
