import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
const lazyOperationModulesPlugin = {
  name: "lazy-operation-modules",
  setup(build) {
    for (const module of ["document-inspection", "script-runtime", "document-review"]) {
      build.onResolve({ filter: new RegExp(`^\\./${module}\\.mjs$`) }, (args) => ({
        path: args.path,
        external: true,
      }));
    }
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
    plugins: [dedupeYjsPlugin, lazyOperationModulesPlugin],
  }),
  Bun.build({
    entrypoints: [new URL("src/document-inspection.mjs", root).pathname],
    outdir: output.pathname,
    target: "browser",
    format: "esm",
    naming: "document-inspection.js",
    minify: true,
    plugins: [dedupeYjsPlugin],
  }),
  Bun.build({
    entrypoints: [new URL("src/script-runtime.mjs", root).pathname],
    outdir: output.pathname,
    target: "browser",
    format: "esm",
    naming: "script-runtime.js",
    minify: true,
  }),
  Bun.build({
    entrypoints: [new URL("src/document-review.mjs", root).pathname],
    outdir: output.pathname,
    target: "browser",
    format: "esm",
    naming: "document-review.js",
    minify: true,
  }),
]);
for (const build of builds) {
  if (!build.success) throw new AggregateError(build.logs, "Canvas bundle failed.");
}

const operationsBundleUrl = new URL("operations.js", output);
let operationsBundle = await readFile(operationsBundleUrl, "utf8");
for (const module of ["document-inspection", "script-runtime", "document-review"]) {
  const sourceSpecifier = `./${module}.mjs`;
  const packagedSpecifier = `./${module}.js`;
  if (!operationsBundle.includes(sourceSpecifier)) {
    throw new Error(`Canvas operations bundle is missing the expected ${sourceSpecifier} import.`);
  }
  operationsBundle = operationsBundle.replaceAll(sourceSpecifier, packagedSpecifier);
  if (!operationsBundle.includes(packagedSpecifier)) {
    throw new Error(`Canvas operations bundle did not retain the packaged ${packagedSpecifier} import.`);
  }
}
await writeFile(operationsBundleUrl, operationsBundle);

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
await cp(new URL("skills/", root), new URL("skills/", output), { recursive: true });
await cp(
  new URL("node_modules/canvaskit-wasm/bin/canvaskit.wasm", root),
  new URL("canvaskit.wasm", output),
);
await cp(
  new URL("node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm", root),
  new URL("emscripten-module.wasm", output),
);
for (const font of ["Inter-Regular.ttf", "Inter-Medium.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf"]) {
  await cp(new URL(`vendor/open-pencil/fonts/${font}`, root), new URL(font, output));
}
for (const dependency of ["yjs", "y-indexeddb", "lib0", "canvaskit-wasm", "lucide", "vue"]) {
  await cp(
    new URL(`node_modules/${dependency}/LICENSE`, root),
    new URL(`licenses/${dependency}-LICENSE.txt`, output),
  );
}
await cp(
  new URL("node_modules/@jitl/quickjs-wasmfile-release-sync/LICENSE", root),
  new URL("licenses/quickjs-emscripten-LICENSE.txt", output),
);
await cp(new URL("licenses/OpenPencil-LICENSE.txt", root), new URL("licenses/OpenPencil-LICENSE.txt", output));
await cp(new URL("licenses/Inter-OFL.txt", root), new URL("licenses/Inter-OFL.txt", output));

const manifest = new URL("penkra-app.json", root);
try {
  await stat(manifest);
  await cp(manifest, new URL("penkra-app.json", output));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const collaborationSource = await readFile(new URL("collaboration/pen-yjs-model.mjs", root));
const buildInfo = {
  files: {},
  sources: {
    collaborationSha256: createHash("sha256").update(collaborationSource).digest("hex"),
  },
};
for (const file of [
  "app.js",
  "operations.js",
  "document-inspection.js",
  "document-review.js",
  "script-runtime.js",
  "canvaskit.wasm",
  "emscripten-module.wasm",
]) {
  buildInfo.files[file] = Buffer.byteLength(await readFile(join(output.pathname, file)));
}
await writeFile(new URL("build-info.json", output), `${JSON.stringify(buildInfo, null, 2)}\n`);
