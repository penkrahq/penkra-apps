import { createLibraryRegistry, createLibraryRelease } from "../src/library-publication.mjs";
import { loadCanvasImports } from "../src/canvas-imports.mjs";
import { resolveCanvasDocument } from "../src/canvas-resolver.mjs";

export const LIGHT_V1 = "#123456";
export const DARK_V1 = "#abcdef";
export const LIGHT_V2 = "#654321";
export const DARK_V2 = "#fedcba";
export const LOCAL_ACCENT = "#ff00ff";
export const LOCAL_BODY = "#00ff00";

export function libraryDocument(light, dark) {
  return {
    version: "2.17", module: "generic",
    axes: { appearance: { modes: [{ name: "light" }, { name: "dark" }] } },
    variables: {
      privateAccent: { tokenType: "color", cascade: [{ value: light }, { value: dark, when: { appearance: "dark" } }] },
      accent: { tokenType: "color", cascade: [{ value: "${privateAccent}" }] },
      privateUnused: { tokenType: "color", cascade: [{ value: "#0bad00" }] },
    },
    paragraphStyles: {
      body: { fill: "${accent}", fontFamily: "Inter", fontSize: 18 },
      privateStyle: { fill: "#0bad01", fontSize: 99 },
    },
    imports: {}, flows: [],
    children: [
      { id: "card", type: "frame", name: "Published Card", layout: "none", width: 140, height: 70, children: [
        { id: "card-rectangle", type: "rectangle", x: 0, y: 0, width: 140, height: 70, fill: "${accent}" },
        { id: "card-label", type: "text", x: 8, y: 8, width: 120, height: 32, content: "Library card", style: "body", paragraphs: [{ from: 0, to: 12, style: "body" }], marks: [] },
      ] },
      { id: "private-node", type: "rectangle", width: 30, height: 30, fill: "#0bad02" },
      { id: "private-image", type: "rectangle", width: 30, height: 30, fill: { type: "image", url: "private/image.png" } },
    ],
    library: { public: [
      { kind: "variable", id: "accent" },
      { kind: "paragraphStyle", id: "body" },
      { kind: "component", id: "card" },
    ] },
  };
}

function sharedChildren(prefix) {
  return [
    { id: `${prefix}-qualified-variable`, type: "rectangle", x: 12, y: 12, width: 70, height: 40, fill: "${ui:accent}" },
    { id: `${prefix}-qualified-style`, type: "text", x: 92, y: 12, width: 130, height: 30, content: "Qualified style", style: "ui:body", paragraphs: [{ from: 0, to: 15, style: "ui:body" }], marks: [] },
    { id: `${prefix}-card`, type: "ref", ref: "ui:card", x: 12, y: 65 },
    { id: `${prefix}-dark-slot`, type: "frame", x: 170, y: 65, width: 140, height: 70, layout: "none", modes: { appearance: "dark" }, children: [
      { id: `${prefix}-dark-card`, type: "ref", ref: "ui:card" },
    ] },
    { id: `${prefix}-local-text`, type: "text", x: 12, y: 150, width: 140, height: 30, content: "Local style", style: "body", paragraphs: [{ from: 0, to: 11, style: "body" }], marks: [] },
  ];
}

export function consumerDocument(importRecord) {
  const childrenFor = sharedChildren;
  return {
    version: "2.17", module: "generic",
    axes: { appearance: { modes: [{ name: "light" }, { name: "dark" }] } },
    variables: { accent: { tokenType: "color", cascade: [{ value: LOCAL_ACCENT }] } },
    paragraphStyles: { body: { fill: LOCAL_BODY, fontFamily: "Inter", fontSize: 22 } },
    imports: { ui: importRecord }, flows: [],
    children: [
      { id: "slide", type: "frame", role: "slide", name: "Library Slide", layout: "none", width: 420, height: 240, physical: { w: 420 / 96, h: 240 / 96, unit: "in" }, fill: "#ffffff", children: childrenFor("slide") },
      { id: "route", type: "frame", role: "route", name: "Library Route", layout: "none", width: 420, height: 240, fill: "#ffffff", children: childrenFor("route") },
      { id: "art", type: "frame", name: "Library Artwork", layout: "none", width: 420, height: 240, fill: "#ffffff", children: childrenFor("art") },
      { id: "ios", type: "frame", role: "ios", name: "Library iOS", layout: "none", width: 420, height: 240, children: childrenFor("ios") },
      { id: "android", type: "frame", role: "android", name: "Library Android", layout: "none", width: 420, height: 240, children: childrenFor("android") },
    ],
  };
}

export function publicationFixture() {
  const sourceV1 = libraryDocument(LIGHT_V1, DARK_V1);
  const sourceV2 = libraryDocument(LIGHT_V2, DARK_V2);
  const releaseV1 = createLibraryRelease(sourceV1, { libraryId: "theme-library", releaseId: "v1" });
  const releaseV2 = createLibraryRelease(sourceV2, { libraryId: "theme-library", releaseId: "v2" });
  const registry = createLibraryRegistry();
  const v1Record = { documentId: releaseV1.libraryId, updatePolicy: "follow", releaseId: releaseV1.releaseId, contentHash: releaseV1.contentHash };
  const v2Record = { documentId: releaseV2.libraryId, updatePolicy: "follow", releaseId: releaseV2.releaseId, contentHash: releaseV2.contentHash };
  return { sourceV1, sourceV2, releaseV1, releaseV2, registry, v1Record, v2Record };
}

export async function loadResolved(document, options) {
  const loaded = await loadCanvasImports({}, document, { resolveRelease: options.registry.resolve });
  const resolved = resolveCanvasDocument(document, { imports: loaded.imports, modes: options.modes ?? { appearance: "light" } });
  return { loaded, resolved };
}

export function walk(node, result = []) {
  result.push(node);
  for (const child of node.children ?? []) walk(child, result);
  return result;
}

export function allNodes(document) { return (document.children ?? []).flatMap((node) => walk(node)); }

