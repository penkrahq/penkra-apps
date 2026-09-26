import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ensurePencilDocumentIconCatalogs,
  missingPencilIconCatalogs,
  pencilIconDefinition,
  searchCanvasIcons,
} from "./pencil-icon-provider.mjs";
import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";
import chunkRouting from "./icon-chunk-routing.mjs";
import { applyRemoteUpdate, createDocumentModel, encodeState, encodeUpdate, materialize, mutate, restoreDocumentModel } from "./document-model.mjs";
import { executeCanvasScript } from "./script-runtime.mjs";

const icon = (id, library, name) => ({ id, type: "icon", library, icon: name, width: 20, height: 20 });

test("the picker index is separate from drawing and a picked icon draws on its first frame", async () => {
  const picked = (await searchCanvasIcons("push-pin", { library: "phosphor", limit: 1 })).items[0];
  assert.deepEqual(picked, { library: "phosphor", icon: "push-pin" });
  const document = { children: [icon("picked", picked.library, picked.icon)] };
  await ensurePencilDocumentIconCatalogs(document);
  const prepared = prepareOpenPencilRenderDocument(document);
  assert.deepEqual(prepared.issues, []);
  assert.ok(prepared.document.children[0].__canvasIcon.geometry);
});

test("a collaborator's synced icon is fetched alone before the new frame, preserving its authored box", async () => {
  const before = { children: [icon("known", "lucide", "home")] };
  const remote = createDocumentModel(before);
  const local = restoreDocumentModel({ snapshot: { state: encodeState(remote), throughSequence: 0 }, updates: [] });
  try {
    let update;
    remote.doc.on("update", (bytes) => { update = encodeUpdate(bytes); });
    mutate(remote, { kind: "insert-node", parentId: null, position: 1,
      node: icon("remote", "feather", "activity") });
    assert.ok(applyRemoteUpdate(local, update));
    const after = materialize(local);
    assert.deepEqual(missingPencilIconCatalogs(after), ["feather/act"]);
    await ensurePencilDocumentIconCatalogs(after);
    const prepared = prepareOpenPencilRenderDocument(after);
    assert.deepEqual(prepared.issues, []);
    assert.deepEqual([prepared.document.children[1].width, prepared.document.children[1].height], [20, 20]);
    assert.ok(prepared.document.children[1].__canvasIcon.geometry);
  } finally {
    remote.doc.destroy();
    local.doc.destroy();
  }
});

test("script or agent insertions and effective ref overrides preload just their icons", async () => {
  const source = { children: [
    { id: "source", type: "frame", children: [icon("source-mark", "lucide", "home")] },
    { id: "instance", type: "ref", ref: "source", descendants: {
      "source/source-mark": { library: "phosphor", icon: "anchor" },
    } },
  ] };
  const { document } = await executeCanvasScript(source,
    'Insert(null, { id: "agent-added", type: "icon", library: "Material Symbols Rounded", icon: "search", width: 20, height: 20 });');
  await ensurePencilDocumentIconCatalogs(document);
  const prepared = prepareOpenPencilRenderDocument(document);
  assert.deepEqual(prepared.issues, []);
  assert.ok(prepared.document.children[1].descendants["source/source-mark"].__canvasIcon);
  assert.ok(prepared.document.children[2].__canvasIcon);
});

test("many-icon documents are complete before the first compiled frame", async () => {
  const search = await searchCanvasIcons("a", { library: "phosphor", limit: 100 });
  const document = { children: search.items.map(({ library, icon: name }, index) => icon(`many-${index}`, library, name)) };
  await ensurePencilDocumentIconCatalogs(document);
  const prepared = prepareOpenPencilRenderDocument(document);
  assert.deepEqual(prepared.issues, []);
  assert.equal(prepared.document.children.filter((node) => node.__canvasIcon).length, document.children.length);
});

test("unknown names still produce an unsupported-icon issue, never a replacement", async () => {
  const document = { children: [icon("unknown", "phosphor", "absolutely-not-an-icon")] };
  await ensurePencilDocumentIconCatalogs(document);
  assert.equal(pencilIconDefinition("phosphor", "absolutely-not-an-icon"), null);
  const prepared = prepareOpenPencilRenderDocument(document);
  assert.equal(prepared.issues.length, 1);
  assert.match(prepared.issues[0].message, /not supported/u);
});

test("offline icon preparation reads packaged local assets without any HTTP fetch", async () => {
  const isolated = await import("./pencil-icon-provider.mjs?offline-test");
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error("Network is offline"); };
  try {
    await isolated.ensurePencilIconDefinitions([{ library: "feather", icon: "anchor" }]);
    assert.ok(isolated.pencilIconDefinition("feather", "anchor")?.geometry);
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("all source catalog names and aliases have local packaged prefix files", async () => {
  for (const [family, packageName] of Object.entries({
    material: "material-symbols", phosphor: "ph", feather: "feather",
  })) {
    const catalog = JSON.parse(await readFile(new URL(`../node_modules/@iconify-json/${packageName}/icons.json`, import.meta.url)));
    const names = [...Object.keys(catalog.icons ?? {}), ...Object.keys(catalog.aliases ?? {})];
    const byPrefix = new Map();
    for (const name of names) {
      const base = name.slice(0, 3).padEnd(3, "_");
      const length = chunkRouting[family]?.[base] ?? 3;
      const prefix = name.slice(0, length).padEnd(length, "_");
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix).push(name);
    }
    for (const [prefix, bucketNames] of byPrefix) {
      const chunk = JSON.parse(await readFile(new URL(`./icon-chunks/${family}/${prefix}.json`, import.meta.url)));
      for (const name of bucketNames) assert.ok(Object.hasOwn(chunk, name), `${family}:${name}`);
    }
  }
});
