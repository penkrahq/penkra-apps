export function createRouteCoordinator({
  isDocumentOpen,
  openDocument,
  setRoute,
  showLibrary,
}) {
  let hostNavigationRequested = false;
  let transitions = Promise.resolve();

  const enqueue = (transition) => {
    const result = transitions.then(transition, transition);
    transitions = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const showDefaultLibrary = () => {
    if (hostNavigationRequested) return transitions;
    return enqueue(showLibrary);
  };

  const handleHostNavigation = (input) => {
    hostNavigationRequested = true;
    return enqueue(() =>
      input.route === "/document" && input.state?.documentId
        ? openDocument(input.state.documentId)
        : showLibrary(),
    );
  };

  const navigateToDocument = (documentId) =>
    enqueue(async () => {
      await openDocument(documentId);
      if (!isDocumentOpen(documentId)) return;
      await setRoute({ route: "/document", state: { documentId } });
    });

  const navigateToLibrary = () =>
    enqueue(async () => {
      await showLibrary();
      await setRoute({ route: "/" });
    });

  return {
    handleHostNavigation,
    navigateToDocument,
    navigateToLibrary,
    showDefaultLibrary,
  };
}
