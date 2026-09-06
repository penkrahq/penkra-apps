import { readFile } from "node:fs/promises";
import { preflightPdfx4 } from "../src/exporters/pdfx-preflight.mjs";

const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  console.error("Usage: node scripts/preflight-pdfx.mjs <file.pdf>");
  process.exitCode = 2;
} else {
  const report = await preflightPdfx4(await readFile(path));
  console.log(JSON.stringify(report, null, 2));
  // Incomplete coverage must not look like a successful conformance gate.
  process.exitCode = report.conformant ? 0 : report.status === "invalid" ? 1 : 2;
}
