import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { CASES, content } from "../scripts/luna-ios-text-fixture.mjs";

const evidence = new URL("../research/luna-ios-text-20260906/", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("fixture.json", evidence), "utf8"));
const measurements = JSON.parse(await readFile(new URL("measurements.json", evidence), "utf8"));
const allEntries = measurements.entries;

test("iOS rich-text fixture has twelve independent source-ID frames and canonical UTF-16 marks", () => {
  assert.equal(fixture.children.length, 12);
  assert.equal(content.length, 23);
  for (const [index, definition] of CASES.entries()) {
    const frame = fixture.children[index];
    const text = frame.children[0];
    assert.equal(frame.id, definition.id);
    assert.deepEqual({ width: frame.width, height: frame.height, fill: frame.fill, role: frame.role }, { width: 340, height: 180, fill: "#FFFFFF", role: "ios" });
    assert.deepEqual({ x: text.x, y: text.y, width: text.width, height: text.height, fontFamily: text.fontFamily, fontSize: text.fontSize, fill: text.fill, content: text.content }, { x: 20, y: 20, width: 300, height: 140, fontFamily: "Inter", fontSize: 24, fill: "#123456", content });
    assert.deepEqual(text.marks, definition.marks);
    assert.deepEqual(text.paragraphs, [{ from: 0, to: content.length }]);
  }
});

test("all 36 native entries are measured and retain pass/mismatch distinctions", async () => {
  assert.equal(allEntries.length, 36);
  assert.equal(new Set(allEntries.map((entry) => `${entry.caseId}:${entry.deviceId}:${entry.contentSize}`)).size, 36);
  assert.ok(allEntries.every((entry) => ["pass", "mismatch", "unmeasured"].includes(entry.status)));
  assert.ok(allEntries.every((entry) => entry.status !== "unmeasured"));
  for (const entry of allEntries) {
    await access(entry.referencePath);
    await access(entry.capturePath);
    assert.equal(entry.registration.method, "center-cropped-authored-frame");
    assert.equal(entry.registration.dx, 0);
    assert.equal(entry.registration.dy, 0);
    assert.equal(entry.registration.boundaryTolerancePixels, 2);
    assert.ok(entry.comparedPixels > 0);
    assert.ok(Number.isInteger(entry.mismatchedPixels));
  }
});

