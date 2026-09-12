import { normalizeImportRecord, validateCrossDocumentReferences } from "./canvas-imports.mjs";
import { PUBLIC_ITEM_KINDS, publicItemKey, validateRetainedLibraryItem } from "./library-publication.mjs";
import { sha256 } from "./sha256.mjs";
import { variableReferences } from "./variable-references.mjs";

const ALIAS_PATTERN = /^[A-Za-z][\w-]*$/u;

// Validate a stored minimal retention without reconstructing a full release
// document. Stored assets may still have their storage descriptors rather than
// restored bytes; readRetention invokes this once before and once after the
// public blob readback.
export function validateRetainedCanvasRetention(retention, options = {}) {
  const allowStoredAssets = options.allowStoredAssets === true;
  validateRetentionEnvelope(retention);
  const root = validateRootIdentity(retention.root);
  const requested = validateRequestedItems(retention.requestedItems);
  const groups = new Map();
  const releaseHashes = new Map();
  const assetRecords = new Map();
  validateRetentionAssets(retention.assets, assetRecords, { allowStoredAssets, rejectDuplicates: true });
  const seenItems = new Set();
  for (const retained of retention.items) {
    validateRetainedLibraryItem(retained);
    const itemIdentity = `${identityKey(validateIdentity(retained.release))}\u0000${publicItemKey(retained.item.kind, retained.item.id)}`;
    if (seenItems.has(itemIdentity)) throw integrity(`Retained item ${itemIdentity} is duplicated.`);
    seenItems.add(itemIdentity);
    ingestItem(retained, groups, releaseHashes);
  }
  const rootGroup = groups.get(identityKey(root));
  if (!rootGroup) throw integrity("Retained root item bundle is missing.");
  const rootItems = new Set(retention.items
    .filter(({ release }) => release && identityKey(release) === identityKey(root))
    .map(({ item }) => item && publicItemKey(item.kind, item.id)));
  if (!rootItems.size) throw integrity("Retained root item bundle is missing.");
  const requestedKeys = new Set(requested.map(({ kind, id }) => publicItemKey(kind, id)));
  for (const key of rootItems) if (!requestedKeys.has(key)) throw integrity("Retained root exposes an unaccepted item.");
  for (const key of requestedKeys) if (!rootItems.has(key)) throw integrity("Retained root is missing an accepted item.");
  validateAssetUses(groups, assetRecords);
  validateDependencyGraph(groups);
  validateExternalClosure(groups);
  return true;
}

