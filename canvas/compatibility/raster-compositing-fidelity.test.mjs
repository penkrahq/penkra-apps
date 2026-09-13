import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { buildExporterIR, buildExtractionIR } from "../src/exporter-ir.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { exportSvg } from "../src/exporters/svg.mjs";
import { exportPdf } from "../src/exporters/pdf.mjs";
import { exportWeb } from "../src/exporters/web.mjs";
import { openBrowser } from "./browser-fixture.mjs";
import { pixels, compareCoverage } from "./pixel-fidelity.mjs";

const execute = promisify(execFile);
test("raster wrappers preserve baked transforms/alpha and capture blend backdrops", { timeout: 120_000 }, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-raster-compositing-"));
  let browser;
  try {
    browser = await openBrowser(join(directory, "chrome"), context.signal);
    const ck = await getCanvasKit();
    for (const kind of ["rotated", "quarter-turn", "node-blend", "paint-blend"]) {
      const blend = kind.endsWith("blend");
      const node = { id: "foreground", type: "rectangle", x: 80, y: 70, width: 100, height: 50, fill: "#336699",
        ...(blend ? kind === "paint-blend" ? { fill: { type: "color", color: "#336699", blendMode: "multiply" } } : { blendMode: "multiply" }
          : { opacity: 0.5, rotation: kind === "rotated" ? 30 : 90, export: "image" }),
      };
      const document = { module: "web", children: [{ id: "root", name: "Root", role: "route", type: "frame", layout: "none", width: 300, height: 200,
        physical: { w: 300 / 96, h: 200 / 96, unit: "in" }, fill: "#FFFFFF", children: [
          { id: "backdrop", type: "rectangle", x: 40, y: 30, width: 180, height: 130, fill: "#F4A261" }, node,
        ],
      }] };
      for (const scale of [1, 2]) {
        const capture = async id => (await takeDocumentScreenshots(document, [{ nodeIds: [id] }], new Map(), { scale }))[0];
        const reference = Buffer.from((await capture("root")).data, "base64");
        const expected = pixels(ck, reference, 300 * scale, 200 * scale);
        if (blend) {
          const offset = (90 * scale * 300 * scale + 100 * scale) * 4;
          for (const [channel, value] of [49, 65, 58, 255].entries()) {
            assert.ok(Math.abs(expected[offset + channel] - value) <= 1,
              `${kind}: Canvas must implement multiply, independently of exporter agreement`);
          }
        }
        if (kind === "rotated" && scale === 1) {
          const clipped = await readFile(new URL("../research/raster-compositing-20260905/rotated-svg-1-canvas.png", import.meta.url));
          assert.throws(() => compareCoverage(pixels(ck, clipped, 300, 200), expected, 300, 200), /Pixel coverage mismatch/,
            "The pre-fix clipped Canvas reference must not pass the corrected comparison.");
        }
        for (const format of ["svg", "html", "pdf"]) {
          const ir = format === "html" ? buildExporterIR(document, { role: "route", frames: ["root"] }) : buildExtractionIR(document, { nodeId: "root", format, scale });
          assert.deepEqual(ir.rasters.map(raster => raster.id), [blend ? "root" : "foreground"]);
          const images = new Map();
          for (const raster of ir.rasters) images.set(raster.id, (await capture(raster.id)).data);
          const rasterHref = id => `data:image/png;base64,${images.get(id)}`;
          const path = join(directory, `root.${format}`);
          if (format === "svg") await writeFile(path, exportSvg(ir, ir.outputs[0], { rasterHref }));
          else if (format === "html") for (const [name, bytes] of exportWeb(ir, { rasterHref })) await writeFile(join(directory, name), bytes);
          else await writeFile(path, await exportPdf(ir, { rasterizeNode: async id => Buffer.from(images.get(id), "base64") }));
          let actual;
          if (format === "pdf") {
            const output = join(directory, "pdf-render");
            await execute("pdftoppm", ["-r", String(96 * scale), "-singlefile", "-png", path, output], { timeout: 30_000, signal: context.signal });
            actual = await readFile(`${output}.png`);
          } else actual = await browser.screenshot(pathToFileURL(path).href, 300, 200, scale);
          if (process.env.CANVAS_RASTER_FIDELITY_EVIDENCE_DIR) {
            const evidence = process.env.CANVAS_RASTER_FIDELITY_EVIDENCE_DIR;
            await mkdir(evidence, { recursive: true });
            const prefix = `${kind}-${format}-${scale}`;
            for (const [name, bytes] of [[`${prefix}-actual.png`, actual], [`${prefix}-canvas.png`, reference], [`${prefix}-ir.json`, JSON.stringify(ir, null, 2)], [`${prefix}.${format}`, await readFile(path)]]) {
              await writeFile(join(evidence, name), bytes, { flag: "wx" });
            }
          }
          context.diagnostic(JSON.stringify({ kind, format, scale, ...compareCoverage(pixels(ck, actual, 300 * scale, 200 * scale), expected, 300 * scale, 200 * scale) }));
        }
      }
    }
  } finally {
    await browser?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
