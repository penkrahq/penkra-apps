import { computeAllLayouts } from '@open-pencil/core/layout'
import type { SceneGraph } from '@open-pencil/scene-graph'

/**
 * Recompute font-aware geometry without presenting derived x/y/size changes as
 * authored document edits. Authored updates schedule component synchronization;
 * layout previews only invalidate the renderer state affected by the geometry.
 */
export function recomputeDerivedGraphLayout(graph: SceneGraph): void {
  graph.runPreviewUpdates(() => {
    for (const page of graph.getPages()) computeAllLayouts(graph, page.id)
  })
}
