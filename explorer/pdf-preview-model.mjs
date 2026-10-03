export const PDF_MIN_ZOOM = 0.5;
export const PDF_MAX_ZOOM = 3;
export const PDF_ZOOM_STEP = 0.25;

export function createPdfView(pageCount) {
  return {
    page: 1,
    pageCount: Math.max(1, Math.trunc(pageCount) || 1),
    zoom: 1,
    fit: "width",
    rotation: 0,
  };
}

export function setPdfPage(view, page) {
  const requested = Math.trunc(Number(page)) || 1;
  return { ...view, page: Math.min(view.pageCount, Math.max(1, requested)) };
}

export function changePdfZoom(view, direction) {
  const zoom = Math.min(PDF_MAX_ZOOM, Math.max(PDF_MIN_ZOOM, view.zoom + PDF_ZOOM_STEP * direction));
  return { ...view, zoom: Number(zoom.toFixed(2)), fit: "custom" };
}

export function togglePdfFit(view) {
  return { ...view, fit: view.fit === "width" ? "custom" : "width" };
}

export function rotatePdf(view) {
  return { ...view, rotation: (view.rotation + 90) % 360 };
}
