import { mergeVectorNetworks, SceneGraph } from '@open-pencil/scene-graph'
import type { GeometryPath, LayoutMode, LayoutSizing, SceneNode, VectorNetwork } from '@open-pencil/scene-graph'
import { copyEffects, copyFills, copyStrokes } from '@open-pencil/scene-graph/copy'
import { populateInstanceChildren } from '@open-pencil/scene-graph/instances'
import { parseSVGPath } from '@open-pencil/scene-graph/parse-path'

import {
  applyCornerRadius,
  applyPadding,
  bindIfVar,
  buildVarContext,
  convertEffects,
  convertFill,
  convertStroke,
  isVarRef,
  mapAlignItems,
  mapFontWeight,
  mapJustifyContent,
  mapLayoutMode,
  mapNodeType,
  mapTextAlign,
  mapTextAlignVertical,
  parseFillColor,
  parseSize,
  type PenDocument,
  type PenNode,
  type VarContext
} from './convert'

function writePathCommands(network: VectorNetwork, loops: number[][]): Uint8Array {
  const commands: Array<{ code: number; args: number[] }> = []
  for (const loop of loops) {
    if (loop.length === 0) continue
    const firstSegment = network.segments[loop[0]]
    const first = network.vertices[firstSegment.start]
    commands.push({ code: 1, args: [first.x, first.y] })
    for (const segmentIndex of loop) {
      const segment = network.segments[segmentIndex]
      const start = network.vertices[segment.start]
      const end = network.vertices[segment.end]
      const t1 = segment.tangentStart
      const t2 = segment.tangentEnd
      const curved = t1.x !== 0 || t1.y !== 0 || t2.x !== 0 || t2.y !== 0
      commands.push(curved
        ? { code: 4, args: [start.x + t1.x, start.y + t1.y, end.x + t2.x, end.y + t2.y, end.x, end.y] }
        : { code: 2, args: [end.x, end.y] })
    }
    commands.push({ code: 0, args: [] })
  }
  const size = commands.reduce((total, command) => total + 1 + command.args.length * 4, 0)
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  let offset = 0
  for (const command of commands) {
    bytes[offset++] = command.code
    for (const value of command.args) {
      view.setFloat32(offset, value, true)
      offset += 4
    }
  }
  return bytes
}

function regenerateIconFillGeometry(network: VectorNetwork, styles: GeometryPath[]): GeometryPath[] {
  return network.regions.map((region, index) => ({
    ...(styles[index] ?? {}),
    windingRule: region.windingRule,
    commandsBlob: writePathCommands(network, region.loops)
  }))
}

function scaleVectorNetwork(
  vn: VectorNetwork,
  targetW: number,
  targetH: number,
  viewBox?: number[]
): void {
  if (vn.vertices.length === 0) return
  if (viewBox?.length === 4 && viewBox[2] !== 0 && viewBox[3] !== 0) {
    const [viewX, viewY, viewWidth, viewHeight] = viewBox
    const sx = targetW / viewWidth
    const sy = targetH / viewHeight
    for (const vertex of vn.vertices) {
      vertex.x = (vertex.x - viewX) * sx
      vertex.y = (vertex.y - viewY) * sy
    }
    for (const segment of vn.segments) {
      segment.tangentStart = { x: segment.tangentStart.x * sx, y: segment.tangentStart.y * sy }
      segment.tangentEnd = { x: segment.tangentEnd.x * sx, y: segment.tangentEnd.y * sy }
    }
    return
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const v of vn.vertices) {
    minX = Math.min(minX, v.x)
    maxX = Math.max(maxX, v.x)
    minY = Math.min(minY, v.y)
    maxY = Math.max(maxY, v.y)
  }
  const vnW = maxX - minX
  const vnH = maxY - minY
  if (vnW < 0.01 || vnH < 0.01) return
  const sx = targetW / vnW
  const sy = targetH / vnH
  if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return
  for (const v of vn.vertices) {
    v.x = (v.x - minX) * sx
    v.y = (v.y - minY) * sy
  }
  for (const s of vn.segments) {
    s.tangentStart = { x: s.tangentStart.x * sx, y: s.tangentStart.y * sy }
    s.tangentEnd = { x: s.tangentEnd.x * sx, y: s.tangentEnd.y * sy }
  }
}

