import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { exportPdf } from "../src/exporters/pdf.mjs";
import { vectorForNode } from "../src/vector-path.mjs";
import { preflightPdfx4 } from "../src/exporters/pdfx-preflight.mjs";

const root = await mkdtemp(join(tmpdir(), "canvas-pdfx-writer-render-"));
const fonts = { "Inter:400": await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url)) };
const node = (id, type, geometry, paint, extra = {}) => ({ id, type, geometry, paint, capability: { verdict: "native" }, ...extra });
const ir = { outputs: [{ id: "probe", width: 480, height: 320,
  physical: { w: 480, h: 320, unit: "px" }, bleed: 6,
  root: node("background", "frame", { x: 0, y: 0, w: 480, h: 320 }, { fill: "#ffffff" }),
  nodes: [
    node("title", "text", { x: 24, y: 18, w: 430, h: 48 }, {}, { semantics: { content: "Canvas PDF/X-4", runs: [{ from: 0, to: 14, fontFamily: "Inter", fontSize: 28, fill: "#123456" }] } }),
    node("ring", "path", { x: 24, y: 96, w: 140, h: 140 }, { fill: "#168557" }, { vector: vectorForNode({ type: "path", geometry: "M0 0H100V100H0Z M25 25H75V75H25Z", viewBox: [0, 0, 100, 100], fillRule: "evenodd" }) }),
    node("back", "rectangle", { x: 198, y: 96, w: 110, h: 140 }, { fill: "#168557" }),
    node("alpha", "ellipse", { x: 240, y: 118, w: 150, h: 110 }, { fill: "#F04C2480", stroke: { fill: "#12345680", width: 5 } }),
  ] }] };
const records = [];
for (const profile of [null, "PDF/X-4"]) {
  const stem = profile ? "pdfx" : "ordinary";
  const options = { fonts, ...(profile ? { profile,
    outputIntent: await readFile(new URL("../assets/color/GRACoL2013_CRPC6.icc", import.meta.url)),
    sourceColorProfile: await readFile(new URL("../assets/color/sRGB2014.icc", import.meta.url)),
  } : {}) };
  const bytes = await exportPdf(ir, options);
  const preflight = profile ? await preflightPdfx4(bytes) : null;
  if (preflight) { assert.deepEqual(preflight.issues, []); assert.equal(preflight.canvasWriterSubset.verified, true); }
  const pdfPath = join(root, `${stem}.pdf`);
  await writeFile(pdfPath, bytes, { flag: "wx" });
  const args = ["-r", "144", "-singlefile", "-png", pdfPath, join(root, stem)];
  const rendered = spawnSync("pdftoppm", args, { encoding: "utf8", timeout: 60_000 });
  assert.equal(rendered.error, undefined);
  assert.equal(rendered.status, 0, rendered.stderr);
  const png = await readFile(join(root, `${stem}.png`));
  records.push({ profile, pdfPath, pngPath: join(root, `${stem}.png`), byteCount: bytes.length,
    pdfSha256: createHash("sha256").update(bytes).digest("hex"),
    pngSha256: createHash("sha256").update(png).digest("hex"), args,
    stderr: rendered.stderr, preflight });
}
await writeFile(join(root, "results.json"), JSON.stringify({ root, records }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ root, records: records.map(({ preflight, ...record }) => ({ ...record, issues: preflight?.issues ?? null })) }, null, 2));
