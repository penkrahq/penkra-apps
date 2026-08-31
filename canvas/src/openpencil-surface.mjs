import { createApp, h, ref, watch } from "vue";
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
  sceneNodeInsertionMutation,
  sceneNodePosition,
  sceneTextEditCommitMutations,
} from "./openpencil-engine.mjs";
import { bindCanvasThemeBackground } from "./canvas-theme.mjs";
import { preparePencilScriptRuntime } from "./pencil-script-runtime.mjs";
import { collectPencilDocumentFonts } from "./pencil-resources.mjs";
import { createLayeredSurfaceReadiness } from "./surface-readiness.mjs";
import { createTimeShaderAnimation } from "./time-shader-animation.mjs";

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
  let textEditSession = null;
  let historyMutations = null;
  const emitMutations = (mutations) => {
    if (!mutations.length) return;
    if (historyMutations) historyMutations.push(...mutations);
    else callbacks.onMutations?.(mutations);
  };
  if (callbacks.viewport) {
    editor.state.panX = callbacks.viewport.panX;
    editor.state.panY = callbacks.viewport.panY;
    editor.state.zoom = callbacks.viewport.zoom;
  }

  let refreshingDocument = false;
  let visible = callbacks.visible ?? true;
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
  const timeShaderAnimation = createTimeShaderAnimation({
    requestRepaint: () => editor.requestRepaint(),
  });
  const reconcileTimeShaderAnimation = () => {
    timeShaderAnimation.setActive(visible && hasTimeShader());
  };
  reconcileTimeShaderAnimation();
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
      reconcileTimeShaderAnimation();
      if (textEditSession?.nodeId === nodeId) return;
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
        { requireSelected: historyMutations === null },
      );
      emitMutations(mutations);
    }),
    editor.onEditorEvent("node:created", (node) => {
      sceneValues.set(node.id, sceneNodePropertySnapshot(node));
      reconcileTimeShaderAnimation();
      const insertion = historyMutations
        ? callbacks.restoreDeletedNode?.(node.id) ?? sceneNodeInsertionMutation(editor, node)
        : sceneNodeInsertionMutation(editor, node);
      if (!insertion) {
        callbacks.onUnsupportedEdit?.(`${node.type} creation is not available for lossless .pen editing.`);
        return;
      }
      emitMutations([insertion]);
    }),
    editor.onEditorEvent("node:deleted", (nodeId) => {
      sceneValues.delete(nodeId);
      emitMutations([{ kind: "delete-node", nodeId }]);
      reconcileTimeShaderAnimation();
    }),
    editor.onEditorEvent("node:reparented", (nodeId, _oldParentId, newParentId) => {
      const pageIds = new Set(editor.graph.getPages(true).map((page) => page.id));
      const node = editor.graph.getNode(nodeId);
      const position = node ? sceneNodePosition(editor, node) : null;
      if (position === null) {
        callbacks.onUnsupportedEdit?.(`${nodeId} has no authored sibling position after reparenting.`);
        return;
      }
      emitMutations([{
        kind: "move-node",
        nodeId,
        parentId: pageIds.has(newParentId) ? null : newParentId,
        position,
      }]);
    }),
    editor.onEditorEvent("node:reordered", (nodeId, parentId, index) => {
      const pageIds = new Set(editor.graph.getPages(true).map((page) => page.id));
      emitMutations([{
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
      watch(() => editor.state.editingTextId, (nodeId, previousNodeId) => {
        if (previousNodeId && textEditSession?.nodeId === previousNodeId) {
          const mutations = sceneTextEditCommitMutations(
            editor,
            sourceDocument,
            previousNodeId,
            textEditSession.before,
          );
          emitMutations(mutations);
          callbacks.onTextEditCommit?.(previousNodeId);
          textEditSession = null;
        }
        if (nodeId) {
          const node = editor.graph.getNode(nodeId);
          textEditSession = node ? {
            nodeId,
            before: sceneNodePropertySnapshot(node),
          } : null;
          callbacks.onTextEditStart?.(nodeId);
        }
      }, { flush: "sync" });
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
    undo() {
      return replayHistory(() => editor.undoAction());
    },
    redo() {
      return replayHistory(() => editor.redoAction());
    },
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
        reconcileTimeShaderAnimation();
      } finally {
        refreshingDocument = false;
      }
    },
    setVisible(nextVisible) {
      visible = nextVisible;
      reconcileTimeShaderAnimation();
    },
    unmount() {
      timeShaderAnimation.stop();
      unbindCanvasTheme();
      for (const dispose of disposers) dispose?.();
      app.unmount();
    },
  };

  function replayHistory(action) {
    if (historyMutations) return false;
    historyMutations = [];
    try {
      action();
      if (historyMutations.length) callbacks.onMutations?.(historyMutations);
      return historyMutations.length > 0;
    } finally {
      historyMutations = null;
    }
  }
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
