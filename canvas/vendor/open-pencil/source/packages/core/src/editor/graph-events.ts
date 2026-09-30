import type { SceneGraph, SceneGraphEvents, SceneNode } from '@open-pencil/scene-graph'

import type { SkiaRenderer } from '#core/canvas/renderer'

type EmittedGraphEventName = Exclude<keyof SceneGraphEvents, 'node:previewUpdated'>

type GraphEventOptions = {
  getGraph: () => SceneGraph
  getRenderers: () => Iterable<SkiaRenderer>
  scheduleComponentSync: (nodeId: string) => void
  isDerivedGraphMutation: () => boolean
  requestRender: (preserveSceneTiles?: boolean) => void
  emitEditorEvent: <K extends EmittedGraphEventName>(
    event: K,
    ...args: Parameters<SceneGraphEvents[K]>
  ) => void
}

const GEOMETRY_CACHE_KEYS = new Set<keyof SceneNode>([
  'vectorNetwork',
  'fillGeometry',
  'strokeGeometry'
])

const NODE_PICTURE_STABLE_PREVIEW_KEYS = new Set<keyof SceneNode>([
  'x',
  'y',
  'rotation',
  'flipX',
  'flipY',
  'parentId'
])

export type RendererInvalidation = {
  geometryCache: boolean
  nodePicture: boolean
}

export function rendererInvalidationForChanges(
  changes: Partial<SceneNode>,
  options: { preview: boolean }
): RendererInvalidation {
  const keys = Object.keys(changes) as (keyof SceneNode)[]
  const geometryCache = keys.some((key) => GEOMETRY_CACHE_KEYS.has(key))
  const nodePicture = options.preview
    ? keys.some((key) => !NODE_PICTURE_STABLE_PREVIEW_KEYS.has(key))
    : true
  return { geometryCache, nodePicture }
}

function invalidateRenderersForChange(
  renderers: Iterable<SkiaRenderer>,
  id: string,
  changes: Partial<SceneNode>,
  invalidateNodePicture: boolean
) {
  const invalidation = rendererInvalidationForChanges(changes, { preview: !invalidateNodePicture })
  for (const renderer of renderers) {
    if (invalidation.geometryCache) renderer.invalidateVectorPath(id)
    if (invalidation.nodePicture) renderer.invalidateNodePicture(id)
  }
}

export function createGraphEventSubscription(options: GraphEventOptions) {
  let unbindGraphEvents: (() => void) | null = null

  function onNodeUpdated(id: string, changes: Partial<SceneNode>) {
    invalidateRenderersForChange(options.getRenderers(), id, changes, true)
    if (!options.isDerivedGraphMutation()) {
      for (const renderer of options.getRenderers()) {
        renderer.invalidateSceneTilesForNode?.(options.getGraph(), id, changes)
      }
      options.emitEditorEvent('node:updated', id, changes)
      options.scheduleComponentSync(id)
      options.requestRender(true)
    }
  }

  function onNodePreviewUpdated(id: string, changes: Partial<SceneNode>) {
    const { nodePicture } = rendererInvalidationForChanges(changes, { preview: true })
    invalidateRenderersForChange(options.getRenderers(), id, changes, nodePicture)
  }

  function onNodeStructureChanged(nodeId: string) {
    if (!options.isDerivedGraphMutation()) {
      options.scheduleComponentSync(nodeId)
      options.requestRender()
    }
  }

  function subscribeToGraph() {
    unbindGraphEvents?.()
    unbindGraphEvents = options.getGraph().onNodeEvents({
      updated: onNodeUpdated,
      previewUpdated: onNodePreviewUpdated,
      created: (node) => {
        if (!options.isDerivedGraphMutation()) options.emitEditorEvent('node:created', node)
        onNodeStructureChanged(node.id)
      },
      deleted: (id) => {
        if (!options.isDerivedGraphMutation()) options.emitEditorEvent('node:deleted', id)
        onNodeStructureChanged(id)
      },
      reparented: (nodeId, oldParentId, newParentId) => {
        if (!options.isDerivedGraphMutation()) {
          options.emitEditorEvent('node:reparented', nodeId, oldParentId, newParentId)
        }
        onNodeStructureChanged(nodeId)
      },
      reordered: (nodeId, parentId, index) => {
        if (!options.isDerivedGraphMutation()) {
          options.emitEditorEvent('node:reordered', nodeId, parentId, index)
        }
        onNodeStructureChanged(nodeId)
      }
    })
  }

  return { subscribeToGraph }
}
