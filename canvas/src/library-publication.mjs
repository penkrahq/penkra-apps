import { sha256 as hashSha256 } from "./sha256.mjs";
import { variableReferences } from "./variable-references.mjs";

export const LIBRARY_RELEASE_SCHEMA = "com.penkra.canvas.library-release/1";
export const PUBLIC_ITEM_KINDS = Object.freeze(["component", "paragraphStyle", "variable"]);

export function validateLibrarySurface(document) {
  const items = document.library?.public ?? [];
  if (!Array.isArray(items)) throw libraryError("library.public must be an array.");
  const nodes = indexNodes(document.children);
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    if (!plainObject(item) || !PUBLIC_ITEM_KINDS.includes(item.kind) || typeof item.id !== "string" || !item.id
      || Object.keys(item).some((key) => !["kind", "id"].includes(key))) {
      throw libraryError(`library.public[${index}] must identify one component, paragraphStyle, or variable.`);
    }
    const key = publicItemKey(item.kind, item.id);
    if (seen.has(key)) throw libraryError(`Public item ${key} is duplicated.`);
    seen.add(key);
    if (item.kind === "component" && !nodes.has(item.id)) throw libraryError(`Public component ${item.id} does not exist.`);
    if (item.kind === "paragraphStyle" && !Object.hasOwn(document.paragraphStyles ?? {}, item.id)) throw libraryError(`Public paragraph style ${item.id} does not exist.`);
    if (item.kind === "variable" && !Object.hasOwn(document.variables ?? {}, item.id)) throw libraryError(`Public variable ${item.id} does not exist.`);
  }
  return [...items].sort(comparePublicItems).map((item) => ({ ...item }));
}

export function createLibraryRelease(document, options) {
  const libraryId = releaseIdentifier(options?.libraryId, "libraryId");
  const releaseId = releaseIdentifier(options?.releaseId, "releaseId");
  const publicItems = validateLibrarySurface(document);
  const dependencies = normalizeDependencies(options?.dependencies ?? []);
  const assets = normalizeAssets(options?.assets ?? []);
  const content = {
    document: structuredClone(document),
    assets: structuredClone(assets),
    dependencies,
    publicItems,
  };
  const contentHash = sha256(canonicalJson(content));
  return {
    schema: LIBRARY_RELEASE_SCHEMA,
    libraryId,
    releaseId,
    contentHash,
    publicItems: publicItems.map((item) => ({
      ...item,
      contentHash: sha256(canonicalJson(publicItemClosure(document, item, dependencies, assets))),
    })),
    dependencies,
    document: content.document,
    assets: content.assets,
  };
}

export function validateLibraryRelease(release) {
  if (!plainObject(release) || release.schema !== LIBRARY_RELEASE_SCHEMA) throw libraryError("Library release has an unsupported schema.");
  releaseIdentifier(release.libraryId, "libraryId");
  releaseIdentifier(release.releaseId, "releaseId");
  if (!/^[a-f0-9]{64}$/u.test(release.contentHash ?? "")) throw libraryError("Library release has an invalid contentHash.");
  const rebuilt = createLibraryRelease(release.document, {
    libraryId: release.libraryId,
    releaseId: release.releaseId,
    dependencies: release.dependencies,
    assets: release.assets,
  });
  if (rebuilt.contentHash !== release.contentHash) throw libraryError(`Library release ${release.releaseId} content hash does not match its content.`);
  if (canonicalJson(rebuilt.publicItems) !== canonicalJson(release.publicItems)) throw libraryError(`Library release ${release.releaseId} public manifest does not match its document.`);
  return true;
}

export function assertPublicLibraryItem(release, kind, id) {
  validateLibraryRelease(release);
  if (!release.publicItems.some((item) => item.kind === kind && item.id === id)) {
    const error = libraryError(`${kind} ${id} is private or was removed from ${release.libraryId}@${release.releaseId}.`);
    error.code = "CANVAS_LIBRARY_ITEM_PRIVATE";
    throw error;
  }
  return publicItemValue(release.document, { kind, id });
}

// A retention adapter needs the accepted item's dependencies, not every private
// resource in the source document. This is preparation only: it grants no access
// and writes no durable state. Callers must authorize acceptance separately.
export function preparePublicLibraryItemContent(release, kind, id) {
  assertPublicLibraryItem(release, kind, id);
  const item = release.publicItems.find((entry) => entry.kind === kind && entry.id === id);
  return structuredClone({
    release: releaseIdentity(release),
    item,
    content: publicItemClosure(release.document, item, release.dependencies, release.assets),
  });
}