function resolveFontFamily(raw: string | undefined, ctx: VarContext): string {
  if (!raw) return 'Inter'
  if (isVarRef(raw)) return ctx.resolveString(raw)
  return raw
}

function buildBaseOverrides(pen: PenNode): Partial<SceneNode> {
  return {
    id: pen.id,
    name: pen.name ?? (pen.type === 'icon_font' ? (pen.iconFontName ?? 'Icon') : pen.type),
    x: pen.x ?? 0,
    y: pen.y ?? 0,
    visible: pen.enabled !== false,
    opacity: pen.opacity ?? 1,
    rotation: pen.rotation ?? 0,
    flipX: pen.flipX ?? false,
    flipY: pen.flipY ?? false,
    clipsContent: pen.clip ?? false,
    boundVariables: {},
    strokesIncludedInLayout: pen.layoutIncludeStroke === true
  }
}

function applyAutoLayout(
  overrides: Partial<SceneNode>,
  layoutMode: LayoutMode,
  pen: PenNode,
  widthSizing: LayoutSizing,
  heightSizing: LayoutSizing,
  ctx?: VarContext
): void {
  overrides.layoutMode = layoutMode
  overrides.primaryAxisAlign = mapJustifyContent(pen.justifyContent)
  overrides.counterAxisAlign = mapAlignItems(pen.alignItems)
  overrides.itemSpacing =
    typeof pen.gap === 'string' && isVarRef(pen.gap) && ctx
      ? ctx.resolveNumber(pen.gap)
      : ((pen.gap ?? 0) as number)

  if (layoutMode === 'VERTICAL') {
    overrides.primaryAxisSizing = heightSizing
    overrides.counterAxisSizing = widthSizing
  } else {
    overrides.primaryAxisSizing = widthSizing
    overrides.counterAxisSizing = heightSizing
  }
}

function applyTextProps(node: SceneNode, pen: PenNode, ctx: VarContext): void {
  node.text = pen.type === 'icon_font' ? (pen.iconFontName ?? '') : (pen.content ?? '')
  node.fontFamily =
    pen.type === 'icon_font'
      ? (pen.iconFontFamily ?? 'Material Symbols Sharp')
      : resolveFontFamily(pen.fontFamily, ctx)
  node.fontSize = pen.fontSize ?? 14
  node.fontWeight = mapFontWeight(
    pen.fontWeight ?? (pen.type === 'icon_font' ? pen.weight : undefined)
  )
  node.italic = pen.fontStyle === 'italic' || pen.fontStyle === 'oblique'
  node.textDecoration = pen.underline
    ? 'UNDERLINE'
    : pen.strikethrough ? 'STRIKETHROUGH' : 'NONE'
  node.textAlignHorizontal = mapTextAlign(pen.textAlign)
  node.textAlignVertical = mapTextAlignVertical(pen.textAlignVertical)
  if (pen.lineHeight !== undefined) {
    node.lineHeight = pen.lineHeight < 5 ? pen.lineHeight * node.fontSize : pen.lineHeight
  }
  if (pen.letterSpacing !== undefined) node.letterSpacing = pen.letterSpacing
  node.textAutoResize = pen.textGrowth === 'fixed-width' ? 'HEIGHT' : 'WIDTH_AND_HEIGHT'
  if (pen.fontFamily && isVarRef(pen.fontFamily)) {
    bindIfVar(node, 'fontFamily', pen.fontFamily, ctx)
  }
}

