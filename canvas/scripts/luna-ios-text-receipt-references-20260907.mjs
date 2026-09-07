import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { decodePngBytes } from "./luna-ios-grid-capture-utils-20260907.mjs";
import { EXACT_CASE_IDS, readExactFontSources } from "./luna-ios-text-font-catalog.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";

export const REFERENCE_DEVICES = Object.freeze([
  { key: "iphone", id: "A3D92728-7F7B-44D1-BE51-155B891905D9", contentSizes: ["large", "accessibility-extra-extra-large"], scale: 3 },
  { key: "ipad", id: "8F053C2C-958D-4CC5-AB38-E838CFAC9442", contentSizes: ["large"], scale: 2 },
]);
export const REFERENCE_COMMAND = "node scripts/luna-ios-text-receipt-references-20260907.mjs";

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
export function referenceIdentity(caseId, deviceKey, contentSize) { return `${caseId}|${deviceKey}|${contentSize}`; }

function imageFacts(bytes, canvasKit) {
  const image = decodePngBytes(bytes, canvasKit);
  let alphaPixels = 0; let nonWhitePixels = 0;
  for (let offset = 0; offset < image.pixels.length; offset += 4) {
    const alpha = image.pixels[offset + 3];
    if (alpha > 0) alphaPixels += 1;
    if (alpha > 0 && (image.pixels[offset] !== 255 || image.pixels[offset + 1] !== 255 || image.pixels[offset + 2] !== 255)) nonWhitePixels += 1;
  }
  assert.ok(alphaPixels > 0, "reference must contain positive alpha pixels");
  assert.ok(nonWhitePixels > 0, "reference must contain non-background content pixels");
  return { width: image.width, height: image.height, alphaPixels, nonWhitePixels, pixelSha256: sha256(Buffer.from(image.pixels)) };
}

async function loadPreparedEvidence(sourceRoot) {
  const fixtureBytes = await readFile(join(sourceRoot, "fixture.json"));
  const irBytes = await readFile(join(sourceRoot, "ir.json"));
  const fixture = JSON.parse(fixtureBytes); const ir = JSON.parse(irBytes);
  assert.deepEqual(ir.outputs.map(({ id }) => id), EXACT_CASE_IDS, "prepared IR case order changed");
  assert.deepEqual(fixture.children.map(({ id }) => id).filter((id) => EXACT_CASE_IDS.includes(id)), EXACT_CASE_IDS, "prepared fixture case inventory changed");
  const fontManifest = JSON.parse(await readFile(join(sourceRoot, "font-sources.json"), "utf8"));
  const exactFonts = await readExactFontSources(); const fontHashes = {};
  for (const [key, bytes] of Object.entries(exactFonts)) {
    const declared = fontManifest.fonts.find((font) => font.key === `${key}:normal`);
    assert.ok(declared, `prepared font manifest is missing ${key}:normal`);
    assert.equal(sha256(bytes), declared.sha256, `retained exact font bytes changed for ${key}`);
    fontHashes[key] = { sha256: declared.sha256, bytes: bytes.byteLength, filename: declared.filename };
  }
  return { fixture, fixtureSha256: sha256(fixtureBytes), sourceIRSha256: sha256(irBytes), fontHashes };
}

export async function prepareTextReceiptReferences({ sourceRoot, destination }) {
  const source = resolve(sourceRoot); const references = resolve(destination);
  const { fixture, fixtureSha256, sourceIRSha256, fontHashes } = await loadPreparedEvidence(source);
  const canvasKit = await getCanvasKit(); const entries = [];
  for (const device of REFERENCE_DEVICES) for (const contentSize of device.contentSizes) {
    const stateDir = join(references, `${device.key}-${contentSize}`); await mkdir(stateDir, { recursive: true });
    for (const caseId of EXACT_CASE_IDS) {
      const [screenshot] = await takeDocumentScreenshots(fixture, [{ nodeIds: [caseId] }], new Map(), { scale: device.scale, maxDimension: 4096, failOnDownscale: true });
      const bytes = Buffer.from(screenshot.data, "base64"); const facts = imageFacts(bytes, canvasKit);
      assert.deepEqual([facts.width, facts.height], [340 * device.scale, 180 * device.scale], `${caseId} ${device.key}-${contentSize} dimensions`);
      const path = join(stateDir, `${caseId}.png`); await writeFile(path, bytes, { flag: "wx" });
      entries.push({ identity: referenceIdentity(caseId, device.key, contentSize), caseId, deviceKey: device.key, deviceId: device.id, contentSize, scale: device.scale, path: relative(references, path).replaceAll("\\", "/"), sha256: sha256(bytes), bytes: bytes.byteLength, ...facts, fixtureSha256, sourceIRSha256, fontHashes, command: REFERENCE_COMMAND });
    }
  }
  assert.equal(entries.length, 30, "reference matrix must contain 30 entries");
  assert.equal(new Set(entries.map(({ identity }) => identity)).size, 30, "reference identities must be unique");
  const manifest = { package: "luna-ios-text-receipt-references-20260907", sourceFixture: "../fixture.json", sourceIR: "../ir.json", historicalNativeCapturesUsed: false, renderer: "src/document-screenshot.mjs takeDocumentScreenshots", prohibitedTransforms: ["sips", "color registration", "rescale", "tolerance adjustment"], entries, counts: { entries: entries.length, devices: REFERENCE_DEVICES.length, states: 3, cases: EXACT_CASE_IDS.length } };
  await writeFile(join(references, "manifest.json"), json(manifest), { flag: "wx" });
  return { references, manifest };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const sourceRoot = resolve(process.env.CANVAS_TEXT_RECEIPT_SOURCE_ROOT ?? new URL("../research/luna-ios-text-receipt-20260907", import.meta.url).pathname);
  const destination = resolve(process.env.CANVAS_TEXT_RECEIPT_REFERENCES_ROOT ?? join(sourceRoot, "references"));
  const result = await prepareTextReceiptReferences({ sourceRoot, destination });
  console.log(JSON.stringify({ references: result.references, entries: result.manifest.entries.length, renderer: result.manifest.renderer }, null, 2));
}
