import {
  GlobalWorkerOptions,
  getDocument,
} from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.min.mjs", import.meta.url).href;

export function loadPdfDocument(data) {
  const loadingTask = getDocument({ data });
  return { loadingTask, promise: loadingTask.promise };
}
