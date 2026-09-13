/* Pencil's shader and mesh fills are intentionally isolated from the generic fill mapper.
 * They execute only the already-parsed, bounded definitions carried by imported .pen files. */
/* eslint-disable @typescript-eslint/no-explicit-any, max-lines */
import type { Fill, SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import { parseColor } from '#core/color'

import type { SkiaRenderer } from './renderer'
import { nodeHasRadius } from './shapes'

type ShaderUniform = {
  name: string
  type: string
  automatic?: 'resolution' | 'time' | 'mouse' | 'sdf' | 'backdrop'
}
type ShaderDefinition = {
  webglSource?: string
  source: string
  uniforms: ShaderUniform[]
  textures: { name: string; sha256: string }[]
  values: Record<string, unknown>
  fallback?: {
    type: 'diagonal-hatch'
    color: string
    spacing: number
    lineWidth: number
  }
}

function applyShaderFallback(r: SkiaRenderer, definition: ShaderDefinition): boolean {
  const fallback = definition.fallback
  if (fallback?.type !== 'diagonal-hatch') return false
  const spacing = Math.max(1, fallback.spacing)
  const recorder = new r.ck.PictureRecorder()
  const canvas = recorder.beginRecording(r.ck.LTRBRect(0, 0, spacing, spacing))
  const paint = new r.ck.Paint()
  const color = parseColor(fallback.color)
  paint.setAntiAlias(true)
  paint.setStyle(r.ck.PaintStyle.Stroke)
  paint.setStrokeWidth(Math.max(0.25, fallback.lineWidth))
  paint.setColor(r.ck.Color4f(color.r, color.g, color.b, color.a))
  canvas.drawLine(-spacing, 0, 0, spacing, paint)
  canvas.drawLine(0, 0, spacing, spacing, paint)
  canvas.drawLine(spacing, 0, spacing * 2, spacing, paint)
  const picture = recorder.finishRecordingAsPicture()
  const canvasMatrix = r.pencilShaderRenderCanvas?.getTotalMatrix()
  const deviceAnchoredMatrix = canvasMatrix ? r.ck.Matrix.invert(canvasMatrix) : undefined
  const shader = picture.makeShader(
    r.ck.TileMode.Repeat,
    r.ck.TileMode.Repeat,
    r.ck.FilterMode.Nearest,
    deviceAnchoredMatrix ?? undefined,
    r.ck.LTRBRect(0, 0, spacing, spacing)
  )
  r.fillPaint.setShader(shader)
  picture.delete()
  paint.delete()
  recorder.delete()
  return true
}
type MeshPoint = {
  position: [number, number]
  leftHandle: [number, number]
  rightHandle: [number, number]
  topHandle: [number, number]
  bottomHandle: [number, number]
}
type MeshDefinition = {
  rows: number
  columns: number
  points: MeshPoint[]
  colors: string[]
}

function shaderContext(r: SkiaRenderer): WebGLRenderingContext | null {
  if (r.pencilShaderGL) return r.pencilShaderGL
  if (typeof document === 'undefined') return null
  const source = document.createElement('canvas')
  const gl = source.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    stencil: false
  })
  if (!gl) return null
  r.pencilShaderCanvas = source
  r.pencilShaderGL = gl
  return gl
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('WebGL could not allocate a shader.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown WebGL shader compilation error.'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function shaderProgram(r: SkiaRenderer, definition: ShaderDefinition) {
  const programSource = definition.webglSource ?? definition.source
  const cached = r.pencilShaderPrograms.get(programSource)
  if (cached) return cached
  const gl = shaderContext(r)
  if (!gl) return null
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }'
  )
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    programSource.replace(/^\s*#version\s+100\s*$/mu, '')
  )
  const program = gl.createProgram()
  if (!program) throw new Error('WebGL could not allocate a shader program.')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown WebGL shader link error.'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  const position = gl.getAttribLocation(program, 'a_position')
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const result = { program, position, buffer }
  r.pencilShaderPrograms.set(programSource, result)
  return result
}

function shaderColor(value: string, length: number): number[] {
  const hex = value.slice(1)
  const channels = [0, 2, 4, 6].map((offset) =>
    offset < hex.length ? Number.parseInt(hex.slice(offset, offset + 2), 16) / 255 : 1
  )
  return channels.slice(0, length)
}

