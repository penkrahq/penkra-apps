import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

await mkdir(new URL("../vendor/", import.meta.url), { recursive: true });
await build({
  entryPoints: [new URL("../vendor-src/editor-runtime.mjs", import.meta.url).pathname],
  outfile: new URL("../vendor/editor-runtime.mjs", import.meta.url).pathname,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  minify: true,
  legalComments: "eof",
});
