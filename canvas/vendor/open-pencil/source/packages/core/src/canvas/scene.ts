/* eslint-disable max-lines -- scene dispatch stays together while shape domains live in sibling modules */
import type { Canvas, Path } from 'canvaskit-wasm'

import type { SceneNode, SceneGraph, Fill } from '@open-pencil/scene-graph'
import {
  intersectVisualBounds,
  nodeVisualBounds,
  unionVisualBounds,
  type VisualBounds
} from '@open-pencil/scene-graph/geometry'
import type { Color } from '@open-pencil/scene-graph/primitives'

import { DROP_HIGHLIGHT_ALPHA, DROP_HIGHLIGHT_STROKE, SECTION_CORNER_RADIUS } from '#core/constants'
import { transformTextCase } from '#core/text/case'
import { fontManager } from '#core/text/fonts'
import { vectorNetworkToCenterlinePath } from '#core/vector'

import { needsIsolatedBlendLayer, setFigmaPaintBlendMode } from './blend'
import { renderBooleanOperation } from './boolean'
import { applyGradientFill, drawVectorMultiStyleFills, paintFills } from './fills'
import { drawLayoutGrids } from './layout-grids'
import { renderMaskedChildIds } from './masks'
import type { SkiaRenderer, RenderOverlays } from './renderer'
import { makeSmoothRRectPath, nodeHasRadius, nodeHasSmoothCorners } from './shapes'
import {
  configureStrokePaint,
  drawDashedRRectWithSolidCorners,
  drawStyledRRectStroke,
  getStrokeCapEntity,
  getStrokeJoinEntity
} from './strokes'
import { drawFigmaDerivedText } from './text/derived'
import { textNodeToOutlinePath } from './text/outlines'

function drawVisibleFills(
  r: SkiaRenderer,
  node: SceneNode,
  graph: SceneGraph,
  draw: (fill: Fill) => void
): void {
  paintFills(r, node.fills, node, graph, draw)
}
function viewportExcludesBounds(
  viewport: { x: number; y: number; w: number; h: number },
  bounds: VisualBounds
): boolean {
  return (
    bounds.minX > viewport.x + viewport.w ||
    bounds.minY > viewport.y + viewport.h ||
    bounds.maxX < viewport.x ||
    bounds.maxY < viewport.y
  )
}

function collectSubtreeCullBounds(
  graph: SceneGraph,
  nodeId: string,
  cache: Map<string, VisualBounds>,
  countCache: Map<string, number>
): VisualBounds | null {
  const node = graph.getNode(nodeId)
  if (!node?.visible || node.internalOnly) return null
  let bounds = nodeVisualBounds(
    node,
    (id) => graph.getAbsolutePosition(id),
    (id) => graph.getNode(id)
  )
  let subtreeNodeCount = 1
  const clippable = node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE'
  let childClip: VisualBounds | null = null
  if (clippable && node.clipsContent) {
    const abs = graph.getAbsolutePosition(node.id)
    childClip = { minX: abs.x, minY: abs.y, maxX: abs.x + node.width, maxY: abs.y + node.height }
  }
  for (const childId of node.childIds) {
    let childBounds = collectSubtreeCullBounds(graph, childId, cache, countCache)
    subtreeNodeCount += countCache.get(childId) ?? 0
    if (childBounds && childClip) childBounds = intersectVisualBounds(childBounds, childClip)
    bounds = unionVisualBounds(bounds, childBounds)
  }
  if (bounds) cache.set(nodeId, bounds)
  countCache.set(nodeId, subtreeNodeCount)
  return bounds
}

export function prepareSubtreeCullBounds(
  r: SkiaRenderer,
  graph: SceneGraph,
  sceneVersion: number
): void {
  if (
    r.subtreeCullBoundsGraph === graph &&
    r.subtreeCullBoundsSceneVersion === sceneVersion &&
    r.subtreeCullBoundsPositionPreviewVersion === graph.positionPreviewVersion
  )
    return
  r.subtreeCullBounds.clear()
  r.subtreeNodeCounts.clear()
  const pageNode = graph.getNode(r.pageId ?? graph.rootId)
  if (pageNode) {
    for (const childId of pageNode.childIds) {
      collectSubtreeCullBounds(graph, childId, r.subtreeCullBounds, r.subtreeNodeCounts)
    }
  }
  r.subtreeCullBoundsGraph = graph
  r.subtreeCullBoundsSceneVersion = sceneVersion
  r.subtreeCullBoundsPositionPreviewVersion = graph.positionPreviewVersion
}

