import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import pptxgen from "pptxgenjs";

import {
  injectSlideTreeXml,
  embedPresentationFonts,
  readOoxmlPackage,
  readXmlPart,
} from "./ooxml-package.mjs";

const INJECTED_GROUP = String.raw`<p:grpSp>
  <p:nvGrpSpPr><p:cNvPr id="900" name="Canvas injected group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
  <p:grpSpPr><a:xfrm><a:off x="914400" y="1828800"/><a:ext cx="2743200" cy="1371600"/><a:chOff x="0" y="0"/><a:chExt cx="2743200" cy="1371600"/></a:xfrm></p:grpSpPr>
  <p:sp>
    <p:nvSpPr><p:cNvPr id="901" name="Canvas gradient shape"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr>
      <a:xfrm><a:off x="0" y="0"/><a:ext cx="2743200" cy="1371600"/></a:xfrm>
      <a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>
      <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="073B63"/></a:gs><a:gs pos="100000"><a:srgbClr val="E4572E"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="1"/></a:gradFill>
      <a:effectLst><a:outerShdw blurRad="38100" dist="25400" dir="2700000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="30000"/></a:srgbClr></a:outerShdw></a:effectLst>
    </p:spPr>
  </p:sp>
</p:grpSp>`;

test("post-generation OOXML injection preserves a PptxGenJS slide and raw DrawingML", async () => {
  const presentation = new pptxgen();
  presentation.layout = "LAYOUT_WIDE";
  const slide = presentation.addSlide();
  slide.addText("PptxGenJS-owned text", { x: 1, y: 0.5, w: 4, h: 0.5 });
  const generated = await presentation.write({ outputType: "arraybuffer" });
  const injected = injectSlideTreeXml(generated, 1, INJECTED_GROUP);

  const parts = readOoxmlPackage(injected);
  const slideXml = readXmlPart(parts, "ppt/slides/slide1.xml");
  assert.match(slideXml, /PptxGenJS-owned text/u);
  assert.match(slideXml, /<p:grpSp>/u);
  assert.match(slideXml, /<a:gradFill/u);
  assert.match(slideXml, /<a:outerShdw/u);
  assert.ok(parts.has("[Content_Types].xml"));
  assert.ok(parts.has("ppt/slides/_rels/slide1.xml.rels"));

  const libreOffice = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
  const probe = spawnSync(libreOffice, ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) return;
  const directory = await mkdtemp(join(tmpdir(), "canvas-ooxml-"));
  try {
    const input = join(directory, "injected.pptx");
    await writeFile(input, injected);
    const roundTripDirectory = join(directory, "roundtrip");
    const converted = spawnSync(
      libreOffice,
      ["--headless", "--convert-to", "pptx", "--outdir", roundTripDirectory, input],
      { encoding: "utf8" },
    );
    assert.equal(converted.status, 0, converted.stderr || converted.stdout);
    const roundTripped = await readFile(join(roundTripDirectory, "injected.pptx"));
    const reopened = readOoxmlPackage(roundTripped);
    const reopenedSlide = readXmlPart(reopened, "ppt/slides/slide1.xml");
    assert.match(reopenedSlide, /Canvas injected group/u);
    assert.match(reopenedSlide, /<a:gradFill/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PresentationML font embedding writes raw fntdata, relationships and the ordered font list", async () => {
  const presentation = new pptxgen();
  const slide = presentation.addSlide();
  slide.addText("Embedded Inter", { x: 1, y: 1, w: 4, h: 1, fontFace: "Inter" });
  const generated = await presentation.write({ outputType: "arraybuffer" });
  const inter = await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
  const embedded = embedPresentationFonts(generated, [{ typeface: "Inter", faces: { regular: inter } }]);
  const parts = readOoxmlPackage(embedded);
  assert.deepEqual(parts.get("ppt/fonts/font1.fntdata"), new Uint8Array(inter));
  assert.match(readXmlPart(parts, "[Content_Types].xml"), /Extension="fntdata" ContentType="application\/x-fontdata"/u);
  assert.match(readXmlPart(parts, "ppt/_rels/presentation.xml.rels"), /relationships\/font" Target="fonts\/font1\.fntdata"/u);
  const xml = readXmlPart(parts, "ppt/presentation.xml");
  assert.match(xml, /embedTrueTypeFonts="1" saveSubsetFonts="0"/u);
  assert.match(xml, /<p:notesSz\b[^>]*\/><p:embeddedFontLst><p:embeddedFont><p:font typeface="Inter"\/><p:regular r:id="rId\d+"\/><\/p:embeddedFont><\/p:embeddedFontLst>/u);

  const libreOffice = "/Applications/LibreOffice.app/Contents/MacOS/soffice";
  if (spawnSync(libreOffice, ["--version"], { encoding: "utf8" }).status !== 0) return;
  const directory = await mkdtemp(join(tmpdir(), "canvas-font-roundtrip-"));
  try {
    const input = join(directory, "embedded-font.pptx");
    await writeFile(input, embedded);
    const output = join(directory, "roundtrip");
    const converted = spawnSync(libreOffice, ["--headless", "--convert-to", "pptx", "--outdir", output, input], { encoding: "utf8" });
    assert.equal(converted.status, 0, converted.stderr || converted.stdout);
    const reopened = readOoxmlPackage(await readFile(join(output, "embedded-font.pptx")));
    assert.ok([...reopened.keys()].some((name) => name.endsWith(".fntdata")), "LibreOffice removed every embedded font part");
    assert.match(readXmlPart(reopened, "ppt/presentation.xml"), /<p:embeddedFontLst>/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
