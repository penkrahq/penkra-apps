import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { decodePngBytes } from "../scripts/luna-ios-grid-capture-utils-20260907.mjs";
import { EXACT_CASE_IDS } from "../scripts/luna-ios-text-font-catalog.mjs";
import { REFERENCE_DEVICES, prepareTextReceiptReferences, referenceIdentity } from "../scripts/luna-ios-text-receipt-references-20260907.mjs";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";

const sourceRoot = resolve(new URL("../research/luna-ios-text-receipt-20260907", import.meta.url).pathname);
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

test("fresh Canvas references contain exact 30 identities at authored dimensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "canvas-text-references-"));
  try {
    const result = await prepareTextReceiptReferences({ sourceRoot, destination: join(root, "references") });
    const manifest = result.manifest;
    assert.equal(manifest.entries.length, 30);
    assert.equal(new Set(manifest.entries.map(({ identity }) => identity)).size, 30);
    assert.equal(manifest.historicalNativeCapturesUsed, false);
    assert.match(manifest.renderer, /takeDocumentScreenshots/u);
    assert.deepEqual(manifest.prohibitedTransforms, ["sips", "color registration", "rescale", "tolerance adjustment"]);
    const canvasKit = await getCanvasKit();
    for (const entry of manifest.entries) {
      const bytes = await readFile(join(result.references, entry.path));
      assert.equal(sha256(bytes), entry.sha256);
      const image = decodePngBytes(bytes, canvasKit);
      assert.deepEqual([image.width, image.height], [340 * entry.scale, 180 * entry.scale]);
      assert.ok(entry.alphaPixels > 0 && entry.nonWhitePixels > 0);
      assert.equal(entry.path.includes("native"), false);
      assert.equal(entry.command, "node scripts/luna-ios-text-receipt-references-20260907.mjs");
    }
    const iphoneCases = manifest.entries.filter(({ deviceKey }) => deviceKey === "iphone");
    for (const caseId of EXACT_CASE_IDS) {
      const large = iphoneCases.find((entry) => entry.identity === referenceIdentity(caseId, "iphone", "large"));
      const xxl = iphoneCases.find((entry) => entry.identity === referenceIdentity(caseId, "iphone", "accessibility-extra-extra-large"));
      assert.equal(large.sha256, xxl.sha256, `${caseId} Canvas Large/XXL references must be identical`);
    }
    assert.equal(manifest.counts.devices, REFERENCE_DEVICES.length);
    assert.equal(manifest.counts.states, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});
