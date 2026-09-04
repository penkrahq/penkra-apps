import { generateId } from '@open-pencil/scene-graph'
import type {
  Color,
  Effect,
  Fill,
  LayoutAlign,
  LayoutCounterAlign,
  LayoutMode,
  LayoutSizing,
  NodeType,
  SceneGraph,
  SceneNode,
  Stroke,
  StrokeCap,
  StrokeJoin,
  TextAlignVertical,
  Variable,
  VariableCollection,
  VariableCollectionMode,
  VariableType,
  VariableValue
} from '@open-pencil/scene-graph'
import { BLACK } from '@open-pencil/scene-graph/constants'
import type { Vector } from '@open-pencil/scene-graph/primitives'

import { parseColor } from './color'

export interface PenDocument {
  version: string
  children: PenNode[]
  themes?: Record<string, string[]>
  variables?: Record<string, PenVariable>
}

export interface PenVariable {
  type: 'color' | 'string' | 'number'
  value: PenVariableValue[] | PenVariableValue | string | number
}

interface PenVariableValue {
  value: string | number
  theme?: Record<string, string>
}

interface PenStroke {
  align: 'inside' | 'center' | 'outside'
  thickness: number | { top?: number; right?: number; bottom?: number; left?: number }
  fill?: string
  fills?: PenFillObject[]
  join?: string
  cap?: string
  dashPattern?: number[]
}

interface PenEffect {
  type: string
  shadowType?: string
  color?: string
  offset?: Vector
  blur?: number
  spread?: number
  radius?: number
  enabled?: boolean
  blendMode?: string
}

interface PenFillObject {
  type: string
  color?: string
  enabled?: boolean
  opacity?: number
  blendMode?: string
  gradientType?: string
  colors?: Array<{ color: string; position: number }>
  center?: Vector
  size?: { width?: number; height?: number }
  rotation?: number
  __canvasShader?: unknown
  __canvasMesh?: unknown
}

type PenFill = string | PenFillObject | PenFillObject[]

export interface PenNode {
  type: string
  id: string
  name?: string
  x?: number
  y?: number
  width?: number | string
  height?: number | string
  fill?: PenFill
  opacity?: number
  enabled?: boolean
  clip?: boolean
  rotation?: number
  flipX?: boolean
  flipY?: boolean
  reusable?: boolean
  cornerRadius?: number | string | (number | string)[]
  stroke?: PenStroke
  effect?: PenEffect | PenEffect[]
  layout?: string
  wrap?: boolean | string
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  rowGap?: number
  columnGap?: number
  gridTemplateColumns?: Array<number | string | { sizing: 'FIXED' | 'FR' | 'AUTO'; value: number }>
  gridTemplateRows?: Array<number | string | { sizing: 'FIXED' | 'FR' | 'AUTO'; value: number }>
  gridColumn?: number | { start: number; span?: number }
  gridRow?: number | { start: number; span?: number }
  gap?: number | string
  padding?: number | string | (number | string)[]
  justifyContent?: string
  alignItems?: string
  children?: PenNode[]
  content?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string | number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: string
  textAlignVertical?: string
  textGrowth?: string
  ref?: string
  descendants?: Record<string, Partial<PenNode>>
  slot?: string[]
  geometry?: string
  iconFontName?: string
  iconFontFamily?: string
  weight?: number
  model?: string
  theme?: Record<string, string>
  layoutIncludeStroke?: boolean
  polygonCount?: number
  fillRule?: string
  viewBox?: number[]
  fontStyle?: string
  underline?: boolean
  strikethrough?: boolean
  __canvasIcon?: {
    content?: string
    fontFamily?: string
    geometry?: string
    layers?: Array<{ geometry: string; opacity: number }>
    viewBox: number[]
    weight?: number
    paint?: string
    strokeWidth?: number
  }
  __canvasIconFill?: PenFill
  __canvasScript?: unknown
  __canvasSticky?: unknown
  __canvasImported?: boolean
}

export interface VarContext {
  byName: Map<string, { id: string; variable: Variable }>
  activeModeId: string
  collectionId: string
  modeByThemeName: Map<string, string>
  resolveColor(ref: string): Color
  resolveNumber(ref: string): number
  resolveString(ref: string): string
  setActiveTheme(themeName: string): void
}

function penVarTypeToSceneType(t: string): VariableType {
  if (t === 'color') return 'COLOR'
  if (t === 'number') return 'FLOAT'
  return 'STRING'
}

