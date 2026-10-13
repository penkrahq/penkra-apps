import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir(new URL("../vendor/", import.meta.url), { recursive: true });
await Promise.all(
  [
    ["editor-runtime.mjs", "editor-runtime.mjs"],
    ["csv-runtime.mjs", "csv-runtime.mjs"],
    ["pdf-runtime.mjs", "pdf-runtime.mjs"],
  ].map(([source, output]) =>
    build({
      entryPoints: [new URL(`../vendor-src/${source}`, import.meta.url).pathname],
      outfile: new URL(`../vendor/${output}`, import.meta.url).pathname,
      bundle: true,
      format: "esm",
      platform: "browser",
      target: ["chrome120"],
      minify: true,
      legalComments: "eof",
    }),
  ),
);

await copyFile(
  new URL("../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url),
  new URL("../vendor/pdf.worker.min.mjs", import.meta.url),
);

// Retained third-party license comments can contain whitespace-only lines.
for (const name of [
  "editor-runtime.mjs",
  "csv-runtime.mjs",
  "pdf-runtime.mjs",
  "pdf.worker.min.mjs",
]) {
  const path = new URL(`../vendor/${name}`, import.meta.url);
  const source = await readFile(path, "utf8");
  await writeFile(path, source.replace(/[ \t]+$/gm, ""));
}
