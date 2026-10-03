import { getDocument, GlobalWorkerOptions, PasswordResponses } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.mjs", import.meta.url).href;

export function createPdfLoadingTask(bytes) {
  return getDocument({
    data: bytes,
    cMapPacked: true,
    cMapUrl: new URL("./pdf-cmaps/", import.meta.url).href,
    standardFontDataUrl: new URL("./pdf-standard-fonts/", import.meta.url).href,
    wasmUrl: new URL("./pdf-wasm/", import.meta.url).href,
    isEvalSupported: false,
  });
}

export { PasswordResponses };
