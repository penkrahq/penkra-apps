import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { buildExporterIR, buildExtractionIR } from "./exporter-ir.mjs";
import {
  cleanupPublishedExport,
  preflightExportDestinations,
  publishAtomicFile,
  publishExclusiveBundle,
  validateOutputSegment,
  writeExclusiveBundle,
  writeAtomicFile,
} from "./export-bundle.mjs";
import { exportPptx } from "./exporters/pptx.mjs";
import { exportPdf } from "./exporters/pdf.mjs";
import { exportWeb } from "./exporters/web.mjs";
import { exportCompose, exportSwiftUI } from "./exporters/mobile.mjs";
import { exportSvg } from "./exporters/svg.mjs";
import { measureDocumentText, takeDocumentScreenshots } from "./document-screenshot.mjs";
import { prepareScrollContentDocument } from "./scroll-content.mjs";

export async function exportDocument(document, request, options = {}) {
  await preflightExportDestinations([request.destination]);
  const prepared = await prepareDocumentExport(document, request, options);
  await publishPreparedDocumentExport(prepared);
  return prepared.report;
}

export async function prepareDocumentExport(document, request, options = {}) {
  const ir = buildExporterIR(document, request);
  const rasterById = new Map(ir.rasters.map((raster) => [raster.id, raster]));
  const screenshotFor = async (renderDocument, raster) => {
    const variant = raster?.variants?.at(-1);
    if (!variant) throw new Error(`Raster policy is missing for ${raster?.id ?? "unknown node"}.`);
    const image = (await takeDocumentScreenshots(renderDocument, [{ nodeIds: [raster.id], bounds: raster.renderBounds }], options.assets, { scale: variant.scale, maxDimension: 8192, failOnDownscale: true }))[0];
    if (image.width !== variant.pixelWidth || image.height !== variant.pixelHeight) {
      const error = new Error(`Raster ${raster.id} rendered ${image.width}×${image.height}, expected ${variant.pixelWidth}×${variant.pixelHeight}.`);
      error.code = "CANVAS_RASTER_DIMENSION_MISMATCH";
      throw error;
    }
    return image;
  };
  const screenshot = async (nodeId) => screenshotFor(ir.renderDocument, rasterById.get(nodeId));
  let artifact;
  if (request.role === "slide") artifact = await exportPptx(ir, { fonts: await readBundledPptxFonts(), imageData: (url) => embeddedImageHref(url, options.assets), rasterize: async (id) => ({ data: `data:image/png;base64,${(await screenshot(id)).data}` }) });
  else if (request.role === "route") {
    const hrefs = new Map(ir.rasters.map((raster, index) => [raster.id, `assets/raster-${index + 1}.png`]));
    const imageHrefs = new Map();
    for (const url of webImageUrls(ir.renderDocument)) {
      if (!options.assets?.has(url)) continue;
      imageHrefs.set(url, `assets/image-${imageHrefs.size + 1}${webAssetExtension(url)}`);
    }
    artifact = exportWeb(ir, { rasterHref: (id) => hrefs.get(id), assetHref: (url) => imageHrefs.get(url) ?? url });
    for (const [id, href] of hrefs) artifact.set(href, Buffer.from((await screenshot(id)).data, "base64"));
    for (const [url, href] of imageHrefs) {
      const asset = options.assets.get(url);
      artifact.set(href, asset?.bytes ?? asset);
    }
  }
  else if (request.role === "ios" || request.role === "android") {
    const rasters = new Map();
    for (const raster of ir.rasters) rasters.set(raster.id, (await screenshot(raster.id)).data);
    for (const mobileVariant of ir.mobileVariants ?? []) for (const raster of mobileVariant.rasters ?? []) {
      rasters.set(`${mobileVariant.rasterVariant}\u0000${raster.id}`, (await screenshotFor(mobileVariant.renderDocument, raster)).data);
    }
    const fonts = { ...await readBundledPdfFonts(), "Inter:800": await readBundledFontResource("Inter-ExtraBold.ttf") };
    const rasterData = (id, variant) => rasters.get(variant ? `${variant}\u0000${id}` : id);
    artifact = request.role === "ios"
      ? exportSwiftUI(ir, { fonts, rasterData })
      : exportCompose(ir, { fonts, rasterData });
    if ([...artifact.keys()].some((path) => path.endsWith(".ttf"))) artifact.set("licenses/Inter-OFL.txt", await readBundledFontResource("Inter-OFL.txt"));
  }
  else throw new Error(`Unsupported role ${request.role}.`);
  const artifacts = artifact instanceof Map
    ? [...artifact.keys(), "export-report.json"].map((name) => join(request.destination, name))
    : [request.destination];
  const exportReport = report(ir, artifacts, request.role);
  if (artifact instanceof Map) artifact.set("export-report.json", JSON.stringify(exportReport, null, 2));
  return { destination: request.destination, artifact, report: exportReport };
}

