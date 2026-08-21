import { createApp, h, ref } from "vue";
import {
  getCanvasKit,
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

let canvasKitReady;
export function prepareOpenPencilEngine() {
  canvasKitReady ??= getCanvasKit({
    locateFile: (file) => new URL(file, import.meta.url).href,
  });
  return canvasKitReady;
}

export function mountOpenPencilSurface(element, document, callbacks = {}) {
  let sourceDocument = document;
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
      let readyLayers = 0;
      const onLayerReady = () => {
        readyLayers += 1;
        if (readyLayers < 2) return;
        if (!callbacks.viewport) {
          if (callbacks.selectedId && editor.graph.getNode(callbacks.selectedId)) {
            editor.select([callbacks.selectedId]);
            editor.zoomToSelection();
          } else {
            fitDesignInView();
          }
        }
        callbacks.onReady?.();
      };
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
        // Layout once while preparing the graph. Re-running Yoga for every
        // expanded instance after fonts load blocks the main thread for large
        // files and diverges from OpenPencil's own lifecycle.
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
      return () => h("div", { class: "openpencil-surface-stack" }, [
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
        refreshOpenPencilEditor(
          editor,
          nextDocument,
          selectedId,
          callbacks.assets,
          preparedDocument,
        );
        sceneValues = captureSceneValues(editor);
      } finally {
        refreshingDocument = false;
      }
    },
    unmount() {
      unbindCanvasTheme();
      for (const dispose of disposers) dispose?.();
      app.unmount();
    },
  };
}

function captureSceneValues(editor) {
  return new Map(
    [...editor.graph.nodes.values()].map((node) => [node.id, sceneNodePropertySnapshot(node)]),
  );
}