// Materialize authenticated, minimal retention bundles into the import shape
// consumed by the existing resolver. This is deliberately synchronous and
// side-effect free: callers have already read and authenticated the bundles.
export function buildRetainedCanvasImports(consumerDocument, retentionsByAlias) {
  const consumer = snapshot(consumerDocument);
  const retentionEntries = snapshotRetentions(retentionsByAlias);
  if (!plainObject(consumer) || !plainObject(consumer.imports)) throw integrity("Consumer imports are malformed.");

  const aliases = Object.keys(consumer.imports);
  const retentionMap = new Map(retentionEntries);
  for (const alias of aliases) if (!ALIAS_PATTERN.test(alias)) throw integrity(`Import alias ${alias} is invalid.`);
  for (const alias of retentionMap.keys()) if (typeof alias !== "string" || !Object.hasOwn(consumer.imports, alias)) throw integrity(`Retention has an unexpected alias ${String(alias)}.`);
  for (const alias of aliases) if (!retentionMap.has(alias)) throw integrity(`Retention for import ${alias} is missing.`);

  const releaseHashes = new Map();
  const plans = [];

  for (const alias of aliases) {
    const normalized = normalizeImportRecord(consumer.imports[alias]);
    // A follow record without its accepted identity cannot select retained
    // content. In particular, never replace it with the latest publication.
    if (!normalized.releaseId || !normalized.contentHash) throw integrity(`Import ${alias} has no accepted release identity.`);
    const retention = retentionMap.get(alias);
    validateRetentionEnvelope(retention);
    validateRetainedCanvasRetention(retention);
    const root = validateIdentity(retention.root);
    if (root.libraryId !== normalized.documentId || root.releaseId !== normalized.releaseId || root.contentHash !== normalized.contentHash) {
      throw integrity(`Retention for ${alias} does not match its accepted release identity.`);
    }
    const groups = new Map();
    const assetRecords = new Map();
    validateRetentionAssets(retention.assets, assetRecords, { rejectDuplicates: true });
    const requested = validateRequestedItems(retention.requestedItems);
    const itemRecords = Array.isArray(retention.items) ? retention.items : null;
    if (!itemRecords?.length) throw integrity(`Retention for ${alias} has no items.`);
    for (const retained of itemRecords) ingestItem(retained, groups, releaseHashes);
    const rootGroup = groups.get(identityKey(root));
    if (!rootGroup) throw integrity(`Retention for ${alias} is missing its root item bundle.`);
    const requestedKeys = new Set(requested.map(({ kind, id }) => publicItemKey(kind, id)));
    const retainedRootKeys = new Set(itemRecords
      .filter(({ release }) => release && identityKey(release) === identityKey(root))
      .map(({ item }) => item && publicItemKey(item.kind, item.id)));
    if (!retainedRootKeys.size) throw integrity(`Retention for ${alias} is missing its root item bundle.`);
    for (const key of retainedRootKeys) if (!requestedKeys.has(key)) {
      throw integrity(`Retention for ${alias} exposes an unaccepted root item.`);
    }
    for (const request of requested) if (!retainedRootKeys.has(publicItemKey(request.kind, request.id))) {
      throw integrity(`Retention for ${alias} is missing accepted item ${request.kind}:${request.id}.`);
    }
    validateAssetUses(groups, assetRecords);
    validateDependencyGraph(groups);
    validateExternalClosure(groups);
    plans.push({ alias, root, requested, rootGroup, groups, assetRecords });
  }

  const imports = Object.create(null);
  const assets = new Map();
  const releases = new Map();
  for (const plan of plans) {
    const entry = materializeEntry(plan.rootGroup, plan.requested.map((item) => plan.rootGroup.items.get(publicItemKey(item.kind, item.id))), new Set(), plan.groups);
    imports[plan.alias] = entry;
    collectAssets(plan.rootGroup, `imports/${plan.alias}`, new Set(), assets, plan.groups, plan.assetRecords);
    collectReleases(plan.rootGroup, plan.groups, releases, new Set());
  }
  validateCrossDocumentReferences(consumer, imports);
  return { imports, assets, releases: [...releases.values()].sort(compareIdentity) };

  function materializeEntry(group, publicItems, active, groups) {
    const key = identityKey(group.identity);
    if (active.has(key)) throw invalid("CANVAS_IMPORT_CYCLE");
    const nextActive = new Set(active).add(key);
    const nested = Object.create(null);
    for (const [alias, dependency] of group.dependencies) {
      const dependencyGroup = groups.get(identityKey(dependency));
      if (!dependencyGroup) throw integrity(`Dependency ${alias} is missing from retained closure.`);
      nested[alias] = materializeEntry(dependencyGroup, [...dependencyGroup.items.values()], nextActive, groups);
    }
    const document = materializeDocument(group);
    const publicManifest = [...new Map(publicItems.map((item) => [publicItemKey(item.kind, item.id), {
      kind: item.kind, id: item.id, contentHash: item.contentHash,
    }])).values()].sort(comparePublicItems);
    const release = { ...group.identity, publicItems, retained: true };
    const entry = { document, imports: nested, release, identity: { ...group.identity }, retained: true };
    entry.release.publicItems = publicManifest;
    document.imports = Object.fromEntries([...group.dependencies].map(([alias, dependency]) => [alias, {
      documentId: dependency.libraryId, updatePolicy: "pinned", releaseId: dependency.releaseId, contentHash: dependency.contentHash,
    }]));
    validateCrossDocumentReferences(document, nested);
    return entry;
  }

  function materializeDocument(group) {
    const componentValues = [];
    const variables = {};
    const paragraphStyles = {};
    for (const [key, value] of group.resources) {
      const separator = key.indexOf(":");
      const kind = key.slice(0, separator);
      const id = key.slice(separator + 1);
      if (kind === "variable") variables[id] = structuredClone(value);
      else if (kind === "paragraphStyle") paragraphStyles[id] = structuredClone(value);
      else if (kind === "component") componentValues.push({ id, value: structuredClone(value) });
    }
    const bodies = new Map();
    const descendants = new Map();
    for (const { id, value } of componentValues) {
      if (!plainObject(value) || value.id !== id) throw integrity(`Component ${id} has an inconsistent retained body.`);
      const found = new Set();
      collectNodes(value, found, bodies);
      descendants.set(id, found);
    }
    const children = componentValues
      .filter(({ id }) => !componentValues.some(({ id: parent }) => parent !== id && descendants.get(parent)?.has(id)))
      .map(({ value }) => value);
    return {
      version: "2.17", module: "generic", axes: structuredClone(group.axes ?? {}),
      variables, paragraphStyles, children, imports: {}, flows: [],
    };
  }

  function collectAssets(group, prefix, active, output, groups, assetRecords) {
    const key = identityKey(group.identity);
    if (active.has(key)) throw invalid("CANVAS_IMPORT_CYCLE");
    const next = new Set(active).add(key);
    for (const descriptor of group.assets.values()) {
      const source = assetRecords.get(assetKey(group.identity, descriptor.path));
      if (!source) throw integrity(`Asset ${descriptor.path} is missing from retained bytes.`);
      const path = `${prefix}/${descriptor.path}`;
      const existing = output.get(path);
      const materialized = { ...descriptor, path, bytes: new Uint8Array(source.bytes) };
      if (existing && !sameAsset(existing, materialized)) throw integrity(`Asset path ${path} has conflicting retained bytes.`);
      if (!existing) output.set(path, materialized);
    }
    for (const [alias, dependency] of group.dependencies) {
      const dependencyGroup = groups.get(identityKey(dependency));
      if (!dependencyGroup) throw integrity(`Dependency ${alias} is missing from retained closure.`);
      collectAssets(dependencyGroup, `${prefix}/imports/${alias}`, next, output, groups, assetRecords);
    }
  }
}

