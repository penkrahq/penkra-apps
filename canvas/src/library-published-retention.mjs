import { createHash } from "node:crypto";
import { validateLibraryRelease, releaseIdentity } from "./library-publication.mjs";
import { buildRetainedCanvasImports } from "./library-retained-imports.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";

// Pure preparation after the caller has authorized and authenticated the
// publishing library. Upstream accepted content is carried by that publication;
// this function never contacts upstream sources and never grants access.
export async function preparePublishedLibraryRetention(published, requestedItems) {
  const owned = structuredClone(published);
  const requested = structuredClone(requestedItems);
  validateLibraryRelease(owned.release);
  if (!(owned.assets instanceof Map)) throw integrity();
  const imports = owned.release.document.imports ?? {};
  const transports = owned.retentions ?? [];
  if (!Array.isArray(transports)) throw integrity();
  const byAlias = new Map();
  for (const entry of transports) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).some((key) => !["alias", "retention"].includes(key))
      || typeof entry.alias !== "string" || byAlias.has(entry.alias)) throw integrity();
    byAlias.set(entry.alias, entry.retention);
  }
  buildRetainedCanvasImports({ ...owned.release.document, imports }, byAlias);
  const items = new Map();
  const assets = new Map();
  const addAsset = (identity, descriptor, bytes) => {
    if (!(bytes instanceof Uint8Array) || bytes.length !== descriptor.size
      || createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256) throw integrity();
    const key = assetKey(identity, descriptor.path);
    const prior = assets.get(key);
    if (prior && (prior.sha256 !== descriptor.sha256 || prior.size !== descriptor.size)) throw integrity();
    assets.set(key, { ...descriptor, bytes: new Uint8Array(bytes) });
  };
  for (const descriptor of owned.release.assets) {
    addAsset(owned.release, descriptor, owned.assets.get(descriptor.path));
  }
  for (const { retention } of transports) {
    for (const retained of retention.items) {
      const key = itemKey(retained.release, retained.item.kind, retained.item.id);
      const prior = items.get(key);
      if (prior && prior.item.contentHash !== retained.item.contentHash) throw integrity();
      items.set(key, retained);
    }
    for (const asset of retention.assets) addAsset(asset.release, asset, asset.bytes);
  }
  return prepareLibraryRetention(owned.release, requested, {
    readRetainedItem(identity, kind, id) {
      const item = items.get(itemKey(identity, kind, id));
      if (!item) throw integrity();
      return structuredClone(item);
    },
    readAsset(identity, descriptor) {
      const asset = assets.get(assetKey(identity, descriptor.path));
      if (!asset || asset.sha256 !== descriptor.sha256 || asset.size !== descriptor.size) throw integrity();
      return new Uint8Array(asset.bytes);
    },
  });
}

function identityKey(identity) { const { libraryId, releaseId, contentHash } = releaseIdentity(identity); return [libraryId, releaseId, contentHash]; }
function assetKey(identity, path) { return JSON.stringify([...identityKey(identity), path]); }
function itemKey(identity, kind, id) { return JSON.stringify([...identityKey(identity), kind, id]); }
function integrity() { return Object.assign(new Error("Published library retention is inconsistent."), { code: "CANVAS_IMPORT_INTEGRITY" }); }
