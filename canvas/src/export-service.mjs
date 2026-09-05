import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { buildExporterIR } from "./exporter-ir.mjs";
import { validateOutputSegment, writeAtomicBundle, writeAtomicFile } from "./export-bundle.mjs";
import { exportPptx } from "./exporters/pptx.mjs";
import { exportPdf } from "./exporters/pdf.mjs";
import { exportWeb } from "./exporters/web.mjs";
import { exportCompose, exportSwiftUI } from "./exporters/mobile.mjs";
import { exportSvg } from "./exporters/svg.mjs";
import { takeDocumentScreenshots } from "./document-screenshot.mjs";
import { resolveCanvasDocument } from "./canvas-resolver.mjs";

export async function exportDocument(document, request, options = {}) {
  const ir = buildExporterIR(document, request);
  const rasterById = new Map(ir.rasters.map((raster) => [raster.id, raster]));
  const screenshot = async (nodeId) => {
    const raster = rasterById.get(nodeId);
    const variant = raster?.variants?.at(-1);
    if (!variant) throw new Error(`Raster policy is missing for ${nodeId}.`);
    const image = (await takeDocumentScreenshots(ir.renderDocument, [{ nodeIds: [nodeId] }], options.assets, { scale: variant.scale, maxDimension: 8192, failOnDownscale: true }))[0];
    if (image.width !== variant.pixelWidth || image.height !== variant.pixelHeight) {
      const error = new Error(`Raster ${nodeId} rendered ${image.width}×${image.height}, expected ${variant.pixelWidth}×${variant.pixelHeight}.`);
      error.code = "CANVAS_RASTER_DIMENSION_MISMATCH";
      throw error;
    }
    return image;
  };
  let artifact;
  if (request.role === "slide") artifact = await exportPptx(ir, { fonts: await readBundledPptxFonts(), rasterize: async (id) => ({ data: `data:image/png;base64,${(await screenshot(id)).data}` }) });
  else if (request.role === "page") artifact = await exportPdf(ir, {
    title: options.title,
    profile: request.profile,
    outputIntent: await readBundledSrgbProfile(),
    fonts: await readBundledPdfFonts(),
    rasterizeNode: async (id) => Buffer.from((await screenshot(id)).data, "base64"),
  });
  else if (request.role === "route") {
    const hrefs = new Map(ir.rasters.map((raster) => [raster.id, `assets/${validateOutputSegment(raster.id)}.png`]));
    artifact = exportWeb(ir, { rasterHref: (id) => hrefs.get(id) });
    for (const [id, href] of hrefs) artifact.set(href, Buffer.from((await screenshot(id)).data, "base64"));
  }
  else if (request.role === "ios" || request.role === "android") {
    const rasters = new Map();
    for (const raster of ir.rasters) rasters.set(raster.id, (await screenshot(raster.id)).data);
    artifact = request.role === "ios"
      ? exportSwiftUI(ir, { rasterData: (id) => rasters.get(id) })
      : exportCompose(ir, { rasterData: (id) => rasters.get(id) });
  }
  else throw new Error(`Unsupported role ${request.role}.`);
  if (artifact instanceof Map) {
    artifact.set("export-report.json", JSON.stringify(report(ir, request.destination, request.role), null, 2));
    await writeAtomicBundle(request.destination, artifact);
  } else await writeAtomicFile(request.destination, artifact);
  return report(ir, request.destination, request.role);
}

export async function exportImage(document, request, options = {}) {
  if (!Array.isArray(request.frames) || request.frames.length === 0) throw new Error("Image export needs frames.");
  if (request.frames.length !== 1) {
    const error = new Error("Image export accepts exactly one subtree because the contract has one destination path.");
    error.code = "CANVAS_EXPORT_IMAGE_DESTINATION_AMBIGUOUS";
    throw error;
  }
  if (request.format === "png") {
    const renderDocument = resolveCanvasDocument(document, { modes: request.modes, imports: options.imports }).document;
    const [image] = await takeDocumentScreenshots(renderDocument, [{ nodeIds: [request.frames[0]] }], options.assets, { scale: request.scale ?? 1, maxDimension: 8192, failOnDownscale: true });
    await writeAtomicFile(request.destination, Buffer.from(image.data, "base64"));
    return { artifacts: [request.destination], width: image.width, height: image.height, format: "png" };
  }
  if (request.format === "svg") {
    const frame = request.frames[0]; const source = findNode(document.children, frame);
    if (!source?.role) throw new Error(`SVG frame ${frame} needs an export role for IR resolution.`);
    const svgIr = buildExporterIR(document, { role: source.role, capability: "svg", frames: [frame], modes: request.modes, imports: options.imports });
    const rasterHrefs = new Map();
    for (const raster of svgIr.rasters) {
      const image = await takeDocumentScreenshots(
        document,
        [{ nodeIds: [raster.id] }],
        options.assets,
        { scale: request.scale ?? raster.variants.at(-1).scale, maxDimension: 8192, failOnDownscale: true },
      ).then((images) => images[0]);
      rasterHrefs.set(raster.id, `data:image/png;base64,${image.data}`);
    }
    const svg = exportSvg(svgIr, svgIr.outputs[0], {
      rasterHref: (id) => rasterHrefs.get(id),
    });
    await writeAtomicFile(request.destination, svg); return { artifacts: [request.destination], format: "svg", consequences: svgIr.consequences };
  }
  throw new Error(`Image format must be png or svg.`);
}
function report(ir, path, role) { const usesInter = ir.outputs.some((output) => output.nodes.some((node) => node.type === "text" && node.semantics.runs.some((run) => (run.fontFamily ?? "Inter") === "Inter"))); return { artifacts: [path], consequences: ir.consequences, lowered: ir.lowered, embeddedFonts: role === "slide" && usesInter ? [{ typeface: "Inter", faces: ["regular", "bold"], source: "bundled-document-font" }] : [], rasterized: ir.rasters }; }
function findNode(children, id) { for (const node of children ?? []) { if (node.id === id) return node; const found = findNode(node.children, id); if (found) return found; } return null; }
async function readBundledSrgbProfile() {
  try { return await readFile(new URL("../assets/color/sRGB2014.icc", import.meta.url)); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return readFile(new URL("./assets/color/sRGB2014.icc", import.meta.url));
  }
}
async function readBundledPdfFonts() {
  const names = { 400: "Inter-Regular.ttf", 500: "Inter-Medium.ttf", 600: "Inter-SemiBold.ttf", 700: "Inter-Bold.ttf" };
  return Object.fromEntries(await Promise.all(Object.entries(names).map(async ([weight, filename]) => {
    try { return [`Inter:${weight}`, await readFile(new URL(`../vendor/open-pencil/fonts/${filename}`, import.meta.url))]; }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return [`Inter:${weight}`, await readFile(new URL(`./${filename}`, import.meta.url))];
    }
  })));
}
async function readBundledPptxFonts() {
  const sources = await readBundledPdfFonts();
  return [{ typeface: "Inter", faces: { regular: sources["Inter:400"], bold: sources["Inter:700"] } }];
}