function setUniform(
  gl: WebGLRenderingContext,
  location: WebGLUniformLocation | null,
  uniform: ShaderUniform,
  value: any
): void {
  if (location === null) return
  if (uniform.type === 'float') gl.uniform1f(location, value)
  else if (uniform.type === 'int' || uniform.type === 'bool') gl.uniform1i(location, Number(value))
  else {
    const values =
      typeof value === 'string' ? shaderColor(value, Number(uniform.type.at(-1))) : value
    const integer = uniform.type.startsWith('ivec')
    const method = `uniform${values.length}${integer ? 'iv' : 'fv'}` as keyof WebGLRenderingContext
    ;(gl[method] as unknown as (location: WebGLUniformLocation, values: number[]) => void)(
      location,
      values
    )
  }
}

function imageTexture(r: SkiaRenderer, hash: string | undefined, graph: SceneGraph) {
  if (!hash) return null
  const cached = r.pencilShaderTextures.get(hash)
  if (cached) return cached
  const bytes = graph.images.get(hash)
  if (!bytes) return null
  const image = r.ck.MakeImageFromEncoded(bytes)
  if (!image) return null
  const width = image.width()
  const height = image.height()
  const pixels = image.readPixels(0, 0, {
    width,
    height,
    colorType: r.ck.ColorType.RGBA_8888,
    alphaType: r.ck.AlphaType.Unpremul,
    colorSpace: r.ck.ColorSpace.SRGB
  })
  image.delete()
  if (!pixels) return null
  const gl = shaderContext(r)
  if (!gl) return null
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  const result = { texture, width, height }
  r.pencilShaderTextures.set(hash, result)
  return result
}

function squaredDistanceTransform1D(values: Float64Array): Float64Array {
  const length = values.length
  const output = new Float64Array(length)
  const locations = new Int32Array(length)
  const boundaries = new Float64Array(length + 1)
  let last = 0
  locations[0] = 0
  boundaries[0] = -Infinity
  boundaries[1] = Infinity
  for (let q = 1; q < length; q++) {
    let intersection: number
    do {
      const p = locations[last]!
      intersection = (values[q]! + q * q - values[p]! - p * p) / (2 * q - 2 * p)
      if (intersection <= boundaries[last]!) last--
    } while (intersection <= boundaries[last]!)
    last++
    locations[last] = q
    boundaries[last] = intersection
    boundaries[last + 1] = Infinity
  }
  last = 0
  for (let q = 0; q < length; q++) {
    while (boundaries[last + 1]! < q) last++
    const location = locations[last]!
    const delta = q - location
    output[q] = delta * delta + values[location]!
  }
  return output
}

function squaredDistanceTransform2D(
  mask: Uint8Array,
  width: number,
  height: number,
  featureValue: number
): Float64Array {
  const infinity = 1e20
  const intermediate = new Float64Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = new Float64Array(width)
    for (let x = 0; x < width; x++) row[x] = mask[y * width + x] === featureValue ? 0 : infinity
    intermediate.set(squaredDistanceTransform1D(row), y * width)
  }
  const output = new Float64Array(width * height)
  for (let x = 0; x < width; x++) {
    const column = new Float64Array(height)
    for (let y = 0; y < height; y++) column[y] = intermediate[y * width + x]!
    const transformed = squaredDistanceTransform1D(column)
    for (let y = 0; y < height; y++) output[y * width + x] = transformed[y]!
  }
  return output
}

