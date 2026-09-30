import { expect, mock, test } from 'bun:test'

import type { SkiaRenderer } from '@open-pencil/core/canvas/renderer'
import {
  MAX_RETAINED_SCENE_NODES,
  prepareRetainedSceneState
} from '@open-pencil/core/canvas/renderer/pipeline'
import { invalidateScenePicture } from '@open-pencil/core/canvas/renderer/state'

test('invalidating retained scene state clears the pending crisp repaint', () => {
  const imageDelete = mock()
  const surfaceDelete = mock()
  const renderer = {
    scenePicture: { delete: mock() },
    sceneBacking: { image: { delete: imageDelete } },
    sceneBackingBuild: { surface: { delete: surfaceDelete } },
    sceneBackingNeedsCrispRender: true,
    sceneBackingPreviewUntil: 123
  } as SkiaRenderer

  invalidateScenePicture(renderer)

  expect(renderer.scenePicture).toBeNull()
  expect(renderer.sceneBacking).toBeNull()
  expect(renderer.sceneBackingBuild).toBeNull()
  expect(renderer.sceneBackingNeedsCrispRender).toBe(false)
  expect(renderer.sceneBackingPreviewUntil).toBe(0)
  expect(imageDelete).toHaveBeenCalledTimes(1)
  expect(surfaceDelete).toHaveBeenCalledTimes(1)
})

test('crossing the retained-scene cutoff cancels backing work and cannot leave a redraw loop', () => {
  const imageDelete = mock()
  const surfaceDelete = mock()
  const renderer = {
    scenePicture: null,
    sceneBacking: { image: { delete: imageDelete } },
    sceneBackingBuild: { surface: { delete: surfaceDelete } },
    sceneBackingNeedsCrispRender: true,
    sceneBackingPreviewUntil: 123
  } as SkiaRenderer

  expect(prepareRetainedSceneState(renderer, MAX_RETAINED_SCENE_NODES + 1, 'scene')).toBe(false)
  expect(renderer.sceneBackingNeedsCrispRender).toBe(false)
  expect(renderer.sceneBackingPreviewUntil).toBe(0)
  expect(renderer.sceneBacking).toBeNull()
  expect(renderer.sceneBackingBuild).toBeNull()
  expect(imageDelete).toHaveBeenCalledTimes(1)
  expect(surfaceDelete).toHaveBeenCalledTimes(1)

  prepareRetainedSceneState(renderer, MAX_RETAINED_SCENE_NODES + 1, 'scene')
  expect(imageDelete).toHaveBeenCalledTimes(1)
  expect(surfaceDelete).toHaveBeenCalledTimes(1)
})
