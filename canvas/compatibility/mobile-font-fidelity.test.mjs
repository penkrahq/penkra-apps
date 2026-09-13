import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
async function measure(file, scale, signal) {
  return execute(process.execPath, ["scripts/verify-mobile-vectors.mjs", "--fonts", `research/mobile-qa/${file}`, String(scale)], {
    cwd: new URL("../", import.meta.url), timeout: 25_000, signal,
  });
}

for (const [file, scale] of [
  ["ios-font-matrix-large-3x.png", 3],
  ["ipad-font-matrix-large-2x.png", 2],
  ["android-font-matrix-linear-420dpi.png", 2.625],
  ["android-font-matrix-linear-320dpi.png", 2],
]) {
  test(`retained native bundled-font matrix matches Canvas: ${file}`, { timeout: 30_000 }, async (context) => {
    const { stdout } = await measure(file, scale, context.signal);
    const result = JSON.parse(stdout);
    assert.equal(result.verified, true);
    assert.equal(result.glyphInteriors.length, 5);
    assert.ok(result.glyphInteriors.every(count => count > 0));
    context.diagnostic(stdout.trim());
  });
}

for (const file of ["android-font-matrix-420dpi.png", "android-font-matrix-base-size-420dpi.png"]) {
  test(`font verification rejects the former rounded/hinted capture: ${file}`, { timeout: 30_000 }, async (context) => {
    await assert.rejects(measure(file, 2.625, context.signal), error => error.code === 1 && /AssertionError/u.test(error.stderr));
  });
}
