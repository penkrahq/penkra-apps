export function createPerformanceMonitor({
  scope = "canvas",
  slowThresholdMs = 50,
  maxEntries = 200,
  logger = console,
  target = globalThis,
} = {}) {
  const entries = [];

  const record = (name, durationMs, detail = {}) => {
    const entry = {
      name,
      durationMs: Number(durationMs.toFixed(1)),
      at: new Date().toISOString(),
      ...detail,
    };
    entries.push(entry);
    if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
    if (durationMs >= slowThresholdMs) {
      logger.warn?.(`[${scope}:performance] ${JSON.stringify(entry)}`);
    }
    return entry;
  };

  const measure = (name, operation, detail = {}) => {
    const start = performance.now();
    try {
      return operation();
    } finally {
      record(name, performance.now() - start, detail);
    }
  };

  const snapshot = () => entries.map((entry) => ({ ...entry }));
  const publicMonitor = { entries, measure, record, snapshot };
  target.__penkraPerformance ??= {};
  target.__penkraPerformance[scope] = publicMonitor;

  if (typeof PerformanceObserver === "function") {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          record("renderer.long-task", entry.duration, { startTime: Number(entry.startTime.toFixed(1)) });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      publicMonitor.disconnect = () => observer.disconnect();
    } catch {
      // Long Task timing is not exposed by every embedded browser version.
    }
  }

  return publicMonitor;
}
