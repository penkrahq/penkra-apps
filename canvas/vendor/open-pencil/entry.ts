// Build this file from the root of an OpenPencil checkout at the commit recorded
// in PROVENANCE.json. It deliberately exports only Canvas's renderer/editor seam.
export { createEditor } from '@open-pencil/core/editor'
export { fontManager } from '@open-pencil/core'
export { computeAllLayouts } from '@open-pencil/core/layout'
export { getCanvasKit } from '@open-pencil/core/canvaskit'
export { parsePenFile } from '@open-pencil/pen'
export { computeBounds } from '@open-pencil/scene-graph/geometry'
export { computeDescendantVisualBounds } from '@open-pencil/scene-graph/geometry'
export { SkiaRenderer } from '@open-pencil/core/canvas/renderer'
export { provideEditor, useCanvas } from './packages/vue/dist/canvas/CanvasRoot.js'
export { useCanvasInput } from './packages/vue/dist/canvas/useCanvasInput.js'
export { useTextEdit } from './packages/vue/dist/canvas/text-edit/use.js'
