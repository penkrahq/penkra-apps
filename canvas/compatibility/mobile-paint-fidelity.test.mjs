import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
async function measure(file, scale, signal) {
  return execute(process.execPath, ["scripts/verify-mobile-vectors.mjs", "--paints", `research/mobile-qa/${file}`, String(scale)], {
    cwd: new URL("../", import.meta.url), timeout: 25_000, signal,
  });
}
for (const [file, scale] of [
  ["ios-paint-matrix-3x.png", 3], ["ipad-paint-matrix-2x.png", 2],
  ["android-paint-matrix-420dpi.png", 2.625], ["android-paint-matrix-320dpi.png", 2],
]) {
  test(`native solid-color alpha matches Canvas: ${file}`, { timeout: 30_000 }, async (context) => {
    const { stdout } = await measure(file, scale, context.signal);
    assert.equal(JSON.parse(stdout).verified, true);
    context.diagnostic(stdout.trim());
  });
}
test("paint verification rejects the former Canvas capture that dropped paint opacity", { timeout: 30_000 }, async (context) => {
  await assert.rejects(measure("canvas-paint-matrix-3x.png", 3, context.signal), error => error.code === 1 && /AssertionError/u.test(error.stderr));
});
