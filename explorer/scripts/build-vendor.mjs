import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir(new URL("../vendor/", import.meta.url), { recursive: true });
const bundles = [
  ["editor-runtime.mjs", "editor-runtime.mjs"],
  ["csv-runtime.mjs", "csv-runtime.mjs"],
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
await Promise.all(
  bundles.map(async ([, output]) => {
    const path = new URL(`../vendor/${output}`, import.meta.url);
    const source = await readFile(path, "utf8");
    await writeFile(path, source.replace(/[\t ]+$/gmu, ""));
  }),
);
