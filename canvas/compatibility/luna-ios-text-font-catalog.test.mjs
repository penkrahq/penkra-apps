import assert from "node:assert/strict";
import test from "node:test";
import { buildFontCatalog, buildTextIR, exportExactFontFiles, readExactFontSources, EXACT_CASE_IDS, ITALIC_CASE_IDS } from "../scripts/luna-ios-text-font-catalog.mjs";

const sources = await readExactFontSources();

function errorCode(fn) {
  try { fn(); return null; }
  catch (error) { return error.code; }
}

test("full and independent italic cases reject missing exact mobile faces", () => {
  const all = buildTextIR([...EXACT_CASE_IDS, ...ITALIC_CASE_IDS]);
  assert.equal(errorCode(() => buildFontCatalog(all, sources)), "CANVAS_MOBILE_FONT_MISSING");
  for (const caseId of ITALIC_CASE_IDS) assert.equal(errorCode(() => buildFontCatalog(buildTextIR([caseId]), sources)), "CANVAS_MOBILE_FONT_MISSING");
});

test("mislabeled regular bytes under italic key reject as a mobile font mismatch", () => {
  assert.equal(errorCode(() => buildFontCatalog(buildTextIR(["case-05"]), { "Inter:400:italic": sources["Inter:400"] })), "CANVAS_MOBILE_FONT_MISMATCH");
});

test("exact regular and bold catalog drives production Swift export and registration files", () => {
  const ir = buildTextIR();
  const catalog = buildFontCatalog(ir, sources);
  assert.deepEqual([...catalog].map(([key, face]) => [key, face.weight, face.italic]), [["Inter:400:normal", 400, false], ["Inter:700:normal", 700, false]]);
  const files = exportExactFontFiles(ir, catalog);
  assert.ok(files.has("_canvas/CanvasFonts.swift"));
  assert.equal([...files.keys()].filter((path) => path.startsWith("Fonts/")).length, 2);
  for (const [, face] of catalog) assert.deepEqual(files.get(`Fonts/${face.filename}`), face.bytes);
  const regular = files.get("LunaIOSUnmarkedRegular.swift");
  const bold = files.get("LunaIOSFullBold700.swift");
  assert.match(regular, /CanvasFonts\.register\(\)/u);
  assert.match(regular, /\.custom\("Inter-Regular"/u);
  assert.doesNotMatch(regular, /\.weight\(\.regular\)/u);
  assert.match(bold, /CanvasFonts\.register\(\)/u);
  assert.match(bold, /\.custom\("Inter-Bold"/u);
  assert.doesNotMatch(bold, /\.weight\(\.bold\)/u);
});

test("empty catalog cannot silently export text", () => {
  assert.equal(errorCode(() => buildFontCatalog(buildTextIR(["case-01"]), {})), "CANVAS_MOBILE_FONT_MISSING");
});
