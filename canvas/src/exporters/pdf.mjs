import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFHexString, PDFName, PDFNumber, PDFOperator, PDFString, rgb } from "pdf-lib";

export async function exportPdf(ir, options = {}) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(options.title ?? "Canvas export");
  if (options.profile === "PDF/A-3") addPdfa3Metadata(pdf, options.title ?? "Canvas export");
  if (options.profile === "PDF/UA-1") addPdfuaMetadata(pdf, options.title ?? "Canvas export", ir.lang ?? "en");
  if (options.profile === "PDF/X-4") {
    const error = new Error(`${options.profile} export is blocked until its emitted structure passes the pinned conformance validator.`);
    error.code = "CANVAS_PDF_PROFILE_UNVERIFIED";
    throw error;
  }
  if (options.outputIntent) addSrgbOutputIntent(pdf, options.outputIntent, options.profile);
  const fonts = await embedFonts(pdf, options.fonts ?? {});
  const tagging = options.profile === "PDF/UA-1" ? createTagging(pdf) : null;
  for (const output of ir.outputs) {
    const physical = output.physical;
    const width = physical ? toPoints(physical.w, physical.unit) : output.width * 0.75;
    const height = physical ? toPoints(physical.h, physical.unit) : output.height * 0.75;
    const page = pdf.addPage([width, height]);
    const ordered = readingOrder(output);
    if (tagging && !Array.isArray(output.root?.semantics?.readingOrder)) throw profileError("PDF/UA-1 requires readingOrder on every page frame.");
    for (const node of ordered) {
      const tag = tagging?.begin(page, node);
      await drawNode(pdf, page, node, output, fonts, options);
      tagging?.end(page, tag);
    }
    const bleed = Number(output.bleed ?? 0) * 0.75;
    if (bleed > 0) {
      page.node.set(PDFName.of("TrimBox"), pdf.context.obj([bleed, bleed, width - bleed, height - bleed]));
      page.node.set(PDFName.of("BleedBox"), pdf.context.obj([0, 0, width, height]));
    }
    for (const fold of output.folds ?? []) {
      const x = Number(fold) / output.width * width;
      page.drawLine({ start: { x, y: 0 }, end: { x, y: height }, thickness: 0.25, opacity: 0.35 });
    }
  }
  tagging?.finish();
  return new Uint8Array(await pdf.save());
}

async function drawNode(pdf, page, node, output, fonts, options) {
  if (node.capability.verdict === "ignore") return;
  const sx = page.getWidth() / output.width;
  const sy = page.getHeight() / output.height;
  const x = node.geometry.x * sx;
  const y = page.getHeight() - (node.geometry.y + node.geometry.h) * sy;
  const width = node.geometry.w * sx;
  const height = node.geometry.h * sy;
  if (node.capability.verdict === "raster" || imageFill(node.paint.fill)) {
    if (!options.rasterizeNode) throw new Error(`PDF rasterizer is required for ${node.id}.`);
    const rendered = await options.rasterizeNode(node.id, 300);
    const image = await pdf.embedPng(rendered.bytes ?? rendered);
    page.drawImage(image, { x, y, width, height });
    return;
  }
  if (node.type === "text") { drawText(page, node, { x, y, width, height }, fonts); return; }
  const fill = color(node.paint.fill);
  const stroke = color(node.paint.stroke?.fill ?? node.paint.stroke?.color);
  const opacity = Number(node.paint.opacity ?? 1);
  const borderWidth = Number(node.paint.stroke?.width ?? node.paint.stroke?.thickness ?? 1) * sx;
  const common = { x, y, width, height, opacity, ...(fill ? { color: pdfColor(fill) } : {}), ...(stroke ? { borderColor: pdfColor(stroke), borderWidth } : {}) };
  if (node.type === "ellipse") page.drawEllipse({ x: x + width / 2, y: y + height / 2, xScale: width / 2, yScale: height / 2, opacity, ...(fill ? { color: pdfColor(fill) } : {}), ...(stroke ? { borderColor: pdfColor(stroke), borderWidth } : {}) });
  else if (node.type === "line") page.drawLine({ start: { x, y: y + height }, end: { x: x + width, y }, color: pdfColor(stroke ?? "#000000"), thickness: borderWidth });
  else page.drawRectangle(common);
}

function drawText(page, node, box, fonts) {
  let cursorX = box.x;
  let baseline = box.y + box.height;
  for (const run of node.semantics.runs) {
    const text = node.semantics.content.slice(run.from, run.to);
    const font = selectFont(fonts, run);
    if (!font) throw new Error(`No embeddable PDF font is available for ${run.fontFamily ?? "the text run"}.`);
    const size = Number(run.fontSize ?? 16) * 0.75;
    const pieces = text.split("\n");
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      if (piece) {
        page.drawText(piece, { x: cursorX, y: baseline - size, size, font, color: pdfColor(color(run.fill) ?? "#000000") });
        cursorX += font.widthOfTextAtSize(piece, size);
      }
      if (index < pieces.length - 1) { cursorX = box.x; baseline -= Number(run.lineHeight ?? run.fontSize ?? 16) * 0.75; }
    }
  }
}

