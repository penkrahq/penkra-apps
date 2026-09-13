import {
  computeAllLayouts,
  createCanvasSceneGraph,
  createSVGNodesFromImport,
  prepareSVGImport,
  SkiaRenderer,
} from "../vendor/open-pencil/engine.source.mjs";

const DEFAULT_MAX_DIMENSION = 4096;

export async function rasterizeSvgWithCanvasKit(bytes, canvasKit, options = {}) {
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw svgError("The SVG image is not valid UTF-8.");
  }
  const imported = prepareSVGImport(source);
  if (!imported || imported.width <= 0 || imported.height <= 0) {
    throw svgError("Canvas could not parse visible SVG geometry.");
  }
  const graph = createCanvasSceneGraph({ version: "2.15", children: [] });
  const page = graph.getPages()[0];
  if (!page) throw svgError("Canvas could not create an SVG render page.");
  const node = createSVGNodesFromImport(graph, page.id, imported, { name: "Imported SVG" });
  if (!node) throw svgError("Canvas could not create renderable SVG geometry.");
  computeAllLayouts(graph, page.id);

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const scale = Math.min(1, maxDimension / Math.max(imported.width, imported.height));
  const width = Math.max(1, Math.ceil(imported.width * scale));
  const height = Math.max(1, Math.ceil(imported.height * scale));
  const initialSurface = canvasKit.MakeSurface(1, 1);
  if (!initialSurface) throw svgError("CanvasKit could not allocate an SVG render surface.");
  const renderer = new SkiaRenderer(canvasKit, initialSurface, null);
  try {
    await renderer.loadFonts();
    const surface = canvasKit.MakeSurface(width, height);
    if (!surface) throw svgError("CanvasKit could not allocate an SVG render surface.");
    renderer.replaceSurface(surface);
    renderer.pageId = page.id;
    renderer.worldViewport = { x: 0, y: 0, w: imported.width, h: imported.height };
    const canvas = surface.getCanvas();
    canvas.clear(canvasKit.TRANSPARENT);
    canvas.scale(scale, scale);
    renderer.renderNode(canvas, graph, node.id, {}, 0, 0);
    surface.flush();
    const image = surface.makeImageSnapshot();
    try {
      const encoded = image.encodeToBytes(canvasKit.ImageFormat.PNG, 100);
      if (!encoded) throw svgError("CanvasKit could not encode the SVG render cache.");
      return new Uint8Array(encoded);
    } finally {
      image.delete();
    }
  } finally {
    renderer.destroy();
  }
}

function svgError(message) {
  const error = new Error(message);
  error.code = "CANVAS_IMAGE_SVG_INVALID";
  return error;
}
