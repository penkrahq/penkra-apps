import { readFile } from "node:fs/promises";

export async function readPenDocument(path) {
  const source = await readFile(path, "utf8");
  return parsePenDocument(source, path);
}

export function parsePenDocument(source, label = "<memory>") {
  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`${label} must contain a JSON object.`);
  }
  if (typeof document.version !== "string" || !document.version.trim()) {
    throw new Error(`${label} must declare a non-empty string version.`);
  }
  if (!Array.isArray(document.children)) {
    throw new Error(`${label} must declare a children array.`);
  }
  return document;
}

export function clonePenDocument(document) {
  return JSON.parse(JSON.stringify(document));
}

export function inspectPenDocument(document) {
  const ids = new Map();
  const nodeTypes = new Map();
  const refs = [];
  const resources = new Set();
  let nodeCount = 0;

  const visit = (node, pointer) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    nodeCount += 1;
    if (typeof node.id === "string" && node.id) {
      const locations = ids.get(node.id) ?? [];
      locations.push(pointer);
      ids.set(node.id, locations);
    }
    if (typeof node.type === "string" && node.type) {
      nodeTypes.set(node.type, (nodeTypes.get(node.type) ?? 0) + 1);
    }
    if (node.type === "ref" && typeof node.ref === "string") refs.push(node.ref);
    if (node.type === "image" && typeof node.url === "string") resources.add(node.url);
    if (node.type === "script" && typeof node.scriptUri === "string") {
      resources.add(node.scriptUri);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child, index) => visit(child, `${pointer}/children/${index}`));
    }
    if (node.descendants && typeof node.descendants === "object" && !Array.isArray(node.descendants)) {
      for (const [key, value] of Object.entries(node.descendants)) {
        if (value && typeof value === "object" && !Array.isArray(value) && "type" in value) {
          visit(value, `${pointer}/descendants/${escapePointerToken(key)}`);
        }
      }
    }
  };

  document.children.forEach((child, index) => visit(child, `/children/${index}`));
  if (document.imports && typeof document.imports === "object" && !Array.isArray(document.imports)) {
    for (const value of Object.values(document.imports)) {
      if (typeof value === "string") resources.add(value);
    }
  }

  const duplicateIds = [...ids]
    .filter(([, locations]) => locations.length > 1)
    .map(([id, locations]) => ({ id, locations }));
  const localIds = new Set(ids.keys());
  const unresolvedLocalRefs = [...new Set(refs)]
    .filter((ref) => !ref.includes("/") && !localIds.has(ref))
    .sort();

  return {
    version: document.version,
    nodeCount,
    nodeTypes: Object.fromEntries([...nodeTypes].sort(([left], [right]) => left.localeCompare(right))),
    duplicateIds,
    unresolvedLocalRefs,
    resources: [...resources].sort(),
  };
}

export function replaceNodeProperty(document, nodeId, property, value) {
  if (typeof nodeId !== "string" || !nodeId || typeof property !== "string" || !property) {
    throw new Error("Node ID and property must be non-empty strings.");
  }
  const copy = clonePenDocument(document);
  const match = findNode(copy.children, nodeId);
  if (!match) throw new Error(`Node ${nodeId} was not found.`);
  match.node[property] = value;
  return { document: copy, pointer: `${match.pointer}/${escapePointerToken(property)}` };
}

export function compareOutsidePointers(before, after, allowedPointers) {
  const expected = clonePenDocument(before);
  for (const pointer of allowedPointers) {
    setAtPointer(expected, pointer, clonePenDocument(readAtPointer(after, pointer)));
  }
  return JSON.stringify(expected) === JSON.stringify(after);
}

function findNode(children, nodeId, parentPointer = "/children") {
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const pointer = `${parentPointer}/${index}`;
    if (node.id === nodeId) return { node, pointer };
    if (Array.isArray(node.children)) {
      const nested = findNode(node.children, nodeId, `${pointer}/children`);
      if (nested) return nested;
    }
  }
  return null;
}

function readAtPointer(value, pointer) {
  return pointerTokens(pointer).reduce((current, token) => current[token], value);
}

function setAtPointer(value, pointer, next) {
  const tokens = pointerTokens(pointer);
  const property = tokens.pop();
  if (property === undefined) throw new Error("The document root cannot be an allowed mutation.");
  const parent = tokens.reduce((current, token) => current[token], value);
  parent[property] = next;
}

function pointerTokens(pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    throw new Error(`Invalid JSON pointer: ${String(pointer)}`);
  }
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function escapePointerToken(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