function penValueToSceneValue(raw: string | number, type: VariableType): VariableValue {
  if (type === 'COLOR' && typeof raw === 'string') return parseColor(raw)
  if (type === 'FLOAT' && typeof raw === 'number') return raw
  if (type === 'STRING') return String(raw)
  if (typeof raw === 'number') return raw
  return String(raw)
}

function defaultForType(type: VariableType): VariableValue {
  if (type === 'COLOR') return { ...BLACK }
  if (type === 'FLOAT') return 0
  if (type === 'BOOLEAN') return false
  return ''
}

export function isVarRef(val: unknown): val is string {
  return typeof val === 'string' && val.startsWith('$--')
}

function varName(ref: string): string {
  return ref.replace(/^\$/, '')
}

export function bindIfVar(node: SceneNode, field: string, val: unknown, ctx: VarContext): void {
  if (!isVarRef(val)) return
  const entry = ctx.byName.get(varName(val))
  if (entry) node.boundVariables[field] = entry.id
}

export function buildVarContext(
  graph: SceneGraph,
  penVars: Record<string, PenVariable>,
  themes: Record<string, string[]>
): VarContext {
  const collectionId = generateId()
  const modes: VariableCollectionMode[] = []
  const themeKeys = Object.keys(themes)

  if (themeKeys.length > 0) {
    const themeKey = themeKeys[0]
    for (const modeName of themes[themeKey]) {
      modes.push({ modeId: generateId(), name: modeName })
    }
  }
  if (modes.length === 0) {
    modes.push({ modeId: generateId(), name: 'Default' })
  }

  const collection: VariableCollection = {
    id: collectionId,
    name: 'Variables',
    modes,
    defaultModeId: modes[0].modeId,
    variableIds: []
  }
  graph.addCollection(collection)

  const modeByThemeValue = new Map<string, string>()
  if (themeKeys.length > 0) {
    const themeKey = themeKeys[0]
    for (const mode of modes) {
      modeByThemeValue.set(`${themeKey}:${mode.name}`, mode.modeId)
    }
  }

  const byName = new Map<string, { id: string; variable: Variable }>()

  for (const [name, def] of Object.entries(penVars)) {
    const varId = generateId()
    const varType = penVarTypeToSceneType(def.type)
    const valuesByMode: Record<string, VariableValue> = {}

    if (Array.isArray(def.value)) {
      for (const entry of def.value) {
        if (entry.theme) {
          const [tKey, tVal] = Object.entries(entry.theme)[0]
          const modeId = modeByThemeValue.get(`${tKey}:${tVal}`)
          if (modeId) valuesByMode[modeId] = penValueToSceneValue(entry.value, varType)
        } else {
          valuesByMode[modes[0].modeId] = penValueToSceneValue(entry.value, varType)
        }
      }
    } else {
      valuesByMode[modes[0].modeId] = penValueToSceneValue(def.value as string | number, varType)
    }

    for (const mode of modes) {
      if (!(mode.modeId in valuesByMode)) {
        valuesByMode[mode.modeId] = valuesByMode[modes[0].modeId] ?? defaultForType(varType)
      }
    }

    const variable: Variable = {
      id: varId,
      name,
      type: varType,
      collectionId,
      valuesByMode,
      description: '',
      hiddenFromPublishing: false
    }
    graph.addVariable(variable)
    byName.set(name, { id: varId, variable })
  }

  let activeModeId = modes[0].modeId

  function resolveVal(ref: string): VariableValue | undefined {
    const entry = byName.get(ref.replace(/^\$/, ''))
    if (!entry) return undefined
    return (
      entry.variable.valuesByMode[activeModeId] ?? Object.values(entry.variable.valuesByMode)[0]
    )
  }

  return {
    byName,
    activeModeId,
    collectionId,
    modeByThemeName: modeByThemeValue,
    resolveColor(ref: string): Color {
      const val = resolveVal(ref)
      if (val === undefined) return parseColor(ref)
      if (typeof val === 'object' && 'r' in val) return val
      if (typeof val === 'string') return parseColor(val)
      return { ...BLACK }
    },
    resolveNumber(ref: string): number {
      const val = resolveVal(ref)
      return typeof val === 'number' ? val : 0
    },
    resolveString(ref: string): string {
      const val = resolveVal(ref)
      return typeof val === 'string' ? val : ''
    },
    setActiveTheme(themeName: string) {
      const modeId = modeByThemeValue.get(`theme:${themeName}`)
      if (modeId) {
        activeModeId = modeId
        graph.activeMode.set(collectionId, modeId)
      }
    }
  }
}

export function parseFillColor(fill: string | PenFillObject, ctx: VarContext): Color {
  const raw = typeof fill === 'string' ? fill : (fill.color ?? '#00000000')
  return isVarRef(raw) ? ctx.resolveColor(raw) : parseColor(raw)
}