function sdfPixels(
  r: SkiaRenderer,
  node: SceneNode,
  width: number,
  height: number
): Float32Array | null {
  const surface = r.ck.MakeSurface(width, height)
  if (!surface) return null
  const canvas = surface.getCanvas()
  canvas.clear(r.ck.TRANSPARENT)
  const paint = new r.ck.Paint()
  paint.setAntiAlias(true)
  paint.setColor(r.ck.WHITE)
  const path = r.makeNodeShapePath(
    node,
    r.ck.LTRBRect(0, 0, node.width, node.height),
    nodeHasRadius(node)
  )
  canvas.drawPath(path, paint)
  surface.flush()
  path.delete()
  paint.delete()
  const pixels = surface.readPixels(0, 0, {
    width,
    height,
    colorType: r.ck.ColorType.RGBA_8888,
    alphaType: r.ck.AlphaType.Unpremul,
    colorSpace: r.ck.ColorSpace.SRGB
  })
  surface.delete()
  if (!pixels) return null
  const paddedWidth = width + 2
  const paddedHeight = height + 2
  const mask = new Uint8Array(paddedWidth * paddedHeight)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      mask[(y + 1) * paddedWidth + x + 1] = pixels[(y * width + x) * 4 + 3]! >= 128 ? 1 : 0
    }
  }
  const toInside = squaredDistanceTransform2D(mask, paddedWidth, paddedHeight, 1)
  const toOutside = squaredDistanceTransform2D(mask, paddedWidth, paddedHeight, 0)
  const distance = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const paddedIndex = (y + 1) * paddedWidth + x + 1
      distance[index] = mask[paddedIndex]
        ? Math.sqrt(toOutside[paddedIndex]!)
        : -Math.sqrt(toInside[paddedIndex]!)
    }
  }
  const output = new Float32Array(width * height * 4)
  const sample = (x: number, y: number) =>
    distance[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))]!
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const dx = sample(x + 1, y) - sample(x - 1, y)
      const dy = sample(x, y + 1) - sample(x, y - 1)
      const magnitude = Math.hypot(dx, dy) || 1
      const destination = ((height - 1 - y) * width + x) * 4
      output[destination] = distance[index]!
      output[destination + 1] = dx / magnitude
      output[destination + 2] = -dy / magnitude
      output[destination + 3] = 1
    }
  }
  return output
}

function sdfTexture(r: SkiaRenderer, node: SceneNode, width: number, height: number) {
  const key = `sdf:${node.id}:${width}:${height}`
  const cached = r.pencilShaderTextures.get(key)
  if (cached) return cached
  const gl = shaderContext(r)
  if (!gl) return null
  if (!gl.getExtension('OES_texture_float')) {
    throw new Error('WebGL floating-point textures are required for Pencil @sdf shaders.')
  }
  const pixels = sdfPixels(r, node, width, height)
  if (!pixels) return null
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, pixels)
  const result = { texture, width, height }
  r.pencilShaderTextures.set(key, result)
  return result
}

function backdropTexture(r: SkiaRenderer, node: SceneNode, width: number, height: number) {
  const canvas = r.pencilShaderRenderCanvas
  if (!canvas) return null
  r.surface.flush()
  const snapshot = r.surface.makeImageSnapshot()
  const snapshotWidth = snapshot.width()
  const snapshotHeight = snapshot.height()
  const source = snapshot.readPixels(0, 0, {
    width: snapshotWidth,
    height: snapshotHeight,
    colorType: r.ck.ColorType.RGBA_8888,
    alphaType: r.ck.AlphaType.Unpremul,
    colorSpace: r.ck.ColorSpace.SRGB
  })
  snapshot.delete()
  if (!source) return null
  const matrix = canvas.getTotalMatrix()
  const output = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const localX = ((x + 0.5) / width) * node.width
      const localY = ((y + 0.5) / height) * node.height
      const [deviceX, deviceY] = r.ck.Matrix.mapPoints(matrix, [localX, localY])
      const sx = Math.max(0, Math.min(snapshotWidth - 1, Math.floor(deviceX!)))
      const sy = Math.max(0, Math.min(snapshotHeight - 1, Math.floor(deviceY!)))
      const sourceIndex = (sy * snapshotWidth + sx) * 4
      const destinationIndex = ((height - 1 - y) * width + x) * 4
      output[destinationIndex] = source[sourceIndex]!
      output[destinationIndex + 1] = source[sourceIndex + 1]!
      output[destinationIndex + 2] = source[sourceIndex + 2]!
      output[destinationIndex + 3] = source[sourceIndex + 3]!
    }
  }
  const gl = shaderContext(r)
  if (!gl) return null
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, output)
  return { texture, width, height, transient: true }
}

