// Loaded only when a document is opened or created. Keeping this boundary
// separate from the library shell prevents the editor engine, CanvasKit,
// QuickJS and the collaborative document model from entering app.js.
export {
  analyzeOpenPencilCompatibility,
  isOpenPencilEditableNode,
  penPropertyToSceneChanges,
} from "./openpencil-engine.mjs";
export {
  mountOpenPencilSurface,
  prepareOpenPencilEngine,
  rasterizeOpenPencilSvgAsset,
} from "./openpencil-surface.mjs";
export { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";
export { ensurePencilDocumentIconCatalogs } from "./pencil-icon-provider.mjs";
export { configureCanvasFonts } from "./font-runtime.mjs";
export { convertSvgAssetToCanvasNode, inspectSvgVectorCandidate } from "./svg-vectors.mjs";
export {
  ENGINE_ORIGIN,
  LOCAL_ORIGIN,
  REMOTE_ORIGIN,
  Y,
  applyRemoteUpdate,
  applyIncrementalDocumentPayload,
  createDocumentModel,
  createUndoManager,
  encodeState,
  encodeUpdate,
  listDocumentNodes,
  materialize,
  mutate,
  reconcileDocumentPayload,
  restoreDocumentModel,
} from "./document-model.mjs";