export function convertFill(fill: PenFill | undefined, ctx: VarContext, node?: SceneNode): Fill[] {
  if (fill === undefined) return []
  const fills = Array.isArray(fill) ? fill : [fill]
  return fills.map((item, index) => {
    if (item && typeof item === 'object' && item.type === 'gradient')
      return convertPenGradient(item, ctx, node, index)
    if (item && typeof item === 'object' && item.type === 'shader' && item.__canvasShader) {
      return {
        type: 'CUSTOM', visible: item.enabled !== false, opacity: Number(item.opacity ?? 1),
        color: { r: 1, g: 1, b: 1, a: 1 }, blendMode: mapPenBlendMode(item.blendMode),
        pencilShader: item.__canvasShader
      } as Fill
    }
    if (item && typeof item === 'object' && item.type === 'mesh_gradient' && item.__canvasMesh) {
      return {
        type: 'CUSTOM', visible: item.enabled !== false, opacity: Number(item.opacity ?? 1),
        color: { r: 1, g: 1, b: 1, a: 1 }, blendMode: mapPenBlendMode(item.blendMode),
        pencilMesh: item.__canvasMesh
      } as Fill
    }
    if (item && typeof item === 'object' && item.type && !['color', 'solid'].includes(item.type))
      return { type: 'SOLID', visible: false, opacity: 0, color: { r: 0, g: 0, b: 0, a: 0 } }
    const visible = typeof item === 'string' ? true : item.enabled !== false
    const parsedColor = parseFillColor(item, ctx)
    const color = { ...parsedColor, a: 1 }
    const result: Fill = {
      type: 'SOLID', visible, opacity: parsedColor.a, color,
      blendMode: mapPenBlendMode(typeof item === 'string' ? undefined : item.blendMode)
    }
    if (node)
      bindIfVar(node, `fills[${index}]`, typeof item === 'string' ? item : item.color, ctx)
    return result
  })
}

function convertPenGradient(
  item: PenFillObject,
  ctx: VarContext,
  node: SceneNode | undefined,
  index: number
): Fill {
  const type = item.gradientType === 'radial'
    ? 'GRADIENT_RADIAL'
    : item.gradientType === 'angular' ? 'GRADIENT_ANGULAR' : 'GRADIENT_LINEAR'
  const center = item.center ?? { x: 0.5, y: 0.5 }
  const width = Number(item.size?.width ?? 1)
  const height = Number(item.size?.height ?? 1)
  const rotation = Number(item.rotation ?? 0) * Math.PI / 180
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const gradientTransform = type === 'GRADIENT_LINEAR'
    ? {
        m00: sin * height,
        m01: 0,
        m02: Number(center.x ?? 0.5) - sin * height / 2,
        m10: cos * height,
        m11: 1,
        m12: Number(center.y ?? 0.5) - cos * height / 2
      }
    : {
        m00: cos * width,
        m01: -sin * height,
        m02: Number(center.x ?? 0.5) - 0.5 * (cos * width - sin * height),
        m10: sin * width,
        m11: cos * height,
        m12: Number(center.y ?? 0.5) - 0.5 * (sin * width + cos * height)
      }
  const stops = item.colors ?? []
  const gradientStops = stops.map((stop) => ({
    color: parseFillColor(stop.color, ctx),
    position: Number(stop.position)
  }))
  if (node) {
    stops.forEach((stop, stopIndex) =>
      bindIfVar(node, `fills[${index}].gradientStops[${stopIndex}]`, stop.color, ctx))
  }
  return {
    type, visible: item.enabled !== false, opacity: Number(item.opacity ?? 1),
    color: { r: 1, g: 1, b: 1, a: 1 }, blendMode: mapPenBlendMode(item.blendMode),
    gradientStops, gradientTransform
  } as Fill
}

function mapPenBlendMode(value?: string): Fill['blendMode'] {
  if (!value || value === 'normal') return 'NORMAL'
  if (value === 'light') return 'LIGHTEN'
  return value.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase() as Fill['blendMode']
}

function strokeWeight(stroke: PenStroke): number {
  return typeof stroke.thickness === 'number'
    ? stroke.thickness
    : Math.max(...Object.values(stroke.thickness))
}

