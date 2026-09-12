import { sha256 } from "./sha256.mjs";
import { preparePublicLibraryItemContent, releaseIdentity, validateLibraryRelease, validateRetainedLibraryItem } from "./library-publication.mjs";
import { variableReferences } from "./variable-references.mjs";

// Preparation only. The caller must authorize the root acceptance, and the
// supplied readers must authorize dependency/asset reads. No durable write or
// access grant occurs here. Only required public items and their private local
// closure are copied; whole source documents never enter the returned bundle.
export async function prepareLibraryRetention(rootRelease, requestedItems, readers = {}) {
  const root = structuredClone(rootRelease);
  validateLibraryRelease(root);
  if (!Array.isArray(requestedItems) || !requestedItems.length) throw invalid();
  const requests = structuredClone(requestedItems);
  const items = new Map();
  const assets = new Map();
  const releases = new Map([[identityKey(root), root]]);
  const selectedIdentities = new Map([[JSON.stringify([root.libraryId, root.releaseId]), root.contentHash]]);
  const active = new Set();

  async function visit(release, kind, id, retained = false) {
    const key = JSON.stringify([identityKey(release), kind, id]);
    if (active.has(key)) throw invalid("CANVAS_IMPORT_CYCLE");
    if (items.has(key)) return;
    // A publication may carry authenticated accepted items rather than upstream
    // source documents. The reader must select from that accepted public surface;
    // a missing item never falls back to a live source.
    const prepared = retained
      ? structuredClone(await readers.readRetainedItem(releaseIdentity(release), kind, id))
      : preparePublicLibraryItemContent(release, kind, id);
    if (retained) {
      validateRetainedLibraryItem(prepared);
      if (identityKey(prepared.release) !== identityKey(release)
        || prepared.item.kind !== kind || prepared.item.id !== id) throw invalid("CANVAS_IMPORT_INTEGRITY");
    }
    active.add(key);
    for (const reference of externalReferences(prepared.content.resources)) {
      const dependency = prepared.content.dependencies.find(({ alias }) => alias === reference.alias);
      if (!dependency) throw invalid("CANVAS_IMPORT_DEPENDENCY_MISMATCH");
      const dependencyKey = identityKey(dependency);
      const publicationKey = JSON.stringify([dependency.libraryId, dependency.releaseId]);
      const acceptedHash = selectedIdentities.get(publicationKey);
      if (acceptedHash !== undefined && acceptedHash !== dependency.contentHash) {
        throw invalid("CANVAS_IMPORT_CACHE_INCONSISTENT");
      }
      selectedIdentities.set(publicationKey, dependency.contentHash);
      let selected = releases.get(dependencyKey);
      if (!selected && typeof readers.readRetainedItem === "function") {
        await visit(dependency, reference.kind, reference.id, true);
        continue;
      }
      if (!selected) {
        if (typeof readers.resolveRelease !== "function") throw invalid("CANVAS_IMPORT_RELEASE_RESOLVER_REQUIRED");
        selected = structuredClone(await readers.resolveRelease({
          documentId: dependency.libraryId, updatePolicy: "pinned",
          releaseId: dependency.releaseId, contentHash: dependency.contentHash,
        }));
        validateLibraryRelease(selected);
        if (identityKey(selected) !== dependencyKey) throw invalid("CANVAS_IMPORT_INTEGRITY");
        releases.set(dependencyKey, selected);
      }
      await visit(selected, reference.kind, reference.id);
    }
    for (const descriptor of prepared.content.assets) {
      const assetKey = JSON.stringify([identityKey(release), descriptor.path]);
      if (assets.has(assetKey)) continue;
      if (typeof readers.readAsset !== "function") throw invalid("CANVAS_IMPORT_ASSET_READER_REQUIRED");
      const result = await readers.readAsset(releaseIdentity(release), structuredClone(descriptor));
      if (!(result instanceof Uint8Array)) throw invalid("CANVAS_IMPORT_INTEGRITY");
      const bytes = new Uint8Array(result);
      if (bytes.length !== descriptor.size || sha256(bytes) !== descriptor.sha256) {
        throw invalid("CANVAS_IMPORT_INTEGRITY");
      }
      assets.set(assetKey, { release: releaseIdentity(release), ...structuredClone(descriptor), bytes });
    }
    items.set(key, prepared);
    active.delete(key);
  }

  for (const request of requests) {
    if (!request || typeof request !== "object" || Object.keys(request).some((key) => !["kind", "id"].includes(key))) throw invalid();
    await visit(root, request.kind, request.id);
  }
  const ordered = (map) => [...map].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);
  return { root: releaseIdentity(root), requestedItems: requests, items: ordered(items), assets: ordered(assets) };
}

function identityKey(release) { return JSON.stringify([release.libraryId, release.releaseId, release.contentHash]); }
function invalid(code = "CANVAS_LIBRARY_INVALID") { return Object.assign(new Error("Library retention preparation failed."), { code }); }

function externalReferences(resources) {
  const found = new Map();
  function add(kind, value) {
    if (typeof value !== "string") return;
    const separator = value.indexOf(":");
    if (separator <= 0) return;
    const reference = { alias: value.slice(0, separator), kind, id: value.slice(separator + 1) };
    found.set(JSON.stringify(reference), reference);
  }
  function inspect(value) {
    if (typeof value === "string") for (const match of variableReferences(value)) add("variable", match[1]);
    else if (Array.isArray(value)) value.forEach(inspect);
    else if (value && typeof value === "object") {
      if (value.type === "ref") add("component", value.ref);
      add("paragraphStyle", value.style);
      Object.values(value).forEach(inspect);
    }
  }
  for (const [, value] of resources) inspect(value);
  return [...found.values()];
}
