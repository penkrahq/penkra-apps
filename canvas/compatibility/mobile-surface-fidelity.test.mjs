import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const root = new URL("../", import.meta.url);
// These are retained captures from the actual compiled native applications.
// Re-rendering Canvas here also guards the reference-root paint regression.
for (const [file, scale] of [
  ["ios-surfaces-fixed-3x.png", 3],
  ["ipad-surfaces-fixed-2x.png", 2],
  ["android-surfaces-fixed-420dpi.png", 2.625],
  ["android-surfaces-fixed-320dpi.png", 2],
]) {
  test(`native surface capture matches current Canvas: ${file}`, { timeout: 30_000 }, async (context) => {
    const { stdout } = await execute(process.execPath, [
      "scripts/verify-mobile-vectors.mjs", "--surfaces", `research/mobile-qa/${file}`, String(scale),
    ], { cwd: root, timeout: 25_000, signal: context.signal });
    const result = JSON.parse(stdout);
    assert.equal(result.verified, true);
    assert.equal(result.cases, 6);
    context.diagnostic(stdout.trim());
  });
}

test("surface verification rejects the native capture with lost instance placement", { timeout: 30_000 }, async (context) => {
  await assert.rejects(execute(process.execPath, [
    "scripts/verify-mobile-vectors.mjs", "--surfaces", "research/mobile-qa/ios-surfaces-3x.png", "3",
  ], { cwd: root, timeout: 25_000, signal: context.signal }), (error) => (
    error.code === 1 && /AssertionError/u.test(error.stderr)
  ));
});