function webImageUrls(document) {
  const result = new Set();
  const visit = (nodes) => { for (const node of nodes ?? []) {
    for (const fill of (Array.isArray(node.fill) ? node.fill : [node.fill])) if (fill?.type === "image" && typeof fill.url === "string") result.add(fill.url);
    visit(node.children);
    for (const content of Object.values(node.slots ?? {})) visit(content);
  } };
  visit(document.children);
  return result;
}

function webAssetExtension(url) {
  const match = /\.(png|jpe?g|gif|webp|avif|svg)(?:$|[?#])/iu.exec(url);
  return match ? `.${match[1].toLowerCase().replace("jpeg", "jpg")}` : ".bin";
}

export async function publishPreparedDocumentExport(prepared) {
  return prepared.artifact instanceof Map
    ? publishExclusiveBundle(prepared.destination, prepared.artifact)
    : publishAtomicFile(prepared.destination, prepared.artifact);
}

export async function exportDocumentBatch(document, requests, options = {}) {
  if (!Array.isArray(requests) || requests.length === 0) throw new Error("Batch export needs at least one request.");
  await preflightExportDestinations(requests.map((request) => request.destination));
  const prepared = [];
  for (const request of requests) prepared.push(await prepareDocumentExport(document, request, options));
  return publishPreparedDocumentExports(prepared);
}

export async function publishPreparedDocumentExports(prepared) {
  const receipts = [];
  try {
    for (const item of prepared) receipts.push(await publishPreparedDocumentExport(item));
  } catch (error) {
    if (error.receipt) receipts.push(error.receipt);
    const cleanupFailures = [];
    for (const receipt of receipts.reverse()) cleanupFailures.push(...await cleanupPublishedExport(receipt));
    if (cleanupFailures.length) {
      error.cleanupFailures = cleanupFailures;
      error.message = `${error.message} Cleanup left ${cleanupFailures.length} path(s) whose identity changed or which were not empty.`;
    }
    throw error;
  }
  return {
    artifacts: prepared.flatMap((item) => item.report.artifacts),
    consequences: prepared.flatMap((item) => item.report.consequences),
    lowered: prepared.flatMap((item) => item.report.lowered),
    embeddedFonts: prepared.flatMap((item) => item.report.embeddedFonts),
    bundledFonts: prepared.flatMap((item) => item.report.bundledFonts ?? []),
    rasterized: prepared.flatMap((item) => item.report.rasterized),
  };
}

function validateExtractionRequest(request) {
  if (!["png", "svg", "pdf"].includes(request.format)) throw new Error("Extraction format must be png, svg or pdf.");
  if (request.scrollContent !== undefined && !["viewport", "full"].includes(request.scrollContent)) {
    const error = new Error("scrollContent must be viewport or full.");
    error.code = "CANVAS_EXTRACT_SCROLL_CONTENT";
    throw error;
  }
  if (request.profile !== undefined && (request.format !== "pdf" || request.profile !== "PDF/X-4")) {
    const error = new Error("The extraction profile must be PDF/X-4 and is only valid for PDF.");
    error.code = "CANVAS_PDF_PROFILE_UNKNOWN";
    throw error;
  }
  if (request.scale !== undefined && request.format !== "png") {
    const error = new Error("Only PNG extraction accepts a raster scale.");
    error.code = "CANVAS_EXTRACT_SCALE_UNSUPPORTED";
    throw error;
  }
}

export async function extractDocumentNodes(document, request, options = {}) {
  if (!Array.isArray(request.node) || request.node.length === 0 || request.node.some((id) => typeof id !== "string" || !id)) throw new Error("Extraction needs a non-empty node array.");
  validateExtractionRequest(request);
  await preflightExportDestinations([request.destination]);
  if (typeof request.destination === "string" && request.destination.endsWith("/")) {
    const names = request.node.map((id) => validateOutputSegment(`${id}.${request.format}`));
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error("Extraction filename collision.");
    // Render every unit before publishing anything: an invalid later node must
    // not leave a partially successful extraction at the requested destination.
    const rendered = [];
    for (const nodeId of request.node) rendered.push(await renderExtractionNode(document, { ...request, nodeId }, options));
    const destination = normalize(request.destination);
    await writeExclusiveBundle(destination, names.map((name, index) => [name, rendered[index].bytes]));
    return {
      artifacts: names.map((name) => join(destination, name)), format: request.format, units: request.node.length,
      consequences: rendered.flatMap((unit) => unit.report.consequences ?? []),
    };
  }
  if (request.node.length === 1) return extractDocumentNode(document, { ...request, nodeId: request.node[0] }, options);
  if (request.format !== "pdf") {
    const error = new Error(`${request.format} cannot hold several nodes in one file.`);
    error.code = "CANVAS_EXTRACT_FORMAT_SINGLE_UNIT";
    throw error;
  }
  const units = [];
  // The shared text measurer is temporarily installed during preparation.
  // Finish each preparation before starting the next one.
  for (const nodeId of request.node) units.push(await buildPdfExtractionIR(document, { ...request, nodeId }, options));
  const ir = {
    ...units[0],
    outputs: units.flatMap((unit) => unit.outputs).map((output, index) => ({ ...output, index })),
    consequences: units.flatMap((unit) => unit.consequences),
    rasters: units.flatMap((unit) => unit.rasters),
  };
  await writeAtomicFile(request.destination, await renderPdfExtraction(ir, request, options));
  return { artifacts: [request.destination], format: "pdf", units: request.node.length, consequences: ir.consequences };
}

export async function extractDocumentNode(document, request, options = {}) {
  if (typeof request.nodeId !== "string" || !request.nodeId) throw new Error("Extraction needs one nodeId.");
  validateExtractionRequest(request);
  if (typeof request.destination === "string" && request.destination.endsWith("/")) return extractDocumentNodes(document, { ...request, node: [request.nodeId] }, options);
  await preflightExportDestinations([request.destination]);
  const { bytes, report } = await renderExtractionNode(document, request, options);
  await writeAtomicFile(request.destination, bytes);
  return { artifacts: [request.destination], ...report };
}

async function renderExtractionNode(document, request, options) {
  if (request.format === "pdf") {
    const ir = await buildPdfExtractionIR(document, request, options);
    const artifact = await renderPdfExtraction(ir, request, options);
    return { bytes: artifact, report: { format: "pdf", consequences: ir.consequences } };
  }
  if (request.format === "png") {
    const renderDocument = prepareScrollContentDocument(document, {
      nodeId: request.nodeId,
      format: request.format,
      mode: request.scrollContent,
      modes: request.modes,
      bindings: request.bindings,
      imports: options.imports,
    });
    const [image] = await takeDocumentScreenshots(renderDocument, [{ nodeIds: [request.nodeId] }], options.assets, { scale: request.scale ?? 1, maxDimension: 8192, failOnDownscale: true });
    return { bytes: Buffer.from(image.data, "base64"), report: { width: image.width, height: image.height, format: "png" } };
  }
  if (request.format === "svg") {
    const prepared = prepareScrollContentDocument(document, {
      nodeId: request.nodeId,
      format: request.format,
      mode: request.scrollContent,
      modes: request.modes,
      bindings: request.bindings,
      imports: options.imports,
    });
    const svgIr = buildExtractionIR(prepared, { nodeId: request.nodeId, modes: request.modes, imports: options.imports, scale: request.scale });
    const rasterHrefs = new Map();
    for (const raster of svgIr.rasters) {
      const image = await takeDocumentScreenshots(
        svgIr.renderDocument,
        [{ nodeIds: [raster.id] }],
        options.assets,
        { scale: request.scale ?? raster.variants.at(-1).scale, maxDimension: 8192, failOnDownscale: true },
      ).then((images) => images[0]);
      rasterHrefs.set(raster.id, `data:image/png;base64,${image.data}`);
    }
    const svg = exportSvg(svgIr, svgIr.outputs[0], {
      rasterHref: (id) => rasterHrefs.get(id),
      imageHref: (url) => embeddedImageHref(url, options.assets),
    });
    return { bytes: svg, report: { format: "svg", consequences: svgIr.consequences } };
  }
  throw new Error(`Extraction format must be png, svg or pdf.`);
}

function embeddedImageHref(url, assets) {
  if (typeof url === "string" && url.startsWith("data:image/")) return url;
  const asset = assets instanceof Map ? assets.get(url) : undefined;
  const bytes = asset?.bytes ?? asset;
  if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes)) return null;
  const buffer = Buffer.from(bytes);
  const mime = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : buffer[0] === 0xff && buffer[1] === 0xd8 ? "image/jpeg" : null;
  return mime ? `data:${mime};base64,${buffer.toString("base64")}` : null;
}

