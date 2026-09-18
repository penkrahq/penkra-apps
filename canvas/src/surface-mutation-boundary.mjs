export function createSurfaceMutationBoundary(onMutations) {
  let rendererSyncDepth = 0;
  let historyMutations = null;

  const runRendererSync = (action) => {
    rendererSyncDepth += 1;
    try {
      return action();
    } finally {
      rendererSyncDepth -= 1;
    }
  };

  const emit = (mutations) => {
    if (rendererSyncDepth > 0 || !mutations.length) return;
    if (historyMutations) historyMutations.push(...mutations);
    else onMutations?.(mutations);
  };

  const replayHistory = (action) => {
    if (historyMutations) return false;
    historyMutations = [];
    try {
      action();
      if (historyMutations.length) onMutations?.(historyMutations);
      return historyMutations.length > 0;
    } finally {
      historyMutations = null;
    }
  };

  return {
    emit,
    replayHistory,
    runRendererSync,
    isReplayingHistory: () => historyMutations !== null,
    isRendererSyncing: () => rendererSyncDepth > 0,
  };
}