async function embedFonts(pdf, sources) {
  const result = new Map();
  for (const [key, bytes] of Object.entries(sources)) result.set(key, await pdf.embedFont(bytes, { subset: true }));
  return result;
}
function selectFont(fonts, run) {
  const family = run.fontFamily ?? "Inter";
  const weight = Number(run.weight ?? run.fontWeight ?? 400);
  return fonts.get(`${family}:${weight >= 700 ? 700 : weight >= 600 ? 600 : weight >= 500 ? 500 : 400}`) ?? fonts.get(`${family}:400`);
}
function imageFill(fill) { return (Array.isArray(fill) ? fill : [fill]).some((item) => item?.type === "image" || typeof item?.url === "string"); }
function color(value) { return typeof value === "string" ? value : value?.color; }
function pdfColor(value) { const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/iu.exec(value); return match ? rgb(parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255) : rgb(0, 0, 0); }
function toPoints(value, unit) { if (unit === "in") return value * 72; if (unit === "mm") return value / 25.4 * 72; return value * 0.75; }

function addSrgbOutputIntent(pdf, profileBytes, profile) {
  const stream = pdf.context.flateStream(profileBytes, { N: PDFNumber.of(3), Alternate: PDFName.of("DeviceRGB") });
  const streamRef = pdf.context.register(stream);
  const intent = pdf.context.obj({ Type: "OutputIntent", S: profile === "PDF/X-4" ? "GTS_PDFX" : "GTS_PDFA1", OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"), RegistryName: PDFString.of("https://www.color.org"), Info: PDFString.of("ICC sRGB2014"), DestOutputProfile: streamRef });
  pdf.catalog.set(PDFName.of("OutputIntents"), pdf.context.obj([intent]));
}

function addPdfa3Metadata(pdf, title) {
  const now = new Date().toISOString();
  const id = PDFHexString.fromText(`canvas:${title}:${now}`);
  pdf.context.trailerInfo.ID = pdf.context.obj([id, id]);
  const xml = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" pdfaid:part="3" pdfaid:conformance="B" xmp:CreateDate="${now}" xmp:ModifyDate="${now}"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>`;
  const stream = pdf.context.stream(new TextEncoder().encode(xml), { Type: PDFName.of("Metadata"), Subtype: PDFName.of("XML") });
  pdf.catalog.set(PDFName.of("Metadata"), pdf.context.register(stream));
}
function addPdfuaMetadata(pdf, title, language) {
  const now = new Date().toISOString();
  const id = PDFHexString.fromText(`canvas:${title}:${now}`);
  pdf.context.trailerInfo.ID = pdf.context.obj([id, id]);
  pdf.catalog.set(PDFName.of("Lang"), PDFString.of(language));
  pdf.catalog.set(PDFName.of("MarkInfo"), pdf.context.obj({ Marked: true }));
  pdf.catalog.set(PDFName.of("ViewerPreferences"), pdf.context.obj({ DisplayDocTitle: true }));
  const xml = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" pdfuaid:part="1" xmp:CreateDate="${now}" xmp:ModifyDate="${now}"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>`;
  const stream = pdf.context.stream(new TextEncoder().encode(xml), { Type: PDFName.of("Metadata"), Subtype: PDFName.of("XML") });
  pdf.catalog.set(PDFName.of("Metadata"), pdf.context.register(stream));
}

function createTagging(pdf) {
  const root = pdf.context.obj({ Type: "StructTreeRoot", K: [] });
  const rootRef = pdf.context.register(root);
  const children = [];
  const parentTree = [];
  pdf.catalog.set(PDFName.of("StructTreeRoot"), rootRef);
  return {
    begin(page, node) {
      if (node.semantics.decorative) { page.pushOperators(PDFOperator.of("BMC", [PDFName.of("Artifact")])); return { artifact: true }; }
      if (node.type !== "text" && !node.semantics.description) throw profileError(`PDF/UA-1 node ${node.id} requires description or decorative: true.`);
      let pageEntry = parentTree.find((entry) => entry.page === page);
      if (!pageEntry) {
        pageEntry = { page, index: parentTree.length, refs: [] };
        parentTree.push(pageEntry);
        page.node.set(PDFName.of("StructParents"), PDFNumber.of(pageEntry.index));
      }
      const mcid = pageEntry.refs.length;
      const heading = node.semantics.paragraphs?.find((paragraph) => paragraph.headingLevel)?.headingLevel;
      const type = node.type === "text" ? (heading ? `H${heading}` : "P") : "Figure";
      const element = pdf.context.obj({ Type: "StructElem", S: type, P: rootRef, Pg: page.ref, K: mcid, ...(node.semantics.description ? { Alt: PDFString.of(node.semantics.description) } : {}), ...(node.semantics.language ? { Lang: PDFString.of(node.semantics.language) } : {}) });
      const reference = pdf.context.register(element);
      pageEntry.refs.push(reference); children.push(reference);
      page.pushOperators(PDFOperator.of("BDC", [PDFName.of(type), pdf.context.obj({ MCID: mcid })]));
      return { artifact: false };
    },
    end(page, tag) { if (tag) page.pushOperators(PDFOperator.of("EMC")); },
    finish() {
      const nums = [];
      for (const entry of parentTree) nums.push(entry.index, pdf.context.obj(entry.refs));
      const parentTreeRef = pdf.context.register(pdf.context.obj({ Nums: nums }));
      root.set(PDFName.of("K"), pdf.context.obj(children));
      root.set(PDFName.of("ParentTree"), parentTreeRef);
      root.set(PDFName.of("ParentTreeNextKey"), PDFNumber.of(parentTree.length));
    },
  };
}

function readingOrder(output) {
  const nodes = [...output.nodes];
  const order = output.root?.semantics?.readingOrder;
  if (!Array.isArray(order)) return nodes.sort((a, b) => a.z - b.z);
  const rank = new Map(order.map((id, index) => [id, index]));
  return nodes.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.z - b.z);
}
function profileError(message) { const error = new Error(message); error.code = "CANVAS_PDF_PROFILE_INVALID"; return error; }
function xmlEscape(value) { return String(value).replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]); }
