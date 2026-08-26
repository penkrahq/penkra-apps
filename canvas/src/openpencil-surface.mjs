import { createApp, h, ref } from "vue";
import {
  computeAllLayouts,
  getCanvasKit,
  fontManager,
  provideEditor,
  useCanvas,
  useCanvasInput,
  useTextEdit,
} from "../vendor/open-pencil/engine.mjs";

import {
  createOpenPencilEditor,
  fitOpenPencilDesign,
  findPenNode,
  isOpenPencilEditableNode,
  refreshOpenPencilEditor,
  sceneEventToPenMutations,
  sceneNodePropertySnapshot,
  sceneNodeToPenNode,
} from "./openpencil-engine.mjs";
import { bindCanvasThemeBackground } from "./canvas-theme.mjs";
import { preparePencilScriptRuntime } from "./pencil-script-runtime.mjs";
import { collectPencilDocumentFonts } from "./pencil-resources.mjs";
import { createLayeredSurfaceReadiness } from "./surface-readiness.mjs";

let canvasKitReady;
export function prepareOpenPencilEngine() {
  canvasKitReady ??= Promise.all([
    getCanvasKit({
      locateFile: (file) => new URL(file, import.meta.url).href,
    }),
    preparePencilScriptRuntime(),
  ]).then(([canvasKit]) => canvasKit);
  return canvasKitReady;
}