function ingestItem(retained, groups, releaseHashes) {
  validateRetainedLibraryItem(retained);
  const release = validateIdentity(retained.release);
  const item = retained.item;
  const content = retained.content;
  const base = `${release.libraryId}\u0000${release.releaseId}`;
  const priorHash = releaseHashes.get(base);
  if (priorHash !== undefined && priorHash !== release.contentHash) throw integrity(`Release ${release.libraryId}@${release.releaseId} has conflicting content hashes.`);
  releaseHashes.set(base, release.contentHash);
  if (!Array.isArray(content.resources) || !Array.isArray(content.dependencies) || !Array.isArray(content.assets)) throw integrity("Retained item closure is malformed.");
  const key = identityKey(release);
  let group = groups.get(key);
  if (!group) {
    group = { identity: release, axes: undefined, resources: new Map(), items: new Map(), dependencies: new Map(), assets: new Map() };
    groups.set(key, group);
  }
  if (group.axes === undefined) group.axes = structuredClone(content.axes ?? {});
  else if (canonical(group.axes) !== canonical(content.axes ?? {})) throw integrity(`Release ${release.libraryId}@${release.releaseId} has conflicting axes.`);
  const ownKey = publicItemKey(item.kind, item.id);
  const resources = new Map();
  for (const pair of content.resources) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string") throw integrity("Retained resource entry is malformed.");
    const separator = pair[0].indexOf(":");
    if (separator <= 0 || separator === pair[0].length - 1 || !PUBLIC_ITEM_KINDS.includes(pair[0].slice(0, separator))) throw integrity("Retained resource key is malformed.");
    const resourceKey = pair[0];
    if (resources.has(resourceKey)) throw integrity(`Retained resource ${resourceKey} is duplicated.`);
    resources.set(resourceKey, pair[1]);
    const prior = group.resources.get(resourceKey);
    if (prior !== undefined && canonical(prior) !== canonical(pair[1])) throw integrity(`Retained resource ${resourceKey} conflicts.`);
  }
  if (!resources.has(ownKey) && !group.resources.has(ownKey)) throw integrity(`Retained item ${ownKey} has no matching resource.`);
  for (const [resourceKey, value] of resources) if (!group.resources.has(resourceKey)) group.resources.set(resourceKey, structuredClone(value));
  const existingItem = group.items.get(ownKey);
  if (existingItem && canonical(existingItem) !== canonical({ kind: item.kind, id: item.id, contentHash: item.contentHash })) throw integrity(`Retained item ${ownKey} conflicts.`);
  group.items.set(ownKey, { kind: item.kind, id: item.id, contentHash: item.contentHash });
  for (const dependency of content.dependencies) {
    if (!plainObject(dependency) || !ALIAS_PATTERN.test(dependency.alias)) throw integrity("Retained dependency is malformed.");
    const identity = validateIdentity(dependency);
    const prior = group.dependencies.get(dependency.alias);
    if (prior && identityKey(prior) !== identityKey(identity)) throw integrity(`Dependency ${dependency.alias} conflicts.`);
    group.dependencies.set(dependency.alias, identity);
  }
  for (const descriptor of content.assets) {
    validateAssetDescriptor(descriptor);
    const prior = group.assets.get(descriptor.path);
    if (prior && canonical(prior) !== canonical(descriptor)) throw integrity(`Retained asset ${descriptor.path} conflicts.`);
    group.assets.set(descriptor.path, structuredClone(descriptor));
  }
  validateExternalReferences(resources, group.dependencies);
}

