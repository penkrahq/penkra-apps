import { run } from "node:test";
import { spec } from "node:test/reporters";
import { finished } from "node:stream/promises";

// Own the exit status: a cancelled test is an incomplete gate, never a pass.
const files = process.argv.slice(2);
if (!files.length) throw new Error("At least one test file is required");
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
