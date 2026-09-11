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

export function scriptNeedsInspection(code) {
  return typeof code === "string" && /\b(?:bounds|problems|overflow)\b/u.test(code);
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
  const timedOut = message.includes("interrupted");
  const error = new Error(
    timedOut
      ? `Canvas script exceeded its ${EXECUTION_TIMEOUT_MS}ms execution deadline.`
      : `Canvas script failed: ${message}`,
  );
  error.code = timedOut ? "CANVAS_SCRIPT_TIMEOUT" : "CANVAS_SCRIPT_FAILED";
  return error;
}

const SANDBOX_SOURCE = String.raw`
"use strict";
const __document = JSON.parse(__canvasDocumentJson);
const __inspection = JSON.parse(__canvasInspectionJson);
const __prints = [];
const __touched = new Set();
const __generations = [];
const __screenshots = [];
let __changed = false;
let __copyCounter = 0;
const __containerTypes = new Set(["frame", "group"]);
const __clone = (value) => JSON.parse(JSON.stringify(value));
const __readonly = (value) => {
  if (!value || typeof value !== "object") return value;
  for (const child of Object.values(value)) __readonly(child);
  return Object.freeze(value);
};

const __idIndex = new Map();
function __indexTree(node, parent, parentSlot = null) {
  __idIndex.set(node.id, { node, parent, parentSlot });
  for (const child of node.children || []) __indexTree(child, node, null);
  for (const [slot, children] of Object.entries(node.slots || {})) {
    for (const child of children) __indexTree(child, node, slot);
  }
}
function __unindexTree(node) {
  __idIndex.delete(node.id);
  for (const child of node.children || []) __unindexTree(child);
  for (const children of Object.values(node.slots || {})) for (const child of children) __unindexTree(child);
}
for (const node of __document.children || []) __indexTree(node, null);

function __validationIds(excludedIds = new Set()) {
  const pendingIds = new Set();
  return {
    has(id) {
      return pendingIds.has(id) || (!excludedIds.has(id) && __idIndex.has(id));
    },
    add(id) {
      pendingIds.add(id);
    },
  };
}

function __walk(nodes = __document.children, parent = null, parentPath = [], output = [], parentSlot = null) {
  for (let index = 0; index < (nodes || []).length; index += 1) {
    const node = nodes[index];
    const path = [...parentPath, node.id];
    output.push({ node, parent, parentSlot, index, path });
    __walk(node.children || [], node, path, output);
    for (const [slot, children] of Object.entries(node.slots || {})) {
      __walk(children, node, [...path, "$slots", slot], output, slot);
    }
  }
  return output;
}

function* __walkEntries(nodes = __document.children, parent = null, parentPath = [], parentSlot = null) {
  for (let index = 0; index < (nodes || []).length; index += 1) {
    const node = nodes[index];
    const path = [...parentPath, node.id];
    const entry = { node, parent, parentSlot, index, path };
    yield entry;
    yield* __walkEntries(node.children || [], node, path);
    for (const [slot, children] of Object.entries(node.slots || {})) {
      yield* __walkEntries(children, node, [...path, "$slots", slot], slot);
    }
  }
}

function __assertSelector(selector) {
  if (selector === "*" || selector === undefined || selector === null) return;
  if (typeof selector === "object") return;
  if (typeof selector !== "string") {
    throw new TypeError("A Canvas selector must be a string, node, or context.");
  }
  if (selector.startsWith("#") || selector.startsWith("type:") || selector.startsWith("name:") || selector.includes("/")) return;
  if (selector.includes(":")) {
    throw new Error("Unknown Canvas selector " + JSON.stringify(selector) + ". Expected #id, type:<type>, name:<name>, a slash-separated path, or an exact node id.");
  }
}

function __matches(entry, selector) {
  __assertSelector(selector);
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
  const output = [];
  for (const entry of __walkEntries()) {
    if (__matches(entry, selector)) output.push(entry);
  }
  return output;
}

function __exactId(target) {
  let exactId;
  if (typeof target === "object" && target !== null) {
    const selected = target.node && typeof target.node === "object" ? target.node : target;
    if (typeof selected.id === "string") exactId = selected.id;
  } else if (typeof target === "string" && target.startsWith("#")) {
    exactId = target.slice(1);
  } else if (typeof target === "string" && target !== "*" && !target.includes(":") && !target.includes("/")) {
    exactId = target;
  }
  return exactId;
}

function __indexedEntry(id) {
  const indexed = __idIndex.get(id);
  if (!indexed) return null;
  const path = [indexed.node.id];
  let cursor = indexed;
  for (let ancestor = indexed.parent; ancestor; ancestor = cursor.parent) {
    if (typeof cursor.parentSlot === "string") path.unshift(ancestor.id, "$slots", cursor.parentSlot);
    else path.unshift(ancestor.id);
    cursor = __idIndex.get(ancestor.id) || { parent: null, parentSlot: null };
  }
  const siblings = indexed.parent
    ? (typeof indexed.parentSlot === "string" ? indexed.parent.slots[indexed.parentSlot] : indexed.parent.children)
    : __document.children;
  return {
    node: indexed.node,
    parent: indexed.parent,
    parentSlot: indexed.parentSlot,
    index: siblings.indexOf(indexed.node),
    path,
  };
}

function __requireOne(target) {
  const exactId = __exactId(target);
  if (exactId !== undefined) {
    const entry = __indexedEntry(exactId);
    if (!entry) throw new Error("Expected one Canvas node, found 0.");
    return entry;
  }
  const entries = __entries(target);
  if (entries.length !== 1) {
    throw new Error("Expected one Canvas node, found " + entries.length + ".");
  }
  return entries[0];
}

function __nodeAtDepth(node, depth) {
  const clone = __clone(node);
  if (depth === "all") return clone;
  const trim = (current, remaining) => {
    if (remaining === 0) {
      delete current.children;
      delete current.slots;
      return;
    }
    for (const child of current.children || []) trim(child, remaining - 1);
    for (const children of Object.values(current.slots || {})) for (const child of children) trim(child, remaining - 1);
  };
  trim(clone, depth);
  return clone;
}

function __context(entry, depth = "all") {
  const inspected = __inspection[entry.node.id] || {};
  return Object.freeze({
    node: __readonly(__nodeAtDepth(entry.node, depth)),
    parent: entry.parent ? __readonly(__nodeAtDepth(entry.parent, 0)) : null,
    parentSlot: entry.parentSlot ?? null,
    childCount: (entry.node.children || []).length + Object.values(entry.node.slots || {}).reduce((count, children) => count + children.length, 0),
    index: entry.index,
    path: entry.path.join("/"),
    bounds: inspected.bounds === undefined ? null : __readonly(__clone(inspected.bounds)),
    problems: __readonly(__clone(inspected.problems || [])),
    overflow: inspected.overflow === undefined ? null : __readonly(__clone(inspected.overflow)),
  });
}

function __touchTree(node) {
  __touched.add(node.id);
  for (const child of node.children || []) __touchTree(child);
  for (const children of Object.values(node.slots || {})) for (const child of children) __touchTree(child);
}

function __assertContainer(node) {
  if (!__containerTypes.has(node.type)) {
    throw new Error("Canvas node " + node.id + " of type " + node.type + " cannot contain children; use a frame or group.");
  }
}

function __assertNodeTree(node, usedIds) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    throw new TypeError("A Canvas node must be an object.");
  }
  if (typeof node.id !== "string" || node.id.length === 0) {
    throw new Error("Every inserted or replaced Canvas node requires a non-empty id.");
  }
  if (typeof node.type !== "string" || node.type.length === 0) {
    throw new Error("Canvas node " + node.id + " requires a non-empty type.");
  }
  if (usedIds.has(node.id)) throw new Error("Node " + node.id + " already exists.");
  usedIds.add(node.id);
  if (node.children !== undefined && !Array.isArray(node.children)) {
    throw new TypeError("Canvas node " + node.id + " children must be an array.");
  }
  if (node.children !== undefined) __assertContainer(node);
  for (const child of node.children || []) __assertNodeTree(child, usedIds);
  if (node.slots !== undefined) {
    if (node.type !== "ref" || !node.slots || typeof node.slots !== "object" || Array.isArray(node.slots)) throw new TypeError("Canvas node " + node.id + " slots must be an object on a ref.");
    for (const [slot, children] of Object.entries(node.slots)) {
      if (!slot || !Array.isArray(children)) throw new TypeError("Canvas node " + node.id + " slot " + slot + " must be an array.");
      for (const child of children) __assertNodeTree(child, usedIds);
    }
  }
}

function __assertParent(parent) {
  const entry = __requireOne(parent);
  __assertContainer(entry.node);
  return entry;
}

function __slotParent(instance, name) {
  const entry = __requireOne(instance);
  if (entry.node.type !== "ref") throw new Error("Slot requires a component ref instance.");
  if (typeof name !== "string" || !name) throw new Error("Slot requires a non-empty slot name.");
  return { __canvasSlot: true, entry, name };
}

function __destination(parent) {
  if (parent && parent.__canvasSlot === true) {
    const slots = (parent.entry.node.slots ||= {});
    return { entry: parent.entry, parentSlot: parent.name, children: (slots[parent.name] ||= []) };
  }
  const entry = parent === null || parent === undefined ? null : __assertParent(parent);
  return { entry, parentSlot: null, children: entry === null ? __document.children : (entry.node.children ||= []) };
}

function __siblings(entry) {
  if (!entry.parent) return __document.children;
  return typeof entry.parentSlot === "string" ? entry.parent.slots[entry.parentSlot] : entry.parent.children;
}

globalThis.Slot = function Slot(instance, name) {
  return Object.freeze(__slotParent(instance, name));
};

globalThis.Get = function Get(selector = "*", visitor, options = {}) {
  __assertSelector(selector);
  const exactId = __exactId(selector);
  if (visitor !== undefined && visitor !== null) {
    if (typeof visitor !== "function") throw new TypeError("Get visitor must be a function.");
    const limit = options.limit === undefined ? Infinity : Number(options.limit);
    if (!(limit === Infinity || (Number.isInteger(limit) && limit >= 1))) {
      throw new RangeError("Get visitor limit must be a positive integer when supplied.");
    }
    if (exactId !== undefined) {
      const entry = __indexedEntry(exactId);
      if (!entry) return 0;
      visitor(__context(entry));
      return 1;
    }
    let count = 0;
    for (const entry of __walkEntries()) {
      if (!__matches(entry, selector)) continue;
      if (count >= limit) break;
      visitor(__context(entry));
      count += 1;
    }
    return count;
  }
  const depth = options.depth === undefined ? 0 : options.depth;
  if (!(depth === "all" || (Number.isInteger(depth) && depth >= 0 && depth <= 100))) {
    throw new RangeError("Get depth must be an integer from 0 through 100, or all.");
  }
  const limit = options.limit === undefined ? 1000 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new RangeError("Get limit must be an integer from 1 through 1000.");
  }
  if (exactId !== undefined) {
    const entry = __indexedEntry(exactId);
    return entry ? [__context(entry, depth)] : [];
  }
  const contexts = [];
  for (const entry of __walkEntries()) {
    if (!__matches(entry, selector)) continue;
    if (contexts.length === limit) {
      throw new Error("Get matched more than " + limit + " nodes; use visitor form for traversal or narrow the selector.");
    }
    contexts.push(__context(entry, depth));
  }
  return contexts;
};

globalThis.Insert = function Insert(parent, node, position) {
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new TypeError("Insert requires one node object.");
  const inserted = __clone(node);
  __assertNodeTree(inserted, __validationIds());
  const destination = __destination(parent);
  const parentEntry = destination.entry;
  const children = destination.children;
  const index = position === undefined ? children.length : Number(position);
  if (!Number.isInteger(index) || index < 0 || index > children.length) throw new RangeError("Insert position is outside the parent.");
  children.splice(index, 0, inserted);
  __indexTree(inserted, parentEntry?.node ?? null, destination.parentSlot);
  __changed = true;
  __touchTree(inserted);
  if (parentEntry) __touched.add(parentEntry.node.id);
  return inserted.id;
};

globalThis.SetSlot = function SetSlot(instance, name, nodes) {
  const parent = __slotParent(instance, name);
  if (!Array.isArray(nodes)) throw new TypeError("SetSlot requires an array of Canvas nodes.");
  const previous = parent.entry.node.slots?.[name] || [];
  const excluded = new Set();
  for (const node of previous) {
    const collect = (current) => {
      excluded.add(current.id);
      for (const child of current.children || []) collect(child);
      for (const children of Object.values(current.slots || {})) for (const child of children) collect(child);
    };
    collect(node);
  }
  const next = __clone(nodes);
  const used = __validationIds(excluded);
  for (const node of next) __assertNodeTree(node, used);
  for (const node of previous) __unindexTree(node);
  (parent.entry.node.slots ||= {})[name] = next;
  for (const node of next) __indexTree(node, parent.entry.node, name);
  __changed = JSON.stringify(previous) !== JSON.stringify(next) || __changed;
  __touched.add(parent.entry.node.id);
  for (const node of next) __touchTree(node);
  return next.map((node) => node.id);
};

globalThis.ResetSlot = function ResetSlot(instance, name) {
  const parent = __slotParent(instance, name);
  if (!Object.hasOwn(parent.entry.node.slots ?? {}, name)) return [];
  const previous = parent.entry.node.slots[name];
  for (const node of previous) __unindexTree(node);
  delete parent.entry.node.slots[name];
  if (Object.keys(parent.entry.node.slots).length === 0) delete parent.entry.node.slots;
  __changed = true;
  __touched.add(parent.entry.node.id);
  for (const node of previous) __touchTree(node);
  return previous.map((node) => node.id);
};

globalThis.Update = function Update(target, properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new TypeError("Update requires a property object.");
  const node = __requireOne(target).node;
  const previousSubtreeIds = new Set();
  const collectPreviousIds = (current) => {
    previousSubtreeIds.add(current.id);
    for (const child of current.children || []) collectPreviousIds(child);
    for (const children of Object.values(current.slots || {})) {
      for (const child of children) collectPreviousIds(child);
    }
  };
  collectPreviousIds(node);
  if (Object.hasOwn(properties, "id") && properties.id !== node.id) throw new Error("Update cannot change a node id.");
  if (Object.hasOwn(properties, "children") || Object.hasOwn(properties, "slots") || Object.hasOwn(properties, "type")) {
    const next = __clone(node);
    for (const [key, value] of Object.entries(properties)) {
      if (key === "id") continue;
      if (value === undefined) delete next[key];
      else next[key] = __clone(value);
    }
    __assertNodeTree(
      next,
      __validationIds(previousSubtreeIds),
    );
  }
  const structural = Object.hasOwn(properties, "children") || Object.hasOwn(properties, "slots") || Object.hasOwn(properties, "type");
  const indexedParent = structural ? __idIndex.get(node.id)?.parent ?? null : null;
  const indexedParentSlot = structural ? __idIndex.get(node.id)?.parentSlot ?? null : null;
  if (structural) __unindexTree(node);
  for (const [key, value] of Object.entries(properties)) {
    if (key === "id") continue;
    if (value === undefined) {
      if (Object.hasOwn(node, key)) {
        delete node[key];
        __changed = true;
      }
    } else if (JSON.stringify(node[key]) !== JSON.stringify(value)) {
      node[key] = __clone(value);
      __changed = true;
    }
  }
  if (structural) __indexTree(node, indexedParent, indexedParentSlot);
  __touched.add(node.id);
  return node;
};

globalThis.SetModule = function SetModule(module) {
  const allowed = new Set(["deck", "web", "mobile"]);
  if (!allowed.has(module)) throw new Error("SetModule requires deck, web, or mobile.");
  if (__document.module !== "generic") throw new Error("Only a generic Canvas document can set its module later.");
  if (__walk().some((entry) => entry.node.role !== undefined)) throw new Error("SetModule requires a document with no role-bearing frames.");
  __document.module = module;
  __changed = true;
  return module;
};

globalThis.Replace = function Replace(target, replacement) {
  const entry = __requireOne(target);
  if (!replacement || typeof replacement !== "object" || Array.isArray(replacement)) throw new TypeError("Replace requires one node object.");
  const next = __clone(replacement);
  next.id ??= entry.node.id;
  const replacedIds = new Set();
  const collectReplacedIds = (node) => {
    replacedIds.add(node.id);
    for (const child of node.children || []) collectReplacedIds(child);
    for (const children of Object.values(node.slots || {})) {
      for (const child of children) collectReplacedIds(child);
    }
  };
  collectReplacedIds(entry.node);
  __assertNodeTree(
    next,
    __validationIds(replacedIds),
  );
  const siblings = __siblings(entry);
  if (JSON.stringify(entry.node) !== JSON.stringify(next)) {
    __unindexTree(entry.node);
    siblings.splice(entry.index, 1, next);
    __indexTree(next, entry.parent, entry.parentSlot);
    __changed = true;
  }
  __touchTree(next);
  if (entry.parent) __touched.add(entry.parent.id);
  return next.id;
};

globalThis.Delete = function Delete(target) {
  const entry = __requireOne(target);
  const siblings = __siblings(entry);
  siblings.splice(entry.index, 1);
  __unindexTree(entry.node);
  __changed = true;
  __touched.add(entry.node.id);
  if (entry.parent) __touched.add(entry.parent.id);
  return entry.node.id;
};

globalThis.Move = function Move(target, parent, position) {
  const entry = __requireOne(target);
  const destination = __destination(parent);
  const destinationEntry = destination.entry;
  for (let ancestor = destinationEntry?.node ?? null; ancestor; ancestor = __idIndex.get(ancestor.id)?.parent ?? null) {
    if (ancestor === entry.node) throw new Error("Move cannot place a node inside its own subtree.");
  }
  const source = __siblings(entry);
  source.splice(entry.index, 1);
  const destinationChildren = destination.children;
  const index = position === undefined ? destinationChildren.length : Number(position);
  if (!Number.isInteger(index) || index < 0 || index > destinationChildren.length) throw new RangeError("Move position is outside the parent.");
  destinationChildren.splice(index, 0, entry.node);
  __idIndex.get(entry.node.id).parent = destinationEntry?.node ?? null;
  __idIndex.get(entry.node.id).parentSlot = destination.parentSlot;
  __changed = true;
  __touched.add(entry.node.id);
  if (entry.parent) __touched.add(entry.parent.id);
  if (destinationEntry) __touched.add(destinationEntry.node.id);
  return entry.node.id;
};

function __renewIds(node, usedIds) {
  const base = node.id || "node";
  do node.id = base + "-copy-" + (++__copyCounter);
  while (usedIds.has(node.id));
  usedIds.add(node.id);
  for (const child of node.children || []) __renewIds(child, usedIds);
  for (const children of Object.values(node.slots || {})) {
    for (const child of children) __renewIds(child, usedIds);
  }
}

globalThis.Copy = function Copy(target, parent, position, properties = {}) {
  const copy = __clone(__requireOne(target).node);
  if (Object.hasOwn(properties, "id") || Object.hasOwn(properties, "children") || Object.hasOwn(properties, "slots")) {
    throw new Error("Copy overrides cannot replace id, children, or slots.");
  }
  __renewIds(copy, __validationIds());
  Object.assign(copy, __clone(properties));
  Insert(parent, copy, position);
  return copy.id;
};

globalThis.Print = function Print(...values) {
  if (__prints.length >= 1000) throw new Error("Print is limited to 1,000 entries; return a narrower result.");
  __prints.push(values.length === 1 ? values[0] : values);
};

globalThis.TakeScreenshot = function TakeScreenshot(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new TypeError("TakeScreenshot requires a non-empty array of exact node targets.");
  }
  const nodeIds = targets.map((target) => __requireOne(target).node.id);
  if (new Set(nodeIds).size !== nodeIds.length) {
    throw new Error("TakeScreenshot targets must be unique.");
  }
  if (__screenshots.length > 0) {
    throw new Error("TakeScreenshot may be called once per execution; pass every node to one array.");
  }
  __screenshots.push({ nodeIds });
  return nodeIds;
};

globalThis.G = function G(target, source, prompt) {
  const entry = __requireOne(target);
  if (typeof source !== "string" || source.length === 0) {
    throw new TypeError("G source must be an image URL, absolute file path, or 'ai'.");
  }
  let url = source;
  if (source === "ai") {
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new TypeError("G " + source + " generation requires a non-empty prompt.");
    }
    if (__generations.length >= 20) throw new Error("G is limited to 20 generated images per execution.");
    url = "penkra-generation://" + __generations.length;
    __generations.push({ nodeId: entry.node.id, kind: source, prompt: prompt.trim(), url });
  } else if (prompt !== undefined) {
    throw new TypeError("G accepts a prompt only for the 'ai' source.");
  }
  entry.node.fill = { type: "image", url, mode: "fill" };
  __changed = true;
  __touched.add(entry.node.id);
  return entry.node.id;
};

const __result = (0, eval)("(function () {\n" + __canvasCode + "\n})()");
JSON.stringify({ document: __document, changed: __changed, prints: __prints, result: __result === undefined ? null : __result, touchedNodeIds: [...__touched], generations: __generations, screenshots: __screenshots });
`;
