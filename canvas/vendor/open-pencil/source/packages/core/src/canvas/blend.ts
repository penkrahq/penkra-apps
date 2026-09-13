import type { BlendMode as SkBlendMode, CanvasKit, Paint } from 'canvaskit-wasm'

import type { BlendMode } from '@open-pencil/scene-graph'

export function figmaBlendModeToSkia(ck: CanvasKit, mode?: BlendMode): SkBlendMode {
  switch (mode) {
    case 'DARKEN':
      return ck.BlendMode.Darken
    case 'MULTIPLY':
      return ck.BlendMode.Multiply
    case 'LINEAR_DODGE':
      return ck.BlendMode.Plus
    case 'COLOR_BURN':
      return ck.BlendMode.ColorBurn
    case 'LIGHTEN':
      return ck.BlendMode.Lighten
    case 'SCREEN':
      return ck.BlendMode.Screen
    case 'COLOR_DODGE':
      return ck.BlendMode.ColorDodge
    case 'OVERLAY':
      return ck.BlendMode.Overlay
    case 'SOFT_LIGHT':
      return ck.BlendMode.SoftLight
    case 'HARD_LIGHT':
      return ck.BlendMode.HardLight
    case 'DIFFERENCE':
      return ck.BlendMode.Difference
    case 'EXCLUSION':
      return ck.BlendMode.Exclusion
    case 'HUE':
      return ck.BlendMode.Hue
    case 'SATURATION':
      return ck.BlendMode.Saturation
    case 'COLOR':
      return ck.BlendMode.Color
    case 'LUMINOSITY':
      return ck.BlendMode.Luminosity
    default:
      return ck.BlendMode.SrcOver
  }
}

export function setFigmaPaintBlendMode(
  renderer: { ck: CanvasKit; linearBurnBlender: Parameters<Paint['setBlender']>[0] },
  paint: Paint,
  mode?: BlendMode
): void {
  if (mode === 'LINEAR_BURN') {
    paint.setBlender(renderer.linearBurnBlender)
    return
  }
  paint.setBlendMode(figmaBlendModeToSkia(renderer.ck, mode))
}

export function needsIsolatedBlendLayer(mode?: BlendMode): boolean {
  return mode !== undefined && mode !== 'NORMAL' && mode !== 'PASS_THROUGH'
}
