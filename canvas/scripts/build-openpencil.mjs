import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const canvasRoot = new URL("../", import.meta.url);
const sourceRoot = new URL("vendor/open-pencil/source/", canvasRoot);
const output = new URL("vendor/open-pencil/engine.source.mjs", canvasRoot);

await run(["bunx", "bun@1.3.10", "run", "build:packages"], sourceRoot.pathname);
const bundle = await Bun.build({
  entrypoints: [new URL("fork-entry.ts", sourceRoot).pathname],
  target: "browser",
  format: "esm",
  external: ["vue", "canvaskit-wasm", "expr-eval"],
  plugins: [{
    name: "csp-safe-global-this",
    setup(build) {
      build.onResolve({ filter: /globalThis\.mjs$/u }, (args) => (
        args.importer.includes("es-toolkit")
          ? { path: "globalThis.mjs", namespace: "csp-safe-global-this" }
          : undefined
      ));
      build.onLoad({ filter: /.*/u, namespace: "csp-safe-global-this" }, () => ({
        contents: "const globalThis_ = globalThis; export { globalThis_ as globalThis };",
        loader: "js",
      }));
    },
  }],
});
if (!bundle.success) throw new AggregateError(bundle.logs, "OpenPencil bundle failed.");
if (bundle.outputs.length !== 1) {
  throw new Error(`Expected one OpenPencil output, received ${bundle.outputs.length}.`);
}
await Bun.write(output, bundle.outputs[0]);

const digest = createHash("sha256").update(await readFile(output)).digest("hex");
const provenanceUrl = new URL("vendor/open-pencil/PROVENANCE.json", canvasRoot);
const provenance = JSON.parse(await readFile(provenanceUrl, "utf8"));
if (provenance.sourceEngineSha256 !== digest) {
  provenance.sourceEngineSha256 = digest;
  await Bun.write(provenanceUrl, `${JSON.stringify(provenance, null, 2)}\n`);
}
console.log(`OpenPencil source engine SHA-256: ${digest}`);

async function run(command, cwd) {
  const child = Bun.spawn(command, { cwd, stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} exited ${exitCode}`);
}