function renderShader(
  r: SkiaRenderer,
  definition: ShaderDefinition,
  node: SceneNode,
  graph: SceneGraph
) {
  const gl = shaderContext(r)
  const compiled = shaderProgram(r, definition)
  if (!gl || !compiled || !r.pencilShaderCanvas) return null
  const width = Math.max(1, Math.ceil(node.width))
  const height = Math.max(1, Math.ceil(node.height))
  r.pencilShaderCanvas.width = width
  r.pencilShaderCanvas.height = height
  gl.viewport(0, 0, width, height)
  gl.useProgram(compiled.program)
  gl.bindBuffer(gl.ARRAY_BUFFER, compiled.buffer)
  gl.enableVertexAttribArray(compiled.position)
  gl.vertexAttribPointer(compiled.position, 2, gl.FLOAT, false, 0, 0)
  let textureUnit = 0
  const transientTextures: (WebGLTexture | null)[] = []
  for (const uniform of definition.uniforms) {
    const location = gl.getUniformLocation(compiled.program, uniform.name)
    if (uniform.automatic === 'resolution') setUniform(gl, location, uniform, [width, height])
    else if (uniform.automatic === 'time') {
      const now = typeof performance === 'undefined' ? 0 : performance.now()
      setUniform(gl, location, uniform, (now - r.pencilShaderEpoch) / 1000)
    } else if (uniform.automatic === 'mouse') {
      const absolute = graph.getAbsolutePosition(node.id)
      const mouse = r.pencilShaderMouseCanvas
      setUniform(
        gl,
        location,
        uniform,
        mouse ? [mouse.x - absolute.x, height - (mouse.y - absolute.y)] : [-1, -1]
      )
    } else if (uniform.type === 'sampler2D') {
      const textureInfo = definition.textures.find(({ name }) => name === uniform.name)
      const texture =
        uniform.automatic === 'sdf'
          ? sdfTexture(r, node, width, height)
          : uniform.automatic === 'backdrop'
            ? backdropTexture(r, node, width, height)
            : imageTexture(r, textureInfo?.sha256, graph)
      if (!texture) return null
      if (texture.transient) transientTextures.push(texture.texture)
      gl.activeTexture(gl.TEXTURE0 + textureUnit)
      gl.bindTexture(gl.TEXTURE_2D, texture.texture)
      gl.uniform1i(location, textureUnit)
      const sizeLocation = gl.getUniformLocation(
        compiled.program,
        `__pencil_texture_size_${uniform.name}`
      )
      if (sizeLocation !== null) gl.uniform2f(sizeLocation, texture.width, texture.height)
      textureUnit++
    } else setUniform(gl, location, uniform, definition.values[uniform.name])
  }
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.finish()
  const image = r.surface.makeImageFromTextureSource(r.pencilShaderCanvas, undefined, false)
  for (const texture of transientTextures) gl.deleteTexture(texture)
  return image
}

export function applyPencilShaderFill(
  r: SkiaRenderer,
  fill: Fill,
  node: SceneNode,
  graph: SceneGraph
): boolean {
  const definition = fill.pencilShader as ShaderDefinition
  const dynamic = definition.uniforms.some(({ automatic }) =>
    ['time', 'mouse', 'backdrop'].includes(automatic ?? '')
  )
  const key = `${node.id}:${node.width}:${node.height}:${JSON.stringify(definition.values)}`
  let image = dynamic ? null : r.pencilShaderImages.get(key)
  if (!image) {
    try {
      image = renderShader(r, definition, node, graph)
    } catch (error) {
      console.error('Pencil shader render failed', error)
      return applyShaderFallback(r, definition)
    }
    if (!image) return applyShaderFallback(r, definition)
    if (!dynamic) r.pencilShaderImages.set(key, image)
  }
  const shader = image.makeShaderOptions(
    r.ck.TileMode.Clamp,
    r.ck.TileMode.Clamp,
    r.ck.FilterMode.Linear,
    r.ck.MipmapMode.None
  )
  r.fillPaint.setShader(shader)
  if (dynamic) image.delete()
  return true
}

type Point = [number, number]
type MeshPatch = { p00: MeshPoint; p10: MeshPoint; p01: MeshPoint; p11: MeshPoint }

function pointAdd(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1]]
}

function pointMix(a: Point, b: Point, t: number): Point {
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t]
}

function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const inverse = 1 - t
  return [0, 1].map(
    (axis) =>
      inverse ** 3 * a[axis]! +
      3 * inverse ** 2 * t * b[axis]! +
      3 * inverse * t ** 2 * c[axis]! +
      t ** 3 * d[axis]!
  ) as Point
}

