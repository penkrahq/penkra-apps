import type { SceneNode } from '@open-pencil/scene-graph'

import { weightToStyle } from '#core/text/fonts'
import { measureTextWithOpenType } from '#core/text/opentype'

export type TextMeasurer = (
  node: SceneNode,
  maxWidth?: number
) => { width: number; height: number } | null

let globalTextMeasurer: TextMeasurer | null = null

const GLYPH_WIDTH_FACTOR = 0.6

export function estimateTextSize(
  node: SceneNode,
  maxWidth?: number
): { width: number; height: number } {
  const fontSize = node.fontSize || 14
  const family = node.fontFamily || 'Inter'
  const style = weightToStyle(node.fontWeight || 400, node.italic)
  const text = node.text || ''

  const explicitLineH = (node.lineHeight ?? 0) > 0 ? (node.lineHeight as number) : undefined
  const measured = measureTextWithOpenType(text, fontSize, family, style, maxWidth, explicitLineH)
  if (measured) return measured

  const charWidth = fontSize * GLYPH_WIDTH_FACTOR
  const singleLineWidth = Math.ceil(text.length * charWidth)
  const lineH = (node.lineHeight ?? 0) > 0 ? (node.lineHeight as number) : Math.ceil(fontSize * 1.4)

  if (maxWidth && maxWidth > 0 && singleLineWidth > maxWidth) {
    const lines = Math.ceil(singleLineWidth / maxWidth)
    return { width: maxWidth, height: Math.ceil(lines * lineH) }
  }
  return { width: singleLineWidth, height: lineH }
}

export function getTextMeasurer(): TextMeasurer | null {
  return globalTextMeasurer
}

export function setTextMeasurer(measurer: TextMeasurer | null): void {
  globalTextMeasurer = measurer
}

/**
 * Share exact paragraph measurements only within one synchronous layout pass.
 * Component instances deliberately clone their text nodes, so node identity is
 * not part of the key; every input that can affect CanvasKit paragraph metrics is.
 */
export function createLayoutPassTextMeasurer(measurer: TextMeasurer): TextMeasurer {
  const measurements = new Map<string, ReturnType<TextMeasurer>>()
  return (node, maxWidth) => {
    const key = JSON.stringify([
      maxWidth === undefined ? ['undefined'] : ['number', maxWidth],
      node.text,
      node.textAutoResize,
      node.width,
      node.height,
      node.fontSize,
      node.fontFamily,
      node.fontWeight,
      node.italic,
      node.fontVariations,
      node.fontFeatures,
      node.textAlignHorizontal,
      node.textDirection,
      node.textLanguage,
      node.leadingTrim,
      node.lineHeight,
      node.letterSpacing,
      node.textDecoration,
      node.textDecorationStyle,
      node.textDecorationThickness,
      node.textDecorationFills,
      node.textCase,
      node.textTruncation,
      node.maxLines,
      node.styleRuns
    ])
    if (measurements.has(key)) return measurements.get(key) ?? null
    const result = measurer(node, maxWidth)
    measurements.set(key, result)
    return result
  }
}