function embeddedImageBytes(url, assets) {
  if (typeof url === "string" && url.startsWith("data:image/")) return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  const asset = assets instanceof Map ? assets.get(url) : undefined;
  const bytes = asset?.bytes ?? asset;
  return bytes instanceof Uint8Array || Buffer.isBuffer(bytes) ? Buffer.from(bytes) : null;
}

async function buildPdfExtractionIR(document, request, options) {
  const resolved = prepareScrollContentDocument(document, {
    nodeId: request.nodeId,
    format: "pdf",
    mode: request.scrollContent,
    modes: request.modes,
    bindings: request.bindings,
    imports: options.imports,
  });
  const textIds = [];
  const visit = (node, selected = false) => {
    selected ||= node.id === request.nodeId;
    if (selected && node.type === "text") textIds.push(node.id);
    for (const child of node.children ?? []) visit(child, selected);
  };
  for (const node of resolved.children ?? []) visit(node);
  const preparedText = textIds.length ? await measureDocumentText(resolved, textIds, options.assets) : undefined;
  return buildExtractionIR(resolved, { ...request, imports: options.imports, preparedText });
}

async function renderPdfExtraction(ir, request, options) {
  const pdfx = request.profile === "PDF/X-4";
  return exportPdf(ir, {
    title: options.title, profile: request.profile,
    outputIntent: pdfx ? await readBundledPdfxProfile() : await readBundledSrgbProfile(),
    sourceColorProfile: pdfx ? await readBundledSrgbProfile() : undefined,
    fonts: await readBundledPdfFonts(),
    imageData: (url) => embeddedImageBytes(url, options.assets),
    rasterizeNode: async (id) => {
      const [image] = await takeDocumentScreenshots(ir.renderDocument, [{ nodeIds: [id] }], options.assets, { scale: 1, maxDimension: 8192, failOnDownscale: true });
      return Buffer.from(image.data, "base64");
    },
  });
}
function report(ir, artifacts, role) {
  const nativeRuns = ir.outputs.flatMap((output) => output.nodes.filter((node) => node.type === "text" && node.capability.verdict === "native").flatMap((node) => node.semantics.runs));
  const usesInter = nativeRuns.some((run) => (run.fontFamily ?? "Inter") === "Inter");
  return {
    artifacts, consequences: ir.consequences, lowered: ir.lowered,
    embeddedFonts: role === "slide" && usesInter ? [{ typeface: "Inter", faces: ["regular", "bold"], source: "bundled-document-font" }] : [],
    bundledFonts: ["ios", "android"].includes(role) && usesInter ? [{ typeface: "Inter", weights: [...new Set(nativeRuns.filter((run) => (run.fontFamily ?? "Inter") === "Inter").map((run) => Number(run.weight ?? run.fontWeight ?? 400)))].sort((a, b) => a - b), source: "bundled-document-font" }] : [],
    rasterized: ir.rasters,
  };
}
async function readBundledSrgbProfile() {
  try { return await readFile(new URL("../assets/color/sRGB2014.icc", import.meta.url)); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return readFile(new URL("./assets/color/sRGB2014.icc", import.meta.url));
  }
}
async function readBundledPdfxProfile() {
  try { return await readFile(new URL("../assets/color/GRACoL2013_CRPC6.icc", import.meta.url)); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return readFile(new URL("./assets/color/GRACoL2013_CRPC6.icc", import.meta.url));
  }
}
async function readBundledPdfFonts() {
  const names = { 400: "Inter-Regular.ttf", 500: "Inter-Medium.ttf", 600: "Inter-SemiBold.ttf", 700: "Inter-Bold.ttf", 800: "Inter-ExtraBold.ttf" };
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

async function readBundledFontResource(filename) {
  try { return await readFile(new URL(`../vendor/open-pencil/fonts/${filename}`, import.meta.url)); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return readFile(new URL(`./${filename}`, import.meta.url));
  }
}
