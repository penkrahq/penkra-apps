import { run } from "node:test";
import { spec } from "node:test/reporters";
import { finished } from "node:stream/promises";
import { stat } from "node:fs/promises";

// Own the exit status: a cancelled test is an incomplete gate, never a pass.
const files = process.argv.slice(2);
if (!files.length) throw new Error("At least one test file is required");
// node:test's programmatic files option is not a CLI argument parser. A flag
// passed as a filename can start an unintended child without a test file.
if (files.some((file) => file.startsWith("-"))) {
  throw Object.assign(new Error("The strict runner accepts test file paths only."), { code: "CANVAS_TEST_ARGUMENT_INVALID" });
}
// Validate the complete selection before any fixture starts. A mistyped path or
// unexpanded glob must not shrink the requested gate into a passing subset.
for (const file of files) {
  let info;
  try { info = await stat(file); }
  catch (cause) {
    throw Object.assign(new Error(`Cannot read requested test file: ${file}`, { cause }), { code: "CANVAS_TEST_FILE_INVALID" });
  }
  if (!info.isFile()) throw Object.assign(new Error(`Requested test path is not a file: ${file}`), { code: "CANVAS_TEST_FILE_INVALID" });
}
let failed = false;
let summary;
const tests = run({ files, concurrency: 4 });
tests.on("test:fail", () => { failed = true; });
tests.on("test:summary", (value) => {
  if (value.file === undefined) summary = value;
  if (!value.success || value.counts.cancelled || value.counts.failed) failed = true;
});
tests.on("error", () => { failed = true; });
const report = tests.compose(spec);
report.pipe(process.stdout, { end: false });
try {
  await finished(report);
} catch (error) {
  failed = true;
  console.error(error);
}
process.exitCode = failed || !summary || !summary.counts.tests ? 1 : 0;