function estimatePenTextWidth(text: string, fontSize: number, letterSpacing = 0): number {
  let em = 0
  for (const character of Array.from(text)) {
    if (/\s/u.test(character) || /[ijlI.,'!|:;]/u.test(character)) em += 0.28
    else if (/[MW@%&]/u.test(character)) em += 0.85
    else if (/[A-Z]/u.test(character)) em += 0.62
    else if (/[0-9]/u.test(character)) em += 0.56
    else em += 0.52
  }
  return em * fontSize + Math.max(0, Array.from(text).length - 1) * letterSpacing
}

function resolveSizing(pen: PenNode, ctx: VarContext) {
  const isTextLike = pen.type === 'text' || pen.type === 'icon_font'
    || (pen.type === 'icon' && Boolean(pen.__canvasIcon?.fontFamily))
  const defaultSize = isTextLike ? 20 : 100
  const defaultW = isTextLike && pen.width === undefined ? 10_000 : defaultSize
  const w = parseSize(pen.width, defaultW, ctx)
  const h = parseSize(pen.height, defaultSize, ctx)
  const layout = mapLayoutMode(pen)

  if (pen.width === undefined && layout !== 'NONE') w.sizing = 'HUG'
  if (pen.height === undefined && layout !== 'NONE') h.sizing = 'HUG'

  return { w, h, layout, isTextLike }
}

function inheritLayoutFromComp(node: SceneNode, pen: PenNode, comp: SceneNode): void {
  const wasRow = node.layoutMode === 'HORIZONTAL'
  node.layoutMode = comp.layoutMode
  node.primaryAxisAlign = comp.primaryAxisAlign
  node.counterAxisAlign = comp.counterAxisAlign
  const isRow = node.layoutMode === 'HORIZONTAL'
  if (wasRow !== isRow) {
    const oldP = node.primaryAxisSizing
    node.primaryAxisSizing = node.counterAxisSizing
    node.counterAxisSizing = oldP
  }
  const widthAxis = isRow ? 'primaryAxisSizing' : 'counterAxisSizing'
  const heightAxis = isRow ? 'counterAxisSizing' : 'primaryAxisSizing'
  if (pen.width === undefined) node[widthAxis] = comp[widthAxis]
  if (pen.height === undefined) node[heightAxis] = comp[heightAxis]
  if (pen.gap === undefined) node.itemSpacing = comp.itemSpacing
  if (pen.padding === undefined) {
    node.paddingTop = comp.paddingTop
    node.paddingRight = comp.paddingRight
    node.paddingBottom = comp.paddingBottom
    node.paddingLeft = comp.paddingLeft
  }
  if (pen.clip === undefined) node.clipsContent = comp.clipsContent
  if (pen.layoutIncludeStroke === undefined)
    node.strokesIncludedInLayout = comp.strokesIncludedInLayout
}

function applyRefVisuals(
  node: SceneNode,
  pen: PenNode,
  compPen: PenNode | undefined,
  ctx: VarContext
): void {
  if (!compPen) return
  if (pen.fill === undefined && compPen.fill !== undefined)
    node.fills = convertFill(compPen.fill, ctx, node)
  if (pen.stroke === undefined && compPen.stroke)
    node.strokes = convertStroke(compPen.stroke, ctx, node)
  if (pen.effect === undefined && compPen.effect) node.effects = convertEffects(compPen.effect)
  if (pen.cornerRadius === undefined) applyCornerRadius(node, compPen.cornerRadius, ctx)
}

function applyRefProps(
  node: SceneNode,
  pen: PenNode,
  graph: SceneGraph,
  componentIds: Map<string, string>,
  penSources: Map<string, PenNode>,
  ctx: VarContext
): void {
  if (!pen.ref) return
  const componentId = componentIds.get(pen.ref) ?? pen.ref
  node.componentId = componentId
  const comp = graph.getNode(componentId)
  if (!comp) return
  if (pen.width === undefined) node.width = comp.width
  if (pen.height === undefined) node.height = comp.height
  if (pen.layout === undefined) inheritLayoutFromComp(node, pen, comp)
  applyRefVisuals(node, pen, penSources.get(pen.ref), ctx)
}

function applyAllRefProps(
  penNodes: PenNode[],
  graph: SceneGraph,
  componentIds: Map<string, string>,
  penSources: Map<string, PenNode>,
  ctx: VarContext
): void {
  for (const pen of penNodes) {
    if (pen.type === 'ref') {
      const node = graph.getNode(pen.id)
      if (node) applyRefProps(node, pen, graph, componentIds, penSources, ctx)
    }
    if (pen.children) applyAllRefProps(pen.children, graph, componentIds, penSources, ctx)
  }
}

function applyCanvasIconDefinition(node: SceneNode, pen: PenNode, ctx: VarContext): void {
  const definition = pen.__canvasIcon
  if (!definition) return
  const colorValue = Array.isArray(pen.fill)
    ? pen.fill.find((fill) => typeof fill === 'string' || fill.enabled !== false)
    : pen.fill
  const parsedColor = parseFillColor(colorValue ?? '#000000', ctx)
  const color = { ...parsedColor, a: 1 }
  if (definition.fontFamily) {
    node.text = definition.content ?? ''
    node.fontFamily = definition.fontFamily
    node.fontWeight = definition.weight ?? 400
    node.fontSize = Math.min(node.width, node.height)
    node.lineHeight = node.height
    node.textAlignHorizontal = 'CENTER'
    node.textAlignVertical = 'CENTER'
    node.textAutoResize = 'NONE'
    node.textPicture = null
    node.figmaDerivedTextGlyphs = null
  } else if (definition.layers) {
    const networks = definition.layers.map((layer) => parseSVGPath(layer.geometry))
    for (const network of networks)
      scaleVectorNetwork(network, node.width, node.height, definition.viewBox)
    const vectorNetwork = mergeVectorNetworks(networks)
    node.vectorNetwork = vectorNetwork
    const placeholders = definition.layers.flatMap((layer, index) =>
      networks[index].regions.map((region) => ({
        windingRule: region.windingRule,
        commandsBlob: new Uint8Array(0),
        fills: [{ type: 'SOLID' as const, visible: true, opacity: parsedColor.a * layer.opacity, color }]
      })))
    node.fillGeometry = regenerateIconFillGeometry(vectorNetwork, placeholders)
    node.fills = []
  } else if (definition.geometry) {
    const vectorNetwork = parseSVGPath(definition.geometry)
    scaleVectorNetwork(vectorNetwork, node.width, node.height, definition.viewBox)
    node.vectorNetwork = vectorNetwork
  }
  if (definition.paint === 'stroke') {
    node.fills = []
    const scale = Math.min(
      node.width / definition.viewBox[2],
      node.height / definition.viewBox[3]
    )
    node.strokes = [{
      visible: true, color, opacity: parsedColor.a,
      weight: (definition.strokeWidth ?? 1) * scale,
      align: 'CENTER', cap: 'ROUND', join: 'ROUND', dashPattern: []
    }]
    node.strokeJoin = 'ROUND'
    node.strokeCap = 'ROUND'
  } else if (!definition.layers) {
    node.strokes = []
    node.fills = [{ type: 'SOLID', visible: true, opacity: parsedColor.a, color }]
  }
}

function applyTheme(theme: Record<string, string>, ctx: VarContext): void {
  const themeName = Object.values(theme)[0]
  if (themeName) ctx.setActiveTheme(themeName)
}

// eslint-disable-next-line complexity -- .pen node mapping touches many format-specific fields
function createSceneNode(
  pen: PenNode,
  parentId: string,
  graph: SceneGraph,
  ctx: VarContext,
  componentIds: Map<string, string>,
  penSources: Map<string, PenNode>
): string | null {
  const sceneType = mapNodeType(pen)
  if (!sceneType) return null
  if (pen.theme) applyTheme(pen.theme, ctx)

  const { w, h, layout, isTextLike } = resolveSizing(pen, ctx)
  const overrides = buildBaseOverrides(pen)
  overrides.width = w.value
  overrides.height = h.value

  const parentLayout = graph.getNode(parentId)?.layoutMode ?? 'NONE'
  if (layout !== 'NONE') {
    const widthSizing =
      parentLayout === 'NONE' && w.sizing === 'FILL' ? ('FIXED' as LayoutSizing) : w.sizing
    const heightSizing =
      parentLayout === 'NONE' && h.sizing === 'FILL' ? ('FIXED' as LayoutSizing) : h.sizing
    applyAutoLayout(overrides, layout, pen, widthSizing, heightSizing, ctx)
  }

  const node = graph.createNode(sceneType, parentId, overrides)
  node.pencilNodeId = pen.id
  node.pencilAddress = pen.id
  node.pencilWidthOmitted = pen.width === undefined
  node.pencilHeightOmitted = pen.height === undefined
  node.layoutWrap = pen.wrap === true || pen.wrap === 'wrap' ? 'WRAP' : 'NO_WRAP'
  node.minWidth = finiteOrNull(pen.minWidth)
  node.maxWidth = finiteOrNull(pen.maxWidth)
  node.minHeight = finiteOrNull(pen.minHeight)
  node.maxHeight = finiteOrNull(pen.maxHeight)
  node.gridTemplateColumns = (pen.gridTemplateColumns ?? []).map(toGridTrack)
  node.gridTemplateRows = (pen.gridTemplateRows ?? []).map(toGridTrack)
  node.gridColumnGap = pen.columnGap ?? (typeof pen.gap === 'number' ? pen.gap : 0)
  node.gridRowGap = pen.rowGap ?? (typeof pen.gap === 'number' ? pen.gap : 0)
  if (pen.gridColumn !== undefined || pen.gridRow !== undefined) {
    const column = gridPlacement(pen.gridColumn)
    const row = gridPlacement(pen.gridRow)
    node.gridPosition = { column: column.start, columnSpan: column.span, row: row.start, rowSpan: row.span }
  }
  if (pen.type === 'polygon') node.pointCount = Math.max(3, Math.round(pen.polygonCount ?? 3))

  if (pen.fill !== undefined) node.fills = convertFill(pen.fill, ctx, node)
  else if (['frame', 'ref', 'script'].includes(pen.type)) node.fills = []
  if (pen.stroke) node.strokes = convertStroke(pen.stroke, ctx, node)
  node.effects = convertEffects(pen.effect)
  applyCornerRadius(node, pen.cornerRadius, ctx)
  applyPadding(node, pen.padding, ctx)

  if (isTextLike) {
    applyTextProps(node, pen, ctx)
    if (pen.height === undefined) {
      node.height = node.fontSize * (node.lineHeight ? node.lineHeight / node.fontSize : 1.2)
    }
    if (pen.width === undefined && !pen.textGrowth)
      node.width = estimatePenTextWidth(node.text, node.fontSize, node.letterSpacing)
  }

  if (pen.type === 'icon' && pen.__canvasIcon) applyCanvasIconDefinition(node, pen, ctx)

  if (pen.type === 'path' && pen.geometry) {
    const vectorNetwork = parseSVGPath(
      pen.geometry,
      pen.fillRule === 'evenodd' ? 'EVENODD' : 'NONZERO'
    )
    node.vectorNetwork = vectorNetwork
    scaleVectorNetwork(vectorNetwork, node.width, node.height, pen.viewBox)
  }

  if (parentLayout !== 'NONE') {
    const parentVertical = parentLayout === 'VERTICAL'
    if (w.sizing === 'FILL') {
      if (parentVertical) node.layoutAlignSelf = 'STRETCH'
      else node.layoutGrow = 1
    }
    if (h.sizing === 'FILL') {
      if (parentVertical) node.layoutGrow = 1
      else node.layoutAlignSelf = 'STRETCH'
    }
  }

  if (pen.reusable) {
    componentIds.set(pen.id, node.id)
    penSources.set(pen.id, pen)
  }

  if (pen.children) {
    for (const child of pen.children) {
      createSceneNode(child, node.id, graph, ctx, componentIds, penSources)
    }
  }

  return node.id
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toGridTrack(value: number | string | { sizing: 'FIXED' | 'FR' | 'AUTO'; value: number }) {
  if (typeof value === 'object') return value
  if (typeof value === 'number') return { sizing: 'FIXED' as const, value }
  if (value === 'auto') return { sizing: 'AUTO' as const, value: 0 }
  const match = /^(\d+(?:\.\d+)?)fr$/u.exec(value)
  if (match) return { sizing: 'FR' as const, value: Number(match[1]) }
  throw new Error(`Invalid grid track ${value}.`)
}

function gridPlacement(value: PenNode['gridColumn'] | PenNode['gridRow']) {
  if (typeof value === 'number') return { start: value, span: 1 }
  return { start: value?.start ?? 1, span: value?.span ?? 1 }
}

function findCloneByComponentId(
  graph: SceneGraph,
  parentId: string,
  origId: string
): SceneNode | undefined {
  const parent = graph.getNode(parentId)
  if (!parent) return undefined
  for (const childId of parent.childIds) {
    const child = graph.getNode(childId)
    if (!child) continue
    if (cloneRepresentsComponent(graph, child, origId)) return child
    const deep = findCloneByComponentId(graph, childId, origId)
    if (deep) return deep
  }
  return undefined
}

function cloneRepresentsComponent(
  graph: SceneGraph,
  node: SceneNode,
  componentId: string
): boolean {
  let currentId = node.componentId
  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    if (currentId === componentId) return true
    visited.add(currentId)
    currentId = graph.getNode(currentId)?.componentId ?? null
  }
  return false
}

function findCloneByComponentPath(
  graph: SceneGraph,
  instanceId: string,
  path: string
): SceneNode | undefined {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return undefined
  let parentId = instanceId
  let match: SceneNode | undefined
  for (const componentId of parts) {
    match = findCloneByComponentId(graph, parentId, componentId)
    if (!match) return undefined
    parentId = match.id
  }
  return match
}

function applyOverrideProps(
  target: SceneNode,
  overrideData: Partial<PenNode>,
  ctx: VarContext
): { width: boolean; height: boolean } {
  const previousIntrinsicHeight = target.height
  let textMetricsChanged = false
  if (overrideData.fill !== undefined) target.fills = convertFill(overrideData.fill, ctx, target)
  if (overrideData.content !== undefined) {
    target.text = overrideData.content
    textMetricsChanged = true
  }
  if (overrideData.fontFamily !== undefined) {
    target.fontFamily = resolveFontFamily(overrideData.fontFamily, ctx)
    textMetricsChanged = true
  }
  if (overrideData.fontSize !== undefined) {
    target.fontSize = overrideData.fontSize
    textMetricsChanged = true
  }
  if (overrideData.fontWeight !== undefined) {
    target.fontWeight = mapFontWeight(overrideData.fontWeight)
    textMetricsChanged = true
  }
  if (overrideData.fontStyle !== undefined) {
    target.italic = overrideData.fontStyle === 'italic' || overrideData.fontStyle === 'oblique'
    textMetricsChanged = true
  }
  if (overrideData.lineHeight !== undefined) {
    target.lineHeight = overrideData.lineHeight < 5
      ? overrideData.lineHeight * target.fontSize
      : overrideData.lineHeight
    textMetricsChanged = true
  }
  if (overrideData.letterSpacing !== undefined) {
    target.letterSpacing = overrideData.letterSpacing
    textMetricsChanged = true
  }
  if (overrideData.textAlign !== undefined)
    target.textAlignHorizontal = mapTextAlign(overrideData.textAlign)
  if (overrideData.textAlignVertical !== undefined)
    target.textAlignVertical = mapTextAlignVertical(overrideData.textAlignVertical)
  if (overrideData.textGrowth !== undefined) {
    target.textAutoResize = overrideData.textGrowth === 'fixed-width' ? 'HEIGHT' : 'WIDTH_AND_HEIGHT'
    textMetricsChanged = true
  }
  if (textMetricsChanged) {
    target.textPicture = null
    target.figmaDerivedTextGlyphs = null
    if (target.textAutoResize === 'WIDTH_AND_HEIGHT') {
      target.width = estimatePenTextWidth(target.text, target.fontSize, target.letterSpacing)
      target.height = target.fontSize * (target.lineHeight ? target.lineHeight / target.fontSize : 1.2)
    }
  }
  if (overrideData.x !== undefined) target.x = overrideData.x
  if (overrideData.y !== undefined) target.y = overrideData.y
  if (overrideData.enabled !== undefined) target.visible = overrideData.enabled
  if (overrideData.width !== undefined)
    target.width = parseSize(overrideData.width, target.width, ctx).value
  if (overrideData.height !== undefined)
    target.height = parseSize(overrideData.height, target.height, ctx).value
  if (overrideData.rotation !== undefined) target.rotation = overrideData.rotation
  if (overrideData.name !== undefined) target.name = overrideData.name
  if (overrideData.__canvasIcon) {
    applyCanvasIconDefinition(target, {
      ...overrideData,
      fill: overrideData.__canvasIconFill
    } as PenNode, ctx)
  }
  const intrinsic = textMetricsChanged
    && target.type === 'TEXT'
    && target.textAutoResize === 'WIDTH_AND_HEIGHT'
  return { width: intrinsic, height: intrinsic && target.height !== previousIntrinsicHeight }
}

function setInstanceAxisToHug(instance: SceneNode, axis: 'width' | 'height'): void {
  const vertical = instance.layoutMode === 'VERTICAL'
  const key = axis === 'width'
    ? vertical ? 'counterAxisSizing' : 'primaryAxisSizing'
    : vertical ? 'primaryAxisSizing' : 'counterAxisSizing'
  instance[key] = 'HUG'
}

function applyIntrinsicOverrideSizing(
  graph: SceneGraph,
  target: SceneNode,
  instance: SceneNode,
  changed: { width: boolean; height: boolean }
): void {
  let current: SceneNode | undefined = target
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.type === 'INSTANCE') {
      if (changed.width && current.pencilWidthOmitted) setInstanceAxisToHug(current, 'width')
      if (changed.height && current.pencilHeightOmitted) setInstanceAxisToHug(current, 'height')
    }
    if (current.id === instance.id) break
    current = current.parentId ? graph.getNode(current.parentId) : undefined
  }
}