// Retained bundles contain only the accepted item's minimal closure, not a
// publishable release document. Validate its content hash without routing it
// through validateLibraryRelease, which intentionally requires the full
// release schema and source document.
export function validateRetainedLibraryItem(retained) {
  if (!plainObject(retained) || !plainObject(retained.release) || !plainObject(retained.item) || !plainObject(retained.content)) {
    throw retainedIntegrity("Retained library item is malformed.");
  }
  const { release, item, content } = retained;
  if (typeof release.libraryId !== "string" || !release.libraryId
    || typeof release.releaseId !== "string" || !release.releaseId
    || !/^[a-f0-9]{64}$/u.test(release.contentHash ?? "")
    || !PUBLIC_ITEM_KINDS.includes(item.kind) || typeof item.id !== "string" || !item.id
    || !/^[a-f0-9]{64}$/u.test(item.contentHash ?? "")) {
    throw retainedIntegrity("Retained library item identity is malformed.");
  }
  if (sha256(canonicalJson(content)) !== item.contentHash) {
    throw retainedIntegrity(`Retained ${item.kind}:${item.id} content hash does not match its content.`);
  }
  return true;
}

export function compareLibraryReleases(accepted, available) {
  validateLibraryRelease(accepted);
  validateLibraryRelease(available);
  if (accepted.libraryId !== available.libraryId) throw libraryError("Cannot compare releases from different libraries.");
  const before = new Map(accepted.publicItems.map((item) => [publicItemKey(item.kind, item.id), item]));
  const after = new Map(available.publicItems.map((item) => [publicItemKey(item.kind, item.id), item]));
  return {
    libraryId: accepted.libraryId,
    accepted: releaseIdentity(accepted),
    available: releaseIdentity(available),
    added: [...after.keys()].filter((key) => !before.has(key)).sort(),
    removed: [...before.keys()].filter((key) => !after.has(key)).sort(),
    changed: [...after.keys()].filter((key) => before.has(key) && before.get(key).contentHash !== after.get(key).contentHash).sort(),
  };
}

export function createLibraryRegistry(options = {}) {
  const releases = new Map();
  const canRead = options.canRead ?? (() => true);
  return {
    publish(release) {
      validateLibraryRelease(release);
      const list = releases.get(release.libraryId) ?? [];
      const existing = list.find((item) => item.releaseId === release.releaseId);
      if (existing && existing.contentHash !== release.contentHash) throw libraryError(`Release ${release.libraryId}@${release.releaseId} already identifies different content.`);
      if (!existing) list.push(structuredClone(release));
      releases.set(release.libraryId, list);
      return releaseIdentity(existing ?? release);
    },
    async resolve(record, context = {}) {
      const libraryId = releaseIdentifier(record?.documentId, "documentId");
      const list = releases.get(libraryId) ?? [];
      let release;
      if (record.updatePolicy === "follow") release = record.releaseId === undefined ? list.at(-1) : list.find((item) => item.releaseId === record.releaseId);
      else if (record.updatePolicy === "pinned") release = list.find((item) => item.releaseId === record.releaseId);
      else throw libraryError(`Import ${libraryId} has invalid updatePolicy ${String(record.updatePolicy)}.`);
      if (!release) {
        const error = libraryError(`No selected published release exists for ${libraryId}.`);
        error.code = "CANVAS_LIBRARY_RELEASE_MISSING";
        throw error;
      }
      if (!(await canRead({ libraryId, releaseId: release.releaseId, accountId: context.accountId }))) {
        const error = libraryError(`Account cannot read library ${libraryId}.`);
        error.code = "CANVAS_LIBRARY_ACCESS_DENIED";
        throw error;
      }
      if ((record.updatePolicy === "pinned" || record.releaseId !== undefined) && record.contentHash !== release.contentHash) {
        const error = libraryError(`Pinned release ${libraryId}@${record.releaseId} failed its content identity check.`);
        error.code = "CANVAS_LIBRARY_INTEGRITY";
        throw error;
      }
      return structuredClone(release);
    },
  };
}

export function releaseIdentity(release) {
  return { libraryId: release.libraryId, releaseId: release.releaseId, contentHash: release.contentHash };
}

export function publicItemKey(kind, id) { return `${kind}:${id}`; }

function publicItemValue(document, item) {
  if (item.kind === "variable") return document.variables[item.id];
  if (item.kind === "paragraphStyle") return document.paragraphStyles[item.id];
  return indexNodes(document.children).get(item.id);
}

