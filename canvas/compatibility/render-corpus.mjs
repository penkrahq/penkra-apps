import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { takeDocumentScreenshots } from '../src/document-screenshot.mjs'
import { corpusFiles } from './corpus-files.mjs'

const results = []
const outputOption = process.argv.indexOf('--output-dir')
const outputDirectory = outputOption === -1 ? null : process.argv[outputOption + 1]
if (outputDirectory) await mkdir(outputDirectory, { recursive: true })
for (const { label, url } of corpusFiles) {
  const document = JSON.parse(await readFile(url, 'utf8'))
  const nodeIds = (document.children ?? [])
    .filter((node) => typeof node?.id === 'string')
    .map((node) => node.id)
  if (nodeIds.length === 0) continue
  try {
    const [screenshot] = await takeDocumentScreenshots(document, [{ nodeIds }])
    const bytes = Buffer.from(screenshot.data, 'base64')
    if (outputDirectory) {
      const filename = `${results.length}-${label.replace(/[^a-z0-9]+/giu, '-').toLowerCase()}.png`
      await writeFile(path.join(outputDirectory, filename), bytes)
    }
    results.push({
      label,
      nodeIds,
      width: screenshot.width,
      height: screenshot.height,
      sha256: createHash('sha256').update(bytes).digest('hex')
    })
  } catch (error) {
    results.push({ label, nodeIds, error: `${error.code ?? error.name}: ${error.message}` })
  }
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