function populateInstances(graph: SceneGraph): void {
  for (const node of graph.getAllNodes()) {
    if (node.type === 'INSTANCE' && node.componentId && node.childIds.length === 0) {
      const component = graph.getNode(node.componentId)
      if (component) populateInstanceChildren(graph, node.id, node.componentId)
    }
  }
}

function applyDescendantOverrides(
  graph: SceneGraph,
  pen: PenNode,
  ctx: VarContext,
  componentIds: Map<string, string>,
  penSources: Map<string, PenNode>
): void {
  if (pen.type !== 'ref' || !pen.descendants) return
  const instanceNode = graph.getNode(pen.id)
  if (!instanceNode) return

  for (const [origId, overrideData] of Object.entries(pen.descendants)) {
    const clone = findCloneByComponentPath(graph, instanceNode.id, origId)

    if (clone) {
      if (overrideData.children) {
        const toDelete = clone.childIds.slice()
        for (const childId of toDelete) graph.deleteNode(childId)
        for (const child of overrideData.children) {
          createSceneNode(child, clone.id, graph, ctx, componentIds, penSources)
        }
      }
      const changed = applyOverrideProps(clone, overrideData, ctx)
      applyIntrinsicOverrideSizing(graph, clone, instanceNode, changed)
      continue
    }

    if (overrideData.type && overrideData.id) {
      createSceneNode(
        overrideData as PenNode,
        instanceNode.id,
        graph,
        ctx,
        componentIds,
        penSources
      )
    }
  }
}