function meshPatch(mesh: MeshDefinition, column: number, row: number): MeshPatch {
  return {
    p00: mesh.points[row * mesh.columns + column]!,
    p10: mesh.points[row * mesh.columns + column + 1]!,
    p01: mesh.points[(row + 1) * mesh.columns + column]!,
    p11: mesh.points[(row + 1) * mesh.columns + column + 1]!
  }
}

function evaluateMeshSurface(patch: MeshPatch, u: number, v: number): Point {
  const { p00, p10, p01, p11 } = patch
  const top = cubic(
    p00.position,
    pointAdd(p00.position, p00.rightHandle),
    pointAdd(p10.position, p10.leftHandle),
    p10.position,
    u
  )
  const bottom = cubic(
    p01.position,
    pointAdd(p01.position, p01.rightHandle),
    pointAdd(p11.position, p11.leftHandle),
    p11.position,
    u
  )
  const left = cubic(
    p00.position,
    pointAdd(p00.position, p00.bottomHandle),
    pointAdd(p01.position, p01.topHandle),
    p01.position,
    v
  )
  const right = cubic(
    p10.position,
    pointAdd(p10.position, p10.bottomHandle),
    pointAdd(p11.position, p11.topHandle),
    p11.position,
    v
  )
  const bilinear = pointMix(
    pointMix(p00.position, p10.position, u),
    pointMix(p01.position, p11.position, u),
    v
  )
  const crossed = pointAdd(pointMix(top, bottom, v), pointMix(left, right, u))
  return [crossed[0] - bilinear[0], crossed[1] - bilinear[1]]
}

function meshSegments(patch: MeshPatch, width: number, height: number): number {
  const center = evaluateMeshSurface(patch, 0.5, 0.5)
  const bilinearCenter = pointMix(
    pointMix(patch.p00.position, patch.p10.position, 0.5),
    pointMix(patch.p01.position, patch.p11.position, 0.5),
    0.5
  )
  let error = Math.hypot(
    (center[0] - bilinearCenter[0]) * width,
    (center[1] - bilinearCenter[1]) * height
  )
  const boundaryControls: [Point, Point, Point, Point][] = [
    [
      patch.p00.position,
      pointAdd(patch.p00.position, patch.p00.rightHandle),
      pointAdd(patch.p10.position, patch.p10.leftHandle),
      patch.p10.position
    ],
    [
      patch.p01.position,
      pointAdd(patch.p01.position, patch.p01.rightHandle),
      pointAdd(patch.p11.position, patch.p11.leftHandle),
      patch.p11.position
    ],
    [
      patch.p00.position,
      pointAdd(patch.p00.position, patch.p00.bottomHandle),
      pointAdd(patch.p01.position, patch.p01.topHandle),
      patch.p01.position
    ],
    [
      patch.p10.position,
      pointAdd(patch.p10.position, patch.p10.bottomHandle),
      pointAdd(patch.p11.position, patch.p11.topHandle),
      patch.p11.position
    ]
  ]
  for (const curve of boundaryControls) {
    for (const t of [0.25, 0.5, 0.75]) {
      const curvePoint = cubic(...curve, t)
      const chordPoint = pointMix(curve[0], curve[3], t)
      error = Math.max(
        error,
        Math.hypot(
          (curvePoint[0] - chordPoint[0]) * width,
          (curvePoint[1] - chordPoint[1]) * height
        )
      )
    }
  }
  return Math.max(1, Math.min(128, Math.ceil(Math.sqrt(error / 0.25))))
}

