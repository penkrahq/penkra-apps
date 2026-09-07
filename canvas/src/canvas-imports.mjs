import { createHash } from "node:crypto";
import { validateLibraryStorageDescriptor } from "./canvas-schema.mjs";
import { assertPublicLibraryItem, PUBLIC_ITEM_KINDS, releaseIdentity, validateLibraryRelease } from "./library-publication.mjs";
import { variableReferences } from "./variable-references.mjs";

export async function loadCanvasImports(api, document, options = {}) {
  const assets = new Map();
  const selected = new Map();
  const releaseCache = new Map();
  const resolveRelease = options.resolveRelease ?? api.resolveLibraryRelease?.bind(api);
  if (!resolveRelease && Object.keys(document.imports ?? {}).length > 0) {
    throw importError("Published Canvas imports require a release resolver; mutable document heads are not library releases.", "CANVAS_IMPORT_RELEASE_RESOLVER_REQUIRED");
  }

  const select = async (record) => {
    const normalized = normalizeImportRecord(record);
    const key = JSON.stringify(normalized);
    if (!releaseCache.has(key)) releaseCache.set(key, Promise.resolve(resolveRelease(normalized, { accountId: options.accountId })));
    const release = await releaseCache.get(key);
    validateLibraryRelease(release);
    if (release.libraryId !== normalized.documentId) throw importError(`Import expected library ${normalized.documentId}, but selected ${release.libraryId}.`);
    if (normalized.releaseId !== undefined
      && (release.releaseId !== normalized.releaseId || release.contentHash !== normalized.contentHash)) {
      throw importError(`Pinned import ${normalized.documentId}@${normalized.releaseId} did not resolve to its exact published content.`, "CANVAS_IMPORT_INTEGRITY");
    }
    const identityKey = JSON.stringify([release.libraryId, release.releaseId]);
    const prior = selected.get(identityKey);
    if (prior && prior.contentHash !== release.contentHash) throw importError(`Library release ${identityKey} resolved with inconsistent content.`, "CANVAS_IMPORT_CACHE_INCONSISTENT");
    selected.set(identityKey, releaseIdentity(release));
    return release;
  };

  const load = async (owner, trail, prefix) => {
    const imports = Object.create(null);
    for (const [alias, record] of Object.entries(owner.imports ?? {})) {
      if (!/^[A-Za-z][\w-]*$/u.test(alias)) throw importError(`Import alias ${alias} is invalid.`);
      const release = await select(record);
      if (trail.includes(release.libraryId)) throw importError(`Import cycle: ${[...trail, release.libraryId].join(" -> ")}.`);
      const ownedPrefix = [prefix, "imports", alias].filter(Boolean).join("/");
      for (const asset of release.assets ?? []) {
        const key = `${ownedPrefix}/${asset.path}`;
        const bytes = await readReleaseAsset(api, options, release, asset);
        assets.set(key, { ...asset, path: key, bytes });
      }
      const nested = await load(release.document, [...trail, release.libraryId], ownedPrefix);
      verifyDependencyClosure(release, nested);
      imports[alias] = { document: release.document, imports: nested, release, identity: releaseIdentity(release) };
    }
    validateCrossDocumentReferences(owner, imports);
    return imports;
  };
  const imports = await load(document, options.rootDocumentId ? [options.rootDocumentId] : [], "");
  return { imports, assets, releases: [...selected.values()].sort(compareIdentity) };
}

export function normalizeImportRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)
    || typeof record.documentId !== "string" || !record.documentId || /[\u0000-\u001f\u007f]/u.test(record.documentId)) {
    throw importError("Import must have a non-empty documentId string.");
  }
  if (record.pin !== undefined || record.version !== undefined) {
    throw importError(`Import ${record.documentId} uses a legacy CRDT-sequence pin; migrate it to a published release identity.`, "CANVAS_IMPORT_LEGACY_PIN");
  }
  if (Object.keys(record).some((key) => !["documentId", "updatePolicy", "releaseId", "contentHash", "retention"].includes(key))) throw importError(`Import ${record.documentId} contains unsupported fields.`);
  let retention;
  if (record.retention !== undefined) {
    try { retention = validateLibraryStorageDescriptor(record.retention); }
    catch (cause) { throw importError(`Import ${record.documentId} has an invalid retention descriptor.`, cause.code); }
  }
  if (record.releaseId !== undefined && (typeof record.releaseId !== "string" || !record.releaseId || /[\u0000-\u001f\u007f]/u.test(record.releaseId))) throw importError(`Import ${record.documentId} has an invalid releaseId.`);
  if (record.updatePolicy === "follow") {
    if (record.releaseId !== undefined || record.contentHash !== undefined) {
      if (typeof record.releaseId !== "string" || !record.releaseId || !/^[a-f0-9]{64}$/u.test(record.contentHash ?? "")) throw importError(`Following import ${record.documentId} needs both accepted releaseId and contentHash.`);
      return { documentId: record.documentId, updatePolicy: "follow", releaseId: record.releaseId, contentHash: record.contentHash, ...(retention ? { retention } : {}) };
    }
    return { documentId: record.documentId, updatePolicy: "follow", ...(retention ? { retention } : {}) };
  }
  if (record.updatePolicy === "pinned" && typeof record.releaseId === "string" && record.releaseId
    && /^[a-f0-9]{64}$/u.test(record.contentHash ?? "")) {
    return { documentId: record.documentId, updatePolicy: "pinned", releaseId: record.releaseId, contentHash: record.contentHash, ...(retention ? { retention } : {}) };
  }
  throw importError(`Import ${record.documentId} must follow publications or pin an exact releaseId and contentHash.`);
}

