export function createDocumentCollectionLifecycle({ subscribe }) {
  let current = null;

  async function start({ load, apply, onError = () => undefined }) {
    stop();
    const session = {
      active: true,
      unsubscribe: null,
      running: null,
      queued: false,
      load,
      apply,
      onError,
    };
    current = session;
    try {
      const unsubscribe = await subscribe((event) => {
        if (event?.event === "projects:changed") void requestRefresh(session);
      });
      if (!session.active) {
        unsubscribe?.();
        return;
      }
      session.unsubscribe = unsubscribe;
    } catch (error) {
      if (session.active) onError(error, { phase: "subscribe" });
    }
    if (session.active) await requestRefresh(session);
  }

  function stop() {
    if (!current) return;
    current.active = false;
    current.unsubscribe?.();
    current = null;
  }

  function refresh() {
    return current ? requestRefresh(current) : Promise.resolve();
  }

  function requestRefresh(session) {
    if (!session.active) return Promise.resolve();
    if (session.running) {
      session.queued = true;
      return session.running;
    }
    session.running = (async () => {
      do {
        session.queued = false;
        try {
          const value = await session.load();
          if (!session.active) return;
          if (session.queued) continue;
          session.apply(value);
        } catch (error) {
          if (session.active) session.onError(error, { phase: "load" });
        }
      } while (session.active && session.queued);
    })().finally(() => {
      session.running = null;
    });
    return session.running;
  }

  return { start, stop, refresh };
}