function publicItemClosure(document, item, dependencies, assets) {
  const resources = new Map();
  const external = new Map();
  const usedAssets = new Map();
  const addReference = (kind, id) => {
    if (typeof id !== "string") return;
    const separator = id.indexOf(":");
    if (separator > 0) {
      const alias = id.slice(0, separator);
      const dependency = dependencies.find((entry) => entry.alias === alias);
      if (!dependency) throw libraryError(`Resource ${kind}:${id} has no published dependency identity.`);
      external.set(alias, dependency);
      return;
    }
    const key = publicItemKey(kind, id);
    if (resources.has(key)) return;
    const value = publicItemValue(document, { kind, id });
    if (value === undefined) throw libraryError(`Resource ${key} does not exist in its published dependency closure.`);
    resources.set(key, value);
    inspect(value);
  };
  const inspect = (value) => {
    if (typeof value === "string") {
      for (const match of variableReferences(value)) addReference("variable", match[1]);
    } else if (Array.isArray(value)) value.forEach(inspect);
    else if (plainObject(value)) {
      if (value.type === "ref") addReference("component", value.ref);
      if (typeof value.style === "string") addReference("paragraphStyle", value.style);
      if (value.type === "image" && typeof value.url === "string") {
        const asset = assets.find((entry) => entry.path === value.url);
        if (!asset) throw libraryError(`Published image ${value.url} has no owned asset descriptor; materialize its bytes before publication.`);
        usedAssets.set(asset.path, asset);
      }
      Object.values(value).forEach(inspect);
    }
  };
  addReference(item.kind, item.id);
  const sortedValues = (map) => [...map].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);
  // Axis definitions supply default mode selection and validate inherited modes.
  // They are shared resolution context, so an unchanged resource body can still
  // render differently when its owning document's axis definitions change.
  return { axes: structuredClone(document.axes ?? {}), resources: [...resources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), dependencies: sortedValues(external), assets: sortedValues(usedAssets) };
}

function normalizeDependencies(dependencies) {
  if (!Array.isArray(dependencies)) throw libraryError("Library release dependencies must be an array.");
  const seen = new Set();
  return dependencies.map((dependency) => {
    if (!plainObject(dependency) || typeof dependency.alias !== "string" || !/^[A-Za-z][\w-]*$/u.test(dependency.alias)
      || typeof dependency.libraryId !== "string" || !dependency.libraryId
      || typeof dependency.releaseId !== "string" || !dependency.releaseId
      || !/^[a-f0-9]{64}$/u.test(dependency.contentHash ?? "")) throw libraryError("Library release dependency is invalid.");
    if (seen.has(dependency.alias)) throw libraryError(`Library dependency alias ${dependency.alias} is duplicated.`);
    seen.add(dependency.alias);
    releaseIdentifier(dependency.libraryId, "dependency.libraryId");
    releaseIdentifier(dependency.releaseId, "dependency.releaseId");
    return { alias: dependency.alias, libraryId: dependency.libraryId, releaseId: dependency.releaseId, contentHash: dependency.contentHash };
  }).sort((left, right) => compareIdentifiers(left.alias, right.alias));
}

function normalizeAssets(assets) {
  if (!Array.isArray(assets)) throw libraryError("Library release assets must be an array.");
  const seen = new Set();
  return assets.map((asset) => {
    if (!plainObject(asset) || typeof asset.path !== "string" || !asset.path
      || !/^[a-f0-9]{64}$/u.test(asset.sha256 ?? "") || !Number.isSafeInteger(asset.size) || asset.size < 0) {
      throw libraryError("Library release asset metadata is invalid.");
    }
    if (asset.path !== asset.path.normalize("NFC") || /[\\:\u0000-\u001f\u007f]/u.test(asset.path)
      || asset.path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
      throw libraryError("Library release asset path must be a canonical relative path.");
    }
    if (seen.has(asset.path)) throw libraryError(`Library release asset path ${asset.path} is duplicated.`);
    seen.add(asset.path);
    if (asset.mimeType !== undefined && (typeof asset.mimeType !== "string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu.test(asset.mimeType))) {
      throw libraryError("Library release asset MIME type is invalid.");
    }
    return { path: asset.path, sha256: asset.sha256, size: asset.size, ...(asset.mimeType ? { mimeType: asset.mimeType } : {}) };
  }).sort((left, right) => compareIdentifiers(left.path, right.path));
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw libraryError("Library release content contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  throw libraryError("Library release content is not canonical JSON.");
}

function sha256(value) { return hashSha256(value); }
function compareIdentifiers(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function comparePublicItems(left, right) { return compareIdentifiers(left.kind, right.kind) || compareIdentifiers(left.id, right.id); }
function releaseIdentifier(value, name) { if (typeof value !== "string" || !value || /[\u0000-\u001f\u007f]/u.test(value)) throw libraryError(`${name} must be a non-empty identifier.`); return value; }
function indexNodes(children, map = new Map()) { for (const node of children ?? []) { map.set(node.id, node); indexNodes(node.children, map); } return map; }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function libraryError(message) { const error = new Error(message); error.code = "CANVAS_LIBRARY_INVALID"; return error; }
function retainedIntegrity(message) { const error = new Error(message); error.code = "CANVAS_IMPORT_INTEGRITY"; return error; }