export function validateCrossDocumentReferences(document, imports) {
  const inspectValue = (value, path) => {
    if (typeof value === "string") {
      for (const match of variableReferences(value)) {
        const qualified = importedReference(match[1]);
        if (qualified) requirePublic(imports, qualified.alias, "variable", qualified.id, `${path} variable`);
      }
      return;
    }
    if (Array.isArray(value)) value.forEach((item, index) => inspectValue(item, `${path}[${index}]`));
    else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) inspectValue(item, `${path}.${key}`);
  };
  const visit = (node) => {
    if (node.type === "ref" && typeof node.ref === "string") {
      const qualified = importedReference(node.ref);
      if (qualified) requirePublic(imports, qualified.alias, "component", qualified.id, `${node.id}.ref`);
    }
    if (typeof node.style === "string") {
      const qualified = importedReference(node.style);
      if (qualified) requirePublic(imports, qualified.alias, "paragraphStyle", qualified.id, `${node.id}.style`);
    }
    for (const [index, paragraph] of (node.paragraphs ?? []).entries()) {
      const qualified = importedReference(paragraph.style);
      if (qualified) requirePublic(imports, qualified.alias, "paragraphStyle", qualified.id, `${node.id}.paragraphs[${index}].style`);
    }
    inspectValue(node, node.id);
    for (const child of node.children ?? []) visit(child);
  };
  inspectValue(document.variables ?? {}, "variables");
  inspectValue(document.paragraphStyles ?? {}, "paragraphStyles");
  for (const node of document.children ?? []) visit(node);
  return true;
}

function requirePublic(imports, alias, kind, id, path) {
  const imported = imports[alias];
  if (!imported) throw importError(`${path} uses missing import ${alias}.`);
  try {
    if (imported.retained === true) assertRetainedPublicItem(imported.release, kind, id);
    else assertPublicLibraryItem(imported.release, kind, id);
  }
  catch (cause) { throw importError(`${path} cannot use ${alias}:${id}: ${cause.message}`, cause.code); }
}

function assertRetainedPublicItem(release, kind, id) {
  if (!release || !Array.isArray(release.publicItems)
    || release.publicItems.some((item) => !item || typeof item !== "object" || Array.isArray(item)
      || !PUBLIC_ITEM_KINDS.includes(item.kind) || typeof item.id !== "string" || !item.id
      || (item.contentHash !== undefined && !/^[a-f0-9]{64}$/u.test(item.contentHash))
      || Object.keys(item).some((key) => !["kind", "id", "contentHash"].includes(key)))) {
    throw importError("Retained import has an invalid public item manifest.", "CANVAS_IMPORT_INTEGRITY");
  }
  const seen = new Set();
  for (const item of release.publicItems) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) throw importError("Retained import has a duplicate public item.", "CANVAS_IMPORT_INTEGRITY");
    seen.add(key);
  }
  if (!release.publicItems.some((item) => item.kind === kind && item.id === id)) {
    const error = new Error(`${kind} ${id} is private or was removed from ${release.libraryId}@${release.releaseId}.`);
    error.code = "CANVAS_LIBRARY_ITEM_PRIVATE";
    throw error;
  }
}

function verifyDependencyClosure(release, imports) {
  const expected = new Map((release.dependencies ?? []).map((dependency) => [dependency.alias, dependency]));
  for (const alias of Object.keys(release.document.imports ?? {})) {
    const dependency = expected.get(alias);
    const loaded = imports[alias]?.identity;
    if (!dependency || !loaded || dependency.libraryId !== loaded.libraryId
      || dependency.releaseId !== loaded.releaseId || dependency.contentHash !== loaded.contentHash) {
      throw importError(`Release ${release.libraryId}@${release.releaseId} dependency ${alias} does not match its published closure.`, "CANVAS_IMPORT_DEPENDENCY_MISMATCH");
    }
    expected.delete(alias);
  }
  if (expected.size) throw importError(`Release ${release.libraryId}@${release.releaseId} declares unused dependencies: ${[...expected.keys()].join(", ")}.`, "CANVAS_IMPORT_DEPENDENCY_MISMATCH");
}

async function readReleaseAsset(api, options, release, asset) {
  const read = options.readReleaseAsset ?? api.readLibraryReleaseAsset?.bind(api);
  if (!read) throw importError(`Published asset ${asset.path} requires a release asset reader.`, "CANVAS_IMPORT_ASSET_READER_REQUIRED");
  const bytes = await read(releaseIdentity(release), asset);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== asset.size) throw importError(`Published asset ${asset.path} has inconsistent bytes.`, "CANVAS_IMPORT_INTEGRITY");
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw importError(`Published asset ${asset.path} failed its content hash check.`, "CANVAS_IMPORT_INTEGRITY");
  return bytes;
}

function importedReference(value) {
  if (typeof value !== "string") return null;
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) return null;
  return { alias: value.slice(0, separator), id: value.slice(separator + 1) };
}

function compareIdentity(left, right) { return left.libraryId.localeCompare(right.libraryId) || left.releaseId.localeCompare(right.releaseId); }
function importError(message, code = "CANVAS_IMPORT_INVALID") { const error = new Error(message); error.code = code; return error; }