export function convertStroke(
  stroke: PenStroke | undefined,
  ctx: VarContext,
  node?: SceneNode
): Stroke[] {
  const fills = stroke?.fills ?? (stroke?.fill === undefined ? [] : [stroke.fill])
  if (!stroke || fills.length === 0) return []
  let align: Stroke['align'] = 'CENTER'
  if (stroke.align === 'inside') align = 'INSIDE'
  else if (stroke.align === 'outside') align = 'OUTSIDE'

  const results = fills.flatMap((fill, index): Stroke[] => {
    if (typeof fill !== 'string' && fill.type === 'gradient') {
      const gradient = convertPenGradient(fill, ctx, undefined, index)
      return [{
        visible: fill.enabled !== false, color: { r: 1, g: 1, b: 1, a: 1 },
        opacity: Number(fill.opacity ?? 1), weight: strokeWeight(stroke), align,
        dashPattern: stroke.dashPattern ?? [], blendMode: gradient.blendMode,
        gradientStops: gradient.gradientStops, gradientTransform: gradient.gradientTransform,
        type: gradient.type
      } as Stroke]
    }
    if (typeof fill !== 'string' && !['color', 'solid'].includes(fill.type)) return []
    const rawColor = typeof fill === 'string' ? fill : (fill.color ?? '#00000000')
    const parsedColor = isVarRef(rawColor) ? ctx.resolveColor(rawColor) : parseColor(rawColor)
    const color = { ...parsedColor, a: 1 }
    if (node) bindIfVar(node, `strokes[${index}]`, rawColor, ctx)
    return [{
      visible: typeof fill === 'string' || fill.enabled !== false,
      color, opacity: parsedColor.a, blendMode: mapPenBlendMode(
        typeof fill === 'string' ? undefined : fill.blendMode
      ), weight: strokeWeight(stroke), align, dashPattern: stroke.dashPattern ?? []
    }]
  })
  if (node) {
    if (typeof stroke.thickness === 'object') {
      node.independentStrokeWeights = true
      node.borderTopWeight = stroke.thickness.top ?? 0
      node.borderRightWeight = stroke.thickness.right ?? 0
      node.borderBottomWeight = stroke.thickness.bottom ?? 0
      node.borderLeftWeight = stroke.thickness.left ?? 0
    }
    node.strokeJoin = mapStrokeJoin(stroke.join)
    node.strokeCap = mapStrokeCap(stroke.cap)
  }
  return results
}

function mapStrokeJoin(join: string | undefined): StrokeJoin {
  if (join === 'round') return 'ROUND'
  if (join === 'bevel') return 'BEVEL'
  return 'MITER'
}

function mapStrokeCap(cap: string | undefined): StrokeCap {
  if (cap === 'round') return 'ROUND'
  if (cap === 'square') return 'SQUARE'
  return 'NONE'
}

export function convertEffects(effect: PenEffect | PenEffect[] | undefined): Effect[] {
  if (!effect) return []
  const effects = Array.isArray(effect) ? effect : [effect]
  return effects.flatMap((item) => {
    if (item.enabled === false) return []
    if (item.type === 'blur' || item.type === 'background_blur') {
      return [{
        type: item.type === 'background_blur' ? 'BACKGROUND_BLUR' : 'LAYER_BLUR',
        visible: true,
        radius: Number(item.radius ?? 0)
      } satisfies Effect]
    }
    if (item.type !== 'shadow') return []
    const color = item.color ? parseColor(item.color) : { r: 0, g: 0, b: 0, a: 0.25 }
    return [
      {
        type: item.shadowType === 'inner' ? 'INNER_SHADOW' : 'DROP_SHADOW',
        visible: true,
        blendMode: mapPenBlendMode(item.blendMode),
        color,
        offset: item.offset ?? { x: 0, y: 0 },
        radius: item.blur ?? 0,
        spread: item.spread ?? 0
      } satisfies Effect
    ]
  })
}

export function applyCornerRadius(
  node: SceneNode,
  radius: PenNode['cornerRadius'],
  ctx: VarContext
): void {
  if (radius === undefined) return
  if (Array.isArray(radius)) {
    const values = radius.map((value) => parseSize(value, 0, ctx).value)
    node.independentCorners = true
    node.topLeftRadius = values[0] ?? 0
    node.topRightRadius = values[1] ?? 0
    node.bottomRightRadius = values[2] ?? 0
    node.bottomLeftRadius = values[3] ?? 0
    return
  }
  node.cornerRadius = parseSize(radius, 0, ctx).value
}

