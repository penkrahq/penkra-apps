import { describe, expect, test } from 'bun:test'

import type { CanvasKit, TypefaceFontProvider } from 'canvaskit-wasm'

import { FontManager, fontManager } from '@open-pencil/core/text'
import { SceneGraph } from '@open-pencil/scene-graph'

import { isTextPictureCurrent } from '#core/canvas/renderer/fonts'
import { nodeFontReadiness } from '#core/canvas/text'
import { fontFaceDemand, fontResolver } from '#core/text/resolver'

function pageId(graph: SceneGraph): string {
  return graph.getPages()[0].id
}

describe('font lifecycle', () => {
  test('advances generation only for provider epochs and unique registrations', () => {
    const manager = new FontManager()
    const registrations: string[] = []
    const provider = {
      registerFont(_data: ArrayBuffer, family: string) {
        registrations.push(family)
      }
    } as TypefaceFontProvider
    const data = new ArrayBuffer(12)

    expect(manager.generation()).toBe(0)
    manager.attachProvider({} as CanvasKit, provider)
    const providerGeneration = manager.generation()
    manager.markLoaded('Generation Test', 'Regular', data)
    const registrationGeneration = manager.generation()
    manager.markLoaded('Generation Test', 'Regular', data)

    expect(providerGeneration).toBeGreaterThan(0)
    expect(registrationGeneration).toBeGreaterThan(providerGeneration)
    expect(manager.generation()).toBe(registrationGeneration)
    expect(registrations).toEqual(['Generation Test'])
  })

  test('retires a provider when a cumulative subset replaces its face', () => {
    const manager = new FontManager()
    const registrations: Array<{ family: string; bytes: ArrayBuffer }> = []
    const provider = {
      registerFont(bytes: ArrayBuffer, family: string) {
        registrations.push({ family, bytes })
      }
    } as TypefaceFontProvider
    const replacementProviderRegistrations: Array<{ family: string; bytes: ArrayBuffer }> = []
    const replacementProvider = {
      registerFont(bytes: ArrayBuffer, family: string) {
        replacementProviderRegistrations.push({ family, bytes })
      }
    } as TypefaceFontProvider
    const first = new ArrayBuffer(8)
    const cumulative = new ArrayBuffer(12)

    manager.attachProvider({} as CanvasKit, provider)
    manager.markLoaded('Subset Font', 'Regular', first)
    const firstGeneration = manager.generation()
    manager.markLoaded('Subset Font', 'Regular', cumulative)

    expect(manager.renderFamily('Subset Font', 'Regular')).toBe('Subset Font')
    expect(manager.generation()).toBeGreaterThan(firstGeneration)
    expect(manager.isProviderCurrent(provider)).toBe(false)
    expect(manager.provider()).toBeNull()
    expect(registrations).toEqual([{ family: 'Subset Font', bytes: first }])

    manager.attachProvider({} as CanvasKit, replacementProvider)
    expect(manager.isProviderCurrent(replacementProvider)).toBe(true)
    expect(replacementProviderRegistrations).toEqual([
      { family: 'Subset Font', bytes: cumulative }
    ])
  })

  test('tracks nodes gated by pre-render font resolution', () => {
    const manager = new FontManager()
    manager.blockNodesUntilFontsResolve(['first', 'second'])
    expect(manager.isNodeBlocked('first')).toBe(true)
    expect(manager.isNodeBlocked('second')).toBe(true)
    manager.unblockNodes(['first'])
    expect(manager.isNodeBlocked('first')).toBe(false)
    expect(manager.isNodeBlocked('second')).toBe(true)
  })

  test('rejects a text picture observed before the font generation changed', () => {
    const graph = new SceneGraph()
    const node = graph.createNode('TEXT', pageId(graph), {
      name: 'Cached fallback',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      text: 'Hello',
      textPicture: new Uint8Array([1, 2, 3])
    })
    const renderer = {
      fontGeneration: 1,
      textPictureGenerations: new Map<string, { data: Uint8Array; generation: number }>()
    }

    expect(isTextPictureCurrent(renderer, node)).toBe(true)
    renderer.fontGeneration = 2
    expect(isTextPictureCurrent(renderer, node)).toBe(false)
  })

  test('keeps text visible when an unavailable italic face can use a loaded family face', () => {
    const family = 'Missing Italic Regression'
    const demand = fontFaceDemand(family, 'Regular Italic', 'Hello')
    fontResolver.reset(demand)
    fontResolver.exhaust(demand)
    fontManager.markLoaded(family, 'Regular', new ArrayBuffer(12))

    const graph = new SceneGraph()
    const node = graph.createNode('TEXT', pageId(graph), {
      name: 'Synthetic italic',
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      text: 'Hello',
      fontFamily: family,
      italic: true
    })

    expect(nodeFontReadiness({}, node)).toBe('ready')
    fontResolver.reset(demand)
  })
})