export function mountOpenPencilSurface(element, document, callbacks = {}) {
  let sourceDocument = document;
  registerDocumentFonts(document, callbacks.assets);
  const editor = createOpenPencilEditor(document, {
    getViewportSize: () => ({ width: element.clientWidth, height: element.clientHeight }),
    assets: callbacks.assets,
    preparedDocument: callbacks.preparedDocument,
  });
  const unbindCanvasTheme = bindCanvasThemeBackground(editor, element);
  let sceneValues = captureSceneValues(editor);
  if (callbacks.viewport) {
    editor.state.panX = callbacks.viewport.panX;
    editor.state.panY = callbacks.viewport.panY;
    editor.state.zoom = callbacks.viewport.zoom;
  }

  let refreshingDocument = false;
  let shaderAnimationFrame = 0;
  const hasTimeShader = () => [...editor.graph.nodes.values()].some((node) => node.fills?.some(
    (fill) => fill.pencilShader?.uniforms?.some(({ automatic }) => automatic === "time"),
  ));
  const hasMouseShader = () => [...editor.graph.nodes.values()].some((node) => node.fills?.some(
    (fill) => fill.pencilShader?.uniforms?.some(({ automatic }) => automatic === "mouse"),
  ));
  const updateShaderMouse = (event) => {
    if (!hasMouseShader()) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - bounds.left - editor.state.panX) / editor.state.zoom,
      y: (event.clientY - bounds.top - editor.state.panY) / editor.state.zoom,
    };
    for (const renderer of editor.canvasRenderers) renderer.pencilShaderMouseCanvas = point;
    editor.requestRepaint();
  };
  const animateTimeShaders = () => {
    shaderAnimationFrame = 0;
    if (!hasTimeShader()) return;
    editor.requestRepaint();
    shaderAnimationFrame = requestAnimationFrame(animateTimeShaders);
  };
  const ensureTimeShaderAnimation = () => {
    if (!shaderAnimationFrame && hasTimeShader()) {
      shaderAnimationFrame = requestAnimationFrame(animateTimeShaders);
    }
  };
  ensureTimeShaderAnimation();
  const fitDesignInView = () => {
    const viewport = fitOpenPencilDesign(editor, {
      width: element.clientWidth,
      height: element.clientHeight,
      ...(callbacks.getViewportInsets?.() ?? {}),
    });
    if (viewport) callbacks.onViewport?.(viewport);
  };
  const disposers = [
    editor.onEditorEvent("selection:changed", (selectedIds) => {
      if (!refreshingDocument) callbacks.onSelection?.(selectedIds);
    }),
    editor.onEditorEvent("viewport:changed", (viewport) => callbacks.onViewport?.(viewport)),
    editor.onEditorEvent("tool:changed", (tool) => callbacks.onTool?.(tool)),
    editor.onEditorEvent("node:updated", (nodeId, changes) => {
      const previous = sceneValues.get(nodeId);
      sceneValues.set(nodeId, { ...previous, ...changes });
      const sourceNode = findPenNode(sourceDocument, nodeId);
      if (editor.state.selectedIds.has(nodeId) && sourceNode && !isOpenPencilEditableNode(sourceNode)) {
        callbacks.onUnsupportedEdit?.(`${sourceNode.type} cannot be edited faithfully; its source was left unchanged.`);
        return;
      }
      const mutations = sceneEventToPenMutations(
        editor,
        sourceDocument,
        nodeId,
        changes,
        previous,
      );
      if (mutations.length) callbacks.onMutations?.(mutations);
    }),
    editor.onEditorEvent("node:created", (node) => {
      sceneValues.set(node.id, sceneNodePropertySnapshot(node));
      const penNode = sceneNodeToPenNode(node);
      if (!penNode) {
        callbacks.onUnsupportedEdit?.(`${node.type} creation is not available for lossless .pen editing.`);
        return;
      }
      const pageIds = new Set(editor.graph.getPages(true).map((page) => page.id));
      callbacks.onMutations?.([{
        kind: "insert-node",
        node: penNode,
        parentId: pageIds.has(node.parentId) ? null : node.parentId,
        position: node.index,
      }]);
    }),
    editor.onEditorEvent("node:deleted", (nodeId) => {
      sceneValues.delete(nodeId);
      callbacks.onMutations?.([{ kind: "delete-node", nodeId }]);
    }),
    editor.onEditorEvent("node:reparented", (nodeId, _oldParentId, newParentId) => {
      const pageIds = new Set(editor.graph.getPages(true).map((page) => page.id));
      callbacks.onMutations?.([{
        kind: "move-node",
        nodeId,
        parentId: pageIds.has(newParentId) ? null : newParentId,
        position: editor.graph.getNode(nodeId)?.index ?? Date.now(),
      }]);
    }),
    editor.onEditorEvent("node:reordered", (nodeId, parentId, index) => {
      const pageIds = new Set(editor.graph.getPages(true).map((page) => page.id));
      callbacks.onMutations?.([{
        kind: "move-node",
        nodeId,
        parentId: pageIds.has(parentId) ? null : parentId,
        position: index,
      }]);
    }),
  ];

  const Surface = {
    setup() {
      provideEditor(editor);
      const sceneCanvasRef = ref(null);
      const overlayCanvasRef = ref(null);
      const surfaceReady = ref(false);
      const onLayerReady = createLayeredSurfaceReadiness({
        layerCount: 2,
        finalizeLayout: () => {
          for (const page of editor.graph.getPages()) computeAllLayouts(editor.graph, page.id);
        },
        prepareViewport: () => {
          if (callbacks.viewport) return;
          if (callbacks.selectedId && editor.graph.getNode(callbacks.selectedId)) {
            editor.select([callbacks.selectedId]);
            editor.zoomToSelection();
          } else {
            fitDesignInView();
          }
        },
        requestRender: () => editor.requestRender(),
        scheduleReveal: (reveal) => requestAnimationFrame(reveal),
        reveal: () => {
          surfaceReady.value = true;
          callbacks.onReady?.();
        },
      });
      useCanvas(sceneCanvasRef, editor, {
        layer: "scene",
        showRulers: false,
        recomputeLayoutAfterFonts: false,
        onPerformance: (name, duration, details) => callbacks.onPerformance?.(
          name,
          duration,
          { ...details, layer: "scene" },
        ),
        onReady: onLayerReady,
      });
      const overlayCanvas = useCanvas(overlayCanvasRef, editor, {
        layer: "overlays",
        showRulers: true,
        recomputeLayoutAfterFonts: false,
        onPerformance: (name, duration, details) => callbacks.onPerformance?.(
          name,
          duration,
          { ...details, layer: "overlays" },
        ),
        onReady: onLayerReady,
      });
      useCanvasInput(
        overlayCanvasRef,
        editor,
        overlayCanvas.hitTestSectionTitle,
        overlayCanvas.hitTestComponentLabel,
        overlayCanvas.hitTestFrameTitle,
      );
      useTextEdit(overlayCanvasRef, editor);
      return () => h("div", {
        class: ["openpencil-surface-stack", { "is-ready": surfaceReady.value }],
      }, [
        h("canvas", {
          ref: sceneCanvasRef,
          class: "openpencil-surface openpencil-scene-surface",
          "aria-hidden": "true",
        }),
        h("canvas", {
          ref: overlayCanvasRef,
          class: "openpencil-surface openpencil-overlay-surface",
          tabindex: "0",
          "aria-label": "Canvas design viewport",
          onPointermove: updateShaderMouse,
        }),
      ]);
    },
  };

  const app = createApp(Surface);
  app.config.errorHandler = (error) => callbacks.onError?.(error);
  app.mount(element);
  if (callbacks.selectedId && editor.graph.getNode(callbacks.selectedId)) {
    editor.select([callbacks.selectedId]);
  }

  return {
    editor,
    fitDesignInView,
    replaceDocument(nextDocument, selectedId, preparedDocument = null) {
      refreshingDocument = true;
      try {
        sourceDocument = nextDocument;
        registerDocumentFonts(nextDocument, callbacks.assets);
        refreshOpenPencilEditor(
          editor,
          nextDocument,
          selectedId,
          callbacks.assets,
          preparedDocument,
        );
        sceneValues = captureSceneValues(editor);
        ensureTimeShaderAnimation();
      } finally {
        refreshingDocument = false;
      }
    },
    unmount() {
      if (shaderAnimationFrame) cancelAnimationFrame(shaderAnimationFrame);
      unbindCanvasTheme();
      for (const dispose of disposers) dispose?.();
      app.unmount();
    },
  };
}

function registerDocumentFonts(document, assets) {
  for (const font of collectPencilDocumentFonts(document, assets instanceof Map ? assets : new Map())) {
    fontManager.registerDocumentFont(font.family, font.bytes);
  }
}

function captureSceneValues(editor) {
  return new Map(
    [...editor.graph.nodes.values()].map((node) => [node.id, sceneNodePropertySnapshot(node)]),
  );
}
