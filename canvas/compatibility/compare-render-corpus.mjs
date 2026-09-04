import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import CanvasKitInit from 'canvaskit-wasm'

const [legacyDirectory, sourceDirectory] = process.argv.slice(2)
if (!legacyDirectory || !sourceDirectory) {
  throw new Error('Usage: node compare-render-corpus.mjs LEGACY_DIRECTORY SOURCE_DIRECTORY')
}
const ck = await CanvasKitInit({
  locateFile: () => fileURLToPath(new URL('../node_modules/canvaskit-wasm/bin/canvaskit.wasm', import.meta.url))
})
for (const filename of (await readdir(legacyDirectory)).filter((name) => name.endsWith('.png')).sort()) {
  const left = ck.MakeImageFromEncoded(await readFile(path.join(legacyDirectory, filename)))
  const right = ck.MakeImageFromEncoded(await readFile(path.join(sourceDirectory, filename)))
  if (!left || !right) throw new Error(`Could not decode ${filename}`)
  const width = left.width()
  const height = left.height()
  if (right.width() !== width || right.height() !== height) {
    console.log(JSON.stringify({ filename, dimensions: 'different' }))
    continue
  }
  const info = {
    width,
    height,
    colorType: ck.ColorType.RGBA_8888,
    alphaType: ck.AlphaType.Unpremul,
    colorSpace: ck.ColorSpace.SRGB
  }
  const a = left.readPixels(0, 0, info)
  const b = right.readPixels(0, 0, info)
  let pixels = 0
  let channels = 0
  let maxDelta = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  const samples = []
  for (let offset = 0; offset < a.length; offset += 4) {
    let different = false
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(a[offset + channel] - b[offset + channel])
      if (delta > 0) {
        different = true
        channels++
        maxDelta = Math.max(maxDelta, delta)
      }
    }
    if (!different) continue
    pixels++
    const index = offset / 4
    const x = index % width
    const y = Math.floor(index / width)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    if (samples.length < 8) samples.push({ x, y, a: [...a.slice(offset, offset + 4)], b: [...b.slice(offset, offset + 4)] })
  }
  console.log(JSON.stringify({ filename, pixels, channels, maxDelta, bounds: pixels ? { minX, minY, maxX, maxY } : null, samples }))
  left.delete()
  right.delete()
}
