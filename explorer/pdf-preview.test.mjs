import assert from "node:assert/strict";
import test from "node:test";
import {
  changePdfZoom,
  createPdfView,
  PDF_MAX_ZOOM,
  PDF_MIN_ZOOM,
  rotatePdf,
  setPdfPage,
  togglePdfFit,
} from "./pdf-preview-model.mjs";

test("PDF page navigation stays within the document", () => {
  const view = createPdfView(4);
  assert.equal(setPdfPage(view, 3).page, 3);
  assert.equal(setPdfPage(view, 0).page, 1);
  assert.equal(setPdfPage(view, 99).page, 4);
});

test("PDF zoom leaves fit mode and respects its supported range", () => {
  let view = createPdfView(2);
  view = changePdfZoom(view, 1);
  assert.deepEqual({ zoom: view.zoom, fit: view.fit }, { zoom: 1.25, fit: "custom" });
  for (let index = 0; index < 20; index += 1) view = changePdfZoom(view, 1);
  assert.equal(view.zoom, PDF_MAX_ZOOM);
  for (let index = 0; index < 30; index += 1) view = changePdfZoom(view, -1);
  assert.equal(view.zoom, PDF_MIN_ZOOM);
});

test("PDF fit and rotation controls produce stable view state", () => {
  let view = createPdfView(1);
  view = togglePdfFit(view);
  assert.equal(view.fit, "custom");
  view = togglePdfFit(view);
  assert.equal(view.fit, "width");
  for (let index = 0; index < 4; index += 1) view = rotatePdf(view);
  assert.equal(view.rotation, 0);
});
