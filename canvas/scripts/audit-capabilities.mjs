import { writeFile } from "node:fs/promises";
import { unverifiedCapabilityEntries } from "../src/capability-tables.mjs";

const output = process.argv[2];
if (!output) throw new Error("Usage: bun scripts/audit-capabilities.mjs <output.md>");
const entries = unverifiedCapabilityEntries();
const counts = Object.groupBy(entries, ({ target }) => target);
const lines = [
  "# Unverified Canvas export capabilities",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Total: ${entries.length}`,
  "",
  ...Object.entries(counts).map(([target, values]) => `- ${target}: ${values.length}`),
  "",
  ...entries.map(({ target, path }, index) => `${index + 1}. \`${target}\` — \`${path}\``),
  "",
];
await writeFile(output, lines.join("\n"));
console.log(`${entries.length} unverified capability entries written to ${output}`);