function walkAndApplyOverrides(
  nodes: PenNode[],
  graph: SceneGraph,
  ctx: VarContext,
  componentIds: Map<string, string>,
  penSources: Map<string, PenNode>
): void {
  for (const pen of nodes) {
    applyDescendantOverrides(graph, pen, ctx, componentIds, penSources)
    if (pen.children) walkAndApplyOverrides(pen.children, graph, ctx, componentIds, penSources)
  }
}

function collectComponentIds(nodes: PenNode[], map: Map<string, string>): void {
  for (const node of nodes) {
    if (node.reusable) map.set(node.id, node.id)
    if (node.children) collectComponentIds(node.children, map)
  }
}

function resolveNodeVars(node: SceneNode, graph: SceneGraph, ctx: VarContext): void {
  for (const [key, varId] of Object.entries(node.boundVariables)) {
    const variable = graph.variables.get(varId)
    if (!variable) continue
    const modeVal =
      variable.valuesByMode[ctx.activeModeId] ?? Object.values(variable.valuesByMode)[0]
    if (key.startsWith('fills[') && typeof modeVal === 'object' && 'r' in modeVal) {
      const idx = Number.parseInt(key.match(/\d+/)?.[0] ?? '0', 10)
      if (node.fills[idx]) node.fills[idx].color = modeVal
    } else if (key.startsWith('strokes[') && typeof modeVal === 'object' && 'r' in modeVal) {
      const idx = Number.parseInt(key.match(/\d+/)?.[0] ?? '0', 10)
      if (node.strokes[idx]) node.strokes[idx].color = modeVal
    }
  }
  for (const childId of node.childIds) {
    const child = graph.getNode(childId)
    if (child) resolveNodeVars(child, graph, ctx)
  }
}

