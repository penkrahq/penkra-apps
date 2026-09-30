import { SceneGraph, type SceneNode } from '@open-pencil/scene-graph'
import { computeDescendantVisualBounds } from '@open-pencil/scene-graph/geometry'

import type { SkiaRenderer } from '#core/canvas/renderer'

export function invalidateScenePicture(r: SkiaRenderer): void {
  discardRetainedSceneState(r)
  invalidateSceneTiles(r)
}

export function discardRetainedSceneState(r: SkiaRenderer): void {
  r.scenePicture?.delete()
  r.scenePicture = null
  r.scenePictureVersion = -1
  r.scenePictureFontGeneration = -1
  r.sceneBacking?.image.delete()
  r.sceneBacking = null
  r.sceneBackingBuild?.surface.delete()
  r.sceneBackingBuild = null
  r.sceneBackingNeedsCrispRender = false
  r.sceneBackingPreviewUntil = 0
}

export function invalidateSceneTiles(r: SkiaRenderer): void {
  r.sceneTileCache?.clear()
  r.sceneTileCacheGraph = null
  r.sceneTileCacheVersion = -1
}

export function invalidateSceneTilesForNode(
  r: SkiaRenderer,
  graph: SceneGraph,
  nodeId: string,
  changes: Partial<SceneNode>
): void {
  if (r.sceneTileCache.size === 0) return
  if (
    r.sceneTileCacheGraph !== graph ||
    Object.keys(changes).some((key) => SceneGraph.LAYOUT_AFFECTING_KEYS.has(key))
  ) {
    invalidateSceneTiles(r)
    return
  }
  const before = r.subtreeCullBounds.get(nodeId)
  if (!before) {
    invalidateSceneTiles(r)
    return
  }
  r.sceneTileCache.invalidate(before)
  const after = computeDescendantVisualBounds(
    [nodeId],
    (id) => graph.getNode(id),
    (id) => graph.getAbsolutePosition(id)
  )
  if (after) r.sceneTileCache.invalidate(after)
}

export function clearSubtreePictureCache(r: SkiaRenderer): void {
  for (const entry of r.subtreePictureCache.values()) entry.picture.delete()
  r.subtreePictureCache.clear()
  r.subtreePictureCachePageId = null
  r.subtreePictureCacheSceneVersion = -1
  r.subtreePictureCachePositionPreviewVersion = -1
  r.subtreePictureCacheFontGeneration = -1
}

export function invalidateAllPictures(r: SkiaRenderer): void {
  invalidateScenePicture(r)
  for (const pic of r.nodePictureCache.values()) pic?.delete()
  r.nodePictureCache.clear()
  r.nodePictureCacheGenerations.clear()
  clearSubtreePictureCache(r)
}

export function invalidateGraphCaches(r: SkiaRenderer): void {
  invalidateAllPictures(r)
  for (const cache of [
    r.vectorPathCache,
    r.vectorStrokePathCache,
    r.vectorStrokeOutlineCache,
    r.fillGeometryCache,
    r.strokeGeometryCache
  ]) {
    for (const paths of cache.values()) for (const path of paths) path.delete()
    cache.clear()
  }
  r.subtreeCullBounds.clear()
  r.subtreeNodeCounts.clear()
  r.subtreeCullBoundsGraph = null
}

export function invalidateNodePicture(r: SkiaRenderer, nodeId: string): void {
  const pic = r.nodePictureCache.get(nodeId)
  if (pic) {
    pic.delete()
    r.nodePictureCache.delete(nodeId)
    r.nodePictureCacheGenerations.delete(nodeId)
  }
  const subtree = r.subtreePictureCache.get(nodeId)
  if (subtree) {
    subtree.picture.delete()
    r.subtreePictureCache.delete(nodeId)
  }
}

export function flashNode(r: SkiaRenderer, nodeId: string): void {
  r._flashes.push({ nodeId, startTime: performance.now() })
}

export function aiMarkActive(r: SkiaRenderer, nodeIds: string[]): void {
  for (const id of nodeIds) r._aiActiveNodes.add(id)
}

export function aiMarkDone(r: SkiaRenderer, nodeIds: string[]): void {
  const now = performance.now()
  for (const id of nodeIds) {
    if (r._aiActiveNodes.delete(id)) {
      r._aiDoneFlashes.push({ nodeId: id, startTime: now })
    }
  }
}

export function aiFlashDone(r: SkiaRenderer, nodeIds: string[]): void {
  const now = performance.now()
  for (const id of nodeIds) {
    r._aiDoneFlashes.push({ nodeId: id, startTime: now })
  }
}

export function aiClearActive(r: SkiaRenderer): void {
  r._aiActiveNodes.clear()
}

export function aiClearAll(r: SkiaRenderer): void {
  r._aiActiveNodes.clear()
  r._aiDoneFlashes = []
}

export function hasActiveFlashes(r: SkiaRenderer): boolean {
  return r._flashes.length > 0 || r._aiActiveNodes.size > 0 || r._aiDoneFlashes.length > 0
}
