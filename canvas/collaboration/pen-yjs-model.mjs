import * as Y from "yjs";

export const CURRENT_MODEL_VERSION = 2;
const RESERVED_NODE_PROPERTIES = new Set(["id", "type", "children"]);

export function createModel(penDocument, options = {}) {
  const doc = options.doc ?? new Y.Doc(options.docOptions);
  const metadata = doc.getMap("metadata");
  const documentFields = doc.getMap("documentFields");
  const nodes = doc.getMap("nodes");
  assertJsonValue(penDocument);
  validateNodeTree(penDocument.children, new Set(nodes.keys()));

  doc.transact(() => {
    metadata.set("modelVersion", options.modelVersion ?? CURRENT_MODEL_VERSION);
    for (const [key, value] of Object.entries(penDocument)) {
      if (key !== "children") documentFields.set(key, cloneJson(value));
    }
    importChildren(nodes, penDocument.children, null);
  }, options.origin);

  return { doc, metadata, documentFields, nodes };
}

export function openModel(doc) {
  return {
    doc,
    metadata: doc.getMap("metadata"),
    documentFields: doc.getMap("documentFields"),
    nodes: doc.getMap("nodes"),
  };
}

export function setNodeProperty(model, nodeId, property, value, origin) {
  assertEditableModel(model);
  assertJsonValue(value);
  if (RESERVED_NODE_PROPERTIES.has(property)) {
    throw new Error(`${property} is structural and cannot be set as a node property.`);
  }
  transact(model, origin, () => {
    getNode(model, nodeId).get("properties").set(property, toYValue(value));
  });
}

export function setNodePropertyPath(model, nodeId, property, path, value, origin) {
  assertEditableModel(model);
  assertJsonValue(value);
  if (RESERVED_NODE_PROPERTIES.has(property)) {
    throw new Error(`${property} is structural and cannot be set as a node property.`);
  }
  if (!Array.isArray(path) || path.length === 0 || path.some((key) => typeof key !== "string" || !key)) {
    throw new Error("A nested property path must contain non-empty string keys.");
  }
  transact(model, origin, () => {
    let current = getNode(model, nodeId).get("properties").get(property);
    for (const key of path.slice(0, -1)) {
      if (!(current instanceof Y.Map)) {
        throw new Error(`${property}.${path.join(".")} is not an editable object path.`);
      }
      current = current.get(key);
    }
    if (!(current instanceof Y.Map)) {
      throw new Error(`${property}.${path.join(".")} is not an editable object path.`);
    }
    current.set(path.at(-1), toYValue(value));
  });
}

export function insertNode(model, node, parentId, position, origin) {
  assertEditableModel(model);
  assertPosition(position);
  if (parentId !== null) getLiveNode(model, parentId);
  assertJsonValue(node);
  validateNodeTree([node], new Set(model.nodes.keys()));
  transact(model, origin, () => {
    model.nodes.set(node.id, createYNode(node, parentId, position));
    importChildren(model.nodes, node.children, node.id);
  });
}

export function moveNode(model, nodeId, parentId, position, origin) {
  assertEditableModel(model);
  assertPosition(position);
  const node = getLiveNode(model, nodeId);
  transact(model, origin, () => {
    if (parentId === nodeId) throw new Error("A node cannot parent itself.");
    if (parentId !== null) {
      getLiveNode(model, parentId);
      assertNoLocalParentCycle(model, nodeId, parentId);
    }
    node.set("parentId", parentId);
    node.set("position", position);
  });
}

export function deleteNode(model, nodeId, origin) {
  assertEditableModel(model);
  transact(model, origin, () => getNode(model, nodeId).set("deleted", true));
}

export function restoreNode(model, nodeId, origin) {
  assertEditableModel(model);
  transact(model, origin, () => getNode(model, nodeId).set("deleted", false));
}

