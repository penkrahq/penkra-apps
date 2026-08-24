import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";

const MAX_SCRIPT_BYTES = 100_000;
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const EXECUTION_TIMEOUT_MS = 5_000;

let quickJsPromise;

export async function executeCanvasScript(document, code, inspection = {}) {
  if (typeof code !== "string" || code.trim().length === 0) {
    throw new Error("Canvas script code must be a non-empty string.");
  }
  assertByteLimit(code, MAX_SCRIPT_BYTES, "Canvas script");
  const input = JSON.stringify(document);
  const inspectionInput = JSON.stringify(inspection);
  assertByteLimit(input, MAX_INPUT_BYTES, "Canvas document");
  assertByteLimit(inspectionInput, MAX_INPUT_BYTES, "Canvas inspection context");

  quickJsPromise ??= getQuickJS();
  const QuickJS = await quickJsPromise;
  try {
    const output = QuickJS.evalCode(
      `const __canvasDocumentJson = ${JSON.stringify(input)};\nconst __canvasInspectionJson = ${JSON.stringify(inspectionInput)};\nconst __canvasCode = ${JSON.stringify(code)};\n${SANDBOX_SOURCE}`,
      {
        shouldInterrupt: shouldInterruptAfterDeadline(
          Date.now() + EXECUTION_TIMEOUT_MS,
        ),
        memoryLimitBytes: 64 * 1024 * 1024,
        maxStackSizeBytes: 4 * 1024 * 1024,
      },
    );
    assertByteLimit(output, MAX_OUTPUT_BYTES, "Canvas script result");
    return JSON.parse(output);
  } catch (error) {
    if (error?.code?.startsWith?.("CANVAS_")) throw error;
    throw scriptError(error);
  }
}

function assertByteLimit(value, limit, label) {
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes > limit) {
    const nextAction =
      label === "Canvas script"
        ? "Split the edit into smaller documents.execute calls and validate between them."
        : "Reduce the document or output size and retry with a narrower operation.";
    throw new Error(
      `${label} is ${bytes} bytes; the limit is ${limit} bytes. ${nextAction}`,
    );
  }
}

function scriptError(value) {
  const message =
    typeof value?.message === "string" ? value.message : String(value);
  const error = new Error(`Canvas script failed: ${message}`);
  error.code = message.includes("interrupted")
    ? "CANVAS_SCRIPT_TIMEOUT"
    : "CANVAS_SCRIPT_FAILED";
  return error;
}