function validateRetentionEnvelope(retention) {
  if (!plainObject(retention) || !plainObject(retention.root) || !Array.isArray(retention.requestedItems) || !Array.isArray(retention.items) || !Array.isArray(retention.assets)) throw integrity("Retained bundle is malformed.");
}

function validateRequestedItems(items) {
  const seen = new Set();
  return items.map((item) => {
    if (!plainObject(item) || !PUBLIC_ITEM_KINDS.includes(item.kind) || typeof item.id !== "string" || !item.id || Object.keys(item).some((key) => !["kind", "id"].includes(key))) throw integrity("Retained requested item is malformed.");
    const key = publicItemKey(item.kind, item.id);
    if (seen.has(key)) throw integrity(`Retained requested item ${key} is duplicated.`);
    seen.add(key);
    return { kind: item.kind, id: item.id };
  });
}

function validateIdentity(identity) {
  if (!plainObject(identity) || typeof identity.libraryId !== "string" || !identity.libraryId || typeof identity.releaseId !== "string" || !identity.releaseId || !/^[a-f0-9]{64}$/u.test(identity.contentHash ?? "")) throw integrity("Retained release identity is malformed.");
  return { libraryId: identity.libraryId, releaseId: identity.releaseId, contentHash: identity.contentHash };
}

function validateRootIdentity(identity) {
  if (!plainObject(identity) || Object.keys(identity).some((key) => !["libraryId", "releaseId", "contentHash"].includes(key))) throw integrity("Retained root identity is malformed.");
  return validateIdentity(identity);
}

