import { createApp, h, ref, watch } from "vue";
import {
  getCanvasKit,
  fontManager,
  provideEditor,
  useCanvas,
  useCanvasInput,
  useTextEdit,
} from "../vendor/open-pencil/engine.source.mjs";

import {
  createOpenPencilEditor,
  createOpenPencilInstanceHydrator,
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
import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";
import { bindCanvasThemeBackground } from "./canvas-theme.mjs";
import { preparePencilScriptRuntime } from "./pencil-script-runtime.mjs";
import { collectPencilDocumentFonts } from "./pencil-resources.mjs";
import { createLayeredSurfaceReadiness } from "./surface-readiness.mjs";
import { createTimeShaderAnimation } from "./time-shader-animation.mjs";
import { rasterizeSvgWithCanvasKit } from "./svg-rasterization.mjs";
import { createSurfaceMutationBoundary } from "./surface-mutation-boundary.mjs";

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

export async function rasterizeOpenPencilSvgAsset(bytes) {
  return rasterizeSvgWithCanvasKit(bytes, await prepareOpenPencilEngine());
}

export function mountOpenPencilSurface(element, document, callbacks = {}) {
  let sourceDocument = document;
  const initialPreparedDocument = callbacks.preparedDocument
    ?? prepareOpenPencilRenderDocument(document, { assets: callbacks.assets });
  let renderDocument = initialPreparedDocument.document;
  registerDocumentFonts(document, callbacks.assets);
  const editor = createOpenPencilEditor(document, {
    getViewportSize: () => ({ width: element.clientWidth, height: element.clientHeight }),
    assets: callbacks.assets,
    preparedDocument: initialPreparedDocument,
    deferExternalInstances: true,
  });
  const unbindCanvasTheme = bindCanvasThemeBackground(editor, element);
  let sceneValues = captureSceneValues(editor);
  const instanceHydrator = createOpenPencilInstanceHydrator({
    editor,
    document: renderDocument,
    getViewportSize: () => ({ width: element.clientWidth, height: element.clientHeight }),
    onHydrated: (instanceIds) => {
      sceneValues = captureSceneValues(editor);
      callbacks.onGraphHydrated?.(instanceIds);
    },
  });
  let textEditSession = null;
  const mutationBoundary = createSurfaceMutationBoundary(callbacks.onMutations);
  const emitMutations = mutationBoundary.emit;
  if (callbacks.viewport) {
    editor.state.panX = callbacks.viewport.panX;
    editor.state.panY = callbacks.viewport.panY;
    editor.state.zoom = callbacks.viewport.zoom;
  }

  let refreshingDocument = false;
  let visible = callbacks.visible ?? true;
  let hydrationFrame = null;
  const hydrateVisibleInstances = () => {
    hydrationFrame = null;
    if (visible) mutationBoundary.runRendererSync(() => instanceHydrator.hydrateVisible());
  };
  const scheduleVisibleInstanceHydration = () => {
    if (!visible || hydrationFrame !== null) return;
    hydrationFrame = requestAnimationFrame(hydrateVisibleInstances);
  };
  let sceneCanvasElement = null;
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
      if (!refreshingDocument && !mutationBoundary.isRendererSyncing()) callbacks.onSelection?.(selectedIds);
    }),
    editor.onEditorEvent("viewport:changed", (viewport) => {
      callbacks.onViewport?.(viewport);
      scheduleVisibleInstanceHydration();
    }),
    editor.onEditorEvent("tool:changed", (tool) => callbacks.onTool?.(tool)),
    editor.onEditorEvent("node:updated", (nodeId, changes) => {
      const previous = sceneValues.get(nodeId);
      sceneValues.set(nodeId, { ...previous, ...changes });
      reconcileTimeShaderAnimation();
      if (mutationBoundary.isRendererSyncing()) return;
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
        { requireSelected: !mutationBoundary.isReplayingHistory() },
      );
      emitMutations(mutations);
    }),
    editor.onEditorEvent("node:created", (node) => {
      sceneValues.set(node.id, sceneNodePropertySnapshot(node));
      reconcileTimeShaderAnimation();
      if (mutationBoundary.isRendererSyncing()) return;
      const insertion = mutationBoundary.isReplayingHistory()
        ? callbacks.restoreDeletedNode?.(node.id) ?? sceneNodeInsertionMutation(editor, node)
        : sceneNodeInsertionMutation(editor, node);
      if (!insertion) {
        callbacks.onUnsupportedEdit?.(`${node.type} creation is not currently available in Canvas.`);
        return;
      }
      emitMutations([insertion]);
    }),
    editor.onEditorEvent("node:deleted", (nodeId) => {
      sceneValues.delete(nodeId);
      if (mutationBoundary.isRendererSyncing()) return;
      emitMutations([{ kind: "delete-node", nodeId }]);
      reconcileTimeShaderAnimation();
    }),
    editor.onEditorEvent("node:reparented", (nodeId, _oldParentId, newParentId) => {
      if (mutationBoundary.isRendererSyncing()) return;
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
      if (mutationBoundary.isRendererSyncing()) return;
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
      watch(sceneCanvasRef, (canvas) => { sceneCanvasElement = canvas; }, { flush: "sync" });
      const surfaceReady = ref(false);
      const onLayerReady = createLayeredSurfaceReadiness({
        layerCount: 2,
        prepareViewport: () => {
          if (callbacks.selectedId) mutationBoundary.runRendererSync(
            () => instanceHydrator.hydrateForNode(callbacks.selectedId),
          );
          if (callbacks.viewport) {
            hydrateVisibleInstances();
            return;
          }
          if (callbacks.selectedId && editor.graph.getNode(callbacks.selectedId)) {
            editor.select([callbacks.selectedId]);
            editor.zoomToSelection();
          } else {
            fitDesignInView();
          }
          hydrateVisibleInstances();
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
        recomputeLayoutAfterFonts: callbacks.recomputeLayoutAfterFonts ?? true,
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
  if (callbacks.selectedId) mutationBoundary.runRendererSync(
    () => instanceHydrator.hydrateForNode(callbacks.selectedId),
  );
  if (callbacks.selectedId && editor.graph.getNode(callbacks.selectedId)) {
    editor.select([callbacks.selectedId]);
  }

  return {
    editor,
    fitDesignInView,
    undo() {
      return mutationBoundary.replayHistory(() => editor.undoAction());
    },
    redo() {
      return mutationBoundary.replayHistory(() => editor.redoAction());
    },
    replaceDocument(nextDocument, selectedId, preparedDocument = null) {
      refreshingDocument = true;
      try {
        mutationBoundary.runRendererSync(() => {
          sourceDocument = nextDocument;
          registerDocumentFonts(nextDocument, callbacks.assets);
          const nextPreparedDocument = preparedDocument
            ?? prepareOpenPencilRenderDocument(nextDocument, { assets: callbacks.assets });
          const nextRenderDocument = nextPreparedDocument.document;
          if (selectedId) instanceHydrator.hydrateForNode(selectedId);
          const preservedInstanceIds = instanceHydrator.hydratedInstanceIds();
          refreshOpenPencilEditor(
            editor,
            nextDocument,
            selectedId,
            callbacks.assets,
            nextPreparedDocument,
            {
              deferExternalInstances: true,
              hydrateInstanceIds: [...preservedInstanceIds],
            },
          );
          renderDocument = nextRenderDocument;
          instanceHydrator.replaceDocument(renderDocument, [...preservedInstanceIds]);
          if (selectedId) instanceHydrator.hydrateForNode(selectedId);
          instanceHydrator.hydrateVisible();
          sceneValues = captureSceneValues(editor);
          reconcileTimeShaderAnimation();
        });
      } finally {
        refreshingDocument = false;
      }
    },
    setVisible(nextVisible) {
      visible = nextVisible;
      reconcileTimeShaderAnimation();
      if (visible) scheduleVisibleInstanceHydration();
    },
    ensureInstanceDetail(nodeId) {
      return mutationBoundary.runRendererSync(() => instanceHydrator.hydrateForNode(nodeId));
    },
    hasDeferredInstanceDetail(nodeId) {
      return instanceHydrator.hasDeferredDetail(nodeId);
    },
    capturePreview(maxDimension = 640) {
      if (!sceneCanvasElement?.width || !sceneCanvasElement?.height) return null;
      const scale = Math.min(1, maxDimension / Math.max(sceneCanvasElement.width, sceneCanvasElement.height));
      const preview = globalThis.document.createElement("canvas");
      preview.width = Math.max(1, Math.round(sceneCanvasElement.width * scale));
      preview.height = Math.max(1, Math.round(sceneCanvasElement.height * scale));
      preview.getContext("2d")?.drawImage(sceneCanvasElement, 0, 0, preview.width, preview.height);
      return preview.toDataURL("image/png").split(",", 2)[1] ?? null;
    },
    unmount() {
      if (hydrationFrame !== null) cancelAnimationFrame(hydrationFrame);
      timeShaderAnimation.stop();
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