function shouldCullSubpixelDetail(r: SkiaRenderer, node: SceneNode): boolean {
  if (!r.largeSceneDetailCulling || r.zoom >= 0.25 || node.childIds.length > 0) return false
  const screenWidth = Math.abs(node.width * r.zoom)
  const screenHeight = Math.abs(node.height * r.zoom)
  if (node.type === 'TEXT') return Math.abs((node.fontSize || node.height) * r.zoom) < 1.25
  return screenWidth * screenHeight < 0.35
}

function shouldRenderSubtreeDetail(r: SkiaRenderer, node: SceneNode): boolean {
  if (!r.largeSceneDetailCulling || r.zoom >= 0.25 || node.childIds.length === 0) return true
  const screenWidth = Math.abs(node.width * r.zoom)
  const screenHeight = Math.abs(node.height * r.zoom)
  if (screenWidth === 0 || screenHeight === 0) return true
  const screenArea = screenWidth * screenHeight
  const descendantCount = Math.max(1, (r.subtreeNodeCounts.get(node.id) ?? 1) - 1)
  if (descendantCount >= 32 && screenArea / descendantCount < 0.75) return false
  const minimumScreenDimension = r.zoom < 0.1 ? 6 : 2
  const minimumScreenArea = r.zoom < 0.1 ? 36 : 8
  return (
    screenWidth >= minimumScreenDimension &&
    screenHeight >= minimumScreenDimension &&
    screenArea >= minimumScreenArea
  )
}
function isCulled(r: SkiaRenderer, node: SceneNode, absX: number, absY: number): boolean {
  if (shouldCullSubpixelDetail(r, node)) return true
  const subtreeBounds = r.subtreeCullBounds.get(node.id)
  if (subtreeBounds) return viewportExcludesBounds(r.worldViewport, subtreeBounds)
  const canCull =
    node.childIds.length === 0 ||
    ((node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') &&
      node.clipsContent)
  if (!canCull) return false

  const vp = r.worldViewport
  const bw = node.width
  const bh = node.height
  if (node.rotation !== 0) {
    const diag = Math.hypot(bw, bh)
    const cx = absX + bw / 2
    const cy = absY + bh / 2
    return (
      cx - diag / 2 > vp.x + vp.w ||
      cy - diag / 2 > vp.y + vp.h ||
      cx + diag / 2 < vp.x ||
      cy + diag / 2 < vp.y
    )
  }
  return absX > vp.x + vp.w || absY > vp.y + vp.h || absX + bw < vp.x || absY + bh < vp.y
}

function applyNodeTransforms(
  _r: SkiaRenderer,
  canvas: Canvas,
  node: SceneNode,
  nodeId: string,
  overlays: RenderOverlays
): void {
  const rotation =
    overlays.rotationPreview?.nodeId === nodeId ? overlays.rotationPreview.angle : node.rotation
  if (rotation !== 0) {
    if (node.type === 'LINE') canvas.rotate(rotation, 0, 0)
    else canvas.rotate(rotation, node.width / 2, node.height / 2)
  }

  if (node.flipX || node.flipY) {
    canvas.translate(node.flipX ? node.width : 0, node.flipY ? node.height : 0)
    canvas.scale(node.flipX ? -1 : 1, node.flipY ? -1 : 1)
  }
}
function renderNodeContent(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  node: SceneNode,
  nodeId: string,
  overlays: RenderOverlays
): void {
  r.pencilShaderRenderCanvas = canvas
  if (node.type === 'SECTION') {
    r.renderSection(canvas, node, graph)
  } else if (node.type === 'COMPONENT_SET') {
    r.renderComponentSet(canvas, node, graph)
  } else if (node.type === 'BOOLEAN_OPERATION') {
    renderBooleanOperation(r, canvas, node, graph)
  } else {
    r.renderShape(canvas, node, graph)
  }

  if (overlays.editingTextId === nodeId && overlays.textEditor?.state?.paragraph) {
    r.drawTextEditOverlay(canvas, node, overlays.textEditor)
  }

  if (overlays.dropTargetId === nodeId) {
    r.auxStroke.setStrokeWidth(DROP_HIGHLIGHT_STROKE / r.zoom)
    r.auxStroke.setColor(r.selColor(DROP_HIGHLIGHT_ALPHA))
    canvas.drawRect(r.ck.LTRBRect(0, 0, node.width, node.height), r.auxStroke)
  }
}

function renderMaskNodeContent(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  node: SceneNode,
  nodeId: string,
  overlays: RenderOverlays
): void {
  canvas.save()
  canvas.translate(node.x, node.y)
  applyNodeTransforms(r, canvas, node, nodeId, overlays)
  renderNodeContent(r, canvas, graph, node, nodeId, {})
  canvas.restore()
}

function renderChildIds(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  childIds: string[],
  overlays: RenderOverlays,
  absX: number,
  absY: number
): void {
  renderMaskedChildIds(
    r,
    canvas,
    childIds,
    (childId) => {
      const child = graph.getNode(childId)
      return child?.visible && child.isMask ? child.maskType : null
    },
    (childId) => r.renderNode(canvas, graph, childId, overlays, absX, absY),
    (childId) => {
      const child = graph.getNode(childId)
      if (child) renderMaskNodeContent(r, canvas, graph, child, childId, overlays)
    },
    (childId) => {
      const child = graph.getNode(childId)
      if (!child) return null
      return { x: child.x, y: child.y, width: child.width, height: child.height }
    }
  )
}

function renderChildren(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  node: SceneNode,
  overlays: RenderOverlays,
  absX: number,
  absY: number
): void {
  if (node.type === 'BOOLEAN_OPERATION') return
  const isClippableContainer =
    node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE'
  if (isClippableContainer && node.clipsContent && node.childIds.length > 0) {
    canvas.save()
    if (nodeHasSmoothCorners(node)) {
      const clipPath = makeSmoothRRectPath(r, node)
      canvas.clipPath(clipPath, r.ck.ClipOp.Intersect, true)
      clipPath.delete()
    } else if (nodeHasRadius(node)) {
      canvas.clipRRect(r.makeRRect(node), r.ck.ClipOp.Intersect, true)
    } else {
      canvas.clipRect(r.ck.LTRBRect(0, 0, node.width, node.height), r.ck.ClipOp.Intersect, true)
    }
    renderChildIds(r, canvas, graph, node.childIds, overlays, absX, absY)
    canvas.restore()
  } else {
    renderChildIds(r, canvas, graph, node.childIds, overlays, absX, absY)
  }
}
export function renderNode(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  nodeId: string,
  overlays: RenderOverlays,
  parentAbsX = 0,
  parentAbsY = 0
): void {
  const node = graph.getNode(nodeId)
  if (
    !node ||
    node.internalOnly ||
    !node.visible ||
    node.isMask ||
    fontManager.isNodeBlocked(nodeId)
  ) {
    return
  }

  // Hide the node being edited in node-edit mode (overlay draws it live)
  if (overlays.nodeEditState?.nodeId === nodeId) return

  r._nodeCount++

  const absX = parentAbsX + node.x
  const absY = parentAbsY + node.y

  if (isCulled(r, node, absX, absY)) {
    r._culledCount++
    return
  }

  canvas.save()
  canvas.translate(node.x, node.y)

  const needsNodeLayer = node.opacity < 1 || needsIsolatedBlendLayer(node.blendMode)
  if (needsNodeLayer) {
    r.opacityPaint.setAlphaf(node.opacity)
    setFigmaPaintBlendMode(r, r.opacityPaint, node.blendMode)
    // The current canvas already includes ancestor transforms. World-space
    // bounds cannot be used as local layer bounds; retain its existing clip.
    canvas.saveLayer(r.opacityPaint)
  }

  const layerBlur = node.effects.find(
    (e) => e.visible && (e.type === 'LAYER_BLUR' || e.type === 'FOREGROUND_BLUR')
  )
  if (layerBlur) {
    // Entry guard: reset shared paint to known state
    r.effectLayerPaint.setImageFilter(null)
    r.effectLayerPaint.setColorFilter(null)
    r.effectLayerPaint.setBlendMode(r.ck.BlendMode.SrcOver)

    r.effectLayerPaint.setImageFilter(r.getCachedBlur(layerBlur.radius / 2))
    const blurPadding = layerBlur.radius * 2
    canvas.saveLayer(
      r.effectLayerPaint,
      r.ck.LTRBRect(-blurPadding, -blurPadding, node.width + blurPadding, node.height + blurPadding)
    )
  }

  applyNodeTransforms(r, canvas, node, nodeId, overlays)
  renderNodeContent(r, canvas, graph, node, nodeId, overlays)
  drawLayoutGrids(r, canvas, node)
  if (shouldRenderSubtreeDetail(r, node)) {
    renderChildren(r, canvas, graph, node, overlays, absX, absY)
  } else {
    r._culledCount += node.childIds.length
  }

  if (layerBlur) {
    canvas.restore()
    // Exit guard: ensure shared paint is in clean state
    r.effectLayerPaint.setImageFilter(null)
    r.effectLayerPaint.setColorFilter(null)
    r.effectLayerPaint.setBlendMode(r.ck.BlendMode.SrcOver)
  }
  if (needsNodeLayer) {
    canvas.restore()
    r.opacityPaint.setAlphaf(1)
    r.opacityPaint.setBlendMode(r.ck.BlendMode.SrcOver)
  }
  canvas.restore()
}

function makeNodeRRect(r: SkiaRenderer, node: SceneNode, radius: number): Float32Array {
  const rect = r.ck.LTRBRect(0, 0, node.width, node.height)
  return r.ck.RRectXY(rect, radius, radius)
}

function forVisibleStrokes(
  r: SkiaRenderer,
  node: SceneNode,
  graph: SceneGraph,
  draw: (stroke: SceneNode['strokes'][number], color: Color) => void
): void {
  for (let index = 0; index < node.strokes.length; index++) {
    const stroke = node.strokes[index]
    if (!stroke.visible) continue
    r.strokePaint.setShader(null)
    r.fillPaint.setShader(null)
    setFigmaPaintBlendMode(r, r.strokePaint, stroke.blendMode)
    setFigmaPaintBlendMode(r, r.fillPaint, stroke.blendMode)
    if (stroke.type?.startsWith('GRADIENT') && stroke.gradientStops && stroke.gradientTransform) {
      applyGradientFill(r, stroke, node, graph, r.strokePaint)
      applyGradientFill(r, stroke, node, graph, r.fillPaint)
    }
    try {
      draw(stroke, r.resolveStrokeColor(stroke, index, node, graph))
    } finally {
      r.strokePaint.setShader(null)
      r.fillPaint.setShader(null)
      r.strokePaint.setBlendMode(r.ck.BlendMode.SrcOver)
      r.fillPaint.setBlendMode(r.ck.BlendMode.SrcOver)
    }
  }
}

export function renderSection(
  r: SkiaRenderer,
  canvas: Canvas,
  node: SceneNode,
  graph: SceneGraph
): void {
  const rrect = makeNodeRRect(r, node, SECTION_CORNER_RADIUS)

  drawVisibleFills(r, node, graph, () => canvas.drawRRect(rrect, r.fillPaint))

  forVisibleStrokes(r, node, graph, (stroke, color) => {
    configureStrokePaint(r, node, stroke, color)

    if (node.independentStrokeWeights) r.drawIndividualSideStrokes(canvas, node, stroke.align)
    else r.drawRRectStrokeWithAlign(canvas, rrect, node, stroke)
  })
}

export function renderComponentSet(
  r: SkiaRenderer,
  canvas: Canvas,
  node: SceneNode,
  graph: SceneGraph
): void {
  const rrect = makeNodeRRect(r, node, 5)

  drawVisibleFills(r, node, graph, () => canvas.drawRRect(rrect, r.fillPaint))

  const visibleStrokes = node.strokes.filter((stroke) => stroke.visible)
  if (visibleStrokes.length > 0) {
    forVisibleStrokes(r, node, graph, (stroke, color) => {
      const dashPhase = stroke.dashPattern?.[1] ?? 0
      if (stroke.dashPattern && stroke.dashPattern.length > 0) {
        drawDashedRRectWithSolidCorners(r, canvas, node, stroke, color, 5, dashPhase)
      } else {
        drawStyledRRectStroke(r, canvas, rrect, node, stroke, color, dashPhase)
      }
    })
    return
  }

  r.auxStroke.setStrokeWidth(r.COMPONENT_SET_BORDER_WIDTH / r.zoom)
  r.auxStroke.setColor(r.compColor())
  r.auxStroke.setPathEffect(
    r.ck.PathEffect.MakeDash([r.COMPONENT_SET_DASH / r.zoom, r.COMPONENT_SET_DASH_GAP / r.zoom], 0)
  )
  canvas.drawRRect(rrect, r.auxStroke)
  r.auxStroke.setPathEffect(null)
}

export function renderShape(
  r: SkiaRenderer,
  canvas: Canvas,
  node: SceneNode,
  graph: SceneGraph
): void {
  const hasEffects = node.effects.length > 0 && node.effects.some((e) => e.visible)

  if (hasEffects) {
    const cached = r.nodePictureCache.get(node.id)
    const cachedGeneration = r.nodePictureCacheGenerations.get(node.id)
    if (cached && cachedGeneration === r.fontGeneration) {
      canvas.drawPicture(cached)
      return
    }
    if (cached) cached.delete()
    r.nodePictureCache.delete(node.id)
    r.nodePictureCacheGenerations.delete(node.id)

    const margin = r.effectOverflow(node)
    const bounds = r.ck.LTRBRect(-margin, -margin, node.width + margin, node.height + margin)
    const recorder = new r.ck.PictureRecorder()
    const recCanvas = recorder.beginRecording(bounds)
    r.renderShapeUncached(recCanvas, node, graph)
    const picture = recorder.finishRecordingAsPicture()
    recorder.delete()
    r.nodePictureCache.set(node.id, picture)
    r.nodePictureCacheGenerations.set(node.id, r.fontGeneration)
    canvas.drawPicture(picture)
  } else {
    r.renderShapeUncached(canvas, node, graph)
  }
}

function getShadowShapeChild(node: SceneNode, graph: SceneGraph): SceneNode | null {
  if (node.fills.some((f) => f.visible)) return null
  if (node.strokes.some((stroke) => stroke.visible)) return null
  if (node.childIds.length === 0) return null
  const child = graph.getNode(node.childIds[0])
  if (!child?.visible) return null
  return child
}

function drawVectorStrokeGeometry(
  r: SkiaRenderer,
  canvas: Canvas,
  sg: Path[],
  sc: Color,
  opacity: number
): void {
  r.fillPaint.setColor(r.ck.Color4f(sc.r, sc.g, sc.b, sc.a))
  r.fillPaint.setAlphaf(opacity)
  r.fillPaint.setShader(null)
  for (const p of sg) canvas.drawPath(p, r.fillPaint)
}

function vectorStrokePaths(r: SkiaRenderer, node: SceneNode): Path[] | null {
  if (!node.vectorNetwork) return null
  const cached = r.vectorStrokePathCache.get(node.id)
  if (cached) return cached
  if (node.vectorNetwork.segments.length === 0) return null
  // A stroke join exists only when adjacent network segments share one Skia
  // path. Rebuilding one path per segment preserves the curves but turns every
  // shared vertex into two caps. The centerline builder retains every connected
  // chain as a subpath, including disconnected chains and curved segments.
  const paths = [vectorNetworkToCenterlinePath(r.ck, node.vectorNetwork)]
  r.vectorStrokePathCache.set(node.id, paths)
  return paths
}

function drawVectorPathStrokes(
  r: SkiaRenderer,
  canvas: Canvas,
  vectorPaths: Path[],
  stroke: SceneNode['strokes'][0],
  sc: Color,
  strokeCap: string | undefined,
  strokeJoin: string | undefined,
  miterLimit: number,
  outlineCacheKey?: string
): void {
  if (stroke.align === 'INSIDE' || stroke.align === 'OUTSIDE') {
    const boundary = new r.ck.Path()
    for (const path of vectorPaths) boundary.addPath(path)
    const fillType = vectorPaths[0]?.getFillType()
    if (fillType !== undefined) boundary.setFillType(fillType)
    canvas.save()
    try {
      canvas.clipPath(
        boundary,
        stroke.align === 'INSIDE' ? r.ck.ClipOp.Intersect : r.ck.ClipOp.Difference,
        true
      )
      drawVectorPathStrokes(
        r,
        canvas,
        vectorPaths,
        { ...stroke, align: 'CENTER', weight: stroke.weight * 2 },
        sc,
        strokeCap,
        strokeJoin,
        miterLimit
      )
    } finally {
      canvas.restore()
      boundary.delete()
    }
    return
  }
  const cap = stroke.cap ?? strokeCap ?? 'NONE'
  const join = stroke.join ?? strokeJoin ?? 'MITER'
  const dash = stroke.dashPattern
  if (dash && dash.length > 0) {
    r.strokePaint.setColor(r.ck.Color4f(sc.r, sc.g, sc.b, sc.a))
    r.strokePaint.setAlphaf(stroke.opacity)
    r.strokePaint.setStrokeWidth(stroke.weight)
    r.strokePaint.setStrokeCap(getStrokeCapEntity(r, cap))
    r.strokePaint.setStrokeJoin(getStrokeJoinEntity(r, join))
    r.strokePaint.setStrokeMiter(miterLimit)
    r.strokePaint.setShader(null)
    const effect = r.ck.PathEffect.MakeDash(dash, 0)
    r.strokePaint.setPathEffect(effect)
    for (const vp of vectorPaths) canvas.drawPath(vp, r.strokePaint)
    r.strokePaint.setPathEffect(null)
    effect.delete()
    return
  }
  const strokeOpts = {
    width: stroke.weight,
    miter_limit: miterLimit,
    cap: getStrokeCapEntity(r, cap),
    join: getStrokeJoinEntity(r, join)
  }
  r.fillPaint.setColor(r.ck.Color4f(sc.r, sc.g, sc.b, sc.a))
  r.fillPaint.setAlphaf(stroke.opacity)
  r.fillPaint.setShader(null)

  let outlines = outlineCacheKey ? r.vectorStrokeOutlineCache.get(outlineCacheKey) : undefined
  if (!outlines) {
    outlines = []
    for (const vp of vectorPaths) {
      const outline = vp.copy().stroke(strokeOpts)
      if (outline) outlines.push(outline)
    }
    if (outlineCacheKey) r.vectorStrokeOutlineCache.set(outlineCacheKey, outlines)
  }
  for (const outline of outlines) canvas.drawPath(outline, r.fillPaint)
  if (!outlineCacheKey) for (const outline of outlines) outline.delete()
}

function drawRegularStroke(
  r: SkiaRenderer,
  canvas: Canvas,
  node: SceneNode,
  rect: Float32Array,
  hasRadius: boolean,
  stroke: SceneNode['strokes'][0],
  sc: Color
): void {
  configureStrokePaint(r, node, stroke, sc)
  if (stroke.dashPattern && stroke.dashPattern.length > 0) {
    r.strokePaint.setPathEffect(r.ck.PathEffect.MakeDash(stroke.dashPattern, 0))
  } else {
    r.strokePaint.setPathEffect(null)
  }

  if (node.independentStrokeWeights && r.isRectangularType(node.type)) {
    r.drawIndividualSideStrokes(canvas, node, stroke.align)
  } else {
    r.drawStrokeWithAlign(canvas, node, rect, hasRadius, stroke.align)
  }
}

function drawNodeStroke(
  r: SkiaRenderer,
  canvas: Canvas,
  node: SceneNode,
  rect: Float32Array,
  hasRadius: boolean,
  stroke: SceneNode['strokes'][0],
  sc: Color,
  sg: Path[] | null,
  vectorPaths: Path[] | null,
  vectorStroke: Path[] | null
): void {
  const shouldStrokeVectorCenterline =
    vectorStroke &&
    stroke.align === 'CENTER' &&
    node.cornerRadius === 0 &&
    node.type === 'VECTOR' &&
    !node.fills.some((fill) => fill.visible)
  if (shouldStrokeVectorCenterline) {
    const outlineKey = `${node.id}|${stroke.weight}|${stroke.cap ?? node.strokeCap}|${stroke.join ?? node.strokeJoin}|${node.strokeMiterLimit}`
    drawVectorPathStrokes(
      r,
      canvas,
      vectorStroke,
      stroke,
      sc,
      node.strokeCap,
      node.strokeJoin,
      node.strokeMiterLimit,
      outlineKey
    )
    return
  }
  if (!sg) {
    if (vectorPaths) {
      drawVectorPathStrokes(
        r,
        canvas,
        vectorPaths,
        stroke,
        sc,
        node.strokeCap,
        node.strokeJoin,
        node.strokeMiterLimit
      )
    } else drawRegularStroke(r, canvas, node, rect, hasRadius, stroke, sc)
    return
  }
  if (stroke.align !== 'INSIDE') {
    if (node.type === 'VECTOR') drawVectorStrokeGeometry(r, canvas, sg, sc, stroke.opacity)
    else drawRegularStroke(r, canvas, node, rect, hasRadius, stroke, sc)
    return
  }

  const clipPaths = node.type === 'VECTOR' ? r.getFillGeometry(node) : null
  if (node.type === 'VECTOR' && !clipPaths) {
    drawVectorStrokeGeometry(r, canvas, sg, sc, stroke.opacity)
    return
  }

  canvas.save()
  if (clipPaths) {
    for (const path of clipPaths) canvas.clipPath(path, r.ck.ClipOp.Intersect, true)
  } else {
    r.clipNodeShape(canvas, node, rect, hasRadius)
  }
  drawVectorStrokeGeometry(r, canvas, sg, sc, stroke.opacity)
  canvas.restore()
}

export function renderShapeUncached(
  r: SkiaRenderer,
  canvas: Canvas,
  node: SceneNode,
  graph: SceneGraph
): void {
  const rect = r.ck.LTRBRect(0, 0, node.width, node.height)
  const hasRadius = nodeHasRadius(node)

  const shadowChild = getShadowShapeChild(node, graph)
  r.renderEffects(canvas, node, rect, hasRadius, 'behind', shadowChild)

  if (!drawVectorMultiStyleFills(r, canvas, node, graph)) {
    drawVisibleFills(r, node, graph, (fill) => r.drawNodeFill(canvas, node, rect, hasRadius, fill))
  }

  const sg = node.strokeGeometry.length > 0 ? r.getStrokeGeometry(node) : null
  const vectorPaths = node.type === 'VECTOR' ? r.getVectorPaths(node) : null
  const vectorStroke = node.type === 'VECTOR' ? vectorStrokePaths(r, node) : null
  forVisibleStrokes(r, node, graph, (stroke, color) => {
    if (
      stroke.dashPattern &&
      stroke.dashPattern.length > 0 &&
      node.type === 'VECTOR' &&
      node.vectorNetwork
    ) {
      const centerline = vectorNetworkToCenterlinePath(r.ck, node.vectorNetwork)
      drawVectorPathStrokes(
        r,
        canvas,
        [centerline],
        stroke,
        color,
        node.strokeCap,
        node.strokeJoin,
        node.strokeMiterLimit
      )
      centerline.delete()
      return
    }
    drawNodeStroke(r, canvas, node, rect, hasRadius, stroke, color, sg, vectorPaths, vectorStroke)
  })
  r.renderEffects(canvas, node, rect, hasRadius, 'front', shadowChild)
}

function isGradientFill(fill?: Fill): boolean {
  return fill?.type.startsWith('GRADIENT') === true
}

function shouldRenderTextAsOutline(fill?: Fill): boolean {
  return fill !== undefined && fill.type !== 'SOLID'
}

export function textVerticalOffset(node: SceneNode, contentHeight: number): number {
  const available = Math.max(0, node.height - contentHeight)
  if (node.textAlignVertical === 'CENTER') return available / 2
  if (node.textAlignVertical === 'BOTTOM') return available
  return 0
}

function drawOutlinedText(
  r: SkiaRenderer,
  canvas: Canvas,
  node: SceneNode,
  paragraphY: number
): boolean {
  const outlineNode =
    node.textCase === 'ORIGINAL'
      ? node
      : { ...node, text: transformTextCase(node.text, node.textCase), styleRuns: [] }
  const path = textNodeToOutlinePath(r, outlineNode)
  if (!path) return false
  canvas.save()
  canvas.translate(0, paragraphY)
  canvas.drawPath(path, r.fillPaint)
  canvas.restore()
  path.delete()
  return true
}

function drawGradientText(r: SkiaRenderer, canvas: Canvas, node: SceneNode): boolean {
  if (!r.fontsLoaded || !r.fontProvider) return false

  const paragraph = r.buildParagraph(node, r.ck.Color4f(0, 0, 0, 1), {
    halfLeading: true
  })
  try {
    const paragraphY = textVerticalOffset(node, paragraph.getHeight())
    r.effectLayerPaint.setImageFilter(null)
    r.effectLayerPaint.setColorFilter(null)
    r.effectLayerPaint.setBlendMode(r.ck.BlendMode.SrcOver)
    const bounds = r.ck.LTRBRect(0, paragraphY, node.width, paragraphY + node.height)
    canvas.saveLayer(r.effectLayerPaint, bounds)
    canvas.drawParagraph(paragraph, 0, paragraphY)

    r.effectLayerPaint.setBlendMode(r.ck.BlendMode.SrcIn)
    canvas.saveLayer(r.effectLayerPaint, bounds)
    canvas.drawRect(r.ck.LTRBRect(0, 0, node.width, node.height), r.fillPaint)
    canvas.restore()
    canvas.restore()
    return true
  } finally {
    paragraph.delete()
    r.effectLayerPaint.setImageFilter(null)
    r.effectLayerPaint.setColorFilter(null)
    r.effectLayerPaint.setBlendMode(r.ck.BlendMode.SrcOver)
  }
}

export function renderText(r: SkiaRenderer, canvas: Canvas, node: SceneNode, fill?: Fill): void {
  const text = node.text
  if (!text) return

  canvas.save()
  const shouldClipText = node.textAutoResize === 'NONE' || node.textAutoResize === 'TRUNCATE'
  if (shouldClipText) {
    canvas.clipRect(r.ck.LTRBRect(0, 0, node.width, node.height), r.ck.ClipOp.Intersect, false)
  }

  const fontReadiness = r.nodeFontReadiness(node)
  if (fontReadiness !== 'ready') {
    if (fontReadiness === 'exhausted') {
      if (node.textPicture && r.isTextPictureCurrent(node)) {
        const pic = r.ck.MakePicture(node.textPicture)
        if (pic) {
          canvas.drawPicture(pic)
          pic.delete()
          canvas.restore()
          return
        }
      }
      if (drawFigmaDerivedText(r, canvas, node)) {
        canvas.restore()
        return
      }
    }
    canvas.restore()
    return
  }
  if (shouldRenderTextAsOutline(fill)) {
    let paragraphY = 0
    if (node.textAlignVertical !== 'TOP') {
      const paragraph = r.buildParagraph(node, r.ck.Color4f(0, 0, 0, 1), {
        halfLeading: true
      })
      paragraphY = textVerticalOffset(node, paragraph.getHeight())
      paragraph.delete()
    }
    if (drawOutlinedText(r, canvas, node, paragraphY)) {
      canvas.restore()
      return
    }
  }
  if (isGradientFill(fill) && drawGradientText(r, canvas, node)) {
    canvas.restore()
    return
  }
  if (r.fontsLoaded && r.fontProvider) {
    const paragraph = r.buildParagraph(node, r.fillPaint.getColor(), {
      halfLeading: true
    })
    const paragraphY = textVerticalOffset(node, paragraph.getHeight())
    canvas.drawParagraph(paragraph, 0, paragraphY)
    paragraph.delete()
  } else if (r.textFont) {
    const fontSize = node.fontSize || r.DEFAULT_FONT_SIZE
    const paragraphY = textVerticalOffset(node, fontSize)
    canvas.drawText(
      transformTextCase(text, node.textCase),
      0,
      paragraphY + fontSize,
      r.fillPaint,
      r.textFont
    )
  }

  canvas.restore()
}