function meshProgram(r: SkiaRenderer) {
  const cacheKey = '__pencil_mesh_gradient__'
  const cached = r.pencilShaderPrograms.get(cacheKey)
  if (cached) return cached
  const gl = shaderContext(r)
  if (!gl) return null
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    `attribute vec2 a_position;
     attribute vec2 a_uv;
     varying vec2 v_uv;
     void main() {
       v_uv = a_uv;
       gl_Position = vec4(a_position.x * 2.0 - 1.0, 1.0 - a_position.y * 2.0, 0.0, 1.0);
     }`
  )
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `precision mediump float;
     varying vec2 v_uv;
     uniform vec4 u_color00;
     uniform vec4 u_color10;
     uniform vec4 u_color01;
     uniform vec4 u_color11;
     void main() {
       gl_FragColor = mix(mix(u_color00, u_color10, v_uv.x), mix(u_color01, u_color11, v_uv.x), v_uv.y);
     }`
  )
  const program = gl.createProgram()
  if (!program) throw new Error('WebGL could not allocate a mesh shader program.')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown Pencil mesh shader link error.'
    gl.deleteProgram(program)
    throw new Error(message)
  }
  const result = {
    program,
    position: gl.getAttribLocation(program, 'a_position'),
    uv: gl.getAttribLocation(program, 'a_uv'),
    buffer: gl.createBuffer()
  }
  r.pencilShaderPrograms.set(cacheKey, result)
  return result
}

function meshColor(value: string): [number, number, number, number] {
  const parsed = parseColor(value)
  return [parsed.r, parsed.g, parsed.b, parsed.a]
}

function renderMesh(r: SkiaRenderer, mesh: MeshDefinition, node: SceneNode) {
  const gl = shaderContext(r)
  const compiled = meshProgram(r)
  if (!gl || !compiled || compiled.uv === undefined || !r.pencilShaderCanvas) return null
  const width = Math.max(1, Math.ceil(node.width))
  const height = Math.max(1, Math.ceil(node.height))
  r.pencilShaderCanvas.width = width
  r.pencilShaderCanvas.height = height
  gl.viewport(0, 0, width, height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(compiled.program)
  gl.bindBuffer(gl.ARRAY_BUFFER, compiled.buffer)
  gl.enableVertexAttribArray(compiled.position)
  gl.vertexAttribPointer(compiled.position, 2, gl.FLOAT, false, 16, 0)
  gl.enableVertexAttribArray(compiled.uv)
  gl.vertexAttribPointer(compiled.uv, 2, gl.FLOAT, false, 16, 8)
  for (let row = 0; row < mesh.rows - 1; row++) {
    for (let column = 0; column < mesh.columns - 1; column++) {
      const patch = meshPatch(mesh, column, row)
      const segments = meshSegments(patch, width, height)
      const vertices: number[] = []
      const append = (u: number, v: number) => {
        const point = evaluateMeshSurface(patch, u, v)
        vertices.push(point[0], point[1], u, v)
      }
      for (let y = 0; y < segments; y++) {
        for (let x = 0; x < segments; x++) {
          const u0 = x / segments
          const u1 = (x + 1) / segments
          const v0 = y / segments
          const v1 = (y + 1) / segments
          append(u0, v0)
          append(u1, v0)
          append(u0, v1)
          append(u0, v1)
          append(u1, v0)
          append(u1, v1)
        }
      }
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW)
      const colorIndex = row * mesh.columns + column
      const colors = [
        mesh.colors[colorIndex]!,
        mesh.colors[colorIndex + 1]!,
        mesh.colors[colorIndex + mesh.columns]!,
        mesh.colors[colorIndex + mesh.columns + 1]!
      ]
      for (const [index, name] of ['u_color00', 'u_color10', 'u_color01', 'u_color11'].entries()) {
        gl.uniform4fv(gl.getUniformLocation(compiled.program, name), meshColor(colors[index]!))
      }
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4)
    }
  }
  gl.finish()
  return r.ck.MakeImageFromCanvasImageSource(r.pencilShaderCanvas)
}

export function applyPencilMeshFill(r: SkiaRenderer, fill: Fill, node: SceneNode): boolean {
  const mesh = fill.pencilMesh as MeshDefinition
  const key = `${node.id}:mesh:${node.width}:${node.height}:${JSON.stringify(mesh)}`
  let image = r.pencilShaderImages.get(key)
  if (!image) {
    try {
      image = renderMesh(r, mesh, node) ?? undefined
    } catch (error) {
      console.error('Pencil mesh gradient render failed', error)
      return false
    }
    if (!image) return false
    r.pencilShaderImages.set(key, image)
  }
  const shader = image.makeShaderOptions(
    r.ck.TileMode.Clamp,
    r.ck.TileMode.Clamp,
    r.ck.FilterMode.Linear,
    r.ck.MipmapMode.None
  )
  r.fillPaint.setShader(shader)
  return true
}
