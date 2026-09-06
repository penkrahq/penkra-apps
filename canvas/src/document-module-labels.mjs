import { restoreDocumentModel } from "./document-model.mjs";

export function createDocumentModuleLabels(loadDocument) {
  const cache = new Map();
  let generation = 0;
  return {
    cancel() { generation++; },
    async load(documents, apply) {
      const current = ++generation;
      const queue = [...documents];
      async function worker() {
        while (queue.length && current === generation) {
          const document = queue.shift();
          const key = JSON.stringify([document.id, document.updatedAt]);
          let module = cache.get(key);
          try {
            if (!cache.has(key)) {
              const payload = await loadDocument(document.id);
              const model = restoreDocumentModel(payload);
              try { module = model.documentFields.get("module") ?? null; }
              finally { model.doc.destroy(); }
              cache.set(key, module);
            }
            if (current === generation) apply(document.id, module);
          } catch {
            // A failed metadata read must not prevent opening other documents.
            if (current === generation) apply(document.id, undefined);
          }
        }
      }
      await Promise.all([worker(), worker()]);
    },
  };
}
