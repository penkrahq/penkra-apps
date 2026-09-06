import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compareUniformInterior, runExtractionMatrix, verifyExtractionEvidence } from "../scripts/luna-pdf-extraction-matrix.mjs";

test("uniform comparator keeps a scale-3 mismatch three raster pixels from the boundary", () => {
  const reference = { width: 10, height: 10, pixels: Buffer.alloc(10 * 10 * 4) };
  const actual = { width: 10, height: 10, pixels: Buffer.from(reference.pixels) };
  actual.pixels[(5 * 10 + 5) * 4] = 3;
  const measurement = compareUniformInterior(reference, actual, 3);
  assert.equal(measurement.boundaryRasterPixels, 2);
  assert.equal(measurement.mismatchPixels, 1);
  assert.equal(measurement.mismatchChannels, 1);
});

test("ordinary roleless PDF extraction evidence is complete and recomputable", async () => {
  const retained = process.env.CANVAS_PDF_EXTRACTION_EVIDENCE_DIR;
  const directory = retained ?? await mkdtemp(join(tmpdir(), "canvas-pdf-extraction-matrix-"));
  try {
    if (retained) await verifyExtractionEvidence(directory);
    else {
      await runExtractionMatrix(directory);
      await verifyExtractionEvidence(directory);
    }
    const manifest = await verifyExtractionEvidence(directory);
    if (!manifest.cases.every((record) => ["pass", "mismatch"].includes(record.status))) {
      throw new Error(`Extraction matrix recorded an unexpected case status: ${manifest.cases.filter((record) => !["pass", "mismatch"].includes(record.status)).map((record) => `${record.fixture}/${record.scale}`).join(", ")}`);
    }
  } finally {
    if (!retained) await rm(directory, { recursive: true, force: true });
  }
});