function resolveThemeVariables(penNodes: PenNode[], graph: SceneGraph, ctx: VarContext): void {
  for (const pen of penNodes) {
    if (pen.theme) applyTheme(pen.theme, ctx)
    const node = graph.getNode(pen.id)
    if (node) resolveNodeVars(node, graph, ctx)
    if (pen.children) resolveThemeVariables(pen.children, graph, ctx)
  }
}

function fixInstanceWidths(graph: SceneGraph): void {
  for (const node of graph.getAllNodes()) {
    if (node.type !== 'INSTANCE' || !node.componentId) continue
    const comp = graph.getNode(node.componentId)
    if (!comp) continue
    if (node.width <= 100 && comp.width > 100) node.width = comp.width
    if (node.height <= 100 && comp.height > 100) node.height = comp.height
    if (comp.layoutGrow > 0) node.layoutGrow = comp.layoutGrow
    if (comp.layoutAlignSelf !== 'AUTO') node.layoutAlignSelf = comp.layoutAlignSelf
    node.fills = copyFills(node.fills)
    node.strokes = copyStrokes(node.strokes)
    node.effects = copyEffects(node.effects)
  }
}

function fixTextWidths(graph: SceneGraph): void {
  for (const node of graph.getAllNodes()) {
    if (node.type !== 'TEXT' || !node.text || node.text.length <= 1) continue
    if (node.width >= node.fontSize * 2) continue
    node.width = node.text.length * node.fontSize * 0.65
  }
}