export function upgradeModel(model, origin) {
  assertEditableModel(model);
  transact(model, origin, () => {
    const version = Number(model.metadata.get("modelVersion") ?? 1);
    if (version > CURRENT_MODEL_VERSION) return;
    if (version < 2) {
      model.metadata.set("capabilities", {
        stableNodeIds: true,
        singleParentHierarchy: true,
        unknownPropertyPreservation: true,
      });
      model.metadata.set("modelVersion", 2);
    }
  });
}

export function materializePen(model) {
  const result = Object.fromEntries(
    [...model.documentFields.entries()].map(([key, value]) => [key, cloneJson(value)]),
  );
  const live = new Map(
    [...model.nodes.entries()].filter(
      ([id, node]) =>
        node.get("deleted") !== true && !hasDeletedAncestor(model.nodes, id),
    ),
  );
  const parentById = new Map(
    [...live].map(([id, node]) => {
      const parentId = node.get("parentId");
      return [id, parentId === null || live.has(parentId) ? parentId : null];
    }),
  );
  breakParentCycles(parentById);
  const childrenByParent = new Map();

  for (const [id, node] of live) {
    const effectiveParent = parentById.get(id);
    const children = childrenByParent.get(effectiveParent) ?? [];
    children.push({ id, node });
    childrenByParent.set(effectiveParent, children);
  }

  for (const children of childrenByParent.values()) {
    children.sort((left, right) => {
      const delta = Number(left.node.get("position")) - Number(right.node.get("position"));
      return delta || left.id.localeCompare(right.id);
    });
  }

  const visiting = new Set();
  const build = ({ id, node }) => {
    if (visiting.has(id)) return null;
    visiting.add(id);
    const properties = node.get("properties");
    const value = {
      type: node.get("type"),
      id,
      ...Object.fromEntries(
        [...properties.entries()].map(([key, property]) => [key, fromYValue(property)]),
      ),
    };
    const children = (childrenByParent.get(id) ?? []).map(build).filter(Boolean);
    if (children.length > 0 || node.get("hadChildren") === true) value.children = children;
    visiting.delete(id);
    return value;
  };

  result.children = (childrenByParent.get(null) ?? []).map(build).filter(Boolean);
  return result;
}

export function syncModels(left, right) {
  const leftUpdate = Y.encodeStateAsUpdate(left.doc, Y.encodeStateVector(right.doc));
  const rightUpdate = Y.encodeStateAsUpdate(right.doc, Y.encodeStateVector(left.doc));
  Y.applyUpdate(left.doc, rightUpdate);
  Y.applyUpdate(right.doc, leftUpdate);
}

export function cloneModel(model, docOptions) {
  const doc = new Y.Doc(docOptions);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(model.doc));
  return openModel(doc);
}

function importChildren(nodes, children = [], parentId) {
  children.forEach((node, index) => {
    if (nodes.has(node.id)) throw new Error(`Duplicate node ID ${node.id}.`);
    nodes.set(node.id, createYNode(node, parentId, index));
    importChildren(nodes, node.children, node.id);
  });
}

function createYNode(node, parentId, position) {
  if (!node || typeof node !== "object" || typeof node.id !== "string" || !node.id) {
    throw new Error("Every normalized node must have a non-empty string ID.");
  }
  const value = new Y.Map();
  const properties = new Y.Map();
  value.set("type", node.type);
  value.set("parentId", parentId);
  value.set("position", position);
  value.set("deleted", false);
  value.set("hadChildren", Array.isArray(node.children));
  for (const [key, property] of Object.entries(node)) {
    if (key !== "id" && key !== "type" && key !== "children") {
      properties.set(key, toYValue(property));
    }
  }
  value.set("properties", properties);
  return value;
}

function getNode(model, nodeId) {
  const node = model.nodes.get(nodeId);
  if (!(node instanceof Y.Map)) throw new Error(`Node ${nodeId} was not found.`);
  return node;
}

function getLiveNode(model, nodeId) {
  const node = getNode(model, nodeId);
  if (node.get("deleted") === true) throw new Error(`Node ${nodeId} is deleted.`);
  return node;
}

