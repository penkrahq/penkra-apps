import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { exportDocumentBatch, extractDocumentNode } from "../src/export-service.mjs";
import { loadCanvasImports } from "../src/canvas-imports.mjs";
import { consumerDocument, publicationFixture } from "./luna-library-artifact-fixtures.mjs";

const argument = process.argv.find((value) => value.startsWith("--output="));
if (!argument) throw new Error("Usage: node scripts/luna-library-artifact-generate.mjs --output=/absolute/retained/path");
const output = resolve(argument.slice("--output=".length));
await mkdir(dirname(output), { recursive: true });
await mkdir(output);

const fixture = publicationFixture();
fixture.registry.publish(fixture.releaseV1);
const consumer = consumerDocument(fixture.v1Record);
const before = structuredClone(consumer);
const loaded = await loadCanvasImports({}, consumer, { resolveRelease: fixture.registry.resolve });
const temporary = await mkdtemp(join(tmpdir(), "canvas-library-artifact-retain-"));
try {
  const pptx = join(temporary, "library.pptx");
  const html = join(temporary, "html");
  await exportDocumentBatch(consumer, [{ role: "slide", frames: ["slide"], destination: pptx, imports: loaded.imports, modes: { appearance: "light" } }], { assets: new Map(), title: "Published library integration" });
  await exportDocumentBatch(consumer, [{ role: "route", frames: ["route"], destination: html, imports: loaded.imports, modes: { appearance: "light" } }], { assets: new Map(), title: "Published library integration" });
  const svg = join(temporary, "library.svg");
  const pdf = join(temporary, "library.pdf");
  await extractDocumentNode(consumer, { nodeId: "art", format: "svg", destination: svg, modes: { appearance: "light" } }, { assets: new Map(), imports: loaded.imports });
  await extractDocumentNode(consumer, { nodeId: "art", format: "pdf", destination: pdf, modes: { appearance: "light" } }, { assets: new Map(), imports: loaded.imports });

  const htmlPage = (await readdir(html)).find((name) => name.endsWith(".html"));
  const htmlAssets = (await readdir(join(html, "assets"))).filter((name) => name.endsWith(".png")).sort();
  const selected = [
    ["library.pptx", pptx],
    ["library.html", join(html, htmlPage)],
    ["styles.css", join(html, "styles.css")],
    ["assets/raster-1.png", join(html, "assets", htmlAssets[0])],
    ["assets/raster-2.png", join(html, "assets", htmlAssets[1])],
    ["assets/raster-3.png", join(html, "assets", htmlAssets[2])],
    ["library.svg", svg],
    ["library.pdf", pdf],
  ];
  for (const [, source] of selected) {
    if (!source) throw new Error("Required retained artifact was not generated.");
  }
  for (const [relative, source] of selected) {
    const destination = join(output, relative);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    release: { libraryId: fixture.releaseV1.libraryId, releaseId: fixture.releaseV1.releaseId, contentHash: fixture.releaseV1.contentHash },
    seam: { exportDocument: "original consumer + request.imports", extraction: "original consumer + options.imports" },
    artifactCount: selected.length,
    artifacts: await Promise.all(selected.map(async ([relative]) => {
      const bytes = await readFile(join(output, relative));
      return { path: relative, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    })),
  };
  await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  if (JSON.stringify(consumer) !== JSON.stringify(before)) throw new Error("Consumer mutated during retention generation.");
  console.log(JSON.stringify({ output, artifactCount: selected.length, manifest: join(output, "manifest.json") }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
