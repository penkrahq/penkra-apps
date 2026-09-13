export function createRouteCoordinator({
  isDocumentOpen,
  openDocument,
  setRoute,
  showDocumentUnavailable,
  showLibrary,
  showFolder,
  showTrash,
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
    return enqueue(() => {
      if (input.route === "/document" && input.state?.documentId) {
        return openDocument(input.state.documentId);
      }
      if (input.route === "/document-unavailable" && input.state?.documentId) {
        return showDocumentUnavailable(input.state);
      }
      if (input.route === "/folder" && input.state?.folderId) return showFolder(input.state.folderId);
      if (input.route === "/trash") return showTrash();
      return showLibrary();
    });
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

  const navigateToFolder = (folderId) =>
    enqueue(async () => {
      await showFolder(folderId);
      await setRoute({ route: "/folder", state: { folderId } });
    });

  const navigateToTrash = () =>
    enqueue(async () => {
      await showTrash();
      await setRoute({ route: "/trash" });
    });

  const navigateToDocumentUnavailable = (input) =>
    enqueue(async () => {
      await showDocumentUnavailable(input);
      await setRoute({ route: "/document-unavailable", state: input });
    });

  return {
    handleHostNavigation,
    navigateToDocument,
    navigateToDocumentUnavailable,
    navigateToLibrary,
    navigateToFolder,
    navigateToTrash,
    showDefaultLibrary,
  };
}
