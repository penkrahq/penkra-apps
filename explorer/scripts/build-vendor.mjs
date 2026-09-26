import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

await mkdir(new URL("../vendor/", import.meta.url), { recursive: true });
const bundles = [
  ["editor-runtime.mjs", "editor-runtime.mjs"],
  ["csv-runtime.mjs", "csv-runtime.mjs"],
  ["pdf-runtime.mjs", "pdf-runtime.mjs"],
];
await Promise.all(
  bundles.map(([source, output]) =>
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
await build({
  entryPoints: [new URL("../node_modules/pdfjs-dist/build/pdf.worker.mjs", import.meta.url).pathname],
  outfile: new URL("../vendor/pdf.worker.mjs", import.meta.url).pathname,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  minify: true,
  legalComments: "eof",
});
await Promise.all([
  ["cmaps", "pdf-cmaps"],
  ["standard_fonts", "pdf-standard-fonts"],
  ["wasm", "pdf-wasm"],
].map(async ([source, output]) => {
  const destination = new URL(`../vendor/${output}/`, import.meta.url);
  await rm(destination, { recursive: true, force: true });
  await cp(new URL(`../node_modules/pdfjs-dist/${source}/`, import.meta.url), destination, { recursive: true });
}));
await Promise.all(
  [...bundles.map(([, output]) => output), "pdf.worker.mjs"].map(async (output) => {
    const path = new URL(`../vendor/${output}`, import.meta.url);
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replace(/[\t ]+$/gmu, ""));
  }),
);