export function parsePenFile(json: string | PenDocument): SceneGraph {
  const doc: PenDocument = typeof json === 'string' ? JSON.parse(json) : json
  const graph = new SceneGraph()

  for (const page of graph.getPages(true)) {
    graph.deleteNode(page.id)
  }

  const ctx = buildVarContext(graph, doc.variables ?? {}, doc.themes ?? {})
  const componentIds = new Map<string, string>()
  const penSources = new Map<string, PenNode>()

  collectComponentIds(doc.children, componentIds)

  const page = graph.addPage(doc.children[0]?.name ?? 'Page 1')
  for (const child of doc.children) {
    createSceneNode(
      child,
      child.__canvasImported ? graph.rootId : page.id,
      graph,
      ctx,
      componentIds,
      penSources
    )
  }

  applyAllRefProps(doc.children, graph, componentIds, penSources, ctx)
  populateInstances(graph)
  walkAndApplyOverrides(doc.children, graph, ctx, componentIds, penSources)
  populateInstances(graph)
  resolveThemeVariables(doc.children, graph, ctx)
  fixInstanceWidths(graph)
  fixTextWidths(graph)

  if (graph.getPages(true).length === 0) {
    graph.addPage('Page 1')
  }

  return graph
}

export async function readPenFile(file: File): Promise<SceneGraph> {
  return parsePenFile(await file.text())
}
