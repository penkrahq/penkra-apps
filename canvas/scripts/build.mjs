import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
const yjsEntry = new URL("node_modules/yjs/dist/yjs.mjs", root).pathname;
const dedupeYjsPlugin = {
  name: "dedupe-yjs",
  setup(build) {
    build.onResolve({ filter: /^yjs$/ }, () => ({ path: yjsEntry }));
  },
};

await rm(output, { recursive: true, force: true });
await mkdir(new URL("assets/", output), { recursive: true });
await mkdir(new URL("licenses/", output), { recursive: true });

const builds = await Promise.all([
  Bun.build({
    entrypoints: [new URL("src/app.mjs", root).pathname],
    outdir: output.pathname,
    target: "browser",
    format: "esm",
    naming: "app.js",
    minify: true,
    plugins: [dedupeYjsPlugin],
  }),
  Bun.build({
    entrypoints: [new URL("src/operations.mjs", root).pathname],
    outdir: output.pathname,
    target: "browser",
    format: "esm",
    naming: "operations.js",
    minify: true,
    plugins: [dedupeYjsPlugin],
  }),
]);
for (const build of builds) {
  if (!build.success) throw new AggregateError(build.logs, "Canvas bundle failed.");
}

for (const file of [
  "app.html",
  "operations.html",
  "styles.css",
  "README.md",
  "INSTRUCTIONS.md",
  "THIRD_PARTY_NOTICES.md",
]) {
  await cp(new URL(file, root), new URL(file, output));
}
await cp(new URL("assets/icon.svg", root), new URL("assets/icon.svg", output));
await cp(
  new URL("node_modules/canvaskit-wasm/bin/canvaskit.wasm", root),
  new URL("canvaskit.wasm", output),
);
for (const font of ["Inter-Regular.ttf", "Inter-Medium.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf"]) {
  await cp(new URL(`vendor/open-pencil/fonts/${font}`, root), new URL(font, output));
}
for (const dependency of ["yjs", "y-indexeddb", "lib0", "canvaskit-wasm", "vue"]) {
  await cp(
    new URL(`node_modules/${dependency}/LICENSE`, root),
    new URL(`licenses/${dependency}-LICENSE.txt`, output),
  );
}
await cp(new URL("licenses/OpenPencil-LICENSE.txt", root), new URL("licenses/OpenPencil-LICENSE.txt", output));
await cp(new URL("licenses/Inter-OFL.txt", root), new URL("licenses/Inter-OFL.txt", output));

const manifest = new URL("penkra-app.json", root);
try {
  await stat(manifest);
  await cp(manifest, new URL("penkra-app.json", output));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const buildInfo = { files: {} };
for (const file of ["app.js", "operations.js"]) {
  buildInfo.files[file] = Buffer.byteLength(await readFile(join(output.pathname, file)));
}
await writeFile(new URL("build-info.json", output), `${JSON.stringify(buildInfo, null, 2)}\n`);
