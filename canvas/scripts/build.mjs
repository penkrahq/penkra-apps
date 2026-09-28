import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const { generateIconChunks } = await import("./generate-icon-chunks.mjs");
await generateIconChunks();
const output = new URL("../dist/", import.meta.url);
const { assertAllCapabilityTables } = await import(new URL("src/capability-tables.mjs", root));
const developmentBuildWithUnverifiedCapabilities =
  process.env.CANVAS_DEV_BUILD_WITH_UNVERIFIED_CAPABILITIES === "1";
if (!developmentBuildWithUnverifiedCapabilities) assertAllCapabilityTables();
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
    splitting: true,
    plugins: [dedupeYjsPlugin],
  }),
  Bun.build({
    entrypoints: [new URL("src/legacy-offline-cache-worker.mjs", root).pathname],
    outdir: output.pathname,
    target: "browser",
    format: "esm",
    naming: "legacy-offline-cache-worker.js",
    minify: true,
    plugins: [dedupeYjsPlugin],
  }),
  Bun.build({
    entrypoints: [
      new URL("src/operations.mjs", root).pathname,
      new URL("src/document-inspection.mjs", root).pathname,
      new URL("src/script-runtime.mjs", root).pathname,
      new URL("src/document-screenshot.mjs", root).pathname,
    ],
    outdir: output.pathname,
    // All operation entrypoints share one module graph and one icon-chunk cache.
    // Bun still keeps the dynamic imports lazy. The Node target is required for
    // WASM loaders in Penkra's packaged App controller.
    target: "node",
    format: "esm",
    naming: "[name].js",
    minify: true,
    splitting: true,
    plugins: [dedupeYjsPlugin],
  }),
]);
for (const build of builds) {
  if (!build.success) throw new AggregateError(build.logs, "Canvas bundle failed.");
}
await writeFile(new URL("package.json", output), '{"type":"module"}\n');

for (const file of [
  "app.html",
  "styles.css",
  "README.md",
  "INSTRUCTIONS.md",
  "THIRD_PARTY_NOTICES.md",
]) {
  await cp(new URL(file, root), new URL(file, output));
}
await cp(new URL("assets/icon.svg", root), new URL("assets/icon.svg", output));
await cp(new URL("src/icon-chunks/", root), new URL("icon-chunks/", output), { recursive: true });
const packagedIconIndex = JSON.parse(await readFile(new URL("icon-chunks/search-index.json", output)));
const packagedIconRouting = (await import(new URL("src/icon-chunk-routing.mjs", root))).default;
for (const [family, names] of Object.entries(packagedIconIndex)) {
  const chunkNames = new Map();
  for (const name of names) {
    const base = name.slice(0, 3).padEnd(3, "_");
    const length = packagedIconRouting[family]?.[base] ?? 3;
    const prefix = name.slice(0, length).padEnd(length, "_");
    if (!chunkNames.has(prefix)) chunkNames.set(prefix, []);
    chunkNames.get(prefix).push(name);
  }
  for (const [prefix, expectedNames] of chunkNames) {
    const packaged = JSON.parse(await readFile(new URL(`icon-chunks/${family}/${prefix}.json`, output)));
    for (const name of expectedNames) {
      if (!Object.hasOwn(packaged, name)) throw new Error(`Packaged icon missing: ${family}:${name}`);
    }
  }
}
await mkdir(new URL("assets/color/", output), { recursive: true });
await cp(new URL("assets/color/sRGB2014.icc", root), new URL("assets/color/sRGB2014.icc", output));
await cp(new URL("operations/", root), new URL("operations/", output), { recursive: true });
await cp(new URL("skills/", root), new URL("skills/", output), { recursive: true });
await cp(
  new URL("node_modules/canvaskit-wasm/bin/canvaskit.wasm", root),
  new URL("canvaskit.wasm", output),
);
await cp(
  new URL("node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm", root),
  new URL("emscripten-module.wasm", output),
);
for (const font of ["Inter-Regular.ttf", "Inter-Medium.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf", "Inter-ExtraBold.ttf", "Inter-OFL.txt"]) {
  await cp(new URL(`vendor/open-pencil/fonts/${font}`, root), new URL(font, output));
}
await cp(new URL("vendor/open-pencil/fonts/NotoColorEmoji.ttf", root), new URL("NotoColorEmoji.ttf", output));
await cp(new URL("licenses/Noto-Emoji-OFL.txt", root), new URL("licenses/Noto-Emoji-OFL.txt", output));
for (const weight of [400, 500]) {
  await cp(
    new URL(`node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${weight}-normal.woff2`, root),
    new URL(`jetbrains-mono-${weight}.woff2`, output),
  );
}
for (const style of ["outlined", "rounded", "sharp"]) {
  await cp(
    new URL(`node_modules/material-symbols/material-symbols-${style}.woff2`, root),
    new URL(`material-symbols-${style}.woff2`, output),
  );
}
for (const dependency of ["yjs", "y-indexeddb", "lib0", "canvaskit-wasm", "lucide", "vue"]) {
  await cp(
    new URL(`node_modules/${dependency}/LICENSE`, root),
    new URL(`licenses/${dependency}-LICENSE.txt`, output),
  );
}
for (const [dependency, outputName] of [
  ["@phosphor-icons/core", "phosphor-icons-LICENSE.txt"],
  ["@material-symbols/svg-400", "material-symbols-LICENSE.txt"],
  ["material-symbols", "material-symbols-font-LICENSE.txt"],
]) {
  await cp(
    new URL(`node_modules/${dependency}/LICENSE`, root),
    new URL(`licenses/${outputName}`, output),
  );
}
await cp(
  new URL("node_modules/@jitl/quickjs-wasmfile-release-sync/LICENSE", root),
  new URL("licenses/quickjs-emscripten-LICENSE.txt", output),
);
await cp(new URL("licenses/OpenPencil-LICENSE.txt", root), new URL("licenses/OpenPencil-LICENSE.txt", output));
await cp(new URL("licenses/Inter-OFL.txt", root), new URL("licenses/Inter-OFL.txt", output));
await cp(new URL("licenses/ICC-sRGB-profile.txt", root), new URL("licenses/ICC-sRGB-profile.txt", output));
await cp(
  new URL("node_modules/@fontsource/jetbrains-mono/LICENSE", root),
  new URL("licenses/JetBrains-Mono-OFL.txt", output),
);

