const GUIDELINES = Object.freeze({
  workflow: {
    title: "Safe editing workflow",
    text: `Start by listing documents and inspecting the target with documents.get. Use documents.mutate for a small, explicit batch. Use documents.execute when an edit needs traversal, repeated changes, or conditional logic.

An execute script runs in an isolated QuickJS environment against a private document clone. It has no network, file, Account, browser, timer, or Penkra runtime access. Canvas commits one Yjs update only after the script finishes, the result is structurally valid, and the backend confirms that the document is still at the sequence the script read. A CANVAS_DOCUMENT_CHANGED conflict means a collaborator edited the document first; fetch the latest document, reconsider the change against that state, and run a new script. Do not blindly replay a stale edit.

After any material edit, inspect the changed region again. Treat returned issues as actionable review findings, not proof that source data was discarded. Canvas preserves unknown .pen properties even when its renderer cannot represent them faithfully.`,
  },
  execute: {
    title: "Execute API",
    text: `Available globals are Get, Insert, Copy, Update, Replace, Delete, Move, and Print. The script body may return one JSON-serializable value; Canvas returns it as result. Print records JSON-serializable diagnostic values in order.

Selectors are exact and deterministic: #node-id selects an ID, type:frame selects a type, name:Header selects an exact name, * selects all nodes, and a slash-separated ID path selects one hierarchy path. An unprefixed string is also treated as an exact node ID. Get(selector) returns immutable context records with node, parent, index, path, bounds, and problems. The current execute context reports bounds as null and problems as an empty list; use documents.get for resolved inspection data.

Get(selector, visitor, { limit }) visits matching contexts in document order. The default and maximum limit is 1,000. Insert(parent, node, position) inserts under a parent selector; null means the document root. Update(target, properties) replaces the named properties and deletes a property whose value is undefined. Replace(target, node) replaces one node and preserves its ID when the replacement omits id. Delete(target) removes a subtree. Move(target, parent, position) reparents one subtree. Copy(target, parent, position, properties) deep-copies a subtree, assigns collision-free IDs for that script, applies root overrides, and returns the new root ID.

Scripts are limited to 100,000 UTF-8 bytes, a 64 MiB QuickJS heap, a 4 MiB stack, five seconds of CPU time, and bounded JSON input/output. Infinite loops are interrupted. Values containing cycles, functions, symbols, BigInt, or other non-JSON data cannot be returned or printed.`,
  },
  design: {
    title: "Design construction",
    text: `Use stable, descriptive IDs because references, selection, collaboration, and later edits depend on them. Prefer frames with an explicit layout, width, height, padding, gap, alignment, and clipping choice. Use horizontal or vertical auto layout for repeated rows, columns, controls, cards, and navigation. Use layout:none only when intentional free positioning is part of the design.

Keep component instances and reusable definitions intact when a property edit is sufficient. Reuse document variables for shared color, spacing, typography, and size values. Do not flatten unknown nodes or discard properties merely because Canvas does not render them yet.

Check hierarchy as well as appearance. A visually plausible node can still be incorrectly parented, clipped, ordered, or detached from its reusable source.`,
  },
  text: {
    title: "Text and fonts",
    text: `Every visible text node should have intentional content, a font family, size, weight, line height, alignment, and fill. Use a width and height mode that matches the design: hug content for labels, a fixed or filled width for wrapping copy, and explicit line height for stable vertical rhythm.

Canvas resolves the exact requested face through the host-mediated Google Fonts and Fontsource providers and caches downloaded bytes by family, style, and character coverage. It does not silently claim that an unavailable face is present. Font loading can change text metrics, so inspect wrapping, truncation, overlap, and clipping after changing typography.

Write interface text as finished product copy. Prefer specific verbs, concrete nouns, sentence case, and short explanations of consequence. Avoid filler, vague status language, internal implementation terms, and labels that force the reader to guess what will happen.`,
  },
  review: {
    title: "Validation and review",
    text: `Review the exact changed nodes, their parents, and the nearest clipping ancestor. Resolve missing text content, missing visible text fill, implicit frame layout, unresolved variables, missing components, unsupported icons, and renderer approximations before considering the design finished.

Use documents.open for visual review. Use selection.set and viewport.focus with an explicit tab ID to bring a node into view. A screenshot request intentionally fails when the App tab is hidden; focus the tab and capture again. Canvas never changes the operator's active tab merely to make a screenshot succeed.

One successful operation is not a complete review. Verify the returned sequence, inspect the saved structure, and visually exercise the important states and text at realistic widths.`,
  },
});

export function getCanvasGuidelines(topic) {
  if (topic === undefined) {
    return {
      topics: Object.entries(GUIDELINES).map(([key, value]) => ({ key, title: value.title })),
      guidance: "Call guidelines.get with one topic for the complete guidance.",
    };
  }
  const guideline = GUIDELINES[topic];
  if (!guideline) throw new Error(`Unknown Canvas guideline topic ${topic}.`);
  return { topic, ...guideline };
}
