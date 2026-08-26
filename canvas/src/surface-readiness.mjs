export function createLayeredSurfaceReadiness({
  layerCount,
  finalizeLayout,
  prepareViewport,
  requestRender,
  scheduleReveal,
  reveal,
}) {
  let readyLayers = 0;
  let finalized = false;

  return () => {
    if (finalized) return;
    readyLayers += 1;
    if (readyLayers < layerCount) return;
    finalized = true;
    finalizeLayout();
    prepareViewport();
    requestRender();
    scheduleReveal(reveal);
  };
}