const manifest = new URL("penkra-app.json", root);
try {
  await stat(manifest);
  await cp(manifest, new URL("penkra-app.json", output));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const collaborationSource = await readFile(new URL("collaboration/pen-yjs-model.mjs", root));
const buildInfo = {
  developmentBuildWithUnverifiedCapabilities,
  files: {},
  sources: {
    collaborationSha256: createHash("sha256").update(collaborationSource).digest("hex"),
  },
};
for (const file of [
  "app.js",
  "legacy-offline-cache-worker.js",
  "operations.js",
  "document-inspection.js",
  "document-screenshot.js",
  "script-runtime.js",
  "canvaskit.wasm",
  "emscripten-module.wasm",
  "jetbrains-mono-400.woff2",
  "jetbrains-mono-500.woff2",
  "material-symbols-outlined.woff2",
  "material-symbols-rounded.woff2",
  "material-symbols-sharp.woff2",
]) {
  buildInfo.files[file] = Buffer.byteLength(await readFile(join(output.pathname, file)));
}
await writeFile(new URL("build-info.json", output), `${JSON.stringify(buildInfo, null, 2)}\n`);

// Exercise the installed shape, not only the source module. This catches
// target/asset regressions such as a packaged controller bundle selecting a
// browser-only WASM loader while all source-level tests remain green.
const iconDocument = {
  version: "2.17",
  children: [{
    id: "build-icon-frame",
    type: "frame",
    width: 100,
    height: 100,
    children: [{
      id: "build-icon",
      type: "icon",
      library: "phosphor",
      icon: "apple-logo-fill",
      width: 20,
      height: 20,
      fill: "#000000",
    }],
  }],
};
const handlers = new Map();
globalThis.penkra = {
  account: {
    async request(request) {
      if (request.path === "/projects/build-icon-document?chunked=auto") {
        return {
          status: 200,
          headers: {},
          body: new TextEncoder().encode(JSON.stringify({
            id: "build-icon-document",
            title: "Icon smoke",
            access: "owner",
            ownerAccountId: "build-account",
            snapshot: { throughSequence: 1, projection: iconDocument },
            updates: [],
          })),
        };
      }
      throw new Error(`Unexpected packaged Canvas smoke request ${request.method} ${request.path}`);
    },
    subscribe() {},
  },
  operations: { handle: (name, handler) => handlers.set(name, handler) },
};
await import(new URL("operations.js", output));
const packagedIconRead = await handlers.get("documents.execute")({
  documentId: "build-icon-document",
  code: 'return Get("#build-icon")[0].bounds;',
});
if (
  packagedIconRead?.changed !== false ||
  !packagedIconRead?.issueSummary?.inspected ||
  !Number.isFinite(packagedIconRead?.result?.width)
) {
  throw new Error("Packaged Canvas icon inspection did not resolve bounds.");
}

const { executeCanvasScript } = await import(new URL("script-runtime.js", output));
const packagedRuntimeSmoke = await executeCanvasScript(
  { children: [] },
  'return Get("*").length;',
);
if (packagedRuntimeSmoke?.result !== 0) {
  throw new Error("Packaged Canvas script runtime smoke test returned an unexpected result.");
}

const { takeDocumentScreenshots } = await import(new URL("document-screenshot.js", output));
const [packagedScreenshotSmoke] = await takeDocumentScreenshots(
  {
    version: "2.15",
    children: [
      {
        id: "build-smoke-frame",
        type: "frame",
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        fill: "#ff0000",
        children: [],
      },
    ],
  },
  [{ nodeIds: ["build-smoke-frame"] }],
);
if (
  packagedScreenshotSmoke?.width !== 2 ||
  packagedScreenshotSmoke?.height !== 2 ||
  !Buffer.from(packagedScreenshotSmoke?.data ?? "", "base64")
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
) {
  throw new Error("Packaged Canvas screenshot smoke test did not return a 2×2 PNG.");
}
