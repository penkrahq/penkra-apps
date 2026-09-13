import { describe, expect, test } from 'bun:test'

import { extractPaths } from '#core/icons/svg'
import { parseSVGSize, parseSVGViewBox } from '#core/io/formats/svg/metadata'

describe('SVG XML parsing', () => {
  test('reads quoted root metadata through the XML parser', () => {
    const svg = `<svg width='120' height="80" viewBox='10 20 300 200'><path d='M0 0'/></svg>`

    expect(parseSVGSize(svg)).toEqual({ width: 120, height: 80 })
    expect(parseSVGViewBox(svg)).toEqual({ x: 10, y: 20, width: 300, height: 200 })
  })

  test('walks nested groups with inherited presentation and transforms', () => {
    const paths = extractPaths(`
      <g fill="#ff0000" transform="translate(4 5)">
        <path d="M0 0L10 0L10 10Z" />
        <g stroke="#0000ff" stroke-width="2" transform="scale(2)">
          <line x1="0" y1="0" x2="4" y2="4" />
        </g>
      </g>
      <defs><path d="M20 20L30 30" /></defs>
    `)

    expect(paths).toHaveLength(2)
    expect(paths[0]).toMatchObject({ fill: '#ff0000', transform: 'translate(4 5)' })
    expect(paths[1]).toMatchObject({
      fill: '#ff0000',
      stroke: '#0000ff',
      strokeWidth: 2,
      transform: 'translate(4 5) scale(2)'
    })
  })

  test('extracts paths from complete XML SVG documents with a doctype', () => {
    const paths = extractPaths(`<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
        <path fill="#ff0000" d="M0 0h10v10H0z"/>
      </svg>`)

    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatchObject({ fill: '#ff0000' })
  })

  test('omits shapes whose inline presentation disables both fill and stroke', () => {
    const paths = extractPaths(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="2" width="20" height="30" style="fill:none;stroke:none"/>
        <path d="M0 0h10v10z" fill="#000"/>
      </svg>`)

    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatchObject({ fill: '#000' })
  })

  test('does not interpret attribute-like path text as markup', () => {
    const paths = extractPaths(`<path d="M0 0L10 10" data-note="fill='red' stroke='blue'"/>`)

    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatchObject({ fill: 'currentColor', stroke: null })
  })

  test('rejects malformed SVG documents', () => {
    expect(extractPaths('<path d="M0 0"><g>')).toEqual([])
    expect(parseSVGViewBox('<svg viewBox="0 0 20 20">')).toBeNull()
  })
})