function validateAssetDescriptor(asset) {
  if (!plainObject(asset) || typeof asset.path !== "string" || !asset.path || asset.path !== asset.path.normalize("NFC") || asset.path.startsWith("/") || asset.path.includes("\\") || /[\u0000-\u001f\u007f:]/u.test(asset.path) || asset.path.split("/").some((part) => !part || part === "." || part === "..") || !/^[a-f0-9]{64}$/u.test(asset.sha256 ?? "") || !Number.isSafeInteger(asset.size) || asset.size < 0 || (asset.mimeType !== undefined && typeof asset.mimeType !== "string")) throw integrity("Retained asset descriptor is malformed.");
}

function validateRetentionAssets(assets, assetRecords, options = {}) {
  const allowStoredAssets = options.allowStoredAssets === true;
  const rejectDuplicates = options.rejectDuplicates === true;
  const seen = new Set();
  for (const asset of assets) {
    if (!plainObject(asset) || !asset.release) throw integrity("Retained asset bytes are malformed.");
    const release = validateIdentity(asset.release);
    const descriptor = { path: asset.path, sha256: asset.sha256, size: asset.size, ...(asset.mimeType !== undefined ? { mimeType: asset.mimeType } : {}) };
    validateAssetDescriptor(descriptor);
    const hasBytes = asset.bytes instanceof Uint8Array;
    if (!hasBytes && (!allowStoredAssets || !plainObject(asset.storage))) throw integrity("Retained asset bytes are malformed.");
    if (hasBytes && (asset.bytes.byteLength !== descriptor.size || hash(asset.bytes) !== descriptor.sha256)) throw integrity(`Retained asset ${descriptor.path} failed its content hash check.`);
    const key = assetKey(release, descriptor.path);
    if (rejectDuplicates && seen.has(key)) throw integrity(`Retained asset ${descriptor.path} is duplicated.`);
    seen.add(key);
    const materialized = { ...descriptor, ...(hasBytes ? { bytes: new Uint8Array(asset.bytes) } : { bytes: undefined }) };
    const prior = assetRecords.get(key);
    if (prior && !sameAsset(prior, materialized)) throw integrity(`Retained asset ${descriptor.path} has conflicting bytes.`);
    assetRecords.set(key, materialized);
  }
}

function validateAssetUses(groups, assetRecords) {
  for (const group of groups.values()) for (const descriptor of group.assets.values()) {
    const source = assetRecords.get(assetKey(group.identity, descriptor.path));
    if (!source || !sameAsset(source, { ...descriptor, bytes: source?.bytes })) throw integrity(`Retained asset ${descriptor.path} is missing or changed.`);
  }
  for (const group of groups.values()) for (const value of group.resources.values()) inspectResourceAssets(value, group);
}

function inspectResourceAssets(value, group) {
  if (Array.isArray(value)) return value.forEach((item) => inspectResourceAssets(item, group));
  if (!plainObject(value)) return;
  if (value.type === "image" && typeof value.url === "string" && !group.assets.has(value.url)) throw integrity(`Retained asset ${value.url} is missing from its closure.`);
  for (const nested of Object.values(value)) inspectResourceAssets(nested, group);
}

function validateDependencyGraph(groups) {
  for (const group of groups.values()) for (const dependency of group.dependencies.values()) if (!groups.has(identityKey(dependency))) throw integrity(`Dependency ${dependency.libraryId}@${dependency.releaseId} is missing from retained closure.`);
  const visiting = new Set(); const visited = new Set();
  const visit = (group) => {
    const key = identityKey(group.identity);
    if (visiting.has(key)) throw invalid("CANVAS_IMPORT_CYCLE");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of group.dependencies.values()) visit(groups.get(identityKey(dependency)));
    visiting.delete(key); visited.add(key);
  };
  for (const group of groups.values()) visit(group);
}

function validateExternalClosure(groups) {
  for (const group of groups.values()) for (const value of group.resources.values()) {
    inspect(value, (kind, reference) => {
      const separator = reference.indexOf(":");
      if (separator <= 0) return;
      const alias = reference.slice(0, separator);
      const id = reference.slice(separator + 1);
      const dependency = group.dependencies.get(alias);
      const dependencyGroup = dependency && groups.get(identityKey(dependency));
      if (!dependencyGroup || !dependencyGroup.items.has(publicItemKey(kind, id))) throw integrity(`Retained ${kind}:${reference} is missing from its dependency closure.`);
    });
  }
}