const SANDBOX_SOURCE = String.raw`
"use strict";
const __document = JSON.parse(__canvasDocumentJson);
const __inspection = JSON.parse(__canvasInspectionJson);
const __prints = [];
const __touched = new Set();
let __copyCounter = 0;
const __clone = (value) => JSON.parse(JSON.stringify(value));
const __readonly = (value) => {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value)) __readonly(child);
  return Object.freeze(value);
};

function __walk(nodes = __document.children, parent = null, parentPath = [], output = []) {
  for (let index = 0; index < (nodes || []).length; index += 1) {
    const node = nodes[index];
    const path = [...parentPath, node.id];
    output.push({ node, parent, index, path });
    __walk(node.children || [], node, path, output);
  }
  return output;
}

function __matches(entry, selector) {
  if (selector === "*" || selector === undefined || selector === null) return true;
  if (typeof selector === "object") {
    const selected = selector.node && typeof selector.node === "object" ? selector.node : selector;
    return typeof selected.id === "string" && entry.node.id === selected.id;
  }
  if (typeof selector !== "string") throw new TypeError("A Canvas selector must be a string, node, or context.");
  if (selector.startsWith("#")) return entry.node.id === selector.slice(1);
  if (selector.startsWith("type:")) return entry.node.type === selector.slice(5);
  if (selector.startsWith("name:")) return entry.node.name === selector.slice(5);
  if (selector.includes("/")) return entry.path.join("/") === selector;
  return entry.node.id === selector;
}

function __entries(selector) {
  return __walk().filter((entry) => __matches(entry, selector));
}

function __requireOne(target) {
  const entries = __entries(target);
  if (entries.length !== 1) {
    throw new Error("Expected one Canvas node, found " + entries.length + ".");
  }
  return entries[0];
}

function __context(entry) {
  const inspected = __inspection[entry.node.id] || {};
  return Object.freeze({
    node: __readonly(__clone(entry.node)),
    parent: entry.parent ? __readonly(__clone(entry.parent)) : null,
    index: entry.index,
    path: entry.path.join("/"),
    bounds: inspected.bounds === undefined ? null : __readonly(__clone(inspected.bounds)),
    problems: __readonly(__clone(inspected.problems || [])),
  });
}

function __touchTree(node) {
  __touched.add(node.id);
  for (const child of node.children || []) __touchTree(child);
}

globalThis.Get = function Get(selector = "*", visitor, options = {}) {
  const matches = __entries(selector);
  const limit = options.limit === undefined ? 1000 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError("Get limit must be an integer from 1 through 1000.");
  }
  if (matches.length > limit) throw new Error("Get matched " + matches.length + " nodes; narrow the selector or raise the limit.");
  const contexts = matches.map(__context);
  if (visitor === undefined) return contexts;
  if (typeof visitor !== "function") throw new TypeError("Get visitor must be a function.");
  contexts.forEach(visitor);
  return contexts.length;
};

globalThis.Insert = function Insert(parent, node, position) {
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new TypeError("Insert requires one node object.");
  if (typeof node.id !== "string" || node.id.length === 0) throw new Error("Inserted nodes require a non-empty id.");
  if (__entries("#" + node.id).length > 0) throw new Error("Node " + node.id + " already exists.");
  const children = parent === null || parent === undefined
    ? (__document.children ||= [])
    : (__requireOne(parent).node.children ||= []);
  const index = position === undefined ? children.length : Number(position);
  if (!Number.isInteger(index) || index < 0 || index > children.length) throw new RangeError("Insert position is outside the parent.");
  children.splice(index, 0, __clone(node));
  __touchTree(node);
  if (parent !== null && parent !== undefined) __touched.add(__requireOne(parent).node.id);
  return node.id;
};

globalThis.Update = function Update(target, properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new TypeError("Update requires a property object.");
  const node = __requireOne(target).node;
  if (Object.hasOwn(properties, "id") && properties.id !== node.id) throw new Error("Update cannot change a node id.");
  for (const [key, value] of Object.entries(properties)) {
    if (key === "id") continue;
    if (value === undefined) delete node[key];
    else node[key] = __clone(value);
  }
  __touched.add(node.id);
  return node;
};

globalThis.Replace = function Replace(target, replacement) {
  const entry = __requireOne(target);
  if (!replacement || typeof replacement !== "object" || Array.isArray(replacement)) throw new TypeError("Replace requires one node object.");
  const next = __clone(replacement);
  next.id ??= entry.node.id;
  if (next.id !== entry.node.id && __entries("#" + next.id).length > 0) throw new Error("Node " + next.id + " already exists.");
  const siblings = entry.parent ? entry.parent.children : __document.children;
  siblings.splice(entry.index, 1, next);
  __touchTree(next);
  if (entry.parent) __touched.add(entry.parent.id);
  return next.id;
};

globalThis.Delete = function Delete(target) {
  const entry = __requireOne(target);
  const siblings = entry.parent ? entry.parent.children : __document.children;
  siblings.splice(entry.index, 1);
  __touched.add(entry.node.id);
  if (entry.parent) __touched.add(entry.parent.id);
  return entry.node.id;
};

globalThis.Move = function Move(target, parent, position) {
  const entry = __requireOne(target);
  const source = entry.parent ? entry.parent.children : __document.children;
  source.splice(entry.index, 1);
  const destination = parent === null || parent === undefined
    ? __document.children
    : (__requireOne(parent).node.children ||= []);
  const index = position === undefined ? destination.length : Number(position);
  if (!Number.isInteger(index) || index < 0 || index > destination.length) throw new RangeError("Move position is outside the parent.");
  destination.splice(index, 0, entry.node);
  __touched.add(entry.node.id);
  if (entry.parent) __touched.add(entry.parent.id);
  if (parent !== null && parent !== undefined) __touched.add(__requireOne(parent).node.id);
  return entry.node.id;
};

function __renewIds(node, usedIds) {
  const base = node.id || "node";
  do node.id = base + "-copy-" + (++__copyCounter);
  while (usedIds.has(node.id));
  usedIds.add(node.id);
  for (const child of node.children || []) __renewIds(child, usedIds);
}

globalThis.Copy = function Copy(target, parent, position, properties = {}) {
  const copy = __clone(__requireOne(target).node);
  if (Object.hasOwn(properties, "id") || Object.hasOwn(properties, "children")) {
    throw new Error("Copy overrides cannot replace id or children.");
  }
  __renewIds(copy, new Set(__walk().map((entry) => entry.node.id)));
  Object.assign(copy, __clone(properties));
  Insert(parent, copy, position);
  return copy.id;
};

globalThis.Print = function Print(...values) {
  if (__prints.length >= 1000) throw new Error("Print is limited to 1,000 entries; return a narrower result.");
  __prints.push(values.length === 1 ? values[0] : values);
};

const __result = (0, eval)("(function () {\n" + __canvasCode + "\n})()");
JSON.stringify({ document: __document, prints: __prints, result: __result === undefined ? null : __result, touchedNodeIds: [...__touched] });
`;