export function applyPadding(node: SceneNode, padding: PenNode['padding'], ctx?: VarContext): void {
  if (padding === undefined) return
  const resolve = (v: number | string): number =>
    typeof v === 'string' ? (isVarRef(v) && ctx ? ctx.resolveNumber(v) : Number(v) || 0) : v
  if (Array.isArray(padding)) {
    const values = padding.map((value) => resolve(value ?? 0))
    const [top, right, bottom, left] = values.length === 1
      ? [values[0], values[0], values[0], values[0]]
      : values.length === 2
        ? [values[0], values[1], values[0], values[1]]
        : values.length === 3
          ? [values[0], values[1], values[2], values[1]]
          : [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0]
    node.paddingTop = top
    node.paddingRight = right
    node.paddingBottom = bottom
    node.paddingLeft = left
    return
  }
  const resolved = resolve(padding)
  node.paddingTop = resolved
  node.paddingRight = resolved
  node.paddingBottom = resolved
  node.paddingLeft = resolved
}

export function parseSize(value: number | string | undefined, fallback: number, ctx?: VarContext) {
  if (value === undefined) return { value: fallback, sizing: 'FIXED' as LayoutSizing }
  if (typeof value === 'number') return { value, sizing: 'FIXED' as LayoutSizing }
  const fillMatch = /^fill_container(?:\(([^)]*)\))?$/.exec(value)
  if (fillMatch) {
    const stored = Number(fillMatch[1])
    return { value: Number.isFinite(stored) ? stored : fallback, sizing: 'FILL' as LayoutSizing }
  }
  const hugMatch = /^(?:hug_content|fit_content)(?:\(([^)]*)\))?$/.exec(value)
  if (hugMatch) {
    const stored = Number(hugMatch[1])
    return { value: Number.isFinite(stored) ? stored : fallback, sizing: 'HUG' as LayoutSizing }
  }
  if (isVarRef(value) && ctx)
    return { value: ctx.resolveNumber(value), sizing: 'FIXED' as LayoutSizing }
  const parsed = Number(value)
  return { value: Number.isFinite(parsed) ? parsed : fallback, sizing: 'FIXED' as LayoutSizing }
}

export function mapLayoutMode(pen: PenNode): LayoutMode {
  if (pen.layout === 'grid') return 'GRID'
  if (pen.layout === 'row' || pen.layout === 'horizontal') return 'HORIZONTAL'
  if (pen.layout === 'column' || pen.layout === 'vertical') return 'VERTICAL'
  return 'NONE'
}

export function mapJustifyContent(value: string | undefined): LayoutAlign {
  if (value === 'center') return 'CENTER'
  if (value === 'end') return 'MAX'
  if (value === 'space-between') return 'SPACE_BETWEEN'
  if (value === 'space_around') return 'SPACE_AROUND'
  return 'MIN'
}

export function mapAlignItems(value: string | undefined): LayoutCounterAlign {
  if (value === 'center') return 'CENTER'
  if (value === 'end') return 'MAX'
  if (value === 'stretch') return 'STRETCH'
  return 'MIN'
}

export function mapTextAlign(value: string | undefined): SceneNode['textAlignHorizontal'] {
  if (value === 'center') return 'CENTER'
  if (value === 'right' || value === 'end') return 'RIGHT'
  if (value === 'justified') return 'JUSTIFIED'
  return 'LEFT'
}

export function mapTextAlignVertical(value: string | undefined): TextAlignVertical {
  if (value === 'center') return 'CENTER'
  if (value === 'bottom' || value === 'end') return 'BOTTOM'
  return 'TOP'
}

export function mapFontWeight(value: string | number | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d{3}$/.test(value)) {
    const numeric = Number(value)
    if (numeric >= 1 && numeric <= 1000) return numeric
  }
  if (value === 'thin') return 100
  if (value === 'extralight') return 200
  if (value === 'light') return 300
  if (value === 'medium') return 500
  if (value === 'semibold') return 600
  if (value === 'bold') return 700
  if (value === 'extrabold') return 800
  if (value === 'black') return 900
  return 400
}

export function mapNodeType(pen: PenNode): NodeType | null {
  if (pen.type === 'frame') return pen.reusable ? 'COMPONENT' : 'FRAME'
  if (pen.type === 'rectangle') return 'RECTANGLE'
  if (pen.type === 'ellipse') return 'ELLIPSE'
  if (pen.type === 'line') return 'LINE'
  if (pen.type === 'polygon') return 'POLYGON'
  if (pen.type === 'group') return 'GROUP'
  if (pen.type === 'text' || pen.type === 'icon_font') return 'TEXT'
  if (pen.type === 'path') return 'VECTOR'
  if (pen.type === 'icon') return pen.__canvasIcon?.fontFamily ? 'TEXT' : 'VECTOR'
  if (pen.type === 'ref') return 'INSTANCE'
  if (pen.type === 'script' && pen.__canvasScript) return 'FRAME'
  if (['note', 'context', 'prompt'].includes(pen.type) && pen.__canvasSticky) return 'FRAME'
  return null
}