function pixelsFor(path) {
  return getCanvasKit().then(async (ck) => {
    const image = ck.MakeImageFromEncoded(await readFile(path));
    assert.ok(image);
    try {
      const width = image.width(); const height = image.height();
      return { ck, width, height, pixels: image.readPixels(0, 0, { width, height, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) };
    } finally { image.delete(); }
  });
}

function countNear(image, color, rect) {
  let count = 0;
  for (let y = Math.max(0, rect.y); y < Math.min(image.height, rect.y + rect.height); y += 1) for (let x = Math.max(0, rect.x); x < Math.min(image.width, rect.x + rect.width); x += 1) {
    const offset = (y * image.width + x) * 4;
    if (color.every((channel, index) => Math.abs(image.pixels[offset + index] - channel) <= 5)) count += 1;
  }
  return count;
}

function countInk(image, rect) {
  let count = 0;
  for (let y = Math.max(0, rect.y); y < Math.min(image.height, rect.y + rect.height); y += 1) for (let x = Math.max(0, rect.x); x < Math.min(image.width, rect.x + rect.width); x += 1) {
    const offset = (y * image.width + x) * 4;
    if (image.pixels[offset] < 245 || image.pixels[offset + 1] < 245 || image.pixels[offset + 2] < 245) count += 1;
  }
  return count;
}

for (const entry of allEntries) {
  if (!["case-02", "case-03", "case-04", "case-07", "case-08"].includes(entry.caseId)) continue;
  test(`${entry.caseId} ${entry.contentSize} retains authored decoration pixels`, async () => {
    const reference = await pixelsFor(entry.referencePath);
    const capture = await pixelsFor(entry.capturePath);
    const nativeBaseline = await pixelsFor(entry.capturePath.replace(/case-\d+\.png$/u, "case-01.png"));
    const scale = entry.scale;
    const rows = [];
    for (let y = 20 * scale; y < 160 * scale; y += 1) {
      const decorated = countInk(capture, { x: 20 * scale, y, width: 300 * scale, height: 1 });
      const regular = countInk(nativeBaseline, { x: 20 * scale, y, width: 300 * scale, height: 1 });
      if (decorated - regular > 20) rows.push({ y, count: decorated - regular });
    }
    assert.ok(rows.length > 0, "Native capture has decoration-bearing rows beyond the regular native baseline");
    const nativePixels = rows.reduce((total, row) => total + countInk(capture, { x: 20 * scale, y: row.y - 2, width: 300 * scale, height: 5 }), 0);
    assert.ok(nativePixels > rows.length * 10, `native decoration pixels ${nativePixels} did not retain the authored decoration rows`);
  });
}

for (const entry of allEntries.filter(({ caseId }) => caseId === "case-10")) {
  test(`case-10 ${entry.contentSize} retains authored orange and blue color regions`, async () => {
    const capture = await pixelsFor(entry.capturePath);
    const scale = entry.scale;
    const firstSix = { x: 20 * scale, y: 20 * scale, width: 105 * scale, height: 140 * scale };
    const remaining = { x: 100 * scale, y: 20 * scale, width: 220 * scale, height: 140 * scale };
    assert.ok(countNear(capture, [204, 85, 0], firstSix) > 100, "orange first-six fill is present in the authored region");
    const remainingBlue = countNear(capture, [18, 52, 86], remaining);
    if (entry.contentSize === "accessibility-extra-extra-large") assert.equal(remainingBlue, 0, "XXL retains the expected clipped remainder");
    else assert.ok(remainingBlue > 10, `remaining blue fill is present in the authored region (${remainingBlue} pixels)`);
  });
}

for (const entry of allEntries.filter(({ caseId }) => caseId === "case-11")) {
  test(`case-11 ${entry.contentSize} retains full authored letter spacing`, async () => {
    const baseline = allEntries.find((candidate) => candidate.deviceId === entry.deviceId && candidate.contentSize === entry.contentSize && candidate.caseId === "case-01");
    const a = await pixelsFor(baseline.capturePath); const b = await pixelsFor(entry.capturePath);
    const bbox = (image) => {
      let min = image.width; let max = -1;
      for (let y = 20 * entry.scale; y < 160 * entry.scale; y += 1) for (let x = 20 * entry.scale; x < 320 * entry.scale; x += 1) {
        const offset = (y * image.width + x) * 4;
        if (image.pixels[offset] < 100 && image.pixels[offset + 1] < 130 && image.pixels[offset + 2] < 160) { min = Math.min(min, x); max = Math.max(max, x); }
      }
      return max - min;
    };
    assert.ok(bbox(b) > bbox(a), `full letter spacing width ${bbox(b)} should exceed regular width ${bbox(a)}`);
  });
}

test("generated Swift carries each requested rich-text lowering", async () => {
  const source = await readFile(new URL("swift/LunaIOSUnderlineAndStrikethrough.swift", evidence), "utf8");
  assert.match(source, /\.underline\(\)/u);
  assert.match(source, /\.strikethrough\(\)/u);
  assert.match(await readFile(new URL("swift/LunaIOSFullItalic.swift", evidence), "utf8"), /\.italic\(\)/u);
  assert.match(await readFile(new URL("swift/LunaIOSFullBold700.swift", evidence), "utf8"), /\.weight\(\.bold\)/u);
  assert.match(await readFile(new URL("swift/LunaIOSFullLetterSpacing.swift", evidence), "utf8"), /\.tracking\(1\)/u);
  assert.match(await readFile(new URL("swift/LunaIOSFirstSixOrangeFill.swift", evidence), "utf8"), /red: 0\.8, green: 0\.333, blue: 0, opacity: 1/u);
});
