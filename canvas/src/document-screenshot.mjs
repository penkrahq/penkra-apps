import { Buffer } from "node:buffer";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  computeDescendantVisualBounds,
  fontManager,
  getCanvasKit,
  SkiaRenderer,
} from "../vendor/open-pencil/engine.mjs";
import { createOpenPencilGraph } from "./openpencil-engine.mjs";
import { configureCanvasFonts } from "./font-runtime.mjs";
import { collectPencilDocumentFonts } from "./pencil-resources.mjs";

const MAX_SCREENSHOT_DIMENSION = 2048;
const BUNDLED_FONT_FILES = new Map([
  ["Inter|Regular", "Inter-Regular.ttf"],
  ["Inter|Medium", "Inter-Medium.ttf"],
  ["Inter|SemiBold", "Inter-SemiBold.ttf"],
  ["Inter|Bold", "Inter-Bold.ttf"],
  ["Inter|ExtraBold", "Inter-ExtraBold.ttf"],
  ["JetBrains Mono|Regular", "jetbrains-mono-400.woff2"],
  ["JetBrains Mono|Medium", "jetbrains-mono-500.woff2"],
  ["Material Symbols Outlined|Regular", "material-symbols-outlined.woff2"],
  ["Material Symbols Rounded|Regular", "material-symbols-rounded.woff2"],
  ["Material Symbols Sharp|Regular", "material-symbols-sharp.woff2"],
]);
let fontsConfigured = false;
let canvasKitWasmPath;

export async function takeDocumentScreenshots(document, requests, assets = new Map()) {
  if (requests.length === 0) return [];
  configureScreenshotFonts();
  for (const font of collectPencilDocumentFonts(document, assets)) {
    fontManager.registerDocumentFont(font.family, font.bytes);
  }
  const graph = createOpenPencilGraph(document, assets);
  const page = graph.getPages()[0];
  if (!page) throw screenshotError("CANVAS_SCREENSHOT_EMPTY", "The Canvas document has no page.");
  const screenshots = [];
  for (const request of requests) {
    screenshots.push(await renderScreenshot(graph, page.id, request.nodeIds));
  }
  return screenshots;
}

function configureScreenshotFonts() {
  if (fontsConfigured) return;
  fontsConfigured = true;
  if (globalThis.penkra?.network?.fetch) {
    configureCanvasFonts(globalThis.penkra, { cache: null });
  }
  fontManager.setHostFontLoader(async (family, style) => {
    const file = BUNDLED_FONT_FILES.get(`${family}|${style}`);
    if (!file) return null;
    for (const url of [
      new URL(`./${file}`, import.meta.url),
      new URL(`../vendor/open-pencil/fonts/${file}`, import.meta.url),
    ]) {
      try {
        const bytes = await readFile(url);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    return null;
  });
}

async function renderScreenshot(graph, pageId, nodeIds) {
  for (const nodeId of nodeIds) {
    if (!graph.getNode(nodeId)) {
      throw screenshotError("CANVAS_SCREENSHOT_NODE_NOT_FOUND", `Canvas node ${nodeId} is unavailable to the renderer.`);
    }
  }
  // CanvasKit's generated Node loader otherwise resolves its WASM beside the
  // package-manager source file that Bun bundled. That path is both outside an
  // installed App and unavailable to Penkra's operation controller.
  const wasmPath = await resolveCanvasKitWasmPath();
  const ck = await getCanvasKit({
    locateFile: () => wasmPath,
  });
  const initialSurface = ck.MakeSurface(1, 1);
  if (!initialSurface) {
    throw screenshotError("CANVAS_SCREENSHOT_FAILED", "CanvasKit could not create a screenshot surface.");
  }
  const renderer = new SkiaRenderer(ck, initialSurface, null);
  let restoreTextMeasurer = null;
  try {
    await renderer.loadFonts();
    restoreTextMeasurer = await renderer.prepareForExport(graph, pageId, nodeIds);
    const bounds = computeDescendantVisualBounds(
      nodeIds,
      (id) => graph.getNode(id) ?? undefined,
      (id) => graph.getAbsolutePosition(id),
    );
    if (!bounds) {
      throw screenshotError("CANVAS_SCREENSHOT_EMPTY", "The selected Canvas nodes have no visible content.");
    }
    const sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
    const sourceHeight = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(1, MAX_SCREENSHOT_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.ceil(sourceWidth * scale));
    const height = Math.max(1, Math.ceil(sourceHeight * scale));
    const surface = ck.MakeSurface(width, height);
    if (!surface) {
      throw screenshotError("CANVAS_SCREENSHOT_FAILED", "CanvasKit could not allocate the screenshot surface.");
    }
    renderer.replaceSurface(surface);
    renderer.pageId = pageId;
    renderer.worldViewport = {
      x: bounds.minX,
      y: bounds.minY,
      w: sourceWidth,
      h: sourceHeight,
    };
    const canvas = surface.getCanvas();
    canvas.clear(ck.TRANSPARENT);
    canvas.scale(scale, scale);
    canvas.translate(-bounds.minX, -bounds.minY);
    for (const nodeId of nodeIds) {
      const node = graph.getNode(nodeId);
      const absolute = graph.getAbsolutePosition(nodeId);
      renderer.renderNode(canvas, graph, nodeId, {}, absolute.x - node.x, absolute.y - node.y);
    }
    surface.flush();
    const image = surface.makeImageSnapshot();
    try {
      const bytes = image.encodeToBytes(ck.ImageFormat.PNG, 100);
      if (!bytes) {
        throw screenshotError("CANVAS_SCREENSHOT_FAILED", "CanvasKit could not encode the screenshot as PNG.");
      }
      return {
        nodeIds,
        width,
        height,
        mimeType: "image/png",
        data: Buffer.from(bytes).toString("base64"),
      };
    } finally {
      image.delete();
    }
  } finally {
    restoreTextMeasurer?.();
    renderer.destroy();
  }
}

async function resolveCanvasKitWasmPath() {
  if (canvasKitWasmPath) return canvasKitWasmPath;
  // Builds place the asset beside this module. Source tests use the declared
  // dependency directly; neither path depends on the caller's working directory.
  const candidates = [
    new URL("./canvaskit.wasm", import.meta.url),
    new URL("../node_modules/canvaskit-wasm/bin/canvaskit.wasm", import.meta.url),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      canvasKitWasmPath = fileURLToPath(candidate);
      return canvasKitWasmPath;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw screenshotError(
    "CANVAS_SCREENSHOT_RUNTIME_UNAVAILABLE",
    "CanvasKit is missing from this Canvas installation.",
  );
}

function screenshotError(code, message) {
  return Object.assign(new Error(message), { code });
}
