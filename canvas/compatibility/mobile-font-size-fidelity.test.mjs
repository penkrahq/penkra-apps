import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
for (const [file, scale] of [["android-font-sizes-420dpi.png", 2.625], ["android-font-sizes-320dpi.png", 2]]) {
  test(`native Compose font sizes retain fractional sizing: ${file}`, { timeout: 30_000 }, async (context) => {
    const { stdout } = await execute(process.execPath, ["scripts/verify-mobile-vectors.mjs", "--sizes", `research/mobile-qa/${file}`, String(scale)], {
      cwd: new URL("../", import.meta.url), timeout: 25_000, signal: context.signal,
    });
    const result = JSON.parse(stdout);
    assert.equal(result.verified, true);
    assert.equal(result.cases, 5);
    assert.ok(result.glyphInteriors.every(count => count > 0));
    context.diagnostic(stdout.trim());
  });
}

test("size verification rejects native iOS fractional-font rounding", { timeout: 30_000 }, async (context) => {
  await assert.rejects(execute(process.execPath, ["scripts/verify-mobile-vectors.mjs", "--sizes", "research/mobile-qa/ios-font-sizes-3x.png", "3"], {
    cwd: new URL("../", import.meta.url), timeout: 25_000, signal: context.signal,
  }), error => error.code === 1 && /AssertionError/u.test(error.stderr));
});