function transact(model, origin, action) {
  model.doc.transact(action, origin);
}

function assertEditableModel(model) {
  const version = Number(model.metadata.get("modelVersion") ?? 1);
  if (!Number.isInteger(version) || version < 1 || version > CURRENT_MODEL_VERSION) {
    throw new Error(
      `Canvas model version ${String(model.metadata.get("modelVersion"))} is not editable by this client.`,
    );
  }
}

function assertPosition(position) {
  if (typeof position !== "number" || !Number.isFinite(position)) {
    throw new Error("Node position must be a finite number.");
  }
}

function validateNodeTree(children, occupiedIds) {
  if (!Array.isArray(children)) throw new Error("Node children must be an array.");
  for (const node of children) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error("Every normalized node must be an object.");
    }
    if (typeof node.id !== "string" || !node.id) {
      throw new Error("Every normalized node must have a non-empty string ID.");
    }
    if (typeof node.type !== "string" || !node.type) {
      throw new Error(`Node ${node.id} must have a non-empty string type.`);
    }
    if (occupiedIds.has(node.id)) throw new Error(`Duplicate node ID ${node.id}.`);
    occupiedIds.add(node.id);
    if (node.children !== undefined) validateNodeTree(node.children, occupiedIds);
  }
}

function assertNoLocalParentCycle(model, nodeId, parentId) {
  const visited = new Set();
  let currentId = parentId;
  while (currentId !== null && model.nodes.has(currentId)) {
    if (currentId === nodeId) throw new Error("A node cannot move beneath its own descendant.");
    if (visited.has(currentId)) return;
    visited.add(currentId);
    currentId = model.nodes.get(currentId).get("parentId");
  }
}

function cloneJson(value) {
  assertJsonValue(value);
  return JSON.parse(JSON.stringify(value));
}

function toYValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return cloneJson(value);
  const map = new Y.Map();
  for (const [key, nested] of Object.entries(value)) map.set(key, toYValue(nested));
  return map;
}

function fromYValue(value) {
  if (value instanceof Y.Map) {
    return Object.fromEntries(
      [...value.entries()].map(([key, nested]) => [key, fromYValue(nested)]),
    );
  }
  return cloneJson(value);
}

function breakParentCycles(parentById) {
  for (const startId of [...parentById.keys()].sort()) {
    const path = [];
    const indexById = new Map();
    let currentId = startId;
    while (currentId !== null && parentById.has(currentId)) {
      const cycleIndex = indexById.get(currentId);
      if (cycleIndex !== undefined) {
        const cycle = path.slice(cycleIndex).sort();
        parentById.set(cycle[0], null);
        break;
      }
      indexById.set(currentId, path.length);
      path.push(currentId);
      currentId = parentById.get(currentId) ?? null;
    }
  }
}

function hasDeletedAncestor(nodes, nodeId) {
  const visited = new Set([nodeId]);
  let parentId = nodes.get(nodeId)?.get("parentId");
  while (parentId !== null && nodes.has(parentId)) {
    if (visited.has(parentId)) return false;
    visited.add(parentId);
    const parent = nodes.get(parentId);
    if (parent.get("deleted") === true) return true;
    parentId = parent.get("parentId");
  }
  return false;
}

function assertJsonValue(value, path = "$", ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite JSON numbers.`);
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${path} contains a value that cannot be represented in JSON.`);
  }
  if (ancestors.has(value)) throw new Error(`${path} contains a JSON cycle.`);
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must contain only plain JSON objects and arrays.`);
  }
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) {
    throw new Error(`${path} contains a non-string JSON object key.`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) {
        throw new Error(`${path} contains a non-JSON array property.`);
      }
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new Error(`${path} contains a sparse JSON array.`);
      assertJsonValue(value[index], `${path}[${index}]`, ancestors);
    }
  } else {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable || !("value" in descriptor)) {
        throw new Error(`${path}.${key} is not a plain JSON data property.`);
      }
      assertJsonValue(descriptor.value, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}

export { Y };
