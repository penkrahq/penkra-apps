import { buildRetainedCanvasImports } from "./library-retained-imports.mjs";
import { createLibraryStorage } from "./library-storage.mjs";
import { normalizeImportRecord } from "./canvas-imports.mjs";

const ALIAS_PATTERN = /^[A-Za-z][\w-]*$/u;

// Load only the accepted consumer-owned retention receipts. This is an
// integration seam for callers; it does not select releases or fall back to
// source publication reads.
export async function loadRetainedCanvasImports(api, consumerDocument, options = {}) {
  const document = snapshot(consumerDocument);
  const consumerId = options.documentId;
  if (typeof consumerId !== "string" || !consumerId || /[\u0000-\u001f\u007f]/u.test(consumerId)) throw integrity("Consumer documentId is required.");
  if (!plainObject(document) || !plainObject(document.imports)) throw integrity("Consumer document imports are malformed.");
  const aliases = Object.keys(document.imports);
  if (aliases.length === 0) return { imports: Object.create(null), assets: new Map(), releases: [] };
  for (const alias of aliases) if (!ALIAS_PATTERN.test(alias)) throw invalidImport(`Import alias ${alias} is invalid.`);

  const storage = createLibraryStorage(api);
  const retentions = new Map();
  for (const alias of aliases) {
    const normalized = normalizeImportRecord(document.imports[alias]);
    if (!normalized.retention) throw Object.assign(new Error(`Import ${alias} requires an accepted retention descriptor.`), { code: "CANVAS_IMPORT_RETENTION_REQUIRED" });
    if (!normalized.releaseId || !normalized.contentHash) throw integrity(`Import ${alias} has no accepted release identity.`);
    const retained = await storage.readRetention(consumerId, normalized.retention);
    retentions.set(alias, retained);
  }
  return buildRetainedCanvasImports(document, retentions);
}

function snapshot(value) {
  try { return structuredClone(value); } catch { throw integrity("Consumer document cannot be snapshotted."); }
}
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function integrity(message) { return Object.assign(new Error(message), { code: "CANVAS_IMPORT_INTEGRITY" }); }
function invalidImport(message) { return Object.assign(new Error(message), { code: "CANVAS_IMPORT_INVALID" }); }
