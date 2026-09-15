export function createLayeredSurfaceReadiness({
  layerCount,
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
    prepareViewport();
    requestRender();
    scheduleReveal(reveal);
  };
}