function inspect(value, check) {
  if (typeof value === "string") {
    for (const match of variableReferences(value)) check("variable", match[1]);
  } else if (Array.isArray(value)) value.forEach((item) => inspect(item, check));
  else if (plainObject(value)) {
    if (value.type === "ref" && typeof value.ref === "string") check("component", value.ref);
    if (typeof value.style === "string") check("paragraphStyle", value.style);
    Object.values(value).forEach((item) => inspect(item, check));
  }
}

function validateExternalReferences(resources, dependencies) {
  const inspect = (value) => {
    if (typeof value === "string") {
      for (const match of variableReferences(value)) check("variable", match[1]);
    } else if (Array.isArray(value)) value.forEach(inspect);
    else if (plainObject(value)) {
      if (value.type === "ref") check("component", value.ref);
      if (typeof value.style === "string") check("paragraphStyle", value.style);
      Object.values(value).forEach(inspect);
    }
  };
  const check = (kind, value) => {
    if (typeof value !== "string") return;
    const separator = value.indexOf(":");
    if (separator > 0 && !dependencies.has(value.slice(0, separator))) throw integrity(`Retained ${kind} reference uses an undeclared dependency.`);
  };
  for (const value of resources.values()) inspect(value);
}

function collectNodes(node, found, bodies) {
  if (!plainObject(node) || typeof node.id !== "string" || !node.id) throw integrity("Retained component child is malformed.");
  const prior = bodies.get(node.id);
  if (prior && canonical(prior) !== canonical(node)) throw integrity(`Retained component node ${node.id} has conflicting bodies.`);
  if (!prior) bodies.set(node.id, node);
  found.add(node.id);
  for (const child of node.children ?? []) collectNodes(child, found, bodies);
}

function snapshot(value) {
  try { return structuredClone(value); } catch { throw integrity("Retained import input cannot be snapshotted."); }
}
function snapshotRetentions(value) {
  if (!(value instanceof Map)) throw integrity("Retentions must be a Map.");
  return [...value.entries()].map(([alias, retention]) => [alias, snapshot(retention)]);
}
function identityKey(identity) { return JSON.stringify([identity.libraryId, identity.releaseId, identity.contentHash]); }
function assetKey(identity, path) { return `${identityKey(identity)}\u0000${path}`; }
function hash(bytes) { return sha256(bytes); }
function sameAsset(left, right) {
  if (left.path !== right.path || left.sha256 !== right.sha256 || left.size !== right.size || (left.mimeType ?? undefined) !== (right.mimeType ?? undefined)) return false;
  if (!(left.bytes instanceof Uint8Array) || !(right.bytes instanceof Uint8Array)) return left.bytes === undefined && right.bytes === undefined;
  return hash(left.bytes) === hash(right.bytes) && left.bytes.length === right.bytes.length;
}
function collectReleases(group, groups, output, active) { const key = identityKey(group.identity); if (active.has(key)) return; active.add(key); output.set(key, { ...group.identity }); for (const dependency of group.dependencies.values()) collectReleases(groups.get(identityKey(dependency)), groups, output, active); active.delete(key); }
function compareIdentity(left, right) { return left.libraryId.localeCompare(right.libraryId) || left.releaseId.localeCompare(right.releaseId); }
function comparePublicItems(left, right) { return left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id); }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function integrity(message) { return Object.assign(new Error(message), { code: "CANVAS_IMPORT_INTEGRITY" }); }
function invalid(code) { return Object.assign(new Error("Retained import validation failed."), { code }); }

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw integrity("Retained content contains a non-finite number."); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  throw integrity("Retained content is not canonical JSON.");
}
