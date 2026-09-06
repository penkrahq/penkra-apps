import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { exportSvg } from "../src/exporters/svg.mjs";
import { exportPdf } from "../src/exporters/pdf.mjs";
import { exportWeb } from "../src/exporters/web.mjs";
import { openBrowser } from "./browser-fixture.mjs";
import { pixels, compareCoverage } from "./pixel-fidelity.mjs";

const execute = promisify(execFile);
const paths = ["nodes.path", "nodes.polygon", "properties.geometry", "properties.viewBox", "properties.fillRule"];
import { vectorCases as cases } from "./vector-fixture.mjs";
const document = { module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{
  id: "vectors", name: "Vectors", type: "frame", role: "route", layout: "none", width: 900, height: 660,
  physical: { w: 900 / 96, h: 660 / 96, unit: "in" }, fill: "#FFFFFF",
  children: ["evenodd", "nonzero"].flatMap((fillRule, ruleIndex) => cases.map(([name, geometry, viewBox], index) => ({
    id: `${name}-${fillRule}`, type: name === "polygon" ? "polygon" : "path",
    x: 20 + index % 5 * 176, y: 20 + (Math.floor(index / 5) + ruleIndex * 2) * 156,
    width: 130, height: 110, geometry, viewBox: viewBox ?? [0, 0, 100, 100], fillRule, fill: "#0B4A6F",
  }))),
}] };

test("SVG, HTML and PDF candidate vectors match Canvas coverage at 1x and 2x", { timeout: 120_000 }, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-vector-fidelity-"));
  let browser;
  try {
    browser = await openBrowser(join(directory, "chrome"), context.signal);
    const svgIr = buildCapabilityVerificationIR(document, { format: "svg", nodeId: "vectors" }, paths);
    const svg = exportSvg(svgIr, svgIr.outputs[0]);
    assert.equal(svgIr.rasters.length, 0);
    assert.equal((svg.match(/<path\b/gu) ?? []).length, 20);
    assert.doesNotMatch(svg, /<image\b/u);
    await writeFile(join(directory, "vectors.svg"), svg);
    const webIr = buildCapabilityVerificationIR(document, { role: "route", frames: ["vectors"] }, paths);
    const web = exportWeb(webIr);
    assert.equal(webIr.rasters.length, 0);
    assert.equal((web.get("vectors.html").match(/<path\b/gu) ?? []).length, 20);
    assert.doesNotMatch(web.get("vectors.html"), /<img\b/u);
    for (const [name, bytes] of web) await writeFile(join(directory, name), bytes);
    const pdfIr = buildCapabilityVerificationIR(document, { format: "pdf", nodeId: "vectors" }, paths);
    assert.equal(pdfIr.rasters.length, 0);
    await writeFile(join(directory, "vectors.pdf"), await exportPdf(pdfIr));
    const ck = await getCanvasKit();
    const measurements = [];
    for (const scale of [1, 2]) {
      const width = 900 * scale, height = 660 * scale;
      const [reference] = await takeDocumentScreenshots(document, [{ nodeIds: ["vectors"] }], new Map(), { scale });
      const referenceBytes = Buffer.from(reference.data, "base64");
      const expected = pixels(ck, referenceBytes, width, height);
      assert.throws(() => compareCoverage(new Uint8Array(expected.length).fill(255), expected, width, height));
      await writeFile(join(directory, `canvas-${scale}.png`), referenceBytes);
      for (const format of ["svg", "html", "pdf"]) {
        const output = join(directory, `${format}-${scale}.png`);
        if (format === "pdf") {
          await execute("pdftoppm", ["-r", String(96 * scale), "-singlefile", "-png", join(directory, "vectors.pdf"), output.slice(0, -4)], { timeout: 30_000, signal: context.signal });
        } else {
          await writeFile(output, await browser.screenshot(pathToFileURL(join(directory, `vectors.${format}`)).href, 900, 660, scale));
        }
        const actual = pixels(ck, await readFile(output), width, height);
        measurements.push({ format, scale, cases: 20, ...compareCoverage(actual, expected, width, height) });
      }
    }
    if (process.env.CANVAS_VECTOR_FIDELITY_EVIDENCE_DIR) {
      context.signal.throwIfAborted();
      const evidence = process.env.CANVAS_VECTOR_FIDELITY_EVIDENCE_DIR;
      await mkdir(evidence, { recursive: true });
      for (const name of ["vectors.svg", "vectors.html", "styles.css", "vectors.pdf", ...[1, 2].flatMap(scale => ["canvas", "svg", "html", "pdf"].map(format => `${format}-${scale}.png`))]) {
        await writeFile(join(evidence, name), await readFile(join(directory, name)), { flag: "wx" });
      }
      await writeFile(join(evidence, "measurements.json"), JSON.stringify(measurements, null, 2), { flag: "wx" });
    }
  } finally {
    await browser?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
