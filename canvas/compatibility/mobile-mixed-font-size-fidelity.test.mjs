import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
function measure(file, scale, signal) {
  return execute(process.execPath, ["scripts/verify-mobile-vectors.mjs", "--mixed-sizes", `research/mobile-qa/${file}`, String(scale)], {
    cwd: new URL("../", import.meta.url), timeout: 25_000, signal,
  });
}
for (const emission of ["rounded", "relative"]) {
  test(`mixed Compose font sizes match the 420-dpi capture: ${emission}`, { timeout: 30_000 }, async (context) => {
    const { stdout } = await measure(`android-mixed-font-sizes-${emission}-420dpi.png`, 2.625, context.signal);
    assert.equal(JSON.parse(stdout).verified, true);
    context.diagnostic(stdout.trim());
  });
  test(`mixed Compose size verification still rejects the 320-dpi discrepancy: ${emission}`, { timeout: 30_000 }, async (context) => {
    await assert.rejects(measure(`android-mixed-font-sizes-${emission}-320dpi.png`, 2, context.signal), error => error.code === 1 && /AssertionError/u.test(error.stderr));
  });
}
