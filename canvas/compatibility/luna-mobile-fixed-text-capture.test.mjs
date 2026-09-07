import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ANDROID_STATES, CANDIDATE_PATHS, IOS_DEVICES, TEXT_CASES,
  buildFixedTextDocument, buildFixedTextIR, prepareFixedTextEvidence,
} from "../scripts/luna-mobile-fixed-text-capture.mjs";

test("fixed-text plan is the exact bounded matrix and keeps typography classes separate", () => {
  assert.equal(TEXT_CASES.length, 11);
  assert.ok(TEXT_CASES.some(({ id }) => id === "uniform-single-run"));
  assert.ok(TEXT_CASES.some(({ id }) => id === "rich-run-size"));
  assert.ok(TEXT_CASES.some(({ id }) => id === "text-growth-fixed-width-height"));
  assert.equal(IOS_DEVICES.reduce((sum, device) => sum + device.contentSizes.length, 0) * TEXT_CASES.length, 33);
  assert.equal(ANDROID_STATES.length * TEXT_CASES.length, 44);
  assert.ok(CANDIDATE_PATHS.includes("properties.marks"));
  assert.ok(CANDIDATE_PATHS.includes("properties.text.run.fontSize"));
});

test("both native IRs contain the same authored roots and exact text semantics", () => {
  for (const role of ["ios", "android"]) {
    const document = buildFixedTextDocument(role);
    const ir = buildFixedTextIR(role, document);
    assert.deepEqual(ir.outputs.map(({ id }) => id), TEXT_CASES.map(({ id }) => `fixed-text-${id}`));
    for (const [index, output] of ir.outputs.entries()) {
      assert.equal(output.root.geometry.w, 340);
      assert.equal(output.root.geometry.h, 180);
      const text = output.nodes.find(({ type }) => type === "text");
      assert.ok(text, `${role}/${TEXT_CASES[index].id} text node is present`);
      assert.equal(text.semantics.content, TEXT_CASES[index].content);
      assert.equal(text.geometry.w, TEXT_CASES[index].width);
      assert.equal(text.geometry.h, TEXT_CASES[index].height);
      assert.ok(Array.isArray(text.semantics.runs));
    }
  }
});

test("source preparation is deterministic, native-free, and retains all references", async () => {
  const first = await mkdtemp(join(tmpdir(), "canvas-fixed-text-prep-"));
  const second = await mkdtemp(join(tmpdir(), "canvas-fixed-text-prep-"));
  try {
    const a = await prepareFixedTextEvidence(first);
    const b = await prepareFixedTextEvidence(second);
    assert.equal(a.sourceReceipt.sourceSha256, b.sourceReceipt.sourceSha256);
    assert.equal(a.plan.sourceOnly, true);
    assert.equal(a.plan.nativeRun, false);
    assert.equal(a.plan.comparator.boundaryExclusionPhysicalPixels, 2);
    assert.equal(a.plan.comparator.channelTolerance, 2);
    assert.equal(a.plan.ios.entries, 33);
    assert.equal(a.plan.android.entries, 44);
    assert.match(a.plan.ios.build, /xcodebuild .* -jobs 2/u);
    assert.match(a.plan.android.build, /gradlew --no-daemon --max-workers 2/u);
    assert.match(a.plan.ios.launch, /--canvas-case <CASE_ID> --canvas-nonce <NONCE>/u);
    const iosReferences = await readdir(join(first, "references", "ios"), { withFileTypes: true });
    const androidReferences = await readdir(join(first, "references", "android"), { withFileTypes: true });
    assert.equal(iosReferences.length, 3);
    assert.equal(androidReferences.length, 4);
    const iosFiles = await readFile(join(first, "swift", "Sources", "CanvasFixedText", "FixedTextUniformSingleRunText.swift"), "utf8");
    assert.match(
      iosFiles,
      /Text\(\{ var value = AttributedString\("Canvas fixed text"\); value\.languageIdentifier = "en"; return value \}\(\)\)/u,
    );
    const rich = await readFile(join(first, "compose", "generated", "FixedTextMixedSizeRichRuns.kt"), "utf8").catch(() => "");
    assert.match(rich, /append\("Small "\)/u);
    assert.match(rich, /append\("BIG"\)/u);
    const hashes = JSON.parse(await readFile(join(first, "source-hashes.json"), "utf8"));
    assert.match(hashes.sourceSha256, /^[0-9a-f]{64}$/u);
    assert.ok(hashes.files.every(({ path, bytes, sha256: digest }) => path && bytes > 0 && /^[0-9a-f]{64}$/u.test(digest)));
    const plan = JSON.parse(await readFile(join(first, "capture-plan.json"), "utf8"));
    assert.deepEqual(plan.ios.states, ["iphone-large-large", "iphone-large-accessibility-extra-extra-large", "ipad-large-large"]);
    assert.deepEqual(plan.android.states, ["density-420-font-1", "density-420-font-2", "density-320-font-1", "density-320-font-2"]);
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});
